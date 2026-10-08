// Stage 3 QC: listing + images. Deterministic. A failure blocks the owner's
// review and approval.
import { readFile, access } from 'node:fs/promises';
import { basename } from 'node:path';
import { marketingQc } from '../qc.mjs';
import { sharp } from '../../../production/src/lib.mjs';
import { deriveFacts } from './facts.mjs';
import { listingProblems, claimProblems } from './claims.mjs';
import { THUMB } from './render.mjs';

const exists=p=>access(p).then(()=>true,()=>false);
const text=c=>typeof c==='string'?c:c?.text??'';
const norm=s=>String(s).toLowerCase().replace(/\s+/g,'');
export const THUMB_MIN_HEADLINE_PX=13;   // headline cap height stays readable in a 300 px Etsy thumbnail

/** Share of the canvas covered by real product artwork (union of on-canvas footprints). */
export function productShare(artwork,canvas=2000,cell=10){
  const n=canvas/cell, hit=new Uint8Array(n*n);
  // A cropped artwork counts only where it is seen (visible); a whole one by its footprint.
  for(const a of artwork??[]){const r=a.visible??a.rect;if(!r)continue;
    const x0=Math.max(0,Math.floor(r.x/cell)), x1=Math.min(n,Math.ceil((r.x+r.w)/cell)), y0=Math.max(0,Math.floor(r.y/cell)), y1=Math.min(n,Math.ceil((r.y+r.h)/cell));
    for(let y=y0;y<y1;y++)hit.fill(1,y*n+x0,y*n+x1);}
  return hit.reduce((s,v)=>s+v,0)/(n*n);
}
const SAFE=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * @param renderResults  renderSlides() output (with .artwork probes)
 * @param artManifest    prepareArt().manifest (real artwork, traced to Stage 2)
 * @param sceneShas      SHA-256 of AI backgrounds used (never allowed as product art)
 */
export async function runStage3Qc({productDir,facts,plan,listing,renderResults,artManifest,sceneShas=[]}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});

  // Stage 2 must still be exactly what was approved (re-derived from disk).
  try{const again=await deriveFacts(productDir);
    add('production package unchanged',JSON.stringify(again.sources)===JSON.stringify(facts.sources),'Stage 2 records and deliverables re-verified');}
  catch(e){add('production package unchanged',false,e.message);}

  // Listing: Etsy limits + every claim supported by production.
  const lp=listing?listingProblems(listing,facts):['no listing'];
  add('listing meets Etsy constraints and claims',!lp.length,lp.slice(0,6).join('; '));
  const copyProblems=plan.slides.flatMap(s=>[...claimProblems(text(s.copy?.headline),facts,{where:`${s.id} headline`}),...claimProblems(text(s.copy?.subline),facts,{where:`${s.id} subline`})]);
  add('image copy claims supported',!copyProblems.length,copyProblems.slice(0,6).join('; '));

  // Images: count, files, names, dimensions, not blank.
  add('image count matches plan',renderResults.length===plan.slides.length&&plan.slides.every((s,i)=>renderResults[i]?.slide===s.id),`${renderResults.length} of ${plan.slides.length}`);
  const missing=[], unsafe=[], blank=[];
  for(const r of renderResults){
    if(!await exists(r.outPath)){missing.push(r.slide);continue;}
    if(!SAFE.test(basename(r.outPath)))unsafe.push(basename(r.outPath));
    const st=await sharp(await readFile(r.outPath)).stats();
    if(Math.max(...st.channels.slice(0,3).map(c=>c.stdev))<4)blank.push(r.slide);
  }
  add('image files present',!missing.length,missing.join(', '));
  add('image filenames safe',!unsafe.length,unsafe.join(', '));
  add('no blank or corrupt images',!blank.length,blank.join(', '));

  // Real product artwork only: every image shows Stage 2 artwork, traced and unstretched.
  const allowed=new Set(artManifest.map(a=>a.sha256)), scenes=new Set(sceneShas);
  const noArt=renderResults.filter(r=>!r.artwork?.length).map(r=>r.slide);
  add('every image shows the real product artwork',!noArt.length,noArt.join(', '));
  const untraced=renderResults.flatMap(r=>(r.artwork??[]).filter(a=>!allowed.has(a.sha256)).map(()=>r.slide));
  add('product artwork traceable to Stage 2',!untraced.length,untraced.length?untraced.join(', '):`${allowed.size} traced sources`);
  const asScene=[...allowed].filter(s=>scenes.has(s));
  add('AI backgrounds never used as product artwork',!asScene.length&&renderResults.every(r=>(r.artwork??[]).every(a=>!scenes.has(a.sha256))),'');
  // AI coloured examples (colouring books): marketing illustrations, never product art, always labelled.
  if(plan.examples?.length){
    const ex=new Set(plan.examples.map(e=>e.sha256).filter(Boolean));
    add('coloured examples generated',plan.examples.every(e=>e.sha256),plan.examples.map(e=>`${e.id} ${e.sha256?'ok':'missing'}`).join(', '));
    add('coloured examples never used as product artwork',![...ex].some(s=>allowed.has(s))&&renderResults.every(r=>(r.artwork??[]).every(a=>!ex.has(a.sha256))),'');
    const unlabelled=renderResults.filter((r,i)=>plan.slides[i]?.example&&!(r.claimTokens??[]).some(t=>t.claim==='example')).map(r=>r.slide);
    add('coloured examples labelled as examples',!unlabelled.length,unlabelled.length?unlabelled.join(', '):'every example slide states it is a coloured example');
  }
  const stretched=renderResults.flatMap(r=>(r.artwork??[]).filter(a=>!a.complete||Math.abs((a.boxW/a.boxH)/(a.naturalW/a.naturalH)-1)>0.005).map(()=>r.slide));
  add('product artwork not stretched',!stretched.length,stretched.join(', '));

  // Etsy advertising, not documents: the product dominates and the headline survives the thumbnail.
  const small=renderResults.flatMap((r,i)=>{const min=plan.slides[i]?.min_product_share??0, got=productShare(r.artwork,r.width);return got+1e-9<min?[`${r.slide} ${(got*100).toFixed(0)}% < ${(min*100).toFixed(0)}%`]:[];});
  add('product artwork dominates each image',!small.length,small.length?small.join(', '):renderResults.map(r=>`${r.slide} ${(productShare(r.artwork,r.width)*100).toFixed(0)}%`).join(', '));
  const illegible=renderResults.filter(r=>!(r.headlines?.length&&Math.max(...r.headlines.map(h=>h.fontPx))*THUMB/r.width>=THUMB_MIN_HEADLINE_PX)).map(r=>r.slide);
  add('headline legible at 300 px thumbnail',!illegible.length,illegible.length?illegible.join(', '):`every headline ≥ ${Math.ceil(THUMB_MIN_HEADLINE_PX*2000/THUMB)} px on the 2000 px canvas`);
  const drift=renderResults.filter((r,i)=>{const want=norm(text(plan.slides[i]?.copy?.headline));return !want||!r.headlines?.some(h=>norm(h.text)===want);}).map(r=>r.slide);
  add('headline text rendered by code from the plan',!drift.length,drift.join(', '));
  const badThumbs=[];
  for(const r of renderResults){
    if(!r.thumbPath||!await exists(r.thumbPath)){badThumbs.push(`${r.slide} missing`);continue;}
    const m=await sharp(await readFile(r.thumbPath)).metadata();
    if(m.width!==THUMB||m.height!==THUMB)badThumbs.push(`${r.slide} ${m.width}x${m.height}`);
  }
  add(`${THUMB}x${THUMB} thumbnails generated`,!badThumbs.length,badThumbs.join(', '));

  // Existing marketing QC: branding, readable text, no clipping, no network, stamped claims vs allow-list.
  const mq=marketingQc({renderResults,marketingData:{claimIndex:facts.claims},expectAssets:plan.slides.length});
  const failed=mq.results.filter(x=>!x.pass);
  add('visual QC and stamped claims',!failed.length,failed.length?failed.slice(0,6).map(x=>`${x.asset??''} ${x.check} ${x.detail}`).join('; '):`${mq.summary.pass}/${mq.summary.total} checks; ${mq.claims.verified}/${mq.claims.total} stamped claims verified`);

  return {passed:checks.every(c=>c.ok),checks};
}
