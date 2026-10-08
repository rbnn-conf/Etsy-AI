// Placeholder detection vs crochet bracket notation, and defined multi-word abbreviations (ADR-050).
// Square brackets group a repeated or worked-together stitch sequence; editorial brackets stay rejected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crochetBundle } from './crochet-fixture.mjs';
import { validateCrochetBundle, isPlaceholderText, usedAbbreviations } from '../src/index.mjs';

const errs=b=>validateCrochetBundle(b).errors;
const withStep=(text,edit=()=>{})=>{const b=crochetBundle();b.patterns[1].abbreviations={...b.patterns[1].abbreviations,inc:'increase',puff:'puff stitch',sk:'skip',sp:'space'};
  b.patterns[1].instructions[0].steps[0].text=text;edit(b.patterns[1]);return b;};
const PLACEHOLDER=/placeholder text is not a crochet instruction/;

test('crochet repeats and stitch groups in square brackets are instructions, not placeholders',()=>{
  for(const t of ['[Sc in next st, inc in next st] rep 6 times.','[Sc in next 2 st, inc in next st] rep 6 times.',
    '[Puff in next st, sc in next st] rep 12 times. Fasten off.','[Dc, ch 1, dc] in next ch-sp.','[Sk next st, 5 dc in next st] rep around.',
    'Ch 1, which does not count as a st. [Sk next st, 5 dc in next st, sk next st, sc in next st] 6 times.',
    '[Ch 5, sl st in second ch from hook, sc in next 3 ch, sl st in next sc] 9 times.','Ch 1 and turn. Rep [sc, hdc, 2 dc, hdc] 4 times across.',
    '[2dc in next st] twice.']){
    assert.deepEqual(errs(withStep(t)),[],t);
  }
});

test('nested crochet brackets pass; a nested editorial bracket fails',()=>{
  assert.deepEqual(errs(withStep('[Sc in next st, [2 sc in next st] twice] rep 3 times.')),[]);
  assert.deepEqual(errs(withStep('[Sc in next st, (sc, ch 2, sc) in next st] rep 3 times.')),[]);
  assert.ok(errs(withStep('[Sc in next st, [add stitch count]] rep 3 times.')).some(e=>PLACEHOLDER.test(e)));
});

test('editorial and template brackets are still placeholders',()=>{
  for(const t of ['[insert instructions here]','[repeat as needed]','[add stitch count]','[TBD]','[TODO]','[pattern text]','[description]',
    'Rnd 2: [instructions for round 2]','[insert sc count here]','Work [round 3 goes here].']){
    assert.ok(errs(withStep(t)).some(e=>PLACEHOLDER.test(e)),t);
  }
});

test('non-bracket placeholder detection is unchanged (also in headings, assembly and finishing)',()=>{
  for(const t of ['TODO','TBD: write rounds','...','Lorem ipsum dolor','xxx','fill me in','Instructions go here'])
    assert.ok(errs(withStep(t)).some(e=>PLACEHOLDER.test(e)),t);
  let b=crochetBundle();b.patterns[0].instructions[0].heading='[Section name]';assert.ok(errs(b).some(e=>/heading: placeholder/.test(e)));
  b=crochetBundle();b.patterns[0].assembly=['[assembly instructions]'];assert.ok(errs(b).some(e=>/assembly\[0\]: placeholder/.test(e)));
  b=crochetBundle();b.patterns[0].finishing=['[Sl st in next st] twice, then fasten off.'];assert.deepEqual(errs(b),[],'a crochet bracket in finishing is fine');
  // The exported check, without a pattern's own glossary.
  assert.equal(isPlaceholderText('[Sc in next st, inc in next st] rep 6 times'),false);
  assert.equal(isPlaceholderText('[TODO]'),true);assert.equal(isPlaceholderText('No brackets at all.'),false);
  assert.equal(isPlaceholderText('[Puff in next st] 3 times',new Set(['ch'])),true,'"puff" is crochet only when defined');
});

test('a defined multi-word abbreviation ("hdc dec") is one abbreviation: "dec" inside it is not an undefined use',()=>{
  const b=withStep('Ch 2, hdc dec over first 2 sts, hdc in next st, hdc dec over last 2 sts.',p=>{p.abbreviations['hdc dec']='half double crochet decrease';});
  assert.deepEqual(errs(b),[]);
  assert.deepEqual(usedAbbreviations(['Ch 2, hdc dec over first 2 sts.'],['hdc dec']),['ch','sts']);
  assert.deepEqual(usedAbbreviations(['Ch 2, hdc dec over first 2 sts, dec.'],['hdc dec']),['ch','sts','dec'],'a separate "dec" still counts');
  // A bare dec with no definition still fails.
  assert.ok(errs(withStep('Ch 2, dec over first 2 sts.')).some(e=>/abbreviation "dec" is used in the instructions but not defined/.test(e)));
  // The terminology check still sees words inside a compound.
  const uk=withStep('Ch 2, hdc dec over first 2 sts.',p=>{p.abbreviations['hdc dec']='half double crochet decrease';});uk.terminology='UK';
  assert.ok(errs(uk).some(e=>/"hdc" is US terminology/.test(e)));
});
