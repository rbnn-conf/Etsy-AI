// Stage 3 marketing ENGINES, OpenAI side (Hybrid, AI Creative). Two kinds of
// call, both metered into the cost ledger:
//   - one structured text call for the campaign's ART DIRECTION (with the
//     real approved artwork as an image input, for colour and mood only);
//   - one image call per art-directed slide for its ENVIRONMENT.
// The model never renders the product or any text. Every direction is
// validated and clamped by marketing/src/stage3/engines.mjs; the environment
// prompt is built by code and always forbids product substitutes.
import { structured } from '../openai/prompts.mjs';
import { loadSchema } from '../orchestrator/schema.mjs';
import { InvalidModelOutputError } from '../openai/client.mjs';
import { imageSizeFor } from '../orchestrator/canvas.mjs';
import { claimProblems, engineOf, normaliseDirection, layoutFor, engineMinShare, campaignFor, adapterOf,
  normaliseCreative, limitEnvironments, catalogueForModel, compositionsForModel, baselineForModel, normaliseConcept, COMPOSITIONS, MAX_ENVIRONMENTS, environmentCap,
  routeContract, routeForModel, routePromptLines, forbiddenMotifs, briefMotifs } from '../../../marketing/src/stage3/index.mjs';
import { factsForModel, strategyForModel, sceneExclusions, formatRules } from './openai.mjs';

const BANNED_SCENE=/\b(cards?|greeting|paper|pages?|sheets?|books?|booklets?|prints?|posters?|frames?|screens?|text|letters?|lettering|words?|logos?|watermarks?|people|person|hands?|animals?|birds?)\b/i;

/**
 * Fit a model-written brief into `max` characters BEFORE validation, keeping its direction: whitespace is
 * normalised and parentheticals removed; then whole trailing sentences are dropped (the first sentence carries
 * the scene); if the first sentence alone is too long, trailing clauses are dropped instead, and the result ends
 * with a full stop. Only a single clause longer than `max` is cut, at a word boundary. Deterministic.
 * Strict structured outputs only TELL the model the limit; this is what keeps one long brief from rejecting a
 * whole paid direction call. @returns {text, changed}
 */
export function fitBrief(text,max){
  const src=String(text??''), norm=src.replace(/\s+/g,' ').trim();
  if(norm.length<=max)return {text:norm,changed:norm!==src.trim()};
  let t=norm.replace(/\s*\([^()]*\)/g,'').replace(/\s+([,.;:])/g,'$1').trim();
  // Repeated sentences add nothing: keep the first of each.
  const seen=new Set();t=t.split(/(?<=[.!?])\s+/).filter(x=>{const k=x.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).join(' ');
  if(t.length<=max)return {text:t,changed:true};
  const end=s=>/[.!?]$/.test(s)?s:`${s.replace(/[,;:\s]+$/,'')}.`;
  const sentences=t.split(/(?<=[.!?])\s+/);
  let out='';
  for(const s of sentences){const next=out?`${out} ${s}`:s;if(next.length<=max)out=next;else break;}
  if(out)return {text:end(out).length<=max?end(out):out,changed:true};
  // The first sentence alone is too long: keep its leading clauses.
  const clauses=sentences[0].split(/(?<=[,;:])\s+|\s+(?=(?:with|while|and)\s)/);
  for(const c of clauses){const next=out?`${out}${/[,;:]$/.test(out)?' ':' '}${c}`:c;if(end(next).length<=max)out=next;else break;}
  if(out)return {text:end(out),changed:true};
  const cut=sentences[0].slice(0,max-1), at=cut.lastIndexOf(' ');
  return {text:end(at>max/2?cut.slice(0,at):cut),changed:true};
}
/** fitBrief on every slides[].scene_brief of a direction payload (art-direction and creative calls). */
export function fitSceneBriefs(data,max){
  const changes=[];
  const slides=(data?.slides??[]).map(s=>{if(!s||typeof s.scene_brief!=='string'||s.scene_brief.length<=max)return s;
    const f=fitBrief(s.scene_brief,max);changes.push({id:s.id,field:'scene_brief',from:s.scene_brief.length,to:f.text.length,action:'compressed'});return {...s,scene_brief:f.text};});
  return {data:data?.slides?{...data,slides}:data,changes};
}

/**
 * @param slides      the slides to direct (engine region templates)
 * @param toneSlides  slides that need one supporting line
 * @param artwork     {mime, bytes, width, height} the real approved front (downscaled), for colour/mood
 * @param feedback    optional owner instruction (Change Direction)
 * @returns {data:{campaign, slides:{[id]:normalised}, lines}, model, usage}
 */
export async function generateArtDirection(ai,{engine,facts,strategy,slides,toneSlides=[],artwork,feedback=null,campaign=null,art=null}){
  // Creative cards (ADR-058): the same single call, under the Creative Director instruction.
  if(slides.length&&slides.every(s=>s.template==='creative'))return generateCreativeDirection(ai,{engine,facts,strategy,slides,toneSlides,artwork,feedback,campaign,art});
  const e=engineOf(engine), aspect=artwork?+(artwork.width/artwork.height).toFixed(4):null;
  const user=[`PRODUCTION FACTS:\n${JSON.stringify(factsForModel(facts),null,2)}`,
    `MARKETING STRATEGY (presentation guidance, never facts):\n${JSON.stringify(strategyForModel(strategy),null,2)}`,formatRules(facts),
    `ENGINE: ${e.title}. Allowed archetypes: ${e.archetypes.join(', ')}. product_scale ${e.scale[0]}-${e.scale[1]}. |rotation| ≤ ${e.rotation}°. |perspective| ≤ ${e.perspective}°. decor: ${e.decor.join(', ')}.`,
    engine==='ai-creative'?'CREATIVE LATITUDE: be bold and editorial. Vary archetypes, scale and angle across the campaign; cinematic depth and light.':'CREATIVE LATITUDE: restrained and premium; consistent, calm editorial compositions.',
    `PRODUCT GEOMETRY: the real artwork is ${artwork?`${artwork.width}x${artwork.height} px (aspect ${aspect}, ${aspect<1?'portrait':aspect>1?'landscape':'square'})`:'unknown'}. It is placed whole.`,
    campaign?`CAMPAIGN (keep consistent): ${JSON.stringify(campaign)}`:'',
    `SLIDES (one direction each):\n${slides.map(s=>`- ${s.id}: ${s.purpose} Headline (rendered by code): "${String(s.copy?.headline?.text??'').replace(/\n/g,' ')}"`).join('\n')}`,
    toneSlides.length?`LINES (one supporting line for each id):\n${toneSlides.map(s=>`- ${s.id}: ${s.purpose}`).join('\n')}`:'LINES: none (return an empty list).',
    feedback?`OWNER CHANGE REQUEST for this direction: ${JSON.stringify(String(feedback).slice(0,500))}`:''].filter(Boolean).join('\n\n');
  const briefMax=(await loadSchema('art-direction')).properties.slides.items.properties.scene_brief.maxLength;
  const r=await structured(ai,{step:'marketing-direction',prompt:'art-direction',normalize:d=>fitSceneBriefs(d,briefMax),user,schemaName:'art-direction',
    images:artwork?[{mime:artwork.mime,bytes:artwork.bytes}]:[]});
  const d=r.data, errors=[];
  if(d.slides.map(s=>s.id).sort().join()!==slides.map(s=>s.id).sort().join())errors.push('slides must be exactly the given ids');
  if(d.lines.map(s=>s.id).sort().join()!==toneSlides.map(s=>s.id).sort().join())errors.push('lines must be exactly the given ids');
  for(const l of d.lines)errors.push(...claimProblems(l.text,facts,{where:l.id}));
  const bad=d.slides.filter(s=>BANNED_SCENE.test(s.scene_brief)).map(s=>s.id);
  if(bad.length)errors.push(`scene briefs describe a product substitute, text or people (${bad.join(', ')})`);
  if(errors.length)throw new InvalidModelOutputError(`art-direction: rejected: ${errors.slice(0,4).join('; ')}`);
  const bySlide=Object.fromEntries(slides.map(s=>[s.id,normaliseDirection(d.slides.find(x=>x.id===s.id),s,engine)]));
  return {...r,data:{campaign:d.campaign,slides:bySlide,lines:d.lines}};
}

/**
 * Creative direction for every card of a creative plan (ADR-058): one structured
 * text call under the shared Creative Director instruction, with the niche's
 * direction, the asset catalogue (ids only), the composition vocabulary and the
 * code baseline. Each card is validated by normaliseCreative (invalid values fall
 * back to the baseline, recorded); at most MAX_ENVIRONMENTS cards keep a paid
 * environment.
 */
export async function generateCreativeDirection(ai,{engine,facts,strategy,slides,toneSlides=[],artwork,feedback=null,campaign=null,art}){
  const e=engineOf(engine), ad=adapterOf(facts);
  if(!art||!ad.creative)throw new Error('Creative direction needs the prepared artwork and a format with a creative plan.');
  const catalogue=ad.creative.catalogue(facts,art), wantsConcept=!!ad.creative.concept;
  // Colouring books: every card lists the compositions it may use; the model is told only those (crochet: unchanged).
  const allowed=[...new Set(slides.flatMap(s=>s.creative.allowed_compositions??[]))];
  const user=[`PRODUCTION FACTS:\n${JSON.stringify(factsForModel(facts),null,2)}`,
    `MARKETING STRATEGY (presentation guidance, never facts):\n${JSON.stringify(strategyForModel(strategy),null,2)}`,formatRules(facts),
    `NICHE CREATIVE DIRECTION:\n${JSON.stringify(ad.creativeDirection?.(facts)??{},null,2)}`,
    `ASSET CATALOGUE (use these ids only):\n${catalogueForModel(catalogue)}`,
    `COMPOSITIONS code can build (allowed text zones and backgrounds):\n${compositionsForModel(allowed.length?allowed:null)}`,
    wantsConcept?(typeof ad.creative.conceptBrief==='function'?ad.creative.conceptBrief(engine):ad.creative.conceptBrief):'',
    ...slides.filter(s=>s.creative.route).map(s=>`ROUTE CONTRACT for ${s.id} (code-owned; refine inside it, never change it):
${JSON.stringify(routeForModel(routeContract(s.creative.route.route,facts)),null,2)}`),
    engine==='ai-creative'?'CREATIVE LATITUDE: bold and editorial; vary compositions, grounds and text zones across the campaign.':'CREATIVE LATITUDE: restrained and premium; keep the baseline structure and refine it.',
    campaign?`CAMPAIGN (keep consistent): ${JSON.stringify(campaign)}`:'',
    `CARDS (one direction each; keep each card's job):\n${slides.map(s=>`- ${s.id} [${s.job}] ${s.purpose}\n  BASELINE: ${JSON.stringify(baselineForModel(s.creative))}`).join('\n')}`,
    toneSlides.length?`LINES (one supporting line for each id):\n${toneSlides.map(s=>`- ${s.id}: ${s.purpose}`).join('\n')}`:'LINES: none (return an empty list).',
    feedback?`OWNER CHANGE REQUEST: ${JSON.stringify(String(feedback).slice(0,500))}`:''].filter(Boolean).join('\n\n');
  const r=await structured(ai,{step:'marketing-direction',prompt:'marketing-creative-director',user,schemaName:'marketing-creative-direction',
    images:artwork?[{mime:artwork.mime,bytes:artwork.bytes}]:[],normalize:overLongCreative,modelSchema:full=>creativeModelSchema(full,{concept:wantsConcept,allowed})});
  const d=r.data, errors=[];
  if(d.slides.map(s=>s.id).sort().join()!==slides.map(s=>s.id).sort().join())errors.push('slides must be exactly the given ids');
  if(d.lines.map(s=>s.id).sort().join()!==toneSlides.map(s=>s.id).sort().join())errors.push('lines must be exactly the given ids');
  for(const l of d.lines)errors.push(...claimProblems(l.text,facts,{where:l.id}));
  if(errors.length)throw new InvalidModelOutputError(`creative-direction: rejected: ${errors.slice(0,4).join('; ')}`);
  // A scene brief that names a product substitute, text or people (even in a negation) is never used: that card
  // keeps the code baseline brief (recorded). The environment prompt adds every exclusion either way.
  // The campaign concept (colouring books): validated, every fallback to the baseline recorded. Descriptive only.
  const concept=wantsConcept?normaliseConcept(d.campaign.concept,ad.creative.plan(facts,{strategy,engine}).concept,{catalogue}):null;
  const directions=limitEnvironments(Object.fromEntries(slides.map(s=>{
    const raw=d.slides.find(x=>x.id===s.id), unsafe=BANNED_SCENE.test(raw.scene_brief??'')||!!ad.creative.bannedBrief?.test(raw.scene_brief??'');   // a format may ban more (colouring books)
    const n=normaliseCreative(unsafe?{...raw,scene_brief:''}:raw,s,{catalogue,facts});
    const cleared=(r.normalized??[]).filter(c=>c.id===s.id).map(c=>c.field);   // over-long fields cleared before validation
    const out=unsafe?{...n,scene_brief:s.creative.scene_brief??'',fallbacks:[...n.fallbacks,...cleared,'scene_brief']}:{...n,fallbacks:[...n.fallbacks,...cleared]};
    return [s.id,s.creative.route?routed(out,s,facts):out];})),slides,environmentCap(slides,ad.creative.maxEnvironments??MAX_ENVIRONMENTS));
  return {...r,data:{campaign:concept?{...d.campaign,concept}:d.campaign,slides:directions,lines:d.lines,engine:e.id}};
}

/**
 * A routed card (the hero, ADR-064): the route is code's, never the model's. A brief that falls back to the default
 * scene the route forbids (AI Creative: two or more cosy-desk motifs) is replaced by the code baseline brief, recorded.
 */
export function routed(direction,slide,facts){
  const route=slide.creative.route, contract=routeContract(route.route,facts), bad=forbiddenMotifs(contract,direction.scene_brief);
  return bad.length?{...direction,route,scene_brief:slide.creative.scene_brief,fallbacks:[...direction.fallbacks,`scene_brief (route ${route.route} forbids: ${bad.join(', ')})`]}:{...direction,route};
}

/**
 * The model-facing schema for the creative call. The committed schema allows the colouring-book additions
 * (campaign.concept, per-card support, the cb-* compositions) so crochet plans stay valid; what the MODEL is
 * asked for depends on the format: colouring books must return the concept and a support line and may use only
 * their own compositions; crochet is asked exactly what it always was.
 */
export function creativeModelSchema(full,{concept,allowed=[]}){
  const s=JSON.parse(JSON.stringify(full)), item=s.properties.slides.items.properties;
  if(concept)item.composition.enum=allowed.length?allowed:item.composition.enum.filter(c=>c.startsWith('cb-'));
  else{delete s.properties.campaign.properties.concept;delete item.support;item.composition.enum=item.composition.enum.filter(c=>!c.startsWith('cb-'));}
  return s;
}

// Creative fields the model may overrun (schema limits). An over-long value is cleared before validation, so that
// field keeps the code baseline (recorded) instead of the whole direction being rejected. Never truncated.
const CREATIVE_TEXT={purpose:240,buyer_message:240,emotional_goal:120,headline:80,focal_asset:60};
export const CREATIVE_BRIEF_MAX=400;   // = marketing-creative-direction slides[].scene_brief maxLength (a test keeps them equal)
const CREATIVE_LISTS={supporting_assets:[7,60],props:[6,40],avoid:[6,80]};
export function overLongCreative(data){
  const changes=[];
  const slides=(data?.slides??[]).map(s=>{
    if(!s||typeof s!=='object')return s;
    const o={...s}, mark=field=>changes.push({id:s.id,field});
    // An over-long scene brief is COMPRESSED (whole sentences/clauses kept), not cleared: the model's direction survives.
    if(typeof o.scene_brief==='string'&&o.scene_brief.length>CREATIVE_BRIEF_MAX){o.scene_brief=fitBrief(o.scene_brief,CREATIVE_BRIEF_MAX).text;mark('scene_brief (compressed)');}
    for(const [k,max] of Object.entries(CREATIVE_TEXT))if(typeof o[k]==='string'&&o[k].length>max){o[k]='';mark(k);}
    for(const [k,[n,max]] of Object.entries(CREATIVE_LISTS))if(Array.isArray(o[k])&&(o[k].length>n||o[k].some(x=>typeof x==='string'&&x.length>max))){o[k]=[];mark(k);}
    if(o.hierarchy&&typeof o.hierarchy==='object'&&['primary','secondary','tertiary'].some(k=>typeof o.hierarchy[k]==='string'&&o.hierarchy[k].length>120)){o.hierarchy={primary:'',secondary:'',tertiary:''};mark('hierarchy');}
    if(o.crop&&typeof o.crop==='object'&&typeof o.crop.asset==='string'&&o.crop.asset.length>60){o.crop={asset:'',focus:[.5,.5],zoom:1};mark('crop');}
    return o;});
  return {data:data?.slides?{...data,slides}:data,changes};
}

/** Environment prompt for a creative card with background "environment" (ADR-058): the scene only, a clear area for the product, the exclusions. */
export function creativeEnvironmentPrompt({direction,facts,strategy,campaign=null}){
  const camp=campaignFor(facts,strategy), right=direction.text_zone==='top-right';
  // A routed card (the hero, ADR-064) takes its camera, environment, lighting, props and style from its route contract;
  // the model's visual-world materials that the route forbids are left out. Other cards are unchanged.
  const contract=direction.route?routeContract(direction.route.route,facts):null;
  const props=contract?(direction.props??[]).filter(x=>!(contract.avoid_motifs??[]).some(m=>briefMotifs(x).includes(m))).slice(0,contract.max_props):direction.props??[];
  const concept=contract&&campaign?.concept?.visual_world?{...campaign.concept,visual_world:{...campaign.concept.visual_world,
    materials:(campaign.concept.visual_world.materials??[]).filter(x=>!(contract.avoid_motifs??[]).some(m=>briefMotifs(x).includes(m)))}}:campaign?.concept;
  return ['Environment-only background photograph for a premium Etsy listing image (square), professionally art-directed lifestyle advertising.',
    `Campaign mood: ${campaign?.mood??camp.mood}.`,campaign?.palette?`Palette: ${campaign.palette}.`:'',campaign?.lighting&&!contract?`Lighting: ${campaign.lighting}.`:'',
    ...(contract?routePromptLines(contract):[]),
    direction.scene_brief?`Scene: ${direction.scene_brief}`:'',
    props.length?`Props (plain materials only): ${props.join(', ')}.`:'',
    ...conceptLines(concept,direction),
    contract?`Composition: ${contract.prompt.camera} Keep the reserved area clear, even and softly lit, where objects will be placed later. Keep the top ${right?'right':'left'} area calm and darker for text added later.`
      :`Composition: an overhead three-quarter view of the surface; keep the centre and lower half clear, even and softly lit, where objects will be placed later. Keep the top ${right?'right':'left'} area calm and darker for text added later.`,
    contract?contract.prompt.style:'Photographic and realistic: shallow depth of field, warm natural light, restrained premium styling, no clutter.',
    `Do NOT include: ${sceneExclusions(facts).join(', ')}, any card-, page-, sheet-, book- or print-like rectangle, any mock product.`].filter(Boolean).join('\n');
}

/**
 * What a campaign concept adds to a backplate prompt (colouring books; nothing for formats without a concept):
 * the visual world, the reserved product area (a hint: code decides where the real page goes) and the promise that
 * the real artwork is composited later, so the scene must not contain any page.
 */
export function conceptLines(concept,direction){
  if(!concept)return [];
  const w=concept.visual_world??{}, reserved=COMPOSITIONS[direction.composition]?.reserved?.(direction);
  return [`Visual world: palette ${w.palette};${w.materials?.length?` materials ${w.materials.join(', ')};`:''} lighting ${w.lighting}; ${w.photography_style}.`,
    concept.emotional_hook?`Feeling: ${concept.emotional_hook}`:'',
    reserved?`Reserved area: ${reserved}. This is a hint only; keep it as an empty, softly lit surface.`:'',
    'The real printable artwork and the text are added later by code: the scene must not contain any page, sheet, paper, card, book, screen or text of its own.'].filter(Boolean);
}

const where=(zone)=>({left:'the right-hand two thirds of the frame',right:'the left-hand two thirds of the frame',top:'the lower two thirds of the frame, centred'})[zone]??'the centre of the frame';
/**
 * Deterministic environment prompt for one art-directed slide: the campaign
 * look, the slide's brief, an explicit EMPTY placement area where code puts
 * the real product, and the exclusions (product substitutes, text, people).
 */
export function environmentPrompt({engine,slide,direction,facts,strategy,campaign=null,aspect=2/3,route=null}){
  const L=layoutFor(direction,{aspect,minShare:engineMinShare(slide,engine)}), camp=campaignFor(facts,strategy);
  // `route` (the hero, ADR-064): the route contract's camera / environment / lighting / props / style lines. Other slides: unchanged.
  return ['Environment-only background photograph for a premium Etsy listing image (square), professionally art-directed advertising.',
    `Campaign mood: ${campaign?.mood??camp.mood}.`,campaign?.palette?`Palette: ${campaign.palette}.`:'',`Lighting: ${direction.lighting}${campaign?.lighting?`; ${campaign.lighting}`:''}.`,
    ...(route?routePromptLines(route):[]),
    direction.scene_brief?`Scene: ${direction.scene_brief}`:'',
    `Composition: keep ${where(L.zone)} as a clear, empty, softly lit surface with natural depth, where an object will be placed later. Keep the ${L.zone==='top'?'top':L.zone} area calm and darker for text added later.`,
    route?route.prompt.style:'Photographic and realistic: shallow depth of field, cinematic warm light, restrained premium styling, no clutter.',
    `Do NOT include: ${sceneExclusions(facts).join(', ')}, any card-, page-, sheet-, book- or print-like rectangle, any mock product.`].filter(Boolean).join('\n');
}
export async function generateEnvironment(ai,{prompt}){
  const size=imageSizeFor(ai.imageModel,'square');
  const r=await ai.client.image({step:'marketing-scene',model:ai.imageModel,prompt,size,quality:ai.imageQuality});
  if(!r?.bytes?.length)throw new InvalidModelOutputError('marketing-scene: empty image');
  return {...r,size};
}
