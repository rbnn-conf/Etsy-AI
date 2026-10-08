// Reading what the owner copies from Etsy Marketplace Insights (ADR-036).
//
// Etsy often displays ROUNDED values ("4.3k", "138.5k", "2.6M"). A rounded
// value is never presented as exact: the parse result says exact:false and
// keeps the displayed text, and the observation's provenance note records it.
// When the owner supplies Etsy's 30 daily search counts, their sum is the
// exact 30-day total (the convention used for the real 2026-09-29 captures).
// Related-term figures are DISCOVERY METADATA only (ADR-034), never evidence.
import { CONVERSION_LABELS, normaliseKeyword } from './observations.mjs';

export const CONVERSION_CHOICES=Object.freeze({very_high:'Very High',high:'High',typical:'Typical',low:'Low',very_low:'Very Low'});
export const DAILY_COUNT_DAYS=30;

/** "4345", "4,345", "4.3k", "2.6M" → {ok, value, exact, displayed} */
export function parseEtsyCount(input){
  const s=String(input??'').trim().replace(/[,\s]/g,'');
  const m=/^(\d+(?:\.\d+)?)([kKmM])?$/.exec(s);
  if(!m)return {ok:false,error:`"${String(input??'').trim()}" is not a number Etsy shows (examples: 4345, 4.3k, 2.6M)`};
  const n=Number(m[1]);
  if(!m[2]){
    if(!Number.isInteger(n))return {ok:false,error:'use a whole number, or Etsy\'s rounded form such as 4.3k'};
    return {ok:true,value:n,exact:true,displayed:m[1]};
  }
  const unit=m[2].toLowerCase()==='k'?1e3:1e6;
  return {ok:true,value:Math.round(n*unit),exact:false,displayed:`${m[1]}${m[2].toLowerCase()==='k'?'k':'M'}`};
}
/** "Very high", "very_high", "HIGH" → a conversion label, or null. */
export function parseConversionText(input){
  const k=String(input??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  return CONVERSION_LABELS.includes(k)?k:null;
}
/** "+3.2", "3.2%", "-1.5 %", "0" → {ok, value} */
export function parseTrend(input){
  const s=String(input??'').trim().replace(/\s+/g,'').replace(/%$/,'');
  if(!/^[+-]?\d+(\.\d+)?$/.test(s))return {ok:false,error:`"${String(input??'').trim()}" is not a trend percentage (examples: +3.2, -1.5, 0)`};
  return {ok:true,value:Number(s)};
}
/** Etsy's daily searches (exactly 30 whole numbers, any separators) → {ok, values, sum} */
export function parseDailyCounts(input){
  const parts=String(input??'').split(/[\s,;]+/).filter(Boolean);
  if(parts.length!==DAILY_COUNT_DAYS)return {ok:false,error:`expected ${DAILY_COUNT_DAYS} daily counts, got ${parts.length}`};
  if(parts.some(p=>!/^\d+$/.test(p)))return {ok:false,error:'daily counts must be whole numbers'};
  const values=parts.map(Number);
  return {ok:true,values,sum:values.reduce((a,b)=>a+b,0)};
}
/**
 * One related term per line: "term", or "term | searches | results | conversion"
 * (tabs also separate, as when copying Etsy's table). Figures may be rounded.
 * @returns {ok, terms:[{term, searches_30d, search_results, conversion_label}], rounded, errors}
 */
export function parseRelatedTerms(input){
  const terms=[], errors=[];let rounded=false;
  for(const [i,raw] of String(input??'').split(/\r?\n/).entries()){
    const line=raw.trim();if(!line)continue;
    const cells=line.split(/\s*[|\t]\s*/).map(c=>c.trim());
    const term=normaliseKeyword(cells[0]??'');
    if(!term||term.length>140){errors.push(`line ${i+1}: no search term`);continue;}
    const t={term,searches_30d:null,search_results:null,conversion_label:null};
    if(cells.length>1){
      for(const [k,cell] of [['searches_30d',cells[1]],['search_results',cells[2]]]){
        if(!cell)continue;const v=parseEtsyCount(cell);
        if(!v.ok){errors.push(`line ${i+1}: ${v.error}`);continue;}
        t[k]=v.value;if(!v.exact)rounded=true;
      }
      if(cells[3]){const c=parseConversionText(cells[3]);if(!c)errors.push(`line ${i+1}: "${cells[3]}" is not an Etsy conversion label`);else t.conversion_label=c;}
    }
    if(!terms.some(x=>x.term===term))terms.push(t);
  }
  return {ok:!errors.length,terms,rounded,errors};
}

/**
 * A raw observation row from an owner entry: {keyword, searches, results, conversion_label, trend,
 * related:{terms, rounded}}, where searches/results are parseEtsyCount results and searches may
 * carry daily:{sum}. Rounded figures are recorded as their expanded value AND noted as rounded.
 */
export function observationFromEntry(e,{captured_at,captured_by}){
  const exactSearches=e.daily?.sum??null;
  const notes=[];
  if(exactSearches!==null)notes.push(`searches_30d = exact sum of Etsy's ${DAILY_COUNT_DAYS} daily counts (headline shown as "${e.searches.displayed}")`);
  else if(!e.searches.exact)notes.push(`searches_30d: Etsy displayed the rounded value "${e.searches.displayed}"; the exact count is unknown`);
  if(!e.results.exact)notes.push(`search_results: Etsy displayed the rounded value "${e.results.displayed}"`);
  if(e.related?.terms?.length)notes.push(`${e.related.terms.length} related search term${e.related.terms.length===1?'':'s'} recorded as discovery metadata only (not evidence)${e.related.rounded?'; their figures are Etsy-rounded':''}`);
  const row={keyword:normaliseKeyword(e.keyword),searches_30d:exactSearches??e.searches.value,search_results:e.results.value,conversion_label:e.conversion_label,
    trend_percent:e.trend??null,captured_at,source:{type:'etsy_marketplace_insights',method:'manual',captured_by,note:notes.length?notes.join('. ')+'.':'Entered exactly as shown by Etsy.'}};
  if(e.related?.terms?.length)row.related_terms=e.related.terms.map(t=>({term:t.term,searches_30d:t.searches_30d,search_results:t.search_results,conversion_label:t.conversion_label}));
  return row;
}
