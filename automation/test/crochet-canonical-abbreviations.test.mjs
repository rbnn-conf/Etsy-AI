// A STANDARD abbreviation an AI draft uses but forgot to define gets its fixed meaning when the candidate
// source is assembled (ADR-050). Pattern-defined or unknown abbreviations are never invented: they still fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeCanonicalAbbreviations, assembleBundle, validateCandidate } from '../src/orchestrator/crochet.mjs';

const draft=(text,abbreviations={ch:'chain',sc:'single crochet',st:'stitch',sts:'stitches',rnd:'round',rep:'repeat',mr:'magic ring','sl st':'slip stitch'})=>({
  pattern_id:'bud',name:'Bud',category:'flower',difficulty:'beginner',finished_size:'About 4 cm',yarn:[{description:'Cotton',colour:'pink',amount:'About 5 m'}],
  yarn_weight:'3-light',hook_size:{mm:3.5,us:'E-4'},additional_materials:['Tapestry needle'],stitches_used:['ch','sc'],abbreviations,gauge:'Not critical.',
  instructions:[{heading:'Bud',steps:[{label:'Rnd 1',text:'Make a MR, 6 sc in the ring, sl st to the first st.',stitch_count:6},{label:'Rnd 2',text,stitch_count:null}]}],
  finishing:['Fasten off and weave in the ends.'],origin:'ai-assisted-draft',verification_status:'unverified'});
const bundleOf=(drafts,terminology='US')=>assembleBundle({product:{name:'Fixture'},brief:{pattern_count:drafts.length,terminology},
  plan:{theme:'flowers',audience:['adults'],style:['botanical'],patterns:[{difficulty:'beginner'}]},drafts,model:'fake'});
const undefinedUse=(b,w)=>validateCandidate(b).errors.some(e=>e.includes(`abbreviation "${w}" is used in the instructions but not defined`));

test('a missing canonical "dec" is defined as "decrease"; the instructions are untouched',()=>{
  const d=draft('Ch 1, [sc in next st, dec] rep 3 times.'), copy=structuredClone(d);
  assert.ok(undefinedUse({...bundleOf([d]),patterns:[d]},'dec'),'the raw draft fails');
  const r=completeCanonicalAbbreviations(d,'US');
  assert.deepEqual(r.added,[{abbr:'dec',meaning:'decrease'}]);
  assert.equal(r.pattern.abbreviations.dec,'decrease');
  assert.deepEqual(r.pattern.instructions,d.instructions);assert.deepEqual(d,copy,'the saved draft object is never mutated');
  assert.ok(validateCandidate(bundleOf([d])).ok,validateCandidate(bundleOf([d])).errors.join('\n'));
});

test('a missing canonical "inc" is defined as "increase" (US and UK alike)',()=>{
  assert.deepEqual(completeCanonicalAbbreviations(draft('Ch 1, inc in each st around.'),'US').added,[{abbr:'inc',meaning:'increase'}]);
  assert.deepEqual(completeCanonicalAbbreviations(draft('Ch 1, inc in each st around.'),'UK').added,[{abbr:'inc',meaning:'increase'}]);
  // Terminology decides: "sc" has a fixed US meaning but none in UK terms.
  const noSc=draft('Ch 1, sc in each st around.',{ch:'chain',st:'stitch',mr:'magic ring','sl st':'slip stitch'});
  assert.deepEqual(completeCanonicalAbbreviations(noSc,'US').added,[{abbr:'sc',meaning:'single crochet'}]);
  assert.deepEqual(completeCanonicalAbbreviations(noSc,'UK').added,[]);
});

test('an unknown or pattern-defined abbreviation is never invented: validation still fails',()=>{
  // fpdc is in the validator's vocabulary but has no canonical meaning here: it stays undefined.
  const d=draft('Ch 2, fpdc around each st.');
  assert.deepEqual(completeCanonicalAbbreviations(d,'US').added,[]);
  assert.ok(undefinedUse(bundleOf([d]),'fpdc'));
  // A custom stitch is never defined by code (puff, bobble, cluster ...).
  const p=draft('Ch 1, puff in each st around.');
  assert.deepEqual(completeCanonicalAbbreviations(p,'US').added,[]);
  assert.equal(bundleOf([p]).patterns[0].abbreviations.puff,undefined);
});

test('an already-complete abbreviation table is unchanged (same object); a defined compound needs nothing',()=>{
  const d=draft('Ch 1, sc in each st around.');
  const r=completeCanonicalAbbreviations(d,'US');
  assert.equal(r.pattern,d);assert.deepEqual(r.added,[]);
  assert.equal(bundleOf([d]).patterns[0],d,'assembly passes a complete draft through as the same object');
  // "hdc dec" is defined as one abbreviation: no separate dec is added.
  const c=draft('Ch 2, hdc dec over the first 2 sts.',{...draft('').abbreviations,'hdc dec':'half double crochet decrease'});
  assert.deepEqual(completeCanonicalAbbreviations(c,'US').added,[]);
  // "sts" counts as defined by "st" (the validator accepts either).
  const s=draft('Sc in next 2 sts.',{ch:'chain',sc:'single crochet',st:'stitch',mr:'magic ring','sl st':'slip stitch'});
  assert.deepEqual(completeCanonicalAbbreviations(s,'US').added,[]);
});
