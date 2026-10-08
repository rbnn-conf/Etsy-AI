/**
 * Minimal scripted `fetch` double for tests. No network, no dependencies.
 */

export interface FakeResponseSpec {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

export interface FakeFetch {
  readonly fn: typeof fetch;
  readonly calls: RecordedCall[];
}

export function makeFakeFetch(
  responses: readonly FakeResponseSpec[],
): FakeFetch {
  const queue = [...responses];
  const calls: RecordedCall[] = [];

  const fn = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      for (const [k, v] of Object.entries(h as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    let body: string | undefined;
    const b = init?.body;
    if (typeof b === "string") body = b;
    else if (b instanceof URLSearchParams) body = b.toString();
    else if (typeof FormData !== "undefined" && b instanceof FormData) {
      body = "[FormData]";
    }
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body,
    });

    const spec = queue.shift();
    if (spec === undefined) {
      throw new Error(`fake fetch: no scripted response for ${url}`);
    }
    const status = spec.status ?? 200;
    const payload =
      spec.body === undefined ? "" : JSON.stringify(spec.body);
    return new Response(payload, {
      status,
      headers: { "content-type": "application/json", ...spec.headers },
    });
  }) as typeof fetch;

  return { fn, calls };
}

/** A `fetch` that always throws — simulates a transport failure. */
export function throwingFetch(message = "network down"): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as typeof fetch;
}

export const noSleep = (_ms: number): Promise<void> => Promise.resolve();
