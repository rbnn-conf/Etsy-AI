/**
 * Public entry point for the Etsy integration layer.
 *
 * The product pipeline imports from here only. It should never need
 * `http-client.ts` or construct requests itself.
 */

export { EtsyService, type EtsyServiceOptions } from "./etsy-service.ts";
export type { IEtsyService } from "./etsy-service.interface.ts";
export {
  loadEtsyConfig,
  canRunOAuthFlow,
  MissingConfigError,
  DEFAULT_ETSY_OAUTH_SCOPES,
  type EtsyConfig,
} from "../config/env.ts";
export {
  EtsyError,
  EtsyApiError,
  EtsyAuthError,
  EtsyRateLimitError,
  EtsyNetworkError,
  EtsyNotImplementedError,
  EtsyPublishBlockedError,
} from "./errors.ts";
export {
  EtsyOAuthClient,
  buildAuthorizationUrl,
  createPkcePair,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
  isAccessTokenExpired,
  ETSY_AUTHORIZATION_ENDPOINT,
  ETSY_TOKEN_ENDPOINT,
  type EtsyTokenSet,
  type PkcePair,
} from "./oauth.ts";
export {
  type TokenStore,
  InMemoryTokenStore,
  FileTokenStore,
} from "./token-store.ts";
export type * from "./types.ts";
