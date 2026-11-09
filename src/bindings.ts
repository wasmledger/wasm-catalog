// SPDX-License-Identifier: Apache-2.0
// TypeScript bindings generator built on @stellar/stellar-sdk's contract.Spec /
// contract.Client. One self-contained bindings.ts per wasm hash.
//
// The spec section is untrusted input, and its names and docs end up in source
// code someone may compile. So: identifiers are checked against a strict
// pattern and renamed when they fail, property keys are quoted, every string
// literal goes through JSON.stringify, and doc text cannot close its comment.
import type { DecodedWasm } from "./decode.ts";
import { buildModel, isTupleStruct, type EnumEntry, type EventEntry, type FnEntry, type SpecModel, type TypeJson } from "./specmodel.ts";

export const GENERATOR_ID = "@sik/wasm-catalog bindings v1";

export type BindingsResult = { source: string; diagnostics: string[] };

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Words that cannot be a bare type/const name (JS reserved words plus TS built-in type names).
const RESERVED = new Set(
  (
    "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield " +
    "implements interface let package private protected public static async await constructor " +
    "any unknown never undefined string number boolean bigint object symbol type declare namespace module keyof readonly infer is asserts satisfies"
  ).split(" "),
);

// Names the generated file declares or imports itself, plus the globals it uses
// (shadowing any other global, such as Error, is harmless here).
const TAKEN = new Set(
  "Client Map Array Uint8Array Promise Errors contract u32 i32 u64 i64 u128 i128 u256 i256 Timepoint Duration WASM_HASH SPEC_XDR EVENTS".split(" "),
);

// Instance members of contract.Client (and Object.prototype) that a contract
// method of the same name would shadow at runtime.
const CLIENT_MEMBERS = new Set(
  "spec options txFromJson txFromJSON txFromXDR constructor toString toLocaleString valueOf hasOwnProperty isPrototypeOf propertyIsEnumerable __proto__ __defineGetter__ __defineSetter__ __lookupGetter__ __lookupSetter__".split(" "),
);

/** What @stellar/stellar-sdk's contract.Client does to a method name before assigning it (bindings/utils sanitizeIdentifier). */
export function sdkMethodName(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (RESERVED_SDK.has(s)) return `${s}_`;
  if (/^\d/.test(s)) return `_${s}`;
  if (s === "" || /^_+$/.test(s)) return "_unnamed";
  return s;
}
const RESERVED_SDK = new Set(
  "break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield enum implements interface let package private protected public static async await constructor null true false".split(" "),
);

export function propKey(raw: string): string {
  return IDENT.test(raw) ? raw : JSON.stringify(raw);
}

export function jsDoc(text: string, indent = ""): string {
  const t = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/\*\//g, "*\\/")
    .trim();
  if (t === "") return "";
  return `${indent}/**\n${t
    .split("\n")
    .map((l) => `${indent} *${l ? ` ${l}` : ""}`.trimEnd())
    .join("\n")}\n${indent} */\n`;
}

class Names {
  private readonly used = new Set<string>(TAKEN);
  private readonly byRaw = new Map<string, string>();
  private readonly diags: string[];
  constructor(diags: string[]) {
    this.diags = diags;
  }
  declare(raw: string, what: string, suffix = ""): string {
    const key = `${what}:${raw}`;
    const existing = this.byRaw.get(key);

    let base = `${raw}${suffix}`;
    if (!IDENT.test(base) || RESERVED.has(base)) {
      base = base.replace(/[^A-Za-z0-9_$]/g, "_");
      if (/^\d/.test(base) || base === "") base = `_${base}`;
    }
    let name = base;
    for (let i = 2; this.used.has(name) || RESERVED.has(name); i++) name = `${base}_${i}`;
    if (name !== `${raw}${suffix}`) this.diags.push(`${existing !== undefined ? "duplicate " : ""}${what} ${JSON.stringify(`${raw}${suffix}`)} emitted as ${name}`);
    this.used.add(name);
    if (existing === undefined) this.byRaw.set(key, name);
    return name;
  }
  udt(raw: string): string | undefined {
    return this.byRaw.get(`type:${raw}`);
  }
}

type Ctx = { names: Names; diags: string[]; usedAliases: Set<string> };

const SCALAR_TS: Record<string, string> = {
  val: "any",
  bool: "boolean",
  void: "null",
  error: "contract.ErrorMessage",
  u32: "u32",
  i32: "i32",
  u64: "u64",
  i64: "i64",
  timepoint: "Timepoint",
  duration: "Duration",
  u128: "u128",
  i128: "i128",
  u256: "u256",
  i256: "i256",
  bytes: "Uint8Array",
  string: "string",
  symbol: "string",
  address: "string",
  muxed_address: "string",
};
const ALIASES = new Set(["u32", "i32", "u64", "i64", "u128", "i128", "u256", "i256", "Timepoint", "Duration"]);

function tsType(t: TypeJson, ctx: Ctx): string {
  if (typeof t === "string") {
    const s = SCALAR_TS[t];
    if (s === undefined) {
      ctx.diags.push(`unknown scalar type ${JSON.stringify(t)} mapped to unknown`);
      return "unknown";
    }
    if (ALIASES.has(s)) ctx.usedAliases.add(s);
    return s;
  }
  const [k] = Object.keys(t);
  const v = (k === undefined ? {} : t[k]) as Record<string, unknown>;
  switch (k) {
    case "option":
      // scValToNative turns an absent option (ScVal void) into null, not undefined.
      return `${tsType(v["value_type"] as TypeJson, ctx)} | null`;
    case "result":
      return `contract.Result<${tsType(v["ok_type"] as TypeJson, ctx)}>`;
    case "vec":
      return `Array<${tsType(v["element_type"] as TypeJson, ctx)}>`;
    case "map":
      return `Map<${tsType(v["key_type"] as TypeJson, ctx)}, ${tsType(v["value_type"] as TypeJson, ctx)}>`;
    case "tuple": {
      const ts = ((v["value_types"] as TypeJson[] | undefined) ?? []).map((x) => tsType(x, ctx));
      return ts.length === 0 ? "void" : `readonly [${ts.join(", ")}]`;
    }
    case "bytes_n":
      return "Uint8Array";
    case "udt": {
      const raw = String(v["name"] ?? "");
      const n = ctx.names.udt(raw);
      if (n === undefined) {
        ctx.diags.push(`reference to undeclared type ${JSON.stringify(raw)} mapped to unknown`);
        return "unknown";
      }
      return n;
    }
    default:
      ctx.diags.push(`unknown type form ${JSON.stringify(k)} mapped to unknown`);
      return "unknown";
  }
}

function enumConst(e: EnumEntry, name: string): string[] {
  const out = [jsDoc(e.doc).trimEnd(), `export const ${name} = {`];
  for (const c of e.cases) {
    const d = jsDoc(c.doc, "  ").trimEnd();
    if (d) out.push(d);
    out.push(`  ${propKey(c.name)}: ${c.value},`);
  }
  out.push("} as const;", `export type ${name} = (typeof ${name})[keyof typeof ${name}];`, "");
  return out.filter((l) => l !== "");
}

function eventInterface(ev: EventEntry, name: string, ctx: Ctx): string[] {
  const out = [jsDoc(ev.doc).trimEnd(), `export interface ${name} {`];
  out.push(`  readonly prefixTopics: readonly [${ev.prefixTopics.map((t) => JSON.stringify(t)).join(", ")}];`);
  for (const p of ev.params) {
    const d = jsDoc(p.doc, "  ").trimEnd();
    if (d) out.push(d);
    out.push(`  /** location: ${p.location.replace(/\*\//g, "*\\/").replace(/[^\x20-\x7e]/g, "?")} */`);
    out.push(`  ${propKey(p.name)}: ${tsType(p.type, ctx)};`);
  }
  out.push("}");
  return out.filter((l) => l !== "");
}

function method(f: FnEntry, ctx: Ctx): string[] {
  const name = sdkMethodName(f.name);
  const ret = f.outputs.length === 0 ? "null" : f.outputs.length === 1 ? tsType(f.outputs[0] as TypeJson, ctx) : `readonly [${f.outputs.map((o) => tsType(o, ctx)).join(", ")}]`;
  const args = f.inputs.map((i) => `${propKey(i.name)}: ${tsType(i.type, ctx)}`).join("; ");
  const params = f.inputs.length === 0 ? "options?: contract.MethodOptions" : `args: { ${args} }, options?: contract.MethodOptions`;
  const doc = jsDoc(f.doc, "  ").trimEnd();
  return [...(doc ? [doc] : []), `  ${propKey(name)}(${params}): Promise<contract.AssembledTransaction<${ret}>>;`];
}

function render(d: DecodedWasm, m: SpecModel, diags: string[]): string {
  const names = new Names(diags);
  const ctx: Ctx = { names, diags, usedAliases: new Set() };
  // Declare every type name first so references resolve whatever the entry order.
  const typeNames = new Map<object, string>();
  for (const e of [...m.structs, ...m.unions, ...m.enums]) typeNames.set(e, names.declare(e.name, "type"));
  for (const e of m.errors) typeNames.set(e, names.declare(e.name, "type"));

  const body: string[] = [];
  for (const s of m.structs) {
    const n = typeNames.get(s) as string;
    const doc = jsDoc(s.doc).trimEnd();
    if (doc) body.push(doc);
    if (isTupleStruct(s)) body.push(`export type ${n} = readonly [${s.fields.map((f) => tsType(f.type, ctx)).join(", ")}];`, "");
    else {
      body.push(`export interface ${n} {`);
      for (const f of s.fields) {
        const fd = jsDoc(f.doc, "  ").trimEnd();
        if (fd) body.push(fd);
        body.push(`  ${propKey(f.name)}: ${tsType(f.type, ctx)};`);
      }
      body.push("}", "");
    }
  }
  for (const u of m.unions) {
    const n = typeNames.get(u) as string;
    const doc = jsDoc(u.doc).trimEnd();
    if (doc) body.push(doc);
    const arms = u.cases.map((c) => `{ tag: ${JSON.stringify(c.name)}; values: ${c.types === null ? "void" : `readonly [${c.types.map((t) => tsType(t, ctx)).join(", ")}]`} }`);
    body.push(`export type ${n} =${arms.length === 0 ? " never" : `\n  | ${arms.join("\n  | ")}`};`, "");
  }
  for (const e of m.enums) body.push(...enumConst(e, typeNames.get(e) as string), "");
  for (const e of m.errors) body.push(...enumConst(e, typeNames.get(e) as string), "");

  // Merged error map, keyed by code, as contract.Client's errorTypes expects.
  const codes = new Map<number, string>();
  for (const e of m.errors)
    for (const c of e.cases) {
      const prev = codes.get(c.value);
      if (prev === undefined) codes.set(c.value, c.name);
      else if (prev !== c.name) diags.push(`error code ${c.value} declared twice (${JSON.stringify(prev)} kept, ${JSON.stringify(c.name)} dropped)`);
    }
  body.push("/** Contract error codes and their names, from the spec's error enums. */", "export const Errors = {");
  for (const [code, name] of [...codes.entries()].sort((a, b) => a[0] - b[0])) body.push(`  ${code}: { message: ${JSON.stringify(name)} },`);
  body.push("} as const;", "");

  for (const ev of m.events) {
    const raw = /event$/i.test(ev.name) ? ev.name : `${ev.name}Event`;
    body.push(...eventInterface(ev, names.declare(raw, "event"), ctx), "");
  }
  body.push(
    "/** Declared events (name, topic prefix, param locations) for building getEvents filters. */",
    `export const EVENTS = ${JSON.stringify(
      m.events.map((ev) => ({ name: ev.name, prefixTopics: ev.prefixTopics, dataFormat: ev.dataFormat, params: ev.params.map((p) => ({ name: p.name, location: p.location })) })),
      null,
      2,
    )} as const;`,
    "",
  );

  const methods: string[] = [];
  const seen = new Set<string>();
  for (const f of m.functions) {
    if (f.name === "__constructor") {
      methods.push(`  // __constructor(${f.inputs.map((i) => JSON.stringify(i.name)).join(", ")}) runs at deploy time; contract.Client does not expose it.`);
      continue;
    }
    const mn = sdkMethodName(f.name);
    if (CLIENT_MEMBERS.has(mn)) {
      diags.push(`function ${JSON.stringify(f.name)} collides with contract.Client member ${mn}; left out of the typed interface`);
      continue;
    }
    if (seen.has(mn)) {
      diags.push(`function ${JSON.stringify(f.name)} maps to method ${mn} which already exists; left out`);
      continue;
    }
    seen.add(mn);
    methods.push(...method(f, ctx));
  }
  for (const u of m.unknown) diags.push(`unrecognised spec entry kind ${JSON.stringify(Object.keys((u.raw ?? {}) as object)[0] ?? "?")} skipped`);

  const aliases = [...ctx.usedAliases].sort();
  const head = [
    `// Generated by ${GENERATOR_ID} from Soroban wasm ${d.hash}.`,
    "// Input: the wasm's contractspecv0 section, which is untrusted on-chain data. Names were",
    "// checked and doc text escaped, but review this file before depending on it. Do not edit.",
    'import { contract } from "@stellar/stellar-sdk";',
    ...(aliases.length ? [`import type { ${aliases.join(", ")} } from "@stellar/stellar-sdk/contract";`] : []),
    "",
    `export const WASM_HASH = ${JSON.stringify(d.hash)};`,
    "",
    "/** The spec entries (base64 XDR) this file was generated from. */",
    `export const SPEC_XDR: readonly string[] = ${JSON.stringify(d.spec.entriesXdr, null, 2)};`,
    "",
  ];
  const client = [
    "export interface Client {",
    ...methods,
    "}",
    "",
    "/** Typed client. Methods are created at runtime by contract.Client from SPEC_XDR. */",
    "export class Client extends contract.Client {",
    "  constructor(options: contract.ClientOptions) {",
    "    super(new contract.Spec([...SPEC_XDR]), options);",
    "  }",
    "}",
    "",
  ];
  return [...head, ...body, ...client].join("\n");
}

/** Generate bindings for a decoded wasm. Returns undefined when there is no decodable spec. */
export function generateBindings(d: DecodedWasm): BindingsResult | undefined {
  if (!d.spec.sdkDecodes || d.spec.entries.length === 0) return undefined;
  const diagnostics: string[] = [];
  const source = render(d, buildModel(d.spec.entries), diagnostics);
  return { source, diagnostics };
}
