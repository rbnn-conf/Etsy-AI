// Regression for the live Product #009 failure: RETRY kept reporting
// "$.concepts[N].page_count: below 5" after the page-rule fix. Cause: the
// running bot predated the fix and kept the old concepts schema in memory
// (loadSchema caches per process). These tests drive the EXACT live path:
// Telegram RETRY -> runIdeation -> generateConcepts -> structured() ->
// JSON-schema validate() -> pageCountProblems(). Offline: fake OpenAI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchema, schemaPath } from '../src/orchestrator/schema.mjs';
import { validationDiagnostic } from '../src/orchestrator/page-rules.mjs';
import { automationRoot } from '../src/config.mjs';
import { harness, msg, photo, press, button, concept, apiFailure, PNG, pressRetry } from './helpers.mjs';

const make=(format,type,n)=>({concepts:['A','B','C'].map(id=>concept(id,{proposed_name:`${type} ${id}`,product_type:type,product_format:format,page_count:n}))});
const CASES=[
  ['greeting-card','christmas greeting card',1,'awaiting_concept_selection'],
  ['greeting-card','christmas greeting card',3,'awaiting_concept_selection'],
  ['activity-book','activity book',3,'failed'],
  ['colouring-book','colouring book',5,'failed'],
  ['activity-book','activity book',20,'awaiting_concept_selection']
];

/** A #009-shaped product: greeting-card request + references, FAILED at ideation, resume REFERENCES_RECEIVED. */
async function failedLike009(payload){
  let first=true;
  const h=await harness({files:{ref1:PNG},plan:{concepts:()=>first?(first=false,apiFailure()):payload}});
  await h.wf.handleUpdate(msg('/newproduct christmas greetings card'));await h.wf.handleUpdate(photo('ref1'));
  assert.equal((await h.wf.handleUpdate(msg('/go'))).outcome,'failed');
  const p=await h.store.load('001');
  assert.equal(p.status,'FAILED');assert.equal(p.resume_state,'REFERENCES_RECEIVED');assert.equal(p.last_error.step,'ideation');
  return h;
}

for(const [format,type,n,expected] of CASES)test(`live RETRY path: ${format} + page_count ${n} -> ${expected==='awaiting_concept_selection'?'PASS':'FAIL'}`,async()=>{
  const h=await failedLike009(make(format,type,n));
  try{
    const r=await pressRetry(h);
    assert.equal(r.outcome,expected);
    const p=await h.store.load('001');
    if(expected==='awaiting_concept_selection'){
      assert.equal(p.status,'AWAITING_CONCEPT_SELECTION');assert.deepEqual(p.concepts.batches[0].concepts.map(c=>c.page_count),[n,n,n]);
    }else{
      assert.equal(p.status,'FAILED');
      assert.match(p.last_error.message,new RegExp(`page_count: ${n} is below 10`));
    }
    // Whatever happens, the old generic schema minimum must never fire again.
    assert.doesNotMatch(p.last_error?.message??'',/page_count: below \d/);
  }finally{await h.cleanup();}
});

test('root cause: only a stale in-memory schema with minimum 5 produces the exact live #009 message',async()=>{
  const pc=(await loadSchema('concepts')).properties.concepts.items.properties.page_count, saved=pc.minimum;
  const h=await failedLike009(make('greeting-card','christmas greeting card',1));
  pc.minimum=5;   // what a bot started before the fix still had cached
  try{
    await pressRetry(h);
    assert.equal((await h.store.load('001')).last_error.message,
      'InvalidModelOutputError: ideas: model output rejected: $.concepts[0].page_count: below 5; $.concepts[1].page_count: below 5; $.concepts[2].page_count: below 5');
  }finally{pc.minimum=saved;await h.cleanup();}
});

test('no schema on disk carries a page_count minimum above 1',async()=>{
  for(const f of (await readdir(join(automationRoot,'schemas'))).filter(f=>f.endsWith('.schema.json'))){
    const text=await readFile(join(automationRoot,'schemas',f),'utf8');
    for(const m of text.matchAll(/"page_count":\s*\{[^}]*?"minimum":\s*(\d+)/g))assert.equal(Number(m[1]),1,`${f} page_count minimum`);
  }
});

test('startup diagnostic reports the loaded schema path, absolute range and format rules',async()=>{
  const lines=(await validationDiagnostic()).join('\n');
  assert.ok(lines.includes(schemaPath('concepts')));
  assert.match(lines,/concept page_count absolute range: 1-60; specification: 1-60/);
  assert.match(lines,/format rules: loaded \(10 formats\).*greeting-card 1-4.*activity-book 10-60.*colouring-book 10-60.*crochet-pattern-bundle 1-3/);
  assert.match(lines,/fingerprint: [0-9a-f]{12}/);
  assert.doesNotMatch(lines,/sk-|token|key/i,'no secrets');
});
