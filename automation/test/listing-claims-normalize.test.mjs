// Listing generation: an over-long listing_claims item (supporting metadata) is dropped before validation,
// recorded, never truncated; everything else is validated exactly as before. Fake model: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateListing, dropOverLongClaims } from '../src/stage3/openai.mjs';
import { InvalidModelOutputError } from '../src/openai/client.mjs';
import { STAGE3_ADAPTERS } from '../../marketing/src/stage3/index.mjs';
import { book } from '../../marketing/test/colouring-fixture.mjs';
import { LISTING } from './colouring-fixture.mjs';

const LONG='Every single one of the nine detailed colouring pages comes as its own high resolution PNG file, ready for printing at home today';
async function facts(){const {facts:f}=await book('portrait',{season:'Christmas'});f.product_name='Winter Windows Colouring Book';f.claims=STAGE3_ADAPTERS['colouring-book'].claimIndex(f);return f;}
const fakeAi=data=>{const calls=[];return {calls,ai:{textModel:'fake',client:{async json(a){calls.push(a.schemaName);return {data:structuredClone(data),usage:{total_tokens:1},model:'fake'};}}}};};
const claims=()=>[{key:'page-count',text:'10 pages'},{key:'digital',text:'Digital download'}];

test('dropOverLongClaims: drops only over-long items, records each with its reason, never truncates, leaves valid data untouched',()=>{
  const lim={text:120,key:40};
  const data={title:'t',listing_claims:[...claims(),{key:'format',text:LONG},{key:'x'.repeat(41),text:'A4'}]};
  const r=dropOverLongClaims(data,lim);
  assert.deepEqual(r.data.listing_claims,claims(),'the valid claims survive, unchanged and in order');
  assert.deepEqual(r.changes.map(c=>[c.index,c.text,c.reason]),[[2,LONG,`dropped, not truncated: text is ${LONG.length} characters (limit 120)`],[3,'A4','dropped, not truncated: key is 41 characters (limit 40)']]);
  assert.ok(!JSON.stringify(r.data).includes(LONG.slice(0,60)),'no truncated fragment of the dropped claim remains');
  assert.equal(data.listing_claims.length,4,'the input is not mutated');
  const clean={title:'t',listing_claims:claims()}, same=dropOverLongClaims(clean,lim);
  assert.equal(same.data,clean);assert.deepEqual(same.changes,[]);
  assert.deepEqual(dropOverLongClaims({title:'t'},lim),{data:{title:'t'},changes:[]});
});

test('generateListing: one over-long claim is dropped and recorded; the listing is accepted; other claims survive',async()=>{
  const f=await facts(), d=LISTING();d.listing_claims=[...claims(),{key:'format',text:LONG}];
  const {ai,calls}=fakeAi(d), r=await generateListing(ai,{facts:f});
  assert.deepEqual(calls,['listing'],'one call');
  assert.deepEqual(r.data.listing_claims,claims());
  assert.equal(r.selection.dropped_claims.length,1);assert.equal(r.selection.dropped_claims[0].text,LONG);assert.match(r.selection.dropped_claims[0].reason,/not truncated/);
  assert.equal(r.data.title,d.title);assert.equal(r.data.description,d.description);
});

test('generateListing: several over-long claims do not sink the listing; a normal valid listing is unchanged (no drop record)',async()=>{
  const f=await facts(), d=LISTING();d.listing_claims=[{key:'format',text:LONG},...claims(),{key:'digital',text:`${LONG} again`},{key:'format',text:`${LONG}!`}];
  const r=await generateListing(fakeAi(d).ai,{facts:f});
  assert.deepEqual(r.data.listing_claims,claims());assert.equal(r.selection.dropped_claims.length,3);
  const ok=await generateListing(fakeAi(LISTING()).ai,{facts:f});
  assert.deepEqual(ok.data.listing_claims,LISTING().listing_claims);assert.equal(ok.selection.dropped_claims,undefined);
});

test('generateListing: everything else is validated exactly as before',async()=>{
  const f=await facts(), reject=async(mut,re)=>{const d=LISTING();mut(d);await assert.rejects(generateListing(fakeAi(d).ai,{facts:f}),e=>e instanceof InvalidModelOutputError&&re.test(e.message),re);};
  await reject(d=>{d.title='x'.repeat(200);},/listing/);                                             // title over its limit
  await reject(d=>{d.description='Includes 14 pages to colour.';},/14 pages/);                      // description claim checked against the facts
  await reject(d=>{delete d.hook;},/hook/);                                                          // required field
  await reject(d=>{d.listing_claims=[...claims(),{key:'not-a-fact',text:'Short'}];},/not-a-fact/);  // remaining claims still validated
  await reject(d=>{d.listing_claims=[{key:'format',text:LONG}];},/listing_claims/);                 // nothing valid left: still fails
});
