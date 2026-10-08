import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildAuthorizationUrl,
  createPkcePair,
  deriveCodeChallenge,
  ETSY_AUTHORIZATION_ENDPOINT,
  ETSY_TOKEN_ENDPOINT,
  EtsyOAuthClient,
  generateCodeVerifier,
  isAccessTokenExpired,
} from "../src/etsy/oauth.ts";
import { makeFakeFetch } from "./helpers/fake-fetch.ts";

test("code verifier is 43-128 chars from the unreserved set", () => {
  for (let i = 0; i < 20; i += 1) {
    const v = generateCodeVerifier();
    assert.ok(v.length >= 43 && v.length <= 128, `length ${v.length}`);
    assert.match(v, /^[A-Za-z0-9._~-]+$/);
  }
});

test("code challenge is the base64url SHA-256 of the verifier (S256)", () => {
  const verifier = generateCodeVerifier();
  const expected = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  assert.equal(deriveCodeChallenge(verifier), expected);
});

test("buildAuthorizationUrl produces a spec-correct PKCE request", () => {
  const { codeChallenge } = createPkcePair();
  const url = new URL(
    buildAuthorizationUrl({
      clientId: "keystring123",
      redirectUri: "https://example.test/cb",
      scopes: ["shops_r", "listings_w"],
      state: "xyz",
      codeChallenge,
    }),
  );
  assert.equal(
    `${url.protocol}//${url.host}${url.pathname}`,
    ETSY_AUTHORIZATION_ENDPOINT,
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "keystring123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/cb");
  assert.equal(url.searchParams.get("scope"), "shops_r listings_w");
  assert.equal(url.searchParams.get("state"), "xyz");
  assert.equal(url.searchParams.get("code_challenge"), codeChallenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("exchangeAuthorizationCode posts form-encoded params to the token endpoint", async () => {
  const fake = makeFakeFetch([
    {
      body: {
        access_token: "1.access",
        refresh_token: "1.refresh",
        token_type: "Bearer",
        expires_in: 3600,
      },
    },
  ]);
  const client = new EtsyOAuthClient({
    clientId: "keystring123",
    sharedSecret: "shared456",
    fetchImpl: fake.fn,
  });

  const before = Date.now();
  const token = await client.exchangeAuthorizationCode({
    code: "the-code",
    redirectUri: "https://example.test/cb",
    codeVerifier: "the-verifier",
  });

  assert.equal(fake.calls[0]!.url, ETSY_TOKEN_ENDPOINT);
  assert.equal(
    fake.calls[0]!.headers["content-type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(fake.calls[0]!.headers["x-api-key"],"keystring123:shared456");
  const sent = new URLSearchParams(fake.calls[0]!.body ?? "");
  assert.equal(sent.get("grant_type"), "authorization_code");
  assert.equal(sent.get("client_id"), "keystring123");
  assert.equal(sent.get("code"), "the-code");
  assert.equal(sent.get("code_verifier"), "the-verifier");

  assert.equal(token.accessToken, "1.access");
  assert.equal(token.refreshToken, "1.refresh");
  assert.equal(token.expiresIn, 3600);
  assert.ok(token.obtainedAt >= before);
});

test("refreshAccessToken uses the refresh_token grant", async () => {
  const fake = makeFakeFetch([
    {
      body: {
        access_token: "2.access",
        refresh_token: "2.refresh",
        token_type: "Bearer",
        expires_in: 3600,
      },
    },
  ]);
  const client = new EtsyOAuthClient({
    clientId: "keystring123",
    fetchImpl: fake.fn,
  });
  await client.refreshAccessToken("old.refresh");
  const sent = new URLSearchParams(fake.calls[0]!.body ?? "");
  assert.equal(sent.get("grant_type"), "refresh_token");
  assert.equal(sent.get("refresh_token"), "old.refresh");
});

test("isAccessTokenExpired accounts for clock skew", () => {
  const now = Date.now();
  assert.equal(
    isAccessTokenExpired({
      accessToken: "a",
      refreshToken: "r",
      tokenType: "Bearer",
      expiresIn: 3600,
      obtainedAt: now,
    }),
    false,
  );
  assert.equal(
    isAccessTokenExpired({
      accessToken: "a",
      refreshToken: "r",
      tokenType: "Bearer",
      expiresIn: 30, // within the default 60s skew
      obtainedAt: now,
    }),
    true,
  );
});
