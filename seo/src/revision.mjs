// Proposed SEO revision for an EXISTING listing (ADR-036). Deterministic: no
// model, no cost, no Etsy call. It turns the owner-approved strategy (the
// Opportunity Engine result + the listing recommendation) into a readable
// proposal; the owner copies it to Etsy by hand.
//
// Title (no keyword stuffing; each word used once):
//   1. lead = the PRIMARY keyword;
//   2. the first secondary, then supporting, keyword may add ONE qualifier each (at most two):
//      extra words that are all AUDIENCE words → "… for <audience>";
//      extra words that are all ATTRIBUTE (style) words → prefixed ("Cozy …");
//      any other extra words (another theme or format) are not merged into the lead;
//   3. then verified product facts from the listing: page count (in front of the lead when it names pages) and formats;
//   4. Title Case, within Etsy's 140 characters (facts are dropped before the lead is cut).
// Tags: the recommendation's 13 tag candidates vs the current tags → keep / add / remove.
// Description: the proposed lead line first, then the owner's current, verified copy unchanged.
import { normaliseKeyword, matchKey } from './observations.mjs';
import { signature } from './relevance.mjs';
import { ETSY_LIMITS } from './positioning.mjs';

const SMALL=new Set(['for','and','of','the','a','an','with','to','in','on','&']);
const titleCase=s=>s.split(' ').map((w,i)=>i&&SMALL.has(w.toLowerCase())?w.toLowerCase():/^[a-z]/.test(w)?w[0].toUpperCase()+w.slice(1):w).join(' ');
const plural=w=>/s$/.test(w)?w:/[^aeiou]y$/.test(w)?w.slice(0,-1)+'ies':`${w}s`;
const fmt=f=>String(f).replace(/-/g,' ').replace(/\s+/g,' ').trim();
const facetWords=(row,facet)=>row.relevance_words.filter(w=>w.facet===facet).map(w=>w.word);

/** Title lead from the strategy: primary + at most two single-kind qualifiers from secondary/supporting. */
export function composeTitleLead(result){
  const rows=k=>result.diagnostics.find(r=>r.keyword===k);
  const primary=rows(result.primary_keyword);
  if(!primary)return null;
  const used=new Set(primary.relevance_words.map(w=>w.word)), usedTok=new Set(signature(primary.keyword).split(' '));
  let prefix=[], suffix=null;const applied=[];
  for(const k of [...result.secondary_keywords,...result.supporting_keywords]){
    if(applied.length>=2)break;
    const r=rows(k);if(!r)continue;
    const extra=r.relevance_words.filter(w=>!usedTok.has(signature(w.word)));
    if(!extra.length)continue;
    if(extra.every(w=>w.facet==='audiences')&&!suffix){suffix=`for ${extra.map(w=>plural(w.word)).join(' and ')}`;applied.push({keyword:k,as:'audience',words:extra.map(w=>w.word)});}
    else if(extra.every(w=>w.facet==='attributes')){prefix=[...prefix,...extra.map(w=>w.word)];applied.push({keyword:k,as:'attribute',words:extra.map(w=>w.word)});}
    else continue;
    extra.forEach(w=>{used.add(w.word);usedTok.add(signature(w.word));});
  }
  return {text:[...prefix,primary.keyword,...(suffix?[suffix]:[])].join(' '),applied};
}

/**
 * @param recommendation  listingRecommendationFromResult / createListingRecommendation output
 * @param description     the listing's current full description (may be null)
 * @returns proposal {title, tags, description, notes, generated_by, model_calls}
 */
export function proposeRevision({snapshot,description=null,recommendation,result}){
  if(!result.primary_keyword)return {available:false,reason:'research required: there is no EXACT/STRONG primary keyword to position the listing on',generated_by:'deterministic',model_calls:0};
  const lead=composeTitleLead(result), notes=[];
  // The page count reads as part of the lead when the lead already names pages ("20 Fall Coloring Pages"), never as a repeated "Pages".
  const countInLead=!!snapshot.page_count&&/\bpages?\b/i.test(lead.text);
  const facts=[...(snapshot.page_count&&!countInLead?[`${snapshot.page_count} Pages`]:[]),...(snapshot.formats?.length?[snapshot.formats.map(fmt).join(' & ')]:[])];
  let parts=[`${countInLead?`${snapshot.page_count} `:''}${titleCase(lead.text)}`,...facts];
  while(parts.length>1&&parts.join(' | ').length>ETSY_LIMITS.title_max)parts=parts.slice(0,-1);
  let title=parts.join(' | ');
  if(title.length>ETSY_LIMITS.title_max)title=title.slice(0,ETSY_LIMITS.title_max).replace(/\s+\S*$/,'');

  const current=(snapshot.tags??[]).map(normaliseKeyword), sig=new Set(current.map(signature));
  const cand=recommendation.tag_candidates.map(t=>t.tag), candSig=new Set(cand.map(signature));
  const review=new Map((recommendation.tag_review??[]).map(t=>[normaliseKeyword(t.tag),t]));
  const tags={keep:cand.filter(t=>sig.has(signature(t))),add:cand.filter(t=>!sig.has(signature(t))),
    remove:current.filter(t=>!candSig.has(signature(t))).map(t=>({tag:t,reason:review.get(t)?.action==='deemphasise'?review.get(t).reason:`not among the ${cand.length} strongest relevant tag candidates`})),
    final:cand};
  if(!snapshot.tags)notes.push('The current tags are not recorded locally, so every proposed tag is shown as new.');
  const skipped=(recommendation.tag_candidates_skipped??[]).filter(s=>/character/.test(s.reason)).map(s=>s.keyword);
  if(skipped.length)notes.push(`Too long for an Etsy tag (${ETSY_LIMITS.tag_max} characters), so used in the title/description only: ${skipped.join(', ')}.`);
  if(cand.length<ETSY_LIMITS.tags_max)notes.push(`Only ${cand.length} legitimate tag candidates: none were invented to reach ${ETSY_LIMITS.tags_max}.`);

  // Audience or style words the strategy adds must be true of the product: the owner confirms them.
  const listingText=matchKey([snapshot.title,snapshot.description_excerpt??'',description??'',...(snapshot.tags??[])].join(' '));
  for(const a of lead.applied){
    const missing=a.words.filter(w=>!new RegExp(`\\b${matchKey(w).replace(/s$/,'')}`).test(listingText));
    if(missing.length)notes.push(`"${missing.join(' ')}" comes from the approved research ("${a.keyword}"), not from the current listing: confirm it is true of this product before using it.`);
  }
  const leadSentence=`${titleCase(lead.text).replace(/^./,c=>c.toUpperCase())}.`;
  const body=(description??'').trim();
  if(!body)notes.push('No current description is recorded locally: only the proposed opening line is shown.');
  notes.push('Nothing is changed on Etsy. Copy the parts you approve into the Etsy listing editor yourself.');
  return {available:true,
    title:{current:snapshot.title,proposed:title,length:title.length,lead:lead.text,qualifiers:lead.applied},
    tags,
    description:{lead_sentence:leadSentence,proposed:body?`${leadSentence}\n\n${body}`:leadSentence,unchanged_body:!!body,
      keyword_plan:recommendation.description_keyword_plan},
    strategy:{primary:result.primary_keyword,secondary:result.secondary_keywords,supporting:result.supporting_keywords},
    notes,generated_by:'deterministic',model_calls:0};
}
