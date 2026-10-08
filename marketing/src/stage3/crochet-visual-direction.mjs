// The ONE authoritative visual direction for crochet pattern products
// (ADR-043). Every crochet image prompt inherits it: Stage 1 creative
// direction, specification, concept previews and artwork proofs
// (automation/src/openai), and the Stage 3 crochet marketing adapter's model
// rules (adapters/crochet-pattern-bundle.mjs). Other formats never read it.
//
// Two layers, never mixed:
//   - BRANDING: the identity around the product (type, ornaments, palette).
//     Illustration and subtle watercolour ornaments are allowed here only.
//   - PRODUCT: the crocheted pieces themselves. They must read as real yarn
//     and stitches, photographed: never painted, drawn, vector, plastic,
//     porcelain, real flowers or clipart.
// The product is a DIGITAL crochet pattern: a rendered crochet piece is a
// visualisation of what can be made from the patterns, never a photograph of
// a test-made item and never something the buyer receives
// (crochet-integrity.mjs keeps enforcing the claims).
// Data and pure text builders only: no I/O, no model call.

export const CROCHET_FORMAT_ID='crochet-pattern-bundle';
export const isCrochetFormat=f=>f===CROCHET_FORMAT_ID;

export const CROCHET_VISUAL_DIRECTION=Object.freeze({
  version:1,
  format:CROCHET_FORMAT_ID,
  branding:Object.freeze({
    role:'Secondary decoration around the product: typography, background, ornaments and frames only.',
    identity:'Moonlit Meadow: a dreamy moonlit meadow, botanical identity',
    palette:Object.freeze(['cream','warm ivory','soft blush','lavender','sage']),
    details:Object.freeze(['tasteful crescent-moon details','fine botanical ornaments','elegant serif typography',
      'subtle watercolour ornaments (allowed in the branding layer only)']),
    feeling:'romantic, premium, handmade'}),
  product:Object.freeze({
    role:'The crocheted pieces themselves: the primary hero of every image they appear in.',
    must:Object.freeze(['physically crocheted from yarn','photorealistic, high-end realistic product photography','clearly visible yarn fibres',
      'visible crochet stitches','realistic loops, petal construction and stitch definition','genuine handmade depth and small imperfections',
      'proper soft shadows and real dimensionality','believable yarn thickness','crochet stems, leaves and flowers where relevant']),
    styling:Object.freeze(['softly styled linen or neutral interior','soft natural light','clean premium editorial styling'])}),
  productMustNotLook:Object.freeze(['watercolour painted','hand illustrated','flat vector art','digitally painted','porcelain','plastic',
    'like real biological flowers','like generic floral clipart']),
  // What a buyer must understand from the Etsy thumbnail.
  readsAs:'Those are crochet pieces made of yarn, and this listing contains crochet patterns.',
  hero:Object.freeze({
    priorities:Object.freeze(['the realistic finished crochet piece (e.g. a bouquet) as the primary hero, occupying much of the image',
      'a large, readable pattern quantity','a clear product type','an uncluttered composition','crochet texture visible even at Etsy thumbnail size',
      'clean premium editorial styling','the branding identity as secondary decoration']),
    hierarchy:Object.freeze(['collection name (small)','pattern count (largest)','product type, e.g. CROCHET FLOWER PATTERNS',
      'format line, e.g. Pattern Bundle • US Terms • Instant Download','the large realistic crochet piece',
      'up to three short benefits, only when the facts support them'])}),
  listingSequence:Object.freeze([
    Object.freeze({n:1,role:'hero',purpose:'Realistic completed crochet piece (e.g. bouquet) with a strong headline.'}),
    Object.freeze({n:2,role:'pattern-overview',purpose:'Many finished crochet pieces shown individually.'}),
    Object.freeze({n:3,role:'detail',purpose:'Macro close-up: visible crochet stitches and yarn texture.'}),
    Object.freeze({n:4,role:'whats-included',purpose:'A clear visual grid of the included patterns.'}),
    Object.freeze({n:5,role:'learning',purpose:'A tasteful representation of the step-by-step written instructions (only when the deliverables support it).'}),
    Object.freeze({n:6,role:'variations',purpose:'Different combinations achievable from the patterns.'}),
    Object.freeze({n:7,role:'lifestyle',purpose:'The finished crochet piece displayed realistically, e.g. in a vase in an interior.'}),
    Object.freeze({n:8,role:'digital-product',purpose:'PDF / tablet / printable pattern presentation.'})]),
  disclosure:Object.freeze([
    'This is a DIGITAL crochet pattern product: only PDF patterns are delivered.',
    'A rendered crochet piece is a visualisation of what can be made from the patterns: never a photograph of a test-made item, and never something the buyer receives.'])
});

const D=CROCHET_VISUAL_DIRECTION;
const list=a=>a.join(', ');

/**
 * Before the patterns exist, crochet previews and proofs are CONCEPT / STYLE proofs only (ADR-047): they set the
 * look, never the product. After APPROVE PATTERNS, Restyle makes the traceable (pattern-derived) product visuals.
 */
export const PROOF_STAGES=Object.freeze({style:'concept-style',traceable:'traceable-product'});
export const STYLE_PROOF_NOTE='CONCEPT / STYLE PROOF ONLY (the crochet patterns do not exist yet): this image establishes typography, palette, Moonlit Meadow branding, background, ornament style and general crochet realism. It is NOT the finished result of any specific pattern and NOT the final bundle: show a generic realistic crochet arrangement. Any flower types named above are mood references only; show no pattern count, no pattern names and no precise petal or leaf count as final.';
export const TRACEABLE_NOTE='PATTERN-DERIVED PRODUCT VISUAL: the crochet pieces are exactly those in the specification above (approved patterns, checked against them). A rendered example of the finished crochet design, not a photograph.';

/** The two-layer direction as one prompt block for any crochet IMAGE prompt. stage: 'style' (before patterns; default) or 'traceable' (after Restyle). */
export function crochetImageDirection({stage='style'}={}){
  return [`CROCHET PRODUCT DIRECTION (authoritative for this crochet pattern product; it overrides any conflicting style, medium or avoid wording above). Two layers, never mixed:`,
    `1. BRANDING LAYER (${D.branding.role}) ${D.branding.identity}; palette ${list(D.branding.palette)}; ${list(D.branding.details)}. Feeling: ${D.branding.feeling}. Any painted, illustrated or watercolour style above applies to this layer ONLY.`,
    `2. PRODUCT REPRESENTATION (${D.product.role}) The crochet pieces must look ${list(D.product.must)}. Styling: ${list(D.product.styling)}. Make the crochet piece large, with its yarn and stitch texture visible even at Etsy thumbnail size.`,
    `The crochet product must NOT look ${list(D.productMustNotLook)}.`,
    `A viewer must understand at a glance: "${D.readsAs}"`,stage==='traceable'?TRACEABLE_NOTE:STYLE_PROOF_NOTE].join('\n');
}

// Avoid-list entries (written by the creative-direction model) that would forbid the realistic crochet product.
const CONFLICTS=/\b(photo\w*|realis\w*|mock-?ups?|finished crochet|crochet (objects?|items?|pieces?|flowers?)|yarn)\b/i;
/** A crochet image avoid list: conflicting entries dropped (with what was dropped), the product's must-not list added. */
export function crochetImageAvoid(avoid=[]){
  const dropped=avoid.filter(a=>CONFLICTS.test(a));
  return {avoid:[...avoid.filter(a=>!CONFLICTS.test(a)),...D.productMustNotLook.map(x=>`a crochet product that looks ${x}`)],dropped};
}

/** For the TEXT models that write a crochet creative direction or specification (Stage 1). */
export function crochetDirectionBrief(){
  return [`CROCHET VISUAL DIRECTION (authoritative for crochet pattern products):`,
    `- Keep two layers apart. BRANDING (type, background, ornaments): ${D.branding.identity}; ${list(D.branding.palette)}; ${list(D.branding.details)}; ${D.branding.feeling}.`,
    `- PRODUCT (every crocheted piece shown): ${list(D.product.must)}; ${list(D.product.styling)}.`,
    `- The crochet product must never look ${list(D.productMustNotLook)}.`,
    `- Any illustration, painting or watercolour medium you choose describes the BRANDING layer only. Never put photorealism, realistic product photography, yarn or finished crochet pieces on the avoid list: they are required for the product.`,
    `- Before the patterns exist, every artwork page is a CONCEPT / STYLE proof only: it sets typography, palette, branding, background, ornament style and general crochet realism. The cover shows a large, generic realistic crochet arrangement with the branding around it; further pages may show generic crochet pieces or a macro close-up of stitches and yarn texture.`,
    `- In page briefs, artwork descriptions and cover text, never name specific flower species, petal or leaf counts, pattern names or a pattern count: the final species, counts and bouquet come from the approved patterns later (Restyle), and a pre-pattern proof must never conflict with them.`,
    `- ${D.disclosure.join(' ')}`].join('\n');
}

/** For Stage 3 crochet copy and art-direction prompts (added to the crochet adapter's model rules). */
export function crochetMarketingDirection(){
  return [
    `Visual direction: the realistic crochet piece in the approved artwork is the hero; the ${D.branding.identity.split(':')[0]} branding (${list(D.branding.details.slice(0,3))}) is secondary decoration.`,
    `Hero priorities: ${list(D.hero.priorities)}. Hierarchy: ${D.hero.hierarchy.join(' > ')}.`,
    `Listing image roles, in order: ${D.listingSequence.map(s=>`${s.n} ${s.role}`).join(', ')}.`,
    'Environment scene briefs describe the surroundings only (linen, soft neutral interiors, soft light); code composites the approved crochet artwork and the real pages.',
    ...D.disclosure];
}

/**
 * A format's image direction for callers that take it as a parameter (the
 * Stage 1 concept-preview builder, which imports no marketing code):
 * {text, avoid(list) -> list} for crochet, null for every other format.
 */
export const imageDirectionFor=format=>isCrochetFormat(format)?{text:crochetImageDirection(),avoid:a=>crochetImageAvoid(a).avoid}:null;
