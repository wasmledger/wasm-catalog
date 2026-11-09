// SPDX-License-Identifier: Apache-2.0
// Live check (WCT-026): ask public mainnet RPC for one CONTRACT_CODE ledger entry,
// read the wasm out of the XDR, and recompute its sha256 with WebCrypto. Read-only:
// one JSON-RPC `getLedgerEntries` call per click, at most one call per second.
//
// XDR read here (stellar-xdr, Stellar-ledger-entries.x):
//   LedgerKey        = int32 type (7 = CONTRACT_CODE) + Hash hash
//   LedgerEntryData  = int32 type (7) + ContractCodeEntry
//   ContractCodeEntry = ext (union int32: 0 = void, 1 = { ExtensionPoint ext; ContractCodeCostInputs costInputs })
//                       + Hash hash + opaque code<>
//   ContractCodeCostInputs = ExtensionPoint ext + 10 x uint32
// This is data parsing, not cryptography; the digest comes from crypto.subtle.

export const MAINNET_RPC = 'https://mainnet.sorobanrpc.com';
const CONTRACT_CODE = 7;
const MIN_INTERVAL_MS = 1000;

const HEX = /^[0-9a-f]{64}$/;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function b64encode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** base64 XDR LedgerKey for the CONTRACT_CODE entry of a wasm hash. */
export function codeLedgerKey(hashHex: string): string {
  if (!HEX.test(hashHex)) throw new Error('not a 64-character lowercase hex hash');
  const b = new Uint8Array(36);
  new DataView(b.buffer).setInt32(0, CONTRACT_CODE);
  b.set(hexToBytes(hashHex), 4);
  return b64encode(b);
}

export class XdrError extends Error {
  override name = 'XdrError';
}

/** Parse a base64 LedgerEntryData of type CONTRACT_CODE into its declared hash and code. */
export function parseCodeEntry(xdrB64: string): { hash: string; code: Uint8Array } {
  const b = b64decode(xdrB64);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const need = (n: number) => {
    if (o + n > b.length) throw new XdrError(`truncated at byte ${o} (need ${n} of ${b.length - o})`);
  };
  const i32 = () => {
    need(4);
    const v = dv.getInt32(o);
    o += 4;
    return v;
  };
  const u32 = () => {
    need(4);
    const v = dv.getUint32(o);
    o += 4;
    return v;
  };
  const type = i32();
  if (type !== CONTRACT_CODE) throw new XdrError(`ledger entry type ${type}, expected ${CONTRACT_CODE} (CONTRACT_CODE)`);
  const ext = i32();
  if (ext === 1) {
    if (i32() !== 0) throw new XdrError('unknown ExtensionPoint');
    if (i32() !== 0) throw new XdrError('unknown cost-inputs ExtensionPoint');
    for (let k = 0; k < 10; k++) u32();
  } else if (ext !== 0) {
    throw new XdrError(`unknown ContractCodeEntry ext ${ext}`);
  }
  need(32);
  const hash = bytesToHex(b.subarray(o, o + 32));
  o += 32;
  const len = u32();
  need(len);
  const code = b.slice(o, o + len);
  o += len + ((4 - (len % 4)) % 4);
  if (o !== b.length) throw new XdrError(`${b.length - o} trailing bytes`);
  return { hash, code };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
}

export type LiveResult =
  | { status: 'match' | 'mismatch'; hash: string; computed: string; size: number; latestLedger: number; lastModifiedLedger: number | null; liveUntilLedger: number | null; checkedAt: string; rpc: string }
  | { status: 'absent'; hash: string; latestLedger: number; checkedAt: string; rpc: string }
  | { status: 'error'; hash: string; message: string; checkedAt: string; rpc: string };

type RpcEntry = { key: string; xdr: string; lastModifiedLedgerSeq?: number; liveUntilLedgerSeq?: number };
type RpcReply = { result?: { entries?: RpcEntry[] | null; latestLedger: number }; error?: { code: number; message: string } };

let nextAllowed = 0;

/** For tests: forget the rate-limit slot. */
export function resetRateLimit(): void {
  nextAllowed = 0;
}

/**
 * Fetch the code entry for `hash` from `rpc` and verify it. Never throws: network,
 * RPC and parse failures come back as `status: 'error'` with the message.
 */
export async function checkOnMainnet(hash: string, opts: { rpc?: string; fetchImpl?: typeof fetch; now?: () => number } = {}): Promise<LiveResult> {
  const rpc = opts.rpc ?? MAINNET_RPC;
  const now = opts.now ?? Date.now;
  const checkedAt = new Date(now()).toISOString();
  try {
    const wait = nextAllowed - now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextAllowed = now() + MIN_INTERVAL_MS;
    const key = codeLedgerKey(hash);
    const res = await (opts.fetchImpl ?? fetch)(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLedgerEntries', params: { keys: [key] } }),
    });
    if (!res.ok) return { status: 'error', hash, message: `RPC answered HTTP ${res.status}`, checkedAt, rpc };
    const reply = (await res.json()) as RpcReply;
    if (reply.error) return { status: 'error', hash, message: `RPC error ${reply.error.code}: ${reply.error.message}`, checkedAt, rpc };
    if (!reply.result) return { status: 'error', hash, message: 'RPC reply has no result', checkedAt, rpc };
    const entry = (reply.result.entries ?? []).find((e) => e.key === key);
    if (!entry) return { status: 'absent', hash, latestLedger: reply.result.latestLedger, checkedAt, rpc };
    const { hash: declared, code } = parseCodeEntry(entry.xdr);
    const computed = await sha256Hex(code);
    return {
      status: computed === hash && declared === hash ? 'match' : 'mismatch',
      hash,
      computed,
      size: code.length,
      latestLedger: reply.result.latestLedger,
      lastModifiedLedger: entry.lastModifiedLedgerSeq ?? null,
      liveUntilLedger: entry.liveUntilLedgerSeq ?? null,
      checkedAt,
      rpc,
    };
  } catch (e) {
    return { status: 'error', hash, message: e instanceof Error ? e.message : String(e), checkedAt, rpc };
  }
}
