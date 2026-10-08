import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {decode,renderPage,validateSources,packageForEtsy} from '../../004-cozy-spooky-coloring/src/core.mjs';
import {book,printingGuide} from '../../004-cozy-spooky-coloring/src/documents.mjs';
const require=createRequire(new URL('../../004-cozy-spooky-coloring/package.json',import.meta.url));
const sharp=require('sharp'),{PDFDocument}=require('pdf-lib'),{unzipSync}=require('fflate');
async function fixture(){
 const raw=Buffer.alloc(1254*1254*3,255);
 for(let y=100;y<500;y++)raw.fill(0,(y*1254+100)*3,(y*1254+500)*3);
 return sharp(raw,{raw:{width:1254,height:1254,channels:3}}).png().toBuffer();
}
test('square artwork is opt-in; original portrait gate remains active',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lumiumx-005-test-'));
 try{
  await mkdir(join(dir,'source'));await writeFile(join(dir,'source/P001.png'),await fixture());
  const strict=await validateSources(join(dir,'source'));
  assert.ok(strict.errors.some(e=>e.includes('portrait')));
  const square=await validateSources(join(dir,'source'),[],{allowSquare:true});
  assert.equal(square.records.length,1);assert.equal(square.records[0].width,1254);
  assert.ok(!square.errors.some(e=>e.includes('portrait')));
 }finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir()))&&dir.includes('lumiumx-005-test-'));await rm(dir,{recursive:true,force:true});}
});
test('180-PPI placement preserves all square source pixels in both paper formats',async()=>{
 const source=await fixture(),original=await decode(source);
 for(const format of ['A4','US-Letter']){
  const r=await renderPage(source,format,{dpi:180}),p=r.placement;
  assert.equal(p.scale,1);assert.equal(p.iw,1254);assert.equal(p.ih,1254);
  const actual=await sharp(r.bytes).extract({left:p.left,top:p.top,width:p.iw,height:p.ih}).raw().toBuffer();
  assert.deepEqual(actual,original.data);
  const meta=await sharp(r.bytes).metadata();assert.equal(meta.density,180);
  assert.ok(p.left>=Math.ceil(12*180/25.4));
 }
});
test('configurable PDF branding leaves original default title intact',async()=>{
 const source=await fixture();
 const autumn=await PDFDocument.load(await book([source],'A4',null,{title:'Cozy Autumn Adventures',dpi:180}));
 assert.equal(autumn.getTitle(),'LumiumX Cozy Autumn Adventures - A4');
 const baseline=await PDFDocument.load(await book([source],'A4'));
 assert.equal(baseline.getTitle(),'LumiumX Cozy Spooky Halloween - A4');
 assert.equal((await PDFDocument.load(await printingGuide({title:'Cozy Autumn Adventures'}))).getPageCount(),1);
});
test('forced ZIP bundling retains bytes and uses the configured product prefix',()=>{
 const loose={'book.pdf':Buffer.from('pdf fixture'),'page.png':Buffer.from('png fixture')};
 const result=packageForEtsy(loose,loose,19000000,{prefix:'LumiumX-Autumn',forceBundles:true});
 assert.deepEqual(Object.keys(result.files),['LumiumX-Autumn-Bundle-1-of-1.zip']);
 const contents=unzipSync(Object.values(result.files)[0]);
 for(const [name,bytes]of Object.entries(loose))assert.deepEqual(Buffer.from(contents[name]),bytes);
});
