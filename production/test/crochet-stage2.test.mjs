// Stage 2 crochet pattern bundle adapter (ADR-041): deliverables, deterministic
// rendering, the APPROVE PATTERNS SHA-256 gate, the artwork contract, QC.
// FIXTURE patterns only (not sellable content, never tested). No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { approvedProduct, CROCHET_PAGES, writePatterns, approvePatterns, artwork } from './fixtures.mjs';
import { crochetBundle } from './crochet-fixture.mjs';
import { createHandoff, writeHandoff, verifyHandoffSources, buildProduction, runQc, HandoffError, validateCrochetBundle, crochetIntegrity } from '../src/index.mjs';
import { unzipSync, hash } from '../src/lib.mjs';
import { plan, qcChecks, crochetPatternBundle } from '../src/adapters/crochet-pattern-bundle.mjs';
import { wrap, LayoutError } from '../src/crochet/layout.mjs';
import { loadFonts } from '../src/crochet/design.mjs';

const make=(b=crochetBundle({patterns:3}))=>approvedProduct({format:'crochet-pattern-bundle',pages:CROCHET_PAGES,crochet:b});
const withCombos=()=>{const b=crochetBundle({patterns:3});b.combinations={title:'Bouquet ideas',intro:'Fixture combinations.',items:[{name:'Fixture posy',patterns:[{pattern_id:'fixture-daisy',quantity:3},{pattern_id:'fixture-leaf',quantity:2}],notes:['Tie the stems.']}]};return b;};

test('build + QC: A4 and US Letter bundles, one PDF per pattern, index, materials, abbreviations, guide, ZIP; QC passes',async()=>{
  const f=await make(withCombos());
  try{
    // Owner production plan: one approved asset as a pattern's artwork, one as a captioned diagram.
    await writeFile(join(f.dir,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'009',decided_by:'owner',reason:'fixture',
      crochet_artwork:{hero:'proof-01',motif:'proof-03',patterns:{'fixture-daisy':'proof-02'},diagrams:{'fixture-leaf':[{asset:'proof-02',caption:'Fixture diagram caption.'}]}}}));
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    assert.equal(handoff.product_format,'crochet-pattern-bundle');assert.equal(handoff.crochet.source.sha256,f.product.crochet.approval.source_sha256);
    // The approved patterns and the checked crochet visuals (ADR-047) are both verified content.
    assert.deepEqual(handoff.content_sources,[{file:'crochet/patterns.json',sha256:f.product.crochet.approval.source_sha256},
      {file:'creative/visual-specs.json',sha256:hash(await readFile(join(f.dir,'creative','visual-specs.json')))}]);
    assert.equal(handoff.crochet.visuals.visual_match_status,'internally_checked');
    // The classic design (v1), still supported; the live registry uses Moonlit (ADR-056, tested in moonlit.test.mjs).
    const {record}=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256,adapter:crochetPatternBundle});
    const rel=Object.keys(record.outputs), role=r=>Object.values(record.outputs).filter(o=>o.expect.role===r);
    for(const paper of ['A4','US-Letter']){
      for(const r of ['bundle-pdf','pattern-index','materials-reference','abbreviations-reference'])assert.equal(role(r).filter(o=>o.variant===paper).length,1,`${r} ${paper}`);
      assert.equal(role('pattern-pdf').filter(o=>o.variant===`${paper}-Individual-Patterns`).length,3);
    }
    assert.ok(rel.includes('START-HERE-Printing-and-Crochet-Guide.pdf'));
    assert.ok(record.outputs[rel.find(r=>/Complete-Bundle-A4/.test(r))].placements.some(p=>p.where==='cover hero artwork'&&p.asset==='proof-01'));
    assert.ok(record.outputs[rel.find(r=>/Complete-Bundle-A4/.test(r))].placements.some(p=>p.where==='index thumbnail fixture-daisy'));
    assert.ok(record.outputs[rel.find(r=>/Complete-Bundle-A4/.test(r))].placements.some(p=>p.where==='pattern fixture-leaf diagram'));
    // ZIP: one file, exactly the deliverables.
    const zip=unzipSync(await readFile(join(f.dir,record.zip.file)));
    assert.deepEqual(Object.keys(zip).sort(),rel.map(r=>`${record.package}/${r}`).sort());
    const qc=await runQc({productDir:f.dir,handoff,adapter:crochetPatternBundle});
    assert.equal(qc.passed,true,qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('; '));
    for(const n of ['pattern source matches the owner approval','all approved patterns included (A4 and US Letter, bundle and individual)','instruction text matches the approved source exactly',
      'materials, hook sizes, assembly and finishing rendered in every pattern PDF','no page overflow or text clipping','pattern index page numbers correct','A4 generated','US Letter generated',
      'no unsupported testing or guarantee claims','ZIP package verified','PDFs valid: page counts, sizes and orientation','no blank pages','artwork present and valid'])
      assert.ok(qc.checks.find(c=>c.name===n)?.ok,n);
    assert.equal(qc.previews.length,4);
    assert.equal(record.stage3_handoff.integrity.all_tested,false);assert.equal(record.stage3_handoff.deliverables.individual_pattern_pdfs,3);
  }finally{await f.cleanup();}
});

test('deterministic rendering: the same approved source gives byte-identical PDFs',async()=>{
  const f=await make();
  try{
    const h=await createHandoff(f.product,f.dir), art=new Map();for(const a of h.assets)art.set(a.id,await readFile(join(f.dir,a.file)));
    const [a,b]=[await plan(h,{}),await plan(h,{})];
    assert.deepEqual(a.outputs.map(o=>[o.rel,o.expect.pages]),b.outputs.map(o=>[o.rel,o.expect.pages]));
    for(const r of [a.outputs[1],a.outputs.find(o=>o.expect.role==='pattern-pdf')]){
      const x=await r.build(art), y=await b.outputs.find(o=>o.rel===r.rel).build(art);
      assert.ok(x.bytes.equals(y.bytes),r.rel);
    }
  }finally{await f.cleanup();}
});

test('APPROVE PATTERNS gate: no approval, a changed source, or a changed count is refused; content re-verified after handoff',async()=>{
  const f=await make();
  try{
    const saved=f.product.crochet;
    await assert.rejects(createHandoff({...f.product,crochet:{...saved,approval:null}},f.dir),e=>e instanceof HandoffError&&/not approved yet.*creative approval is not pattern approval/.test(e.message));
    const h=await createHandoff(f.product,f.dir);
    // Edited after approval: refused until revalidated and approved again.
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));b.patterns[0].finishing=['Fasten off.'];
    await writePatterns(f,b);
    await assert.rejects(createHandoff(f.product,f.dir),/changed after APPROVE PATTERNS/);
    await assert.rejects(verifyHandoffSources(h,f.dir),/Approved content changed since handoff: crochet\/patterns\.json/);
    // Re-approved: accepted again (the new bytes are bound).
    await approvePatterns(f);
    assert.equal((await createHandoff(f.product,f.dir)).crochet.source.sha256,f.product.crochet.approval.source_sha256);
    await assert.rejects(createHandoff({...f.product,crochet:{...f.product.crochet,approval:{...f.product.crochet.approval,pattern_count:9}}},f.dir),/3 patterns; 9 were approved/);
    // An invalid source can never be approved into production (the validator runs again).
    const bad=crochetBundle({patterns:3});bad.patterns[1].instructions=[];await writePatterns(f,bad);await approvePatterns(f);
    await assert.rejects(createHandoff(f.product,f.dir),/never invents crochet instructions/);
  }finally{await f.cleanup();}
});

test('artwork contract: explicit mappings only; unknown assets or patterns, uncaptioned diagrams and blank art stop production',async()=>{
  const f=await make();
  const plan_=ca=>writeFile(join(f.dir,'production-plan.json'),JSON.stringify({schema_version:1,product_id:'009',decided_by:'owner',reason:'x',crochet_artwork:ca}));
  try{
    const h=await createHandoff(f.product,f.dir);
    assert.deepEqual([h.crochet_layout.hero,h.crochet_layout.motif,h.crochet_layout.patterns],['proof-01','proof-03',{}],'default: cover page hero, motif page; no pattern artwork is ever inferred');
    for(const [ca,re] of [[{hero:'proof-09'},/"proof-09" is not an approved asset/],[{patterns:{'no-such':'proof-02'}},/"no-such" is not a pattern/],
      [{diagrams:{'fixture-leaf':[{asset:'proof-02',caption:''}]}},/owner's caption is required/],[{photos:{}},/crochet_artwork\.photos is not an artwork slot/]]){
      await plan_(ca);await assert.rejects(createHandoff(f.product,f.dir),re);
    }
  }finally{await f.cleanup();}
  const g=await make();
  try{
    const blank=await (await import('../src/lib.mjs')).sharp({create:{width:512,height:768,channels:3,background:'#ffffff'}}).png().toBuffer();
    await writeFile(join(g.dir,'proofs','attempt-01','proof-01.png'),blank);
    await assert.rejects(createHandoff(g.product,g.dir),/approved asset proof-01 is blank/);
  }finally{await g.cleanup();}
  void artwork;
});

test('text is never replaced or shortened: unprintable characters and unbreakable words fail clearly',async()=>{
  const b=crochetBundle({patterns:2});b.patterns[0].finishing=['Fasten off 🧶 and weave in ends.'];
  const f=await make(b);
  try{
    const h=await createHandoff(f.product,f.dir);
    await assert.rejects(plan(h,{}),e=>e instanceof HandoffError&&/cannot print \("🧶" U\+1F9F6; at \$\.patterns\[0\]\.finishing\[0\]\).*never replaces text/.test(e.message));
  }finally{await f.cleanup();}
  const fonts=await loadFonts();
  assert.throws(()=>wrap('x'.repeat(400),fonts.body,10.5,200),LayoutError);
  assert.deepEqual(wrap('a b\nc',fonts.body,10.5,200),['a b','c'],'source line breaks are kept');
});

test('long patterns paginate with a continuation header; every step is still placed verbatim',async()=>{
  const b=crochetBundle({patterns:2});
  b.patterns[1].instructions[0].steps=Array.from({length:70},(_,i)=>({label:`Row ${i+2}`,text:`Ch 1, sc in each st across, turn. This is fixture row ${i+2} with enough words to wrap onto a second line in the column.`,stitch_count:10}));
  const f=await make(b);
  try{
    const h=await createHandoff(f.product,f.dir), p=await plan(h,{});
    const flow=p.layouts.A4.docs.patterns.get('fixture-leaf');
    assert.ok(flow.pages.length>2,`${flow.pages.length} pages`);
    assert.ok(flow.pages.slice(1).every(pg=>pg.meta.continued&&pg.ops.some(o=>o.text==='Fixture Leaf (continued)')));
    const placed=flow.pages.flatMap(pg=>pg.ops).filter(o=>o.src?.field==='instructions[0].steps[69].text').map(o=>o.text).join(' ');
    assert.equal(placed,b.patterns[1].instructions[0].steps[69].text);
  }finally{await f.cleanup();}
});

test('AI-assisted origin: unverified by default, "tested" needs evidence, no guarantees; integrity counts',()=>{
  const ai=()=>{const b=crochetBundle({patterns:2});b.provenance={author:'LumiumX, AI-assisted draft (fixture)',origin:'ai-assisted-draft'};
    for(const p of b.patterns){p.origin='ai-assisted-draft';p.verification_status='unverified';}return b;};
  assert.deepEqual(validateCrochetBundle(ai()).errors,[]);
  let b=ai();delete b.patterns[0].verification_status;
  assert.match(validateCrochetBundle(b).errors.join(),/verification_status: required for an ai-assisted-draft pattern/);
  b=ai();b.patterns[0].verification_status='tested';
  assert.match(validateCrochetBundle(b).errors.join(),/"tested" needs a testing record/);
  b=ai();b.patterns[0].verification_status='verified';
  assert.match(validateCrochetBundle(b).errors.join(),/verification_status: must be one of unverified, tested/);
  b=ai();b.patterns[0].testing={status:'tested',tested_by:'Fixture tester',tested_on:'2026-09-01',evidence:'Made one.'};
  assert.match(validateCrochetBundle(b).errors.join(),/the testing record says tested; set verification_status/);
  b.patterns[0].verification_status='tested';assert.deepEqual(validateCrochetBundle(b).errors,[],'real evidence may be recorded later');
  for(const t of ['Verified Crochet Flowers','Guaranteed Crochet Flowers','Error-free Crochet Flowers']){b=ai();b.title=t;assert.ok(!validateCrochetBundle(b).ok,t);}
  b=ai();b.combinations={title:'Ideas',items:[{name:'x',patterns:[{pattern_id:'nope',quantity:1}]}]};
  assert.match(validateCrochetBundle(b).errors.join(),/"nope" is not a pattern in this bundle/);
  assert.deepEqual(crochetIntegrity(ai()),{origin:'ai-assisted-draft',origins:{'ai-assisted-draft':2},verification:{unverified:2,tested:0},all_tested:false,any_ai_assisted:true,tested_pattern_ids:[]});
});

test('QC catches a rendered PDF that lost approved text, and any testing claim in an untested collection',async()=>{
  const f=await make();
  try{
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    const {record}=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256});
    const rel=Object.entries(record.outputs).find(([,o])=>o.expect.role==='pattern-pdf'&&o.variant==='A4-Individual-Patterns')[0];
    const art=new Map();for(const a of handoff.assets)art.set(a.id,await readFile(join(f.dir,a.file)));
    const rendered=new Map([[rel,[{page:1,text:'Fixture Daisy Tested pattern. Materials only, no instructions.'}]]]);
    const {checks}=await qcChecks({handoff,record,rendered,productDir:f.dir,artwork:art});
    assert.equal(checks.find(c=>c.name==='materials, hook sizes, assembly and finishing rendered in every pattern PDF').ok,false);
    assert.equal(checks.find(c=>c.name==='no unsupported testing or guarantee claims').ok,false);
  }finally{await f.cleanup();}
  assert.equal(crochetPatternBundle.content,'crochet-patterns');
});

test('overview artwork slot: a Stage 1 "collection overview" page is placed on the welcome page (never inferred as pattern art)',async()=>{
  const pages=CROCHET_PAGES.map((p,i)=>i===1?{...p,page_type:'collection-overview',title:'Collection overview'}:p);
  const f=await approvedProduct({format:'crochet-pattern-bundle',pages,crochet:crochetBundle({patterns:2})});
  try{
    const h=await createHandoff(f.product,f.dir);
    assert.deepEqual([h.crochet_layout.hero,h.crochet_layout.overview,h.crochet_layout.motif,h.crochet_layout.patterns],['proof-01','proof-02','proof-03',{}]);
    const p=await plan(h,{}), welcome=p.layouts.A4.docs.bundle.pages.find(pg=>pg.kind==='welcome');
    assert.ok(welcome.ops.some(o=>o.t==='image'&&o.asset==='proof-02'&&o.where==='welcome collection overview artwork'));
  }finally{await f.cleanup();}
});
