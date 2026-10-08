// Crochet pattern bundle (ADR-040): source-content validation, the declared
// deliverable model and its registration as the Stage 2 adapter (ADR-041).
// Fixtures only; nothing is rendered, no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crochetBundle } from './crochet-fixture.mjs';
import { CROCHET_FORMAT, validateCrochetBundle, assertCrochetBundle, isTested, crochetDeliverablePlan, CROCHET_DELIVERABLE_KINDS,
  ADAPTERS, adapterFor, HandoffError } from '../src/index.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const errs=b=>validateCrochetBundle(b).errors;
const has=(b,re)=>{const e=errs(b);assert.ok(e.some(x=>re.test(x)),`expected ${re} in:\n${e.join('\n')}`);};

test('valid bundle passes; assertCrochetBundle returns it unchanged',()=>{
  const b=crochetBundle(), copy=structuredClone(b);
  assert.deepEqual(errs(b),[]);
  assert.equal(assertCrochetBundle(b),b);
  assert.deepEqual(b,copy,'validation never repairs or fills the source');
  assert.equal(b.format,CROCHET_FORMAT);
});

test('instructions: missing, empty, placeholder and empty steps all fail',()=>{
  let b=crochetBundle();delete b.patterns[0].instructions;has(b,/patterns\[0\]\.instructions: required/);
  b=crochetBundle();b.patterns[0].instructions=[];has(b,/instructions: at least one section.*never writes instructions/);
  b=crochetBundle();b.patterns[1].instructions[0].steps=[];has(b,/patterns\[1\]\.instructions\[0\]\.steps: at least one step/);
  b=crochetBundle();b.patterns[1].instructions[0].steps[0].text='   ';has(b,/steps\[0\]\.text: must be a non-empty string/);
  for(const t of ['TODO','TBD: write rounds','[instructions for round 2]','...','Lorem ipsum dolor']){
    b=crochetBundle();b.patterns[1].instructions[0].steps[0].text=t;has(b,/placeholder text is not a crochet instruction/);
  }
  b=crochetBundle();b.patterns[0].finishing=[];has(b,/finishing: needs at least 1 item/);
});

test('materials: yarn, yarn weight, additional materials and hook size are required',()=>{
  let b=crochetBundle();b.patterns[0].yarn=[];has(b,/yarn: at least one yarn is required/);
  b=crochetBundle();b.patterns[0].yarn[0].description='';has(b,/yarn\[0\]\.description/);
  b=crochetBundle();delete b.patterns[0].yarn_weight;has(b,/yarn_weight: required/);
  b=crochetBundle();b.patterns[0].yarn_weight='worsted-ish';has(b,/yarn_weight: must be one of/);
  b=crochetBundle();b.patterns[0].additional_materials=[];has(b,/additional_materials: needs at least 1 item/);
  b=crochetBundle();delete b.patterns[0].hook_size;has(b,/hook_size: required/);
  b=crochetBundle();b.patterns[0].hook_size=null;has(b,/hook_size: required/);
  b=crochetBundle();b.patterns[0].hook_size={us:'D-3'};has(b,/hook_size\.mm: must be a number/);
  b=crochetBundle();b.patterns[0].hook_size={mm:0};has(b,/hook_size\.mm/);
  // Only an explicit no-hook pattern may omit it.
  b=crochetBundle();delete b.patterns[0].hook_size;b.patterns[0].requires_hook=false;assert.deepEqual(errs(b),[]);
});

test('terminology must be declared and consistent',()=>{
  let b=crochetBundle();delete b.terminology;has(b,/terminology: required/);
  b=crochetBundle();b.terminology='metric';has(b,/terminology: must be declared as US or UK/);
  // A US-only stitch in a UK bundle, and a UK-only stitch in a US bundle.
  b=crochetBundle();b.terminology='UK';has(b,/"sc" is US terminology; the bundle declares UK/);
  b=crochetBundle();b.patterns[1].abbreviations.htr='half treble';b.patterns[1].stitches_used.push('htr');has(b,/"htr" is UK terminology; the bundle declares US/);
});

test('abbreviations used in instructions or listed as stitches must be defined',()=>{
  let b=crochetBundle();delete b.abbreviations.mr;has(b,/patterns\[0\]: abbreviation "mr" is used in the instructions but not defined/);
  b=crochetBundle();delete b.patterns[1].abbreviations.hdc;has(b,/"hdc" is not defined/);
  b=crochetBundle();b.patterns[1].stitches_used.push('bobble');has(b,/stitches_used: "bobble" is not defined/);
  b=crochetBundle();b.patterns[0].abbreviations={ch:''};has(b,/abbreviations\.ch: the meaning must be a non-empty string/);
  // "sl st" is one abbreviation; defining it does not demand a separate "sl".
  b=crochetBundle();assert.ok(!errs(b).some(e=>/"sl"/.test(e)));
});

test('pattern identity is unique (id and name)',()=>{
  let b=crochetBundle();b.patterns[1].pattern_id=b.patterns[0].pattern_id;has(b,/patterns\[1\]\.pattern_id: duplicate of \$\.patterns\[0\]/);
  b=crochetBundle();b.patterns[1].name=' fixture  DAISY ';has(b,/patterns\[1\]\.name: duplicate/);
  b=crochetBundle();b.patterns[0].pattern_id='Daisy One';has(b,/pattern_id: must be a lowercase slug/);
});

test('pattern_count must match the supplied patterns',()=>{
  let b=crochetBundle();b.pattern_count=33;has(b,/pattern_count: 33 declared but 2 patterns are supplied/);
  b=crochetBundle();b.patterns.pop();has(b,/pattern_count: 2 declared but 1 pattern is supplied/);
  b=crochetBundle();b.pattern_count=0;has(b,/pattern_count: must be a positive integer/);
  b=crochetBundle();b.patterns=[];b.pattern_count=1;has(b,/patterns: at least one pattern/);
  assert.deepEqual(errs(crochetBundle({patterns:33})),[],'a 33-pattern bundle is valid when all 33 are supplied');
});

test('assembly is required when several pieces are made or it is declared',()=>{
  let b=crochetBundle();delete b.patterns[0].assembly;has(b,/patterns\[0\]\.assembly: required \(2 pieces are made\)/);
  b=crochetBundle();b.patterns[1].assembly_required=true;has(b,/patterns\[1\]\.assembly: required \(assembly_required is true\)/);
  b=crochetBundle();b.patterns[0].assembly=['TBD'];has(b,/assembly\[0\]: placeholder/);
});

test('tested is never claimed without explicit evidence',()=>{
  const b=crochetBundle();
  assert.ok(b.patterns.every(p=>!isTested(p)),'absent testing = not tested');
  let x=crochetBundle();x.patterns[0].testing={status:'tested'};has(x,/testing\.tested_by: required/);has(x,/testing\.tested_on/);has(x,/testing\.evidence/);
  x=crochetBundle();x.title='Tested Crochet Flower Patterns';has(x,/\$\.title: claims the patterns are tested/);
  x=crochetBundle();x.title='Tested Crochet Flower Patterns';
  for(const p of x.patterns)p.testing={status:'tested',tested_by:'Fixture tester',tested_on:'2026-09-01',evidence:'Made one of each in the stated yarn and hook.'};
  assert.deepEqual(errs(x),[]);assert.ok(x.patterns.every(isTested));
});

test('bundle fields: unknown fields, provenance, skill level, delivery and format',()=>{
  let b=crochetBundle();b.price=3;has(b,/\$\.price: unexpected field/);
  b=crochetBundle();b.patterns[0].photo='x.png';has(b,/patterns\[0\]\.photo: unexpected field/);
  b=crochetBundle();delete b.provenance;has(b,/provenance: required/);
  b=crochetBundle();b.provenance.author='';has(b,/provenance\.author/);
  b=crochetBundle();b.patterns[1].difficulty='experienced';has(b,/difficulty: experienced is outside the bundle's skill_level/);
  b=crochetBundle();b.delivery=['physical'];has(b,/delivery: a non-empty list of digital, printable/);
  b=crochetBundle();b.format='colouring-book';has(b,/format: must be "crochet-pattern-bundle"/);
  assert.deepEqual(validateCrochetBundle(null),{ok:false,errors:['$: the pattern bundle must be an object']});
});

test('assertCrochetBundle fails clearly with a non-retryable HandoffError listing every problem',()=>{
  const b=crochetBundle();b.pattern_count=5;delete b.patterns[0].hook_size;b.patterns[1].instructions=[];
  assert.throws(()=>assertCrochetBundle(b),e=>e instanceof HandoffError&&e.retryable===false&&/never invents crochet instructions/.test(e.message)
    &&e.errors.length===3&&/pattern_count/.test(e.message)&&/hook_size/.test(e.message)&&/instructions/.test(e.message));
});

test('deliverable plan: every requested deliverable, both papers, one PDF per pattern, safe unique names',()=>{
  const b=crochetBundle({patterns:33}), plan=crochetDeliverablePlan(b);
  assert.deepEqual([...plan.kinds].sort(),[...CROCHET_DELIVERABLE_KINDS].sort());
  assert.deepEqual(plan.papers,['A4','US-Letter']);
  const rels=plan.outputs.map(o=>o.rel);
  assert.equal(new Set(rels).size,rels.length,'unique output paths');
  for(const r of rels)assert.match(r,/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/,r);   // adapter-contract rule
  for(const paper of plan.papers){
    const each=plan.outputs.filter(o=>o.kind==='pattern-pdf'&&o.paper===paper);
    assert.deepEqual(each.map(o=>o.patterns[0]),b.patterns.map(p=>p.pattern_id));
    for(const k of ['bundle-pdf','pattern-index','materials-reference','abbreviations-reference'])assert.equal(plan.outputs.filter(o=>o.kind===k&&o.paper===paper).length,1,`${k} ${paper}`);
  }
  assert.equal(plan.outputs.filter(o=>o.kind==='guide').length,1);
  assert.ok(plan.zips.length>=1&&plan.zips.length<=5,'Etsy allows at most 5 files');
  assert.ok(rels.every(r=>plan.zips.some(z=>z.includes.includes(r))),'every output is delivered');
  assert.ok(plan.zips.every(z=>z.includes.every(r=>rels.includes(r))),'ZIPs hold planned outputs only');
  assert.ok(plan.previews.every(p=>rels.includes(p.rel)&&p.page>=1),'previews render real outputs');
  // An incomplete bundle has no plan.
  const bad=crochetBundle();bad.pattern_count=3;
  assert.throws(()=>crochetDeliverablePlan(bad),HandoffError);
});

test('registered Stage 2 adapter (ADR-041): content gate on the approved pattern source',()=>{
  assert.ok(CROCHET_FORMAT in ADAPTERS);
  const a=adapterFor(CROCHET_FORMAT);
  assert.equal(a.content,'crochet-patterns');assert.equal(a.format,CROCHET_FORMAT);assert.ok(Object.isFrozen(a));
});

test('boundaries: crochet and adapter modules make no model, network or Etsy call and never import automation',async()=>{
  // Every module under src/crochet (sub-folders such as moonlit/ included) and the adapter.
  const crochetDir=join(root,'src','crochet');
  const files=[...(await readdir(crochetDir,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()&&e.name.endsWith('.mjs')).map(e=>join(e.parentPath,e.name)),
    join(root,'src','adapters','crochet-pattern-bundle.mjs')];
  // An import resolves inside src/crochet, or to the shared errors/lib modules, or is node:fs/promises / node:path.
  const allowed=s=>path=>{if(['node:fs/promises','node:path'].includes(s))return true;if(!s.startsWith('.'))return false;
    const at=resolve(dirname(path),s);return at.startsWith(crochetDir+sep)||[join(root,'src','errors.mjs'),join(root,'src','lib.mjs')].includes(at);};
  for(const path of files){
    const text=await readFile(path,'utf8'), f=relative(join(root,'src'),path);
    const specs=[...text.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
    for(const s of specs)assert.ok(allowed(s)(path),`${f} imports ${s}`);
    assert.ok(!/\bfetch\(|openai|anthropic|etsy|automation\//i.test(text.replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'')),`${f} mentions a model, network, Etsy or automation`);
  }
});
