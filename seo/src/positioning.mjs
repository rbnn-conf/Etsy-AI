// Listing direction from a scoring result: positioning, title direction, tag
// candidates, description keyword plan and thumbnail search intent.
// Deterministic templates over the selected keywords; no model writes copy.
// Rules: no keyword stuffing, no repeated phrases, no invented tags.
import { normaliseKeyword } from './observations.mjs';
import { signature } from './relevance.mjs';

// Etsy's current listing limits.
export const ETSY_LIMITS=Object.freeze({title_max:140,tags_max:13,tag_max:20});
const CLASS_ORDER={EXACT:0,STRONG:1,SUPPORTING:2};
const usable=r=>r.researched&&r.selected_role!=='REJECTED';

/** Statement + intents. Null when research is required (nothing is promoted). */
export function positioning(result,productName){
  if(!result.primary_keyword)return null;
  const sec=result.secondary_keywords;
  return {primary_search_intent:result.primary_keyword,secondary_search_intents:[...sec],
    supporting_terms:result.diagnostics.filter(r=>usable(r)&&r.selected_role==='SUPPORTING').map(r=>r.keyword),
    statement:`Position "${productName}" for buyers searching "${result.primary_keyword}"${sec.length?`, with ${sec.map(k=>`"${k}"`).join(', ')} as secondary search intent${sec.length>1?'s':''}`:''}.`};
}

/** How to lead the title: the strongest accurate intent first, each phrase once. */
export function titleDirection(result,facts=[]){
  if(!result.primary_keyword)return null;
  return {lead_with:result.primary_keyword,then_include:result.secondary_keywords.slice(0,2),product_facts:facts.filter(Boolean),
    rules:['Lead naturally with the lead phrase, written for a person, not a keyword list.','Use each phrase once; do not repeat keywords or near-identical variants.',
      `Stay within Etsy's ${ETSY_LIMITS.title_max} characters; drop a secondary phrase before truncating the lead.`]};
}

/**
 * Up to 13 tag candidates, in order: researched primary/secondary/supporting,
 * then unresearched but relevant phrases (current tags or owner candidates),
 * EXACT before STRONG before SUPPORTING. Etsy's 20-character limit applies;
 * phrases with the same words (any order/plural) are kept once. Never padded.
 * @param extra [{keyword, relevance_class, source}]
 */
export function tagCandidates(result,extra=[]){
  const tags=[], sigs=new Set(), skipped=[];
  const push=(keyword,meta)=>{
    const t=normaliseKeyword(keyword);
    if(t.length>ETSY_LIMITS.tag_max){skipped.push({keyword:t,reason:`longer than Etsy's ${ETSY_LIMITS.tag_max}-character tag limit (use it in the title or description)`});return;}
    const s=signature(t);if(sigs.has(s)){skipped.push({keyword:t,reason:'same words as an earlier tag candidate'});return;}
    sigs.add(s);tags.push({tag:t,...meta});
  };
  const roleOrder={PRIMARY:0,SECONDARY:1,SUPPORTING:2};
  for(const r of result.diagnostics.filter(usable).sort((a,b)=>roleOrder[a.selected_role]-roleOrder[b.selected_role]))
    push(r.keyword,{source:'researched',role:r.selected_role,relevance_class:r.relevance_class});
  for(const x of extra.filter(x=>x.relevance_class in CLASS_ORDER).map((x,i)=>({...x,i})).sort((a,b)=>CLASS_ORDER[a.relevance_class]-CLASS_ORDER[b.relevance_class]||a.i-b.i))
    push(x.keyword,{source:x.source,role:null,relevance_class:x.relevance_class});
  const out=tags.slice(0,ETSY_LIMITS.tags_max), warnings=[];
  if(out.length<ETSY_LIMITS.tags_max)warnings.push(`insufficient_valid_tag_candidates: ${out.length} legitimate tag candidate${out.length===1?'':'s'} (Etsy allows ${ETSY_LIMITS.tags_max}); none were invented to fill the gap. Capture more relevant Marketplace Insights phrases.`);
  return {tags:out,skipped,warnings};
}

/** Where each phrase belongs in the description. */
export function descriptionPlan(result,avoid=[]){
  if(!result.primary_keyword)return null;
  return {first_sentence:[result.primary_keyword],body:[...result.secondary_keywords],
    mention_naturally:result.diagnostics.filter(r=>usable(r)&&r.selected_role==='SUPPORTING').slice(0,3).map(r=>r.keyword),
    avoid:[...avoid],rule:'Write for the buyer; each phrase appears where it reads naturally, once.'};
}

/** What the first image must communicate at thumbnail size: the primary's theme, format and audience words. */
export function thumbnailIntent(result){
  const p=result.diagnostics.find(r=>r.selected_role==='PRIMARY');
  if(!p)return null;
  const of=(...f)=>p.relevance_words.filter(w=>f.includes(w.facet)).map(w=>w.word);
  return {search_intent:p.keyword,show_theme:of('central_themes'),show_product_as:of('formats','components'),show_audience:of('audiences'),
    rule:`A shopper searching "${p.keyword}" should recognise the product from the thumbnail alone.`};
}
