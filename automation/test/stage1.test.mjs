import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { transition, acquireLock, TransitionError, BusyError } from '../src/orchestrator/state.mjs';
import { SchemaError, loadSchema, strictSchema } from '../src/orchestrator/schema.mjs';
import { selectProofPages } from '../src/orchestrator/proofs.mjs';
import { parse, encode } from '../src/telegram/approvals.mjs';
import { redactor } from '../src/log.mjs';
import { loadAutomationConfig, configProblems } from '../src/config.mjs';
import { harness, msg, photo, press, button, apiFailure, spec, concept, previewCalls, proofCalls, PNG, JPEG, CHAT, pressRetry } from './helpers.mjs';

const exists=p=>access(p).then(()=>true,()=>false);
async function toProofs(h,{refs=true}={}){
  await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
  if(refs)await h.wf.handleUpdate(photo('ref1'));
  await h.wf.handleUpdate(msg('/go'));
  return h.wf.handleUpdate(press(button(h.telegram,'B')));
}

test('state machine: legal path, illegal events, retry resumes, nonce rotates, lock is exclusive',()=>{
  const base={status:'DRAFT',resume_state:null,status_history:[],review:{nonce:'aaaaaa',keyboard_message_ids:[]},lock:null};
  let p=transition(base,'reference_added');
  assert.equal(p.status,'REFERENCES_RECEIVED');assert.notEqual(p.review.nonce,'aaaaaa');
  assert.throws(()=>transition(p,'creative_approved'),TransitionError);
  p=transition(p,'ideas_ready');
  assert.throws(()=>transition(p,'concept_selected'),TransitionError,'no selection before previews');
  p=transition(p,'previews_started');p=transition(p,'previews_ready');assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');
  p=transition(p,'concept_selected');
  p=transition(p,'failed');assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'CONCEPT_SELECTED');
  p=transition(p,'retry');assert.equal(p.status,'CONCEPT_SELECTED');assert.equal(p.resume_state,null);
  for(const e of ['spec_ready','proofs_started','proofs_ready','creative_approved'])p=transition(p,e);
  assert.equal(p.status,'CREATIVE_APPROVED');
  assert.throws(()=>transition(p,'rejected'),TransitionError,'terminal state is final');
  const locked=acquireLock(base,'proofs');
  assert.throws(()=>acquireLock(locked,'proofs'),BusyError);
});

test('product.json is validated on every save; invalid state is never persisted',async()=>{
  const h=await harness();
  try{
    const p=await h.store.create({requestText:'Halloween Kids Book!',chatId:CHAT,requestedBy:'@owner'});
    assert.equal(p.workspace,'001-halloween-kids-book');
    await assert.rejects(h.store.save({...p,status:'PUBLISHED'}),SchemaError);
    await assert.rejects(h.store.save({...p,status:'SPEC_READY'}),e=>e instanceof SchemaError&&/required once SPEC_READY/.test(e.message));
    await assert.rejects(h.store.save({...p,surprise:true}),SchemaError);
    assert.equal((await h.store.load(p.product_id)).status,'DRAFT','on-disk state unchanged');
    // Numbering never reuses an existing number, including hand-built products.
    const q=await h.store.create({requestText:'next',chatId:CHAT,requestedBy:'@owner'});
    assert.equal(q.product_id,'002');
  }finally{await h.cleanup();}
});

test('reference images are downloaded into the product workspace and associated',async()=>{
  const h=await harness({files:{ref1:PNG,ref2:JPEG,doc:Buffer.from('not an image')}});
  try{
    const c=await h.wf.handleUpdate(msg('/newproduct halloween kids activity book'));
    assert.equal(c.outcome,'created');
    const r1=await h.wf.handleUpdate(photo('ref1'));
    assert.equal(r1.outcome,'reference_added');assert.equal(r1.file,'references/reference-01.png');
    assert.equal((await h.wf.handleUpdate(photo('ref1'))).outcome,'duplicate_reference');
    const r2=await h.wf.handleUpdate(photo('ref2'));assert.equal(r2.file,'references/reference-02.jpg');
    assert.equal((await h.wf.handleUpdate(photo('doc'))).outcome,'not_image');
    const p=await h.store.load(c.productId);
    assert.equal(p.status,'REFERENCES_RECEIVED');assert.equal(p.reference_files.length,2);
    assert.deepEqual(await readFile(h.store.pathOf(p,'references/reference-01.png')),PNG,'stored locally, byte-identical');
    assert.match(p.reference_files[0].sha256,/^[a-f0-9]{64}$/);
  }finally{await h.cleanup();}
});

test('concept selection runs spec + exactly 3 proofs, then APPROVE STYLE stops at CREATIVE_APPROVED',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    const r=await toProofs(h);
    assert.equal(r.outcome,'awaiting_creative_approval');
    const p=await h.store.load(r.productId), ws=join(h.root,'products',p.workspace);
    assert.equal(p.status,'AWAITING_CREATIVE_APPROVAL');
    assert.equal(p.concepts.selected.concept_id,'B');
    assert.equal(p.pages.length,12);assert.equal(p.name,'Cute Ghost Activity Book');
    assert.deepEqual(p.proofs.selected_pages.map(s=>s.role),['main-style','different-composition','consistency-check']);
    for(const f of ['creative/reference-analysis.json','creative/creative-direction.json','proofs/attempt-01/proof-01.png','proofs/attempt-01/proof-02.png','proofs/attempt-01/proof-03.png','proofs/attempt-01/metadata.json'])
      assert.ok(await exists(join(ws,f)),f);
    assert.equal(previewCalls(h.calls).length,3,'three concept previews');assert.equal(proofCalls(h.calls).length,3,'three creative proofs');
    assert.equal(h.calls.find(c=>c.schemaName==='reference-analysis').images,1,'reference sent to vision model');
    const prompt=proofCalls(h.calls)[0].prompt;
    assert.match(prompt,/Original cozy cartoon line art/);assert.match(prompt,/DO NOT INCLUDE: reference-specific characters/);
    assert.equal(h.telegram.sent.filter(s=>s.type==='album').at(-1).items.length,3);
    assert.match(h.telegram.sent.filter(s=>s.type==='message').at(-1).text,/ART DIRECTION[\s\S]*REFERENCE IMAGES: 1 supplied/);
    assert.ok(p.api_usage.length>=6);
    const a=await h.wf.handleUpdate(press(button(h.telegram,'APPROVE STYLE')));
    assert.equal(a.outcome,'creative_approved');
    const done=await h.store.load(r.productId);
    assert.equal(done.status,'CREATIVE_APPROVED');assert.ok(done.creative_approved_at);
    const approved=h.telegram.sent.find(s=>s.text==='✅ Creative approved for #001. Build the customer files when you are ready (Stage 2, no API cost; or /produce 001).');
    assert.ok(approved,'approval message');
    // Next step offered as a button (free production), plus product and home.
    assert.deepEqual(approved.replyMarkup.inline_keyboard.flat().map(b=>b.text),['🏭 Build Production Files','📦 Product','🏠 Home']);
    assert.deepEqual(done.status_history.map(s=>s.to),['DRAFT','REFERENCES_RECEIVED','IDEAS_READY','CONCEPT_PREVIEWS_GENERATING','AWAITING_CONCEPT_SELECTION','CONCEPT_SELECTED','SPEC_READY','PROOFS_GENERATING','AWAITING_CREATIVE_APPROVAL','CREATIVE_APPROVED']);
    console.log('STATE TRANSITIONS:',done.status_history.map(s=>`${s.from??'∅'} -[${s.event}]-> ${s.to}`).join(' | '));
  }finally{await h.cleanup();}
});

test('without references, direction is created from the chosen concept',async()=>{
  const h=await harness();
  try{
    const r=await toProofs(h,{refs:false});
    const p=await h.store.load(r.productId);
    assert.equal(p.visual_direction.source,'concept');assert.equal(p.reference_files.length,0);
    assert.ok(!h.calls.some(c=>c.schemaName==='reference-analysis'));
  }finally{await h.cleanup();}
});

test('Telegram callbacks: unparseable, unauthorised, stale and wrong-state presses change nothing',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await h.wf.handleUpdate(msg('/newproduct kids book'));await h.wf.handleUpdate(msg('/go'));
    const choose=button(h.telegram,'A');
    assert.equal((await h.wf.handleUpdate(press('r1|approve|001|abc'))).outcome,'unparseable','production-bot buttons are not ours');
    assert.equal((await h.wf.handleUpdate(press(choose,{user:9999}))).outcome,'unauthorized');
    assert.equal((await h.wf.handleUpdate(press(choose,{chat:4242}))).outcome,'unauthorized');
    const stale=encode('ca','001','zzzzzz');
    assert.equal((await h.wf.handleUpdate(press(stale))).outcome,'stale');
    const approveNow=encode('approve','001',(await h.store.load('001')).review.nonce);
    assert.equal((await h.wf.handleUpdate(press(approveNow))).outcome,'invalid_state');
    assert.equal((await h.store.load('001')).status,'AWAITING_CONCEPT_SELECTION');
    // Unauthorised messages are ignored entirely.
    const intruder={update_id:9,message:{message_id:1,chat:{id:CHAT},from:{id:1},text:'/newproduct x'}};
    assert.equal((await h.wf.handleUpdate(intruder)).outcome,'unauthorized');
    assert.equal((await h.store.list()).length,1);
    assert.equal(parse('a1|ca|001|abcdef').action,'ca');assert.equal(parse('a1|drop|001|abcdef'),null);assert.equal(parse('x'.repeat(80)),null);
  }finally{await h.cleanup();}
});

test('duplicate presses never duplicate work (approve twice, regenerate twice, choose twice)',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await h.wf.handleUpdate(msg('/newproduct kids book'));await h.wf.handleUpdate(msg('/go'));
    const choose=button(h.telegram,'A');
    await h.wf.handleUpdate(press(choose));
    assert.equal((await h.wf.handleUpdate(press(choose))).outcome,'stale');
    const regen=button(h.telegram,'REGENERATE PROOFS');
    assert.equal((await h.wf.handleUpdate(press(regen))).outcome,'awaiting_creative_approval');
    assert.equal((await h.wf.handleUpdate(press(regen))).outcome,'stale');
    assert.equal(proofCalls(h.calls).length,6,'2 attempts x 3 images, not 3 attempts');assert.equal(previewCalls(h.calls).length,3,'previews made once');
    const approve=button(h.telegram,'APPROVE STYLE');
    assert.equal((await h.wf.handleUpdate(press(approve))).outcome,'creative_approved');
    assert.equal((await h.wf.handleUpdate(press(approve))).outcome,'stale');
    const p=await h.store.load('001');
    assert.equal(p.status_history.filter(s=>s.to==='CREATIVE_APPROVED').length,1);
    // Regenerate never overwrites: both attempts are on disk.
    const dirs=await readdir(join(h.root,'products',p.workspace,'proofs'));
    assert.deepEqual(dirs.sort(),['attempt-01','attempt-02']);
    // A press while a step holds the lock is refused.
    const locked={...p,status:'AWAITING_CREATIVE_APPROVAL',lock:{op:'proofs',id:'x',at:new Date().toISOString()}};
    await h.store.save(locked);
    assert.equal((await h.wf.handleUpdate(press(encode('regen','001',locked.review.nonce)))).outcome,'busy');
  }finally{await h.cleanup();}
});

test('failed OpenAI text call: state not corrupted, useful Telegram error, RETRY succeeds',async()=>{
  let fail=true;
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>fail?apiFailure():{concepts:['A','B','C'].map(id=>concept(id,{proposed_name:`N${id}`}))}}});
  try{
    await h.wf.handleUpdate(msg('/newproduct kids book'));await h.wf.handleUpdate(photo('ref1'));
    const r=await h.wf.handleUpdate(msg('/go'));
    assert.equal(r.outcome,'failed');assert.equal(r.step,'ideation');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'REFERENCES_RECEIVED');assert.equal(p.lock,null);
    assert.equal(p.last_error.retryable,true);
    assert.ok(await h.store.exists(p,'creative/creative-direction.json'),'completed work kept');
    const err=h.telegram.sent.filter(s=>s.type==='message').at(-1);
    assert.match(err.text,/^⚠️ Product #001 needs attention\n\nOpenAIError: OpenAI \/responses failed \(HTTP 500\)[\s\S]*Stopped at: ideation\. Completed files are kept\.\nRetry may call OpenAI; you will be asked to confirm\./);
    // A paid step: retry goes through the cost confirmation; details, product and home are offered.
    assert.deepEqual(err.replyMarkup.inline_keyboard.flat().map(b=>b.text),['🔄 Retry (API cost)','📋 Details','📦 Product','🏠 Home']);
    fail=false;
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_concept_selection');
    p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');
    assert.equal(h.calls.filter(c=>c.schemaName==='reference-analysis').length,1,'analysis not repeated on retry');
  }finally{await h.cleanup();}
});

test('failed image generation is retryable and resumes the same attempt without regenerating finished proofs',async()=>{
  const h=await harness({files:{ref1:PNG},plan:{image:n=>n===5?apiFailure():null}});
  try{
    const r=await toProofs(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'proofs');
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'SPEC_READY');
    assert.equal(p.proofs.attempts[0].status,'failed');assert.equal(p.proofs.attempts[0].images.length,1);
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_creative_approval');
    p=await h.store.load('001');
    assert.equal(p.proofs.attempts.length,1);assert.equal(p.proofs.attempts[0].status,'complete');assert.equal(p.proofs.attempts[0].images.length,3);
    assert.equal(proofCalls(h.calls).length,4,'1 ok + 1 failed + 2 on retry');assert.equal(previewCalls(h.calls).length,3,'previews not repeated');
  }finally{await h.cleanup();}
});

test('invalid model output is rejected, not silently accepted',async()=>{
  const bad={...spec(12),page_count:13};
  const h=await harness({files:{ref1:PNG},plan:{specification:()=>bad}});
  try{
    const r=await toProofs(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'specification');
    const p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'CONCEPT_SELECTED');assert.equal(p.pages.length,0);
    assert.match(p.last_error.message,/page_count 13 but 12 pages/);
  }finally{await h.cleanup();}
});

test('CHANGE DIRECTION stores feedback, versions the direction and makes a new attempt',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await toProofs(h);
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'CHANGE DIRECTION')))).outcome,'awaiting_feedback');
    const r=await h.wf.handleUpdate(msg('Make the characters rounder and backgrounds simpler.'));
    assert.equal(r.outcome,'awaiting_creative_approval');assert.equal(r.attempt,2);
    const p=await h.store.load('001');
    assert.equal(p.visual_direction.version,2);assert.equal(p.pending_input,null);
    assert.deepEqual(p.direction_feedback.map(f=>[f.text,f.applied_in_version]),[['Make the characters rounder and backgrounds simpler.',2]]);
    assert.ok(await h.store.exists(p,'creative/creative-direction.v01.json'),'previous direction archived');
    assert.equal((await h.store.readJson(p,'creative/creative-direction.json')).feedback_applied,'Make the characters rounder and backgrounds simpler.');
    assert.ok(await h.store.exists(p,'proofs/attempt-01/proof-01.png'),'attempt 1 preserved');
  }finally{await h.cleanup();}
});

test('restart recovery: an interrupted generation becomes FAILED (retryable), lock released',async()=>{
  const h=await harness({files:{ref1:PNG}});
  try{
    await toProofs(h);
    let p=await h.store.load('001');
    p=transition({...p,lock:{op:'proofs',id:'x',at:new Date().toISOString()}},'proofs_started');
    p={...p,proofs:{...p.proofs,attempts:[...p.proofs.attempts,{...p.proofs.attempts[0],attempt:2,dir:'proofs/attempt-02',status:'generating',images:[]}]}};
    await h.store.save(p);
    assert.deepEqual(await h.wf.recover(),['001']);
    p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'AWAITING_CREATIVE_APPROVAL');assert.equal(p.lock,null);
    assert.equal(p.proofs.attempts[1].status,'interrupted');
    assert.deepEqual(await h.wf.recover(),[],'idempotent');
  }finally{await h.cleanup();}
});

test('proof page selection is deterministic and varied',()=>{
  const sel=selectProofPages(spec(8).pages);
  assert.deepEqual(sel.map(s=>s.page_number),[2,3,7]);
  assert.ok(!sel.some(s=>s.page_number===1||s.page_number===8),'cover and certificate avoided');
});

test('model-facing schemas are strict and all schemas load',async()=>{
  for(const n of ['product','creative-direction','reference-analysis','concepts','specification'])await loadSchema(n);
  const s=strictSchema(await loadSchema('specification'));
  assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));
  assert.equal(s.properties.pages.items.additionalProperties,false);
  assert.ok(!JSON.stringify(s).includes('minItems'),'range keywords stripped for strict mode');
});

test('secrets never reach logs; shared review-bot token is refused by default',()=>{
  const r=redactor(['sk-supersecretvalue123']);
  assert.equal(r('key sk-supersecretvalue123 used'),'key [REDACTED] used');
  assert.equal(r('url /bot123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/getUpdates'),'url /[REDACTED]/getUpdates');
  const c=loadAutomationConfig({AUTOMATION_TELEGRAM_BOT_TOKEN:'same-token-abc',TELEGRAM_BOT_TOKEN:'same-token-abc',TELEGRAM_CHAT_ID:'1',OPENAI_API_KEY:'k',OPENAI_TEXT_MODEL:'m',OPENAI_IMAGE_MODEL:'i'});
  assert.ok(configProblems(c).some(p=>p.includes('one poller per token')));
  assert.ok(!configProblems(c).join(' ').includes('same-token-abc'),'problems never echo secret values');
});
