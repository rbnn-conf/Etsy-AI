import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { build } from '../src/build.mjs';
import { IDS, validatePngStructure, validateSources, packageForEtsy, verifyZip, zip, hash } from '../src/core.mjs';

async function temporary(fn) {
  const root=await mkdtemp(join(tmpdir(),'lumiumx-004-test-'));
  try {await mkdir(join(root,'source'));return await fn(root);}
  finally {assert.ok(resolve(root).startsWith(resolve(tmpdir())) && root.includes('lumiumx-004-test-'));await rm(root,{recursive:true,force:true});}
}
// Simple geometric diagnostic patterns, only in OS temporary storage. These
// are not product illustrations and are never copied into approved source/.
async function fixture(index,{edge=false,width=1055,height=1491}={}) {
  const raw=Buffer.alloc(width*height*3,255);
  const left=edge?0:150, top=150;
  for(let y=top;y<Math.min(height-150,top+100+index*15);y++) {
    raw.fill(0,(y*width+left)*3,(y*width+Math.min(width-150,left+200))*3);
  }
  return sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer();
}
test('missing sources produce a failed report and no ready deliverables',async()=>temporary(async root=>{
  const result=await build(root,{log:()=>{}});
  assert.equal(result.status,'FAIL');assert.match(result.errors[0],/Missing source: P020/);
  assert.match(await readFile(join(root,'qc','build-report.txt'),'utf8'),/NOT READY/);
  assert.ok(!(await readdir(root)).includes('output'));
}));
test('validation rejects duplicate IDs/artwork, corrupt files, unreviewed edge ink and landscape; resolution is a notice',async()=>temporary(async root=>{
  const normal=await fixture(0);
  await writeFile(join(root,'source','P001.png'),normal);
  await writeFile(join(root,'source','P002.png'),normal);
  await writeFile(join(root,'source','extra-P001.png'),normal);
  await writeFile(join(root,'source','P003.png'),Buffer.from('not png'));
  await writeFile(join(root,'source','P004.png'),await fixture(4,{width:400,height:600}));
  await writeFile(join(root,'source','P005.png'),await fixture(5,{edge:true}));
  await writeFile(join(root,'source','P006.png'),await fixture(6,{width:800,height:600}));
  await writeFile(join(root,'source','P007.png'),normal.subarray(0,normal.length/2));
  const {errors,records}=await validateSources(join(root,'source')), text=errors.join('\n');
  for(const pattern of [/Duplicate page ID/,/duplicate artwork/,/PNG signature/,/possible clipped/,/portrait/,/P007.png/]) assert.match(text,pattern);
  assert.equal(records.find(r=>r.id==='P004').resolutionStatus,'PASS WITH NOTICE');
}));
test('numeric filenames map to page IDs and mixed aliases cannot duplicate a page',async()=>temporary(async root=>{
  await writeFile(join(root,'source','1.png'),await fixture(1));
  await writeFile(join(root,'source','20.png'),await fixture(20));
  let result=await validateSources(join(root,'source'));
  assert.deepEqual(result.records.map(r=>[r.id,r.name]),[['P001','1.png'],['P020','20.png']]);
  assert.ok(!result.errors.some(e=>/Unexpected source filename/.test(e)));
  await writeFile(join(root,'source','P001.png'),await fixture(2));
  result=await validateSources(join(root,'source'));
  assert.ok(result.errors.includes('Duplicate page ID: P001'));
}));
test('reviewed edge composition is accepted only for the exact approved bytes',async()=>temporary(async root=>{
  const bytes=await fixture(1,{edge:true});await writeFile(join(root,'source','1.png'),bytes);
  const approval={sourceId:'P001',approvedSha256:hash(bytes),sourceEdgeReview:'Reviewed complete edge composition'};
  const reviewed=await validateSources(join(root,'source'),[approval]);
  assert.equal(reviewed.records[0].sourceEdgeInk,true);
  assert.equal(reviewed.records[0].sourceEdgeReview,approval.sourceEdgeReview);
  await writeFile(join(root,'source','1.png'),await fixture(2,{edge:true}));
  const changed=await validateSources(join(root,'source'),[approval]);
  assert.ok(changed.errors.some(e=>e.includes('possible clipped artwork')));
}));
test('ZIP QC detects changed bytes and missing entries',()=>{
  const expected={'P001.png':Buffer.from('first'),'P002.png':Buffer.from('second')};
  assert.doesNotThrow(()=>verifyZip(zip(expected),expected));
  assert.throws(()=>verifyZip(zip({'P001.png':Buffer.from('wrong'),'P002.png':expected['P002.png']}),expected),/corrupted/);
  assert.throws(()=>verifyZip(zip({'P001.png':expected['P001.png']}),expected),/filename/);
});
test('PNG CRC and missing end marker are rejected',async()=>{
  const png=await fixture(0,{width:400,height:600});
  assert.doesNotThrow(()=>validatePngStructure(png));
  const corrupt=Buffer.from(png);corrupt[29]^=1;
  assert.throws(()=>validatePngStructure(corrupt),/CRC/);
  assert.throws(()=>validatePngStructure(png.subarray(0,png.length-12)),/Incomplete/);
});
test('oversize packaging splits losslessly and rejects impossible limits',()=>{
  const loose=Object.fromEntries(Array.from({length:8},(_,i)=>[`page-${i}.png`,Buffer.from(Array.from({length:200},(_,j)=>(i*17+j*47)%256))]));
  const result=packageForEtsy({'oversize.zip':Buffer.alloc(1000)},loose,800);
  assert.equal(result.mode,'lossless-bundles');assert.ok(Object.keys(result.files).length<=5);
  const recovered={};for(const bytes of Object.values(result.files)) {assert.ok(bytes.length<=800);Object.assign(recovered,unzipSync(bytes));}
  assert.deepEqual(Object.keys(recovered).sort(),Object.keys(loose).sort());
  for(const name of Object.keys(loose)) assert.equal(hash(recovered[name]),hash(loose[name]));
  assert.throws(()=>packageForEtsy({'oversize.zip':Buffer.alloc(1000)},loose,50),/Cannot fit/);
});
test('five-file packaging finds a valid distribution when greedy packing needs six',()=>{
  const loose={};let seed=1234567;
  const random=length=>Buffer.from(Array.from({length},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;}));
  const weights=[10,6,6,5,5,3,3,2,2,2,2,2,2];
  for(const [i,weight] of weights.entries()) {
    const name=`item-${String(i).padStart(2,'0')}.bin`, target=weight*1000;
    let length=target-120, bytes;
    for(let attempt=0;attempt<10;attempt++) {
      bytes=random(length);const size=zip({[name]:bytes}).length;
      if(size===target)break;
      length+=target-size;
    }
    assert.equal(zip({[name]:bytes}).length,target);loose[name]=bytes;
  }
  const result=packageForEtsy({'oversize.zip':Buffer.alloc(10001)},loose,10000);
  assert.equal(Object.keys(result.files).length,5);
  const actual={};for(const bytes of Object.values(result.files)){assert.ok(bytes.length<=10000);Object.assign(actual,unzipSync(bytes));}
  for(const [name,bytes] of Object.entries(loose))assert.equal(hash(actual[name]),hash(bytes));
});
test('full 20-page build verifies all five deliverables, previews, guide and rerun invalidation', {timeout:600000},async()=>temporary(async root=>{
  for(let i=0;i<IDS.length;i++) await writeFile(join(root,'source',`${IDS[i]}.png`),await fixture(i));
  const original=await readFile(join(root,'source','P001.png'));
  const result=await build(root,{log:message=>{if(message.startsWith('Generating')||message.startsWith('Checking'))console.log(message);}});
  assert.equal(result.status,'READY FOR ETSY REVIEW',result.errors.join('\n'));
  for(const format of ['A4','US-Letter']) assert.equal(result.pages.filter(p=>p.format===format).length,20);
  assert.equal(result.sources[2].name,'P004.png');
  assert.equal(result.sources[0].resolutionStatus,'PASS WITH NOTICE');
  assert.equal(result.sources[0].fullPageA4Dpi,144);
  assert.equal(result.sources[0].native300Dpi,false);
  assert.deepEqual(await readFile(join(root,'source','P001.png')),original);
  assert.equal((await readdir(join(root,'output','etsy'))).length,5);
  for(const format of ['A4','US-Letter']) {
    const path=join(root,'output','deliverables',`LumiumX-Cozy-Spooky-Halloween-${format}.pdf`);
    assert.equal((await PDFDocument.load(await readFile(path))).getPageCount(),20);
    const entries=unzipSync(await readFile(join(root,'output','deliverables',`LumiumX-Cozy-Spooky-Halloween-${format}-PNG.zip`)));
    assert.equal(Object.keys(entries).length,20);
    assert.ok(entries[`LumiumX-Halloween-P020-${format}.png`]);
  }
  assert.equal((await readdir(join(root,'listing','source-previews','pages'))).length,20);
  const sheet=await sharp(join(root,'qc','contact-sheet.png')).metadata();assert.equal(sheet.width,1200);assert.equal(sheet.height,1400);
  await rm(join(root,'source','P020.png'));
  const failed=await build(root,{log:()=>{}});assert.equal(failed.status,'FAIL');
  assert.match(await readFile(join(root,'qc','build-report.txt'),'utf8'),/NOT READY/);
}));
