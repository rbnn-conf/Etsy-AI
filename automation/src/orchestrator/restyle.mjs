// RESTYLE for a creatively approved crochet product (ADR-044): pure helpers,
// no I/O and no model or image call. A restyle replaces the visual direction
// and the artwork page briefs with ones that follow the authoritative crochet
// visual direction (marketing/src/stage3/crochet-visual-direction.mjs, ADR-043),
// clears only the creative (style) approval, and returns the product to
// SPEC_READY. New style proofs are made only when the owner confirms them
// (paid). The approved patterns are never touched: their approval is bound to
// the pattern source's SHA-256, not to the look.
//
// Page briefs are rebuilt by code from the APPROVED pattern source, so the
// cover count/terms and the overview's pattern names are never stale. The
// pattern index with every name is typeset by code in Stage 2; no artwork page
// carries a model-drawn list.
import { needsPatterns, patternsApproved } from './crochet.mjs';
import { selectProofPages } from './proofs.mjs';
import { crochetImageAvoid, visualSpec, checkVisualSpec, crochetProductPrompt } from '../../../marketing/src/stage3/index.mjs';
import { bundleFingerprints, FLOWER_TYPES } from '../../../production/src/index.mjs';

export const RESTYLE_VALUES_FILE='creative/restyle-direction.json';
export const restyleArchiveDir=stamp=>`creative/history/restyle-${stamp}`;
export const RESTYLE_REASON='The approved style proofs show an illustrated/painted crochet product; the authoritative crochet visual direction (ADR-043) requires realistic crochet with illustrated branding only.';

/** Why this product cannot be restyled now, or null. */
export function restyleProblem(p){
  if(!needsPatterns(p))return 'Restyle is available for crochet pattern bundles only.';
  if(p.status!=='CREATIVE_APPROVED')return `Restyle needs an approved style; #${p.product_id} is ${p.status}.`;
  if(p.lock)return `#${p.product_id} is busy (${p.lock.op}).`;
  if(!patternsApproved(p))return 'Approve the patterns first: the new page briefs use the real pattern names and count.';
  return null;
}
export const canRestyle=p=>!restyleProblem(p);

// Words and bans from the superseded illustrated direction that must not survive into a restyled direction or brief.
export const RESTYLE_BANNED=Object.freeze([
  [/gouache/i,'gouache'],
  [/\billustrated\b[^.;]{0,40}\bbouquet/i,'illustrated bouquet'],
  [/\bnever photograph/i,'never photographic'],
  [/\brather than photograph/i,'rather than photography'],
  [/\billustrations? only\b/i,'illustrations only'],
  [/\bpainted\b[^.;,]{0,30}\b(flowers?|bouquets?|petals?|icons?)\b/i,'painted flowers'],
  [/\b(no|never|without)\b[^.;]{0,60}\b(finished crochet|crochet (items?|objects?|pieces?)|yarn)\b/i,'a ban on finished crochet or yarn']]);
const TEXT_FIELDS=['illustration_style','line_weight','line_quality','detail_level','character_language','background_density','composition','palette',
  'colour_mode','shading','texture','mood','age_suitability','print_considerations','shared_prompt'];
/** Superseded phrases left anywhere a proof prompt reads: [{where, phrase}]; [] when clean. */
export function restyleConflicts({direction,pages,canvas}){
  const out=[], check=(where,text)=>{for(const [re,phrase] of RESTYLE_BANNED)if(re.test(String(text??'')))out.push({where,phrase});};
  for(const k of TEXT_FIELDS)check(`direction.${k}`,direction[k]);
  direction.avoid.forEach((a,i)=>{check(`direction.avoid[${i}]`,a);if(crochetImageAvoid([a]).dropped.length)out.push({where:`direction.avoid[${i}]`,phrase:'an avoid entry that bans the realistic crochet product'});});
  for(const pg of pages)for(const k of ['title','concept','artwork_description','generation_prompt','production_notes'])check(`pages[${pg.page_number}].${k}`,pg[k]);
  check('canvas.format_notes',canvas?.format_notes);
  // Crochet pieces are named only by the pattern-derived visual specs (ADR-046), never by the shared style text.
  for(const k of TEXT_FIELDS){const m=SPECIES.exec(String(direction[k]??''));if(m)out.push({where:`direction.${k}`,phrase:`names a crochet ${m[1]} outside the pattern-derived spec`});}
  return out;
}
const SPECIES=new RegExp(String.raw`\bcrochet\s+(?:[\w-]+\s+){0,4}?(${FLOWER_TYPES.map(f=>f.replace(/[-']/g,'\\$&')).join('|')})s?\b`,'i');
/** Restyle values that would bypass the patterns: [] when fine. */
export function restyleValuesProblems(values={}){
  return ['hero_subject','detail_subject'].filter(k=>k in (values.cover??{})||k in values)
    .map(k=>`${RESTYLE_VALUES_FILE}: "${k}" is not accepted: crochet pieces come only from the approved patterns (hero_combination / detail_pattern_id choose among them)`);
}

const BRANDING_ONLY='Branding ornaments and dividers only, never the crochet product: ';
const DEFAULT_DIRECTION=Object.freeze({
  illustration_style:'Two layers: lightly illustrated branding with botanical ornaments and serif typography; the crochet product rendered as realistic high-end yarn crochet product photography.',
  shading:'Product: soft natural directional light, realistic contact shadows and dimensional depth. Branding ornaments: soft and flat.',
  texture:'Product: visible yarn fibres, crochet loops, stitches and small handmade irregularities. Background: subtle cream linen weave.',
  detail_level:'Crochet construction must remain legible at Etsy thumbnail size. Branding ornaments should remain sparse and fine.'});
export const VISUALISATION_NOTE='The crochet piece is a rendered visualisation of the pattern outcome, not a photograph of an item supplied to the buyer.';
const quotedFirst=t=>/[“"]([^”"]{1,60})[”"]/.exec(String(t??''))?.[1]??null;

/**
 * The restyled direction (version + 1): the owner's/committed values where
 * given, else the defaults; line weight/quality scoped to the branding; the
 * avoid list without entries that ban the realistic product, plus one that
 * keeps instructions out of the artwork. Every other field is kept.
 */
export function restyledDirection(previous,{values={},now}){
  const v=values.direction??{}, keep=k=>previous[k];
  const scoped=k=>{const t=v[k]??keep(k);return t.startsWith(BRANDING_ONLY)?t:`${BRANDING_ONLY}${t}`;};
  const base=crochetImageAvoid(previous.avoid).avoid.filter(a=>!/^a crochet product that looks /.test(a));
  const avoid=[...new Set([...base,'Stitch diagrams, charts or written instructions inside the artwork',...(v.avoid_add??[])])];
  return {...Object.fromEntries(TEXT_FIELDS.map(k=>[k,keep(k)])),...DEFAULT_DIRECTION,
    ...Object.fromEntries(Object.entries(v).filter(([k])=>TEXT_FIELDS.includes(k))),
    shared_prompt:v.shared_prompt??`Premium crochet pattern collection: ${DEFAULT_DIRECTION.illustration_style} ${DEFAULT_DIRECTION.texture}`,
    line_weight:scoped('line_weight'),line_quality:scoped('line_quality'),avoid,
    version:previous.version+1,scope:'shared-style',source:'restyle',based_on_references:previous.based_on_references??[],
    feedback_applied:'Restyle: realistic crochet product, illustrated branding only (ADR-043).',created_at:now};
}

/**
 * The three pattern-derived visual specs (ADR-046), each checked against the
 * approved patterns' fingerprints:
 *   cover    a bouquet = one approved combination (real pattern IDs and quantities),
 *            else the focal pattern alone;
 *   overview the first nine approved patterns, one each;
 *   detail   a macro of the focal pattern.
 * values.hero_combination (a combination name) and values.detail_pattern_id choose among approved items only.
 */
export function restyleVisualSpecs({bundle,plan=null,values={}}){
  const fingerprints=bundleFingerprints(bundle), ids=bundle.patterns.map(p=>p.pattern_id);
  const focalId=plan?.patterns?.find(x=>x.role==='focal'&&ids.includes(x.pattern_id))?.pattern_id;
  const combos=bundle.combinations?.items??[], heroName=values.cover?.hero_combination??values.hero_combination??null;
  const combo=heroName?combos.find(c=>c.name===heroName)
    :combos.find(c=>focalId&&c.patterns.some(x=>x.pattern_id===focalId))??combos[0];
  if(heroName&&!combo)throw new Error(`hero_combination "${heroName}" is not a combination in the approved patterns`);
  const detailId=values.detail_pattern_id??focalId??ids.find(i=>fingerprints[i].motif_type==='flower')??ids[0];
  const ornaments=[{kind:'crescent moon',medium:'illustration'},{kind:'fine botanical sprigs',medium:'illustration'}];
  const check=s=>checkVisualSpec(s,{fingerprints,approvedIds:ids});
  return {fingerprints,combination:combo?.name??null,
    cover:check(visualSpec({kind:'bouquet',items:combo?combo.patterns.map(x=>({pattern_id:x.pattern_id,quantity:x.quantity})):[{pattern_id:focalId??ids[0],quantity:1}],
      fingerprints,ornaments,composition:'one large arrangement filling much of the page on soft cream linen, natural product-photography light; branding ornaments small around the title'})),
    overview:check(visualSpec({kind:'overview',items:ids.slice(0,9).map(pattern_id=>({pattern_id,quantity:1})),fingerprints,
      composition:'each piece shown separately in a clean editorial grid on soft cream linen; no text, labels, numbers or lists'})),
    detail:check(visualSpec({kind:'detail',items:[{pattern_id:detailId,quantity:1}],fingerprints,
      composition:'macro close-up: individual stitches, loops and yarn fibres in sharp focus, soft natural side light, shallow depth of field; no text'}))};
}

/**
 * The three artwork page briefs from the CHECKED visual specs (restyleVisualSpecs):
 * 1 cover (count and terms from the approved source), 2 pattern overview (no list on the page),
 * 3 stitch-detail motif. Page numbers and page_count are unchanged (3 artwork pages).
 */
export function restyledPages(previousPages,{bundle,values={},visuals}){
  const N=bundle.patterns.length, T=bundle.terminology, F=visuals.fingerprints;
  const c=values.cover??{}, prevCover=previousPages.find(pg=>/cover/i.test(pg.page_type))??previousPages[0];
  const title=c.title??quotedFirst(prevCover?.generation_prompt)??bundle.title, subtitle=c.subtitle??'Crochet Pattern Bundle';
  const countLine=`${N} ${c.count_noun??'crochet patterns'} • ${T} terms`;
  const note=values.production_note??VISUALISATION_NOTE;
  const listed=s=>s.items.map(i=>`${i.quantity} × ${F[i.pattern_id].pattern_name} (${i.pattern_id})`).join(', ');
  return [
    {page_number:1,page_type:'cover',title:prevCover?.title??title,
      concept:`Cover for a ${N}-pattern ${T}-terms crochet pattern collection: a realistic crochet arrangement made only of approved patterns, with the branding around it.`,instructions:null,
      artwork_description:`${visuals.combination?`The "${visuals.combination}" arrangement`:'The focal piece'} (${listed(visuals.cover)}) fills much of the page on soft cream linen in natural product-photography light. Small crescent-moon and botanical branding frame the title, subtitle and count line in elegant serif type.`,
      generation_prompt:`Cover artwork.\n${crochetProductPrompt(visuals.cover,F)}\nCover text: title text exactly “${title}”; subtitle exactly “${subtitle}”; small line exactly “${countLine}”.`,
      production_notes:`Verify the cover text exactly: “${title}”, “${subtitle}” and “${countLine}” (from the approved pattern source). Crochet pieces: ${listed(visuals.cover)}, from creative/visual-specs.json. ${note}`},
    {page_number:2,page_type:'pattern-overview',title:'Pattern Overview',
      concept:`Overview of the collection: individual finished crochet pieces from the ${N} approved patterns.`,instructions:null,
      artwork_description:`A clean editorial arrangement of individual realistic finished crochet pieces (${listed(visuals.overview)}), each shown separately on cream linen with soft shadows.`,
      generation_prompt:`Pattern overview.\n${crochetProductPrompt(visuals.overview,F)}`,
      production_notes:`Shows ${visuals.overview.items.length} of the ${N} approved patterns: ${listed(visuals.overview)}. The pattern index with every name is typeset by code in production, never drawn by the image model. ${note}`},
    {page_number:3,page_type:'detail-motif',title:'Stitch Detail',
      concept:'A macro close-up that proves the craft: real crochet stitches and yarn texture.',instructions:null,
      artwork_description:`A macro close-up of ${F[visuals.detail.items[0].pattern_id].pattern_name}: individual stitches, loops and yarn fibres in sharp focus, cream linen behind.`,
      generation_prompt:`Macro stitch detail.\n${crochetProductPrompt(visuals.detail,F)}`,
      production_notes:`Used as the back-page motif. Crochet piece: ${listed(visuals.detail)}. ${note}`}];
}

/** The product after a restyle (no I/O). `archive` is the history directory the caller wrote. */
export function restyledProduct(p,{direction,pages,archive,actor,now,visualSpecs=null}){
  const attempt=p.proofs.attempts.filter(a=>a.status==='complete'&&(!p.creative_approved_at||a.finished_at<=p.creative_approved_at)).at(-1)??null;
  const record={at:now,by:actor,reason:RESTYLE_REASON,archive,
    previous:{creative_approved_at:p.creative_approved_at,direction_version:p.visual_direction?.version??null,approved_attempt:attempt?.attempt??null},
    direction_version:direction.version,patterns_sha256:p.crochet.approval.source_sha256,
    ...(visualSpecs?{visual_specs:visualSpecs.file,visual_match_status:visualSpecs.status}:{})};
  return {...p,pages,proofs:{...p.proofs,selected_pages:selectProofPages(pages)},creative_approved_at:null,pending_input:null,
    restyles:[...(p.restyles??[]),record]};
}
