// A production handoff superseded by a NEWER owner pattern approval is refreshed from that approval (ADR-053);
// every other change to approved content is still refused. Fixtures only; no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, CROCHET_PAGES } from './fixtures.mjs';
import { writeHandoff, buildProduction, runQc, rebindVisualSpecs, HandoffError } from '../src/index.mjs';
import { hash } from '../src/lib.mjs';

const crochet=()=>approvedProduct({format:'crochet-pattern-bundle',pages:CROCHET_PAGES});
const exists=p=>access(p).then(()=>true,()=>false);
const specsPath=f=>join(f.dir,'creative','visual-specs.json');
// Edit the approved source on disk (as an owner fixing a typo would).
async function edit(f,fn){
  const src=join(f.dir,'crochet','patterns.json'), b=JSON.parse(await readFile(src,'utf8'));
  fn(b);await writeFile(src,JSON.stringify(b,null,2)+'\n');
  const bytes=await readFile(src);return {bundle:JSON.parse(bytes),sha:hash(bytes)};
}
// What Stage 1 records on ✅ Approve Patterns for the edited source, with the free visual-spec rebind.
async function reapprove(f,{bundle,sha},{rebind=true}={}){
  const from=f.product.crochet.approval.source_sha256;
  f.product.crochet={...f.product.crochet,approval:{...f.product.crochet.approval,source_sha256:sha,approved_at:'2026-10-02T20:00:00.000Z'},
    approval_history:[{approved_at:f.product.crochet.approval.approved_at,by:'@owner',source_sha256:from,superseded_at:'2026-10-02T19:59:00.000Z',superseded_by:'@owner',reason:'edited'}]};
  if(rebind){
    const r=rebindVisualSpecs(JSON.parse(await readFile(specsPath(f),'utf8')),{bundle,fromSha:from,toSha:sha,at:'2026-10-02T20:00:00.000Z',by:'@owner'});
    assert.equal(r.ok,true,r.reasons.join('; '));await writeFile(specsPath(f),JSON.stringify(r.doc,null,2)+'\n');
  }
}
const TEXT_FIX=b=>{b.patterns[0].finishing[0]='Fasten off, then weave in all ends.';};

test('approved patterns edited -> re-approved -> visuals re-bound -> the stale handoff is refreshed (old one archived) -> production succeeds',async()=>{
  const f=await crochet();
  try{
    const first=await writeHandoff(f.product,f.dir);
    const oldSha=f.product.crochet.approval.source_sha256;
    assert.equal(first.handoff.crochet.source.sha256,oldSha);
    const edited=await edit(f,TEXT_FIX);
    assert.notEqual(edited.sha,oldSha,'the checksum changes');
    await reapprove(f,edited);
    const w=await writeHandoff(f.product,f.dir);
    assert.equal(w.created,true);assert.equal(w.archived,'production/handoff.v01.json');
    assert.ok(await exists(join(f.dir,'production','handoff.v01.json')),'audit: the old handoff is kept');
    // One authoritative checksum: approval = patterns.json = handoff source = visual specs.
    assert.equal(w.handoff.crochet.source.sha256,edited.sha);assert.equal(f.product.crochet.approval.source_sha256,edited.sha);
    assert.equal(w.handoff.crochet.visuals.patterns_sha256,edited.sha);
    assert.deepEqual(w.handoff.content_sources[0],{file:'crochet/patterns.json',sha256:edited.sha});
    // Reused from then on, and the build + QC run on it.
    const again=await writeHandoff({...f.product,status:'PRODUCTION_READY'},f.dir);
    assert.equal(again.created,false);assert.equal(again.sha256,w.sha256);
    await buildProduction({productDir:f.dir,handoff:w.handoff,handoffSha:w.sha256});
    assert.equal((await runQc({productDir:f.dir,handoff:w.handoff})).passed,true);
  }finally{await f.cleanup();}
});

test('a retry (PRODUCTION_READY) after re-approval also refreshes the superseded handoff',async()=>{
  const f=await crochet();
  try{
    await writeHandoff(f.product,f.dir);
    const edited=await edit(f,TEXT_FIX);await reapprove(f,edited);
    const w=await writeHandoff({...f.product,status:'PRODUCTION_READY'},f.dir);
    assert.equal(w.created,true);assert.equal(w.handoff.crochet.source.sha256,edited.sha);
  }finally{await f.cleanup();}
});

test('still protected: an edit WITHOUT re-approval is refused at every state',async()=>{
  const f=await crochet();
  try{
    await writeHandoff(f.product,f.dir);
    await edit(f,TEXT_FIX);
    for(const status of ['CREATIVE_APPROVED','PRODUCTION_READY'])
      await assert.rejects(writeHandoff({...f.product,status},f.dir),e=>e instanceof HandoffError&&/Approved content changed since handoff: crochet\/patterns\.json/.test(e.message),status);
  }finally{await f.cleanup();}
});

test('still protected: a forged approval checksum (not the file on disk) is refused',async()=>{
  const f=await crochet();
  try{
    await writeHandoff(f.product,f.dir);
    f.product.crochet.approval={...f.product.crochet.approval,source_sha256:'f'.repeat(64)};
    await assert.rejects(writeHandoff(f.product,f.dir),/crochet\/patterns\.json changed after APPROVE PATTERNS/);
  }finally{await f.cleanup();}
});

test('still protected: re-approval without a visual rebind (stale specs) and a fingerprint-changing edit both need a Restyle',async()=>{
  let f=await crochet();
  try{
    await writeHandoff(f.product,f.dir);
    await reapprove(f,await edit(f,TEXT_FIX),{rebind:false});
    await assert.rejects(writeHandoff(f.product,f.dir),/CROCHET_VISUALS_UNCHECKED.*stale: the visual specs were made for patterns/);
  }finally{await f.cleanup();}
  f=await crochet();
  try{
    await writeHandoff(f.product,f.dir);
    const changed=await edit(f,b=>{b.patterns[0].name='Fixture Rose';});
    const r=rebindVisualSpecs(JSON.parse(await readFile(specsPath(f),'utf8')),{bundle:changed.bundle,fromSha:f.product.crochet.approval.source_sha256,toSha:changed.sha,at:'x',by:'y'});
    assert.equal(r.ok,false);
    await reapprove(f,changed,{rebind:false});
    await assert.rejects(writeHandoff(f.product,f.dir),/CROCHET_VISUALS_UNCHECKED/);
  }finally{await f.cleanup();}
});

test('still protected: changed approved artwork is refused even when the patterns were re-approved',async()=>{
  const f=await crochet();
  try{
    const first=await writeHandoff(f.product,f.dir);
    await reapprove(f,await edit(f,TEXT_FIX));
    await writeFile(join(f.dir,first.handoff.assets[0].file),Buffer.from('not the approved artwork'));
    await assert.rejects(writeHandoff(f.product,f.dir),/Approved artwork changed since handoff/);
  }finally{await f.cleanup();}
});

test('non-crochet handoffs are unchanged: reused while producing, never "superseded"',async()=>{
  const f=await approvedProduct();
  try{
    const first=await writeHandoff(f.product,f.dir);
    assert.equal(first.handoff.crochet,undefined);
    const again=await writeHandoff({...f.product,status:'PRODUCTION_READY'},f.dir);
    assert.equal(again.created,false);assert.equal(again.sha256,first.sha256);
  }finally{await f.cleanup();}
});
