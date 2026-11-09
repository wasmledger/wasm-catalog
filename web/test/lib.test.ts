// SPDX-License-Identifier: Apache-2.0
// Web library tests: live check against a recorded mainnet RPC reply
// (../fixtures/mainnet/ledger-entries.json, captured 2026-11-04 at ledger 65,293,542,
// see capture.provenance.json), gzip handling, search and routing. Offline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { gunzipToText, isGzip } from '../src/lib/gz.ts';
import { checkOnMainnet, codeLedgerKey, parseCodeEntry, resetRateLimit, sha256Hex, XdrError } from '../src/lib/live.ts';
import { parseRoute } from '../src/lib/route.ts';
import { classify, matchedFunctions, NO_FILTERS, search } from '../src/lib/search.ts';
import type { WebRow } from '../src/lib/types.ts';

const fx = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'mainnet', 'ledger-entries.json'), 'utf8')) as {
  keys: string[];
  codeHash: string;
  result: { latestLedger: number; entries: { key: string; xdr: string; lastModifiedLedgerSeq: number; liveUntilLedgerSeq: number }[] };
};
const blob = new Uint8Array(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'mainnet', 'wasm', `${fx.codeHash}.wasm`)));

test('codeLedgerKey matches the key the harvester sent (stellar-sdk xdr)', () => {
  assert.equal(codeLedgerKey(fx.codeHash), fx.keys[2]);
  assert.throws(() => codeLedgerKey('ABC'));
});

test('parseCodeEntry reads the recorded CONTRACT_CODE entry; sha256 matches the hash and the stored blob', async () => {
  const e = fx.result.entries.find((x) => x.key === codeLedgerKey(fx.codeHash))!;
  const { hash, code } = parseCodeEntry(e.xdr);
  assert.equal(hash, fx.codeHash);
  assert.deepEqual(code, blob);
  assert.equal(await sha256Hex(code), fx.codeHash);
});

test('parseCodeEntry: ext v0 layout, wrong type, truncation and trailing bytes', () => {
  // Build an ext=0 entry around a 5-byte code (padded to 8).
  const code = [1, 2, 3, 4, 5];
  const b = new Uint8Array(4 + 4 + 32 + 4 + 8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, 7);
  dv.setInt32(4, 0);
  b.fill(0xab, 8, 40);
  dv.setUint32(40, 5);
  b.set(code, 44);
  const b64 = (x: Uint8Array) => Buffer.from(x).toString('base64');
  const r = parseCodeEntry(b64(b));
  assert.equal(r.hash, 'ab'.repeat(32));
  assert.deepEqual([...r.code], code);
  const instance = fx.result.entries[0]!.xdr;
  assert.throws(() => parseCodeEntry(instance), XdrError);
  assert.throws(() => parseCodeEntry(b64(b.subarray(0, 46))), /truncated/);
  assert.throws(() => parseCodeEntry(b64(new Uint8Array([...b, 0, 0, 0, 0]))), /trailing/);
});

function fakeFetch(reply: unknown, status = 200, seen: unknown[] = []): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    seen.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}

test('checkOnMainnet: match on the recorded reply, request is a read-only getLedgerEntries', async () => {
  resetRateLimit();
  const seen: unknown[] = [];
  const r = await checkOnMainnet(fx.codeHash, { fetchImpl: fakeFetch({ jsonrpc: '2.0', id: 1, result: fx.result }, 200, seen) });
  assert.equal(r.status, 'match');
  if (r.status !== 'match') return;
  assert.equal(r.latestLedger, 65293542);
  assert.equal(r.size, blob.length);
  assert.deepEqual(seen, [{ jsonrpc: '2.0', id: 1, method: 'getLedgerEntries', params: { keys: [fx.keys[2]] } }]);
});

test('checkOnMainnet: mismatch, absent, RPC error, HTTP error, network failure', async () => {
  resetRateLimit();
  const now = () => 0;
  // Same reply, but we ask about another hash whose key we pretend the RPC returned.
  const other = 'cd'.repeat(32);
  const forged = { ...fx.result, entries: [{ ...fx.result.entries[2]!, key: codeLedgerKey(other) }] };
  const mm = await checkOnMainnet(other, { fetchImpl: fakeFetch({ result: forged }), now });
  assert.equal(mm.status, 'mismatch');
  resetRateLimit();
  const ab = await checkOnMainnet(other, { fetchImpl: fakeFetch({ result: { entries: [], latestLedger: 1 } }), now });
  assert.deepEqual(ab.status, 'absent');
  resetRateLimit();
  const er = await checkOnMainnet(other, { fetchImpl: fakeFetch({ error: { code: -32600, message: 'bad' } }), now });
  assert.equal(er.status, 'error');
  resetRateLimit();
  const he = await checkOnMainnet(other, { fetchImpl: fakeFetch({}, 503), now });
  assert.ok(he.status === 'error' && /503/.test(he.message));
  resetRateLimit();
  const ne = await checkOnMainnet(other, { fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, now });
  assert.ok(ne.status === 'error' && /Failed to fetch/.test(ne.message));
});

test('checkOnMainnet spaces calls at least one second apart', async () => {
  resetRateLimit();
  const times: number[] = [];
  const f = (async () => {
    times.push(Date.now());
    return new Response(JSON.stringify({ result: { entries: [], latestLedger: 1 } }));
  }) as unknown as typeof fetch;
  await checkOnMainnet(fx.codeHash, { fetchImpl: f });
  await checkOnMainnet(fx.codeHash, { fetchImpl: f });
  assert.ok(times[1]! - times[0]! >= 950, `gap ${times[1]! - times[0]!} ms`);
});

test('gunzipToText handles gzip and already-inflated bytes', async () => {
  const text = JSON.stringify({ a: 'é'.repeat(100) });
  const gz = new Uint8Array(gzipSync(text));
  assert.ok(isGzip(gz));
  assert.equal(await gunzipToText(gz), text);
  assert.equal(await gunzipToText(new TextEncoder().encode(text)), text);
});

const row = (h: string, over: Partial<WebRow> = {}): WebRow => ({
  h, n: 1, sz: 100, sp: true, f: 2, t: 0, e: 0, ev: 0, p: 22, sdk: '22.0.7', rs: null, sep: [], repo: null, s58: null, tc: 'pass', sg: 'pass',
  gi: null, gs: null, gc: null, nc: null, lab: [], fns: ['init', 'transfer'], cr: '2025-01-01', ...over,
});

test('search: classify, hash prefix, function text, filters, sort', () => {
  assert.equal(classify('').kind, 'empty');
  assert.equal(classify('07097f83').kind, 'hash');
  assert.equal(classify('CA7TELVQ6D4AQWRAWTD6HUIJUHVHJP2JQBMG2QKZW2XKO4DM6GDTLIUG').kind, 'contract');
  assert.equal(classify('ca7telvq6d4aqwrawtd6huijuhvhjp2jqbmg2qkzw2xko4dm6gdtliug').kind, 'contract');
  assert.equal(classify('swap').kind, 'text');
  assert.equal(classify('abc').kind, 'text', 'three hex chars are too short for a prefix');
  const rows = [
    row('aa'.repeat(32), { n: 5, fns: ['swap', 'quote'], ev: 2 }),
    row('ab'.repeat(32), { n: 9, lab: ['sep41'], sg: 'fail' }),
    row('bb'.repeat(32), { n: 1, sp: false, fns: [], f: null, repo: 'github:org/swapper' }),
  ];
  assert.deepEqual(search(rows, 'aaaa', NO_FILTERS).map((r) => r.h[1]), ['a']);
  assert.deepEqual(search(rows, 'SWAP', NO_FILTERS).map((r) => r.h.slice(0, 2)), ['aa', 'bb'], 'function name or repo, case-insensitive');
  assert.deepEqual(search(rows, '', NO_FILTERS).map((r) => r.n), [9, 5, 1]);
  assert.deepEqual(search(rows, '', { ...NO_FILTERS, sep41: true }).map((r) => r.n), [9]);
  assert.deepEqual(search(rows, '', { ...NO_FILTERS, spec: 'without' }).map((r) => r.n), [1]);
  assert.deepEqual(search(rows, '', { ...NO_FILTERS, events: true }).map((r) => r.n), [5]);
  assert.deepEqual(search(rows, '', { ...NO_FILTERS, sdkFails: true }).map((r) => r.n), [9]);
  assert.deepEqual(search(rows, '22.0', NO_FILTERS).length, 3, 'soroban-sdk version prefix');
  assert.deepEqual(matchedFunctions(rows[0]!, 'wa'), ['swap']);
});

test('routes', () => {
  assert.deepEqual(parseRoute(''), { view: 'overview' });
  assert.deepEqual(parseRoute('#/catalog?q=swap%20x'), { view: 'catalog', q: 'swap x' });
  assert.deepEqual(parseRoute(`#/h/${'ab'.repeat(32)}`), { view: 'hash', hash: 'ab'.repeat(32) });
  assert.deepEqual(parseRoute('#/h/abcd'), { view: 'catalog', q: 'abcd' });
  assert.deepEqual(parseRoute('#/c/cabc'), { view: 'contract', id: 'CABC' });
  assert.deepEqual(parseRoute('#/seps'), { view: 'seps' });
});
