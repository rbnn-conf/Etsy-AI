// Stage 1 full-book artwork (ADR-030): the authoritative page manifest, the
// reuse of approved style proofs, the per-page image prompt, and the
// deterministic creative QC (shared with Stage 2, production/src/artwork-qc.mjs).
//
// Image generation itself happens in the workflow, one metered call per page,
// with progress saved after every page. Nothing here calls a model.
import { createHash } from 'node:crypto';
import { buildImagePrompt } from '../openai/images.mjs';
import { inspectArtwork, pageProblems, bookArtworkQc, bookContactSheet, BOOK_QC_VERSION } from '../../../production/src/index.mjs';
import { pageId, pageFile, BOOK_MANIFEST, batches, ranges } from './book-state.mjs';

export const MANIFEST_VERSION=1;
const sha=b=>createHash('sha256').update(b).digest('hex');
// Proof roles that render a real specification page (variations are extra renders of one page).
const PAGE_ROLES=new Set(['main-style','different-composition','consistency-check','primary']);
const quoted=t=>[...String(t??'').matchAll(/[“"]([^”"]{2,200})[”"]/g)].map(m=>m[1].trim());
export const specSha=p=>sha(Buffer.from(JSON.stringify(p.pages)));
/** Width and height from the PNG header (IHDR); null for anything else. */
export function pngSize(bytes){
  if(!bytes||bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
/** The proof attempt the owner approved (same rule as the Stage 2 handoff). */
export const approvedAttempt=p=>p.proofs.attempts.filter(a=>a.status==='complete'&&(!p.creative_approved_at||a.finished_at<=p.creative_approved_at)).at(-1)??null;
export const sizeOf=s=>{const [w,h]=String(s).split('x').map(Number);return {width:w,height:h};};
export const orientationOf=({width,height})=>width>height?'landscape':width<height?'portrait':'square';

/**
 * Which approved style proofs are genuinely pages of this book. A proof is
 * reused only if it renders its specification page (not a variation), was
 * made with the current creative direction from the current page text, has
 * exactly the book's pixel size, and passes the full-book page checks.
 * Read-only.
 * @returns [{page_number, proof_file, reused, reason}]
 */
export async function assessReuse({product:p,direction,size,readBytes}){
  const attempt=approvedAttempt(p);
  if(!attempt)return [];
  const out=[], taken=new Set(), want=sizeOf(size);
  for(const [i,im] of attempt.images.entries()){
    const n=Number(/proof-(\d+)\.png$/.exec(im.file)?.[1]??i+1), sel=p.proofs.selected_pages[n-1], page=p.pages.find(x=>x.page_number===im.page_number);
    const no=reason=>out.push({page_number:im.page_number,proof_file:im.file,reused:false,reason});
    if(!page){no('not a page of the specification');continue;}
    if(!PAGE_ROLES.has(sel?.role)){no(`a ${sel?.role??'unlabelled'} proof, not the page itself`);continue;}
    if(taken.has(im.page_number)){no('another proof already covers this page');continue;}
    if(attempt.direction_version!==direction.version){no(`made with creative direction v${attempt.direction_version}; the book uses v${direction.version}`);continue;}
    if(!String(im.prompt??'').includes(page.generation_prompt)){no('made from different page text than the specification');continue;}
    let bytes;
    try{bytes=await readBytes(im.file);}catch{no('proof file missing');continue;}
    const px=pngSize(bytes);
    if(!px){no('not a PNG');continue;}
    if(px.width!==want.width||px.height!==want.height){no(`${px.width}x${px.height} px; the book is ${size}`);continue;}
    let stats;
    try{stats=await inspectArtwork(bytes);}catch(err){no(`not a valid PNG (${err.message})`);continue;}
    const {fails}=pageProblems(stats,{expected:{...want,orientation:orientationOf(want)}});
    if(fails.length){no(`page check: ${fails.join('; ')}`);continue;}
    taken.add(im.page_number);
    out.push({page_number:im.page_number,proof_file:im.file,reused:true,reason:null,sha256:sha(bytes),model:im.model,size:`${px.width}x${px.height}`,generated_at:im.generated_at});
  }
  return out.sort((a,b)=>a.page_number-b.page_number);
}

/**
 * The authoritative, ordered page manifest (P001..PNNN). Derived
 * deterministically from the approved specification and creative direction:
 * no model call. Persisted before any bulk generation.
 */
export function buildBookManifest({product:p,direction,proofPages,size,model,quality,createdAt}){
  const style=`Approved style proofs (pages ${proofPages.length?proofPages.join(', '):'none reusable'}), creative direction v${direction.version}`;
  return {schema_version:MANIFEST_VERSION,product_id:p.product_id,product_name:p.name,product_format:'colouring-book',page_count:p.page_count,created_at:createdAt,
    source:{specification_sha256:specSha(p),creative_direction:{file:p.visual_direction.file,version:direction.version}},
    style_reference:{direction_version:direction.version,proof_pages:proofPages,shared_prompt:direction.shared_prompt,line_weight:direction.line_weight,line_quality:direction.line_quality,
      detail_level:direction.detail_level,colour_mode:direction.colour_mode,shading:direction.shading,background_density:direction.background_density,canvas:p.canvas},
    generation:{model,size,quality,note:'Pixel size as generated. No DPI claim: Stage 2 calculates the effective print resolution.'},
    pages:p.pages.map(pg=>({page_id:pageId(pg.page_number),page_number:pg.page_number,page_type:pg.page_type,title:pg.title,
      scene:pg.concept,composition:pg.artwork_description,subject:pg.generation_prompt,required_text:quoted(pg.generation_prompt),
      complexity:direction.detail_level,style_reference:style,negative_constraints:direction.avoid,production_notes:pg.production_notes}))};
}

/**
 * One page's image prompt: exactly the approved proofs' prompt for this page
 * (same shared style, style parameters, canvas and avoid list), plus the
 * manifest's page detail and a book-consistency paragraph, plus any owner
 * direction for the whole book or for this page.
 */
export async function bookPagePrompt({direction,product,manifest,entry,bookNotes=[],instruction=null}){
  const page=product.pages.find(x=>x.page_number===entry.page_number);
  const base=await buildImagePrompt({direction,product,page,role:null});
  const proofs=manifest.style_reference.proof_pages;
  const block=[`PAGE DETAIL: ${entry.composition}${entry.production_notes?` Notes: ${entry.production_notes}`:''}`,
    `BOOK CONSISTENCY: This is page ${entry.page_number} of ${manifest.pages.length} in one colouring book${proofs.length?` whose style the owner approved from pages ${proofs.join(', ')}`:''}. `+
      'Draw it in exactly that approved style: the same line weight and line quality, the same level of detail and colouring difficulty, the same visual density, '+
      'border treatment and page margins, the same black-and-white treatment and the same character designs where characters appear. Do not restyle this page.',
    ...bookNotes.map(n=>`OWNER DIRECTION FOR THE WHOLE BOOK: ${n.text}`),
    ...(instruction?[`OWNER CHANGE FOR THIS PAGE: ${instruction} Keep the approved book style.`]:[])].join('\n\n');
  return base.includes('\n\nCANVAS:')?base.replace('\n\nCANVAS:',`\n\n${block}\n\nCANVAS:`):`${base}\n\n${block}`;
}

/**
 * Creative QC over the book as it is on disk, plus the review contact sheets.
 * @returns {qc, sheets:[{file, bytes, from, to}]}
 */
export async function bookQc({product:p,manifest,readBytes}){
  const expected={count:p.pages.length,...sizeOf(p.book.size),orientation:orientationOf(sizeOf(p.book.size))};
  const pages=[];
  for(const e of p.book.pages){
    let bytes=null;
    if(e.file)try{bytes=await readBytes(e.file);}catch{bytes=null;}
    pages.push({page_id:e.page_id,page_number:e.page_number,bytes,sha256:e.sha256,model:e.model});
  }
  // Style reference: the approved style proofs (whether or not they are reused as pages).
  const reference=[];
  for(const im of approvedAttempt(p)?.images??[])try{reference.push(await inspectArtwork(await readBytes(im.file)));}catch{/* a missing proof only weakens the drift warning */}
  const qc=await bookArtworkQc({manifest,pages,expected,reference});
  const sheets=[];
  for(const b of batches(p.pages.length)){
    const list=manifest.pages.filter(m=>m.page_number>=b.from&&m.page_number<=b.to)
      .map(m=>({page_id:m.page_id,title:m.title,bytes:pages.find(x=>x.page_id===m.page_id)?.bytes??null,status:qc.pages[m.page_id]?.status??'fail'}));
    sheets.push({file:`book/review/pages-${String(b.from).padStart(2,'0')}-${String(b.to).padStart(2,'0')}.png`,from:b.from,to:b.to,
      bytes:await bookContactSheet(list,{title:`#${p.product_id} · pages ${b.from}–${b.to} of ${p.pages.length}`})});
  }
  return {qc:{...qc,qc_version:BOOK_QC_VERSION,manifest:{file:BOOK_MANIFEST,page_count:manifest.pages.length}},sheets};
}
export { ranges, pageFile };
