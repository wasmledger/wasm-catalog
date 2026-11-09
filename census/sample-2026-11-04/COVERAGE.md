# Wasm catalog coverage

Generated 2026-11-04T01:10:05.477Z by @sik/wasm-catalog (@sik/wasm-catalog bindings v1, @stellar/stellar-sdk 17.4.0). Harvest 2026-11-04T00:51:35.679Z, RPC https://mainnet.sorobanrpc.com, ledgers 65172518..65293477.

## Method

- stellar.expert contract listing: 16 page(s) of up to 200, starting at 16 cursors spread evenly over the contract-id keyspace (a stratified sample of all contracts; ids are hashes, so the order is uniform).
- stellar.expert top contracts by invocations, then RPC instance lookup.
- RPC getEvents: 24 windows over the retention window, 24000 events read, then RPC instance lookup.
- Cross-check of the stellar.expert wasm field against RPC instance lookups: 200/200 agree.
- Selection: all 282 distinct hashes seen.
- Wasm fetched by hash with RPC getLedgerEntries (CONTRACT_CODE), falling back to stellar.expert `/wasm/{hash}`; sha256 checked on every blob. Blobs are parsed, never executed.

## Headline

| Measure | Count | Share |
|---|---|---|
| Contracts in the harvest | 3715 | |
| ... with a wasm hash | 3221 | 86.7% |
| ... running a hash we decoded | 3221 | 100.0% of those with a hash |
| Distinct wasm hashes seen | 282 | |
| Selected for fetch | 282 | |
| Fetched and hash-verified | 282 | 100.0% of selected |
| Wasm parses | 282 | 100.0% |
| Has contractspecv0 | 280 | 99.3% |
| Spec decodes with @stellar/stellar-sdk 17.4.0 (`new Spec(bytes)`) | 280 | 100.0% of specs |
| `Spec.fromWasm` succeeds | 280 | 100.0% of specs |
| Spec split over more than one section | 0 | |
| Declares events (SEP-48 event_v0) | 101 | 35.8% |
| Has contractmetav0 | 280 | 99.3% |
| Meta decodes with the SDK | 280 | 100.0% of meta |
| Has contractenvmetav0 | 282 | 100.0% |
| Declares SEP-47 `sep` | 1 | 0.4% |
| SEP-55 `source_repo` | 13 | 4.6% |
| SEP-58 build fields (any) | 4 | 1.4% |
| Bindings generated | 280 | |
| Bindings type-check (tsc --strict) | 280 pass / 0 fail | |
| SDK BindingGenerator output type-checks | 190 pass / 90 fail | |

## Near-duplicates

| Grouping | Distinct keys | Groups with 2+ hashes | Hashes in those groups |
|---|---|---|---|
| Same interface (spec with docs removed, entry order ignored) | 271 | 6 | 15 |
| Same spec bytes | 273 | 4 | 11 |
| Same code once custom sections are stripped | 282 | 0 | 0 |

Interface groups whose members differ only in docs or entry order: 2.

Largest same-interface groups:

| Interface sha256 | Hashes | Contracts in harvest | soroban-sdk versions |
|---|---|---|---|
| `780ee9b81fbaacf9` | 5 | 129 | 22.0.3, 22.0.7, 23.0.2 |
| `339ede3ff88a5a8e` | 2 | 5 | 25.3.1 |
| `71ca8039983752ce` | 2 | 2 | 22.0.8 |
| `95b05dc7a7b6e645` | 2 | 2 | 23.0.2 |
| `d22c78b3331cef74` | 2 | 2 | 22.0.8 |
| `f2dc8de9af01f121` | 2 | 14 | 22.0.8 |

## Binding diagnostics (our generator)

| Class | Hashes affected |
|---|---|
| reference to a type the spec does not declare | 38 |
| same error code with two names across error enums | 18 |
| duplicate name in spec (renamed) | 15 |
| name renamed (reserved, invalid or taken) | 3 |

tsc error codes in the SDK BindingGenerator output (hashes affected):

| Code | Hashes |
|---|---|
| TS2749 | 57 |
| TS2305 | 38 |
| TS2304 | 6 |
| TS2451 | 4 |
| TS2300 | 3 |
| TS2344 | 1 |

## Distributions (decoded blobs)

Env interface protocol:

| Protocol | Hashes |
|---|---|
| 20 | 24 |
| 21 | 14 |
| 22 | 85 |
| 23 | 41 |
| 25 | 55 |
| 26 | 21 |
| 27 | 13 |
| 28 | 26 |
| 29 | 3 |

soroban-sdk major (rssdkver):

| Major | Hashes |
|---|---|
| 20 | 24 |
| 21 | 14 |
| 22 | 84 |
| 23 | 42 |
| 25 | 54 |
| 26 | 21 |
| 27 | 13 |
| 28 | 25 |
| 29 | 3 |
| (none) | 2 |

Meta keys:

| Key | Hashes |
|---|---|
| rssdkver | 280 |
| rsver | 280 |
| cliver | 139 |
| rssdk_spec_shaking | 47 |
| license | 23 |
| binver | 22 |
| copyright | 22 |
| source_repo | 13 |
| Description | 12 |
| desc | 8 |
| bldimg | 4 |
| bldopt | 4 |
| source_sha256 | 4 |
| name | 3 |
| title | 3 |
| scaffold_version | 2 |
| authors | 1 |
| contract | 1 |
| repo | 1 |
| sep | 1 |
| source_commit | 1 |
| version | 1 |

SEP-47 declared SEPs:

| SEP | Hashes |
|---|---|
| 40 | 1 |

Contracts per hash (in this harvest):

| Contracts | Hashes |
|---|---|
| 1 | 227 |
| 2-9 | 41 |
| 10-99 | 12 |
| 100-999 | 1 |
| 1000+ | 1 |

Most-used hashes:

| Hash | Contracts | Functions | soroban-sdk |
|---|---|---|---|
| `07097f83dae3b746` | 2519 | 12 | 22.0.7 |
| `ecd990f0b45ca681` | 100 | 6 | 22.0.7 |
| `0a41411f7250a78d` | 39 | 16 | 22.0.6 |
| `1b5f4534a76322da` | 31 | 17 | 26.1.0 |
| `7ac3713a1df2919f` | 26 | 3 | 22.0.7 |
| `2ddb5ef1f8f029ea` | 25 | 15 | 26.0.0 |
| `72ae9a04124c9cda` | 25 | 5 | 23.4.0 |
| `b62f62217ff256d5` | 25 | 6 | 22.0.3 |
| `bfab576fb405952f` | 18 | 13 | 22.0.11 |
| `f340242d143b42e2` | 17 | 15 | 23.4.0 |

Fetch outcome (selected hashes):

| Outcome | Hashes |
|---|---|
| rpc | 282 |

Contracts by source:

| Source | Contracts |
|---|---|
| rpc-events | 438 |
| rpc-instance | 715 |
| se-top | 100 |
| se-contracts | 3200 |

Executable per RPC instance lookup:

| Executable | Contracts |
|---|---|
| no_instance | 344 |
| wasm | 293 |
| stellar_asset | 78 |
