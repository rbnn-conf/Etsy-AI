// Stage 2 production (ADR-024). Fixtures only: no OpenAI, no Telegram, no Etsy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, PAGES } from './fixtures.mjs';
import { createHandoff, writeHandoff, buildProduction, runQc, adapterFor, HandoffError, BUILD_RECORD, DELIVERABLES, PACKAGE_DIR } from '../src/index.mjs';
import { hash, PDFDocument, unzipSync, zipSync, renderPdf } from '../src/lib.mjs';
import { foldedLayout, SHEETS, BACK_WORDMARK } from '../src/adapters/greeting-card.mjs';

const PKG='LumiumX-Robin-at-the-Frosted-Gate';
const deliverable=(f,rel)=>join(f.dir,DELIVERABLES,PKG,rel);
// Product #009's owner decision, as data: two fronts share one inside, minimal backs.
export const TWO_DESIGNS={schema_version:1,product_id:'009',decided_by:'owner',reason:'Page 3 is a second card front.',card_variants:[
  {id:'A',name:'Merry Christmas',front_source:'proof-01',inside_source:'proof-02',back_type:'minimal'},
  {id:'B',name:'Christmas Wishes',front_source:'proof-03',inside_source:'proof-02',back_type:'minimal'}]};
const withPlan=async(f,plan)=>writeFile(join(f.dir,'production-plan.json'),JSON.stringify(plan,null,2));
async function built(opts={},plan=null){
  const f=await approvedProduct(opts);
  if(plan)await withPlan(f,plan);
  const {handoff,sha256}=await writeHandoff(f.product,f.dir);
  const b=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});
  return {...f,handoff,sha256,b};
}
const pdfPages=async path=>(await PDFDocument.load(await readFile(path))).getPages().map(p=>p.getSize()).map(({width,height})=>[+(width*25.4/72).toFixed(1),+(height*25.4/72).toFixed(1)]);
const asset=(h,id)=>h.assets.find(a=>a.id===id);

test('1 + 3 + 5: a CREATIVE_APPROVED card gets a handoff: approved assets by path + SHA-256, greeting-card adapter, one variant from the specification',async()=>{
  const f=await approvedProduct();
  try{
    const {handoff,created}=await writeHandoff(f.product,f.dir);
    assert.equal(created,true);
    assert.equal(handoff.product_format,'greeting-card');assert.deepEqual(handoff.adapter,{format:'greeting-card',version:2});
    assert.equal(adapterFor(handoff.product_format).format,'greeting-card');
    assert.deepEqual(handoff.assets.map(a=>[a.id,a.file,a.page_number]),[['proof-01','proofs/attempt-01/proof-01.png',1],['proof-02','proofs/attempt-01/proof-02.png',2],['proof-03','proofs/attempt-01/proof-03.png',3]]);
    for(const a of handoff.assets)assert.equal(a.sha256,hash(await readFile(join(f.dir,a.file))));
    assert.deepEqual(handoff.pages.map(p=>[p.asset,p.approved_text]),[['proof-01',['Merry Christmas']],['proof-02',['Wishing you a joyful Christmas']],['proof-03',[]]]);
    assert.deepEqual(handoff.card_variants,[{id:'A',name:'Robin at the Frosted Gate',source:'specification',front:{asset:'proof-01'},inside:{asset:'proof-02'},inside_left:null,back:{type:'approved',asset:'proof-03'}}]);
    assert.equal(handoff.text_rendering,'baked-into-artwork');assert.equal(handoff.sources.production_plan,null);
    assert.match(handoff.review_notes.join('\n'),/Page 3 \(back, proof-03\): the specification asks for no printed text/);
    assert.equal((await writeHandoff(f.product,f.dir)).created,false,'immutable: reused');
  }finally{await f.cleanup();}
});

test('2: products that are not creatively approved, or have no adapter or artwork, cannot enter Stage 2',async()=>{
  for(const status of ['AWAITING_CREATIVE_APPROVAL','SPEC_READY','REJECTED','FAILED']){
    const f=await approvedProduct({status});
    try{await assert.rejects(createHandoff(f.product,f.dir),e=>e instanceof HandoffError&&/needs a CREATIVE_APPROVED product/.test(e.message));}
    finally{await f.cleanup();}
  }
  let f=await approvedProduct({format:'planner'});
  try{await assert.rejects(createHandoff(f.product,f.dir),/No Stage 2 production adapter for "planner" yet \(available: greeting-card, colouring-book, crochet-pattern-bundle\)/);}finally{await f.cleanup();}
  f=await approvedProduct();
  try{
    const p={...f.product,pages:[...f.product.pages,{page_number:4,page_type:'card-inside-left',title:'x',generation_prompt:'',production_notes:''}]};
    await assert.rejects(createHandoff(p,f.dir),/No approved artwork for page 4 .*Stage 2 never generates artwork/);
  }finally{await f.cleanup();}
});

test('two fronts + shared inside + minimal backs (from an owner production plan): variants, filenames and reuse',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    assert.deepEqual(f.handoff.card_variants.map(v=>[v.id,v.name,v.front.asset,v.inside.asset,v.back.type,v.source]),
      [['A','Merry Christmas','proof-01','proof-02','minimal','production-plan'],['B','Christmas Wishes','proof-03','proof-02','minimal','production-plan']]);
    assert.equal(f.handoff.sources.production_plan.decided_by,'owner');
    assert.match(f.handoff.review_notes.join('\n'),/Page 3 \(proof-03\) is specified as the back but is used as the front of B — Christmas Wishes \(production plan\)/);
    assert.doesNotMatch(f.handoff.review_notes.join('\n'),/asks for no printed text/,'no longer a back');
    assert.deepEqual(Object.keys(f.b.record.outputs).sort(),[
      `A4/${PKG}-Christmas-Wishes-A4.pdf`,`A4/${PKG}-Merry-Christmas-A4.pdf`,
      `Card-Artwork/${PKG}-Front-A-Merry-Christmas.png`,`Card-Artwork/${PKG}-Front-B-Christmas-Wishes.png`,`Card-Artwork/${PKG}-Inside.png`,
      `Card-Panels-4x6in/${PKG}-Christmas-Wishes-Card-Panels-4x6in.pdf`,`Card-Panels-4x6in/${PKG}-Merry-Christmas-Card-Panels-4x6in.pdf`,
      'START-HERE-Printing-Guide.pdf',`US-Letter/${PKG}-Christmas-Wishes-US-Letter.pdf`,`US-Letter/${PKG}-Merry-Christmas-US-Letter.pdf`].sort());
    const out=f.b.record.outputs, roles=rel=>out[rel].placements.map(p=>`${p.role}:${p.asset??p.minimal}`);
    assert.deepEqual(roles(`A4/${PKG}-Merry-Christmas-A4.pdf`),['back:LUMIUMX','front:proof-01','inside:proof-02']);
    assert.deepEqual(roles(`A4/${PKG}-Christmas-Wishes-A4.pdf`),['back:LUMIUMX','front:proof-03','inside:proof-02'],'shared inside reused');
    assert.deepEqual(roles(`Card-Panels-4x6in/${PKG}-Christmas-Wishes-Card-Panels-4x6in.pdf`),['front:proof-03','inside:proof-02','back:LUMIUMX']);
    assert.equal(hash(await readFile(deliverable(f,`Card-Artwork/${PKG}-Inside.png`))),asset(f.handoff,'proof-02').sha256,'the shared inside is delivered once, unchanged');
    for(const v of ['Merry-Christmas','Christmas-Wishes']){
      assert.deepEqual(await pdfPages(deliverable(f,`A4/${PKG}-${v}-A4.pdf`)),[[297,210],[297,210]]);
      assert.deepEqual(await pdfPages(deliverable(f,`US-Letter/${PKG}-${v}-US-Letter.pdf`)),[[279.4,215.9],[279.4,215.9]]);
      assert.deepEqual(await pdfPages(deliverable(f,`Card-Panels-4x6in/${PKG}-${v}-Card-Panels-4x6in.pdf`)),[[101.6,152.4],[101.6,152.4],[101.6,152.4]]);
    }
    const q=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.equal(q.passed,true,JSON.stringify(q.checks.filter(c=>!c.ok)));
    for(const n of ['card variants complete','each variant uses its assigned front, inside and back','minimal back correct (wordmark only, no URL or promotion)','inside artwork referenced correctly','printing guide describes the card designs'])
      assert.equal(q.checks.find(c=>c.name===n)?.ok,true,n);
    assert.deepEqual(q.previews.map(p=>[p.label,p.source.split('/').at(-1),p.page]),[
      ['A — Merry Christmas: outside',`${PKG}-Merry-Christmas-A4.pdf`,1],['B — Christmas Wishes: outside',`${PKG}-Christmas-Wishes-A4.pdf`,1],
      ['Inside — shared by A and B',`${PKG}-Merry-Christmas-A4.pdf`,2]]);
  }finally{await f.cleanup();}
});

test('two fronts in the specification (no plan) also give two variants: no product-specific branching',async()=>{
  const f=await built({pages:[PAGES[0],{...PAGES[0],title:'Christmas Wishes'},PAGES[1]]});
  try{
    assert.deepEqual(f.handoff.card_variants.map(v=>[v.id,v.name,v.front.asset,v.inside.asset,v.back.type]),
      [['A','Merry Christmas','proof-01','proof-03','minimal'],['B','Christmas Wishes','proof-02','proof-03','minimal']]);
    assert.equal((await runQc({productDir:f.dir,handoff:f.handoff})).passed,true);
  }finally{await f.cleanup();}
});

test('one front + one inside (no back page): single card with a deterministic minimal back',async()=>{
  const f=await built({pages:[PAGES[0],PAGES[1]]});
  try{
    assert.deepEqual(f.handoff.card_variants.map(v=>[v.front.asset,v.inside.asset,v.back.type]),[['proof-01','proof-02','minimal']]);
    const a4=deliverable(f,`A4/${PKG}-Folded-Card-A4.pdf`);
    const pages=await renderPdf(a4,{dpi:24});
    assert.equal(pages[0].text.replace(/\s+/g,''),BACK_WORDMARK,'the outside has only the wordmark as text');
    assert.doesNotMatch(pages.map(p=>p.text).join(' '),/https?:|www\.|\.com|@|personal use/i,'no URL, QR text or promotion on the card');
    assert.equal((await runQc({productDir:f.dir,handoff:f.handoff})).passed,true);
  }finally{await f.cleanup();}
});

test('production-plan.json is validated strictly and never guessed',async()=>{
  const cases=[
    [{...TWO_DESIGNS,card_variants:[{...TWO_DESIGNS.card_variants[0],front_source:'proof-09'}]},/front_source "proof-09" is not an approved asset \(proof-01, proof-02, proof-03\)/],
    [{...TWO_DESIGNS,card_variants:[{...TWO_DESIGNS.card_variants[0],back_type:'fancy'}]},/back_type must be "minimal" or "approved"/],
    [{...TWO_DESIGNS,card_variants:[{...TWO_DESIGNS.card_variants[0],back_type:'approved'}]},/back_source is required/],
    [{...TWO_DESIGNS,card_variants:[TWO_DESIGNS.card_variants[0],{...TWO_DESIGNS.card_variants[1],front_source:'proof-01'}]},/Two card variants use the same front/],
    [{...TWO_DESIGNS,card_variants:[{...TWO_DESIGNS.card_variants[0],colour:'red'}]},/unknown field colour/],
    [{...TWO_DESIGNS,product_id:'010'},/production-plan\.json is for product 010, not 009/]];
  for(const [plan,re] of cases){
    const f=await approvedProduct();
    try{await withPlan(f,plan);await assert.rejects(createHandoff(f.product,f.dir),re);}finally{await f.cleanup();}
  }
});

test('the plan may change only between runs: a new plan archives the old handoff; during production it is refused',async()=>{
  const f=await approvedProduct();
  try{
    const first=await writeHandoff(f.product,f.dir);
    await withPlan(f,TWO_DESIGNS);
    await assert.rejects(writeHandoff({...f.product,status:'PRODUCTION_READY'},f.dir),/production-plan\.json changed during production/);
    const second=await writeHandoff(f.product,f.dir);   // back at CREATIVE_APPROVED (after CANCEL)
    assert.equal(second.created,true);assert.equal(second.archived,'production/handoff.v01.json');assert.notEqual(second.sha256,first.sha256);
    assert.equal(second.handoff.card_variants.length,2);
    assert.equal(JSON.parse(await readFile(join(f.dir,'production/handoff.v01.json'),'utf8')).card_variants.length,1,'old handoff kept');
  }finally{await f.cleanup();}
});

test('4: approved originals are never modified, and a changed original stops production',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    const originals=await Promise.all(f.handoff.assets.map(async a=>{const path=join(f.dir,a.file);return {path,sha:hash(await readFile(path)),mtime:(await stat(path)).mtimeMs};}));
    await buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256,force:true});
    for(const o of originals){assert.equal(hash(await readFile(o.path)),o.sha);assert.equal((await stat(o.path)).mtimeMs,o.mtime);}
    await writeFile(originals[1].path,Buffer.concat([await readFile(originals[1].path),Buffer.from('x')]));
    await assert.rejects(buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256}),/Approved artwork changed since handoff: proofs\/attempt-01\/proof-02\.png/);
  }finally{await f.cleanup();}
});

test('6 + 7 + 8: single card: A4, US Letter and native 4 x 6 in outputs; originals byte-for-byte',async()=>{
  const f=await built();
  try{
    assert.deepEqual(await pdfPages(deliverable(f,`A4/${PKG}-Folded-Card-A4.pdf`)),[[297,210],[297,210]],'A4 landscape: outside + inside');
    assert.deepEqual(await pdfPages(deliverable(f,`US-Letter/${PKG}-Folded-Card-US-Letter.pdf`)),[[279.4,215.9],[279.4,215.9]]);
    assert.deepEqual(await pdfPages(deliverable(f,`Card-Panels-4x6in/${PKG}-Card-Panels-4x6in.pdf`)),[[101.6,152.4],[101.6,152.4],[101.6,152.4]]);
    assert.deepEqual(await pdfPages(deliverable(f,'START-HERE-Printing-Guide.pdf')),[[210,297]]);
    assert.deepEqual(f.b.record.outputs[`A4/${PKG}-Folded-Card-A4.pdf`].placements.map(p=>p.where),['sheet 1 left (back)','sheet 1 right (front)','sheet 2 right (inside right)']);
    for(const [role,id] of [['Front','proof-01'],['Inside','proof-02'],['Back','proof-03']])
      assert.equal(hash(await readFile(deliverable(f,`Card-Artwork/${PKG}-${role}.png`))),asset(f.handoff,id).sha256);
  }finally{await f.cleanup();}
});

test('9: aspect ratio preserved everywhere; the folded-card panel has the artwork ratio',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    const placements=Object.values(f.b.record.outputs).flatMap(o=>o.placements).filter(p=>p.asset);
    assert.equal(placements.length,12);
    for(const p of placements)assert.ok(Math.abs(p.placed_aspect-p.source_aspect)<0.001,`${p.where} distorted`);
    for(const s of Object.values(SHEETS)){
      const L=foldedLayout(s,2/3);
      assert.ok(Math.abs(L.card.w/L.card.h-2/3)<1e-9);
      assert.ok(L.left.x>=12-1e-9&&L.left.y>=12-1e-9&&L.right.x+L.right.w<=s.w-12+1e-9,'inside the 12 mm margins');
      assert.ok(Math.abs(L.left.x-(s.w-L.right.x-L.right.w))<1e-9,'centred: sheets line up double-sided');
    }
  }finally{await f.cleanup();}
});

test('10 + 11: build record is a complete, traceable manifest; ZIP verified and within 20 MB',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    const rec=JSON.parse(await readFile(join(f.dir,BUILD_RECORD),'utf8'));
    for(const o of Object.values(rec.outputs))for(const s of o.sources)assert.equal(s.sha256,asset(f.handoff,s.asset).sha256);
    assert.deepEqual(rec.card_variants.map(v=>[v.id,v.front,v.inside,v.back]),[['A','proof-01','proof-02','minimal'],['B','proof-03','proof-02','minimal']]);
    const zip=await readFile(join(f.dir,rec.zip.file));
    assert.equal(rec.zip.file,`${PACKAGE_DIR}/${PKG}.zip`);assert.ok(zip.length<=20_000_000);
    assert.deepEqual(Object.keys(unzipSync(zip)).sort(),Object.keys(rec.outputs).map(r=>`${PKG}/${r}`).sort());
    const guide=(await renderPdf(deliverable(f,'START-HERE-Printing-Guide.pdf'),{dpi:24}))[0].text.replace(/\s+/g,' ');
    for(const claim of ['2 card designs included','A - Merry Christmas','B - Christmas Wishes','Both designs share the same inside message'])assert.ok(guide.includes(claim),claim);
    assert.doesNotMatch(guide,/300 ?(dpi|ppi)/i);
  }finally{await f.cleanup();}
});

test('12: QC fails on a tampered ZIP, a missing variant file, or a changed original',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    await writeFile(join(f.dir,f.b.record.zip.file),Buffer.from(zipSync({'x.txt':new Uint8Array([1])})));
    let q=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.equal(q.passed,false);assert.equal(q.checks.find(c=>c.name==='ZIP package verified').ok,false);
    await buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256});        // repairs only the ZIP
    assert.equal((await runQc({productDir:f.dir,handoff:f.handoff})).passed,true);
    await rm(deliverable(f,`US-Letter/${PKG}-Christmas-Wishes-US-Letter.pdf`));
    q=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.match(q.checks.find(c=>c.name==='expected files present').detail,/Christmas-Wishes-US-Letter/);
    const orig=join(f.dir,asset(f.handoff,'proof-02').file);await writeFile(orig,Buffer.concat([await readFile(orig),Buffer.from('!')]));
    q=await runQc({productDir:f.dir,handoff:f.handoff});
    assert.equal(q.checks.find(c=>c.name==='approved artwork unchanged').ok,false);
  }finally{await f.cleanup();}
});

test('15: deterministic and resumable: a rerun writes nothing; a missing output is rebuilt alone, byte-identical (minimal back font included)',async()=>{
  const f=await built({},TWO_DESIGNS);
  try{
    const first=f.b.record;
    const again=await buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256});
    assert.deepEqual(again.built,[]);assert.equal(again.skipped.length,11);
    const rel=`A4/${PKG}-Christmas-Wishes-A4.pdf`;
    await rm(deliverable(f,rel));
    const resumed=await buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256});
    assert.deepEqual(resumed.built,[rel],'only the missing file; the ZIP is unchanged because its bytes are identical');
    assert.equal(resumed.record.outputs[rel].sha256,first.outputs[rel].sha256,'deterministic bytes');
    const forced=await buildProduction({productDir:f.dir,handoff:f.handoff,handoffSha:f.sha256,force:true});
    assert.equal(forced.built.length,11);assert.equal(forced.record.zip.sha256,first.zip.sha256,'REBUILD gives identical files');
  }finally{await f.cleanup();}
});

test('14: the production package has no runtime LLM and no network client',async()=>{
  const files=[];
  const walk=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())await walk(p);else if(/\.m?js$/.test(e.name))files.push(p);}};
  await walk(join(import.meta.dirname,'..','src'));
  assert.ok(files.length>=7);
  for(const f of files){
    const text=await readFile(f,'utf8');
    assert.doesNotMatch(text,/openai|anthropic|api\.openai|gpt-|dall-e|fetch\(|automation\//i,`${f} must stay deterministic`);
  }
});

test('an unknown page role or ambiguous duplicate roles stop production instead of guessing',async()=>{
  let f=await approvedProduct({pages:[PAGES[0],{...PAGES[1],page_type:'envelope-liner'}]});
  try{await assert.rejects(createHandoff(f.product,f.dir),/page_type "envelope-liner" is not front, inside or back/);}finally{await f.cleanup();}
  f=await approvedProduct({pages:[PAGES[0],PAGES[1],{...PAGES[1],title:'Inside 2'}]});
  try{await assert.rejects(createHandoff(f.product,f.dir),/2 inside pages; add a production-plan\.json/);}finally{await f.cleanup();}
});
