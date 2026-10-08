// Contract every Stage 2 adapter must meet, so a new product format can be
// added without destabilising the existing ones. Fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedProduct, CROCHET_PAGES } from './fixtures.mjs';
import { ADAPTERS, adapterFor, createHandoff, HandoffError } from '../src/index.mjs';
import { ENCODING_LADDER } from '../src/build.mjs';

const FIXTURE_PAGES={
  'greeting-card':undefined,   // the fixture's default card (front, inside, back)
  'colouring-book':Array.from({length:4},(_,i)=>({page_type:i?'colouring':'cover',title:`P${i+1}`,prompt:'x',notes:''})),
  'crochet-pattern-bundle':CROCHET_PAGES};   // cover + illustration + motif; the approved pattern source is the fixture bundle

test('registry: greeting-card, colouring-book and crochet-pattern-bundle are registered; unknown formats fail with the available list',()=>{
  assert.deepEqual(Object.keys(ADAPTERS),['greeting-card','colouring-book','crochet-pattern-bundle']);
  assert.ok(Object.isFrozen(ADAPTERS));
  for(const f of ['planner','activity-book','']){
    assert.throws(()=>adapterFor(f),e=>e instanceof HandoffError&&e.retryable===false&&/available: greeting-card, colouring-book, crochet-pattern-bundle/.test(e.message));
  }
  assert.deepEqual(Object.keys(FIXTURE_PAGES),Object.keys(ADAPTERS),'every registered adapter has a contract fixture');
});

for(const [format,adapter] of Object.entries(ADAPTERS)){
  test(`contract: ${format} adapter shape, handoff and plan`,async()=>{
    assert.equal(adapter.format,format);assert.ok(Number.isInteger(adapter.version)&&adapter.version>0);
    for(const fn of ['manifest','reviewNotes','plan','qcChecks'])assert.equal(typeof adapter[fn],'function',`${format}.${fn}`);
    assert.ok(Object.isFrozen(adapter));
    const ladder=adapter.encodingLadder??ENCODING_LADDER;
    assert.ok(Array.isArray(ladder)&&ladder.length>0&&ladder.every(e=>JSON.stringify(e)!==undefined),'encodings are JSON (they are recorded)');
    const f=await approvedProduct({format,pages:FIXTURE_PAGES[format]});
    try{
      const h=await createHandoff(f.product,f.dir);
      assert.deepEqual(h.adapter,{format,version:adapter.version});
      assert.ok(Array.isArray(h.review_notes)&&h.review_notes.every(n=>typeof n==='string'));
      const artwork=new Map();for(const a of h.assets)artwork.set(a.id,await readFile(`${f.dir}/${a.file}`));
      const plan=await adapter.plan(h,{imageEncoding:ladder[0],artwork});
      assert.match(plan.packageName,/^LumiumX-[A-Za-z0-9-]+$/);
      assert.ok(plan.date instanceof Date&&!Number.isNaN(+plan.date));
      assert.ok(plan.outputs.length>0);
      const rels=plan.outputs.map(o=>o.rel);assert.equal(new Set(rels).size,rels.length,'unique output paths');
      for(const o of plan.outputs){
        assert.match(o.rel,/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/,o.rel);
        assert.ok(['pdf','guide','original','page-png'].includes(o.kind),o.kind);
        assert.ok(o.sources.every(id=>h.assets.some(a=>a.id===id)),`${o.rel}: sources are approved assets`);
        assert.equal(typeof o.build,'function');assert.ok(o.expect&&typeof o.expect==='object');
      }
      assert.ok(plan.outputs.some(o=>o.kind==='guide'),'every product ships a printing guide');
      assert.ok(plan.variants.every(v=>plan.outputs.some(o=>o.variant===v)),'declared variants all have outputs');
      assert.ok(plan.previews.every(p=>rels.includes(p.rel)&&p.page>=1),'previews render real outputs');
      if(adapter.stage3Metadata){const m=adapter.stage3Metadata(h,plan);assert.equal(m.product_format,format);assert.ok(JSON.stringify(m));}
    }finally{await f.cleanup();}
  });
}
