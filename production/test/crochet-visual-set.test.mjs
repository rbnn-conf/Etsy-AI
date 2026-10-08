// Crochet VISUAL SET (ADR-063): the deterministic visual director (hero + per-pattern preview briefs), its
// integrity rules, file QC, the Stage 2 gate and the fixed top-right preview slot in the pattern PDFs.
// FIXTURE patterns only (a Product #020-shaped autumn table set; not sellable content, never tested).
// No model, no image call, no network: every "generated" image here is a synthetic test PNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { approvedProduct, CROCHET_PAGES, writePatterns, approvePatterns } from './fixtures.mjs';
import { crochetBundle } from './crochet-fixture.mjs';
import { createHandoff, writeHandoff, buildProduction, runQc, bundleFingerprints, visualBriefs, heroSceneBrief, patternPreviewBriefs, briefProblems, visualSetProblems,
  visualFileChecks, visualSetQc, slotFit, approvedVisualSet, assetsDigest, fingerprintSha, crochetObjectOf, HERO_ASSET, HERO_FILE, previewAsset, previewFile,
  VISUAL_BRIEFS, VISUAL_MANIFEST, PREVIEW_CAPTION, MIN_PREVIEW_PPI } from '../src/index.mjs';
import { hash, sharp } from '../src/lib.mjs';
import { plan, crochetPatternBundleMoonlit, previewPlacement } from '../src/adapters/crochet-pattern-bundle.mjs';

const TABLE=[['maple-leaf-placemat','Maple Leaf Placemat','placemat','About 38 cm wide by 35 cm long','Burnt orange'],
  ['oak-leaf-applique','Oak Leaf Appliqué','applique','About 13 cm long and 6 cm wide','Burnt ochre'],
  ['beech-leaf-coaster','Beech Leaf Coaster','coaster','About 12 cm long; about 7 cm wide','Warm beech brown'],
  ['acorn-napkin-ring','Acorn Napkin Ring','napkin ring','About 6 cm across','Rust brown'],
  ['falling-leaves-table-runner','Falling Leaves Table Runner','table runner','About 100 cm long by 28 cm wide','Warm oatmeal'],
  ['chestnut-cutlery-pocket','Chestnut Cutlery Pocket','cutlery pocket','About 10 cm wide by 18 cm long','Chestnut brown']];
/** Product #020's shape (six autumn table pieces) on valid FIXTURE instructions. */
export function tableSet(){
  const b=crochetBundle({patterns:6});
  b.title='Falling Leaves Crochet Table Set';b.theme='autumn table decor';
  b.patterns.forEach((p,i)=>{const [id,name,category,size,colour]=TABLE[i];Object.assign(p,{pattern_id:id,name,category,finished_size:size});p.yarn=p.yarn.map((y,j)=>({...y,colour:j?'Dark brown':colour}));});
  return b;
}
const PRODUCT={product_id:'020',name:'Falling Leaves Crochet Table Set',season:'Autumn'};
const PLAN={patterns:TABLE.map(([pattern_id],i)=>({pattern_id,role:i?'secondary':'focal'}))};
/** A synthetic, non-blank test PNG of the given size (stands in for an image-model result). */
export async function testPng(seed,width=1024,height=1024){
  const shapes=Array.from({length:6},(_,i)=>`<circle cx="${(seed*97+i*131)%width}" cy="${(seed*53+i*89)%height}" r="${60+i*20}" fill="#${(0x8a5a2b+seed*4099+i*1031).toString(16).slice(-6)}"/>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e9dcc8"/>${shapes}</svg>`)).png().toBuffer();
}

/**
 * Write an owner-approved visual set as Stage 1 would: briefs, every image (with the given preview sizes),
 * the manifest with its approval, and product.crochet_visuals.approval bound to them.
 */
export async function approveVisualSet(f,bundle,{previewSizes=[],heroSize=[1536,1024]}={}){
  const briefs=visualBriefs({bundle,product:PRODUCT,plan:PLAN}), assets=[];
  const put=async(rel,bytes)=>{await mkdir(dirname(join(f.dir,rel)),{recursive:true});await writeFile(join(f.dir,rel),bytes);};
  const add=async(id,role,pattern_id,file,[w,h],seed)=>{const bytes=await testPng(seed,w,h);await put(file,bytes);
    assets.push({id,role,pattern_id,file,sha256:hash(bytes),width:w,height:h,model:'fake-image',fingerprint_sha256:pattern_id?briefs.previews.find(b=>b.pattern_id===pattern_id).fingerprint_sha256:null});};
  await add(HERO_ASSET,'hero',null,HERO_FILE,heroSize,1);
  for(const [i,p] of bundle.patterns.entries())await add(previewAsset(p.pattern_id),'pattern-preview',p.pattern_id,previewFile(i+1,p.pattern_id),previewSizes[i]??[1024,1024],i+2);
  await put(VISUAL_BRIEFS,JSON.stringify(briefs,null,2)+'\n');
  const at='2026-10-06T21:00:00.000Z';
  const manifest={version:1,product_id:f.product.product_id,patterns_sha256:f.product.crochet.approval.source_sha256,fingerprints:briefs.fingerprints,briefs,assets,
    provenance:{kind:'illustration',photographic_evidence:false},approval:{approved_at:at,by:'@owner',assets:assets.map(a=>({id:a.id,sha256:a.sha256}))}};
  const mBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await put(VISUAL_MANIFEST,mBytes);
  f.product.crochet_visuals={version:1,assets,approval:{approved_at:at,by:'@owner',manifest_sha256:hash(mBytes),assets_sha256:assetsDigest(assets),patterns_sha256:f.product.crochet.approval.source_sha256}};
  await writeFile(join(f.dir,'product.json'),JSON.stringify(f.product,null,2));
  return {briefs,assets,manifest};
}
const make=async()=>approvedProduct({format:'crochet-pattern-bundle',pages:CROCHET_PAGES,crochet:tableSet()});

// ---------- HERO ----------
test('HERO: Product #020-shaped set resolves all six approved products; the focal pattern leads; only non-crochet props; integrity passes',()=>{
  const b=tableSet(), F=bundleFingerprints(b), hero=heroSceneBrief({bundle:b,fingerprints:F,product:PRODUCT,focalId:'maple-leaf-placemat'});
  assert.deepEqual(hero.crochet_objects.map(o=>o.pattern_id),TABLE.map(t=>t[0]),'every approved product, each exactly once');
  assert.ok(hero.crochet_objects.every(o=>o.quantity===1&&o.fingerprint_sha256===fingerprintSha(F[o.pattern_id])),'bound to each pattern fingerprint');
  assert.equal(hero.hero_subject.pattern_id,'maple-leaf-placemat');assert.match(hero.hero_subject.staging,/beneath a plain stoneware dinner plate/);
  const staging=Object.fromEntries([hero.hero_subject,...hero.supporting_subjects].map(s=>[s.pattern_id,s.staging]));
  assert.match(staging['falling-leaves-table-runner'],/centre of the table/);assert.match(staging['acorn-napkin-ring'],/linen napkin/);
  assert.match(staging['beech-leaf-coaster'],/ceramic mug/);assert.match(staging['chestnut-cutlery-pocket'],/knife and fork/);
  assert.equal(hero.scene_type,'editorial lifestyle table setting');assert.match(hero.composition,/asymmetrical/);assert.match(hero.composition,/never a flat catalogue grid/);
  // Lifestyle props are allowed, and are never crochet; a prop never duplicates an approved crochet type (no second runner),
  // and real leaves are left out of a leaf collection (they would read as extra crochet leaves).
  for(const x of ['a plain stoneware dinner plate','a plain ceramic mug','a rolled plain linen napkin','a plain steel knife and fork','small pinecones','a lit pillar candle'])assert.ok(hero.props.includes(x),x);
  assert.ok(!hero.props.some(x=>/crochet|knit|yarn|runner|leaves/i.test(x)),hero.props.join(' | '));
  assert.deepEqual(briefProblems(hero,{bundle:b}),[]);
});

test('HERO: cannot add an unapproved crochet product, a crochet prop, vague "complementary crochet" wording or a stale fingerprint',()=>{
  const b=tableSet(), hero=heroSceneBrief({bundle:b,product:PRODUCT});
  const bad=mut=>{const h=structuredClone(hero);mut(h);return briefProblems(h,{bundle:b});};
  assert.match(bad(h=>{h.crochet_objects.push({pattern_id:'crochet-sunflower',quantity:1,fingerprint_sha256:'0'.repeat(64)});}).join(),/not an approved pattern/);
  assert.match(bad(h=>{h.props.push('a crochet doily');}).join(),/props "a crochet doily" is a crochet item/);
  assert.match(bad(h=>{h.may_show.push('knitted bunting');}).join(),/is a crochet item/);
  assert.match(bad(h=>{h.composition+='; add complementary crochet decorations';}).join(),/vague wording/);
  assert.match(bad(h=>{h.environment='a table with crochet flowers';}).join(),/environment names a crochet item/);
  assert.match(bad(h=>{h.props.push('a linen table runner');}).join(),/duplicates the approved crochet table runner/);
  assert.match(bad(h=>{h.crochet_objects[1].quantity=2;}).join(),/quantity must be 1/);
  const changed=tableSet();changed.patterns[0].finished_size='About 45 cm wide by 40 cm long';
  assert.match(briefProblems(hero,{bundle:changed}).join(),/maple-leaf-placemat: fingerprint changed/);
});

// ---------- PREVIEWS ----------
test('PREVIEWS: exactly one brief per approved pattern, in order; each keeps its pattern id and fingerprint and forbids every other pattern',()=>{
  const b=tableSet(), F=bundleFingerprints(b), pv=patternPreviewBriefs({bundle:b,fingerprints:F,product:PRODUCT});
  assert.equal(pv.length,6);
  pv.forEach((x,i)=>{
    assert.equal(x.pattern_id,TABLE[i][0]);assert.equal(x.pattern_number,i+1);assert.equal(x.pattern_name,TABLE[i][1]);
    assert.deepEqual(x.crochet_objects.map(o=>o.pattern_id),[x.pattern_id],'ONE crochet product per preview');
    assert.equal(x.fingerprint_sha256,fingerprintSha(F[x.pattern_id]));
    for(const other of TABLE.filter(t=>t[0]!==x.pattern_id))assert.ok(x.must_not_show.some(s=>s.includes(other[1])),`${x.pattern_id} forbids ${other[1]}`);
    assert.equal(x.finished_dimensions,TABLE[i][3]);assert.match(x.colour_direction,new RegExp(TABLE[i][4]));
    assert.deepEqual(briefProblems(x,{bundle:b}),[]);
  });
  assert.equal(pv[3].object_type,'napkin ring');assert.match(pv[3].styling_context,/wrapped around a rolled plain linen napkin/);
  assert.equal(pv[5].object_type,'cutlery pocket');assert.match(pv[5].styling_context,/knife and fork inserted/);
  assert.match(pv[2].styling_context,/coaster stays clearly visible/);
  // A second crochet object, or a preview pointing at another pattern, fails.
  const two=structuredClone(pv[0]);two.crochet_objects.push({...pv[1].crochet_objects[0]});
  assert.match(briefProblems(two,{bundle:b}).join(),/exactly ONE crochet product/);
  const wrong=structuredClone(pv[0]);wrong.crochet_objects=structuredClone(pv[1].crochet_objects);
  assert.match(briefProblems(wrong,{bundle:b}).join(),/exactly ONE crochet product/);
});

test('object classification follows the pattern function before its shape ("Maple Leaf Placemat" is a placemat)',()=>{
  const b=tableSet(), F=bundleFingerprints(b);
  assert.deepEqual(b.patterns.map(p=>crochetObjectOf(p,F[p.pattern_id]).type),['placemat','appliqué','coaster','napkin ring','table runner','cutlery pocket']);
  assert.equal(crochetObjectOf({name:'Fixture Daisy',category:'flower'},{motif_type:'flower'}).type,'flower');
});

// ---------- MANIFEST / QC ----------
test('QC: the manifest maps one hero + one preview per pattern; wrong mapping, a missing or an extra preview fails',async()=>{
  const b=tableSet(), briefs=visualBriefs({bundle:b,product:PRODUCT,plan:PLAN});
  const assets=[{id:HERO_ASSET,role:'hero',pattern_id:null,file:HERO_FILE},...b.patterns.map((p,i)=>({id:previewAsset(p.pattern_id),role:'pattern-preview',pattern_id:p.pattern_id,file:previewFile(i+1,p.pattern_id)}))];
  assert.deepEqual(visualSetProblems({briefs,assets,bundle:b}),[]);
  const swapped=structuredClone(assets);[swapped[1].pattern_id,swapped[2].pattern_id]=[swapped[2].pattern_id,swapped[1].pattern_id];
  assert.match(visualSetProblems({briefs,assets:swapped,bundle:b}).join(),/crochet-preview-maple-leaf-placemat: mapped to pattern-preview oak-leaf-applique/);
  assert.match(visualSetProblems({briefs,assets:assets.slice(0,-1),bundle:b}).join(),/crochet-preview-chestnut-cutlery-pocket: missing/);
  assert.match(visualSetProblems({briefs,assets:[...assets,{id:'crochet-preview-crochet-sunflower',role:'pattern-preview',pattern_id:'crochet-sunflower',file:'x.png'}],bundle:b}).join(),/not part of this collection/);
  const fewer=structuredClone(briefs);fewer.previews.pop();
  assert.match(visualSetProblems({briefs:fewer,bundle:b}).join(),/5 preview briefs for 6 approved patterns/);
});

test('file QC: missing, changed, blank, too small for print and badly cropping images fail; square/landscape/portrait previews fit the slot',async()=>{
  const files=new Map(), read=async rel=>{if(!files.has(rel))throw new Error('missing');return files.get(rel);};
  const ok=await testPng(3), blank=await sharp({create:{width:1024,height:1024,channels:3,background:'#ffffff'}}).png().toBuffer();
  files.set('ok.png',ok);files.set('blank.png',blank);files.set('tiny.png',await testPng(4,300,300));files.set('pano.png',await testPng(5,3000,1000));
  const a=(id,file,extra={})=>({id,role:'pattern-preview',pattern_id:id,file,...extra});
  const r=await visualFileChecks([a('ok','ok.png',{sha256:hash(ok),width:1024,height:1024}),a('gone','gone.png'),a('changed','ok.png',{sha256:'0'.repeat(64)}),
    a('blank','blank.png'),a('tiny','tiny.png'),a('pano','pano.png')],{readBytes:read});
  const by=id=>r.problems.filter(x=>x.startsWith(`${id}:`)).join();
  assert.equal(by('ok'),'');assert.match(by('gone'),/missing/);assert.match(by('changed'),/changed since/);assert.match(by('blank'),/blank/);
  assert.match(by('tiny'),new RegExp(`minimum ${MIN_PREVIEW_PPI}`));assert.match(by('pano'),/keep only \d+%/);
  for(const [w,h] of [[1024,1024],[1536,1024],[1024,1536]]){const f=slotFit([w,h]);assert.ok(f.ppi>=300&&f.visible>=0.5,`${w}x${h}: ${JSON.stringify(f)}`);}
});

// ---------- STAGE 2 ----------
test('Stage 2: each pattern page receives ITS preview in one fixed top-right slot; landscape/square/portrait sources keep their aspect; no text overlap; QC passes',async()=>{
  const f=await make();
  try{
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisualSet(f,b,{previewSizes:[[1024,1024],[1536,1024],[1024,1536],[1024,1024],[1536,1024],[1024,1536]]});
    const {handoff,sha256}=await writeHandoff(f.product,f.dir);
    assert.deepEqual(handoff.crochet.visual_set.previews,Object.fromEntries(b.patterns.map(p=>[p.pattern_id,previewAsset(p.pattern_id)])));
    assert.equal(handoff.crochet_layout.visual_hero,HERO_ASSET);
    assert.ok(handoff.content_sources.some(c=>c.file===VISUAL_MANIFEST),'the approved manifest is re-verified content');
    assert.ok(handoff.review_notes.some(n=>n.includes(PREVIEW_CAPTION)&&/never a photograph of a test-crocheted item/.test(n)));
    const {record}=await buildProduction({productDir:f.dir,handoff,handoffSha:sha256,adapter:crochetPatternBundleMoonlit});
    const qc=await runQc({productDir:f.dir,handoff,adapter:crochetPatternBundleMoonlit});
    const check=qc.checks.find(c=>/finished-item preview in the fixed slot/.test(c.name));
    assert.ok(check?.ok,check?.detail);assert.ok(qc.passed,qc.checks.filter(c=>!c.ok).map(c=>`${c.name}: ${c.detail}`).join('\n'));
    // Every individual pattern PDF shows exactly its own preview, at the same frame on every page; never distorted.
    const geo=new Map();
    for(const [rel,o] of Object.entries(record.outputs).filter(([,o])=>o.expect.role==='pattern-pdf')){
      const pid=o.expect.patterns[0], pl=o.placements.filter(x=>/finished-item preview/.test(x.where));
      assert.deepEqual(pl.map(x=>x.asset),[previewAsset(pid)],rel);
      const x=pl[0];assert.equal(x.page,1);assert.equal(x.placed_aspect,x.source_aspect,`${rel} aspect kept`);
      const key=o.variant.startsWith('A4')?'A4':'US';
      const g=`${x.visible_mm.join('x')}@${(x.sheet_mm[0]-x.visible_offset_mm[0]-x.visible_mm[0]).toFixed(1)},${(x.sheet_mm[1]-x.visible_offset_mm[1]-x.visible_mm[1]).toFixed(1)}`;
      geo.set(key,new Set([...(geo.get(key)??[]),g]));
      assert.ok(x.effective_ppi>=MIN_PREVIEW_PPI,`${rel} ${x.effective_ppi} ppi`);
    }
    for(const [k,s] of geo)assert.equal(s.size,1,`${k}: one preview geometry whatever the source shape (${[...s].join(' | ')})`);
    assert.deepEqual([...geo.get('A4')][0].split('@')[0],'56x70','the 56 x 70 mm slot');
  }finally{await f.cleanup();}
});

test('Stage 2 placement QC catches a wrong pattern-to-preview mapping and a missing preview',async()=>{
  const f=await make();
  try{
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisualSet(f,b);
    const h=await createHandoff(f.product,f.dir), p2=await plan(h,{design:'moonlit'});
    assert.equal(previewPlacement(h,p2)[0],true,previewPlacement(h,p2)[1]);
    const swapped=structuredClone(h), L=swapped.crochet_layout.previews;
    [L['maple-leaf-placemat'],L['oak-leaf-applique']]=[L['oak-leaf-applique'],L['maple-leaf-placemat']];
    const [ok,detail]=previewPlacement(swapped,p2);
    assert.equal(ok,false);assert.match(detail,/maple-leaf-placemat: preview missing|shows another pattern's preview/);
    // A visual set without a preview for every approved pattern never reaches layout.
    const m=JSON.parse(await readFile(join(f.dir,VISUAL_MANIFEST),'utf8'));
    assert.deepEqual(visualSetProblems({briefs:m.briefs,assets:m.assets,bundle:b}),[]);
    const h2=structuredClone(h);delete h2.crochet.visual_set.previews['chestnut-cutlery-pocket'];
    await assert.rejects(crochetPatternBundleMoonlit.manifest(h2,null,{}),/no approved preview for pattern chestnut-cutlery-pocket/);
  }finally{await f.cleanup();}
});

test('Stage 2 gate: a set that is unapproved, changed or incomplete stops production; a product without a set builds as before',async()=>{
  let f=await make();
  try{
    const plain=await createHandoff(f.product,f.dir);
    assert.equal(plain.crochet.visual_set,undefined);assert.equal(plain.crochet_layout.previews,undefined,'no set: layout unchanged');
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisualSet(f,b);
    assert.equal((await approvedVisualSet(f.product,f.dir,{bundle:b})).ok,true);
    // Unapproved
    const approval=f.product.crochet_visuals.approval;f.product.crochet_visuals.approval=null;
    await assert.rejects(createHandoff(f.product,f.dir),/CROCHET_VISUAL_SET_UNAPPROVED: .*not approved/);
    f.product.crochet_visuals.approval=approval;
    // A changed image file
    const file=join(f.dir,previewFile(2,'oak-leaf-applique')), orig=await readFile(file);
    await writeFile(file,await testPng(99));
    await assert.rejects(createHandoff(f.product,f.dir),/oak-leaf-applique\.png changed since the visual set was approved/);
    await writeFile(file,orig);
    // A changed manifest
    const mf=join(f.dir,VISUAL_MANIFEST), mOrig=await readFile(mf);
    await writeFile(mf,mOrig.toString().replace('"model": "fake-image"','"model": "other"'));
    await assert.rejects(createHandoff(f.product,f.dir),/visual-manifest\.json changed since the visual set was approved/);
    await writeFile(mf,mOrig);
    assert.ok(await createHandoff(f.product,f.dir));
  }finally{await f.cleanup();}
  // Patterns re-approved with a different fingerprint: the approved set is stale and refused.
  f=await make();
  try{
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8'));
    await approveVisualSet(f,b);
    b.patterns[0].finished_size='About 45 cm wide by 40 cm long';
    await writePatterns(f,b);const vs=f.product.crochet_visuals;await approvePatterns(f);f.product.crochet_visuals=vs;
    await assert.rejects(createHandoff(f.product,f.dir),/maple-leaf-placemat: fingerprint changed/);
  }finally{await f.cleanup();}
});

test('visualSetQc: a complete synthetic set passes; QC states that image content is the owner review, not machine-verified',async()=>{
  const f=await make();
  try{
    const b=JSON.parse(await readFile(join(f.dir,'crochet','patterns.json'),'utf8')), {briefs,assets}=await approveVisualSet(f,b);
    const qc=await visualSetQc({briefs,assets,bundle:b,readBytes:rel=>readFile(join(f.dir,rel))});
    assert.equal(qc.passed,true,qc.problems.join('; '));assert.ok(qc.checks.every(c=>c.ok));
    assert.match(qc.not_checked,/not machine-checked/);assert.match(qc.not_checked,/No stitch-level correctness/);
  }finally{await f.cleanup();}
});
