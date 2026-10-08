// Stage 2 adapter: colouring book.
//
// The customer-facing structure is an ORDERED BOOK: every specification page,
// in page_number order, each with exactly one approved Stage 1 asset. Nothing
// is generated, redrawn, cropped or stretched: pages are placed whole at their
// own aspect ratio, centred inside safe margins, one book page per sheet
// (single-sided, so markers never bleed onto the next design).
//
// Customer files:
//   - START-HERE-Printing-Guide.pdf
//   - A4/ and US-Letter/ book PDFs (split into numbered volumes only when one
//     PDF would not fit a single Etsy file);
//   - Colouring-Pages-PNG/: every page as a PNG, PIXEL-IDENTICAL to the
//     approved artwork (lossless re-encode, verified by decoding).
// PDF image encoding follows a ladder: pixel-identical PNG first, then
// high-quality JPEG copies, then (only if still too large for Etsy's five
// files) the PNG collection is left out. The originals are never altered.
// Packaging: one ZIP when it fits Etsy's 20 MB file limit; otherwise
// deterministic Part-N ZIPs (at most Etsy's 5 files).
import { sharp, newPdf, savePdf, rgb, StandardFonts, mm, hash, ETSY_FILE_LIMIT } from '../lib.mjs';
import { HandoffError } from '../errors.mjs';

export const PAPERS=Object.freeze({'A4':{w:210,h:297,label:'A4'},'US-Letter':{w:215.9,h:279.4,label:'US Letter'}});
export const MARGIN_MM=10;           // inside every home printer's unprintable edge
export const PNG_FOLDER='Colouring-Pages-PNG';
// Etsy's safe budget for one PDF (each file must also fit a ZIP part).
const PDF_BUDGET=ETSY_FILE_LIMIT*0.9, PAGE_OVERHEAD=4_000;
export const ENCODING_LADDER=Object.freeze([
  {pdf:'lossless',pages_png:true},{pdf:95,pages_png:true},{pdf:92,pages_png:true},
  {pdf:95,pages_png:false},{pdf:90,pages_png:false},{pdf:88,pages_png:false}]);

const slug=t=>String(t).normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const roleOf=t=>/cover/i.test(String(t))?'cover':'page';
const pad=n=>String(n).padStart(2,'0');
export const packageName=h=>`LumiumX-${slug(h.product_name)||h.slug}`;

// ---------- manifest: the ordered book ----------
/** Adapter manifest merged into the handoff: { book }. Validates everything a book needs; never repairs. */
export async function manifest(h,plan,{artwork}={}){
  if(plan)throw new HandoffError('production-plan.json is not used for colouring books (the page order is the specification). Remove it to continue.');
  const problems=[];
  const pages=[...h.pages].sort((a,b)=>a.page_number-b.page_number);
  if(pages.length!==h.page_count)problems.push(`the specification lists ${pages.length} pages but page_count is ${h.page_count}`);
  const nums=pages.map(p=>p.page_number);
  if(new Set(nums).size!==nums.length)problems.push(`duplicate page numbers: ${nums.filter((n,i)=>nums.indexOf(n)!==i).join(', ')}`);
  const gaps=nums.map((n,i)=>n===i+1?null:`position ${i+1} is page ${n}`).filter(Boolean);
  if(gaps.length)problems.push(`pages are not numbered 1..${pages.length} in order (${gaps.slice(0,5).join('; ')})`);
  const assetIds=pages.map(p=>p.asset);
  const reused=assetIds.filter((id,i)=>assetIds.indexOf(id)!==i);
  if(reused.length)problems.push(`one approved image is used for more than one page (${[...new Set(reused)].join(', ')})`);
  const assetOf=id=>h.assets.find(a=>a.id===id);
  const sizes=new Set(pages.map(p=>`${assetOf(p.asset).width}x${assetOf(p.asset).height}`));
  if(sizes.size>1)problems.push(`pages have different pixel sizes (${[...sizes].join(', ')}); a book needs one consistent size`);
  const first=assetOf(pages[0]?.asset);
  if(first&&h.orientation&&((h.orientation==='portrait'&&first.width>first.height)||(h.orientation==='landscape'&&first.height>first.width)))
    problems.push(`the specification is ${h.orientation} but the approved pages are ${first.width}x${first.height} px`);
  // Decoded checks (blank pages, exact duplicates), from the approved bytes.
  if(artwork){
    const seen=new Map();
    for(const p of pages){
      const {data,info}=await sharp(artwork.get(p.asset)).raw().toBuffer({resolveWithObject:true});
      const stats=await sharp(artwork.get(p.asset)).stats();
      if(Math.max(...stats.channels.slice(0,3).map(c=>c.stdev))<2)problems.push(`page ${p.page_number} (${p.asset}) is blank`);
      const key=hash(Buffer.concat([Buffer.from(`${info.width}x${info.height}x${info.channels}`),data]));
      if(seen.has(key))problems.push(`page ${p.page_number} is an exact duplicate of page ${seen.get(key)}`);
      else seen.set(key,p.page_number);
    }
  }
  if(problems.length)throw new HandoffError(`Colouring book cannot enter production: ${problems.join('; ')}. Stage 2 never repairs or generates artwork.`);
  return {book:{pages:pages.map(p=>({page_number:p.page_number,title:p.title,page_type:p.page_type,role:roleOf(p.page_type),asset:p.asset})),
    page_px:[first.width,first.height],orientation:first.width>first.height?'landscape':'portrait',cover:pages.some(p=>roleOf(p.page_type)==='cover')}};
}
/** Things the owner must look at. */
export function reviewNotes(h,{book}){
  const notes=[];
  for(const p of h.pages)if(p.approved_text.length)notes.push(`Page ${p.page_number} (${p.page_type}, ${p.asset}): check the baked-in text reads exactly ${p.approved_text.map(t=>`"${t}"`).join(', ')}.`);
  if(!book.cover)notes.push('This book has no cover page; page 1 is a colouring page.');
  return notes;
}

// ---------- layout ----------
/** One book page on one sheet: the largest artwork-ratio box inside the margins, centred. */
export function pageLayout(paper,[pw,ph]){
  const landscape=pw>ph, sheet=landscape?{w:paper.h,h:paper.w}:{w:paper.w,h:paper.h};
  const bw=sheet.w-2*MARGIN_MM, bh=sheet.h-2*MARGIN_MM, s=Math.min(bw/pw,bh/ph), w=pw*s, h=ph*s;
  return {sheet,orientation:landscape?'landscape':'portrait',box:{x:(sheet.w-w)/2,y:(sheet.h-h)/2,w,h}};
}

// Encoded copies are expensive to make: cached per approved image and encoding.
const ENCODED=new Map();
async function encoded(sha,bytes,enc){
  const key=`${sha}|${enc}`;
  if(!ENCODED.has(key)){
    let out;
    if(enc==='lossless'){
      out=await sharp(bytes).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
      if(!await samePixels(out,bytes))out=Buffer.from(bytes);   // never ship a re-encode that changed a pixel
    }else out=await sharp(bytes).jpeg({quality:enc,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
    ENCODED.set(key,out);
  }
  return ENCODED.get(key);
}
/** Decoded pixels (size, channels and every byte) are identical. */
export async function samePixels(a,b){
  const [x,y]=await Promise.all([a,b].map(v=>sharp(v).raw().toBuffer({resolveWithObject:true})));
  return x.info.width===y.info.width&&x.info.height===y.info.height&&x.info.channels===y.info.channels&&x.data.equals(y.data);
}

/**
 * Production plan for one encoding step: every output with its sources and a
 * deterministic build function. Async because PDF volumes are sized from the
 * real encoded bytes.
 */
export async function plan(h,{imageEncoding=ENCODING_LADDER[0],artwork}={}){
  const enc=typeof imageEncoding==='object'?imageEncoding:ENCODING_LADDER[0];
  const name=packageName(h), date=new Date(h.approved.creative_approved_at??0), pages=h.book.pages, N=pages.length;
  const asset=id=>h.assets.find(a=>a.id===id);
  const layouts=Object.fromEntries(Object.entries(PAPERS).map(([k,p])=>[k,pageLayout(p,h.book.page_px)]));
  const sizes=new Map();
  if(artwork)for(const p of pages)sizes.set(p.asset,(await encoded(asset(p.asset).sha256,artwork.get(p.asset),enc.pdf)).length);
  // Volumes: consecutive pages, each PDF within one Etsy file. Same split for both papers.
  const volumes=[];let cur=[],bytes=0;
  for(const p of pages){
    const b=(sizes.get(p.asset)??0)+PAGE_OVERHEAD;
    if(cur.length&&bytes+b>PDF_BUDGET){volumes.push(cur);cur=[];bytes=0;}
    cur.push(p);bytes+=b;
  }
  if(cur.length)volumes.push(cur);
  const multi=volumes.length>1;
  const range=v=>v.length>1?`Pages-${pad(v[0].page_number)}-${pad(v.at(-1).page_number)}`:`Page-${pad(v[0].page_number)}`;
  const pdfRel=(key,v,i)=>`${key}/${name}-${key}${multi?`-Part-${i+1}-${range(v)}`:''}.pdf`;
  const pngRel=p=>`${PNG_FOLDER}/${name}-Page-${pad(p.page_number)}${p.role==='cover'?'-Cover':''}.png`;

  async function bookPdf(key,vol,i,art){
    const L=layouts[key];
    const pdf=await newPdf({title:`${h.product_name} - Colouring Book - ${PAPERS[key].label}${multi?` - Part ${i+1} of ${volumes.length}`:''}`,date}), placements=[];
    for(const p of vol){
      const a=asset(p.asset), bytes=await encoded(a.sha256,art.get(p.asset),enc.pdf);
      const img=enc.pdf==='lossless'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
      const page=pdf.addPage([mm(L.sheet.w),mm(L.sheet.h)]), b=L.box;
      page.drawImage(img,{x:mm(b.x),y:mm(b.y),width:mm(b.w),height:mm(b.h)});
      placements.push({where:`book page ${p.page_number}`,role:p.role,page_number:p.page_number,asset:p.asset,sheet_mm:[L.sheet.w,L.sheet.h].map(v=>+v.toFixed(2)),
        box_mm:[b.w,b.h].map(v=>+v.toFixed(2)),placed_mm:[b.w,b.h].map(v=>+v.toFixed(2)),offset_mm:[b.x,b.y].map(v=>+v.toFixed(2)),
        source_px:[a.width,a.height],source_aspect:+(a.width/a.height).toFixed(5),placed_aspect:+(b.w/b.h).toFixed(5),effective_ppi:Math.round(a.width/(b.w/25.4))});
    }
    return {bytes:await savePdf(pdf),placements};
  }
  const outputs=[
    {rel:'START-HERE-Printing-Guide.pdf',kind:'guide',variant:'Guide',sources:[],expect:{pages:1,size_mm:[210,297]},
      build:async()=>({bytes:await guide(h,{layouts,volumes,name,pagesPng:enc.pages_png,date}),placements:[]})},
    ...Object.keys(PAPERS).flatMap(key=>volumes.map((v,i)=>({rel:pdfRel(key,v,i),kind:'pdf',variant:key,volume:i+1,sources:v.map(p=>p.asset),
      expect:{pages:v.length,size_mm:[PAPERS[key].w,PAPERS[key].h],orientation:layouts[key].orientation},build:a=>bookPdf(key,v,i,a)}))),
    ...(enc.pages_png?pages.map(p=>({rel:pngRel(p),kind:'page-png',variant:PNG_FOLDER,page_number:p.page_number,sources:[p.asset],expect:{pixels_identical_to:p.asset},
      build:async a=>({bytes:await encoded(asset(p.asset).sha256,a.get(p.asset),'lossless'),placements:[]})})):[])];
  // Owner previews: true renders of the A4 book (cover or first page, second page, last page).
  const a4=pn=>{const i=volumes.findIndex(v=>v.some(p=>p.page_number===pn));return {rel:pdfRel('A4',volumes[i],i),page:volumes[i].findIndex(p=>p.page_number===pn)+1};};
  const picks=[...new Set([1,Math.min(2,N),N])];
  const previews=picks.map(n=>({...a4(n),label:n===1&&h.book.cover?'Cover (A4)':`Page ${n} of ${N} (A4)`}));
  return {packageName:name,date,outputs,layouts,previews,volumes:volumes.map(v=>v.map(p=>p.page_number)),
    variants:['A4','US-Letter',...(enc.pages_png?[PNG_FOLDER]:[]),'Guide'],book:{pages:N,pages_png:enc.pages_png,pdf_encoding:enc.pdf}};
}

/** Stage 3 handoff: what marketing may know about the book, from the approved files only. */
export function stage3Metadata(h,p){
  const pages=h.book.pages, N=pages.length, asset=id=>h.assets.find(a=>a.id===id);
  const colouring=pages.filter(x=>x.role!=='cover');
  const pickIdx=[...new Set([0,Math.floor(colouring.length/2),colouring.length-1])].filter(i=>i>=0&&i<colouring.length);
  const reps=[...pages.filter(x=>x.role==='cover'),...pickIdx.map(i=>colouring[i])];
  const outputs=p.outputs;
  return {product_format:'colouring-book',product_type:h.product_type,page_count:N,cover:h.book.cover,colouring_pages:colouring.length,
    page_px:h.book.page_px,orientation:h.book.orientation,
    formats:[...Object.keys(PAPERS).map(k=>({key:k,label:PAPERS[k].label,files:outputs.filter(o=>o.variant===k).length,pages:N,
      page_size_mm:[p.layouts[k].sheet.w,p.layouts[k].sheet.h],artwork_size_mm:[+p.layouts[k].box.w.toFixed(1),+p.layouts[k].box.h.toFixed(1)]})),
      ...(p.book.pages_png?[{key:PNG_FOLDER,label:'PNG pages',files:N,pages:N}]:[])],
    representative_pages:reps.map(x=>({page_number:x.page_number,title:x.title,role:x.role,asset:x.asset,file:asset(x.asset).file,sha256:asset(x.asset).sha256,
      width:asset(x.asset).width,height:asset(x.asset).height,delivered:outputs.find(o=>o.kind==='page-png'&&o.page_number===x.page_number)?.rel??null})),
    package_contents:[...new Set(outputs.map(o=>o.rel.includes('/')?o.rel.split('/')[0]:o.rel))].map(f=>({item:f,files:outputs.filter(o=>(o.rel.includes('/')?o.rel.split('/')[0]:o.rel)===f).length})),
    note:'Real product imagery for marketing must be these approved page files (or true renders of the customer PDFs); never a redrawn page.'};
}

/** Adapter QC: order, completeness, layout, pixel identity, guide claim, contact sheet. */
export async function qcChecks({handoff,record,rendered,files,productDir,artwork,writePreview}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});
  const pages=handoff.book.pages, N=pages.length, outputs=Object.entries(record.outputs);
  add('page count matches the specification',N===handoff.page_count,`${N} of ${handoff.page_count}`);
  add('page order sequential',pages.every((p,i)=>p.page_number===i+1),pages.map(p=>p.page_number).join(','));
  add('one approved image per page',new Set(pages.map(p=>p.asset)).size===N,'');
  // Each paper: volumes together hold every page exactly once, in order, with its assigned artwork.
  const order=[], layout=[];
  for(const key of Object.keys(PAPERS)){
    const vols=outputs.filter(([,o])=>o.variant===key&&o.kind==='pdf').sort(([,a],[,b])=>a.volume-b.volume);
    const seq=vols.flatMap(([,o])=>o.placements);
    if(seq.map(x=>`${x.page_number}:${x.asset}`).join()!==pages.map(p=>`${p.page_number}:${p.asset}`).join())order.push(`${key}: ${seq.map(x=>x.page_number).join(',')}`);
    for(const x of seq){
      const [sw,sh]=x.sheet_mm, [bw,bh]=x.placed_mm, [ox,oy]=x.offset_mm, paper=PAPERS[key];
      const right=sw-ox-bw, top=sh-oy-bh;
      const fits=Math.abs(Math.min(sw,sh)-Math.min(paper.w,paper.h))<0.05&&Math.abs(Math.max(sw,sh)-Math.max(paper.w,paper.h))<0.05;
      if(!fits||Math.min(ox,oy,right,top)<MARGIN_MM-0.05||Math.abs(ox-right)>0.05||Math.abs(oy-top)>0.05)layout.push(`${key} page ${x.page_number}`);
    }
  }
  add('every page in order in A4 and US Letter',!order.length,order.length?order.join('; '):`${N} pages x ${Object.keys(PAPERS).length} papers`);
  add('A4 and US Letter layout: centred inside safe margins',!layout.length,layout.length?layout.join(', '):`${MARGIN_MM} mm margins, whole page, centred`);
  // PNG pages: decoded pixels identical to the approved artwork.
  const pngs=outputs.filter(([,o])=>o.kind==='page-png');
  if(record.book?.pages_png){
    const bad=[];
    for(const [rel,o] of pngs)if(!files.has(rel)||!await samePixels(files.get(rel),artwork.get(o.expect.pixels_identical_to)))bad.push(rel);
    add('PNG pages pixel-identical to approved artwork',!bad.length&&pngs.length===N,bad.length?bad.join(', '):`${pngs.length} pages`);
  }else add('PNG pages pixel-identical to approved artwork',!pngs.length,'PNG collection left out to fit Etsy file limits');
  const sizes=new Set(pages.map(p=>{const a=handoff.assets.find(x=>x.id===p.asset);return `${a.width}x${a.height}`;}));
  add('page dimensions consistent',sizes.size===1,[...sizes].join(', '));
  const guideText=(rendered.get('START-HERE-Printing-Guide.pdf')??[]).map(p=>p.text).join(' ').replace(/\s+/g,' ');
  add('printing guide states the page count',guideText.includes(`${N} pages`),`"${N} pages"`);
  // Visual QC without AI: one contact sheet of every approved page, in book order.
  const tile=160, th=Math.round(tile*handoff.book.page_px[1]/handoff.book.page_px[0]), cols=Math.min(6,N), rows=Math.ceil(N/cols), g=12;
  const tiles=await Promise.all(pages.map(p=>sharp(artwork.get(p.asset)).resize(tile,th,{fit:'contain',background:'#ffffff'}).png().toBuffer()));
  const sheet=await sharp({create:{width:cols*tile+(cols+1)*g,height:rows*th+(rows+1)*g,channels:3,background:'#d9d4cc'}})
    .composite(tiles.map((input,i)=>({input,left:g+(i%cols)*(tile+g),top:g+Math.floor(i/cols)*(th+g)}))).png().toBuffer();
  const preview=await writePreview('contact-sheet.png',sheet,`Contact sheet: all ${N} pages in order`);
  add('contact sheet rendered',!!preview,`${N} pages`);
  return {checks,previews:preview?[preview]:[]};
}

/** One-page A4 guide. States only what the files contain; no resolution claims. */
async function guide(h,{layouts,volumes,name,pagesPng,date}){
  const pdf=await newPdf({title:`LumiumX Printing Guide - ${h.product_name}`,date});
  const page=pdf.addPage([mm(210),mm(297)]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.13,.15,.2), accent=rgb(.55,.42,.18);
  let y=790;
  const line=(text,size=10,font=regular,gap=15)=>{page.drawText(text,{x:48,y,size,font,color:ink});y-=gap;};
  page.drawRectangle({x:48,y:806,width:499,height:3,color:accent});
  line('LUMIUMX',12,bold,34);line('Your printing guide',24,bold,28);line(h.product_name,13,regular,30);
  const section=(title,lines)=>{line(title,12,bold,19);for(const t of lines)line(t);y-=10;};
  const N=h.book.pages.length, multi=volumes.length>1;
  const art=k=>`${Math.round(layouts[k].box.w)} x ${Math.round(layouts[k].box.h)} mm`;
  section(`${N} pages included`,[
    h.book.cover?`A cover and ${N-1} colouring pages, one design per page.`:`${N} colouring pages, one design per page.`,
    'This is a digital product. No physical item is shipped.']);
  section("What's in your download",[
    `- A4 folder: the whole book as ${multi?`${volumes.length} PDFs (in page order)`:'one PDF'} for A4 paper.`,
    `- US-Letter folder: the same for US Letter paper.`,
    ...(pagesPng?[`- ${PNG_FOLDER} folder: every page as a separate PNG image.`]:[]),
    ...(multi?['  The book is split into parts only to fit download size limits.']:[])]);
  section('Which file to print',['Print the PDF that matches your paper size. Each page prints on its own sheet.',
    `Artwork size on the page: A4 ${art('A4')}; US Letter ${art('US-Letter')}.`]);
  section('Print settings',['Open the PDF in a PDF reader. Print at 100% / Actual size.',
    'Print single-sided so pens and markers never bleed onto another design.',
    'Choose "black and white" or "greyscale" to save colour ink.']);
  section('Paper',['Standard printer paper works for pencils. For markers, use a heavier paper',
    'your printer supports, for example 120-200 gsm. Test one page first.']);
  section('Personal use',['Print as many copies as you need for your own personal use.',
    'Please do not resell, share or redistribute the digital files.']);
  line('Enjoy your colouring.',11,bold);
  return savePdf(pdf);
}

// artwork 'full-book': the handoff takes every page from the owner-approved Stage 1 full book (never the style proofs).
export const colouringBook=Object.freeze({format:'colouring-book',version:1,design:'standard',designName:'Standard',artwork:'full-book',manifest,reviewNotes,plan,qcChecks,stage3Metadata,
  encodingLadder:ENCODING_LADDER,packaging:{split:true}});
