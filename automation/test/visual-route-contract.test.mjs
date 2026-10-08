// visual_route length contract (Product #009 ideation failed: typography_approach
// longer than 80). The model must be TOLD each limit; the validator still
// enforces it; nothing is truncated. Offline: OpenAI and Telegram are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSchema, strictSchema } from '../src/orchestrator/schema.mjs';
import { loadPrompt } from '../src/openai/prompts.mjs';
import { harness, msg, photo, press, button, concept, ROUTES, previewCalls, PNG, pressRetry } from './helpers.mjs';

const LONG='Elegant hand-lettered serif greeting centred in the upper third with generous letter-spacing and a small gold flourish';
const withTypography=t=>({concepts:['A','B','C'].map(id=>concept(id,{visual_route:{...ROUTES[id],typography_approach:t}}))});
const go=async h=>{await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(photo('ref1'));return h.wf.handleUpdate(msg('/go'));};

test('1: typography_approach within 80 characters is accepted and previews follow',async()=>{
  const ok='Elegant serif greeting centred in upper third';
  assert.ok(ok.length<=80);
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>withTypography(ok)}});
  try{
    assert.equal((await go(h)).outcome,'awaiting_concept_selection');
    assert.equal(previewCalls(h.calls).length,3);
    assert.deepEqual((await h.store.load('001')).concepts.batches[0].concepts.map(c=>c.visual_route.typography_approach),[ok,ok,ok],'stored exactly as returned');
  }finally{await h.cleanup();}
});

test('2 + 6: typography_approach over 80 characters is rejected, not truncated, and no image is generated',async()=>{
  assert.ok(LONG.length>80);
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>withTypography(LONG)}});
  try{
    const r=await go(h);
    assert.equal(r.outcome,'failed');assert.equal(r.step,'ideation');
    const p=await h.store.load('001');
    assert.equal(p.last_error.message,'InvalidModelOutputError: ideas: model output rejected: $.concepts[0].visual_route.typography_approach: longer than 80; $.concepts[1].visual_route.typography_approach: longer than 80; $.concepts[2].visual_route.typography_approach: longer than 80');
    assert.equal(p.last_error.retryable,true);
    assert.equal(h.calls.filter(c=>c.kind==='image').length,0);
    assert.equal(p.concepts.batches.length,0,'nothing stored, nothing shortened');
  }finally{await h.cleanup();}
});

test('3: the ideation prompt asks for short descriptors with explicit limits',async()=>{
  const p=await loadPrompt('creative-director');
  assert.match(p,/`visual_route` values are SHORT STRUCTURED DESCRIPTORS, not prose/);
  assert.match(p,/every value MUST be 80 characters or fewer; primary_subject and\s+focal_object MUST be 40 characters or fewer/);
  assert.match(p,/no rationale, no explanation, no full sentences, never more than one\s+sentence/);
  assert.match(p,/typography_approach: "Elegant serif greeting centred in upper third"/);
  // Every example in the prompt obeys its own limit.
  const examples=[...p.matchAll(/^\s{2}(\w+): "([^"]+)"$/gm)];
  assert.equal(examples.length,9,'one example per visual_route field');
  for(const m of examples)assert.ok(m[2].length<=(['primary_subject','focal_object'].includes(m[1])?40:80),`${m[1]} example too long`);
});

test('4: all nine visual_route fields are bounded, and the model-facing schema states each limit',async()=>{
  const full=(await loadSchema('concepts')).properties.concepts.items.properties.visual_route;
  const sent=strictSchema(await loadSchema('concepts')).properties.concepts.items.properties.visual_route;
  assert.equal(Object.keys(full.properties).length,9);
  for(const [k,s] of Object.entries(full.properties)){
    const max=['primary_subject','focal_object'].includes(k)?40:80;
    assert.equal(s.maxLength,max,`${k} maxLength`);assert.equal(s.minLength,1);
    assert.match(sent.properties[k].description,new RegExp(`^Short descriptor, not a sentence\\..*Maximum ${max} characters\\.$`),`${k} description tells the model`);
  }
  assert.match(sent.description,/SHORT descriptors \(noun phrases, not sentences, no rationale\)/);
  // Strict mode doesn't accept string length keywords, so they are not sent; the validator enforces them.
  assert.ok(!JSON.stringify(sent).includes('maxLength'));
  // The limit sentence is added generically, e.g. for the specification too.
  assert.match(strictSchema(await loadSchema('specification')).properties.slug.description??'',/Maximum 60 characters\./);
});

test('5: order is JSON/schema validation -> diversity validation -> images',async()=>{
  const sameRoute=t=>({concepts:['A','B','C'].map(id=>concept(id,{visual_route:{...ROUTES.A,typography_approach:t}}))});
  // Too long AND not diverse: the schema error is reported (diversity never sees invalid data).
  let h=await harness({files:{ref1:PNG},plan:{concepts:()=>sameRoute(LONG)}});
  try{await go(h);assert.match((await h.store.load('001')).last_error.message,/typography_approach: longer than 80/);assert.equal(h.calls.filter(c=>c.kind==='image').length,0);}
  finally{await h.cleanup();}
  // Valid lengths but not diverse: the diversity check still runs and rejects it.
  h=await harness({files:{ref1:PNG},plan:{concepts:()=>sameRoute('Serif greeting in upper third')}});
  try{await go(h);assert.match((await h.store.load('001')).last_error.message,/ideas: concepts are not visually distinct/);assert.equal(h.calls.filter(c=>c.kind==='image').length,0);}
  finally{await h.cleanup();}
});

test('#009 path: FAILED ideation after a direction rebuild -> RETRY = 1 ideation call, then 3 previews; no rebuild, no re-analysis',async()=>{
  let n=0;
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>{n++;return n===2?withTypography(LONG):{concepts:['A','B','C'].map(id=>concept(id,{proposed_name:`Batch ${n} ${id}`}))};}}});
  try{
    await go(h);                                                            // batch-01 + previews
    const r=await h.wf.handleUpdate(press(button(h.telegram,'REGENERATE CONCEPTS')));
    assert.equal(r.outcome,'failed');                                       // overlong typography, like #009
    let p=await h.store.load('001');
    assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'AWAITING_CONCEPT_SELECTION');assert.equal(p.last_error.step,'ideation');
    const count=()=>({analysis:h.calls.filter(c=>c.schemaName==='reference-analysis').length,direction:h.calls.filter(c=>c.schemaName==='creative-direction').length,
      ideas:h.calls.filter(c=>c.schemaName==='concepts').length,images:h.calls.filter(c=>c.kind==='image').length});
    const before=count();
    const retry=await pressRetry(h);
    assert.equal(retry.outcome,'awaiting_concept_selection');assert.equal(retry.batch,2);
    assert.deepEqual(count(),{analysis:before.analysis,direction:before.direction,ideas:before.ideas+1,images:before.images+3});
    p=await h.store.load('001');
    assert.deepEqual(p.concept_previews.batches.map(b=>[b.batch,b.status]),[[1,'complete'],[2,'complete']],'batch-01 kept');
  }finally{await h.cleanup();}
});
