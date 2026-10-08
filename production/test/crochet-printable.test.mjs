// Printable characters (ADR-052): one shared check of the document fonts, used before approval (Stage 1)
// and again by Stage 2. Unicode the fonts print is fine; anything else is reported with its exact path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crochetBundle } from './crochet-fixture.mjs';
import { crochetPrintability, printableStrings, printabilityErrors, printableLocation, unprintableCharacters, codePoint } from '../src/index.mjs';
import { loadFonts } from '../src/crochet/design.mjs';

test('normal English crochet text passes; the bundle is never modified',async()=>{
  const b=crochetBundle(), copy=structuredClone(b);
  assert.deepEqual(await crochetPrintability(b),{ok:true,problems:[]});
  assert.deepEqual(b,copy);
});

test('supported punctuation and typography pass (not an ASCII-only rule)',async()=>{
  const b=crochetBundle();
  b.patterns[0].finishing=['Fasten off — weave in ends; it’s “about 5 cm” across… (rep 2×), ½ way, 25°, café, naïve, £3, €2, ©, •, ×, –'];
  assert.deepEqual((await crochetPrintability(b)).problems,[]);
});

test('Gujarati characters fail, with their code points',async()=>{
  const b=crochetBundle();b.patterns[1].finishing=['Fasten off. બંધ'];
  const r=await crochetPrintability(b);
  assert.equal(r.ok,false);
  assert.deepEqual(r.problems.map(x=>x.code),['U+0AAC','U+0A82','U+0AA7']);
  assert.equal(codePoint('બ'),'U+0AAC');
});

test('mixed English + one unsupported character: the exact path, location and code point',async()=>{
  const b=crochetBundle();b.patterns[1].instructions[0].steps[0].text='Ch 10, sc in the 2nd ch from the hook ધ and across.';
  const [x,...rest]=(await crochetPrintability(b)).problems;
  assert.deepEqual(rest,[]);
  assert.deepEqual(x,{path:'$.patterns[1].instructions[0].steps[0].text',location:'Pattern 2, Section 1, Step 1',char:'ધ',code:'U+0AA7'});
  assert.deepEqual(printabilityErrors([x]),['$.patterns[1].instructions[0].steps[0].text: "ધ" U+0AA7 cannot be printed by the document fonts (Pattern 2, Section 1, Step 1)']);
});

test('every printed field is checked, with readable locations',async()=>{
  const b=crochetBundle(), paths=printableStrings(b).map(x=>x.path);
  for(const p of ['$.title','$.patterns[0].name','$.patterns[0].finished_size','$.patterns[0].yarn[0].description','$.patterns[0].hook_size.us',
    '$.patterns[0].instructions[0].heading','$.patterns[0].instructions[0].steps[0].label','$.patterns[0].assembly[0]','$.patterns[1].finishing[0]'])assert.ok(paths.includes(p),p);
  assert.equal(printableLocation('$.patterns[21].finishing[3]'),'Pattern 22, Finishing 4');
  assert.equal(printableLocation('$.patterns[16].instructions[1].heading'),'Pattern 17, Section 2 heading');
  assert.equal(printableLocation('$.patterns[0].instructions[0].steps[3].label'),'Pattern 1, Section 1, Step 4 label');
  // Whitespace is never a printing problem.
  assert.deepEqual(unprintableCharacters({patterns:[{finishing:['a b\tc']}]},await loadFonts()),[]);
});
