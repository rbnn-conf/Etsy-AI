// Colouring books on the Creative Director architecture (ADR-060), end to end with a FAKE model:
// exactly 2 text calls + 3 backplates + 1 coloured example, every result cached, a second run makes
// zero calls, severe example drift blocks without regenerating, older plans keep working.
// Fake OpenAI and Telegram: ZERO real OpenAI calls, ZERO Etsy calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveFacts, planColouringCreative, deriveStrategy } from '../../marketing/src/stage3/index.mjs';
import { creativeModelSchema, conceptLines, creativeEnvironmentPrompt } from '../src/stage3/engines.mjs';
import { strictSchema, loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { productionApproved, lineArt, sha } from './colouring-fixture.mjs';
import { sharp } from '../../production/src/lib.mjs';

const ACTOR='@owner';
const rj=async(ws,f)=>JSON.parse(await readFile(join(ws,f),'utf8'));

/** A fake Creative Director: the baseline, refined, with a few deliberate mistakes the validator must catch. */
function direction(facts){
  const base=planColouringCreative(facts,{strategy:deriveStrategy(facts)});
  const slides=base.slides.map(s=>{const c=s.creative;
    const o={id:s.id,purpose:c.purpose,buyer_message:c.buyer_message,emotional_goal:c.emotional_goal,headline:'',focal_asset:c.focal_asset,supporting_assets:c.supporting_assets,composition:c.composition,
      hierarchy:c.hierarchy,background:c.background,props:c.props.slice(0,2),crop:{asset:'',focus:[.5,.5],zoom:1},text_zone:c.text_zone,scene_brief:c.scene_brief,avoid:[],support:''};
    if(s.id==='01-hero'){o.support='Includes 14 pages to colour';o.focal_asset='page-10';o.scene_brief='A printable mockup on a walnut desk.';}   // wrong number; a hero page other than the baseline example page; colouring-banned wording
    if(s.id==='06-lifestyle'){o.support='A calm hour with your favourite pencils.';o.headline='Your quiet hour';o.focal_asset='page-10';o.scene_brief='Warm walnut desk under amber lamp light, a knitted rust blanket beside a ceramic mug.';}   // repeats the hero page; a clean environment brief
    if(s.id==='09-cozy')o.scene_brief='A desk with a stack of paper pages and a book.';  // names a product substitute
    return o;});
  return {campaign:{mood:'warm and quiet',palette:'amber, walnut and cream',lighting:'golden evening light',
    concept:{campaign_concept:'Quiet Evening Journey',emotional_hook:'A slow hour spent colouring.',buyer_feeling:['cozy','relaxed'],
      visual_world:{palette:'amber, walnut and cream',materials:['wood','paper','knit'],lighting:'golden evening light',photography_style:'premium lifestyle photography'},
      hero_subject:'the scene on the page',strongest_pages:['page-99'],transformation_story:'Black lines become a finished coloured picture.',marketing_priority:'transformation',avoid:['clutter']}},
    slides,lines:[]};
}
/** Distinct backplates (a different gradient direction per call) so the differentiation QC sees real variety. */
const backplate=async n=>{const dirs=['x2="1" y2="0"','x2="0" y2="1"','x2="1" y2="1"','x1="1" x2="0" y2="1"'][n%4];
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" ${dirs}><stop offset="0" stop-color="#f2d9a6"/><stop offset="1" stop-color="#2b1a10"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="${200+n*220}" cy="${240+n*90}" r="${90+n*30}" fill="#fff" opacity=".5"/></svg>`)).png().toBuffer();};

async function setup({edit=null}={}){
  const {h,ws}=await productionApproved();
  const facts=await deriveFacts(ws), client=h.wf.ai.client, json=client.json.bind(client), image=client.image.bind(client), imageEdit=client.imageEdit.bind(client);
  let scenes=0;
  client.json=async a=>{if(a.schemaName!=='marketing-creative-direction')return json(a);
    h.calls.push({kind:'json',schemaName:a.schemaName,user:a.user,images:a.images?.length??0,schema:a.schema});
    const d=direction(facts);d.slides=d.slides.filter(x=>a.user.includes(`- ${x.id} [`));   // answer only the cards asked for
    return {data:d,usage:{input_tokens:5,output_tokens:5,total_tokens:10},model:'fake-text'};};
  client.image=async a=>a.step==='marketing-scene'?(h.calls.push({kind:'image',step:a.step,prompt:a.prompt,size:a.size}),{bytes:await backplate(scenes++),usage:{total_tokens:1},model:'fake-image'}):image(a);
  if(edit)client.imageEdit=async a=>{h.calls.push({kind:'imageEdit',step:a.step,prompt:a.prompt,size:a.size,image_sha:sha(a.image.bytes)});return {bytes:await edit(a),usage:{total_tokens:1},model:'fake-image'};};
  else client.imageEdit=imageEdit;
  const run=()=>h.wf.runMarketing('001',ACTOR,{engine:'ai-creative',chosenBy:ACTOR});
  const rewind=async()=>{const p=await h.store.load('001');await h.store.save({...p,status:'PRODUCTION_APPROVED',resume_state:null,last_error:null});};
  return {h,ws,facts,run,rewind,since:n=>h.calls.slice(n)};
}
const kinds=cs=>cs.map(c=>c.schemaName??c.step);

test('Creative Director for colouring books: 2 text calls + 3 backplates + 1 coloured example, a validated concept, shared backplate, QC incl. the new checks, cached on a second run',{timeout:600_000},async()=>{
  const {h,ws,facts,run,rewind}=await setup();
  try{
    const n0=h.calls.length;
    const r=await run();assert.equal(r.outcome,'awaiting_marketing_approval',JSON.stringify((await h.store.load('001')).last_error));
    const made=h.calls.slice(n0);
    // Exact model-call count: listing + Creative Director (text); 3 backplates + 1 coloured example (image). No scene-brief call, no art-direction call.
    assert.deepEqual(kinds(made),['listing','marketing-creative-direction','marketing-scene','marketing-scene','marketing-scene','marketing-example']);
    assert.equal(made.filter(c=>c.kind==='json').length,2);assert.equal(made.filter(c=>c.kind!=='json').length,4);
    const dc=made.find(c=>c.schemaName==='marketing-creative-direction');
    assert.equal(dc.images,1,'the real approved page is sent for colour and mood only');
    assert.match(dc.user,/CAMPAIGN CONCEPT \(required: campaign\.concept\)/);assert.match(dc.user,/ASSET CATALOGUE/);assert.match(dc.user,/- cb-editorial-hero: /);assert.doesNotMatch(dc.user,/- editorial-hero: /);
    // ADR-064: the AI Creative run is told its hero's code-owned route contract (an editorial reveal, never the Hybrid spread).
    assert.match(dc.user,/ROUTE CONTRACT for 01-hero/);assert.match(dc.user,/"page_arrangement": "single-page-reveal"/);assert.doesNotMatch(dc.user,/- cb-lifestyle-hero: /);
    const plan=await rj(ws,'marketing/plan.json'), qc=await rj(ws,'marketing/qc.json'), render=await rj(ws,'marketing/images/render.json');

    // Plan: ten creative cards; three backplates; 01 and 02 share backplate A.
    assert.deepEqual(plan.slides.map(s=>s.id),['01-hero','02-preview','03-contents','04-coloured','05-before-after','06-lifestyle','07-showcase','08-download','09-cozy','10-bundle']);
    assert.deepEqual(plan.scenes.map(s=>s.id),['env-01-hero','env-06-lifestyle','env-09-cozy']);
    assert.equal(plan.slides[0].scene,'env-01-hero');assert.equal(plan.slides[1].scene,'env-01-hero');
    assert.equal(plan.creative.max_environments,3);assert.equal(plan.concept,undefined,'the baseline concept is not a plan field; the validated concept is campaign_direction.concept');
    assert.deepEqual(plan.engine,{id:'ai-creative',version:1});

    // Validation: the concept (invalid strongest_pages fell back, "paper" dropped), the support line (wrong number refused), the unsafe scene brief.
    const c=plan.campaign_direction.concept;
    assert.equal(c.campaign_concept,'Quiet Evening Journey');assert.ok(c.fallbacks.includes('concept.strongest_pages'));assert.ok(c.strongest_pages.every(id=>/^page-/.test(id)&&id!=='page-99'));
    assert.deepEqual(c.visual_world.materials,['wood','knit']);
    assert.ok(plan.directions['01-hero'].fallbacks.includes('support'));assert.equal(plan.slides[0].copy.subline.text,'9 pages to print and colour','the factual code line stays');
    assert.equal(plan.slides[5].copy.subline.text,'A calm hour with your favourite pencils.');assert.equal(plan.slides[5].copy.headline.text,'Your quiet hour');
    assert.ok(plan.directions['09-cozy'].fallbacks.includes('scene_brief'));
    // Scene briefs: environment-only survives; colouring-banned wording ("printable mockup") falls back.
    assert.ok(!plan.directions['06-lifestyle'].fallbacks.includes('scene_brief'));assert.match(plan.scenes[1].prompt,/Warm walnut desk under amber lamp light/);
    assert.ok(plan.directions['01-hero'].fallbacks.includes('scene_brief'));assert.doesNotMatch(plan.scenes[0].prompt,/printable mockup/);
    assert.match(dc.user,/scene_brief describes ONLY the environment/);
    assert.match(dc.user,/Never mention in scene_brief: page, paper, book, printable, worksheet, colouring sheet, card, product, mockup or print/);
    // The coloured example follows the hero's page (page 10, not the baseline's), and so do the example cards; lifestyle pages are unique.
    assert.equal(plan.directions['01-hero'].focal_asset,'page-10');
    assert.deepEqual(plan.examples.map(e=>[e.id,e.page_number]),[['example-p10',10]]);
    for(const id of ['04-coloured','05-before-after'])assert.equal(plan.directions[id].focal_asset,'page-10',id);
    assert.notEqual(plan.directions['06-lifestyle'].focal_asset,'page-10');assert.ok(plan.directions['06-lifestyle'].fallbacks.includes('focal_asset (page already on another lifestyle card)'));
    assert.notEqual(plan.directions['09-cozy'].focal_asset,plan.directions['06-lifestyle'].focal_asset);
    assert.doesNotMatch(plan.scenes[2].prompt,/stack of paper/);

    // Backplate prompts: the concept's visual world, the reserved-area hint, the exclusions; never a request for a page.
    for(const s of plan.scenes){
      // ADR-064: the AI Creative hero's route forbids the cosy-desk materials (wood, knit); the other backplates keep the concept's materials.
      assert.match(s.prompt,s.slide==='01-hero'?/Visual world: palette amber, walnut and cream; lighting /:/Visual world: palette amber, walnut and cream; materials wood, knit/);
      assert.match(s.prompt,/Do NOT include: colouring pages, colouring books, books/);
      assert.match(s.prompt,/must not contain any page, sheet, paper, card, book, screen or text of its own/);
    }
    assert.match(plan.scenes[0].prompt,/Reserved area: .*empty, softly lit stretch of surface.*hint only/);
    assert.match(plan.scenes[0].prompt,/Route: ai-creative \(editorial-cinematic\)/);
    for(const line of plan.scenes[0].prompt.split('\n').filter(l=>/^(Scene|Props \(plain materials only\)):/.test(l)))assert.doesNotMatch(line,/knit|mug|string lights|wooden desk/,line);
    assert.doesNotMatch(plan.scenes.map(s=>s.prompt.split('Do NOT include')[0]).join(' '),/\b(sheet|page|book|paper)\b[^.]*\b(placed|laid|here)\b/i);
    // The coloured example: an edit of the exact approved page, the concept's palette, strict preservation.
    const edit=made.find(c=>c.kind==='imageEdit');
    assert.equal(edit.image_sha,facts.pages.find(p=>p.page_number===10).sha256,'the example is an edit of the HERO page');
    assert.match(edit.prompt,/colour this exact page, do not reimagine it/);assert.match(edit.prompt,/PRESERVE exactly: the composition, the source crop/);assert.match(edit.prompt,/DO NOT: add, remove, move or redraw any object/);
    assert.match(edit.prompt,/Colour palette: amber, walnut and cream\. Mood: cozy, relaxed\. Black lines become a finished coloured picture\./);
    assert.equal(plan.examples[0].concept_sha.length,16);

    // QC: the existing checks plus the new ones, all passing; fidelity measured on the (tinted, line-preserving) example.
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(x=>!x.ok)));
    for(const name of ['product artwork dominates each image','coloured examples labelled as examples','coloured examples never used as product artwork','coloured example is still the same page','lifestyle backplates differ from each other',
      'hero is not mostly copy','every card shows its focal asset','cards sharing a backplate are composed differently','creative variety: compositions','headline legible at 300 px thumbnail'])assert.ok(qc.checks.find(x=>x.name===name)?.ok,name);
    assert.equal(render.length,10);assert.ok(render.every(x=>x.layout?.creative&&x.artwork.length));
    assert.notEqual(render[0].layout.composition,render[1].layout.composition);

    // CACHE: a second run (same listing, plan, backplates, example) makes ZERO model calls and re-renders nothing.
    const planBytes=await readFile(join(ws,'marketing/plan.json'),'utf8'), digest=(await h.store.load('001')).marketing.images.digest;
    await rewind();const n1=h.calls.length;
    assert.equal((await run()).outcome,'awaiting_marketing_approval');
    assert.equal(h.calls.length,n1,'zero model calls on the second run');
    assert.equal(await readFile(join(ws,'marketing/plan.json'),'utf8'),planBytes);assert.equal((await h.store.load('001')).marketing.images.digest,digest);

    // The Creative Director's concept changes: the paid example is NOT regenerated; the mismatch is flagged.
    const edited=await rj(ws,'marketing/plan.json');edited.campaign_direction.concept.campaign_concept='A Different Campaign';edited.campaign_direction.concept.visual_world.palette='icy blues';
    await writeFile(join(ws,'marketing/plan.json'),JSON.stringify(edited,null,2));
    await rewind();const n2=h.calls.length;
    assert.equal((await run()).outcome,'awaiting_marketing_approval');assert.equal(h.calls.length,n2,'still zero calls: the example is flagged, not regenerated');
    assert.ok((await rj(ws,'marketing/qc.json')).warnings.some(w=>/coloured example example-p\d+ was made for an earlier campaign concept/.test(w)));
    assert.equal((await rj(ws,'marketing/plan.json')).examples[0].sha256,plan.examples[0].sha256);

    // A composer (layout) change redoes only the deterministic renders: the digest changes, no model call is made.
    const bumped=await rj(ws,'marketing/plan.json');bumped.creative.composer=99;await writeFile(join(ws,'marketing/plan.json'),JSON.stringify(bumped,null,2));
    await rewind();const n3=h.calls.length;
    assert.equal((await run()).outcome,'awaiting_marketing_approval');assert.equal(h.calls.length,n3);assert.notEqual((await h.store.load('001')).marketing.images.digest,digest);
  }finally{await h.cleanup();}
});

test('severe example drift hard-blocks the campaign and is never regenerated automatically; the drift is reported to the owner',{timeout:300_000},async()=>{
  // The fake "image edit" returns a different page entirely (a redraw, not a colouring).
  const {h,run}=await setup({edit:async a=>{const {width,height}=await sharp(a.image.bytes).metadata();return sharp(await lineArt(99)).resize(width,height,{fit:'fill'}).png().toBuffer();}});
  try{
    const n0=h.calls.length, r=await run();
    assert.equal(r.outcome,'failed');
    const p=await h.store.load('001');
    assert.equal(p.last_error.step,'marketing');assert.match(p.last_error.message,/coloured example is still the same page: severe drift from the approved line art/);assert.match(p.last_error.message,/Not regenerated automatically/);
    assert.equal(h.calls.slice(n0).filter(c=>c.kind==='imageEdit').length,1,'exactly one paid example call; no automatic regeneration');
    const qc=JSON.parse(await readFile(join(h.store.dirOf(p),'marketing/qc.json'),'utf8'));assert.equal(qc.passed,false);
    assert.deepEqual(qc.checks.filter(c=>!c.ok).map(c=>c.name),['coloured example is still the same page']);
  }finally{await h.cleanup();}
});

test('model-facing schema: colouring books must return the concept and a support line; crochet is asked exactly what it always was',async()=>{
  const full=await loadSchema('marketing-creative-direction');
  const cb=strictSchema(creativeModelSchema(full,{concept:true,allowed:['cb-lifestyle-hero','cb-bundle']})), cr=strictSchema(creativeModelSchema(full,{concept:false}));
  assert.ok(cb.required.includes('campaign')&&cb.properties.campaign.required.includes('concept'));
  assert.deepEqual(cb.properties.campaign.properties.concept.required,['campaign_concept','emotional_hook','buyer_feeling','visual_world','hero_subject','strongest_pages','transformation_story','marketing_priority','avoid']);
  assert.ok(cb.properties.slides.items.required.includes('support'));assert.deepEqual(cb.properties.slides.items.properties.composition.enum,['cb-lifestyle-hero','cb-bundle']);
  assert.equal(cr.properties.campaign.properties.concept,undefined);assert.equal(cr.properties.slides.items.properties.support,undefined);
  assert.deepEqual(cr.properties.slides.items.properties.composition.enum,['editorial-hero','included-spread','macro-detail','collection','feature-focus','process','lifestyle','fact-sheet']);
  assert.deepEqual(cr.properties.campaign.required,['mood','palette','lighting']);
  // The committed schema still accepts a crochet-style answer (no concept, no support): existing plans stay valid.
  const crochetLike={campaign:{mood:'m',palette:'p',lighting:'l'},slides:[{id:'a',purpose:'',buyer_message:'',emotional_goal:'',headline:'',focal_asset:'x',supporting_assets:[],composition:'lifestyle',hierarchy:{primary:'',secondary:'',tertiary:''},
    background:'environment',props:[],crop:{asset:'',focus:[.5,.5],zoom:1},text_zone:'top-left',scene_brief:'',avoid:[]}],lines:[]};
  assert.deepEqual(validate(full,crochetLike),[]);
});

test('backplate prompts: crochet and formats without a concept are unchanged; a concept adds only the visual world, the reserved hint and the "no page" promise',async()=>{
  assert.deepEqual(conceptLines(null,{composition:'lifestyle'}),[]);
  const lines=conceptLines({visual_world:{palette:'p',materials:['wood'],lighting:'l',photography_style:'s'},emotional_hook:'h'},{composition:'cb-lifestyle-page',text_zone:'top-left'});
  assert.equal(lines.length,4);assert.match(lines[2],/Reserved area: the right two thirds of the lower frame, one large empty stretch of bare surface\. This is a hint only/);
  assert.doesNotMatch(lines.join(' '),/colouring|a page|a sheet/i);
  assert.equal(typeof creativeEnvironmentPrompt,'function');
});

test('hero comparison (colouring book): Hybrid and AI Creative show the campaign hero card; same cost; no coloured example generated',{timeout:300_000},async()=>{
  const {h,ws}=await setup();
  try{
    const n0=h.calls.length, r=await h.wf.runHeroComparison('001',ACTOR);
    assert.equal(r.outcome,'hero_comparison_ready',JSON.stringify((await h.store.load('001')).last_error));
    const made=h.calls.slice(n0);
    assert.equal(made.filter(c=>c.schemaName==='marketing-creative-direction').length,2,'one creative direction per AI engine');
    assert.equal(made.filter(c=>c.kind==='imageEdit').length,0,'no coloured example in the comparison');
    assert.equal(made.filter(c=>c.schemaName==='art-direction').length,0,'the old region-template direction is not used for colouring books');
    const cmp=(await h.store.load('001')).marketing.comparison.engines;
    // ADR-064: each engine's hero follows its own route contract: Hybrid = the transformation spread, AI Creative = an editorial reveal.
    assert.equal(cmp.hybrid.direction.composition,'cb-lifestyle-hero');assert.equal(cmp['ai-creative'].direction.composition,'cb-editorial-hero');
    assert.ok(/^page-[0-9]+$/.test(cmp.hybrid.direction.supporting_assets[0])&&cmp.hybrid.direction.supporting_assets[0]!==cmp.hybrid.direction.focal_asset,'hybrid: a second real page');
    for(const e of ['factory','hybrid','ai-creative'])assert.equal(cmp[e].route.route,e,`${e}: route recorded with the comparison`);
    for(const e of ['hybrid','ai-creative']){
      assert.match(cmp[e].scene.prompt,/Visual world: /);assert.match(cmp[e].scene.prompt,/Do NOT include: colouring pages/);
      assert.match(cmp[e].scene.prompt,new RegExp(`Route: ${e} `));
    }
    assert.match(cmp['ai-creative'].scene.prompt,/low, near eye-level camera/);assert.match(cmp.hybrid.scene.prompt,/overhead three-quarter view/);
    assert.ok((await readFile(join(ws,'marketing/comparison/ai-creative/01-hero.png'))).length>1000,'the AI Creative comparison hero was rendered');
  }finally{await h.cleanup();}
});
