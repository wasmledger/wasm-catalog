// SPDX-License-Identifier: Apache-2.0
// A neutral view over the SDK's JSON form of SEP-48 spec entries. Every string in
// here came from an untrusted Wasm custom section; renderers must escape it.
import { sep51Text } from "./json.ts";

export type TypeJson = string | { [k: string]: unknown };

export type Field = { name: string; doc: string; type: TypeJson };
export type FnEntry = { kind: "function"; name: string; doc: string; inputs: Field[]; outputs: TypeJson[] };
export type StructEntry = { kind: "struct"; name: string; doc: string; lib: string; fields: Field[] };
export type UnionCase = { name: string; doc: string; types: TypeJson[] | null };
export type UnionEntry = { kind: "union"; name: string; doc: string; lib: string; cases: UnionCase[] };
export type EnumCase = { name: string; doc: string; value: number };
export type EnumEntry = { kind: "enum" | "error_enum"; name: string; doc: string; lib: string; cases: EnumCase[] };
export type EventParam = { name: string; doc: string; type: TypeJson; location: string };
export type EventEntry = { kind: "event"; name: string; doc: string; lib: string; prefixTopics: string[]; params: EventParam[]; dataFormat: string };
export type UnknownEntry = { kind: "unknown"; raw: unknown };
export type Entry = FnEntry | StructEntry | UnionEntry | EnumEntry | EventEntry | UnknownEntry;

export type SpecModel = {
  functions: FnEntry[];
  structs: StructEntry[];
  unions: UnionEntry[];
  enums: EnumEntry[];
  errors: EnumEntry[];
  events: EventEntry[];
  unknown: UnknownEntry[];
};

// Strings in the SDK JSON form are SEP-51 escaped (e.g. a newline is the two characters \\n).
const str = (v: unknown): string => (typeof v === "string" ? sep51Text(v) : v === undefined || v === null ? "" : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function field(v: unknown): Field {
  const o = obj(v);
  return { name: str(o["name"]), doc: str(o["doc"]), type: (o["type"] ?? "val") as TypeJson };
}

export function toEntry(json: unknown): Entry {
  const o = obj(json);
  const [kind] = Object.keys(o);
  const v = obj(kind === undefined ? undefined : o[kind]);
  switch (kind) {
    case "function_v0":
      return { kind: "function", name: str(v["name"]), doc: str(v["doc"]), inputs: arr(v["inputs"]).map(field), outputs: arr(v["outputs"]) as TypeJson[] };
    case "udt_struct_v0":
      return { kind: "struct", name: str(v["name"]), doc: str(v["doc"]), lib: str(v["lib"]), fields: arr(v["fields"]).map(field) };
    case "udt_union_v0":
      return {
        kind: "union",
        name: str(v["name"]),
        doc: str(v["doc"]),
        lib: str(v["lib"]),
        cases: arr(v["cases"]).map((c) => {
          const co = obj(c);
          const [ck] = Object.keys(co);
          const cv = obj(ck === undefined ? undefined : co[ck]);
          return { name: str(cv["name"]), doc: str(cv["doc"]), types: ck === "tuple_v0" ? (arr(cv["type"]) as TypeJson[]) : null };
        }),
      };
    case "udt_enum_v0":
    case "udt_error_enum_v0":
      return {
        kind: kind === "udt_enum_v0" ? "enum" : "error_enum",
        name: str(v["name"]),
        doc: str(v["doc"]),
        lib: str(v["lib"]),
        cases: arr(v["cases"]).map((c) => {
          const co = obj(c);
          return { name: str(co["name"]), doc: str(co["doc"]), value: Number(co["value"] ?? 0) };
        }),
      };
    case "event_v0":
      return {
        kind: "event",
        name: str(v["name"]),
        doc: str(v["doc"]),
        lib: str(v["lib"]),
        prefixTopics: arr(v["prefix_topics"]).map(str),
        params: arr(v["params"]).map((p) => {
          const po = obj(p);
          return { ...field(p), location: str(po["location"]) };
        }),
        dataFormat: str(v["data_format"]),
      };
    default:
      return { kind: "unknown", raw: json };
  }
}

export function buildModel(entries: unknown[]): SpecModel {
  const m: SpecModel = { functions: [], structs: [], unions: [], enums: [], errors: [], events: [], unknown: [] };
  for (const e of entries.map(toEntry)) {
    if (e.kind === "function") m.functions.push(e);
    else if (e.kind === "struct") m.structs.push(e);
    else if (e.kind === "union") m.unions.push(e);
    else if (e.kind === "enum") m.enums.push(e);
    else if (e.kind === "error_enum") m.errors.push(e);
    else if (e.kind === "event") m.events.push(e);
    else if (e.kind === "unknown") m.unknown.push(e);
  }
  return m;
}

const RUST_SCALARS: Record<string, string> = {
  val: "Val",
  bool: "bool",
  void: "()",
  error: "Error",
  u32: "u32",
  i32: "i32",
  u64: "u64",
  i64: "i64",
  timepoint: "Timepoint",
  duration: "Duration",
  u128: "u128",
  i128: "i128",
  u256: "U256",
  i256: "I256",
  bytes: "Bytes",
  string: "String",
  symbol: "Symbol",
  address: "Address",
  muxed_address: "MuxedAddress",
};

/** Rust-like rendering of a spec type, as the soroban-sdk author would have written it. */
export function rustType(t: TypeJson): string {
  if (typeof t === "string") return RUST_SCALARS[t] ?? `?${t}`;
  const [k] = Object.keys(t);
  const v = obj(k === undefined ? undefined : t[k]);
  switch (k) {
    case "option":
      return `Option<${rustType(v["value_type"] as TypeJson)}>`;
    case "result":
      return `Result<${rustType(v["ok_type"] as TypeJson)}, ${rustType(v["error_type"] as TypeJson)}>`;
    case "vec":
      return `Vec<${rustType(v["element_type"] as TypeJson)}>`;
    case "map":
      return `Map<${rustType(v["key_type"] as TypeJson)}, ${rustType(v["value_type"] as TypeJson)}>`;
    case "tuple": {
      const ts = arr(v["value_types"]).map((x) => rustType(x as TypeJson));
      return ts.length === 1 ? `(${ts[0]},)` : `(${ts.join(", ")})`;
    }
    case "bytes_n":
      return `BytesN<${Number(v["n"])}>`;
    case "udt":
      return str(v["name"]);
    default:
      return `?${String(k)}`;
  }
}

/** Names of user-defined types referenced (transitively, one level) by a type. */
export function udtRefs(t: TypeJson, out: Set<string> = new Set()): Set<string> {
  if (typeof t === "string") return out;
  for (const [k, v] of Object.entries(t)) {
    if (k === "udt") out.add(str(obj(v)["name"]));
    else if (Array.isArray(v)) for (const x of v) udtRefs(x as TypeJson, out);
    else if (v !== null && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) {
        if (Array.isArray(x)) for (const y of x) udtRefs(y as TypeJson, out);
        else if (x !== null && (typeof x === "object" || typeof x === "string")) udtRefs(x as TypeJson, out);
      }
    }
  }
  return out;
}

/** True when every field is named "0", "1", ... (a Rust tuple struct). */
export function isTupleStruct(s: StructEntry): boolean {
  return s.fields.length > 0 && s.fields.every((f, i) => f.name === String(i));
}
