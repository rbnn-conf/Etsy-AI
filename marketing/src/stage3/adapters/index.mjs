// Stage 3 marketing adapters, one per product format (the Stage 3 twin of
// production/src/adapters). An adapter decides WHAT a format's campaign says
// and shows; the engines (../engines.mjs) decide HOW it is visually produced.
// Add a format here only when its marketing is implemented; the contract is
// checked by marketing/test/stage3-adapters.test.mjs.
//
// Contract: { format, version,
//   facts(ctx) -> facts|Promise          ctx {productDir, product, prod, handoff, record, files}; SHA-verifies
//                                        everything it reads (Stage 2 files are only ever read);
//   claimIndex(facts) -> {key: phrases}  the claim allow-list;
//   planSlides(facts, {maxScenes, strategy}) -> {format, campaign, strategy, slides, scenes, examples?};
//   prepareArt(facts, productDir, workDir) -> art {..., manifest}   real Stage 2 artwork, traced;
//   composeSlide(slide, {facts, art, sceneUri, exampleUri}) -> {bodyHtml, extraCss};
//   modelFacts(facts) -> object          what OpenAI may know (no paths or hashes);
//   sceneExclusions(facts) -> string[]   what an AI environment must never contain;
//   engines: {regionTemplates, minShare, slideArtwork(slide,facts,art), heroBenefits(facts), representative(facts,art)} }
// Optional: campaign(facts, strategy) -> {name, tokens, scenes, mood, strategy} (default: campaign.mjs),
//   examplePrompt(example, facts, strategy) -> string (plans with AI colouring examples),
//   modelRules(facts) -> string[]  the format's model contract, added to every Stage 3 prompt (default: none),
//   etsyCategory: string  the format's canonical Etsy category path; code sets listing.category_suggestion to it
//                 (default: the model's suggestion, as for greeting cards).
//   creativeDirection(facts) -> {niche, buyer_thought, identity, preferred_compositions, allowed_props, truth, avoid}
//                 the niche's creative direction for the art-direction call (ADR-058);
//   creative: {plan(facts,{strategy}) -> plan, catalogue(facts, art) -> {assetId: {art, kind, ...}}}
//                 a creative campaign for Hybrid / AI Creative (ADR-058; crochet only for now).
import { greetingCard } from './greeting-card.mjs';
import { colouringBook } from './colouring-book.mjs';
import { crochetPatternBundle } from './crochet-pattern-bundle.mjs';
import { Stage3Error } from '../errors.mjs';

export const STAGE3_ADAPTERS=Object.freeze({[greetingCard.format]:greetingCard,[colouringBook.format]:colouringBook,[crochetPatternBundle.format]:crochetPatternBundle});

/** The adapter for a Stage 2 product format, or a clear, non-retryable error. */
export function stage3AdapterFor(format,{recorded=false}={}){
  const a=STAGE3_ADAPTERS[format];
  if(!a)throw new Stage3Error(`No Stage 3 marketing support for "${format}" yet (available: ${Object.keys(STAGE3_ADAPTERS).join(', ')}).${recorded?' Stage 2 recorded its marketing metadata (build record: stage3_handoff).':''}`);
  return a;
}
/** The adapter for derived facts (facts written before the registry are greeting cards). */
export const adapterOf=facts=>stage3AdapterFor(facts?.product_format??'greeting-card');

// Format-agnostic entry points used by the workflow, renderer and engines.
export const planSlides=(facts,opts)=>adapterOf(facts).planSlides(facts,opts);
export const composeSlide=(slide,ctx)=>adapterOf(ctx.facts).composeSlide(slide,ctx);
export const prepareArt=(facts,productDir,workDir)=>adapterOf(facts).prepareArt(facts,productDir,workDir);
export const modelFacts=facts=>adapterOf(facts).modelFacts(facts);
export const sceneExclusions=facts=>adapterOf(facts).sceneExclusions(facts);
export const modelRules=facts=>adapterOf(facts).modelRules?.(facts)??[];
