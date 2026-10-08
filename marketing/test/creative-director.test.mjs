// Stage 3 Creative Director (ADR-058): the crochet code baseline plan, direction
// validation, the variety and truth checks, and the small composer extensions.
// Deterministic: no model, no network. One test renders through Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAGE3_ADAPTERS, claimProblems, normaliseCreative, composeCreative, creativeVariety, creativeTruth, limitEnvironments, creativeSlides,
  COMPOSITIONS, BUYER_JOBS, MAX_ENVIRONMENTS, environmentCap, MAX_UPSCALE, fitCrop, renderSlides, productShare, campaignFor, ENGINE_VERSION } from '../src/stage3/index.mjs';
import { creativeFacts, creativeArt } from './creative-fixture.mjs';

const C=STAGE3_ADAPTERS['crochet-pattern-bundle'];
const setup=async(o)=>{const facts=creativeFacts(o), art=await creativeArt(facts), plan=C.creative.plan(facts,{}), catalogue=C.creative.catalogue(facts,art);
  return {facts,art,plan,catalogue,directions:Object.fromEntries(plan.slides.map(s=>[s.id,normaliseCreative(null,s,{catalogue,facts})]))};};
const FIELDS=['purpose','buyer_message','emotional_goal','headline','focal_asset','supporting_assets','composition','hierarchy','background','props','crop','text_zone','claims_used','avoid'];

test('code baseline: eight cards, one buyer job each, every direction field, assets only from the catalogue',async()=>{
  const {plan,catalogue}=await setup();
  assert.deepEqual(plan.slides.map(s=>s.job),Object.keys(BUYER_JOBS));
  assert.deepEqual(plan.slides.map(s=>s.id),['01-stop-scroll','02-what-you-get','03-quality','04-variety','05-useful','06-how-it-works','07-desire','08-doubts']);
  for(const s of plan.slides){
    for(const k of FIELDS)assert.ok(k in s.creative,`${s.id} ${k}`);
    assert.ok(COMPOSITIONS[s.creative.composition],s.id);
    for(const id of [s.creative.focal_asset,...s.creative.supporting_assets,...(s.creative.crop?[s.creative.crop.asset]:[])])assert.ok(catalogue[id],`${s.id} ${id}`);
    assert.ok(String(s.copy.headline.text).split(/\s+/).length<=7,`${s.id} headline ≤ 7 words`);
  }
  assert.equal(plan.slides.filter(s=>s.creative.background==='environment').length,1,'one paid environment (card 07)');
  assert.deepEqual(plan.slides.map(s=>s.creative.headline.replace(/\n/g,' ')),['6 Crochet Bouquet Patterns','Everything in Your Download','Inside the Garden Rose','6 Patterns to Make',
    'Beginner to Experienced','Download · Print · Crochet','Your Quiet Crafting Hour','Digital PDF Pattern Download']);
  // The three approved renders are used: bouquet (hero), detail (quality, process, lifestyle), overview (variety).
  assert.equal(plan.slides[0].creative.focal_asset,'render-bouquet');assert.equal(plan.slides[2].creative.focal_asset,'render-detail');
  assert.equal(plan.slides[3].creative.focal_asset,'render-overview');assert.equal(plan.slides[6].creative.focal_asset,'render-detail');
});

test('baseline copy: every claim-tagged phrase is in the claim allow-list, and no text breaks the claim or crochet integrity rules',async()=>{
  const {facts,plan}=await setup();
  const items=s=>[s.copy.headline,s.copy.kicker,s.copy.subline,...(s.copy.meta??[]),...(s.extras.labels??[]),...(s.extras.names??[]),...(s.extras.list??[]),
    ...(s.extras.steps??[]).flatMap(x=>[x.label,x.note]),...(s.extras.facts??[]).map(x=>x.item)].filter(Boolean);
  let n=0;
  for(const s of plan.slides)for(const it of items(s)){
    assert.deepEqual(claimProblems(it.text,facts,{where:s.id}),[],`${s.id}: ${it.text}`);
    if(it.claim){n++;assert.ok(facts.claims[it.claim[0]]?.includes(it.claim[1]),`${s.id}: ${it.claim.join(' = ')}`);}
  }
  assert.ok(n>=20,`${n} claim-tagged phrases`);
  // A feature is stated only when every pattern has it.
  assert.ok(!plan.slides[4].extras.list.some(x=>/stitch counts/i.test(x.text)),'stitch counts: not every pattern gives them');
  assert.ok(C.creative.plan({...facts,stitch_counts:true},{}).slides[4].extras.list.some(x=>/stitch counts/i.test(x.text)));
});

test('variety check: the baseline passes; same composition, ground, placement, all floating pages, no lifestyle and a small product are each caught',async()=>{
  const {directions}=await setup();
  const v=creativeVariety(directions,{shares:{a:.6,b:.5,c:.4}});
  assert.ok(v.checks.every(c=>c.ok),JSON.stringify(v.checks.filter(c=>!c.ok)));
  assert.equal(Object.keys(v.summary.compositions).length,8);assert.equal(Object.keys(v.summary.backgrounds).length,8);
  const all=f=>Object.fromEntries(Object.entries(directions).map(([k,d])=>[k,{...d,...f(d)}]));
  const failed=(d,o)=>creativeVariety(d,o).checks.filter(c=>!c.ok).map(c=>c.name);
  assert.deepEqual(failed(all(()=>({composition:'collection'}))),['creative variety: compositions']);
  assert.ok(failed(all(()=>({background:'linen'}))).includes('creative variety: backgrounds'));
  assert.ok(failed(all(()=>({composition:'included-spread'}))).includes('creative variety: not only floating pages'));
  assert.ok(failed(all(()=>({text_zone:'top-centre'}))).includes('creative variety: headline placement'));
  assert.ok(failed(all(d=>d.job==='desire'?{job:'doubts',composition:'fact-sheet'}:{})).includes('creative variety: lifestyle / emotional storytelling'));
  assert.ok(failed(directions,{shares:{a:.2,b:.3,c:.25}}).includes('creative variety: product presence across the campaign'));
  assert.ok(creativeVariety(all(()=>({background:'linen'}))).warnings.some(w=>/Background "linen"/.test(w)));
});

test('direction validation: valid model choices are kept; unknown assets, compositions, grounds, zones and crops fall back (recorded); headlines with numbers or unsupported claims are refused',async()=>{
  const {facts,plan,catalogue}=await setup(), s=plan.slides[2];
  const ok=normaliseCreative({composition:'macro-detail',background:'dusk',text_zone:'left-column',focal_asset:'render-detail',supporting_assets:['page-garden-rose'],
    crop:{asset:'render-detail',focus:[.45,.5],zoom:1.3},headline:'A Rose, Up Close',props:['tea cup','a vase of real roses']},s,{catalogue,facts});
  assert.deepEqual([ok.background,ok.text_zone,ok.headline,ok.source,ok.fallbacks],['dusk','left-column','A Rose, Up Close','model',[]]);
  assert.deepEqual(ok.crop,{asset:'render-detail',focus:[.45,.5],zoom:1.3});
  assert.deepEqual(ok.props,['tea cup'],'props only from the niche list');
  const bad=normaliseCreative({composition:'spinning-cube',focal_asset:'photo-of-finished-rose',supporting_assets:['page-garden-rose','nope'],background:'neon',
    text_zone:'bottom-left',crop:{asset:'render-detail',focus:[2,0],zoom:9},headline:'33 Tested Rose Patterns'},s,{catalogue,facts});
  for(const k of ['composition','focal_asset','supporting_assets','background','crop','headline'])assert.ok(bad.fallbacks.includes(k),k);
  assert.equal(bad.composition,s.creative.composition);assert.equal(bad.focal_asset,'render-detail');assert.equal(bad.headline,s.creative.headline);
  assert.equal(bad.text_zone,s.creative.text_zone,'a zone the composition does not allow');
  assert.ok(normaliseCreative({headline:'Professionally Tested Rose'},s,{catalogue,facts}).fallbacks.includes('headline'));
  assert.ok(normaliseCreative({headline:'One two three four five six seven eight'},s,{catalogue,facts}).fallbacks.includes('headline'),'more than 7 words');
  const keep=normaliseCreative({crop:{asset:'',focus:[.5,.5],zoom:1}},s,{catalogue,facts});
  assert.deepEqual([keep.crop,keep.fallbacks],[s.creative.crop,[]],'an empty crop asset keeps the baseline');
  // A changed composition takes a ground and zone it allows.
  const moved=normaliseCreative({composition:'lifestyle'},s,{catalogue,facts});
  assert.deepEqual([moved.background,COMPOSITIONS.lifestyle.zones.includes(moved.text_zone)],['environment',true]);
});

test(`paid environments never exceed the baseline (max ${MAX_ENVIRONMENTS}): the applied slides take only validated headlines and tone lines`,async()=>{
  const {facts,plan,catalogue}=await setup();
  const d=Object.fromEntries(plan.slides.map(s=>[s.id,normaliseCreative({composition:'lifestyle',background:'environment',focal_asset:'render-detail',supporting_assets:['doc-index','page-garden-rose']},s,{catalogue,facts})]));
  assert.equal(environmentCap(plan.slides),1,'the crochet baseline plans one AI scene (card 07)');
  limitEnvironments(d,plan.slides);
  assert.deepEqual(Object.entries(d).filter(([,x])=>x.background==='environment').map(([k])=>k),['07-desire'],'the baseline environment card keeps it; no card adds one');
  const two=Object.fromEntries(Object.entries(d).map(([k,x])=>[k,{...x,background:'environment',fallbacks:[]}]));
  limitEnvironments(two,plan.slides,9);
  assert.equal(Object.values(two).filter(x=>x.background==='environment').length,8,'an explicit cap is honoured');
  assert.equal(environmentCap(plan.slides.map(s=>({...s,creative:{...s.creative,background:'environment'}}))),MAX_ENVIRONMENTS,'never above the hard maximum');
  assert.ok(Object.values(d).filter(x=>x.fallbacks.includes('background (environment limit)')).length>=5);
  const dirs={...Object.fromEntries(plan.slides.map(s=>[s.id,normaliseCreative(null,s,{catalogue,facts})])),'07-desire':normaliseCreative({headline:'Slow Evenings, Soft Yarn'},plan.slides[6],{catalogue,facts})};
  const out=creativeSlides(plan.slides,dirs,[{id:'07-desire',text:'A calm hour with your hook.'}]);
  assert.equal(out[6].copy.headline.text,'Slow Evenings, Soft Yarn');assert.equal(out[6].copy.subline.text,'A calm hour with your hook.');
  assert.equal(out[0],plan.slides[0],'unchanged cards are untouched (claim-tagged code headline kept)');
});

test('fitCrop: inside the allowed region, centred on the focus, upscale reported; a render can never be placed whole',async()=>{
  const a={width:1024,height:1536}, tf={x:0,y:.235,w:1,h:.765};
  const f=fitCrop(a,{frameW:2000,frameH:1500,bounds:tf,focus:[.5,.1],zoom:1});
  assert.ok(f.crop.y>=tf.y-1e-9&&f.crop.y+f.crop.h<=1+1e-9);assert.equal(+f.crop.w.toFixed(4),1);assert.ok(Math.abs(f.upscale-2000/1024)<1e-9);
  const z=fitCrop(a,{frameW:900,frameH:1570,bounds:{x:0,y:.27,w:1,h:.73},focus:[.5,.53],zoom:1.5});
  assert.ok(z.crop.x>0&&z.crop.y>=.27&&z.crop.x+z.crop.w<1);
  const {facts,plan,catalogue}=await setup(), s=plan.slides[1];
  assert.throws(()=>composeCreative(s,{facts,catalogue,direction:{...s.creative,focal_asset:'render-bouquet'},tokens:campaignFor(facts).tokens}),/baked-in lettering/);
});

test('every card composes from the catalogue: renders cropped below their lettering, within the resolution floor, tied to approved pattern IDs and labelled as illustrations',async()=>{
  const {facts,plan,catalogue,directions}=await setup(), T=campaignFor(facts).tokens;
  const results=plan.slides.map(s=>{const r=composeCreative(s,{facts,catalogue,direction:directions[s.id],tokens:T});return {slide:s.id,layout:r.layout,html:r.bodyHtml};});
  assert.ok(creativeTruth(results,facts).every(c=>c.ok),JSON.stringify(creativeTruth(results,facts)));
  for(const r of results)for(const c of r.layout.crops)if(catalogue[c.asset].kind==='render'){
    assert.ok(c.crop.y>=catalogue[c.asset].text_free.y-1e-3,`${r.slide} ${c.asset} below its lettering`);assert.ok(c.upscale<=MAX_UPSCALE+1e-9,`${r.slide} ${c.upscale}`);}
  const withRender=results.filter(r=>r.layout.renders.length);
  assert.deepEqual(withRender.map(r=>r.slide),['01-stop-scroll','03-quality','04-variety','06-how-it-works','07-desire']);
  for(const r of withRender)assert.match(r.html,/data-claim="render" data-claim-value="(Illustrated example|Illustration)"/,r.slide);
  assert.deepEqual(results[3].layout.renders[0].depicts,['garden-rose','moon-peony','blush-tulip','wild-sunflower','sage-eucalyptus','twilight-lily']);
  // The truth check fails a crop above the lettering, a soft crop or a render tied to an unknown pattern.
  const broken=[{slide:'x',layout:{creative:true,crops:[{asset:'render-bouquet',crop:{x:0,y:.1,w:1,h:.5},bounds:{x:0,y:.235,w:1,h:.765},upscale:2.6}],renders:[{asset:'render-bouquet',depicts:['made-up']}]}}];
  assert.ok(creativeTruth(broken,facts).every(c=>!c.ok));
});

test('the Factory plan is unchanged; formats without a creative plan keep the region-template path; every adapter states its niche direction',async()=>{
  const {facts}=await setup();
  assert.deepEqual(C.planSlides(facts,{}).slides.map(s=>s.template),['hero','interior','collage','index','included','printable','lifestyle','bundle']);
  for(const [k,a] of Object.entries(STAGE3_ADAPTERS)){
    const d=a.creativeDirection();
    assert.ok(d.buyer_thought&&d.identity&&d.truth.length&&d.allowed_props.length&&d.preferred_compositions.every(c=>COMPOSITIONS[c]),k);
    assert.equal(!!a.creative,k!=='greeting-card',k);   // crochet (ADR-058) and colouring books (ADR-060) opt in
  }
  assert.match(STAGE3_ADAPTERS['colouring-book'].creativeDirection().truth.join(' '),/labelled "Example"/);
  assert.match(STAGE3_ADAPTERS['greeting-card'].creativeDirection().truth.join(' '),/envelope may appear only as a styling prop/);
  // A crochet package without approved renders still gets eight cards from real pages.
  const bare=C.creative.plan(creativeFacts({renders:false}),{});
  assert.equal(bare.slides.length,8);
  assert.ok(bare.slides.every(s=>![s.creative.focal_asset,...s.creative.supporting_assets].some(id=>/^render-/.test(id))),'no render is named when none is approved');
  const bf=creativeFacts({renders:false}), ba=await creativeArt(bf), bc=C.creative.catalogue(bf,ba);
  for(const s of bare.slides){const r=composeCreative(s,{facts:bf,catalogue:bc,direction:normaliseCreative(null,s,{catalogue:bc,facts:bf}),tokens:campaignFor(bf).tokens});
    assert.doesNotMatch(r.bodyHtml,/data-claim="render" data-claim-value="(Illustrated example|Illustration)"/,`${s.id}: no illustration label without an approved render`);}
});

test('facts: the approved renders reach Stage 3 SHA-verified, with the checked pattern IDs they depict; unchecked specs are skipped; changed files or unknown patterns are refused',async()=>{
  const { approvedRenders } = await import('../src/stage3/adapters/crochet-pattern-bundle.mjs');
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const dir=await mkdtemp(join(tmpdir(),'dpf-renders-'));
  try{
    await mkdir(join(dir,'proofs'));
    const assets=[];
    for(const id of ['proof-01','proof-02','proof-03']){const b=Buffer.from(`png ${id}`);await writeFile(join(dir,'proofs',`${id}.png`),b);
      assets.push({id,file:`proofs/${id}.png`,sha256:createHash('sha256').update(b).digest('hex'),width:1024,height:1536});}
    const ids=['garden-rose','moon-peony','blush-tulip'];
    const handoff=(over={})=>({assets,crochet_layout:{hero:'proof-01',overview:'proof-02',motif:'proof-03',used:['proof-01','proof-02','proof-03']},
      pages:[{page_type:'cover',asset:'proof-01'},{page_type:'pattern-overview',asset:'proof-02'},{page_type:'detail-motif',asset:'proof-03'}],
      crochet:{visuals:{fingerprints:{'garden-rose':{pattern_name:'Garden Rose'},'moon-peony':{pattern_name:'Moon Peony'},'blush-tulip':{pattern_name:'Blush Tulip'}},
        specs:{cover:{status:'internally_checked',items:[{pattern_id:'garden-rose',quantity:1},{pattern_id:'blush-tulip',quantity:2}]},
          overview:{status:'internally_checked',items:ids.map(pattern_id=>({pattern_id,quantity:1}))},detail:{status:'internally_checked',items:[{pattern_id:'garden-rose',quantity:1}]},...over}}}});
    const r=await approvedRenders(dir,handoff(),ids);
    assert.deepEqual(r.map(x=>[x.role,x.asset]),[['bouquet','proof-01'],['overview','proof-02'],['detail','proof-03']]);
    assert.deepEqual(r[0].depicts,[{pattern_id:'garden-rose',pattern_name:'Garden Rose',quantity:1},{pattern_id:'blush-tulip',pattern_name:'Blush Tulip',quantity:2}]);
    assert.ok(r.every(x=>x.kind==='illustration'&&x.photographic_evidence===false&&x.text_free.y>0.2&&x.text_free.y+x.text_free.h===1));
    assert.deepEqual((await approvedRenders(dir,handoff({overview:{status:'draft',items:[{pattern_id:'moon-peony',quantity:1}]}}),ids)).map(x=>x.role),['bouquet','detail'],'an unchecked spec is not shown');
    await assert.rejects(approvedRenders(dir,handoff({detail:{status:'internally_checked',items:[{pattern_id:'not-approved',quantity:1}]}}),ids),/not approved: not-approved/);
    await writeFile(join(dir,'proofs','proof-02.png'),'changed');
    await assert.rejects(approvedRenders(dir,handoff(),ids),/overview render \(proof-02\) is missing or changed/);
    assert.deepEqual(await approvedRenders(dir,{assets,crochet_layout:{}},ids),[],'a package built before the visual gate has no renders');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('renders through Chromium: a cropped render counts only where it is seen, off-canvas bleed is not overflow, the placeholder scene is labelled',{timeout:180_000},async()=>{
  const {facts,art,plan,directions}=await setup(), out=await mkdtemp(join(tmpdir(),'dpf-creative-'));
  try{
    const slides=[plan.slides[0],plan.slides[6],plan.slides[7]];
    const res=await renderSlides({facts,plan:{slides},art,outDir:out,engine:'ai-creative',directions});
    for(const r of res)assert.equal(r.overflowPx,0,`${r.slide} bleed is clipped, not overflow`);
    const hero=res[0].artwork.find(a=>a.crop);
    assert.ok(hero.visible.w<=2000&&hero.rect.h>hero.visible.h,'the whole render is placed; only the cropped part is visible');
    assert.ok(productShare(res[0].artwork,2000)>=plan.slides[0].min_product_share);
    for(const a of res.flatMap(r=>r.artwork))assert.ok(a.complete&&Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)<0.005,'never stretched');
    assert.ok(res[1].claimTokens.some(t=>t.claim==='render'&&t.value==='Illustration'));
    assert.equal(ENGINE_VERSION,1);
  }finally{await rm(out,{recursive:true,force:true});}
});
