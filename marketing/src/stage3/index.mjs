// Stage 3 (ADR-025) deterministic core: facts from the approved Stage 2
// package, claim allow-list and linting, per-format slide planner,
// compositions with real product artwork, rendering and QC. No model call and
// no network here; the model-written copy and optional AI backgrounds come
// from automation/ and are only ever inputs. Per-format behaviour comes from
// the Stage 3 adapter registry (adapters/, ADR-037).
export { deriveFacts, claimIndex, Stage3Error, scrubProcess } from './facts.mjs';
export { STAGE3_ADAPTERS, stage3AdapterFor, adapterOf, planSlides, composeSlide, prepareArt, modelFacts, modelRules, sceneExclusions } from './adapters/index.mjs';
export { visualForModel } from './adapters/greeting-card.mjs';
export { claimProblems, listingProblems, titleProblems, pageQuantityProblems, LISTING_LIMITS, correctUnsupported, negatedAt } from './claims.mjs';
export { ROUTE_DIMENSIONS, MAJOR_DIMENSIONS, MIN_MAJOR_DIFFERENCES, TRANSFORMATION_DEMO, MOTIFS, COSY_DESK, routeContract, routeOf, briefMotifs, briefSimilarity, forbiddenMotifs, routeDistinctness, routeGate, gateBeforeImage, routePromptLines, routeForModel } from './routes.mjs';
export { PRICE_GBP, pence, priceProblem, canonicalPrice } from './price.mjs';
export { normaliseTag, selectTags, selectMaterials, TAG_SUBSTITUTIONS } from './tags.mjs';
export { CANVAS, PRIMITIVES, PRIMITIVE_NAMES } from './greeting-card.mjs';
export { CROCHET_VISUAL_DIRECTION, isCrochetFormat, crochetImageDirection, crochetImageAvoid, crochetDirectionBrief, crochetMarketingDirection, imageDirectionFor, PROOF_STAGES, STYLE_PROOF_NOTE, TRACEABLE_NOTE } from './crochet-visual-direction.mjs';
export { VISUAL_SPEC_VERSION, VISUAL_MATCH_STATUSES, ORNAMENT_MEDIA, featuresOf, visualSpec, visualSpecProblems, visualSpecWarnings, checkVisualSpec, crochetProductPrompt } from './crochet-visual-spec.mjs';
export { deriveStrategy, productFamily, DESCRIPTION_STRUCTURE, AVOID_ALWAYS } from './strategy.mjs';
export { campaignFor, campaignCopy, CAMPAIGN_VERSION } from './campaign.mjs';
export { renderSlides, accentFor, makeThumbnails, THUMB } from './render.mjs';
export { runStage3Qc, productShare } from './qc.mjs';
export { ENGINES, ENGINE_VERSION, ENGINE_LIGHTING, engineOf, usesEnvironment, engineMinShare, defaultDirection, normaliseDirection, layoutFor, composeEngineSlide, productLikeShapes, engineQc, REGION_TEMPLATES, slideArtwork, representativeArtwork } from './engines.mjs';
export { BUYER_JOBS, BACKGROUNDS, COMPOSITIONS, CREATIVE_VERSION, normaliseCreative, composeCreative, creativeVariety, creativeTruth, usesCreativeEnvironment, limitEnvironments, creativeSlides, catalogueForModel, compositionsForModel, baselineForModel, MAX_ENVIRONMENTS, environmentCap } from './creative.mjs';
export { TEXT_ZONES, MAX_UPSCALE, fitCrop } from './primitives.mjs';
// Colouring-book creative plan (ADR-060): concept validation, example fidelity, backplate differentiation.
export { normaliseConcept, conceptDigest, SCENE_BANNED } from './creative.mjs';
export { COLOURING_CREATIVE_VERSION, COLOURING_MAX_ENVIRONMENTS, COLOURING_COMPOSITIONS, planColouringCreative, colouringCatalogue, colouringCreativeDirection, baselineConcept, CONCEPT_BRIEF, conceptBriefFor, heroPlacement, editorialPlacement, finaliseColouringPlan, BRIEF_BANNED_EXTRA } from './colouring-creative.mjs';
export { exampleFidelity, fidelityChecks, FIDELITY_SEVERE, FIDELITY_MILD } from './example-fidelity.mjs';
export { backplateDifferentiation, dhash, DUPLICATE_BITS, SIMILAR_BITS } from './backplates.mjs';
