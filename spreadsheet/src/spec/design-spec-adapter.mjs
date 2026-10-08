/**
 * DESIGN_SPEC.json  ->  @dpf/spreadsheet theme override (Prompt 3, ADR-012 §5).
 *
 * The LumiumX Creative Director's DESIGN_SPEC.json is the authoritative source
 * of the brand TOKENS (palette, borders, semantic colours). This adapter
 * translates the relevant leaves into the shape `resolveTheme()` already
 * accepts, so a product's `xlsx-design-spec.json` no longer has to restate the
 * palette — it carries STRUCTURE (`.sheets`) only.
 *
 *   DESIGN_SPEC.json
 *        │  designSpecToSpreadsheetTheme()
 *        ▼
 *   { color, font, numberFormat }  ── merged UNDER xlsx-design-spec.json's own
 *        ▼                            `theme` (a product may still override a
 *   WorkbookBuilder({ theme })       single leaf for a sheet-specific need)
 *
 * Typography: .xlsx cannot embed Spectral/Inter, so the workbook keeps its
 * Georgia/Calibri faces; the intended display/body families are recorded on
 * `_designSpecFamilies` for provenance, not applied.
 *
 * No `#` prefix in spreadsheet theme hexes — this strips it.
 */

const stripHash = (v) => (typeof v === "string" ? v.replace(/^#/, "") : undefined);

function assignDefined(target, key, value) {
  if (value !== undefined) target[key] = value;
}

/**
 * @param {unknown} designSpec  a parsed DESIGN_SPEC.json (or any object with a
 *   `colour` / `typography` block). Anything unrecognised yields `{}`.
 * @returns {{ color?: object, font?: object }} a `resolveTheme` override object.
 */
export function designSpecToSpreadsheetTheme(designSpec) {
  if (!designSpec || typeof designSpec !== "object") return {};
  const c = designSpec.colour ?? {};
  const t = designSpec.typography ?? {};

  const color = {};
  assignDefined(color, "ink", stripHash(c.primary_ink));
  assignDefined(color, "subtleInk", stripHash(c.secondary_ink));
  assignDefined(color, "accent", stripHash(c.accent?.hex));
  assignDefined(color, "rule", stripHash(c.borders));
  assignDefined(color, "band", stripHash(c.background_alt));
  // semantic colours (workbook conditional formatting) — DESIGN_SPEC.colour.semantic
  const sem = c.semantic ?? {};
  assignDefined(color, "positive", stripHash(sem.positive));
  assignDefined(color, "negative", stripHash(sem.warning ?? sem.negative));

  const out = {};
  if (Object.keys(color).length) out.color = color;

  // provenance only — not applied (see header)
  const display = t.display?.family;
  const body = t.body?.family;
  if (display || body) {
    out._designSpecFamilies = {};
    assignDefined(out._designSpecFamilies, "display", display);
    assignDefined(out._designSpecFamilies, "body", body);
  }
  return out;
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Deep-merge `over` onto `base` (objects merge, arrays/scalars replace). */
export function mergeThemeOverrides(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeThemeOverrides(out[k], v) : v;
  }
  return out;
}
