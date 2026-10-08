// Stage 4 category resolution (ADR-039): product override -> owner-approved
// mapping -> exact Etsy path -> TAXONOMY_UNRESOLVED. Never fuzzy. Etsy is the
// in-memory fake; OpenAI is a client that fails if called. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveTaxonomy, loadTaxonomyMap, TAXONOMY_MAP } from '../src/stage4/index.mjs';
import { FakeEtsy } from './etsy-fake.mjs';
import { msg, press, button } from './helpers.mjs';
import { productionApproved, snapshot } from './colouring-fixture.mjs';

const CANON='Books, Movies & Music > Books > Coloring Books';
const MALFORMED='Books Movies & Music > Books > Coloring Books';   // #014's approved Stage 3 text
/** Etsy's seller taxonomy shape (ids of the Books branch as Etsy reported 339 for #014). */
const NODES=[
  {id:1,name:'Paper & Party Supplies',parentId:undefined},{id:2,name:'Paper',parentId:1},{id:1296,name:'Greeting Cards',parentId:2},
  {id:320,name:'Books, Movies & Music',parentId:undefined},{id:321,name:'Books',parentId:320},{id:339,name:'Coloring Books',parentId:321},
  {id:66,name:'Art & Collectibles',parentId:undefined},{id:67,name:'Coloring Books',parentId:66}];

test('the committed mapping is valid and pins the canonical Coloring Books path to 339',()=>{
  assert.deepEqual(TAXONOMY_MAP.map(m=>[m.path,m.taxonomy_id]),[[CANON,339]]);
  assert.deepEqual(loadTaxonomyMap().map(m=>m.taxonomy_id),[339]);
});

test('priority: product override > owner-approved mapping > exact Etsy path > TAXONOMY_UNRESOLVED (never fuzzy)',()=>{
  // #014: the malformed approved path + etsy/settings.json taxonomy_id 339 -> 339, from the owner setting.
  const r014=resolveTaxonomy({categoryPath:MALFORMED,nodes:NODES,overrideId:339});
  assert.deepEqual([r014.id,r014.path],[339,CANON]);assert.match(r014.source,/^owner setting \(etsy\/settings\.json\)/);
  // The canonical path resolves to 339 through the mapping.
  const canon=resolveTaxonomy({categoryPath:CANON,nodes:NODES});
  assert.deepEqual([canon.id,canon.path],[339,CANON]);assert.match(canon.source,/^owner-approved mapping/);
  // Case and repeated spaces only; punctuation counts.
  assert.equal(resolveTaxonomy({categoryPath:'books,  movies & music > BOOKS > coloring books',nodes:NODES}).id,339);
  // The malformed path alone is NOT matched (no fuzzy matching); Etsy's candidates are listed.
  assert.throws(()=>resolveTaxonomy({categoryPath:MALFORMED,nodes:NODES}),
    e=>e.code==='TAXONOMY_UNRESOLVED'&&/not an exact Etsy seller-taxonomy path\. Candidates: 339: Books, Movies & Music > Books > Coloring Books \| 67: Art & Collectibles > Coloring Books/.test(e.message));
  // The product override beats the mapping.
  const ov=resolveTaxonomy({categoryPath:CANON,nodes:NODES,overrideId:67});
  assert.deepEqual([ov.id,ov.path],[67,'Art & Collectibles > Coloring Books']);
  // Unrelated categories: exact path resolution, exactly as before.
  const card=resolveTaxonomy({categoryPath:'Paper & Party Supplies > Paper > Greeting Cards',nodes:NODES});
  assert.deepEqual([card.id,card.source],[1296,'Etsy seller taxonomy: exact path match of the approved category']);
  // Unknown categories still stop.
  assert.throws(()=>resolveTaxonomy({categoryPath:'Toys & Games > Puzzles',nodes:NODES}),e=>e.code==='TAXONOMY_UNRESOLVED');
  // A mapping whose ID Etsy no longer has (or renamed) stops clearly instead of guessing.
  const renamed=NODES.map(n=>n.id===339?{...n,name:'Colouring & Activity Books'}:n);
  assert.throws(()=>resolveTaxonomy({categoryPath:CANON,nodes:renamed}),e=>e.code==='TAXONOMY_UNRESOLVED'&&/no longer matches Etsy: 339 is now "Books, Movies & Music > Books > Colouring & Activity Books"/.test(e.message));
  assert.throws(()=>resolveTaxonomy({categoryPath:CANON,nodes:NODES.filter(n=>n.id!==339)}),/339 is not in Etsy's seller taxonomy/);
  // An invalid override still stops (unchanged).
  assert.throws(()=>resolveTaxonomy({categoryPath:CANON,nodes:NODES,overrideId:999999}),/Owner taxonomy_id 999999 \(etsy\/settings\.json\) is not in Etsy's seller taxonomy/);
});

test('colouring book end to end: Stage 3 writes the canonical category, Stage 4 resolves it to 339 via the mapping; no OpenAI in Stage 4; Stage 2/3 unchanged; draft only',async()=>{
  const fake=new FakeEtsy({nodes:NODES});
  const stage4={config:{mode:'live',publishEnabled:false,shopId:fake.shopId,seller:{whoMade:'i_did',whenMade:'made_to_order',quantity:999}},liveClient:async()=>fake};
  const {h,ws}=await productionApproved({stage4});
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    const listing=JSON.parse(await readFile(join(ws,'marketing/listing.json')));
    assert.equal(listing.category_suggestion,CANON,'code sets the canonical category, not the model');
    const sel=JSON.parse(await readFile(join(ws,'marketing/tag-selection.json')));
    assert.deepEqual(sel.category,{model:'Craft Supplies & Tools > Colouring',final:CANON,source:'canonical colouring-book category (Stage 3 adapter)'});
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')))).outcome,'marketing_approved');
    const calls=h.calls.length;
    h.wf.ai={...h.wf.ai,client:{json:()=>{throw new Error('OpenAI called');},image:()=>{throw new Error('OpenAI called');},imageEdit:()=>{throw new Error('OpenAI called');}}};
    const before={production:await snapshot(join(ws,'production')),marketing:await snapshot(join(ws,'marketing')),book:await snapshot(join(ws,'book'))};
    const r=await h.wf.handleUpdate(msg('/etsy 001'));
    assert.equal(r.outcome,'awaiting_etsy_publish_approval',JSON.stringify((await h.store.load('001')).last_error));
    const payload=JSON.parse(await readFile(join(ws,'etsy/payload.json')));
    assert.deepEqual([payload.listing.taxonomy.id,payload.listing.taxonomy.path],[339,CANON]);
    assert.match(payload.listing.taxonomy.source,/^owner-approved mapping/);
    assert.equal([...fake.listings.values()][0].taxonomyId,339);
    assert.equal(h.calls.length,calls,'no OpenAI call');
    assert.equal(fake.count('activateListing'),0);assert.equal([...fake.listings.values()][0].state,'draft');
    assert.deepEqual({production:await snapshot(join(ws,'production')),marketing:await snapshot(join(ws,'marketing')),book:await snapshot(join(ws,'book'))},before);
  }finally{await h.cleanup();}
});

test('a product override (etsy/settings.json) wins over the mapping, and an unresolvable category stops before any Etsy write',async()=>{
  const fake=new FakeEtsy({nodes:NODES});
  const stage4={config:{mode:'live',publishEnabled:false,shopId:fake.shopId,seller:{whoMade:'i_did',whenMade:'made_to_order',quantity:999}},liveClient:async()=>fake};
  const {h,ws}=await productionApproved({stage4});
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')));
    await mkdir(join(ws,'etsy'),{recursive:true});await writeFile(join(ws,'etsy/settings.json'),JSON.stringify({taxonomy_id:67}));
    assert.equal((await h.wf.handleUpdate(msg('/etsy 001'))).outcome,'awaiting_etsy_publish_approval');
    assert.equal(JSON.parse(await readFile(join(ws,'etsy/payload.json'))).listing.taxonomy.id,67);
    assert.equal([...fake.listings.values()][0].taxonomyId,67);
  }finally{await h.cleanup();}
  // Etsy without the mapped node: TAXONOMY_UNRESOLVED, and no Etsy write at all.
  const fake2=new FakeEtsy({nodes:NODES.filter(n=>n.id!==339)});
  const {h:h2}=await productionApproved({stage4:{config:{...stage4.config,shopId:fake2.shopId},liveClient:async()=>fake2}});
  try{
    await h2.wf.handleUpdate(msg('/market 001'));
    await h2.wf.handleUpdate(press(button(h2.telegram,'APPROVE MARKETING')));
    assert.equal((await h2.wf.handleUpdate(msg('/etsy 001'))).outcome,'failed');
    assert.match((await h2.store.load('001')).last_error.message,/TAXONOMY_UNRESOLVED.*339 is not in Etsy's seller taxonomy/);
    assert.deepEqual(fake2.writes,[]);
  }finally{await h2.cleanup();}
});
