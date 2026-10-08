/**
 * Manual Etsy connectivity smoke test. Makes real calls. NOT run by the
 * automated test suite.
 *
 * Usage (from services/):
 *   node --env-file-if-exists=../.env --experimental-strip-types \
 *     src/etsy/scripts/smoke-connectivity.ts
 *
 * What it checks, in order, stopping at the first hard failure:
 *   1. ETSY_API_KEYSTRING present                      (config)
 *   2. GET /application/openapi-ping                    (API key is live)
 *   3. GET /application/users/me                        (OAuth token works)
 *   4. resolve + GET /application/shops/{shop_id}       (shop identity)
 *
 * Steps 3-4 are skipped with a notice if no token has been stored yet
 * (run the authorize-url + exchange-code scripts first).
 */

import {
  type EtsyConfig,
  loadEtsyConfig,
  MissingConfigError,
} from "../../config/env.ts";
import { EtsyService } from "../etsy-service.ts";
import { EtsyAuthError } from "../errors.ts";
import { FileTokenStore } from "../token-store.ts";

function ok(msg: string): void {
  console.log(`  ok   ${msg}`);
}
function fail(msg: string): void {
  console.log(`  FAIL ${msg}`);
}

let config: EtsyConfig;
try {
  config = loadEtsyConfig();
} catch (err) {
  if (err instanceof MissingConfigError) {
    fail(err.message);
    process.exit(1);
  }
  throw err;
}
ok(`config loaded (api base ${config.apiBaseUrl})`);

const tokenStore = new FileTokenStore();
const service = new EtsyService({ config, tokenStore });

// 2. API-key liveness
try {
  const ping = await service.ping();
  ok(`openapi-ping -> application_id ${ping.applicationId ?? "(none)"}`);
} catch (err) {
  fail(`openapi-ping failed: ${(err as Error).message}`);
  console.log(
    "\nIf this is HTTP 403, the Etsy app key is still pending approval.\n",
  );
  process.exit(1);
}

// 3-4. OAuth-scoped checks
const haveToken = (await tokenStore.load()) !== undefined;
if (!haveToken) {
  console.log(
    "\n  skip OAuth checks — no token stored. Run:\n" +
      "       npm run etsy:authorize-url\n" +
      "       ... approve in browser ...\n" +
      "       ETSY_OAUTH_CODE=... ETSY_OAUTH_CODE_VERIFIER=... npm run etsy:exchange-code\n",
  );
} else try {
  const me = await service.getAuthenticatedUser();
  ok(`users/me -> user_id ${me.userId}`);
  const shop = await service.getMyShop();
  ok(`shop -> "${shop.shopName}" (id ${shop.shopId}, ${shop.currencyCode})`);
  console.log("\nAll connectivity checks passed.\n");
} catch (err) {
  if (err instanceof EtsyAuthError) {
    fail(`OAuth check failed (HTTP ${err.status}): ${err.message}`);
    console.log("Token may be expired/revoked or missing a scope. Re-run the exchange step.\n");
    process.exit(1);
  }
  fail(`OAuth check failed: ${(err as Error).message}`);
  process.exit(1);
}
