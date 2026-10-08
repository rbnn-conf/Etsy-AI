// Text/command parsing and message formatting for the Stage 1 bot.
import { proofLabel } from '../orchestrator/proofs.mjs';
import { taglineOf } from '../openai/concept-preview.mjs';
export function parseCommand(text){
  const m=/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(String(text??'').trim());
  return m?{name:m[1].toLowerCase(),args:(m[2]??'').trim()}:null;
}
/** Largest photo size, or an image document. Returns null for anything else. */
export function imageAttachment(message){
  if(message?.photo?.length){const best=[...message.photo].sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];return {fileId:best.file_id,uniqueId:best.file_unique_id,size:best.file_size??null};}
  const d=message?.document;
  if(d&&/^image\/(png|jpeg|webp|gif)$/.test(d.mime_type??''))return {fileId:d.file_id,uniqueId:d.file_unique_id,size:d.file_size??null};
  return null;
}
export function sniffImage(bytes){
  const b=Buffer.from(bytes);
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return {mime:'image/jpeg',ext:'jpg'};
  if(b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return {mime:'image/webp',ext:'webp'};
  if(b.subarray(0,4).toString('ascii')==='GIF8')return {mime:'image/gif',ext:'gif'};
  return null;
}
export const EXAMPLES=['christmas greeting card for adults','birthday party invitation','minimalist weekly planner','halloween kids activity book'];
export const HELP=['LumiumX Stage 1 creative orchestrator','',
  '/newproduct <request>  start a product, for example:',...EXAMPLES.map(e=>`  /newproduct ${e}`),
  'Then send reference images (optional), and /go to see three visual concept previews.',
  '/previews  make (or re-send) the concept previews for the active product',
  '/produce <number>  Stage 2: build the customer files for a creatively approved product',
  '/market <number>  Stage 3: Etsy listing + listing images for an approved production package (no publishing)',
  '/etsy <number>  Stage 4: create and verify an Etsy DRAFT for an approved product (never publishes; publishing needs PUBLISH + CONFIRM PUBLISH)',
  '/status  show the active product',
  '/cancel  stop the active product',
  '/help  this message','',
  'Stage 1: concepts, specification and 3 creative proofs. Stage 2 (/produce): customer files, no AI calls. No Etsy, no marketing.'].join('\n');

// Visual-first concept choice: a short header, one captioned image per
// concept, then the buttons. Full concept text stays in product.json.
const titleCase=t=>String(t).replace(/\b([a-z])/g,m=>m.toUpperCase());
export function previewHeader(p){
  return [`🎨 PRODUCT #${p.product_id} — CHOOSE A DIRECTION`,'',titleCase(p.request.text),'',
    `I've created 3 visual directions${p.reference_files.length?' based on your references':''}.`,
    'These are quick concept previews, not the finished product.'].join('\n');
}
export function previewCaption(c){
  return [`${c.concept_id} — ${c.proposed_name}`,taglineOf(c),`${c.page_count} designed page${c.page_count===1?'':'s'}`].join('\n').slice(0,1024);
}
export function choosePrompt(batch,maxBatches){
  const left=maxBatches-batch;
  return `Choose A, B or C. (Concept batch ${batch} of ${maxBatches}${left>0?'':'; no regenerations left'}.)`;
}
export function proofSummary(p,direction,attempt){
  const page=n=>p.pages.find(pg=>pg.page_number===n);
  const c=p.canvas;
  return [`PRODUCT #${p.product_id} — CREATIVE PROOFS`,'',`Name: ${p.name}`,`Type: ${p.product_type}`,`Season: ${p.season}`,`Audience: ${p.target_customer}`,
    `Designed pages: ${p.page_count}`,`Creative proofs: ${p.proofs.selected_pages.length}`,
    ...(c?[`Canvas: ${c.orientation} · ${c.background} background · ${c.edge}`]:[]),'',
    ...p.proofs.selected_pages.map((s,i)=>`Proof ${i+1} — ${proofLabel(s,page(s.page_number))}`),
    ...(p.page_count<3?['',`This product has ${p.page_count} designed page${p.page_count===1?'':'s'}. The extra proofs are alternative designs to choose between, not extra pages.`]:[]),'',
    'ART DIRECTION','',`Style: ${direction.illustration_style}`,`Linework: ${direction.line_weight}; ${direction.line_quality}`,`Detail: ${direction.detail_level}`,
    `Palette: ${direction.palette} (${direction.colour_mode})`,`Mood: ${direction.mood}`,'',
    `REFERENCE IMAGES: ${p.reference_files.length} supplied`,'',
    `Proof attempt ${attempt.attempt} (direction v${attempt.direction_version}).`,
    // Crochet (ADR-047): what these proofs can and cannot show.
    ...(attempt.purpose==='concept-style'?['CONCEPT / STYLE PROOFS ONLY: they set typography, palette, branding, background, ornaments and crochet realism. They do not show what a specific pattern makes, the final bouquet, or final species or counts. Product visuals are made from the approved patterns later (Restyle).']
      :attempt.purpose==='traceable-product'?['PRODUCT VISUALS made from the approved patterns and checked against them. Rendered examples, not photographs.']:[]),
    'These are creative proofs only. Image models can misspell text, so check any lettering.'].join('\n').slice(0,4000);
}

// Stage 2 review: short, visual-first. Detail lives in production/qc-report.json.
const VARIANT_LABEL={'A4':'A4 folded card','US-Letter':'US Letter folded card','Card-Panels-4x6in':'Card panels 4 x 6 in',
  'Card-Artwork':'Original card artwork (unchanged)','Guide':'Printing guide','Colouring-Pages-PNG':'Colouring pages (PNG, pixel-identical)'};
const BOOK_LABEL={'A4':'A4 colouring book','US-Letter':'US Letter colouring book'};
export function productionSummary(p,{handoff,record,qc}){
  const outputs=Object.values(record.outputs), variants=handoff.card_variants??[], multi=variants.length>1, isBook=handoff.product_format==='colouring-book';
  const files=record.variants.map(v=>{
    const of=outputs.filter(o=>o.variant===v), pages=of.find(o=>o.expect?.pages)?.expect.pages;
    if(v==='Card-Artwork')return `✓ ${VARIANT_LABEL[v]} (${of.length} PNG)`;
    if(v==='Colouring-Pages-PNG')return `✓ ${VARIANT_LABEL[v]} (${of.length} files)`;
    if(v==='Guide')return `✓ ${VARIANT_LABEL[v]}`;
    if(isBook&&BOOK_LABEL[v])return `✓ ${BOOK_LABEL[v]} (${handoff.book.pages.length} pages${of.length>1?` in ${of.length} PDFs`:''})`;
    const label=VARIANT_LABEL[v]??v;
    return of.length>1?`✓ ${label.replace(/card\b/,'cards')} (${of.length} designs, ${pages} pages each)`:`✓ ${label} (${pages} page${pages===1?'':'s'})`;
  });
  // Designs and the shared inside, by name and exact approved text.
  const textOf=id=>{const a=handoff.assets.find(x=>x.id===id);return handoff.pages.find(pg=>pg.page_number===a?.page_number)?.approved_text??[];};
  const insides=[...new Set(variants.map(v=>v.inside?.asset).filter(Boolean))];
  const designs=multi?[`Includes ${variants.length} printable card designs:`,...variants.map(v=>`${v.id} — ${v.name}`),'',
    ...(insides.length===1&&variants.every(v=>v.inside?.asset===insides[0])?['Shared inside:',...textOf(insides[0]).map(t=>`“${t}”`),'']:[])]:[];
  const book=isBook?[`${handoff.book.pages.length} pages${handoff.book.cover?' (cover + '+(handoff.book.pages.length-1)+' colouring pages)':''} · ${handoff.book.page_px.join(' x ')} px`,'']:[];
  const zips=record.zip_parts??(record.zip?[{name:record.zip.file.split('/').at(-1),bytes:record.zip.bytes}]:[]);
  const zipLine=zips.length>1?`✓ ${zips.length} ZIP parts (${zips.map(z=>`${(z.bytes/1e6).toFixed(1)} MB`).join(' + ')}), split to fit Etsy's 20 MB file limit`
    :`✓ ZIP package (${((zips[0]?.bytes??0)/1e6).toFixed(1)} MB)`;
  const ok=n=>qc.checks.filter(c=>n.some(x=>c.name.startsWith(x))).every(c=>c.ok)?'✓':'✗';
  const ppi=Object.entries(qc.resolution.effective_ppi).map(([k,v])=>`${k} ${v} ppi`).join(' · ');
  return [`📦 PRODUCT #${p.product_id} — PRODUCTION READY`,'',p.name,'',...designs,...book,'Customer files:',...files,
    zipLine,'',
    `QC: ${qc.checks.filter(c=>c.ok).length} of ${qc.checks.length} checks passed`,
    `${ok(['PDFs valid'])} PDFs valid · ${ok(['no blank','print variants','card variants','page count','page order','every page'])} Pages complete · ${ok(['approved artwork','card artwork','derived files','aspect','each variant','minimal back','inside artwork','PNG pages','one approved image'])} Artwork verified · ${ok(['ZIP','file sizes','printing guide'])} Package verified`,
    `Print resolution: ${ppi} (source ${qc.resolution.source_px.join(', ')} px)`,
    ...(handoff.review_notes.length?['','Please check:',...handoff.review_notes.slice(0,12).map(n=>`- ${n}`)]:[]),
    '',`Files: products/${p.workspace}/production/`].join('\n').slice(0,4000);
}


// Stage 3 review: what the owner approves. Price is advisory; nothing is published.
export function marketingSummary(p,{listing,plan,qc,strategy=null}){
  const ok=qc.checks.filter(c=>c.ok).length;
  return [`🛍 PRODUCT #${p.product_id} — ETSY LISTING READY`,'',p.name,'',
    `Suggested price: £${listing.suggested_price_gbp.toFixed(2)} (advisory, not set on Etsy)`,listing.pricing_rationale,'',
    'Title:',listing.title,'','Short summary:',listing.customer_summary,'',
    "What's included:",...listing.what_you_receive.map(x=>`- ${x}`),'',
    'Tags:',listing.tags.join(' · '),'',
    `Category: ${listing.category_suggestion}`,`Occasion: ${listing.occasion} · Colours: ${listing.primary_colour}, ${listing.secondary_colour}`,'',
    ...(strategy?[`Campaign: ${strategy.visual_marketing_mood} · ${strategy.tone.join(', ')}`,'']:[]),
    'Marketing:',`${plan.slides.length} listing images · QC ${qc.passed?'PASS':'FAIL'} (${ok}/${qc.checks.length})`,
    `AI backgrounds: ${plan.scenes.length}; every product image uses the real approved artwork.`,
    ...(plan.examples?.length?[`AI coloured examples: ${plan.examples.length} (labelled as examples; the product is the line art)`]:[]),'',
    'Nothing is published. Stage 4 (Etsy) has not started.'].join('\n').slice(0,4000);
}

// ---------- Stage 4 (Etsy) ----------
const money=pr=>`${pr.currency==='GBP'?'£':`${pr.currency} `}${Number(pr.amount).toFixed(2)}`;
// Seller-side editor link: the same URL pattern the existing services draft CLI reports (live drafts only).
const editorUrl=id=>`https://www.etsy.com/your/shops/me/listing-editor/edit/${id}`;

/** Sent only after the remote draft has been read back and verified. Values are what Etsy returned. */
/** The shop-section outcome (ADR-054), short; diagnostics stay in the log and etsy/section.json. */
export function etsySectionLines(rec,p){
  if(!rec)return [];
  const retry=`Retry (free): /etsy ${p.product_id} section`;
  switch(rec.status){
    case 'assigned':case 'already_assigned':return ['🏷 Etsy section',rec.section,...(rec.created?['✅ Section created']:[]),'✅ Listing organised'];
    case 'unmapped':return ['⚠️ Etsy section not mapped',rec.label??'unknown product type'];
    case 'section_missing':return ['⚠️ Etsy section missing',rec.section,'Create it on Etsy (or re-authorise with shops_w), then:',retry];
    case 'ambiguous':return ['⚠️ Etsy section not set',rec.section,'Several matching sections exist on Etsy.'];
    default:return ['⚠️ Etsy section not set',...(rec.section?[rec.section]:[]),retry];
  }
}
export function etsyDraftSummary(p,{payload,verification,uploads,section=null,mode,publishable,publishEnabled}){
  const title=verification.checks.find(c=>c.field==='title');
  const n=(f)=>verification.checks.find(c=>c.field===f);
  const dry=mode!=='live';
  return [`🏪 PRODUCT #${p.product_id} — ETSY DRAFT READY${dry?' (DRY RUN — SIMULATED, NOTHING SENT TO ETSY)':''}`,'',p.name,'',
    'Status:',dry?'DRY RUN — no Etsy listing exists':'DRAFT — NOT LIVE','',
    'Title:',String(title?.actual??payload.listing.title),'',
    'Price:',money(payload.listing.price),'',
    'Category:',`${payload.listing.taxonomy.path} (taxonomy ${payload.listing.taxonomy.id}${dry?', simulated':''})`,'',
    'Tags:',`${payload.listing.tags.length}/13`,'',
    'Listing images:',`${uploads.images.length}/${payload.images.length}${n('listing image order')?.ok?' (approved order)':''}`,'',
    'Digital files:',`${uploads.files.length}/${payload.files.length} (${payload.files.map(f=>`${f.name}, ${(f.bytes/1e6).toFixed(1)} MB`).join('; ')})`,'',
    'Stage 2 production:','VERIFIED','','Stage 3 marketing:','VERIFIED','',
    'Etsy draft:',verification.passed?`VERIFIED (${verification.checks.length} checks)`:'NOT VERIFIED','',
    'Listing ID:',String(verification.listing_id),
    ...(section?['',...etsySectionLines(section,p)]:[]),
    ...(dry?[]:['',`Etsy listing editor: ${editorUrl(verification.listing_id)}`]),'',
    ...(payload.properties.skipped.length?[`Not set (no exact Etsy match): ${payload.properties.skipped.map(s=>`${s.field}${s.value?` "${s.value}"`:''}`).join(', ')}`,'']:[]),
    'Nothing is live on Etsy.',
    ...(publishable?[]:[publishEnabled?'':'Publishing is switched off on this server (ETSY_PUBLISH_ENABLED is not true), so there is no PUBLISH button.'])].filter((x,i,a)=>!(x===''&&a[i-1]==='')).join('\n').slice(0,4000);
}
export function etsyConfirmText(p,{payload,listingId}){
  return [`⚠️ PUBLISH PRODUCT #${p.product_id}?`,'','This will make the Etsy listing publicly available for purchase.',
    "This action will publish the listing on Etsy and may trigger Etsy's normal listing charges.",'',
    'Price:',money(payload.listing.price),'','Images:',String(payload.images.length),'','Digital files:',String(payload.files.length),'',
    'Listing ID:',String(listingId),'','Everything is re-checked against Etsy and the approved files immediately before publishing.'].join('\n');
}
export function etsyPublishedText(p,{payload,record}){
  return [`🎉 PRODUCT #${p.product_id} — LIVE ON ETSY`,'',p.name,'','Price:',money(payload.listing.price),'','Images:',String(payload.images.length),'',
    'Digital files:',String(payload.files.length),'','Listing ID:',String(record.listing_id),'','Status:','LIVE (confirmed by reading the listing back from Etsy)',
    ...(record.listing_url&&/^https:\/\/www\.etsy\.com\//.test(record.listing_url)?['',record.listing_url]:[])].join('\n');
}
