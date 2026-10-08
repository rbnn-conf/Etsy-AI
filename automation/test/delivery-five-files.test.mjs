// ADR-066: Etsy's 5-files-per-listing rule, guaranteed before any Etsy call. When whole logical groups need more
// than 5 files, Stage 4 adopts Stage 2's own packaging (build record zip_parts, packed to the same safe size) after
// proving it holds every approved file exactly once. Local fixtures only: no Etsy, no OpenAI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { planDelivery, DeliveryPlanError, buildDelivery, DELIVERY_LIMITS, ETSY } from '../src/stage4/index.mjs';
import { packParts } from '../../production/src/build.mjs';
import { ETSY_FILE_SAFE, ETSY_FILES_MAX, PART_CAPACITY } from '../../production/src/lib.mjs';
import { unzip } from './stage4-support.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const PKG='LumiumX-Hollowbone-Manor-Masquerade';
// Product #022's approved deliverables as measured (build record): guide, A4 PDF, US Letter PDF, 25 page PNGs.
const PNG_BYTES=[2616164,2331411,2664471,2067156,2445495,2220465,2371486,2351862,2430573,1960892,2496541,2365530,1870447,2564660,2591558,2215518,2581008,2253553,2146101,1878734,2235035,2002074,2265872,2419547,2418135];
const F022=[{rel:'START-HERE-Printing-Guide.pdf',kind:'guide',bytes:2262,pages:null},
  {rel:`A4/${PKG}-A4.pdf`,kind:'pdf',bytes:13_950_901,pages:Array.from({length:25},(_,i)=>i+1)},
  {rel:`US-Letter/${PKG}-US-Letter.pdf`,kind:'pdf',bytes:13_950_994,pages:Array.from({length:25},(_,i)=>i+1)},
  ...PNG_BYTES.map((b,i)=>({rel:`Colouring-Pages-PNG/${PKG}-Page-${String(i+1).padStart(2,'0')}${i?'':'-Cover'}.png`,kind:'page-png',bytes:b,pages:[i+1]}))]
  .map(o=>({...o,sha256:sha(Buffer.from(o.rel))}));
/** Stage 2's packing of a deliverable list (the real production function), as lists of rels. */
const stage2Parts=outputs=>packParts(outputs,o=>o.bytes).map(p=>p.map(o=>o.rel));
const once=(plan,outputs)=>{const all=plan.packages.flatMap(p=>p.rels);assert.equal(all.length,outputs.length);assert.deepEqual([...all].sort(),outputs.map(o=>o.rel).sort());};
// #022's REAL stored Stage 2 parts (build record zip_parts, packed before ADR-066): guide+A4 | US Letter+pages 1-2 | 3-10 | 11-18 | 19-25.
const png=(a,b)=>F022.slice(3).filter(o=>o.pages[0]>=a&&o.pages[0]<=b).map(o=>o.rel);
const REAL_022_PARTS=[[F022[0].rel,F022[1].rel],[F022[2].rel,...png(1,2)],png(3,10),png(11,18),png(19,25)];
const pdfs=n=>Array.from({length:n},(_,i)=>({rel:`V${i+1}/v.pdf`,kind:'pdf',bytes:15e6,pages:null,sha256:sha(Buffer.from(`v${i}`))}));

test('Stage 2 and Stage 4 share ONE limit: 5 files of at most 19.00 MB',()=>{
  assert.equal(ETSY_FILE_SAFE,ETSY.fileBytesSafe);assert.equal(ETSY_FILES_MAX,ETSY.filesMax);assert.equal(DELIVERY_LIMITS.safeBytes,19_000_000);
  assert.ok(PART_CAPACITY<ETSY_FILE_SAFE,'parts are packed with headroom for ZIP overhead');
});

test('1 + 2 + 8. five or fewer files pass exactly as before; production parts never change a plan that already fits',()=>{
  const five=pdfs(5), p5=planDelivery({packageName:PKG,outputs:five,limits:DELIVERY_LIMITS});
  assert.equal(p5.strategy,'grouped');assert.equal(p5.packages.length,5);once(p5,five);
  const small=[F022[0],...F022.slice(3,6)], p1=planDelivery({packageName:PKG,outputs:small,limits:DELIVERY_LIMITS});
  assert.equal(p1.strategy,'single');assert.equal(p1.packages[0].name,`${PKG}.zip`);
  for(const outs of [five,small])
    assert.deepEqual(planDelivery({packageName:PKG,outputs:outs,limits:DELIVERY_LIMITS,productionParts:stage2Parts(outs)}),planDelivery({packageName:PKG,outputs:outs,limits:DELIVERY_LIMITS}));
});

test('3 + 4 + 5 + 6 + 9. #022: whole groups need 6 files -> Stage 2\'s packaging is adopted: 5 files <= 19 MB, every file exactly once, customer names',()=>{
  // Without Stage 2's parts, exactly the error #022 hit (the planner alone never invents a split).
  assert.throws(()=>planDelivery({packageName:PKG,outputs:F022,limits:DELIVERY_LIMITS}),/needs 6 delivery files of at most 19\.00 MB, but Etsy allows 5 per listing/);
  const plan=planDelivery({packageName:PKG,outputs:F022,limits:DELIVERY_LIMITS,productionParts:REAL_022_PARTS});
  // A rebuild under ADR-066's packing capacity also gives at most 5 parts Stage 4 accepts (page ranges may differ).
  const rebuilt=planDelivery({packageName:PKG,outputs:F022,limits:DELIVERY_LIMITS,productionParts:stage2Parts(F022)});
  assert.ok(rebuilt.packages.length<=5);once(rebuilt,F022);
  assert.equal(plan.strategy,'production-parts');
  assert.ok(plan.packages.length<=5);once(plan,F022);
  for(const p of plan.packages){assert.ok(p.planned_bytes<=DELIVERY_LIMITS.safeBytes,`${p.name} ${p.planned_bytes}`);assert.match(p.name,ETSY.fileNamePattern);}
  assert.deepEqual(plan.packages.map(p=>p.name),['Hollowbone-Manor-Masquerade-A4.zip','Hollowbone-Manor-US-Letter-and-Colouring-Pages-PNG-01-02.zip',
    'Hollowbone-Manor-Masquerade-Colouring-Pages-PNG-03-10.zip','Hollowbone-Manor-Masquerade-Colouring-Pages-PNG-11-18.zip','Hollowbone-Manor-Masquerade-Colouring-Pages-PNG-19-25.zip']);
  // The guide, both PDF sizes and every page PNG are delivered: nothing is removed, nothing degraded.
  assert.deepEqual(plan.packages[0].rels,['START-HERE-Printing-Guide.pdf',`A4/${PKG}-A4.pdf`]);
});

test('7. if consolidation cannot satisfy both limits, planning fails clearly (before any ZIP or Etsy call), never drops a file',()=>{
  const seven=pdfs(7);
  for(const [parts,why] of [[null,null],[stage2Parts(seven),/it has 7 parts/],[[seven.slice(0,4).map(o=>o.rel),seven.slice(4).map(o=>o.rel)],/over 19\.00 MB/]])
    assert.throws(()=>planDelivery({packageName:PKG,outputs:seven,limits:DELIVERY_LIMITS,productionParts:parts}),e=>e instanceof DeliveryPlanError&&/needs 7 delivery files/.test(e.message)&&(!why||why.test(e.message)));
  // Stage 2 parts that miss, repeat or invent a file are refused.
  const good=stage2Parts(F022);
  for(const [parts,why] of [[good.map((p,i)=>i===4?p.slice(1):p),/in no part/],[good.map((p,i)=>i===4?[...p,good[3][0]]:p),/is in parts/],[good.map((p,i)=>i===0?[...p,'A4/extra.pdf']:p),/not an approved deliverable/]])
    assert.throws(()=>planDelivery({packageName:PKG,outputs:F022,limits:DELIVERY_LIMITS,productionParts:parts}),why);
});

test('9 (real bytes). #022-sized deliverables on disk -> 5 verified ZIPs, every entry byte-identical, within 19 MB; rebuilt identically',{timeout:300_000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lx-s4-022-')), base=join(dir,'production/deliverables',PKG), outputs={};
  try{
    for(const o of F022){const b=randomBytes(o.bytes);await mkdir(join(base,o.rel,'..'),{recursive:true});await writeFile(join(base,o.rel),b);
      outputs[o.rel]={kind:o.kind,variant:o.rel.split('/')[0],sha256:sha(b),bytes:b.length,...(o.kind==='page-png'?{page_number:o.pages[0]}:{}),...(o.kind==='pdf'?{placements:o.pages.map(n=>({page_number:n}))}:{})};}
    const parts=stage2Parts(F022).map(list=>({entries:list.map(r=>`${PKG}/${r}`)}));
    const w=async(rel,v)=>{const b=Buffer.from(JSON.stringify(v));await mkdir(join(dir,rel,'..'),{recursive:true});await writeFile(join(dir,rel),b);return sha(b);};
    const record={package:PKG,outputs,zip_parts:parts};
    const product={product_id:'022',production:{approved_at:'2026-10-07T18:00:00Z',qc:{passed:true,report:'production/qc-report.json'},
      handoff:{file:'production/handoff.json',sha256:await w('production/handoff.json',{product_format:'colouring-book'})},build:{record:'production/build-record.json',sha256:await w('production/build-record.json',record)}}};
    await w('production/qc-report.json',{passed:true});
    const {manifest}=await buildDelivery({productDir:dir,product,deliveryDir:join(dir,'etsy/delivery')});
    assert.equal(manifest.strategy,'production-parts');assert.equal(manifest.packages.length,5);assert.ok(manifest.verification.passed);
    const seen=[];
    for(const p of manifest.packages){const bytes=await readFile(join(dir,p.file));assert.ok(bytes.length<=ETSY.fileBytesSafe,`${p.name} ${p.size}`);
      for(const [n,data] of Object.entries(unzip(bytes)).filter(([n])=>!n.endsWith('/'))){seen.push(n);assert.equal(sha(Buffer.from(data)),outputs[n.slice(PKG.length+1)].sha256);}}
    assert.deepEqual(seen.sort(),Object.keys(outputs).map(r=>`${PKG}/${r}`).sort());
    const again=await buildDelivery({productDir:dir,product,deliveryDir:join(dir,'etsy/delivery')});
    assert.equal(again.reused,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});
