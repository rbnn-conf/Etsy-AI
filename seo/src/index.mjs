// @dpf/seo: SEO / Discovery Engine (foundation + Opportunity Engine v1, ADR-031/032). See docs/SEO_DISCOVERY_ENGINE.md.
//
// Production Engine = HOW products are manufactured.
// SEO / Discovery Engine = WHAT search positioning makes commercial sense
// before manufacturing.
//
// Pure data and deterministic functions over manually captured research.
// No network, no model, no Etsy, no Telegram, no production code (enforced by tests).
export { CONVERSION_LABELS, SOURCE_TYPES, CAPTURE_METHODS, normaliseKeyword, matchKey, validateObservation, ingestObservations, observationId } from './observations.mjs';
export { createResearchSet, researchSha, observationFor, ResearchStore, RESEARCH_SCHEMA_VERSION } from './research.mjs';
export { MODES, IDEA_STATUSES, OPTIONAL_FIELDS, STANDARD_AUDIENCES, DELIVERY_METHODS, validateIdea } from './idea.mjs';
export { createBriefDraft, scoreBrief, submitForOwnerReview, recordOwnerDecision, validateBrief, createProductionHandoff, briefSha, APPROVAL_STATUSES, CONFIDENCE, EVIDENCE_ROLES, OPPORTUNITY_SCORES_CONTRACT, BRIEF_SCHEMA_VERSION, HANDOFF_SCHEMA_VERSION } from './brief.mjs';
export { validateSnapshot, createListingReview, createListingRecommendation, titleLead, ETSY_LIMITS, SNAPSHOT_SCHEMA_VERSION } from './listing.mjs';
export { positioning, titleDirection, tagCandidates, descriptionPlan, thumbnailIntent } from './positioning.mjs';
export { validatePerformance, PERFORMANCE_SCHEMA_VERSION, PERFORMANCE_SOURCES } from './performance.mjs';
export { validateProfile, classifyKeyword, signature, token, profileSha, RELEVANCE_CLASSES, FACETS, SEASONALITY, TOKEN_ALIASES, PROFILE_SCHEMA_VERSION } from './relevance.mjs';
export { scoreOpportunities, explainDifference, demandScore, competitionScore, conversionScore, trendScore, seasonalityScore, relevanceScore, finalScore, round1,
  SCORING_VERSION, DEMAND_REFERENCE, COMPETITION_REFERENCE, WEIGHTS, RELEVANCE_VALUES, CONVERSION_VALUES, SEASONALITY_VALUES, NEUTRAL, CLOSE_COMPETITION_POINTS,
  MAX_SECONDARY, ROLES, REJECTION_REASONS, DISCLAIMER } from './scoring.mjs';
export { diagnosticsTable, opportunityReport } from './report.mjs';
export { resolveIdea, generateQueries, normaliseQuery, createResearchPlan, applyResearch, markUnavailable, setPlanStatus, planExistingListingResearch, researchPlanReport,
  PLAN_SCHEMA_VERSION, PLAN_STATUSES, OBSERVATION_STATUSES, INTENT_TYPES, COMPLETENESS, MAX_QUERIES, CAPTURE_FIELDS, FORMAT_FAMILIES, THEME_VARIANTS, SEARCH_SHAPES } from './planner.mjs';
export { listingIdea } from './planner.mjs';
export { createListingResearchPlan, createInitialRound, researchState, nextResearchRound, markRoundTermUnavailable, clusterKeywords, buildEvidencePackage, evidenceResearch,
  validateEvidencePackage, scoreEvidencePackage, auditListingFromEvidence, roundReport, statusReport, discoveredReport, clustersReport, finishWithCurrentEvidence,
  FINISH_WITH_CURRENT_EVIDENCE, OWNER_STOP_WARNING,
  MAX_TOTAL_RESEARCH_QUERIES, MAX_EXPANSION_ROUNDS, MAX_NEW_TERMS_PER_ROUND, MIN_RELEVANT_OBSERVATIONS, TERM_STATES, ROUND_STATUSES, READINESS, CLUSTER_TYPES, DISCOVERY_RULE,
  ROUND_SCHEMA_VERSION, PACKAGE_SCHEMA_VERSION } from './expansion.mjs';
export { runResearchCommand, mergeCapture } from './workspace.mjs';
export { ResearchWorkspace } from './workspace.mjs';
export { listingRecommendationFromResult } from './listing.mjs';
export { parseEtsyCount, parseConversionText, parseTrend, parseDailyCounts, parseRelatedTerms, observationFromEntry, CONVERSION_CHOICES, DAILY_COUNT_DAYS } from './capture.mjs';
export { profileFromIdea } from './intake.mjs';
export { proposeRevision, composeTitleLead } from './revision.mjs';
