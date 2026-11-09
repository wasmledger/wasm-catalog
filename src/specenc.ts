// SPDX-License-Identifier: Apache-2.0
// Minimal XDR encoder for SEP-48 spec entries in the SDK's JSON form, plus a
// builder for section-only Wasm modules. Used to make synthetic test fixtures
// (no Rust build needed) and checked by round-trip against the SDK decoder.
// Field limits are NOT enforced here on purpose, so fixtures can break them.
import { sep51Bytes } from "./json.ts";

class W {
  private parts: number[] = [];
  u32(v: number): this {
    this.parts.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }
  str(s: string | Uint8Array): this {
    const b = typeof s === "string" ? new TextEncoder().encode(s) : s;
    this.u32(b.byteLength);
    for (const x of b) this.parts.push(x);
    for (let i = 0; i < (4 - (b.byteLength % 4)) % 4; i++) this.parts.push(0);
    return this;
  }
  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

const SCALAR: Record<string, number> = {
  val: 0, bool: 1, void: 2, error: 3, u32: 4, i32: 5, u64: 6, i64: 7, timepoint: 8, duration: 9,
  u128: 10, i128: 11, u256: 12, i256: 13, bytes: 14, string: 16, symbol: 17, address: 19, muxed_address: 20,
};

type J = Record<string, unknown>;
const o = (v: unknown): J => (v ?? {}) as J;
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// JSON-form strings are SEP-51 escaped; encode their raw bytes.
const s = (v: unknown): Uint8Array => sep51Bytes(typeof v === "string" ? v : "");

function typeDef(w: W, t: unknown): void {
  if (typeof t === "string") {
    const n = SCALAR[t];
    if (n === undefined) throw new Error(`unknown scalar ${t}`);
    w.u32(n);
    return;
  }
  const [k] = Object.keys(o(t));
  const v = o(o(t)[k as string]);
  switch (k) {
    case "option":
      w.u32(1000);
      typeDef(w, v["value_type"]);
      return;
    case "result":
      w.u32(1001);
      typeDef(w, v["ok_type"]);
      typeDef(w, v["error_type"]);
      return;
    case "vec":
      w.u32(1002);
      typeDef(w, v["element_type"]);
      return;
    case "map":
      w.u32(1004);
      typeDef(w, v["key_type"]);
      typeDef(w, v["value_type"]);
      return;
    case "tuple": {
      w.u32(1005);
      const ts = a(v["value_types"]);
      w.u32(ts.length);
      for (const x of ts) typeDef(w, x);
      return;
    }
    case "bytes_n":
      w.u32(1006).u32(Number(v["n"]));
      return;
    case "udt":
      w.u32(2000).str(s(v["name"]));
      return;
    default:
      throw new Error(`unknown type form ${String(k)}`);
  }
}

const LOCATION: Record<string, number> = { data: 0, topic_list: 1 };
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const DATA_FORMAT: Record<string, number> = { single_value: 0, vec: 1, map: 2 };

/** Encode one spec entry (SDK JSON form) to XDR. */
export function encodeSpecEntry(entry: unknown): Uint8Array {
  const w = new W();
  const [k] = Object.keys(o(entry));
  const v = o(o(entry)[k as string]);
  switch (k) {
    case "function_v0": {
      w.u32(0).str(s(v["doc"])).str(s(v["name"]));
      const ins = a(v["inputs"]);
      w.u32(ins.length);
      for (const i of ins) {
        w.str(s(o(i)["doc"])).str(s(o(i)["name"]));
        typeDef(w, o(i)["type"]);
      }
      const outs = a(v["outputs"]);
      w.u32(outs.length);
      for (const t of outs) typeDef(w, t);
      break;
    }
    case "udt_struct_v0": {
      w.u32(1).str(s(v["doc"])).str(s(v["lib"])).str(s(v["name"]));
      const fs = a(v["fields"]);
      w.u32(fs.length);
      for (const f of fs) {
        w.str(s(o(f)["doc"])).str(s(o(f)["name"]));
        typeDef(w, o(f)["type"]);
      }
      break;
    }
    case "udt_union_v0": {
      w.u32(2).str(s(v["doc"])).str(s(v["lib"])).str(s(v["name"]));
      const cs = a(v["cases"]);
      w.u32(cs.length);
      for (const c of cs) {
        const [ck] = Object.keys(o(c));
        const cv = o(o(c)[ck as string]);
        if (ck === "void_v0") w.u32(0).str(s(cv["doc"])).str(s(cv["name"]));
        else {
          w.u32(1).str(s(cv["doc"])).str(s(cv["name"]));
          const ts = a(cv["type"]);
          w.u32(ts.length);
          for (const t of ts) typeDef(w, t);
        }
      }
      break;
    }
    case "udt_enum_v0":
    case "udt_error_enum_v0": {
      w.u32(k === "udt_enum_v0" ? 3 : 4).str(s(v["doc"])).str(s(v["lib"])).str(s(v["name"]));
      const cs = a(v["cases"]);
      w.u32(cs.length);
      for (const c of cs) w.str(s(o(c)["doc"])).str(s(o(c)["name"])).u32(Number(o(c)["value"]));
      break;
    }
    case "event_v0": {
      w.u32(5).str(s(v["doc"])).str(s(v["lib"])).str(s(v["name"]));
      const pt = a(v["prefix_topics"]);
      w.u32(pt.length);
      for (const t of pt) w.str(s(t));
      const ps = a(v["params"]);
      w.u32(ps.length);
      for (const p of ps) {
        w.str(s(o(p)["doc"])).str(s(o(p)["name"]));
        typeDef(w, o(p)["type"]);
        w.u32(LOCATION[txt(o(p)["location"])] ?? 0);
      }
      w.u32(DATA_FORMAT[txt(v["data_format"])] ?? 0);
      break;
    }
    default:
      throw new Error(`unknown entry kind ${String(k)}`);
  }
  return w.bytes();
}

export function encodeSpec(entries: unknown[]): Uint8Array {
  const parts = entries.map(encodeSpecEntry);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export function encodeMeta(entries: { key: string; val: string }[]): Uint8Array {
  const w = new W();
  for (const e of entries) w.u32(0).str(e.key).str(e.val);
  return w.bytes();
}

export function encodeEnvMeta(protocol: number, preRelease = 0): Uint8Array {
  return new W().u32(0).u32(protocol).u32(preRelease).bytes();
}

function leb(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

/** A Wasm module made only of custom sections (valid wasm; no code). */
export function sectionOnlyWasm(sections: { name: string; payload: Uint8Array }[]): Uint8Array {
  const bytes: number[] = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
  for (const sec of sections) {
    const name = new TextEncoder().encode(sec.name);
    const body = [...leb(name.byteLength), ...name, ...sec.payload];
    bytes.push(0, ...leb(body.length), ...body);
  }
  return Uint8Array.from(bytes);
}
