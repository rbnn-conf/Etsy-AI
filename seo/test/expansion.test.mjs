// SEO Research Expansion + Keyword Clustering (ADR-034). DISCOVERY IS NOT
// EVIDENCE. Fixtures only: no network, no model, no Etsy, no Telegram, no
// Production Engine. Numbers in constructed (non-fixture) cases are unit-test
// inputs, not market claims; the demo uses only the owner's real seed values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateIdea, validateProfile, createResearchSet, createResearchPlan, applyResearch, markUnavailable, normaliseQuery, scoreOpportunities,
  createListingResearchPlan, createInitialRound, researchState, nextResearchRound, markRoundTermUnavailable, clusterKeywords, buildEvidencePackage, evidenceResearch,
  validateEvidencePackage, scoreEvidencePackage, auditListingFromEvidence, runResearchCommand, roundReport,
  MAX_TOTAL_RESEARCH_QUERIES, MAX_EXPANSION_ROUNDS, MAX_NEW_TERMS_PER_ROUND, WEIGHTS, RELEVANCE_VALUES, CONVERSION_VALUES, DEMAND_REFERENCE, COMPETITION_REFERENCE } from '../src/index.mjs';
import { finishWithCurrentEvidence, statusReport, OWNER_STOP_WARNING, FINISH_WITH_CURRENT_EVIDENCE } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..'), REPO=join(ROOT,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const NOW=new Date('2026-09-29T12:00:00Z');
const src={type:'etsy_marketplace_insights',method:'manual',captured_by:'test'};
const row=(keyword,extra={})=>({keyword,searches_30d:500,search_results:20000,conversion_label:'typical',trend_percent:null,captured_at:null,source:src,...extra});
const set=(rows,id='unit',previous=null)=>createResearchSet({research_id:id,rows,recorded_at:'2026-09-29T00:00:00.000Z',recorded_by:'test',previous});
const baseIdea={product_id:null,working_name:'Unit idea',product_type:'unit product',concept:'Unit concept.',audience:null,season:null,themes:[],format:null,page_count:null,
  owner_notes:null,candidate_keywords:[],status:'draft'};
const idea=x=>{const v=validateIdea({...baseIdea,...x});assert.ok(v.ok,v.errors.join());return v.idea;};
const prof=x=>{const v=validateProfile({schema_version:1,profile_id:'unit',describes:{mode:'NEW_PRODUCT',ref:'unit'},source:'unit',seasonality:null,notes:null,
  central_themes:['autumn','fall'],formats:['coloring pages','coloring book','coloring sheets'],components:[],audiences:['adults'],attributes:['cozy','printable','digital'],tangential:['pumpkin'],...x});assert.ok(v.ok,v.errors.join());return v.profile;};
const byTerm=(s,t)=>s.ledger.find(e=>e.term===t);

// The Cozy Autumn demonstration, as the owner would run it.
async function demo(){
  const i=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
  const profile=validateProfile(await json('fixtures/profiles/cozy-autumn-colouring-adults-structured.json')).profile;
  const cap=await json('fixtures/research-cycle/cozy-autumn/round-1-capture.json');
  const research=createResearchSet({research_id:cap.research_id,rows:cap.rows,recorded_at:cap.recorded_at,recorded_by:cap.recorded_by});
  let plan=applyResearch(createResearchPlan({idea:i,now:NOW}),research,{now:NOW});
  for(const u of cap.unavailable)plan=markUnavailable(plan,u.term,{note:u.note,now:NOW});
  return {i,profile,cap,research,plan,rounds:[createInitialRound({plan,profile,now:NOW})]};
}
const finishRound2=async d=>{
  const r2=nextResearchRound({plan:d.plan,profile:d.profile,research:d.research,rounds:d.rounds,now:NOW});
  let r=r2;for(const t of r2.requested_terms)r=markRoundTermUnavailable(r,t.term,{note:'SYNTHETIC FIXTURE: no real capture'});
  return {...d,r2,rounds:[...d.rounds,r]};
};

test('discovered ≠ researched: related terms carry no evidence; captured metrics are preserved exactly; missing stays null',async()=>{
  const d=await demo(), s=researchState(d);
  const disc=s.ledger.filter(e=>e.origin==='discovered');
  assert.ok(disc.length>0&&disc.every(e=>!['captured','planned','research_requested'].includes(e.state)));
  for(const e of disc){assert.equal(e.observation_id,null);assert.equal(e.metrics_supplied,'none');for(const k of ['term','normalized_term','discovered_from','discovered_at','metrics_supplied','relevance_class','decision','decision_reason'])assert.ok(k in e,k);}
  assert.equal(byTerm(s,'fall coloring pages for adults').discovered_at,'2026-09-29T00:00:00.000Z');
  const fall=d.research.observations.find(o=>o.keyword==='fall coloring pages');
  assert.deepEqual([fall.searches_30d,fall.search_results,fall.conversion_label,fall.trend_percent,fall.captured_at],[2300,29100,'very_high',null,null]);
  assert.ok(fall.related_terms.every(t=>t.searches_30d===null&&t.search_results===null&&t.conversion_label===null),'synthetic discoveries: no metrics');
  // Even ALL metrics supplied beside a related term do not make it researched.
  const r=set([row('fall coloring pages',{related_terms:[{term:'fall coloring pages for adults',searches_30d:120,search_results:900,conversion_label:'high'}]})]);
  const p=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn']}),now:NOW});
  const st=researchState({plan:applyResearch(p,r),profile:prof(),research:r,rounds:[createInitialRound({plan:p,profile:prof()})]});
  const t=byTerm(st,'fall coloring pages for adults');assert.equal(t.state,'discovered');assert.equal(t.metrics_supplied,'all');assert.equal(t.observation_id,null);
});

test('expansion decisions: EXACT and STRONG expand, a meaningful SUPPORTING term expands, WEAK and IRRELEVANT never do',()=>{
  const p=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn']}),now:NOW});
  const r=set([row('autumn coloring pages',{related_terms:[{term:'fall coloring pages for adults'},{term:'adult coloring sheets'},{term:'printable coloring sheets'},
    {term:'pumpkin coloring pages'},{term:'halloween coloring pages'},{term:'christmas coloring pages'},{term:'bridal shower activity'},{term:'cozy coloring pages'},{term:'coloring sheets'}]})]);
  const s=researchState({plan:applyResearch(p,r),profile:prof(),research:r,rounds:[createInitialRound({plan:p,profile:prof()})]});
  const want={'fall coloring pages for adults':['EXACT','discovered'],'adult coloring sheets':['STRONG','discovered'],'printable coloring sheets':['SUPPORTING','discovered'],
    'cozy coloring pages':['SUPPORTING','discovered'],'coloring sheets':['SUPPORTING','rejected'],'pumpkin coloring pages':['WEAK','rejected'],'halloween coloring pages':['IRRELEVANT','rejected'],
    'christmas coloring pages':['IRRELEVANT','rejected'],'bridal shower activity':['IRRELEVANT','rejected']};
  for(const [t,[cls,state]] of Object.entries(want)){const e=byTerm(s,t);assert.equal(e.relevance_class,cls,t);assert.equal(e.state,state,t);}
  // The plan never mentions "cozy" or "printable": each is a new buyer-intent word ("sheet" came with "adult coloring sheets").
  assert.match(byTerm(s,'cozy coloring pages').decision_reason,/buyer-intent word no planned or researched query covers \(cozy\)/);
  assert.match(byTerm(s,'printable coloring sheets').decision_reason,/buyer-intent word no planned or researched query covers \(printable\)/);
  assert.match(byTerm(s,'coloring sheets').decision_reason,/adds no buyer-intent word beyond terms already planned, researched or requested/);
  assert.deepEqual(s.candidates,['fall coloring pages for adults','adult coloring sheets','cozy coloring pages','printable coloring sheets'],'EXACT, STRONG, then SUPPORTING');
  assert.match(byTerm(s,'halloween coloring pages').decision_reason,/irrelevant to the original product idea: contains "halloween"/);
});

test('seasonal and niche leakage is blocked: related Halloween/Christmas/bridal terms never reach a research round',async()=>{
  const d=await demo(), r2=nextResearchRound({...d,now:NOW});
  const asked=r2.requested_terms.map(t=>t.term);
  assert.ok(!asked.some(t=>/halloween|christmas|bridal|pumpkin/.test(t)));
  assert.deepEqual(r2.rejected_terms.map(t=>t.term).sort(),['bridal shower activity','christmas coloring pages','coloring sheets','halloween coloring pages','pumpkin coloring pages']);
  assert.match(roundReport(r2),/DO NOT RESEARCH:\n\nbridal shower activity\nreason: irrelevant to the original product idea/);
});

test('duplicates: case, punctuation, colour/color, cosy/cozy and plurals collapse with duplicate_of; distinct intents are kept',async()=>{
  const d=await demo(), s=researchState(d);
  const dup=Object.fromEntries(s.duplicates.map(x=>[x.term,x.duplicate_of]));
  assert.equal(dup['adult colouring pages'],'adult coloring pages');assert.equal(dup['cozy coloring books'],'cozy coloring book');assert.equal(dup['adult coloring book'],'adult coloring book');
  assert.equal(normaliseQuery('Cosy, Colouring-Books!'),normaliseQuery('cozy coloring book'));
  assert.equal(byTerm(s,'fall coloring pages for adults').state,'discovered','not collapsed into "fall coloring pages" or "adult coloring pages"');
  assert.equal(byTerm(s,'fall coloring pages for adults').discovered_from.length,2,'"Fall Coloring Pages for Adults" and the lowercase wording are one term from two sources');
  const r=set([row('autumn coloring pages',{related_terms:[{term:'Autumn Coloring Sheet'},{term:'autumn colouring sheets'}]})]);
  const p=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn']}),now:NOW});
  const s2=researchState({plan:applyResearch(p,r),profile:prof(),research:r,rounds:[createInitialRound({plan:p,profile:prof()})]});
  assert.equal(s2.ledger.filter(e=>e.normalized_term===normaliseQuery('autumn coloring sheets')).length,1);
  assert.deepEqual(s2.duplicates.map(x=>[x.term,x.duplicate_of]),[['autumn colouring sheets','autumn coloring sheet']]);
});

test('priority: within a class, terms surfaced by more researched queries come first; then text',async()=>{
  const d=await demo(), r2=nextResearchRound({...d,now:NOW});
  assert.deepEqual(r2.requested_terms.map(t=>[t.term,t.discovered_from.length]),[['cozy fall coloring pages',2],['fall coloring pages for adults',2],['autumn coloring sheets',1]]);
  assert.ok(r2.requested_terms.every(t=>t.required&&t.observation_status==='not_researched'));
});

// Budget: many EXACT discoveries (theme words t1…t40 in a unit profile).
function budgetSetup(extraThemes=[]){
  const themes=Array.from({length:40},(_,k)=>`t${k+1}`);
  const profile=prof({central_themes:['autumn','fall',...themes]});
  const p0=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn',...extraThemes],audiences:['adults']}),now:NOW});
  const rel=themes.map(t=>({term:`${t} coloring pages`}));
  const r=set([row('autumn coloring pages',{related_terms:rel}),row('fall coloring pages'),row('adult coloring pages')]);
  let plan=applyResearch(p0,r);
  for(const q of plan.queries.filter(q=>q.required&&q.observation_status==='not_researched'))plan=markUnavailable(plan,q.query);
  return {plan,profile,research:r,rounds:[createInitialRound({plan,profile})]};
}
const closeRound=r=>r.requested_terms.reduce((acc,t)=>markRoundTermUnavailable(acc,t.term),r);

test('budget: at most 10 new terms per round, 3 expansion rounds and 40 research queries; truncation is explained',()=>{
  const b=budgetSetup();
  assert.throws(()=>nextResearchRound({...b,rounds:[...b.rounds,{...b.rounds[0],round_number:2,requested_terms:[{term:'x',normalized_term:'x',required:true,observation_status:'not_researched'}],rejected_terms:[],duplicates:[],discovered_terms:[]}]}),/still pending capture/);
  let rounds=b.rounds;
  const r2=nextResearchRound({...b,rounds});assert.equal(r2.requested_terms.length,MAX_NEW_TERMS_PER_ROUND);assert.equal(r2.expansion_truncated,true);
  assert.equal(r2.not_requested.length,30);assert.match(r2.not_requested[0].reason,/at most 10 new terms per round and 40 research queries/);
  rounds=[...rounds,closeRound(r2)];
  assert.equal(researchState({...b,rounds}).round_statuses[1].status,'truncated');
  const r3=nextResearchRound({...b,rounds});rounds=[...rounds,closeRound(r3)];
  const r4=nextResearchRound({...b,rounds});rounds=[...rounds,closeRound(r4)];
  const total=b.plan.queries.length+r2.requested_terms.length+r3.requested_terms.length+r4.requested_terms.length;
  assert.ok(total<=MAX_TOTAL_RESEARCH_QUERIES);assert.equal(r4.requested_terms.length,Math.min(10,MAX_TOTAL_RESEARCH_QUERIES-b.plan.queries.length-20));
  assert.throws(()=>nextResearchRound({...b,rounds}),new RegExp(`maximum expansion rounds reached \\(${MAX_EXPANSION_ROUNDS}\\)`));
  const s=researchState({...b,rounds});
  assert.equal(s.budget.exhausted,true);assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS');
  assert.ok(s.readiness.warnings.some(w=>/expansion truncated: the budget is exhausted, so .* never researched/.test(w)));
  // The 40-query ceiling binds before the round limit when the plan is large.
  const big=budgetSetup(['cozy','forest','harvest','cafe','woodland']);
  let rr=big.rounds;const sizes=[];
  for(;;){let n;try{n=nextResearchRound({...big,rounds:rr});}catch{break;}sizes.push(n.requested_terms.length);rr=[...rr,closeRound(n)];}
  assert.equal(big.plan.queries.length+sizes.reduce((a,b)=>a+b,0),MAX_TOTAL_RESEARCH_QUERIES);assert.ok(sizes.every(x=>x<=10));
});

test('readiness: P1 completion, minimum relevant evidence, EXACT/STRONG evidence, READY_TO_SCORE and EXPANSION_RECOMMENDED',()=>{
  const i=idea({formats:['coloring pages'],themes:['autumn'],audiences:['adults'],styles:['cozy']}), profile=prof();
  const plan0=createResearchPlan({idea:i,now:NOW}), r1=[createInitialRound({plan:plan0,profile})];
  const st=(rows,unavailable=[])=>{const r=set(rows);let p=applyResearch(plan0,r);for(const u of unavailable)p=markUnavailable(p,u);return researchState({plan:p,profile,research:r,rounds:r1});};
  // P1 = autumn / fall / adult coloring pages.
  let s=st([row('autumn coloring pages'),row('fall coloring pages')]);
  assert.equal(s.readiness.status,'RESEARCH_INCOMPLETE');assert.match(s.readiness.reasons[0],/1 required P1 query is not yet captured or marked unavailable: adult coloring pages/);
  s=st([row('autumn coloring pages'),row('fall coloring pages')],['adult coloring pages']);
  assert.equal(s.readiness.status,'RESEARCH_INCOMPLETE');assert.match(s.readiness.reasons.join(),/2 relevant captured observations with complete metrics \(3 needed\)/);
  s=st([row('coloring pages'),row('coloring book'),row('cozy coloring pages')],['autumn coloring pages','fall coloring pages','adult coloring pages']);
  assert.equal(s.readiness.status,'RESEARCH_INCOMPLETE');assert.match(s.readiness.reasons.join(),/no EXACT or STRONG keyword has been captured/);
  s=st([row('autumn coloring pages'),row('fall coloring pages'),row('adult coloring pages'),row('coloring pages')]);
  assert.equal(s.readiness.status,'READY_TO_SCORE');assert.deepEqual(s.readiness.warnings,[]);
  s=st([row('autumn coloring pages',{related_terms:[{term:'autumn coloring sheets'}]}),row('fall coloring pages'),row('adult coloring pages'),row('coloring pages')]);
  assert.equal(s.readiness.status,'EXPANSION_RECOMMENDED');assert.match(s.readiness.reasons[0],/1 relevant discovered term needs its own Marketplace Insights lookup: autumn coloring sheets/);
  s=st([row('autumn coloring pages',{searches_30d:null}),row('fall coloring pages'),row('adult coloring pages'),row('coloring pages')]);
  assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS');assert.ok(s.readiness.warnings.some(w=>/captured without searches or results \(not counted as evidence, not zero\): autumn coloring pages/.test(w)));
});

test('Cozy Autumn cycle: round 1 → discoveries → round 2 → unavailable → READY_TO_SCORE_WITH_WARNINGS → captured-only package → Opportunity Engine',async()=>{
  let d=await demo();
  assert.equal(researchState(d).readiness.status,'EXPANSION_RECOMMENDED');
  const r2=nextResearchRound({...d,now:NOW});
  assert.equal(researchState({...d,rounds:[...d.rounds,r2]}).readiness.status,'RESEARCH_INCOMPLETE','round 2 pending');
  assert.throws(()=>buildEvidencePackage({...d,rounds:[...d.rounds,r2]}),/evidence package refused: research is RESEARCH_INCOMPLETE/);
  d=await finishRound2(d);
  const s=researchState(d);
  assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS');
  assert.deepEqual(s.readiness.counts,{required_p1:4,p1_pending:0,requested_pending:0,captured:3,relevant_captured:3,exact_or_strong_captured:2,expansion_candidates:0,owner_stopped:0});
  const pkg=buildEvidencePackage({...d,now:NOW});
  assert.deepEqual(pkg.captured_observations.map(o=>o.keyword),['adult coloring pages','cozy coloring book','fall coloring pages']);
  for(const o of pkg.captured_observations){const {related_terms,...orig}=d.research.observations.find(x=>x.observation_id===o.observation_id);assert.deepEqual(o,orig,'exact copy');assert.ok(!('related_terms' in o));}
  assert.deepEqual(pkg.unavailable_terms.map(t=>t.term).sort(),['autumn coloring pages','autumn coloring sheets','cozy coloring pages','cozy fall coloring pages','fall coloring pages for adults']);
  assert.equal(pkg.performance_evidence,null);assert.deepEqual(validateEvidencePackage(pkg,d.research),{ok:true,errors:[]});
  const result=scoreEvidencePackage({pkg,profile:d.profile});
  assert.deepEqual(result.diagnostics.map(r=>r.keyword),['fall coloring pages','adult coloring pages','cozy coloring book'],'only captured observations are scored');
  assert.equal(result.primary_keyword,'fall coloring pages');assert.deepEqual(result.secondary_keywords,['adult coloring pages']);
  assert.ok(!result.diagnostics.some(r=>/for adults|sheets|cozy fall|halloween|christmas|bridal/.test(r.keyword)),'no synthetic discovered term enters the Opportunity Engine');
});

test('unavailable ≠ zero demand, and a tampered package is rejected',async()=>{
  const d=await finishRound2(await demo()), pkg=buildEvidencePackage({...d,now:NOW});
  const ev=evidenceResearch(pkg);
  assert.ok(!ev.observations.some(o=>o.searches_30d===0),'nothing is filled with zero');
  assert.ok(!ev.observations.some(o=>pkg.unavailable_terms.some(t=>normaliseQuery(t.term)===normaliseQuery(o.keyword))));
  const t=structuredClone(pkg);t.captured_observations[0].searches_30d=99999;
  assert.match(validateEvidencePackage(t,d.research).errors.join(),/differs from the captured observation/);
  const f=structuredClone(pkg);f.captured_observations.push({...f.captured_observations[0],observation_id:'obs-0000000000000000',keyword:'fall coloring pages for adults'});
  assert.match(validateEvidencePackage(f,d.research).errors.join(),/is not an observation of the cited research/);
});

test('clusters: from profile facets, multi-membership, captured/unavailable counts, no aggregated statistics, deterministic',async()=>{
  const d=await finishRound2(await demo()), c=clusterKeywords({state:researchState(d),profile:d.profile});
  const by=Object.fromEntries(c.map(x=>[x.cluster_id,x]));
  assert.deepEqual(c.map(x=>x.cluster_id),['theme-autumn','audience-adult','style-cozy','long-tail']);
  assert.equal(by['theme-autumn'].label,'Theme: autumn / fall');assert.deepEqual(by['theme-autumn'].primary_candidate_terms,['fall coloring pages']);
  assert.deepEqual([by['theme-autumn'].captured_count,by['theme-autumn'].unavailable_count],[1,4]);
  assert.deepEqual(by['style-cozy'].supporting_terms,['cozy coloring book']);
  const multi=c.filter(x=>x.keywords.some(k=>k.keyword==='fall coloring pages for adults')).map(x=>x.cluster_id);
  assert.deepEqual(multi,['theme-autumn','audience-adult','long-tail'],'one keyword, several justified clusters');
  for(const x of c)assert.deepEqual(Object.keys(x).sort(),['captured_count','cluster_id','cluster_type','keywords','label','primary_candidate_terms','supporting_terms','unavailable_count'],'no invented metrics');
  const rev={...d,research:set([...d.cap.rows].reverse(),'cozy-autumn-demo')};
  assert.deepEqual(clusterKeywords({state:researchState(rev),profile:d.profile}),c);
  // Delivery and core clusters appear when such terms are captured.
  const p=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn'],delivery:['printable']}),now:NOW});
  const r=set([row('printable coloring pages'),row('coloring pages'),row('autumn coloring pages')]);
  const cc=clusterKeywords({state:researchState({plan:applyResearch(p,r),profile:prof(),research:r,rounds:[createInitialRound({plan:p,profile:prof()})]}),profile:prof()});
  assert.deepEqual(cc.map(x=>x.cluster_id),['core-product','theme-autumn','delivery-printable']);
});

test('existing listing: plan → capture → expansion → readiness → package → SEO audit; the product and Etsy are untouched',async()=>{
  const snapshot=await json('fixtures/listings/005-cozy-autumn-adventures.json'), profile=validateProfile(await json('fixtures/profiles/005-cozy-autumn-adventures.json')).profile;
  const before=await readFile(join(REPO,snapshot.source.file)).then(b=>createHash('sha256').update(b).digest('hex'),()=>null);
  const plan0=createListingResearchPlan({snapshot,profile,now:NOW});
  assert.equal(plan0.mode,'EXISTING_LISTING');assert.ok(plan0.queries.length<=40);
  assert.ok(plan0.queries.some(q=>q.intent_type==='existing_term'&&q.query==='autumn coloring'));
  assert.ok(plan0.warnings.some(w=>/current tag "pumpkin coloring" is WEAK/.test(w)),'weak current tags are not researched');
  const f=await json('fixtures/marketplace-insights/manual-capture-01.json');
  const seed=createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by});
  let plan=applyResearch(plan0,seed);const rounds=[createInitialRound({plan,profile})];
  assert.equal(researchState({plan,profile,research:seed,rounds}).readiness.status,'RESEARCH_INCOMPLETE');
  for(const q of plan.queries.filter(q=>q.required&&q.observation_status!=='captured'))plan=markUnavailable(plan,q.query);
  const s=researchState({plan,profile,research:seed,rounds});
  // Captured for this listing's plan: fall coloring pages (EXACT), cozy coloring book (current tag), digital coloring book (SUPPORTING).
  assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS',s.readiness.reasons.join());
  assert.equal(s.readiness.counts.relevant_captured,3);assert.ok(s.readiness.warnings.some(w=>/thin evidence/.test(w)));
  const pkg=buildEvidencePackage({plan,profile,research:seed,rounds,now:NOW});
  assert.deepEqual(pkg.captured_observations.map(o=>o.keyword),['cozy coloring book','digital coloring book','fall coloring pages']);
  assert.ok(pkg.warnings.some(w=>/9 observations in the research set are not a research term of this plan/.test(w)),'Halloween, Christmas and adult observations are excluded');
  const audit=auditListingFromEvidence({snapshot,profile,pkg,now:NOW});
  assert.equal(audit.product_action,'none');assert.equal(audit.etsy_action,'none');assert.equal(audit.recommended_primary_intent,'fall coloring pages');
  assert.throws(()=>auditListingFromEvidence({snapshot:{...snapshot,snapshot_id:'other'},profile,pkg}),/does not belong to this listing/);
  const after=await readFile(join(REPO,snapshot.source.file)).then(b=>createHash('sha256').update(b).digest('hex'),()=>null);
  assert.equal(after,before);
});

test('owner workflow CLI: init, round, import, discovered, next-round, clusters, readiness, status, score (temp folder only)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seo-research-'));
  try{
    const run=(...a)=>runResearchCommand([...a,'--dir',dir],{now:NOW});
    assert.match(await run('init','--idea',join(ROOT,'fixtures/ideas/cozy-autumn-colouring-adults-structured.json'),'--profile',join(ROOT,'fixtures/profiles/cozy-autumn-colouring-adults-structured.json'),'--research-id','cozy-autumn-demo'),/SEO RESEARCH PLAN/);
    assert.match(await run('round'),/RESEARCH ROUND 1/);
    assert.match(await run('import',join(ROOT,'fixtures/research-cycle/cozy-autumn/round-1-capture.json')),/READINESS: EXPANSION_RECOMMENDED/);
    assert.match(await run('discovered'),/halloween coloring pages  \[rejected, IRRELEVANT\]/);
    await assert.rejects(run('score'),/evidence package refused/);
    assert.match(await run('next-round'),/RESEARCH ROUND 2\n\nSEARCH NEXT:\n\n1\. cozy fall coloring pages\n   discovered from:\n   - cozy coloring book\n   - fall coloring pages/);
    assert.match(await run('readiness'),/RESEARCH_INCOMPLETE/);
    assert.match(await run('import',join(ROOT,'fixtures/research-cycle/cozy-autumn/round-2-capture.json')),/READINESS: READY_TO_SCORE_WITH_WARNINGS/);
    assert.match(await run('status'),/Rounds: 1=complete, 2=complete\nBudget: 20\/40 queries, 1\/3 expansion rounds/);
    assert.match(await run('clusters'),/Theme: autumn \/ fall  \[theme-autumn\]  captured 1, unavailable 4/);
    const out=await run('score');
    assert.match(out,/Evidence package evidence-[0-9a-f]{16} \(3 captured observations, READY_TO_SCORE_WITH_WARNINGS\)/);assert.match(out,/PRIMARY: fall coloring pages/);
    assert.match(await runResearchCommand([]),/^usage: research/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('boundaries: formula unchanged; no network, model, Etsy, Telegram, Production Engine or performance data in expansion',async()=>{
  assert.deepEqual({...WEIGHTS},{demand:0.20,competition:0.15,conversion:0.30,relevance:0.25,trend:0.05,seasonality:0.05});
  assert.deepEqual({...RELEVANCE_VALUES},{EXACT:100,STRONG:85,SUPPORTING:65,WEAK:30,IRRELEVANT:0});
  assert.deepEqual({...CONVERSION_VALUES},{very_high:100,high:80,typical:60,low:30,very_low:10,unknown:40});
  assert.equal(DEMAND_REFERENCE,10000);assert.equal(COMPETITION_REFERENCE,1000000);
  for(const f of ['src/expansion.mjs','src/workspace.mjs','scripts/research.mjs']){
    const t=(await readFile(join(ROOT,f),'utf8')).replace(/^\s*\/\/.*$/gm,'');
    for(const m of t.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g))assert.ok(/^node:(crypto|fs\/promises|path)$/.test(m[1])||/^\.\.?\/(src\/)?[a-z-]+\.mjs$/.test(m[1]),`${f} imports ${m[1]}`);
    assert.doesNotMatch(t,/\bfetch\(|https?:\/\/|openai|telegram|etsy\.com|api\.etsy|child_process|performance\.mjs|production\/|automation\//i,f);
  }
  for(const [schema,obj] of [['research-round',createInitialRound({plan:createResearchPlan({idea:idea({formats:['planner'],themes:['budget']}),now:NOW}),profile:prof()})],
    ['evidence-package',buildEvidencePackage({...(await finishRound2(await demo())),now:NOW})]])
    assert.deepEqual([...(await json(`schemas/${schema}.schema.json`)).required].sort(),Object.keys(obj).sort(),schema);
  assert.equal(scoreOpportunities.length,1,'the Opportunity Engine keeps its single-argument signature');
});

// ---- FINISH_WITH_CURRENT_EVIDENCE (owner stop) ------------------------------
test('owner stop: a pending expansion round is finished; requested terms stay unknown (owner_stopped), captured evidence is untouched',async()=>{
  const d=await demo(), r2=nextResearchRound({...d,now:NOW}), rounds=[...d.rounds,r2];
  const before=structuredClone(d.research);
  const rs=finishWithCurrentEvidence({rounds,research:d.research,decided_by:'owner',note:'enough evidence',now:NOW});
  assert.equal(rs.at(-1).owner_finished.action,FINISH_WITH_CURRENT_EVIDENCE);
  assert.deepEqual(rs.at(-1).owner_finished.terms_not_researched,r2.requested_terms.map(t=>t.term));
  assert.deepEqual(d.research,before,'captured research untouched');assert.equal(rounds[1].owner_finished,undefined,'inputs not mutated');
  const s=researchState({...d,rounds:rs});
  for(const t of r2.requested_terms){const e=byTerm(s,t.term);assert.equal(e.state,'owner_stopped',t.term);assert.equal(e.observation_id,null);}
  assert.ok(!s.ledger.some(e=>r2.requested_terms.some(t=>t.term===e.term)&&['unavailable','rejected','captured'].includes(e.state)),'not unavailable, not rejected');
  assert.equal(s.round_statuses[1].status,'owner_stopped');
  assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS');
  const w=s.readiness.warnings.find(x=>x.startsWith(OWNER_STOP_WARNING));
  assert.ok(w,'the stop warning is present');for(const t of r2.requested_terms)assert.ok(w.includes(t.term),t.term);
  assert.match(w,/not unavailable, not rejected, not zero, and not evidence/);
  assert.throws(()=>nextResearchRound({...d,rounds:rs}),/finished by the owner/);
  assert.throws(()=>finishWithCurrentEvidence({rounds:rs,research:d.research}),/already finished/);
  // Evidence: only the three captured observations; the stopped terms are listed as unknown, not unavailable.
  const pkg=buildEvidencePackage({...d,rounds:rs,now:NOW});
  assert.deepEqual(pkg.captured_observations.map(o=>o.keyword),['adult coloring pages','cozy coloring book','fall coloring pages']);
  for(const o of pkg.captured_observations){const {related_terms,...orig}=before.observations.find(x=>x.observation_id===o.observation_id);assert.deepEqual(o,orig);}
  assert.deepEqual(pkg.unresearched_terms.map(t=>t.term),['autumn coloring sheets','cozy fall coloring pages','fall coloring pages for adults']);
  assert.deepEqual(pkg.unavailable_terms.map(t=>t.term).sort(),['autumn coloring pages','cozy coloring pages'],'stopped terms are not reported as unavailable');
  assert.equal(pkg.owner_finished.decided_by,'owner');assert.deepEqual(validateEvidencePackage(pkg,d.research),{ok:true,errors:[]});
  const scored=scoreEvidencePackage({pkg,profile:d.profile});
  assert.deepEqual(scored.diagnostics.map(r=>r.keyword),['fall coloring pages','adult coloring pages','cozy coloring book']);
});

test('owner stop: discovery-side metrics of unresearched requested terms never become evidence or reach scoring',()=>{
  const profile=prof(), plan0=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn'],audiences:['adults']}),now:NOW});
  // Unit inputs: Etsy's similar-terms table showed figures for "autumn coloring sheets" (discovery metadata only).
  const r=set([row('autumn coloring pages',{related_terms:[{term:'autumn coloring sheets',searches_30d:98765,search_results:4321,conversion_label:'very_high'}]}),
    row('fall coloring pages'),row('adult coloring pages'),row('coloring pages')]);
  const plan=applyResearch(plan0,r), rounds=[createInitialRound({plan,profile})];
  assert.equal(researchState({plan,profile,research:r,rounds}).readiness.status,'EXPANSION_RECOMMENDED');
  const r2=nextResearchRound({plan,profile,research:r,rounds,now:NOW});
  assert.equal(r2.requested_terms[0].metrics_supplied,'all');
  const rs=finishWithCurrentEvidence({rounds:[...rounds,r2],research:r,now:NOW});
  const pkg=buildEvidencePackage({plan,profile,research:r,rounds:rs,now:NOW});
  assert.equal(pkg.readiness_status,'READY_TO_SCORE_WITH_WARNINGS');
  assert.ok(!pkg.captured_observations.some(o=>o.keyword==='autumn coloring sheets'||o.searches_30d===98765||o.search_results===4321));
  assert.ok(!pkg.captured_observations.some(o=>'related_terms' in o),'related-term tables are not copied into evidence');
  const scored=scoreEvidencePackage({pkg,profile});
  assert.ok(!scored.diagnostics.some(x=>x.keyword==='autumn coloring sheets'||x.searches_30d===98765));
  assert.ok(!JSON.stringify(scored).includes('98765'));
});

test('owner stop: minimum evidence still applies; stopping too early stays RESEARCH_INCOMPLETE and no package is built',()=>{
  const profile=prof(), plan0=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn'],audiences:['adults']}),now:NOW});
  const r=set([row('autumn coloring pages',{related_terms:[{term:'autumn coloring sheets'}]})]);
  let plan=applyResearch(plan0,r);plan=markUnavailable(plan,'fall coloring pages');plan=markUnavailable(plan,'adult coloring pages');
  const rounds=[createInitialRound({plan,profile})];
  const r2=nextResearchRound({plan,profile,research:r,rounds,now:NOW});
  const rs=finishWithCurrentEvidence({rounds:[...rounds,r2],research:r,now:NOW});
  const s=researchState({plan,profile,research:r,rounds:rs});
  assert.equal(s.readiness.status,'RESEARCH_INCOMPLETE');
  assert.match(s.readiness.reasons.join(' | '),/1 relevant captured observation with complete metrics \(3 needed\)/);
  assert.match(s.readiness.reasons.join(' | '),/the owner finished research with current evidence .* stopping cannot replace missing evidence/);
  assert.throws(()=>buildEvidencePackage({plan,profile,research:r,rounds:rs}),/evidence package refused: research is RESEARCH_INCOMPLETE/);
  // Finishing during round 1 does not excuse an unanswered required P1 query.
  const r1=set([row('autumn coloring pages'),row('fall coloring pages')]), p1=applyResearch(plan0,r1);
  const s1=researchState({plan:p1,profile,research:r1,rounds:finishWithCurrentEvidence({rounds:[createInitialRound({plan:p1,profile})],research:r1,now:NOW})});
  assert.equal(s1.readiness.status,'RESEARCH_INCOMPLETE');assert.match(s1.readiness.reasons[0],/required P1 query is not yet captured or marked unavailable: adult coloring pages/);
});

test('duplicate reporting: terms already decided in an earlier round are not re-counted as duplicates (regression)',async()=>{
  const d=await demo();
  const expected=[['adult coloring book','adult coloring book'],['adult colouring pages','adult coloring pages'],['cozy coloring books','cozy coloring book']];
  const pairs=s=>s.duplicates.map(x=>[x.term,x.duplicate_of]).sort((a,b)=>a[0].localeCompare(b[0]));
  assert.deepEqual(pairs(researchState(d)),expected);
  const r2=nextResearchRound({...d,now:NOW}), s=researchState({...d,rounds:[...d.rounds,r2]});
  assert.deepEqual(pairs(s),expected,'5 rejected + 3 requested terms are not duplicates of themselves');
  assert.match(statusReport(s),/ · duplicate 3$/m);
  assert.match(statusReport(s),/rejected 5/);
  const stopped=researchState({...d,rounds:finishWithCurrentEvidence({rounds:[...d.rounds,r2],research:d.research,now:NOW})});
  assert.deepEqual(pairs(stopped),expected);assert.match(statusReport(stopped),/owner_stopped 3/);
});

test('normal completion path is unchanged by the owner-stop feature',async()=>{
  const d=await finishRound2(await demo()), s=researchState(d);
  assert.equal(s.owner_finished,null);assert.equal(s.round_statuses[1].status,'complete');
  assert.ok(!s.readiness.warnings.some(w=>w.startsWith(OWNER_STOP_WARNING)));
  const pkg=buildEvidencePackage({...d,now:NOW});
  assert.deepEqual(pkg.unresearched_terms,[]);assert.equal(pkg.owner_finished,null);
  assert.equal(pkg.unavailable_terms.length,5);
});
