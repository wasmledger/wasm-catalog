// SPDX-License-Identifier: Apache-2.0
// Coverage and near-duplicate census over a built catalog.
import type { Harvest } from "./harvest.ts";

export type CatalogRow = {
  hash: string;
  selected: boolean;
  fetch: string | null;
  sources: string[];
  contractCount: number;
  contracts: string[];
  size: number | null;
  wasmOk: boolean | null;
  spec: boolean | null;
  specSections: number | null;
  specDecodes: boolean | null;
  specFromWasm: boolean | null;
  functions: number | null;
  types: number | null;
  errorEnums: number | null;
  events: number | null;
  meta: boolean | null;
  metaDecodes: boolean | null;
  envMeta: boolean | null;
  protocol: number | null;
  sdkVersion: string | null;
  rustVersion: string | null;
  seps: string[];
  sourceRepo: string | null;
  sep58: "conformant" | "non-conformant" | null;
  metaKeys: string[];
  specSha256: string | null;
  interfaceSha256: string | null;
  codeSha256: string | null;
  bindings: boolean | null;
  bindingDiagnostics: string[];
  typecheck: "pass" | "fail" | null;
  typecheckErrors: string[];
  sdkGenTypecheck: "pass" | "fail" | null;
  sdkGenErrors: string[];
};

type Groups = { byInterface: Map<string, string[]>; bySpec: Map<string, string[]>; byCode: Map<string, string[]> };
type TcLike = { pass: Set<string>; fail: Map<string, string[]>; ran: boolean; error?: string } | undefined;

function hist(values: (string | number | null | undefined)[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of values) {
    const k = v === null || v === undefined ? "(none)" : String(v);
    h[k] = (h[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function diagnosticClass(d: string): string {
  if (d.startsWith("duplicate ")) return "duplicate name in spec (renamed)";
  if (d.includes(" emitted as ")) return "name renamed (reserved, invalid or taken)";
  if (d.includes("undeclared type")) return "reference to a type the spec does not declare";
  if (d.startsWith("error code ")) return "same error code with two names across error enums";
  if (d.includes("collides with contract.Client")) return "function name collides with contract.Client member";
  if (d.includes("already exists")) return "two functions map to one method name";
  if (d.startsWith("unrecognised spec entry")) return "unrecognised spec entry kind";
  if (d.startsWith("unknown ")) return "unknown type form";
  return "other";
}

function groupStats(g: Map<string, string[]>, rows: Map<string, CatalogRow>) {
  const multi = [...g.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return {
    distinct: g.size,
    groupsWithDuplicates: multi.length,
    hashesInDuplicateGroups: multi.reduce((n, [, v]) => n + v.length, 0),
    largest: multi.slice(0, 15).map(([k, v]) => ({
      key: k,
      hashes: v.length,
      contracts: v.reduce((n, h) => n + (rows.get(h)?.contractCount ?? 0), 0),
      sdkVersions: [...new Set(v.map((h) => rows.get(h)?.sdkVersion ?? "(none)"))].sort(),
      sample: v.slice(0, 5),
    })),
  };
}

export function computeCoverage(harvest: Harvest, rows: CatalogRow[], groups: Groups, extra: { tc: TcLike; tcSdk: TcLike; sdkVersion: string; generator: string }) {
  const byHash = new Map(rows.map((r) => [r.hash, r]));
  const fetched = rows.filter((r) => r.wasmOk !== null);
  const c = harvest.contracts;
  const sourceCounts: Record<string, number> = {};
  for (const x of c) for (const s of x.sources) sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  const withSpec = fetched.filter((r) => r.spec);
  const diag = rows.flatMap((r) => r.bindingDiagnostics.map(diagnosticClass));
  const diagHashes: Record<string, number> = {};
  for (const r of rows) for (const k of new Set(r.bindingDiagnostics.map(diagnosticClass))) diagHashes[k] = (diagHashes[k] ?? 0) + 1;
  const tsErrCodes = (rs: CatalogRow[], pick: (r: CatalogRow) => string[]) => hist(rs.flatMap((r) => [...new Set(pick(r).map((e) => e.split(":")[0]))]));
  const contractsOnFetched = c.filter((x) => {
    const h = x.rpcWasm ?? x.seWasm ?? undefined;
    return h ? byHash.get(h)?.wasmOk === true : false;
  }).length;
  const contractsWithWasm = c.filter((x) => (x.rpcWasm ?? x.seWasm ?? null) !== null).length;
  // Same interface (docs/order ignored) but different spec bytes: docs or entry order differ.
  const sameIfaceDiffSpec = [...groups.byInterface.values()].filter((v) => new Set(v.map((h) => byHash.get(h)?.specSha256)).size > 1).length;

  return {
    format: "sik.wasm-catalog.coverage/v1",
    generatedAt: new Date().toISOString(),
    generator: extra.generator,
    sdkVersion: extra.sdkVersion,
    harvest: {
      generatedAt: harvest.generatedAt,
      rpcUrl: harvest.params.rpcUrl,
      latestLedger: harvest.provenance.latestLedger ?? null,
      oldestLedger: harvest.provenance.oldestLedger ?? null,
      sePages: harvest.provenance.sePages,
      seStrata: harvest.params.seFull ? "full walk" : harvest.params.seStrata,
      eventWindows: harvest.provenance.eventWindows.length,
      eventsRead: harvest.provenance.eventWindows.reduce((n, w) => n + Math.max(0, w.events), 0),
      selection: harvest.provenance.selection,
      net: harvest.provenance.net,
      crossCheck: { checked: harvest.crossCheck.checked, agree: harvest.crossCheck.agree, disagree: harvest.crossCheck.disagree.length, examples: harvest.crossCheck.disagree.slice(0, 5) },
    },
    contracts: {
      total: c.length,
      bySource: sourceCounts,
      seListingNoWasm: c.filter((x) => x.seWasm === null).length,
      rpcExecutable: hist(c.filter((x) => x.rpcExecutable !== undefined).map((x) => x.rpcExecutable)),
      withWasmHash: contractsWithWasm,
      runningAFetchedHash: contractsOnFetched,
    },
    hashes: {
      seen: rows.length,
      contractsPerHash: hist(rows.map((r) => (r.contractCount <= 1 ? "1" : r.contractCount < 10 ? "2-9" : r.contractCount < 100 ? "10-99" : r.contractCount < 1000 ? "100-999" : "1000+"))),
      mostUsed: [...rows].sort((a, b) => b.contractCount - a.contractCount || a.hash.localeCompare(b.hash)).slice(0, 10).map((r) => ({ hash: r.hash, contracts: r.contractCount, functions: r.functions, sdkVersion: r.sdkVersion })),
      selected: rows.filter((r) => r.selected).length,
      fetch: hist(rows.filter((r) => r.selected).map((r) => r.fetch)),
      decodedBlobs: fetched.length,
      wasmParses: fetched.filter((r) => r.wasmOk).length,
      sizeBytes: { min: Math.min(...fetched.map((r) => r.size ?? Infinity)), max: Math.max(...fetched.map((r) => r.size ?? 0)), total: fetched.reduce((n, r) => n + (r.size ?? 0), 0) },
    },
    sections: {
      specPresent: withSpec.length,
      specDecodesSdk: fetched.filter((r) => r.specDecodes).length,
      specFromWasmSdk: fetched.filter((r) => r.specFromWasm).length,
      specMultiSection: fetched.filter((r) => (r.specSections ?? 0) > 1).length,
      specEmpty: fetched.filter((r) => r.spec && (r.functions ?? 0) === 0).length,
      withEvents: fetched.filter((r) => (r.events ?? 0) > 0).length,
      metaPresent: fetched.filter((r) => r.meta).length,
      metaDecodesSdk: fetched.filter((r) => r.metaDecodes).length,
      envMetaPresent: fetched.filter((r) => r.envMeta).length,
      protocols: hist(fetched.map((r) => r.protocol)),
      sdkMajor: hist(fetched.map((r) => (r.sdkVersion ? r.sdkVersion.split(".")[0] : null))),
      sdkVersions: hist(fetched.map((r) => r.sdkVersion)),
      metaKeys: hist(fetched.flatMap((r) => r.metaKeys)),
      sep47Declared: fetched.filter((r) => r.seps.length > 0).length,
      sep47Seps: hist(fetched.flatMap((r) => r.seps)),
      sep55SourceRepo: fetched.filter((r) => r.sourceRepo).length,
      sep58: hist(fetched.filter((r) => r.sep58).map((r) => r.sep58)),
    },
    bindings: {
      generated: rows.filter((r) => r.bindings).length,
      withDiagnostics: rows.filter((r) => r.bindingDiagnostics.length > 0).length,
      diagnosticsByClass: hist(diag),
      hashesByDiagnosticClass: Object.fromEntries(Object.entries(diagHashes).sort((a, b) => b[1] - a[1])),
      typecheck: extra.tc ? { ran: extra.tc.ran, pass: rows.filter((r) => r.typecheck === "pass").length, fail: rows.filter((r) => r.typecheck === "fail").length, errorCodes: tsErrCodes(rows, (r) => r.typecheckErrors), error: extra.tc.error ?? null } : null,
      sdkGenerator: extra.tcSdk
        ? { ran: extra.tcSdk.ran, pass: rows.filter((r) => r.sdkGenTypecheck === "pass").length, fail: rows.filter((r) => r.sdkGenTypecheck === "fail").length, errorCodes: tsErrCodes(rows, (r) => r.sdkGenErrors), error: extra.tcSdk.error ?? null }
        : null,
    },
    duplicates: {
      sameInterface: groupStats(groups.byInterface, byHash),
      sameSpecBytes: groupStats(groups.bySpec, byHash),
      sameCodeModuloCustomSections: groupStats(groups.byCode, byHash),
      sameInterfaceDifferentSpecBytes: sameIfaceDiffSpec,
    },
  };
}

export type Coverage = ReturnType<typeof computeCoverage>;

function table(h: Record<string, number>, head: [string, string], max = 20): string[] {
  const rows = Object.entries(h).slice(0, max);
  const more = Object.keys(h).length - rows.length;
  return [`| ${head[0]} | ${head[1]} |`, "|---|---|", ...rows.map(([k, v]) => `| ${k.replace(/\|/g, "\\|").replace(/`/g, "'").slice(0, 80)} | ${v} |`), ...(more > 0 ? [`| (${more} more) | |`] : []), ""];
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);

export function renderCoverage(cv: Coverage): string {
  const f = cv.hashes.decodedBlobs;
  const s = cv.sections;
  const o: string[] = [];
  o.push("# Wasm catalog coverage", "");
  o.push(`Generated ${cv.generatedAt} by ${cv.generator}. Harvest ${cv.harvest.generatedAt}, RPC ${cv.harvest.rpcUrl}, ledgers ${cv.harvest.oldestLedger}..${cv.harvest.latestLedger}.`, "");
  o.push("## Method", "");
  o.push(
    `- stellar.expert contract listing: ${cv.harvest.sePages} page(s) of up to 200, ${typeof cv.harvest.seStrata === "number" ? `starting at ${cv.harvest.seStrata} cursors spread evenly over the contract-id keyspace (a stratified sample of all contracts; ids are hashes, so the order is uniform)` : "full walk"}.`,
    `- stellar.expert top contracts by invocations, then RPC instance lookup.`,
    `- RPC getEvents: ${cv.harvest.eventWindows} windows over the retention window, ${cv.harvest.eventsRead} events read, then RPC instance lookup.`,
    `- Cross-check of the stellar.expert wasm field against RPC instance lookups: ${cv.harvest.crossCheck.agree}/${cv.harvest.crossCheck.checked} agree.`,
    `- Selection: ${cv.harvest.selection}.`,
    "- Wasm fetched by hash with RPC getLedgerEntries (CONTRACT_CODE), falling back to stellar.expert `/wasm/{hash}`; sha256 checked on every blob. Blobs are parsed, never executed.",
    "",
  );
  o.push("## Headline", "", "| Measure | Count | Share |", "|---|---|---|");
  o.push(`| Contracts in the harvest | ${cv.contracts.total} | |`);
  o.push(`| ... with a wasm hash | ${cv.contracts.withWasmHash} | ${pct(cv.contracts.withWasmHash, cv.contracts.total)} |`);
  o.push(`| ... running a hash we decoded | ${cv.contracts.runningAFetchedHash} | ${pct(cv.contracts.runningAFetchedHash, cv.contracts.withWasmHash)} of those with a hash |`);
  o.push(`| Distinct wasm hashes seen | ${cv.hashes.seen} | |`);
  o.push(`| Selected for fetch | ${cv.hashes.selected} | |`);
  o.push(`| Fetched and hash-verified | ${f} | ${pct(f, cv.hashes.selected)} of selected |`);
  o.push(`| Wasm parses | ${cv.hashes.wasmParses} | ${pct(cv.hashes.wasmParses, f)} |`);
  o.push(`| Has contractspecv0 | ${s.specPresent} | ${pct(s.specPresent, f)} |`);
  o.push(`| Spec decodes with @stellar/stellar-sdk ${cv.sdkVersion} (\`new Spec(bytes)\`) | ${s.specDecodesSdk} | ${pct(s.specDecodesSdk, s.specPresent)} of specs |`);
  o.push(`| \`Spec.fromWasm\` succeeds | ${s.specFromWasmSdk} | ${pct(s.specFromWasmSdk, s.specPresent)} of specs |`);
  o.push(`| Spec split over more than one section | ${s.specMultiSection} | |`);
  o.push(`| Declares events (SEP-48 event_v0) | ${s.withEvents} | ${pct(s.withEvents, f)} |`);
  o.push(`| Has contractmetav0 | ${s.metaPresent} | ${pct(s.metaPresent, f)} |`);
  o.push(`| Meta decodes with the SDK | ${s.metaDecodesSdk} | ${pct(s.metaDecodesSdk, s.metaPresent)} of meta |`);
  o.push(`| Has contractenvmetav0 | ${s.envMetaPresent} | ${pct(s.envMetaPresent, f)} |`);
  o.push(`| Declares SEP-47 \`sep\` | ${s.sep47Declared} | ${pct(s.sep47Declared, f)} |`);
  o.push(`| SEP-55 \`source_repo\` | ${s.sep55SourceRepo} | ${pct(s.sep55SourceRepo, f)} |`);
  o.push(`| SEP-58 build fields (any) | ${Object.values(s.sep58).reduce((a, b) => a + b, 0)} | ${pct(Object.values(s.sep58).reduce((a, b) => a + b, 0), f)} |`);
  o.push(`| Bindings generated | ${cv.bindings.generated} | |`);
  if (cv.bindings.typecheck) o.push(`| Bindings type-check (tsc --strict) | ${cv.bindings.typecheck.pass} pass / ${cv.bindings.typecheck.fail} fail | |`);
  if (cv.bindings.sdkGenerator) o.push(`| SDK BindingGenerator output type-checks | ${cv.bindings.sdkGenerator.pass} pass / ${cv.bindings.sdkGenerator.fail} fail | |`);
  o.push("");
  o.push("## Near-duplicates", "");
  const d = cv.duplicates;
  o.push("| Grouping | Distinct keys | Groups with 2+ hashes | Hashes in those groups |", "|---|---|---|---|");
  o.push(`| Same interface (spec with docs removed, entry order ignored) | ${d.sameInterface.distinct} | ${d.sameInterface.groupsWithDuplicates} | ${d.sameInterface.hashesInDuplicateGroups} |`);
  o.push(`| Same spec bytes | ${d.sameSpecBytes.distinct} | ${d.sameSpecBytes.groupsWithDuplicates} | ${d.sameSpecBytes.hashesInDuplicateGroups} |`);
  o.push(`| Same code once custom sections are stripped | ${d.sameCodeModuloCustomSections.distinct} | ${d.sameCodeModuloCustomSections.groupsWithDuplicates} | ${d.sameCodeModuloCustomSections.hashesInDuplicateGroups} |`);
  o.push("", `Interface groups whose members differ only in docs or entry order: ${d.sameInterfaceDifferentSpecBytes}.`, "");
  o.push("Largest same-interface groups:", "", "| Interface sha256 | Hashes | Contracts in harvest | soroban-sdk versions |", "|---|---|---|---|");
  for (const g of d.sameInterface.largest) o.push(`| \`${g.key.slice(0, 16)}\` | ${g.hashes} | ${g.contracts} | ${g.sdkVersions.join(", ").slice(0, 80)} |`);
  o.push("");
  o.push("## Binding diagnostics (our generator)", "", ...table(cv.bindings.hashesByDiagnosticClass, ["Class", "Hashes affected"]));
  if (cv.bindings.typecheck && Object.keys(cv.bindings.typecheck.errorCodes).length) o.push("tsc error codes in our bindings (hashes affected):", "", ...table(cv.bindings.typecheck.errorCodes, ["Code", "Hashes"]));
  if (cv.bindings.sdkGenerator && Object.keys(cv.bindings.sdkGenerator.errorCodes).length) o.push("tsc error codes in the SDK BindingGenerator output (hashes affected):", "", ...table(cv.bindings.sdkGenerator.errorCodes, ["Code", "Hashes"]));
  o.push("## Distributions (decoded blobs)", "");
  o.push("Env interface protocol:", "", ...table(s.protocols, ["Protocol", "Hashes"]));
  o.push("soroban-sdk major (rssdkver):", "", ...table(s.sdkMajor, ["Major", "Hashes"]));
  o.push("Meta keys:", "", ...table(s.metaKeys, ["Key", "Hashes"], 30));
  if (Object.keys(s.sep47Seps).length) o.push("SEP-47 declared SEPs:", "", ...table(s.sep47Seps, ["SEP", "Hashes"]));
  o.push("Contracts per hash (in this harvest):", "", ...table(cv.hashes.contractsPerHash, ["Contracts", "Hashes"]));
  o.push("Most-used hashes:", "", "| Hash | Contracts | Functions | soroban-sdk |", "|---|---|---|---|", ...cv.hashes.mostUsed.map((m) => `| \`${m.hash.slice(0, 16)}\` | ${m.contracts} | ${m.functions ?? "n/a"} | ${m.sdkVersion ?? "n/a"} |`), "");
  o.push("Fetch outcome (selected hashes):", "", ...table(cv.hashes.fetch, ["Outcome", "Hashes"]));
  o.push("Contracts by source:", "", ...table(cv.contracts.bySource, ["Source", "Contracts"]));
  if (Object.keys(cv.contracts.rpcExecutable).length) o.push("Executable per RPC instance lookup:", "", ...table(cv.contracts.rpcExecutable, ["Executable", "Contracts"]));
  return `${o.join("\n").trimEnd()}\n`;
}
