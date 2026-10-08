/**
 * Persistence for the OAuth token set obtained from Etsy.
 *
 * The token set contains a live refresh token — a real credential. Per
 * SECURITY.md it must never be committed. Implementations here write only to
 * git-ignored locations (see services/.gitignore) or keep it in memory.
 *
 * A production deployment would replace `FileTokenStore` with the n8n
 * encrypted credential store or a secrets manager (see ADR-006); the
 * `TokenStore` interface is the seam for that swap.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EtsyTokenSet } from "./oauth.ts";

export interface TokenStore {
  load(): Promise<EtsyTokenSet | undefined>;
  save(token: EtsyTokenSet): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  #token: EtsyTokenSet | undefined;

  constructor(initial?: EtsyTokenSet) {
    this.#token = initial;
  }

  load(): Promise<EtsyTokenSet | undefined> {
    return Promise.resolve(this.#token);
  }

  save(token: EtsyTokenSet): Promise<void> {
    this.#token = token;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#token = undefined;
    return Promise.resolve();
  }
}

/**
 * JSON file on disk. Default path is `services/.secrets/etsy-token.json`
 * (git-ignored). Override with the `ETSY_TOKEN_FILE` env var / constructor arg.
 */
export class FileTokenStore implements TokenStore {
  readonly #path: string;

  constructor(filePath?: string) {
    const configuredPath = filePath?.trim() || process.env["ETSY_TOKEN_FILE"]?.trim();
    this.#path = resolve(
      configuredPath ||
        resolve(import.meta.dirname, "../../.secrets/etsy-token.json"),
    );
  }

  get path(): string {
    return this.#path;
  }

  async load(): Promise<EtsyTokenSet | undefined> {
    try {
      const raw = await readFile(this.#path, "utf8");
      return JSON.parse(raw) as EtsyTokenSet;
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }

  async save(token: EtsyTokenSet): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, JSON.stringify(token, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async clear(): Promise<void> {
    try {
      await writeFile(this.#path, "", { encoding: "utf8", mode: 0o600 });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}
