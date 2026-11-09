// SPDX-License-Identifier: Apache-2.0
// Markdown page for one wasm hash. All names, docs and meta values come from an
// untrusted blob: they are only ever placed inside code spans or fenced code
// blocks (never rendered as Markdown or HTML), and the fences are sized so the
// content cannot close them.
import type { DecodedWasm } from "./decode.ts";
import { buildModel, isTupleStruct, rustType, type EnumEntry, type FnEntry, type SpecModel, type TypeJson } from "./specmodel.ts";

export type PageContext = {
  /** Contract ids seen running this hash (may be truncated by the caller). */
  contracts: string[];
  contractCount: number;
  /** Where the hash was first seen (harvest source names). */
  sources: string[];
  /** Other hashes in the catalog with an identical interface (docs and order ignored). */
  sameInterface: string[];
  /** Other hashes with identical code once custom sections are stripped. */
  sameCode: string[];
  /** Bindings outcome, if known. */
  bindings?: { generated: boolean; diagnostics: string[] };
  generator: string;
};

const MAX_INLINE = 160;

/** Inline code span safe inside a GFM table cell. */
export function mdCode(s: string): string {
  let t = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/`/g, "\u02cb").replace(/\|/g, "\\|");
  if (t.length > MAX_INLINE) t = `${t.slice(0, MAX_INLINE)}…`;
  if (t.trim() === "") return "(empty)";
  return `\`${t}\``;
}

/** Fenced block whose fence is longer than any backtick run in the content. */
export function fenced(text: string, lang = "text"): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  const body = text.replace(/\r\n?/g, "\n").replace(/[\u2028\u2029]/g, "\n");
  return `${fence}${lang}\n${body}\n${fence}`;
}

function fnSignature(f: FnEntry): string {
  const args = f.inputs.map((i) => `${i.name}: ${rustType(i.type)}`).join(", ");
  const ret = f.outputs.length === 0 ? "" : ` -> ${f.outputs.map(rustType).join(", ")}`;
  return `fn ${f.name}(${args})${ret}`;
}

function docBlock(doc: string): string[] {
  return doc.trim() === "" ? [] : [fenced(doc.trim()), ""];
}

function enumTable(e: EnumEntry): string[] {
  const rows = e.cases.map((c) => `| ${c.value} | ${mdCode(c.name)} | ${c.doc.trim() === "" ? "" : mdCode(c.doc.trim())} |`);
  return ["| Value | Name | Doc |", "|---|---|---|", ...rows, ""];
}

function typesSection(m: SpecModel): string[] {
  const out: string[] = [];
  if (m.structs.length + m.unions.length + m.enums.length === 0) return out;
  out.push("## Types", "");
  for (const s of m.structs) {
    out.push(`### struct ${mdCode(s.name)}`, "", ...docBlock(s.doc));
    if (isTupleStruct(s)) out.push(`Tuple struct: ${mdCode(`(${s.fields.map((f) => rustType(f.type)).join(", ")})`)}`, "");
    else {
      out.push("| Field | Type | Doc |", "|---|---|---|");
      for (const f of s.fields) out.push(`| ${mdCode(f.name)} | ${mdCode(rustType(f.type))} | ${f.doc.trim() === "" ? "" : mdCode(f.doc.trim())} |`);
      out.push("");
    }
  }
  for (const u of m.unions) {
    out.push(`### union ${mdCode(u.name)}`, "", ...docBlock(u.doc), "| Case | Payload | Doc |", "|---|---|---|");
    for (const c of u.cases) out.push(`| ${mdCode(c.name)} | ${c.types === null ? "" : mdCode(`(${c.types.map((t: TypeJson) => rustType(t)).join(", ")})`)} | ${c.doc.trim() === "" ? "" : mdCode(c.doc.trim())} |`);
    out.push("");
  }
  for (const e of m.enums) out.push(`### enum ${mdCode(e.name)}`, "", ...docBlock(e.doc), ...enumTable(e));
  return out;
}

function fmtEnv(d: DecodedWasm): string {
  if (!d.envMeta.present) return "absent";
  if (d.envMeta.error) return `undecodable (${mdCode(d.envMeta.error)})`;
  return d.envMeta.entries.map((e) => `protocol ${e.protocol}${e.preRelease ? ` (pre-release ${e.preRelease})` : ""}`).join(", ") || "empty";
}

function shortList(xs: string[], max = 10): string {
  if (xs.length === 0) return "none";
  const shown = xs.slice(0, max).map((x) => mdCode(x)).join(", ");
  return xs.length > max ? `${shown} and ${xs.length - max} more` : shown;
}

export function renderReadme(d: DecodedWasm, ctx: PageContext): string {
  const m = buildModel(d.spec.entries);
  const out: string[] = [];
  out.push(`# Soroban wasm ${mdCode(d.hash)}`, "");
  out.push(
    "> Generated from on-chain data by " + ctx.generator + ". Every name, doc string and meta value below is copied from the wasm's custom sections, which anyone can write; they are shown inside code spans and blocks and have not been reviewed.",
    "",
  );
  out.push("| Property | Value |", "|---|---|");
  out.push(`| Size | ${d.size} bytes |`);
  out.push(`| Code sha256 (custom sections stripped) | ${d.codeSha256 ? mdCode(d.codeSha256) : "n/a"} |`);
  out.push(`| Spec | ${d.spec.present ? `${d.spec.entries.length} entries in ${d.spec.sectionCount} section(s), ${d.spec.bytes} bytes` : "absent"} |`);
  if (d.spec.sha256) out.push(`| Spec sha256 | ${mdCode(d.spec.sha256)} |`);
  if (d.spec.interfaceSha256) out.push(`| Interface sha256 (docs and order ignored) | ${mdCode(d.spec.interfaceSha256)} |`);
  out.push(`| Decodes with @stellar/stellar-sdk | spec ${d.spec.present ? (d.spec.sdkDecodes ? "yes" : "no") : "n/a"}; \`Spec.fromWasm\` ${d.spec.present ? (d.spec.sdkFromWasm ? "yes" : "no") : "n/a"}; meta ${d.meta.present ? (d.meta.sdkDecodes ? "yes" : "no") : "n/a"}; env meta ${d.envMeta.present ? (d.envMeta.sdkDecodes ? "yes" : "no") : "n/a"} |`);
  out.push(`| Env interface version | ${fmtEnv(d)} |`);
  out.push(`| soroban-sdk (rssdkver) | ${d.meta.sdkVersion ? mdCode(d.meta.sdkVersion) : "not recorded"} |`);
  out.push(`| Rust (rsver) | ${d.meta.rustVersion ? mdCode(d.meta.rustVersion) : "not recorded"} |`);
  out.push(`| stellar-cli (cliver) | ${d.meta.cliVersion ? mdCode(d.meta.cliVersion) : "not recorded"} |`);
  out.push(`| SEP-47 \`sep\` | ${d.meta.seps.length ? d.meta.seps.map(mdCode).join(", ") : "none declared"} |`);
  out.push(`| SEP-55 source_repo / home_domain | ${d.meta.sep55.source_repo ? mdCode(d.meta.sep55.source_repo) : "none"} / ${d.meta.sep55.home_domain ? mdCode(d.meta.sep55.home_domain) : "none"} |`);
  out.push(`| SEP-58 build fields | ${d.meta.sep58 ? (d.meta.sep58.conformant ? "present, formats conform" : `present, issues: ${d.meta.sep58.issues.map(mdCode).join("; ")}`) : "none"} |`);
  out.push(`| Contracts seen running it | ${ctx.contractCount} (${shortList(ctx.contracts, 5)}) |`);
  out.push(`| Harvest sources | ${ctx.sources.map(mdCode).join(", ") || "none"} |`);
  out.push(`| Same interface as | ${shortList(ctx.sameInterface)} |`);
  out.push(`| Same code as | ${shortList(ctx.sameCode)} |`);
  if (ctx.bindings) out.push(`| TypeScript bindings | ${ctx.bindings.generated ? "[bindings.ts](bindings.ts)" : "not generated"}${ctx.bindings.diagnostics.length ? `; ${ctx.bindings.diagnostics.length} diagnostic(s), see below` : ""} |`);
  out.push("");
  if (d.wasmError) out.push("## Wasm parse error", "", fenced(d.wasmError), "");
  if (d.spec.error) out.push("## Spec decode error", "", fenced(d.spec.error), "");

  if (m.functions.length > 0) {
    out.push("## Functions", "");
    for (const f of m.functions) out.push(`### ${mdCode(f.name)}`, "", fenced(fnSignature(f), "rust"), "", ...docBlock(f.doc));
  }
  out.push(...typesSection(m));
  if (m.errors.length > 0) {
    out.push("## Errors", "");
    for (const e of m.errors) out.push(`### ${mdCode(e.name)}`, "", ...docBlock(e.doc), ...enumTable(e));
  }
  if (m.events.length > 0) {
    out.push("## Events", "");
    for (const ev of m.events) {
      out.push(`### ${mdCode(ev.name)}`, "", ...docBlock(ev.doc));
      out.push(`Prefix topics: ${ev.prefixTopics.length ? ev.prefixTopics.map(mdCode).join(", ") : "none"}; data format: ${mdCode(ev.dataFormat)}`, "");
      if (ev.params.length) {
        out.push("| Param | Type | Location | Doc |", "|---|---|---|---|");
        for (const p of ev.params) out.push(`| ${mdCode(p.name)} | ${mdCode(rustType(p.type))} | ${mdCode(p.location)} | ${p.doc.trim() === "" ? "" : mdCode(p.doc.trim())} |`);
        out.push("");
      }
    }
  }
  if (m.unknown.length > 0) out.push("## Unrecognised spec entries", "", `${m.unknown.length} entr${m.unknown.length === 1 ? "y" : "ies"}; see spec.json.`, "");

  out.push("## Contract meta (contractmetav0)", "");
  if (!d.meta.present) out.push("Absent.", "");
  else if (d.meta.error) out.push(fenced(d.meta.error), "");
  else {
    out.push("| Key | Value |", "|---|---|");
    for (const e of d.meta.entries) out.push(`| ${mdCode(e.key)} | ${mdCode(e.val)} |`);
    out.push("");
  }
  out.push("## Custom sections", "", d.customSectionNames.length ? d.customSectionNames.map(mdCode).join(", ") : "none", "");
  if (ctx.bindings && ctx.bindings.diagnostics.length) {
    out.push("## Binding diagnostics", "");
    for (const x of ctx.bindings.diagnostics) out.push(`- ${mdCode(x)}`);
    out.push("");
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
