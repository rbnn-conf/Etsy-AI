// Size expressions vs quantity claims (the Product #015 "four by six card" rejection).
// A size in words or with "by" is a size only in a size context; counts stay checked. Pure; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimProblems } from '../src/stage3/index.mjs';
import { normaliseDimensions } from '../src/stage3/claims.mjs';

// One greeting-card design, printed as a 4x6 card (the #015 shape).
const card={product_format:'greeting-card',designs:[{id:'A',name:'Starlit Village Post',text:[]}],card_size_mm:{A4:[99,140]}};

test('size expressions in a size context pass (words, "by", hyphens, x, units)',()=>{
  for(const t of ['four by six card','four-by-six card','4 by 6 card','4-by-6 card','4x6 card','4 x 6 card','4x6 inch card','four by six inch cards',
    'printable 4-by-6-inch card','Fits a four by six frame','sized four by six','a card that measures 4 by 6','Print at four by six size.'])
    assert.deepEqual(claimProblems(t,card),[],t);
  assert.equal(normaliseDimensions('four by six card'),'4x6 card');
  assert.equal(normaliseDimensions('printable 4-by-6-inch card'),'printable 4x6-inch card');
});

test('quantity claims are still checked, including next to a size',()=>{
  for(const [t,hit] of [['four card designs','"four card"'],['four cards included','"four cards"'],['includes four cards','"four cards"'],
    ['4 card bundle','"4 card"'],['two card designs and four by six cards','"two card"']])
    assert.ok(claimProblems(t,card).some(p=>p.includes(hit)&&/production has 1 card design/.test(p)),`${t}: ${claimProblems(t,card)}`);
  assert.deepEqual(claimProblems('one card design',card),[]);
});

test('a size in words must still be a size production made',()=>{
  for(const t of ['five by seven card','a 5 by 7 print'])assert.ok(claimProblems(t,card).some(p=>/"5x7" \(size not produced\)/.test(p)),t);
});

test('without a size context nothing is rewritten ("one by one", a bare "four by six")',()=>{
  for(const t of ['Print them one by one.','Arrange them four by six on the table.'])assert.equal(normaliseDimensions(t),t);
});
