// The owner's product idea (NEW_PRODUCT mode). Product-type agnostic: the
// type and format are the owner's words, not an enum, so any product the
// Production Engine may one day make can be researched.
//
// IDEA FIRST: research positions THIS idea. It never swaps the idea for an
// unrelated product with better numbers.
import { normaliseKeyword } from './observations.mjs';

export const MODES=Object.freeze({NEW_PRODUCT:'NEW_PRODUCT',EXISTING_LISTING:'EXISTING_LISTING'});
export const IDEA_STATUSES=Object.freeze(['draft','researching','brief_ready','approved','rejected','handed_off']);
const FIELDS=['product_id','working_name','product_type','concept','audience','season','themes','format','page_count','owner_notes','candidate_keywords','status'];
// Optional structured intake (ADR-033). Absent → null (unknown), never guessed. Existing ideas stay valid.
export const OPTIONAL_FIELDS=Object.freeze(['audiences','delivery','formats','styles','item_count']);
export const STANDARD_AUDIENCES=Object.freeze(['adults','teens','kids','families','general']);
export const DELIVERY_METHODS=Object.freeze(['digital','printable','physical','editable','other']);
const str=(v,name,e,{required=false,max=500}={})=>{
  if(v===null||v===undefined){if(required)e.push(`${name} is required`);return;}
  if(typeof v!=='string'||(required&&!v.trim()))e.push(`${name} must be ${required?'a non-empty ':'a '}string${required?'':' or null'}`);
  else if(v.length>max)e.push(`${name} is longer than ${max} characters`);
};

/** @returns {ok, errors, idea}  idea has normalised, de-duplicated candidate keywords */
export function validateIdea(raw){
  const e=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,errors:['idea must be an object'],idea:null};
  for(const k of Object.keys(raw))if(!FIELDS.includes(k)&&!OPTIONAL_FIELDS.includes(k))e.push(`unexpected field "${k}"`);
  for(const k of FIELDS)if(!(k in raw))e.push(`${k} is required (use null or [] when unknown)`);
  if(raw.product_id!==null&&raw.product_id!==undefined&&!/^\d{3}$/.test(String(raw.product_id)))e.push('product_id must be a 3-digit product number or null (a new idea has none yet)');
  str(raw.working_name,'working_name',e,{required:true,max:140});
  str(raw.product_type,'product_type',e,{required:true,max:140});
  str(raw.concept,'concept',e,{required:true,max:2000});
  for(const k of ['audience','season','format'])str(raw[k],k,e,{max:200});
  str(raw.owner_notes,'owner_notes',e,{max:2000});
  if(raw.page_count!==null&&raw.page_count!==undefined&&(!Number.isInteger(raw.page_count)||raw.page_count<1))e.push('page_count must be a whole number >= 1 or null');
  for(const k of ['themes','candidate_keywords']){
    const v=raw[k];
    if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim()))e.push(`${k} must be a list of non-empty strings`);
  }
  if(!IDEA_STATUSES.includes(raw.status))e.push(`status must be one of ${IDEA_STATUSES.join(', ')}`);
  for(const k of ['audiences','formats','styles']){
    const v=raw[k];
    if(v!==null&&v!==undefined&&(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim()||x.length>60)))e.push(`${k} must be null or a list of non-empty strings (at most 60 characters each)`);
  }
  if(raw.delivery!==null&&raw.delivery!==undefined&&(!Array.isArray(raw.delivery)||raw.delivery.some(d=>!DELIVERY_METHODS.includes(d))))e.push(`delivery must be null or a list of: ${DELIVERY_METHODS.join(', ')}`);
  if(raw.item_count!==null&&raw.item_count!==undefined&&(!Number.isInteger(raw.item_count)||raw.item_count<1))e.push('item_count must be a whole number >= 1 or null');
  if(e.length)return {ok:false,errors:e,idea:null};
  return {ok:true,errors:[],idea:{...raw,product_id:raw.product_id??null,themes:[...new Set(raw.themes.map(t=>t.trim()))],
    candidate_keywords:[...new Set(raw.candidate_keywords.map(normaliseKeyword))],
    ...Object.fromEntries(OPTIONAL_FIELDS.map(k=>[k,raw[k]===undefined||raw[k]===null?null:Array.isArray(raw[k])?[...new Set(raw[k].map(x=>x.trim()))]:raw[k]]))}};
}
