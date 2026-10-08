// Colouring books on the Stage 3 Creative Director architecture (ADR-060): deterministic parts only
// (no model, no network). The model-facing call and caching are covered in automation/test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAGE3_ADAPTERS, planSlides, planColouringCreative, colouringCatalogue, deriveStrategy, normaliseCreative, normaliseConcept, baselineConcept, conceptDigest,
  limitEnvironments, environmentCap, MAX_ENVIRONMENTS, COMPOSITIONS, compositionsForModel, creativeSlides, renderSlides, productShare, engineQc, composeEngineSlide, usesCreativeEnvironment,
  exampleFidelity, fidelityChecks, FIDELITY_SEVERE, FIDELITY_MILD, backplateDifferentiation, COLOURING_MAX_ENVIRONMENTS, claimIndex } from '../src/stage3/index.mjs';
import { rendererAvailable } from '../src/render.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { book } from './colouring-fixture.mjs';

const adapter=STAGE3_ADAPTERS['colouring-book'];
const withClaims=f=>{f.claims=adapter.claimIndex(f);return f;};
const plan=async o=>{const {facts,A}=await book(o);withClaims(facts);return {facts,A,plan:planColouringCreative(facts,{strategy:deriveStrategy(facts)}),catalogue:colouringCatalogue(facts,A)};};

test('the colouring-book adapter opts into the creative slot; the cap is adapter-specific; crochet and the default cap are unchanged',async()=>{
  assert.equal(typeof adapter.creative.plan,'function');assert.equal(typeof adapter.creative.catalogue,'function');
  assert.equal(adapter.creative.maxEnvironments,3);assert.equal(COLOURING_MAX_ENVIRONMENTS,3);assert.equal(adapter.creative.concept,true);
  assert.equal(typeof adapter.creativeDirection().buyer_thought,'string');
  assert.equal(MAX_ENVIRONMENTS,2,'the default cap (crochet) is unchanged');
  assert.equal(STAGE3_ADAPTERS['crochet-pattern-bundle'].creative.maxEnvironments,undefined);
  assert.equal(STAGE3_ADAPTERS['greeting-card'].creative,undefined);
});

for(const orientation of ['landscape','portrait'])test(`${orientation}: a deterministic 10-card baseline, three backplates (01 and 02 share one), nothing product-specific`,async()=>{
  const {facts,plan:p}=await plan(orientation), again=planColouringCreative(facts,{strategy:deriveStrategy(facts)});
  assert.deepEqual(JSON.parse(JSON.stringify(again)),JSON.parse(JSON.stringify(p)),'deterministic');
  assert.deepEqual(p.slides.map(s=>s.id),['01-hero','02-preview','03-contents','04-coloured','05-before-after','06-lifestyle','07-showcase','08-download','09-cozy','10-bundle']);
  assert.ok(p.slides.every(s=>s.template==='creative'&&s.creative.allowed_compositions.length===1&&s.creative.composition===s.creative.allowed_compositions[0]));
  const env=p.slides.filter(s=>usesCreativeEnvironment(s));
  assert.deepEqual(env.map(s=>s.id),['01-hero','02-preview','06-lifestyle','09-cozy']);
  const owners=env.filter(s=>!s.creative.scene_of);
  assert.deepEqual(owners.map(s=>s.id),['01-hero','06-lifestyle','09-cozy'],'three paid backplates');
  assert.equal(env.find(s=>s.id==='02-preview').creative.scene_of,'01-hero');
  assert.equal(environmentCap(p.slides,p.creative.max_environments),3);
  assert.equal(environmentCap(p.slides),2,'the default cap would be 2');
  // 01 and 02 differ in composition and in how the shared backplate is framed.
  const [a,b]=[p.slides[0].creative,p.slides[1].creative];
  assert.notEqual(a.composition,b.composition);assert.ok(b.scene_view.zoom>1&&b.crop.zoom>1);
  // One coloured example, shown by 01, 04 and 05; the example's page is the hero's page.
  assert.deepEqual(p.examples.map(e=>[e.id,e.used_by]),[['example-p2',['01-hero','04-coloured','05-before-after']]]);assert.equal(a.focal_asset,'page-2');
  // Every directed asset is in the catalogue; no baseline text mentions a product.
  const cat=colouringCatalogue(facts,(await plan(orientation)).A);
  for(const s of p.slides)for(const id of [s.creative.focal_asset,...s.creative.supporting_assets])assert.ok(cat[id],`${s.id} ${id}`);
  assert.doesNotMatch(JSON.stringify(p),/railway|017/i);
  // The concept baseline is generic, descriptive and valid.
  assert.equal(p.concept.source,'baseline');assert.ok(p.concept.strongest_pages.every(id=>cat[id]));
  // Factory planning is untouched.
  assert.deepEqual(planSlides(facts,{strategy:deriveStrategy(facts)}).slides.map(s=>s.template),['hero','interior','collage','coloured','before-after','included','printable','features','lifestyle','bundle']);
});

test('concept normalisation: valid values kept, invalid ones fall back to the baseline and are recorded; strongest_pages must be catalogue ids; product-substitute materials are dropped',async()=>{
  const {facts,catalogue}=await plan('landscape'), base=baselineConcept(facts);
  const good={campaign_concept:'Quiet Evening',emotional_hook:'A slow hour with pencils.',buyer_feeling:['cozy','relaxed'],visual_world:{palette:'amber and walnut',materials:['wood','paper','knit'],lighting:'golden evening light',photography_style:'premium lifestyle'},
    hero_subject:'the scene',strongest_pages:['page-3','page-99'],transformation_story:'Lines become colour.',marketing_priority:'transformation',avoid:['clutter']};
  const c=normaliseConcept(good,base,{catalogue});
  assert.equal(c.source,'model');assert.deepEqual(c.fallbacks,[]);assert.deepEqual(c.strongest_pages,['page-3']);assert.deepEqual(c.visual_world.materials,['wood','knit'],'"paper" is never a backplate material');
  const bad=normaliseConcept({...good,strongest_pages:['page-99','nope'],campaign_concept:'',visual_world:{...good.visual_world,palette:''}},base,{catalogue});
  assert.deepEqual(bad.fallbacks.sort(),['concept.campaign_concept','concept.strongest_pages','concept.visual_world.palette']);
  assert.equal(bad.campaign_concept,base.campaign_concept);assert.deepEqual(bad.strongest_pages,base.strongest_pages.filter(id=>catalogue[id]));
  const none=normaliseConcept(undefined,base,{catalogue});assert.equal(none.source,'baseline');assert.deepEqual(none.fallbacks,[]);
  assert.notEqual(conceptDigest(c),conceptDigest(base));assert.equal(conceptDigest(c),conceptDigest({...c,avoid:['other']}),'the digest covers what styles the images');
});

test('directions: support lines are validated against the facts, headlines stay at 7 words with no digits, and the model cannot leave a card\'s allowed compositions',async()=>{
  const {facts,plan:p,catalogue}=await plan('landscape'), card=p.slides[5], ctx={catalogue,facts};
  const ok=normaliseCreative({support:'A calm hour with your favourite pencils.',headline:'Your quiet hour',composition:'cb-lifestyle-page',background:'environment',text_zone:'top-left'},card,ctx);
  assert.equal(ok.support,'A calm hour with your favourite pencils.');assert.equal(ok.headline,'Your quiet hour');assert.deepEqual(ok.fallbacks,[]);assert.equal(ok.text_zone,'top-left');
  const wrongNumber=normaliseCreative({support:'Includes 14 pages to colour'},card,ctx);assert.ok(wrongNumber.fallbacks.includes('support'));assert.equal(wrongNumber.support,null);
  const rightNumber=normaliseCreative({support:'Nine pages, or 9 to colour'},card,ctx);assert.equal(rightNumber.support,'Nine pages, or 9 to colour');
  const long=normaliseCreative({support:'one two three four five six seven eight nine ten eleven twelve thirteen'},card,ctx);assert.ok(long.fallbacks.includes('support'));
  const digits=normaliseCreative({headline:'Colour 12 pages today'},card,ctx);assert.ok(digits.fallbacks.includes('headline'));assert.equal(digits.headline,card.creative.headline);
  const other=normaliseCreative({composition:'editorial-hero',background:'render'},card,ctx);
  assert.ok(other.fallbacks.includes('composition'));assert.equal(other.composition,'cb-lifestyle-page');assert.equal(other.background,'environment');
  const unknownPage=normaliseCreative({focal_asset:'page-99'},card,ctx);assert.ok(unknownPage.fallbacks.includes('focal_asset'));
  // The support line reaches the copy (code renders it); the headline fallback keeps the baseline copy.
  const slides=creativeSlides([card],{[card.id]:ok});assert.deepEqual(slides[0].copy.subline,{text:'A calm hour with your favourite pencils.',by:'model'});
  // A shared-backplate card never counts against the cap; the colouring compositions are invisible to other formats.
  const dirs=Object.fromEntries(p.slides.map(s=>[s.id,{...s.creative,fallbacks:[]}]));
  assert.deepEqual(Object.values(limitEnvironments(dirs,p.slides,3)).filter(d=>d.background==='environment').length,4,'four environment cards, three owners: none is reverted');
  const capped=limitEnvironments(Object.fromEntries(p.slides.map(s=>[s.id,{...s.creative,fallbacks:[]}])),p.slides,2);
  assert.ok(capped['09-cozy'].fallbacks.includes('background (environment limit)')||capped['06-lifestyle'].fallbacks.includes('background (environment limit)'),'a lower cap reverts an owner');
  assert.doesNotMatch(compositionsForModel(),/cb-/);assert.match(compositionsForModel(['cb-bundle']),/^- cb-bundle/);
  assert.ok(Object.keys(COMPOSITIONS).filter(k=>k.startsWith('cb-')).every(k=>COMPOSITIONS[k].adapter==='colouring-book'));
});

for(const orientation of ['landscape','portrait','square'])test(`${orientation}: the baseline campaign renders; every card meets its floor and shows its focal asset; the hero is not mostly copy; 01 and 02 differ`,{timeout:300_000},async t=>{
  if(!await rendererAvailable())return t.skip('no renderer');
  const {facts,A,plan:p}=await plan(orientation), dir=await mkdtemp(join(tmpdir(),'dpf-cc-')), ex=join(dir,'example.png'), scene=join(dir,'scene.png');
  t.after(()=>rm(dir,{recursive:true,force:true}));   // never leave renders in the temp folder
  await writeFile(ex,await sharp({create:{width:A.pages[2].width,height:A.pages[2].height,channels:3,background:'#d9a'}}).png().toBuffer());
  await writeFile(scene,await sharp({create:{width:1024,height:1024,channels:3,background:'#5a3d28'}}).png().toBuffer());
  const directions=Object.fromEntries(p.slides.map(s=>[s.id,{...s.creative,fallbacks:[],source:'baseline'}]));
  const scenes={};for(const s of p.slides)if(s.creative.background==='environment'){const o=s.creative.scene_of??s.id;s.scene=`env-${o}`;scenes[`env-${o}`]=scene;}
  p.engine={id:'ai-creative',version:1};p.directions=directions;
  const res=await renderSlides({facts,plan:p,art:A,scenes,examples:{'example-p2':ex},outDir:dir,engine:'ai-creative',directions});
  assert.equal(res.length,10);
  for(const r of res){
    const s=p.slides.find(x=>x.id===r.slide), got=productShare(r.artwork,r.width);
    assert.ok(got>=s.min_product_share,`${orientation} ${r.slide}: ${(got*100).toFixed(1)}% >= ${s.min_product_share*100}%`);
    assert.ok(r.layout.assets.includes(s.creative.focal_asset),`${r.slide} renders ${s.creative.focal_asset}`);
    assert.ok(r.artwork.every(a=>a.complete&&Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)<=0.005),`${r.slide}: whole and unstretched`);
  }
  const [h,pv]=res;assert.notEqual(h.layout.composition,pv.layout.composition);
  const e=engineQc({plan:p,renderResults:res,productShare,shapes:{},facts});
  assert.deepEqual(e.checks.filter(c=>!c.ok),[],'engine and colouring creative QC pass');
  for(const n of ['hero is not mostly copy','every card shows its focal asset','cards sharing a backplate are composed differently'])assert.ok(e.checks.find(c=>c.name===n)?.ok,n);
});

test('a plan without a concept (every older colouring-book plan) still composes exactly through the old region-template path',async()=>{
  const {facts,A}=await book('landscape');withClaims(facts);
  const old=planSlides(facts,{strategy:deriveStrategy(facts)});
  const hero=old.slides[0], r=composeEngineSlide(hero,{facts,art:A,sceneUri:null,exampleUri:null,direction:undefined,engine:'ai-creative'});
  assert.ok(r.layout&&r.layout.region,'a region template, not a creative card');assert.ok(!r.layout.creative);
  for(const s of old.slides)assert.notEqual(s.template,'creative');
  assert.equal(composeEngineSlide(old.slides.find(s=>s.template==='collage'),{facts,art:A,engine:'ai-creative'}).layout,null);
});

// ---------------------------------------------------------------- example fidelity ---
const lines=async(extra='')=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#fff"/>
  <g fill="none" stroke="#111" stroke-width="6"><rect x="40" y="40" width="820" height="520"/><circle cx="250" cy="300" r="120"/><circle cx="560" cy="250" r="90"/><path d="M80 520 Q300 380 520 520 T860 500"/><rect x="620" y="360" width="150" height="110"/><path d="M60 100 L300 160 L120 240 Z"/></g>${extra}</svg>`)).png().toBuffer();
test('example fidelity: a coloured copy is ok, a slightly edited one is a warning, a shifted, different or line-free one is a hard failure; thresholds are fixed',async()=>{
  assert.equal(FIDELITY_SEVERE,0.75);assert.equal(FIDELITY_MILD,0.92);
  const src=await lines();
  const coloured=await lines('<rect x="60" y="60" width="780" height="480" fill="#e8a15c" opacity=".35"/><circle cx="250" cy="300" r="110" fill="#c0392b" opacity=".4"/>');
  const ok=await exampleFidelity(src,coloured);assert.equal(ok.severity,'ok',JSON.stringify(ok));
  // Mild: a few lines covered over (a removed detail) or a small object added.
  const mildSrc=await lines('<rect x="610" y="350" width="170" height="130" fill="#fff"/>'), mild=await exampleFidelity(src,mildSrc);assert.equal(mild.severity,'mild',JSON.stringify(mild));
  const addedSvg='<g fill="none" stroke="#111" stroke-width="6"><circle cx="700" cy="140" r="70"/><circle cx="120" cy="450" r="55"/><path d="M600 80 L800 200 L640 220 Z"/><path d="M300 60 L420 60 L420 120 L300 120 Z"/><circle cx="450" cy="470" r="50"/></g>';
  const added=await exampleFidelity(src,await lines(addedSvg));assert.notEqual(added.severity,'ok',JSON.stringify(added));assert.ok(added.precision<added.recall,'added objects lower precision, not recall');
  // Severe: composition shifted, a different page, no lines at all.
  const shifted=await sharp(src).extend({left:150,background:'#fff'}).extract({left:0,top:0,width:900,height:600}).png().toBuffer();
  assert.equal((await exampleFidelity(src,shifted)).severity,'severe');
  const different=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#fff"/><g fill="none" stroke="#111" stroke-width="6"><rect x="40" y="40" width="820" height="520"/><circle cx="650" cy="150" r="80"/><circle cx="200" cy="450" r="100"/><path d="M60 300 L860 320"/><rect x="300" y="120" width="120" height="260"/></g></svg>`)).png().toBuffer();
  assert.equal((await exampleFidelity(src,different)).severity,'severe');
  assert.equal((await exampleFidelity(src,await sharp({create:{width:900,height:600,channels:3,background:'#c9a'}}).png().toBuffer())).severity,'severe');
  // QC rows: severe blocks, mild only warns, ok passes; nothing here regenerates anything.
  const rows=fidelityChecks([{id:'e1',...ok},{id:'e2',...mild}]);assert.equal(rows.checks[0].ok,true);assert.equal(rows.warnings.length,1);
  const hard=fidelityChecks([{id:'e3',...(await exampleFidelity(src,shifted))}]);assert.equal(hard.checks[0].ok,false);assert.match(hard.checks[0].detail,/Not regenerated automatically/);
});

test('backplate differentiation: effectively identical backplates fail, different ones pass',async()=>{
  const g=async(a,b,dir)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" ${dir}><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="120" cy="120" r="60" fill="#fff"/></svg>`)).png().toBuffer();
  const one=await g('#fff','#000','x1="0" y1="0" x2="1" y2="0"'), two=await g('#000','#fff','x1="0" y1="0" x2="1" y2="0"'), three=await g('#fff','#000','x1="0" y1="0" x2="0" y2="1"');
  assert.equal((await backplateDifferentiation([{id:'a',bytes:one},{id:'b',bytes:await sharp(one).png().toBuffer()}])).checks[0].ok,false);
  const diff=await backplateDifferentiation([{id:'a',bytes:one},{id:'b',bytes:two},{id:'c',bytes:three}]);assert.equal(diff.checks[0].ok,true,diff.checks[0].detail);
});

// ------------------------------------------------- pre-live refinements (finalise, hero placement, briefs) ---
import { finaliseColouringPlan, heroPlacement, BRIEF_BANNED_EXTRA, CONCEPT_BRIEF, SCENE_BANNED } from '../src/stage3/index.mjs';
import { heroHeadline } from '../src/stage3/colouring-creative.mjs';
const dirsOf=p=>Object.fromEntries(p.slides.map(s=>[s.id,{...s.creative,fallbacks:[]}]));

test('the coloured example follows the hero page the Creative Director chose; the example cards show that page; still one example',async()=>{
  const {facts,plan:p}=await plan('landscape'), d=dirsOf(p);
  d['01-hero'].focal_asset='page-10';
  const f=finaliseColouringPlan({slides:p.slides,directions:d},facts);
  assert.deepEqual(f.examples.map(e=>[e.id,e.page_number,e.used_by]),[['example-p10',10,['01-hero','04-coloured','05-before-after']]],'exactly one example: no extra image call');
  for(const id of ['01-hero','04-coloured','05-before-after'])assert.equal(f.directions[id].focal_asset,'page-10',id);
  assert.ok(f.directions['04-coloured'].fallbacks.includes('focal_asset (aligned to the coloured example page)'));
  assert.deepEqual(f.directions['01-hero'].fallbacks,[],'the hero keeps its choice');
  assert.ok(f.slides.filter(s=>s.example).every(s=>s.example==='example-p10'));
  // A non-page hero focal falls back to the baseline hero page, and the example still matches it.
  const d2=dirsOf(p);d2['01-hero'].focal_asset='sheet';
  const g=finaliseColouringPlan({slides:p.slides,directions:d2},facts);
  assert.equal(g.directions['01-hero'].focal_asset,p.slides[0].creative.focal_asset);assert.ok(g.directions['01-hero'].fallbacks.some(x=>/must show a real colouring page/.test(x)));
  assert.equal(g.examples[0].page_number,Number(p.slides[0].creative.focal_asset.slice(5)));
  // The cover is never the hero page.
  const d3=dirsOf(p);d3['01-hero'].focal_asset='page-1';
  assert.equal(finaliseColouringPlan({slides:p.slides,directions:d3},facts).directions['01-hero'].focal_asset,p.slides[0].creative.focal_asset);
});

test('lifestyle cards prefer different pages: repeats move to the next strong page (recorded, deterministic); a small book reuses gracefully',async()=>{
  const {facts,plan:p}=await plan('landscape'), d=dirsOf(p);
  for(const id of ['01-hero','06-lifestyle','09-cozy'])d[id].focal_asset='page-10';
  const concept={strongest_pages:['page-10','page-4','page-7']};
  const f=finaliseColouringPlan({slides:p.slides,directions:d,concept},facts), pages=['01-hero','06-lifestyle','09-cozy'].map(id=>f.directions[id].focal_asset);
  assert.deepEqual(pages,['page-10','page-4','page-7'],'unique, in the concept\'s order of strength');
  for(const id of ['06-lifestyle','09-cozy'])assert.ok(f.directions[id].fallbacks.includes('focal_asset (page already on another lifestyle card)'),id);
  assert.deepEqual(finaliseColouringPlan({slides:p.slides,directions:dirsOf(p).constructor===Object?Object.assign(dirsOf(p),{'01-hero':{...d['01-hero']},'06-lifestyle':{...d['06-lifestyle'],fallbacks:[]},'09-cozy':{...d['09-cozy'],fallbacks:[]}}):null,concept},facts).directions['09-cozy'].focal_asset,'page-7','same input, same result');
  assert.equal(f.directions['02-preview'].focal_asset,p.slides[1].creative.focal_asset,'02 (shared backplate, its own crop) is not part of the uniqueness set');
  // A small book (cover + 2 colouring pages): uniqueness where possible, reuse only when nothing is left; never a failure.
  const {facts:small}=await book('landscape');
  small.selection={cover:1,lead:1,showcase:[2,3],collage:[2,3],example:2,pages_used:[1,2,3]};withClaims(small);
  const sp=planColouringCreative(small,{strategy:deriveStrategy(small)}), sd=dirsOf(sp);
  for(const s of sp.slides.filter(x=>['cb-lifestyle-hero','cb-lifestyle-page'].includes(x.creative.composition)&&!x.creative.scene_of))sd[s.id].focal_asset='page-2';
  const sf=finaliseColouringPlan({slides:sp.slides,directions:sd},small), life=sp.slides.filter(x=>['cb-lifestyle-hero','cb-lifestyle-page'].includes(x.creative.composition)&&!x.creative.scene_of).map(x=>sf.directions[x.id]);
  assert.deepEqual(life.map(x=>x.focal_asset),['page-2','page-3','page-2'],'the third card keeps its choice: nothing unused is left');
  assert.ok(life[2].fallbacks.includes('focal_asset (reused: the book has no unused page left)'));
  assert.equal(sf.examples[0].page_number,2,'the example still follows the hero');
});

test('hero placement: a layered editorial spread; real pages stay above the floor, the example never covers the centre of its page, the copy column stays clear',()=>{
  const ix=(p,q)=>Math.max(0,Math.min(p.x+p.w,q.x+q.w)-Math.max(p.x,q.x))*Math.max(0,Math.min(p.y+p.h,q.y+q.h)-Math.max(p.y,q.y));
  for(const a of [{width:1400,height:933},{width:933,height:1400},{width:1000,height:1000}])for(const right of [false,true]){
    const G=heroPlacement(a,right), tag=`${a.width}x${a.height} ${right?'right':'left'}`;
    const real=(G.page.w*G.page.h+G.second.w*G.second.h-ix(G.page,G.second))/(2000*2000);
    assert.ok(real>=0.34,`${tag}: real pages ${(real*100).toFixed(1)}% (floor 33%, with margin)`);
    assert.ok(ix(G.example,G.page)/(G.page.w*G.page.h)<=0.08,`${tag}: the example covers at most 8% of its own page`);
    const c={x:G.page.x+G.page.w*0.25,y:G.page.y+G.page.h*0.25,w:G.page.w*0.5,h:G.page.h*0.5};
    assert.equal(ix(G.example,c),0,`${tag}: nothing covers the page's central half`);
    for(const r of [G.page,G.example,G.second])assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=2000&&r.y+r.h<=2000,`${tag}: on canvas`);
    // Layering: the second page sits behind and above; the example is lower and on the copy side.
    assert.ok(G.second.y<G.page.y&&G.example.y>G.page.y,`${tag}: second page higher, example lower`);
    assert.ok(right?G.example.x>G.page.x:G.example.x<G.page.x,`${tag}: example on the copy side`);
    const copy=right?{x:2000-120-G.copyW,y:110,w:G.copyW,h:430}:{x:120,y:110,w:G.copyW,h:430};
    assert.equal(ix(copy,G.page)+ix(copy,G.second),0,`${tag}: the copy column is clear of the real pages`);
  }
  // Portrait (the common book shape): the coloured example is a real anchor, not a thumbnail.
  const P=heroPlacement({width:933,height:1400});assert.ok(P.example.w*P.example.h/(2000*2000)>=0.2);
});

test('hero baseline: a second real page (the cover), a feeling-first headline from the season, an environment-only brief within the limit',async()=>{
  const {facts,plan:p}=await plan('portrait'), h=p.slides[0].creative;
  assert.deepEqual(h.supporting_assets,['page-1'],'the cover sits behind the hero page');
  assert.ok(h.scene_brief.length<=400&&!SCENE_BANNED.test(h.scene_brief)&&!BRIEF_BANNED_EXTRA.test(h.scene_brief),h.scene_brief);
  // ADR-064: the default (Hybrid) hero brief is its route contract's styled home surface, not a shared cosy desk.
  assert.match(h.scene_brief,/Styled home tabletop/);assert.match(h.scene_brief,/warm directional window light/);
  assert.equal(heroHeadline({season:'Halloween / autumn'}).text,'Halloween'+String.fromCharCode(10)+'Colouring Pages');
  assert.equal(heroHeadline({season:null}).text,'Colouring'+String.fromCharCode(10)+'Pages');
  assert.doesNotMatch(heroHeadline({season:'christmas and winter'}).text,/[0-9]|and|winter/);
  assert.equal(p.slides[0].copy.headline.text,heroHeadline(facts).text);
  // The finalise step always leaves the hero a second real page that is not its focal page.
  const d=dirsOf(p);d['01-hero'].focal_asset='page-1'.replace('1','4');d['01-hero'].supporting_assets=['page-4'];
  let f=finaliseColouringPlan({slides:p.slides,directions:d},facts);
  assert.ok(/^page-[0-9]+$/.test(f.directions['01-hero'].supporting_assets[0])&&f.directions['01-hero'].supporting_assets[0]!=='page-4');
  assert.ok(f.directions['01-hero'].fallbacks.includes('supporting_assets (the hero needs a second real page)'));
  const d2=dirsOf(p);d2['01-hero'].supporting_assets=['sheet'];
  f=finaliseColouringPlan({slides:p.slides,directions:d2},facts);assert.equal(f.directions['01-hero'].supporting_assets[0],'page-1');
});

test('scene briefs: the model is told environment only and which words are banned; environment briefs pass; substitute wording is caught',()=>{
  for(const w of ['page','paper','book','printable','worksheet','colouring sheet','card','product','mockup','print'])assert.ok(CONCEPT_BRIEF.includes(w),w);
  assert.match(CONCEPT_BRIEF,/scene_brief describes ONLY the environment/);assert.doesNotMatch(CONCEPT_BRIEF,/railway|017/i);
  const banned=b=>SCENE_BANNED.test(b)||BRIEF_BANNED_EXTRA.test(b);
  for(const ok of ['warm walnut desk under amber lamp light','knitted rust blanket beside a ceramic mug','candlelit reading nook with autumn leaves','dusk window with a softly glowing view'])assert.equal(banned(ok),false,ok);
  for(const bad of ['a printable mockup on a desk','space for the colouring sheet','worksheet beside tea','a product shot','printed art on the wall','a stack of paper','an open book','a greeting card'])assert.equal(banned(bad),true,bad);
});

test('every baseline scene brief would pass the brief guard itself (a model echoing it is never discarded) and fits the schema limit',async()=>{
  for(const o of ['portrait','landscape','square']){const {plan:p}=await plan(o);
    for(const s of p.slides.filter(x=>x.creative.scene_brief)){const b=s.creative.scene_brief;
      assert.ok(b.length<=400,`${o} ${s.id}: ${b.length} characters`);
      assert.ok(!SCENE_BANNED.test(b)&&!BRIEF_BANNED_EXTRA.test(b),`${o} ${s.id}: ${b}`);}}
});
