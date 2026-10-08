// Stage 4 multi-file delivery (ADR-038): ONE product -> several Etsy delivery
// files. The planner and the ZIP building/verification run for real (never
// mocked); Etsy is the in-memory fake, OpenAI is a client that fails if it is
// ever called. Reproduces Product #014: Stage 3 approved, Stage 4 stopped on a
// 60 MB customer ZIP; the free retry resumes at Stage 4 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { planDelivery, DeliveryPlanError, buildDelivery, verifyDeliverySet, DELIVERY_LIMITS, ETSY } from '../src/stage4/index.mjs';
import { zipDeterministic } from '../../production/src/lib.mjs';
import { unzip } from './stage4-support.mjs';
import { FakeEtsy } from './etsy-fake.mjs';
import { msg, press, button, lastKeyboard } from './helpers.mjs';
import { productionApproved, snapshot } from './colouring-fixture.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const PKG='LumiumX-Harvest-Market-Autumn-Colouring-Pages';
const SELLER={whoMade:'i_did',whenMade:'made_to_order',quantity:999};

/** Product #014's approved deliverables exactly as measured (paths, kinds, byte sizes, pages). */
const PNG_MB=[1.80,1.68,1.50,1.75,1.90,1.75,1.43,1.82,1.53,1.95,1.73,1.49];
const F014=[
  {rel:'START-HERE-Printing-Guide.pdf',kind:'guide',bytes:2345,pages:null},
  {rel:`A4/${PKG}-A4-Part-1-Pages-01-10.pdf`,kind:'pdf',bytes:16_870_844,pages:[1,2,3,4,5,6,7,8,9,10]},
  {rel:`A4/${PKG}-A4-Part-2-Pages-11-12.pdf`,kind:'pdf',bytes:3_209_763,pages:[11,12]},
  {rel:`US-Letter/${PKG}-US-Letter-Part-1-Pages-01-10.pdf`,kind:'pdf',bytes:16_870_875,pages:[1,2,3,4,5,6,7,8,9,10]},
  {rel:`US-Letter/${PKG}-US-Letter-Part-2-Pages-11-12.pdf`,kind:'pdf',bytes:3_209_794,pages:[11,12]},
  ...PNG_MB.map((mb,i)=>({rel:`Colouring-Pages-PNG/${PKG}-Page-${String(i+1).padStart(2,'0')}${i?'':'-Cover'}.png`,kind:'page-png',bytes:Math.round(mb*1e6),pages:[i+1]}))]
  .map(o=>({...o,sha256:sha(Buffer.from(o.rel))}));

// ------------------------------------------------------------ planner ---
test('planner: the 60 MB #014 package becomes 5 logical, customer-named ZIPs under the safe size; every file exactly once',()=>{
  assert.ok(F014.reduce((s,o)=>s+o.bytes,0)>60e6);
  const plan=planDelivery({packageName:PKG,outputs:F014,limits:DELIVERY_LIMITS});
  assert.equal(plan.strategy,'grouped');
  assert.deepEqual(plan.packages.map(p=>p.name),[
    'Harvest-Market-Autumn-Colouring-Pages-A4-Pages-01-10.zip',
    'Harvest-Market-Autumn-Colouring-Pages-US-Letter-Pages-01-10.zip',
    'Harvest-Market-Autumn-Colouring-Pages-A4-and-US-Letter-Pages-11-12.zip',
    'Harvest-Market-Autumn-Colouring-Pages-PNG-Pages-01-06.zip',
    'Harvest-Market-Autumn-Colouring-Pages-PNG-Pages-07-12.zip']);
  // Logical grouping: paper sizes stay apart except the two small closing volumes; PNGs split by page range; the guide opens the set.
  assert.deepEqual(plan.packages[0].rels,[F014[0].rel,F014[1].rel]);
  assert.deepEqual(plan.packages[2].rels,[F014[2].rel,F014[4].rel]);
  assert.ok(plan.packages.length<=ETSY.filesMax);
  for(const p of plan.packages){assert.ok(p.planned_bytes<=DELIVERY_LIMITS.safeBytes&&DELIVERY_LIMITS.safeBytes<ETSY.fileBytesMax,p.name);assert.match(p.name,ETSY.fileNamePattern);}
  const all=plan.packages.flatMap(p=>p.rels);
  assert.deepEqual([...all].sort(),F014.map(o=>o.rel).sort());
  assert.equal(new Set(all).size,all.length,'no file twice');
  // Deterministic.
  assert.deepEqual(planDelivery({packageName:PKG,outputs:F014,limits:DELIVERY_LIMITS}),plan);
});

test('planner: logical groups are preferred when they fit; a product that fits stays ONE ZIP named as before',()=>{
  const out=[{rel:'Guide.pdf',kind:'guide',bytes:3e3},{rel:'A4/a.pdf',kind:'pdf',bytes:8e6},{rel:'US-Letter/b.pdf',kind:'pdf',bytes:8e6},{rel:'PNG/c.png',kind:'page-png',bytes:8e6}];
  const plan=planDelivery({packageName:'LumiumX-Snowy-Owls',outputs:out,limits:DELIVERY_LIMITS});
  assert.deepEqual(plan.packages.map(p=>[p.name,p.rels]),[['Snowy-Owls-A4.zip',['Guide.pdf','A4/a.pdf']],['Snowy-Owls-US-Letter.zip',['US-Letter/b.pdf']],['Snowy-Owls-PNG.zip',['PNG/c.png']]]);
  const one=planDelivery({packageName:'LumiumX-Robin-Card',outputs:out.slice(0,2),limits:DELIVERY_LIMITS});
  assert.deepEqual([one.strategy,one.packages.map(p=>p.name)],['single',['LumiumX-Robin-Card.zip']]);
});

test('planner: an oversized single file and more delivery files than Etsy allows fail clearly (nothing dropped or degraded)',()=>{
  assert.throws(()=>planDelivery({packageName:PKG,outputs:[{rel:'A4/huge.pdf',kind:'pdf',bytes:19.5e6}],limits:DELIVERY_LIMITS}),
    e=>e instanceof DeliveryPlanError&&/A4\/huge\.pdf \(19\.50 MB\) is larger than the safe delivery size of 19\.00 MB on its own\. It is never split, removed or recompressed/.test(e.message));
  const seven=Array.from({length:7},(_,i)=>({rel:`V${i+1}/v.pdf`,kind:'pdf',bytes:15e6}));
  assert.throws(()=>planDelivery({packageName:PKG,outputs:seven,limits:DELIVERY_LIMITS}),/needs 7 delivery files of at most 19\.00 MB, but Etsy allows 5 per listing/);
  // A long product name is shortened, never the content label; names stay unique and valid.
  const long=planDelivery({packageName:'LumiumX-An-Exceptionally-Long-Product-Name-For-Testing-File-Name-Limits',outputs:F014,limits:DELIVERY_LIMITS});
  for(const p of long.packages)assert.match(p.name,ETSY.fileNamePattern);
  assert.equal(new Set(long.packages.map(p=>p.name)).size,long.packages.length);
});

// ------------------------------------------------ real bytes at #014 scale ---
/** A Stage-2-approved product on disk with #014's real layout and sizes (incompressible bytes), plus files that are NOT deliverables. */
async function stage2Fixture(files=F014){
  const dir=await mkdtemp(join(tmpdir(),'lx-s4mf-')), base=join(dir,'production/deliverables',PKG), outputs={};
  for(const o of files){
    const b=randomBytes(o.bytes);await mkdir(join(base,o.rel,'..'),{recursive:true});await writeFile(join(base,o.rel),b);
    outputs[o.rel]={kind:o.kind,variant:o.rel.split('/')[0],sha256:sha(b),bytes:b.length,...(o.kind==='page-png'?{page_number:o.pages[0]}:{}),
      ...(o.kind==='pdf'?{placements:o.pages.map(n=>({page_number:n}))}:{})};
  }
  await writeFile(join(base,'qc.json'),'{"internal":true}');await writeFile(join(base,'.DS_Store'),'x');   // present, never delivered
  const w=async(rel,v)=>{const b=Buffer.from(JSON.stringify(v));await mkdir(join(dir,rel,'..'),{recursive:true});await writeFile(join(dir,rel),b);return sha(b);};
  const record={package:PKG,outputs,zip_parts:[{entries:Object.keys(outputs).map(r=>`${PKG}/${r}`)}]};
  const product={product_id:'014',production:{approved_at:'2026-09-29T13:20:40Z',qc:{passed:true,report:'production/qc-report.json'},
    handoff:{file:'production/handoff.json',sha256:await w('production/handoff.json',{product_format:'colouring-book'})},
    build:{record:'production/build-record.json',sha256:await w('production/build-record.json',record)}}};
  await w('production/qc-report.json',{passed:true});
  return {dir,product,record,cleanup:()=>rm(dir,{recursive:true,force:true})};
}

test('delivery set at real scale: 60 MB of #014-shaped deliverables -> 5 verified ZIPs < 19 MB, identical bytes, nothing lost, duplicated or internal; Stage 2 byte-identical; deterministic',async()=>{
  const f=await stage2Fixture();
  try{
    const before=await snapshot(join(f.dir,'production'));
    const {manifest,reused,zipPath}=await buildDelivery({productDir:f.dir,product:f.product,deliveryDir:join(f.dir,'etsy/delivery')});
    assert.equal(reused,false);assert.equal(zipPath,null);assert.equal(manifest.zip,null);
    assert.equal(manifest.schema_version,2);assert.equal(manifest.strategy,'grouped');assert.equal(manifest.packages.length,5);
    assert.ok(manifest.verification.passed,JSON.stringify(manifest.verification.checks.filter(c=>!c.ok)));
    const seen=[];
    for(const p of manifest.packages){
      const bytes=await readFile(join(f.dir,p.file));
      assert.equal(sha(bytes),p.sha256);assert.equal(bytes.length,p.bytes);assert.ok(p.bytes<19e6,`${p.name} ${p.size}`);
      assert.match(p.size,/^\d+\.\d\d MB$/);assert.ok(p.purpose&&p.contents.length);
      const z=unzip(bytes), names=Object.keys(z).filter(n=>!n.endsWith('/'));
      assert.deepEqual(names.sort(),p.contents.map(c=>c.entry).sort());
      for(const n of names){seen.push(n);assert.ok(n.startsWith(`${PKG}/`));assert.doesNotMatch(n,/qc\.json|\.DS_Store|marketing|\.json$/);
        assert.equal(sha(Buffer.from(z[n])),f.record.outputs[n.slice(PKG.length+1)].sha256,`${n} bytes unchanged`);}
    }
    assert.deepEqual(seen.sort(),Object.keys(f.record.outputs).map(r=>`${PKG}/${r}`).sort(),'union = approved deliverables, each once');
    assert.deepEqual(manifest.excluded_extras.sort(),['.DS_Store','qc.json']);
    assert.deepEqual(await snapshot(join(f.dir,'production')),before,'Stage 2 unchanged');
    const again=await buildDelivery({productDir:f.dir,product:f.product,deliveryDir:join(f.dir,'etsy/delivery')});
    assert.equal(again.reused,true);assert.deepEqual(again.manifest.packages.map(p=>p.sha256),manifest.packages.map(p=>p.sha256));
  }finally{await f.cleanup();}
});

test('delivery set verification catches a missing, duplicated, unexpected or changed file (by path and SHA-256, not count)',()=>{
  const s2={package:'P',approvedZip:null,approvedZipParts:null};
  const e=(n,b)=>({entry:`P/${n}`,source:`x/${n}`,sha256:sha(b),bytes:b.length});
  const a=Buffer.from('aaa'), b=Buffer.from('bbb'), expected=[e('A4/a.pdf',a),e('PNG/b.png',b)];
  const z=o=>zipDeterministic(o,new Date(2000,0,1));
  const planned=[{name:'P-A4.zip',expected:[expected[0]]},{name:'P-PNG.zip',expected:[expected[1]]}];
  const run=files=>verifyDeliverySet({files,planned,expected,s2});
  const failed=r=>r.checks.filter(c=>!c.ok).map(c=>c.name);
  assert.equal(run([z({'P/A4/a.pdf':a}),z({'P/PNG/b.png':b})]).passed,true);
  assert.ok(failed(run([z({'P/A4/a.pdf':a}),z({})])).includes('every approved customer file present'));
  assert.ok(failed(run([z({'P/A4/a.pdf':a}),z({'P/PNG/b.png':b,'P/A4/a.pdf':a})])).includes('every approved customer file exactly once'));
  assert.ok(failed(run([z({'P/A4/a.pdf':a,'P/marketing/ad.png':b}),z({'P/PNG/b.png':b})])).includes('no extra or internal files'));
  assert.ok(failed(run([z({'P/A4/a.pdf':Buffer.from('aaX')}),z({'P/PNG/b.png':b})])).includes('entry bytes identical to approved sources (SHA-256)'));
  assert.ok(failed(verifyDeliverySet({files:[z({'P/A4/a.pdf':a}),z({'P/PNG/b.png':b})],planned,expected,s2,limits:{...DELIVERY_LIMITS,filesMax:1}})).includes('at most 1 digital files per listing'));
});

test('an oversized single deliverable fails before any ZIP is written',async()=>{
  const f=await stage2Fixture([F014[0],{rel:'A4/huge.pdf',kind:'pdf',bytes:19_500_000,pages:[1]}]);
  try{
    await assert.rejects(buildDelivery({productDir:f.dir,product:f.product,deliveryDir:join(f.dir,'etsy/delivery')}),
      e=>e.code==='DELIVERY_INVALID'&&/A4\/huge\.pdf \(19\.50 MB\) is larger than the safe delivery size/.test(e.message));
    await assert.rejects(readdir(join(f.dir,'etsy/delivery')),'nothing written');
  }finally{await f.cleanup();}
});

// ---------------------------------------------- workflow: the #014 story ---
test('#014 regression: packaging fails before ANY Etsy call; the free retry resumes at Stage 4 only and uploads every delivery file to ONE draft; no OpenAI; Stage 2 and 3 byte-identical',async()=>{
  const fake=new FakeEtsy();
  const stage4={config:{mode:'live',publishEnabled:false,shopId:fake.shopId,seller:SELLER},liveClient:async()=>fake};
  const {h,ws}=await productionApproved({stage4});
  try{
    await h.wf.handleUpdate(msg('/market 001'));
    assert.equal((await h.wf.handleUpdate(press(button(h.telegram,'APPROVE MARKETING')))).outcome,'marketing_approved');
    const calls=h.calls.length;
    h.wf.ai={...h.wf.ai,client:{json:()=>{throw new Error('OpenAI called in Stage 4');},image:()=>{throw new Error('OpenAI called in Stage 4');},imageEdit:()=>{throw new Error('OpenAI called in Stage 4');}}};
    const production=await snapshot(join(ws,'production')), book=await snapshot(join(ws,'book')), marketing=await snapshot(join(ws,'marketing'));
    const record=JSON.parse(await readFile(join(ws,'production/build-record.json')));
    const total=Object.values(record.outputs).reduce((s,o)=>s+o.bytes,0);
    // The fixture book is small: scale the limits down (stricter than Etsy's) so it must split like #014.
    const safeBytes=Math.ceil(total/2.6);
    // The fake Etsy taxonomy has no colouring category: use the per-product override (etsy/settings.json), as an owner would.
    await mkdir(join(ws,'etsy'),{recursive:true});await writeFile(join(ws,'etsy/settings.json'),JSON.stringify({taxonomy_id:1296}));
    h.wf.stage4.config.deliveryLimits={filesMax:1,safeBytes,namePattern:ETSY.fileNamePattern};

    // 1. Packaging cannot fit: Stage 4 stops with DELIVERY_INVALID before ANY Etsy request (not even auth).
    assert.equal((await h.wf.handleUpdate(msg('/etsy 001'))).outcome,'failed');
    let p=await h.store.load('001');
    assert.deepEqual([p.status,p.resume_state,p.last_error.step],['FAILED','ETSY_PREPARING','etsy']);
    assert.match(p.last_error.message,/DELIVERY_INVALID.*Etsy allows 1 per listing/);
    assert.deepEqual(fake.calls,[],'no Etsy call of any kind');
    assert.equal(fake.listings.size,0);

    // 2. The free retry (no confirmation, no OpenAI): Stage 4 only.
    h.wf.stage4.config.deliveryLimits={filesMax:5,safeBytes,namePattern:ETSY.fileNamePattern};
    const hist=p.status_history.length;
    const retry=lastKeyboard(h.telegram).find(b=>b.text==='🔄 Retry Safe Step');
    assert.ok(retry,'free retry offered');
    const r=await h.wf.handleUpdate(press(retry.callback_data));
    assert.equal(r.outcome,'awaiting_etsy_publish_approval',JSON.stringify((await h.store.load('001')).last_error));
    p=await h.store.load('001');
    assert.equal(p.status,'AWAITING_ETSY_PUBLISH_APPROVAL');assert.equal(p.product_id,'001');
    assert.equal(h.calls.length,calls,'no OpenAI call');
    const steps=p.status_history.slice(hist).map(s=>s.to);
    assert.ok(steps.length&&steps.every(s=>/^ETSY_|^AWAITING_ETSY|^MARKETING_APPROVED$/.test(s)),`Stage 4 only: ${steps.join(' -> ')}`);
    // One draft listing, several delivery files; the first Etsy write only after the delivery set was verified.
    assert.equal(fake.count('createListing'),1);assert.equal(fake.listings.size,1);
    const manifest=JSON.parse(await readFile(join(ws,'etsy/delivery/delivery-manifest.json')));
    assert.ok(manifest.packages.length>=3&&manifest.packages.length<=5,`${manifest.packages.length} files`);
    assert.ok(manifest.verification.passed);
    const [listingId]=[...fake.listings.keys()];
    assert.deepEqual(fake.files.get(listingId).map(x=>[x.filename,x.size_bytes,x.rank]),manifest.packages.map(k=>[k.name,k.bytes,k.rank]));
    assert.equal(fake.count('uploadDigitalFile'),manifest.packages.length);
    const payload=JSON.parse(await readFile(join(ws,'etsy/payload.json')));
    assert.deepEqual(payload.files.map(x=>x.name),manifest.packages.map(k=>k.name));
    // Every approved customer file exactly once across the uploaded ZIPs; nothing from marketing or the build.
    const got=[];
    for(const k of manifest.packages){assert.ok(k.bytes<=safeBytes);const z=unzip(await readFile(join(ws,k.file)));for(const n of Object.keys(z).filter(n=>!n.endsWith('/'))){got.push(n);
      assert.equal(sha(Buffer.from(z[n])),record.outputs[n.slice(record.package.length+1)].sha256);}}
    assert.deepEqual(got.sort(),Object.keys(record.outputs).map(r=>`${record.package}/${r}`).sort());
    assert.ok(got.every(n=>!/marketing|listing|example|build-record|qc/i.test(n)));
    const verification=JSON.parse(await readFile(join(ws,'etsy/verification.json')));
    assert.ok(verification.passed);assert.ok(verification.checks.find(c=>c.field==='digital file count').ok);
    // Stage 2, the approved book and Stage 3 are byte-identical; nothing was published.
    assert.deepEqual(await snapshot(join(ws,'production')),production);
    assert.deepEqual(await snapshot(join(ws,'book')),book);
    assert.deepEqual(await snapshot(join(ws,'marketing')),marketing);
    assert.equal(fake.count('activateListing'),0);assert.equal([...fake.listings.values()][0].state,'draft');
  }finally{await h.cleanup();}
});
