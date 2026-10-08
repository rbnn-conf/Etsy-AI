// Etsy Marketplace Insights observations: RAW, manually captured numbers.
//
// v1 has no data source other than the owner typing in what Etsy's
// Marketplace Insights showed. Nothing is scraped, estimated or filled in:
// a value that was not captured stays null. Observations never carry a
// calculated score; scores (a later version) live elsewhere and point back
// to the observation they were calculated from.
import { createHash } from 'node:crypto';

export const CONVERSION_LABELS=Object.freeze(['very_high','high','typical','low','very_low','unknown']);
export const SOURCE_TYPES=Object.freeze(['etsy_marketplace_insights']);
export const CAPTURE_METHODS=Object.freeze(['manual']);
const FIELDS=['keyword','searches_30d','search_results','conversion_label','trend_percent','captured_at','source','related_terms'];
const RELATED_FIELDS=['term','searches_30d','search_results','conversion_label'];
// A related term is a phrase Etsy DISPLAYED beside a search (ADR-033). Appearing there makes it
// DISCOVERED, not researched: it is never an observation and never scored. Its metrics are kept
// only if the owner actually captured them; absent metrics are null, never guessed.
function relatedTerms(v,errors){
  if(!Array.isArray(v)){errors.push('related_terms must be a list of {term, searches_30d?, search_results?, conversion_label?}');return null;}
  const out=[], seen=new Set();
  v.forEach((t,i)=>{
    if(!t||typeof t!=='object'||typeof t.term!=='string'||!normaliseKeyword(t.term)){errors.push(`related_terms[${i}].term is required`);return;}
    for(const k of Object.keys(t))if(!RELATED_FIELDS.includes(k))errors.push(`related_terms[${i}]: unexpected field "${k}"`);
    for(const k of ['searches_30d','search_results'])if(t[k]!==undefined&&t[k]!==null&&(!Number.isInteger(t[k])||t[k]<0))errors.push(`related_terms[${i}].${k} must be a whole number >= 0 or null`);
    if(t.conversion_label!==undefined&&t.conversion_label!==null&&!CONVERSION_LABELS.includes(t.conversion_label))errors.push(`related_terms[${i}].conversion_label must be one of ${CONVERSION_LABELS.join(', ')}`);
    const term=normaliseKeyword(t.term);if(seen.has(matchKey(term)))return;seen.add(matchKey(term));
    out.push({term,searches_30d:t.searches_30d??null,search_results:t.search_results??null,conversion_label:t.conversion_label??null});
  });
  return out;
}
const SOURCE_FIELDS=['type','method','captured_by','note'];

/** Lowercase, trimmed, single-spaced (the keyword as typed is otherwise kept, including its spelling). */
export const normaliseKeyword=k=>String(k).normalize('NFC').toLowerCase().trim().replace(/\s+/g,' ');
/** Matching key only (never stored as the keyword): British and US spellings compare equal. */
export const matchKey=k=>normaliseKeyword(k).replace(/colour/g,'color').replace(/favourite/g,'favorite');
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(v)&&!Number.isNaN(Date.parse(v));
const count=(v,name,e)=>{if(v===null)return;if(!Number.isInteger(v)||v<0)e.push(`${name} must be a whole number >= 0 or null (got ${JSON.stringify(v)})`);};

/**
 * Validate one raw observation. Strict: no coercion ("4.8k" or "4800" as text
 * is rejected), no unknown fields (a score cannot sneak into raw data).
 * @returns {ok, errors, missing, observation}  observation is normalised and has an observation_id
 */
export function validateObservation(raw){
  const errors=[], missing=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,errors:['observation must be an object'],missing,observation:null};
  for(const k of Object.keys(raw))if(!FIELDS.includes(k))errors.push(`unexpected field "${k}" (raw observations hold only captured values; scores are stored separately)`);
  if(typeof raw.keyword!=='string'||!normaliseKeyword(raw.keyword))errors.push('keyword is required');
  else if(normaliseKeyword(raw.keyword).length>140)errors.push('keyword is longer than 140 characters');
  for(const k of ['searches_30d','search_results','trend_percent','captured_at'])if(!(k in raw))errors.push(`${k} is required (use null when it was not captured)`);
  count(raw.searches_30d,'searches_30d',errors);count(raw.search_results,'search_results',errors);
  if(raw.trend_percent!==null&&raw.trend_percent!==undefined&&(typeof raw.trend_percent!=='number'||!Number.isFinite(raw.trend_percent)))errors.push(`trend_percent must be a number or null (got ${JSON.stringify(raw.trend_percent)})`);
  if(raw.captured_at!==null&&raw.captured_at!==undefined&&!isDate(raw.captured_at))errors.push(`captured_at must be an ISO date or null (got ${JSON.stringify(raw.captured_at)})`);
  let label=raw.conversion_label;
  if(label===undefined||label===null){label='unknown';missing.push('conversion_label');}
  else if(!CONVERSION_LABELS.includes(label))errors.push(`conversion_label must be one of ${CONVERSION_LABELS.join(', ')} (got ${JSON.stringify(label)})`);
  const s=raw.source;
  if(!s||typeof s!=='object')errors.push('source is required');
  else{
    for(const k of Object.keys(s))if(!SOURCE_FIELDS.includes(k))errors.push(`source: unexpected field "${k}"`);
    if(!SOURCE_TYPES.includes(s.type))errors.push(`source.type must be one of ${SOURCE_TYPES.join(', ')}`);
    if(!CAPTURE_METHODS.includes(s.method))errors.push(`source.method must be one of ${CAPTURE_METHODS.join(', ')} (v1 has no automated source)`);
    if(typeof s.captured_by!=='string'||!s.captured_by.trim())errors.push('source.captured_by is required');
  }
  for(const k of ['searches_30d','search_results','trend_percent','captured_at'])if(raw[k]===null)missing.push(k);
  const related=raw.related_terms===undefined?undefined:relatedTerms(raw.related_terms,errors);
  if(errors.length)return {ok:false,errors,missing,observation:null};
  const observation={keyword:normaliseKeyword(raw.keyword),searches_30d:raw.searches_30d,search_results:raw.search_results,conversion_label:label,
    trend_percent:raw.trend_percent,captured_at:raw.captured_at,source:{type:s.type,method:s.method,captured_by:s.captured_by,note:s.note??null},
    ...(related?.length?{related_terms:related}:{})};
  return {ok:true,errors,missing,observation:{observation_id:observationId(observation),...observation}};
}
/** Content-addressed id: the same captured values always give the same id. */
export const observationId=o=>`obs-${createHash('sha256').update(JSON.stringify([o.keyword,o.searches_30d,o.search_results,o.conversion_label,o.trend_percent,o.captured_at,o.source.type,o.source.method,
  ...(o.related_terms?.length?[o.related_terms]:[])])).digest('hex').slice(0,16)}`;

/**
 * Ingest a manual research batch. Every row is either accepted exactly as
 * captured or rejected with its reasons; nothing is repaired or guessed.
 * A keyword appearing twice in one batch is rejected (which value is right?).
 * @returns {accepted:[observation], rejected:[{index, keyword, errors}], missing:[{keyword, fields}]}
 */
export function ingestObservations(rows){
  if(!Array.isArray(rows))throw new TypeError('observations must be an array');
  const accepted=[], rejected=[], missing=[], seen=new Map();
  rows.forEach((raw,index)=>{
    const r=validateObservation(raw);
    if(!r.ok){rejected.push({index,keyword:typeof raw?.keyword==='string'?raw.keyword:null,errors:r.errors});return;}
    if(seen.has(r.observation.keyword)){rejected.push({index,keyword:r.observation.keyword,errors:[`duplicate keyword in this batch (also row ${seen.get(r.observation.keyword)})`]});return;}
    seen.set(r.observation.keyword,index);accepted.push(r.observation);
    if(r.missing.length)missing.push({keyword:r.observation.keyword,fields:r.missing});
  });
  // A duplicate rejects BOTH rows: keep neither value.
  const dup=new Set(rejected.filter(x=>/duplicate keyword/.test(x.errors[0])).map(x=>x.keyword));
  const kept=accepted.filter(o=>!dup.has(o.keyword));
  for(const o of accepted.filter(o=>dup.has(o.keyword)))rejected.push({index:seen.get(o.keyword),keyword:o.keyword,errors:['duplicate keyword in this batch']});
  return {accepted:kept,rejected:rejected.sort((a,b)=>a.index-b.index),missing:missing.filter(m=>!dup.has(m.keyword))};
}
