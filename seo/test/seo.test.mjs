// SEO / Discovery Engine v1 foundation. Fixtures only: no network, no model,
// no Etsy, no Telegram, no production code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONVERSION_LABELS, validateObservation, ingestObservations, createResearchSet, researchSha, observationFor, ResearchStore,
  validateIdea, MODES, createBriefDraft, validateBrief, validateSnapshot, createListingReview, normaliseKeyword } from '../src/index.mjs';

const ROOT=join(import.meta.dirname,'..'), REPO=join(ROOT,'..');
const json=async p=>JSON.parse(await readFile(join(ROOT,p),'utf8'));
const seedFile=()=>json('fixtures/marketplace-insights/manual-capture-01.json');
const seed=async()=>{const f=await seedFile();return createResearchSet({research_id:f.research_id,rows:f.rows,recorded_at:f.recorded_at,recorded_by:f.recorded_by,note:f.note});};
const row=(extra={})=>({keyword:'fall coloring pages',searches_30d:2300,search_results:29100,conversion_label:'very_high',trend_percent:null,captured_at:null,
  source:{type:'etsy_marketplace_insights',method:'manual',captured_by:'owner'},...extra});
const LISTINGS=['004-cozy-spooky-halloween-colouring','005-cozy-autumn-adventures','006-cute-ghost-halloween','traditional-robin-christmas-card'];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function walk(d){const out=[];for(const e of await readdir(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=join(d,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}

test('seed research: the 12 owner-supplied observations are ingested exactly, marked as manual Marketplace Insights captures',async()=>{
  const f=await seedFile(), set=await seed();
  assert.match(f.fixture,/MANUALLY CAPTURED Etsy Marketplace Insights/);
  assert.equal(set.observations.length,12);assert.equal(set.version,1);assert.equal(set.parent,null);assert.equal(set.kind,'raw_observations');
  const expect={'halloween coloring pages':[4800,24700,'high'],'fall coloring pages':[2300,29100,'very_high'],'adult coloring pages':[4400,138700,'very_high'],
    'halloween coloring pages printable':[534,22000,'very_high'],'digital coloring book':[3800,157600,'high'],'cozy coloring book':[3200,33600,'typical'],
    'halloween coloring book':[3400,19400,'low'],'halloween activity book':[663,16700,'very_low'],'cute ghost coloring':[15,5200,'very_low'],
    'traditional christmas card':[98,10500,'typical'],'christmas robin card':[14,4500,'very_low'],'christmas printable card':[12,192900,'very_low']};
  for(const [k,[s,r,c]] of Object.entries(expect)){
    const o=observationFor(set,k);
    assert.deepEqual([o.searches_30d,o.search_results,o.conversion_label],[s,r,c],k);
    assert.deepEqual(o.source,{type:'etsy_marketplace_insights',method:'manual',captured_by:'owner',note:'Seed fixture'});
    assert.equal(o.trend_percent,null,'not supplied, so unknown');assert.equal(o.captured_at,null,'not supplied, so unknown');
  }
  assert.equal(set.missing_values.length,12);assert.deepEqual(set.missing_values[0].fields,['trend_percent','captured_at']);
});

test('conversion labels: exactly the six Etsy labels; missing becomes "unknown", anything else is rejected',()=>{
  assert.deepEqual([...CONVERSION_LABELS],['very_high','high','typical','low','very_low','unknown']);
  for(const l of CONVERSION_LABELS)assert.equal(validateObservation(row({conversion_label:l})).ok,true,l);
  const {conversion_label,...noLabel}=row();
  const m=validateObservation(noLabel);assert.equal(m.observation.conversion_label,'unknown');assert.ok(m.missing.includes('conversion_label'));
  for(const bad of ['Very High','medium','HIGH','',5])assert.equal(validateObservation(row({conversion_label:bad})).ok,false,String(bad));
});

test('missing values stay null (never zero or guessed); a missing field (not null) is an error',()=>{
  const r=validateObservation(row({searches_30d:null,search_results:null}));
  assert.equal(r.ok,true);assert.equal(r.observation.searches_30d,null);assert.equal(r.observation.search_results,null);
  assert.deepEqual(r.missing,['searches_30d','search_results','trend_percent','captured_at']);
  const {searches_30d,...absent}=row();
  assert.match(validateObservation(absent).errors.join(),/searches_30d is required \(use null when it was not captured\)/);
});

test('malformed observations are rejected with reasons; nothing is coerced, repaired or scored',()=>{
  const cases=[
    [row({searches_30d:'4800'}),/searches_30d must be a whole number/],[row({searches_30d:'4.8k'}),/searches_30d/],[row({search_results:-1}),/search_results/],
    [row({searches_30d:12.5}),/searches_30d/],[row({trend_percent:'+12%'}),/trend_percent must be a number/],[row({trend_percent:NaN}),/trend_percent/],
    [row({captured_at:'last week'}),/captured_at must be an ISO date/],[row({keyword:'  '}),/keyword is required/],
    [row({source:{type:'etsy_api',method:'manual',captured_by:'owner'}}),/source\.type/],[row({source:{type:'etsy_marketplace_insights',method:'scraped',captured_by:'owner'}}),/source\.method/],
    [row({source:undefined}),/source is required/],[row({opportunity_score:87}),/unexpected field "opportunity_score" \(raw observations hold only captured values/],
    [null,/must be an object/],[[1,2],/must be an object/]];
  for(const [raw,re] of cases){const r=validateObservation(raw);assert.equal(r.ok,false,JSON.stringify(raw));assert.match(r.errors.join(' | '),re);}
  // A batch: good rows accepted exactly, bad rows reported, duplicates reject both values.
  const b=ingestObservations([row(),row({keyword:'adult coloring pages',searches_30d:'lots'}),row({keyword:'Cozy  Coloring Book',searches_30d:3200}),row({keyword:'cozy coloring book',searches_30d:9999})]);
  assert.deepEqual(b.accepted.map(o=>o.keyword),['fall coloring pages']);
  assert.deepEqual(b.rejected.map(x=>x.index),[1,2,3]);
  // A research set refuses a partly malformed capture entirely.
  assert.throws(()=>createResearchSet({research_id:'bad-capture',rows:[row(),row({keyword:'x',searches_30d:-5})],recorded_at:'2026-09-29',recorded_by:'owner'}),/1 observation\(s\) rejected: row 1 \(x\)/);
});

test('research versioning: write-once, sequential, parent checksum; observations are content-addressed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'seo-research-'));
  try{
    const store=new ResearchStore(dir), v1=await seed();
    const saved=await store.save(v1);assert.deepEqual(saved,{research_id:'etsy-insights-seed',version:1,sha256:researchSha(v1)});
    await assert.rejects(store.save(v1),/version 1 cannot follow v1/);
    const rows=(await seedFile()).rows.map(r=>r.keyword==='fall coloring pages'?{...r,searches_30d:2500,captured_at:'2026-10-05'}:r);
    const v2=createResearchSet({research_id:'etsy-insights-seed',rows,recorded_at:'2026-10-05T09:00:00Z',recorded_by:'owner',previous:v1});
    assert.equal(v2.version,2);assert.deepEqual(v2.parent,{version:1,sha256:researchSha(v1)});
    await store.save(v2);
    assert.deepEqual(await store.versions('etsy-insights-seed'),[1,2]);
    assert.equal(observationFor(await store.load('etsy-insights-seed',1),'fall coloring pages').searches_30d,2300,'v1 is never edited');
    assert.equal(observationFor(await store.load('etsy-insights-seed'),'fall coloring pages').searches_30d,2500);
    assert.notEqual(observationFor(v1,'fall coloring pages').observation_id,observationFor(v2,'fall coloring pages').observation_id);
    assert.equal(observationFor(v1,'adult coloring pages').observation_id,observationFor(v2,'adult coloring pages').observation_id,'unchanged values keep their id');
    const tampered={...v2,version:3,parent:{version:2,sha256:'0'.repeat(64)}};
    await assert.rejects(store.save(tampered),/parent checksum does not match v2/);
    assert.throws(()=>createResearchSet({research_id:'other',rows:[],recorded_at:'2026-10-05',recorded_by:'owner',previous:v1}),/another research set/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('NEW_PRODUCT: the idea is validated product-type agnostically and stays the idea',async()=>{
  const raw=await json('fixtures/ideas/cozy-autumn-colouring-adults.json');
  const v=validateIdea(raw);assert.equal(v.ok,true,v.errors.join());
  assert.deepEqual(v.idea.candidate_keywords,['fall coloring pages','adult coloring pages','cozy autumn coloring']);
  assert.equal(validateIdea({...raw,product_type:'wedding seating chart',format:'single-printable'}).ok,true,'any product type');
  const bad=validateIdea({...raw,status:'live',page_count:0,product_id:'12',themes:'autumn',extra:1});
  assert.equal(bad.ok,false);
  for(const re of [/status must be one of/,/page_count/,/product_id must be a 3-digit/,/themes must be a list/,/unexpected field "extra"/])assert.match(bad.errors.join(' | '),re);
  const {concept,...noConcept}=raw;assert.match(validateIdea(noConcept).errors.join(),/concept is required/);
});

test('NEW_PRODUCT brief draft: exact evidence for the idea, warnings for unresearched keywords, no selection or scores until scored',async()=>{
  const research=await seed(), idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json')).idea;
  const brief=createBriefDraft({idea,research,now:new Date('2026-09-29T10:00:00Z')});
  assert.equal(brief.mode,MODES.NEW_PRODUCT);assert.equal(brief.approval_status,'draft');assert.equal(brief.confidence,'unknown');
  assert.deepEqual(brief.research_version,{research_id:'etsy-insights-seed',version:1,sha256:researchSha(research)});
  assert.deepEqual(brief.market_evidence.filter(x=>x.role==='owner_candidate').map(x=>x.keyword),['fall coloring pages','adult coloring pages']);
  // Related terms: shares a distinctive idea term (cozy, fall, adult); never the Halloween or Christmas keywords.
  assert.deepEqual(brief.market_evidence.filter(x=>x.role==='related_term').map(x=>x.keyword),['cozy coloring book']);
  assert.ok(!brief.market_evidence.some(x=>/halloween|christmas/.test(x.keyword)),'idea first: no unrelated higher-volume product is swapped in');
  assert.ok(brief.warnings.some(w=>/No Marketplace Insights observation for candidate keyword "cozy autumn coloring": not researched \(values unknown, not zero\)/.test(w)));
  assert.equal(brief.primary_keyword,null);assert.deepEqual(brief.tag_candidates,[]);assert.equal(brief.positioning,null);
  assert.deepEqual(brief.opportunity_scores,{status:'not_scored',rule:brief.opportunity_scores.rule});
  assert.match(brief.opportunity_scores.rule,/no opaque or model-generated score/);
  assert.deepEqual(validateBrief(brief,research),{ok:true,errors:[]});
});

test('no fabricated statistics: a brief whose numbers differ from, or are not in, the cited research is rejected',async()=>{
  const research=await seed(), idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json')).idea;
  const good=createBriefDraft({idea,research});
  const inflated=structuredClone(good);inflated.market_evidence[0].searches_30d=23000;
  assert.match(validateBrief(inflated,research).errors.join(),/market_evidence\[0\]\.searches_30d is 23000 but the observation says 2300/);
  const invented=structuredClone(good);invented.market_evidence.push({observation_id:'obs-0000000000000000',role:'related_term',keyword:'autumn planner',searches_30d:9000,search_results:10,conversion_label:'very_high',trend_percent:40,captured_at:null});
  assert.match(validateBrief(invented,research).errors.join(),/cites unknown observation obs-0000000000000000/);
  const guessed=structuredClone(good);guessed.market_evidence[0].trend_percent=0;
  assert.match(validateBrief(guessed,research).errors.join(),/trend_percent is 0 but the observation says null/,'unknown is not zero');
  const unbacked=structuredClone(good);unbacked.primary_keyword='autumn coloring bundle';
  assert.match(validateBrief(unbacked,research).errors.join(),/"autumn coloring bundle" is chosen but has no market evidence/);
  const scored=structuredClone(good);scored.opportunity_scores={status:'scored',diagnostics:[{keyword:'fall coloring pages',final_opportunity_score:92}]};
  assert.match(validateBrief(scored,research).errors.join(),/a draft brief carries no scores/);
  const otherVersion=createResearchSet({research_id:'etsy-insights-seed',rows:(await seedFile()).rows,recorded_at:'2026-10-01',recorded_by:'owner',previous:research});
  assert.match(validateBrief(good,otherVersion).errors.join(),/research_version does not match/);
  const price=structuredClone(good);price.pricing_evidence=[{amount:4.5}];
  assert.match(validateBrief(price,research).errors.join(),/pricing_evidence\[0\] has no source/);
});

test('EXISTING_LISTING: the four non-live listing fixtures are valid snapshots read from the repository',async()=>{
  for(const id of LISTINGS){
    const s=await json(`fixtures/listings/${id}.json`);
    const v=validateSnapshot(s);assert.equal(v.ok,true,`${id}: ${v.errors.join('; ')}`);
    assert.equal(s.listing.live_state_read,false);assert.deepEqual(Object.values(s.performance),[null,null,null,null],'shop stats not captured: unknown, not zero');
    assert.match(s.source.sha256,/^[0-9a-f]{64}$/);
    // The snapshot carries its own values. Where the source file is present in this checkout it must
    // still contain the snapshot's title (some product workspaces are not tracked in Git; line endings may differ).
    const src=await readFile(join(REPO,s.source.file),'utf8').catch(()=>null);
    if(src)assert.ok(src.includes(s.title),`${id}: ${s.source.file} no longer contains the snapshot title`);
  }
  const cut=await json('fixtures/listings/006-cute-ghost-halloween.json');
  assert.equal(cut.listing.owner_reference,'#006');assert.equal(cut.listing.repo_product,'007-cute-ghost-halloween-activity-book');
  const g004=await json('fixtures/listings/004-cozy-spooky-halloween-colouring.json');
  assert.equal(g004.tags,null);assert.ok(validateSnapshot(g004).warnings.includes('tags were not recorded for this listing'));
  assert.equal(validateSnapshot({...cut,listing:{...cut.listing,live_state_read:true}}).ok,false,'v1 never reads live Etsy');
});

test('EXISTING_LISTING review: current SEO vs captured market data; no product regeneration, no Etsy change, no revision yet',async()=>{
  const research=await seed(), snapshot=await json('fixtures/listings/005-cozy-autumn-adventures.json');
  const r=createListingReview({snapshot,research});
  assert.equal(r.mode,MODES.EXISTING_LISTING);assert.equal(r.product_action,'none');assert.equal(r.etsy_action,'none');assert.equal(r.proposed_revision,null);
  assert.deepEqual(r.current.tags,snapshot.tags);
  const t=Object.fromEntries(r.market_comparison.tags.map(x=>[x.tag,x.observation]));
  assert.equal(t['fall coloring pages'].searches_30d,2300);assert.equal(t['cozy coloring book'].conversion_label,'typical');
  assert.equal(t['autumn coloring'],null,'not researched: no value invented');
  assert.ok(r.warnings.some(w=>/11 of 13 tags have no Marketplace Insights observation/.test(w)));
  const robin=createListingReview({snapshot:await json('fixtures/listings/traditional-robin-christmas-card.json'),research});
  assert.deepEqual(robin.market_comparison.title_keywords.map(x=>x.keyword),['traditional christmas card']);
  assert.throws(()=>createListingReview({snapshot:{...snapshot,mode:'NEW_PRODUCT'},research}),/invalid listing snapshot/);
});

test('boundaries: the SEO engine imports nothing but node builtins and itself; no network, Etsy, Telegram, OpenAI or production',async()=>{
  for(const f of (await walk(join(ROOT,'src'))).filter(f=>f.endsWith('.mjs'))){
    const text=(await readFile(f,'utf8')).replace(/^\s*\/\/.*$/gm,'');   // code only, not comments
    for(const m of text.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g))assert.ok(/^node:(crypto|fs\/promises|path)$/.test(m[1])||/^\.\/[a-z-]+\.mjs$/.test(m[1]),`${f} imports ${m[1]}`);
    assert.doesNotMatch(text,/\bfetch\(|https?:\/\/|openai|telegram|etsy\.com|api\.etsy|child_process|sharp|pdf-lib/i,`${f}`);
  }
});

test('no production invocation and no coupling: Production Engine code never imports the SEO engine',async()=>{
  // ADR-036: the ONE exception is the Telegram SEO adapter, automation/src/seo/ (owner interface only).
  // Stage 1–4 code, production, marketing and services never import seo/; seo/ never imports them.
  const adapter=join(REPO,'automation','src','seo');
  for(const area of ['production/src','automation/src','marketing/src','services/src']){
    for(const f of (await walk(join(REPO,area))).filter(f=>/\.(mjs|js|ts)$/.test(f))){
      if(f.startsWith(adapter))continue;
      const text=await readFile(f,'utf8');
      assert.ok(!/(from\s+|import\(\s*)['"][^'"]*\/seo\/src\//.test(text),`${f} imports the SEO engine`);
    }
  }
});

test('no Etsy or product mutation: running every v1 flow leaves the repository product files byte-identical',async()=>{
  const snaps=await Promise.all(LISTINGS.map(id=>json(`fixtures/listings/${id}.json`)));
  const present=async f=>readFile(join(REPO,f)).then(()=>true,()=>false);
  const files=[];for(const f of [...new Set(snaps.map(s=>s.source.file)),'products/009-christmas-greetings-card/product.json'])if(await present(f))files.push(f);
  assert.ok(files.length>=3,'the tracked source files are checked');
  const before=await Promise.all(files.map(async f=>sha(await readFile(join(REPO,f)))));
  const research=await seed(), idea=validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json')).idea;
  createBriefDraft({idea,research});for(const s of snaps)createListingReview({snapshot:s,research});
  assert.deepEqual(await Promise.all(files.map(async f=>sha(await readFile(join(REPO,f))))),before);
  assert.equal(normaliseKeyword('  Fall   COLORING Pages '),'fall coloring pages');
});

test('schemas document the same contract the validators enforce',async()=>{
  const obs=await json('schemas/observation.schema.json'), idea=await json('schemas/product-idea.schema.json'), brief=await json('schemas/seo-brief.schema.json'), snap=await json('schemas/listing-snapshot.schema.json');
  assert.deepEqual(obs.properties.conversion_label.enum,[...CONVERSION_LABELS]);
  assert.deepEqual(Object.keys(obs.properties).sort(),['captured_at','conversion_label','keyword','related_terms','search_results','searches_30d','source','trend_percent']);
  assert.ok(!obs.required.includes('related_terms'),'related terms are optional');
  assert.equal(obs.additionalProperties,false);
  assert.deepEqual(idea.required.sort(),['audience','candidate_keywords','concept','format','owner_notes','page_count','product_id','product_type','season','status','themes','working_name']);
  for(const k of ['primary_keyword','secondary_keywords','supporting_keywords','rejected_keywords','market_evidence','opportunity_scores','positioning','title_direction','tag_candidates',
    'description_keywords','pricing_evidence','confidence','warnings','research_version','approval_status'])assert.ok(brief.required.includes(k),k);
  const draft=createBriefDraft({idea:validateIdea(await json('fixtures/ideas/cozy-autumn-colouring-adults.json')).idea,research:await seed()});
  assert.deepEqual(Object.keys(draft).sort(),[...brief.required].sort());
  assert.deepEqual([...snap.required].sort(),Object.keys(await json(`fixtures/listings/${LISTINGS[1]}.json`)).sort());
});
