// PATTERN -> VISUAL integrity for crochet product images (ADR-046).
// Deterministic; no model, no image call. The written pattern is the source
// of truth: a crochet VISUAL SPEC is built from the approved patterns'
// fingerprints (production/src/crochet/fingerprint.mjs), checked against them,
// and only then turned into an image prompt. The prompt names exactly the
// pattern-supported pieces and forbids everything else.
//
//   visual spec = {version, kind, items:[{pattern_id, quantity, features}], ornaments:[{kind, medium}], composition, status}
//
// visual_match_status:
//   derived             the spec was built from the written patterns' fingerprints
//   internally_checked  the spec passed every pattern <-> visual check below
//   physically_verified a person crocheted the pattern and confirmed the result.
//                       NEVER set by code: it needs a human testing record.

export { VISUAL_SPEC_VERSION, VISUAL_MATCH_STATUSES, ORNAMENT_MEDIA, featuresOf, visualSpec, visualSpecProblems, visualSpecWarnings, checkVisualSpec } from '../../../production/src/crochet/visual-spec.mjs';

const YARN={'0-lace':'lace-weight','1-super-fine':'fingering-weight','2-fine':'sport-weight','3-light':'DK (light) weight','4-medium':'worsted (medium) weight',
  '5-bulky':'bulky','6-super-bulky':'super bulky','7-jumbo':'jumbo'};
const WORD=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
const words=n=>WORD[n]??String(n);

/** One piece described ONLY from its pattern-supported features. */
function describe(it,fp){
  const f=it.features, parts=[];
  const what=f.flower_type?`a crochet ${f.flower_type}`:f.motif_type==='foliage'?`a crochet ${fp.pattern_name.toLowerCase()}`:`a crochet ${f.motif_type??'piece'}`;
  parts.push(`${what}${f.width_cm?` about ${f.width_cm} cm across`:''}${f.height_cm?`${f.width_cm?' and':' about'} ${f.height_cm} cm long`:''}`);
  if(f.petal_layer_count)parts.push(`${words(f.petal_layer_count)} distinct petal layer${f.petal_layer_count>1?'s':''}`);
  if(f.petal_count)parts.push(`${f.petal_count} petals in total`);
  if(f.petal_shape)parts.push(`${f.petal_shape} petals`);
  if(f.centre?.present)parts.push(f.centre.type?`a ${f.centre.type} centre`:'a crochet centre');
  if(f.leaves)parts.push(f.leaves.present?(f.leaves.count?`${words(f.leaves.count)} ${f.leaves.shape?`${f.leaves.shape} `:''}crochet lea${f.leaves.count>1?'ves':'f'}`:'crochet leaves'):'no leaves');
  if(f.embellishments?.length)parts.push(`with ${f.embellishments.join(', ')} as the pattern specifies`);
  parts.push(f.stem?.present?(f.stem.wired?'a crochet-covered wire stem':'a crochet stem'):'no stem');
  parts.push(`${YARN[fp.yarn_weight]??'the pattern\'s'} yarn${fp.fibres.length?` (${fp.fibres.join(', ')})`:''}${fp.hook_mm?`, ${fp.hook_mm} mm hook`:''}`);
  const cr=fp.colour_roles.filter(c=>c.colour);
  if(cr.length)parts.push(`colours: ${cr.map(c=>c.role&&c.role!==c.colour?`${c.colour} (${c.role})`:c.colour).join(', ')}`);
  const unknown=fp.unknown.filter(u=>!['finished_width'].includes(u));
  return `${it.quantity} × ${fp.pattern_name} [pattern ${it.pattern_id}]: ${parts.join('; ')}.${unknown.length?` Not specified by the pattern: ${unknown.map(u=>u.replace(/_/g,' ')).join(', ')}; keep these plain, never add distinctive features for them.`:''}`;
}

/**
 * The product part of a crochet image prompt, built from a CHECKED spec only.
 * Throws when the spec has not passed the pattern <-> visual checks.
 */
export function crochetProductPrompt(spec,fingerprints){
  if(spec.status!=='internally_checked')throw new Error(`crochet visual spec is ${spec.status}, not internally_checked: ${(spec.problems??[]).map(p=>`${p.item} ${p.attribute}: ${p.reason}`).join('; ')||'not checked'}`);
  const total=spec.items.reduce((s,i)=>s+i.quantity,0);
  const absent=[];
  if(spec.items.every(i=>!i.features.embellishments?.length))absent.push('beads','buttons','embroidery','wire','glued-on extras');
  return ['Render the finished crochet result represented by this specification (a rendered example of the finished crochet design, derived from the written patterns):',
    ...spec.items.map(it=>`- ${describe(it,fingerprints[it.pattern_id])}`),
    `Show ONLY these crochet pieces: ${total} in total, exactly the quantities listed. Every visible crochet piece is one of them.`,
    `Do NOT add: extra petals or petal layers, leaves or stems not listed, extra flower centres, ${absent.length?`${absent.join(', ')}, `:''}any other crochet flower or decorative crochet structure.`,
    spec.ornaments?.length?`Branding ornaments (${spec.ornaments.map(o=>o.kind).join(', ')}) are flat ${[...new Set(spec.ornaments.map(o=>o.medium))].join('/')} decoration, clearly distinct from the crochet pieces; they are printed artwork, not crochet or yarn.`:'',
    spec.composition?`Composition: ${spec.composition}`:''].filter(Boolean).join('\n');
}
