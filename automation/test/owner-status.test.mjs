// Owner status / progress layer: formatting, transitions, the one reminder per
// waiting state, restart behaviour, and proof that it changes no pipeline
// semantics. Offline: fake OpenAI, fake Telegram, no Etsy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatElapsed, progressBar, progressOf, runningText, actionText, failedText, ownerWait, actionHeader, PAUSED } from '../src/telegram/status.mjs';
import { OwnerStatus, OWNER_STATUS_FILE } from '../src/orchestrator/owner-status.mjs';
import { harness, msg, photo, press, button, apiFailure, PNG, CHAT } from './helpers.mjs';

const T0=Date.parse('2026-10-06T10:00:00.000Z');
const MIN=60_000;
/** A controllable clock. */
const clock=(t=T0)=>{const c={t,now:()=>new Date(c.t),at:ms=>{c.t=T0+ms;return c;}};return c;};
/** Fake Telegram that records sends and edits (no network). */
function tg({fail=false}={}){
  const sent=[];let mid=700;
  const boom=()=>{throw new Error('telegram down');};
  return {sent,
    async sendMessage(m){if(fail)boom();sent.push({type:'message',messageId:++mid,...m});return {messageId:mid};},
    async editMessageText(chatId,messageId,text){if(fail)boom();sent.push({type:'edited',chatId,messageId,text});}};
}
const iso=ms=>new Date(T0+ms).toISOString();
/** A minimal persisted product (only what the status layer reads). */
const product=(over={})=>({product_id:'020',request:{chat_id:String(CHAT)},status:'PATTERNS_GENERATING',lock:{op:'patterns',at:iso(0)},last_error:null,
  status_history:[{from:'CREATIVE_APPROVED',to:'PATTERNS_GENERATING',at:iso(0)}],updated_at:iso(0),...over});
const crochet=(drafted,total=6)=>({brief:{pattern_count:total},plan:{file:'crochet/plan.json'},generation:{status:'generating',mode:'generate'},pending:null,
  patterns:Array.from({length:total},(_,i)=>({pattern_id:`p${i+1}`,name:['Oak Leaf Coaster','Acorn Garland','Beech Leaf Coaster','Pumpkin','Mushroom','Owl'][i],
    file:i<drafted?`crochet/drafts/p${i+1}.json`:null,generated_at:i<drafted?iso(i*MIN):null}))});
const waiting=(status,atMs,over={})=>product({status,lock:null,status_history:[{from:'X',to:status,at:iso(atMs)}],updated_at:iso(atMs),...over});
async function tmp(){const d=await mkdtemp(join(tmpdir(),'lumiumx-owner-status-'));return {dir:d,cleanup:()=>rm(d,{recursive:true,force:true})};}
const make=(dir,c,telegram,o={})=>new OwnerStatus({telegram,stateDir:dir,now:c.now,...o});
const reminders=t=>t.sent.filter(s=>s.type==='message'&&/is waiting for you/.test(s.text));

// ---------- formatting ----------
test('elapsed timer: seconds, minutes, hours; never negative, never a countdown',()=>{
  assert.equal(formatElapsed(0),'0s');
  assert.equal(formatElapsed(45_000),'45s');
  assert.equal(formatElapsed(4*MIN+12_000),'4m 12s');
  assert.equal(formatElapsed(63*MIN),'1h 03m');
  assert.equal(formatElapsed(-5000),'0s');
  assert.doesNotMatch(runningText('020',{icon:'🧶',label:'x'},90_000),/remaining|ETA|left/i);
});

test('RUNNING state: short, with the known-total counter, elapsed time, last item and "No action needed"',()=>{
  const p=product({crochet:crochet(3)});
  const text=runningText('020',progressOf(p,'patterns'),4*MIN+12_000);
  assert.equal(text,['🟢 #020 — WORKING','🧶 Drafting crochet patterns','█████░░░░░ Patterns 3 / 6','✅ Last: 03 Beech Leaf Coaster','⏱ 4m 12s','',"No action needed. I'll message you when it's ready."].join('\n'));
});

test('progress counters appear only where the total is known; no invented percentages',()=>{
  assert.equal(progressBar(2,3),'███████░░░');
  assert.equal(progressBar(1,null),null);
  // Proofs 2 / 3, from the persisted attempt.
  const proofs=progressOf({status:'PROOFS_GENERATING',pages:[{page_number:1,title:'Cover'},{page_number:5,title:'Maze'}],
    proofs:{selected_pages:[{},{},{}],attempts:[{images:[{page_number:1},{page_number:5}]}]}},'proofs');
  assert.deepEqual([proofs.done,proofs.total,proofs.last],[2,3,'Maze']);
  // Book pages, from the persisted book.
  const book=progressOf({status:'BOOK_GENERATING',pages:[{title:'A'},{title:'B'}],book:{pages:[{page_id:'P001',page_number:1,status:'reused'},{page_id:'P002',page_number:2,status:'missing'}]}},'book');
  assert.deepEqual([book.done,book.total],[1,2]);
  // Marketing AI images from a workflow note (4 / 8); the Etsy stage counter 3 / 4.
  const mk=progressOf({status:'MARKETING_GENERATING'},'marketing',{status:'MARKETING_GENERATING',unit:'AI images',done:4,total:8});
  assert.match(runningText('020',mk,1000),/AI images 4 \/ 8/);
  assert.match(runningText('020',progressOf({status:'ETSY_ASSETS_UPLOADING'},'etsy'),1000),/Uploading images and files\nStage 3 \/ 4/);
  // Unknown total (Stage 2 files written): a count, never a bar or a fraction.
  const files=runningText('020',progressOf({status:'PRODUCTION_BUILDING'},'production',{status:'PRODUCTION_BUILDING',unit:'Files written',done:10}),1000);
  assert.match(files,/Files written: 10/);assert.doesNotMatch(files,/█|%|10 \//);
  // A note given in an earlier state is ignored once the product moved on.
  assert.equal(progressOf({status:'PRODUCTION_QC'},'production',{status:'PRODUCTION_BUILDING',unit:'Files written',done:10}).done,undefined);
  // Steps with no item total show a label only.
  for(const step of ['specification','ideation','restyle'])assert.doesNotMatch(runningText('020',progressOf({status:'X'},step),1),/█|\d+ \/ \d+|%/);
});

test('ACTION REQUIRED and FAILED texts say plainly that the pipeline is paused',()=>{
  const w=ownerWait(waiting('AWAITING_PATTERN_APPROVAL',0));
  const a=actionText('020',w,4*MIN);
  assert.match(a,/^🟠 #020 — ACTION REQUIRED\nPattern review is ready\./);assert.ok(a.includes(PAUSED));
  const f=failedText('020',{step:'specification',message:'OpenAI /responses failed (HTTP 500): upstream error'},MIN);
  assert.match(f,/^🔴 #020 — FAILED\nStage: specification\n/);assert.ok(f.includes(PAUSED));
  assert.match(actionHeader(waiting('AWAITING_PRODUCTION_APPROVAL',0)),/^🟠 #020 — ACTION REQUIRED\nProduction files are ready\.\nPipeline paused until you respond\.$/);
  // Not an owner gate: no waiting state, so never a reminder.
  for(const s of ['CREATIVE_APPROVED','PRODUCTION_APPROVED','SPEC_READY','PUBLISHED'])assert.equal(ownerWait(waiting(s,0)),null,s);
  // A running (locked) product is never "waiting".
  assert.equal(ownerWait({...waiting('AWAITING_PATTERN_APPROVAL',0),lock:{op:'patterns'}}),null);
});

// ---------- transitions (one message, edited) ----------
test('RUNNING -> ACTION REQUIRED: one status message, edited at item boundaries, then the owner state',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t);
    await s.start(product({crochet:crochet(0)}),'patterns');
    assert.equal(t.sent.length,1);assert.match(t.sent[0].text,/^🟢 #020 — WORKING\n🧶 Drafting crochet patterns\n░{10} Patterns 0 \/ 6/);
    c.at(MIN);await s.update(product({crochet:crochet(1)}));
    c.at(2*MIN);await s.update(product({crochet:crochet(3)}));
    // Same content again: no Telegram traffic.
    c.at(2*MIN+10_000);await s.update(product({crochet:crochet(3)}));
    const edits=t.sent.filter(x=>x.type==='edited');
    assert.equal(t.sent.filter(x=>x.type==='message').length,1,'never a second status message');
    assert.equal(edits.length,2);assert.match(edits[1].text,/Patterns 3 \/ 6\n✅ Last: 03 Beech Leaf Coaster\n⏱ 2m 00s/);
    c.at(4*MIN+12_000);await s.finish(waiting('AWAITING_PATTERN_APPROVAL',4*MIN+12_000,{crochet:crochet(6)}));
    const last=t.sent.at(-1);
    assert.equal(last.type,'edited');assert.equal(last.messageId,t.sent[0].messageId);
    assert.match(last.text,/^🟠 #020 — ACTION REQUIRED\nPattern review is ready\.\n⏱ Took 4m 12s\n\nPipeline paused until you respond\./);
    assert.deepEqual(JSON.parse(await readFile(join(dir,OWNER_STATUS_FILE),'utf8')).running,{},'nothing left running');
  }finally{await cleanup();}
});

test('RUNNING -> FAILED and RUNNING -> COMPLETE',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t);
    await s.start(product({status:'CONCEPT_SELECTED',lock:{op:'specification'}}),'specification');
    assert.match(t.sent[0].text,/📝 Writing the product specification/);
    c.at(90_000);
    await s.finish(waiting('FAILED',90_000,{last_error:{step:'specification',message:'OpenAI /responses failed (HTTP 500): upstream error',at:iso(90_000)}}));
    assert.match(t.sent.at(-1).text,/^🔴 #020 — FAILED\nStage: specification\n\n.*HTTP 500.*\n⏱ After 1m 30s/s);
    await s.start(product({id:'x',status:'CONCEPT_SELECTED',lock:{op:'specification'}}),'specification');
    c.at(3*MIN);await s.finish(waiting('SPEC_READY',3*MIN));
    assert.match(t.sent.at(-1).text,/^✅ #020 — SPECIFICATION DONE\n⏱ 1m 30s$/);
  }finally{await cleanup();}
});

test('throttling: the elapsed time alone refreshes at most every refreshMs; rapid content changes are coalesced',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t,{minEditMs:3000,refreshMs:45_000});
    const p=product({crochet:crochet(1)});
    await s.start(p,'patterns');
    c.at(10_000);await s.tick();c.at(30_000);await s.tick();
    assert.equal(t.sent.length,1,'no edit for elapsed time inside refreshMs');
    c.at(46_000);await s.tick();
    assert.equal(t.sent.length,2);assert.match(t.sent[1].text,/⏱ 46s/);
    // Two items finish within minEditMs: the second waits for the next tick, then one edit.
    c.at(47_000);await s.update(product({crochet:crochet(2)}));
    c.at(48_000);await s.update(product({crochet:crochet(3)}));
    assert.equal(t.sent.length,2,'coalesced');
    c.at(50_000);await s.tick();
    assert.equal(t.sent.length,3);assert.match(t.sent[2].text,/Patterns 3 \/ 6/);
    // A long awaited call stays RUNNING: no "stalled" state however long it takes.
    c.at(40*MIN);await s.tick();
    assert.match(t.sent.at(-1).text,/^🟢 #020 — WORKING[\s\S]*⏱ 40m 00s/);assert.doesNotMatch(t.sent.map(x=>x.text).join('\n'),/stall/i);
  }finally{await cleanup();}
});

test('quick steps (restyle) send nothing unless still running after lazyMs',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t,{lazyMs:5000});
    await s.start(product({status:'CREATIVE_APPROVED',lock:{op:'restyle'}}),'restyle');
    c.at(1000);await s.finish(waiting('SPEC_READY',1000));
    assert.equal(t.sent.length,0,'a fast restyle is silent');
    await s.start(product({status:'CREATIVE_APPROVED',lock:{op:'restyle'}}),'restyle');
    c.at(2000);await s.tick();assert.equal(t.sent.length,0);
    c.at(7000);await s.tick();
    assert.equal(t.sent.length,1);assert.match(t.sent[0].text,/🎨 Restyling from the approved patterns/);
  }finally{await cleanup();}
});

test('a Telegram failure never throws into the pipeline',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), logs=[];
  try{
    const s=make(dir,c,tg({fail:true}),{log:l=>logs.push(l)});
    await s.start(product({crochet:crochet(0)}),'patterns');
    await s.update(product({crochet:crochet(1)}));
    await s.finish(waiting('AWAITING_PATTERN_APPROVAL',0));
    await s.tick({listProducts:async()=>{throw new Error('disk');}});
    assert.ok(logs.some(l=>/telegram down/.test(l)));
  }finally{await cleanup();}
});

// ---------- the one reminder ----------
test('exactly one 10-minute reminder per waiting state; repeated ticks never nag',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t,{reminderScanMs:0});
    const p=waiting('AWAITING_PATTERN_APPROVAL',0);
    const list=async()=>[p];
    for(const m of [1,5,9.9]){c.at(m*MIN);await s.tick({listProducts:list});}
    assert.equal(reminders(t).length,0,'not before 10 minutes');
    for(const m of [10,11,30,120]){c.at(m*MIN);await s.tick({listProducts:list});}
    assert.equal(reminders(t).length,1,'exactly one');
    assert.equal(reminders(t)[0].text,['🔔 Product #020 is waiting for you','','Pattern review is ready.','Production will not continue until you approve or revise.'].join('\n'));
    assert.equal(reminders(t)[0].replyMarkup.inline_keyboard[0][0].text,'📦 Open Product');
  }finally{await cleanup();}
});

test('owner response clears reminder eligibility; a later independent waiting state gets its own single reminder',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const s=make(dir,c,t,{reminderScanMs:0});
    let p=waiting('AWAITING_PATTERN_APPROVAL',0);
    const list=async()=>[p];
    // Answered within 10 minutes: no reminder at all for that state.
    c.at(2*MIN);await s.tick({listProducts:list});
    p=waiting('CREATIVE_APPROVED',3*MIN);
    c.at(15*MIN);await s.tick({listProducts:list});
    assert.equal(reminders(t).length,0);
    assert.deepEqual(JSON.parse(await readFile(join(dir,OWNER_STATUS_FILE),'utf8')).reminders,{},'cleared after the owner responded');
    // A new gate later: its own single reminder.
    p=waiting('AWAITING_PRODUCTION_APPROVAL',20*MIN);
    for(const m of [25,31,40]){c.at(m*MIN);await s.tick({listProducts:list});}
    assert.equal(reminders(t).length,1);assert.match(reminders(t)[0].text,/Production files are ready/);
    // Owner rebuilds (state changes) and production comes back for review: that is another waiting state.
    p=waiting('AWAITING_PRODUCTION_APPROVAL',45*MIN);
    for(const m of [50,56,70]){c.at(m*MIN);await s.tick({listProducts:list});}
    assert.equal(reminders(t).length,2);
    // A failed step is a waiting state too (one reminder); a locked, running product never is.
    p=waiting('FAILED',80*MIN,{last_error:{step:'production',message:'x',at:iso(80*MIN)}});
    for(const m of [91,95]){c.at(m*MIN);await s.tick({listProducts:list});}
    assert.equal(reminders(t).length,3);assert.match(reminders(t)[2].text,/Stopped at: production\.\nNothing continues until you retry or cancel\./);
    p={...waiting('AWAITING_MARKETING_APPROVAL',100*MIN),lock:{op:'marketing',at:iso(100*MIN)}};
    c.at(200*MIN);await s.tick({listProducts:list});
    assert.equal(reminders(t).length,3);
  }finally{await cleanup();}
});

test('bot restart does not cause a duplicate reminder, and does not lose a pending one',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const p=waiting('AWAITING_CREATIVE_APPROVAL',0), list=async()=>[p];
    const a=make(dir,c,t,{reminderScanMs:0});
    c.at(2*MIN);await a.tick({listProducts:list});            // state file created before the wait is due
    const b=make(dir,c,t,{reminderScanMs:0});                  // restart at minute 3
    c.at(10*MIN);await b.tick({listProducts:list});
    assert.equal(reminders(t).length,1,'the pending reminder survives the restart');
    const d=make(dir,c,t,{reminderScanMs:0});                  // restart again
    for(const m of [11,60]){c.at(m*MIN);await d.tick({listProducts:list});}
    assert.equal(reminders(t).length,1,'never repeated after a restart');
  }finally{await cleanup();}
});

test('first run (no state file): waits already overdue are recorded, not reminded; very old waits never are',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const old=waiting('AWAITING_MARKETING_APPROVAL',0), fresh={...waiting('AWAITING_PATTERN_APPROVAL',119*MIN),product_id:'021'};
    const s=make(dir,c,t,{reminderScanMs:0});
    c.at(120*MIN);await s.tick({listProducts:async()=>[old,fresh]});
    assert.equal(reminders(t).length,0,'no burst of reminders when the layer is first deployed');
    c.at(129*MIN);await s.tick({listProducts:async()=>[old,fresh]});
    assert.equal(reminders(t).length,1);assert.match(reminders(t)[0].text,/#021/);
    // Forgotten for more than a day: recorded as expired, never sent.
    const ancient={...waiting('AWAITING_BOOK_APPROVAL',0),product_id:'022'};
    c.at(26*60*MIN);await s.tick({listProducts:async()=>[old,fresh,ancient]});
    assert.equal(reminders(t).length,1);
  }finally{await cleanup();}
});

test('restart while RUNNING: the old status message is closed from persisted state; nothing is restarted',async()=>{
  const {dir,cleanup}=await tmp(), c=clock(), t=tg();
  try{
    const a=make(dir,c,t);
    await a.start(product({crochet:crochet(2)}),'patterns');
    c.at(5*MIN);
    const after=waiting('FAILED',5*MIN,{last_error:{step:'patterns',message:'Interrupted by a restart',at:iso(5*MIN)},crochet:crochet(2)});
    const b=make(dir,c,t);
    let loads=0;
    await b.recover({loadProduct:async id=>{loads++;assert.equal(id,'020');return after;}});
    assert.equal(loads,1);
    const e=t.sent.at(-1);
    assert.equal(e.type,'edited');assert.equal(e.messageId,t.sent[0].messageId);
    assert.match(e.text,/^🔴 #020 — FAILED\nStage: crochet patterns\n\nInterrupted by a restart\n⏱ After 5m 00s/);
    assert.deepEqual(JSON.parse(await readFile(join(dir,OWNER_STATUS_FILE),'utf8')).running,{});
  }finally{await cleanup();}
});

test('the status layer has no OpenAI, Etsy, store-write or pipeline imports',async()=>{
  for(const f of ['../src/orchestrator/owner-status.mjs','../src/telegram/status.mjs']){
    const src=await readFile(new URL(f,import.meta.url),'utf8');
    for(const banned of [/openai/i,/stage4/,/etsy-live/,/production\/src/,/marketing\/src/,/state\.mjs/,/store\.mjs/,/workflow\.mjs/])
      assert.doesNotMatch(src.split('\n').filter(l=>/^import /.test(l)).join('\n'),banned,`${f} imports ${banned}`);
    assert.doesNotMatch(src,/\.save\(|transition\(|acquireLock|releaseLock/,`${f} touches product state`);
  }
});

// ---------- the real workflow (fake OpenAI, fake Telegram) ----------
async function toProofs(h){
  await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
  await h.wf.handleUpdate(photo('ref1'));
  await h.wf.handleUpdate(msg('/go'));
  return h.wf.handleUpdate(press(button(h.telegram,'B')));
}
const STATUS_LINE=/^(🟢|🟠|🔴|✅) #\d{3} — /;
/** Telegram traffic without the status layer's own messages and headers: what the owner saw before this change. */
const legacyView=t=>t.sent.filter(s=>!(s.type==='edited'&&STATUS_LINE.test(s.text))&&!(s.type==='message'&&!s.replyMarkup&&STATUS_LINE.test(s.text)))
  .map(s=>s.type==='message'&&s.replyMarkup?{...s,text:s.text.replace(/^(🟠|🔴) #\d{3} — (ACTION REQUIRED|FAILED)\n(?:.*\n)?Pipeline paused until you respond\.\n\n/,'')}:s)
  .map(({messageId,id,...s})=>JSON.stringify(s,(k,v)=>k==='callback_data'?String(v).replace(/\|[0-9a-f]{12}$/,'|nonce'):k==='bytes'?'<bytes>':v));
const semantic=p=>({status:p.status,resume:p.resume_state,events:p.status_history.map(h=>h.event),pages:p.pages.length,proofs:p.proofs.attempts.map(a=>[a.status,a.images.length]),
  usage:p.api_usage.map(u=>u.step??u.kind??null),error:p.last_error?.step??null});

test('no production semantics changed: same calls, same product state, same messages (status layer on vs off)',async()=>{
  const off=await harness({files:{ref1:PNG}}), on=await harness({files:{ref1:PNG},status:true});
  try{
    const a=await toProofs(off), b=await toProofs(on);
    assert.equal(a.outcome,'awaiting_creative_approval');assert.equal(b.outcome,a.outcome);
    assert.deepEqual(on.calls.map(c=>[c.kind,c.schemaName??null]),off.calls.map(c=>[c.kind,c.schemaName??null]),'identical OpenAI calls: progress triggers no API work');
    assert.deepEqual(semantic(await on.store.load(b.productId)),semantic(await off.store.load(a.productId)));
    assert.deepEqual(legacyView(on.telegram),legacyView(off.telegram),'every pipeline message is unchanged apart from the owner header');
    // Off: no status messages at all, exactly as before.
    assert.equal(off.telegram.sent.filter(s=>s.text&&STATUS_LINE.test(s.text)).length,0);
  }finally{await off.cleanup();await on.cleanup();}
});

test('workflow: chained steps share one status message; the review says ACTION REQUIRED; failures say FAILED',async()=>{
  const h=await harness({files:{ref1:PNG},status:true});
  try{
    await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
    await h.wf.handleUpdate(photo('ref1'));
    const before=h.telegram.sent.length;
    await h.wf.handleUpdate(msg('/go'));   // ideation -> concept previews, one update
    const run=h.telegram.sent.slice(before);
    const statusMsgs=run.filter(s=>s.type==='message'&&/^🟢 #001 — WORKING/.test(s.text));
    assert.equal(statusMsgs.length,1,'ideation and previews share one status message');
    assert.match(statusMsgs[0].text,/💡 /);
    const edits=run.filter(s=>s.type==='edited');
    assert.ok(edits.some(e=>/🖼 Painting concept previews/.test(e.text)),'previews progress shown on the same message');
    assert.match(edits.at(-1).text,/^🟠 #001 — ACTION REQUIRED\nConcept previews are ready\./);
    const choose=run.filter(s=>s.type==='message'&&s.replyMarkup).at(-1);
    assert.match(choose.text,/^🟠 #001 — ACTION REQUIRED\nConcept previews are ready\.\nPipeline paused until you respond\.\n\n/);
    // Concept B -> spec -> proofs (one update): one message, then the review.
    await h.wf.handleUpdate(press(button(h.telegram,'B')));
    const review=h.telegram.sent.filter(s=>s.type==='message'&&s.replyMarkup).at(-1);
    assert.match(review.text,/^🟠 #001 — ACTION REQUIRED\nStyle proofs are ready\./);
    assert.equal(JSON.stringify(JSON.parse(await readFile(join(h.root,'state',OWNER_STATUS_FILE),'utf8')).running),'{}');
  }finally{await h.cleanup();}
  // Failure: the status message ends FAILED and the Retry message carries the FAILED header.
  const f=await harness({files:{ref1:PNG},status:true,plan:{specification:()=>apiFailure()}});
  try{
    const r=await toProofs(f);
    assert.equal(r.outcome,'failed');
    const p=await f.store.load(r.productId);
    assert.equal(p.status,'FAILED');assert.equal(p.last_error.step,'specification');
    assert.ok(f.telegram.sent.some(s=>s.type==='edited'&&/^🔴 #001 — FAILED\nStage: specification/.test(s.text)));
    const retry=f.telegram.sent.filter(s=>s.type==='message'&&s.replyMarkup).at(-1);
    assert.match(retry.text,/^🔴 #001 — FAILED\nStage: specification\nPipeline paused until you respond\.\n\n/);
    assert.ok(retry.replyMarkup.inline_keyboard.flat().some(b=>/Retry/.test(b.text)));
  }finally{await f.cleanup();}
});

test('workflow restart: an interrupted step is closed as FAILED once, without restarting work',async()=>{
  const h=await harness({files:{ref1:PNG},status:true});
  try{
    await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
    await h.wf.handleUpdate(photo('ref1'));
    await h.wf.handleUpdate(msg('/go'));
    await h.wf.handleUpdate(press(button(h.telegram,'B')));
    // Simulate a crash mid-proofs: product locked, a RUNNING status record left behind.
    let p=await h.store.load('001');
    p={...p,status:'PROOFS_GENERATING',lock:{op:'proofs',id:'00000000-0000-4000-8000-000000000000',at:new Date().toISOString()},
      status_history:[...p.status_history,{from:'AWAITING_CREATIVE_APPROVAL',to:'PROOFS_GENERATING',event:'proofs_started',at:new Date().toISOString(),actor:'@owner'}],
      proofs:{...p.proofs,attempts:[...p.proofs.attempts,{...p.proofs.attempts.at(-1),attempt:2,dir:'proofs/attempt-02',status:'generating',images:[],finished_at:null}]}};
    await h.store.save(p);
    await h.ownerStatus.start(p,'proofs');
    const calls=h.calls.length, sentBefore=h.telegram.sent.length;
    // "Restart": a new status layer over the same state dir, then the workflow's recover().
    const { OwnerStatus }=await import('../src/orchestrator/owner-status.mjs');
    const { Workflow }=await import('../src/orchestrator/workflow.mjs');
    const status2=new OwnerStatus({telegram:h.telegram,stateDir:join(h.root,'state')});
    const wf2=new Workflow({store:h.store,registry:h.registry,telegram:h.telegram,ai:h.ai,auth:()=>true,ownerStatus:status2});
    assert.deepEqual(await wf2.recover(),['001']);
    assert.equal(h.calls.length,calls,'no OpenAI call on restart');
    const closed=h.telegram.sent.slice(sentBefore).filter(s=>s.type==='edited'&&/^🔴 #001 — FAILED\nStage: style proofs/.test(s.text));
    assert.equal(closed.length,1,'the RUNNING status message is closed exactly once');
    assert.equal(h.telegram.sent.slice(sentBefore).filter(s=>s.type==='message'&&/^🟢/.test(s.text)).length,0,'no new RUNNING message: nothing restarted');
    assert.equal((await h.store.load('001')).status,'FAILED');
    assert.deepEqual(await wf2.recover(),[],'a second restart changes nothing');
  }finally{await h.cleanup();}
});
