// Owner status / progress layer (presentation only). One editable Telegram
// status message per running step, its final state (ACTION REQUIRED / FAILED /
// COMPLETE), and ONE reminder per owner-waiting state.
//
// It never decides anything about the pipeline: it does not change product
// state, locks, approvals or retries, never calls OpenAI or Etsy, and never
// writes product.json. Its own bookkeeping (status message ids, reminders
// sent) lives in <stateDir>/owner-status.json; persisted product state stays
// authoritative. Every method swallows its own errors and every Telegram call
// is time-bounded, so a status problem can never fail or stall a step.
//
// Throttling: an edit is made when the progress CONTENT changes (stage change,
// item finished), at most once per minEditMs; the elapsed time alone is
// refreshed by tick() at most once per refreshMs. Quick steps get a message
// only if still running after lazyMs.
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { progressOf, progressLines, runningText, actionText, failedText, completeText, reminderText, ownerWait } from '../telegram/status.mjs';
import { menuData } from '../telegram/ui.mjs';

export const OWNER_STATUS_FILE='owner-status.json';
// Steps that are normally fast and make no model call: a status message only if one runs longer than lazyMs.
const QUICK_STEPS=new Set(['restyle','etsy-section','etsy-refresh']);
const empty=()=>({version:1,running:{},reminders:{},initialised_at:null});

export class OwnerStatus{
  constructor({telegram,stateDir,now=()=>new Date(),log=()=>{},minEditMs=3000,refreshMs=45_000,lazyMs=5000,
    reminderMs=10*60_000,maxReminderAgeMs=24*60*60_000,reminderScanMs=60_000,callTimeoutMs=10_000}={}){
    Object.assign(this,{telegram,now,log,minEditMs,refreshMs,lazyMs,reminderMs,maxReminderAgeMs,reminderScanMs,callTimeoutMs});
    this.path=join(stateDir,OWNER_STATUS_FILE);
    this.state=null;           // loaded lazily
    this.fresh=false;          // no state file existed: waits already overdue are not reminded on the first scan
    this.latest=new Map();     // product id -> latest product seen (memory only)
    this.depth=0;              // > 0 while one Telegram update is being handled (chained steps share one message)
    this.queue=Promise.resolve();
    this.lastScan=null;
  }

  // ---------- plumbing ----------
  #serial(fn){
    const run=this.queue.then(async()=>{try{return await fn();}catch(err){this.log(`owner status: ${err?.message??err}`);return null;}});
    this.queue=run.then(()=>{},()=>{});
    return run;
  }
  async #load(){
    if(this.state)return this.state;
    const raw=await readFile(this.path,'utf8').catch(()=>null);
    let s=null;try{s=raw?JSON.parse(raw):null;}catch{this.log(`owner status: ${this.path} unreadable; starting empty.`);}
    this.fresh=!s;
    this.state={...empty(),...(s??{}),initialised_at:s?.initialised_at??this.now().toISOString()};
    return this.state;
  }
  async #save(){
    await mkdir(dirname(this.path),{recursive:true});
    const tmp=`${this.path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    await writeFile(tmp,JSON.stringify(this.state,null,2)+'\n');
    try{await rename(tmp,this.path);}catch(e){await rm(tmp,{force:true});throw e;}
  }
  /** A Telegram call that can neither throw nor hang the caller. */
  async #call(what,fn){
    let timer;
    try{
      return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${what} timed out`)),this.callTimeoutMs);timer.unref?.();})]);
    }catch(err){
      if(!/message is not modified/i.test(err?.message??''))this.log(`owner status: ${what} failed: ${err?.message??err}`);
      return err;
    }finally{clearTimeout(timer);}
  }
  #ms(iso){return iso?this.now()-new Date(iso):null;}
  async #send(rec,text){
    const r=await this.#call('send',()=>this.telegram.sendMessage({chatId:String(rec.chat_id),text}));
    if(r instanceof Error||!r?.messageId)return false;
    Object.assign(rec,{message_id:r.messageId,text,last_edit_at:this.now().toISOString(),dirty:false});
    return true;
  }
  async #edit(rec,text){
    if(text===rec.text){rec.dirty=false;return true;}
    if(!this.telegram.editMessageText)return false;
    const r=await this.#call('edit',()=>this.telegram.editMessageText(String(rec.chat_id),rec.message_id,text));
    if(r instanceof Error&&!/message is not modified/i.test(r.message)){
      // The message is gone (deleted by the owner, too old): one fresh message, never a stream of them.
      if((rec.resends??0)<1){rec.resends=(rec.resends??0)+1;return this.#send(rec,text);}
      return false;
    }
    Object.assign(rec,{text,last_edit_at:this.now().toISOString(),dirty:false});
    return true;
  }
  #content(rec,p){return progressLines(progressOf(p,rec.step,rec.note)).join('\n');}
  #running(rec,p){return runningText(p.product_id,progressOf(p,rec.step,rec.note),this.#ms(rec.started_at));}

  // ---------- one Telegram update (chained steps share one message) ----------
  hold(){this.depth++;}
  release(){
    this.depth=Math.max(0,this.depth-1);
    if(this.depth)return Promise.resolve();
    return this.#serial(async()=>{
      const s=await this.#load();
      for(const [id,rec] of Object.entries(s.running))if(rec.final_pending)await this.#finalize(id,rec,this.latest.get(id));
      await this.#save();
    });
  }

  // ---------- step lifecycle (called by Workflow.#guarded) ----------
  /** A step acquired its lock. Long steps show RUNNING at once; quick ones only if still running after lazyMs. */
  start(p,step){
    return this.#serial(async()=>{
      const s=await this.#load(), id=p.product_id, prev=s.running[id];
      this.latest.set(id,p);
      // A step chained in the same update (ideation -> previews, feedback -> proofs) keeps the message and the clock.
      const rec=prev?.final_pending?{...prev,step,note:null,final_pending:false,content:null}
        :{chat_id:p.request.chat_id,step,started_at:this.now().toISOString(),message_id:null,text:null,content:null,last_edit_at:null,note:null,dirty:false,final_pending:false};
      s.running[id]=rec;
      rec.content=this.#content(rec,p);
      if(rec.message_id)await this.#edit(rec,this.#running(rec,p));
      else if(!QUICK_STEPS.has(step))await this.#send(rec,this.#running(rec,p));
      await this.#save();
    });
  }
  /** The product was committed (a stage changed or an item finished). Edits only when the progress content changed. */
  update(p){
    return this.#serial(async()=>{
      const s=await this.#load(), rec=s.running[p.product_id];
      if(!rec||rec.final_pending)return;
      this.latest.set(p.product_id,p);
      await this.#refresh(rec,p,false);
      await this.#save();
    });
  }
  /** Progress the workflow holds outside product.json (marketing images, files written). */
  note(productId,note){
    return this.#serial(async()=>{
      const s=await this.#load(), rec=s.running[productId], p=this.latest.get(productId);
      if(!rec||rec.final_pending||!p)return;
      rec.note={...note,status:p.status};
      await this.#refresh(rec,p,false);
      await this.#save();
    });
  }
  async #refresh(rec,p,timed){
    const content=this.#content(rec,p);
    if(content!==rec.content){rec.content=content;rec.dirty=true;}
    if(!rec.message_id){
      if(QUICK_STEPS.has(rec.step)&&this.#ms(rec.started_at)<this.lazyMs)return;
      await this.#send(rec,this.#running(rec,p));return;
    }
    const since=this.#ms(rec.last_edit_at)??Infinity;
    if((rec.dirty&&since>=this.minEditMs)||(timed&&since>=this.refreshMs))await this.#edit(rec,this.#running(rec,p));
  }
  /** The step ended (released its lock, successfully or not). Final text follows the persisted product state. */
  finish(p){
    return this.#serial(async()=>{
      const s=await this.#load(), rec=s.running[p.product_id];
      if(!rec)return;
      this.latest.set(p.product_id,p);
      rec.ended_at=this.now().toISOString();
      if(this.depth>0){rec.final_pending=true;await this.#save();return;}
      await this.#finalize(p.product_id,rec,p);
      await this.#save();
    });
  }
  async #finalize(id,rec,p){
    delete this.state.running[id];
    if(!rec.message_id||!p)return;
    const took=rec.ended_at?new Date(rec.ended_at)-new Date(rec.started_at):this.#ms(rec.started_at);
    const wait=ownerWait({...p,lock:null});
    const text=p.status==='FAILED'?failedText(p.product_id,p.last_error??{step:rec.step},took)
      :wait?actionText(p.product_id,wait,took):completeText(p.product_id,rec.step,took);
    await this.#edit(rec,text);
  }

  // ---------- periodic (bot.mjs timer): elapsed refresh, quick-step messages, reminders ----------
  /**
   * listProducts: () => persisted products (read only). Never starts, retries
   * or changes work. A step that is running stays RUNNING however long its
   * awaited call takes: there is no stall detection here.
   */
  tick({listProducts}={}){
    return this.#serial(async()=>{
      const s=await this.#load();
      for(const [id,rec] of Object.entries(s.running)){
        const p=this.latest.get(id);
        if(rec.final_pending||!p)continue;
        await this.#refresh(rec,p,true);
      }
      if(listProducts&&(this.lastScan===null||this.now()-this.lastScan>=this.reminderScanMs)){
        this.lastScan=this.now();
        await this.#reminders(s,await listProducts());
        this.fresh=false;
      }
      await this.#save();
    });
  }
  /**
   * One reminder per waiting state: a product waiting on the owner for
   * reminderMs gets exactly one message; the record keeps the state's key, so
   * neither later ticks nor a restart repeat it. When the owner responds the
   * product changes state, the old record is cleared, and a later waiting
   * state may have its own single reminder.
   */
  async #reminders(s,products){
    const seen=new Set();
    for(const p of products){
      const id=p.product_id;seen.add(id);
      const w=s.running[id]?null:ownerWait(p);
      if(!w){delete s.reminders[id];continue;}
      if(s.reminders[id]?.key===w.key)continue;
      const age=this.now()-new Date(w.since);
      if(age<this.reminderMs){delete s.reminders[id];continue;}
      // Already overdue when this layer first ran, or long forgotten: recorded, never sent.
      if(this.fresh||age>this.maxReminderAgeMs){s.reminders[id]={key:w.key,state:this.fresh?'existing':'expired',at:this.now().toISOString()};continue;}
      const r=await this.#call('reminder',()=>this.telegram.sendMessage({chatId:String(p.request.chat_id),text:reminderText(p,w),
        replyMarkup:{inline_keyboard:[[{text:'📦 Open Product',callback_data:menuData('prod',id)}]]}}));
      // Recorded even if Telegram failed, so a broken chat is never retried every minute.
      s.reminders[id]={key:w.key,state:r instanceof Error?'failed':'sent',at:this.now().toISOString()};
    }
    for(const id of Object.keys(s.reminders))if(!seen.has(id))delete s.reminders[id];
  }

  // ---------- after a restart ----------
  /**
   * Called after Workflow.recover() parked interrupted products in FAILED: each
   * status message left RUNNING by the previous process is closed from the
   * persisted product state. Nothing is restarted.
   */
  recover({loadProduct}){
    return this.#serial(async()=>{
      const s=await this.#load();
      for(const [id,rec] of Object.entries(s.running)){
        const p=await loadProduct(id).catch(()=>null);
        if(p)rec.ended_at??=p.last_error?.at??null;
        await this.#finalize(id,rec,p);
      }
      await this.#save();
    });
  }
  /** Settles queued work (tests and shutdown). */
  idle(){return this.#serial(async()=>{});}
}
