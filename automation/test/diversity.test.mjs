// Concept diversity and the creative-direction boundary (Product #009: three
// near-identical fox previews). Offline: OpenAI and Telegram are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { diversityProblems, leakedDirectionFields, isLegacyDirection } from '../src/orchestrator/diversity.mjs';
import { loadPrompt } from '../src/openai/prompts.mjs';
import { loadSchema, validate } from '../src/orchestrator/schema.mjs';
import { transition } from '../src/orchestrator/state.mjs';
import { harness, msg, photo, press, button, concept, bookDirection, previewCalls, PNG, pressRetry } from './helpers.mjs';

const route=(primary_subject,scene,focal_object,composition,lighting,extra={})=>({primary_subject,scene,focal_object,composition,lighting,
  palette_emphasis:'russet and pine green',emotional_tone:'tender',typography_approach:'small serif greeting in the upper third',distinguishing_visual_hook:`${primary_subject} with ${focal_object}`,...extra});
const card=(id,r,extra={})=>concept(id,{proposed_name:`Card ${id}`,product_type:'christmas greeting card',product_format:'greeting-card',page_count:1,
  target_customer:'adults',visual_route:r,...extra});
// Product #009's failure, as structured routes: one picture reworded three times.
const SAME=[card('A',route('red fox','snowy pine forest','wrapped parcel','fox walking left to right across the lower third, pine boughs framing','soft winter daylight')),
  card('B',route('russet fox','snowy pine woods','small parcel','fox walking left to right along the lower third, framed by pine boughs','soft daylight')),
  card('C',route('fox','snowy pine forest','parcel','fox walks left to right across lower third with pine framing','gentle winter daylight'))];
const DIVERSE=[card('A',route('red fox','snowy woodland path','wrapped parcel','low side view, walking across the lower third','soft winter daylight')),
  card('B',route('white rabbit','lit cottage doorway','Christmas letter','centred front view on the doorstep, door framing','warm lamplight at dusk')),
  card('C',route('tabby cat','hilltop above a glowing village','brass lantern','seen from behind, village filling the lower half','blue night with glowing windows'))];
// Direction as the old code wrote it for #009: a concept promoted into the shared style.
const leakyDirection=()=>({...bookDirection(),illustration_style:'hand-painted watercolour of a single red fox delivering a small parcel through a snowy pine grove',
  character_language:'believable fox anatomy in a walking pose, wearing a burgundy scarf and carrying a parcel',composition:'fox walking left to right across the lower middle',
  palette:'russet fox tones, pine green, ivory',texture:'cold-pressed paper grain and dry-brush snow',mood:'tender and nostalgic',
  shared_prompt:'Hand-painted storybook watercolour Christmas card art with soft broken ink accents, muted winter palette and warm nostalgic mood.'});
const styleOf=prompt=>prompt.split('CONCEPT PREVIEW')[0];
const flow=async(h,request='christmas greetings card')=>{await h.wf.handleUpdate(msg(`/newproduct ${request}`));await h.wf.handleUpdate(photo('ref1'));return h.wf.handleUpdate(msg('/go'));};

test('1 + 6: fox/parcel/forest x3 is rejected before ANY image is generated',async()=>{
  assert.equal(diversityProblems(SAME,'christmas greetings card').length,3);
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:SAME})}});
  try{
    const r=await flow(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'ideation');
    const p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.last_error.retryable,true);
    assert.match(p.last_error.message,/ideas: concepts are not visually distinct: A and B are the same visual route \(same subject, scene, focal object, composition, lighting; 0 of 5/);
    assert.equal(h.calls.filter(c=>c.kind==='image').length,0,'no preview spend');
    assert.equal(p.concepts.batches.length,0,'rejected batch is not stored');
    assert.equal(p.concept_previews.batches.length,0);
  }finally{await h.cleanup();}
});

test('2: fox/parcel/forest, rabbit/letter/cottage, cat/lantern/village pass and get previews',async()=>{
  assert.deepEqual(diversityProblems(DIVERSE,'christmas greetings card'),[]);
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:DIVERSE})}});
  try{
    assert.equal((await flow(h)).outcome,'awaiting_concept_selection');
    assert.equal(previewCalls(h.calls).length,3);
  }finally{await h.cleanup();}
});

test('3: the shared art style may be identical across all three; only the content must differ',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:DIVERSE})}});
  try{
    await flow(h);
    const prompts=previewCalls(h.calls).map(c=>c.prompt);
    assert.equal(new Set(prompts.map(styleOf)).size,1,'identical shared style block for A, B and C');
    assert.match(styleOf(prompts[0]),/Original cozy cartoon line art/);
    // Each prompt carries its own route, and names the others only as things to avoid.
    assert.match(prompts[1],/- Subject: white rabbit\n- Scene: lit cottage doorway\n- Focal object: Christmas letter/);
    assert.match(prompts[1],/This preview must be visually distinct from concepts A and C\. Avoid resembling:\n- A: red fox \/ snowy woodland path \/ wrapped parcel \/ soft winter daylight\n- C: tabby cat \/ hilltop above a glowing village \/ brass lantern \/ blue night with glowing windows/);
  }finally{await h.cleanup();}
});

test('4: an owner-required subject is preserved in every concept; other dimensions carry the diversity',async()=>{
  const request='christmas card showing my red fox carrying a wrapped parcel';
  const owner=[card('A',route('red fox','snowy woodland path','wrapped parcel','low side view walking across the lower third','soft winter daylight')),
    card('B',route('red fox','cottage window ledge','wrapped parcel','close-up portrait peeking over the sill','warm lamplight at dusk')),
    card('C',route('red fox','frozen pond under stars','wrapped parcel','wide panorama, small figure on the ice','blue moonlit night'))];
  assert.deepEqual(diversityProblems(owner,request),[],'same required subject is not a diversity failure');
  // ...but the same required subject in the same scene, composition and lighting still is.
  assert.equal(diversityProblems(owner.map(c=>({...c,visual_route:owner[0].visual_route})),request).length,3);
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:owner})}});
  try{
    assert.equal((await flow(h,request)).outcome,'awaiting_concept_selection');
    assert.ok(previewCalls(h.calls).every(c=>/- Subject: red fox\n/.test(c.prompt)),'the fox the owner asked for is in every preview');
  }finally{await h.cleanup();}
});

test('5a: concept content in the shared direction never reaches another concept\'s preview',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:DIVERSE}),'creative-direction':()=>leakyDirection()}});
  try{
    await flow(h);
    const [a,b,c]=previewCalls(h.calls).map(x=>x.prompt);
    for(const p of [a,b,c]){
      assert.doesNotMatch(styleOf(p),/fox|parcel|scarf|walking/i,'no concept content in the shared style block');
      assert.match(styleOf(p),/texture: cold-pressed paper grain/,'clean style fields kept');
      assert.match(styleOf(p),/Hand-painted storybook watercolour/,'clean shared_prompt kept');
    }
    assert.doesNotMatch(b.replace(/Avoid resembling:[\s\S]*?\n\n/,''),/fox/i,'B mentions the fox only as something to avoid');
    assert.ok(h.logs.some(l=>/direction fields left out of previews because they name concept content \(fox, parcel\): illustration_style, character_language, composition, palette/.test(l)));
    assert.deepEqual(leakedDirectionFields(bookDirection(),DIVERSE).fields,[],'a style-only direction passes untouched');
  }finally{await h.cleanup();}
});

test('5b: a legacy direction (Product #009 v1) is rebuilt once from the saved analysis before new concepts; batch-01 is kept',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{concepts:n=>({concepts:DIVERSE.map(c=>({...c,proposed_name:`${c.proposed_name} batch ${n}`}))})}});
  try{
    await flow(h);   // batch-01 + previews
    // Make the saved direction look like #009's: written before the boundary, fox everywhere.
    let p=await h.store.load('001');
    const {scope,...legacy}={...leakyDirection(),version:1,scope:'shared-style',source:'references',based_on_references:['references/reference-01.png'],feedback_applied:null,created_at:new Date().toISOString()};
    await h.store.writeJson(p,'creative/creative-direction.json',legacy);
    assert.ok(isLegacyDirection(legacy));
    const dirCalls=()=>h.calls.filter(c=>c.schemaName==='creative-direction').length, before=dirCalls();
    const r=await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE CONCEPTS')));
    assert.equal(r.outcome,'awaiting_concept_selection');assert.equal(r.batch,2);
    assert.equal(dirCalls(),before+1,'exactly one direction rebuild');
    assert.equal(h.calls.filter(c=>c.schemaName==='reference-analysis').length,1,'references are not re-analysed');
    p=await h.store.load('001');
    const ws=join(h.root,'products',p.workspace);
    const archived=JSON.parse(await readFile(join(ws,'creative','creative-direction.v01.json'),'utf8'));
    assert.match(archived.illustration_style,/red fox/,'old direction archived unchanged');
    const now=JSON.parse(await readFile(join(ws,'creative','creative-direction.json'),'utf8'));
    assert.equal(now.version,2);assert.equal(now.scope,'shared-style');assert.equal(p.visual_direction.version,2);
    assert.deepEqual(p.concept_previews.batches.map(b=>[b.batch,b.images.length]),[[1,3],[2,3]],'batch-01 preserved');
    assert.ok(h.logs.some(l=>/predates the style-only boundary: rebuilding v2 from the saved reference analysis \(1 text call, no image\)/.test(l)));
    // The ideation call received only the (rebuilt) style, framed as style.
    assert.match(h.calls.filter(c=>c.schemaName==='concepts').at(-1).user,/Shared visual STYLE to design all three routes in \(style only/);
    // A second regeneration does not rebuild again.
    await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE CONCEPTS')));
    assert.equal(dirCalls(),before+1);
  }finally{await h.cleanup();}
});

test('5c: the prompts and schemas define the style/content boundary',async()=>{
  const cd=await loadPrompt('creative-director');
  assert.match(cd,/A creative direction is a STYLE, not a concept/);
  assert.match(cd,/never average them into one\s+literal scene/);
  assert.match(cd,/three competing\s+design routes, not three copy variations of one design/);
  assert.match(cd,/owner's explicit requirements always outrank diversity/);
  const dir=await loadSchema('creative-direction');
  assert.match(dir.properties.character_language.description,/Never which character/);
  const concepts=await loadSchema('concepts'), vr=concepts.properties.concepts.items.properties.visual_route;
  assert.deepEqual(vr.required,['primary_subject','scene','focal_object','composition','lighting','palette_emphasis','emotional_tone','typography_approach','distinguishing_visual_hook']);
  assert.match(validate(concepts,{concepts:DIVERSE.map(({visual_route,...c})=>c)}).join(),/missing visual_route/);
});

test('7: a diversity failure is retryable and resumes normally; previews stay idempotent afterwards',async()=>{
  let n=0;
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>({concepts:++n===1?SAME:DIVERSE})}});
  try{
    assert.equal((await flow(h)).outcome,'failed');
    assert.equal((await pressRetry(h)).outcome,'awaiting_concept_selection');
    assert.equal(previewCalls(h.calls).length,3);
    await h.wf.handleUpdate(msg('/previews'));
    assert.equal(previewCalls(h.calls).length,3,'re-send only');
  }finally{await h.cleanup();}
});
