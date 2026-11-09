# Testing

`pnpm run check` = lint + `tsc --noEmit` + `node --test test/*.test.ts`. All tests are offline. On the loaded build machine the suite took several minutes (each `tsc` run is a few seconds; CLI tests spawn Node).

## Test files

| File | Covers |
|---|---|
| `test/wasm-decode.test.ts` | Section walker (truncation, bad magic/version, unknown section id, runaway LEB128, non-UTF-8 names, size cap), code hash, spec/meta/env-meta decoding, multi-section specs, SDK decode failures recorded, SEP-58 checks, SEP-51 unescape |
| `test/bindings-docs.test.ts` | Identifier/keys/JSDoc helpers, every type form in bindings, hostile names and docs (adversarial fixture), `tsc --strict` on generated files (with a deliberately broken file to prove failures are attributed), Markdown inertness, README contents |
| `test/mainnet-catalog.test.ts` | Mainnet fixtures: hashes vs provenance, parse, byte-exact spec round-trip through `src/specenc.ts`, fixture reasons, XDR parsers on captured `getLedgerEntries` rows, offline `buildCatalog` with type-checks and SDK comparison |
| `test/net-harvest.test.ts` | Rate limit spacing, cache, offline misses, refusal of write RPC methods, 429 retry, 404 caching, stratified cursors, harvester end to end against a fake stellar.expert + RPC |
| `test/cli.test.ts` | `decode`, `page`, usage exit codes |

## Fixtures

- `fixtures/synthetic/` (our own; `node scripts/make-synthetic.ts`; deterministic): `full.wasm` (every type form and entry kind, meta in two sections, SEP-47/55/58 keys), `full-nodocs.wasm` (same interface, no docs, reversed order), `adversarial.wasm` (comment breakers, HTML, reserved words, base-class collisions, duplicates, undeclared refs, duplicate error codes, non-conformant SEP-58), `multi-spec.wasm`, `no-spec.wasm`, `over-limit.wasm` (XDR length limit), `trailing-garbage.wasm`, `truncated.wasm`, `not-wasm.wasm`. Provenance: `synthetic.provenance.json` (sha256 per file).
- `fixtures/mainnet/` (read-only capture; `node scripts/capture-fixtures.ts [out/harvest] [out/index.json]` after a harvest and build): 13 blobs chosen for edge cases (reasons in `capture.provenance.json`), a `harvest.json` restricted to them, and raw `getLedgerEntries` rows for one wasm instance, one Stellar Asset Contract instance and one code entry. About 240 KB.

## Live checks (not in the test suite)

- `node src/cli.ts harvest` then `node src/cli.ts build --typecheck --compare-sdk`: the live run whose results are in `census/`.
- `node scripts/compare-bindings.ts`: runs the installed stellar CLI on our synthetic fixtures only and writes `census/binding-comparison.md`.

## Added 2026-11-08 (MVP)

- `test/similarity.test.ts` (WCT-018): Jaccard, single-linkage clusters, a brute-force cross-check on a pseudo-random corpus, SEP-41 labels.
- `test/webdata.test.ts` (WCT-024): the export on a synthetic catalog; the shipped `web/public/data` against `census/full-walk-2026-11-04/coverage.json` (totals, groups, every row in 16 of 256 shards, every contract in the lookup).
- `test/bindings-runtime.test.ts` (WCT-021): generated Clients from `examples/catalog` build every scalar-argument call offline (`simulate:false`) with the SDK's encoding.
- `web/test/lib.test.ts` (WCT-026, `pnpm -C web test`): live check against the recorded `fixtures/mainnet/ledger-entries.json` reply (key, XDR parse, sha256, match/mismatch/absent/error, 1 s spacing), gzip handling, search, routes.
- Visual: the built app checked in Chrome in light and dark at 1440 and 375 px (no horizontal scroll at 375).

## Not tested

- Bindings at runtime with UDT arguments, simulation against a mocked RPC, or at scale (WCT-029).
- `--se-full` beyond the run recorded in the README; testnet (WCT-015); CAP-85 external refs on mainnet (none seen in the sample).
