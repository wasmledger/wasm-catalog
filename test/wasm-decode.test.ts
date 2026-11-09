// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decodeEnvMetaStream, decodeMetaStream, decodeWasm, interpretSep58 } from "../src/decode.ts";
import { sep51Bytes, sep51Text } from "../src/json.ts";
import { encodeMeta, sectionOnlyWasm } from "../src/specenc.ts";
import { customSections, MAX_WASM_BYTES, parseWasm, WasmParseError } from "../src/wasm.ts";

const syn = (n: string) => new Uint8Array(readFileSync(join(import.meta.dirname, "..", "fixtures", "synthetic", n)));

test("parseWasm lists custom sections and rejects malformed blobs", () => {
  const p = parseWasm(syn("full.wasm"));
  assert.deepEqual(
    p.sections.map((s) => s.name),
    ["contractenvmetav0", "contractmetav0", "contractmetav0", "contractspecv0"],
  );
  assert.equal(customSections(p, "contractmetav0").length, 2);
  assert.throws(() => parseWasm(syn("truncated.wasm")), WasmParseError);
  assert.throws(() => parseWasm(syn("not-wasm.wasm")), /bad magic/);
  assert.throws(() => parseWasm(Uint8Array.from([0, 0x61, 0x73, 0x6d, 2, 0, 0, 0])), /version/);
  assert.throws(() => parseWasm(Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 14, 0])), /unknown section id 14/);
  // LEB128 that never terminates.
  assert.throws(() => parseWasm(Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f])), /LEB128/);
  // Custom section name that is not UTF-8.
  assert.throws(() => parseWasm(Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 2, 1, 0xff])), /not UTF-8/);
  assert.throws(() => parseWasm(new Uint8Array(MAX_WASM_BYTES + 1)), /cap/);
});

test("codeSha256 ignores custom sections", () => {
  // Both fixtures have no code sections, so only the header is hashed.
  assert.equal(parseWasm(syn("full.wasm")).codeSha256, parseWasm(syn("no-spec.wasm")).codeSha256);
  assert.notEqual(parseWasm(syn("full.wasm")).sha256, parseWasm(syn("no-spec.wasm")).sha256);
});

test("decodeWasm reads spec, merged meta and env meta from the full fixture", () => {
  const d = decodeWasm(syn("full.wasm"));
  assert.equal(d.wasmError, undefined);
  assert.equal(d.spec.present, true);
  assert.equal(d.spec.entries.length, 14);
  assert.equal(d.spec.sdkDecodes, true);
  assert.equal(d.spec.sdkFromWasm, true);
  assert.equal(d.meta.entries.length, 9, "entries from both contractmetav0 sections");
  assert.equal(d.meta.sdkDecodes, true);
  assert.deepEqual(d.meta.seps, ["40", "41", "47"]);
  assert.equal(d.meta.sdkVersion, "25.3.2");
  assert.equal(d.meta.rustVersion, "1.89.0");
  assert.deepEqual(d.meta.sep55, { source_repo: "github:example/synthetic", home_domain: "example.com" });
  assert.equal(d.meta.sep58?.conformant, true);
  assert.deepEqual(d.envMeta.entries, [{ protocol: 25, preRelease: 0 }]);
});

test("interface hash ignores docs and entry order; spec hash does not", () => {
  const a = decodeWasm(syn("full.wasm"));
  const b = decodeWasm(syn("full-nodocs.wasm"));
  assert.equal(a.spec.interfaceSha256, b.spec.interfaceSha256);
  assert.notEqual(a.spec.sha256, b.spec.sha256);
  assert.notEqual(a.hash, b.hash);
});

test("spec split over two sections decodes by concatenation; Spec.fromWasm rejects it", () => {
  const d = decodeWasm(syn("multi-spec.wasm"));
  assert.equal(d.spec.sectionCount, 2);
  assert.equal(d.spec.sdkDecodes, true);
  assert.equal(d.spec.entries.length, 14);
  assert.equal(d.spec.sdkFromWasm, false);
  assert.match(d.spec.sdkFromWasmError ?? "", /at most one/);
});

test("failures are recorded, not thrown", () => {
  const over = decodeWasm(syn("over-limit.wasm"));
  assert.equal(over.spec.present, true);
  assert.equal(over.spec.sdkDecodes, false);
  assert.match(over.spec.error ?? "", /length/);
  const trail = decodeWasm(syn("trailing-garbage.wasm"));
  assert.equal(trail.spec.sdkDecodes, false);
  const none = decodeWasm(syn("no-spec.wasm"));
  assert.equal(none.spec.present, false);
  assert.equal(none.meta.present, true);
  const bad = decodeWasm(syn("not-wasm.wasm"));
  assert.match(bad.wasmError ?? "", /magic/);
  const trunc = decodeWasm(syn("truncated.wasm"));
  assert.match(trunc.wasmError ?? "", /past end/);
});

test("meta and env-meta stream decoders", () => {
  const m = decodeMetaStream(encodeMeta([{ key: "a", val: "bcd" }, { key: "sep", val: "41" }]));
  assert.deepEqual(m.entries, [{ key: "a", val: "bcd" }, { key: "sep", val: "41" }]);
  assert.equal(m.sdkDecodes, true);
  assert.throws(() => decodeMetaStream(Uint8Array.from([0, 0, 0, 1])), /unknown ScMetaKind/);
  assert.throws(() => decodeMetaStream(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 9, 1])), /runs past end/);
  assert.deepEqual(decodeEnvMetaStream(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 23, 0, 0, 0, 2])).entries, [{ protocol: 23, preRelease: 2 }]);
  // A meta section with an unknown kind is recorded as an error on the blob.
  const d = decodeWasm(sectionOnlyWasm([{ name: "contractmetav0", payload: Uint8Array.from([0, 0, 0, 7]) }]));
  assert.match(d.meta.error ?? "", /ScMetaKind 7/);
});

test("SEP-58 interpretation flags format problems", () => {
  const bad = interpretSep58([{ key: "bldimg", val: "stellar/stellar-cli:latest" }, { key: "bldopt", val: "optimize" }]);
  assert.equal(bad?.conformant, false);
  assert.ok(bad?.issues.some((i) => i.startsWith("bldimg")));
  assert.ok(bad?.issues.some((i) => i.startsWith("bldopt")));
  assert.ok(bad?.issues.some((i) => i.includes("source_sha256")));
  assert.equal(interpretSep58([{ key: "rsver", val: "1" }]), undefined);
});

test("SEP-51 unescape", () => {
  assert.equal(sep51Text("a\\nb\\tc\\\\d"), "a\nb\tc\\d");
  assert.equal(sep51Text("caf\\xc3\\xa9"), "café");
  assert.deepEqual([...sep51Bytes("\\0\\x0")], [0, 0x5c, 0x78, 0x30], "malformed \\x kept literally");
});
