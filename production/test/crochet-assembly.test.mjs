// Assembly: a section is not a piece (ADR-051). Assembly is required when declared, or when the pattern
// clearly makes separate pieces; never merely because the instructions have several sections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crochetBundle } from './crochet-fixture.mjs';
import { validateCrochetBundle, detachedPieces, continuesWork } from '../src/index.mjs';

const errs=b=>validateCrochetBundle(b).errors;
const ASSEMBLY=/patterns\[1\]\.assembly: required/;
const sec=(heading,...texts)=>({heading,steps:texts.map((text,i)=>({label:`Row ${i+1}`,text,stitch_count:null}))});
// Pattern 1 of the fixture with these sections and no assembly.
function bundle(sections,assembly_required){
  const b=crochetBundle(), p=b.patterns[1];
  p.instructions=sections;delete p.assembly;
  if(assembly_required!==undefined)p.assembly_required=assembly_required;else delete p.assembly_required;
  p.stitches_used=['ch','sc','hdc','dc','sl st'];return b;
}
// Lavender Sprig (#016 pattern 17): a covered stem, then buds worked directly onto it.
const LAVENDER=[
  sec('Covered Stem','Using pliers, bend a tiny hook at each end of the 16 cm floral wire. Press each hook flat.',
    'With green yarn, make a slip knot around one hooked wire end. Work 50 sc around the wire. Fasten off, leaving a 10 cm tail.'),
  sec('Lavender Buds','Join lavender yarn with a sl st in the topmost green sc. On each of the next 3 green sc, make 1 bud: ch 3, work dc and hdc in the third ch from hook, sl st in the same green sc.',
    'On each of the next 5 green sc, make 2 buds.')];
const ONE_MOTIF=[sec('Centre','Make a MR, 6 sc in the ring, sl st to the first st.'),sec('Petals','Working in the back loops of the centre, (ch 3, 2 dc, ch 3, sl st) in each st around.'),
  sec('Edging','Continue with the same yarn: sl st in each st around. Fasten off.')];
const SEPARATE=[sec('Flower Head','Make a MR, 6 sc in the ring.'),sec('Leaf','With green yarn, ch 10. Sc in 2nd ch from hook and in each ch across.'),
  sec('Stem','With green yarn, ch 30. Sl st in 2nd ch from hook and in each ch across.')];

test('assembly_required false + several logical sections, no detached pieces: passes without assembly',()=>{
  assert.deepEqual(errs(bundle(ONE_MOTIF,false)).filter(e=>ASSEMBLY.test(e)),[]);
  assert.deepEqual(detachedPieces(ONE_MOTIF),[]);
});

test('Lavender Sprig: covered stem + buds worked directly onto it passes, declared false or not declared',()=>{
  assert.deepEqual(errs(bundle(LAVENDER,false)),[]);
  assert.deepEqual(errs(bundle(LAVENDER,undefined)),[],'the saved #016 draft has no assembly_required field');
  assert.equal(continuesWork(LAVENDER[1]),true);assert.deepEqual(detachedPieces(LAVENDER),[]);
});

test('assembly_required true + missing assembly still fails (even for one section)',()=>{
  has(bundle(LAVENDER,true),/assembly: required \(assembly_required is true\)/);
  has(bundle([LAVENDER[0]],true),/assembly: required \(assembly_required is true\)/);
});

test('detached pieces that must be joined + missing assembly still fail, even when declared false',()=>{
  has(bundle(SEPARATE,false),/assembly: required \(assembly_required is false, but separate pieces are made: "Flower Head", "Leaf", "Stem"\)/);
  has(bundle(SEPARATE,undefined),/assembly: required \(3 pieces are made\)/);
  // Two petals made separately and sewn together.
  const petals=[sec('Petal 1','Ch 6. Sc in 2nd ch from hook and in each ch across.'),sec('Petal 2','Ch 6. Sc in 2nd ch from hook and in each ch across.')];
  has(bundle(petals,false),/separate pieces are made: "Petal 1", "Petal 2"/);
  // "make N" sections are several pieces.
  const make=[sec('Centre','Make a MR, 6 sc in the ring.'),sec('Petals (make 6)','Working into the centre, ch 4.')];
  has(bundle(make,false),/separate pieces are made: "Centre", "Petals \(make 6\)"/);
  // "Make 6 sc in a MR" is a stitch count, not six pieces.
  assert.deepEqual(detachedPieces([sec('Head','Make 6 sc in a MR.'),sec('Top','Working in the back loops, sc around.')]),[]);
});

test('a single-piece pattern with several sections passes when not declared; one section never needs assembly',()=>{
  assert.deepEqual(errs(bundle(ONE_MOTIF,undefined)).filter(e=>ASSEMBLY.test(e)),[]);
  assert.deepEqual(errs(bundle([LAVENDER[0]],undefined)).filter(e=>ASSEMBLY.test(e)),[]);
  assert.deepEqual(errs(bundle([LAVENDER[0]],false)).filter(e=>ASSEMBLY.test(e)),[]);
});

test('existing patterns with assembly are unchanged; the fixture bundle stays valid',()=>{
  assert.deepEqual(errs(crochetBundle()),[]);
  const b=bundle(SEPARATE,true);b.patterns[1].assembly=['Sew the leaf and the head to the stem.'];
  assert.deepEqual(errs(b),[]);
  // The fixture's daisy (centre + petals, not declared) still needs its assembly.
  const d=crochetBundle();delete d.patterns[0].assembly;has(d,/patterns\[0\]\.assembly: required \(2 pieces are made\)/);
});

function has(b,re){const e=errs(b);assert.ok(e.some(x=>re.test(x)),`expected ${re} in:\n${e.join('\n')}`);}
