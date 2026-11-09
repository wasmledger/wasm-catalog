// SPDX-License-Identifier: Apache-2.0
// Small JSON helpers: canonical serialisation (sorted keys) and doc-stripping.

/** Deterministic JSON: object keys sorted, no whitespace. bigint is written as a decimal string. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "bigint") return JSON.stringify(v.toString());
    return JSON.stringify(v) ?? "null";
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** Deep copy with every `doc` key removed. */
export function stripDocs(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDocs);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== "doc") out[k] = stripDocs(x);
    return out;
  }
  return v;
}

/**
 * Order-insensitive, doc-insensitive interface key: canonical JSON of each entry
 * without docs, sorted. Two wasm with the same key expose the same functions,
 * types, errors and events, whatever their docs or entry order.
 */
export function interfaceKey(entries: unknown[]): string {
  return canonicalJson(entries.map((e) => canonicalJson(stripDocs(e))).sort());
}

/** JSON.stringify with 2-space indent and a trailing newline (for files). */
export function prettyJson(v: unknown): string {
  return `${JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x), 2)}\n`;
}

/**
 * Inverse of the SEP-51 string escape used by the SDK's JSON form of XDR strings:
 * printable ASCII passes through; `\0 \t \n \r \\` and `\xNN` encode other bytes.
 * Malformed escapes are kept literally (input is untrusted; never throw).
 */
export function sep51Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x5c && i + 1 < s.length) {
      const n = s[i + 1];
      const simple: Record<string, number> = { "0": 0, t: 9, n: 10, r: 13, "\\": 0x5c };
      if (n !== undefined && n in simple) {
        out.push(simple[n] as number);
        i++;
        continue;
      }
      if (n === "x" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
        out.push(Number.parseInt(s.slice(i + 2, i + 4), 16));
        i += 3;
        continue;
      }
    }
    if (ch < 0x80) out.push(ch);
    else for (const b of new TextEncoder().encode(s[i] as string)) out.push(b);
  }
  return Uint8Array.from(out);
}

/** SEP-51 escaped string to text (lenient UTF-8: bad sequences become U+FFFD). */
export function sep51Text(s: string): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(sep51Bytes(s));
}
