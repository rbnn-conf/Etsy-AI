// ADR-064 end to end with a FAKE model (ZERO real OpenAI / Etsy / image calls):
//   - the pre-image route gate stops a near-duplicate hero BEFORE the paid image call;
//   - Product #022's two near-identical briefs are redirected for free, at the same cost (one image per engine);
//   - an unambiguous "editable" contradiction is corrected without a second listing call;
//   - a saved rejected listing is re-checked for free on Retry and reused when it now passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deriveFacts, planColouringCreative, deriveStrategy, routeContract, routeOf } from '../../marketing/src/stage3/index.mjs';
import { factsForModel } from '../src/stage3/openai.mjs';
import { productionApproved, LISTING } from './colouring-fixture.mjs';

const ACTOR='@owner';
const rj=async(ws,f)=>JSON.parse(await readFile(join(ws,f),'utf8'));
const HYBRID_022='Rich walnut tabletop under warm amber lamp light, with a chunky cream knitted throw at one edge, a ceramic mug of tea, scattered autumn leaves and soft string-light bokeh in the distance.';
const CREATIVE_022='Rich walnut desk in warm amber lamp light, with a chunky cream knit at one edge and a ceramic mug of tea nearby. A few scattered autumn leaves and soft string-light bokeh recede into a dusky, cinematic background.';

/** A fake Creative Director that answers with each engine's baseline, the hero brief replaced by `heroBrief(engine)`. */
function fakeDirector(h,facts,heroBrief=()=>null){
  const client=h.wf.ai.client, json=client.json.bind(client);
  client.json=async a=>{
    if(a.schemaName!=='marketing-creative-direction')return json(a);
    h.calls.push({kind:'json',schemaName:a.schemaName,user:a.user});
    const engine=/HERO ROUTE \(AI Creative\)/.test(a.user)?'ai-creative':'hybrid', base=planColouringCreative(facts,{strategy:deriveStrategy(facts),engine});
    const slides=base.slides.filter(s=>a.user.includes(`- ${s.id} [`)).map(s=>{const c=s.creative;
      return {id:s.id,purpose:c.purpose,buyer_message:c.buyer_message,emotional_goal:c.emotional_goal,headline:'',focal_asset:c.focal_asset,supporting_assets:c.supporting_assets,
        composition:c.composition,hierarchy:c.hierarchy,background:c.background,props:c.props.slice(0,2),crop:{asset:'',focus:[.5,.5],zoom:1},text_zone:c.text_zone,
        scene_brief:(s.id==='01-hero'&&heroBrief(engine))||c.scene_brief,avoid:[],support:''};});
    const {source,fallbacks,...concept}=base.concept;
    return {data:{campaign:{mood:'warm',palette:'amber and walnut',lighting:'golden light',concept},slides,lines:[]},
      usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};
  };
}
const scenesMade=(h,from)=>h.calls.slice(from).filter(c=>c.kind==='image'&&c.step==='marketing-scene');

test('4. a hero route too similar to an already-produced route is refused BEFORE the paid image call (no image, no example, not retried)',{timeout:600_000},async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws);fakeDirector(h,facts);
    // An earlier comparison entry whose route is structurally the same as AI Creative's (what a duplicate looks like to the gate).
    const p=await h.store.load('001');
    await h.store.save({...p,marketing:{listing:null,plan:null,images:null,qc:null,pending_scope:null,approved_at:null,
      comparison:{at:new Date().toISOString(),engines:{hybrid:{image:{file:'marketing/comparison/hybrid/01-hero.png',sha256:'0'.repeat(64)},scene:null,direction:null,campaign:null,
        route:routeOf(routeContract('ai-creative',facts)),brief:'An unrelated stone surface.'}}}}});
    const n0=h.calls.length, r=await h.wf.runMarketing('001',ACTOR,{engine:'ai-creative',chosenBy:ACTOR});
    assert.equal(r.outcome,'failed');
    const after=await h.store.load('001');
    assert.match(after.last_error.message,/Route distinctness gate: no image was generated for ai-creative/);assert.equal(after.last_error.retryable,false);
    assert.equal(scenesMade(h,n0).length,0,'the paid image boundary was never reached');
    assert.equal(h.calls.slice(n0).filter(c=>c.kind==='imageEdit').length,0,'no coloured example either');
    assert.deepEqual(h.calls.slice(n0).filter(c=>c.kind==='json').map(c=>c.schemaName),['listing','marketing-creative-direction'],'only the text calls before the gate');
  }finally{await h.cleanup();}
});

test('#022 shape: near-identical Hybrid / AI Creative hero briefs are redirected for free; one image per engine, as before; the routes differ in the prompts',{timeout:600_000},async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws);fakeDirector(h,facts,e=>e==='hybrid'?HYBRID_022:CREATIVE_022);
    const n0=h.calls.length, r=await h.wf.runHeroComparison('001',ACTOR);
    assert.equal(r.outcome,'hero_comparison_ready',JSON.stringify((await h.store.load('001')).last_error));
    const made=scenesMade(h,n0);assert.equal(made.length,3,'exactly one paid environment per engine: no retries, no extra cost');
    const E=(await h.store.load('001')).marketing.comparison.engines;
    assert.deepEqual(['factory','hybrid','ai-creative'].map(e=>E[e].route.composition_family),['catalogue-flat-lay','styled-lifestyle','editorial-cinematic']);
    assert.ok(E['ai-creative'].direction.fallbacks.some(f=>/scene_brief \(route ai-creative forbids/.test(f)),JSON.stringify(E['ai-creative'].direction.fallbacks));
    const scene=E['ai-creative'].scene.prompt.split('\n').find(l=>l.startsWith('Scene:'));
    assert.match(scene,/Editorial still-life set/);assert.doesNotMatch(scene,/knit|mug|string-light/);
    assert.match(E.hybrid.scene.prompt,/chunky cream knitted throw/,'Hybrid keeps its own (model) brief: it is distinct from Factory');
    assert.match(E.factory.scene.prompt,/Clean catalogue flat lay/);
  }finally{await h.cleanup();}
});

test('9. "editable printable pages" is corrected deterministically: ONE listing call, no retry, the correction audited',{timeout:600_000},async()=>{
  const listing=()=>({...LISTING(),description:LISTING().description.replace('Settle in with a warm drink and a cosy winter scene to colour.','Settle in with a warm drink and these editable printable pages to colour.'),
    digital_download_disclaimer:'Digital download only. No physical item is shipped. No editable source files are included.'});
  const {h,ws}=await productionApproved({listing});
  try{
    const n0=h.calls.length, r=await h.wf.runMarketing('001',ACTOR);
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.equal(h.calls.slice(n0).filter(c=>c.schemaName==='listing').length,1);
    const l=await rj(ws,'marketing/listing.json'), a=await rj(ws,'marketing/tag-selection.json');
    assert.match(l.description,/these printable pages to colour/);assert.doesNotMatch(l.description,/editable/);
    assert.match(l.digital_download_disclaimer,/No editable source files are included/,'a truthful negative is kept as written');
    assert.deepEqual(a.corrections,[{field:'description',from:'editable',to:'(removed)'}]);
  }finally{await h.cleanup();}
});

test('#022 recovery: a saved rejected listing that passes the CURRENT checks is reused on Retry with ZERO listing calls; a stale one is not',{timeout:600_000},async()=>{
  const {h,ws}=await productionApproved();
  try{
    const facts=await deriveFacts(ws), key=createHash('sha256').update(JSON.stringify({facts:factsForModel(facts),seo:null})).digest('hex');
    // What #022's model wrote: a truthful negative the OLD token rule rejected.
    const draft={data:{...LISTING(),digital_download_disclaimer:'Digital download only. No physical item is shipped. This is not an editable file.'},model:'fake-text'};
    await mkdir(join(ws,'marketing'),{recursive:true});
    await writeFile(join(ws,'marketing/listing.rejected.json'),JSON.stringify({input_sha256:key,rejected_at:'2026-10-07T19:04:26.095Z',problems:'old token rule',draft}));
    const n0=h.calls.length, r=await h.wf.runMarketing('001',ACTOR);
    assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    assert.equal(h.calls.slice(n0).filter(c=>c.schemaName==='listing').length,0,'no paid listing call');
    assert.match((await rj(ws,'marketing/listing.json')).digital_download_disclaimer,/This is not an editable file/);
    assert.equal((await rj(ws,'marketing/tag-selection.json')).recovered_from.file,'marketing/listing.rejected.json');
  }finally{await h.cleanup();}
  // Stale: the facts (or approved SEO focus) changed since the rejection -> the saved answer is ignored and the model is asked.
  const b=await productionApproved();
  try{
    const draft={data:LISTING(),model:'fake-text'};
    await mkdir(join(b.ws,'marketing'),{recursive:true});
    await writeFile(join(b.ws,'marketing/listing.rejected.json'),JSON.stringify({input_sha256:'f'.repeat(64),rejected_at:'2026-10-07T19:04:26.095Z',problems:'x',draft}));
    const n0=b.h.calls.length;assert.equal((await b.h.wf.runMarketing('001',ACTOR)).outcome,'awaiting_marketing_approval');
    assert.equal(b.h.calls.slice(n0).filter(c=>c.schemaName==='listing').length,1);
  }finally{await b.h.cleanup();}
});

test('10 (workflow). an ambiguous contradiction still fails, is saved for a free re-check, and makes no image call',{timeout:600_000},async()=>{
  const {h,ws}=await productionApproved({listing:()=>({...LISTING(),hook:'Edit the included source file to make it yours'})});
  try{
    const n0=h.calls.length;assert.equal((await h.wf.runMarketing('001',ACTOR)).outcome,'failed');
    const p=await h.store.load('001');assert.match(p.last_error.message,/listing: rejected: hook: "Edit the included source file" \(editable files are not delivered\)/);
    assert.equal(h.calls.slice(n0).filter(c=>c.kind==='image'||c.kind==='imageEdit').length,0);
    assert.match((await rj(ws,'marketing/listing.rejected.json')).draft.data.hook,/Edit the included source file/);
  }finally{await h.cleanup();}
});

test('every composition code can build is accepted by the committed creative-direction schema (cb-editorial-hero included)',async()=>{
  const { loadSchema }=await import('../src/orchestrator/schema.mjs'), { COMPOSITIONS }=await import('../../marketing/src/stage3/index.mjs');
  const en=(await loadSchema('marketing-creative-direction')).properties.slides.items.properties.composition.enum;
  assert.deepEqual(Object.keys(COMPOSITIONS).filter(k=>!en.includes(k)),[]);
});
