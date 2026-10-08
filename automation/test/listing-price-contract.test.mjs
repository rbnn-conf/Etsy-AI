// The GBP price contract (marketing/src/stage3/price.mjs) along its whole path: model-facing schema ->
// local schema check -> float-safe canonical number -> listing validation -> Stage 4 Etsy payload check.
// Fake model only: NO OpenAI call, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateListing } from '../src/stage3/openai.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';
import { loadSchema, strictSchema } from '../src/orchestrator/schema.mjs';
import { etsyProblems } from '../src/stage4/payload.mjs';
import { STAGE3_ADAPTERS, priceProblem, pence, canonicalPrice, PRICE_GBP, listingProblems, LISTING_LIMITS } from '../../marketing/src/stage3/index.mjs';
import { book } from '../../marketing/test/colouring-fixture.mjs';
import { LISTING } from './colouring-fixture.mjs';

async function facts(){const {facts:f}=await book('portrait',{season:'Christmas'});f.product_name='Winter Windows Colouring Book';f.claims=STAGE3_ADAPTERS['colouring-book'].claimIndex(f);return f;}
const fakeAi=data=>{const calls=[];return {calls,ai:{textModel:'fake',client:{async json(a){calls.push(a.schemaName);return {data:structuredClone(data),usage:{total_tokens:1},model:'fake'};}}}};};
const listingWith=price=>{const d=LISTING();d.suggested_price_gbp=price;return d;};
const CONSTRAINT_TEXT='£0.5-£100, 2 decimals';

test('contract: numeric prices pass, bounds 0.50 and 100.00 pass; below, above, sub-penny, strings, ranges and null fail',()=>{
  for(const p of [4.99,6.5,12,12.00,0.5,100,8.95,9.95,4.35,2.3,1.15])assert.equal(priceProblem(p),null,`${p} is a valid price`);
  assert.match(priceProblem(0.49),/got 0\.49; must be from £0\.50 to £100\.00/);
  assert.match(priceProblem(100.01),/got 100\.01; must be from £0\.50 to £100\.00/);
  assert.match(priceProblem(0),/must be from/);assert.match(priceProblem(-4.99),/must be from/);
  assert.match(priceProblem(7.495),/got 7\.495; must have at most 2 decimals/,'a third decimal is rejected, never rounded');
  for(const v of ['£4.99','4.99',CONSTRAINT_TEXT,'4.99-6.99','around £5','5',null,undefined,NaN,Infinity,{amount:4.99},[4.99]])
    assert.ok(priceProblem(v),`${JSON.stringify(v)} is not a price`);
  assert.match(priceProblem(CONSTRAINT_TEXT),/got "£0\.5-£100, 2 decimals" \(string\)/,'the message shows the value received, so it can never be mistaken for one');
  assert.deepEqual(PRICE_GBP,{min:0.5,max:100,decimals:2});
  assert.deepEqual([LISTING_LIMITS.priceMinGbp,LISTING_LIMITS.priceMaxGbp],[0.5,100]);
});

test('float safety: every 2-decimal price from 0.50 to 100.00 passes (the old p*100 check rejected 1,142 of them); every sub-penny value fails',()=>{
  const oldCheck=p=>Math.round(p*100)===p*100;
  let oldRejected=0;
  for(let c=50;c<=10000;c++){
    const p=Number((c/100).toFixed(2));
    assert.equal(priceProblem(p),null,`${p}`);assert.equal(pence(p),c);assert.equal(canonicalPrice(p),p);
    if(!oldCheck(p))oldRejected++;
    if(c<10000)assert.ok(priceProblem(p+0.005),`${p+0.005} has a sub-penny part`);
  }
  assert.equal(oldRejected,1142,'documents the defect this fixes');
  assert.equal(canonicalPrice(8.950000000000001),8.95,'float noise is cleaned');
  assert.equal(canonicalPrice(7.495),7.495,'a sub-penny value is never rounded into a price');
});

test('model-facing contract: suggested_price_gbp is a JSON number (never a string), with its bounds and "at most 2 decimals" stated',async()=>{
  const full=await loadSchema('listing'), f=full.properties.suggested_price_gbp, m=strictSchema(full).properties.suggested_price_gbp;
  assert.equal(f.type,'number');assert.equal(m.type,'number','strict structured output can only return a number here');
  assert.deepEqual([f.minimum,f.maximum],[0.5,100]);
  for(const re of [/Minimum value 0\.5\./,/Maximum value 100\./,/at most 2 decimals/,/Never a string: no £ sign, no range, no words/])assert.match(m.description,re);
});

test('generateListing: 8.95 and the bounds are accepted end to end; the stored price is a canonical number',async()=>{
  const f=await facts();
  for(const p of [8.95,0.5,100,4.99,12]){
    const r=await generateListing(fakeAi(listingWith(p)).ai,{facts:f});
    assert.equal(r.data.suggested_price_gbp,p);assert.equal(typeof r.data.suggested_price_gbp,'number');
  }
});

test('generateListing: a string, the constraint text, a range, null or an out-of-range/sub-penny number never reaches the listing',async()=>{
  const f=await facts();
  // Strings and null fail the schema check (the model output itself), before any listing rule runs.
  for(const v of ['£4.99',CONSTRAINT_TEXT,'4.99-6.99','around £5',null])
    await assert.rejects(generateListing(fakeAi(listingWith(v)).ai,{facts:f}),e=>e instanceof InvalidModelOutputError&&/listing: model output rejected: \$\.suggested_price_gbp: expected number/.test(e.message),JSON.stringify(v));
  await assert.rejects(generateListing(fakeAi(listingWith(0.49)).ai,{facts:f}),/suggested_price_gbp: below 0\.5/);
  await assert.rejects(generateListing(fakeAi(listingWith(100.5)).ai,{facts:f}),/suggested_price_gbp: above 100/);
  await assert.rejects(generateListing(fakeAi(listingWith(7.495)).ai,{facts:f}),e=>/listing: rejected: suggested_price_gbp: got 7\.495; must have at most 2 decimals/.test(e.message));
});

test('listingProblems is not weakened: the price rule still applies to an assembled listing',async()=>{
  const f=await facts(), base={...LISTING()};delete base.tag_candidates;
  const ok=listingProblems({...base,suggested_price_gbp:8.95},f).filter(x=>/price/.test(x));
  assert.deepEqual(ok,[]);
  assert.ok(listingProblems({...base,suggested_price_gbp:'4.99'},f).some(x=>/suggested_price_gbp: got "4\.99" \(string\)/.test(x)));
  assert.ok(listingProblems({...base,suggested_price_gbp:CONSTRAINT_TEXT},f).some(x=>x.startsWith('suggested_price_gbp: got "£0.5-£100, 2 decimals"')));
});

test('Stage 4 Etsy payload uses the same float-safe pence rule: 8.95 passes; strings, sub-penny and non-positive amounts fail',()=>{
  const l=price=>({title:'Winter Windows Colouring Book',tags:['colouring'],materials:[],description:'d',price:{amount:price},who_made:'i_did',when_made:'made_to_order',quantity:1,type:'download'});
  const priceErr=price=>etsyProblems(l(price)).filter(x=>/price/.test(x));
  for(const p of [8.95,9.95,4.35,0.01,4.99,12])assert.deepEqual(priceErr(p),[],`${p}`);
  for(const p of ['4.99','£4.99',7.495,0,-1,null])assert.equal(priceErr(p).length,1,`${JSON.stringify(p)}`);
});
