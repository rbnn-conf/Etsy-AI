// Stage 2 colouring-book adapter. Fixtures only: no OpenAI, no Telegram, no Etsy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, artwork, approveBook, bookPage } from './fixtures.mjs';
import { createHandoff, writeHandoff, buildProduction, runQc, HandoffError, DELIVERABLES, PACKAGE_DIR } from '../src/index.mjs';
import { packParts } from '../src/build.mjs';
import { hash, sharp, PDFDocument, unzipSync, ETSY_FILE_LIMIT, ETSY_FILES_MAX } from '../src/lib.mjs';
import { pageLayout, PAPERS, MARGIN_MM, PNG_FOLDER, samePixels } from '../src/adapters/colouring-book.mjs';

const book=n=>Array.from({length:n},(_,i)=>i===0
  ?{page_type:'cover',title:'Winter Windows',prompt:'Cover with exact title “Winter Windows”.',notes:'Verify the title.'}
  :{page_type:'colouring',title:`Window ${i+1}`,prompt:`Page ${i+1} scene.`,notes:''});
const PKG='LumiumX-Robin-at-the-Frosted-Gate';
const colouring=async(n=6,opts={})=>approvedProduct({format:'colouring-book',pages:book(n),...opts});
async function built(n=6,opts={}){
  const f=await colouring(n,opts);
  const {handoff,sha256}=await writeHandoff(f.product,f.dir);
  const b=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});
  return {...f,handoff,sha256,b};
}
const mmOf=async path=>(await PDFDocument.load(await readFile(path))).getPages().map(p=>p.getSize()).map(({width,height})=>[+(width*25.4/72).toFixed(1),+(height*25.4/72).toFixed(1)]);
// Stage 1 files: the style proofs and every approved full-book page.
const proofHashes=async f=>Promise.all([...f.product.proofs.attempts[0].images.map(i=>i.file),...f.product.book.pages.map(p=>p.file)].map(async x=>hash(await readFile(join(f.dir,x)))));

test('colouring book: handoff is an ordered book of the owner-approved full-book pages, routed by product_format (no product id)',async()=>{
  const f=await colouring(6);
  try{
    const h=await createHandoff(f.product,f.dir);
    assert.deepEqual(h.adapter,{format:'colouring-book',version:1});
    assert.deepEqual(h.book.pages.map(p=>[p.page_number,p.role,p.asset]),[[1,'cover','P001'],[2,'page','P002'],[3,'page','P003'],[4,'page','P004'],[5,'page','P005'],[6,'page','P006']]);
    assert.deepEqual(h.book.page_px,[512,768]);assert.equal(h.book.orientation,'portrait');assert.equal(h.book.cover,true);
    assert.match(h.review_notes.join('\n'),/Page 1 \(cover, P001\): check the baked-in text reads exactly "Winter Windows"/);
    assert.ok(h.assets.every(a=>a.source==='full-book'&&/^book\/pages\/P\d{3}\.png$/.test(a.file)),'artwork from the approved full book, never the style proofs');
    assert.deepEqual(h.approved.full_artwork,{approved_at:'2026-09-27T17:00:00.000Z',approved_by:'@owner',manifest_sha256:f.product.book.approval.manifest_sha256,
      pages_sha256:f.product.book.approval.pages_sha256,qc_sha256:f.product.book.approval.qc_sha256});
    assert.equal(h.sources.book_manifest.file,'book/manifest.json');
  }finally{await f.cleanup();}
});

test('colouring book input validation: missing pages, gaps, duplicates, blank pages, mixed sizes and a production plan all fail clearly',async()=>{
  // Missing pages: Stage 1 has only some pages (e.g. #012: 3 style proofs of 24 pages) and no full-book approval.
  let f=await colouring(8);
  try{
    const p=structuredClone(f.product);delete p.book;
    await assert.rejects(createHandoff(p,f.dir),e=>e instanceof HandoffError&&/Full artwork for this colouring book is not approved yet: 0 of 8 pages have artwork \(missing 1-8\)\..*style-proof approval is not enough.*Stage 2 never generates artwork/.test(e.message));
    const q=structuredClone(f.product);q.book.approval=null;q.book.pages=q.book.pages.filter(x=>[2,3,8].includes(x.page_number));
    await assert.rejects(createHandoff(q,f.dir),/not approved yet: 3 of 8 pages have artwork \(missing 1, 4-7\)/);
    // Approved, but a page lost its artwork afterwards: still refused, never repaired.
    const r=structuredClone(f.product);r.book.pages=r.book.pages.filter(x=>x.page_number!==5);
    await assert.rejects(createHandoff(r,f.dir),/Approved full book is not consistent: 1 of 8 pages have no artwork \(5\)/);
  }finally{await f.cleanup();}
  // Page numbering gap / page_count mismatch: the manifest no longer matches the specification.
  f=await colouring(6);
  try{
    const p=structuredClone(f.product);p.pages[5].page_number=7;
    await assert.rejects(createHandoff(p,f.dir),/the specification changed after the page manifest was made/);
    const q=structuredClone(f.product);q.page_count=7;
    await assert.rejects(createHandoff(q,f.dir),/the page manifest lists 6 pages; the specification has 6 \(page_count 7\)/);
  }finally{await f.cleanup();}
  // Exact decoded duplicate (different bytes, same pixels) and a blank page.
  f=await colouring(6);
  try{
    const dup=await sharp(await readFile(join(f.dir,bookPage(2)))).png({compressionLevel:1}).toBuffer();
    await writeFile(join(f.dir,bookPage(4)),dup);
    await writeFile(join(f.dir,bookPage(5)),await sharp({create:{width:512,height:768,channels:3,background:'#ffffff'}}).png().toBuffer());
    // Changed after approval: refused on the checksums alone.
    await assert.rejects(createHandoff(f.product,f.dir),/Approved full book is not consistent: book\/pages\/P004\.png changed since it was generated/);
    // Even if such pages were approved, Stage 2's own validation still refuses them.
    await approveBook(f);
    await assert.rejects(createHandoff(f.product,f.dir),e=>/page 4 is an exact duplicate of page 2/.test(e.message)&&/page 5 \(P005\) is blank/.test(e.message)&&/never repairs/.test(e.message));
  }finally{await f.cleanup();}
  // Mixed pixel sizes.
  f=await colouring(6);
  try{
    await writeFile(join(f.dir,bookPage(3)),await artwork(3,{width:600,height:900}));await approveBook(f);
    await assert.rejects(createHandoff(f.product,f.dir),/different pixel sizes \(512x768, 600x900\)/);
  }finally{await f.cleanup();}
  // production-plan.json is a greeting-card concept; a book's order is its specification.
  f=await colouring(6);
  try{
    await writeFile(join(f.dir,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'009'}));
    await assert.rejects(createHandoff(f.product,f.dir),/production-plan\.json is not used for colouring books/);
  }finally{await f.cleanup();}
});

test('colouring book build: A4 + US Letter book PDFs in page order, pixel-identical PNG pages, guide, one ZIP; QC passes; Stage 1 untouched',async()=>{
  const f=await colouring(6);
  try{
    const before=await proofHashes(f);
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    const b=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});
    const out=b.record.outputs;
    assert.deepEqual(Object.keys(out).sort(),[`A4/${PKG}-A4.pdf`,...[1,2,3,4,5,6].map(n=>`${PNG_FOLDER}/${PKG}-Page-0${n}${n===1?'-Cover':''}.png`),'START-HERE-Printing-Guide.pdf',`US-Letter/${PKG}-US-Letter.pdf`].sort());
    assert.deepEqual(b.record.image_encoding,{pdf:'lossless',pages_png:true});
    // A4 / US Letter: 6 portrait pages each, every page whole, centred, aspect kept, in order.
    const base=join(f.dir,DELIVERABLES,PKG);
    assert.deepEqual(await mmOf(join(base,`A4/${PKG}-A4.pdf`)),Array(6).fill([210,297]));
    assert.deepEqual(await mmOf(join(base,`US-Letter/${PKG}-US-Letter.pdf`)),Array(6).fill([215.9,279.4]));
    for(const key of ['A4','US-Letter']){
      const pl=out[`${key}/${PKG}-${key}.pdf`].placements;
      assert.deepEqual(pl.map(p=>`${p.page_number}:${p.asset}`),[1,2,3,4,5,6].map(n=>`${n}:P00${n}`));
      for(const p of pl){assert.ok(Math.abs(p.placed_aspect-p.source_aspect)<1e-3);assert.ok(Math.min(...p.offset_mm)>=MARGIN_MM-0.01);}
    }
    const L=pageLayout(PAPERS.A4,[512,768]);assert.ok(Math.abs(L.box.w/L.box.h-512/768)<1e-9);assert.equal(L.box.h,297-2*MARGIN_MM,'height-limited 2:3 page fills the safe height');
    // PNG pages: pixel-identical to the approved full-book pages.
    for(let n=1;n<=6;n++)assert.ok(await samePixels(await readFile(join(base,`${PNG_FOLDER}/${PKG}-Page-0${n}${n===1?'-Cover':''}.png`)),await readFile(join(f.dir,bookPage(n)))));
    // One ZIP (small book, not split); authoritative manifest in the build record.
    assert.equal(b.record.zip_parts.length,1);assert.equal(b.record.zip_parts[0].name,`${PKG}.zip`);assert.equal(b.record.zip.file,`${PACKAGE_DIR}/${PKG}.zip`);
    assert.deepEqual(Object.keys(unzipSync(await readFile(join(f.dir,b.record.zip.file)))).sort(),Object.keys(out).map(r=>`${PKG}/${r}`).sort());
    const qc=await runQc({productDir:f.dir,handoff});
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    for(const name of ['page count matches the specification','page order sequential','every page in order in A4 and US Letter','A4 and US Letter layout: centred inside safe margins',
      'PNG pages pixel-identical to approved artwork','page dimensions consistent','printing guide states the page count','contact sheet rendered','ZIP package verified','file sizes fit Etsy',
      'approved artwork unchanged','no blank pages','PDFs valid: page counts, sizes and orientation','aspect ratio preserved','no unsupported resolution claim'])
      assert.ok(qc.checks.find(c=>c.name===name)?.ok,name);
    assert.ok(!qc.checks.some(c=>c.name==='card artwork identical to approved originals'),'no card-only check on a book');
    assert.match(qc.checks.find(c=>c.name==='no unsupported resolution claim').detail,/A4 \d+ ppi, US-Letter \d+ ppi/);
    assert.ok(qc.previews.some(p=>/contact-sheet\.png$/.test(p.file)));assert.equal(qc.previews.filter(p=>p.source).length,3,'cover, page 2, last page');
    assert.ok((await readdir(join(f.dir,'production/previews'))).includes('contact-sheet.png'));
    assert.deepEqual(await proofHashes(f),before,'Stage 1 approved artwork is never modified');
  }finally{await f.cleanup();}
});

test('colouring book QC: a tampered ZIP or changed approved artwork fails',async()=>{
  const f=await built(5);
  try{
    const zip=join(f.dir,f.b.record.zip.file), bytes=await readFile(zip);
    await writeFile(zip,Buffer.concat([bytes,Buffer.from('x')]));
    let qc=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.equal(qc.checks.find(c=>c.name==='ZIP package verified').ok,false);
    await writeFile(zip,bytes);
    await writeFile(join(f.dir,bookPage(2)),await artwork(9));
    qc=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.equal(qc.checks.find(c=>c.name==='approved artwork unchanged').ok,false);
    await assert.rejects(buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256,force:true}),/Approved artwork changed since handoff/);
  }finally{await f.cleanup();}
});

test('Stage 3 handoff metadata: type, page count, dimensions, formats, representative real pages, package contents',async()=>{
  const f=await built(7);
  try{
    const m=f.b.record.stage3_handoff;
    assert.equal(m.product_format,'colouring-book');assert.equal(m.page_count,7);assert.equal(m.colouring_pages,6);assert.equal(m.cover,true);
    assert.deepEqual(m.page_px,[512,768]);assert.equal(m.orientation,'portrait');
    assert.deepEqual(m.formats.map(x=>[x.key,x.files,x.pages]),[['A4',1,7],['US-Letter',1,7],[PNG_FOLDER,7,7]]);
    assert.deepEqual(m.formats[0].page_size_mm,[210,297]);
    assert.deepEqual(m.representative_pages.map(p=>[p.page_number,p.role]),[[1,'cover'],[2,'page'],[5,'page'],[7,'page']]);
    for(const r of m.representative_pages){
      assert.equal(r.sha256,f.handoff.assets.find(a=>a.id===r.asset).sha256,'the real approved artwork, by SHA-256');
      assert.equal(hash(await readFile(join(f.dir,r.file))),r.sha256);assert.match(r.delivered,new RegExp(`^${PNG_FOLDER}/`));
    }
    assert.deepEqual(m.package_contents.map(x=>[x.item,x.files]),[['START-HERE-Printing-Guide.pdf',1],['A4',1],['US-Letter',1],[PNG_FOLDER,7]]);
    assert.match(m.note,/never a redrawn page/);
  }finally{await f.cleanup();}
});

test('packaging: next-fit ZIP parts are deterministic, ordered, within Etsy limits; small products are not split',()=>{
  const o=(rel,mb)=>({rel,mb});
  const cap=ETSY_FILE_LIMIT*0.98, size=x=>x.mb*1e6;
  assert.deepEqual(packParts([o('g',0.1),o('a',5),o('b',5)],size,cap).map(p=>p.map(x=>x.rel)),[['g','a','b']],'fits one part: not split');
  const parts=packParts([o('g',0.1),o('a1',17),o('a2',9),o('l1',17),o('l2',9),o('p1',9),o('p2',9)],size,cap);
  assert.deepEqual(parts.map(p=>p.map(x=>x.rel)),[['g','a1'],['a2'],['l1'],['l2','p1'],['p2']]);
  assert.ok(parts.length<=ETSY_FILES_MAX&&parts.every(p=>p.reduce((s,x)=>s+size(x),0)<=cap));
  assert.deepEqual(packParts([o('g',0.1),o('a1',17),o('a2',9),o('l1',17),o('l2',9),o('p1',9),o('p2',9)],size,cap),parts,'deterministic');
});

test('oversized book: PDFs split into volumes and the package into Part-N ZIPs (each within Etsy limits, every file exactly once)',{timeout:300_000},async()=>{
  // Noise pages ~8.8 MB each: 3 pages cannot fit one 20 MB file in any single form.
  const noise=async seed=>{const w=1400,h=2100,raw=Buffer.alloc(w*h*3);let s=seed*7919+1;for(let i=0;i<raw.length;i++){s^=s<<13;s^=s>>>17;s^=s<<5;raw[i]=s&255;}
    return sharp(raw,{raw:{width:w,height:h,channels:3}}).png({compressionLevel:1}).toBuffer();};
  const f=await colouring(3,{size:{width:1400,height:2100}});
  try{
    for(let n=1;n<=3;n++)await writeFile(join(f.dir,bookPage(n)),await noise(n));
    await approveBook(f);
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    const b=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});
    const parts=b.record.zip_parts;
    assert.ok(parts.length>1&&parts.length<=ETSY_FILES_MAX,`${parts.length} parts`);
    assert.deepEqual(parts.map(z=>z.name),parts.map((_,i)=>`${PKG}-Part-${i+1}.zip`));
    assert.equal(b.record.zip,null,'a split package has no single ZIP');
    for(const z of parts)assert.ok(z.bytes<=ETSY_FILE_LIMIT,`${z.name} ${z.bytes}`);
    const all=parts.flatMap(z=>z.entries);assert.equal(new Set(all).size,all.length,'no file in two parts');
    assert.deepEqual([...all].sort(),Object.keys(b.record.outputs).map(r=>`${PKG}/${r}`).sort(),'parts hold exactly the deliverables');
    assert.ok(Object.values(b.record.outputs).every(o=>o.bytes<=ETSY_FILE_LIMIT));
    const a4=Object.entries(b.record.outputs).filter(([,o])=>o.variant==='A4');
    if(a4.length>1)assert.ok(a4.every(([rel])=>/-A4-Part-\d-(Pages-\d\d-\d\d|Page-\d\d)\.pdf$/.test(rel)),a4.map(([r])=>r).join());
    const qc=await runQc({productDir:f.dir,handoff});
    assert.equal(qc.passed,true,JSON.stringify(qc.checks.filter(c=>!c.ok)));
    assert.match(qc.checks.find(c=>c.name==='ZIP package verified').detail,/\d ZIP parts, \d+ entries, each deliverable exactly once/);
    assert.equal(qc.checks.find(c=>c.name==='printing guide states the page count').ok,true);
  }finally{await f.cleanup();}
});
