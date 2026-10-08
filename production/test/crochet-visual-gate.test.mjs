// Stage 2 crochet visual gate (ADR-047) and the Stage 3 visual facts it hands on. No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, CROCHET_PAGES, approveVisuals } from './fixtures.mjs';
import { createHandoff, HandoffError, crochetProductionReadiness, rebindVisualSpecs, VISUALS_UNCHECKED } from '../src/index.mjs';
import { crochetVisualFacts } from '../src/adapters/crochet-pattern-bundle.mjs';
import { hash } from '../src/lib.mjs';

const crochet=()=>approvedProduct({format:'crochet-pattern-bundle',pages:CROCHET_PAGES});
const specsPath=f=>join(f.dir,'creative','visual-specs.json');
const editSpecs=async(f,fn)=>{const d=JSON.parse(await readFile(specsPath(f),'utf8'));fn(d);await writeFile(specsPath(f),JSON.stringify(d,null,2));};
const blocked=async(f,why)=>{
  await assert.rejects(createHandoff(f.product,f.dir),e=>e instanceof HandoffError&&e.code===VISUALS_UNCHECKED&&e.reasons.some(r=>why.test(r))&&/^CROCHET_VISUALS_UNCHECKED: /.test(e.message));
  const r=await crochetProductionReadiness(f.product,f.dir);assert.equal(r.ok,false);assert.ok(r.reasons.some(x=>why.test(x)),r.reasons.join('; '));
};

test('internally_checked visuals for the approved patterns: production allowed; the checked visuals travel in the handoff',async()=>{
  const f=await crochet();
  try{
    assert.equal((await crochetProductionReadiness(f.product,f.dir)).ok,true);
    const h=await createHandoff(f.product,f.dir);
    assert.equal(h.crochet.visuals.visual_match_status,'internally_checked');
    assert.equal(h.crochet.visuals.patterns_sha256,f.product.crochet.approval.source_sha256);
    assert.deepEqual(h.content_sources.map(c=>c.file),['crochet/patterns.json','creative/visual-specs.json']);
    assert.equal(h.content_sources[1].sha256,hash(await readFile(specsPath(f))));
  }finally{await f.cleanup();}
});

test('no visual-specs.json: blocked before production',async()=>{
  const f=await crochet();
  try{await rm(specsPath(f));await blocked(f,/visual-specs\.json is missing/);}finally{await f.cleanup();}
});

test('stale pattern checksum: blocked',async()=>{
  const f=await crochet();
  try{await editSpecs(f,d=>{d.patterns_sha256='0'.repeat(64);});await blocked(f,/^stale: the visual specs were made for patterns 000000000000…/);}finally{await f.cleanup();}
});

test('match status "derived" only: blocked (file status, or any required spec)',async()=>{
  const f=await crochet();
  try{
    await editSpecs(f,d=>{d.visual_match_status='derived';});await blocked(f,/visual_match_status is derived, not internally_checked/);
    await editSpecs(f,d=>{d.visual_match_status='internally_checked';d.specs.detail.status='derived';});await blocked(f,/the detail visual spec is derived/);
  }finally{await f.cleanup();}
});

test('a tampered spec, stale fingerprints, or proofs older than the Restyle are blocked (the checks are re-run, not trusted)',async()=>{
  const f=await crochet();
  try{
    // The daisy pattern makes no leaves (a known absence): a cover that adds two is caught.
    await editSpecs(f,d=>{d.specs.cover.items[0].features.leaves={present:true,count:2};});await blocked(f,/the cover visual spec fails the pattern check now: items\[0\] leaves/);
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisuals(f,b,f.product.crochet.approval.source_sha256);
    await editSpecs(f,d=>{d.fingerprints[Object.keys(d.fingerprints)[0]].petal_count=99;});await blocked(f,/recorded fingerprints differ/);
    await approveVisuals(f,b,f.product.crochet.approval.source_sha256);
    f.product.restyles[0].direction_version=3;await blocked(f,/approved style proofs predate the latest Restyle/);
    delete f.product.restyles;await blocked(f,/no Restyle record/);
  }finally{await f.cleanup();}
});

test('physically_verified is also allowed (never required), and is never inferred',async()=>{
  const f=await crochet();
  try{
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisuals(f,b,f.product.crochet.approval.source_sha256,{status:'physically_verified'});
    const h=await createHandoff(f.product,f.dir);
    assert.equal(h.crochet.visuals.visual_match_status,'physically_verified');
    assert.equal(crochetVisualFacts(h).physically_verified,true);
    // internally_checked never becomes verified on the way to Stage 3.
    await approveVisuals(f,b,f.product.crochet.approval.source_sha256);
    assert.equal(crochetVisualFacts(await createHandoff(f.product,f.dir)).physically_verified,false);
  }finally{await f.cleanup();}
});

test('Stage 3 facts: approved pattern facts with unknowns kept unknown; the pictured items are approved IDs and quantities',async()=>{
  const f=await crochet();
  try{
    const v=crochetVisualFacts(await createHandoff(f.product,f.dir));
    assert.equal(v.visual_match_status,'internally_checked');
    const daisy=v.pattern_facts.find(p=>p.pattern_id==='fixture-daisy');
    assert.deepEqual([daisy.flower_type,daisy.finished_width_cm,daisy.yarn_weight,daisy.hook_mm,daisy.leaves,daisy.stem],['daisy',5,'3-light',3,'none','none']);
    assert.equal(daisy.petal_count,null,'implied only by stitch arithmetic: unknown, never guessed');
    assert.equal(daisy.centre,'present, type not stated');
    assert.ok(daisy.unknown.includes('petal_count'));
    assert.deepEqual(v.pictured.items,[{pattern_id:'fixture-daisy',pattern_name:'Fixture Daisy',quantity:1}]);
  }finally{await f.cleanup();}
});

test('non-crochet production is unchanged: no visual specs needed, no crochet visuals in the handoff',async()=>{
  const f=await approvedProduct();
  try{
    const h=await createHandoff(f.product,f.dir);
    assert.equal(h.crochet,undefined);assert.equal(h.content_sources,undefined);
  }finally{await f.cleanup();}
});

// ADR-052: a corrected pattern source keeps its checked visuals only when the fingerprints are identical.
async function corrected(f,edit){
  const src=join(f.dir,'crochet','patterns.json'), b=JSON.parse(await readFile(src,'utf8'));
  edit(b);await writeFile(src,JSON.stringify(b,null,2)+'\n');
  const bytes=await readFile(src), from=f.product.crochet.approval.source_sha256, to=hash(bytes);
  f.product.crochet.approval={...f.product.crochet.approval,source_sha256:to};   // the owner's re-approval
  return {bundle:JSON.parse(bytes),from,to};
}
test('rebind: a text-only correction (identical fingerprints) re-binds the checked visuals, no new images; production allowed',async()=>{
  const f=await crochet();
  try{
    const {bundle,from,to}=await corrected(f,b=>{b.patterns[0].finishing[0]='Fasten off, then weave in all ends.';});
    await blocked(f,/^stale: the visual specs were made for patterns/);   // before the rebind
    const doc=JSON.parse(await readFile(specsPath(f),'utf8'));
    const r=rebindVisualSpecs(doc,{bundle,fromSha:from,toSha:to,at:'2026-10-02T20:00:00.000Z',by:'@owner'});
    assert.equal(r.ok,true,r.reasons.join('; '));
    assert.deepEqual([r.doc.fingerprints,r.doc.specs,r.doc.visual_match_status],[doc.fingerprints,doc.specs,doc.visual_match_status],'specs, fingerprints and status unchanged');
    assert.deepEqual(r.doc.rebinds,[{from,to,at:'2026-10-02T20:00:00.000Z',by:'@owner',reason:'pattern text corrected; fingerprints identical; no new images'}]);
    await writeFile(specsPath(f),JSON.stringify(r.doc,null,2));
    assert.equal((await crochetProductionReadiness(f.product,f.dir)).ok,true);
    assert.equal((await createHandoff(f.product,f.dir)).crochet.visuals.patterns_sha256,to);
  }finally{await f.cleanup();}
});
test('rebind refused when the fingerprints change (a different flower, count or piece): Restyle needed',async()=>{
  const f=await crochet();
  try{
    const {bundle,from,to}=await corrected(f,b=>{b.patterns[0].name='Fixture Rose';});
    const r=rebindVisualSpecs(JSON.parse(await readFile(specsPath(f),'utf8')),{bundle,fromSha:from,toSha:to,at:'2026-10-02T20:00:00.000Z',by:'@owner'});
    assert.equal(r.ok,false);assert.equal(r.doc,null);assert.match(r.reasons.join(),/fingerprints changed.*run Restyle/);
  }finally{await f.cleanup();}
});
test('rebind refused for specs of other patterns; a forged rebind chain is blocked by the gate',async()=>{
  const f=await crochet();
  try{
    const {bundle,to}=await corrected(f,b=>{b.patterns[0].finishing[0]='Fasten off, then weave in all ends.';});
    const doc=JSON.parse(await readFile(specsPath(f),'utf8'));
    assert.match(rebindVisualSpecs(doc,{bundle,fromSha:'1'.repeat(64),toSha:to,at:'x',by:'y'}).reasons.join(),/not made for the previously approved patterns/);
    await writeFile(specsPath(f),JSON.stringify({...doc,patterns_sha256:to,rebinds:[{from:'2'.repeat(64),to}]},null,2));
    await blocked(f,/stale: the latest Restyle was for different patterns/);
  }finally{await f.cleanup();}
});
