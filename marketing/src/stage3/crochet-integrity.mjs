// Crochet marketing integrity (ADR-041). Deterministic claim QC for any
// crochet listing copy, image headline or caption, from the Stage 2 build
// record's stage3_handoff (production/src/adapters/crochet-pattern-bundle.mjs
// stage3Metadata). Enforced for every crochet listing, image headline and tone
// line through claims.mjs claimProblems (the crochet Stage 3 adapter's facts
// carry integrity, artwork and deliverables), and stated in the model rules.
//
//   - "Approved for production" is never "tested": tested / test-crocheted /
//     verified wording only when every pattern has testing evidence.
//   - Never: professionally tested, pattern-tester approved, guaranteed,
//     error-free, foolproof.
//   - AI-generated artwork is an illustration or design preview, never
//     photographic evidence that an item was crocheted from these patterns.
//   - "Step-by-step instructions" and "digital crochet pattern" only when the
//     deliverables support them.
// Negated statements ("not test-crocheted", "no physical item") are allowed.

const NEGATION=/\b(no|not|never|without|isn'?t|aren'?t|hasn'?t|haven'?t)\b/i;
const sentences=t=>String(t??'').split(/(?<=[.!?\n])\s+/).filter(Boolean);
// [pattern, reason, allowed(facts)?]
const RULES=[
  [/\bprofessionally[- ]tested\b|\btester[- ]approved\b|\bpattern[- ]tester(s)?\b/i,'professional or tester testing is never claimed'],
  [/\bguaranteed?\b|\berror[- ]free\b|\bmistake[- ]free\b|\bfoolproof\b|\bflawless pattern\b/i,'no pattern can be guaranteed or error-free'],
  [/\b(tested|test[- ]crocheted|verified|proven)\b/i,'the patterns are not all tested (approval for production is not testing)',f=>f.integrity?.all_tested===true],
  [/\b(real|actual|finished|genuine)\s+(photo|photograph|picture)s?\b|\bphoto(graph)?s? of (the |a |my |our )?(finished|real|completed|actual)\b|\b(made|crocheted|stitched) (from|with|using) (this|these|the) patterns?\b.*\b(photo|picture|shown|pictured)\b|\b(photo|picture|shown|pictured)\b.*\b(made|crocheted) (from|with|using) (this|these|the) patterns?\b/i,
    'artwork is an illustration, not a photograph of an item made from these patterns',f=>f.artwork?.hero?.photographic_evidence===true],
  // ADR-047: physical verification is a human record, never inferred.
  [/\bphysically[- ]verified\b/i,'the patterns are not physically verified (a person has not crocheted and confirmed them)',f=>f.visuals?.visual_match_status==='physically_verified'],
  // ADR-046: until a pattern is physically crocheted and verified, a product image is a rendered example.
  [/\bphotographed\b/i,'the images are rendered examples of the finished crochet design, not photographs',f=>f.artwork?.hero?.photographic_evidence===true],
  [/\b(tested|test|finished|made|crocheted)\s+samples?\b/i,'no finished or tested sample exists',f=>f.integrity?.all_tested===true&&f.artwork?.hero?.photographic_evidence===true],
  [/\bexact(ly)?\s+(as\s+)?(pictured|shown|in the (photo|picture|image)s?)\b|\bexact\s+(photographed\s+)?results?\b/i,'no image shows an exact result of these patterns',f=>f.artwork?.hero?.photographic_evidence===true],
  [/\bstep[- ]by[- ]step\b/i,'step-by-step instructions are not proven by the deliverables',f=>f.deliverables?.step_by_step_instructions===true],
  [/\b(video|youtube)\s+(tutorial|instructions?|guide)s?\b|\bvideo included\b/i,'no video is delivered'],
  // Open-ended or inflated counts ("150+ patterns", "500+ variations"): only the exact production count is stated.
  [/\b\d+\s*\+\s*(?:[\p{L}-]+\s+){0,3}?(patterns?|designs?|variations?|flowers?|pieces?|combinations?|options?|projects?)\b/iu,'open-ended counts are never claimed; state the exact number of base patterns'],
  [/\b(yarn|hook|kit|materials?)\s+(is |are )?(included|supplied|provided)\b|\bcomes with (yarn|a hook|materials)\b/i,'only digital PDFs are delivered; no yarn, hook or kit']
];

/**
 * @param text   listing copy, a headline or a caption
 * @param facts  the crochet stage3_handoff
 * @returns [{sentence, reason}]  empty when the text is supported by the facts
 */
export function crochetClaimProblems(text,facts){
  const out=[];
  for(const s of sentences(text))for(const [re,reason,allowed] of RULES){
    if(!re.test(s))continue;
    if(allowed?.(facts))continue;
    if(NEGATION.test(s)&&!/guarantee|error[- ]free|professionally|tester/i.test(reason))continue;
    out.push({sentence:s.trim().slice(0,160),reason});
  }
  out.push(...countClaimProblems(text,facts));
  return out;
}

// ADR-047: petal / layer / leaf counts must be established by an approved pattern (pattern_facts).
const NUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,eighteen:18,twenty:20};
const NW=`(\\d{1,2}|${Object.keys(NUM).join('|')})`;
const COUNT_CLAIMS=[['petal',new RegExp(`\\b${NW}[- ](?:(?!layer)[a-z]+[- ]){0,2}?petal(?:l?ed|s)?\\b(?![- ]layer)`,'gi'),f=>f.petal_count],
  ['petal layer',new RegExp(`\\b${NW}[- ](?:petal[- ])?layer(?:ed|s)?\\b`,'gi'),f=>f.petal_layer_count],
  ['leaf',new RegExp(`\\b${NW}[- ](?:[a-z]+[- ]){0,2}?(?:leaf|leaves|leaved)\\b`,'gi'),f=>typeof f.leaves==='number'?f.leaves:null]];
/** Counts the approved patterns do not establish: [{sentence, reason}]. Pattern names (e.g. "Five-Petal Violet") are exempt. */
export function countClaimProblems(text,facts){
  const pf=facts?.visuals?.pattern_facts??[], out=[];
  let t=String(text??'');
  for(const n of pf.map(p=>p.pattern_name).filter(Boolean).sort((a,b)=>b.length-a.length))t=t.split(n).join(' ');
  for(const s of sentences(t))for(const [kind,re,get] of COUNT_CLAIMS)for(const m of s.matchAll(re)){
    const n=/^\d+$/.test(m[1])?Number(m[1]):NUM[m[1].toLowerCase()];
    if(!pf.some(p=>get(p)===n))out.push({sentence:s.trim().slice(0,160),reason:`the approved patterns do not establish ${n} ${kind}${n===1?'':'s'}`});
  }
  return out;
}

/** Internal provenance label for a campaign image: never "photo" unless evidence exists. */
export function imageProvenance(facts,{aiEnvironment=false}={}){
  if(facts.artwork?.hero?.photographic_evidence===true&&!aiEnvironment)return 'photograph (evidence recorded)';
  return aiEnvironment?'styled preview (AI environment with the approved illustration)':'illustration (approved Stage 1 artwork)';
}

/** The format's rules for any model prompt that writes crochet copy. */
export function crochetModelRules(facts){
  const i=facts.integrity??{};
  return [
    `This is a digital crochet pattern collection: ${facts.pattern_count??facts.patterns?.count} patterns as printable PDFs (A4 and US Letter), in ${facts.terminology} crochet terms.`,
    i.all_tested?'Every pattern has testing evidence; you may say the patterns were test-crocheted.'
      :'The patterns are NOT tested: never say tested, test-crocheted, verified or proven. Owner approval for production is not testing.',
    'Never say professionally tested, tester-approved, guaranteed, error-free or foolproof.',
    'The product images are illustrations, rendered visualisations and design previews, never photographs of items made from these patterns. Never describe them as photos of finished items.',
    'Describe a product image only as "Rendered example of the finished crochet design." Never call it photographed, a tested or finished sample, or an exact result.',
    'No yarn, hook, kit or video is included: only the digital files.'];
}
