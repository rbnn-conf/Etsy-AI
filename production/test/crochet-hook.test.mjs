// Hook size text (regression: "1.5 mm (US US 8 steel)"). The approved US value
// is shown as written; "US" is added only when the value does not name it.
// One rule for the documents (classic and Moonlit), their QC and the review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crochetBundle } from './crochet-fixture.mjs';
import { hookText, hookOf, usHookLabel } from '../src/crochet/hook.mjs';
import { Flow } from '../src/crochet/layout.mjs';
import { loadFonts, PAPERS } from '../src/crochet/design.mjs';
import * as T from '../src/crochet/templates.mjs';
import { sourceTextProblems } from '../src/crochet/text-qc.mjs';
import { layoutMoonlit, moonlitLayoutProblems } from '../src/crochet/moonlit/index.mjs';

test('hook text: the approved US value is never prefixed twice',()=>{
  assert.equal(hookText({mm:1.5,us:'US 8 steel'}),'1.5 mm (US 8 steel)');
  assert.equal(hookText({mm:2.5,us:'B-1'}),'2.5 mm (US B-1)');
  assert.equal(hookText({mm:2.5,us:'B/1'}),'2.5 mm (US B/1)');
  assert.equal(hookText({mm:3,us:'us D-3'}),'3 mm (us D-3)','an existing prefix is kept exactly as approved');
  assert.equal(hookText({mm:1.5,us:'US8'}),'1.5 mm (US8)');
  assert.equal(hookText({mm:4,us:'USA G'}),'4 mm (US USA G)','only the word US counts as a prefix');
  assert.equal(hookText({mm:4,us:null}),'4 mm');
  assert.equal(usHookLabel('7 steel'),'US 7 steel');
  assert.equal(hookOf({requires_hook:false}),'No hook needed');
});

const steelBundle=()=>{const b=crochetBundle({patterns:2});b.patterns[0].hook_size={mm:1.5,us:'US 8 steel'};return b;};
const text=f=>f.pages.flatMap(p=>p.ops).filter(o=>o.t==='text').map(o=>o.text).join(' ');

test('classic documents: the materials panel reads "(US 8 steel)" and the materials QC accepts it',async()=>{
  const b=steelBundle(), fonts=await loadFonts();
  const f=new Flow({paper:PAPERS.A4,fonts,running:{left:b.title}});
  T.pattern(f,{bundle:b,slots:{patterns:{},diagrams:{}},width:()=>0},b.patterns[0],1);
  assert.match(text(f),/1\.5 mm \(US 8 steel\)/);assert.doesNotMatch(text(f),/US US/);
  assert.deepEqual(sourceTextProblems(f,b.patterns[0]),[]);
  // The QC still catches a hook value that is not what the source says.
  const bad=structuredClone(b);bad.patterns[0].hook_size.us='US 9 steel';
  assert.ok(sourceTextProblems(f,bad.patterns[0]).some(e=>/hook_size/.test(e)));
});

test('Moonlit documents: every page that prints hooks reads "(US 8 steel)", never "US US"',async()=>{
  const b=steelBundle(), {docs}=await layoutMoonlit(b,{paper:'A4'});
  assert.deepEqual(moonlitLayoutProblems(docs,b),[]);
  for(const f of [docs.bundle,docs.materials,docs.patterns.get(b.patterns[0].pattern_id)]){assert.match(text(f),/US 8 steel/);assert.doesNotMatch(text(f),/US US/);}
});
