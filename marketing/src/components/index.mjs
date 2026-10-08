/**
 * Low-level text helpers shared by the primitives and the compositions.
 *
 * FACTUAL text is wrapped by `claim(key, value, text)` which stamps
 * `data-claim="<key>"` so Marketing-Claim QC can verify it against the verified
 * product metadata. Tone / benefit copy is never stamped and never invented —
 * compositions only render data they are handed.
 */

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stamp a factual span for claim verification. */
export function claim(key, value, text) {
  return `<span data-claim="${esc(key)}" data-claim-value="${esc(value)}">${esc(text ?? value)}</span>`;
}

/** Escaped text, or a claim span when the item carries a claim key. */
export function factual(item, fallbackText) {
  const text = fallbackText ?? item.label ?? item.text ?? "";
  return item.claimKey ? claim(item.claimKey, item.claimValue ?? text, text) : esc(text);
}

/**
 * `LX —` monogram + product line, bottom-left of every asset. Carries the
 * `data-brand` marker Visual QC checks for on every composition.
 */
export function brandingFooter(t, brand) {
  if (!brand) return "";
  return `<div class="brandfoot" data-brand><span class="mark">LX</span><span class="sep"></span><span>${esc(
    brand.tagline ?? brand.name ?? "",
  )}</span></div>`;
}
