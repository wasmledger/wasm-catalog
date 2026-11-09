// SPDX-License-Identifier: Apache-2.0
// WCT-024: web export. (1) unit behaviour on a synthetic catalog; (2) the shipped
// web/public/data agrees with the committed census (census/full-walk-2026-11-04).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { CatalogRow } from "../src/coverage.ts";
import type { Harvest } from "../src/harvest.ts";
import { SEP41_FUNCTIONS } from "../src/similarity.ts";
import { buildWebData, CONTRACTS_PER_HASH, type CatalogIndex, type HashDetail, type SpecJson, type WebRow } from "../src/webdata.ts";

const root = join(import.meta.dirname, "..");
const H = (c: string) => c.repeat(64).slice(0, 64);

function row(hash: string, over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    hash, selected: true, fetch: "rpc", sources: ["se-contracts"], contractCount: 0, contracts: [], size: 100, wasmOk: true,
    spec: true, specSections: 1, specDecodes: true, specFromWasm: true, functions: 0, types: 0, errorEnums: 0, events: 0,
    meta: true, metaDecodes: true, envMeta: true, protocol: 22, sdkVersion: "22.0.7", rustVersion: "1.81.0", seps: [],
    sourceRepo: null, sep58: null, metaKeys: [], specSha256: `s-${hash}`, interfaceSha256: `i-${hash}`, codeSha256: `c-${hash}`,
    bindings: true, bindingDiagnostics: [], typecheck: "pass", typecheckErrors: [], sdkGenTypecheck: "pass", sdkGenErrors: [], ...over,
  };
}
const fn = (name: string, arity: number) => ({ function_v0: { doc: "", name, inputs: Array.from({ length: arity }, (_, i) => ({ doc: "", name: `a${i}`, type: "address" })), outputs: [] } });

test("buildWebData: rows, groups, labels, shards, contract lookup, created months", () => {
  const sep41 = SEP41_FUNCTIONS.map((f) => fn(f.name, f.arity));
  const specs: Record<string, SpecJson> = {
    [H("a")]: { spec: { present: true, entries: sep41 } },
    [H("b")]: { spec: { present: true, entries: [...sep41, fn("upgrade", 1)] } },
    [H("c")]: { spec: { present: false, entries: [] } },
  };
  const contractsA = Array.from({ length: CONTRACTS_PER_HASH + 5 }, (_, i) => `CA${String.fromCharCode(65 + (i % 26))}${String(i).padStart(53, "0")}`);
  const rows = [
    row(H("b"), { contractCount: 1, interfaceSha256: "same", functions: 11, sep58: "conformant", sourceRepo: "github:org/repo" }),
    row(H("a"), { contractCount: contractsA.length, interfaceSha256: "same", functions: 10, events: 2, typecheck: "pass", sdkGenTypecheck: "fail", sdkGenErrors: ["TS2749: x"] }),
    row(H("c"), { spec: false, contractCount: 0, functions: null, bindings: false, typecheck: null, sdkGenTypecheck: null }),
  ];
  const harvest = {
    generatedAt: "2026-11-04T01:55:04.331Z",
    params: { rpcUrl: "https://rpc.example", seFull: true, seStrata: 16 },
    provenance: { latestLedger: 65293972, oldestLedger: 1, sePages: 3, selection: "all", eventWindows: [], seCursors: [], net: null },
    crossCheck: { checked: 0, agree: 0, disagree: [] },
    contracts: [
      ...contractsA.map((c, i) => ({ contract: c, sources: ["se-contracts"], seWasm: H("a"), created: Date.UTC(2025, i % 2, 15) / 1000 })),
      { contract: "CBB" + "1".repeat(53), sources: ["se-contracts"], seWasm: H("b") },
      { contract: "CCZ" + "2".repeat(53), sources: ["se-contracts"], seWasm: null, rpcExecutable: "stellar_asset", created: Date.UTC(2025, 0, 2) / 1000 },
    ],
    hashes: [{ hash: H("a"), sources: [], contracts: [], selected: true, lastModifiedLedger: 123 }],
  } as unknown as Harvest;
  const index: CatalogIndex = { format: "x", generatedAt: "2026-11-04T16:35:49.076Z", generator: "g", harvest: { generatedAt: harvest.generatedAt, latestLedger: 65293972, selection: "all" }, hashes: rows };
  const d = buildWebData({ index, harvest, coverage: { k: 1 }, readSpec: (h) => specs[h] ?? null, readBindings: (h) => `// ${h}`, exportedAt: "2026-11-08T00:00:00.000Z" });

  assert.deepEqual(d.index.rows.map((r) => r.h), [H("a"), H("b"), H("c")], "sorted by hash");
  const [a, b, c] = d.index.rows as [WebRow, WebRow, WebRow];
  assert.equal(a.gi, b.gi);
  assert.notEqual(a.gi, null);
  assert.equal(c.gi, null, "no spec, no interface group");
  assert.deepEqual(a.lab, ["sep41"]);
  assert.deepEqual(b.lab, ["sep41"]);
  assert.equal(a.nc, b.nc, "10 of 11 names shared -> one near cluster");
  assert.equal(a.cr, "2025-01-15");
  assert.equal(b.cr, null, "no created date recorded");
  assert.equal(a.fns.length, 10);

  const sa = d.shards.get("aa")![H("a")] as HashDetail;
  assert.equal(sa.contracts.length, CONTRACTS_PER_HASH);
  assert.equal(sa.contractCount, CONTRACTS_PER_HASH + 5);
  assert.deepEqual(sa.created, { first: "2025-01-15", last: "2025-02-15" });
  assert.equal(sa.bindings, `// ${H("a")}`);
  assert.equal(sa.lastModifiedLedger, 123);
  assert.deepEqual(sa.sdkErrors, ["TS2749: x"]);
  assert.equal(sa.neighbours[0]!.h, H("b"));
  assert.equal(d.shards.get("cc")![H("c")]!.bindings, null);

  const lookup = Object.assign({}, ...[...d.contractShards.values()]) as Record<string, string>;
  assert.equal(lookup["CBB" + "1".repeat(53)], H("b"));
  assert.equal(lookup["CCZ" + "2".repeat(53)], "stellar_asset");
  assert.equal(Object.keys(lookup).length, contractsA.length + 2);

  const s = d.summary as { totals: Record<string, unknown>; created: { byMonth: { month: string; contracts: number; newHashes: number }[]; contractsWithoutDate: number }; seps: Record<string, { hashes: number; contracts: number; hosts?: Record<string, number> }>; coverage: unknown };
  assert.equal(s.totals["hashes"], 3);
  assert.equal(s.totals["sdkFail"], 1);
  assert.deepEqual(s.created.byMonth, [
    { month: "2025-01", contracts: 104, newHashes: 1 },
    { month: "2025-02", contracts: 102, newHashes: 0 },
  ]);
  assert.equal(s.created.contractsWithoutDate, 1);
  assert.deepEqual(s.seps["sep41"], { hashes: 2, contracts: contractsA.length + 1, method: (s.seps["sep41"] as unknown as { method: string }).method });
  assert.deepEqual(s.seps["sep55SourceRepo"]!.hosts, { "github: form": 1 });
  assert.deepEqual(s.coverage, { k: 1 }, "coverage copied as-is");
});

const data = join(root, "web", "public", "data");
test("shipped web data agrees with the committed full-walk census", { skip: !existsSync(join(data, "summary.json")) && "web/public/data not generated" }, () => {
  const cov = JSON.parse(readFileSync(join(root, "census", "full-walk-2026-11-04", "coverage.json"), "utf8")) as {
    harvest: { latestLedger: number }; contracts: { total: number; withWasmHash: number }; hashes: { seen: number; mostUsed: { hash: string; contracts: number }[] };
    sections: { specPresent: number; withEvents: number; sep47Declared: number; sep55SourceRepo: number }; bindings: { typecheck: { pass: number; fail: number }; sdkGenerator: { pass: number; fail: number } };
    duplicates: { sameInterface: { groupsWithDuplicates: number }; sameSpecBytes: { groupsWithDuplicates: number }; sameCodeModuloCustomSections: { groupsWithDuplicates: number } };
  };
  const s = JSON.parse(readFileSync(join(data, "summary.json"), "utf8")) as {
    provenance: { latestLedger: number }; totals: Record<string, number> & { topHash: { hash: string; contracts: number } }; seps: Record<string, { hashes: number }>;
    groups: Record<string, { groups: number }>;
  };
  const idx = JSON.parse(readFileSync(join(data, "index.json"), "utf8")) as { count: number; rows: WebRow[] };
  assert.equal(s.provenance.latestLedger, cov.harvest.latestLedger);
  assert.equal(s.totals["contracts"], cov.contracts.total);
  assert.equal(s.totals["contractsWithHash"], cov.contracts.withWasmHash);
  assert.equal(s.totals["hashes"], cov.hashes.seen);
  assert.equal(s.totals["withSpec"], cov.sections.specPresent);
  assert.equal(s.totals["oursPass"], cov.bindings.typecheck.pass);
  assert.equal(s.totals["oursFail"], cov.bindings.typecheck.fail);
  assert.equal(s.totals["sdkPass"], cov.bindings.sdkGenerator.pass);
  assert.equal(s.totals["sdkFail"], cov.bindings.sdkGenerator.fail);
  assert.equal(s.totals.topHash.hash, cov.hashes.mostUsed[0]!.hash);
  assert.equal(s.seps["sep48Events"]!.hashes, cov.sections.withEvents);
  assert.equal(s.seps["sep47Declared"]!.hashes, cov.sections.sep47Declared);
  assert.equal(s.seps["sep55SourceRepo"]!.hashes, cov.sections.sep55SourceRepo);
  assert.equal(s.groups["sameInterface"]!.groups, cov.duplicates.sameInterface.groupsWithDuplicates);
  assert.equal(s.groups["sameSpec"]!.groups, cov.duplicates.sameSpecBytes.groupsWithDuplicates);
  assert.equal(s.groups["sameCode"]!.groups, cov.duplicates.sameCodeModuloCustomSections.groupsWithDuplicates);
  assert.equal(idx.count, cov.hashes.seen);
  assert.equal(idx.rows.reduce((n, r) => n + r.n, 0), cov.contracts.withWasmHash);

  // Every index row has a shard entry; sample 16 of 256 shards to keep the test fast.
  const shards = readdirSync(join(data, "h")).sort();
  assert.equal(shards.length, 256);
  for (const f of shards.filter((_, i) => i % 16 === 0)) {
    const sh = JSON.parse(gunzipSync(readFileSync(join(data, "h", f))).toString("utf8")) as { hashes: Record<string, HashDetail> };
    const want = idx.rows.filter((r) => r.h.startsWith(f.slice(0, 2))).map((r) => r.h).sort();
    assert.deepEqual(Object.keys(sh.hashes).sort(), want, f);
    for (const h of want) {
      const r = idx.rows.find((x) => x.h === h)!;
      assert.equal(sh.hashes[h]!.bindings !== null, r.tc !== null, `${h} bindings presence`);
    }
  }
  const contracts = readdirSync(join(data, "c")).reduce((n, f) => n + Object.keys(JSON.parse(gunzipSync(readFileSync(join(data, "c", f))).toString("utf8")) as object).length, 0);
  assert.equal(contracts, cov.contracts.total);
});
