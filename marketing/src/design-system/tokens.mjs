/**
 * Marketing design system — tokens.
 *
 * Distinct from the spreadsheet design system (that one is deliberately
 * restrained for a working document); this one is for commercial listing
 * imagery — backgrounds, shadows, mockup framing, a display serif — but it
 * stays on-brand: the canonical LumiumX tokens (Terracotta #C4644A accent,
 * warm charcoal #1F1F1F ink, Warm Ivory #FAF7F2, Spectral + Inter — see
 * design/brand/lumiumx.tokens.json). A product's Design Spec may override any
 * leaf via `resolveMarketingTheme`.
 *
 * Sizes are px on a 2000×2000 canvas (Etsy listing square).
 */

export const DEFAULT_MARKETING_THEME = Object.freeze({
  name: "etsy-marketing-v1",

  canvas: { width: 2000, height: 2000, ratio: "1:1" },

  color: {
    ink: "#1F1F1F", // LumiumX Ink — warm charcoal, never #000
    subtleInk: "#3A3A3A", // LumiumX Secondary ink — supporting copy (>=7:1 on ivory)
    inverseInk: "#FFFFFF",
    paper: "#FAF7F2", // LumiumX Warm Ivory — the dominant surface
    paperAlt: "#F2ECE1", // a deeper ivory for one alternating panel
    card: "#FFFFFF", // LumiumX Paper White — one panel / the mockup surface
    accent: "#C4644A", // LumiumX Terracotta — Finance/Planning family accent
    accentDark: "#9E4A34", // kicker / tracked labels
    accentSoft: "#F1E4DF", // one faint wash, used sparingly
    line: "#E6E1D9", // LumiumX Stone — every hairline
    ink10: "rgba(31,31,31,0.06)",
    positive: "#3B7A4B",
  },

  font: {
    display: "'Spectral', 'Iowan Old Style', Georgia, serif",
    sans: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
    size: {
      kicker: 26,
      hero: 112,
      h1: 78,
      h2: 56,
      h3: 38,
      lead: 38,
      body: 33,
      small: 27,
      tiny: 23,
      numeral: 128, // big editorial numerals (index, steps)
    },
    weight: { regular: 400, medium: 500, semibold: 600 },
    lineHeight: { tight: 1.06, snug: 1.2, normal: 1.5 },
  },

  space: { xs: 16, sm: 26, md: 44, lg: 72, xl: 112, xxl: 150 },
  radius: { sm: 12, md: 18, lg: 28, pill: 999 },

  border: { hairline: "1px solid #E6E1D9" },

  shadow: {
    // one soft directional shadow, warm, consistent across every asset ("same studio")
    mock: "0 60px 120px -50px rgba(31,31,31,0.30), 0 20px 40px -30px rgba(31,31,31,0.14)",
    card: "0 30px 70px -40px rgba(31,31,31,0.18)",
  },

  mockup: {
    frameColor: "#FFFFFF",
    frameBorder: "1px solid #E6E1D9",
    radius: 14,
    tiltDeg: -1.6, // a believable slight angle, not a flat pasted rectangle
  },

  // ---- deterministic lifestyle scene (ADR-013) --------------------------
  // A warm desk photographed in soft top-left daylight, built entirely from
  // layered CSS gradients + inline SVG grain. No AI imagery, no photos.
  scene: {
    // the desk surface — warm oak / linen, LumiumX-warm not orange
    deskTop: "#E7DAC6",
    deskMid: "#D8C6AC",
    deskLow: "#C4AC8B",
    deskShade: "#A98C64",
    // key light comes from ~305° (top-left); this is its warm bloom colour
    lightWarm: "rgba(255,247,232,0.85)",
    vignette: "rgba(58,42,26,0.30)",
    grainOpacity: 0.05,
    // a physical printed sheet on the desk
    sheetFace: "#FFFFFF",
    sheetEdge: "#EDE7DC",
    sheetRadius: 6,
    // the three-part shadow every sheet / prop casts under the key light
    contact: "0 2px 6px rgba(40,28,16,0.28)",
    cast: "38px 54px 70px -30px rgba(40,28,16,0.34)",
    ambient: "0 120px 160px -90px rgba(40,28,16,0.22)",
    sheen: "linear-gradient(115deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%)",
    // props
    brass: "#B08543",
    brassLight: "#D9B877",
    graphite: "#4B4B4B",
    pencilBody: "#D9A441",
    pencilBodyDark: "#B9862B",
    ceramic: "#F3ECE1",
    ceramicShade: "#E2D6C3",
    coffee: "#5A3B29",
    leaf: "#7E8A6B",
    leafDark: "#5F6B4E",
    // a barely-there warm scrim behind copy that sits over the desk
    copyScrim: "linear-gradient(180deg, rgba(250,247,242,0) 0%, rgba(250,247,242,0.86) 46%, rgba(250,247,242,0.96) 100%)",
  },

  // aspect ratios a caller may request from render()
  imageRatio: {
    square: [2000, 2000],
    landscape: [2000, 1600], // Etsy 5:4
    story: [1080, 1920],
  },
});

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * DEFAULT_MARKETING_THEME with a product Design Spec's `marketingTheme` (or
 * `theme`) overrides deep-merged over it.
 */
export function resolveMarketingTheme(overrides = {}) {
  return Object.freeze(deepMerge(DEFAULT_MARKETING_THEME, overrides ?? {}));
}
