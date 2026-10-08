// Gate 1: visual concept selection. One preview image per concept, sent as
// three captioned photos, chosen with A/B/C. Offline: OpenAI and Telegram mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { transition } from '../src/orchestrator/state.mjs';
import { encode } from '../src/telegram/approvals.mjs';
import { loadAutomationConfig, configProblems, imageQualities } from '../src/config.mjs';
import { harness, msg, photo, press, button, lastKeyboard, apiFailure, concept, previewCalls, proofCalls, PNG, pressRetry } from './helpers.mjs';

const exists=p=>access(p).then(()=>true,()=>false);
const ws=async h=>join(h.root,'products',(await h.store.load('001')).workspace);
async function toPreviews(h,{refs=true}={}){
  await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
  if(refs)await h.wf.handleUpdate(photo('ref1'));
  return h.wf.handleUpdate(msg('/go'));
}
const photos=h=>h.telegram.sent.filter(s=>s.type==='photo');

test('exactly 3 previews (A, B, C), cheap quality, before any proof; state AWAITING_CONCEPT_SELECTION',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    const r=await toPreviews(h);
    assert.equal(r.outcome,'awaiting_concept_selection');assert.equal(r.batch,1);
    const p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');
    const pv=previewCalls(h.calls);
    assert.equal(pv.length,3);assert.equal(proofCalls(h.calls).length,0,'no final proofs before selection');
    assert.ok(pv.every(c=>c.quality==='low'&&c.size==='1024x1536'),'preview quality, not proof quality');
    // Each prompt is about its own concept, and names the other two to differ from.
    const routes=p.concepts.batches[0].concepts.map(c=>c.visual_route);
    pv.forEach((c,i)=>{
      const id='ABC'[i];
      assert.match(c.prompt,new RegExp(`CONCEPT PREVIEW ${id} of 3`));assert.ok(c.prompt.includes(`- Distinguishing hook: ${routes[i].distinguishing_visual_hook}`));
      for(const [j,o] of routes.entries())if(j!==i)assert.ok(!c.prompt.includes(o.distinguishing_visual_hook)&&c.prompt.includes(`${o.primary_subject} / ${o.scene}`),'other routes appear only as things to avoid');
      assert.match(c.prompt,/Original cozy cartoon line art/,'creative direction included');
      assert.match(c.prompt,/REFERENCE CHARACTERISTICS \(general only, never copied\)/,'reference analysis included, generalised');
      assert.doesNotMatch(c.prompt,/the named mascot/,'do_not_copy items never enter an image prompt');
      assert.match(c.prompt,/halloween kids activity book/,'request included');
      assert.match(c.prompt,/one representative activity page/,'product format included');
    });
    assert.equal(new Set(pv.map(c=>c.prompt)).size,3);
    assert.ok(!p.api_usage.some(u=>u.step==='proof-image'));assert.equal(p.api_usage.filter(u=>u.step==='concept-preview').length,3);
  }finally{await h.cleanup();}
});

test('A/B/C map to the right concept files, captions and buttons; stored apart from proofs, with metadata',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await toPreviews(h);
    const p=await h.store.load('001'), dir=join(await ws(h),'concept-previews','batch-01'), rec=p.concept_previews.batches[0];
    assert.deepEqual(await readdir(dir).then(f=>f.sort()),['concept-a.png','concept-b.png','concept-c.png','metadata.json']);
    assert.ok(!await exists(join(await ws(h),'proofs')),'proofs folder untouched');
    assert.deepEqual(rec.images.map(i=>[i.concept_id,i.file]),[['A','concept-previews/batch-01/concept-a.png'],['B','concept-previews/batch-01/concept-b.png'],['C','concept-previews/batch-01/concept-c.png']]);
    assert.equal(rec.status,'complete');assert.equal(rec.quality,'low');assert.equal(rec.model,'gpt-image-test');
    const meta=JSON.parse(await readFile(join(dir,'metadata.json'),'utf8'));
    assert.equal(meta.batch,1);assert.match(meta.note,/not final artwork/);
    assert.deepEqual(meta.images.map(i=>[i.concept_id,i.source_concept.concept_id,i.source_concept.proposed_name,i.size,i.quality]),
      [['A','A','Concept A Book','1024x1536','low'],['B','B','Concept B Book','1024x1536','low'],['C','C','Concept C Book','1024x1536','low']]);
    assert.doesNotMatch(JSON.stringify(meta),/sk-|api[_-]?key/i,'no credentials');
    // Telegram: short header, then one captioned photo per concept, in order, then A/B/C buttons.
    const msgs=h.telegram.sent.filter(s=>s.type==='message'), header=msgs.findLast(m=>/CHOOSE A DIRECTION/.test(m.text));
    assert.match(header.text,/^🎨 PRODUCT #001 — CHOOSE A DIRECTION\n\nHalloween Kids Activity Book\n\nI've created 3 visual directions based on your references\.\nThese are quick concept previews, not the finished product\.$/);
    assert.deepEqual(photos(h).map(ph=>ph.caption),['A — Concept A Book\nfriendly ghost / pumpkin patch / carved pumpkin / bright autumn afternoon\n12 designed pages','B — Concept B Book\nblack cat / moonlit hedge maze / twisting path / cool moonlight\n12 designed pages','C — Concept C Book\nlittle bats / haunted house on a hill / crooked house / purple dusk\n12 designed pages']);
    assert.deepEqual(photos(h).map(ph=>ph.fileName),['001-batch-01-concept-a.png','001-batch-01-concept-b.png','001-batch-01-concept-c.png']);
    assert.equal(h.telegram.sent.filter(s=>s.type==='album').length,0,'no album: each image carries its own letter');
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['A','B','C','REGENERATE CONCEPTS','CANCEL','❓ What can I do here?','🏠 Home']);
    assert.ok(h.telegram.sent.filter(s=>s.type==='message').every(m=>m.text.length<400),'no enormous concept message');
  }finally{await h.cleanup();}
});

test('choosing C specifies concept C, then makes 3 creative proofs at proof quality',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await toPreviews(h);
    const r=await h.wf.handleUpdate(press(button(h.telegram,'C')));
    assert.equal(r.outcome,'awaiting_creative_approval');
    const p=await h.store.load('001');
    assert.equal(p.concepts.selected.concept_id,'C');
    const specCall=h.calls.find(c=>c.schemaName==='specification');
    assert.match(specCall.user,/"concept_id": "C"/);assert.doesNotMatch(specCall.user,/"concept_id": "[AB]"/);
    assert.ok(proofCalls(h.calls).every(c=>c.quality===undefined||c.quality==='medium'));
    assert.equal(proofCalls(h.calls).length,3);assert.equal(previewCalls(h.calls).length,3);
    assert.equal(p.status,'AWAITING_CREATIVE_APPROVAL','gate 2 is separate from gate 1');
  }finally{await h.cleanup();}
});

test('duplicate updates never regenerate previews',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await toPreviews(h);
    assert.equal((await h.wf.handleUpdate(msg('/go'))).outcome,'nothing_to_do','second /go ignored');
    const again=await h.wf.handleUpdate(msg('/previews'));
    assert.equal(again.outcome,'awaiting_concept_selection');assert.equal(photos(h).length,6,'re-sent');
    assert.equal(previewCalls(h.calls).length,3,'/previews re-sends, never regenerates');
    const choose=button(h.telegram,'B');
    await h.wf.handleUpdate(press(choose));
    assert.equal((await h.wf.handleUpdate(press(choose))).outcome,'stale','second press of the same button');
    assert.equal(h.calls.filter(c=>c.schemaName==='specification').length,1);
    // An old REGENERATE button pressed after selection is refused, not re-run.
    let p=await h.store.load('001');
    assert.equal((await h.wf.handleUpdate(press(encode('more','001',p.review.nonce)))).outcome,'invalid_state','no regeneration after selection');
    assert.equal(previewCalls(h.calls).length,3);
  }finally{await h.cleanup();}
});

test('partial failure: A and B succeed, C fails; RETRY makes only C',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{image:n=>n===3?apiFailure():null}});
  try{
    const r=await toPreviews(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'concept-previews');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'IDEAS_READY');assert.equal(p.lock,null);
    assert.deepEqual(p.concept_previews.batches[0].images.map(i=>i.concept_id),['A','B']);assert.equal(p.concept_previews.batches[0].status,'failed');
    assert.equal(photos(h).length,0,'nothing half-sent');
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_concept_selection');
    assert.equal(previewCalls(h.calls).length,4,'2 ok + 1 failed + only C again');
    assert.match(previewCalls(h.calls)[3].prompt,/CONCEPT PREVIEW C of 3/);
    p=await h.store.load('001');
    assert.equal(p.concept_previews.batches.length,1);assert.deepEqual(p.concept_previews.batches[0].images.map(i=>i.concept_id),['A','B','C']);
    assert.equal(h.calls.filter(c=>c.schemaName==='concepts').length,1,'no second ideation call');
  }finally{await h.cleanup();}
});

test('restart mid-generation: recovery spends nothing; RETRY makes only the missing images; an unrecorded PNG on disk is reused',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{image:n=>n===2?apiFailure():null}});
  try{
    await toPreviews(h);   // A done, B failed
    // Simulate a crash while generating: lock held, state CONCEPT_PREVIEWS_GENERATING, batch "generating",
    // and C's PNG already written to disk but not yet recorded.
    let p=await h.store.load('001');
    p=transition(transition(p,'retry'),'previews_started');
    p={...p,lock:{op:'concept-previews',id:'x',at:new Date().toISOString()},concept_previews:{batches:[{...p.concept_previews.batches[0],status:'generating',error:null,finished_at:null}]}};
    await h.store.save(p);await h.store.writeBytes(p,'concept-previews/batch-01/concept-c.png',PNG);
    const before=previewCalls(h.calls).length;
    assert.deepEqual(await h.wf.recover(),['001']);
    assert.equal(previewCalls(h.calls).length,before,'restart recovery never spends');
    p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'IDEAS_READY');assert.equal(p.lock,null);
    assert.equal(p.last_error.step,'concept-previews');assert.equal(p.concept_previews.batches[0].status,'interrupted');
    assert.deepEqual(await h.wf.recover(),[],'idempotent');
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_concept_selection');
    assert.equal(previewCalls(h.calls).length,before+1,'only B is generated; C is reused from disk');
    const imgs=(await h.store.load('001')).concept_previews.batches[0].images;
    assert.deepEqual(imgs.map(i=>[i.concept_id,!!i.adopted_after_restart]),[['A',false],['B',false],['C',true]]);
    assert.ok(h.logs.some(l=>/reusing concept-previews\/batch-01\/concept-c\.png/.test(l)));
  }finally{await h.cleanup();}
});

test('REGENERATE CONCEPTS makes batch-02 and keeps batch-01; the configurable limit stops further spend',async()=>{
  const h=await harness({files:{ref1:PNG},maxConceptBatches:2});
  try{
    await toPreviews(h);
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/Concept batch 1 of 2/);
    const r=await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE CONCEPTS')));
    assert.equal(r.outcome,'awaiting_concept_selection');assert.equal(r.batch,2);
    const root=await ws(h);
    for(const b of ['batch-01','batch-02'])assert.deepEqual((await readdir(join(root,'concept-previews',b))).sort(),['concept-a.png','concept-b.png','concept-c.png','metadata.json']);
    const p=await h.store.load('001');
    assert.deepEqual(p.concept_previews.batches.map(b=>[b.batch,b.status,b.images.length]),[[1,'complete',3],[2,'complete',3]]);
    assert.equal(p.concepts.batches.length,2);assert.equal(previewCalls(h.calls).length,6);
    assert.match(h.calls.filter(c=>c.schemaName==='concepts')[1].user,/Previously proposed concepts/);
    // Limit reached: no REGENERATE button, and a crafted press is refused without spending.
    assert.deepEqual(lastKeyboard(h.telegram).map(b=>b.text),['A','B','C','CANCEL','❓ What can I do here?','🏠 Home']);
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/no regenerations left/);
    const limited=await h.wf.handleUpdate(press(encode('more','001',p.review.nonce)));
    assert.equal(limited.outcome,'limit_reached');
    assert.equal(h.calls.filter(c=>c.schemaName==='concepts').length,2);assert.equal(previewCalls(h.calls).length,6);
    // Selection uses the latest batch.
    await h.wf.handleUpdate(press(button(h.telegram,'A')));
    assert.deepEqual((await h.store.load('001')).concepts.selected.batch,2);
  }finally{await h.cleanup();}
});

test('a #009-shaped product (IDEAS_READY, pre-preview concepts, no concept_previews field) continues with /previews and no text call',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(photo('ref1'));
    // Build the legacy state directly: concepts saved by the old code, no previews, old field set.
    let p=await h.store.load('001');
    const legacy=id=>{const {tagline,orientation,preview_brief,visual_route,...old}=concept(id,{proposed_name:`Woodland ${id}`,product_type:'Christmas greeting card',product_format:'greeting-card',page_count:3,
      short_description:`A cosy woodland Christmas card idea ${id} with a fox carrying a small parcel through snowy pines at dusk.`});return old;};
    const {concept_previews,...withoutField}=p;
    p=transition({...withoutField,concepts:{batches:[{batch:1,generated_at:new Date().toISOString(),concepts:['A','B','C'].map(legacy)}],selected:null}},'ideas_ready');
    await h.store.save(p);
    assert.ok(!('concept_previews' in await h.store.load('001')),'old product.json shape still valid');
    // The old text keyboard's CHOOSE button now asks for previews first.
    assert.equal((await h.wf.handleUpdate(press(encode('ca','001',p.review.nonce)))).outcome,'invalid_state');
    const r=await h.wf.handleUpdate(msg('/previews'));
    assert.equal(r.outcome,'awaiting_concept_selection');
    assert.equal(h.calls.filter(c=>c.kind==='json').length,0,'no ideation / text call at all');
    assert.equal(previewCalls(h.calls).length,3);
    assert.ok(previewCalls(h.calls).every(c=>/Show the card front, using THIS concept's own content:\n- Brief: A cosy woodland Christmas card idea/.test(c.prompt)),'falls back to description + look');
    assert.match(photos(h)[0].caption,/^A — Woodland A\nA cosy woodland Christmas card idea A with a fox carrying a small…\n3 designed pages$/);
    assert.equal((await h.store.load('001')).status,'AWAITING_CONCEPT_SELECTION');
  }finally{await h.cleanup();}
});

test('config: preview quality defaults to the cheapest documented value and is validated; batch limit validated',()=>{
  const base={AUTOMATION_TELEGRAM_BOT_TOKEN:'t',TELEGRAM_CHAT_ID:'1',OPENAI_API_KEY:'k',OPENAI_TEXT_MODEL:'m'};
  assert.deepEqual(imageQualities(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'gpt-image-1'})),{proof:'medium',preview:'low'});
  assert.deepEqual(imageQualities(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'dall-e-3'})),{proof:'standard',preview:'standard'});
  assert.deepEqual(imageQualities(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'gpt-image-1',OPENAI_IMAGE_QUALITY:'high',AUTOMATION_PREVIEW_QUALITY:'medium'})),{proof:'high',preview:'medium'});
  assert.ok(configProblems(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'gpt-image-1',AUTOMATION_PREVIEW_QUALITY:'draft'})).some(p=>/AUTOMATION_PREVIEW_QUALITY must be one of low, medium, high, auto/.test(p)));
  assert.ok(configProblems(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'dall-e-3',OPENAI_IMAGE_QUALITY:'low'})).some(p=>/OPENAI_IMAGE_QUALITY must be one of standard, hd/.test(p)));
  assert.equal(loadAutomationConfig(base).maxConceptBatches,3);
  assert.ok(configProblems(loadAutomationConfig({...base,OPENAI_IMAGE_MODEL:'gpt-image-1',AUTOMATION_MAX_CONCEPT_BATCHES:'0'})).some(p=>/AUTOMATION_MAX_CONCEPT_BATCHES/.test(p)));
});

test('no Etsy or production action anywhere in the preview path',async()=>{
  const importsOf=s=>s.split('\n').filter(l=>/^\s*import\b|import\(/.test(l)).join('\n');
  const read=f=>readFile(join(import.meta.dirname,'..',f),'utf8');
  assert.doesNotMatch(importsOf(await read('src/openai/concept-preview.mjs')),/etsy|services\/|marketing|spreadsheet|production/i);
  // The workflow imports the deterministic Stage 2 package (ADR-024), the Stage 3 core (ADR-025) and the Stage 4
  // engine (ADR-026) only through their index modules; never services, the Etsy client or spreadsheet.
  const wf=importsOf(await read('src/orchestrator/workflow.mjs'));
  assert.doesNotMatch(wf,/services\/|spreadsheet|etsy-live|etsy-service/i);
  const specifiers=[...wf.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);
  assert.deepEqual(specifiers.filter(x=>/production|marketing|stage4/.test(x)).sort(),['../../../marketing/src/stage3/index.mjs','../../../production/src/index.mjs','../stage4/index.mjs']);
  const h=await harness({files:{ref1:PNG}});
  try{
    await toPreviews(h);
    assert.deepEqual([...new Set(h.telegram.sent.map(s=>s.type))].sort(),['message','photo']);
    assert.ok(!await exists(join(await ws(h),'production')),'no production work during concept selection');
  }finally{await h.cleanup();}
});
