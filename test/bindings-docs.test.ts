// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateBindings, jsDoc, propKey, sdkMethodName } from "../src/bindings.ts";
import { typecheckTree } from "../src/catalog.ts";
import { decodeWasm } from "../src/decode.ts";
import { fenced, mdCode, renderReadme } from "../src/docs.ts";
import { rustType } from "../src/specmodel.ts";

const root = join(import.meta.dirname, "..");
const syn = (n: string) => decodeWasm(new Uint8Array(readFileSync(join(root, "fixtures", "synthetic", n))));
const ctx = { contracts: [], contractCount: 0, sources: ["test"], sameInterface: [], sameCode: [], generator: "test" };

test("helpers: property keys, SDK method names, JSDoc escaping", () => {
  assert.equal(propKey("amount"), "amount");
  assert.equal(propKey("class"), "class");
  assert.equal(propKey("weird name"), '"weird name"');
  assert.equal(propKey('a"b'), '"a\\"b"');
  assert.equal(sdkMethodName("delete"), "delete_");
  assert.equal(sdkMethodName("a-b"), "a_b");
  assert.equal(sdkMethodName("1x"), "_1x");
  assert.equal(sdkMethodName("--"), "_unnamed");
  const d = jsDoc("x */ y z");
  assert.ok(!d.slice(3, -3).includes("*/"), "comment cannot be closed early");
  assert.equal(d.split("\n").length, 5);
});

test("bindings for the full fixture cover every type form", () => {
  const b = generateBindings(syn("full.wasm"));
  assert.ok(b);
  assert.deepEqual(b.diagnostics, []);
  const s = b.source;
  assert.match(s, /everything\(args: \{ a: boolean; b: i32; c: u64; d: i128; e: u256; f: i256; g: Timepoint; h: Duration; i: Uint8Array; j: Uint8Array \}/);
  assert.match(s, /AssembledTransaction<readonly \[string, string, string, string\]>/);
  assert.match(s, /containers\(args: \{ v: Array<Point>; m: Map<string, u32 \| null> \}.*AssembledTransaction<contract\.Result<Kind>>/);
  assert.match(s, /result_unit\(options\?: contract\.MethodOptions\): Promise<contract\.AssembledTransaction<contract\.Result<void>>>/);
  assert.match(s, /export type Pair = readonly \[u32, Point\];/);
  assert.match(s, /\| \{ tag: "Line"; values: readonly \[Point, Point\] \}/);
  assert.match(s, /export const Kind = \{\n  A: 0,/);
  assert.match(s, /1: \{ message: "NotFound" \}/);
  assert.match(s, /export interface TransferEvent \{\n  readonly prefixTopics: readonly \["transfer"\];/);
  assert.match(s, /__constructor\("admin"\) runs at deploy time/);
  assert.ok(!/^\s+__constructor\(/m.test(s), "constructor is not a client method");
});

test("hostile spec names and docs are neutralised and reported", () => {
  const b = generateBindings(syn("adversarial.wasm"));
  assert.ok(b);
  const s = b.source;
  // No doc text escapes its comment.
  for (const block of s.match(/\/\*\*[\s\S]*?\*\//g) ?? []) assert.ok(!block.includes("console.log('pwned');\n"), block);
  assert.ok(!s.includes("*/ console.log"), "comment terminator from spec text must be escaped");
  for (const want of [
    'function "spec" collides with contract.Client member spec',
    'function "options" collides with contract.Client member options',
    'function "toString" collides with contract.Client member toString',
    'function "a_b" maps to method a_b which already exists; left out',
    'reference to undeclared type "NotDeclared" mapped to unknown',
    'type "Client" emitted as Client_2',
    'type "class" emitted as class_2',
    'type "Promise" emitted as Promise_2',
    'duplicate type "Dup" emitted as Dup_2',
    'type "Bad*/Name" emitted as Bad__Name',
    'error code 1 declared twice ("One" kept, "Uno" dropped)',
  ])
    assert.ok(b.diagnostics.some((d) => d.startsWith(want)), `missing diagnostic: ${want}\n${b.diagnostics.join("\n")}`);
  assert.match(s, /delete_\(args: \{ class: u32; "weird name": u32 \}/, "runtime keys kept verbatim");
  assert.match(s, /constructor_\(options/);
  assert.match(s, /uses_missing\(args: \{ x: unknown \}.*AssembledTransaction<Client_2>>/);
});

test("no bindings without a decodable spec", () => {
  assert.equal(generateBindings(syn("no-spec.wasm")), undefined);
  assert.equal(generateBindings(syn("over-limit.wasm")), undefined);
  assert.ok(generateBindings(syn("multi-spec.wasm")));
});

test("generated bindings type-check under tsc --strict", () => {
  const dir = join(root, "out", "test-typecheck");
  rmSync(dir, { recursive: true, force: true });
  const hashes: string[] = [];
  for (const n of ["full.wasm", "adversarial.wasm", "multi-spec.wasm"]) {
    const d = syn(n);
    const b = generateBindings(d);
    assert.ok(b);
    mkdirSync(join(dir, d.hash), { recursive: true });
    writeFileSync(join(dir, d.hash, "bindings.ts"), b.source);
    hashes.push(d.hash);
  }
  // A deliberately broken file proves the checker reports failures per hash.
  const broken = "f".repeat(64);
  mkdirSync(join(dir, broken), { recursive: true });
  writeFileSync(join(dir, broken, "bindings.ts"), "export const x: number = 'nope';\n");
  const r = typecheckTree(dir, "*/bindings.ts", [...hashes, broken]);
  assert.equal(r.ran, true);
  assert.deepEqual([...r.fail.keys()], [broken]);
  for (const h of hashes) assert.ok(r.pass.has(h), `${h} failed: ${r.fail.get(h)?.join("; ")}`);
  rmSync(dir, { recursive: true, force: true });
});

test("Markdown helpers keep untrusted text inert", () => {
  assert.equal(mdCode("a|b`c\nd"), "`a\\|bˋc d`");
  assert.equal(mdCode(""), "(empty)");
  assert.ok(mdCode("x".repeat(500)).length < 200);
  const f = fenced("has ``` and ```` inside");
  assert.ok(f.startsWith("`````text\n"), f);
  assert.equal(rustType({ map: { key_type: "symbol", value_type: { option: { value_type: { bytes_n: { n: 32 } } } } } }), "Map<Symbol, Option<BytesN<32>>>");
  assert.equal(rustType({ tuple: { value_types: ["u32"] } }), "(u32,)");
});

test("README for the adversarial fixture renders no live HTML or links", () => {
  const md = renderReadme(syn("adversarial.wasm"), { ...ctx, bindings: { generated: true, diagnostics: ["x"] } });
  // Remove fenced blocks, then inline code spans; nothing HTML-like or link-like may remain.
  const outside = md
    .replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1$/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/^> /gm, "");
  assert.ok(!/[<>]/.test(outside), outside);
  assert.ok(!/\]\(javascript:/.test(outside));
  assert.match(md, /SEP-58 build fields \| present, issues:/);
  assert.match(md, /Env interface version \| protocol 22 \(pre-release 1\)/);
});

test("README for the full fixture lists functions, types, errors, events and meta", () => {
  const md = renderReadme(syn("full.wasm"), { ...ctx, sameInterface: ["ab".repeat(32)] });
  for (const h of ["## Functions", "## Types", "## Errors", "## Events", "## Contract meta (contractmetav0)", "fn transfer(from: Address, to: Address, amount: i128)", "### struct `Point`", "### union `Shape`", "### enum `Kind`", "Prefix topics: `moved`, `point`; data format: `map`", "| SEP-47 `sep` | `40`, `41`, `47` |"])
    assert.ok(md.includes(h), `missing ${h}`);
  assert.ok(md.includes("Move `amount` from `from` to `to`.\nEmits a transfer event."), "docs are unescaped from SEP-51 and kept verbatim in a fence");
});
