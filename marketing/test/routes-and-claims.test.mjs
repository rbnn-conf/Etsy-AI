// ADR-064: route contracts (Factory / Hybrid / AI Creative are structurally different), the deterministic pre-image
// route gate, and the editable / coloured-example claim rules with their narrow correction layer.
// Deterministic only: no model, no network, no image call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAGE3_ADAPTERS, planColouringCreative, deriveStrategy, renderSlides, productShare, engineQc, finaliseColouringPlan,
  routeContract, routeOf, routeDistinctness, routeGate, gateBeforeImage, briefSimilarity, forbiddenMotifs, MAJOR_DIMENSIONS, MIN_MAJOR_DIFFERENCES, TRANSFORMATION_DEMO,
  editorialPlacement, conceptBriefFor, CONCEPT_BRIEF, claimProblems, correctUnsupported, BRIEF_BANNED_EXTRA, SCENE_BANNED } from '../src/stage3/index.mjs';
import { rendererAvailable } from '../src/render.mjs';
import { sharp } from '../../production/src/lib.mjs';
import { book } from './colouring-fixture.mjs';

const adapter=STAGE3_ADAPTERS['colouring-book'];
const withClaims=f=>{f.claims=adapter.claimIndex(f);return f;};
const CB={product_format:'colouring-book',season:'Halloween'};
const R=e=>routeOf(routeContract(e,CB));
// The two briefs Product #022's comparison actually sent for Hybrid and AI Creative (near-duplicates).
const HYBRID_022='Rich walnut tabletop under warm amber lamp light, with a chunky cream knitted throw at one edge, a ceramic mug of tea, scattered autumn leaves and soft string-light bokeh in the distance.';
const CREATIVE_022='Rich walnut desk in warm amber lamp light, with a chunky cream knit at one edge and a ceramic mug of tea nearby. A few scattered autumn leaves and soft string-light bokeh recede into a dusky, cinematic background.';

// ---------------------------------------------------------------- routes ---
test('1. Factory, Hybrid and AI Creative have materially different structured art direction (every pair, every major dimension)',()=>{
  for(const [a,b] of [['factory','hybrid'],['factory','ai-creative'],['hybrid','ai-creative']]){
    const d=routeDistinctness(R(a),R(b));
    // Factory and AI Creative both show no transformation demo (only Hybrid does): every other major dimension differs.
    assert.ok(d.distinct,`${a} vs ${b}`);assert.deepEqual(d.same,a==='factory'&&b==='ai-creative'?['transformation_demo']:[],`${a} vs ${b}`);
  }
  // The route is structure, not prose: the prompt lines and briefs differ, and the camera is not shared.
  const cams=new Set(['factory','hybrid','ai-creative'].map(e=>routeContract(e,CB).prompt.camera));assert.equal(cams.size,3);
  assert.throws(()=>routeContract('poster',CB),/Unknown marketing route/);
});

test('2. changing only a prop, the drink or the crop does NOT count as a different route',()=>{
  // Structural: a copy of Hybrid that changes lighting / colour / focus (minor dimensions) is still Hybrid.
  const tweak={...R('hybrid'),route:'ai-creative',lighting:'dramatic-low-key',colour_strategy:'bold-mood-contrast',product_focus:'hero-reveal-with-depth'};
  const d=routeDistinctness(tweak,R('hybrid'));assert.equal(d.distinct,false);assert.equal(d.differing.length,0);
  // One major dimension changed (a prop strategy) is still below the floor.
  assert.equal(routeDistinctness({...R('hybrid'),prop_strategy:'story-staging'},R('hybrid')).distinct,false);
  assert.ok(MIN_MAJOR_DIFFERENCES>=3);
  // Briefs: tea -> coffee, blanket added, leaves moved: the same scene.
  assert.equal(briefSimilarity(HYBRID_022,CREATIVE_022).similar,true);
  assert.equal(briefSimilarity('Walnut desk, knitted throw, mug of tea, scattered leaves.','Oak desk, wool blanket, cup of coffee, a few leaves to one side, slightly tighter crop.').similar,true);
  const g=routeGate({engine:'ai-creative',route:tweak,brief:CREATIVE_022},[{engine:'hybrid',route:R('hybrid'),brief:HYBRID_022}]);
  assert.equal(g.ok,false);assert.equal(g.structural.length,1);assert.equal(g.brief.length,1);
});

test('3. distinct composition / camera / page arrangement / story strategies DO satisfy the gate',()=>{
  const c=routeContract('ai-creative',CB);
  const g=routeGate({engine:'ai-creative',route:R('ai-creative'),brief:c.brief,contract:c},[{engine:'hybrid',route:R('hybrid'),brief:HYBRID_022},{engine:'factory',route:R('factory'),brief:routeContract('factory',CB).brief}]);
  assert.deepEqual(g,{ok:true,structural:[],brief:[]});
});

test('4 (unit). the gate redirects a repeated brief ONCE to the route\'s own brief, and refuses (problems) when structure is the same',()=>{
  const c=routeContract('ai-creative',CB), others=[{engine:'hybrid',route:R('hybrid'),brief:HYBRID_022}];
  const r=gateBeforeImage({engine:'ai-creative',contract:c,brief:CREATIVE_022,others});
  assert.equal(r.redirected,true);assert.equal(r.brief,c.brief);assert.deepEqual(r.problems,[]);
  assert.ok(r.reason.some(x=>/repeats the hybrid scene/.test(x)));
  assert.deepEqual(forbiddenMotifs(c,CREATIVE_022).sort(),['fairy_lights','hot_drink','knit_textile','wood_surface']);
  // Structural sameness cannot be reworded away: refused, the image API must not be called.
  const same=gateBeforeImage({engine:'ai-creative',contract:{...routeContract('hybrid',CB),route:'ai-creative'},brief:c.brief,others});
  assert.equal(same.redirected,false);assert.ok(same.problems.length&&/major dimensions/.test(same.problems[0]));
  // Route briefs are environment-only and pass every scene ban.
  for(const e of ['factory','hybrid','ai-creative'])for(const f of [CB,{product_format:'greeting-card'}]){const b=routeContract(e,f).brief;
    assert.ok(!SCENE_BANNED.test(b)&&!BRIEF_BANNED_EXTRA.test(b),`${e}: ${b}`);}
  assert.doesNotMatch(routeContract('hybrid',{product_format:'greeting-card'}).brief,/pencil/,'no colouring props for other formats');
});

const plan=async(o,engine)=>{const {facts,A}=await book(o);withClaims(facts);return {facts,A,plan:planColouringCreative(facts,{strategy:deriveStrategy(facts),engine})};};

test('5/6. colouring Hybrid hero = line art + LABELLED coloured example; AI Creative = one real page reveal; the example is never claimed as included',async()=>{
  const {facts,plan:h}=await plan('portrait','hybrid'), {plan:c}=await plan('portrait','ai-creative');
  const H=h.slides[0], C=c.slides[0];
  assert.equal(H.creative.route.transformation_demo,TRANSFORMATION_DEMO);assert.equal(H.creative.composition,'cb-lifestyle-hero');assert.ok(H.example,'Hybrid hero shows the example');
  assert.equal(C.creative.route.transformation_demo,'none');assert.equal(C.creative.composition,'cb-editorial-hero');assert.equal(C.example,undefined);
  assert.deepEqual(C.creative.allowed_compositions,['cb-editorial-hero'],'the model cannot pull AI Creative back to the Hybrid spread');
  assert.notEqual(H.creative.scene_brief,C.creative.scene_brief);assert.equal(briefSimilarity(H.creative.scene_brief,C.creative.scene_brief).similar,false);
  // Claims: the example is a disclosed illustration (claim key "example"), never a deliverable.
  assert.ok(H.creative.claims_used.includes('example'));assert.ok(!C.creative.claims_used.includes('example'));
  assert.ok(facts.claims.example.every(t=>/example/i.test(t)&&!/included/i.test(t)));
  for(const bad of ['Coloured examples included.','Includes coloured versions of every page.','You get pre-coloured pages too.'])
    assert.ok(claimProblems(bad,facts).some(x=>/illustration/.test(x)),bad);
  for(const ok of ['Coloured example for inspiration.','Colours shown are an example only.','Coloured versions are not included.'])
    assert.deepEqual(claimProblems(ok,facts).filter(x=>/illustration/.test(x)),[],ok);
  // The example still exists for the other cards (one example image, as before), and follows the hero page.
  const f=finaliseColouringPlan({slides:c.slides,directions:Object.fromEntries(c.slides.map(s=>[s.id,{...s.creative,fallbacks:[]}]))},facts);
  assert.equal(f.examples.length,1);assert.equal(f.examples[0].page_number,Number(f.directions['01-hero'].focal_asset.slice(5)));
  // Route-specific concept brief: the AI Creative line forbids the default cosy desk; Hybrid asks for the transformation.
  assert.match(conceptBriefFor('ai-creative'),/NOT a home desk/);assert.match(conceptBriefFor('hybrid'),/LABELLED coloured example/);
  assert.doesNotMatch(CONCEPT_BRIEF,/knit, a mug/,'the shared brief no longer prescribes the cosy desk to every route');
});

test('editorial hero geometry: the single real page meets the hero floor, stays on canvas and clear of the copy column',()=>{
  for(const a of [{width:1400,height:933},{width:1000,height:1000},{width:933,height:1400}])for(const right of [false,true]){
    const G=editorialPlacement(a,right), P=G.page, tag=`${a.width}x${a.height} ${right?'right':'left'}`;
    assert.ok(P.w*P.h/(2000*2000)>=0.33,tag);assert.ok(P.x>=0&&P.y>=0&&P.x+P.w<=2000&&P.y+P.h<=2000,tag);
    const copyEnd=110+G.copyW;if(a.width<a.height*1.05)assert.ok(right?P.x+P.w<=2000-copyEnd:P.x>=copyEnd,tag);
  }
});

for(const orientation of ['landscape','portrait','square'])test(`${orientation}: the AI Creative campaign (editorial hero) renders and passes the engine + colouring QC`,{timeout:300_000},async t=>{
  if(!await rendererAvailable())return t.skip('no renderer');
  const {facts,A,plan:p}=await plan(orientation,'ai-creative'), dir=await mkdtemp(join(tmpdir(),'dpf-rt-')), ex=join(dir,'example.png'), scene=join(dir,'scene.png');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(ex,await sharp({create:{width:A.pages[2].width,height:A.pages[2].height,channels:3,background:'#d9a'}}).png().toBuffer());
  await writeFile(scene,await sharp({create:{width:1024,height:1024,channels:3,background:'#2a2230'}}).png().toBuffer());
  const directions=Object.fromEntries(p.slides.map(s=>[s.id,{...s.creative,fallbacks:[],source:'baseline'}]));
  const scenes={};for(const s of p.slides)if(s.creative.background==='environment'){const o=s.creative.scene_of??s.id;s.scene=`env-${o}`;scenes[`env-${o}`]=scene;}
  p.engine={id:'ai-creative',version:1};p.directions=directions;
  const res=await renderSlides({facts,plan:p,art:A,scenes,examples:{'example-p2':ex},outDir:dir,engine:'ai-creative',directions});
  for(const r of res){const s=p.slides.find(x=>x.id===r.slide);
    assert.ok(productShare(r.artwork,r.width)>=s.min_product_share,`${orientation} ${r.slide}`);assert.ok(r.layout.assets.includes(s.creative.focal_asset),r.slide);}
  assert.equal(res[0].layout.composition,'cb-editorial-hero');assert.equal(res[0].layout.assets.filter(a=>/^page-/.test(a)).length,1,'one real page, no spread');
  const e=engineQc({plan:p,renderResults:res,productShare,shapes:{},facts});
  assert.deepEqual(e.checks.filter(c=>!c.ok),[],'engine and colouring creative QC pass');
});

// ---------------------------------------------------------------- claims ---
const F={editable:false,designs:[1],page_quantity:{total_pages:11,content_pages:10,content:'colouring'},product_format:'colouring-book'};
const editable=s=>claimProblems(s,F).filter(x=>/editable files are not delivered/.test(x));

test('7. editable=false blocks every affirmative editable-file claim',()=>{
  for(const s of ['Fully editable template.','Customise this editable file.','Edit the included source file.','Edit your text in any PDF reader.',
    'No shipping, fully editable pages.','No physical item is shipped and the files are fully editable.','Editable printable pages.'])
    assert.ok(editable(s).length,s);
  assert.ok(claimProblems('Customise this editable file.',F).some(x=>/personalisation/.test(x)),'customisation stays blocked too');
  // Production that really delivers editable files may say so.
  assert.deepEqual(claimProblems('Fully editable template.',{...F,editable:true}).filter(x=>/editable/.test(x)),[]);
});

test('8. truthful or neutral wording is not rejected because it contains the token "editable"',()=>{
  for(const s of ['Printable digital download.','PDF files for printing.','No editable source files are included.','This is a digital download, not an editable file.',
    'Editable files are not included.','Non-editable PDF pages.','The pages are not editable.'])
    assert.deepEqual(editable(s),[],s);
});

test('9. unambiguous wording is corrected deterministically (deletion only), then passes validation; no model call exists here',()=>{
  const cases=[['Editable printable pages for a cosy night.','Printable pages for a cosy night.'],['A printable & editable PDF.','A printable PDF.'],
    ['Fully editable colouring pages to print at home.','Colouring pages to print at home.'],['No editable files. Editable PDF pages inside.','No editable files. PDF pages inside.']];
  for(const [from,to] of cases){const c=correctUnsupported(from,F);assert.equal(c.text,to,from);assert.ok(c.changes.length);assert.deepEqual(editable(c.text),[],to);}
  // Deletion only: the corrected text never contains a word the original lacked.
  for(const [from] of cases){const w=new Set(from.toLowerCase().match(/[a-z]+/g)), out=correctUnsupported(from,F).text.toLowerCase().match(/[a-z]+/g);assert.ok(out.every(x=>w.has(x)),from);}
  // Negated mentions are untouched; nothing happens when production delivers editable files.
  assert.deepEqual(correctUnsupported('No editable source files are included.',F).changes,[]);
  assert.deepEqual(correctUnsupported('Editable printable pages.',{...F,editable:true}).changes,[]);
});

test('10. ambiguous contradictions are NOT guessed: they stay and fail validation',()=>{
  for(const s of ['Fully editable template.','Edit the included source file.','Customise this editable file.','An editable planner for your notes.','Edit these editable pages before printing.']){
    const c=correctUnsupported(s,F);assert.equal(c.text,s,s);assert.deepEqual(c.changes,[]);assert.ok(editable(c.text).length,s);}
});
