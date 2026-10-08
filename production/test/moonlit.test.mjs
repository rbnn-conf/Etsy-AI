// Moonlit Meadow design-system PROTOTYPE: presentation only. Proves the new
// components keep every approved field verbatim, in order and inside its
// column (the existing text QC, unchanged), that optional images and
// decorative assets degrade gracefully, and that letter-spaced labels stay
// extractable text. Local only: fixture data, a generated PNG, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crochetBundle } from './crochet-fixture.mjs';
import { sharp, newPdf, savePdf, fontkit, renderPdf } from '../src/lib.mjs';
import { PAPERS } from '../src/crochet/design.mjs';
import { renderedTextProblems, normalText } from '../src/crochet/text-qc.mjs';
import { layoutMoonlit, moonlitLayoutProblems, drawMoonlit, emptySlots, templates, ORNAMENTS } from '../src/crochet/moonlit/index.mjs';

/** Fixture with the hard cases: a long wrapped label, an oversized step, notes, a hook-free pattern. */
function bundle(){
  const b=crochetBundle({patterns:4});
  b.title='Moonlit Meadow Fixture Pattern Bundle';
  const p=b.patterns[0];
  p.instructions[0].steps.push({label:'Prepare wire for each stamen',text:'Ch 2, then sc in the next stitch. '.repeat(3),stitch_count:12},
    {label:'Rnd 3',text:'Rep 7 times: sc in next stitch, then hdc in next stitch. '.repeat(140),stitch_count:null});
  p.notes=['Keep the tension even.','Use a stitch marker at the start of each round.'];
  b.patterns[1].notes=[];
  return b;
}
const ops=(f,pred)=>f.pages.flatMap(p=>p.ops).filter(pred);
async function draw(flow,fonts,{images=new Map(),assets}={}){
  const pdf=await newPdf({title:'Moonlit fixture',date:new Date(0)});pdf.registerFontkit(fontkit);
  const emb={};for(const [k,f] of Object.entries(fonts))emb[k]=await pdf.embedFont(f.bytes,{subset:true});
  const im=new Map();for(const [k,bytes] of images)im.set(k,await pdf.embedPng(bytes));
  drawMoonlit(pdf,flow,{fonts:emb,images:im,assets});
  return savePdf(pdf);
}

for(const paper of Object.keys(PAPERS)){
  test(`${paper}: every approved field is placed verbatim, in order, inside its column; long labels wrap; oversized steps span pages`,async()=>{
    const b=bundle(), {docs}=await layoutMoonlit(b,{paper});
    assert.deepEqual(moonlitLayoutProblems(docs,b),[]);
    const f=docs.patterns.get(b.patterns[0].pattern_id);
    const label=ops(f,o=>o.src?.field==='instructions[0].steps[1].label');
    assert.ok(label.length>1,'the long label wraps');assert.equal(normalText(label.map(o=>o.text).join(' ')),'Prepare wire for each stamen');
    const long=ops(f,o=>o.src?.field==='instructions[0].steps[2].text');
    assert.equal(normalText(long.map(o=>o.text).join(' ')),normalText(b.patterns[0].instructions[0].steps[2].text),'never shortened');
    assert.ok(new Set(f.pages.filter(p=>p.ops.some(o=>long.includes(o)))).size>1,'given the pages it needs');
    // Changing one approved word is caught by the unchanged Stage 2 check.
    const bad=structuredClone(b);bad.patterns[0].instructions[0].steps[0].text+=' Extra.';
    assert.ok(moonlitLayoutProblems(docs,bad).some(e=>/differs from approved source/.test(e)));
  });

  test(`${paper}: rendered PDF text matches the layout line by line, letter-spaced labels included; renders with decorative assets unavailable`,async()=>{
    const b=bundle(), {docs,fonts}=await layoutMoonlit(b,{paper});
    const dir=await mkdtemp(join(tmpdir(),'moonlit-'));
    try{
      for(const assets of [undefined,{disabled:true}]){
        const file=join(dir,`b-${assets?'bare':'full'}.pdf`);
        await writeFile(file,await draw(docs.bundle,fonts,{assets}));
        const pages=await renderPdf(file,{dpi:24});
        assert.equal(pages.length,docs.bundle.pages.length);
        assert.deepEqual(renderedTextProblems(docs.bundle,pages),[]);
        assert.ok(pages.some(p=>/\bCONTENTS\b/.test(p.text)),'a letter-spaced kicker extracts as one word');
      }
    }finally{await rm(dir,{recursive:true,force:true});}
  });
}

test('optional image slots: omitted cleanly when empty (the text column takes the space), drawn through a frame when supplied',async()=>{
  const b=bundle(), id=b.patterns[0].pattern_id;
  const bare=(await layoutMoonlit(b,{paper:'A4'})).docs;
  assert.equal(ops(bare.bundle,o=>o.t==='image').length,0,'no image op without an image');
  const nameOp=d=>ops(d.patterns.get(id),o=>o.src?.field==='name')[0];
  assert.equal(nameOp(bare).maxWidth,bare.patterns.get(id).width,'title uses the full width');
  const dir=await mkdtemp(join(tmpdir(),'moonlit-img-'));
  try{
    const file=join(dir,'hero.png'), png=await sharp({create:{width:300,height:450,channels:3,background:'#e8c9c0'}}).png().toBuffer();
    await writeFile(file,png);
    const slots=emptySlots();
    slots.bundleHeroImage={file,px:[300,450],crop:{x:0,y:0.2,w:1,h:0.6}};
    slots.patterns[id]={patternHeroImage:{file,px:[300,450],caption:'Illustration of the finished flower'},finishedResultImage:{file,px:[300,450]}};
    const {docs,fonts}=await layoutMoonlit(b,{paper:'A4',slots});
    assert.deepEqual(moonlitLayoutProblems(docs,b),[]);
    const imgs=ops(docs.bundle,o=>o.t==='image');
    assert.deepEqual(imgs.map(o=>o.shape),['arch','arch','rect'],'cover hero, pattern hero, finished result');
    assert.ok(nameOp(docs).maxWidth<docs.patterns.get(id).width,'title column narrows beside the hero');
    const out=join(dir,'b.pdf');await writeFile(out,await draw(docs.bundle,fonts,{images:new Map([[file,png]])}));
    assert.deepEqual(renderedTextProblems(docs.bundle,await renderPdf(out,{dpi:24})),[]);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('notes & tips come only from approved notes: each note tagged; no card when a pattern has none',async()=>{
  const b=bundle(), {docs}=await layoutMoonlit(b,{paper:'A4'});
  const f0=docs.patterns.get(b.patterns[0].pattern_id), f1=docs.patterns.get(b.patterns[1].pattern_id);
  assert.deepEqual(b.patterns[0].notes.map((_,i)=>normalText(ops(f0,o=>o.src?.field===`notes[${i}]`).map(o=>o.text).join(' '))),b.patterns[0].notes);
  assert.equal(ops(f1,o=>o.text==='NOTES & TIPS').length,0);
});

test('cover title is split, never reworded; materials are counted from the approved patterns',()=>{
  assert.deepEqual(templates.coverTitle('Moonlit Meadow Crochet Bouquet Pattern Bundle','Moonlit Meadow'),{wordmark:'Moonlit Meadow',subtitle:'Crochet Bouquet Pattern Bundle',fromTitle:true});
  assert.deepEqual(templates.coverTitle('Crochet Flowers','Moonlit Meadow'),{wordmark:'Moonlit Meadow',subtitle:'Crochet Flowers',fromTitle:false});
  const b=bundle(), R=templates.materialsRows(b);
  assert.equal(R.weights.reduce((s,r)=>s+Number(r.count.split(' ')[0]),0),b.patterns.length);
  assert.equal(R.byPattern.length,b.patterns.length);
  const needle=R.otherRows.find(r=>r.text==='Tapestry needle');assert.equal(needle.count,String(b.patterns.filter(p=>p.additional_materials.includes('Tapestry needle')).length));
});

test('decorative assets are one reusable vector library; none of them is needed to lay out a page',()=>{
  for(const k of ['moon','corner','sprig','leaf','flower','yarn','hook','scissors'])assert.ok(ORNAMENTS[k]?.parts.length,k);
});

test('reading measure: instruction, assembly, finishing and notes lines are at most 130 mm wide on both papers',async()=>{
  const {mm}=await import('../src/lib.mjs');
  for(const paper of Object.keys(PAPERS)){
    const b=bundle(), {docs}=await layoutMoonlit(b,{paper});
    const reading=ops(docs.bundle,o=>/^(instructions\[\d+\]\.steps\[\d+\]\.text|assembly|finishing|notes)/.test(o.src?.field??''));
    assert.ok(reading.length>0);
    assert.ok(reading.every(o=>o.maxWidth<=mm(130)+0.01&&o.width<=mm(130)+0.01),paper);
  }
});

test('cover descriptor counts the patterns and names them bouquet patterns (flowers, foliage, stems, wraps and vases alike)',async()=>{
  const b=bundle(), {docs}=await layoutMoonlit(b,{paper:'A4'});
  assert.ok(docs.bundle.pages[0].ops.some(o=>o.text===`${b.patterns.length} CROCHET BOUQUET PATTERNS • US TERMS`));
});

test('Moonlit adapter: the real Stage 2 build and QC pass end to end through the live registry (owner-approved switch, ADR-056)',async()=>{
  const { approvedProduct, CROCHET_PAGES } = await import('./fixtures.mjs');
  const { writeHandoff, buildProduction, runQc, ADAPTERS } = await import('../src/index.mjs');
  const { crochetPatternBundle, crochetPatternBundleMoonlit } = await import('../src/adapters/crochet-pattern-bundle.mjs');
  assert.equal(ADAPTERS['crochet-pattern-bundle'],crochetPatternBundleMoonlit,'live: Moonlit (owner approved 2026-10-06)');
  assert.deepEqual([crochetPatternBundle.design,crochetPatternBundle.version,crochetPatternBundleMoonlit.design,crochetPatternBundleMoonlit.version],['classic',1,'moonlit',2]);
  const b=crochetBundle({patterns:3});b.patterns[0].hook_size={mm:1.5,us:'US 8 steel'};
  const f=await approvedProduct({format:'crochet-pattern-bundle',pages:CROCHET_PAGES,crochet:b});
  try{
    await writeFile(join(f.dir,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'009',decided_by:'owner',reason:'fixture',
      crochet_artwork:{hero:'proof-01',motif:'proof-03',patterns:{'fixture-daisy':'proof-02'},diagrams:{'fixture-leaf':[{asset:'proof-02',caption:'Fixture diagram caption.'}]}}}));
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    const {record}=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});   // the live registry
    assert.equal(record.crochet.design,'moonlit');assert.equal(record.adapter.version,2);
    const qc=await runQc({productDir:f.dir,handoff});
    assert.deepEqual(qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`),[]);
    const A4=Object.entries(record.outputs).find(([r])=>/Complete-Bundle-A4/.test(r))[1].placements;
    const cover=A4.find(p=>p.where==='cover hero artwork');
    assert.ok(cover.visible_mm&&cover.placed_aspect===cover.source_aspect,'framed: aspect kept, visible frame recorded');
    const diagram=A4.find(p=>p.where==='pattern fixture-leaf diagram');
    assert.ok(diagram&&!diagram.visible_mm,'a diagram is shown whole, never cropped');
    assert.ok(A4.some(p=>p.where==='pattern fixture-daisy artwork'),'owner-mapped pattern artwork placed');
    // A different design is a different build: the classic adapter starts over instead of resuming Moonlit files.
    const again=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256,adapter:crochetPatternBundle});
    assert.equal(again.record.adapter.version,1);assert.equal(again.skipped.length,0);
  }finally{await f.cleanup();}
});
