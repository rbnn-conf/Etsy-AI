// Crochet VISUAL SET prompt builder + image calls (ADR-063). Prompts are built
// by code from the checked briefs (production/src/crochet/visual-set.mjs);
// there is no text-model call. Each prompt separates, explicitly:
//   APPROVED CROCHET OBJECTS   the only crochet/yarn items (approved pattern IDs, exact count)
//   NON-CROCHET PROPS          real, concrete objects; never crochet, knitted or yarn
//   FORBIDDEN CROCHET OBJECTS  everything else, including a second copy of an approved piece
// The product layer of the authoritative crochet direction (ADR-043) applies to every piece.
// Images go through the existing metered OpenAI client (this.ai.client.image).
import { CROCHET_VISUAL_DIRECTION as D } from '../../../marketing/src/stage3/index.mjs';
import { briefProblems } from '../../../production/src/index.mjs';

export const VISUAL_STEPS=Object.freeze({hero:'crochet-hero','pattern-preview':'crochet-preview'});
/** Hero: a wide editorial scene. Preview: square, which suits the 56 x 70 mm PDF slot best (cover crop keeps 80%). */
export const VISUAL_ORIENTATION=Object.freeze({hero:'landscape','pattern-preview':'square'});
const list=a=>a.join(', ');
const realism=()=>[`CROCHET REALISM (product layer of the authoritative crochet direction): every crochet piece must look ${list(D.product.must)}.`,
  `The crochet must NOT look ${list(D.productMustNotLook)}.`,
  'No text, lettering, labels, logos, watermarks, price tags or packaging anywhere in the image. No hands or people.'];
const piece=(o,b)=>`${o.pattern_name} [pattern ${o.pattern_id}]`+(b?`: ${b}`:'');

/** Refuses a brief that fails the pattern integrity checks: a prompt is only ever built from a checked brief. */
function assertBrief(brief,{bundle}){
  const problems=briefProblems(brief,{bundle});
  if(problems.length)throw Object.assign(new Error(`crochet visual brief failed the pattern check: ${problems.slice(0,4).join('; ')}`),{retryable:false});
}

/** The collection hero prompt (commercial / editorial). */
export function heroPrompt(brief,{bundle}){
  assertBrief(brief,{bundle});
  const objs=[brief.hero_subject,...brief.supporting_subjects], total=objs.length;
  return [`Premium editorial lifestyle product photograph for the crochet pattern collection "${brief.title}": ${brief.scene_type}, like a boutique craft-magazine shoot.`,
    `Environment: ${brief.environment}. Surface: ${brief.surface}. Lighting: ${brief.lighting}. Camera: ${brief.camera}.`,
    `Composition: ${brief.composition}. Palette: ${list(brief.palette)}.`,'',
    `APPROVED CROCHET OBJECTS — the ONLY crochet or yarn items in the image: exactly ${total}, one of each:`,
    `1. HERO (dominant focal piece): ${piece(brief.hero_subject,brief.hero_subject.staging)}`,
    ...brief.supporting_subjects.map((s,i)=>`${i+2}. ${piece(s,s.staging)}`),'',
    `NON-CROCHET PROPS (real objects, never crochet, knitted or yarn; use only these): ${brief.props.length?list(brief.props):'none'}.`,'',
    `FORBIDDEN CROCHET OBJECTS: ${list(brief.must_not_show)}.`,'',
    ...realism()].join('\n');
}

/** One finished-item preview prompt (instructional reference, ONE crochet product). */
export function previewPrompt(brief,{bundle}){
  assertBrief(brief,{bundle});
  const o=brief.crochet_objects[0];
  return [`Clean instructional product photograph of ONE finished crochet item for a pattern page: ${brief.primary_subject}.`,
    `View: ${brief.view}. Styling: ${brief.styling_context}. Background: ${brief.background}. Lighting: ${brief.lighting}.`,
    'Uncluttered and calm; the item fills most of the frame with a small margin on every side, so it can be cropped slightly to a 4:5 frame without cutting it. Consistent with the rest of the collection: same light, same warm natural surfaces.','',
    'APPROVED CROCHET OBJECT — the ONLY crochet or yarn item in the image: exactly 1.',
    `1. ${piece(o)}: finished size ${brief.finished_dimensions}; colours ${brief.colour_direction}; construction ${brief.construction}.`,'',
    `NON-CROCHET PROPS (real objects, never crochet, knitted or yarn; use only these, kept secondary): ${brief.props.length?list(brief.props):'none'}.`,'',
    `FORBIDDEN CROCHET OBJECTS: ${list(brief.must_not_show)}.`,'',
    ...realism()].join('\n');
}

export const promptFor=(brief,ctx)=>brief.kind==='hero'?heroPrompt(brief,ctx):previewPrompt(brief,ctx);

/** One paid image call through the metered client. */
export async function generateVisual(ai,{brief,prompt,size}){
  return ai.client.image({step:VISUAL_STEPS[brief.kind],model:ai.imageModel,prompt,size,quality:ai.imageQuality});
}
