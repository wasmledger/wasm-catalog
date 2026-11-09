# Wasm catalog coverage

Generated 2026-11-04T16:35:48.850Z by @sik/wasm-catalog (@sik/wasm-catalog bindings v1, @stellar/stellar-sdk 17.4.0). Harvest 2026-11-04T01:55:04.331Z, RPC https://mainnet.sorobanrpc.com, ledgers 65173013..65293972.

## Method

- stellar.expert contract listing: 832 page(s) of up to 200, full walk.
- stellar.expert top contracts by invocations, then RPC instance lookup.
- RPC getEvents: 24 windows over the retention window, 24000 events read, then RPC instance lookup.
- Cross-check of the stellar.expert wasm field against RPC instance lookups: 200/200 agree.
- Selection: all 4200 distinct hashes seen.
- Wasm fetched by hash with RPC getLedgerEntries (CONTRACT_CODE), falling back to stellar.expert `/wasm/{hash}`; sha256 checked on every blob. Blobs are parsed, never executed.

## Headline

| Measure | Count | Share |
|---|---|---|
| Contracts in the harvest | 166382 | |
| ... with a wasm hash | 161949 | 97.3% |
| ... running a hash we decoded | 161949 | 100.0% of those with a hash |
| Distinct wasm hashes seen | 4200 | |
| Selected for fetch | 4200 | |
| Fetched and hash-verified | 4200 | 100.0% of selected |
| Wasm parses | 4200 | 100.0% |
| Has contractspecv0 | 4191 | 99.8% |
| Spec decodes with @stellar/stellar-sdk 17.4.0 (`new Spec(bytes)`) | 4191 | 100.0% of specs |
| `Spec.fromWasm` succeeds | 4191 | 100.0% of specs |
| Spec split over more than one section | 0 | |
| Declares events (SEP-48 event_v0) | 1150 | 27.4% |
| Has contractmetav0 | 4184 | 99.6% |
| Meta decodes with the SDK | 4184 | 100.0% of meta |
| Has contractenvmetav0 | 4200 | 100.0% |
| Declares SEP-47 `sep` | 11 | 0.3% |
| SEP-55 `source_repo` | 168 | 4.0% |
| SEP-58 build fields (any) | 33 | 0.8% |
| Bindings generated | 4191 | |
| Bindings type-check (tsc --strict) | 4191 pass / 0 fail | |
| SDK BindingGenerator output type-checks | 3032 pass / 1159 fail | |

## Near-duplicates

| Grouping | Distinct keys | Groups with 2+ hashes | Hashes in those groups |
|---|---|---|---|
| Same interface (spec with docs removed, entry order ignored) | 3399 | 468 | 1260 |
| Same spec bytes | 3497 | 435 | 1129 |
| Same code once custom sections are stripped | 4104 | 78 | 174 |

Interface groups whose members differ only in docs or entry order: 87.

Largest same-interface groups:

| Interface sha256 | Hashes | Contracts in harvest | soroban-sdk versions |
|---|---|---|---|
| `48cf07eb00a35b97` | 18 | 32 | (none), 20.2.0, 20.3.1, 20.3.2, 20.5.0, 21.1.1, 21.6.0, 22.0.7, 25.1.0 |
| `8e82090517eb741c` | 14 | 40 | 20.5.0, 21.7.4, 22.0.5, 22.0.6, 22.0.7, 22.0.8, 23.1.0, 23.5.1, 25.3.1, 26.0.1,  |
| `7814e316e50dd643` | 10 | 33 | 20.0.0, 20.2.0, 20.3.2, 21.1.1, 21.7.7, 22.0.7 |
| `2168f393b4dac6bc` | 9 | 9 | 22.0.7 |
| `516ce6f71100e0c1` | 9 | 100 | 20.0.0, 20.2.0, 20.4.0, 20.5.0 |
| `0c8303349f9e0efc` | 8 | 11 | 23.1.0 |
| `803c0b82f4792bce` | 8 | 13 | 21.7.7, 22.0.7 |
| `8e29394eda941acb` | 8 | 16 | (none), 20.2.0, 20.3.1, 21.7.7, 22.0.6, 25.1.1 |
| `c79f29079fbfd49e` | 8 | 12 | 23.5.3 |
| `5f42efb8a751f35d` | 7 | 16 | 25.1.1, 25.3.0 |
| `60e6d0fcd868b216` | 7 | 8 | 20.5.0, 21.7.7 |
| `780ee9b81fbaacf9` | 7 | 5538 | 22.0.3, 22.0.7, 23.0.2 |
| `bac2d972ca8c9157` | 7 | 8 | 21.7.7 |
| `cbdc2c752703e37a` | 7 | 19 | 20.3.1, 21.4.0, 21.6.0, 21.7.4, 21.7.7 |
| `25b4ac73016d29fa` | 6 | 6 | 22.0.7 |

## Binding diagnostics (our generator)

| Class | Hashes affected |
|---|---|
| reference to a type the spec does not declare | 255 |
| same error code with two names across error enums | 212 |
| duplicate name in spec (renamed) | 199 |
| name renamed (reserved, invalid or taken) | 15 |
| two functions map to one method name | 1 |

tsc error codes in the SDK BindingGenerator output (hashes affected):

| Code | Hashes |
|---|---|
| TS2749 | 890 |
| TS2305 | 225 |
| TS2304 | 62 |
| TS2300 | 50 |
| TS2451 | 37 |
| TS2344 | 13 |
| TS2724 | 3 |
| TS2567 | 2 |
| TS1117 | 1 |
| TS2552 | 1 |

## Distributions (decoded blobs)

Env interface protocol:

| Protocol | Hashes |
|---|---|
| 0 | 7 |
| 20 | 419 |
| 21 | 370 |
| 22 | 1120 |
| 23 | 643 |
| 25 | 783 |
| 26 | 366 |
| 27 | 266 |
| 28 | 180 |
| 29 | 46 |

soroban-sdk major (rssdkver):

| Major | Hashes |
|---|---|
| 20 | 418 |
| 21 | 369 |
| 22 | 1118 |
| 23 | 646 |
| 25 | 777 |
| 26 | 366 |
| 27 | 265 |
| 28 | 172 |
| 29 | 46 |
| (none) | 23 |

Meta keys:

| Key | Hashes |
|---|---|
| rssdkver | 4177 |
| rsver | 4177 |
| cliver | 1939 |
| rssdk_spec_shaking | 457 |
| source_repo | 168 |
| Description | 157 |
| binver | 156 |
| license | 74 |
| copyright | 70 |
| desc | 45 |
| home_domain | 45 |
| bldimg | 33 |
| name | 33 |
| Version | 31 |
| bldopt | 29 |
| source_sha256 | 29 |
| version | 18 |
| scaffold_version | 16 |
| description | 13 |
| title | 12 |
| sep | 11 |
| assdkver | 7 |
| source_commit | 7 |
| authors | 3 |
| contract | 3 |
| Debwewin UserId | 3 |
| source_rev | 3 |
| bldopt_manifest_path | 2 |
| bldopt_package | 2 |
| bldopt_profile | 2 |
| (14 more) | |

SEP-47 declared SEPs:

| SEP | Hashes |
|---|---|
| 40 | 4 |
| 41 | 7 |

Contracts per hash (in this harvest):

| Contracts | Hashes |
|---|---|
| 1 | 3035 |
| 2-9 | 931 |
| 10-99 | 208 |
| 100-999 | 18 |
| 1000+ | 8 |

Most-used hashes:

| Hash | Contracts | Functions | soroban-sdk |
|---|---|---|---|
| `07097f83dae3b746` | 131459 | 12 | 22.0.7 |
| `ecd990f0b45ca681` | 4616 | 6 | 22.0.7 |
| `0a41411f7250a78d` | 2276 | 16 | 22.0.6 |
| `1b5f4534a76322da` | 1598 | 17 | 26.1.0 |
| `f340242d143b42e2` | 1407 | 15 | 23.4.0 |
| `7ac3713a1df2919f` | 1257 | 3 | 22.0.7 |
| `72ae9a04124c9cda` | 1135 | 5 | 23.4.0 |
| `2ddb5ef1f8f029ea` | 1021 | 15 | 26.0.0 |
| `0c0a264d4cc0b3e7` | 809 | 5 | 21.7.6 |
| `bfab576fb405952f` | 798 | 13 | 22.0.11 |

Fetch outcome (selected hashes):

| Outcome | Hashes |
|---|---|
| rpc | 4200 |

Contracts by source:

| Source | Contracts |
|---|---|
| se-contracts | 166101 |
| rpc-instance | 481 |
| rpc-events | 375 |
| se-top | 100 |

Executable per RPC instance lookup:

| Executable | Contracts |
|---|---|
| no_instance | 281 |
| wasm | 192 |
| stellar_asset | 8 |
