// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const cli = (...args: string[]) => spawnSync(process.execPath, [join(root, "src", "cli.ts"), ...args], { encoding: "utf8" });

test("wct decode prints JSON and exits 0; non-wasm exits 1", () => {
  const ok = cli("decode", join(root, "fixtures", "synthetic", "full.wasm"));
  assert.equal(ok.status, 0, ok.stderr);
  const d = JSON.parse(ok.stdout) as { spec: { entries: unknown[]; entriesXdr?: unknown } };
  assert.equal(d.spec.entries.length, 14);
  assert.equal(d.spec.entriesXdr, undefined);
  assert.equal(cli("decode", join(root, "fixtures", "synthetic", "not-wasm.wasm")).status, 1);
});

test("wct page writes the three per-hash files", () => {
  const out = join(root, "out", "test-page");
  rmSync(out, { recursive: true, force: true });
  const r = cli("page", join(root, "fixtures", "synthetic", "full.wasm"), "--out", out);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["spec.json", "README.md", "bindings.ts"]) assert.ok(existsSync(join(out, f)), f);
  assert.match(readFileSync(join(out, "README.md"), "utf8"), /^# Soroban wasm `[0-9a-f]{64}`/);
  rmSync(out, { recursive: true, force: true });
});

test("wct with no command prints usage and exits 2", () => {
  const r = cli();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /wct harvest/);
});
