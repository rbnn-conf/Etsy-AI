// Append-only OpenAI cost ledger (one JSON event per line). The ONLY place
// usage is turned into money. Events are written from the workflow's metered
// OpenAI records (authoritative API usage metadata), priced with the versioned
// pricing table, converted to GBP with a recorded rate. Never stores keys,
// tokens, prompts or response bodies. Failures here never touch product state.
import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { priceUsage, toGbp } from './pricing.mjs';

// Which factory stage a metered OpenAI step belongs to (operation = the workflow step that made the call).
export function stageOf(step,operation){
  if(operation==='direction-change')return 'creative_revisions';
  return ({'reference-analysis':'creative_concepts','creative-direction':'creative_concepts','ideas':'creative_concepts','concept-preview':'creative_concepts',
    'specification':'artwork','proof-image':'artwork','book-page':'artwork','crochet-hero':'artwork','crochet-preview':'artwork','listing':'listing_copy','marketing-copy':'marketing','marketing-scene':'marketing','marketing-direction':'marketing','marketing-example':'marketing'})[step]??'other';
}

export class CostLedger{
  /** @param pricing loadPricing() result */
  constructor({dir,pricing,now=()=>new Date()}){
    Object.assign(this,{dir,pricing,now});
    this.file=join(dir,'ledger.jsonl');this.metaFile=join(dir,'tracking.json');
  }
  /** When cost tracking began (created on first use; never moved). */
  trackingStartedAt(){
    if(!existsSync(this.metaFile)){
      mkdirSync(this.dir,{recursive:true});
      writeFileSync(this.metaFile,JSON.stringify({schema_version:1,tracking_started_at:this.now().toISOString(),first_pricing_version:this.pricing.version},null,2)+'\n',{flag:'wx'});
    }
    return JSON.parse(readFileSync(this.metaFile,'utf8')).tracking_started_at;
  }
  /** Read-only: when tracking began, or null if it has not begun. */
  startedAt(){return existsSync(this.metaFile)?JSON.parse(readFileSync(this.metaFile,'utf8')).tracking_started_at:null;}
  /** Append one event per metered OpenAI attempt. Returns the events written. */
  record({productId,operation=null,records}){
    if(!records?.length)return [];
    this.trackingStartedAt();
    const events=records.map(r=>this.#event({productId,operation,r}));
    appendFileSync(this.file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
    return events;
  }
  #event({productId,operation,r}){
    const price=priceUsage({kind:r.kind,model:r.model,usage:r.usage},this.pricing);
    const fx=this.pricing.fx;
    const gbp=price.priced?toGbp(price.source_cost,fx):null;
    return {schema_version:1,id:randomUUID(),at:this.now().toISOString(),call_at:r.at,product_id:productId,
      stage:stageOf(r.step,operation),operation,step:r.step,provider:'openai',model:r.model,kind:r.kind,outcome:r.outcome??'ok',
      usage:price.quantities,request:r.request??null,
      pricing_version:this.pricing.version,source_currency:this.pricing.currency,source_cost:price.source_cost,
      fx:fx?{pair:fx.pair,rate:fx.rate,as_of:fx.as_of}:null,gbp_cost:gbp,
      priced:price.priced&&gbp!==null,unpriced_reason:price.priced?(gbp===null?'no USD->GBP rate configured':null):price.reason};
  }
  /** All events (a corrupt line is skipped and counted, never fatal). */
  events(){
    if(!existsSync(this.file))return {events:[],corrupt:0};
    let corrupt=0;const events=[];
    for(const line of readFileSync(this.file,'utf8').split('\n')){if(!line.trim())continue;try{events.push(JSON.parse(line));}catch{corrupt++;}}
    return {events,corrupt};
  }
}
