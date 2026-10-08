// EXISTING_LISTING mode: a read-only snapshot of a product's current SEO and
// a comparison against captured market data. It NEVER regenerates or edits
// the product, its files or the Etsy listing: the output is a proposal for
// the owner (createListingRecommendation), never an edit.
import { normaliseKeyword, matchKey } from './observations.mjs';
import { researchSha } from './research.mjs';
import { MODES } from './idea.mjs';
import { ETSY_LIMITS, positioning, titleDirection, tagCandidates, descriptionPlan, thumbnailIntent } from './positioning.mjs';
import { validateProfile, classifyKeyword, signature, words } from './relevance.mjs';
import { scoreOpportunities } from './scoring.mjs';

export const SNAPSHOT_SCHEMA_VERSION=1;
const FIELDS=['schema_version','mode','snapshot_id','listing','title','tags','description_excerpt','product_type','page_count','formats','price','category','performance','source','captured_at','notes'];
export { ETSY_LIMITS };

/** @returns {ok, errors, warnings} */
export function validateSnapshot(s){
  const e=[], w=[];
  if(!s||typeof s!=='object')return {ok:false,errors:['snapshot must be an object'],warnings:w};
  for(const k of Object.keys(s))if(!FIELDS.includes(k))e.push(`unexpected field "${k}"`);
  for(const k of FIELDS)if(!(k in s))e.push(`${k} is required (use null when unknown)`);
  if(s.schema_version!==SNAPSHOT_SCHEMA_VERSION)e.push('schema_version must be 1');
  if(s.mode!==MODES.EXISTING_LISTING)e.push('mode must be EXISTING_LISTING');
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(s.snapshot_id??''))e.push('snapshot_id must be a lowercase slug');
  const l=s.listing;
  if(!l||typeof l!=='object')e.push('listing reference is required');
  else{
    if(l.repo_product!==null&&!/^\d{3}-[a-z0-9-]+$/.test(l.repo_product??''))e.push('listing.repo_product must be a products/ folder name or null');
    if(l.etsy_listing_id!==null&&!/^\d{6,15}$/.test(String(l.etsy_listing_id)))e.push('listing.etsy_listing_id must be digits or null');
    if(l.live_state_read!==false)e.push('listing.live_state_read must be false: v1 never reads or writes live Etsy listings');
  }
  if(typeof s.title!=='string'||!s.title.trim())e.push('title is required');
  else if(s.title.length>ETSY_LIMITS.title_max)w.push(`title is ${s.title.length} characters (Etsy allows ${ETSY_LIMITS.title_max})`);
  if(s.tags!==null){
    if(!Array.isArray(s.tags)||s.tags.some(t=>typeof t!=='string'))e.push('tags must be a list of strings, or null when not recorded');
    else{if(s.tags.length>ETSY_LIMITS.tags_max)w.push(`${s.tags.length} tags (Etsy allows ${ETSY_LIMITS.tags_max})`);
      for(const t of s.tags)if(t.length>ETSY_LIMITS.tag_max)w.push(`tag "${t}" is over ${ETSY_LIMITS.tag_max} characters`);}
  }else w.push('tags were not recorded for this listing');
  if(s.page_count!==null&&(!Number.isInteger(s.page_count)||s.page_count<1))e.push('page_count must be a whole number or null');
  if(s.price!==null&&(typeof s.price?.amount!=='number'||!/^[A-Z]{3}$/.test(s.price?.currency??'')))e.push('price must be {amount, currency} or null');
  const perf=s.performance;
  if(!perf||typeof perf!=='object')e.push('performance is required (all null when not captured)');
  else for(const [k,v] of Object.entries(perf))if(v!==null&&(!Number.isInteger(v)||v<0))e.push(`performance.${k} must be a whole number or null`);
  if(!s.source?.file||!/^[0-9a-f]{64}$/.test(s.source?.sha256??''))e.push('source.file and source.sha256 (where the snapshot values came from) are required');
  return {ok:!e.length,errors:e,warnings:w};
}

/**
 * Market comparison for an existing listing: each current tag (and each
 * researched keyword appearing in the title) with its raw observation, or
 * "not researched". No score, no rewrite, no product action.
 */
export function createListingReview({snapshot,research,now=new Date()}){
  const v=validateSnapshot(snapshot);
  if(!v.ok)throw new Error(`invalid listing snapshot: ${v.errors.join('; ')}`);
  const find=k=>research.observations.find(o=>matchKey(o.keyword)===matchKey(k))??null;
  const raw=o=>o&&{observation_id:o.observation_id,searches_30d:o.searches_30d,search_results:o.search_results,conversion_label:o.conversion_label,trend_percent:o.trend_percent,captured_at:o.captured_at};
  const tags=(snapshot.tags??[]).map(t=>({tag:t,observation:raw(find(t))}));
  const title=matchKey(snapshot.title);
  const inTitle=research.observations.filter(o=>title.includes(matchKey(o.keyword))).map(o=>({keyword:o.keyword,observation:raw(o)}));
  const warnings=[...v.warnings];
  const unresearched=tags.filter(t=>!t.observation).map(t=>t.tag);
  if(unresearched.length)warnings.push(`${unresearched.length} of ${tags.length} tags have no Marketplace Insights observation: ${unresearched.join(', ')}.`);
  warnings.push('This is the raw comparison only; createListingRecommendation proposes positioning. Nothing is changed on the product or on Etsy.');
  return {schema_version:1,mode:MODES.EXISTING_LISTING,created_at:now.toISOString(),snapshot_id:snapshot.snapshot_id,
    research_version:{research_id:research.research_id,version:research.version,sha256:researchSha(research)},
    current:{title:snapshot.title,tags:snapshot.tags,page_count:snapshot.page_count,price:snapshot.price},
    market_comparison:{tags,title_keywords:inTitle},
    proposed_revision:null,product_action:'none',etsy_action:'none',warnings,approval_status:'draft'};
}

/** The text a listing title leads with: everything before the first separator ("," "|" " — " " – " " - "). */
export const titleLead=title=>title.split(/\s*[,|]\s*|\s+[—–-]\s+/)[0].trim();

/**
 * EXISTING_LISTING recommendation: current positioning vs the LumiumX
 * opportunity analysis for this product. A PROPOSAL for the owner only:
 * product_action and etsy_action are always "none"; the product is never
 * regenerated and Etsy is never read or written.
 */
export function createListingRecommendation({snapshot,profile,research,context={},now=new Date()}){
  const sv=validateSnapshot(snapshot);
  if(!sv.ok)throw new Error(`invalid listing snapshot: ${sv.errors.join('; ')}`);
  const {index,...rawProfile}=profile??{};
  const pv=validateProfile(rawProfile);
  if(!pv.ok)throw new Error(`invalid relevance profile: ${pv.errors.join('; ')}`);
  const p=pv.profile;
  if(p.describes.mode!==MODES.EXISTING_LISTING||!p.describes.ref.includes(snapshot.snapshot_id))throw new Error(`relevance profile ${p.profile_id} does not describe listing ${snapshot.snapshot_id}`);
  const result=scoreOpportunities({profile:p,research,context});
  return listingRecommendationFromResult({snapshot,profile:p,result,now});
}

/**
 * The same recommendation from an opportunity result that was already computed (for example from a
 * research evidence package, ADR-034/036). `profile` classifies the listing's current tags; it is the
 * profile the result was scored with. Proposal only: product_action and etsy_action are "none".
 */
export function listingRecommendationFromResult({snapshot,profile,result,now=new Date()}){
  const sv=validateSnapshot(snapshot);
  if(!sv.ok)throw new Error(`invalid listing snapshot: ${sv.errors.join('; ')}`);
  const {index,...rawProfile}=profile??{};
  const pv=validateProfile(rawProfile);
  if(!pv.ok)throw new Error(`invalid relevance profile: ${pv.errors.join('; ')}`);
  const p=pv.profile;
  const row=k=>result.diagnostics.find(r=>matchKey(r.keyword)===matchKey(k))??null;

  // Current positioning: the title lead, and the researched keyword it contains (most words, then best score).
  const lead=titleLead(snapshot.title), leadTokens=new Set(words(lead).map(w=>w.token));
  const inLead=result.diagnostics.filter(r=>signature(r.keyword).split(' ').every(t=>leadTokens.has(t)))
    .sort((a,b)=>signature(b.keyword).split(' ').length-signature(a.keyword).split(' ').length||(b.final_opportunity_score??-1)-(a.final_opportunity_score??-1));
  const current=inLead[0]??null;

  const tags=(snapshot.tags??[]).map(t=>{
    const r=row(t), c=classifyKeyword(t,p);
    const deemph=r?(r.selected_role==='REJECTED'||(r.conversion_label==='very_low'&&r.selected_role!=='PRIMARY')):['WEAK','IRRELEVANT'].includes(c.relevance_class);
    return {tag:t,researched:!!r,relevance_class:c.relevance_class,role:r?.selected_role??null,final_opportunity_score:r?.final_opportunity_score??null,
      action:deemph?'deemphasise':'retain',reason:r?r.decision_reasons[0]:`not researched; ${c.relevance_class}: ${c.reason}`};
  });
  const currentSigs=new Set([...(snapshot.tags??[]).map(signature)]);
  const chosen=[result.primary_keyword,...result.secondary_keywords,...result.diagnostics.filter(r=>r.researched&&r.selected_role==='SUPPORTING').map(r=>r.keyword)].filter(Boolean);
  const terms_to_add=chosen.filter(k=>!currentSigs.has(signature(k))).map(k=>({keyword:k,role:row(k).selected_role,fits_tag:k.length<=ETSY_LIMITS.tag_max}));
  const deemph=tags.filter(t=>t.action==='deemphasise').map(t=>t.tag);
  const extras=tags.filter(t=>!t.researched).map(t=>({keyword:t.tag,relevance_class:t.relevance_class,source:'current_tag_unresearched'}));
  const tc=tagCandidates(result,extras);
  const facts=[snapshot.page_count?`${snapshot.page_count} pages`:null,...(snapshot.formats??[])];
  const changed=!!result.primary_keyword&&(!current||matchKey(current.keyword)!==matchKey(result.primary_keyword));
  const reasoning=[];
  if(!result.primary_keyword)reasoning.push('No EXACT/STRONG keyword with complete evidence: research required before recommending a primary intent.');
  else{
    const pr=row(result.primary_keyword);
    reasoning.push(`Recommended primary "${pr.keyword}": ${pr.decision_reasons.join('; ')}.`);
    if(current&&changed)reasoning.push(`The title currently leads with "${lead}", which matches "${current.keyword}" (${current.relevance_class}, ${current.final_opportunity_score===null?'not scored':current.final_opportunity_score.toFixed(1)}, ${current.selected_role}): ${current.decision_reasons.slice(-1)[0]}.`);
    else if(!current)reasoning.push(`The title leads with "${lead}", which contains no researched keyword, so its current intent cannot be compared with market data.`);
    else reasoning.push('The title already leads with the recommended intent.');
  }
  const pricing=snapshot.price?[{amount:snapshot.price.amount,currency:snapshot.price.currency,kind:'current_listing_price',source:`listing snapshot ${snapshot.snapshot_id} (${snapshot.source.file})`}]:[];
  const warnings=[...sv.warnings,...result.warnings,...tc.warnings,'No competitor or market pricing has been captured; pricing evidence is this listing\'s own price only.'];
  return {schema_version:1,mode:MODES.EXISTING_LISTING,created_at:now.toISOString(),snapshot_id:snapshot.snapshot_id,
    research_version:result.inputs.research,relevance_profile:rawProfile,
    current_primary_intent:{title_lead:lead,matched_keyword:current?.keyword??null,relevance_class:current?.relevance_class??null,
      final_opportunity_score:current?.final_opportunity_score??null,role:current?.selected_role??null},
    recommended_primary_intent:result.primary_keyword,
    primary_keyword_change:{from:current?.keyword??null,to:result.primary_keyword,changed},
    retained_terms:tags.filter(t=>t.action==='retain').map(t=>t.tag),terms_to_add,terms_to_deemphasise:deemph,tag_review:tags,
    reasoning,positioning:positioning(result,snapshot.title),title_direction:titleDirection(result,facts),
    tag_candidates:tc.tags,tag_candidates_skipped:tc.skipped,description_keyword_plan:descriptionPlan(result,deemph),
    pricing_evidence:pricing,thumbnail_marketing_search_intent:thumbnailIntent(result),
    opportunity:result,confidence:result.confidence,close_competition:result.close_competition,research_required:result.research_required,
    product_action:'none',etsy_action:'none',warnings,approval_status:result.research_required?'research_required':'scored'};
}
export { normaliseKeyword };
