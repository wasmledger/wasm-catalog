// SPDX-License-Identifier: Apache-2.0
// Offline tests over the captured mainnet fixtures (fixtures/mainnet, see capture.provenance.json).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildCatalog } from "../src/catalog.ts";
import { decodeWasm } from "../src/decode.ts";
import { parseCodeEntry, parseInstanceEntry, type Harvest } from "../src/harvest.ts";
import { encodeSpec } from "../src/specenc.ts";
import { concatBytes, customSections, parseWasm, sha256Hex } from "../src/wasm.ts";

const root = join(import.meta.dirname, "..");
const fx = join(root, "fixtures", "mainnet");
const prov = JSON.parse(readFileSync(join(fx, "capture.provenance.json"), "utf8")) as { reasons: Record<string, string>; files: Record<string, string> };
const blobs = readdirSync(join(fx, "wasm")).map((f) => new Uint8Array(readFileSync(join(fx, "wasm", f))));

test("fixture blobs match their hashes and provenance", () => {
  assert.ok(blobs.length >= 8);
  for (const [path, sha] of Object.entries(prov.files)) {
    const b = readFileSync(join(fx, path));
    assert.equal(sha256Hex(b), sha);
    assert.equal(path, `wasm/${sha}.wasm`);
  }
});

test("every mainnet fixture parses; spec round-trips byte for byte through our encoder", () => {
  let withSpec = 0;
  for (const b of blobs) {
    const d = decodeWasm(b);
    assert.equal(d.wasmError, undefined, d.hash);
    if (!d.spec.present) continue;
    withSpec++;
    assert.equal(d.spec.sdkDecodes, true, d.hash);
    const orig = concatBytes(customSections(parseWasm(b), "contractspecv0"));
    assert.deepEqual(encodeSpec(d.spec.entries), orig, `${d.hash} re-encodes identically`);
  }
  assert.ok(withSpec >= blobs.length - 1);
});

test("fixture reasons hold (events, SEP-58, SEP-55, no spec)", () => {
  const byReason = (r: string) => Object.entries(prov.reasons).filter(([, v]) => v === r).map(([h]) => decodeWasm(new Uint8Array(readFileSync(join(fx, "wasm", `${h}.wasm`)))));
  for (const d of byReason("no contractspecv0")) assert.equal(d.spec.present, false);
  for (const d of byReason("declares events")) assert.ok(d.spec.entries.some((e) => Object.keys(e as object)[0] === "event_v0"));
  for (const d of byReason("SEP-58 build fields")) assert.ok(d.meta.sep58);
  for (const d of byReason("SEP-55 source_repo")) assert.ok(d.meta.sep55.source_repo);
  for (const d of byReason("SEP-47 sep meta")) assert.ok(d.meta.seps.length > 0);
});

test("XDR parsers read captured getLedgerEntries rows", () => {
  const le = JSON.parse(readFileSync(join(fx, "ledger-entries.json"), "utf8")) as { keys: string[]; wasmContract: string; sac: string; codeHash: string; result: { entries: { key: string; xdr: string }[] } };
  const byKey = new Map(le.result.entries.map((e) => [e.key, e.xdr]));
  const inst = parseInstanceEntry(byKey.get(le.keys[0] as string) as string);
  assert.equal(inst.executable, "wasm");
  assert.match(inst.wasm ?? "", /^[0-9a-f]{64}$/);
  assert.equal(parseInstanceEntry(byKey.get(le.keys[1] as string) as string).executable, "stellar_asset");
  const code = parseCodeEntry(byKey.get(le.keys[2] as string) as string);
  assert.ok(code);
  assert.equal(code.hash, le.codeHash);
  assert.equal(sha256Hex(code.code), le.codeHash);
  assert.equal(parseCodeEntry(byKey.get(le.keys[0] as string) as string), undefined);
});

test("offline catalog build over the fixture harvest", () => {
  const out = join(root, "out", "test-catalog");
  rmSync(out, { recursive: true, force: true });
  const h = JSON.parse(readFileSync(join(fx, "harvest.json"), "utf8")) as Harvest;
  const { rows, coverage } = buildCatalog({ harvestDir: fx, outDir: out, typecheck: true, compareSdk: true });
  assert.equal(rows.length, h.hashes.length);
  for (const r of rows) {
    const dir = join(out, "catalog", r.hash);
    assert.ok(existsSync(join(dir, "spec.json")), r.hash);
    assert.ok(existsSync(join(dir, "README.md")), r.hash);
    assert.equal(existsSync(join(dir, "bindings.ts")), r.spec === true, r.hash);
    if (r.bindings) assert.equal(r.typecheck, "pass", `${r.hash}: ${r.typecheckErrors.join("; ")}`);
  }
  assert.equal(coverage.hashes.decodedBlobs, rows.length);
  assert.equal(coverage.sections.specPresent, rows.filter((r) => r.spec).length);
  assert.ok(coverage.duplicates.sameInterface.groupsWithDuplicates >= 1, "the two same-interface fixtures group together");
  assert.ok((coverage.bindings.sdkGenerator?.fail ?? 0) >= 1, "the SDK-generator failure fixture still fails");
  const idx = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as { format: string; hashes: unknown[] };
  assert.equal(idx.format, "sik.wasm-catalog.index/v1");
  assert.match(readFileSync(join(out, "COVERAGE.md"), "utf8"), /## Near-duplicates/);
  const grouped = rows.filter((r) => prov.reasons[r.hash] === "same-interface group");
  const readme = readFileSync(join(out, "catalog", (grouped[0] as { hash: string }).hash, "README.md"), "utf8");
  assert.ok(readme.includes((grouped[1] as { hash: string }).hash), "README links its same-interface sibling");
  rmSync(out, { recursive: true, force: true });
});
