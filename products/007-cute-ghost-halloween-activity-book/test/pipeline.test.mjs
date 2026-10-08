import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage } from '../../004-cozy-spooky-coloring/src/core.mjs';
import { lib, config } from '../src/config.mjs';
import { validateSources } from '../src/build.mjs';
import { printingGuide } from '../src/guide.mjs';
const sharp=lib('sharp'), { PDFDocument }=lib('pdf-lib');
const fixture=async(w,h,seed)=>{const raw=Buffer.alloc(w*h*3,255);for(let y=100;y<100+seed*40;y++)raw.fill(0,(y*w+100)*3,(y*w+600)*3);return sharp(raw,{raw:{width:w,height:h,channels:3}}).png().toBuffer();};
const sha=async b=>(await import('node:crypto')).createHash('sha256').update(b).digest('hex');

test('portrait sources stay pixel-exact at 152 PPI on both papers',async()=>{
  for(const [w,h] of [[1103,1426],[1086,1448]])for(const f of ['A4','US-Letter']){
    const r=await renderPage(await fixture(w,h,3),f,{dpi:config.dpi});assert.equal(r.placement.scale,1);
  }
});
test('landscape source is contained without distortion or clipping',async()=>{
  const r=await renderPage(await fixture(1448,1086,3),'A4',{dpi:config.dpi}),p=r.placement;
  assert.ok(p.scale<1);assert.ok(Math.abs(p.iw/p.ih-1448/1086)<0.003);assert.ok(p.left>=0&&p.left+p.iw<=p.w);
});
test('source validation rejects exact duplicates and blank pages',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lumiumx-007-'));
  try{
    const a=await fixture(1103,1426,5), blank=await fixture(1103,1426,0);
    await writeFile(join(dir,'01_a.png'),a);await writeFile(join(dir,'02_b.png'),a);await writeFile(join(dir,'03_c.png'),blank);
    const pages=[['P001','01_a.png',a],['P002','02_b.png',a],['P003','03_c.png',blank]];
    const v=await validateSources(dir,await Promise.all(pages.map(async([id,source,b])=>({id,source,title:id,activity:'x',sha256:await sha(b)}))));
    assert.ok(v.errors.some(e=>e.includes('exact duplicate')));
    assert.ok(v.errors.some(e=>e.includes('blank')));
    assert.ok(v.errors.some(e=>e.includes('Expected 30')));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('printing guide is one page and states the real contents',async()=>{
  const pdf=await PDFDocument.load(await printingGuide({bundleCount:5}));
  assert.equal(pdf.getPageCount(),1);
});
test('listing copy never claims 30 activities',async()=>{
  const L=JSON.parse(await readFile(new URL('../listing/listing.json',import.meta.url),'utf8'));
  assert.ok(!/30[^|\n]{0,25}activities/i.test(L.title+L.description));
  assert.equal(L.tags.length,13);
});
