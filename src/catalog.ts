// SPDX-License-Identifier: Apache-2.0
// Offline catalog build: harvest dir (harvest.json + wasm/) -> static tree
//   <out>/catalog/<hash>/{spec.json,README.md,bindings.ts}
//   <out>/index.json, <out>/coverage.json, <out>/COVERAGE.md
// Optionally type-checks every bindings.ts (and the SDK's own generator output,
// for comparison) with the project's pinned TypeScript.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { BindingGenerator, contract } from "@stellar/stellar-sdk";
import { generateBindings, GENERATOR_ID } from "./bindings.ts";
import { computeCoverage, renderCoverage, type CatalogRow } from "./coverage.ts";
import { decodeWasm, type DecodedWasm } from "./decode.ts";
import { renderReadme } from "./docs.ts";
import type { Harvest, HashObs } from "./harvest.ts";
import { prettyJson } from "./json.ts";
import { buildModel } from "./specmodel.ts";

export const INDEX_FORMAT = "sik.wasm-catalog.index/v1";

const require = createRequire(import.meta.url);

export function sdkVersion(): string {
  const pkgPath = join(dirname(require.resolve("@stellar/stellar-sdk")), "..", "..", "package.json");
  return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
}

export type BuildOptions = {
  harvestDir: string;
  outDir: string;
  typecheck: boolean;
  compareSdk: boolean;
  /** Contract ids listed per hash in README/index (all are counted). */
  maxContractsListed?: number;
  log?: (m: string) => void;
};

export type TypecheckResult = { pass: Set<string>; fail: Map<string, string[]>; ran: boolean; error?: string };

/** Run tsc over `<root>/<hash>/<file>` files; attribute errors to hashes by path. */
export function typecheckTree(root: string, include: string, hashes: string[], types: string[] = []): TypecheckResult {
  const res: TypecheckResult = { pass: new Set(), fail: new Map(), ran: false };
  const tsconfig = join(root, "tsconfig.json");
  writeFileSync(
    tsconfig,
    prettyJson({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true, types },
      include: [include],
    }),
  );
  let tsc: string;
  try {
    tsc = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  } catch {
    res.error = "typescript not installed";
    return res;
  }
  const r = spawnSync(process.execPath, [tsc, "-p", tsconfig, "--pretty", "false"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  rmSync(tsconfig, { force: true });
  res.ran = true;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  for (const line of out.split("\n")) {
    const m = /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
    if (!m) continue;
    const rel = relative(root, join(root, m[1] as string)).split(/[\\/]/);
    const hash = rel.find((p) => /^[0-9a-f]{64}$/.test(p));
    if (!hash) continue;
    const list = res.fail.get(hash) ?? [];
    if (list.length < 5) list.push(`${m[4]}: ${(m[5] as string).slice(0, 200)}`);
    res.fail.set(hash, list);
  }
  if (r.status !== 0 && res.fail.size === 0) res.error = out.slice(0, 500);
  for (const h of hashes) if (!res.fail.has(h)) res.pass.add(h);
  return res;
}

function groupBy(rows: { hash: string; key: string | undefined }[]): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.key) continue;
    const l = g.get(r.key) ?? [];
    l.push(r.hash);
    g.set(r.key, l);
  }
  return g;
}

export function buildCatalog(o: BuildOptions): { rows: CatalogRow[]; coverage: ReturnType<typeof computeCoverage> } {
  const log = o.log ?? (() => {});
  const harvest = JSON.parse(readFileSync(join(o.harvestDir, "harvest.json"), "utf8")) as Harvest;
  const catDir = join(o.outDir, "catalog");
  mkdirSync(catDir, { recursive: true });
  const maxListed = o.maxContractsListed ?? 50;
  const sdkv = sdkVersion();
  const generator = `@sik/wasm-catalog (${GENERATOR_ID}, @stellar/stellar-sdk ${sdkv})`;

  // 1. Decode every fetched blob.
  const decoded = new Map<string, DecodedWasm>();
  for (const h of harvest.hashes) {
    if (!h.selected) continue;
    const p = join(o.harvestDir, "wasm", `${h.hash}.wasm`);
    if (!existsSync(p)) continue;
    decoded.set(h.hash, decodeWasm(new Uint8Array(readFileSync(p))));
  }
  log(`decoded ${decoded.size} blobs`);

  // 2. Duplicate groups.
  const dRows = [...decoded.values()];
  const byInterface = groupBy(dRows.map((d) => ({ hash: d.hash, key: d.spec.interfaceSha256 })));
  const bySpec = groupBy(dRows.map((d) => ({ hash: d.hash, key: d.spec.sha256 })));
  const byCode = groupBy(dRows.map((d) => ({ hash: d.hash, key: d.codeSha256 || undefined })));

  // 3. spec.json + bindings.ts per hash.
  const bindings = new Map<string, { generated: boolean; diagnostics: string[] }>();
  for (const d of decoded.values()) {
    const dir = join(catDir, d.hash);
    mkdirSync(dir, { recursive: true });
    const { entriesXdr: _x, ...specNoXdr } = d.spec;
    writeFileSync(join(dir, "spec.json"), prettyJson({ format: "sik.wasm-catalog.spec/v1", generator, ...d, spec: specNoXdr }));
    const b = generateBindings(d);
    if (b) writeFileSync(join(dir, "bindings.ts"), b.source);
    else rmSync(join(dir, "bindings.ts"), { force: true });
    bindings.set(d.hash, { generated: b !== undefined, diagnostics: b?.diagnostics ?? [] });
  }

  // 4. Optional type-checks.
  let tc: TypecheckResult | undefined;
  let tcSdk: TypecheckResult | undefined;
  const withBindings = [...bindings.entries()].filter(([, b]) => b.generated).map(([h]) => h);
  if (o.typecheck) {
    log(`type-checking ${withBindings.length} bindings.ts files`);
    tc = typecheckTree(catDir, "*/bindings.ts", withBindings);
  }
  if (o.compareSdk) {
    const sdkDir = join(o.outDir, "sdkgen");
    rmSync(sdkDir, { recursive: true, force: true });
    const generated: string[] = [];
    const genErrors = new Map<string, string>();
    for (const d of decoded.values()) {
      if (!d.spec.sdkDecodes || d.spec.entries.length === 0) continue;
      try {
        const g = BindingGenerator.fromSpec(new contract.Spec(d.spec.entriesXdr)).generate({ contractName: `c-${d.hash.slice(0, 12)}` });
        const dir = join(sdkDir, d.hash);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "types.ts"), g.types);
        writeFileSync(join(dir, "client.ts"), g.client);
        writeFileSync(join(dir, "index.ts"), g.index);
        generated.push(d.hash);
      } catch (e) {
        genErrors.set(d.hash, (e as Error).message.slice(0, 200));
      }
    }
    if (o.typecheck) {
      log(`type-checking ${generated.length} SDK-generated packages`);
      tcSdk = typecheckTree(sdkDir, "*/*.ts", generated);
    }
    for (const [h, msg] of genErrors) {
      tcSdk ??= { pass: new Set(), fail: new Map(), ran: false };
      tcSdk.fail.set(h, [`generator threw: ${msg}`]);
    }
  }

  // 5. Rows, READMEs, index, coverage.
  const hashObs = new Map<string, HashObs>(harvest.hashes.map((h) => [h.hash, h]));
  const rows: CatalogRow[] = [];
  for (const h of harvest.hashes) {
    const d = decoded.get(h.hash);
    const m = d ? buildModel(d.spec.entries) : undefined;
    const b = bindings.get(h.hash);
    const row: CatalogRow = {
      hash: h.hash,
      selected: h.selected,
      fetch: h.fetch ?? null,
      sources: h.sources,
      contractCount: h.contracts.length,
      contracts: h.contracts.slice(0, maxListed),
      size: d?.size ?? h.size ?? null,
      wasmOk: d ? d.wasmError === undefined : null,
      spec: d ? d.spec.present : null,
      specSections: d?.spec.sectionCount ?? null,
      specDecodes: d ? d.spec.sdkDecodes : null,
      specFromWasm: d ? d.spec.sdkFromWasm : null,
      functions: m?.functions.length ?? null,
      types: m ? m.structs.length + m.unions.length + m.enums.length : null,
      errorEnums: m?.errors.length ?? null,
      events: m?.events.length ?? null,
      meta: d ? d.meta.present : null,
      metaDecodes: d ? (d.meta.present ? d.meta.sdkDecodes : null) : null,
      envMeta: d ? d.envMeta.present : null,
      protocol: d?.envMeta.entries[0]?.protocol ?? null,
      sdkVersion: d?.meta.sdkVersion ?? null,
      rustVersion: d?.meta.rustVersion ?? null,
      seps: d?.meta.seps ?? [],
      sourceRepo: d?.meta.sep55.source_repo ?? null,
      sep58: d?.meta.sep58 ? (d.meta.sep58.conformant ? "conformant" : "non-conformant") : null,
      metaKeys: d ? [...new Set(d.meta.entries.map((e) => e.key))] : [],
      specSha256: d?.spec.sha256 ?? null,
      interfaceSha256: d?.spec.interfaceSha256 ?? null,
      codeSha256: d?.codeSha256 || null,
      bindings: b?.generated ?? null,
      bindingDiagnostics: b?.diagnostics ?? [],
      typecheck: tc && b?.generated ? (tc.pass.has(h.hash) ? "pass" : "fail") : null,
      typecheckErrors: tc?.fail.get(h.hash) ?? [],
      sdkGenTypecheck: tcSdk ? (tcSdk.pass.has(h.hash) ? "pass" : tcSdk.fail.has(h.hash) ? "fail" : null) : null,
      sdkGenErrors: tcSdk?.fail.get(h.hash) ?? [],
    };
    rows.push(row);
    if (d) {
      const others = (g: Map<string, string[]>, k: string | undefined | null) => (k ? (g.get(k) ?? []).filter((x) => x !== d.hash) : []);
      writeFileSync(
        join(catDir, d.hash, "README.md"),
        renderReadme(d, {
          contracts: row.contracts,
          contractCount: row.contractCount,
          sources: (hashObs.get(d.hash) as HashObs).sources,
          sameInterface: others(byInterface, d.spec.interfaceSha256),
          sameCode: others(byCode, d.codeSha256 || undefined),
          bindings: { generated: b?.generated ?? false, diagnostics: [...(b?.diagnostics ?? []), ...(row.typecheck === "fail" ? row.typecheckErrors.map((e) => `tsc: ${e}`) : [])] },
          generator,
        }),
      );
    }
  }
  const coverage = computeCoverage(harvest, rows, { byInterface, bySpec, byCode }, { tc, tcSdk, sdkVersion: sdkv, generator });
  writeFileSync(join(o.outDir, "index.json"), prettyJson({ format: INDEX_FORMAT, generatedAt: new Date().toISOString(), generator, harvest: { generatedAt: harvest.generatedAt, latestLedger: harvest.provenance.latestLedger, selection: harvest.provenance.selection }, hashes: rows }));
  writeFileSync(join(o.outDir, "coverage.json"), prettyJson(coverage));
  writeFileSync(join(o.outDir, "COVERAGE.md"), renderCoverage(coverage));
  return { rows, coverage };
}
