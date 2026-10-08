// SEO Research Planner (ADR-033). A generated research query is NOT evidence of
// market demand. Fixtures only: no network, no model, no Etsy, no Telegram,
// no Production Engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateIdea, validateObservation, createResearchSet, validateProfile, scoreOpportunities, resolveIdea, generateQueries, normaliseQuery, createResearchPlan,
  applyResearch, markUnavailable, setPlanStatus, planExistingListingResearch, researchPlanReport, MAX_QUERIES, WEIGHTS, RELEVANCE_VALUES, CONVERSION_VALUES,
  DEMAND_REFERENCE, COMPETITION_REFERENCE } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const NOW=new Date('2026-09-29T12:00:00Z');
const base={product_id:null,working_name:'Test product',product_type:'test product',concept:'A test concept.',audience:null,season:null,themes:[],format:null,page_count:null,
  owner_notes:null,candidate_keywords:[],status:'draft'};
const idea=(extra={})=>{const v=validateIdea({...base,...extra});assert.ok(v.ok,v.errors.join());return v.idea;};
const demo=async()=>validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
const qs=plan=>plan.queries.map(q=>q.query);
const row=(keyword,extra={})=>({keyword,searches_30d:100,search_results:1000,conversion_label:'typical',trend_percent:null,captured_at:null,
  source:{type:'etsy_marketplace_insights',method:'manual',captured_by:'test'},...extra});
const seed=async()=>{const f=await json('fixtures/marketplace-insights/manual-capture-01.json');return createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by});};

test('idea intake: optional structured fields validate; existing ideas stay valid and gain nulls, never guesses',async()=>{
  const old=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json'));
  assert.equal(old.ok,true);for(const k of ['audiences','delivery','formats','styles','item_count'])assert.equal(old.idea[k],null,k);
  const d=await demo();assert.deepEqual(d.delivery,['digital','printable']);assert.deepEqual(d.audiences,['adults']);
  const bad=validateIdea({...base,delivery:['pdf'],audiences:'adults',item_count:0,formats:['']});
  assert.equal(bad.ok,false);
  for(const re of [/delivery must be null or a list of: digital, printable, physical, editable, other/,/audiences must be null or a list/,/item_count/,/formats must be/])assert.match(bad.errors.join(' | '),re);
});

test('idea completeness: complete / usable_with_warnings / insufficient, with the missing fields named',async()=>{
  const full=resolveIdea(await demo());
  assert.equal(full.idea_completeness,'complete');assert.deepEqual(full.missing_fields,[]);
  const noAud=resolveIdea(idea({formats:['coloring pages'],themes:['autumn'],delivery:['digital']}));
  assert.equal(noAud.idea_completeness,'usable_with_warnings');assert.deepEqual(noAud.missing_fields,['audiences']);
  assert.ok(noAud.warnings.some(w=>/No audience supplied.*not guessed/.test(w)));
  const noDel=resolveIdea(idea({formats:['coloring pages'],themes:['autumn'],audiences:['adults']}));
  assert.deepEqual(noDel.missing_fields,['delivery']);assert.deepEqual(noDel.delivery,[]);
  assert.ok(noDel.warnings.some(w=>/No delivery method supplied.*not assumed/.test(w)));
  const noFmt=resolveIdea(idea({themes:['autumn'],audiences:['adults'],delivery:['digital']}));
  assert.equal(noFmt.idea_completeness,'insufficient');assert.ok(noFmt.missing_fields.includes('formats'));
  const plan=createResearchPlan({idea:idea({themes:['autumn']}),now:NOW});
  assert.equal(plan.idea_completeness,'insufficient');assert.deepEqual(plan.queries,[],'no product format: nothing to research');
});

test('free text establishes only what it states: "cozy autumn colouring pages for adults" never implies digital',()=>{
  const r=resolveIdea(idea({working_name:'Cozy autumn colouring pages for adults',product_type:'colouring pages',themes:['autumn','cozy']}));
  assert.deepEqual(r.formats,['coloring pages']);assert.deepEqual(r.audiences,['adults']);assert.deepEqual(r.delivery,[]);
  assert.equal(r.sources.formats,'extracted_from_text');assert.equal(r.sources.delivery,null);
  assert.equal(r.idea_completeness,'usable_with_warnings');assert.ok(r.warnings.some(w=>/formats not supplied as structured data.*Confirm it/.test(w)));
  const p=resolveIdea(idea({working_name:'Printable budget planner',product_type:'planner'}));
  assert.deepEqual(p.delivery,['printable'],'the literal word is supplied, so it is used (and flagged)');assert.equal(p.sources.delivery,'extracted_from_text');
});

test('generic product types: planners, spreadsheets, cards, invitations and party kits all get sensible queries',()=>{
  const plan=x=>qs(createResearchPlan({idea:idea(x),now:NOW}));
  const planner=plan({formats:['planner'],themes:['budget'],styles:['minimalist'],audiences:['adults'],delivery:['printable']});
  for(const q of ['budget planner','adult planner','minimalist planner','printable planner','planner'])assert.ok(planner.includes(q),q);
  const sheet=plan({formats:['spreadsheet'],themes:['budget'],delivery:['editable','digital']});
  for(const q of ['budget spreadsheet','budget spreadsheet template','editable spreadsheet','digital spreadsheet template'])assert.ok(sheet.includes(q),q);
  const card=plan({formats:['greeting card'],themes:['christmas'],styles:['traditional'],audiences:['families'],delivery:['printable']});
  for(const q of ['christmas greeting card','christmas card','family greeting card','traditional greeting card','printable greeting card'])assert.ok(card.includes(q),q);
  const inv=plan({formats:['invitation'],themes:['birthday'],audiences:['kids'],delivery:['editable']});
  for(const q of ['birthday invitation','birthday invite','kids invitation','editable invitation'])assert.ok(inv.includes(q),q);
  assert.ok(plan({formats:['party kit'],themes:['halloween']}).includes('halloween party kit'));
  assert.ok(plan({formats:['wedding seating chart'],themes:['rustic']}).includes('rustic wedding seating chart'),'an unlisted format is used as given');
});

test('core, theme, audience, attribute, theme+audience and delivery combinations, with P1/P2/P3 priorities',()=>{
  const p=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['ghost'],styles:['cute'],audiences:['kids'],delivery:['printable']}),now:NOW});
  const by=Object.fromEntries(p.queries.map(q=>[q.query,q]));
  const expect={'ghost coloring pages':['theme_product','P1'],'kids coloring pages':['audience_product','P1'],'ghost coloring book':['theme_product','P2'],
    'kids coloring book':['audience_product','P2'],'cute coloring pages':['attribute_product','P2'],'ghost coloring pages kids':['theme_audience_product','P2'],
    'printable coloring pages':['delivery_variant','P2'],'coloring pages':['core_product','P2'],'coloring book':['core_product','P3'],'cute coloring book':['attribute_product','P3'],
    'printable coloring book':['delivery_variant','P3']};
  for(const [q,[t,pr]] of Object.entries(expect)){assert.ok(by[q],q);assert.equal(by[q].intent_type,t,q);assert.equal(by[q].priority,pr,q);assert.ok(by[q].reason.length>10);}
  assert.equal(p.queries.length,Object.keys(expect).length,'nothing else');
  assert.ok(p.queries.filter(q=>q.priority==='P1').every(q=>q.required)&&p.queries.filter(q=>q.priority!=='P1').every(q=>!q.required));
  assert.deepEqual(p.queries.map(q=>q.priority),[...p.queries.map(q=>q.priority)].sort(),'P1 first, then P2, then P3');
});

test('delivery variants only when delivery is supplied; physical and other add no search words',()=>{
  const none=qs(createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn']}),now:NOW}));
  assert.ok(!none.some(q=>/printable|digital|editable/.test(q)));
  const phys=qs(createResearchPlan({idea:idea({formats:['journal'],themes:['travel'],delivery:['physical','other']}),now:NOW}));
  assert.deepEqual(phys,['travel journal','journal']);
});

test('regional variants and normalisation: autumn ↔ fall kept separate; colouring = coloring; plural, case, punctuation, spaces',()=>{
  const q=qs(createResearchPlan({idea:idea({formats:['colouring pages'],themes:['Autumn']}),now:NOW}));
  assert.ok(q.includes('autumn coloring pages')&&q.includes('fall coloring pages'),'both season words are researched');
  const fall=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['fall']}),now:NOW}).queries;
  assert.equal(fall.find(x=>x.query==='autumn coloring pages').intent_type,'regional_variant');
  assert.equal(normaliseQuery('  Autumn  COLOURING-Pages! '),'autumn coloring page');
  assert.equal(normaliseQuery('adult coloring pages'),normaliseQuery('Adults Colouring Page'));
  assert.equal(normaliseQuery('cosy coloring book'),normaliseQuery('cozy colouring books'));
  assert.notEqual(normaliseQuery('fall coloring pages'),normaliseQuery('adult coloring pages'));
  assert.notEqual(normaliseQuery('fall coloring pages'),normaliseQuery('autumn coloring pages'),'regional variants are separate intents');
  assert.equal(normaliseQuery('christmas card'),'christmas card','no false plural stripping');
  assert.deepEqual(fall.find(x=>x.query==='fall coloring pages').also_spelled,['fall colouring pages']);
});

test('deduplication: effectively identical queries are listed once, the higher-priority wording kept',()=>{
  const p=createResearchPlan({idea:idea({formats:['coloring pages','Colouring Page','coloring book'],themes:['autumn','Autumn','fall'],audiences:['adults','adult']}),now:NOW});
  const n=p.queries.map(q=>q.normalized_query);assert.equal(new Set(n).size,n.length);
  assert.equal(p.queries.filter(q=>q.normalized_query==='autumn coloring page').length,1);
  assert.equal(p.queries.filter(q=>q.normalized_query==='adult coloring page').length,1);
});

test('no permutation explosion: bounded, and the cap drops lowest-priority queries with a warning',()=>{
  const d=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn','cozy'],audiences:['adults'],delivery:['digital','printable']}),now:NOW});
  assert.equal(d.queries.length,17);
  const big=createResearchPlan({idea:idea({formats:['coloring pages'],themes:['autumn','cozy','forest','pumpkin','cafe','harvest'],styles:['cute','bold','simple','vintage'],
    audiences:['adults','teens','kids','families'],delivery:['digital','printable','editable']}),now:NOW});
  assert.equal(big.queries.length,MAX_QUERIES);assert.ok(big.warnings.some(w=>/query_cap_reached/.test(w)));
  assert.ok(big.queries.filter(q=>q.priority==='P1').length>0&&big.queries.every((q,i,a)=>!i||a[i-1].priority<=q.priority));
});

test('distinctive-term guardrail: an autumn idea never yields Halloween, Christmas or other-niche queries',async()=>{
  const p=createResearchPlan({idea:await demo(),now:NOW});
  assert.ok(!p.queries.some(q=>/halloween|christmas|bridal|wedding|xmas|ghost|valentine|easter/.test(q.query)));
  const vocab=new Set(['autumn','fall','cozy','adult','adults','coloring','page','pages','book','digital','printable']);
  for(const q of p.queries)for(const w of q.query.split(' '))assert.ok(vocab.has(w),`"${w}" in "${q.query}"`);
  // Season metadata never becomes a query word, and seasons are not inferred into holidays.
  const s=createResearchPlan({idea:idea({formats:['planner'],themes:['budget'],season:'winter'}),now:NOW});
  assert.ok(!s.queries.some(q=>/winter|christmas|holiday/.test(q.query)));
});

test('Cozy Autumn demonstration: the expected intents emerge from the generic rules (not hard-coded)',async()=>{
  const p=createResearchPlan({idea:await demo(),now:NOW});
  assert.equal(p.idea_completeness,'complete');assert.equal(p.status,'draft');assert.match(p.research_plan_id,/^plan-[0-9a-f]{16}$/);
  for(const q of ['fall coloring pages','autumn coloring pages','adult coloring pages','cozy coloring pages','cozy coloring book','printable coloring pages','fall coloring book','autumn coloring book'])
    assert.ok(qs(p).includes(q),q);
  assert.deepEqual(p.queries.filter(q=>q.priority==='P1').map(q=>q.query),['autumn coloring pages','fall coloring pages','cozy coloring pages','adult coloring pages']);
  assert.ok(p.queries.every(q=>q.observation_status==='not_researched'));
  const src=(await readFile(join(ROOT,'src/planner.mjs'),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');   // code, not comments
  for(const s of ['fall coloring pages','adult coloring pages','cozy coloring book','autumn coloring'])assert.ok(!src.includes(s),`"${s}" is not in the planner code`);
  const report=researchPlanReport(p);
  assert.match(report,/^SEO RESEARCH PLAN\n\nProduct: Cozy Autumn Colouring Pages for Adults/);
  assert.match(report,/P1 — SEARCH THESE FIRST\n\n1\. autumn coloring pages .*\n   Why: theme \+ product format/);
  assert.match(report,/FOR EACH QUERY CAPTURE:\n\n- searches in the last 30 days\n- search results\n- conversion label\n- trend, if Etsy shows one\n- related search terms Etsy displays\n- capture date/);
});

test('no fabricated Marketplace metrics: a plan carries no numbers and no demand claims',async()=>{
  const p=createResearchPlan({idea:await demo(),now:NOW});
  const text=JSON.stringify(p.queries)+researchPlanReport(p).replace(/^\d+\. /gm,'').replace(/last 30 days/,'');
  assert.doesNotMatch(text,/searches_30d|search_results|conversion_label|\b\d{2,}\b|high demand|popular|trending|best[- ]selling/i);
  assert.ok(p.warnings.some(w=>/not evidence of market demand/.test(w)));
});

test('related terms: stored with an observation as DISCOVERED, never researched, never scored',async()=>{
  const rel=[{term:'Autumn Leaves Coloring'},{term:'fall coloring pages for adults',searches_30d:120,search_results:900,conversion_label:'high'},{term:'fall mandala',searches_30d:40},{term:'autumn leaves coloring'}];
  const v=validateObservation(row('fall coloring pages',{related_terms:rel}));
  assert.equal(v.ok,true,v.errors.join());
  assert.deepEqual(v.observation.related_terms.map(t=>t.term),['autumn leaves coloring','fall coloring pages for adults','fall mandala'],'deduplicated, normalised');
  assert.deepEqual(v.observation.related_terms[0],{term:'autumn leaves coloring',searches_30d:null,search_results:null,conversion_label:null},'missing metrics stay null');
  assert.notEqual(v.observation.observation_id,validateObservation(row('fall coloring pages')).observation.observation_id,'content-addressed');
  assert.equal('related_terms' in validateObservation(row('fall coloring pages')).observation,false,'absent stays absent: existing ids and checksums unchanged');
  assert.match(validateObservation(row('x',{related_terms:[{term:'y',searches_30d:'lots'}]})).errors.join(),/related_terms\[0\]\.searches_30d/);
  assert.match(validateObservation(row('x',{related_terms:[{term:'y',score:9}]})).errors.join(),/unexpected field "score"/);
  const research=createResearchSet({research_id:'rel',rows:[row('fall coloring pages',{related_terms:rel}),row('adult coloring pages')],recorded_at:'2026-09-29',recorded_by:'test'});
  const plan=applyResearch(createResearchPlan({idea:await demo(),now:NOW}),research,{now:NOW});
  assert.deepEqual(plan.discovered_terms.map(d=>[d.term,d.status,d.metrics_captured]),
    [['autumn leaves coloring','discovered','none'],['fall coloring pages for adults','discovered','all'],['fall mandala','discovered','partial']]);
  assert.ok(!plan.queries.some(q=>/mandala|leaves/.test(q.query)),'discovered terms are not added as queries or marked researched');
  const profile=validateProfile(await json('fixtures/profiles/cozy-autumn-colouring-adults.json')).profile;
  const scored=scoreOpportunities({profile,research});
  assert.deepEqual(scored.diagnostics.map(d=>d.keyword).sort(),['adult coloring pages','fall coloring pages'],'the opportunity engine never scores a related term');
});

test('plan lifecycle: draft → researching → ready_for_expansion → complete; unavailable; superseded',async()=>{
  const p=createResearchPlan({idea:await demo(),now:NOW});
  const r1=createResearchSet({research_id:'demo',rows:[row('fall coloring pages'),row('Adult Colouring Pages')],recorded_at:'2026-09-29',recorded_by:'test'});
  const a=applyResearch(p,r1,{now:NOW});
  assert.equal(a.status,'researching');assert.equal(p.status,'draft','inputs are not mutated');
  assert.equal(a.queries.find(q=>q.query==='adult coloring pages').observation_status,'captured','spelling-insensitive match');
  assert.ok(a.queries.find(q=>q.query==='fall coloring pages').observation_id.startsWith('obs-'));
  assert.throws(()=>setPlanStatus(a,'complete'),/cannot move from researching to complete/);
  const b=markUnavailable(a,'cozy coloring pages',{note:'Etsy showed no insights',now:NOW});
  assert.equal(b.status,'researching');
  const r2=createResearchSet({research_id:'demo',rows:[row('fall coloring pages'),row('adult coloring pages'),row('autumn coloring pages')],recorded_at:'2026-09-30',recorded_by:'test',previous:r1});
  const c=applyResearch(b,r2,{now:NOW});
  assert.equal(c.status,'ready_for_expansion','every P1 query is captured or unavailable');
  assert.deepEqual(c.status_history.map(h=>h.status),['draft','researching','ready_for_expansion']);
  assert.deepEqual(c.research_references,[{research_id:'demo',version:1},{research_id:'demo',version:2}]);
  assert.throws(()=>markUnavailable(c,'fall coloring pages'),/already captured/);assert.throws(()=>markUnavailable(c,'christmas cards'),/not in this research plan/);
  const done=setPlanStatus(c,'complete',{now:NOW});assert.equal(done.status,'complete');
  assert.throws(()=>applyResearch(done,r2),/plan is complete/);
  const sup=setPlanStatus(done,'superseded',{superseded_by:'plan-0000000000000000',now:NOW});
  assert.equal(sup.superseded_by,'plan-0000000000000000');assert.throws(()=>setPlanStatus(sup,'complete'),/cannot move from superseded/);
});

test('EXISTING_LISTING research gaps: researched vs unresearched terms, new candidate queries; no listing change',async()=>{
  const research=await seed();
  const g=planExistingListingResearch({snapshot:await json('fixtures/listings/005-cozy-autumn-adventures.json'),profile:validateProfile(await json('fixtures/profiles/005-cozy-autumn-adventures.json')).profile,research,now:NOW});
  assert.deepEqual(g.existing_terms_already_researched.map(x=>x.term),['fall coloring pages','cozy coloring book']);
  assert.equal(g.existing_terms_needing_research.length,12);assert.ok(g.existing_terms_needing_research.some(x=>x.source==='title_lead'));
  assert.ok(g.new_candidate_queries.some(q=>q.query==='autumn coloring book'));
  assert.ok(!g.new_candidate_queries.some(q=>['fall coloring pages','cozy coloring book','fall coloring book'].includes(q.query)),'existing or researched terms are not "new"');
  assert.ok(!g.new_candidate_queries.some(q=>/halloween|christmas|adult/.test(q.query)),'the listing profile names no Halloween, Christmas or adults');
  assert.ok(g.research_gaps.some(x=>/12 of 14 current terms/.test(x)));
  assert.equal(g.listing_action,'none');assert.equal(g.etsy_action,'none');
  assert.ok(!('recommended_primary_intent' in g)&&!('tag_candidates' in g),'no listing recommendation at this stage');
  const g4=planExistingListingResearch({snapshot:await json('fixtures/listings/004-cozy-spooky-halloween-colouring.json'),profile:validateProfile(await json('fixtures/profiles/004-cozy-spooky-halloween-colouring.json')).profile,research,now:NOW});
  assert.ok(g4.research_gaps.some(x=>/tags are not recorded/.test(x))&&g4.research_gaps.some(x=>/No audience is recorded/.test(x)));
});

test('deterministic: same idea and time give an identical plan and id',async()=>{
  const a=createResearchPlan({idea:await demo(),now:NOW}), b=createResearchPlan({idea:await demo(),now:NOW});
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.research_plan_id,createResearchPlan({idea:await demo(),now:new Date('2027-01-01')}).research_plan_id,'the id depends on content, not time');
});

test('architectural boundary: the opportunity formula is unchanged and the planner does not use it',async()=>{
  assert.deepEqual({...WEIGHTS},{demand:0.20,competition:0.15,conversion:0.30,relevance:0.25,trend:0.05,seasonality:0.05});
  assert.deepEqual({...RELEVANCE_VALUES},{EXACT:100,STRONG:85,SUPPORTING:65,WEAK:30,IRRELEVANT:0});
  assert.deepEqual({...CONVERSION_VALUES},{very_high:100,high:80,typical:60,low:30,very_low:10,unknown:40});
  assert.equal(DEMAND_REFERENCE,10000);assert.equal(COMPETITION_REFERENCE,1000000);
  const text=(await readFile(join(ROOT,'src/planner.mjs'),'utf8')).replace(/^\s*\/\/.*$/gm,'');
  for(const m of text.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g))assert.ok(['node:crypto','./observations.mjs','./idea.mjs'].includes(m[1]),`planner imports ${m[1]}`);
  for(const f of ['src/planner.mjs','scripts/research-plan.mjs']){
    const t=(await readFile(join(ROOT,f),'utf8')).replace(/^\s*\/\/.*$/gm,'');
    assert.doesNotMatch(t,/\bfetch\(|https?:\/\/|openai|telegram|etsy\.com|api\.etsy|child_process|production\/|automation\//i,f);
  }
  const schema=await json('schemas/research-plan.schema.json');
  assert.deepEqual([...schema.required].sort(),Object.keys(createResearchPlan({idea:await demo(),now:NOW})).sort());
});
