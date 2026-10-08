// Stage 3 adapter: colouring book (ADR-037). Consumes the approved Stage 2
// package (handoff book, build record incl. stage3_handoff, QC report) and
// never creates or modifies the book: pages, PDFs, PNGs and ZIPs are only
// read and SHA-verified. Generic for every colouring book: theme, audience,
// page count, orientation and formats all come from the Stage 2 records.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Stage3Error } from '../errors.mjs';
import { sha, exists, readJson, verifyPackage, verifyPreviews, scrubProcess } from '../shared.mjs';
import { planSlides, composeSlide as compose, colouringCampaign, heroBenefits } from '../colouring-book.mjs';
import { planColouringCreative, colouringCatalogue, colouringCreativeDirection, finaliseColouringPlan, COLOURING_MAX_ENVIRONMENTS, conceptBriefFor, BRIEF_BANNED_EXTRA } from '../colouring-creative.mjs';
import { fromPng, fromPdf } from '../art.mjs';
import { deriveStrategy } from '../strategy.mjs';

const PAPER={'A4':'210 × 297 mm','US-Letter':'8.5 × 11 in'};
const LABEL={'A4':'A4','US-Letter':'US Letter'};
const PNG_KIND='page-png';
const pad=n=>String(n).padStart(2,'0');
/** k page numbers spread evenly over `list` (first and last included). */
const spread=(list,k)=>{const n=list.length;if(!n)return [];if(k>=n)return list.map(p=>p.page_number);
  return [...new Set(Array.from({length:k},(_,i)=>list[Math.round(i*(n-1)/Math.max(1,k-1))].page_number))];};

async function facts({productDir,product,prod,handoff,record,files}){
  const qc=await readJson(join(productDir,prod.qc.report));
  if(!qc.passed)throw new Stage3Error('Stage 2 QC report does not pass.');
  await verifyPackage(productDir,record);
  if(!handoff.book?.pages?.length)throw new Stage3Error('The Stage 2 handoff has no book pages, so there is no colouring-book artwork to market.');
  const s3=record.stage3_handoff??null, outputs=Object.entries(record.outputs);
  const asset=id=>handoff.assets.find(a=>a.id===id);
  const pages=handoff.book.pages.map(p=>{
    const a=asset(p.asset);
    if(!a?.file||!a.sha256)throw new Stage3Error(`The Stage 2 handoff has no approved artwork file for page ${p.page_number} (${p.asset}).`);
    const png=outputs.find(([,o])=>o.kind===PNG_KIND&&o.page_number===p.page_number);
    return {page_number:p.page_number,title:p.title,role:p.role,page_type:p.page_type,asset:p.asset,file:a.file,sha256:a.sha256,width:a.width,height:a.height,
      delivered:png?`production/deliverables/${record.package}/${png[0]}`:null};
  });
  const colouring=pages.filter(p=>p.role!=='cover'), cover=pages.find(p=>p.role==='cover')??null;
  if(!colouring.length)throw new Stage3Error('The Stage 2 book has no colouring pages to show in marketing.');

  // Representative pages: Stage 2's own choice (stage3_handoff) when it is still in the book, else first / middle / last.
  const recorded=(s3?.representative_pages??[]).filter(r=>r.role!=='cover'&&colouring.some(p=>p.page_number===r.page_number)).map(r=>r.page_number);
  const showcase=recorded.length?recorded:spread(colouring,3);
  const selection={cover:cover?.page_number??null,lead:(cover??colouring[0]).page_number,showcase,
    collage:spread(colouring,Math.min(9,colouring.length)),example:showcase[0]};
  selection.pages_used=[...new Set([selection.lead,...showcase,...selection.collage,selection.example])].sort((a,b)=>a-b);
  // Every page marketing shows must be the exact approved file (fail clearly before any OpenAI call).
  for(const n of selection.pages_used){
    const p=pages.find(x=>x.page_number===n), path=join(productDir,p.file);
    if(!await exists(path))throw new Stage3Error(`Stage 3 needs the approved artwork of page ${n} ("${p.title}"), but ${p.file} is missing. Marketing never regenerates Stage 2 files.`);
    if(sha(await readFile(path))!==p.sha256)throw new Stage3Error(`The approved artwork of page ${n} changed since production approval: ${p.file}.`);
  }

  const N=pages.length, pngCount=outputs.filter(([,o])=>o.kind===PNG_KIND).length;
  // Stage 2's own counts must agree with its page roles (never guessed, never two competing numbers).
  if(s3&&(s3.page_count!==N||s3.colouring_pages!==colouring.length))
    throw new Stage3Error(`Stage 2 records disagree on the page count: stage3_handoff says ${s3.page_count} pages / ${s3.colouring_pages} colouring pages, the handoff book has ${N} / ${colouring.length}.`);
  const formats=s3?.formats?.length?s3.formats.map(({key,label,files,pages,page_size_mm,artwork_size_mm})=>({key,label,files,pages,...(page_size_mm?{page_size_mm,artwork_size_mm}:{})}))
    :[...['A4','US-Letter'].filter(k=>outputs.some(([,o])=>o.variant===k&&o.kind==='pdf')).map(k=>({key:k,label:LABEL[k],files:outputs.filter(([,o])=>o.variant===k&&o.kind==='pdf').length,pages:N})),
      ...(pngCount?[{key:'Colouring-Pages-PNG',label:'PNG pages',files:pngCount,pages:pngCount}]:[])];
  const previews=await verifyPreviews(productDir,qc);
  const sheet=previews.find(p=>/^A4\//.test(p.source??'')&&p.page===1)??previews.find(p=>p.source)??null;
  const guide=(([rel,o])=>rel?{file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256}:null)(outputs.find(([,o])=>o.kind==='guide')??[]);
  const concept=product.concepts?.batches?.find(b=>b.batch===product.concepts.selected?.batch)?.concepts.find(c=>c.concept_id===product.concepts.selected.concept_id);
  const direction=product.visual_direction?.file&&await exists(join(productDir,product.visual_direction.file))?await readJson(join(productDir,product.visual_direction.file)):null;
  const colourMode=[direction?.colour_mode,direction?.palette,product.visual_direction?.summary?.palette].filter(Boolean).join(' ');
  const zips=record.zip?[record.zip]:record.zip_parts;
  const facts={schema_version:1,product_id:product.product_id,product_name:product.name,product_type:product.product_type,product_format:handoff.product_format,
    season:product.season??null,target_customer:product.target_customer??null,
    // Page quantity: total document pages, colouring pages, and what every other page is (Stage 2 role and page type).
    book:{page_count:N,colouring_pages:colouring.length,cover:!!cover,orientation:handoff.book.orientation,page_px:handoff.book.page_px,
      non_colouring_pages:pages.filter(p=>p.role==='cover').map(p=>({page_number:p.page_number,kind:p.page_type??p.role,title:p.title}))},
    pages,selection,formats,png_pages:pngCount>0,png_page_files:pngCount,
    printing_guide:!!guide,guide,sheet_preview:sheet?{file:sheet.file,sha256:sheet.sha256,label:sheet.label}:null,
    // The approved direction says the pages are black-and-white line art (used for honest example labels).
    line_art:/black[- ]and[- ]white|monochrome|line[- ]art/i.test(colourMode),
    digital_download:true,physical_item:false,editable:false,
    package:{name:record.package,parts:zips.length,zip_mb:+(zips.reduce((s,z)=>s+z.bytes,0)/1e6).toFixed(1)},
    effective_ppi:qc.resolution?.effective_ppi??{},
    previews,
    // Quantity claims in copy are checked against these (claims.mjs pageQuantityProblems): "C colouring pages / designs", "N pages" (or C).
    page_quantity:{total_pages:N,content_pages:colouring.length,content:'colouring'},
    // For scene and example prompts only (never shown as a claim).
    style:{subject:concept?.visual_route?.primary_subject??null,palette:direction?.palette??null,mood:direction?.mood??product.visual_direction?.summary?.mood??null},
    sources:{handoff:prod.handoff,build_record:files.build,qc_report:{file:prod.qc.report,sha256:sha(await readFile(join(productDir,prod.qc.report)))}}};
  facts.creative=await creativeMetadata({productDir,product,facts,concept,direction});
  return facts;
}

/**
 * Descriptive metadata for sales copy (never a deliverable claim): the
 * collection look from the approved concept and direction, and per-page
 * descriptions from the approved page briefs (the full book was generated
 * from them and approved page by page) or the owner's notes in
 * marketing/creative-notes.json ({"pages":{"7":"..."}}), which take precedence.
 */
async function creativeMetadata({productDir,product,facts,concept,direction}){
  const route=concept?.visual_route??{};
  const notesPath=join(productDir,'marketing','creative-notes.json');
  const notes=await exists(notesPath)?await readJson(notesPath):{};
  const text=v=>typeof v==='string'&&v.trim()?scrubProcess(v.trim().slice(0,400)):null;
  const brief=n=>(product.pages??[]).find(p=>p.page_number===n)?.artwork_description??null;
  const shown=new Set([...facts.selection.showcase,...facts.selection.collage]);
  return {note:'Descriptive creative metadata for sales copy only; deliverables and capabilities come from the production facts.',
    collection:{subject:route.primary_subject??null,scene:route.scene??null,emotional_tone:text(route.emotional_tone),
      illustration_style:text(product.visual_direction?.summary?.style??direction?.illustration_style),mood:text(direction?.mood??product.visual_direction?.summary?.mood),
      detail:text(direction?.detail_level??product.visual_direction?.summary?.detail)},
    pages:Object.fromEntries(facts.pages.filter(p=>shown.has(p.page_number)).map(p=>{const own=text(notes.pages?.[p.page_number]);
      return [p.page_number,{title:p.title,description:own??text(brief(p.page_number)),source:own?'owner notes (marketing/creative-notes.json)':text(brief(p.page_number))?`approved page brief (page ${p.page_number})`:'none'}];}))};
}

function claimIndex(f){
  const N=f.book.page_count, C=f.book.colouring_pages, W=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  const both=f.formats.some(x=>x.key==='A4')&&f.formats.some(x=>x.key==='US-Letter');
  const idx={
    'product-title':[f.product_name],
    'page-count':[`${N} pages`,`${N} printable pages`,`${N}-page`,`${C} colouring pages`,`${C} printable colouring pages`,`${C} pages`,`${C} designs`,`${C} illustrations`,
      ...(f.book.cover?[`${C} colouring pages + cover`,`${C} colouring pages and a cover`]:[]),
      ...(W[N]?[`${W[N]} pages`]:[]),...(W[C]?[`${W[C]} colouring pages`]:[]),String(N),String(C)],
    'page-number':f.pages.map(p=>`Page ${p.page_number} of ${N}`),
    'page-title':f.pages.map(p=>p.title),
    'format':[...f.formats.map(x=>x.label),...(both?['A4 + US Letter','A4 and US Letter']:[]),'PDF',...(f.png_pages?['PNG pages','Every page as a PNG','PDF and PNG files','Individual PNG pages']:[])],
    'paper-size':f.formats.map(x=>PAPER[x.key]).filter(Boolean),
    'digital':['Digital download','Instant digital download','No physical item is shipped','No physical item will be shipped','Print at home','Instant access after purchase'],
    'printing-guide':f.printing_guide?['Printing guide','Printing guide included','Step-by-step printing guide']:[],
    'process':['Download','Print','Colour','Print at home or use a print shop','One design per page','Print single-sided','Print as many copies as you need for personal use'],
    // Disclosure for AI coloured examples: they illustrate, the product is the line art.
    'example':['Coloured example','Coloured example for inspiration','Colours shown are an example only'],
  };
  if(f.book.cover)idx['cover']=['Cover page','Cover included','Illustrated cover'];
  if(f.line_art)idx['line-art']=['Black-and-white line art','Black and white line art','Line art'];
  return idx;
}

/** What the model may know: production facts only (no file paths or hashes). */
function modelFacts(f){
  const c=f.creative, clean=o=>Object.fromEntries(Object.entries(o??{}).filter(([,v])=>v));
  const other=f.book.non_colouring_pages??[];
  return {product_name:f.product_name,product_type:f.product_type,season:f.season,target_customer:f.target_customer,
    product_quantity:{note:'AUTHORITATIVE. The only source for any number of pages in the listing. One multi-page printable colouring book.',
      colouring_pages:f.book.colouring_pages,total_document_pages:f.book.page_count,
      non_colouring_pages:other.map(p=>({page:p.page_number,kind:p.kind,title:p.title}))},
    book:{orientation:f.book.orientation,cover_included:f.book.cover,layout:'every colouring design has its own page (a layout fact, not a quantity)'},
    page_titles:f.pages.map(p=>({page:p.page_number,title:p.title,kind:p.role==='cover'?'cover':'colouring page'})),
    formats:f.formats.map(x=>x.label),every_page_as_png:f.png_pages,printing_guide_included:f.printing_guide,
    pages_are:f.line_art?'black-and-white line art to colour in':'printable colouring pages',
    delivery:`Instant digital download (${f.package.parts>1?`${f.package.parts} ZIP files`:'a ZIP file'} of PDF${f.png_pages?' and PNG':''} files). No physical item is shipped.`,
    editable:false,
    product_name_note:'product_name is the internal collection name: use it in the description if you like, never in the title.',
    presentation_note:'Introduce a few highlight colouring pages by title; do not list every page.',
    reference_images:'Any artwork image or page description you receive shows ONE page from this book, for look and mood only. It is not the whole product and not a page count.',
    visual:c?{note:'What the approved pages show. Describe pages only from this; never invent scenery, objects or colours.',
      collection_look:clean(c.collection),highlight_pages:Object.entries(c.pages??{}).map(([n,x])=>({page:Number(n),title:x.title,visible_design:x.description}))}:null,
    style:{mood:scrubProcess(f.style.mood)}};
}

/**
 * The colouring-book model contract (added to every Stage 3 prompt for this
 * format). Quantities come only from the Stage 2 facts; never from counting
 * titles, images or files.
 */
function modelRules(f){
  const N=f.book.page_count, C=f.book.colouring_pages, other=f.book.non_colouring_pages??[];
  const what=other.map(p=>`page ${p.page_number} is the ${p.kind}${p.title?` ("${p.title}")`:''}`).join('; ');
  return [
    `This is ONE multi-page printable colouring book: ${C} colouring page${C>1?'s':''}${other.length?` plus ${other.length} non-colouring page${other.length>1?'s':''} (${what})`:''}, ${N} page${N>1?'s':''} in total. product_quantity is the only source of any page number.`,
    `State the quantity as "${C} colouring page${C>1?'s':''}"${other.length?`. Mention the total only together with what the other page${other.length>1?'s are':' is'} (for example "${N} pages including the ${other[0].kind}"). Never write "${N} colouring pages"`:''}.`,
    ...(C>1?['Never describe the product, or what the buyer gets, as "one page", "a single page", "1 page", "a single printable" or similar: it is a multi-page book.']:[]),
    'Any artwork image or page description you are given is ONE page FROM the book, for look and mood only. Never infer a quantity by counting images, page titles or files.',
    'Never invent additional, bonus or extra pages, activities, files or formats.',
    'Layout facts are not quantities: write them without numbers, e.g. "each design has its own page" or "print one page at a time", never "the design is one page".'];
}

/** Everything an AI environment must never contain (the real pages are composited by code). */
function sceneExclusions(){
  return ['colouring pages','colouring books','books','notebooks','sketchbooks','sheets of paper','printed pages','paper artwork','drawings','line art','illustrations',
    'posters','frames','screens','text','letters','numbers','words','logos','watermarks','people','hands','animals'];
}

/**
 * Deterministic instruction for one AI COLOURED EXAMPLE: an image edit of the
 * real approved page. The model colours it in; it must not redraw it. The
 * result is a labelled marketing illustration, never product artwork.
 */
function examplePrompt(example,facts,strategy,concept=null){
  // Without a Creative Director concept (Factory and older plans) the prompt is exactly what it always was.
  if(!concept)return ['Colour in this exact colouring-book page as a finished example for an Etsy listing image.',
    'Keep every black line exactly as it is: do not add, remove, move, redraw or restyle any line, object, pattern or lettering, and keep the whole page with its white margins visible.',
    'Fill the enclosed areas neatly, as if coloured with coloured pencils and felt-tip markers: harmonious, natural colours with gentle shading inside the shapes.',
    `Colour mood: ${strategy?.visual_marketing_mood??'warm, inviting'}${facts.season?`, ${facts.season} feeling`:''}.`,
    'Output: a flat, straight-on image of the coloured page on white paper. No table, hands, pencils, shadows, frame, border, added text, signature or watermark.'].join(String.fromCharCode(10));
  // Creative plans (ADR-060): colour THIS page in the campaign's palette; never reimagine it.
  const w=concept.visual_world;
  return ['Colour in this exact colouring-book page as a finished example for an Etsy listing image. This is a colour-only job on THIS page: colour this exact page, do not reimagine it.',
    'PRESERVE exactly: the composition, the source crop and framing with its white margins, every black line, every character, object and detail, the scene layout and the page proportions.',
    'DO NOT: add, remove, move or redraw any object, line, pattern or lettering; change proportions; turn the page into an unrelated illustration; add a background.',
    'Fill the enclosed areas neatly, as if coloured with coloured pencils and felt-tip markers: harmonious, natural, plausible colours with gentle shading inside the shapes, achievable by a customer.',
    `Colour palette: ${w?.palette??strategy?.visual_marketing_mood??'warm and natural'}${concept.buyer_feeling?.length?`. Mood: ${concept.buyer_feeling.join(', ')}`:''}. ${concept.transformation_story??''}`.trim(),
    'Output: a flat, straight-on image of the coloured page on white paper. No table, hands, pencils, shadows, frame, border, added text, signature or watermark.'].join(String.fromCharCode(10));
}

async function prepareArt(facts,productDir,workDir){
  await mkdir(workDir,{recursive:true});
  const pages={};
  for(const n of facts.selection.pages_used){const p=facts.pages.find(x=>x.page_number===n);
    pages[n]=await fromPng(productDir,p.file,p.sha256,`Page ${n}: ${p.title}`,`page-${pad(n)}`);}
  // Stage 2's true render of the A4 PDF, and the printing guide as the customer receives it.
  const sheet=facts.sheet_preview?await fromPng(productDir,facts.sheet_preview.file,facts.sheet_preview.sha256,'A4 printable page','sheet-A4'):null;
  const guide=facts.guide?await fromPdf(productDir,workDir,facts.guide.file,facts.guide.sha256,1,'Printing guide','guide',100):null;
  const all=[...Object.values(pages),...(sheet?[sheet]:[]),...(guide?[guide]:[])];
  const manifest=all.map(({uri,...rest})=>rest);
  await writeFile(join(workDir,'art-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {pages,lead:pages[facts.selection.lead],sheet,guide,manifest};
}

// ---------- engine hooks (Hybrid, AI Creative) ----------
function slideArtwork(slide,facts,A){
  if(slide.template==='hero')return [A.lead,A.pages[facts.selection.showcase[0]]].filter((a,i,l)=>a&&l.indexOf(a)===i);
  return [A.pages[slide.page]];
}

const composeSlide=(slide,ctx)=>compose(slide,{...ctx,campaign:colouringCampaign(ctx.facts,deriveStrategy(ctx.facts))});

/** Etsy's own category path for every colouring book (exact spelling; Stage 4 maps it to a verified ID, ADR-039). */
export const COLOURING_BOOK_CATEGORY='Books, Movies & Music > Books > Coloring Books';

export const colouringBook=Object.freeze({format:'colouring-book',version:1,etsyCategory:COLOURING_BOOK_CATEGORY,
  facts,claimIndex,planSlides,composeSlide,prepareArt,modelFacts,modelRules,sceneExclusions,examplePrompt,campaign:colouringCampaign,
  // ADR-058 / ADR-060: colouring books use the Creative Director (Hybrid / AI Creative; Factory is unchanged).
  creativeDirection:colouringCreativeDirection,
  creative:{plan:planColouringCreative,catalogue:colouringCatalogue,maxEnvironments:COLOURING_MAX_ENVIRONMENTS,concept:true,conceptBrief:conceptBriefFor,
    finalise:finaliseColouringPlan,bannedBrief:BRIEF_BANNED_EXTRA},
  engines:{regionTemplates:['hero','interior','lifestyle'],minShare:{hero:0.45,interior:0.45,lifestyle:0.35},decor:['none','bokeh'],
    slideArtwork,heroBenefits,representative:(facts,A)=>A.lead}});
