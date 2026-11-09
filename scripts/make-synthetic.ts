// SPDX-License-Identifier: Apache-2.0
// Writes our own synthetic Wasm fixtures (custom sections only, no code) to
// fixtures/synthetic/, with a provenance file. Deterministic: re-running gives
// identical bytes. No network, no Rust build.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeEnvMeta, encodeMeta, encodeSpec, sectionOnlyWasm } from "../src/specenc.ts";

const root = join(import.meta.dirname, "..");
const dir = join(root, "fixtures", "synthetic");
mkdirSync(dir, { recursive: true });

const udt = (name: string) => ({ udt: { name } });
const fn = (name: string, inputs: [string, unknown][], outputs: unknown[], doc = "") => ({
  function_v0: { doc, name, inputs: inputs.map(([n, type]) => ({ doc: "", name: n, type })), outputs },
});

// Every type form and entry kind.
const full = [
  fn("__constructor", [["admin", "address"]], []),
  fn("version", [], ["u32"], "Contract version."),
  fn(
    "everything",
    [
      ["a", "bool"], ["b", "i32"], ["c", "u64"], ["d", "i128"], ["e", "u256"], ["f", "i256"], ["g", "timepoint"],
      ["h", "duration"], ["i", "bytes"], ["j", { bytes_n: { n: 32 } }],
    ],
    [{ tuple: { value_types: ["string", "symbol", "address", "muxed_address"] } }],
  ),
  fn("containers", [["v", { vec: { element_type: udt("Point") } }], ["m", { map: { key_type: "symbol", value_type: { option: { value_type: "u32" } } } }]], [{ result: { ok_type: udt("Kind"), error_type: "error" } }]),
  fn("any_val", [["x", "val"]], ["void"]),
  fn("result_unit", [], [{ result: { ok_type: { tuple: { value_types: [] } }, error_type: "error" } }]),
  fn("transfer", [["from", "address"], ["to", "address"], ["amount", "i128"]], [], "Move `amount` from `from` to `to`.\nEmits a transfer event."),
  { udt_struct_v0: { doc: "A point.", lib: "", name: "Point", fields: [{ doc: "x coord", name: "x", type: "i32" }, { doc: "", name: "y", type: "i32" }] } },
  { udt_struct_v0: { doc: "", lib: "", name: "Pair", fields: [{ doc: "", name: "0", type: "u32" }, { doc: "", name: "1", type: udt("Point") }] } },
  { udt_union_v0: { doc: "Shape.", lib: "", name: "Shape", cases: [{ void_v0: { doc: "", name: "Empty" } }, { tuple_v0: { doc: "", name: "Dot", type: [udt("Point")] } }, { tuple_v0: { doc: "", name: "Line", type: [udt("Point"), udt("Point")] } }] } },
  { udt_enum_v0: { doc: "", lib: "", name: "Kind", cases: [{ doc: "", name: "A", value: 0 }, { doc: "second", name: "B", value: 1 }] } },
  { udt_error_enum_v0: { doc: "", lib: "", name: "ContractError", cases: [{ doc: "", name: "NotFound", value: 1 }, { doc: "", name: "Unauthorized", value: 2 }] } },
  { event_v0: { doc: "Transfer happened.", lib: "", name: "Transfer", prefix_topics: ["transfer"], params: [{ doc: "", name: "from", type: "address", location: "topic_list" }, { doc: "", name: "to", type: "address", location: "topic_list" }, { doc: "", name: "amount", type: "i128", location: "data" }], data_format: "single_value" } },
  { event_v0: { doc: "", lib: "", name: "Moved", prefix_topics: ["moved", "point"], params: [{ doc: "", name: "p", type: udt("Point"), location: "data" }, { doc: "", name: "k", type: udt("Kind"), location: "data" }], data_format: "map" } },
];
const fullMeta = [
  { key: "rsver", val: "1.89.0" },
  { key: "rssdkver", val: "25.3.2#0000000000000000000000000000000000000000" },
  { key: "sep", val: "41,40" },
  { key: "sep", val: "47" },
  { key: "source_repo", val: "github:example/synthetic" },
  { key: "home_domain", val: "example.com" },
  { key: "bldimg", val: `docker.io/stellar/stellar-cli@sha256:${"a".repeat(64)}` },
  { key: "bldopt", val: "--optimize" },
  { key: "source_sha256", val: "b".repeat(64) },
];

// Hostile names and docs: comment breakers, Markdown/HTML, reserved words, base-class collisions, bad refs.
const evilDoc = "ends the comment */ console.log('pwned'); /* ``` <script>alert(1)</script> | pipe   line-sep [link](javascript:alert(1))";
const adversarial = [
  fn("spec", [], ["u32"], evilDoc),
  fn("options", [], ["u32"]),
  fn("toString", [], ["string"]),
  fn("constructor", [], ["u32"]),
  fn("delete", [["class", "u32"], ["weird name", "u32"]], ["bool"], evilDoc),
  fn("a-b", [], ["u32"]),
  fn("a_b", [], ["u32"]),
  fn("uses_missing", [["x", udt("NotDeclared")]], [udt("Client")]),
  { udt_struct_v0: { doc: evilDoc, lib: "", name: "Client", fields: [{ doc: evilDoc, name: "weird name", type: "u32" }, { doc: "", name: "__proto__", type: "u32" }] } },
  { udt_struct_v0: { doc: "", lib: "", name: "class", fields: [{ doc: "", name: "x", type: "u32" }] } },
  { udt_struct_v0: { doc: "", lib: "", name: "Promise", fields: [{ doc: "", name: "x", type: "u32" }] } },
  { udt_struct_v0: { doc: "", lib: "", name: "Dup", fields: [{ doc: "", name: "x", type: "u32" }] } },
  { udt_struct_v0: { doc: "", lib: "", name: "Dup", fields: [{ doc: "", name: "y", type: "u64" }] } },
  { udt_union_v0: { doc: "", lib: "", name: "Bad*/Name", cases: [{ void_v0: { doc: evilDoc, name: "Case\"Quote" } }] } },
  { udt_error_enum_v0: { doc: "", lib: "", name: "ErrA", cases: [{ doc: "", name: "One", value: 1 }] } },
  { udt_error_enum_v0: { doc: "", lib: "", name: "ErrB", cases: [{ doc: "", name: "Uno", value: 1 }] } },
];
const advMeta = [
  { key: "rsver", val: "1.89.0 | `inject`" },
  { key: "source_repo", val: "<img src=x onerror=alert(1)>" },
  { key: "bldimg", val: "stellar/stellar-cli:latest" },
];

const files: Record<string, Uint8Array> = {
  "full.wasm": sectionOnlyWasm([
    { name: "contractenvmetav0", payload: encodeEnvMeta(25) },
    { name: "contractmetav0", payload: encodeMeta(fullMeta.slice(0, 4)) },
    { name: "contractmetav0", payload: encodeMeta(fullMeta.slice(4)) },
    { name: "contractspecv0", payload: encodeSpec(full) },
  ]),
  // Same interface as full.wasm with docs removed and entry order reversed; different meta.
  "full-nodocs.wasm": sectionOnlyWasm([
    { name: "contractenvmetav0", payload: encodeEnvMeta(25) },
    { name: "contractmetav0", payload: encodeMeta([{ key: "rsver", val: "1.90.0" }]) },
    { name: "contractspecv0", payload: encodeSpec(JSON.parse(JSON.stringify(full).replace(/"doc":"[^"]*"/g, '"doc":""')).reverse()) },
  ]),
  "adversarial.wasm": sectionOnlyWasm([
    { name: "contractenvmetav0", payload: encodeEnvMeta(22, 1) },
    { name: "contractmetav0", payload: encodeMeta(advMeta) },
    { name: "contractspecv0", payload: encodeSpec(adversarial) },
  ]),
  // Spec split over two sections: valid for the concatenating decoder, rejected by Spec.fromWasm.
  "multi-spec.wasm": sectionOnlyWasm([
    { name: "contractspecv0", payload: encodeSpec(full.slice(0, 3)) },
    { name: "contractspecv0", payload: encodeSpec(full.slice(3)) },
  ]),
  "no-spec.wasm": sectionOnlyWasm([{ name: "contractmetav0", payload: encodeMeta([{ key: "rsver", val: "1.80.0" }]) }]),
  // A function input name of 40 bytes breaks the XDR string<30> limit.
  "over-limit.wasm": sectionOnlyWasm([{ name: "contractspecv0", payload: encodeSpec([fn("f", [["x".repeat(40), "u32"]], [])]) }]),
  // Trailing garbage after the last spec entry.
  "trailing-garbage.wasm": sectionOnlyWasm([{ name: "contractspecv0", payload: Uint8Array.from([...encodeSpec(full.slice(0, 2)), 0, 0, 0, 9]) }]),
};
// Section length runs past the end of the file.
const good = files["full.wasm"] as Uint8Array;
files["truncated.wasm"] = good.slice(0, good.byteLength - 7);
// Not wasm at all.
files["not-wasm.wasm"] = new TextEncoder().encode("#!/bin/sh\necho this is not wasm\n");

const provenance: Record<string, unknown> = {
  format: "sik.wasm-catalog.fixture-provenance/v1",
  kind: "synthetic",
  generator: "scripts/make-synthetic.ts (src/specenc.ts)",
  note: "Our own fixtures: Wasm modules made only of custom sections, no code. Not captured from any network.",
  files: {} as Record<string, string>,
};
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(dir, name), bytes);
  (provenance["files"] as Record<string, string>)[name] = createHash("sha256").update(bytes).digest("hex");
}
writeFileSync(join(dir, "synthetic.provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`wrote ${Object.keys(files).length} fixtures to ${dir}`);
