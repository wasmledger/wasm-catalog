// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { StrKey } from "@stellar/stellar-sdk";
import { DEFAULT_PARAMS, Harvester, SE_API, stratifiedCursors } from "../src/harvest.ts";
import { Net, OfflineMiss } from "../src/net.ts";
import { sha256Hex } from "../src/wasm.ts";

const root = join(import.meta.dirname, "..");
const fx = join(root, "fixtures", "mainnet");

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>, calls: { url: string; at: number; body?: string }[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, at: Date.now(), body: typeof init?.body === "string" ? init.body : undefined });
    return handler(url, init ?? {});
  }) as typeof fetch;
}

test("Net enforces >= 500 ms spacing, caches, and goes offline", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wct-net-"));
  const calls: { url: string; at: number }[] = [];
  const net = new Net({ cacheDir: dir, fetchImpl: fakeFetch(() => new Response("{}"), calls) });
  for (const u of ["https://x.test/a", "https://x.test/b", "https://x.test/c"]) await net.getBytes(u);
  assert.equal(calls.length, 3);
  assert.ok((calls[1] as { at: number }).at - (calls[0] as { at: number }).at >= 490);
  assert.ok((calls[2] as { at: number }).at - (calls[1] as { at: number }).at >= 490);
  await net.getBytes("https://x.test/a");
  assert.equal(calls.length, 3, "second GET is served from cache");
  const off = new Net({ cacheDir: dir, offline: true });
  assert.deepEqual(await off.getBytes("https://x.test/a"), new TextEncoder().encode("{}"));
  await assert.rejects(off.getBytes("https://x.test/zzz"), OfflineMiss);
  assert.throws(() => new Net({ cacheDir: dir, minIntervalMs: 100 }), /2 req\/s/);
  rmSync(dir, { recursive: true, force: true });
});

test("Net refuses write RPC methods, retries 429, caches 404 as null", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wct-net-"));
  const calls: { url: string; at: number }[] = [];
  let n = 0;
  const net = new Net({
    cacheDir: dir,
    fetchImpl: fakeFetch((url) => {
      if (url.endsWith("/missing")) return new Response("nope", { status: 404 });
      n++;
      return n === 1 ? new Response("slow down", { status: 429 }) : new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
    }, calls),
  });
  await assert.rejects(net.rpc("https://rpc.test", "sendTransaction", {}), /non-read/);
  await assert.rejects(net.rpc("https://rpc.test", "simulateTransaction", {}), /non-read/);
  assert.deepEqual(await net.rpc("https://rpc.test", "getHealth", {}), { ok: true });
  assert.equal(net.stats.retries, 1);
  assert.equal(await net.getBytes("https://x.test/missing"), null);
  const before = calls.length;
  assert.equal(await net.getBytes("https://x.test/missing"), null);
  assert.equal(calls.length, before, "404 served from cache");
  rmSync(dir, { recursive: true, force: true });
});

test("stratified cursors are valid contract ids spread over the keyspace", () => {
  const c = stratifiedCursors(16);
  assert.equal(c.length, 16);
  for (const id of c) assert.ok(StrKey.isValidContract(id));
  assert.deepEqual([...c].sort(), c, "ascending");
  assert.equal(StrKey.decodeContract(c[8] as string)[0], 0x80);
});

test("Harvester end to end against a fake stellar.expert + RPC built from fixtures", async () => {
  const le = JSON.parse(readFileSync(join(fx, "ledger-entries.json"), "utf8")) as { keys: string[]; wasmContract: string; sac: string; codeHash: string; result: { entries: { key: string; xdr: string }[] } };
  const byKey = new Map(le.result.entries.map((e) => [e.key, e]));
  const instHash = "0".repeat(64); // filled from the instance entry below
  const dir = mkdtempSync(join(tmpdir(), "wct-harvest-"));
  const calls: { url: string; at: number; body?: string }[] = [];
  const wasmBytes = readFileSync(join(fx, "wasm", `${le.codeHash}.wasm`));
  const fetchImpl = fakeFetch((url, init) => {
    if (url.startsWith(`${SE_API}/contract?`))
      return Response.json({ _embedded: { records: [{ contract: le.sac }, { contract: "not-a-contract", wasm: instHash }, { contract: le.wasmContract, wasm: "zz" }] } });
    if (url === `${SE_API}/top-contracts/invocations`) return Response.json([{ contract: le.wasmContract }]);
    if (url.startsWith(`${SE_API}/wasm/`)) return new Response(url.endsWith(le.codeHash) ? wasmBytes : "x", { status: url.endsWith(le.codeHash) ? 200 : 404 });
    const body = JSON.parse(String(init.body)) as { method: string; params: { keys?: string[] } };
    const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: 1, result });
    if (body.method === "getHealth") return ok({ latestLedger: 2000, oldestLedger: 1000 });
    if (body.method === "getVersionInfo") return ok({ version: "fake" });
    if (body.method === "getEvents") return ok({ events: [{ contractId: le.sac }] });
    if (body.method === "getLedgerEntries") return ok({ latestLedger: 2000, entries: (body.params.keys ?? []).map((k) => byKey.get(k)).filter(Boolean) });
    return new Response("?", { status: 400 });
  }, calls);
  const net = new Net({ cacheDir: join(dir, "cache"), fetchImpl });
  const h = await new Harvester(net, { ...DEFAULT_PARAMS, rpcUrl: "https://rpc.test", seStrata: 1, eventWindows: 1, crossCheck: 5 }, join(dir, "out")).run();
  const w = h.contracts.find((c) => c.contract === le.wasmContract);
  assert.ok(w);
  assert.equal(w.rpcExecutable, "wasm");
  assert.equal(h.contracts.find((c) => c.contract === le.sac)?.rpcExecutable, "stellar_asset");
  assert.ok(!h.contracts.some((c) => c.contract === "not-a-contract"), "invalid ids are dropped");
  // The instance hash is not in the fake code store, so it falls back to the stellar.expert mock (404 -> missing).
  const instance = h.hashes.find((x) => x.hash === w.rpcWasm);
  assert.ok(instance);
  assert.equal(instance.fetch, w.rpcWasm === le.codeHash ? "rpc" : "missing");
  assert.equal(h.crossCheck.checked, 2);
  // Every live call is a GET or a read-only JSON-RPC method.
  for (const c of calls) if (c.body) assert.match(c.body, /"method":"(getHealth|getVersionInfo|getEvents|getLedgerEntries)"/);
  // The code entry fixture is reachable through RPC when asked for directly.
  const h2 = new Harvester(net, { ...DEFAULT_PARAMS, rpcUrl: "https://rpc.test" }, join(dir, "out2"));
  (h2 as unknown as { hashes: Map<string, unknown> }).hashes.set(le.codeHash, { hash: le.codeHash, sources: ["t"], contracts: [], selected: true });
  await h2.fetchCode();
  assert.equal(sha256Hex(readFileSync(join(dir, "out2", "wasm", `${le.codeHash}.wasm`))), le.codeHash);
  rmSync(dir, { recursive: true, force: true });
});
