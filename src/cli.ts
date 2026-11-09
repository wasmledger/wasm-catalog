#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// wct: wasm-catalog command line.
//   wct harvest [--out out/harvest] [--rpc URL] [--se-strata N | --se-full] [--no-se-top]
//               [--event-windows N] [--max-hashes N] [--cross-check N] [--no-se-wasm] [--offline] [--interval-ms 500]
//   wct build   [--harvest out/harvest] [--out out] [--typecheck] [--compare-sdk]
//   wct decode  <file.wasm>                  print the decoded sections as JSON
//   wct page    <file.wasm> --out <dir>      spec.json + README.md + bindings.ts for one blob
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateBindings } from "./bindings.ts";
import { buildCatalog } from "./catalog.ts";
import { decodeWasm } from "./decode.ts";
import { renderReadme } from "./docs.ts";
import { DEFAULT_PARAMS, Harvester } from "./harvest.ts";
import { prettyJson } from "./json.ts";
import { Net } from "./net.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const log = (m: string) => process.stderr.write(`${m}\n`);

function usage(code: number): never {
  process.stderr.write(readFileSync(import.meta.filename, "utf8").split("\n").slice(2, 9).map((l) => l.replace(/^\/\/ ?/, "")).join("\n") + "\n");
  process.exit(code);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "harvest": {
      const { values: v } = parseArgs({
        args: rest,
        options: {
          out: { type: "string", default: join(projectRoot, "out", "harvest") },
          rpc: { type: "string", default: DEFAULT_PARAMS.rpcUrl },
          "se-strata": { type: "string", default: String(DEFAULT_PARAMS.seStrata) },
          "se-full": { type: "boolean", default: false },
          "se-max-pages": { type: "string", default: String(DEFAULT_PARAMS.seMaxPages) },
          "no-se-top": { type: "boolean", default: false },
          "event-windows": { type: "string", default: String(DEFAULT_PARAMS.eventWindows) },
          "max-hashes": { type: "string", default: String(DEFAULT_PARAMS.maxHashes) },
          "cross-check": { type: "string", default: String(DEFAULT_PARAMS.crossCheck) },
          "no-se-wasm": { type: "boolean", default: false },
          offline: { type: "boolean", default: false },
          cache: { type: "string", default: join(projectRoot, ".cache") },
          "interval-ms": { type: "string", default: "500" },
        },
      });
      const net = new Net({ cacheDir: v.cache, offline: v.offline, minIntervalMs: Number(v["interval-ms"]), log });
      const h = await new Harvester(
        net,
        {
          ...DEFAULT_PARAMS,
          rpcUrl: v.rpc,
          seStrata: Number(v["se-strata"]),
          seFull: v["se-full"],
          seMaxPages: Number(v["se-max-pages"]),
          seTop: !v["no-se-top"],
          eventWindows: Number(v["event-windows"]),
          maxHashes: Number(v["max-hashes"]),
          crossCheck: Number(v["cross-check"]),
          seWasmFallback: !v["no-se-wasm"],
        },
        v.out,
        log,
      ).run();
      log(`harvest: ${h.contracts.length} contracts, ${h.hashes.length} hashes, ${h.hashes.filter((x) => x.selected).length} selected; net ${JSON.stringify(net.stats)}`);
      return 0;
    }
    case "build": {
      const { values: v } = parseArgs({
        args: rest,
        options: {
          harvest: { type: "string", default: join(projectRoot, "out", "harvest") },
          out: { type: "string", default: join(projectRoot, "out") },
          typecheck: { type: "boolean", default: false },
          "compare-sdk": { type: "boolean", default: false },
        },
      });
      const { coverage } = buildCatalog({ harvestDir: v.harvest, outDir: v.out, typecheck: v.typecheck, compareSdk: v["compare-sdk"], log });
      log(`catalog: ${coverage.hashes.decodedBlobs} decoded, ${coverage.sections.specPresent} with spec, ${coverage.bindings.generated} bindings -> ${v.out}`);
      return 0;
    }
    case "decode": {
      const file = rest[0];
      if (!file) usage(2);
      const d = decodeWasm(new Uint8Array(readFileSync(file)));
      process.stdout.write(prettyJson({ ...d, spec: { ...d.spec, entriesXdr: undefined } }));
      return d.wasmError ? 1 : 0;
    }
    case "page": {
      const { values: v, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { out: { type: "string" } } });
      const file = positionals[0];
      if (!file || !v.out) usage(2);
      const d = decodeWasm(new Uint8Array(readFileSync(file)));
      mkdirSync(v.out, { recursive: true });
      const { entriesXdr: _x, ...specNoXdr } = d.spec;
      writeFileSync(join(v.out, "spec.json"), prettyJson({ format: "sik.wasm-catalog.spec/v1", ...d, spec: specNoXdr }));
      const b = generateBindings(d);
      if (b) writeFileSync(join(v.out, "bindings.ts"), b.source);
      writeFileSync(
        join(v.out, "README.md"),
        renderReadme(d, { contracts: [], contractCount: 0, sources: ["local file"], sameInterface: [], sameCode: [], bindings: { generated: b !== undefined, diagnostics: b?.diagnostics ?? [] }, generator: "@sik/wasm-catalog" }),
      );
      return 0;
    }
    case undefined:
    case "-h":
    case "--help":
      usage(cmd === undefined ? 2 : 0);
    default:
      log(`unknown command ${cmd}`);
      usage(2);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    log(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exit(1);
  },
);
