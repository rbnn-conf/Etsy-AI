// Concept diversity and the creative-direction boundary. Deterministic: no
// model call, no computer vision.
//
// The shared creative direction is STYLE (medium, texture, linework, palette
// family, mood). Each concept's `visual_route` is CONTENT (subject, scene,
// focal object, composition, lighting). Gate 1 only works if the three routes
// genuinely differ, so a batch is rejected before any image is paid for when
// they don't.
const STOP=new Set(('a an the and or of in on at to with without for from by into onto over under through across along its it this '+
  'that their his her as is are be very slightly softly gently small little tiny large big single one two three some few near').split(' '));
const singular=w=>w.length>4&&w.endsWith('ies')?`${w.slice(0,-3)}y`:w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
/** Normalised content words, minus stop words and minus anything the owner's request already says. */
export function words(text,exclude=new Set()){
  return String(text??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/)
    .filter(w=>w.length>2&&!STOP.has(w)).map(singular).filter(w=>!exclude.has(w));
}
const jaccard=(a,b)=>{const A=new Set(a),B=new Set(b);if(!A.size&&!B.size)return 1;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n);};
// Subject and focal object are short noun phrases with the main noun last.
const head=(t,ex)=>words(t,ex).at(-1)??'';

// Five core dimensions. Owner-required words are removed first, so a subject
// the owner asked for counts as shared and the other dimensions must differ.
export const DIMENSIONS=Object.freeze([
  ['subject',(a,b,ex)=>head(a.primary_subject,ex)===head(b.primary_subject,ex)],
  ['scene',(a,b,ex)=>jaccard(words(a.scene,ex),words(b.scene,ex))>=0.5],
  ['focal object',(a,b,ex)=>head(a.focal_object,ex)===head(b.focal_object,ex)],
  ['composition',(a,b,ex)=>jaccard(words(a.composition,ex),words(b.composition,ex))>=0.5],
  ['lighting',(a,b,ex)=>jaccard(words(a.lighting,ex),words(b.lighting,ex))>=0.5]
]);
export const MIN_DIFFERENT=3;

/** Pairs of concepts that are not meaningfully different visual routes; [] when the batch is diverse. */
export function diversityProblems(concepts,requestText=''){
  const ex=new Set(words(requestText)), e=[];
  for(let i=0;i<concepts.length;i++)for(let j=i+1;j<concepts.length;j++){
    const a=concepts[i],b=concepts[j];
    if(!a.visual_route||!b.visual_route){e.push(`${a.concept_id}/${b.concept_id}: missing visual_route`);continue;}
    const same=DIMENSIONS.filter(([,eq])=>eq(a.visual_route,b.visual_route,ex)).map(([n])=>n);
    if(DIMENSIONS.length-same.length<MIN_DIFFERENT)
      e.push(`${a.concept_id} and ${b.concept_id} are the same visual route (same ${same.join(', ')}; ${DIMENSIONS.length-same.length} of ${DIMENSIONS.length} dimensions differ, need ${MIN_DIFFERENT})`);
  }
  return e;
}

/** One-line route summary, e.g. "fox / snowy woodland / parcel / daylight". */
export const routeSummary=r=>[r.primary_subject,r.scene,r.focal_object,r.lighting].join(' / ');

// Direction fields that describe style. `avoid` and code-owned fields are not style text.
export const STYLE_FIELDS=Object.freeze(['shared_prompt','illustration_style','line_weight','line_quality','detail_level','character_language',
  'background_density','composition','palette','colour_mode','shading','texture','mood','print_considerations']);

/**
 * Leak guard: direction fields that name a concept's own subject or focal
 * object (and the owner didn't ask for it). Such content belongs to one
 * concept, so those fields are left out of prompts rather than imposed on
 * every concept.
 */
export function leakedDirectionFields(direction,concepts,requestText=''){
  if(!direction)return {fields:[],terms:[]};
  const ex=new Set(words(requestText));
  const terms=[...new Set(concepts.filter(c=>c.visual_route).flatMap(c=>[head(c.visual_route.primary_subject,ex),head(c.visual_route.focal_object,ex)]).filter(Boolean))];
  const fields=STYLE_FIELDS.filter(k=>typeof direction[k]==='string'&&words(direction[k]).some(w=>terms.includes(w)));
  return {fields,terms:terms.filter(t=>fields.some(k=>words(direction[k]).includes(t)))};
}

/** Directions written before the style-only boundary (e.g. Product #009 v1). */
export const isLegacyDirection=d=>!!d&&d.scope!=='shared-style';
