// Stage 3 (ADR-025) OpenAI work: listing copy, image copy + scene briefs, and
// optional AI BACKGROUND scenes. Every output is checked against the Stage 2
// production facts before it can be used; the product artwork itself is never
// generated (scene prompts forbid it, and images only ever place the real
// Stage 2 files).
import { structured } from '../openai/prompts.mjs';
import { loadSchema } from '../orchestrator/schema.mjs';
import { InvalidModelOutputError } from '../openai/client.mjs';
import { imageSizeFor } from '../orchestrator/canvas.mjs';
import { listingProblems, claimProblems, correctUnsupported, selectTags, selectMaterials, campaignFor, deriveStrategy, titleProblems, modelFacts, modelRules, sceneExclusions as excluded, adapterOf, Stage3Error, canonicalPrice } from '../../../marketing/src/stage3/index.mjs';
export { visualForModel } from '../../../marketing/src/stage3/index.mjs';

/** What the model may know: production facts only (no file paths or hashes), per format (Stage 3 adapter). */
export const factsForModel=f=>modelFacts(f);
/** The format's model contract as one prompt section ('' when a format has none, e.g. greeting cards: prompts unchanged). */
export function formatRules(facts){
  const r=modelRules(facts);
  return r.length?`FORMAT RULES (${facts.product_format}; authoritative, and code rejects any output that breaks them):\n${r.map(x=>`- ${x}`).join('\n')}`:'';
}

/**
 * What is and is not delivered, stated to the listing model from the same production facts the validator reads
 * (ADR-064). Not a second source of truth: every line is a facts field.
 */
export function deliverableRules(facts){
  const r=[];
  if(facts.editable!==true)r.push('editable: false. Nothing in this product is editable. Never call the product, its pages, files or any template "editable" or "customisable", and never tell the buyer to edit text or files. Do not mention editing at all: a statement about a feature the buyer does not receive is unnecessary.');
  if(facts.digital_download)r.push('digital_download: true; physical_item: false. Say it is a digital download and that no physical item is shipped.');
  if(facts.product_format==='colouring-book'&&!facts.coloured_versions_delivered)r.push('coloured_versions_delivered: false. The pages are delivered as line art to colour. A coloured example in the listing images is an illustration only: never say coloured or pre-coloured pages, versions or examples are included.');
  return r.length?`DELIVERABLE FACTS (authoritative; code rejects any contradiction):\n${r.map(x=>`- ${x}`).join('\n')}`:'';
}

/** Presentation guidance for the model (never a source of facts). */
export function strategyForModel(st){
  const {schema_version,note,title_strategy,...rest}=st;
  return {...rest,title_structure:title_strategy.join(' + ')};
}

/**
 * listing_claims is supporting metadata (the model's own list of the claims its copy makes). One over-long
 * claim must not throw away a whole paid listing (same philosophy as ADR-043/048/058): an item whose text or
 * key exceeds the schema's limit is DROPPED before validation (never truncated), and the drop is recorded.
 * Everything else is validated exactly as before: the remaining claims (keys, texts), the title, the
 * description and every required field. Limits come from the committed schema.
 */
export function dropOverLongClaims(data,{text,key}){
  if(!Array.isArray(data?.listing_claims))return {data,changes:[]};
  const changes=[], kept=[];
  data.listing_claims.forEach((c,i)=>{
    const t=typeof c?.text==='string'?c.text.length:0, k=typeof c?.key==='string'?c.key.length:0;
    const why=t>text?`text is ${t} characters (limit ${text})`:k>key?`key is ${k} characters (limit ${key})`:null;
    if(why)changes.push({field:'listing_claims',index:i,key:c.key,text:c.text,reason:`dropped, not truncated: ${why}`});else kept.push(c);
  });
  return {data:changes.length?{...data,listing_claims:kept}:data,changes};
}

export async function generateListing(ai,{facts,strategy=deriveStrategy(facts),seo=null}){
  const claimLimits=(await loadSchema('listing')).properties.listing_claims.items.properties;
  const user=[`PRODUCTION FACTS (the only claims you may make):\n${JSON.stringify(factsForModel(facts),null,2)}`,
    `MARKETING STRATEGY (how to present these facts; never a source of facts):\n${JSON.stringify(strategyForModel(strategy),null,2)}`,
    // Owner-approved SEO research (Marketplace Insights evidence, ADR-041): search wording only, never a fact. Absent unless approved.
    seo?`OWNER-APPROVED SEARCH FOCUS (from captured Etsy Marketplace Insights; search wording only, never a claim): lead the title with "${seo.primary}"${seo.secondary.length?`; also use naturally: ${seo.secondary.join(', ')}`:''}${seo.supporting.length?`; supporting phrases: ${seo.supporting.join(', ')}`:''}. Do not keyword-stuff: use each phrase at most once in the title.`:'',
    formatRules(facts),deliverableRules(facts),
    `Allowed listing_claims keys: ${Object.keys(facts.claims).join(', ')}`].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'listing',prompt:'listing',user,schemaName:'listing',
    normalize:d=>dropOverLongClaims(d,{text:claimLimits.text.maxLength,key:claimLimits.key.maxLength})});
  try{return finaliseListing(r,{facts});}
  catch(e){
    // The paid model output is kept with the error, so the workflow can save it and re-check it for free later (ADR-064).
    if(e instanceof InvalidModelOutputError)e.draft={data:r.data,model:r.model,...(r.normalized?.length?{normalized:r.normalized}:{})};
    throw e;
  }
}

/** Every model-written text field of a listing (the fields the correction layer and the claim checks read). */
const LISTING_TEXT=['title','description','hook','customer_summary','printing_summary','digital_download_disclaimer'];
const LISTING_LISTS=['what_you_receive','tag_candidates','materials'];
/**
 * The deterministic correction layer (ADR-064, claims.mjs correctUnsupported) on every text field: only an
 * unsupported qualifier in front of a deliverable that exists is removed; nothing is added. @returns {data, corrections}
 */
export function correctListing(data,facts){
  const corrections=[], d={...data}, fix=(field,v)=>{const c=correctUnsupported(v,facts);for(const x of c.changes)corrections.push({field,...x});return c.text;};
  for(const k of LISTING_TEXT)if(typeof d[k]==='string')d[k]=fix(k,d[k]);
  for(const k of LISTING_LISTS)if(Array.isArray(d[k]))d[k]=d[k].map((v,i)=>typeof v==='string'?fix(`${k}[${i}]`,v):v);
  if(Array.isArray(d.listing_claims))d.listing_claims=d.listing_claims.map((c,i)=>c&&typeof c.text==='string'?{...c,text:fix(`listing_claims[${i}]`,c.text)}:c);
  return {data:d,corrections};
}

/**
 * Everything after the listing model call, with NO model call: deterministic correction, then the claim checks,
 * tag/material selection and the Etsy rules. Also used to re-check a saved rejected draft for free (workflow).
 * `r` = {data, model, normalized?}. Throws InvalidModelOutputError when anything is still wrong.
 */
export function finaliseListing(r,{facts}){
  const corrected=correctListing(r.data,facts);
  const {tag_candidates,...rest}=corrected.data;
  // Claims first, on everything the model wrote (discarding a candidate never hides one).
  const claims=[...claimProblems(tag_candidates.join('. '),facts,{where:'tag candidates'}),...claimProblems(rest.materials.join('. '),facts,{where:'materials'})];
  // Then mechanical Etsy formatting: final tags and materials are chosen by code.
  const tagSelection=selectTags(tag_candidates,{title:rest.title}), materialSelection=selectMaterials(rest.materials);
  // A format with a canonical Etsy category (e.g. colouring books) gets it from code, never from the model's free text.
  const canonical=adapterOf(facts).etsyCategory??null;
  // The price is the model's number, only cleaned of float noise (8.950000000000001 -> 8.95); a sub-penny value is not rounded and fails below.
  const listing={...rest,suggested_price_gbp:canonicalPrice(rest.suggested_price_gbp),...(canonical?{category_suggestion:canonical}:{}),tags:tagSelection.tags,materials:materialSelection.materials};
  const problems=[...claims,...tagSelection.problems,...titleProblems(listing,facts),...listingProblems(listing,facts)];
  if(problems.length)throw new InvalidModelOutputError(`listing: rejected: ${[...new Set(problems)].slice(0,4).join('; ')}`);
  return {...r,data:listing,selection:{tag_candidates,tags:tagSelection.decisions,materials:materialSelection.decisions,
    ...(r.normalized?.length?{dropped_claims:r.normalized}:{}),   // audit (tag-selection.json): over-long claims dropped before validation
    ...(corrected.corrections.length?{corrections:corrected.corrections}:{}),   // audit: unsupported qualifiers removed before validation (ADR-064)
    ...(canonical?{category:{model:rest.category_suggestion,final:canonical,source:`canonical ${facts.product_format} category (Stage 3 adapter)`}}:{})}};
}

/**
 * One text call: extra art direction for each environment scene, and one
 * supporting line for each "tone" slide. Headlines and factual labels are
 * art-directed campaign copy rendered by code (marketing/src/stage3).
 */
export async function generateMarketingCopy(ai,{facts,plan,strategy=deriveStrategy(facts)}){
  const tone=plan.slides.filter(s=>s.tone);
  const user=[`PRODUCTION FACTS:\n${JSON.stringify(factsForModel(facts),null,2)}`,
    `CAMPAIGN (shared with the listing copy): ${strategy.visual_marketing_mood}; tone ${strategy.tone.join(', ')}; ${strategy.emotional_angle}.`,formatRules(facts),
    tone.length?`LINES (one supporting line for each id):\n${tone.map(s=>`- ${s.id}: ${s.purpose} Headline: "${String(s.copy?.headline?.text??'').replace(/\n/g,' ')}"`).join('\n')}`:'LINES: none (return an empty list).',
    plan.scenes.length?`SCENES (environment brief for each id):\n${plan.scenes.map(s=>`- ${s.id}: ${s.purpose}`).join('\n')}`:'SCENES: none (return an empty list).'].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'marketing-copy',prompt:'marketing-copy',user,schemaName:'marketing-copy'});
  const d=r.data, e=[];
  if(d.lines.map(s=>s.id).sort().join()!==tone.map(s=>s.id).sort().join())e.push('lines must be exactly the given ids');
  if(d.scenes.map(s=>s.id).sort().join()!==plan.scenes.map(s=>s.id).sort().join())e.push('scenes must be exactly the given ids');
  for(const l of d.lines)e.push(...claimProblems(l.text,facts,{where:l.id}));
  if(e.length)throw new InvalidModelOutputError(`marketing-copy: rejected: ${e.slice(0,4).join('; ')}`);
  return r;
}

/** Everything an environment scene must never contain (the product is composited by code; per format). */
export const sceneExclusions=facts=>excluded(facts);
/**
 * Deterministic environment prompt: the campaign's scene direction, the
 * model's extra brief, then the exclusions. Whatever the brief says, the
 * product, paper artwork, text and the artwork's subject are forbidden: the
 * real Stage 2 artwork is composited on top by code.
 */
export function scenePrompt({scene,brief,facts,strategy}){
  const camp=campaignFor(facts,strategy), dir=camp.scenes[scene?.id??scene]??camp.scenes.tabletop;
  const allow=dir.allow??[];
  return ['Environment-only background photograph for a premium Etsy product listing image (square).',dir.direction,
    `Campaign mood: ${camp.mood}.`,brief?`Additional art direction: ${brief}`:'',facts.style.mood?`Mood: ${facts.style.mood}`:'',
    'Photographic and realistic: soft warm light, shallow depth of field, premium and inviting. Environment only.',
    `Do NOT include: ${sceneExclusions(facts).join(', ')}.`,
    allow.includes('envelope')?'The only paper item allowed is the one blank, unmarked kraft envelope described above, with nothing written or printed on it.':'',
    allow.includes('printer')?'The printer must be empty: no paper in it or near it.':''].filter(Boolean).join('\n');
}
export async function generateScene(ai,{prompt}){
  const size=imageSizeFor(ai.imageModel,'square');
  const r=await ai.client.image({step:'marketing-scene',model:ai.imageModel,prompt,size,quality:ai.imageQuality});
  return {...r,size};
}

/**
 * AI COLOURED EXAMPLE (colouring books, ADR-037): one image edit of a REAL
 * approved page, coloured in by the model as a labelled marketing
 * illustration. The prompt is deterministic (the adapter's examplePrompt);
 * the source page is verified against the Stage 2 SHA-256 before it is sent.
 * The result is never product artwork (QC enforces it).
 */
export function examplePrompt({example,facts,strategy,concept=null}){
  const f=adapterOf(facts).examplePrompt;
  if(!f)throw new Stage3Error(`Coloured examples are not defined for "${facts.product_format}".`);
  return f(example,facts,strategy,concept);
}
export async function generateColouredExample(ai,{prompt,page,width,height}){
  const size=imageSizeFor(ai.imageModel,width>height?'landscape':width<height?'portrait':'square');
  const r=await ai.client.imageEdit({step:'marketing-example',model:ai.imageModel,prompt,image:{bytes:page,mime:'image/png',name:'page.png'},size,quality:ai.imageQuality});
  if(!r?.bytes?.length)throw new InvalidModelOutputError('marketing-example: empty image');
  return {...r,size};
}
