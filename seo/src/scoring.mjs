// LUMIUMX INTERNAL OPPORTUNITY SCORE (ADR-032). THIS IS NOT THE ETSY ALGORITHM.
//
// A decision-support number for choosing search positioning FOR THE OWNER'S
// PRODUCT from manually captured Marketplace Insights. It is not an Etsy
// ranking probability, a sales or conversion prediction, a likelihood of
// ranking, guaranteed demand or an "Etsy SEO score".
//
// Every score is shown beside the raw observation it came from, with each
// component and its weighted contribution, so a person can see why one
// keyword beat another without reading this file.
import { matchKey, normaliseKeyword } from './observations.mjs';
import { researchSha } from './research.mjs';
import { classifyKeyword, signature, profileSha } from './relevance.mjs';

export const SCORING_VERSION='lumiumx-opportunity-v1';
export const DEMAND_REFERENCE=10000;           // searches_30d at which demand reaches 100
export const COMPETITION_REFERENCE=1000000;    // search_results at (and above) which competition reaches 0
export const WEIGHTS=Object.freeze({demand:0.20,competition:0.15,conversion:0.30,relevance:0.25,trend:0.05,seasonality:0.05});
export const RELEVANCE_VALUES=Object.freeze({EXACT:100,STRONG:85,SUPPORTING:65,WEAK:30,IRRELEVANT:0});
// LumiumX modelling values for Etsy's conversion labels. NOT Etsy's weights.
export const CONVERSION_VALUES=Object.freeze({very_high:100,high:80,typical:60,low:30,very_low:10,unknown:40});
export const SEASONALITY_VALUES=Object.freeze({peak:100,in_season:85,approaching:70,evergreen:70,off_season:35,unknown:50});
export const NEUTRAL=50;                       // trend or seasonality not supplied
export const CLOSE_COMPETITION_POINTS=5.0;
export const MAX_SECONDARY=4;
export const ROLES=Object.freeze(['PRIMARY','SECONDARY','SUPPORTING','REJECTED']);
export const REJECTION_REASONS=Object.freeze(['irrelevant','weak_relevance','very_low_conversion','insufficient_demand','poor_competitive_opportunity',
  'missing_market_evidence','superseded','duplicate_intent']);
export const DISCLAIMER='LumiumX internal opportunity score: a decision-support metric for choosing positioning from the supplied evidence. It is NOT the Etsy algorithm and does not predict ranking, sales, conversion or demand.';

const clamp=(x,lo=0,hi=100)=>Math.min(hi,Math.max(lo,x));
const count=(v,name)=>{if(!Number.isInteger(v)||v<0)throw new RangeError(`${name} must be a whole number >= 0 (got ${v})`);};
const RANK=Object.fromEntries(['IRRELEVANT','WEAK','SUPPORTING','STRONG','EXACT'].map((c,i)=>[c,i]));
export const round1=x=>x===null?null:Math.round(x*10)/10;

/** 100·log10(1+s)/log10(1+DEMAND_REFERENCE), clamped. null when not captured (never treated as 0). */
export function demandScore(searches){
  if(searches===null||searches===undefined)return null;count(searches,'searches_30d');
  return clamp(100*Math.log10(1+searches)/Math.log10(1+DEMAND_REFERENCE));
}
/** 100·(1 − log10(1+min(r,REF))/log10(1+REF)), clamped: fewer results → higher. null when not captured. */
export function competitionScore(results){
  if(results===null||results===undefined)return null;count(results,'search_results');
  return clamp(100*(1-Math.log10(1+Math.min(results,COMPETITION_REFERENCE))/Math.log10(1+COMPETITION_REFERENCE)));
}
export function conversionScore(label){
  if(!(label in CONVERSION_VALUES))throw new RangeError(`unknown conversion label ${JSON.stringify(label)}`);
  return CONVERSION_VALUES[label];
}
/** clamp(50 + trend_percent). Missing → 50 and trend_missing (affects confidence, not the score). */
export function trendScore(trend){
  if(trend===null||trend===undefined)return {score:NEUTRAL,missing:true};
  if(!Number.isFinite(trend))throw new RangeError('trend_percent must be finite');
  return {score:clamp(NEUTRAL+trend),missing:false};
}
/** Supplied explicitly by the product/research context; never read from the clock. */
export function seasonalityScore(s){
  if(s===null||s===undefined)return {score:NEUTRAL,missing:true};
  if(!(s in SEASONALITY_VALUES))throw new RangeError(`unknown seasonality ${JSON.stringify(s)}`);
  return {score:SEASONALITY_VALUES[s],missing:false};
}
export const relevanceScore=cls=>RELEVANCE_VALUES[cls];
/** Weighted sum of the six 0–100 components, clamped to [0,100]. */
export function finalScore(c){
  return clamp(Object.entries(WEIGHTS).reduce((sum,[k,w])=>sum+c[k]*w,0));
}

const cmp=(a,b)=>(b.rounded-a.rounded)||(RANK[b.relevance_class]-RANK[a.relevance_class])||(b.conversion_score-a.conversion_score)
  ||(b.demand_score-a.demand_score)||(b.competition_score-a.competition_score)||(a.keyword<b.keyword?-1:a.keyword>b.keyword?1:0);
const f1=x=>x===null?'n/a':x.toFixed(1);
const signed=x=>`${x>=0?'+':'−'}${Math.abs(x).toFixed(1)}`;

/** Weighted-contribution differences of row against ref, largest first: the "why" of a comparison. */
export function explainDifference(row,ref){
  const parts=Object.keys(WEIGHTS).map(k=>({component:k,row:row.components[k],ref:ref.components[k],weighted_difference:(row.components[k]-ref.components[k])*WEIGHTS[k]}))
    .filter(p=>Math.abs(p.weighted_difference)>=0.05).sort((a,b)=>Math.abs(b.weighted_difference)-Math.abs(a.weighted_difference));
  return {against:ref.keyword,score_difference:row.final_opportunity_score-ref.final_opportunity_score,parts};
}
const describeDiff=d=>d.parts.map(p=>`${p.component} ${f1(p.row)} vs ${f1(p.ref)} (${signed(p.weighted_difference)})`).join(', ');

/**
 * Score every observation in the research set (plus any extra keywords, e.g.
 * the owner's unresearched candidates) against one product profile.
 * Deterministic: same inputs, same output. No network, no model, no clock.
 * @param context {research_stale?:boolean, evidence_conflicts?:string[]}
 */
export function scoreOpportunities({profile,research,extra_keywords=[],context={}}){
  const ctx={research_stale:context.research_stale===true,evidence_conflicts:[...(context.evidence_conflicts??[])]};
  const season=seasonalityScore(profile.seasonality);
  const seen=new Set(), rows=[];
  const add=(keyword,o)=>{
    const k=normaliseKeyword(keyword);if(seen.has(matchKey(k)))return;seen.add(matchKey(k));
    const rel=classifyKeyword(k,profile), trend=trendScore(o?.trend_percent??null);
    const d=demandScore(o?.searches_30d??null), c=competitionScore(o?.search_results??null);
    const label=o?.conversion_label??'unknown';
    const scorable=o!==null&&d!==null&&c!==null;
    const components={demand:d,competition:c,conversion:conversionScore(label),relevance:relevanceScore(rel.relevance_class),trend:trend.score,seasonality:season.score};
    const final=scorable?finalScore(components):null;
    rows.push({keyword:k,observation_id:o?.observation_id??null,researched:o!==null,
      relevance_class:rel.relevance_class,relevance_rule:rel.rule,relevance_reason:rel.reason,relevance_words:rel.words.map(w=>({word:w.word,facet:w.facet})),
      searches_30d:o?.searches_30d??null,search_results:o?.search_results??null,conversion_label:o?o.conversion_label:null,trend_percent:o?.trend_percent??null,captured_at:o?.captured_at??null,
      demand_score:d,competition_score:c,conversion_score:components.conversion,trend_score:trend.score,relevance_score:components.relevance,seasonality_score:season.score,
      final_opportunity_score:final,rounded:round1(final),
      contributions:scorable?Object.fromEntries(Object.entries(WEIGHTS).map(([n,w])=>[n,components[n]*w])):null,
      components,trend_missing:trend.missing,seasonality_missing:season.missing,
      eligible_for_primary:false,selected_role:null,rank:null,rejection_reasons:[],decision_reasons:[],market_weaknesses:[],comparison_with_primary:null});
  };
  for(const o of research.observations)add(o.keyword,o);
  for(const k of extra_keywords)add(k,null);

  // Rejection reasons that do not depend on other candidates.
  for(const r of rows){
    const x=r.rejection_reasons;
    if(r.relevance_class==='IRRELEVANT')x.push('irrelevant');
    if(r.relevance_class==='WEAK')x.push('weak_relevance');
    if(r.final_opportunity_score===null)x.push('missing_market_evidence');
    if(r.searches_30d===0)x.push('insufficient_demand');
    if(r.competition_score===0)x.push('poor_competitive_opportunity');
    // Very low conversion rejects only a phrase that is not an accurate EXACT/STRONG description;
    // an accurate one keeps its evidence and is de-emphasised by its score instead.
    if(r.conversion_label==='very_low'&&!['EXACT','STRONG'].includes(r.relevance_class))x.push('very_low_conversion');
    if(r.researched&&r.demand_score!==null&&r.demand_score<50)r.market_weaknesses.push(`${r.searches_30d} searches in 30 days: below 50 on the demand scale (fewer than 100 searches)`);
    if(['low','very_low'].includes(r.conversion_label))r.market_weaknesses.push(`conversion label is ${r.conversion_label}`);
    if(r.conversion_label==='unknown')r.market_weaknesses.push('conversion label was not captured (unknown scores 40)');
  }
  // Duplicate intent: same words in any order/plural as a better-ranked candidate.
  const scored=rows.filter(r=>r.final_opportunity_score!==null).sort(cmp);
  const bySig=new Map();
  for(const r of scored.filter(r=>!r.rejection_reasons.length)){
    const s=signature(r.keyword);
    if(bySig.has(s)){r.rejection_reasons.push('duplicate_intent');r.decision_reasons.push(`same buyer intent as "${bySig.get(s)}", which ranks higher`);}
    else bySig.set(s,r.keyword);
  }
  for(const r of rows)r.eligible_for_primary=['EXACT','STRONG'].includes(r.relevance_class)&&!r.rejection_reasons.length;

  const eligible=scored.filter(r=>r.eligible_for_primary);
  eligible.forEach((r,i)=>{r.rank=i+1;});
  const primary=eligible[0]??null, runner=eligible[1]??null;
  const close=!!(primary&&runner&&primary.final_opportunity_score-runner.final_opportunity_score<=CLOSE_COMPETITION_POINTS+1e-9);
  let secondary=0;
  for(const r of eligible){
    if(r===primary){r.selected_role='PRIMARY';continue;}
    if(r.conversion_label!=='very_low'&&secondary<MAX_SECONDARY){r.selected_role='SECONDARY';secondary++;}
    else{r.selected_role='SUPPORTING';
      r.decision_reasons.push(r.conversion_label==='very_low'?'accurate but de-emphasised: very low conversion (evidence kept, not a secondary intent)':`accurate but not selected: the ${MAX_SECONDARY} secondary places went to higher scores`);}
  }
  for(const r of rows)if(!r.selected_role)r.selected_role=r.rejection_reasons.length?'REJECTED':'SUPPORTING';

  // Human-readable decision reasons.
  for(const r of rows){
    const why=r.decision_reasons;
    if(r.selected_role==='REJECTED'){why.unshift(`rejected: ${r.rejection_reasons.join(', ')} (${r.rejection_reasons.includes('missing_market_evidence')?'no complete Marketplace Insights observation':r.relevance_reason})`);}
    else if(!r.eligible_for_primary)why.unshift(`${r.relevance_class}: ${r.relevance_reason}; ${r.relevance_class==='SUPPORTING'?'SUPPORTING phrases are never primary in v1 (no owner override yet)':'not eligible for primary'}`);
    else why.unshift(`${r.relevance_class}: ${r.relevance_reason}`);
    if(r===primary){
      why.push(`highest opportunity score (${f1(r.final_opportunity_score)}) of ${eligible.length} eligible EXACT/STRONG candidate${eligible.length>1?'s':''}`);
      if(runner){const d=explainDifference(r,runner);why.push(`beats "${runner.keyword}" (${f1(runner.final_opportunity_score)}) by ${f1(d.score_difference)}: ${describeDiff(d)}`);}
      if(close)why.push(`close competition: the margin is within ${CLOSE_COMPETITION_POINTS.toFixed(1)} points, so the choice is not certain`);
    }else if(primary&&r.final_opportunity_score!==null){
      const d=explainDifference(r,primary);r.comparison_with_primary=d;
      why.push(`${f1(r.final_opportunity_score)} vs primary "${primary.keyword}" ${f1(primary.final_opportunity_score)} (${signed(d.score_difference)}): ${describeDiff(d)}`);
      if(!r.eligible_for_primary&&r.final_opportunity_score>primary.final_opportunity_score)why.push('scores higher than the primary but cannot be primary: relevance guardrail');
    }
  }

  // Confidence in OUR recommendation from evidence completeness (not an Etsy prediction).
  const relevant=rows.filter(r=>['EXACT','STRONG','SUPPORTING'].includes(r.relevance_class)&&r.final_opportunity_score!==null);
  const triggers=[], t=(level,condition,detail)=>triggers.push({level,condition,detail});
  if(!primary)t('low','no_exact_or_strong_primary','no EXACT/STRONG candidate is eligible: research required');
  else{
    if(primary.searches_30d===null||primary.search_results===null)t('low','key_demand_or_competition_evidence_absent','the primary lacks searches or results');
    if(primary.conversion_label==='unknown')t('low','primary_conversion_unknown',`"${primary.keyword}" has no conversion label`);
    if(primary.trend_missing)t('medium','trend_missing',`no trend_percent for "${primary.keyword}" (scored as neutral 50)`);
    if(primary.seasonality_missing)t('medium','seasonality_missing','no seasonality supplied for this product (scored as neutral 50)');
    if(close)t('medium','close_competition',`"${primary.keyword}" leads "${runner.keyword}" by ${f1(primary.final_opportunity_score-runner.final_opportunity_score)} points`);
  }
  if(relevant.length<=1)t('low','only_one_viable_observation',`${relevant.length} relevant (EXACT/STRONG/SUPPORTING) observation${relevant.length===1?'':'s'} with complete evidence`);
  else if(relevant.length===2)t('medium','only_two_relevant_observations','2 relevant observations with complete evidence (3 needed for high)');
  if(ctx.research_stale)t('low','research_stale','the research is marked stale');
  if(ctx.evidence_conflicts.length)t('low','evidence_conflicts',ctx.evidence_conflicts.join('; '));
  const confidence=triggers.some(x=>x.level==='low')?'low':triggers.some(x=>x.level==='medium')?'medium':'high';

  const order=r=>r.eligible_for_primary?0:r.final_opportunity_score!==null?1:2;
  const diagnostics=[...rows].sort((a,b)=>order(a)-order(b)||(a.final_opportunity_score!==null&&b.final_opportunity_score!==null?cmp(a,b):a.keyword.localeCompare(b.keyword)))
    .map(({rounded,components,...r})=>r);
  const warnings=[];
  if(!primary)warnings.push('research_required: no EXACT or STRONG keyword with complete evidence. Capture Marketplace Insights for accurate phrases; nothing weaker is promoted.');
  if(primary?.market_weaknesses.length)warnings.push(`"${primary.keyword}" is the best of the supplied candidates, not evidence of a strong market: ${primary.market_weaknesses.join('; ')}.`);
  return {scoring_version:SCORING_VERSION,disclaimer:DISCLAIMER,
    formula:{final:'demand·0.20 + competition·0.15 + conversion·0.30 + relevance·0.25 + trend·0.05 + seasonality·0.05, clamped to [0,100]',
      demand:`100·log10(1+searches_30d)/log10(1+${DEMAND_REFERENCE})`,competition:`100·(1 − log10(1+min(search_results,${COMPETITION_REFERENCE}))/log10(1+${COMPETITION_REFERENCE}))`,
      trend:'clamp(50 + trend_percent); missing = 50',weights:WEIGHTS,relevance_values:RELEVANCE_VALUES,conversion_values:CONVERSION_VALUES,seasonality_values:SEASONALITY_VALUES,
      close_competition_points:CLOSE_COMPETITION_POINTS,max_secondary:MAX_SECONDARY},
    inputs:{research:{research_id:research.research_id,version:research.version,sha256:researchSha(research)},profile_id:profile.profile_id,profile_sha256:profileSha(profile),
      seasonality:profile.seasonality,extra_keywords:[...extra_keywords],context:ctx},
    diagnostics,
    primary_keyword:primary?.keyword??null,
    secondary_keywords:eligible.filter(r=>r.selected_role==='SECONDARY').map(r=>r.keyword),
    supporting_keywords:diagnostics.filter(r=>r.selected_role==='SUPPORTING').map(r=>r.keyword),
    rejected_keywords:diagnostics.filter(r=>r.selected_role==='REJECTED').map(r=>({keyword:r.keyword,reasons:r.rejection_reasons})),
    close_competition:close,
    close_competition_detail:primary&&runner?{first:primary.keyword,first_score:primary.final_opportunity_score,second:runner.keyword,second_score:runner.final_opportunity_score,
      difference:primary.final_opportunity_score-runner.final_opportunity_score,threshold:CLOSE_COMPETITION_POINTS}:null,
    research_required:!primary,confidence,confidence_triggers:triggers,warnings};
}
