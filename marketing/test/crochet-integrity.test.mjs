// Crochet marketing integrity (ADR-041): claim QC from the Stage 2 facts. Pure; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crochetClaimProblems, crochetModelRules, imageProvenance } from '../src/stage3/crochet-integrity.mjs';
import { STAGE3_ADAPTERS } from '../src/stage3/adapters/index.mjs';

const facts=({tested=false,photo=false,steps=true}={})=>({product_format:'crochet-pattern-bundle',pattern_count:33,terminology:'US',
  integrity:{all_tested:tested,verification:{unverified:tested?0:33,tested:tested?33:0}},artwork:{hero:{photographic_evidence:photo}},
  deliverables:{step_by_step_instructions:steps}});
const reasons=(t,f=facts())=>crochetClaimProblems(t,f).map(x=>x.reason);

test('supported copy passes: digital crochet pattern, step-by-step instructions, honest negations',()=>{
  assert.deepEqual(reasons('Digital crochet pattern collection with 33 flower patterns. Step-by-step instructions in US terms. Printable PDF, instant download.'),[]);
  assert.deepEqual(reasons('These patterns have not been test-crocheted. No yarn or hook is included.'),[]);
});

test('approval for production is never "tested": tested / verified wording needs every pattern tested',()=>{
  assert.match(reasons('Tested crochet patterns for beginners.').join(),/not all tested/);
  assert.match(reasons('Every pattern is verified.').join(),/not all tested/);
  assert.deepEqual(reasons('Every pattern was test-crocheted.',facts({tested:true})),[]);
});

test('never: professionally tested, tester-approved, guaranteed, error-free (even when tested)',()=>{
  for(const t of ['Professionally tested patterns.','Pattern tester approved!','Guaranteed results.','Error-free instructions.','A foolproof pattern.'])
    assert.ok(crochetClaimProblems(t,facts({tested:true})).length,t);
});

test('artwork is an illustration, never photographic evidence of an item crocheted from the patterns',()=>{
  for(const t of ['Real photo of the finished bouquet.','Photo of the finished roses made from these patterns.','Pictured: the flowers crocheted from this pattern.'])
    assert.match(reasons(t).join(),/illustration, not a photograph/,t);
  assert.deepEqual(reasons('Real photo of the finished bouquet.',facts({photo:true})),[]);
  assert.equal(imageProvenance(facts()),'illustration (approved Stage 1 artwork)');
  assert.equal(imageProvenance(facts(),{aiEnvironment:true}),'styled preview (AI environment with the approved illustration)');
});

test('deliverable claims must be supported: step-by-step, video, yarn or kit',()=>{
  assert.match(reasons('Step-by-step instructions.',facts({steps:false})).join(),/step-by-step/);
  assert.match(reasons('Video tutorial included.').join(),/no video/);
  assert.match(reasons('Yarn and hook included.').join(),/no yarn, hook or kit/);
});

test('model rules state the truth; the crochet marketing adapter is registered (ADR-041)',()=>{
  const r=crochetModelRules(facts()).join('\n');
  assert.match(r,/NOT tested: never say tested/);assert.match(r,/rendered visualisations and design previews, never photographs/);
  assert.match(crochetModelRules(facts({tested:true})).join('\n'),/may say the patterns were test-crocheted/);
  assert.ok('crochet-pattern-bundle' in STAGE3_ADAPTERS);
});

test('ADR-046 claim safety: "Rendered example of the finished crochet design." passes; photographed / sample / exact-result wording fails',()=>{
  assert.deepEqual(reasons('Rendered example of the finished crochet design.'),[]);
  assert.deepEqual(reasons('This is not a photographed item. The finished piece is about 7 cm across.'),[]);
  assert.match(reasons('Photographed finished bouquet.').join(),/rendered examples of the finished crochet design, not photographs/);
  assert.match(reasons('A finished sample of the rose.').join(),/no finished or tested sample exists/);
  assert.match(reasons('Your rose will look exactly as pictured.').join(),/no image shows an exact result/);
  assert.match(reasons('The exact photographed result of the pattern.').join(),/exact result|not photographs/);
  // Only real photographic evidence of physically made pieces lifts these.
  assert.deepEqual(reasons('Photographed by the maker.',facts({tested:true,photo:true})),[]);
  assert.match(crochetModelRules(facts()).join('\n'),/Describe a product image only as "Rendered example of the finished crochet design\."/);
});
