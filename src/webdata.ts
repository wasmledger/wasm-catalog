// SPDX-License-Identifier: Apache-2.0
// Export a built catalog for the static web browser (WCT-024): a small summary,
// a compact searchable index, lazily loaded per-hash shards and a contract-to-hash
// lookup. Every figure in the summary is derived here from the recorded harvest and
// build, never typed in; the provenance block travels with the data.
import type { CatalogRow } from "./coverage.ts";
import type { Harvest } from "./harvest.ts";
import { DEFAULT_SIM, nearDuplicates, templateLabels, type FnSig, type TemplateLabel } from "./similarity.ts";
import { buildModel } from "./specmodel.ts";

export const WEB_SUMMARY_FORMAT = "sik.wasm-catalog.web-summary/v1";
export const WEB_INDEX_FORMAT = "sik.wasm-catalog.web-index/v1";
export const WEB_SHARD_FORMAT = "sik.wasm-catalog.web-shard/v1";
/** Contract IDs kept per hash in a shard (one hash runs 131,459 contracts). */
export const CONTRACTS_PER_HASH = 200;
/** Members listed per group or cluster in the summary. */
export const MEMBERS_LISTED = 40;

export type CatalogIndex = { format: string; generatedAt: string; generator: string; harvest: { generatedAt: string; latestLedger: number | null; selection: string }; hashes: CatalogRow[] };
export type SpecJson = { spec?: { present?: boolean; entries?: unknown[] }; [k: string]: unknown };

export type WebInputs = {
  index: CatalogIndex;
  harvest: Harvest;
  /** coverage.json written by the same build (copied into the summary as-is). */
  coverage: Record<string, unknown>;
  readSpec: (hash: string) => SpecJson | null;
  readBindings: (hash: string) => string | null;
  exportedAt: string;
};

/** One row of web index.json. Short keys: 4,200 rows are loaded at once. */
export type WebRow = {
  h: string;
  /** contracts seen running it */
  n: number;
  sz: number | null;
  sp: boolean | null;
  f: number | null;
  t: number | null;
  e: number | null;
  ev: number | null;
  p: number | null;
  sdk: string | null;
  rs: string | null;
  sep: string[];
  repo: string | null;
  s58: "conformant" | "non-conformant" | null;
  tc: "pass" | "fail" | null;
  sg: "pass" | "fail" | null;
  /** group ids (only for groups of two or more): same interface, same spec bytes, same code, near-duplicate cluster */
  gi: number | null;
  gs: number | null;
  gc: number | null;
  nc: number | null;
  lab: TemplateLabel[];
  fns: string[];
  /** earliest stellar.expert `created` date among its contracts (YYYY-MM-DD, UTC) */
  cr: string | null;
};

export type HashDetail = {
  spec: SpecJson | null;
  bindings: string | null;
  diagnostics: string[];
  tcErrors: string[];
  sdkErrors: string[];
  contracts: string[];
  contractCount: number;
  created: { first: string | null; last: string | null };
  neighbours: { h: string; j: number }[];
  fetch: string | null;
  sources: string[];
  lastModifiedLedger: number | null;
};

export type Group = { id: number; size: number; contracts: number; sdkVersions: string[]; members: string[]; shared?: string[]; unionSize?: number; minJ?: number; distinctSets?: number };

const minOf = (xs: number[]) => xs.reduce((a, b) => (b < a ? b : a), Infinity);
const maxOf = (xs: number[]) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);
const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const month = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 7);

function groupBy(rows: CatalogRow[], key: (r: CatalogRow) => string | null): Map<string, CatalogRow[]> {
  const m = new Map<string, CatalogRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    let g = m.get(k);
    if (!g) m.set(k, (g = []));
    g.push(r);
  }
  return m;
}

function numberGroups(groups: CatalogRow[][]): { ids: Map<string, number>; list: Group[] } {
  const multi = groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length || a[0]!.hash.localeCompare(b[0]!.hash));
  const ids = new Map<string, number>();
  const list = multi.map((g, id) => {
    const members = [...g].sort((a, b) => b.contractCount - a.contractCount || a.hash.localeCompare(b.hash));
    for (const r of g) ids.set(r.hash, id);
    return {
      id,
      size: g.length,
      contracts: g.reduce((n, r) => n + r.contractCount, 0),
      sdkVersions: [...new Set(g.map((r) => r.sdkVersion ?? "(none)"))].sort(),
      members: members.slice(0, MEMBERS_LISTED).map((r) => r.hash),
    };
  });
  return { ids, list };
}

export type WebData = {
  summary: Record<string, unknown>;
  index: { format: string; generatedAt: string; count: number; rows: WebRow[] };
  /** two-hex-char prefix -> hash -> detail */
  shards: Map<string, Record<string, HashDetail>>;
  /** third character of the contract ID -> contract -> hash, or the executable kind when it runs no wasm */
  contractShards: Map<string, Record<string, string>>;
};

export function buildWebData(inp: WebInputs): WebData {
  const rows = [...inp.index.hashes].sort((a, b) => a.hash.localeCompare(b.hash));
  const H = inp.harvest;

  // Contracts per hash, created dates, contract lookup.
  const contractsOf = new Map<string, string[]>();
  const createdOf = new Map<string, number[]>();
  const contractShards = new Map<string, Record<string, string>>();
  const createdMonth: Record<string, { contracts: number; newHashes: number }> = {};
  let noCreated = 0;
  for (const c of H.contracts) {
    const h = c.rpcWasm ?? c.seWasm ?? null;
    const shardKey = c.contract.charAt(2);
    let s = contractShards.get(shardKey);
    if (!s) contractShards.set(shardKey, (s = {}));
    s[c.contract] = h ?? (c.rpcExecutable && c.rpcExecutable !== "wasm" ? c.rpcExecutable : "no_wasm_listed");
    if (c.created !== undefined) (createdMonth[month(c.created)] ??= { contracts: 0, newHashes: 0 }).contracts++;
    else noCreated++;
    if (!h) continue;
    let l = contractsOf.get(h);
    if (!l) contractsOf.set(h, (l = []));
    l.push(c.contract);
    if (c.created !== undefined) {
      let t = createdOf.get(h);
      if (!t) createdOf.set(h, (t = []));
      t.push(c.created);
    }
  }
  const firstCreated = new Map<string, number>();
  for (const [h, ts] of createdOf) {
    const first = minOf(ts);
    firstCreated.set(h, first);
    (createdMonth[month(first)] ??= { contracts: 0, newHashes: 0 }).newHashes++;
  }
  const hashObs = new Map(H.hashes.map((x) => [x.hash, x]));

  // Spec-derived facts: function signatures, labels.
  const fnSigs = new Map<string, FnSig[]>();
  const specs = new Map<string, SpecJson | null>();
  for (const r of rows) {
    const spec = inp.readSpec(r.hash);
    specs.set(r.hash, spec);
    const entries = spec?.spec?.present ? (spec.spec.entries ?? []) : [];
    fnSigs.set(r.hash, buildModel(entries).functions.map((f) => ({ name: f.name, arity: f.inputs.length })));
  }
  const labels = new Map(rows.map((r) => [r.hash, templateLabels(fnSigs.get(r.hash) ?? [])]));

  // Exact groups and near-duplicate clusters.
  const gi = numberGroups([...groupBy(rows, (r) => (r.spec ? r.interfaceSha256 : null)).values()]);
  const gs = numberGroups([...groupBy(rows, (r) => (r.spec ? r.specSha256 : null)).values()]);
  const gc = numberGroups([...groupBy(rows, (r) => r.codeSha256).values()]);
  const sim = nearDuplicates(rows.map((r) => ({ id: r.hash, fns: (fnSigs.get(r.hash) ?? []).map((f) => f.name) })), DEFAULT_SIM);
  const byHash = new Map(rows.map((r) => [r.hash, r]));
  const nearIds = new Map<string, number>();
  const nearList: Group[] = sim.clusters.map((c, id) => {
    for (const h of c.members) nearIds.set(h, id);
    const rs = c.members.map((h) => byHash.get(h)!);
    const sets = rs.map((r) => new Set((fnSigs.get(r.hash) ?? []).map((f) => f.name)));
    const union = new Set(sets.flatMap((s) => [...s]));
    const shared = [...union].filter((n) => sets.every((s) => s.has(n))).sort();
    const members = [...rs].sort((a, b) => b.contractCount - a.contractCount || a.hash.localeCompare(b.hash));
    return {
      id,
      size: c.members.length,
      contracts: rs.reduce((n, r) => n + r.contractCount, 0),
      sdkVersions: [...new Set(rs.map((r) => r.sdkVersion ?? "(none)"))].sort(),
      members: members.slice(0, MEMBERS_LISTED).map((r) => r.hash),
      shared,
      unionSize: union.size,
      minJ: c.minJ,
      distinctSets: c.distinctSets,
    };
  });

  const webRows: WebRow[] = rows.map((r) => ({
    h: r.hash,
    n: r.contractCount,
    sz: r.size,
    sp: r.spec,
    f: r.functions,
    t: r.types,
    e: r.errorEnums,
    ev: r.events,
    p: r.protocol,
    sdk: r.sdkVersion,
    rs: r.rustVersion,
    sep: r.seps,
    repo: r.sourceRepo,
    s58: r.sep58,
    tc: r.typecheck,
    sg: r.sdkGenTypecheck,
    gi: gi.ids.get(r.hash) ?? null,
    gs: gs.ids.get(r.hash) ?? null,
    gc: gc.ids.get(r.hash) ?? null,
    nc: nearIds.get(r.hash) ?? null,
    lab: labels.get(r.hash) ?? [],
    fns: (fnSigs.get(r.hash) ?? []).map((f) => f.name),
    cr: firstCreated.has(r.hash) ? day(firstCreated.get(r.hash)!) : null,
  }));

  const shards = new Map<string, Record<string, HashDetail>>();
  for (const r of rows) {
    const key = r.hash.slice(0, 2);
    let s = shards.get(key);
    if (!s) shards.set(key, (s = {}));
    const cs = contractsOf.get(r.hash) ?? r.contracts;
    const ts = createdOf.get(r.hash) ?? [];
    const obs = hashObs.get(r.hash);
    s[r.hash] = {
      spec: specs.get(r.hash) ?? null,
      bindings: r.bindings ? inp.readBindings(r.hash) : null,
      diagnostics: r.bindingDiagnostics,
      tcErrors: r.typecheckErrors,
      sdkErrors: r.sdkGenErrors,
      contracts: [...cs].sort().slice(0, CONTRACTS_PER_HASH),
      contractCount: r.contractCount,
      created: { first: ts.length ? day(minOf(ts)) : null, last: ts.length ? day(maxOf(ts)) : null },
      neighbours: (sim.neighbours.get(r.hash) ?? []).map((n) => ({ h: n.id, j: Math.round(n.j * 1000) / 1000 })),
      fetch: r.fetch,
      sources: r.sources,
      lastModifiedLedger: obs?.lastModifiedLedger ?? null,
    };
  }

  // SEP adoption, hash- and contract-weighted.
  const withHash = H.contracts.filter((c) => (c.rpcWasm ?? c.seWasm ?? null) !== null).length;
  const measure = (pred: (r: CatalogRow) => boolean) => {
    const rs = rows.filter(pred);
    return { hashes: rs.length, contracts: rs.reduce((n, r) => n + r.contractCount, 0) };
  };
  const has = (l: TemplateLabel) => (r: CatalogRow) => (labels.get(r.hash) ?? []).includes(l);
  const sep47: Record<string, number> = {};
  for (const r of rows) for (const s of new Set(r.seps)) sep47[s] = (sep47[s] ?? 0) + 1;
  const repoHosts: Record<string, number> = {};
  for (const r of rows) if (r.sourceRepo) {
    // SEP-55 values seen: `github:owner/repo` and full URLs.
    const url = /^[a-z]+:\/\/([^/]+)/i.exec(r.sourceRepo);
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(r.sourceRepo);
    const host = url ? url[1]!.toLowerCase() : scheme ? `${scheme[1]!.toLowerCase()}: form` : "other";
    repoHosts[host] = (repoHosts[host] ?? 0) + 1;
  }

  const months = Object.keys(createdMonth).sort();
  const summary = {
    format: WEB_SUMMARY_FORMAT,
    exportedAt: inp.exportedAt,
    provenance: {
      kind: "recorded",
      network: "mainnet",
      latestLedger: H.provenance.latestLedger ?? null,
      oldestLedger: H.provenance.oldestLedger ?? null,
      harvestedAt: H.generatedAt,
      builtAt: inp.index.generatedAt,
      generator: inp.index.generator,
      rpcUrl: H.params.rpcUrl,
      rpcVersion: (H.provenance as { rpcVersion?: { version?: string; protocolVersion?: number } }).rpcVersion ?? null,
      listing: H.params.seFull ? "stellar.expert contract listing, full walk" : `stellar.expert contract listing, ${H.params.seStrata} strata`,
      sePages: H.provenance.sePages,
      selection: inp.index.harvest.selection,
    },
    totals: {
      contracts: H.contracts.length,
      contractsWithHash: withHash,
      hashes: rows.length,
      withSpec: rows.filter((r) => r.spec).length,
      bindings: rows.filter((r) => r.bindings).length,
      oursPass: rows.filter((r) => r.typecheck === "pass").length,
      oursFail: rows.filter((r) => r.typecheck === "fail").length,
      sdkPass: rows.filter((r) => r.sdkGenTypecheck === "pass").length,
      sdkFail: rows.filter((r) => r.sdkGenTypecheck === "fail").length,
      topHash: (() => {
        const t = [...rows].sort((a, b) => b.contractCount - a.contractCount)[0];
        return t ? { hash: t.hash, contracts: t.contractCount, functions: t.functions, sdkVersion: t.sdkVersion } : null;
      })(),
    },
    created: {
      source: "stellar.expert listing `created` field (UTC)",
      contractsWithDate: H.contracts.length - noCreated,
      contractsWithoutDate: noCreated,
      byMonth: months.map((m) => ({ month: m, contracts: createdMonth[m]!.contracts, newHashes: createdMonth[m]!.newHashes })),
    },
    groups: {
      sameInterface: { groups: gi.list.length, hashes: gi.list.reduce((n, g) => n + g.size, 0), top: gi.list.slice(0, 30) },
      sameSpec: { groups: gs.list.length, hashes: gs.list.reduce((n, g) => n + g.size, 0), top: gs.list.slice(0, 30) },
      sameCode: { groups: gc.list.length, hashes: gc.list.reduce((n, g) => n + g.size, 0), top: gc.list.slice(0, 30) },
      near: {
        method: "Jaccard index over the set of function names in contractspecv0; single-linkage clusters; sets with fewer functions than the minimum are left out; names only, argument types not compared",
        options: sim.options,
        considered: sim.considered,
        distinctSets: sim.distinctSets,
        edges: sim.edges,
        clusters: nearList.length,
        hashes: nearList.reduce((n, g) => n + g.size, 0),
        top: nearList.slice(0, 40),
      },
    },
    seps: {
      contractsWithHash: withHash,
      sep41: { ...measure(has("sep41")), method: "all ten SEP-41 functions present with the SEP's input counts (names and arity only)" },
      sep41Partial: { ...measure(has("sep41-partial")), method: "seven to nine of the ten SEP-41 function names, or all ten with a different input count" },
      sep41SacAdmin: { ...measure(has("sep41-sac-admin")), method: "SEP-41 plus set_admin, admin, set_authorized, authorized, mint, clawback" },
      sep48Events: measure((r) => (r.events ?? 0) > 0),
      sep47Declared: { ...measure((r) => r.seps.length > 0), seps: Object.fromEntries(Object.entries(sep47).sort((a, b) => b[1] - a[1])) },
      sep55SourceRepo: { ...measure((r) => !!r.sourceRepo), hosts: Object.fromEntries(Object.entries(repoHosts).sort((a, b) => b[1] - a[1])) },
      sep58Conformant: measure((r) => r.sep58 === "conformant"),
      sep58NonConformant: measure((r) => r.sep58 === "non-conformant"),
    },
    coverage: inp.coverage,
  };

  return { summary, index: { format: WEB_INDEX_FORMAT, generatedAt: inp.exportedAt, count: webRows.length, rows: webRows }, shards, contractShards };
}
