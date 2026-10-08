// Telegram SEO state (ADR-036), in the bot's git-ignored state folder:
//   <stateDir>/seo/index.json              sessions, product links, per-chat input entries, nonces
//   <stateDir>/seo/sessions/<id>/          one engine ResearchWorkspace per session (+ revision files)
// Research versions inside a session are the engine's write-once files: an
// observation is never overwritten. Every write action rotates a nonce, so a
// stale or repeated button press is refused (like the product "a1" buttons).
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ResearchWorkspace } from '../../../seo/src/index.mjs';

async function atomicWrite(path,data){
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp,data);
  try{await rename(tmp,path);}catch(e){await rm(tmp,{force:true});throw e;}
}
export const newSeoNonce=()=>randomBytes(6).toString('hex');
export const SESSION_ID=/^s[0-9a-f]{10}$/, ENTRY_ID=/^e[0-9a-f]{10}$/, NONCE=/^[0-9a-f]{12}$/;
const EMPTY={schema_version:1,sessions:{},product_links:{},entries:{}};

export class SeoState{
  constructor({stateDir,now=()=>new Date()}){this.root=join(stateDir,'seo');this.path=join(this.root,'index.json');this.now=now;}
  async read(){return JSON.parse(await readFile(this.path,'utf8').catch(()=>JSON.stringify(EMPTY)));}
  async update(fn){const r=await this.read();const next=fn(r)??r;await atomicWrite(this.path,JSON.stringify(next,null,2)+'\n');return next;}
  dirOf(id){if(!SESSION_ID.test(id))throw new Error('bad session id');return join(this.root,'sessions',id);}

  /** Create a research session: an engine workspace (plan, profile, round 1) + its index entry. */
  async createSession({mode,idea=null,snapshot=null,profile,product_id=null,name,chat_id,actor='owner'}){
    const id=`s${randomBytes(5).toString('hex')}`, now=this.now();
    const ws=await ResearchWorkspace.create({dir:this.dirOf(id),mode,idea,snapshot,profile,research_id:`seo-${id}`,
      meta:{session_id:id,product_id,name,created_by:actor},now});
    await this.update(r=>{
      r.sessions[id]={id,mode:ws.mode,product_id,name,chat_id:String(chat_id),status:'researching',nonce:newSeoNonce(),created_at:now.toISOString(),updated_at:now.toISOString(),
        created_by:actor,reuse:[],scored:null,decision:null};
      if(product_id)r.product_links[product_id]=id;
    });
    return {id,ws};
  }
  async session(id){return SESSION_ID.test(id??'')?(await this.read()).sessions[id]??null:null;}
  async open(id){return ResearchWorkspace.open(this.dirOf(id));}
  /** Apply a change to one session record and rotate its nonce (every write action). */
  async touch(id,fn=()=>{}){
    let out;
    await this.update(r=>{const s=r.sessions[id];if(!s)throw new Error(`unknown SEO session ${id}`);fn(s,r);s.nonce=newSeoNonce();s.updated_at=this.now().toISOString();out=s;});
    return out;
  }
  async sessionForProduct(productId){const r=await this.read(), id=r.product_links[productId];return id?r.sessions[id]??null:null;}
  async sessions(chatId){return Object.values((await this.read()).sessions).filter(s=>s.chat_id===String(chatId));}

  // ----- per-chat input entries (multi-step Telegram flows; restart-safe) -----
  async entry(chatId){return (await this.read()).entries[String(chatId)]??null;}
  async setEntry(chatId,entry){
    const e={...entry,id:entry.id??`e${randomBytes(5).toString('hex')}`,nonce:newSeoNonce(),updated_at:this.now().toISOString()};
    await this.update(r=>{r.entries[String(chatId)]=e;});
    return e;
  }
  async clearEntry(chatId){await this.update(r=>{delete r.entries[String(chatId)];});}

  async writeSessionJson(id,file,obj){await atomicWrite(join(this.dirOf(id),file),JSON.stringify(obj,null,2)+'\n');}
  async readSessionJson(id,file){return JSON.parse(await readFile(join(this.dirOf(id),file),'utf8').catch(()=>'null'));}
}
