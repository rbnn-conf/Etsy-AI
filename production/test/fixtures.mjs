// Synthetic CREATIVE_APPROVED greeting card, shaped like a Stage 1 product.json.
// Deterministic pseudo-artwork (no model, no network).
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sharp, hash } from '../src/lib.mjs';
import { bookPagesDigest, PAGE_ID } from '../src/artwork-qc.mjs';
import { crochetBundle } from './crochet-fixture.mjs';
import { bundleFingerprints, visualSpec, checkVisualSpec } from '../src/index.mjs';

/** 2:3 RGB PNG with a gradient and seeded texture, so it is neither blank nor trivially compressible. */
export async function artwork(seed,{width=512,height=768}={}){
  const raw=Buffer.alloc(width*height*3);let s=seed*7919+1;
  const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3, n=rnd()*40;
    raw[i]=(120+seed*40+x/width*80+n)&255;raw[i+1]=(90+y/height*120+n)&255;raw[i+2]=(60+seed*25+n)&255;
  }
  return sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer();
}

export const PAGES=[
  {page_type:'card-front',title:'Merry Christmas',prompt:'Front. Exact title text in upper third: “Merry Christmas”.',notes:'Verify the front text.'},
  {page_type:'card-inside',title:'Inside Message',prompt:'Inside. Exact message: “Wishing you a joyful Christmas”.',notes:'Verify the message.'},
  {page_type:'card-back',title:'Back',prompt:'Back panel motif. No text.',notes:'No printed text, logo or website on this panel.'}
];

/**
 * A creatively approved product. A colouring book (full-book format) also gets
 * what Stage 1 records before Stage 2 may start: the page manifest, every page
 * in book/pages/, a passing creative QC report and the owner's full-artwork
 * approval bound to them (see approveBook). Its style proofs stay 3 images.
 */
export async function approvedProduct({status='CREATIVE_APPROVED',pages=PAGES,format='greeting-card',size,crochet=null}={}){
  const root=await mkdtemp(join(tmpdir(),'lumiumx-stage2-')), dir=join(root,'009-test-card');
  await mkdir(join(dir,'proofs','attempt-01'),{recursive:true});await mkdir(join(dir,'creative'),{recursive:true});
  const images=[], fullBook=format==='colouring-book';
  for(const [i] of (fullBook?pages.slice(0,3):pages).entries()){
    const file=`proofs/attempt-01/proof-${String(i+1).padStart(2,'0')}.png`;
    await writeFile(join(dir,file),await artwork(i+1,size));
    images.push({file,page_number:i+1,prompt:'p',model:'fake-image',size:'1024x1536',generated_at:'2026-09-27T16:00:00.000Z'});
  }
  await writeFile(join(dir,'creative','creative-direction.json'),JSON.stringify({version:2,scope:'shared-style'}));
  const product={product_id:'009',workspace:'009-test-card',name:'Robin at the Frosted Gate',slug:'robin-at-the-frosted-gate',
    product_type:'Christmas greetings card',page_count:pages.length,status,
    canvas:{orientation:'portrait',background:'illustrated',edge:'full-bleed',format_notes:'x'},
    concepts:{batches:[{batch:1,concepts:[{concept_id:'A',proposed_name:'Robin at the Frosted Gate',product_format:format,orientation:'portrait'}]}],selected:{batch:1,concept_id:'A'}},
    visual_direction:{file:'creative/creative-direction.json',version:2},
    pages:pages.map((p,i)=>({page_number:i+1,page_type:p.page_type,title:p.title,generation_prompt:p.prompt,production_notes:p.notes})),
    proofs:{selected_pages:pages.map((_,i)=>({page_number:i+1,role:['main-style','different-composition','consistency-check'][i]??'primary'})),
      attempts:[{attempt:1,dir:'proofs/attempt-01',status:'complete',direction_version:2,finished_at:'2026-09-27T16:01:00.000Z',images}]},
    creative_approved_at:'2026-09-27T16:15:38.787Z'};
  const f={root,dir,product,cleanup:()=>rm(root,{recursive:true,force:true})};
  if(format==='crochet-pattern-bundle'){await writePatterns(f,crochet??crochetBundle());await approvePatterns(f);}
  if(fullBook){
    await mkdir(join(dir,'book','pages'),{recursive:true});
    for(const [i] of pages.entries())await writeFile(join(dir,'book','pages',`${PAGE_ID(i+1)}.png`),await artwork(i+1,size));
    await approveBook(f);
  }
  await writeFile(join(dir,'product.json'),JSON.stringify(product,null,2));
  return f;
}
export const bookPage=n=>`book/pages/${PAGE_ID(n)}.png`;

// Crochet pattern bundle (ADR-041): Stage 1 artwork is the cover plus representative illustrations.
export const CROCHET_PAGES=[
  {page_type:'cover',title:'Cover artwork',prompt:'Cover illustration.',notes:''},
  {page_type:'pattern-illustration',title:'Representative illustration',prompt:'Illustration.',notes:''},
  {page_type:'motif',title:'Decorative motif',prompt:'Motif.',notes:''}];
export async function writePatterns(f,bundle){
  await mkdir(join(f.dir,'crochet'),{recursive:true});
  await writeFile(join(f.dir,'crochet','patterns.json'),JSON.stringify(bundle,null,2)+'\n');
}
/** Record the owner's APPROVE PATTERNS for the pattern source currently on disk (as Stage 1 would). */
export async function approvePatterns(f){
  const bytes=await readFile(join(f.dir,'crochet','patterns.json')), b=JSON.parse(bytes), sha=hash(bytes);
  f.product.crochet={version:1,source:{file:'crochet/patterns.json',sha256:sha},validation:{ok:true,errors:[],source_sha256:sha,at:'2026-09-27T17:00:00.000Z'},
    approval:{approved_at:'2026-09-27T17:05:00.000Z',by:'@owner',source_sha256:sha,pattern_count:b.patterns.length,origin:b.provenance.origin,
      verification:{unverified:b.patterns.filter(p=>p.verification_status!=='tested').length,tested:b.patterns.filter(p=>p.verification_status==='tested').length}}};
  await approveVisuals(f,b,sha);
  await writeFile(join(f.dir,'product.json'),JSON.stringify(f.product,null,2));
  return f.product;
}
/**
 * The pattern-derived, internally checked crochet visuals a Stage 1 Restyle writes (ADR-046/047), plus its
 * restyle record, for the patterns just approved. Tests that break one condition edit the file or the record.
 */
export async function approveVisuals(f,bundle,sha,{status='internally_checked'}={}){
  const fingerprints=bundleFingerprints(bundle), ids=bundle.patterns.map(p=>p.pattern_id), ctx={fingerprints,approvedIds:ids};
  const spec=(kind,items)=>checkVisualSpec(visualSpec({kind,items,fingerprints}),ctx);
  const doc={version:1,generated_at:'2026-09-27T16:00:00.000Z',patterns_sha256:sha,visual_match_status:status,note:'TEST FIXTURE',combination:null,fingerprints,
    specs:{cover:spec('bouquet',[{pattern_id:ids[0],quantity:1}]),overview:spec('overview',ids.slice(0,9).map(pattern_id=>({pattern_id,quantity:1}))),detail:spec('detail',[{pattern_id:ids[0],quantity:1}])}};
  await mkdir(join(f.dir,'creative'),{recursive:true});
  await writeFile(join(f.dir,'creative','visual-specs.json'),JSON.stringify(doc,null,2)+'\n');
  f.product.restyles=[{at:'2026-09-27T16:00:00.000Z',by:'@owner',reason:'test fixture',archive:'creative/history/restyle-2026-09-27T16-00-00-000Z',
    previous:{creative_approved_at:null,direction_version:1,approved_attempt:null},direction_version:2,patterns_sha256:sha,visual_specs:'creative/visual-specs.json',visual_match_status:status}];
  return doc;
}

/**
 * Record the Stage 1 full-book state for the page files currently on disk: the
 * manifest, a passing QC report and the owner's approval (as Stage 1 would after
 * APPROVE FULL BOOK). Tests that change a page call it again to model a new approval.
 */
export async function approveBook(f,{qcPassed=true}={}){
  const {dir,product:p}=f, pages=[];
  const manifest={schema_version:1,product_id:p.product_id,source:{specification_sha256:hash(Buffer.from(JSON.stringify(p.pages)))},
    pages:p.pages.map(pg=>({page_id:PAGE_ID(pg.page_number),page_number:pg.page_number,title:pg.title}))};
  const mBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await writeFile(join(dir,'book','manifest.json'),mBytes);
  for(const pg of p.pages){
    const file=bookPage(pg.page_number), bytes=await readFile(join(dir,file)), meta=await sharp(bytes).metadata();
    pages.push({page_id:PAGE_ID(pg.page_number),page_number:pg.page_number,status:'generated',source:'generated',file,sha256:hash(bytes),width:meta.width,height:meta.height,model:'fake-image',size:'1024x1536'});
  }
  const fingerprint=bookPagesDigest(pages);
  const qBytes=Buffer.from(JSON.stringify({version:1,passed:qcPassed,checks:[],warnings:[],fingerprint},null,2)+'\n');await writeFile(join(dir,'book','qc.json'),qBytes);
  p.book={version:1,manifest:{file:'book/manifest.json',sha256:hash(mBytes)},pages,qc:{passed:qcPassed,report:'book/qc.json',fingerprint},
    approval:{approved_at:'2026-09-27T17:00:00.000Z',by:'@owner',manifest_sha256:hash(mBytes),pages_sha256:fingerprint,qc_sha256:hash(qBytes)}};
  await writeFile(join(dir,'product.json'),JSON.stringify(p,null,2));
  return p;
}
