// Full-book artwork state (Stage 1, ADR-030): pure helpers over product.json.
//
// A full-book format (a colouring book) is not production-ready when its
// style proofs are approved: Stage 1 must first generate every page from an
// authoritative page manifest, run the creative QC, and get the owner's
// explicit full-artwork approval. Stage 2 (production/src/handoff.mjs)
// refuses the product until then.
//
//   CREATIVE_APPROVED (style approved) -> BOOK_GENERATING -> AWAITING_BOOK_APPROVAL
//     -> APPROVE FULL BOOK -> CREATIVE_APPROVED with book.approval -> /produce
//
// No I/O here: the workflow reads files; the Telegram screens read this.

// Formats whose Stage 2 adapter declares artwork 'full-book' AND whose full
// book Stage 1 can generate (checked against production's ADAPTERS by test).
export const FULL_ARTWORK_FORMATS=Object.freeze(['colouring-book']);
// Mirrors production/src/handoff.mjs (the Stage 1 -> Stage 2 contract; checked by test).
export const BOOK_MANIFEST='book/manifest.json', BOOK_QC='book/qc.json';
export const BATCH=8;                 // pages per review contact sheet
export const HAVE=Object.freeze(['generated','reused']);
export const pageId=n=>`P${String(n).padStart(3,'0')}`;
export const pageFile=n=>`book/pages/${pageId(n)}.png`;

/** product_format of the selected concept (as openai/images.mjs productFormat). */
export function formatOf(p){
  const s=p?.concepts?.selected;
  return s?p.concepts.batches.find(b=>b.batch===s.batch)?.concepts.find(c=>c.concept_id===s.concept_id)?.product_format:undefined;
}
export const needsFullArtwork=p=>FULL_ARTWORK_FORMATS.includes(formatOf(p));
export const bookApproved=p=>!!p?.book?.approval;
/** Style approved, full artwork still to be generated, reviewed or approved. */
export const awaitingFullArtwork=p=>needsFullArtwork(p)&&!bookApproved(p)&&p.status==='CREATIVE_APPROVED';
/** In the full-book phase, or FAILED during it. */
export const inBook=p=>['BOOK_GENERATING','AWAITING_BOOK_APPROVAL'].includes(p.status)||(p.status==='FAILED'&&p.last_error?.step==='book');

/**
 * Progress from the recorded book state, or null before the book exists
 * (the workflow then assesses which approved proofs can be reused).
 * @returns {total, available, reused, generated, missing:[page numbers], failed:[page numbers], toGenerate}
 */
export function bookProgress(p){
  if(!p?.book?.pages?.length)return null;
  const pages=p.book.pages, total=p.pages.length;
  const have=pages.filter(x=>HAVE.includes(x.status));
  const missing=p.pages.map(x=>x.page_number).filter(n=>!have.some(h=>h.page_number===n));
  const pending=p.book.pending_op?1:0;
  return {total,available:have.length,reused:pages.filter(x=>x.status==='reused').length,generated:pages.filter(x=>x.status==='generated').length,
    missing,failed:pages.filter(x=>x.status==='failed').map(x=>x.page_number),toGenerate:missing.length+pending};
}
/** Review batches of BATCH pages: [{index, from, to}]. */
export const batches=total=>Array.from({length:Math.ceil(total/BATCH)},(_,i)=>({index:i+1,from:i*BATCH+1,to:Math.min(total,(i+1)*BATCH)}));
/** "1, 4-23" */
export const ranges=ns=>[...ns].sort((a,b)=>a-b).reduce((r,n)=>{const l=r.at(-1);if(l&&n===l[1]+1)l[1]=n;else r.push([n,n]);return r;},[]).map(([a,b])=>a===b?`${a}`:`${a}-${b}`).join(', ');
