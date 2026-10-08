/**
 * Low-level HTTP transport for the Etsy Open API v3.
 *
 * Responsibilities that belong here and NOWHERE else in the codebase:
 *   - attaching the `x-api-key` header (and `Authorization: Bearer` when a
 *     token getter is supplied)
 *   - JSON encode/decode
 *   - client-side rate limiting (minimum spacing between requests)
 *   - retry with exponential backoff + jitter on 429 and 5xx
 *   - honouring `Retry-After`
 *   - mapping every outcome onto the {@link EtsyError} taxonomy
 *
 * It knows nothing about shops, listings, or OAuth flows — those live in
 * `etsy-service.ts` and `oauth.ts` respectively.
 */

import {
  EtsyApiError,
  EtsyAuthError,
  EtsyNetworkError,
  EtsyRateLimitError,
} from "./errors.ts";

export interface RetryPolicy {
  /** Total attempts including the first. `1` disables retrying. */
  readonly maxAttempts: number;
  /** Base delay for exponential backoff, milliseconds. */
  readonly baseDelayMs: number;
  /** Upper bound on any single backoff wait, milliseconds. */
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export interface EtsyHttpClientOptions {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
  /**
   * Returns a valid bearer access token, refreshing if needed. Omit for
   * calls that only need the API key (public GET endpoints, `openapi-ping`).
   */
  readonly getAccessToken?: () => Promise<string>;
  readonly onUnauthorized?: () => Promise<void>;
  readonly retryPolicy?: RetryPolicy;
  /** Minimum milliseconds between the start of consecutive requests. */
  readonly minRequestIntervalMs?: number;
  /** Per-request timeout, milliseconds. */
  readonly timeoutMs?: number;
  /** Injectable for tests. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable for tests. Defaults to real `setTimeout`-based sleep. */
  readonly sleepImpl?: (ms: number) => Promise<void>;
}

export interface EtsyRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path relative to `apiBaseUrl`, e.g. `/application/shops/123`. */
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly body?: unknown;
  /**
   * A pre-built body (e.g. `FormData` for multipart uploads, or
   * `URLSearchParams`). When set, `body` is ignored and no `content-type`
   * is added — `fetch` sets it (with the multipart boundary) itself.
   */
  readonly rawBody?: RequestInit["body"];
  /** When true, attach the bearer token (requires `getAccessToken`). */
  readonly authenticated?: boolean;
  /** Extra headers, merged last. */
  readonly headers?: Record<string, string>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class EtsyHttpClient {
  readonly #onUnauthorized: (()=>Promise<void>) | undefined;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #getAccessToken: (() => Promise<string>) | undefined;
  readonly #retry: RetryPolicy;
  readonly #minIntervalMs: number;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;

  #lastRequestStart = 0;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: EtsyHttpClientOptions) {
    this.#onUnauthorized=options.onUnauthorized;
    this.#baseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.#apiKey = options.apiKey;
    this.#getAccessToken = options.getAccessToken;
    this.#retry = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.#minIntervalMs = options.minRequestIntervalMs ?? 250;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#sleep = options.sleepImpl ?? defaultSleep;
  }

  /** Perform a request, returning the parsed JSON body typed as `T`. */
  async request<T>(req: EtsyRequest): Promise<T> {
    // Serialize through a queue so the rate limiter spacing is respected even
    // under concurrent callers.
    const run = this.#queue.then(() => this.#executeWithRetry<T>(req));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #executeWithRetry<T>(req: EtsyRequest): Promise<T> {
    let attempt = 0;
    let refreshed=false;
    for (;;) {
      attempt += 1;
      await this.#respectRateLimit();
      try {
        return await this.#executeOnce<T>(req);
      } catch (err) {
        if(req.method==='GET' && !refreshed && err instanceof EtsyAuthError && err.status===401 && this.#onUnauthorized){
          refreshed=true;await this.#onUnauthorized();continue;
        }
        const retryable =
          err instanceof EtsyRateLimitError ||
          (err instanceof EtsyApiError && err.status >= 500) ||
          err instanceof EtsyNetworkError;
        // A lost POST response may have created a listing or uploaded a file.
        // Reconcile writes using a durable operation record, never blind retry.
        if (req.method !== "GET" || !retryable || attempt >= this.#retry.maxAttempts) throw err;

        const wait =
          err instanceof EtsyRateLimitError && err.retryAfterMs !== undefined
            ? err.retryAfterMs
            : this.#backoffDelay(attempt);
        await this.#sleep(wait);
      }
    }
  }

  #backoffDelay(attempt: number): number {
    const exp = this.#retry.baseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exp, this.#retry.maxDelayMs);
    // Full jitter: random point in [0, capped].
    return Math.round(Math.random() * capped);
  }

  async #respectRateLimit(): Promise<void> {
    const since = Date.now() - this.#lastRequestStart;
    if (since < this.#minIntervalMs) {
      await this.#sleep(this.#minIntervalMs - since);
    }
    this.#lastRequestStart = Date.now();
  }

  async #executeOnce<T>(req: EtsyRequest): Promise<T> {
    const url = this.#buildUrl(req.path, req.query);
    const headers: Record<string, string> = {
      "x-api-key": this.#apiKey,
      accept: "application/json",
      ...req.headers,
    };

    if (req.authenticated) {
      if (!this.#getAccessToken) {
        throw new EtsyAuthError(
          401,
          undefined,
          "Authenticated request attempted but no access-token provider is configured.",
        );
      }
      headers["authorization"] = `Bearer ${await this.#getAccessToken()}`;
    }

    const controller = new AbortController();
    const init: RequestInit = {
      method: req.method,
      headers,
      signal: controller.signal,
      redirect: "error",
    };
    if (req.rawBody !== undefined) {
      init.body = req.rawBody;
    } else if (req.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(req.body);
    }

    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (cause) {
      throw new EtsyNetworkError(
        `Network failure calling ${req.method} ${req.path}`,
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    return this.#handleResponse<T>(req, response);
  }

  async #handleResponse<T>(req: EtsyRequest, response: Response): Promise<T> {
    const text = await response.text();
    const parsed: unknown = text.length > 0 ? safeJsonParse(text) : undefined;

    if (response.ok) return parsed as T;

    if (response.status === 401 || response.status === 403) {
      throw new EtsyAuthError(response.status, parsed);
    }
    if (response.status === 429) {
      throw new EtsyRateLimitError(
        parseRetryAfter(response.headers.get("retry-after")),
        parsed,
      );
    }
    throw new EtsyApiError(req.method, req.path, response.status, parsed);
  }

  #buildUrl(
    path: string,
    query: EtsyRequest["query"],
  ): string {
    const url = new URL(
      this.#baseUrl + (path.startsWith("/") ? path : `/${path}`),
    );
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** `Retry-After` is either delta-seconds or an HTTP date. Returns milliseconds. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}
