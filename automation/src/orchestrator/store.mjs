// Product workspaces (products/NNN-slug/) and the small runtime registry.
// product.json is written atomically and validated on EVERY save, so an
// invalid or half-written state can never be persisted.
import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadSchema, validate, SchemaError } from './schema.mjs';
import { newNonce } from './state.mjs';

async function atomicWrite(path,data){
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp,data);
  try{await rename(tmp,path);}catch(e){await rm(tmp,{force:true});throw e;}
}
export const slugify=t=>String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'')||'product';

/** Fields that must be filled once the specification exists. */
function specProblems(p){
  const order=['SPEC_READY','PROOFS_GENERATING','AWAITING_CREATIVE_APPROVAL','CREATIVE_APPROVED','BOOK_GENERATING','AWAITING_BOOK_APPROVAL','PATTERNS_GENERATING','AWAITING_PATTERN_APPROVAL','PRODUCTION_READY','PRODUCTION_BUILDING','PRODUCTION_QC','AWAITING_PRODUCTION_APPROVAL','PRODUCTION_APPROVED','MARKETING_PLANNING','MARKETING_GENERATING','MARKETING_QC','AWAITING_MARKETING_APPROVAL','MARKETING_APPROVED',
    'ETSY_PREPARING','ETSY_DRAFT_CREATED','ETSY_ASSETS_UPLOADING','ETSY_DRAFT_VERIFYING','AWAITING_ETSY_PUBLISH_APPROVAL','PUBLISHING','PUBLISHED'];
  const stage=p.status==='FAILED'?p.resume_state:p.status;
  if(!order.includes(stage))return [];
  const e=[];
  for(const k of ['name','slug','season','product_type','target_customer','page_count'])if(p[k]===null)e.push(`$.${k}: required once ${stage}`);
  if(!p.visual_direction)e.push(`$.visual_direction: required once ${stage}`);
  if(!p.canvas)e.push(`$.canvas: required once ${stage}`);
  if(p.pages.length!==p.page_count)e.push(`$.pages: ${p.pages.length} pages but page_count ${p.page_count}`);
  p.pages.forEach((pg,i)=>{if(pg.page_number!==i+1)e.push(`$.pages[${i}].page_number must be ${i+1}`);});
  if(p.proofs.selected_pages.length!==3)e.push('$.proofs.selected_pages: exactly 3 required');
  return e;
}

export class ProductStore{
  constructor({productsDir,reservedIds=[],now=()=>new Date()}){
    this.dir=resolve(productsDir);this.now=now;
    for(const id of reservedIds)if(!/^\d{3}$/.test(id))throw new Error(`Invalid reserved product id ${id}`);
    this.reserved=reservedIds.map(Number);
  }

  async #workspaces(){
    await mkdir(this.dir,{recursive:true});
    return (await readdir(this.dir,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d{3}-/.test(d.name)).map(d=>d.name);
  }
  #path(p,rel=''){
    const base=join(this.dir,p.workspace), full=resolve(base,rel);
    if(full!==resolve(base)&&!full.startsWith(resolve(base)+sep))throw new Error('Path escapes product workspace');
    return full;
  }

  /**
   * Read-only: the number the next create() will use. Highest of every
   * existing products/NNN-* folder and every reserved id, plus one, so a
   * number is never reused, even on a checkout missing a hand-built product.
   */
  async nextProductId(){
    const used=(await this.#workspaces()).map(n=>Number(n.slice(0,3)));
    const next=Math.max(0,...used,...this.reserved)+1;
    if(next>999)throw new Error('Product numbers exhausted (999)');
    return String(next).padStart(3,'0');
  }

  /** Reserve the next free NNN via an atomic mkdir (EEXIST -> try the next). */
  async create({requestText,chatId,requestedBy}){
    for(let attempt=0;attempt<20;attempt++){
      const id=await this.nextProductId();
      const workspace=`${id}-${slugify(requestText)}`;
      try{await mkdir(join(this.dir,workspace));}catch(e){if(e.code==='EEXIST')continue;throw e;}
      const at=this.now().toISOString();
      const product={schema_version:1,managed_by:'automation-stage-1',product_id:id,workspace,
        name:null,slug:null,season:null,product_type:null,target_customer:null,page_count:null,
        status:'DRAFT',resume_state:null,status_history:[{from:null,to:'DRAFT',event:'created',at,actor:requestedBy}],
        request:{text:requestText,requested_at:at,chat_id:String(chatId),requested_by:requestedBy},
        reference_files:[],visual_direction:null,concepts:{batches:[],selected:null},concept_previews:{batches:[]},pages:[],
        proofs:{selected_pages:[],attempts:[]},direction_feedback:[],pending_input:null,
        review:{nonce:newNonce(),keyboard_message_ids:[]},lock:null,last_error:null,api_usage:[],
        creative_approved_at:null,created_at:at,updated_at:at};
      await this.save(product);
      return product;
    }
    throw new Error('Could not reserve a product number');
  }

  async save(p){
    const schema=await loadSchema('product');
    const errors=[...validate(schema,p),...specProblems(p)];
    if(errors.length)throw new SchemaError('product.json',errors);
    await atomicWrite(this.#path(p,'product.json'),JSON.stringify(p,null,2)+'\n');
    return p;
  }

  /** Loads only Stage 1–managed products; hand-built products are never touched. */
  async load(productId){
    const ws=(await this.#workspaces()).find(n=>n.startsWith(`${productId}-`));
    if(!ws)return null;
    const raw=await readFile(join(this.dir,ws,'product.json'),'utf8').catch(()=>null);
    if(!raw)return null;
    const p=JSON.parse(raw);
    return p.managed_by==='automation-stage-1'?p:null;
  }
  async list(){
    const out=[];
    for(const ws of await this.#workspaces()){const p=await this.load(ws.slice(0,3));if(p&&p.workspace===ws)out.push(p);}
    return out;
  }
  async writeJson(p,rel,obj){await atomicWrite(this.#path(p,rel),JSON.stringify(obj,null,2)+'\n');}
  async readJson(p,rel){return JSON.parse(await readFile(this.#path(p,rel),'utf8'));}
  async writeBytes(p,rel,bytes){await atomicWrite(this.#path(p,rel),bytes);}
  async readBytes(p,rel){return readFile(this.#path(p,rel));}
  /** Absolute workspace path, for Stage 2 production (which reads and writes files directly). */
  dirOf(p){return this.#path(p);}
  async exists(p,rel){return readFile(this.#path(p,rel)).then(()=>true,()=>false);}
  pathOf(p,rel){return this.#path(p,rel);}
}

/** Telegram offset + the one active product per chat. Restart-safe. */
export class Registry{
  constructor({stateDir}){this.path=join(stateDir,'registry.json');}
  async read(){return JSON.parse(await readFile(this.path,'utf8').catch(()=>'{"telegram_offset":null,"active_by_chat":{}}'));}
  async update(fn){const r=await this.read();const next=fn(r)??r;await atomicWrite(this.path,JSON.stringify(next,null,2)+'\n');return next;}
}
