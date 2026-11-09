// SPDX-License-Identifier: Apache-2.0
// Read-only network access: HTTP GET and JSON-RPC read calls, with a
// process-wide rate limit (default 2 req/s), retries on 429/5xx, and a
// content-addressed disk cache so every run after the first can be offline.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const USER_AGENT = "sik-wasm-catalog/0.0 (read-only research; github.com/stellar/laboratory-backend/issues/36)";

/** JSON-RPC methods this tool may call. All are reads. */
export const READ_METHODS = new Set(["getLedgerEntries", "getEvents", "getLatestLedger", "getHealth", "getNetwork", "getVersionInfo", "getTransactions"]);

export type NetOptions = {
  cacheDir: string;
  /** Minimum milliseconds between any two live requests (500 = 2 req/s). */
  minIntervalMs?: number;
  /** Never touch the network; a cache miss throws. */
  offline?: boolean;
  /** Injected fetch, for tests. */
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
};

export class OfflineMiss extends Error {
  override name = "OfflineMiss";
}

export class HttpError extends Error {
  override name = "HttpError";
  readonly status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export type NetStats = { live: number; cached: number; retries: number; bytes: number };

export class Net {
  readonly stats: NetStats = { live: 0, cached: 0, retries: 0, bytes: 0 };
  private readonly opts: Required<Omit<NetOptions, "fetchImpl" | "log">> & Pick<NetOptions, "log">;
  private readonly fetchImpl: typeof fetch;
  private nextSlot = 0;

  constructor(opts: NetOptions) {
    this.opts = { minIntervalMs: 500, offline: false, ...opts };
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (this.opts.minIntervalMs < 500) throw new Error("minIntervalMs below 500 would exceed 2 req/s");
  }

  private cachePath(ns: string, key: string, ext: string): string {
    const h = createHash("sha256").update(key).digest("hex");
    return join(this.opts.cacheDir, ns, h.slice(0, 2), `${h}.${ext}`);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + this.opts.minIntervalMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  private async live(url: string, init: RequestInit): Promise<Uint8Array> {
    if (this.opts.offline) throw new OfflineMiss(`offline and not cached: ${init.method ?? "GET"} ${url}`);
    let delay = 2000;
    for (let attempt = 1; ; attempt++) {
      await this.throttle();
      this.stats.live++;
      try {
        const res = await this.fetchImpl(url, { ...init, headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
        const body = new Uint8Array(await res.arrayBuffer());
        if (res.ok) {
          this.stats.bytes += body.byteLength;
          return body;
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= 4) throw new HttpError(res.status, `${init.method ?? "GET"} ${url} -> HTTP ${res.status}: ${new TextDecoder().decode(body.subarray(0, 200))}`);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        if (attempt >= 4) throw e;
      }
      this.stats.retries++;
      this.opts.log?.(`retry ${attempt} in ${delay} ms: ${url}`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }

  private store(path: string, data: Uint8Array | string): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  }

  /** GET returning bytes. 404 is cached as `null`. */
  async getBytes(url: string, ns = "http"): Promise<Uint8Array | null> {
    const p = this.cachePath(ns, `GET ${url}`, "bin");
    const miss = `${p}.404`;
    if (existsSync(miss)) {
      this.stats.cached++;
      return null;
    }
    if (existsSync(p)) {
      this.stats.cached++;
      return new Uint8Array(readFileSync(p));
    }
    try {
      const body = await this.live(url, { method: "GET" });
      this.store(p, body);
      return body;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        this.store(miss, "");
        return null;
      }
      throw e;
    }
  }

  async getJson<T>(url: string, ns = "http"): Promise<T | null> {
    const b = await this.getBytes(url, ns);
    return b === null ? null : (JSON.parse(new TextDecoder().decode(b)) as T);
  }

  /** JSON-RPC read call. Only methods in READ_METHODS are allowed. Errors in the JSON-RPC envelope are thrown, not cached. */
  async rpc<T>(rpcUrl: string, method: string, params: unknown, opts: { cache?: boolean } = {}): Promise<T> {
    if (!READ_METHODS.has(method)) throw new Error(`refusing non-read RPC method ${method}`);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const p = this.cachePath("rpc", `${rpcUrl}\n${body}`, "json");
    const useCache = opts.cache !== false;
    if (useCache && existsSync(p)) {
      this.stats.cached++;
      return JSON.parse(readFileSync(p, "utf8")) as T;
    }
    const raw = await this.live(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
    const j = JSON.parse(new TextDecoder().decode(raw)) as { result?: T; error?: { code: number; message: string } };
    if (j.error) throw new Error(`RPC ${method} error ${j.error.code}: ${j.error.message}`);
    if (j.result === undefined) throw new Error(`RPC ${method}: no result`);
    if (useCache) this.store(p, JSON.stringify(j.result));
    return j.result;
  }
}
