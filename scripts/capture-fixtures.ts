// SPDX-License-Identifier: Apache-2.0
// Capture a small, diverse mainnet fixture set from a finished harvest + build:
//   fixtures/mainnet/wasm/<hash>.wasm     blobs chosen for coverage of edge cases
//   fixtures/mainnet/harvest.json         a Harvest restricted to those hashes
//   fixtures/mainnet/ledger-entries.json  raw getLedgerEntries rows (instance + code)
//   fixtures/mainnet/capture.provenance.json
// Usage: node scripts/capture-fixtures.ts [harvestDir=out/harvest] [indexJson=out/index.json]
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Contract } from "@stellar/stellar-sdk";
import type { CatalogRow } from "../src/coverage.ts";
import { codeKey, type Harvest } from "../src/harvest.ts";
import { prettyJson } from "../src/json.ts";
import { Net } from "../src/net.ts";

const root = join(import.meta.dirname, "..");
const harvestDir = process.argv[2] ?? join(root, "out", "harvest");
const indexPath = process.argv[3] ?? join(root, "out", "index.json");
const outDir = join(root, "fixtures", "mainnet");
const MAX_BYTES = 1_500_000;

const harvest = JSON.parse(readFileSync(join(harvestDir, "harvest.json"), "utf8")) as Harvest;
const rows = (JSON.parse(readFileSync(indexPath, "utf8")) as { hashes: CatalogRow[] }).hashes.filter((r) => r.wasmOk !== null);
const bySize = [...rows].sort((a, b) => (a.size ?? 0) - (b.size ?? 0) || a.hash.localeCompare(b.hash));

const chosen = new Map<string, string>();
const pick = (reason: string, pred: (r: CatalogRow) => boolean, n = 1) => {
  for (const r of bySize.filter((x) => pred(x) && !chosen.has(x.hash)).slice(0, n)) chosen.set(r.hash, reason);
};
pick("no contractspecv0", (r) => r.spec === false);
pick("declares events", (r) => (r.events ?? 0) > 0, 2);
pick("SEP-58 build fields", (r) => r.sep58 !== null);
pick("SEP-55 source_repo", (r) => r.sourceRepo !== null);
pick("SEP-47 sep meta", (r) => r.seps.length > 0);
pick("undeclared type reference", (r) => r.bindingDiagnostics.some((d) => d.includes("undeclared type")));
pick("same error code twice", (r) => r.bindingDiagnostics.some((d) => d.startsWith("error code")));
pick("duplicate type name", (r) => r.bindingDiagnostics.some((d) => d.startsWith("duplicate")));
pick("SDK generator output fails tsc", (r) => r.sdkGenTypecheck === "fail");
pick("oldest env protocol", (r) => r.protocol === Math.min(...rows.map((x) => x.protocol ?? 99)));
// Two members of the largest same-interface group, so duplicate grouping is testable offline.
const groups = new Map<string, CatalogRow[]>();
for (const r of rows) if (r.interfaceSha256) groups.set(r.interfaceSha256, [...(groups.get(r.interfaceSha256) ?? []), r]);
const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
for (const r of [...biggest].sort((a, b) => (a.size ?? 0) - (b.size ?? 0)).slice(0, 2)) if (!chosen.has(r.hash)) chosen.set(r.hash, "same-interface group");

let total = 0;
for (const [h] of [...chosen]) {
  const size = rows.find((r) => r.hash === h)?.size ?? 0;
  if (total + size > MAX_BYTES) chosen.delete(h);
  else total += size;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "wasm"), { recursive: true });
const files: Record<string, string> = {};
for (const h of chosen.keys()) {
  const dst = join(outDir, "wasm", `${h}.wasm`);
  copyFileSync(join(harvestDir, "wasm", `${h}.wasm`), dst);
  files[`wasm/${h}.wasm`] = createHash("sha256").update(readFileSync(dst)).digest("hex");
}

const keep = new Set(chosen.keys());
const sub: Harvest = {
  ...harvest,
  contracts: harvest.contracts.filter((c) => keep.has(c.rpcWasm ?? c.seWasm ?? "")),
  hashes: harvest.hashes.filter((h) => keep.has(h.hash)),
  crossCheck: { ...harvest.crossCheck, disagree: harvest.crossCheck.disagree.slice(0, 5) },
};
writeFileSync(join(outDir, "harvest.json"), prettyJson(sub));

// Raw ledger rows for the XDR parsers: one wasm instance, one Stellar Asset Contract instance, one code entry.
const net = new Net({ cacheDir: join(root, ".cache") });
const wasmContract = sub.contracts.find((c) => c.rpcExecutable === "wasm")?.contract;
const sac = harvest.contracts.find((c) => c.rpcExecutable === "stellar_asset")?.contract;
const smallest = [...chosen.keys()].sort((a, b) => (rows.find((r) => r.hash === a)?.size ?? 0) - (rows.find((r) => r.hash === b)?.size ?? 0))[0];
const keys = [wasmContract, sac].filter((x): x is string => !!x).map((id) => new Contract(id).getFootprint().toXdr("base64"));
if (smallest) keys.push(codeKey(smallest));
const entries = await net.rpc<{ entries?: unknown[]; latestLedger: number }>(harvest.params.rpcUrl, "getLedgerEntries", { keys });
writeFileSync(join(outDir, "ledger-entries.json"), prettyJson({ keys, wasmContract, sac, codeHash: smallest, result: entries }));

writeFileSync(
  join(outDir, "capture.provenance.json"),
  prettyJson({
    format: "sik.wasm-catalog.fixture-provenance/v1",
    kind: "mainnet read-only capture",
    capturedAt: new Date().toISOString(),
    script: "scripts/capture-fixtures.ts",
    fromHarvest: { generatedAt: harvest.generatedAt, rpcUrl: harvest.params.rpcUrl, latestLedger: harvest.provenance.latestLedger, rpcVersion: harvest.provenance.rpcVersion },
    ledgerEntriesLatestLedger: entries.latestLedger,
    note: "Wasm blobs were fetched by hash with RPC getLedgerEntries (CONTRACT_CODE) or stellar.expert /wasm/{hash} by the harvester and sha256-checked. Public on-chain data; no keys.",
    reasons: Object.fromEntries(chosen),
    totalWasmBytes: total,
    files,
  }),
);
console.log(`captured ${chosen.size} blobs (${total} bytes) to ${outDir}`);
