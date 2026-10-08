// Concept previews (gate 1: "which idea?"). One quick image per concept,
// built deterministically. The shared creative direction contributes STYLE
// only; each concept's visual_route supplies its own subject, scene,
// composition and lighting, and the other routes are named as things to avoid.
import { loadPrompt, render } from './prompts.mjs';
import { STYLE_FIELDS, leakedDirectionFields, routeSummary } from '../orchestrator/diversity.mjs';
const NA=/^\s*(not applicable|n\/a|none)\s*\.?$/i;
const HERO={'greeting-card':'the card front','invitation':'the invitation front','single-printable':'the printable design',
  'printable-set':'one hero item from the set','party-kit':'one hero item from the kit','planner':'one representative planner page',
  'worksheet-bundle':'one representative worksheet','activity-book':'one representative activity page','colouring-book':'one representative colouring page','crochet-pattern-bundle':'the cover artwork'};
// General characteristics only; do_not_copy items never reach an image prompt.
const REFERENCE_KEYS=[['palette_characteristics','palette'],['line_weight','linework'],['texture','texture'],
  ['composition_density','composition density'],['background_complexity','background'],['emotional_tone','mood']];
const DEFAULT_AVOID=['photorealism','logos or trademarks','copied characters or lettering','misspelled text','clutter'];
const ROUTE_LABELS=[['primary_subject','Subject'],['scene','Scene'],['focal_object','Focal object'],['composition','Composition'],['lighting','Lighting'],
  ['palette_emphasis','Palette emphasis'],['emotional_tone','Mood'],['typography_approach','Typography'],['distinguishing_visual_hook','Distinguishing hook']];
const clip=(t,n)=>{t=String(t??'').trim();return t.length<=n?t:`${t.slice(0,n).replace(/\s+\S*$/,'')}…`;};

/** Short caption line for Telegram: the route summary, else the tagline, else the description. */
export const taglineOf=c=>c.visual_route?routeSummary(c.visual_route):c.tagline??clip(c.short_description,70);
/** Brief for the key image; older concepts fall back to their description and look. */
export const briefOf=c=>c.preview_brief??`${c.short_description} Look: ${c.visual_direction_summary}`;
export const orientationOf=c=>c.orientation??'portrait';

/**
 * Shared STYLE block. Leaves out the direction's own `composition` (each
 * concept sets its own) and any field that names a concept's subject or
 * focal object (leak guard).
 */
export function styleBlock(direction,concepts,requestText){
  if(!direction)return null;
  const leaked=new Set(leakedDirectionFields(direction,concepts,requestText).fields);
  const ok=k=>direction[k]&&!NA.test(direction[k])&&!leaked.has(k);
  const params=STYLE_FIELDS.filter(k=>k!=='shared_prompt'&&k!=='composition'&&ok(k)).map(k=>`${k.replace(/_/g,' ')}: ${direction[k]}`).join('; ');
  return [ok('shared_prompt')?direction.shared_prompt:'',`SHARED STYLE (style only): ${params}.`].filter(Boolean).join('\n\n');
}

/**
 * `formatDirection` ({text, avoid(list)}, or null) is a format's authoritative image direction, passed in
 * by the workflow (crochet: marketing/src/stage3/crochet-visual-direction.mjs); this module imports no marketing code.
 */
export async function buildPreviewPrompt({requestText,concept,siblings,direction=null,analysis=null,formatDirection=null}){
  const all=[concept,...siblings];
  const style=styleBlock(direction,all,requestText)??`STYLE: ${concept.visual_direction_summary}`;
  const refs=analysis?REFERENCE_KEYS.filter(([k])=>analysis[k]&&!NA.test(analysis[k])).map(([k,l])=>`${l}: ${analysis[k]}`).join('; '):'';
  const route=concept.visual_route?ROUTE_LABELS.map(([k,l])=>`- ${l}: ${concept.visual_route[k]}`).join('\n'):`- Brief: ${briefOf(concept)}`;
  const others=siblings.map(s=>`- ${s.concept_id}: ${s.visual_route?routeSummary(s.visual_route):s.proposed_name}`).join('\n');
  const avoid=direction?.avoid??DEFAULT_AVOID, fd=formatDirection;
  return render(await loadPrompt('concept-preview'),{style,
    reference_characteristics:refs?`REFERENCE CHARACTERISTICS (general only, never copied): ${refs}.\n\n`:'',
    concept_id:concept.concept_id,request:JSON.stringify(requestText),name:concept.proposed_name,
    format:(concept.product_format??concept.product_type).replace(/-/g,' '),audience:concept.target_customer,
    hero:HERO[concept.product_format]??'the main design',route:fd?`${route}\n\n${fd.text}`:route,orientation:orientationOf(concept),
    others_ids:siblings.map(s=>s.concept_id).join(' and '),others,
    avoid:(fd?fd.avoid(avoid):avoid).join('; ')}).trim();
}
