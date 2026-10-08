/**
 * Environment-variable loading and validation.
 *
 * This module is the ONLY place service code reads `process.env` for
 * credentials. It never contains a default, fallback, or example value for a
 * secret — per SECURITY.md / ADR-006, real values live only in the repo-root
 * `.env` (git-ignored). Callers pass the loaded config object down explicitly;
 * nothing deeper in the stack touches `process.env`.
 *
 * `.env` is not auto-loaded here. Either the process already has the variables
 * in its environment (Docker Compose injects them for container processes), or
 * a developer runs a script with them exported. The repo-root scripts that use
 * these services source `.env` the same way the existing bash scripts do.
 */

export class MissingConfigError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `See services/README.md "Environment variables" and the repo-root .env.example.`,
    );
    this.name = "MissingConfigError";
    this.missing = missing;
  }
}

function read(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Credentials/config for the Etsy integration layer.
 *
 * - `apiKey` (keystring) is required for every call — it is the `x-api-key`
 *   header value and the OAuth `client_id`.
 * - `oauthRedirectUri` is only needed to run the authorization-code flow.
 * - There are intentionally NO fields here for an access or refresh token:
 *   those are runtime state, held by a `TokenStore`, not static config.
 */
export interface EtsyConfig {
  readonly apiKey: string;
  readonly sharedSecret: string | undefined;
  readonly oauthRedirectUri: string | undefined;
  /** Space-delimited OAuth scopes requested during authorization. */
  readonly oauthScopes: readonly string[];
  readonly apiBaseUrl: string;
  /**
   * Server-side publish gate (Stage 4, ADR-026). `EtsyService.activateListing`
   * refuses unless this is true. Only the exact string "true" enables it;
   * default false. Independent of any owner confirmation in the bot.
   */
  readonly publishEnabled: boolean;
}

const DEFAULT_API_BASE_URL = "https://api.etsy.com/v3";

/**
 * Scopes the publishing pipeline will eventually need. Kept minimal and
 * documented rather than requesting everything. `shops_r` is enough to prove
 * connectivity; the write scopes are listed so the consent screen a developer
 * approves during setup already covers the planned endpoints.
 */
export const DEFAULT_ETSY_OAUTH_SCOPES: readonly string[] = [
  "listings_r",
  "listings_w",
];

export interface LoadEtsyConfigOptions {
  /** Defaults to `process.env`. Injectable for tests. */
  readonly env?: NodeJS.ProcessEnv;
  /** If false (default), a missing `ETSY_API_KEYSTRING` throws. */
  readonly allowMissing?: boolean;
}

/**
 * Build an {@link EtsyConfig} from the environment.
 *
 * @throws {MissingConfigError} when `allowMissing` is not set and the
 *   required `ETSY_API_KEYSTRING` is absent.
 */
export function loadEtsyConfig(options: LoadEtsyConfigOptions = {}): EtsyConfig {
  const env = options.env ?? process.env;

  const apiKey = read(env, "ETSY_API_KEYSTRING");
  if (apiKey === undefined && options.allowMissing !== true) {
    throw new MissingConfigError(["ETSY_API_KEYSTRING"]);
  }

  const scopesRaw = read(env, "ETSY_OAUTH_SCOPES");
  const oauthScopes =
    scopesRaw !== undefined
      ? scopesRaw.split(/[\s,]+/).filter((s) => s.length > 0)
      : DEFAULT_ETSY_OAUTH_SCOPES;

  return {
    apiKey: apiKey ?? "",
    sharedSecret: read(env, "ETSY_SHARED_SECRET"),
    oauthRedirectUri: read(env, "ETSY_OAUTH_REDIRECT_URI"),
    oauthScopes,
    apiBaseUrl: read(env, "ETSY_API_BASE_URL") ?? DEFAULT_API_BASE_URL,
    publishEnabled: read(env, "ETSY_PUBLISH_ENABLED") === "true",
  };
}

/** True when there is enough config to make authenticated (OAuth) calls run. */
export function canRunOAuthFlow(config: EtsyConfig): boolean {
  return config.apiKey.length > 0 && config.oauthRedirectUri !== undefined;
}

// --- Telegram: product review / approval workflow -------------------------
//
// The Telegram bot is a notification + human-approval surface for generated
// products (see docs/archive/TELEGRAM_REVIEW.md). It is deliberately optional: with
// notifications disabled or the bot token / chat id absent, the review
// service degrades to a no-op notifier and nothing in the pipeline fails.
//
// Naming follows the Faceless YouTube project's existing convention
// (TELEGRAM_NOTIFICATIONS_ENABLED / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID);
// TELEGRAM_ALLOWED_USER_IDS is new and scopes who may press APPROVE / REJECT.
//
// The bot token is a secret and lives ONLY in the repo-root `.env`
// (git-ignored). It is never written to a tracked file, a log line, or a
// Telegram message.

export interface TelegramConfig {
  /** Master switch. False → the review service uses a no-op notifier. */
  readonly enabled: boolean;
  readonly botToken: string | undefined;
  /** The one chat the bot posts to and accepts callbacks from. */
  readonly chatId: string | undefined;
  /**
   * Optional allow-list of Telegram user ids permitted to APPROVE / REJECT.
   * Empty → any user in {@link chatId} may act (fine for a private 1:1 chat).
   */
  readonly allowedUserIds: readonly string[];
}

export interface LoadTelegramConfigOptions {
  readonly env?: NodeJS.ProcessEnv;
}

function readBool(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
): boolean {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

/**
 * Build a {@link TelegramConfig} from the environment. Never throws — a
 * half-configured Telegram setup disables the feature rather than breaking
 * product generation. Use {@link canSendTelegram} to check usability.
 */
export function loadTelegramConfig(
  options: LoadTelegramConfigOptions = {},
): TelegramConfig {
  const env = options.env ?? process.env;
  const idsRaw = read(env, "TELEGRAM_ALLOWED_USER_IDS");
  return {
    enabled: readBool(env, "TELEGRAM_NOTIFICATIONS_ENABLED", true),
    botToken: read(env, "TELEGRAM_BOT_TOKEN"),
    chatId: read(env, "TELEGRAM_CHAT_ID"),
    allowedUserIds:
      idsRaw !== undefined
        ? idsRaw.split(/[\s,]+/).filter((s) => s.length > 0)
        : [],
  };
}

/** True when the bot can actually send: enabled + token + chat id all present. */
export function canSendTelegram(config: TelegramConfig): boolean {
  return (
    config.enabled &&
    config.botToken !== undefined &&
    config.chatId !== undefined
  );
}

/**
 * Whether a Telegram callback (button press) is allowed to act. The chat must
 * match the configured chat, and — when an allow-list is set — the acting user
 * must be on it. Callback payloads are otherwise untrusted.
 */
export function isTelegramActorAuthorized(
  config: TelegramConfig,
  actor: { readonly chatId: string | number; readonly userId: string | number },
): boolean {
  if (config.chatId === undefined) return false;
  if (String(actor.chatId) !== config.chatId) return false;
  if (config.allowedUserIds.length === 0) return true;
  return config.allowedUserIds.includes(String(actor.userId));
}

// No AI/LLM configuration lives here. The LumiumX design + marketing
// pipeline is fully deterministic (ADR-013) — no OpenAI/Anthropic keys, no
// model selection, no runtime API calls. Only the Etsy and Telegram
// integrations above read the environment.
