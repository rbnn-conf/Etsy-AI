// Regression: the REAL completed Cozy Autumn research cycle (2026-09-29), replayed
// from committed captures, and a generic next-product run of the same workflow.
// Nothing is hard-coded in src/: the expected strategy must emerge from the
// unchanged Opportunity Engine. No network, no model, no Etsy, no Telegram.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateIdea, validateProfile, createResearchSet, createResearchPlan, applyResearch, createInitialRound, researchState, nextResearchRound,
  finishWithCurrentEvidence, buildEvidencePackage, validateEvidencePackage, scoreEvidencePackage, runResearchCommand, mergeCapture, OWNER_STOP_WARNING } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const DIR='fixtures/research-cycle/cozy-autumn-real';
const NOW=new Date('2026-09-29T12:00:00Z');

async function replay(){
  const idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults-structured.json')).idea;
  const profile=validateProfile(await json('fixtures/profiles/cozy-autumn-colouring-adults-structured.json')).profile;
  const c1=await json(`${DIR}/capture-1.json`), c2=await json(`${DIR}/capture-2.json`), fin=await json(`${DIR}/owner-finish.json`);
  const v1=createResearchSet({research_id:c1.research_id,rows:c1.rows,recorded_at:c1.recorded_at,recorded_by:c1.recorded_by,note:c1.note});
  let plan=applyResearch(createResearchPlan({idea,now:NOW}),v1,{now:NOW});
  const rounds=[createInitialRound({plan,profile,now:NOW})];
  const after1=researchState({plan,profile,research:v1,rounds});
  const v2=createResearchSet({research_id:c1.research_id,rows:mergeCapture(v1,c2.rows),recorded_at:c2.recorded_at,recorded_by:c2.recorded_by,note:c2.note,previous:v1});
  plan=applyResearch(plan,v2,{now:NOW});
  const after2=researchState({plan,profile,research:v2,rounds});
  const r2=nextResearchRound({plan,profile,research:v2,rounds,now:NOW});
  const finished=finishWithCurrentEvidence({rounds:[...rounds,r2],research:v2,decided_by:fin.decided_by,note:fin.note,now:new Date(fin.at)});
  return {idea,profile,c1,c2,v1,v2,plan,after1,after2,r2,rounds:finished};
}

test('real cycle: captures are recorded exactly; related-term figures stay discovery metadata',async()=>{
  const {v1,v2,c1,c2}=await replay();
  const o=k=>v2.observations.find(x=>x.keyword===k);
  const rows={'adult coloring pages':[4345,138500,'high',3.2,'2026-09-29'],'autumn coloring pages':[641,12900,'very_high',18.5,'2026-09-29'],
    'cozy coloring pages':[1359,38400,'high',3.8,'2026-09-29'],'cozy coloring book':[3200,33600,'typical',null,null],'fall coloring pages':[2300,29100,'very_high',null,null]};
  assert.deepEqual(v2.observations.map(x=>x.keyword).sort(),Object.keys(rows).sort());
  for(const [k,v] of Object.entries(rows))assert.deepEqual([o(k).searches_30d,o(k).search_results,o(k).conversion_label,o(k).trend_percent,o(k).captured_at],v,k);
  for(const x of v1.observations)assert.deepEqual(o(x.keyword),x,'v1 observations are carried into v2 unchanged');
  assert.equal(v2.parent.version,1);
  assert.match(o('autumn coloring pages').source.note,/"12\.9k"/);assert.match(o('cozy coloring pages').source.note,/"1\.4k"/);
  assert.match(c1.fixture+c2.fixture,/DISCOVERY METADATA ONLY/i);
});

test('real cycle: P1 incomplete → expansion recommended → round 2 → owner finished → READY_TO_SCORE_WITH_WARNINGS',async()=>{
  const {after1,after2,r2,plan,profile,v2,rounds}=await replay();
  assert.equal(after1.readiness.status,'RESEARCH_INCOMPLETE');assert.match(after1.readiness.reasons[0],/autumn coloring pages, cozy coloring pages/);
  assert.equal(after2.readiness.status,'EXPANSION_RECOMMENDED');
  assert.deepEqual(r2.requested_terms.map(t=>t.term),['coloring pages for adults','printable coloring book for adults']);
  assert.ok(r2.requested_terms.every(t=>t.metrics_supplied==='all'),'Etsy showed table figures for both');
  const s=researchState({plan,profile,research:v2,rounds});
  assert.equal(s.readiness.status,'READY_TO_SCORE_WITH_WARNINGS');
  assert.deepEqual(s.readiness.warnings,[`${OWNER_STOP_WARNING} Requested but not researched: coloring pages for adults, printable coloring book for adults. These terms are unknown: not unavailable, not rejected, not zero, and not evidence.`]);
  for(const t of r2.requested_terms)assert.equal(s.ledger.find(e=>e.term===t.term).state,'owner_stopped');
  assert.deepEqual(s.round_statuses.map(r=>r.status),['complete','owner_stopped']);
  assert.equal(s.duplicates.length,5);assert.equal(s.ledger.filter(e=>e.state==='rejected').length,20);
});

test('real cycle: the evidence is exactly the five captured observations, and the accepted strategy emerges from the Opportunity Engine',async()=>{
  const {plan,profile,v2,rounds}=await replay();
  const pkg=buildEvidencePackage({plan,profile,research:v2,rounds,now:NOW});
  assert.deepEqual(pkg.captured_observations.map(o=>o.keyword),['adult coloring pages','autumn coloring pages','cozy coloring book','cozy coloring pages','fall coloring pages']);
  assert.deepEqual(pkg.unresearched_terms.map(t=>t.term),['coloring pages for adults','printable coloring book for adults']);
  assert.deepEqual(pkg.unavailable_terms,[]);assert.deepEqual(validateEvidencePackage(pkg,v2),{ok:true,errors:[]});
  const r=scoreEvidencePackage({pkg,profile});
  assert.equal(r.primary_keyword,'fall coloring pages');
  assert.deepEqual(r.secondary_keywords,['adult coloring pages']);
  assert.deepEqual(r.supporting_keywords,['cozy coloring pages','cozy coloring book']);
  assert.deepEqual(r.rejected_keywords,[{keyword:'autumn coloring pages',reasons:['duplicate_intent']}],'autumn = fall under the ADR-032 duplicate rule');
  assert.equal(r.confidence,'medium');assert.equal(r.close_competition,false);
  assert.deepEqual(r.diagnostics.map(d=>d.keyword).sort(),pkg.captured_observations.map(o=>o.keyword).sort(),'only captured observations are scored');
  const text=JSON.stringify(r);
  for(const figure of ['1600','133400','630','124000'])assert.ok(!new RegExp(`\\b${figure}\\b`).test(text),`discovery figure ${figure} never enters scoring`);
  assert.ok(!/coloring pages for adults|printable coloring book for adults/.test(JSON.stringify(r.diagnostics)));
});

test('real cycle through the owner CLI gives the same result (temp folder only)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seo-real-'));
  try{
    const run=(...a)=>runResearchCommand([...a,'--dir',dir],{now:NOW});
    await run('init','--idea',join(ROOT,'fixtures/ideas/cozy-autumn-colouring-adults-structured.json'),'--profile',join(ROOT,'fixtures/profiles/cozy-autumn-colouring-adults-structured.json'),'--research-id','cozy-autumn-real');
    assert.match(await run('import',join(ROOT,DIR,'capture-1.json')),/READINESS: RESEARCH_INCOMPLETE/);
    assert.match(await run('import',join(ROOT,DIR,'capture-2.json')),/READINESS: EXPANSION_RECOMMENDED/);
    await run('next-round');
    assert.match(await run('finish','--by','owner'),/READINESS: READY_TO_SCORE_WITH_WARNINGS/);
    const out=await run('score');
    for(const re of [/5 captured observations, READY_TO_SCORE_WITH_WARNINGS/,/PRIMARY: fall coloring pages/,/SECONDARY: adult coloring pages/,/SUPPORTING: cozy coloring pages, cozy coloring book/,/CONFIDENCE: MEDIUM/])assert.match(out,re);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('next product: a new, unrelated idea runs the full workflow with no Cozy Autumn or product-ID dependency',async()=>{
  // Unit test inputs (not market claims) for a new product type.
  const idea={product_id:null,working_name:'Minimalist Budget Planner',product_type:'planner',concept:'A calm monthly budget planner.',audience:null,season:null,
    themes:['budget'],format:'planner',page_count:null,owner_notes:null,candidate_keywords:[],status:'draft',audiences:['adults'],delivery:['printable'],formats:['planner'],styles:['minimalist'],item_count:null};
  const profile={schema_version:1,profile_id:'next-budget-planner',describes:{mode:'NEW_PRODUCT',ref:'test'},source:'test',seasonality:null,notes:null,
    central_themes:['budget'],formats:['planner'],components:[],audiences:['adults'],attributes:['minimalist','printable','monthly'],tangential:['savings']};
  const src={type:'etsy_marketplace_insights',method:'manual',captured_by:'test'};
  const row=(keyword,extra={})=>({keyword,searches_30d:500,search_results:9000,conversion_label:'high',trend_percent:1,captured_at:'2026-10-01',source:src,...extra});
  const dir=await mkdtemp(join(tmpdir(),'seo-next-'));
  try{
    await writeFile(join(dir,'idea.json'),JSON.stringify(idea));await writeFile(join(dir,'profile.json'),JSON.stringify(profile));
    await writeFile(join(dir,'c1.json'),JSON.stringify({rows:[row('budget planner',{related_terms:[{term:'monthly budget planner'},{term:'wedding planner'}]}),row('adult planner'),row('minimalist planner'),row('planner')]}));
    for(const ws of ['finish','continue']){
      const w=join(dir,ws), run=(...a)=>runResearchCommand([...a,'--dir',w],{now:NOW});
      assert.match(await run('init','--idea',join(dir,'idea.json'),'--profile',join(dir,'profile.json'),'--research-id','next-budget-planner'),/Product: Minimalist Budget Planner/);
      assert.match(await run('import',join(dir,'c1.json')),/EXPANSION_RECOMMENDED/);
      assert.match(await run('discovered'),/wedding planner  \[rejected, IRRELEVANT\]/);
      assert.match(await run('next-round'),/1\. monthly budget planner/);
      if(ws==='finish')assert.match(await run('finish'),/READY_TO_SCORE_WITH_WARNINGS/);
      else{await writeFile(join(dir,'c2.json'),JSON.stringify({rows:[row('monthly budget planner')]}));assert.match(await run('import',join(dir,'c2.json')),/READINESS: READY_TO_SCORE/);}
      const out=await run('score');
      assert.match(out,/PRIMARY: (budget planner|monthly budget planner)/);
      assert.doesNotMatch(out,/cozy|autumn|coloring|wedding/i);
      if(ws==='finish')assert.doesNotMatch(out,/monthly budget planner/,'the owner-stopped term is never scored');
    }
  }finally{await rm(dir,{recursive:true,force:true});}
  // The engine code names no product, fixture or product ID.
  for(const f of (await readdir(join(ROOT,'src'))).filter(f=>f.endsWith('.mjs'))){
    const code=(await readFile(join(ROOT,'src',f),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    // Generic vocabulary tables (spelling aliases, format families) are allowed; product references are not.
    assert.doesNotMatch(code,/cozy[ -]autumn|autumn[ -]colou?ring|fixtures\/|products\/\d{3}|research-cycle/i,f);
  }
});
