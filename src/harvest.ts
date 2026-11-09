// SPDX-License-Identifier: Apache-2.0
// Harvester: enumerate mainnet contracts and their wasm hashes from several
// read-only sources, then fetch each selected wasm by hash and verify it.
//
// Sources (each is optional):
//   se-contracts  stellar.expert contract listing, sampled at k cursors spread
//                 evenly over the contract-id keyspace (a stratified sample of
//                 all contracts), or walked in full.
//   se-top        stellar.expert top contracts by invocations.
//   rpc-events    RPC getEvents windows spread over the retention window.
// Contract -> wasm hash comes from RPC getLedgerEntries on the contract
// instance (rpc-events, se-top, and a cross-check subset of se-contracts) or
// from the listing itself (se-contracts). Wasm bytes come from RPC
// getLedgerEntries(CONTRACT_CODE), falling back to stellar.expert's documented
// /wasm/{hash} endpoint. Every blob is checked against its hash. Nothing is executed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Contract, StrKey, xdr } from "@stellar/stellar-sdk";
import type { Net } from "./net.ts";
import { prettyJson } from "./json.ts";
import { sha256Hex } from "./wasm.ts";

export const HARVEST_FORMAT = "sik.wasm-catalog.harvest/v1";
export const DEFAULT_RPC = "https://mainnet.sorobanrpc.com";
export const SE_API = "https://api.stellar.expert/explorer/public";

export type Executable = "wasm" | "stellar_asset" | "external_ref" | "no_instance" | "unknown";

export type ContractObs = {
  contract: string;
  sources: string[];
  /** Wasm hash per stellar.expert listing. */
  seWasm?: string | null;
  /** Executable per RPC instance lookup. */
  rpcExecutable?: Executable;
  rpcWasm?: string;
  externalRef?: unknown;
  created?: number;
};

export type HashObs = {
  hash: string;
  sources: string[];
  contracts: string[];
  selected: boolean;
  fetch?: "rpc" | "stellar.expert" | "missing" | "hash_mismatch" | "error";
  fetchError?: string;
  lastModifiedLedger?: number;
  liveUntilLedger?: number;
  size?: number;
};

export type HarvestParams = {
  rpcUrl: string;
  seStrata: number;
  seFull: boolean;
  seMaxPages: number;
  seTop: boolean;
  eventWindows: number;
  eventLimit: number;
  maxHashes: number;
  /** Instance-lookup this many se-contracts entries to cross-check stellar.expert against RPC. */
  crossCheck: number;
  seWasmFallback: boolean;
  seed: string;
};

export const DEFAULT_PARAMS: HarvestParams = {
  rpcUrl: DEFAULT_RPC,
  seStrata: 16,
  seFull: false,
  seMaxPages: 2000,
  seTop: true,
  eventWindows: 24,
  eventLimit: 1000,
  maxHashes: 400,
  crossCheck: 200,
  seWasmFallback: true,
  seed: "wct-2026-11-04",
};

export type Harvest = {
  format: typeof HARVEST_FORMAT;
  generatedAt: string;
  params: HarvestParams;
  provenance: {
    rpcVersion?: unknown;
    latestLedger?: number;
    oldestLedger?: number;
    eventWindows: { startLedger: number; events: number }[];
    seCursors: string[];
    sePages: number;
    selection: string;
    net: unknown;
  };
  crossCheck: { checked: number; agree: number; disagree: { contract: string; se: string | null | undefined; rpc: string | undefined; rpcExecutable: Executable | undefined }[] };
  contracts: ContractObs[];
  hashes: HashObs[];
};

type SePage = { _links?: { next?: { href?: string } }; _embedded?: { records?: { contract: string; wasm?: string; created?: number }[] } };

export function stratifiedCursors(k: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    const b = new Uint8Array(32);
    const v = Math.floor((i * 2 ** 32) / k);
    b[0] = (v >>> 24) & 0xff;
    b[1] = (v >>> 16) & 0xff;
    b[2] = (v >>> 8) & 0xff;
    b[3] = v & 0xff;
    out.push(StrKey.encodeContract(Buffer.from(b)));
  }
  return out;
}

function hexOf(h: unknown): string {
  if (h instanceof Uint8Array) return Buffer.from(h).toString("hex");
  return String(h);
}

export type InstanceInfo = { executable: Executable; wasm?: string; externalRef?: unknown; lastModifiedLedger?: number };

/** Parse a base64 LedgerEntryData holding a contract instance. */
export function parseInstanceEntry(b64: string): InstanceInfo {
  // The SDK's generated XDR types are structurally typed; read through `any` and check every step.
  const d: any = xdr.LedgerEntryData.fromXdr(b64, "base64");
  if (d.type !== "contractData") return { executable: "unknown" };
  const v = d.contractData.val;
  if (v?.type !== "scvContractInstance") return { executable: "unknown" };
  const ex = v.instance.executable;
  switch (ex.type) {
    case "contractExecutableWasm":
      return { executable: "wasm", wasm: hexOf(ex.wasmHash) };
    case "contractExecutableStellarAsset":
      return { executable: "stellar_asset" };
    case "contractExecutableExternalRef":
      return { executable: "external_ref", externalRef: ex.externalRef?.toJson?.() ?? null };
    default:
      return { executable: "unknown" };
  }
}

/** Parse a base64 LedgerEntryData holding contract code; returns the wasm bytes. */
export function parseCodeEntry(b64: string): { hash: string; code: Uint8Array } | undefined {
  const d: any = xdr.LedgerEntryData.fromXdr(b64, "base64");
  if (d.type !== "contractCode") return undefined;
  return { hash: hexOf(d.contractCode.hash), code: new Uint8Array(d.contractCode.code) };
}

export function codeKey(hash: string): string {
  const X = xdr as any;
  return X.LedgerKey.contractCode(new X.LedgerKeyContractCode({ hash })).toXdr("base64");
}

type LedgerEntriesResult = { entries?: { key: string; xdr: string; lastModifiedLedgerSeq?: number; liveUntilLedgerSeq?: number }[]; latestLedger: number };

export class Harvester {
  readonly net: Net;
  readonly p: HarvestParams;
  readonly outDir: string;
  readonly log: (m: string) => void;
  private readonly contracts = new Map<string, ContractObs>();
  private readonly hashes = new Map<string, HashObs>();

  constructor(net: Net, params: HarvestParams, outDir: string, log: (m: string) => void = () => {}) {
    this.net = net;
    this.p = params;
    this.outDir = outDir;
    this.log = log;
  }

  private contract(id: string, source: string): ContractObs {
    let c = this.contracts.get(id);
    if (!c) {
      c = { contract: id, sources: [] };
      this.contracts.set(id, c);
    }
    if (!c.sources.includes(source)) c.sources.push(source);
    return c;
  }

  private hash(h: string, source: string, contract?: string): HashObs {
    let o = this.hashes.get(h);
    if (!o) {
      o = { hash: h, sources: [], contracts: [], selected: false };
      this.hashes.set(h, o);
    }
    if (!o.sources.includes(source)) o.sources.push(source);
    if (contract && !o.contracts.includes(contract)) o.contracts.push(contract);
    return o;
  }

  async seContracts(): Promise<{ cursors: string[]; pages: number }> {
    const cursors = this.p.seFull ? [""] : stratifiedCursors(this.p.seStrata);
    let pages = 0;
    for (const cursor of cursors) {
      let url: string | undefined = `${SE_API}/contract?order=asc&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
      while (url && pages < this.p.seMaxPages) {
        const page: SePage | null = await this.net.getJson<SePage>(url, "stellar.expert");
        pages++;
        const recs = page?._embedded?.records ?? [];
        for (const r of recs) {
          if (typeof r.contract !== "string" || !StrKey.isValidContract(r.contract)) continue;
          const c = this.contract(r.contract, "se-contracts");
          c.seWasm = typeof r.wasm === "string" && /^[0-9a-f]{64}$/.test(r.wasm) ? r.wasm : null;
          if (typeof r.created === "number") c.created = r.created;
          if (c.seWasm) this.hash(c.seWasm, "se-contracts", r.contract);
        }
        if (!this.p.seFull || recs.length === 0) break;
        const next: string | undefined = page?._links?.next?.href;
        url = next ? `https://api.stellar.expert${next}` : undefined;
        if (pages % 50 === 0) this.log(`se-contracts: ${pages} pages, ${this.contracts.size} contracts`);
      }
    }
    this.log(`se-contracts: ${pages} pages, ${this.contracts.size} contracts`);
    return { cursors, pages };
  }

  async seTop(): Promise<void> {
    const top = await this.net.getJson<{ contract: string }[]>(`${SE_API}/top-contracts/invocations`, "stellar.expert");
    for (const r of top ?? []) if (typeof r.contract === "string" && StrKey.isValidContract(r.contract)) this.contract(r.contract, "se-top");
    this.log(`se-top: ${(top ?? []).length} contracts`);
  }

  async rpcEvents(oldest: number, latest: number): Promise<{ startLedger: number; events: number }[]> {
    const out: { startLedger: number; events: number }[] = [];
    const span = latest - oldest - 100;
    for (let i = 0; i < this.p.eventWindows; i++) {
      const startLedger = oldest + 10 + Math.floor((i * span) / this.p.eventWindows);
      try {
        const r = await this.net.rpc<{ events?: { contractId?: string }[] }>(this.p.rpcUrl, "getEvents", {
          startLedger,
          filters: [{ type: "contract" }],
          pagination: { limit: this.p.eventLimit },
        });
        const evs = r.events ?? [];
        for (const e of evs) if (e.contractId && StrKey.isValidContract(e.contractId)) this.contract(e.contractId, "rpc-events");
        out.push({ startLedger, events: evs.length });
      } catch (e) {
        this.log(`rpc-events window ${startLedger} failed: ${(e as Error).message}`);
        out.push({ startLedger, events: -1 });
      }
    }
    this.log(`rpc-events: ${out.length} windows`);
    return out;
  }

  /** Instance lookups via RPC for the given contracts, 100 keys per call. */
  async lookupInstances(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const keys = new Map(batch.map((id) => [new Contract(id).getFootprint().toXdr("base64"), id] as const));
      const r = await this.net.rpc<LedgerEntriesResult>(this.p.rpcUrl, "getLedgerEntries", { keys: [...keys.keys()] });
      const found = new Set<string>();
      for (const e of r.entries ?? []) {
        const id = keys.get(e.key);
        if (!id) continue;
        found.add(id);
        const c = this.contract(id, "rpc-instance");
        const info = parseInstanceEntry(e.xdr);
        c.rpcExecutable = info.executable;
        if (info.wasm) {
          c.rpcWasm = info.wasm;
          this.hash(info.wasm, "rpc-instance", id);
        }
        if (info.externalRef !== undefined) c.externalRef = info.externalRef;
      }
      for (const id of batch) if (!found.has(id)) this.contract(id, "rpc-instance").rpcExecutable = "no_instance";
    }
  }

  /** Choose which hashes to fetch: all when under the cap, else the most-used half plus a seeded pseudo-random rest. */
  select(): string {
    const all = [...this.hashes.values()];
    if (all.length <= this.p.maxHashes) {
      for (const h of all) h.selected = true;
      return `all ${all.length} distinct hashes seen`;
    }
    const byUse = [...all].sort((a, b) => b.contracts.length - a.contracts.length || a.hash.localeCompare(b.hash));
    const top = Math.floor(this.p.maxHashes / 2);
    for (const h of byUse.slice(0, top)) h.selected = true;
    const rank = (h: string) => createHash("sha256").update(`${this.p.seed}:${h}`).digest("hex");
    const rest = all.filter((h) => !h.selected).sort((a, b) => rank(a.hash).localeCompare(rank(b.hash)));
    for (const h of rest.slice(0, this.p.maxHashes - top)) h.selected = true;
    return `${this.p.maxHashes} of ${all.length} hashes: the ${top} used by the most contracts in the harvest, plus ${this.p.maxHashes - top} chosen by sha256("${this.p.seed}:" + hash) order`;
  }

  async fetchCode(): Promise<void> {
    const wasmDir = join(this.outDir, "wasm");
    mkdirSync(wasmDir, { recursive: true });
    const todo: HashObs[] = [];
    for (const h of this.hashes.values()) {
      if (!h.selected) continue;
      const p = join(wasmDir, `${h.hash}.wasm`);
      if (existsSync(p) && sha256Hex(readFileSync(p)) === h.hash) {
        h.fetch ??= "rpc";
        h.size = readFileSync(p).byteLength;
        continue;
      }
      todo.push(h);
    }
    for (let i = 0; i < todo.length; i += 10) {
      const batch = todo.slice(i, i + 10);
      const keys = new Map(batch.map((h) => [codeKey(h.hash), h] as const));
      let r: LedgerEntriesResult | undefined;
      try {
        r = await this.net.rpc<LedgerEntriesResult>(this.p.rpcUrl, "getLedgerEntries", { keys: [...keys.keys()] });
      } catch (e) {
        for (const h of batch) {
          h.fetch = "error";
          h.fetchError = (e as Error).message.slice(0, 200);
        }
        continue;
      }
      for (const e of r.entries ?? []) {
        const h = keys.get(e.key);
        if (!h) continue;
        const parsed = parseCodeEntry(e.xdr);
        if (!parsed) continue;
        if (sha256Hex(parsed.code) !== h.hash) {
          h.fetch = "hash_mismatch";
          continue;
        }
        writeFileSync(join(wasmDir, `${h.hash}.wasm`), parsed.code);
        h.fetch = "rpc";
        h.size = parsed.code.byteLength;
        if (e.lastModifiedLedgerSeq !== undefined) h.lastModifiedLedger = e.lastModifiedLedgerSeq;
        if (e.liveUntilLedgerSeq !== undefined) h.liveUntilLedger = e.liveUntilLedgerSeq;
      }
      if ((i / 10) % 10 === 0) this.log(`code: ${Math.min(i + 10, todo.length)}/${todo.length}`);
    }
    for (const h of todo) {
      if (h.fetch !== undefined && h.fetch !== "error") continue;
      if (!this.p.seWasmFallback) {
        h.fetch ??= "missing";
        continue;
      }
      try {
        const b = await this.net.getBytes(`${SE_API}/wasm/${h.hash}`, "stellar.expert");
        if (b === null) h.fetch = "missing";
        else if (sha256Hex(b) !== h.hash) h.fetch = "hash_mismatch";
        else {
          writeFileSync(join(wasmDir, `${h.hash}.wasm`), b);
          h.fetch = "stellar.expert";
          h.size = b.byteLength;
          delete h.fetchError;
        }
      } catch (e) {
        h.fetch = "error";
        h.fetchError = (e as Error).message.slice(0, 200);
      }
    }
  }

  async run(): Promise<Harvest> {
    mkdirSync(this.outDir, { recursive: true });
    const health = await this.net.rpc<{ latestLedger: number; oldestLedger: number }>(this.p.rpcUrl, "getHealth", {}, { cache: false });
    const version = await this.net.rpc<unknown>(this.p.rpcUrl, "getVersionInfo", {}, { cache: false });
    const se = this.p.seStrata > 0 || this.p.seFull ? await this.seContracts() : { cursors: [], pages: 0 };
    if (this.p.seTop) await this.seTop();
    // Re-read the retention window: a long listing walk can outlast the oldest ledger.
    const fresh = this.p.eventWindows > 0 ? await this.net.rpc<{ latestLedger: number; oldestLedger: number }>(this.p.rpcUrl, "getHealth", {}, { cache: false }) : health;
    const windows = this.p.eventWindows > 0 ? await this.rpcEvents(fresh.oldestLedger + 100, fresh.latestLedger) : [];

    // Instance lookups: every contract not from the stellar.expert listing, plus a cross-check subset of it.
    const needLookup = [...this.contracts.values()].filter((c) => c.seWasm === undefined).map((c) => c.contract);
    const seOnes = [...this.contracts.values()].filter((c) => c.seWasm !== undefined).map((c) => c.contract);
    const cross = seOnes.slice(0, this.p.crossCheck);
    await this.lookupInstances([...needLookup, ...cross]);
    const crossCheck: Harvest["crossCheck"] = { checked: 0, agree: 0, disagree: [] };
    for (const id of cross) {
      const c = this.contracts.get(id) as ContractObs;
      crossCheck.checked++;
      const rpcSide = c.rpcExecutable === "wasm" ? c.rpcWasm : null;
      if ((c.seWasm ?? null) === (rpcSide ?? null) || (c.seWasm === null && c.rpcExecutable === "stellar_asset")) crossCheck.agree++;
      else crossCheck.disagree.push({ contract: id, se: c.seWasm, rpc: c.rpcWasm, rpcExecutable: c.rpcExecutable });
    }
    this.log(`instances: ${needLookup.length + cross.length} looked up; cross-check ${crossCheck.agree}/${crossCheck.checked} agree`);

    const selection = this.select();
    await this.fetchCode();

    const h: Harvest = {
      format: HARVEST_FORMAT,
      generatedAt: new Date().toISOString(),
      params: this.p,
      provenance: {
        rpcVersion: version,
        latestLedger: health.latestLedger,
        oldestLedger: health.oldestLedger,
        eventWindows: windows,
        seCursors: se.cursors,
        sePages: se.pages,
        selection,
        net: { ...this.net.stats },
      },
      crossCheck,
      contracts: [...this.contracts.values()].sort((a, b) => a.contract.localeCompare(b.contract)),
      hashes: [...this.hashes.values()].sort((a, b) => a.hash.localeCompare(b.hash)),
    };
    writeFileSync(join(this.outDir, "harvest.json"), prettyJson(h));
    return h;
  }
}
