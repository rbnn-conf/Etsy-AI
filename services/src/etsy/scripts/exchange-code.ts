/**
 * Step 2 of connecting a shop: exchange the authorization code for a token set
 * and persist it via FileTokenStore (git-ignored).
 *
 * Usage (from services/):
 *   ETSY_OAUTH_CODE=<code> ETSY_OAUTH_CODE_VERIFIER=<verifier from step 1> \
 *   node --env-file-if-exists=../.env --experimental-strip-types \
 *     src/etsy/scripts/exchange-code.ts
 *
 * Requires: ETSY_API_KEYSTRING, ETSY_OAUTH_REDIRECT_URI, ETSY_OAUTH_CODE,
 *           ETSY_OAUTH_CODE_VERIFIER.
 * Optional: ETSY_TOKEN_FILE (defaults to services/.secrets/etsy-token.json).
 */

import { loadEtsyConfig } from "../../config/env.ts";
import { EtsyOAuthClient } from "../oauth.ts";
import { FileTokenStore } from "../token-store.ts";

const config = loadEtsyConfig();
const code = process.env["ETSY_OAUTH_CODE"]?.trim();
const codeVerifier = process.env["ETSY_OAUTH_CODE_VERIFIER"]?.trim();

if (config.oauthRedirectUri === undefined || !code || !codeVerifier) {
  console.error(
    "Missing one of ETSY_OAUTH_REDIRECT_URI, ETSY_OAUTH_CODE, ETSY_OAUTH_CODE_VERIFIER.",
  );
  process.exit(1);
}

const oauth = new EtsyOAuthClient({ clientId: config.apiKey });
const store = new FileTokenStore();

const token = await oauth.exchangeAuthorizationCode({
  code,
  redirectUri: config.oauthRedirectUri,
  codeVerifier,
});
await store.save(token);

console.log(`Token set saved to ${store.path}`);
console.log(
  `access token expires in ${token.expiresIn}s; refresh token valid ~90 days.`,
);
console.log("You can now run:  npm run etsy:smoke");
