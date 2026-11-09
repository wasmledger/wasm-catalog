// SPDX-License-Identifier: Apache-2.0
// Decode the Soroban custom sections of a Wasm blob: contractspecv0 (SEP-48),
// contractmetav0 (SEP-46 meta, with SEP-47 / SEP-55 / SEP-58 keys interpreted)
// and contractenvmetav0. Parsing only; nothing in the blob is executed.
import { contract, xdr } from "@stellar/stellar-sdk";
import { concatBytes, customSections, parseWasm, sha256Hex, WasmParseError, type ParsedWasm } from "./wasm.ts";
import { interfaceKey } from "./json.ts";

export const SPEC_SECTION = "contractspecv0";
export const META_SECTION = "contractmetav0";
export const ENV_META_SECTION = "contractenvmetav0";

export type MetaEntry = { key: string; val: string };

export type EnvMeta = { protocol: number; preRelease: number };

export type Sep58 = {
  bldimg?: string;
  bldopt: string[];
  bldarg: string[];
  source_uri?: string;
  source_sha256?: string;
  /** True when every SEP-58 field present matches the SEP's regex and source_sha256 + bldimg are both present. */
  conformant: boolean;
  issues: string[];
};

export type DecodedWasm = {
  hash: string;
  size: number;
  codeSha256: string;
  /** Names of every custom section, in file order (duplicates kept). */
  customSectionNames: string[];
  wasmError?: string;

  spec: {
    present: boolean;
    sectionCount: number;
    bytes: number;
    /** sha256 of the concatenated contractspecv0 payloads. */
    sha256?: string;
    /** sha256 of interfaceKey(entries): docs removed, entry order ignored. */
    interfaceSha256?: string;
    /** Decoded entries as the SDK's JSON form (SEP-48 shapes). */
    entries: unknown[];
    /** base64 XDR of each entry, re-encoded by the SDK (embedded in bindings). */
    entriesXdr: string[];
    /** `new contract.Spec(bytes)` on the concatenated payloads succeeded. */
    sdkDecodes: boolean;
    /** `contract.Spec.fromWasm(blob)` succeeded (fails on multi-section specs). */
    sdkFromWasm: boolean;
    error?: string;
    sdkFromWasmError?: string;
  };
  meta: {
    present: boolean;
    entries: MetaEntry[];
    /** Every entry re-decoded by the SDK's ScMetaEntry type. */
    sdkDecodes: boolean;
    error?: string;
    rustVersion?: string;
    sdkVersion?: string;
    sdkCommit?: string;
    cliVersion?: string;
    /** SEP-47 `sep` entries, merged and de-duplicated. */
    seps: string[];
    /** SEP-55 build-verification keys. */
    sep55: { source_repo?: string; home_domain?: string };
    /** SEP-58 reproducibility keys, when any is present. */
    sep58?: Sep58;
  };
  envMeta: {
    present: boolean;
    entries: EnvMeta[];
    sdkDecodes: boolean;
    error?: string;
  };
};

class XdrCursor {
  pos = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) {
    this.buf = buf;
  }
  get done(): boolean {
    return this.pos >= this.buf.byteLength;
  }
  u32(): number {
    if (this.pos + 4 > this.buf.byteLength) throw new Error(`XDR u32 runs past end at ${this.pos}`);
    const b = this.buf;
    const v = ((b[this.pos] as number) * 2 ** 24) + (((b[this.pos + 1] as number) << 16) | ((b[this.pos + 2] as number) << 8) | (b[this.pos + 3] as number));
    this.pos += 4;
    return v;
  }
  string(): string {
    const len = this.u32();
    const padded = len + ((4 - (len % 4)) % 4);
    if (this.pos + padded > this.buf.byteLength) throw new Error(`XDR string of ${len} bytes runs past end at ${this.pos}`);
    const s = new TextDecoder("utf-8", { fatal: false }).decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += padded;
    return s;
  }
  slice(from: number): Uint8Array {
    return this.buf.subarray(from, this.pos);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function decodeMetaStream(payload: Uint8Array): { entries: MetaEntry[]; sdkDecodes: boolean } {
  const c = new XdrCursor(payload);
  const entries: MetaEntry[] = [];
  let sdkDecodes = true;
  while (!c.done) {
    const from = c.pos;
    const kind = c.u32();
    if (kind !== 0) throw new Error(`unknown ScMetaKind ${kind} at ${from}`);
    const key = c.string();
    const val = c.string();
    entries.push({ key, val });
    if (!xdr.ScMetaEntry.validateXdr(c.slice(from))) sdkDecodes = false;
  }
  return { entries, sdkDecodes };
}

export function decodeEnvMetaStream(payload: Uint8Array): { entries: EnvMeta[]; sdkDecodes: boolean } {
  const c = new XdrCursor(payload);
  const entries: EnvMeta[] = [];
  let sdkDecodes = true;
  while (!c.done) {
    const from = c.pos;
    const kind = c.u32();
    if (kind !== 0) throw new Error(`unknown ScEnvMetaKind ${kind} at ${from}`);
    // Older XDR declared a uint64; current XDR a {uint32 protocol; uint32 preRelease}. Same bytes.
    const protocol = c.u32();
    const preRelease = c.u32();
    entries.push({ protocol, preRelease });
    if (!xdr.ScEnvMetaEntry.validateXdr(c.slice(from))) sdkDecodes = false;
  }
  return { entries, sdkDecodes };
}

const SEP58_RE: Record<string, RegExp> = {
  bldimg: /^(?:localhost(?::\d+)?|[^\s@/]*[.:][^\s@/]*)\/[^\s@]+@sha256:[0-9a-f]{64}$/,
  bldopt: /^--[A-Za-z][A-Za-z0-9_-]*(=.+)?$/,
  bldarg: /^.+$/,
  source_uri: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/,
  source_sha256: /^[0-9a-f]{64}$/,
};

export function interpretSep58(entries: MetaEntry[]): Sep58 | undefined {
  const rel = entries.filter((e) => e.key in SEP58_RE);
  if (rel.length === 0) return undefined;
  const out: Sep58 = { bldopt: [], bldarg: [], conformant: true, issues: [] };
  for (const e of rel) {
    const re = SEP58_RE[e.key] as RegExp;
    if (!re.test(e.val)) out.issues.push(`${e.key} does not match the SEP-58 format`);
    if (e.key === "bldopt") out.bldopt.push(e.val);
    else if (e.key === "bldarg") out.bldarg.push(e.val);
    else if (e.key === "bldimg" || e.key === "source_uri" || e.key === "source_sha256") {
      if (out[e.key] !== undefined) out.issues.push(`${e.key} appears more than once`);
      out[e.key] = e.val;
    }
  }
  if (out.source_sha256 === undefined) out.issues.push("source_sha256 (required) missing");
  if (out.bldimg === undefined) out.issues.push("bldimg missing");
  out.conformant = out.issues.length === 0;
  return out;
}

function interpretMeta(entries: MetaEntry[]): Omit<DecodedWasm["meta"], "present" | "entries" | "sdkDecodes" | "error"> {
  const get = (k: string) => entries.find((e) => e.key === k)?.val;
  const rssdk = get("rssdkver");
  const [sdkVersion, sdkCommit] = rssdk ? rssdk.split("#", 2) : [undefined, undefined];
  const seps = new Set<string>();
  for (const e of entries) if (e.key === "sep") for (const s of e.val.split(",")) if (s.trim()) seps.add(s.trim());
  const out: Omit<DecodedWasm["meta"], "present" | "entries" | "sdkDecodes" | "error"> = {
    seps: [...seps].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
    sep55: {},
  };
  const rsver = get("rsver");
  if (rsver !== undefined) out.rustVersion = rsver;
  if (sdkVersion) out.sdkVersion = sdkVersion;
  if (sdkCommit) out.sdkCommit = sdkCommit;
  const cliver = get("cliver");
  if (cliver !== undefined) out.cliVersion = cliver;
  const sr = get("source_repo");
  if (sr !== undefined) out.sep55.source_repo = sr;
  const hd = get("home_domain");
  if (hd !== undefined) out.sep55.home_domain = hd;
  const s58 = interpretSep58(entries);
  if (s58) out.sep58 = s58;
  return out;
}

/** Decode a Wasm blob's Soroban sections. Never throws for bad input; failures are recorded. */
export function decodeWasm(bytes: Uint8Array): DecodedWasm {
  const out: DecodedWasm = {
    hash: sha256Hex(bytes),
    size: bytes.byteLength,
    codeSha256: "",
    customSectionNames: [],
    spec: { present: false, sectionCount: 0, bytes: 0, entries: [], entriesXdr: [], sdkDecodes: false, sdkFromWasm: false },
    meta: { present: false, entries: [], sdkDecodes: false, seps: [], sep55: {} },
    envMeta: { present: false, entries: [], sdkDecodes: false },
  };
  let parsed: ParsedWasm;
  try {
    parsed = parseWasm(bytes);
  } catch (e) {
    out.wasmError = e instanceof WasmParseError ? e.message : `unexpected: ${errMsg(e)}`;
    return out;
  }
  out.codeSha256 = parsed.codeSha256;
  out.customSectionNames = parsed.sections.filter((s) => s.id === 0).map((s) => s.name as string);

  // contractspecv0
  const specParts = customSections(parsed, SPEC_SECTION);
  out.spec.sectionCount = specParts.length;
  if (specParts.length > 0) {
    const specBytes = concatBytes(specParts);
    out.spec.present = specBytes.byteLength > 0;
    out.spec.bytes = specBytes.byteLength;
    out.spec.sha256 = sha256Hex(specBytes);
    try {
      const spec = new contract.Spec(specBytes);
      out.spec.entries = spec.entries.map((e) => e.toJson());
      out.spec.entriesXdr = spec.entries.map((e) => e.toXdr("base64"));
      out.spec.interfaceSha256 = sha256Hex(new TextEncoder().encode(interfaceKey(out.spec.entries)));
      out.spec.sdkDecodes = true;
    } catch (e) {
      out.spec.error = errMsg(e);
    }
    try {
      contract.Spec.fromWasm(bytes);
      out.spec.sdkFromWasm = true;
    } catch (e) {
      out.spec.sdkFromWasmError = errMsg(e);
    }
  }

  // contractmetav0
  const metaParts = customSections(parsed, META_SECTION);
  if (metaParts.length > 0) {
    out.meta.present = true;
    try {
      const all = metaParts.map(decodeMetaStream);
      out.meta.entries = all.flatMap((m) => m.entries);
      out.meta.sdkDecodes = all.every((m) => m.sdkDecodes);
      Object.assign(out.meta, interpretMeta(out.meta.entries));
    } catch (e) {
      out.meta.error = errMsg(e);
    }
  }

  // contractenvmetav0
  const envParts = customSections(parsed, ENV_META_SECTION);
  if (envParts.length > 0) {
    out.envMeta.present = true;
    try {
      const all = envParts.map(decodeEnvMetaStream);
      out.envMeta.entries = all.flatMap((m) => m.entries);
      out.envMeta.sdkDecodes = all.every((m) => m.sdkDecodes);
    } catch (e) {
      out.envMeta.error = errMsg(e);
    }
  }
  return out;
}
