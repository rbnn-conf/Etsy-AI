// @dpf/production: Stage 2 deterministic production (ADR-024).
// No runtime LLM, no network: it reads approved Stage 1 files and writes
// customer files under products/<id>/production/.
export { createHandoff, writeHandoff, verifyHandoffSources, HANDOFF_FILE, BOOK_MANIFEST, BOOK_QC } from './handoff.mjs';
// Deterministic colouring-page inspection, shared by Stage 1 creative QC and this Stage 2 handoff.
export { inspectArtwork, pageProblems, bookArtworkQc, bookPagesDigest, bookContactSheet, PAGE_ID, BOOK_QC_VERSION, LIMITS as BOOK_QC_LIMITS } from './artwork-qc.mjs';
// Owner override for decorative artwork overflow only (ADR-067).
export { OVERFLOW_RULE, OVERFLOW_CHECK, overflowReview, overflowOverride, effectiveBookQc, overrideStatement } from './artwork-override.mjs';
export { buildProduction, BUILD_RECORD, DELIVERABLES, PACKAGE_DIR } from './build.mjs';
export { withBuildLock, acquireBuildLock, releaseBuildLock, BuildLockedError, BUILD_LOCK, STALE_BUILD_LOCK_MS } from './build-lock.mjs';
export { runQc, QC_REPORT, PREVIEWS } from './qc.mjs';
export { adapterFor, ADAPTERS } from './adapters/index.mjs';
export { packageDesign, liveDesign, packageDesignCheck, describePackage, designLabel, refusalLabels } from './package-design.mjs';
export { HandoffError, ProductionQcError } from './errors.mjs';
// Crochet pattern bundle (ADR-040/041): source-content validation, the deliverable model and the Stage 2 adapter.
export { CROCHET_FORMAT, CROCHET_SCHEMA_VERSION, PATTERN_SOURCE, validateCrochetBundle, assertCrochetBundle, isTested, crochetIntegrity,
  BUNDLE_REQUIRED, PATTERN_REQUIRED, SKILL_LEVELS, YARN_WEIGHTS, AI_ORIGIN, VERIFICATION_STATUSES, PROVENANCE_ORIGINS,
  isPlaceholderText, usedAbbreviations, abbreviationKeys, glossaryKey, detachedPieces, continuesWork } from './crochet/bundle.mjs';
export { crochetDeliverablePlan, CROCHET_DELIVERABLE_KINDS } from './crochet/deliverables.mjs';
export { hookText, hookOf, usHookLabel } from './crochet/hook.mjs';
export { patternFingerprint, bundleFingerprints, unknownOf, listingFacts, FINGERPRINT_VERSION, FLOWER_TYPES } from './crochet/fingerprint.mjs';
export { printableStrings, unprintableCharacters, crochetPrintability, printabilityErrors, printableLocation, codePoint, DOCUMENT_FONTS } from './crochet/printable.mjs';
export { VISUAL_SPEC_VERSION, VISUAL_MATCH_STATUSES, ORNAMENT_MEDIA, featuresOf, visualSpec, visualSpecProblems, visualSpecWarnings, checkVisualSpec } from './crochet/visual-spec.mjs';
export { crochetVisualsCheck, crochetProductionReadiness, rebindVisualSpecs, approvedAttempt, VISUAL_SPECS_FILE, VISUALS_UNCHECKED, ACCEPTED_MATCH, REQUIRED_SPECS } from './crochet/visual-gate.mjs';
// Crochet visual set (ADR-063): collection hero + one finished-item preview per approved pattern; briefs, integrity, file QC, Stage 2 gate.
export { VISUAL_SET_VERSION, VISUAL_SET_DIR, VISUAL_BRIEFS, VISUAL_MANIFEST, HERO_ASSET, HERO_FILE, previewAsset, previewFile, historyFile, PREVIEW_CAPTION, PREVIEW_SLOT_MM,
  MIN_PREVIEW_PPI, GOOD_PREVIEW_PPI, MIN_VISIBLE_FRACTION, MAX_HERO_PIECES, crochetObjectOf, fingerprintSha, canonSha, heroSceneBrief, patternPreviewBriefs, visualBriefs,
  briefProblems, visualSetProblems, slotFit, visualFileChecks, visualSetQc, assetsDigest, approvedVisualSet } from './crochet/visual-set.mjs';
