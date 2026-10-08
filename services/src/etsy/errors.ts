/**
 * Error taxonomy for the Etsy integration layer.
 *
 * Every failure that leaves this layer is one of these types, so the product
 * pipeline can branch on `instanceof` without parsing Etsy's raw response
 * shapes. Raw bodies are attached for logging but callers should not depend on
 * their structure.
 */

export abstract class EtsyError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A 401/403 — token missing, expired, revoked, or scope insufficient. */
export class EtsyAuthError extends EtsyError {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Etsy authentication failed (HTTP ${status})`);
    this.status = status;
    this.body = body;
  }
}

/** A 429 — rate limited. `retryAfterMs` is set when Etsy sent `Retry-After`. */
export class EtsyRateLimitError extends EtsyError {
  readonly retryAfterMs: number | undefined;
  readonly body: unknown;
  constructor(retryAfterMs: number | undefined, body: unknown) {
    super(
      `Etsy rate limit exceeded (HTTP 429)` +
        (retryAfterMs !== undefined ? `, retry after ${retryAfterMs}ms` : ""),
    );
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}

/** Any other non-2xx HTTP response from Etsy. */
export class EtsyApiError extends EtsyError {
  readonly status: number;
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  constructor(
    method: string,
    path: string,
    status: number,
    body: unknown,
    message?: string,
  ) {
    super(message ?? `Etsy API error: ${method} ${path} -> HTTP ${status}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

/** Transport failure — DNS, TLS, socket, or request timeout. No HTTP status. */
export class EtsyNetworkError extends EtsyError {
  constructor(message: string, cause: unknown) {
    super(message);
    // Set the standard Error `cause` without redeclaring the field.
    (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Local refusal to publish (no request was sent): the server-side publish gate
 * is off, the confirmation is missing/mismatched, or the listing is not an
 * eligible draft. Distinct from Etsy API errors so callers can tell them apart.
 */
export class EtsyPublishBlockedError extends EtsyError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown by {@link EtsyService} methods that are defined in the interface but
 * deliberately not implemented in this foundation phase. This is NOT a stub
 * pretending to work — it fails loudly and names the phase that will implement
 * it, so nothing downstream can mistake it for a working call.
 */
export class EtsyNotImplementedError extends EtsyError {
  readonly operation: string;
  constructor(operation: string, note?: string) {
    super(
      `EtsyService.${operation}() is not implemented in the current ` +
        `foundation phase.` +
        (note ? ` ${note}` : ""),
    );
    this.operation = operation;
  }
}
