// Marketplace Insights library (ADR-036): an INDEX over observations already
// captured in research sessions. Not a second evidence system: it reads the
// sessions' write-once research versions and never stores numbers of its own.
// No averaging, no invented trends between captures.
import { createHash } from 'node:crypto';
import { normaliseQuery } from '../../../seo/src/index.mjs';

export const keywordKey=n=>createHash('sha256').update(n).digest('hex').slice(0,10);
const when=o=>o.observation.captured_at??null;

/**
 * Every captured observation across sessions, once per observation_id, with every place it appears
 * (session, product, research id and version). @returns [{observation, normalized, key, refs:[…]}]
 */
export async function buildLibrary(state){
  const r=await state.read(), byId=new Map();
  for(const s of Object.values(r.sessions)){
    let ws;try{ws=await state.open(s.id);}catch{continue;}
    for(const v of await ws.researchVersions()){
      for(const o of v.observations){
        const e=byId.get(o.observation_id)??{observation:o,normalized:normaliseQuery(o.keyword),key:keywordKey(normaliseQuery(o.keyword)),refs:[],first_recorded_at:v.recorded_at};
        if(!e.refs.some(x=>x.session_id===s.id&&x.version===v.version))e.refs.push({session_id:s.id,product_id:s.product_id,name:s.name,research_id:v.research_id,version:v.version,recorded_at:v.recorded_at});
        if(v.recorded_at<e.first_recorded_at)e.first_recorded_at=v.recorded_at;
        byId.set(o.observation_id,e);
      }
    }
  }
  return [...byId.values()];
}
/** Newest capture first; an unknown capture date sorts last, never guessed. */
const newestFirst=(a,b)=>(when(b)??'').localeCompare(when(a)??'')||(b.first_recorded_at??'').localeCompare(a.first_recorded_at??'');
export function librarySummary(lib){
  const dated=lib.map(when).filter(Boolean).sort();
  return {keywords:new Set(lib.map(e=>e.normalized)).size,observations:lib.length,latest:dated.at(-1)??null};
}
/** Observations of one keyword (normalised: case, spelling, plurals), oldest first. */
export function keywordHistory(lib,keyword){
  const n=normaliseQuery(keyword);
  return lib.filter(e=>e.normalized===n).sort((a,b)=>-newestFirst(a,b));
}
/** Keywords matching a search text: exact normalised match first, then contains. */
export function searchLibrary(lib,text){
  const n=normaliseQuery(text), groups=new Map();
  for(const e of lib)if(e.normalized===n||e.normalized.includes(n))groups.set(e.normalized,[...(groups.get(e.normalized)??[]),e]);
  return [...groups].sort((a,b)=>(b[0]===n)-(a[0]===n)||a[0].localeCompare(b[0])).map(([normalized,entries])=>({normalized,key:keywordKey(normalized),keyword:entries[0].observation.keyword,
    count:entries.length,latest:entries.map(when).filter(Boolean).sort().at(-1)??null}));
}
/** The newest captured observation of a keyword from ANOTHER session (the reuse candidate), or null. */
export function reusableObservation(lib,keyword,{excludeSession=null}={}){
  const n=normaliseQuery(keyword);
  return lib.filter(e=>e.normalized===n&&e.refs.some(x=>x.session_id!==excludeSession)).sort(newestFirst)[0]??null;
}
export const byKeywordKey=(lib,key)=>lib.find(e=>e.key===key)?.normalized??null;
