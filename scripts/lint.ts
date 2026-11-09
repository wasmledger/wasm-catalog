// SPDX-License-Identifier: Apache-2.0
// Project lint (no ESLint configured; typecheck is the main gate). Checks:
//  1. SPDX Apache-2.0 header in every .ts file (after an optional shebang).
//  2. Every WCT-NNN referenced in code exists in TASKS.md.
//  3. No open-work marker (words built below) without a DLV ticket id.
//  4. No private-key material in fixtures (PEM blocks).
//  5. src/ never touches the WebAssembly API (blobs are data; they are never compiled or run).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const MARKER = new RegExp(`\\b(${["TO", "DO"].join("")}|${["FIX", "ME"].join("")}|${"X".repeat(3)})\\b`);
const problems: string[] = [];

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "out" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(p)) out.push(p);
  }
  return out;
}

const tasks = readFileSync(join(root, "TASKS.md"), "utf8");
const tickets = new Set([...tasks.matchAll(/\|\s*(WCT-\d{3})\s*\|/g)].map((m) => m[1]));

for (const file of ["src", "test", "scripts"].flatMap((d) => walk(join(root, d), /\.ts$/))) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8").replace(/^#!.*\n/, "");
  if (!text.startsWith("// SPDX-License-Identifier: Apache-2.0")) problems.push(`${rel}: missing SPDX header`);
  for (const m of text.matchAll(/WCT-\d{3}/g)) if (!tickets.has(m[0])) problems.push(`${rel}: references ${m[0]} which is not in TASKS.md`);
  if (rel.startsWith("src") && /\bWebAssembly\s*\./.test(text)) problems.push(`${rel}: uses the WebAssembly API (wasm must only be parsed)`);
  text.split("\n").forEach((line, i) => {
    if (MARKER.test(line) && !/WCT-\d{3}/.test(line)) problems.push(`${rel}:${i + 1}: open-work marker without ticket id`);
  });
}
for (const file of walk(join(root, "fixtures"), /\.(json|txt|pem|key)$/)) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(readFileSync(file, "utf8"))) problems.push(`${relative(root, file)}: private key material in fixtures`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`lint ok (${tickets.size} tickets known)`);
