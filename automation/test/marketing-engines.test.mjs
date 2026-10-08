// Stage 3 marketing engines (Factory / Hybrid / AI Creative) through the real
// workflow: style choice, hero comparison, per-image regeneration, costs.
// OpenAI and Telegram are fakes (zero real calls); rendering and QC are real.
// No Etsy client exists anywhere in this path; nothing is published.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { harness, msg, press, button, concept, bookDirection } from './helpers.mjs';
import { artwork } from '../../production/test/fixtures.mjs';
import { menuData } from '../src/telegram/menu.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { loadPricing, CostLedger } from '../src/costs/index.mjs';
import { campaignCopy, usesEnvironment } from '../../marketing/src/stage3/index.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=p=>access(p).then(()=>true,()=>false);
const card=id=>concept(id,{proposed_name:`Robin ${id}`,product_type:'Christmas greetings card',product_format:'greeting-card',page_count:3,orientation:'portrait'});
const spec=()=>({name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',season:'Christmas',product_type:'Christmas greetings card',target_customer:'adults',page_count:3,
  canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'Coordinated card panels.'},
  pages:[['card-front','Merry Christmas','Exact title text: “Merry Christmas”.','Verify.'],['card-inside','Inside','Exact message: “Wishing you a joyful Christmas”.','Verify.'],
    ['card-back','Back','Motif. No text.','No printed text.']].map(([page_type,title,generation_prompt,production_notes],i)=>({page_number:i+1,page_type,title,concept:'c',instructions:null,artwork_description:'a',generation_prompt,production_notes}))});
const LISTING={title:'Robin Christmas Card Printable, 2 Designs, Merry Christmas and Christmas Wishes',
  description:'🎄 Two cosy robin Christmas cards to print at home.\n\nWhat is included:\n- 2 card designs\n- A4 and US Letter folded cards\n- 4×6 in card panels\n- Printing guide\n\nPrint on card stock at 100%, then trim and fold.\n\nThis is a digital download for personal use. No physical item is shipped.',
  tag_candidates:['robin christmas card','printable card','christmas card','holiday card','winter robin','xmas card print','card to print','diy christmas card','cottage christmas','bird greeting card','instant download','a4 christmas card','us letter card','robin xmas card'],
  materials:['Digital PDF','PNG artwork files'],suggested_price_gbp:3.95,pricing_rationale:'In line with two-design printable Christmas cards.',
  category_suggestion:'Paper & Party Supplies > Paper > Greeting Cards',occasion:'Christmas',primary_colour:'Red',secondary_colour:'Green',
  hook:'A cosy robin for your Christmas post',customer_summary:'Two storybook robin designs to print, trim and fold at home.',
  what_you_receive:['2 card designs','A4 and US Letter folded card PDFs','4×6 in card panels','Printing guide'],printing_summary:'Print at 100% on card stock, trim and fold.',
  digital_download_disclaimer:'Digital download only. No physical item is shipped.',
  listing_claims:[{key:'design-count',text:'2 card designs'},{key:'format',text:'A4 and US Letter'},{key:'printing-guide',text:'Printing guide'},{key:'digital',text:'Digital download'}]};
const ids=(user,section)=>[...((user.split(`${section} `)[1]??'').split('\n\n')[0]).matchAll(/^- ([\w-]+):/gm)].map(m=>m[1]);
const COPY=(_,{user})=>({lines:ids(user,'LINES').map(id=>({id,text:'For family, friends and neighbours near and far.'})),scenes:ids(user,'SCENES').map(id=>({id,brief:'A pine tabletop with ribbon and soft window light.'}))});
/** A well-behaved art director: every id it was given, varied archetypes. */
const ARCH=['editorial-right','editorial-left','centre-stage','diagonal','overhead','close-up'];
const DIRECTION=(_,{user})=>({campaign:{mood:'cosy candlelit Christmas evening',palette:'deep green, warm gold, cream',lighting:'warm window light'},
  slides:ids(user,'SLIDES').map((id,i)=>({id,archetype:ARCH[i%ARCH.length],product_scale:0.52,rotation:i%2?-4:3,perspective:2,lighting:'soft candlelight',decor:i%2?'bokeh':'sprigs',
    scene_brief:'A pine tabletop with candles, pine sprigs and soft bokeh, a clear empty surface on one side.'})),
  lines:ids(user,'LINES').map(id=>({id,text:'For family, friends and neighbours near and far.'}))});
const TABLE={schema_version:1,version:'test-v1',provider:'openai',currency:'USD',models:{'fake-text':{unit:'per_1m_tokens',text:{input:2,cached_input:0.2,cache_write:2.5,output:12}}},
  fx:{pair:'USD_GBP',rate:0.8,as_of:'2026-09-26',source:'test'}};

async function productionApproved(plan={}){
  const h=await harness({plan:{concepts:()=>({concepts:['A','B','C'].map(card)}),specification:spec,'creative-direction':()=>bookDirection(),
    listing:()=>structuredClone(LISTING),'marketing-copy':COPY,'art-direction':DIRECTION,...plan}});
  const pricing=loadPricing({table:TABLE,env:{}});h.wf.costs={ledger:new CostLedger({dir:join(h.root,'state','costs'),pricing}),pricing};
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(msg('/go'));
  await h.wf.handleUpdate(press(button(h.telegram,'A')));await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
  let p=await h.store.load('001');const ws=h.store.dirOf(p);
  for(const im of p.proofs.attempts[0].images)await h.store.writeBytes(p,im.file,await artwork(im.page_number));
  await writeFile(join(ws,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'001',card_variants:[
    {id:'A',name:'Merry Christmas',front_source:'proof-01',inside_source:'proof-02',back_type:'minimal'},
    {id:'B',name:'Christmas Wishes',front_source:'proof-03',inside_source:'proof-02',back_type:'minimal'}]}));
  await h.wf.handleUpdate(msg('/produce 001'));
  assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE PRODUCTION')))).outcome,'production_approved');
  return {h,ws,load:()=>h.store.load('001')};
}
const shown=h=>h.telegram.sent.filter(s=>(s.type==='message'||s.type==='edited')&&s.replyMarkup).at(-1);
const labels=h=>shown(h).replyMarkup.inline_keyboard.flat().map(b=>b.text);
const pressLabel=(h,label)=>{const b=shown(h).replyMarkup.inline_keyboard.flat().find(x=>x.text===label);assert.ok(b,`button "${label}" in ${labels(h).join(' | ')}`);return h.wf.handleUpdate(press(b.callback_data));};
const nav=(s,a='',b='')=>press(menuData(s,a,b));
const calls=(h,f)=>h.calls.filter(f).length;
const directionCalls=h=>calls(h,c=>c.schemaName==='art-direction'), imageCalls=h=>calls(h,c=>c.kind==='image');
const rj=async(ws,f)=>JSON.parse(await readFile(join(ws,f),'utf8'));
const noPublish=h=>h.telegram.sent.filter(s=>s.replyMarkup).every(s=>!JSON.stringify(s.replyMarkup).match(/epublish|econfirm|PUBLISH/));
async function images(ws){const out={};for(const f of (await readdir(join(ws,'marketing/images'))).filter(f=>f.endsWith('.png')))out[f]=sha(await readFile(join(ws,'marketing/images',f)));return out;}
async function choose(h,action){await h.wf.handleUpdate(nav('ask','001',action));return pressLabel(h,labels(h)[0]);}

test('style choice: Stage 3 opens the chooser (Hybrid recommended, never automatic); compare modes; confirmations show the estimate; nothing runs until confirmed',async()=>{
  const {h,load}=await productionApproved();
  try{
    const before=h.calls.length;
    await h.wf.handleUpdate(nav('prod','001'));
    assert.ok(labels(h).includes('🛍 Create Listing & Marketing'));
    assert.equal((await pressLabel(h,'🛍 Create Listing & Marketing')).outcome,'marketing_mode');
    const t=shown(h).text;
    assert.match(t,/^🛍 MARKETING\n\n#001 Robin at the Frosted Gate\n\nChoose a marketing style:\n\n✨ AI Creative\nPremium AI-directed advertising compositions\n\n🎨 Hybrid\nAI art direction \+ verified real product artwork\nRecommended\n\n🧱 Factory\nExisting deterministic LumiumX templates/);
    assert.deepEqual(labels(h),['✨ AI Creative','🎨 Hybrid — Recommended','🧱 Factory','🆚 Generate Hero Comparison','❓ Compare Modes','📦 Product','🏠 Home']);
    assert.equal((await load()).marketing?.engine,undefined,'no style is chosen automatically');
    assert.equal((await pressLabel(h,'❓ Compare Modes')).outcome,'marketing_modes_help');assert.match(shown(h).text,/Hybrid \(recommended\)[\s\S]*real Stage 2 artwork only, never an AI recreation/);
    await h.wf.handleUpdate(nav('ask','001','mhyb'));
    assert.match(shown(h).text,/Create the listing and marketing with 🎨 Hybrid\?\n⚠️ This will incur OpenAI API cost\.\nEstimated: 2 text calls \+ 6 image calls\./);
    assert.deepEqual(labels(h),['Create — API cost will be incurred','Cancel']);
    assert.equal((await pressLabel(h,'Cancel')).outcome,'marketing_mode','Cancel returns to the chooser');
    await h.wf.handleUpdate(nav('ask','001','mcmp'));assert.match(shown(h).text,/hero comparison[\s\S]*Estimated: 2 text calls \+ 3 image calls\./);
    assert.equal(h.calls.length,before,'nothing spent without confirmation');
    // The engine actions are only offered in PRODUCTION_APPROVED; a forged press elsewhere is refused.
    assert.equal((await h.wf.handleUpdate(nav('ask','001','mrs01'))).outcome,'stale');
    assert.ok(noPublish(h));
  }finally{await h.cleanup();}
});

test('Hybrid: one art-direction call with the real artwork, one environment per art-directed image, real artwork composited by code; QC incl. engine checks; costs in the ledger; mode stored',{timeout:300_000},async()=>{
  const {h,ws,load}=await productionApproved();
  try{
    const b0={dir:directionCalls(h),img:imageCalls(h),listing:calls(h,c=>c.schemaName==='listing'),copy:calls(h,c=>c.schemaName==='marketing-copy')};
    await h.wf.handleUpdate(nav('ask','001','mhyb'));const confirm=shown(h).replyMarkup.inline_keyboard[0][0].callback_data;
    assert.equal((await h.wf.handleUpdate(press(confirm))).outcome,'awaiting_marketing_approval');
    const p=await load(), plan=await rj(ws,'marketing/plan.json'), render=await rj(ws,'marketing/images/render.json'), qc=await rj(ws,'marketing/qc.json');
    const manifest=await rj(ws,'marketing/work/art-manifest.json'), facts=await rj(ws,'marketing/facts.json');
    // Mode stored with the run (product + plan).
    assert.equal(p.marketing.engine,'hybrid');assert.equal(p.marketing.engine_chosen.by,'@owner');assert.deepEqual(plan.engine,{id:'hybrid',version:1});
    // Calls: listing 1, art direction 1 (with the real artwork as image input), 6 environments; no Factory scene-brief call.
    const env=plan.slides.filter(usesEnvironment);
    assert.equal(env.length,6);
    assert.equal(calls(h,c=>c.schemaName==='listing')-b0.listing,1);assert.equal(directionCalls(h)-b0.dir,1);assert.equal(imageCalls(h)-b0.img,6);assert.equal(calls(h,c=>c.schemaName==='marketing-copy')-b0.copy,0);
    const dc=h.calls.filter(c=>c.schemaName==='art-direction').at(-1);
    assert.equal(dc.images,1,'the representative real artwork is sent for colour/mood');
    assert.match(dc.user,/ENGINE: Hybrid\. Allowed archetypes: editorial-right, editorial-left, centre-stage\./);assert.match(dc.user,/PRODUCT GEOMETRY: the real artwork is 512x768 px \(aspect 0\.6667, portrait\)/);
    // Environments: prompts forbid product substitutes and reserve an EMPTY product area; the product is never asked for.
    const scenes=h.calls.filter(c=>c.kind==='image').slice(-6);
    for(const c of scenes){assert.match(c.prompt,/clear, empty, softly lit surface/);assert.match(c.prompt,/Do NOT include: cards, greeting cards[\s\S]*any mock product/);assert.doesNotMatch(c.prompt,/Merry Christmas|Christmas Wishes|Printable/);}
    assert.deepEqual(plan.scenes.map(s=>s.file),env.map(s=>`marketing/engines/hybrid/scenes/${s.id}.png`));
    // Real Stage 2 artwork only, unstretched, traced; AI images are backgrounds only.
    const allowed=new Set(manifest.map(m=>m.sha256)), sceneShas=new Set(plan.scenes.map(s=>s.sha256));
    for(const r of render){assert.ok(r.artwork.length>0,r.file);for(const a of r.artwork){assert.ok(allowed.has(a.sha256));assert.ok(!sceneShas.has(a.sha256));assert.ok(Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)<=0.005);}}
    assert.ok(render.filter(r=>r.layout).length===6&&render.filter(r=>r.layout).every(r=>r.layout.min_share>=0.3));
    // Deterministic text: headlines are the campaign copy.
    const C=campaignCopy(facts);
    for(const s of plan.slides.filter(x=>x.template!=='design'))assert.deepEqual(s.copy.headline,C[s.template].headline,s.id);
    // QC: the standard Stage 3 checks plus the engine checks, all passing.
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    for(const n of ['product artwork dominates each image','product artwork traceable to Stage 2','product artwork not stretched','AI backgrounds never used as product artwork','headline text rendered by code from the plan',
      'image count matches plan','marketing engine recorded with the run','product region covered by real Stage 2 artwork','engine product visibility floor'])assert.ok(qc.checks.find(c=>c.name===n)?.ok,n);
    assert.equal(render.length,10);for(const r of render)assert.equal(r.width,2000);
    // Costs: every call in the ledger (Marketing stage); the review shows marketing + product totals.
    const {events}=h.wf.costs.ledger.events();
    assert.equal(events.filter(e=>e.step==='marketing-direction'&&e.stage==='marketing').length,1);assert.equal(events.filter(e=>e.step==='marketing-scene').length,6);
    const review=h.telegram.sent.filter(s=>s.type==='message').at(-1).text;
    assert.match(review,/^Marketing style: 🎨 Hybrid\n\nMarketing generation\nEstimated API cost: <?£\d+\.\d\d\n\nProduct total:\n<?£\d+\.\d\d\n\nApprove this listing/);
    // No Etsy, no publishing.
    assert.equal(await exists(join(ws,'etsy')),false);assert.ok(noPublish(h));
    // The confirm button is one-time.
    const n=h.calls.length;assert.equal((await h.wf.handleUpdate(press(confirm))).outcome,'stale');assert.equal(h.calls.length,n);
  }finally{await h.cleanup();}
});

test('AI Creative: wider archetypes accepted and clamped, same product-truth QC, deterministic reconstruction',{timeout:300_000},async()=>{
  const {h,ws,load}=await productionApproved();
  try{
    assert.equal((await choose(h,'mai')).outcome,'awaiting_marketing_approval');
    const plan=await rj(ws,'marketing/plan.json'), qc=await rj(ws,'marketing/qc.json'), render=await rj(ws,'marketing/images/render.json');
    assert.equal((await load()).marketing.engine,'ai-creative');assert.equal(plan.engine.id,'ai-creative');
    assert.match(h.calls.filter(c=>c.schemaName==='art-direction').at(-1).user,/CREATIVE LATITUDE: be bold and editorial/);
    const arch=Object.values(plan.directions).map(d=>d.archetype);
    assert.ok(arch.includes('diagonal')||arch.includes('overhead')||arch.includes('close-up'),'AI Creative archetypes kept');
    assert.ok(Object.values(plan.directions).every(d=>Math.abs(d.rotation)<=8&&d.product_scale<=0.7));
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    assert.ok(render.filter(r=>r.layout).every(r=>r.layout.region.w>0));
    assert.ok(noPublish(h));
  }finally{await h.cleanup();}
});

test('Factory via the chooser is the existing pipeline, unchanged: same calls and byte-identical images as /market',{timeout:600_000},async()=>{
  const a=await productionApproved(), b=await productionApproved();
  try{
    const ca=a.h.calls.length, cb=b.h.calls.length;
    assert.equal((await a.h.wf.handleUpdate(msg('/market 001'))).outcome,'awaiting_marketing_approval');
    assert.equal((await choose(b.h,'mfac')).outcome,'awaiting_marketing_approval');
    const kinds=h=>h.calls.slice(h===a.h?ca:cb).map(c=>c.schemaName??c.kind);
    assert.deepEqual(kinds(b.h),kinds(a.h));assert.deepEqual(kinds(a.h),['listing','marketing-copy','image','image','image','image']);
    assert.deepEqual(await images(b.ws),await images(a.ws),'Factory images are identical');
    assert.equal((await rj(a.ws,'marketing/plan.json')).engine.id,'factory');assert.equal((await a.load()).marketing.engine,'factory','the bare command records Factory');
    assert.equal((await b.load()).marketing.engine,'factory');
    // Factory composite rebuild: zero OpenAI calls.
    const n=b.h.calls.length;
    assert.equal((await b.h.wf.handleUpdate(press(encode('mrc.04','001',(await b.load()).review.nonce)))).outcome,'awaiting_marketing_approval');
    assert.equal(b.h.calls.length,n,'£0: no OpenAI call');
    // Factory has no art direction to change.
    await b.h.wf.handleUpdate(nav('mslide','001','05'));assert.ok(!labels(b.h).includes('🎨 Change Direction'));
    assert.equal((await b.h.wf.handleUpdate(nav('ask','001','mrd05'))).outcome,'stale');
  }finally{await a.h.cleanup();await b.h.cleanup();}
});

test('hero comparison: only 01-hero in all three styles, costed, labelled; choosing Hybrid then reuses its paid hero direction and environment',{timeout:300_000},async()=>{
  const {h,ws,load}=await productionApproved();
  try{
    const d0=directionCalls(h), i0=imageCalls(h);
    assert.equal((await choose(h,'mcmp')).outcome,'hero_comparison_ready');
    assert.equal(directionCalls(h)-d0,2);assert.equal(imageCalls(h)-i0,3);
    const p=await load();
    assert.equal(p.status,'PRODUCTION_APPROVED','a comparison does not start the campaign');
    const photos=h.telegram.sent.filter(s=>s.type==='photo').slice(-3).map(s=>s.caption);
    assert.deepEqual(photos,['#001 · 🧱 Factory — 01 Hero','#001 · 🎨 Hybrid — 01 Hero','#001 · ✨ AI Creative — 01 Hero']);
    assert.match(shown(h).text,/HERO COMPARISON[\s\S]*Which direction should I use\?[\s\S]*Product total: £/);
    assert.deepEqual(labels(h),['✨ AI Creative','🎨 Hybrid','🧱 Factory','📦 Product','🏠 Home']);
    for(const e of ['factory','hybrid','ai-creative'])assert.ok(await exists(join(ws,`marketing/comparison/${e}/01-hero.png`)),e);
    const {events}=h.wf.costs.ledger.events();
    assert.equal(events.filter(e=>e.operation==='marketing-compare').length,5,'2 direction + 3 image calls, all in the ledger');
    // Choose Hybrid from the comparison: the hero direction and environment are reused (never paid twice).
    const heroDir=p.marketing.comparison.engines.hybrid.direction, heroScene=p.marketing.comparison.engines.hybrid.scene;
    await h.wf.handleUpdate(nav('ask','001','mhyb'));assert.match(shown(h).text,/Estimated: 2 text calls \+ 5 image calls\./);
    const d1=directionCalls(h), i1=imageCalls(h);
    assert.equal((await pressLabel(h,labels(h)[0])).outcome,'awaiting_marketing_approval');
    assert.equal(directionCalls(h)-d1,1);assert.equal(imageCalls(h)-i1,5,'5 new environments; the hero one is reused');
    const plan=await rj(ws,'marketing/plan.json');
    assert.deepEqual(plan.directions['01-hero'],heroDir);assert.equal(plan.scenes.find(s=>s.slide==='01-hero').sha256,heroScene.sha256);
    assert.equal((await rj(ws,'marketing/qc.json')).passed,true);
  }finally{await h.cleanup();}
});

test('per-image: list with status, view, £0 rebuild composite, paid scene regeneration (archived, never deleted), change direction from an instruction; stale presses harmless',{timeout:300_000},async()=>{
  const {h,ws,load}=await productionApproved();
  try{
    assert.equal((await choose(h,'mhyb')).outcome,'awaiting_marketing_approval');
    assert.equal((await h.wf.handleUpdate(nav('mslides','001'))).outcome,'marketing_slides');
    assert.match(shown(h).text,/Style: 🎨 Hybrid\n\n01 Hero {13}✅[\s\S]*05 Design Detail A  ✅/);
    assert.equal(labels(h).length,12);
    assert.equal((await h.wf.handleUpdate(nav('mslide','001','05'))).outcome,'marketing_slide');
    assert.deepEqual(labels(h),['👀 View','✨ Regenerate Scene','🎨 Change Direction','🧱 Rebuild Composite','⬅️ Back','🏠 Home']);
    assert.match(shown(h).text,/Rebuild Composite: re-render from the existing assets\. £0\.00 OpenAI cost\./);
    assert.equal((await pressLabel(h,'👀 View')).outcome,'marketing_slide_viewed');assert.match(h.telegram.sent.filter(s=>s.type==='photo').at(-1).caption,/05 Design Detail A/);
    // Rebuild Composite: zero OpenAI calls; only that image re-rendered; others byte-identical.
    const before=await images(ws), n=h.calls.length;
    const rebuild=shown(h).replyMarkup.inline_keyboard.flat().find(b=>b.text==='🧱 Rebuild Composite').callback_data;
    assert.equal((await h.wf.handleUpdate(press(rebuild))).outcome,'awaiting_marketing_approval');
    assert.equal(h.calls.length,n,'£0.00: no OpenAI call');
    assert.deepEqual(await images(ws),before,'deterministic: identical images');
    assert.equal((await h.wf.handleUpdate(press(rebuild))).outcome,'stale','a second press does nothing');
    assert.deepEqual((await load()).marketing.asset_ops.map(o=>[o.slide,o.op]),[['05-design-a','composite']]);
    assert.equal(h.telegram.sent.filter(s=>s.type==='photo').at(-1).caption,'#001 · 05-design-a','only the changed image is re-sent');
    // Regenerate Scene: confirmation with an estimate, 1 image call, old scene archived.
    await h.wf.handleUpdate(nav('ask','001','mrs01'));assert.match(shown(h).text,/Regenerate the scene for this image\?[\s\S]*Estimated: 1 image call\./);
    const i0=imageCalls(h);
    assert.equal((await pressLabel(h,labels(h)[0])).outcome,'awaiting_marketing_approval');
    assert.equal(imageCalls(h)-i0,1);
    assert.ok(await exists(join(ws,'marketing/history/assets/01-hero-v01.png')),'replaced environment archived');
    // Change Direction: an instruction message, then 1 art-direction + 1 image call for that image only.
    await h.wf.handleUpdate(nav('ask','001','mrd09'));assert.match(shown(h).text,/Estimated: 1 text call \+ 1 image call\./);
    assert.equal((await pressLabel(h,labels(h)[0])).outcome,'awaiting_direction_feedback');
    const d0=directionCalls(h), i1=imageCalls(h);
    assert.equal((await h.wf.handleUpdate(msg('warmer candlelight and more depth'))).outcome,'awaiting_marketing_approval');
    assert.equal(directionCalls(h)-d0,1);assert.equal(imageCalls(h)-i1,1);
    const last=h.calls.filter(c=>c.schemaName==='art-direction').at(-1);
    assert.match(last.user,/OWNER CHANGE REQUEST for this direction: "warmer candlelight and more depth"/);assert.deepEqual(ids(last.user,'SLIDES'),['09-gift']);
    const p=await load();
    assert.deepEqual(p.marketing.asset_ops.map(o=>o.op),['composite','scene','direction']);assert.equal(p.pending_input,null);
    assert.equal((await rj(ws,'marketing/qc.json')).passed,true);
    assert.ok(noPublish(h));assert.equal(await exists(join(ws,'etsy')),false);
  }finally{await h.cleanup();}
});
