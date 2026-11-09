# Sources

Trust tags: [P] primary, [S] secondary, [V] verified by us on the date given, [I] inferred, [E] estimate, [U] unverified.

## Discovery notes (research output; re-verified where we build on them)

- `../../../zero-to-one-discovery/reports/SDF open issues build gaps.md`, section 5a **A10** "Hash-keyed wasm catalog with docs and auto-published bindings" (line ~329). Its "strongest reason it might not be novel" (stellar.expert and stellar-registry index wasm; docgen is crowded) was confirmed and extended in PRIOR-ART.md.
- `../../../zero-to-one-discovery/research_notes/SDF open issues build gaps/cli_lab_examples.md` line ~171 (summary of #36) and `raw/laboratory-backend.jsonl` (issue body).
- `../../../zero-to-one-discovery/reports/SDF open issues build gaps.md` row M23 (build verification and supply chain; catalog rated "3 l").

## Issue

- stellar/laboratory-backend#36, "[Brainstorm] A service for capturing new wasms", janewang, 2026-02-13, 0 comments, open. [V] `gh api` 2026-11-04.

## Data endpoints (read-only)

| What | URL | Tag |
|---|---|---|
| Mainnet RPC | `https://mainnet.sorobanrpc.com` | [V] 2026-11-04: `getVersionInfo` 29.0.1, protocol 29, retention window 120960 ledgers |
| Alternative RPCs | `https://soroban-rpc.mainnet.stellar.gateway.fm` (RPC 30.0.0), `https://rpc.lightsail.network` (29.0.1) | [V] healthy 2026-11-04; not used for the census |
| stellar.expert contract listing | `https://api.stellar.expert/explorer/public/contract?order=asc&limit=200&cursor=<C...>` | [V] 2026-11-04; undocumented (used by the explorer UI, `views/explorer/search/contract-search-results-view.js`); records `{contract, created, creator, wasm, invocations, ...}`; sorted by contract id |
| stellar.expert top contracts | `https://api.stellar.expert/explorer/public/top-contracts/invocations` | [V] 2026-11-04; used by `soroban-top-contracts-view.js` |
| stellar.expert wasm by hash | `https://api.stellar.expert/explorer/public/wasm/<hash>` | [P] `open-api/contracts-api.yml` in stellar-expert/stellar-expert-explorer; also called by Stellar Lab `useSEContractWasmBinary.ts` |
| stellar.expert terms | "Open APIs are publicly available for developers, free of charge ... may be a subject to rate limiting ... 429" | [P] https://stellar.expert/openapi, 2026-11-04 |

## Specs

- SEP-46, 47, 48, 55, 58: `stellar/stellar-protocol` `ecosystem/sep-00NN.md`, statuses and versions in PRIOR-ART.md. [P] read 2026-11-04.
- SEP-51 string escaping in the SDK's JSON form: `@stellar/stellar-sdk` 17.4.0 `lib/esm/xdr/values/xdr-string.js` (`\0 \t \n \r \\ \xNN`). [V]
- XDR shapes (ScSpecEntry kinds incl. `event_v0`, ScMetaEntry, ScEnvMetaEntry interface version as two u32, ContractExecutable arms wasm / stellar asset / external ref): `@stellar/stellar-sdk` 17.4.0 generated XDR types. [V]; our encoder re-encodes 54/54 real mainnet specs byte for byte (2026-11-04).

## Facts measured here (2026-11-04)

- Runtime: `scValToNative` of an `scvVoid` returns `null` (so `option<T>` maps to `T | null`). [V]
- `contract.Spec.fromWasm` throws "Expected at most one 'contractspecv0' section" on split specs. [V] synthetic fixture
- `contract.Client` assigns each contract function to `this[sanitizeIdentifier(name)]`, so a function named `spec`/`options` would overwrite the client's own members. [V] SDK source `contract/client.js`; [I] effect, not exercised at runtime.
- SDK `BindingGenerator` output fails `tsc --strict` when an error enum is used as a type (TS2749) or a function references a type absent from the spec (TS2305). [V] census/COVERAGE.md
- stellar CLI 25.2.0 `contract bindings typescript` on our adversarial fixture produces TypeScript that does not parse (interface named `class`, two methods with one name) and renames a field `weird name` to `weird_name`. [V] census/binding-comparison.md
- All numbers in README and `census/` come from the live runs recorded there.
