// SPDX-License-Identifier: Apache-2.0
// Compare three TypeScript binding generators on OUR OWN synthetic fixtures only:
//   ours (src/bindings.ts), @stellar/stellar-sdk BindingGenerator (in-process),
//   and the installed stellar CLI (`stellar contract bindings typescript --wasm`).
// The CLI is never pointed at third-party (mainnet) wasm. Output: census/binding-comparison.{json,md}
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BindingGenerator, contract } from "@stellar/stellar-sdk";
import { generateBindings } from "../src/bindings.ts";
import { typecheckTree } from "../src/catalog.ts";
import { decodeWasm } from "../src/decode.ts";
import { prettyJson } from "../src/json.ts";

const root = join(import.meta.dirname, "..");
const FIXTURES = ["full.wasm", "adversarial.wasm"]; // allowlist: our own files
const work = join(root, "out", "compare");
rmSync(work, { recursive: true, force: true });

const cliVersion = spawnSync("stellar", ["--version"], { encoding: "utf8" }).stdout?.split("\n")[0]?.trim() ?? "not installed";
type Row = { fixture: string; generator: string; generated: boolean; typecheck: string; errors: string[]; notes: string[] };
const rows: Row[] = [];

for (const f of FIXTURES) {
  const path = join(root, "fixtures", "synthetic", f);
  const d = decodeWasm(new Uint8Array(readFileSync(path)));
  const key = d.hash;

  const ours = generateBindings(d);
  mkdirSync(join(work, "ours", key), { recursive: true });
  if (ours) writeFileSync(join(work, "ours", key, "bindings.ts"), ours.source);
  const tOurs = typecheckTree(join(work, "ours"), "*/bindings.ts", [key]);
  rows.push({ fixture: f, generator: "wasm-catalog", generated: !!ours, typecheck: tOurs.pass.has(key) ? "pass" : "fail", errors: tOurs.fail.get(key) ?? [], notes: ours?.diagnostics ?? [] });

  const sdkDir = join(work, "sdk", key);
  mkdirSync(sdkDir, { recursive: true });
  try {
    const g = BindingGenerator.fromSpec(new contract.Spec(d.spec.entriesXdr)).generate({ contractName: "fixture" });
    writeFileSync(join(sdkDir, "types.ts"), g.types);
    writeFileSync(join(sdkDir, "client.ts"), g.client);
    writeFileSync(join(sdkDir, "index.ts"), g.index);
    const t = typecheckTree(join(work, "sdk"), "*/*.ts", [key]);
    rows.push({ fixture: f, generator: "sdk BindingGenerator", generated: true, typecheck: t.pass.has(key) ? "pass" : "fail", errors: t.fail.get(key) ?? [], notes: g.diagnostics.map((x) => `${x.rawName} -> ${x.interfaceName}`) });
  } catch (e) {
    rows.push({ fixture: f, generator: "sdk BindingGenerator", generated: false, typecheck: "n/a", errors: [(e as Error).message.slice(0, 200)], notes: [] });
  }

  const cliDir = join(work, "cli", key);
  const r = spawnSync("stellar", ["contract", "bindings", "typescript", "--wasm", path, "--output-dir", cliDir, "--overwrite"], { encoding: "utf8", timeout: 120_000 });
  if (r.status === 0) {
    const t = typecheckTree(join(work, "cli"), "*/src/index.ts", [key], ["node"]);
    const src = readFileSync(join(cliDir, "src", "index.ts"), "utf8");
    const notes: string[] = [];
    if (/weird_name/.test(src)) notes.push('struct field / argument "weird name" renamed to weird_name (runtime keys use the spec name)');
    if (!/Event\b/.test(src)) notes.push("no event types emitted");
    rows.push({ fixture: f, generator: `stellar CLI (${cliVersion})`, generated: true, typecheck: t.pass.has(key) ? "pass" : "fail", errors: t.fail.get(key) ?? [], notes });
  } else rows.push({ fixture: f, generator: `stellar CLI (${cliVersion})`, generated: false, typecheck: "n/a", errors: [(r.stderr || r.error?.message || "").slice(0, 200)], notes: [] });
}

mkdirSync(join(root, "census"), { recursive: true });
writeFileSync(join(root, "census", "binding-comparison.json"), prettyJson({ generatedAt: new Date().toISOString(), cliVersion, fixtures: FIXTURES, rows }));
const md = [
  "# Binding generators on our synthetic fixtures",
  "",
  `Generated ${new Date().toISOString()} by \`scripts/compare-bindings.ts\`. Fixtures are our own (\`fixtures/synthetic\`, made by \`scripts/make-synthetic.ts\`); the stellar CLI is run on them only. Type-check: \`tsc --strict\`, TypeScript 7, against @stellar/stellar-sdk 17.4.`,
  "",
  "| Fixture | Generator | tsc | First errors | Notes |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.fixture} | ${r.generator} | ${r.typecheck} | ${r.errors.slice(0, 2).join("; ").replace(/\|/g, "\\|").slice(0, 160)} | ${r.notes.slice(0, 4).join("; ").replace(/\|/g, "\\|").slice(0, 200)} |`),
  "",
];
writeFileSync(join(root, "census", "binding-comparison.md"), md.join("\n"));
console.log(md.join("\n"));
