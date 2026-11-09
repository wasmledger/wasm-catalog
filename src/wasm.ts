// SPDX-License-Identifier: Apache-2.0
// Bounds-checked WebAssembly section walker. Wasm blobs harvested from mainnet are
// untrusted data: this module only reads the section headers and copies bytes.
// It never compiles, instantiates or executes a module.
import { createHash } from "node:crypto";

/** Largest blob we accept. Soroban's on-ledger limit is far lower (config setting). */
export const MAX_WASM_BYTES = 4 * 1024 * 1024;

export type WasmSection = {
  /** Section id (0 = custom, 1..13 = known sections). */
  id: number;
  /** Byte offset of the section id byte. */
  start: number;
  /** Byte offset one past the end of the section payload. */
  end: number;
  /** Custom section name (id 0 only). */
  name?: string;
  /** Custom section payload (after the name), id 0 only. */
  payload?: Uint8Array;
};

export type ParsedWasm = {
  sections: WasmSection[];
  /** sha256 of the whole blob: the on-ledger wasm hash. */
  sha256: string;
  /** sha256 over the header plus every non-custom section, in order. Equal for builds that differ only in custom sections (meta, spec, names). */
  codeSha256: string;
  size: number;
};

export class WasmParseError extends Error {
  override name = "WasmParseError";
}

const MAX_KNOWN_SECTION_ID = 13;

function readLeb128U32(buf: Uint8Array, offset: number, limit: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (let i = 0; i < 5; i++) {
    if (pos >= limit) throw new WasmParseError(`LEB128 runs past end at ${pos}`);
    const byte = buf[pos++] as number;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      if (value > 0xffffffff) throw new WasmParseError(`LEB128 overflow at ${offset}`);
      return [value, pos];
    }
    shift += 7;
  }
  throw new WasmParseError(`LEB128 too long at ${offset}`);
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Walk the section headers of a Wasm binary. Throws WasmParseError on any malformation. */
export function parseWasm(bytes: Uint8Array): ParsedWasm {
  if (bytes.byteLength > MAX_WASM_BYTES) throw new WasmParseError(`blob is ${bytes.byteLength} bytes, over the ${MAX_WASM_BYTES} cap`);
  if (bytes.byteLength < 8) throw new WasmParseError("blob shorter than the 8-byte header");
  const magic = [bytes[0], bytes[1], bytes[2], bytes[3]].join(",");
  if (magic !== "0,97,115,109") throw new WasmParseError("bad magic (not \\0asm)");
  const version = [bytes[4], bytes[5], bytes[6], bytes[7]].join(",");
  if (version !== "1,0,0,0") throw new WasmParseError(`unsupported wasm version bytes ${version}`);

  const sections: WasmSection[] = [];
  const code = createHash("sha256").update(bytes.subarray(0, 8));
  let pos = 8;
  while (pos < bytes.byteLength) {
    const start = pos;
    const id = bytes[pos++] as number;
    if (id > MAX_KNOWN_SECTION_ID) throw new WasmParseError(`unknown section id ${id} at ${start}`);
    const [size, payloadStart] = readLeb128U32(bytes, pos, bytes.byteLength);
    const end = payloadStart + size;
    if (end > bytes.byteLength) throw new WasmParseError(`section id ${id} at ${start} runs past end (${end} > ${bytes.byteLength})`);
    if (id === 0) {
      const [nameLen, nameStart] = readLeb128U32(bytes, payloadStart, end);
      const nameEnd = nameStart + nameLen;
      if (nameEnd > end) throw new WasmParseError(`custom section name at ${start} runs past its section`);
      let name: string;
      try {
        name = utf8.decode(bytes.subarray(nameStart, nameEnd));
      } catch {
        throw new WasmParseError(`custom section name at ${start} is not UTF-8`);
      }
      sections.push({ id, start, end, name, payload: bytes.slice(nameEnd, end) });
    } else {
      sections.push({ id, start, end });
      code.update(bytes.subarray(start, end));
    }
    pos = end;
  }
  return { sections, sha256: sha256Hex(bytes), codeSha256: code.digest("hex"), size: bytes.byteLength };
}

/** All payloads of custom sections with this name, in file order. */
export function customSections(parsed: ParsedWasm, name: string): Uint8Array[] {
  return parsed.sections.filter((s) => s.id === 0 && s.name === name).map((s) => s.payload as Uint8Array);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
