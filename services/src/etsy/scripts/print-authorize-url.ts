/**
 * Step 1 of connecting a shop: print the Etsy authorization URL and the PKCE
 * verifier + state to use when exchanging the returned code.
 *
 * Usage (from services/):
 *   node --env-file-if-exists=../.env --experimental-strip-types \
 *     src/etsy/scripts/print-authorize-url.ts
 *
 * Requires in the environment (repo-root .env):
 *   ETSY_API_KEYSTRING       (the app keystring == OAuth client_id)
 *   ETSY_OAUTH_REDIRECT_URI  (must exactly match a redirect URI registered
 *                             on the app in Etsy's developer portal)
 * Optional:
 *   ETSY_OAUTH_SCOPES        (space/comma separated; default: shops_r listings_r listings_w)
 *
 * Nothing is written to disk. Copy the printed verifier + state into the
 * exchange-code step.
 */

import { loadEtsyConfig } from "../../config/env.ts";
import { buildAuthorizationUrl, createPkcePair, generateState } from "../oauth.ts";

const config = loadEtsyConfig();
if (config.oauthRedirectUri === undefined) {
  console.error(
    "ETSY_OAUTH_REDIRECT_URI is not set. Add it to the repo-root .env " +
      "(name only in .env.example) and register the same value on the Etsy app.",
  );
  process.exit(1);
}

const pkce = createPkcePair();
const state = generateState();

const url = buildAuthorizationUrl({
  clientId: config.apiKey,
  redirectUri: config.oauthRedirectUri,
  scopes: config.oauthScopes,
  state,
  codeChallenge: pkce.codeChallenge,
});

console.log("\n1. Open this URL in a browser signed in to the Etsy shop account:\n");
console.log(url);
console.log("\n2. After approving, Etsy redirects to your redirect URI with");
console.log("   ?code=...&state=... . Check the returned state matches:\n");
console.log(`   expected state:  ${state}`);
console.log("\n3. Run the exchange step with the code and this verifier:\n");
console.log(`   ETSY_OAUTH_CODE=<code from redirect> \\`);
console.log(`   ETSY_OAUTH_CODE_VERIFIER=${pkce.codeVerifier} \\`);
console.log(`   npm run etsy:exchange-code\n`);
