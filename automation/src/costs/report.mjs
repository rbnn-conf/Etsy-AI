// Cost aggregation and display (read-only over the ledger). Values shown are
// "Estimated API cost": token usage reported by OpenAI x the configured price
// version x the recorded GBP rate. Nothing before tracking started is implied.

export const STAGES=Object.freeze([
  ['creative_concepts','Creative concepts'],['artwork','Artwork generation'],['creative_revisions','Creative revisions'],
  ['listing_copy','Listing copy'],['marketing','Marketing generation'],['other','Other']]);
// Deterministic stages: no OpenAI call exists in them (enforced by tests), so £0.00 is known, once reached.
const DETERMINISTIC=[['production','Production','PRODUCTION_BUILDING'],['qc','QC','PRODUCTION_QC'],['etsy','Etsy','ETSY_PREPARING']];

export function gbp(v){
  if(v===null||v===undefined)return '—';
  if(v>0&&v<0.005)return '<£0.01';
  return `£${v.toFixed(2)}`;
}
const sum=list=>list.reduce((s,e)=>s+(e.gbp_cost??0),0);
const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());

export function factoryTotals(events,now=new Date()){
  const at=e=>new Date(e.call_at??e.at);
  const today=startOfDay(now), week=new Date(now-7*864e5), month=new Date(now.getFullYear(),now.getMonth(),1);
  const products=new Set(events.map(e=>e.product_id).filter(Boolean));
  const all=sum(events);
  return {today:sum(events.filter(e=>at(e)>=today)),last7:sum(events.filter(e=>at(e)>=week)),month:sum(events.filter(e=>at(e)>=month)),
    all,products:products.size,average:products.size?all/products.size:null,events:events.length,unpriced:events.filter(e=>!e.priced).length};
}
export function byProduct(events){
  const m=new Map();
  for(const e of events){const k=e.product_id??'—';const r=m.get(k)??{productId:k,gbp:0,events:0,unpriced:0};r.gbp+=e.gbp_cost??0;r.events++;if(!e.priced)r.unpriced++;m.set(k,r);}
  return [...m.values()].sort((a,b)=>String(b.productId).localeCompare(String(a.productId)));
}
export function byModel(events){
  const m=new Map();
  for(const e of events){const r=m.get(e.model)??{model:e.model,gbp:0,events:0,unpriced:0};r.gbp+=e.gbp_cost??0;r.events++;if(!e.priced)r.unpriced++;m.set(e.model,r);}
  return [...m.values()].sort((a,b)=>b.gbp-a.gbp);
}

/**
 * One product's cost: tracked events by stage, deterministic stages at £0.00
 * only once the product actually reached them, and how many earlier OpenAI
 * calls (recorded in product.json before tracking began) were never priced.
 */
export function productCost(product,events,trackingStartedAt){
  const mine=events.filter(e=>e.product_id===product.product_id);
  const reached=s=>product.status_history?.some(h=>h.to===s);
  const rows=STAGES.map(([k,label])=>{const list=mine.filter(e=>e.stage===k);return list.length?{key:k,label,gbp:sum(list),events:list.length,unpriced:list.filter(e=>!e.priced).length}:null;}).filter(Boolean);
  for(const [k,label,state] of DETERMINISTIC)if(reached(state))rows.push({key:k,label,gbp:0,events:0,unpriced:0,deterministic:true});
  const since=trackingStartedAt?new Date(trackingStartedAt):null;
  const untracked=since?(product.api_usage??[]).filter(u=>new Date(u.at)<since).length:(product.api_usage??[]).length;
  return {total:sum(mine),events:mine.length,unpriced:mine.filter(e=>!e.priced).length,rows,untrackedCalls:untracked,trackingStartedAt};
}

/**
 * Estimated incremental cost of a planned operation: call counts x this
 * factory's recent average priced cost per call of that kind for the given
 * steps. null when there is no history to base it on (then only counts are shown).
 */
export function estimateCalls(events,{text=0,image=0},{steps=['listing','marketing-copy','marketing-direction','marketing-scene','marketing-example'],recent=40}={}){
  const avg=kind=>{const l=events.filter(e=>e.priced&&e.kind===kind&&steps.includes(e.step)).slice(-recent);return l.length?sum(l)/l.length:null;};
  const t=text?avg('text'):0, i=image?avg('image'):0;
  return {text,image,gbp:t===null||i===null?null:text*t+image*i};
}
export const estimateLine=e=>{
  const calls=[e.text?`${e.text} text call${e.text>1?'s':''}`:'',e.image?`${e.image} image call${e.image>1?'s':''}`:''].filter(Boolean).join(' + ')||'no OpenAI calls';
  return e.text||e.image?`Estimated: ${calls}${e.gbp!==null&&e.gbp!==undefined?` ≈ ${gbp(e.gbp)} (recent average per call)`:''}.`:'Estimated: no OpenAI calls (£0.00).';
};

/** Tracked spend of one product on the given OpenAI steps (e.g. the full-book page images). */
export function stepSpend(events,productId,steps){
  const l=events.filter(e=>e.product_id===productId&&steps.includes(e.step));
  return {gbp:sum(l),events:l.length,unpriced:l.filter(e=>!e.priced).length};
}
/** Full-book page images: estimated from recent page and proof images (same model, size and quality). */
export const BOOK_IMAGE_STEPS=Object.freeze(['book-page','proof-image']);
/** Crochet visual set images (ADR-063): estimated from recent visual-set, page and proof images. */
export const VISUAL_IMAGE_STEPS=Object.freeze(['crochet-hero','crochet-preview','book-page','proof-image']);

/** Two-column text block for Telegram (monospace-friendly labels). */
export const table=rows=>rows.map(([l,v])=>`${l.padEnd(22,' ')}${v}`).join('\n');
