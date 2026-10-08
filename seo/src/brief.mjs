// SEO brief (NEW_PRODUCT): the interface between research, the owner's
// approval and the Production Engine handoff.
//
//   createBriefDraft  evidence only (status draft)
//   scoreBrief        LumiumX opportunity scoring + positioning (status scored,
//                     or research_required when no EXACT/STRONG keyword qualifies)
//   submitForOwnerReview → recordOwnerDecision (approved | rejected)
//   createProductionHandoff  only from an approved brief; carries no scores
//
// Every score in a brief can be recomputed from the cited research version and
// the relevance profile stored in the brief; validateBrief does exactly that,
// so an edited or opaque score is rejected.
import { createHash } from 'node:crypto';
import { normaliseKeyword, matchKey } from './observations.mjs';
import { researchSha } from './research.mjs';
import { MODES } from './idea.mjs';
import { validateProfile, classifyKeyword } from './relevance.mjs';
import { scoreOpportunities } from './scoring.mjs';
import { positioning, titleDirection, tagCandidates, descriptionPlan, thumbnailIntent } from './positioning.mjs';

export const BRIEF_SCHEMA_VERSION=2;
export const APPROVAL_STATUSES=Object.freeze(['draft','research_required','scored','owner_review','approved','rejected']);
const TRANSITIONS=Object.freeze({draft:['scored','research_required'],research_required:[],scored:['owner_review'],owner_review:['approved','rejected'],approved:[],rejected:[]});
export const CONFIDENCE=Object.freeze(['unknown','low','medium','high']);
export const EVIDENCE_ROLES=Object.freeze(['owner_candidate','related_term','evaluated']);
export const OPPORTUNITY_SCORES_CONTRACT=Object.freeze({
  rule:'Every score lists its raw inputs (observation ids and values), each component and the formula, and must recompute exactly from the cited research and profile; no opaque or model-generated score is accepted.'});
const RAW=['keyword','searches_30d','search_results','conversion_label','trend_percent','captured_at'];
// Words too common to show a relation between an idea and a keyword: grammar and
// product-format words. "coloring" alone must not relate an autumn idea to Halloween keywords.
const STOP=new Set(['for','the','and','a','an','of','with','to','in','pages','page','printable','printables','digital','download','book','books','card','cards',
  'coloring','activity','activities','worksheet','worksheets','planner','sheet','sheets','set','bundle','pdf']);
const terms=s=>matchKey(s).split(/[^a-z0-9]+/).filter(t=>t.length>2&&!STOP.has(t));
const evidence=(o,role)=>({observation_id:o.observation_id,role,...Object.fromEntries(RAW.map(k=>[k,o[k]]))});
const canonical=v=>JSON.stringify(v);
/** Checksum of a brief as stored: the handoff's reference to exactly what the owner approved. */
export const briefSha=b=>createHash('sha256').update(canonical(b)).digest('hex');

/**
 * Evidence draft for an idea against one research version. Deterministic, no
 * model call, no ranking. Owner candidates come first (with a warning for
 * each one that has no observation); then observations sharing a distinctive
 * term with the idea, alphabetically, marked as related terms for the owner.
 */
export function createBriefDraft({idea,research,now=new Date()}){
  const warnings=[], market_evidence=[];
  for(const k of idea.candidate_keywords){
    const o=research.observations.find(x=>matchKey(x.keyword)===matchKey(k));
    if(o)market_evidence.push(evidence(o,'owner_candidate'));
    else warnings.push(`No Marketplace Insights observation for candidate keyword "${k}": not researched (values unknown, not zero).`);
  }
  const ideaTerms=new Set([idea.working_name,idea.product_type,idea.concept,idea.season??'',...idea.themes,...idea.candidate_keywords].flatMap(terms));
  for(const o of [...research.observations].sort((a,b)=>a.keyword.localeCompare(b.keyword))){
    if(market_evidence.some(x=>x.observation_id===o.observation_id))continue;
    if(terms(o.keyword).some(t=>ideaTerms.has(t)))market_evidence.push(evidence(o,'related_term'));
  }
  for(const m of research.missing_values??[])if(market_evidence.some(x=>x.keyword===m.keyword))warnings.push(`"${m.keyword}": ${m.fields.join(', ')} not captured.`);
  if(!market_evidence.length)warnings.push('No research observation relates to this idea yet; capture Marketplace Insights for its keywords first.');
  const at=now.toISOString();
  return {schema_version:BRIEF_SCHEMA_VERSION,mode:MODES.NEW_PRODUCT,created_at:at,
    idea:{product_id:idea.product_id,working_name:idea.working_name,product_type:idea.product_type},
    research_version:{research_id:research.research_id,version:research.version,sha256:researchSha(research)},
    relevance_profile:null,
    primary_keyword:null,secondary_keywords:[],supporting_keywords:[],rejected_keywords:[],
    market_evidence,opportunity_scores:{status:'not_scored',...OPPORTUNITY_SCORES_CONTRACT},
    positioning:null,title_direction:null,tag_candidates:[],description_keywords:null,thumbnail_search_intent:null,pricing_evidence:[],
    confidence:'unknown',research_required:false,warnings,approval_status:'draft',owner_decision:null,status_history:[{status:'draft',at}]};
}

const stripIndex=p=>{const {index,...raw}=p;return raw;};
function compute({idea,profile,research,context}){
  const result=scoreOpportunities({profile,research,extra_keywords:idea.candidate_keywords,context});
  const extras=idea.candidate_keywords.filter(k=>!research.observations.some(o=>matchKey(o.keyword)===matchKey(k)))
    .map(k=>({keyword:k,relevance_class:classifyKeyword(k,profile).relevance_class,source:'owner_candidate_unresearched'}));
  const facts=[idea.page_count?`${idea.page_count} pages`:null,idea.format];
  const tags=tagCandidates(result,extras);
  return {result,tags,
    positioning:positioning(result,idea.working_name),title_direction:titleDirection(result,facts),
    description_keywords:descriptionPlan(result,result.rejected_keywords.filter(x=>idea.candidate_keywords.includes(x.keyword)&&!x.reasons.includes('missing_market_evidence')).map(x=>x.keyword)),
    thumbnail_search_intent:thumbnailIntent(result)};
}

/**
 * Score an idea: LumiumX opportunity scores for every observation in the
 * research set (and the owner's unresearched candidates), then positioning.
 * Status becomes "scored", or "research_required" when no EXACT/STRONG
 * keyword qualifies (nothing weaker is promoted).
 */
export function scoreBrief({idea,profile,research,context={},now=new Date()}){
  if(profile?.describes?.mode!==MODES.NEW_PRODUCT)throw new Error('scoreBrief needs a NEW_PRODUCT relevance profile');
  const v=validateProfile(stripIndex(profile));if(!v.ok)throw new Error(`invalid relevance profile: ${v.errors.join('; ')}`);
  const draft=createBriefDraft({idea,research,now});
  const c=compute({idea,profile:v.profile,research,context});
  const {result}=c;
  const known=new Set(draft.market_evidence.map(x=>x.observation_id));
  for(const o of research.observations)if(!known.has(o.observation_id))draft.market_evidence.push(evidence(o,'evaluated'));
  const status=result.research_required?'research_required':'scored';
  const {scoring_version,disclaimer,formula,inputs,diagnostics,close_competition,close_competition_detail,confidence_triggers}=result;
  return {...draft,relevance_profile:stripIndex(v.profile),
    primary_keyword:result.primary_keyword,secondary_keywords:result.secondary_keywords,supporting_keywords:result.supporting_keywords,rejected_keywords:result.rejected_keywords,
    opportunity_scores:{status:'scored',...OPPORTUNITY_SCORES_CONTRACT,scoring_version,disclaimer,formula,inputs,diagnostics,close_competition,close_competition_detail,confidence_triggers},
    positioning:c.positioning,title_direction:c.title_direction,tag_candidates:c.tags.tags,description_keywords:c.description_keywords,thumbnail_search_intent:c.thumbnail_search_intent,
    confidence:result.confidence,research_required:result.research_required,
    warnings:[...draft.warnings,...result.warnings,...c.tags.warnings],
    approval_status:status,status_history:[...draft.status_history,{status,at:now.toISOString()}]};
}

function move(brief,to,now,extra={}){
  if(!(TRANSITIONS[brief.approval_status]??[]).includes(to))throw new Error(`brief cannot move from ${brief.approval_status} to ${to}`);
  return {...structuredClone(brief),...extra,approval_status:to,status_history:[...brief.status_history,{status:to,at:now.toISOString()}]};
}
/** scored → owner_review. A research_required brief cannot be reviewed: capture more research and score again. */
export const submitForOwnerReview=(brief,{now=new Date()}={})=>move(brief,'owner_review',now);
/** owner_review → approved | rejected, recorded with who decided and when. */
export function recordOwnerDecision(brief,{decision,decided_by,note=null,approved_positioning=null,now=new Date()}){
  if(!['approved','rejected'].includes(decision))throw new Error('decision must be approved or rejected');
  if(typeof decided_by!=='string'||!decided_by.trim())throw new Error('decided_by is required');
  if(decision==='approved'&&!brief.primary_keyword)throw new Error('an approved brief needs a primary keyword');
  return move(brief,decision,now,{owner_decision:{decision,decided_by,decided_at:now.toISOString(),note,
    approved_positioning:decision==='approved'?(approved_positioning??brief.positioning.statement):null}});
}

/**
 * Validate a brief against the research it cites. Guards against fabricated
 * statistics: every evidence row must be an observation of that exact
 * research version with identical raw values; chosen keywords must be backed
 * by evidence; a scored brief must recompute exactly from its research and
 * stored relevance profile.
 * @param idea  needed to recompute a scored brief (its candidate keywords)
 */
export function validateBrief(brief,research,idea=null){
  const e=[];
  if(brief?.schema_version!==BRIEF_SCHEMA_VERSION)e.push(`schema_version must be ${BRIEF_SCHEMA_VERSION}`);
  if(!Object.values(MODES).includes(brief?.mode))e.push('mode must be NEW_PRODUCT or EXISTING_LISTING');
  if(!APPROVAL_STATUSES.includes(brief?.approval_status))e.push(`approval_status must be one of ${APPROVAL_STATUSES.join(', ')}`);
  if(!CONFIDENCE.includes(brief?.confidence))e.push(`confidence must be one of ${CONFIDENCE.join(', ')}`);
  const rv=brief?.research_version;
  if(!rv||rv.research_id!==research.research_id||rv.version!==research.version||rv.sha256!==researchSha(research))e.push('research_version does not match the cited research set (id, version and checksum)');
  for(const [i,x] of (brief?.market_evidence??[]).entries()){
    const o=research.observations.find(y=>y.observation_id===x.observation_id);
    if(!o){e.push(`market_evidence[${i}] cites unknown observation ${x.observation_id}`);continue;}
    for(const k of RAW)if(x[k]!==o[k])e.push(`market_evidence[${i}].${k} is ${JSON.stringify(x[k])} but the observation says ${JSON.stringify(o[k])}`);
    if(!EVIDENCE_ROLES.includes(x.role))e.push(`market_evidence[${i}].role must be one of ${EVIDENCE_ROLES.join(', ')}`);
  }
  const backed=new Set((brief?.market_evidence??[]).map(x=>x.keyword));
  for(const k of [brief?.primary_keyword,...(brief?.secondary_keywords??[])].filter(Boolean))
    if(!backed.has(normaliseKeyword(k)))e.push(`"${k}" is chosen but has no market evidence`);
  const s=brief?.opportunity_scores;
  if(brief?.approval_status==='draft'){
    if(s?.status!=='not_scored'||'diagnostics' in (s??{}))e.push('opportunity_scores: a draft brief carries no scores');
    if(brief.primary_keyword)e.push('a draft brief has no keyword selection');
  }else if(s?.status!=='scored')e.push('opportunity_scores.status must be "scored" once a brief leaves draft');
  else if(!idea)e.push('the idea is required to recompute a scored brief');
  else{
    const v=validateProfile(brief.relevance_profile);
    if(!v.ok)e.push(`relevance_profile: ${v.errors.join('; ')}`);
    else{
      const c=compute({idea,profile:v.profile,research,context:s.inputs?.context??{}}), r=c.result;
      const same=(a,b)=>canonical(a)===canonical(b);
      if(!same(s.diagnostics,r.diagnostics)||!same(s.inputs,r.inputs)||!same(s.formula,r.formula))e.push('opportunity_scores do not recompute from the cited research and relevance profile');
      for(const k of ['primary_keyword','secondary_keywords','supporting_keywords','rejected_keywords','confidence','research_required'])if(!same(brief[k],r[k]))e.push(`${k} does not match the recomputed scoring`);
      if(!same(brief.tag_candidates,c.tags.tags))e.push('tag_candidates do not match the recomputed scoring');
      if((brief.approval_status==='research_required')!==r.research_required&&['scored','research_required'].includes(brief.approval_status))e.push('approval_status must be research_required exactly when no EXACT/STRONG primary exists');
    }
  }
  for(const [i,p] of (brief?.pricing_evidence??[]).entries())if(!p?.source)e.push(`pricing_evidence[${i}] has no source`);
  if(brief?.approval_status==='approved'){
    if(!brief.primary_keyword)e.push('an approved brief needs a primary keyword');
    if(brief.owner_decision?.decision!=='approved'||!brief.owner_decision?.decided_by)e.push('an approved brief needs the owner decision recorded');
  }
  return {ok:!e.length,errors:e};
}

export const HANDOFF_SCHEMA_VERSION=1;
/**
 * The ONLY bridge to the Production Engine: plain product facts and approved
 * search intents, no scores or scoring internals. It is a document; nothing
 * here runs production. Refused unless the brief is approved and valid.
 */
export function createProductionHandoff({brief,idea,research}){
  if(brief?.approval_status!=='approved')throw new Error(`production handoff refused: the SEO brief is "${brief?.approval_status}", and only an approved brief can be handed off`);
  const v=validateBrief(brief,research,idea);
  if(!v.ok)throw new Error(`production handoff refused: invalid brief: ${v.errors.join('; ')}`);
  if(brief.idea.working_name!==idea.working_name||brief.idea.product_type!==idea.product_type)throw new Error('production handoff refused: the idea does not match the approved brief');
  return {handoff_schema_version:HANDOFF_SCHEMA_VERSION,kind:'seo_production_handoff',
    product_id:idea.product_id,product_type:idea.product_type,approved_concept:idea.concept,audience:idea.audience,theme:[...idea.themes],
    format:idea.format,page_count:idea.page_count,
    primary_search_intent:brief.primary_keyword,secondary_search_intents:[...brief.secondary_keywords],
    approved_positioning:brief.owner_decision.approved_positioning,owner_notes:idea.owner_notes,
    seo_research_reference:{...brief.research_version},
    seo_brief_reference:{sha256:briefSha(brief),approved_by:brief.owner_decision.decided_by,approved_at:brief.owner_decision.decided_at}};
}
