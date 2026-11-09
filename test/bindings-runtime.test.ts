// SPDX-License-Identifier: Apache-2.0
// WCT-021: runtime smoke test of generated bindings, offline. For each bindings.ts in
// examples/catalog (generated from mainnet wasm), instantiate the generated Client,
// check every spec function is a method, then build an invocation with simulate:false
// (no RPC call is made) for every function whose inputs are simple scalars, and check
// the operation targets the right contract and function and each argument is encoded
// exactly as the SDK encodes that value for the spec type. No network: the RPC URL
// points at a closed local port. UDT arguments and simulation are WCT-029.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { nativeToScVal, Networks, StrKey } from "@stellar/stellar-sdk";

const root = join(import.meta.dirname, "..");
const dir = join(root, "examples", "catalog");
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
const ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));

// Values per simple spec type; functions with any other input type are skipped.
const SAMPLE: Record<string, unknown> = {
  address: ACCOUNT,
  u32: 7,
  i32: -7,
  u64: 70n,
  i64: -70n,
  u128: 700n,
  i128: -700n,
  bool: true,
  string: "wct",
  symbol: "wct",
};

// @stellar/stellar-sdk 17 exposes XDR values with fields as properties and a JSON form.
type SpecInput = { name: unknown; type: unknown };
type SpecFn = { name: unknown; inputs: SpecInput[] };
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x))) as unknown;
type Built = { raw?: { build(): { operations: { func: unknown }[] } } };

for (const h of readdirSync(dir).sort()) {
  test(`generated Client for ${h.slice(0, 12)}: methods exist; invocations encode`, async () => {
    const mod = (await import(join(dir, h, "bindings.ts"))) as { Client: new (o: object) => Record<string, unknown> & { spec: { funcs(): SpecFn[] } }; WASM_HASH: string };
    assert.equal(mod.WASM_HASH, h);
    const client = new mod.Client({ contractId: CONTRACT, networkPassphrase: Networks.PUBLIC, rpcUrl: "http://127.0.0.1:9", allowHttp: true });
    const fns = client.spec.funcs().filter((f) => String(f.name) !== "__constructor");
    assert.ok(fns.length > 0);
    let built = 0;
    for (const f of fns) {
      const name = String(f.name);
      assert.equal(typeof client[name], "function", `method ${name}`);
      const types = f.inputs.map((i) => i.type);
      if (!types.every((t) => typeof t === "string" && t in SAMPLE)) continue;
      const args = Object.fromEntries(f.inputs.map((i) => [String(i.name), SAMPLE[i.type as string]]));
      const fn = client[name] as (...a: object[]) => Promise<Built>;
      const tx = f.inputs.length ? await fn(args, { simulate: false }) : await fn({ simulate: false });
      const op = json(tx.raw!.build().operations[0]!.func) as { invoke_contract: { contract_address: string; function_name: string; args: unknown[] } };
      assert.equal(op.invoke_contract.contract_address, CONTRACT);
      assert.equal(op.invoke_contract.function_name, name);
      const want = f.inputs.map((i) => json(nativeToScVal(SAMPLE[i.type as string], { type: i.type } as Parameters<typeof nativeToScVal>[1])));
      assert.deepEqual(op.invoke_contract.args, want, `${name} args encoded as their spec types`);
      built++;
    }
    assert.ok(built > 0, "at least one function with simple inputs was built");
  });
}
