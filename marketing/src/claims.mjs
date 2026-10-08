/**
 * Marketing-Claim QC.
 *
 * Every factual span in a composed asset is stamped `data-claim="kind:key"`
 * (+ `data-claim-value`) by the components. This module checks each stamped
 * claim from the rendered DOM against the VERIFIED `marketingData.claimIndex`.
 * An unrecognised claim key, or a value that does not match, fails QC.
 *
 * Non-stamped text (benefit / tone copy) is not checked — components only ever
 * receive it as explicit data, never invent it.
 */

import { norm } from "./product-metadata.mjs";

/**
 * @param {{claim:string,value:string,text:string}[]} claimTokens  from renderAssets()
 * @param {object} marketingData  from deriveMarketingData()
 * @returns {{pass:boolean, total:number, verified:number, failures:{claim:string,text:string,reason:string}[]}}
 */
export function verifyClaims(claimTokens, marketingData) {
  const index = marketingData.claimIndex ?? {};
  const failures = [];
  let verified = 0;

  for (const tok of claimTokens) {
    const key = tok.claim;
    const allowed = index[key];
    if (!allowed) {
      failures.push({ claim: key, text: tok.text, reason: "unrecognised claim key (not in verified metadata)" });
      continue;
    }
    const v = norm(tok.value);
    const txt = norm(tok.text);
    const digits = (s) => (String(s).match(/\d+/g) || []).join(",");
    const allowedDigits = allowed.map(digits).filter(Boolean);
    const tokDigits = digits(tok.value) || digits(tok.text);

    const ok =
      allowed.some((a) => {
        const na = norm(a);
        return na === v || na === txt || txt.includes(na) || v.includes(na) || na.includes(v);
      }) ||
      // numeric claims: the number in the token must match a number the
      // verified metadata permits (not merely equal its own text).
      (tokDigits.length > 0 && allowedDigits.includes(tokDigits));

    if (ok) verified++;
    else
      failures.push({
        claim: key,
        text: tok.text,
        reason: `value "${tok.value}" / text "${tok.text}" not in verified set [${allowed.join(" | ")}]`,
      });
  }

  return { pass: failures.length === 0, total: claimTokens.length, verified, failures };
}

/** Human-readable list of what the metadata permits — for the QC report. */
export function expectedClaims(marketingData) {
  return Object.entries(marketingData.claimIndex ?? {}).map(([k, v]) => ({ claim: k, allowed: v }));
}
