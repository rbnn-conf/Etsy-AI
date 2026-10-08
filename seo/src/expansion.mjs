// SEO Research Expansion + Keyword Clustering (ADR-034).
//
// DISCOVERY IS NOT EVIDENCE. A related Etsy term has no market value assigned
// to it until its own Marketplace Insights data is actually captured.
//
//   ResearchPlan (round 1) → owner captures → related terms DISCOVERED
//   → relevance vs the product (idea first) → research round N (requested terms)
//   → owner captures → … → readiness → clusters → ResearchEvidencePackage
//   → Opportunity Engine (ADR-032, formula unchanged)
//
// Deterministic. No network, no model, no clock (callers pass `now`). No demand
// assumption decides expansion: terms without captured evidence are ranked by
// relevance class, number of researched queries that surfaced them, then text.
import { createHash } from 'node:crypto';
import { MODES, DELIVERY_METHODS } from './idea.mjs';
import { researchSha } from './research.mjs';
import { validateProfile, classifyKeyword, words } from './relevance.mjs';
import { normaliseQuery, resolveIdea, generateQueries, listingIdea, CAPTURE_FIELDS, MAX_QUERIES, PLAN_SCHEMA_VERSION } from './planner.mjs';
import { scoreOpportunities } from './scoring.mjs';
import { createListingRecommendation } from './listing.mjs';

export const MAX_TOTAL_RESEARCH_QUERIES=40;
export const MAX_EXPANSION_ROUNDS=3;          // rounds after the planned round 1
export const MAX_NEW_TERMS_PER_ROUND=10;
export const MIN_RELEVANT_OBSERVATIONS=3;
export const ROUND_SCHEMA_VERSION=1, PACKAGE_SCHEMA_VERSION=1;
export const TERM_STATES=Object.freeze(['planned','discovered','research_requested','captured','unavailable','owner_stopped','rejected','duplicate']);
export const ROUND_STATUSES=Object.freeze(['pending_capture','complete','truncated','owner_stopped']);
// Owner action: stop expansion and score with the evidence already captured. Outstanding requested
// terms become owner_stopped: NOT researched, unknown. Never unavailable, rejected or zero; never evidence.
export const FINISH_WITH_CURRENT_EVIDENCE='FINISH_WITH_CURRENT_EVIDENCE';
export const OWNER_STOP_WARNING='Research was ended before all recommended expansion terms were captured.';
export const READINESS=Object.freeze(['RESEARCH_INCOMPLETE','EXPANSION_RECOMMENDED','READY_TO_SCORE','READY_TO_SCORE_WITH_WARNINGS']);
export const CLUSTER_TYPES=Object.freeze(['core_product','theme','audience','style','delivery','long_tail']);
export const DISCOVERY_RULE='DISCOVERY IS NOT EVIDENCE: a related Etsy term has no market value until its own Marketplace Insights data is captured.';
const RANK={EXACT:0,STRONG:1,SUPPORTING:2,WEAK:3,IRRELEVANT:4};
const RELEVANT=new Set(['EXACT','STRONG','SUPPORTING']);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const asProfile=p=>{if(p?.index)return p;const v=validateProfile(p);if(!v.ok)throw new Error(`invalid relevance profile: ${v.errors.join('; ')}`);return v.profile;};
const complete=o=>o&&o.searches_30d!==null&&o.search_results!==null;
const metricsOf=t=>{const n=[t.searches_30d,t.search_results,t.conversion_label].filter(v=>v!==null&&v!==undefined).length;return n===3?'all':n?'partial':'none';};

/**
 * EXISTING_LISTING research plan in the ResearchPlan contract: queries from the
 * listing's own metadata (planner rules) plus its current tags that describe the
 * product (SUPPORTING or better) as existing_term queries. Capped at MAX_QUERIES.
 */
export function createListingResearchPlan({snapshot,profile,now=new Date()}){
  const p=asProfile(profile), resolved=resolveIdea(listingIdea(snapshot,p)), g=generateQueries(resolved);
  const queries=[...g.queries], seen=new Set(queries.map(q=>q.normalized_query)), warnings=[...g.warnings];
  const tagQs=[];
  for(const t of snapshot.tags??[]){
    const n=normaliseQuery(t);if(seen.has(n))continue;seen.add(n);
    const c=classifyKeyword(t,p);
    if(!RELEVANT.has(c.relevance_class)){warnings.push(`current tag "${t}" is ${c.relevance_class} for this product (${c.reason}); not planned for research`);continue;}
    tagQs.push({query:t,normalized_query:n,also_spelled:[],intent_type:'existing_term',priority:'P2',reason:`current listing tag (${c.relevance_class}): its market evidence is unknown`,
      required:false,observation_status:'not_researched',components:{format:null,theme:null,audience:null,style:null,delivery:null},merged_variants:[]});
  }
  const order={P1:0,P2:1,P3:2};
  let all=[...queries.filter(q=>q.priority==='P1'),...tagQs,...queries.filter(q=>q.priority!=='P1')].sort((a,b)=>order[a.priority]-order[b.priority]);
  if(all.length>MAX_QUERIES){const cut=all.slice(MAX_QUERIES);all=all.slice(0,MAX_QUERIES);warnings.push(`query_cap_reached: ${cut.length} lower-priority queries not listed (limit ${MAX_QUERIES}): ${cut.map(q=>q.query).join(', ')}.`);}
  const {sources,idea_completeness,missing_fields,warnings:rw,...structured}=resolved;
  const idea_reference={product_id:snapshot.listing?.repo_product?.slice(0,3)??null,working_name:snapshot.title,snapshot_id:snapshot.snapshot_id,sha256:sha(snapshot)};
  return {schema_version:PLAN_SCHEMA_VERSION,research_plan_id:`plan-${sha([idea_reference,all.map(q=>q.normalized_query)]).slice(0,16)}`,mode:MODES.EXISTING_LISTING,
    product_id:idea_reference.product_id,idea_reference,created_at:now.toISOString(),idea_completeness,missing_fields,resolved_idea:{...structured,sources},
    queries:all,capture_fields:[...CAPTURE_FIELDS],discovered_terms:[],research_references:[],
    warnings:[...rw.filter(w=>!/taken from the idea/.test(w)),...warnings,'A generated research query is not evidence of market demand: every query is not_researched until the owner captures it.'],
    status:'draft',status_history:[{status:'draft',at:now.toISOString()}]};
}

/** Round 1: the research plan's own queries (P1 required). */
export function createInitialRound({plan,profile,now=new Date()}){
  const p=asProfile(profile);
  return {schema_version:ROUND_SCHEMA_VERSION,round_id:`${plan.research_plan_id}-r1`,research_plan_id:plan.research_plan_id,round_number:1,kind:'planned',
    input_research_version:null,created_at:now.toISOString(),discovered_terms:[],
    requested_terms:plan.queries.map(q=>({term:q.query,normalized_term:q.normalized_query,priority:q.priority,required:q.required,relevance_class:classifyKeyword(q.query,p).relevance_class,
      discovered_from:[],reason:q.reason,observation_status:'not_researched'})),
    rejected_terms:[],duplicates:[],unavailable_terms:[],not_requested:[],expansion_truncated:false,status:'pending_capture'};
}

/**
 * The research ledger and readiness for a plan, its rounds and the latest
 * research version (each version is a complete capture set, ADR-031).
 * Pure: same inputs, same output.
 */
export function researchState({plan,profile,research,rounds=[]}){
  const p=asProfile(profile);
  const obs=new Map((research?.observations??[]).map(o=>[normaliseQuery(o.keyword),o]));
  const ledger=new Map(), duplicates=[], warnings=[];
  const rel=t=>classifyKeyword(t,p);
  const put=(n,e)=>{ledger.set(n,{term:e.term,normalized_term:n,origin:e.origin,state:e.state,relevance_class:e.relevance_class,relevance_reason:e.relevance_reason,
    priority:e.priority??null,required:e.required??false,round_number:e.round_number??null,discovered_from:e.discovered_from??[],discovered_at:e.discovered_at??null,
    metrics_supplied:e.metrics_supplied??null,decision:e.decision,decision_reason:e.decision_reason,duplicate_of:e.duplicate_of??null,observation_id:e.observation_id??null});};
  const live=(n,unavailable,waiting)=>{const o=obs.get(n);return o?{state:'captured',observation_id:o.observation_id}:{state:unavailable?'unavailable':waiting};};

  // 1. Planned queries (round 1).
  for(const q of plan.queries){const r=rel(q.query);
    put(q.normalized_query,{term:q.query,origin:'plan',...live(q.normalized_query,q.observation_status==='unavailable','planned'),relevance_class:r.relevance_class,relevance_reason:r.reason,
      priority:q.priority,required:q.required,round_number:1,decision:'research',decision_reason:q.reason});}
  if(plan.queries.some(q=>ledger.get(q.normalized_query).relevance_class==='IRRELEVANT'))
    warnings.push('Some planned queries are IRRELEVANT under the relevance profile: check that the profile describes the same product as the plan.');
  // 2. Terms requested by expansion rounds, and decisions already recorded by rounds.
  for(const round of rounds.filter(r=>r.round_number>=2)){
    for(const t of round.requested_terms){if(ledger.has(t.normalized_term))continue;const r=rel(t.term);
      put(t.normalized_term,{term:t.term,origin:'expansion',...live(t.normalized_term,t.observation_status==='unavailable',t.observation_status==='owner_stopped'?'owner_stopped':'research_requested'),relevance_class:r.relevance_class,relevance_reason:r.reason,
        required:true,round_number:round.round_number,discovered_from:t.discovered_from,discovered_at:t.discovered_at,metrics_supplied:t.metrics_supplied??null,decision:'research',decision_reason:t.reason});}
    for(const t of round.rejected_terms)if(!ledger.has(t.normalized_term))put(t.normalized_term,{...t,origin:'discovered',state:'rejected',decision:'reject',decision_reason:t.reason});
  }
  // 3. Discoveries: related terms displayed beside captured searches of THIS plan.
  const found=new Map();
  for(const e of [...ledger.values()].filter(e=>e.state==='captured').sort((a,b)=>a.term.localeCompare(b.term))){
    for(const t of obs.get(e.normalized_term).related_terms??[]){
      const n=normaliseQuery(t.term), f=found.get(n)??{wordings:new Set(),from:new Set(),metrics:[]};
      f.wordings.add(t.term);f.from.add(e.term);f.metrics.push(metricsOf(t));found.set(n,f);
    }
  }
  const recorded=new Map(rounds.flatMap(r=>r.discovered_terms??[]).map(d=>[d.normalized_term,d]));
  const covered=new Set([...ledger.values()].filter(e=>['plan','expansion'].includes(e.origin)).flatMap(e=>words(e.term).map(w=>w.token)));
  // EXACT/STRONG first, then SUPPORTING, then the rest; each by normalised text (order-independent of capture).
  const firstWording=f=>[...f.wordings].sort()[0];
  for(const [n,f] of [...found].sort((a,b)=>RANK[rel(firstWording(a[1])).relevance_class]-RANK[rel(firstWording(b[1])).relevance_class]||a[0].localeCompare(b[0]))){
    const wordings=[...f.wordings].sort(), from=[...f.from].sort();
    const best=f.metrics.includes('all')?'all':f.metrics.includes('partial')?'partial':'none';
    if(ledger.has(n)){
      const e=ledger.get(n);
      e.also_discovered_from=[...new Set([...(e.also_discovered_from??[]),...from])].sort();
      for(const w of wordings)if(!(['discovered','expansion'].includes(e.origin)&&w===e.term))duplicates.push({term:w,normalized_term:n,duplicate_of:e.term,reason:e.origin==='plan'&&e.state!=='captured'?`already in the research plan (${e.priority})`:e.state==='captured'?'already researched':`already ${e.state}`,discovered_from:from});
      continue;
    }
    const term=wordings[0];
    for(const w of wordings.slice(1))duplicates.push({term:w,normalized_term:n,duplicate_of:term,reason:'same search after case, punctuation, spelling and plural normalisation',discovered_from:from});
    const r=rel(term), base={term,origin:'discovered',relevance_class:r.relevance_class,relevance_reason:r.reason,discovered_from:from,
      discovered_at:recorded.get(n)?.discovered_at??research.recorded_at??null,metrics_supplied:best};
    if(r.relevance_class==='IRRELEVANT')put(n,{...base,state:'rejected',decision:'reject',decision_reason:`irrelevant to the original product idea: ${r.reason}`});
    else if(r.relevance_class==='WEAK')put(n,{...base,state:'rejected',decision:'reject',decision_reason:`weak relevance: ${r.reason}`});
    else if(r.relevance_class==='SUPPORTING'){
      const fresh=[...new Set(words(term).map(w=>w.token).filter(t=>!covered.has(t)))];
      if(fresh.length)put(n,{...base,state:'discovered',decision:'request_research',decision_reason:`supporting term with a buyer-intent word no planned or researched query covers (${fresh.join(', ')})`});
      else put(n,{...base,state:'rejected',decision:'reject',decision_reason:'supporting term adds no buyer-intent word beyond terms already planned, researched or requested'});
    }else put(n,{...base,state:'discovered',decision:'request_research',decision_reason:`${r.relevance_class} buyer-intent refinement: ${r.reason}`});
    if(ledger.get(n).decision==='request_research')for(const w of words(term))covered.add(w.token);   // a later SUPPORTING term must add something new
  }

  // Budget and candidates (no demand assumption: class, number of sources, text).
  const expansionRounds=rounds.filter(r=>r.round_number>=2).length;
  const used=plan.queries.length+[...ledger.values()].filter(e=>e.origin==='expansion').length;
  const finished=rounds.find(r=>r.owner_finished)?.owner_finished??null;
  const allowed=finished||expansionRounds>=MAX_EXPANSION_ROUNDS?0:Math.max(0,Math.min(MAX_NEW_TERMS_PER_ROUND,MAX_TOTAL_RESEARCH_QUERIES-used));
  const candidates=[...ledger.values()].filter(e=>e.decision==='request_research'&&e.state==='discovered')
    .sort((a,b)=>RANK[a.relevance_class]-RANK[b.relevance_class]||b.discovered_from.length-a.discovered_from.length||a.term.localeCompare(b.term));
  const budget={max_total_research_queries:MAX_TOTAL_RESEARCH_QUERIES,max_expansion_rounds:MAX_EXPANSION_ROUNDS,max_new_terms_per_round:MAX_NEW_TERMS_PER_ROUND,
    queries_used:used,expansion_rounds_used:expansionRounds,next_round_capacity:allowed,
    exhausted:expansionRounds>=MAX_EXPANSION_ROUNDS||used>=MAX_TOTAL_RESEARCH_QUERIES,finished_by_owner:!!finished};

  // Round statuses (live).
  const roundStatus=r=>{
    const reqs=r.round_number===1?r.requested_terms.filter(t=>t.required):r.requested_terms;
    const st=reqs.map(t=>ledger.get(t.normalized_term)?.state);
    if(st.every(x=>['captured','unavailable'].includes(x)))return r.expansion_truncated?'truncated':'complete';
    return r.owner_finished&&st.every(x=>['captured','unavailable','owner_stopped'].includes(x))&&st.includes('owner_stopped')?'owner_stopped':'pending_capture';
  };
  const round_statuses=rounds.map(r=>({round_number:r.round_number,round_id:r.round_id,status:roundStatus(r)}));

  const all=[...ledger.values()];
  const readiness=evaluateReadiness({all,obs,candidates,budget,round_statuses,rounds,finished});
  return {plan_id:plan.research_plan_id,mode:plan.mode,owner_finished:finished,research:research?{research_id:research.research_id,version:research.version,sha256:researchSha(research)}:null,
    ledger:all.sort((a,b)=>({plan:0,expansion:1,discovered:2}[a.origin]-{plan:0,expansion:1,discovered:2}[b.origin])||a.term.localeCompare(b.term)),
    duplicates,candidates:candidates.map(c=>c.term),budget,round_statuses,readiness,warnings};
}

/**
 * Readiness rules (ADR-034), first match wins:
 *   1. a required P1 query is still planned, or a requested expansion term is still pending → RESEARCH_INCOMPLETE
 *   2. expansion candidates exist and the budget allows another round → EXPANSION_RECOMMENDED
 *   3. fewer than 3 relevant captured observations with complete metrics, or no EXACT/STRONG one → RESEARCH_INCOMPLETE
 *   4. otherwise READY_TO_SCORE, or READY_TO_SCORE_WITH_WARNINGS when: a P1 query or requested term is
 *      unavailable; candidates were left unrequested because the budget is exhausted (or a round was
 *      truncated); evidence is at the minimum (exactly 3 relevant, or exactly 1 EXACT/STRONG); or a captured
 *      observation lacks searches/results; or the owner finished with current evidence (OWNER_STOP_WARNING,
 *      naming every requested-but-unresearched and recommended-but-unrequested term).
 * FINISH_WITH_CURRENT_EVIDENCE only closes expansion: rules 1 (P1) and 3 (minimum evidence) still apply.
 */
function evaluateReadiness({all,obs,candidates,budget,round_statuses,rounds,finished=null}){
  const reasons=[], warnings=[];
  const p1Pending=all.filter(e=>e.origin==='plan'&&e.required&&e.state==='planned');
  const reqPending=all.filter(e=>e.origin==='expansion'&&e.state==='research_requested');
  const captured=all.filter(e=>e.state==='captured'&&['plan','expansion'].includes(e.origin));
  const relevant=captured.filter(e=>RELEVANT.has(e.relevance_class)&&complete(obs.get(e.normalized_term)));
  const strong=relevant.filter(e=>['EXACT','STRONG'].includes(e.relevance_class));
  const counts={required_p1:all.filter(e=>e.origin==='plan'&&e.required).length,p1_pending:p1Pending.length,requested_pending:reqPending.length,
    captured:captured.length,relevant_captured:relevant.length,exact_or_strong_captured:strong.length,expansion_candidates:candidates.length,
    owner_stopped:all.filter(e=>e.state==='owner_stopped').length};
  const stopped=all.filter(e=>e.state==='owner_stopped');
  const stopWarning=()=>`${OWNER_STOP_WARNING} Requested but not researched: ${stopped.map(e=>e.term).join(', ')||'none'}.${candidates.length?` Recommended but never requested: ${candidates.map(c=>c.term).join(', ')}.`:''} These terms are unknown: not unavailable, not rejected, not zero, and not evidence.`;
  let status;
  if(p1Pending.length||reqPending.length){
    status='RESEARCH_INCOMPLETE';
    if(p1Pending.length)reasons.push(`${p1Pending.length} required P1 quer${p1Pending.length===1?'y is':'ies are'} not yet captured or marked unavailable: ${p1Pending.map(e=>e.term).join(', ')}`);
    if(reqPending.length)reasons.push(`${reqPending.length} requested research term${reqPending.length===1?' is':'s are'} pending capture: ${reqPending.map(e=>e.term).join(', ')}`);
  }else if(candidates.length&&budget.next_round_capacity>0){
    status='EXPANSION_RECOMMENDED';
    reasons.push(`${candidates.length} relevant discovered term${candidates.length===1?'':'s'} ${candidates.length===1?'needs its':'need their'} own Marketplace Insights lookup: ${candidates.map(c=>c.term).join(', ')}`);
  }else if(relevant.length<MIN_RELEVANT_OBSERVATIONS||!strong.length){
    status='RESEARCH_INCOMPLETE';
    if(relevant.length<MIN_RELEVANT_OBSERVATIONS)reasons.push(`${relevant.length} relevant captured observation${relevant.length===1?'':'s'} with complete metrics (${MIN_RELEVANT_OBSERVATIONS} needed)`);
    if(!strong.length)reasons.push('no EXACT or STRONG keyword has been captured');
    if(finished)reasons.push(`the owner finished research with current evidence (${finished.at}), but the minimum evidence rules are not met; stopping cannot replace missing evidence`);
    else if(candidates.length)reasons.push(`the expansion budget is exhausted with ${candidates.length} candidate${candidates.length===1?'':'s'} unrequested`);
  }else{
    const p1Unavail=all.filter(e=>e.origin==='plan'&&e.required&&e.state==='unavailable');
    const reqUnavail=all.filter(e=>e.origin==='expansion'&&e.state==='unavailable');
    const missing=captured.filter(e=>!complete(obs.get(e.normalized_term)));
    if(p1Unavail.length)warnings.push(`required P1 quer${p1Unavail.length===1?'y':'ies'} unavailable (not zero demand; simply unknown): ${p1Unavail.map(e=>e.term).join(', ')}`);
    if(reqUnavail.length)warnings.push(`requested related term${reqUnavail.length===1?'':'s'} could not be researched: ${reqUnavail.map(e=>e.term).join(', ')}`);
    if(finished)warnings.push(stopWarning());
    else if(candidates.length)warnings.push(`expansion truncated: the budget is exhausted, so ${candidates.map(c=>c.term).join(', ')} ${candidates.length===1?'was':'were'} never researched`);
    else if(round_statuses.some(r=>r.status==='truncated'))warnings.push(`expansion truncated in round ${round_statuses.filter(r=>r.status==='truncated').map(r=>r.round_number).join(', ')}: not requested: ${rounds.flatMap(r=>r.not_requested).map(x=>x.term).join(', ')}`);
    if(relevant.length===MIN_RELEVANT_OBSERVATIONS||strong.length===1)warnings.push(`thin evidence: ${relevant.length} relevant captured observations, ${strong.length} EXACT/STRONG (the minimum is ${MIN_RELEVANT_OBSERVATIONS} and 1)`);
    if(missing.length)warnings.push(`captured without searches or results (not counted as evidence, not zero): ${missing.map(e=>e.term).join(', ')}`);
    status=warnings.length?'READY_TO_SCORE_WITH_WARNINGS':'READY_TO_SCORE';
    reasons.push(`every required P1 query is captured or unavailable; ${relevant.length} relevant captured observations; ${strong.length} EXACT/STRONG; ${finished?'the owner finished research with current evidence':candidates.length?'budget exhausted':'no relevant discovered term awaits research'}`);
  }
  return {status,reasons,warnings,counts};
}

/**
 * The next research round from the discovered terms. Refused while a round is
 * pending capture, when MAX_EXPANSION_ROUNDS is reached, or when nothing
 * qualifies. At most MAX_NEW_TERMS_PER_ROUND terms and MAX_TOTAL_RESEARCH_QUERIES
 * overall; the rest are listed as not requested (expansion_truncated).
 */
export function nextResearchRound({plan,profile,research,rounds,now=new Date()}){
  const s=researchState({plan,profile,research,rounds});
  const pending=s.round_statuses.filter(r=>r.status==='pending_capture');
  if(pending.length)throw new Error(`round ${pending.map(r=>r.round_number).join(', ')} is still pending capture`);
  if(s.owner_finished)throw new Error(`research was finished by the owner (${FINISH_WITH_CURRENT_EVIDENCE}, ${s.owner_finished.at}); no further expansion`);
  if(s.budget.expansion_rounds_used>=MAX_EXPANSION_ROUNDS)throw new Error(`maximum expansion rounds reached (${MAX_EXPANSION_ROUNDS})`);
  if(!s.candidates.length)throw new Error('no relevant discovered term needs research');
  const byTerm=new Map(s.ledger.map(e=>[e.term,e])), cand=s.candidates.map(t=>byTerm.get(t));
  const take=cand.slice(0,s.budget.next_round_capacity), rest=cand.slice(take.length);
  const known=new Set(rounds.flatMap(r=>[...(r.discovered_terms??[]),...r.rejected_terms,...r.duplicates].map(x=>`${x.normalized_term}|${x.term}`)));
  const n=rounds.length+1;
  const pick=e=>({term:e.term,normalized_term:e.normalized_term,discovered_from:e.discovered_from,discovered_at:e.discovered_at,metrics_supplied:e.metrics_supplied,
    relevance_class:e.relevance_class,decision:e.decision,decision_reason:e.decision_reason});
  const discovered=s.ledger.filter(e=>e.origin==='discovered'&&!known.has(`${e.normalized_term}|${e.term}`));
  return {schema_version:ROUND_SCHEMA_VERSION,round_id:`${plan.research_plan_id}-r${n}`,research_plan_id:plan.research_plan_id,round_number:n,kind:'expansion',
    input_research_version:s.research,created_at:now.toISOString(),
    discovered_terms:discovered.map(pick),
    requested_terms:take.map(e=>({...pick(e),reason:e.decision_reason,required:true,observation_status:'not_researched'})),
    rejected_terms:discovered.filter(e=>e.state==='rejected').map(e=>({...pick(e),reason:e.decision_reason})),
    duplicates:s.duplicates.filter(d=>!known.has(`${d.normalized_term}|${d.term}`)),
    unavailable_terms:[],not_requested:rest.map(e=>({term:e.term,relevance_class:e.relevance_class,discovered_from:e.discovered_from,
      reason:`expansion budget: at most ${MAX_NEW_TERMS_PER_ROUND} new terms per round and ${MAX_TOTAL_RESEARCH_QUERIES} research queries in total`})),
    expansion_truncated:rest.length>0,status:'pending_capture'};
}

/**
 * FINISH_WITH_CURRENT_EVIDENCE: the owner stops expansion. Recorded on the latest round. Its requested
 * terms without a captured observation become owner_stopped (not researched; unknown). Nothing is marked
 * unavailable or rejected, no metric is assigned, and captured observations are untouched. The evidence
 * rules are unchanged, so readiness may or may not become READY_TO_SCORE_WITH_WARNINGS.
 * @returns the rounds with the latest one updated
 */
export function finishWithCurrentEvidence({rounds,research,decided_by='owner',note=null,now=new Date()}){
  if(!rounds?.length)throw new Error('there is no research round to finish');
  if(rounds.some(r=>r.owner_finished))throw new Error('research was already finished by the owner');
  if(typeof decided_by!=='string'||!decided_by.trim())throw new Error('decided_by is required');
  const captured=new Set((research?.observations??[]).map(o=>normaliseQuery(o.keyword)));
  const last=structuredClone(rounds.at(-1)), stopped=[];
  if(last.round_number>=2)for(const t of last.requested_terms)if(t.observation_status==='not_researched'&&!captured.has(t.normalized_term)){t.observation_status='owner_stopped';stopped.push(t.term);}
  last.owner_finished={action:FINISH_WITH_CURRENT_EVIDENCE,decided_by,at:now.toISOString(),note,terms_not_researched:stopped};
  return [...rounds.slice(0,-1),last];
}

/** The owner could not get Marketplace Insights for a requested expansion term. */
export function markRoundTermUnavailable(round,term,{note=null}={}){
  const r=structuredClone(round), t=r.requested_terms.find(x=>x.normalized_term===normaliseQuery(term));
  if(!t)throw new Error(`"${term}" was not requested in round ${round.round_number}`);
  t.observation_status='unavailable';r.unavailable_terms.push({term:t.term,note});
  return r;
}

/**
 * Buyer-intent clusters of CAPTURED (and unavailable) research terms, from the
 * relevance profile's facets. A keyword joins every dimension it names; one
 * naming two or more of theme / audience / style is also long-tail. WEAK and
 * IRRELEVANT terms are not clustered. No statistics are aggregated.
 */
export function clusterKeywords({state,profile}){
  const p=asProfile(profile), clusters=new Map();
  const deliveryWords=new Set(DELIVERY_METHODS);
  const add=(id,type,label,e)=>{const c=clusters.get(id)??{cluster_id:id,cluster_type:type,labels:new Set(),members:[]};c.labels.add(label);c.members.push(e);clusters.set(id,c);};
  for(const e of state.ledger.filter(e=>['captured','unavailable'].includes(e.state)&&RELEVANT.has(e.relevance_class))){
    const ws=classifyKeyword(e.term,p).words, dims=new Set();
    for(const w of ws){
      if(w.facet==='central_themes'){add(`theme-${w.token}`,'theme',w.word,e);dims.add('theme');}
      else if(w.facet==='audiences'){add(`audience-${w.token}`,'audience',w.word,e);dims.add('audience');}
      else if(w.facet==='attributes'&&deliveryWords.has(w.token)){add(`delivery-${w.token}`,'delivery',w.word,e);dims.add('delivery');}
      else if(w.facet==='attributes'){add(`style-${w.token}`,'style',w.word,e);dims.add('style');}
    }
    if(!dims.size)add('core-product','core_product','core product',e);
    if(['theme','audience','style'].filter(d=>dims.has(d)).length>=2)add('long-tail','long_tail','long-tail combination',e);
  }
  const typeOrder=Object.fromEntries(CLUSTER_TYPES.map((t,i)=>[t,i]));
  return [...clusters.values()].sort((a,b)=>typeOrder[a.cluster_type]-typeOrder[b.cluster_type]||a.cluster_id.localeCompare(b.cluster_id)).map(c=>{
    const m=[...new Map(c.members.map(e=>[e.normalized_term,e])).values()].sort((a,b)=>RANK[a.relevance_class]-RANK[b.relevance_class]||a.term.localeCompare(b.term));
    const labelWords=[...c.labels].sort();
    return {cluster_id:c.cluster_id,cluster_type:c.cluster_type,
      label:c.cluster_type==='core_product'?'Core product':c.cluster_type==='long_tail'?'Long-tail combinations':`${c.cluster_type[0].toUpperCase()+c.cluster_type.slice(1)}: ${labelWords.join(' / ')}`,
      keywords:m.map(e=>({keyword:e.term,state:e.state,relevance_class:e.relevance_class})),
      captured_count:m.filter(e=>e.state==='captured').length,unavailable_count:m.filter(e=>e.state==='unavailable').length,
      primary_candidate_terms:m.filter(e=>e.state==='captured'&&['EXACT','STRONG'].includes(e.relevance_class)).map(e=>e.term),
      supporting_terms:m.filter(e=>e.state==='captured'&&e.relevance_class==='SUPPORTING').map(e=>e.term)};
  });
}

/**
 * ResearchEvidencePackage: ONLY observations actually captured for this plan's
 * research terms, copied exactly (their related-term lists are left out:
 * discovery is not evidence). Unavailable terms are listed as unknown, never
 * as zero. Refused unless the research is READY_TO_SCORE(_WITH_WARNINGS).
 */
export function buildEvidencePackage({plan,profile,research,rounds,now=new Date()}){
  const s=researchState({plan,profile,research,rounds});
  if(!s.readiness.status.startsWith('READY_TO_SCORE'))throw new Error(`evidence package refused: research is ${s.readiness.status} (${s.readiness.reasons.join('; ')})`);
  const obs=new Map(research.observations.map(o=>[normaliseQuery(o.keyword),o]));
  const researchTerms=s.ledger.filter(e=>['plan','expansion'].includes(e.origin));
  const captured=researchTerms.filter(e=>e.state==='captured').map(e=>{const {related_terms,...o}=obs.get(e.normalized_term);return structuredClone(o);})
    .sort((a,b)=>a.keyword.localeCompare(b.keyword));
  const ids=new Set(captured.map(o=>o.observation_id));
  const outside=research.observations.filter(o=>!ids.has(o.observation_id)).length;
  const warnings=[...s.readiness.warnings,...s.warnings,DISCOVERY_RULE];
  if(outside)warnings.push(`${outside} observation${outside===1?'':'s'} in the research set ${outside===1?'is':'are'} not a research term of this plan and ${outside===1?'was':'were'} not included`);
  const body={schema_version:PACKAGE_SCHEMA_VERSION,kind:'research_evidence_package',mode:plan.mode,product_id:plan.product_id,idea_reference:plan.idea_reference,
    research_plan_reference:{research_plan_id:plan.research_plan_id},
    research_round_references:s.round_statuses.map(r=>({round_id:r.round_id,round_number:r.round_number,status:r.status})),
    research_version:s.research,captured_observations:captured,
    unavailable_terms:researchTerms.filter(e=>e.state==='unavailable').map(e=>({term:e.term,origin:e.origin,note:'unavailable: unknown, not zero demand; not evidence'})),
    unresearched_terms:researchTerms.filter(e=>e.state==='owner_stopped').map(e=>({term:e.term,origin:e.origin,state:'owner_stopped',
      note:'requested but not researched: the owner finished with current evidence; unknown, not zero; any related-term table figures are discovery metadata, not evidence'})),
    owner_finished:s.owner_finished,
    excluded:{discovered_not_researched:s.ledger.filter(e=>e.origin==='discovered').map(e=>({term:e.term,state:e.state})),observations_outside_plan:outside},
    clusters:clusterKeywords({state:s,profile}),readiness_status:s.readiness.status,readiness_reasons:s.readiness.reasons,warnings,
    // Seam for LumiumX performance evidence (views, clicks, orders, ads) after an SEO revision:
    // kept separate from Marketplace Insights and unused in v1 (performance.mjs).
    performance_evidence:null};
  return {package_id:`evidence-${sha(body).slice(0,16)}`,created_at:now.toISOString(),...body};
}

/** The research object the Opportunity Engine reads: the package's captured observations only. */
export function evidenceResearch(pkg){
  return {schema_version:1,research_id:pkg.research_version.research_id,version:pkg.research_version.version,evidence_package_id:pkg.package_id,observations:pkg.captured_observations};
}
/** Check a package against the research it cites: every observation identical, nothing else. */
export function validateEvidencePackage(pkg,research){
  const e=[];
  if(pkg?.kind!=='research_evidence_package')e.push('not a research evidence package');
  if(pkg?.research_version?.sha256!==researchSha(research))e.push('research_version does not match the cited research set');
  if(!String(pkg?.readiness_status).startsWith('READY_TO_SCORE'))e.push('the research was not ready to score');
  const byId=new Map(research.observations.map(o=>[o.observation_id,o]));
  for(const [i,o] of (pkg?.captured_observations??[]).entries()){
    const r=byId.get(o.observation_id);if(!r){e.push(`captured_observations[${i}] is not an observation of the cited research`);continue;}
    const {related_terms,...rr}=r;if(JSON.stringify(o)!==JSON.stringify(rr))e.push(`captured_observations[${i}] (${o.keyword}) differs from the captured observation`);
  }
  return {ok:!e.length,errors:e};
}
/** Opportunity Engine (ADR-032, unchanged) over the package's captured observations only. */
export function scoreEvidencePackage({pkg,profile,context={}}){
  if(!String(pkg.readiness_status).startsWith('READY_TO_SCORE'))throw new Error('the evidence package is not ready to score');
  return scoreOpportunities({profile:asProfile(profile),research:evidenceResearch(pkg),context});
}
/** EXISTING_LISTING: the SEO audit (a proposal; product and Etsy untouched) from an evidence package. */
export function auditListingFromEvidence({snapshot,profile,pkg,context={},now=new Date()}){
  if(pkg.mode!==MODES.EXISTING_LISTING||pkg.idea_reference?.snapshot_id!==snapshot.snapshot_id)throw new Error('the evidence package does not belong to this listing');
  return {...createListingRecommendation({snapshot,profile,research:evidenceResearch(pkg),context,now}),evidence_package_id:pkg.package_id};
}

// ---- Owner-facing text ----------------------------------------------------
export function roundReport(round){
  const out=[`RESEARCH ROUND ${round.round_number}`,''];
  if(round.round_number===1){
    out.push('SEARCH NEXT (the research plan):','');
    round.requested_terms.forEach((t,i)=>out.push(`${i+1}. ${t.term}  [${t.priority}${t.required?', required':''}]`,`   reason:`,`   ${t.reason}`));
  }else{
    out.push('SEARCH NEXT:','');
    round.requested_terms.forEach((t,i)=>out.push(`${i+1}. ${t.term}`,'   discovered from:',...t.discovered_from.map(f=>`   - ${f}`),'   reason:',`   ${t.reason}`));
    if(round.not_requested.length)out.push('','NOT REQUESTED (budget):','',...round.not_requested.map(t=>`${t.term}\nreason: ${t.reason}`));
    if(round.rejected_terms.length)out.push('','DO NOT RESEARCH:','',...round.rejected_terms.flatMap(t=>[t.term,`reason: ${t.reason}`,'']));
    if(round.duplicates.length)out.push('ALREADY COVERED (duplicates):','',...round.duplicates.map(d=>`${d.term} → ${d.duplicate_of} (${d.reason})`));
  }
  if(round.owner_finished)out.push('',`OWNER FINISHED RESEARCH (${round.owner_finished.action}, ${round.owner_finished.at})`,
    `Not researched (unknown): ${round.owner_finished.terms_not_researched.join(', ')||'none'}`);
  out.push('','FOR EACH QUERY CAPTURE:','',...CAPTURE_FIELDS.map(f=>`- ${f}`),'','Leave any value Etsy does not show empty. Never estimate.','',DISCOVERY_RULE);
  return out.join('\n');
}
export function statusReport(state){
  const r=state.readiness;
  return ['SEO RESEARCH STATUS','',`Plan: ${state.plan_id} (${state.mode})`,`Research: ${state.research?`${state.research.research_id} v${state.research.version}`:'none captured yet'}`,
    `Rounds: ${state.round_statuses.map(x=>`${x.round_number}=${x.status}`).join(', ')||'none'}`,
    `Budget: ${state.budget.queries_used}/${state.budget.max_total_research_queries} queries, ${state.budget.expansion_rounds_used}/${state.budget.max_expansion_rounds} expansion rounds`,
    `Terms: ${TERM_STATES.map(s=>`${s} ${s==='duplicate'?state.duplicates.length:state.ledger.filter(e=>e.state===s).length}`).join(' · ')}`,'',
    `READINESS: ${r.status}`,...r.reasons.map(x=>`- ${x}`),...r.warnings.map(x=>`- warning: ${x}`)].join('\n');
}
export function discoveredReport(state){
  const d=state.ledger.filter(e=>e.origin==='discovered');
  const out=['DISCOVERED TERMS (related searches Etsy displayed; NOT researched)',''];
  for(const e of d)out.push(`- ${e.term}  [${e.state}, ${e.relevance_class}]  from: ${e.discovered_from.join(', ')}  metrics supplied: ${e.metrics_supplied}`,`  ${e.decision_reason}`);
  if(state.duplicates.length)out.push('','DUPLICATES','',...state.duplicates.map(x=>`- ${x.term} → ${x.duplicate_of} (${x.reason})`));
  out.push('',DISCOVERY_RULE);
  return out.join('\n');
}
export function clustersReport(clusters){
  const out=['KEYWORD CLUSTERS (captured research only; no averaged statistics)',''];
  for(const c of clusters)out.push(`${c.label}  [${c.cluster_id}]  captured ${c.captured_count}, unavailable ${c.unavailable_count}`,
    ...c.keywords.map(k=>`  - ${k.keyword} (${k.relevance_class}, ${k.state})`),`  primary candidates: ${c.primary_candidate_terms.join(', ')||'none'}`,`  supporting: ${c.supporting_terms.join(', ')||'none'}`,'');
  return out.join('\n');
}
