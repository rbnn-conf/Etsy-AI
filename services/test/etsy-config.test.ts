import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canRunOAuthFlow,
  DEFAULT_ETSY_OAUTH_SCOPES,
  loadEtsyConfig,
  MissingConfigError,
} from "../src/config/env.ts";

test("loadEtsyConfig throws MissingConfigError when the keystring is absent", () => {
  assert.throws(
    () => loadEtsyConfig({ env: {} }),
    (err: unknown) => {
      assert.ok(err instanceof MissingConfigError);
      assert.deepEqual(err.missing, ["ETSY_API_KEYSTRING"]);
      return true;
    },
  );
});

test("loadEtsyConfig treats a blank keystring as missing", () => {
  assert.throws(
    () => loadEtsyConfig({ env: { ETSY_API_KEYSTRING: "   " } }),
    MissingConfigError,
  );
});

test("loadEtsyConfig({ allowMissing }) returns a usable-shaped config", () => {
  const config = loadEtsyConfig({ env: {}, allowMissing: true });
  assert.equal(config.apiKey, "");
  assert.equal(config.apiBaseUrl, "https://api.etsy.com/v3");
  assert.deepEqual(config.oauthScopes, DEFAULT_ETSY_OAUTH_SCOPES);
  assert.equal(canRunOAuthFlow(config), false);
});

test("loadEtsyConfig reads optional values and parses scopes", () => {
  const config = loadEtsyConfig({
    env: {
      ETSY_API_KEYSTRING: "key123",
      ETSY_SHARED_SECRET: "secret123",
      ETSY_OAUTH_REDIRECT_URI: "https://example.test/cb",
      ETSY_OAUTH_SCOPES: "shops_r, listings_r listings_w",
      ETSY_API_BASE_URL: "https://api.example.test/v3",
    },
  });
  assert.equal(config.apiKey, "key123");
  assert.equal(config.sharedSecret, "secret123");
  assert.equal(config.apiBaseUrl, "https://api.example.test/v3");
  assert.deepEqual(config.oauthScopes, ["shops_r", "listings_r", "listings_w"]);
  assert.equal(canRunOAuthFlow(config), true);
});

test("config never carries an access or refresh token field", () => {
  const config = loadEtsyConfig({
    env: {
      ETSY_API_KEYSTRING: "key123",
      // deliberately set token-shaped vars — they must be ignored
      ETSY_ACCESS_TOKEN: "should-be-ignored",
      ETSY_REFRESH_TOKEN: "should-be-ignored",
    } as NodeJS.ProcessEnv,
  });
  assert.equal("accessToken" in config, false);
  assert.equal("refreshToken" in config, false);
  assert.equal(Object.values(config).includes("should-be-ignored"), false);
});
