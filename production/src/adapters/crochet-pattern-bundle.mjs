// Stage 2 adapter: crochet pattern bundle (ADR-041).
//
// Input: the owner-approved pattern source (products/<id>/crochet/patterns.json,
// bound by SHA-256 to the APPROVE PATTERNS record; see ../handoff.mjs) and the
// approved Stage 1 creative artwork. Deterministic: no model, no network.
// The instructions are placed verbatim; nothing is written, completed,
// repaired or inferred, and no image is ever read to make an instruction.
//
// Artwork slots (Stage 2 places approved assets, never generates them):
//   hero          required: the owner's production plan, else the specification's
//                 cover page, else page 1 (always an approved asset).
//   overview      optional: plan, else a page typed overview/collection/index; shown on the welcome page.
//   motif         optional: plan, else a page typed motif/decor/ornament/divider; the back page
//                 uses the hero when there is none.
//   patterns      optional, per pattern: ONLY from the owner's production plan. Without one a
//                 pattern page is typographic and its index row shows its number.
//   diagrams      optional, per pattern: ONLY from the owner's production plan, with a caption.
//   previews      per pattern, MANDATORY once the product has an owner-approved crochet visual set
//                 (ADR-063): its finished-item preview, in the pattern page's fixed top-right slot,
//                 captioned as an illustration. A pattern without its preview stops production.
// A mapping to an unknown asset or pattern stops production; nothing is guessed.
//
// Customer files (deliverables.mjs): START-HERE guide; per paper (A4, US Letter)
// the complete bundle, pattern index, materials and tools, abbreviations, and
// one PDF per pattern. Packaging: one ZIP when it fits, else Part-N ZIPs.
import { sharp, newPdf, savePdf, fontkit, mm, hash } from '../lib.mjs';
import { HandoffError } from '../errors.mjs';
import { assertCrochetBundle, validateCrochetBundle, crochetIntegrity, isTested, CROCHET_FORMAT, AI_ORIGIN, PATTERN_SOURCE } from '../crochet/bundle.mjs';
import { crochetDeliverablePlan, crochetPackageName, GUIDE_FILE, individualFolder } from '../crochet/deliverables.mjs';
import { loadFonts, widthOf, PAPERS, missingGlyphs } from '../crochet/design.mjs';
import { unprintableCharacters } from '../crochet/printable.mjs';
import { Flow, addFolios, drawPages } from '../crochet/layout.mjs';
import { layoutMoonlit, drawMoonlit, loadMoonlitFonts, MOONLIT_MEADOW } from '../crochet/moonlit/index.mjs';
import { sourceTextProblems, renderedTextProblems, instructionBoundsProblems } from '../crochet/text-qc.mjs';
import * as T from '../crochet/templates.mjs';
import { listingFacts } from '../crochet/fingerprint.mjs';
import { PREVIEW_CAPTION, MIN_PREVIEW_PPI } from '../crochet/visual-set.mjs';

export const ENCODING_LADDER=Object.freeze([{img:'png'},{img:92},{img:85}]);
export const PLAN_KEYS=Object.freeze(['hero','overview','motif','patterns','diagrams']);
const MOTIF=/motif|decor|ornament|divider|border|spot/i, COVER=/cover|hero/i, OVERVIEW=/overview|collection|index/i;
const TESTED_WORDS=/\b(tested|test[- ]crocheted|verified|guaranteed|error[- ]free)\b/i;

// ---------- manifest: approved content + artwork slots ----------
/** Adapter manifest merged into the handoff: { crochet_layout }. Validates everything; never repairs. */
export async function manifest(h,plan,{artwork}={}){
  const bundle=assertCrochetBundle(h.crochet?.bundle,PATTERN_SOURCE);
  const assets=new Map(h.assets.map(a=>[a.id,a])), ids=new Set(bundle.patterns.map(p=>p.pattern_id)), problems=[];
  const pageAsset=re=>h.pages.find(p=>re.test(p.page_type))?.asset??null;
  let ca=null;
  if(plan){
    for(const k of Object.keys(plan))if(!['schema_version','product_id','decided_by','reason','crochet_artwork'].includes(k))problems.push(`production-plan.json: unexpected field "${k}"`);
    ca=plan.crochet_artwork;
    if(!ca||typeof ca!=='object')problems.push('production-plan.json: crochet_artwork {hero, motif, patterns, diagrams} is required for a crochet pattern bundle');
    else for(const k of Object.keys(ca))if(!PLAN_KEYS.includes(k))problems.push(`production-plan.json: crochet_artwork.${k} is not an artwork slot (${PLAN_KEYS.join(', ')})`);
  }
  const need=(id,where)=>{if(!assets.has(id)){problems.push(`${where}: "${id}" is not an approved asset (${[...assets.keys()].join(', ')})`);return null;}return id;};
  const hero=ca?.hero?need(ca.hero,'crochet_artwork.hero'):pageAsset(COVER)??h.pages[0]?.asset;
  const motif=ca&&'motif' in ca?(ca.motif===null?null:need(ca.motif,'crochet_artwork.motif')):pageAsset(MOTIF);
  // Optional collection overview illustration (welcome page): plan, else a page typed overview/collection/index.
  const overview=ca&&'overview' in ca?(ca.overview===null?null:need(ca.overview,'crochet_artwork.overview')):(()=>{const id=pageAsset(OVERVIEW);return id&&id!==hero?id:null;})();
  const patterns={}, diagrams={};
  for(const [pid,id] of Object.entries(ca?.patterns??{})){
    if(!ids.has(pid))problems.push(`crochet_artwork.patterns: "${pid}" is not a pattern in the approved source`);
    else if(need(id,`crochet_artwork.patterns.${pid}`))patterns[pid]=id;
  }
  for(const [pid,list] of Object.entries(ca?.diagrams??{})){
    if(!ids.has(pid)){problems.push(`crochet_artwork.diagrams: "${pid}" is not a pattern in the approved source`);continue;}
    if(!Array.isArray(list)||!list.length){problems.push(`crochet_artwork.diagrams.${pid}: a non-empty list of {asset, caption}`);continue;}
    diagrams[pid]=[];
    for(const [i,d] of list.entries()){
      if(!d||typeof d.caption!=='string'||!d.caption.trim())problems.push(`crochet_artwork.diagrams.${pid}[${i}].caption: the owner's caption is required (a diagram is never described by code)`);
      else if(need(d.asset,`crochet_artwork.diagrams.${pid}[${i}]`))diagrams[pid].push({asset:d.asset,caption:d.caption});
    }
  }
  if(!hero)problems.push('no hero artwork: the specification has no approved page asset');
  // The approved crochet visual set (ADR-063): every pattern gets its own preview; nothing else may claim that slot.
  const previews={}, vs=h.crochet?.visual_set;
  if(vs)for(const p of bundle.patterns){
    const id=vs.previews?.[p.pattern_id], a=id&&assets.get(id);
    if(!a||a.role!=='pattern-preview'||a.pattern_id!==p.pattern_id){problems.push(`crochet visual set: no approved preview for pattern ${p.pattern_id}`);continue;}
    if(patterns[p.pattern_id])problems.push(`crochet_artwork.patterns.${p.pattern_id}: the approved visual set already supplies this pattern's preview`);
    previews[p.pattern_id]=id;
  }
  // Every placed asset: decodable and not blank (checked from the approved bytes).
  const used=[...new Set([hero,overview,motif,...Object.values(patterns),...Object.values(previews),...Object.values(diagrams).flat().map(d=>d.asset)].filter(Boolean))];
  if(artwork)for(const id of used){
    try{const s=await sharp(artwork.get(id)).stats();if(Math.max(...s.channels.slice(0,3).map(c=>c.stdev))<2)problems.push(`approved asset ${id} is blank`);}
    catch(e){problems.push(`approved asset ${id} cannot be decoded (${e.message})`);}
  }
  if(problems.length)throw new HandoffError(`Crochet pattern bundle cannot enter production: ${problems.join('; ')}. Stage 2 never generates, guesses or repairs artwork or instructions.`);
  return {crochet_layout:{hero,overview,motif,patterns,diagrams,...(vs?{previews,visual_hero:vs.hero}:{}),used,artwork_source:plan?'production-plan.json (owner)':'specification page roles (default)'}};
}

/** Things the owner must look at. */
export function reviewNotes(h,{crochet_layout:L}){
  const b=h.crochet.bundle, i=crochetIntegrity(b), notes=[];
  if(i.any_ai_assisted)notes.push(`${i.origins[AI_ORIGIN]} of ${b.patterns.length} patterns are AI-assisted drafts (verification: ${i.verification.unverified} unverified, ${i.verification.tested} tested). Owner approval for production is not testing: never market them as tested.`);
  else if(!i.all_tested)notes.push(`${i.verification.unverified} of ${b.patterns.length} patterns have no testing evidence: never market them as tested.`);
  if(L.previews&&Object.keys(L.previews).length)notes.push(`Each of the ${Object.keys(L.previews).length} pattern pages shows its owner-approved finished-item preview (top right), captioned "${PREVIEW_CAPTION}": an AI-generated illustration, never a photograph of a test-crocheted item.`);
  else if(!Object.keys(L.patterns).length)notes.push('No per-pattern artwork is mapped: pattern pages and the index are typographic (add crochet_artwork.patterns to production-plan.json to place approved artwork).');
  notes.push(`Cover artwork: ${L.hero}${L.motif?`; back page motif: ${L.motif}`:''}. Artwork is an illustration from Stage 1, not a photograph of a crocheted item.`);
  for(const p of h.pages)if(p.approved_text.length)notes.push(`Artwork page ${p.page_number} (${p.page_type}, ${p.asset}): check the baked-in text reads exactly ${p.approved_text.map(t=>`"${t}"`).join(', ')}.`);
  return notes;
}

// ---------- layout ----------
/** Deterministic layout of every document for one paper, in the adapter's design. */
export async function layoutDocuments(h,{paper,slots,design='classic'}){
  if(design==='moonlit')return layoutMoonlit(h.crochet.bundle,{paper,slots:moonlitSlots(h),theme:MOONLIT_MEADOW,files:{individual:h.crochet.bundle.patterns.length}});
  const fonts=await loadFonts(), b=h.crochet.bundle, P=PAPERS[paper];
  const ctx={bundle:b,slots,width:(t,f,s)=>widthOf(fonts[f],t,s),files:{individual:b.patterns.length},pageOf:null};
  const flow=(running)=>new Flow({paper:P,fonts,running});
  const bundleDoc=pageOf=>{
    const f=flow({left:b.title});ctx.pageOf=pageOf;
    T.cover(f,ctx);T.welcome(f,ctx);T.index(f,ctx);T.materials(f,ctx);T.abbreviations(f,ctx);
    b.patterns.forEach((p,i)=>T.pattern(f,ctx,p,i+1));
    if(b.combinations)T.combinations(f,ctx);
    T.back(f,ctx);addFolios(f);return f;
  };
  // Two passes: the index shows each pattern's page in the complete bundle (its pagination does not depend on the numbers).
  const first=bundleDoc(null), pageOf=new Map();
  first.pages.forEach((pg,i)=>{if(pg.kind==='pattern'&&!pg.meta.continued)pageOf.set(pg.meta.pattern_id,i+1);});
  const docs={bundle:bundleDoc(pageOf)};ctx.pageOf=pageOf;
  const single=(fn,...a)=>{const f=flow({left:b.title});fn(f,ctx,...a);addFolios(f);return f;};
  docs.index=single(T.index,{standalone:true});
  docs.materials=single(T.materials);
  docs.abbreviations=single(T.abbreviations);
  docs.patterns=new Map(b.patterns.map((p,i)=>{const f=flow({left:`${b.title} · Pattern ${String(i+1).padStart(2,'0')}`});T.pattern(f,ctx,p,i+1);addFolios(f);return [p.pattern_id,f];}));
  if(paper==='A4'){docs.guide=single(T.guide);}
  return {docs,pageOf,fonts};
}

// Encoded copies of approved artwork, cached per image and encoding (the originals are never altered).
const ENCODED=new Map();
async function encoded(sha,bytes,enc){
  const key=`${sha}|${enc.img}`;
  if(!ENCODED.has(key))ENCODED.set(key,enc.img==='png'?Buffer.from(bytes):await sharp(bytes).flatten({background:'#ffffff'}).jpeg({quality:enc.img,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer());
  return ENCODED.get(key);
}

/** One laid-out document to PDF bytes, with every image placement recorded for QC. */
async function renderDoc(flow,{title,date,art,assets,enc,design='classic'}){
  const pdf=await newPdf({title,date});pdf.registerFontkit(fontkit);
  const fonts={};
  for(const [k,f] of Object.entries(flow.fonts))fonts[k]=await pdf.embedFont(f.bytes,{subset:true});
  const images=new Map(), placements=[];
  for(const [i,pg] of flow.pages.entries())for(const o of pg.ops.filter(o=>o.t==='image')){
    const a=assets.get(o.asset);
    if(!images.has(o.asset)){const bytes=await encoded(a.sha256,art.get(o.asset),enc);images.set(o.asset,enc.img==='png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes));}
    // The placed image (whole, aspect kept); a framed (Moonlit) image also records its visible frame.
    const d=o.drawn??o, r=v=>+(v/mm(1)).toFixed(2);
    placements.push({where:o.where,page:i+1,asset:o.asset,sheet_mm:[flow.W,flow.H].map(r),placed_mm:[d.w,d.h].map(r),
      offset_mm:[d.x,d.y].map(r),source_px:[a.width,a.height],source_aspect:+(a.width/a.height).toFixed(5),placed_aspect:+(d.w/d.h).toFixed(5),
      effective_ppi:Math.round(a.width/(d.w/72)),...(o.drawn&&o.clipped!==false?{visible_mm:[o.w,o.h].map(r),visible_offset_mm:[o.x,o.y].map(r)}:{})});
  }
  if(design==='moonlit')drawMoonlit(pdf,flow,{fonts,images});else drawPages(pdf,flow,{fonts,images});
  return {bytes:await savePdf(pdf),placements};
}

/** Slots with each asset's pixel size (from the handoff). */
const slotsOf=(h)=>{
  const L=h.crochet_layout, a=id=>{const x=h.assets.find(y=>y.id===id);return {asset:id,px:[x.width,x.height]};};
  return {hero:a(L.hero),overview:L.overview?a(L.overview):null,motif:L.motif?a(L.motif):null,
    patterns:Object.fromEntries(Object.entries({...L.patterns,...(L.previews??{})}).map(([k,v])=>[k,a(v)])),
    diagrams:Object.fromEntries(Object.entries(L.diagrams).map(([k,list])=>[k,list.map(d=>({...a(d.asset),caption:d.caption}))]))};
};

/** Production plan for one encoding step: every output with its sources and a deterministic build function. */
export async function plan(h,{imageEncoding=ENCODING_LADDER[0],design='classic'}={}){
  const enc=typeof imageEncoding==='object'&&imageEncoding?.img!==undefined?imageEncoding:ENCODING_LADDER[0];
  const b=h.crochet.bundle, date=new Date(h.approved.patterns?.approved_at??h.approved.creative_approved_at??0);
  // The final safety check (ADR-052); Stage 1 runs the same check before approval.
  const missing=unprintableCharacters(b,await loadFonts());
  // Moonlit draws headings in more faces: every approved string must be printable in each of them too.
  if(design==='moonlit')missing.push(...unprintableCharacters(b,await loadMoonlitFonts(),['body','bold','display','italic','serif']));
  if(missing.length)throw new HandoffError(`The approved pattern text uses characters the document fonts cannot print (${[...new Map(missing.map(x=>[x.char,`"${x.char}" ${x.code}`])).values()].join(', ')}; at ${[...new Set(missing.map(x=>x.path))].slice(0,5).join(', ')}). Stage 2 never replaces text; edit the source and approve it again.`);
  const declared=crochetDeliverablePlan(b,{productName:h.product_name}), name=declared.packageName, slots=slotsOf(h);
  const assets=new Map(h.assets.map(a=>[a.id,a]));
  const layouts={};
  for(const paper of Object.keys(PAPERS))layouts[paper]=await layoutDocuments(h,{paper,slots,design});
  const docOf=o=>{
    if(o.kind==='guide')return layouts.A4.docs.guide;
    const d=layouts[o.paper].docs;
    return {'bundle-pdf':d.bundle,'pattern-index':d.index,'materials-reference':d.materials,'abbreviations-reference':d.abbreviations}[o.kind]??d.patterns.get(o.patterns[0]);
  };
  const titleOf=o=>`${h.product_name} - ${{guide:'Printing and Crochet Guide','bundle-pdf':'Complete Pattern Bundle','pattern-index':'Pattern Index',
    'materials-reference':'Materials and Tools','abbreviations-reference':'Abbreviations','pattern-pdf':b.patterns.find(p=>p.pattern_id===o.patterns[0])?.name}[o.kind]}${o.paper?` - ${PAPERS[o.paper].label}`:''}`;
  const outputs=declared.outputs.map(o=>{
    const flow=docOf(o), paper=o.paper??'A4', used=[...new Set(flow.pages.flatMap(p=>p.ops.filter(x=>x.t==='image').map(x=>x.asset)))];
    return {rel:o.rel,kind:o.kind==='guide'?'guide':'pdf',variant:o.kind==='guide'?'Guide':o.kind==='pattern-pdf'?individualFolder(paper):paper,sources:used,
      expect:{pages:flow.pages.length,size_mm:[PAPERS[paper].w,PAPERS[paper].h],orientation:'portrait',role:o.kind,patterns:o.patterns},
      build:async art=>renderDoc(flow,{title:titleOf(o),date,art,assets,enc,design})};
  });
  const previews=declared.previews.map(p=>({rel:p.rel,page:p.page,label:{cover:'Cover (A4)','pattern-index':'Pattern index (A4)','sample-pattern-page':'First pattern (A4)','materials-reference':'Materials and tools (A4)'}[p.purpose]}));
  return {packageName:name,date,outputs,previews,layouts,
    variants:['A4','US-Letter',individualFolder('A4'),individualFolder('US-Letter'),'Guide'],
    record:{crochet:{design,pattern_count:b.patterns.length,terminology:b.terminology,pdf_images:enc.img,
      source:h.crochet.source,pages:Object.fromEntries(Object.keys(PAPERS).map(k=>[k,layouts[k].docs.bundle.pages.length])),
      integrity:crochetIntegrity(b)}}};
}

// ---------- QC ----------
/** Adapter QC: approval binding, completeness, verbatim text, layout bounds, artwork, deliverables. */
export async function qcChecks({handoff:h,record,rendered,productDir,artwork,design='classic'}){
  const checks=[], add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail:String(detail)});
  const b=h.crochet.bundle, P=b.patterns, outputs=Object.entries(record.outputs);
  // 1. The source on disk is exactly what the owner approved.
  const {readFile}=await import('node:fs/promises'), {join}=await import('node:path');
  let diskSha=null;try{diskSha=hash(await readFile(join(productDir,h.crochet.source.file)));}catch{}
  add('pattern source matches the owner approval',diskSha&&diskSha===h.crochet.source.sha256&&diskSha===h.approved.patterns?.source_sha256,
    diskSha?`${h.crochet.source.file} sha256 ${diskSha.slice(0,12)}…`:`${h.crochet.source.file} missing`);
  const v=validateCrochetBundle(b), errs=re=>v.errors.filter(e=>re.test(e));
  add('pattern source still valid',v.ok,v.ok?`${P.length} patterns`:v.errors.slice(0,4).join('; '));
  add('pattern_count correct',b.pattern_count===P.length&&P.length===h.approved.patterns?.pattern_count,`${b.pattern_count} declared, ${P.length} supplied, ${h.approved.patterns?.pattern_count} approved`);
  add('no duplicate patterns',new Set(P.map(p=>p.pattern_id)).size===P.length&&new Set(P.map(p=>p.name.trim().toLowerCase())).size===P.length,'');
  add('no missing instructions',!errs(/instructions|steps/).length,errs(/instructions|steps/).join('; '));
  add('no placeholder text',!errs(/placeholder/).length,errs(/placeholder/).join('; '));
  add('no undefined abbreviations',!errs(/not defined/).length,errs(/not defined/).join('; '));
  add('terminology consistent',!errs(/terminology/).length,`${b.terminology}${errs(/terminology/).length?`: ${errs(/terminology/).join('; ')}`:''}`);
  // 2. Re-lay the documents (deterministic) and compare with what was built.
  const p2=await plan(h,{imageEncoding:ENCODING_LADDER.find(e=>e.img===record.crochet?.pdf_images)??ENCODING_LADDER[0],design});
  const pageMismatch=p2.outputs.filter(o=>record.outputs[o.rel]?.expect.pages!==o.expect.pages).map(o=>o.rel);
  add('layout reproduces the built files',!pageMismatch.length,pageMismatch.join(', ')||'identical pagination');
  // 3. Every approved pattern in each paper: in the complete bundle (in order) and as its own PDF.
  const inc=[];
  for(const paper of Object.keys(PAPERS)){
    const d=p2.layouts[paper].docs, order=d.bundle.pages.filter(pg=>pg.kind==='pattern'&&!pg.meta.continued).map(pg=>pg.meta.pattern_id);
    if(order.join()!==P.map(p=>p.pattern_id).join())inc.push(`${paper} bundle order ${order.join(',')}`);
    const each=outputs.filter(([,o])=>o.expect.role==='pattern-pdf'&&o.variant===individualFolder(paper)).map(([,o])=>o.expect.patterns[0]);
    if(each.join()!==P.map(p=>p.pattern_id).join())inc.push(`${paper} individual PDFs: ${each.length} of ${P.length}`);
  }
  add('all approved patterns included (A4 and US Letter, bundle and individual)',!inc.length,inc.join('; ')||`${P.length} patterns x 2 papers`);
  // 4. Verbatim text: layout lines join back to the source exactly, and the rendered PDF text contains it.
  const mismatch=[], notRendered=[], blankPattern=[];
  for(const paper of Object.keys(PAPERS)){
    const d=p2.layouts[paper].docs;
    for(const [pid,flow] of d.patterns){
      const pat=P.find(p=>p.pattern_id===pid);
      for(const [kind,doc] of [['individual',flow],['bundle',d.bundle]])
        mismatch.push(...sourceTextProblems(doc,pat).map(e=>`${paper} ${kind} ${pid} ${e}`));
      if(flow.pages.some(pg=>!pg.ops.some(o=>o.t==='text'&&o.src?.pattern_id===pid)))blankPattern.push(`${paper} ${pid}`);
      const rel=outputs.find(([,o])=>o.expect.role==='pattern-pdf'&&o.variant===individualFolder(paper)&&o.expect.patterns[0]===pid)?.[0];
      notRendered.push(...renderedTextProblems(flow,rendered.get(rel)??[]).map(e=>`${rel}: ${e}`));
    }
    const rel=outputs.find(([,o])=>o.expect.role==='bundle-pdf'&&o.variant===paper)?.[0];
    notRendered.push(...renderedTextProblems(d.bundle,rendered.get(rel)??[]).map(e=>`${rel}: ${e}`));
  }
  add('instruction text matches the approved source exactly',!mismatch.length,mismatch.slice(0,6).join('; ')||'every step, heading, assembly and finishing line placed verbatim');
  add('materials, hook sizes, assembly and finishing rendered in every pattern PDF',!notRendered.length,notRendered.slice(0,4).join('; ')||'every layout line matched to positioned PDF text; includes every step and label, in individual PDFs and both complete bundles (safe wrapping/page breaks allowed)');
  add('no blank pattern pages',!blankPattern.length,blankPattern.join(', '));
  // 5. Nothing outside the page or wider than its column (no overflow, no clipping).
  const bounds=[];
  for(const paper of Object.keys(PAPERS))for(const [doc,flow] of Object.entries({...p2.layouts[paper].docs,patterns:null}).filter(([,f])=>f).concat([...p2.layouts[paper].docs.patterns.entries()].map(([k,f])=>[`pattern ${k}`,f]))){
    bounds.push(...instructionBoundsProblems(flow).map(e=>`${paper} ${doc} ${e}`));
    flow.pages.forEach((pg,i)=>{for(const o of pg.ops){
      if(o.t==='text'&&(o.width>o.maxWidth+0.5||o.x<o.box.x-0.5||o.x+o.width>o.box.x+o.box.w+0.5||o.y<mm(6)||o.y>flow.H-mm(6)))bounds.push(`${paper} ${doc} p${i+1} "${o.text.slice(0,30)}"`);
      // Every glyph exists in the face that draws this line (never a silent fallback or blank box).
      if(o.t==='text'&&missingGlyphs(flow.fonts[o.font],o.text).length)bounds.push(`${paper} ${doc} p${i+1} font ${o.font} cannot print ${JSON.stringify(missingGlyphs(flow.fonts[o.font],o.text).join(''))}`);
      if(o.t==='image'&&(o.x<-0.5||o.y<-0.5||o.x+o.w>flow.W+0.5||o.y+o.h>flow.H+0.5))bounds.push(`${paper} ${doc} p${i+1} image ${o.asset}`);
    }});
  }
  add('no page overflow or text clipping',!bounds.length,bounds.slice(0,6).join('; ')||'every line inside its column and the page');
  // 6. Index page numbers point at the pattern pages.
  const idx=[];
  for(const paper of Object.keys(PAPERS)){const d=p2.layouts[paper];for(const doc of [d.docs.bundle,d.docs.index])for(const pg of doc.pages)for(const o of pg.ops)
    if(o.index_page_of&&Number(o.text)!==d.pageOf.get(o.index_page_of))idx.push(`${paper} ${o.index_page_of}`);}
  add('pattern index page numbers correct',!idx.length,idx.join(', ')||'every index entry points at its pattern');
  // 7. Artwork: every placed slot is an approved, decodable, non-blank asset of the recorded size.
  const art=[];
  for(const id of h.crochet_layout.used){
    const a=h.assets.find(x=>x.id===id);
    if(!a||!artwork.has(id)){art.push(`${id} missing`);continue;}
    try{const m=await sharp(artwork.get(id)).metadata();if(m.width!==a.width||m.height!==a.height)art.push(`${id} is ${m.width}x${m.height}, handoff says ${a.width}x${a.height}`);}
    catch(e){art.push(`${id} broken (${e.message})`);}
  }
  add('artwork present and valid',!art.length&&!!h.crochet_layout.hero,art.join('; ')||`${h.crochet_layout.used.length} approved asset(s) placed`);
  // 7b. ADR-063: every pattern page shows ITS approved preview, in one fixed slot, inside the page, clear of text, printable.
  if(h.crochet_layout.previews)add('every pattern page shows its approved finished-item preview in the fixed slot',...previewPlacement(h,p2));
  // 8. Deliverables: every declared kind, both papers.
  const roles=r=>outputs.filter(([,o])=>o.expect.role===r);
  for(const paper of Object.keys(PAPERS)){
    const have=['bundle-pdf','pattern-index','materials-reference','abbreviations-reference'].filter(r=>roles(r).some(([,o])=>o.variant===paper));
    add(`${PAPERS[paper].label} generated`,have.length===4&&roles('pattern-pdf').filter(([,o])=>o.variant===individualFolder(paper)).length===P.length,
      `${have.join(', ')}; ${roles('pattern-pdf').filter(([,o])=>o.variant===individualFolder(paper)).length} individual pattern PDFs`);
  }
  add('printing and crochet guide present',roles('guide').length===1&&!!record.outputs[GUIDE_FILE],GUIDE_FILE);
  // 9. No testing or guarantee claim anywhere in the customer documents unless the evidence exists.
  const allTested=P.every(isTested), claims=[];
  for(const [rel,pages] of rendered)for(const r of pages){const t=r.text.replace(/Tested by [^:]+ on \d{4}-\d{2}-\d{2}:/g,'');if((!allTested&&TESTED_WORDS.test(t))||/\b(guaranteed|error[- ]free)\b/i.test(t))claims.push(`${rel} p${r.page}`);}
  add('no unsupported testing or guarantee claims',!claims.length,claims.slice(0,4).join(', ')||(allTested?'every pattern has testing evidence':'no "tested", "verified" or "guaranteed" wording'));
  return {checks,previews:[]};
}

/**
 * Preview placement QC (ADR-063), from the deterministic layout: for each paper, in each pattern's own PDF and in
 * the complete bundle, the pattern's FIRST page carries exactly its preview; every preview frame has the same
 * size and position (the image never decides the geometry); the frame is inside the page; no text overlaps it;
 * the placed image keeps its aspect ratio and prints at >= MIN_PREVIEW_PPI. Returns [ok, detail].
 */
export function previewPlacement(h,p2){
  const L=h.crochet_layout, assets=new Map(h.assets.map(a=>[a.id,a])), bad=[], frames=new Map();
  const r=v=>v.toFixed(1);
  for(const paper of Object.keys(PAPERS)){
    const d=p2.layouts[paper].docs;
    for(const [pid,id] of Object.entries(L.previews)){
      for(const [kind,flow] of [['individual',d.patterns.get(pid)],['bundle',d.bundle]]){
        const i=flow.pages.findIndex(pg=>pg.kind==='pattern'&&pg.meta.pattern_id===pid&&!pg.meta.continued), pg=flow.pages[i];
        const imgs=(pg?.ops??[]).filter(o=>o.t==='image');
        const mine=imgs.filter(o=>o.asset===id), wrong=imgs.filter(o=>o.asset&&o.asset!==id&&assets.get(o.asset)?.role==='pattern-preview');
        if(mine.length!==1){bad.push(`${paper} ${kind} ${pid}: ${mine.length?'preview placed twice':'preview missing'}`);continue;}
        if(wrong.length)bad.push(`${paper} ${kind} ${pid}: shows another pattern's preview (${wrong.map(o=>o.asset).join(', ')})`);
        const o=mine[0], fr=o.frame??o, dr=o.drawn??o, a=assets.get(id);
        const geo=`${r(fr.w)}x${r(fr.h)}@${r(flow.W-(fr.x+fr.w))},${r(flow.H-(fr.y+fr.h))}`;
        frames.set(paper,new Set([...(frames.get(paper)??[]),geo]));
        if(fr.x<-0.5||fr.y<-0.5||fr.x+fr.w>flow.W+0.5||fr.y+fr.h>flow.H+0.5)bad.push(`${paper} ${kind} ${pid}: frame outside the page`);
        if(Math.abs(dr.w/dr.h-a.width/a.height)>0.01)bad.push(`${paper} ${kind} ${pid}: image distorted`);
        const ppi=Math.round(a.width/(dr.w/72));
        if(ppi<MIN_PREVIEW_PPI)bad.push(`${paper} ${kind} ${pid}: ${ppi} ppi (minimum ${MIN_PREVIEW_PPI})`);
        for(const t of pg.ops.filter(x=>x.t==='text')){
          const top=t.y+t.size, bottom=t.y-t.size*0.3;
          if(t.x<fr.x+fr.w&&t.x+t.width>fr.x&&bottom<fr.y+fr.h&&top>fr.y)bad.push(`${paper} ${kind} ${pid} p${i+1}: text "${t.text.slice(0,24)}" overlaps the preview`);
        }
      }
    }
  }
  // One geometry per paper size: the frame's size and its offset from the top-right corner are identical on every pattern page.
  for(const [k,set] of frames)if(set.size>1)bad.push(`${k}: preview frames differ between pattern pages (${[...set].join(' | ')})`);
  return [!bad.length,bad.slice(0,6).join('; ')||`${Object.keys(L.previews).length} previews, one fixed top-right slot per paper, no overlap, >= ${MIN_PREVIEW_PPI} ppi`];
}

/** Stage 3 handoff: what marketing may truthfully know about the patterns (ADR-041 marketing integrity). */
export function stage3Metadata(h,p){
  const b=h.crochet.bundle, i=crochetIntegrity(b), hero=h.assets.find(a=>a.id===h.crochet_layout.hero);
  return {product_format:CROCHET_FORMAT,product_type:h.product_type,pattern_count:b.patterns.length,terminology:b.terminology,skill_levels:b.skill_level,
    categories:[...new Set(b.patterns.map(x=>x.category))],pattern_names:b.patterns.map(x=>x.name),
    integrity:{...i,approved_for_production:{approved_at:h.approved.patterns.approved_at,by:h.approved.patterns.approved_by,source_sha256:h.approved.patterns.source_sha256},
      marketing_rules:['Approved for production is not tested: say "tested" only when integrity.all_tested is true.',
        'Artwork is an AI-generated illustration (Stage 1), never a photograph of an item made from these patterns.',
        'Never claim professionally tested, guaranteed, error-free or pattern-tester approved.']},
    artwork:{hero:{asset:hero.id,file:hero.file,sha256:hero.sha256,width:hero.width,height:hero.height,kind:'illustration',photographic_evidence:false}},
    deliverables:{papers:['A4','US Letter'],complete_bundle:true,individual_pattern_pdfs:b.patterns.length,pattern_index:true,materials_reference:true,abbreviations_reference:true,
      step_by_step_instructions:b.patterns.every(x=>x.instructions.every(s=>s.steps.length>0)),printing_guide:true,pages_per_bundle:p.record.crochet.pages,files:p.outputs.length},
    note:'Real product imagery for marketing must be true renders of these customer PDFs or the approved Stage 1 illustrations, labelled as illustrations.',
    // ADR-047: the approved patterns' listing facts and the checked visuals the approved artwork was made from.
    visuals:crochetVisualFacts(h)};
}

/**
 * Stage 3 facts from the checked crochet visuals (ADR-047). Pattern data is the source of truth; the
 * cover spec is the allowed representation (approved pattern IDs and quantities only). Never upgrades
 * visual_match_status: physically_verified only if the checked record already says so.
 */
export function crochetVisualFacts(h){
  const v=h.crochet?.visuals;
  if(!v)return null;
  const name=id=>v.fingerprints[id]?.pattern_name??id;
  return {visual_match_status:v.visual_match_status,physically_verified:v.visual_match_status==='physically_verified',
    patterns_sha256:v.patterns_sha256,source:{file:v.file,sha256:v.sha256},
    pictured:{combination:v.combination,items:v.specs.cover.items.map(i=>({pattern_id:i.pattern_id,pattern_name:name(i.pattern_id),quantity:i.quantity}))},
    pattern_facts:h.crochet.bundle.patterns.map(p=>listingFacts(v.fingerprints[p.pattern_id]))};
}

/**
 * Moonlit image slots from the handoff's approved artwork (asset ids). The
 * theme's crops only choose what a frame shows (Stage 1 proofs carry their
 * lettering in a top band); the approved files are never altered.
 */
export function moonlitSlots(h,theme=MOONLIT_MEADOW){
  const L=h.crochet_layout, C=theme.crops??{};
  const slot=(id,crop,extra={})=>{if(!id)return null;const a=h.assets.find(x=>x.id===id);return {asset:id,px:[a.width,a.height],crop:crop??null,...extra};};
  const patterns={};
  for(const [pid,id] of Object.entries(L.patterns??{}))patterns[pid]={patternHeroImage:slot(id,null,{where:`pattern ${pid} artwork`})};
  // ADR-063: the approved finished-item preview fills the same fixed top-right slot, labelled as an illustration.
  for(const [pid,id] of Object.entries(L.previews??{}))patterns[pid]={patternHeroImage:slot(id,null,{caption:PREVIEW_CAPTION,where:`pattern ${pid} finished-item preview`})};
  // An approved detail render that depicts exactly one pattern (ADR-046/047 visual specs) is that pattern's image.
  const detail=h.crochet?.visuals?.specs?.detail, page=h.pages.find(p=>/detail/i.test(p.page_type));
  if(detail?.items?.length===1&&page&&L.used.includes(page.asset)&&!patterns[detail.items[0].pattern_id]){
    const it=detail.items[0];
    patterns[it.pattern_id]={patternHeroImage:slot(page.asset,C.detail,{caption:`Illustration of the finished ${h.crochet.visuals.fingerprints?.[it.pattern_id]?.motif_type??'piece'}`,where:`pattern ${it.pattern_id} artwork (approved detail render)`})};
  }
  return {bundleHeroImage:slot(L.hero,C.hero,{where:'cover hero artwork'}),overviewImage:slot(L.overview,C.overview,{where:'welcome collection overview artwork'}),
    backImage:slot(L.motif,C.detail,{where:'back page artwork'}),materialsLifestyleImage:null,patterns,
    diagrams:Object.fromEntries(Object.entries(L.diagrams??{}).map(([k,list])=>[k,list.map(d=>({...slot(d.asset,null),caption:d.caption,where:`pattern ${k} diagram`}))]))};
}

/**
 * The crochet adapter in one document design. 'classic' (v1) is the live
 * design; 'moonlit' (v2, Moonlit Meadow) is built for owner review and becomes
 * live only when the registry is switched after approval. A different version
 * means a new build record: designs never mix in one package.
 */
export function crochetAdapter({design='classic'}={}){
  if(!['classic','moonlit'].includes(design))throw new Error(`unknown crochet document design "${design}"`);
  return Object.freeze({format:CROCHET_FORMAT,version:design==='moonlit'?2:1,design,designName:design==='moonlit'?'Moonlit':'Classic',content:'crochet-patterns',manifest,reviewNotes,
    plan:(h,o={})=>plan(h,{...o,design}),qcChecks:a=>qcChecks({...a,design}),stage3Metadata,
    encodingLadder:ENCODING_LADDER,packaging:{split:true}});
}
export const crochetPatternBundle=crochetAdapter({design:'classic'});
export const crochetPatternBundleMoonlit=crochetAdapter({design:'moonlit'});
export { crochetPackageName };
