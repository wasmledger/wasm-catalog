# Architecture

## Data flow

```
stellar.expert listing / top ─┐
RPC getEvents ────────────────┼─► contract ids ─► RPC getLedgerEntries(instance) ─► wasm hashes
                              │                                                       │
                              └─────────── (listing already carries the hash) ────────┤
                                                                                      ▼
                                   select (all, or top-by-use + seeded random) ─► fetch by hash
                                   RPC getLedgerEntries(CONTRACT_CODE) ▸ stellar.expert /wasm/{hash}
                                                                                      │ sha256 check
                                                                                      ▼
                                              out/harvest/{harvest.json, wasm/<hash>.wasm}
                                                                                      │ offline from here
                                                                                      ▼
   wasm.ts (section walk) ─► decode.ts (spec / meta / env meta, SEP-47/55/58) ─► specmodel.ts
                                                                                      │
                     ┌────────────────────────────┬───────────────────────────────────┤
                     ▼                            ▼                                   ▼
               docs.ts README.md           bindings.ts bindings.ts            coverage.ts
                                                  │ tsc --strict (optional)          │
                                                  ▼                                   ▼
                                     catalog.ts writes out/catalog/<hash>/*, index.json, coverage.json, COVERAGE.md
```

## Modules (`src/`)

| File | Role |
|---|---|
| `net.ts` | GET and read-only JSON-RPC, global rate limiter, retries, content-addressed disk cache, offline mode |
| `harvest.ts` | Sources, instance lookup, cross-check, selection, fetch, `harvest.json` |
| `wasm.ts` | Bounds-checked section walker, custom-section extraction, code hash |
| `decode.ts` | Spec via `contract.Spec`, meta / env-meta stream decoders, SEP interpretation |
| `json.ts` | Canonical JSON, doc stripping, interface key, SEP-51 unescape |
| `specmodel.ts` | Neutral model over the SDK JSON form; Rust-style type rendering |
| `docs.ts` | Markdown page with inert rendering of untrusted strings |
| `bindings.ts` | TypeScript generator over `contract.Spec` / `contract.Client` |
| `catalog.ts` | Offline build, `tsc` runs, SDK-generator comparison |
| `coverage.ts` | Census numbers and `COVERAGE.md` |
| `specenc.ts` | XDR encoder for spec/meta + section-only wasm builder (fixtures; round-trip check) |
| `cli.ts` | Commands |

## Web catalog (`web/`, 2026-11-08)

`scripts/web-data.ts` (pure logic in `src/webdata.ts`, similarity in `src/similarity.ts`) reads the recorded build (`out/full`) and harvest and writes `web/public/data/`: `summary.json` (aggregates plus provenance), `index.json` (one compact row per hash, function names included for search), `h/<2 hex>.json.gz` (256 shards: spec.json, bindings.ts, tsc diagnostics, up to 200 contract IDs, neighbours) and `c/<char>.json.gz` (32 shards: contract ID to hash or executable kind). The Vite app loads the summary first, the index when the catalog opens, and one shard per hash page. It renders specs with the CLI's own `src/specmodel.ts` as React text only. The live check (`web/src/lib/live.ts`) is the only network call: one JSON-RPC `getLedgerEntries`, at most one per second.

## Decisions

1. **Harvest and build are separate steps.** Harvest is the only networked step and writes everything it learned to disk; build is pure and repeatable offline. Tests run the build on captured fixtures.
2. **stellar.expert's contract listing is the enumerator; RPC is the source of truth for bytes.** RPC cannot list contracts, and Hubble needs a Google login. The listing is sorted by contract id, and ids are hashes, so cursors spread over the keyspace give a stratified sample of all contracts. Its wasm field is cross-checked against RPC instance lookups (200/200 agreed on 2026-11-04). Blobs come from RPC first and are always hash-checked, so a wrong listing can only cause a miss, never a wrong blob.
3. **Our own section walker, SDK for XDR.** The SDK's `Spec.fromWasm` rejects specs split across sections; walking sections ourselves lets us concatenate them and measure the difference. Meta and env-meta streams are trivial XDR and are decoded by hand, then each entry is validated with the SDK's types so "decodes on the current SDK" is measured, not assumed.
4. **Our own binding generator, SDK comparison in-process.** The brief rules out shelling out to the stellar CLI on third-party code. The SDK's `BindingGenerator` runs in-process (pure string generation, no wasm execution), so it is used as a second opinion and type-checked the same way. The CLI is run only on our synthetic fixtures (`scripts/compare-bindings.ts`).
5. **Untrusted text is never interpreted.** Spec names/docs and meta values can be anything. Markdown: code spans and sized fences only. TypeScript: strict identifier check, quoted keys, `JSON.stringify` literals, escaped comments, and a `tsc --strict` gate over every generated file.
6. **Three duplicate notions.** Same interface (docs and order ignored: what a client needs), same spec bytes, and same code with custom sections stripped (same build, different metadata). They answer different questions (shared binding, copied spec, rebuilt-with-new-meta).
7. **Size.** The full catalog lives in gitignored `out/`. Committed: `census/` (coverage + index for the sample), `examples/` (two catalog entries to show the shape), fixtures under 1 MB.
