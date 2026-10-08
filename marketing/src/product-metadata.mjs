/**
 * Derive VERIFIED marketing metadata for a product.
 *
 * Marketing assets may only assert things that appear here, and every
 * capability below is gated on the **workbook QC report** — if QC did not
 * confirm it, it is not claimed. Worksheet count comes from the actual build
 * report and must agree with the design spec or this throws.
 *
 * Input reports come from the xlsx pipeline:
 *   xlsx-build-report.json   (products/<id>/xlsx/build.mjs — what was built)
 *   xlsx-qc-report.json      (products/<id>/xlsx/qc.mjs   — what passed)
 */

export class MarketingMetadataError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "MarketingMetadataError";
  }
}

// The dashboard (monthly-overview) is shown in the hero, not the feature grid —
// the grid is the tracking sheets only, so "six tracking sheets" stays accurate.
const FEATURE_LABELS = {
  "income-tracker": { label: "Income tracking", caption: "Every income source, expected vs. actual, with a running total." },
  "fixed-expenses": { label: "Bill & fixed-expense tracking", caption: "Due dates, autopay and paid tick-boxes, category dropdown, monthly total." },
  "variable-spending": { label: "Budget vs. actual", caption: "Flexible categories with an auto Difference that turns red when you overspend." },
  "daily-expense-log": { label: "Daily expense log", caption: "31 pre-numbered days with a category picker and a month total." },
  "savings-debt": { label: "Savings & debt tracking", caption: "Goals and paydown, each with a progress bar, kept separate." },
  "month-end-review": { label: "Month-end review", caption: "Budgeted vs. actual reconciliation and one change for next month." },
};

/**
 * @param {object} args
 * @param {object} args.productSpec        products/<id>/product-spec.json
 * @param {object} args.xlsxDesignSpec     products/<id>/xlsx-design-spec.json
 * @param {object} args.buildReport        storage/.../xlsx-build-report.json
 * @param {object} args.qcReport           storage/.../xlsx-qc-report.json
 * @param {object} [args.listing]          products/<id>/listing/listing.json (optional)
 * @returns {ProductMarketingData}
 */
export function deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport, listing }) {
  if (!qcReport?.results?.length) {
    throw new MarketingMetadataError("qcReport has no results — run workbook QC first");
  }
  if ((qcReport.summary?.fail ?? 1) !== 0) {
    throw new MarketingMetadataError(
      `workbook QC has ${qcReport.summary.fail} failing check(s) — marketing must not be built on a failing workbook`,
    );
  }

  const passed = (needle) =>
    qcReport.results.some((r) => r.pass && r.check.toLowerCase().includes(needle.toLowerCase()));
  const evidenceFor = (needle) => {
    const r = qcReport.results.find((x) => x.pass && x.check.toLowerCase().includes(needle.toLowerCase()));
    return r ? `workbook QC: “${r.check}”${r.detail ? ` (${r.detail})` : ""}` : null;
  };

  // ---- worksheet count: verified from the actual build ----
  const builtSheets = (buildReport?.sheets ?? []).filter((n) => n !== "Lists");
  const specSheets = (xlsxDesignSpec?.sheets ?? []).map((s) => s.name);
  if (builtSheets.length === 0) {
    throw new MarketingMetadataError("build report lists no sheets");
  }
  if (builtSheets.length !== specSheets.length) {
    throw new MarketingMetadataError(
      `built ${builtSheets.length} sheets but the design spec declares ${specSheets.length}`,
    );
  }
  const worksheets = { count: builtSheets.length, names: builtSheets };

  // ---- capabilities: each gated on a passing workbook-QC check ----
  const maybe = (cond, cap) => (cond ? [cap] : []);
  const recalculationProven =
    passed("= σ") || passed("leftover = income") || passed("savings rate =") || passed("scenario");
  const capabilities = [
    ...maybe(passed("contains formulas") && recalculationProven, {
      id: "formulas",
      label: "Automatic calculations",
      caption: "Totals, remaining balance, budget vs. actual and your savings rate update themselves.",
      icon: "∑",
      evidence: evidenceFor("contains formulas") + " + recalculation scenario",
    }),
    ...maybe(passed("dropdown"), {
      id: "dropdowns",
      label: "Dropdown category pickers",
      caption: "Consistent categories from a list — no typos, no mismatches.",
      icon: "▾",
      evidence: evidenceFor("dropdown"),
    }),
    ...maybe(passed("highlights over") || passed("conditional"), {
      id: "conditional-formatting",
      label: "Over-budget highlighting",
      caption: "The Difference column turns red the moment a category goes over.",
      icon: "◑",
      evidence: evidenceFor("highlights over") ?? evidenceFor("conditional"),
    }),
    ...maybe(passed("currency format"), {
      id: "currency",
      label: `${symbolFor(buildReport?.currency)} currency formatting`,
      caption: `Real ${buildReport?.currency ?? "GBP"} number formatting, not typed-in text.`,
      icon: symbolFor(buildReport?.currency),
      evidence: evidenceFor("currency format"),
    }),
    ...maybe(passed("percent format"), {
      id: "percent",
      label: "Savings-rate %",
      caption: "Your savings rate as a live percentage with a progress bar.",
      icon: "%",
      evidence: evidenceFor("percent format"),
    }),
    ...maybe(passed("protected"), {
      id: "protection",
      label: "Protected formulas, editable inputs",
      caption: "Type in the yellow cells; the grey formula cells are locked so you can't break them.",
      icon: "🔒",
      evidence: evidenceFor("protected"),
    }),
    ...maybe(passed("print area") && passed("orientation portrait"), {
      id: "print",
      label: "Print-ready layout",
      caption: "Each sheet has a print area and fits one page wide — A4 or US Letter.",
      icon: "🖶",
      evidence: `${evidenceFor("print area")}; ${evidenceFor("orientation portrait")}`,
    }),
  ];

  // ---- features: only sheets that were actually built ----
  const features = worksheets.names
    .map((name) => xlsxDesignSpec.sheets.find((s) => s.name === name))
    .filter(Boolean)
    .map((s) => ({ slug: s.slug, sheetName: s.name, ...(FEATURE_LABELS[s.slug] ?? null) }))
    .filter((f) => f.label);

  // ---- format / delivery ----
  const primaryType =
    productSpec.primaryExport?.type === "hybrid" ? "xlsx" : productSpec.primaryExport?.type ?? "xlsx";
  const delivery =
    (listing?.listingType ?? "download") === "download" ? "instant-download" : "download";

  const hasCap = (id) => capabilities.some((c) => c.id === id);

  // ---- "what's included": each item is a stamped claim traceable above ----
  const whatsIncluded = [
    { text: `1 Excel workbook (.xlsx) — ${worksheets.count} worksheets`, claimKey: "worksheet-count", claimValue: String(worksheets.count) },
    ...(hasCap("formulas") ? [{ text: "Automatic formulas & totals throughout", claimKey: "cap-formulas", claimValue: "Automatic calculations" }] : []),
    ...(hasCap("dropdowns") ? [{ text: "Dropdown category pickers", claimKey: "cap-dropdowns", claimValue: "Dropdown category pickers" }] : []),
    ...(hasCap("currency") ? [{ text: `${symbolFor(buildReport?.currency)} (${buildReport?.currency ?? "GBP"}) currency formatting`, claimKey: "cap-currency", claimValue: `${symbolFor(buildReport?.currency)} currency formatting` }] : []),
    ...(hasCap("print") ? [{ text: "Print-ready — A4 & US Letter page setup", claimKey: "cap-print", claimValue: "Print-ready layout" }] : []),
    { text: "Instant digital download — nothing is shipped", claimKey: "delivery", claimValue: delivery },
    { text: "Undated — reuse it every month, forever", claimKey: "undated", claimValue: "undated" },
  ];

  return {
    productId: String(productSpec.productId),
    title: productSpec.name,
    kicker: productSpec.niche?.split("/")[0]?.trim() || "Digital planner",
    subtitle: firstSentence(productSpec.description) || "A functional monthly budget you actually keep using.",
    targetCustomer: productSpec.targetCustomer ?? "",
    format: { primary: primaryType, all: productSpec.exportFormats ?? ["xlsx"] },
    currency: buildReport?.currency ?? "GBP",
    delivery,
    undated: /undated/i.test(productSpec.description ?? "") || undefined,
    worksheets,
    capabilities,
    features,
    whatsIncluded,
    howItWorks: deriveHowItWorks(productSpec, worksheets),
    brand: { name: productSpec.name, tagline: "Plan · Track · Review" },
    // for QC: the flat set of verifiable claim tokens
    claimIndex: buildClaimIndex({
      productSpec,
      worksheets,
      capabilities,
      delivery,
      features,
      currencyCode: buildReport?.currency ?? "GBP",
    }),
  };
}

function deriveHowItWorks(productSpec, worksheets) {
  // Straight from the product's own plan -> track -> review concept.
  return [
    { title: "Plan the month", caption: "Fill in the Overview, Income, Bills and Variable Spending sheets.", claimKey: "step-plan" },
    { title: "Track as you go", caption: `Log every purchase on the Daily Expense Log — ${worksheets.names.includes("Daily Expense Log") ? "31 days" : "day by day"}.`, claimKey: "step-track" },
    { title: "Review & adjust", caption: "Reconcile budget vs. actual and carry one change into next month.", claimKey: "step-review" },
  ];
}

/**
 * Flat map: stable claim key -> allowed normalized values. Marketing-Claim QC
 * fails on any `data-claim` key not present here, or a value/text that matches
 * none of the entries.
 */
function buildClaimIndex({ productSpec, worksheets, capabilities, delivery, features, currencyCode }) {
  const sym = symbolFor(currencyCode);
  const idx = {
    "product-title": [norm(productSpec.name)],
    "worksheet-count": [
      String(worksheets.count),
      norm(`${worksheets.count} worksheets`),
      norm(`${worksheets.count} functional worksheets`),
    ],
    format: ["xlsx", ".xlsx", "excel", "excel workbook", "microsoft excel", "excel · xlsx", "excel xlsx"],
    currency: [
      norm(currencyCode || "GBP"),
      sym,
      norm(`${sym} ${currencyCode}`),
      norm(`${sym} (${currencyCode})`),
      norm(`${currencyCode} (${sym})`),
    ],
    delivery: [
      delivery,
      "instant-download",
      "instant digital download",
      norm("Instant digital download — nothing is shipped"),
    ],
    undated: ["undated", norm("Undated — reuse it every month, forever")],
    "step-plan": [norm("Plan the month")],
    "step-track": [norm("Track as you go")],
    "step-review": [norm("Review & adjust")],
  };
  for (const c of capabilities) {
    idx[`cap-${c.id}`] = [c.id, norm(c.label)];
  }
  for (const f of features) {
    idx[`feature-${f.slug}`] = [f.slug, norm(f.label), norm(f.sheetName)];
  }
  return idx;
}

function symbolFor(code) {
  return { GBP: "£", USD: "$", EUR: "€" }[String(code || "GBP").toUpperCase()] ?? "£";
}
function firstSentence(s) {
  if (!s) return "";
  const m = String(s).split(/(?<=[.!?])\s/);
  return (m[0] || "").trim();
}
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'")
    .trim();
}

/** @typedef {ReturnType<typeof deriveMarketingData>} ProductMarketingData */
