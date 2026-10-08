// Stage 3 adapter: greeting card. The facts, claim allow-list, model facts
// and engine hooks that were Stage 3's only behaviour before the adapter
// registry (moved here unchanged); the planner and compositions stay in
// ../greeting-card.mjs and the artwork preparation in ../art.mjs.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Stage3Error } from '../errors.mjs';
import { sha, exists, readJson, verifyPackage, verifyPreviews, scrubProcess } from '../shared.mjs';
import { planSlides, composeSlide } from '../greeting-card.mjs';
import { prepareCardArt } from '../art.mjs';
import { fact } from '../primitives.mjs';

const PAPER={'A4':'210 × 297 mm','US-Letter':'8.5 × 11 in','Card-Panels-4x6in':'4 × 6 in'};
const FORMAT_LABEL={'A4':'A4','US-Letter':'US Letter','Card-Panels-4x6in':'4×6 in card panels'};

async function facts({productDir,product,prod,handoff,record,files}){
  const qc=await readJson(join(productDir,prod.qc.report));
  if(!qc.passed)throw new Stage3Error('Stage 2 QC report does not pass.');
  await verifyPackage(productDir,record);

  // Real product artwork = the delivered originals (byte-identical to the approved proofs).
  const outputs=Object.entries(record.outputs);
  const original=assetId=>{const [rel,o]=outputs.find(([,x])=>x.kind==='original'&&x.expect.identical_to===assetId)??[];
    return rel&&{asset:assetId,file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256,...(({width,height})=>({width,height}))(handoff.assets.find(a=>a.id===assetId))};};
  const textOf=assetId=>{const a=handoff.assets.find(x=>x.id===assetId);return handoff.pages.find(p=>p.page_number===a.page_number)?.approved_text??[];};
  const variants=handoff.card_variants;
  const designs=variants.map(v=>({id:v.id,name:v.name,front:original(v.front.asset),text:textOf(v.front.asset),back:v.back.type,
    files:outputs.filter(([,o])=>o.card_variant===v.id).map(([rel,o])=>({variant:o.variant,file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256}))}));
  const insideIds=[...new Set(variants.map(v=>v.inside?.asset).filter(Boolean))];
  const insides=insideIds.map(id=>({...original(id),text:textOf(id),shared_by:variants.filter(v=>v.inside?.asset===id).map(v=>v.id)}));
  // Stage 2's true renders of the customer PDFs (used to show the printable sheets).
  const previews=await verifyPreviews(productDir,qc);
  const formats=['A4','US-Letter','Card-Panels-4x6in'].filter(k=>outputs.some(([,o])=>o.variant===k)).map(k=>({key:k,label:FORMAT_LABEL[k],
    files:outputs.filter(([,o])=>o.variant===k).length}));
  const originals=outputs.filter(([,o])=>o.kind==='original').length;
  const concept=product.concepts.batches.find(b=>b.batch===product.concepts.selected.batch)?.concepts.find(c=>c.concept_id===product.concepts.selected.concept_id);
  const direction=product.visual_direction?.file&&await exists(join(productDir,product.visual_direction.file))?await readJson(join(productDir,product.visual_direction.file)):null;
  const facts={schema_version:1,product_id:product.product_id,product_name:product.name,product_type:product.product_type,product_format:handoff.product_format,
    season:product.season??null,target_customer:product.target_customer??null,
    designs,insides,formats,original_artwork_files:originals,printing_guide:outputs.some(([,o])=>o.kind==='guide'),
    guide:(([rel,o])=>rel?{file:`production/deliverables/${record.package}/${rel}`,sha256:o.sha256}:null)(outputs.find(([,o])=>o.kind==='guide')??[]),
    digital_download:true,physical_item:false,editable:false,
    package:{name:record.package,zip_mb:+(record.zip.bytes/1e6).toFixed(1),zip_sha256:record.zip.sha256},
    // Finished folded-card size per paper, as laid out by Stage 2 (the front panel box).
    card_size_mm:Object.fromEntries(['A4','US-Letter'].map(k=>[k,outputs.find(([,o])=>o.variant===k)?.[1].placements.find(p=>p.role==='front')?.box_mm.map(Math.round)]).filter(([,v])=>v)),
    effective_ppi:qc.resolution?.effective_ppi??{},
    previews,
    // For scene prompts only (never shown as a claim).
    style:{subject:concept?.visual_route?.primary_subject??null,palette:direction?.palette??null,mood:direction?.mood??null},
    sources:{handoff:prod.handoff,build_record:files.build,qc_report:{file:prod.qc.report,sha256:sha(await readFile(join(productDir,prod.qc.report)))}}};
  facts.creative=await creativeMetadata({productDir,product,handoff,variants,concept,direction});
  return facts;
}

/**
 * Descriptive creative metadata for sales copy (never a deliverable claim):
 * the collection look from the approved concept and creative direction, and a
 * per-design description only where it is verified for THAT artwork:
 *   - the approved page brief, when the page's role matches its use (a
 *     card-front page used as a front; a page repurposed from another role,
 *     like a back used as a second front, is NOT described by its brief);
 *     (fronts only: the inside is described by its facts);
 *   - or the owner's own notes in marketing/creative-notes.json
 *     ({"designs":{"B":"..."},"inside":"..."}), which take precedence.
 * All text is scrubbed of authorship/process words.
 */
async function creativeMetadata({productDir,product,handoff,variants,concept,direction}){
  const route=concept?.visual_route??{}, pageOf=id=>handoff.assets.find(a=>a.id===id)?.page_number;
  const role=n=>handoff.pages.find(p=>p.page_number===n)?.page_type, brief=n=>(product.pages??[]).find(p=>p.page_number===n)?.artwork_description??null;
  const notesPath=join(productDir,'marketing','creative-notes.json');
  const notes=await exists(notesPath)?await readJson(notesPath):{};
  const text=v=>typeof v==='string'&&v.trim()?scrubProcess(v.trim().slice(0,600)):null;
  const describe=(assetId,expectRole,owner,{briefs=true}={})=>{
    if(text(owner))return {description:text(owner),source:'owner notes (marketing/creative-notes.json)'};
    if(!briefs)return {description:null,source:'none (owner notes only)'};
    const n=pageOf(assetId);
    return role(n)===expectRole&&text(brief(n))?{description:text(brief(n)),source:`approved ${expectRole} brief (page ${n})`}:{description:null,source:role(n)&&role(n)!==expectRole?`page ${n} was briefed as ${role(n)}; its brief does not describe this use`:'none'};
  };
  const insideId=variants.find(v=>v.inside?.asset)?.inside.asset;
  return {note:'Descriptive creative metadata for sales copy only; deliverables and capabilities come from the production facts.',
    collection:{subject:route.primary_subject??null,scene:route.scene??null,focal_object:route.focal_object??null,lighting:route.lighting??null,
      palette:text(route.palette_emphasis)??text(direction?.palette),emotional_tone:text(route.emotional_tone),
      illustration_style:text(product.visual_direction?.summary?.style??direction?.illustration_style),mood:text(direction?.mood??product.visual_direction?.summary?.mood)},
    designs:Object.fromEntries(variants.map(v=>[v.id,{name:v.name,...describe(v.front.asset,'card-front',notes.designs?.[v.id])}])),
    // The inside is described by its facts (message, shared by); a brief is not proof of the finished inside art.
    inside:insideId?describe(insideId,'card-inside',notes.inside,{briefs:false}):null};
}

function claimIndex(f){
  const n=f.designs.length, words=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
  const idx={
    'product-title':[f.product_name],
    'design-count':[`${n} card design${n>1?'s':''}`,`${n} printable card design${n>1?'s':''}`,`${n} design${n>1?'s':''} included`,`${words[n]??n} designs`,String(n)],
    'design-name':f.designs.flatMap(d=>[d.name,`${d.id} — ${d.name}`,`Design ${d.id}`]),
    'format':[...f.formats.map(x=>x.label),'A4 + US Letter','A4 and US Letter','4×6 in','4 × 6 in','Folded card'],
    'digital':['Digital download','Instant digital download','No physical item is shipped','No physical item will be shipped','Print at home','Instant access after purchase'],
    'printing-guide':f.printing_guide?['Printing guide','Printing guide included','Step-by-step printing guide']:[],
    'artwork-files':[`${f.original_artwork_files} original artwork files`,`${f.original_artwork_files} PNG files`,'Original artwork files',...(f.original_artwork_files?['PDF and original artwork PNG files']:[])],
    'process':['Print at home or use a print shop','Download','Print','Trim & fold','Trim and fold','Send','Give'],
    'card-size':Object.values(f.card_size_mm??{}).flatMap(([w,h])=>[`${w} × ${h} mm`,`${w} x ${h} mm`]),
    // Paper each produced format is laid out for (A4 is 210 × 297 mm by definition).
    'paper-size':f.formats.map(x=>PAPER[x.key]).filter(Boolean),
  };
  if(f.insides.length){
    idx['inside']=[...f.insides.flatMap(i=>i.text),...(f.insides.length===1&&f.insides[0].shared_by.length>1?['1 shared inside']:[]),f.insides.some(i=>i.shared_by.length>1)?'Shared inside message':'Inside message','Illustrated inside message','Inside message'];
  }
  return idx;
}

/** What the model may know: production facts only (no file paths or hashes). */
function modelFacts(f){
  return {product_name:f.product_name,product_type:f.product_type,season:f.season,target_customer:f.target_customer,
    designs:f.designs.map(d=>({id:d.id,name:d.name,front_text:d.text})),
    inside:f.insides.map(i=>({message:i.text,shared_by_designs:i.shared_by})),
    formats:f.formats.map(x=>x.label),folded_card_size_mm:f.card_size_mm,
    original_artwork_png_files:f.original_artwork_files,printing_guide_included:f.printing_guide,
    delivery:'Instant digital download (ZIP of PDF and PNG files). No physical item is shipped.',editable:false,
    product_name_note:'product_name is the internal collection name: use it in the description if you like, never in the title.',
    visual:visualForModel(f),
    style:{mood:scrubProcess(f.style.mood)}};
}
/**
 * Verified descriptive metadata about what the artwork shows (for appealing,
 * accurate design descriptions). Only what is verified for each design is
 * passed; a design without its own description gets the collection look only.
 */
export function visualForModel(f){
  const c=f.creative;
  if(!c)return null;
  const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v));
  return {note:'What the approved artwork shows. Describe designs only from this; never invent scenery, objects or colours.',
    collection_look:clean(c.collection),
    designs:f.designs.map(d=>({id:d.id,name:d.name,front_text:d.text,
      visible_design:c.designs?.[d.id]?.description??null,
      ...(c.designs?.[d.id]?.description?{}:{guidance:'No verified description of this design: introduce it by name and the shared collection look only.'})}))};
}

/** Everything an environment scene must never contain (the product is composited by code). */
function sceneExclusions(facts){
  return ['cards','greeting cards','postcards','paper artwork','printed artwork','sheets of paper','books','posters','frames','screens',
    'text','letters','numbers','words','logos','watermarks','birds','robins',...(facts.style.subject&&!/robin|bird/i.test(facts.style.subject)?[facts.style.subject]:[]),'any other animal','people','hands'];
}

// ---------- engine hooks (Hybrid, AI Creative) ----------
/** The real artwork(s) an engine slide shows; the first leads (sets the region aspect). */
function slideArtwork(slide,facts,A){
  const first=facts.designs[0]?.id;
  if(slide.template==='design')return [A.fronts[slide.design]];
  if(slide.template==='gift')return [A.fronts[(facts.designs[1]??facts.designs[0]).id]];
  if(slide.template==='inside')return [A.insides[slide.inside??0]??A.fronts[first]];
  if(slide.template==='print')return [Object.values(A.sheets)[0]??A.fronts[first]];
  return facts.designs.slice(0,2).map(d=>A.fronts[d.id]);   // hero: the first design leads
}
function heroBenefits(facts){
  const F=new Set(facts.formats.map(f=>f.key));
  return [fact('digital','Digital download'),...(F.has('A4')&&F.has('US-Letter')?[fact('format','A4 + US Letter')]:[]),...(F.has('Card-Panels-4x6in')?[fact('format','4×6 in','4×6')]:[]),fact('digital','Print at home')];
}

/** ADR-058: the greeting-card niche's creative direction (art-direction prompts). The creative plan for cards comes later. */
function creativeDirection(){
  return {niche:'printable greeting cards',buyer_thought:'I want to give this to someone.',
    identity:'Elegant, giftable, seasonal and stationery-led: paper texture, a folded card, a warm gifting moment.',
    preferred_compositions:['editorial-hero','included-spread','process','lifestyle','fact-sheet'],
    allowed_props:['ribbon','seasonal sprigs','fountain pen','plain envelope (styling only)','linen','wooden table'],
    truth:['The card artwork is always the real approved front, placed whole.','An envelope may appear only as a styling prop, never as included.','Sizes and formats come only from the facts.'],
    avoid:['a card that reads as a physical printed product','fake handwriting or invented messages','clutter']};
}

export const greetingCard=Object.freeze({format:'greeting-card',version:1,
  facts,claimIndex,planSlides,composeSlide,prepareArt:prepareCardArt,modelFacts,sceneExclusions,
  creativeDirection,
  engines:{regionTemplates:['hero','design','gift','print','inside'],minShare:{hero:0.45,design:0.45,gift:0.35,print:0.3,inside:0.3},
    slideArtwork,heroBenefits,representative:(facts,A)=>A.fronts[facts.designs[0].id]}});
