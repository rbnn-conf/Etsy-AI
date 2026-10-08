// Product #019 regression (unit level): Etsy-normalised text and the VERIFY_FAILED message.
// Pure functions only: no Etsy, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEtsyText, verifyRemote, verifyFailedMessage } from '../src/stage4/index.mjs';
import { draftMismatch, knownFailureText } from '../src/telegram/ui.mjs';

const DESC='Garden Ghost\'s Delivery & "friends" add a welcoming touch. 🌙';
const payload={listing:{title:'Moonlit Shed | Ghost\'s Garden',description:DESC,price:{amount:4.95,currency:'GBP'},taxonomy:{id:339},
  tags:['ghost\'s garden','halloween'],materials:['PDF'],who_made:'i_did',when_made:'2020_2026',quantity:999},
  images:[{rank:1}],files:[{name:'a.zip',bytes:10}],properties:{apply:[]}};
const draft={listing_id:1,shop_id:2}, uploads={images:[{rank:1,listing_image_id:11}],files:[{listing_file_id:21}]};
const enc=s=>s.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
const listing=(o={})=>({listingId:1,shopId:2,state:'draft',title:enc(payload.listing.title),description:enc(DESC),priceAmount:4.95,priceCurrencyCode:'GBP',
  listingType:'download',taxonomyId:339,tags:payload.listing.tags.map(enc),materials:['PDF'],whoMade:'i_did',whenMade:'2020_2026',quantity:999,shippingProfileId:null,...o});
const run=o=>verifyRemote({payload,draft,uploads,remote:{listing:listing(o),images:[{rank:1,listing_image_id:11}],files:[{listing_file_id:21,filename:'a.zip',size_bytes:10}],properties:[]}});
const failed=v=>v.checks.filter(c=>!c.ok).map(c=>c.field);

test('decodeEtsyText decodes character references once, and nothing else',()=>{
  assert.equal(decodeEtsyText('Ghost&#39;s'),'Ghost\'s');
  assert.equal(decodeEtsyText('a &amp; b &quot;c&quot; &lt;d&gt; &apos;e&#x27; &#127769;'),'a & b "c" <d> \'e\' 🌙');
  assert.equal(decodeEtsyText('&amp;#39;'),'&#39;','single pass: literal "&#39;" text is not decoded twice');
  assert.equal(decodeEtsyText('&nbsp; &bogus; &#0; &#xD800;'),'&nbsp; &bogus; &#0; &#xD800;','unknown or invalid references stay as they are');
  assert.equal(decodeEtsyText(undefined),undefined);
});

test('#019: Etsy-encoded title, description and tags are equivalent and pass',()=>{
  const v=run();assert.equal(v.passed,true,JSON.stringify(failed(v)));
});

test('#019: genuine differences still fail: changed word, missing apostrophe, a literal entity the owner never approved',()=>{
  assert.deepEqual(failed(run({description:enc(DESC).replace('Ghost','Goblin')})),['description']);
  assert.deepEqual(failed(run({description:enc(DESC).replace('&#39;','')})),['description']);
  assert.deepEqual(failed(run({description:enc(DESC).replace('&#39;','&amp;#39;')})),['description'],'"&#39;" as visible text is not an apostrophe');
  assert.deepEqual(failed(run({description:`${enc(DESC)} `})),['description'],'whitespace is not normalised');
  assert.deepEqual(failed(run({title:'Moonlit Shed | Ghosts Garden'})),['title']);
  assert.deepEqual(failed(run({tags:['ghosts garden','halloween']})),['tags']);
  assert.deepEqual(failed(run({taxonomyId:1234,quantity:1})),['taxonomy','quantity']);
});

test('VERIFY_FAILED always names every mismatching field, first line included, short and JSON-free',()=>{
  const v=run({description:'x',taxonomyId:1234,priceAmount:5});
  const m=verifyFailedMessage(v), [first,...rest]=m.split('\n');
  assert.equal(first,'The Etsy draft does not match the approved listing (description, price, taxonomy).');
  assert.equal(rest.length,3);assert.ok(rest.every(l=>l.startsWith('• ')&&l.length<300));
  assert.match(m,/• taxonomy: expected 339, Etsy has 1234/);assert.match(m,/• description: expected \d+ characters .*differs at character 1/);
  // Never empty, even when (impossibly) no failing check was recorded; long lists are capped.
  assert.match(verifyFailedMessage({checks:[]}),/\(unknown field.*\n• no failing check was recorded/);
  const many={checks:Array.from({length:9},(_,i)=>({field:`f${i}`,ok:false,expected:1,actual:2}))};
  assert.match(verifyFailedMessage(many),/• and 3 more$/);
});

test('Telegram: VERIFY_FAILED shows the mismatch list; the old empty message still says where the details are',()=>{
  const p=message=>({product_id:'019',status:'FAILED',resume_state:'ETSY_PREPARING',last_error:{step:'etsy',message,retryable:true}});
  const exact='Stage4Error: [VERIFY_FAILED] The Etsy draft does not match the approved listing:\n• description: expected 1914 characters (approved text), Etsy has 1918 characters, differs';
  assert.equal(knownFailureText(p(exact)),['⚠️ Product #019 Etsy draft verification failed','','Mismatch:',
    '• description: expected 1914 characters (approved text), Etsy has 1918 characters, differs','','Draft remains safe and unpublished.','Fix the cause before Retry.'].join('\n'));
  assert.deepEqual(draftMismatch('Stage4Error: [VERIFY_FAILED] The Etsy draft does not match the approved listing:\n'),['• details not recorded: see etsy/verification.json']);
  assert.deepEqual(draftMismatch('[VERIFY_FAILED] The Etsy draft does not match the approved listing (taxonomy).'),['• taxonomy']);
  assert.equal(draftMismatch('[VERIFY_FAILED] No Etsy draft to verify yet.'),null,'other VERIFY_FAILED errors keep their own text');
  assert.equal(draftMismatch('[NETWORK_ERROR] timeout'),null);
});
