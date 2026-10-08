/**
 * Etsy Open API v3 OAuth 2.0 — authorization-code flow with PKCE.
 *
 * Verified against Etsy's current docs (developers.etsy.com, "Authentication
 * Essentials", 2026-08):
 *   - Authorization endpoint: https://www.etsy.com/oauth/connect
 *   - Token endpoint:         https://api.etsy.com/v3/public/oauth/token
 *   - PKCE is MANDATORY on every authorization request (method S256).
 *   - `client_id` is the app keystring.
 *   - Access token TTL 3600s; refresh token TTL 90 days; refresh returns a
 *     new refresh token each time (rotate on use).
 *   - Access token string is of the form `<user_id>.<random>`.
 *
 * This module does the flow and nothing else. It does not persist tokens
 * (that is `TokenStore`) and does not call business endpoints (that is
 * `EtsyService`).
 */

import { createHash, randomBytes } from "node:crypto";
import { EtsyApiError, EtsyNetworkError } from "./errors.ts";

export const ETSY_AUTHORIZATION_ENDPOINT = "https://www.etsy.com/oauth/connect";
export const ETSY_TOKEN_ENDPOINT =
  "https://api.etsy.com/v3/public/oauth/token";

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 7636 code verifier: 43–128 chars from the unreserved set. */
export function generateCodeVerifier(): string {
  // 32 random bytes -> 43 base64url chars.
  return base64Url(randomBytes(32));
}

export function deriveCodeChallenge(codeVerifier: string): string {
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

export function createPkcePair(): PkcePair {
  const codeVerifier = generateCodeVerifier();
  return { codeVerifier, codeChallenge: deriveCodeChallenge(codeVerifier) };
}

/** Opaque anti-CSRF value for the `state` parameter. */
export function generateState(): string {
  return base64Url(randomBytes(16));
}

export interface BuildAuthorizationUrlParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly codeChallenge: string;
}

export function buildAuthorizationUrl(
  params: BuildAuthorizationUrlParams,
): string {
  const url = new URL(ETSY_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Normalised token response. `obtainedAt` lets callers compute expiry. */
export interface EtsyTokenSet {
  readonly scopes?: readonly string[];
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  /** Seconds from `obtainedAt` until the access token expires. */
  readonly expiresIn: number;
  /** Epoch milliseconds when this token set was received. */
  readonly obtainedAt: number;
}

interface RawTokenResponse {
  scope?: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface OAuthClientOptions {
  readonly clientId: string;
  readonly sharedSecret?: string;
  readonly tokenEndpoint?: string;
  readonly fetchImpl?: typeof fetch;
}

export class EtsyOAuthClient {
  readonly #clientId: string;
  readonly #tokenEndpoint: string;
  readonly #fetch: typeof fetch;
  readonly #sharedSecret: string | undefined;

  constructor(options: OAuthClientOptions) {
    this.#clientId = options.clientId;
    this.#sharedSecret = options.sharedSecret;
    this.#tokenEndpoint = options.tokenEndpoint ?? ETSY_TOKEN_ENDPOINT;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async exchangeAuthorizationCode(args: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<EtsyTokenSet> {
    return this.#postToken({
      grant_type: "authorization_code",
      client_id: this.#clientId,
      redirect_uri: args.redirectUri,
      code: args.code,
      code_verifier: args.codeVerifier,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<EtsyTokenSet> {
    return this.#postToken({
      grant_type: "refresh_token",
      client_id: this.#clientId,
      refresh_token: refreshToken,
    });
  }

  async #postToken(form: Record<string, string>): Promise<EtsyTokenSet> {
    let response: Response;
    try {
      response = await this.#fetch(this.#tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", ...(this.#sharedSecret ? {'x-api-key':`${this.#clientId}:${this.#sharedSecret}`} : {}) },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        body: new URLSearchParams(form).toString(),
      });
    } catch (cause) {
      throw new EtsyNetworkError("Network failure calling Etsy token endpoint", cause);
    }

    const text = await response.text();
    const parsed: unknown = text.length > 0 ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new EtsyApiError(
        "POST",
        "/v3/public/oauth/token",
        response.status,
        parsed,
        `Etsy token request failed (${form["grant_type"]}) -> HTTP ${response.status}`,
      );
    }

    const raw = parsed as RawTokenResponse;
    if(typeof raw.access_token!=="string" || !raw.access_token || typeof raw.refresh_token!=="string" || !raw.refresh_token || raw.token_type?.toLowerCase()!=="bearer" || !Number.isFinite(raw.expires_in) || raw.expires_in<=0)throw new Error("Invalid Etsy token response");
    return {
      ...(raw.scope ? {scopes:raw.scope.split(/\s+/)} : {}),
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type,
      expiresIn: raw.expires_in,
      obtainedAt: Date.now(),
    };
  }
}

/** True when the access token is expired or within `skewSeconds` of expiry. */
export function isAccessTokenExpired(
  token: EtsyTokenSet,
  skewSeconds = 60,
): boolean {
  const expiresAt = token.obtainedAt + (token.expiresIn - skewSeconds) * 1000;
  return Date.now() >= expiresAt;
}
