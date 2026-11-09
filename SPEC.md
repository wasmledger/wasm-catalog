# wasm-catalog SPEC (normative, v1)

Status: first working version, 2026-11-04. Interfaces below are what the code does today; change this file first when changing them.

## 1. Commands (`node src/cli.ts`, bin `wct`)

| Command | Network | Output |
|---|---|---|
| `wct harvest [--out out/harvest] [--rpc URL] [--se-strata N \| --se-full] [--se-max-pages N] [--no-se-top] [--event-windows N] [--max-hashes N] [--cross-check N] [--no-se-wasm] [--offline] [--interval-ms N] [--cache .cache]` | read-only GET + JSON-RPC reads, one request per `interval-ms` (>= 500, i.e. <= 2 req/s), cached under `--cache` | `<out>/harvest.json`, `<out>/wasm/<hash>.wasm` |
| `wct build [--harvest out/harvest] [--out out] [--typecheck] [--compare-sdk]` | none | `<out>/catalog/<hash>/{spec.json,README.md,bindings.ts}`, `<out>/index.json`, `<out>/coverage.json`, `<out>/COVERAGE.md`; with `--compare-sdk` also `<out>/sdkgen/<hash>/{types,client,index}.ts` |
| `wct decode <file.wasm>` | none | decoded sections as JSON on stdout; exit 1 if the blob is not parseable wasm |
| `wct page <file.wasm> --out <dir>` | none | `spec.json`, `README.md`, `bindings.ts` for one blob |

Exit codes: 0 ok, 1 error, 2 usage.

## 2. Allowed network calls

- HTTP `GET` only, with a `user-agent` naming the tool.
- JSON-RPC methods in `READ_METHODS` (`src/net.ts`): `getLedgerEntries`, `getEvents`, `getLatestLedger`, `getHealth`, `getNetwork`, `getVersionInfo`, `getTransactions`. Any other method throws before a request is made.
- One process-wide limiter: at most one live request per `minIntervalMs` (default 500 ms; values below 500 are rejected).
- Retries: HTTP 429/5xx and network errors, up to 4 attempts, 2/4/8 s backoff. 404 on GET is cached as "absent".
- Cache: `<cache>/<namespace>/<h[0:2]>/<sha256(request)>.{json,bin}`; `--offline` makes a miss throw `OfflineMiss`.

## 3. Harvest (`harvest.json`, format `sik.wasm-catalog.harvest/v1`)

Sources, in order:

1. `se-contracts`: `GET https://api.stellar.expert/explorer/public/contract?order=asc&limit=200&cursor=C`. In stratified mode, `C` takes N values whose first 4 bytes are `floor(i * 2^32 / N)` (rest zero), encoded as contract strkeys; one page per cursor. In `--se-full` mode, start without a cursor and follow `_links.next` until an empty page or `--se-max-pages`. Each record gives `contract` and `wasm` (hash, or absent for non-wasm contracts, recorded as `seWasm: null`).
2. `se-top`: `GET .../top-contracts/invocations` (contract ids only).
3. `rpc-events`: `getEvents` with `filters: [{type: "contract"}]`, `limit: 1000`, at `--event-windows` start ledgers spread evenly over the retention window, re-read with `getHealth` after the listing walk (start at `oldestLedger + 110`, end before `latestLedger - 90`), because a long walk can outlast the oldest ledger.
4. `rpc-instance`: `getLedgerEntries` (100 keys per call) on the contract-instance key for every contract not from `se-contracts`, plus the first `--cross-check` `se-contracts` contracts. The executable is `wasm` (hash recorded), `stellar_asset`, `external_ref` (CAP-85; recorded raw, not resolved), `no_instance` or `unknown`.

Cross-check: for the cross-check subset, `seWasm` must equal the RPC hash (or `seWasm: null` with a `stellar_asset` executable). Agreements and disagreements are recorded.

Selection: if distinct hashes <= `--max-hashes`, all are selected; else the `max/2` hashes used by the most contracts in the harvest, plus the rest in `sha256("<seed>:" + hash)` order. The rule and seed are written to `provenance.selection`.

Fetch: `getLedgerEntries` on `CONTRACT_CODE` keys, 10 per call; then, for misses, `GET https://api.stellar.expert/explorer/public/wasm/<hash>` unless `--no-se-wasm`. Every blob must satisfy `sha256(bytes) == hash` or it is discarded (`fetch: "hash_mismatch"`). Outcome per hash: `rpc`, `stellar.expert`, `missing`, `hash_mismatch`, `error`.

## 4. Decoding (`src/decode.ts`)

- Wasm walk: magic `\0asm`, version 1, section ids 0..13, LEB128 u32 sizes (max 5 bytes), every range bounds-checked, custom-section names must be UTF-8, blobs over 4 MiB rejected. Nothing is compiled or executed (lint rule: no `WebAssembly.` in `src/`).
- `codeSha256` = sha256 over the 8-byte header plus every non-custom section in file order.
- `contractspecv0`: all sections with this name are concatenated in file order and decoded as a stream of `ScSpecEntry` with `new contract.Spec(bytes)`. `sdkDecodes` records success. `sdkFromWasm` records whether `contract.Spec.fromWasm(blob)` succeeds (it rejects more than one spec section).
- `spec.sha256` = sha256 of the concatenated spec bytes. `spec.interfaceSha256` = sha256 of `interfaceKey(entries)`: each entry's canonical JSON with every `doc` removed, the list sorted, then canonical JSON again.
- `contractmetav0`: every section, stream of `ScMetaEntry` (kind 0, key, val). Each entry is also validated with the SDK's `xdr.ScMetaEntry`. Interpreted keys: `rsver`, `rssdkver` (split on `#` into version and commit), `cliver`, `sep` (SEP-47; comma list, may repeat; merged and de-duplicated), `source_repo` and `home_domain` (SEP-55), `bldimg`, `bldopt`, `bldarg`, `source_uri`, `source_sha256` (SEP-58, each checked against the SEP's regex; conformant only if all present fields match and both `source_sha256` and `bldimg` exist).
- `contractenvmetav0`: stream of `ScEnvMetaEntry` (kind 0, then two u32: protocol, pre-release).
- Failures never throw out of `decodeWasm`; they are recorded as `wasmError`, `spec.error`, `meta.error`, `envMeta.error`.

## 5. Output tree

```
<out>/catalog/<hash>/spec.json    format sik.wasm-catalog.spec/v1: DecodedWasm (spec entries in the SDK JSON form, strings SEP-51 escaped)
<out>/catalog/<hash>/README.md    Markdown page (section 6)
<out>/catalog/<hash>/bindings.ts  TypeScript bindings (section 7); absent when there is no decodable spec
<out>/index.json                  format sik.wasm-catalog.index/v1: one CatalogRow per harvested hash (src/coverage.ts)
<out>/coverage.json               format sik.wasm-catalog.coverage/v1
<out>/COVERAGE.md                 human summary of coverage.json
```

`<hash>` is the lowercase hex sha256 of the blob (the on-ledger wasm hash).

## 6. README.md per hash

Property table (size, code/spec/interface hashes, SDK decode results, env protocol, rssdkver/rsver/cliver, SEP-47/55/58, contracts seen, harvest sources, same-interface and same-code siblings, bindings status), then Functions (Rust-style signature + doc), Types (structs, tuple structs, unions, enums), Errors, Events (prefix topics, data format, params with location), Contract meta table, custom section names, binding diagnostics.

Safety rule: every string taken from the blob appears only inside an inline code span (control characters replaced, backticks replaced by U+02CB, pipes escaped, length capped at 160) or inside a fenced block whose fence is longer than any backtick run in the content. No string from the blob is emitted as Markdown, HTML or a link.

## 7. bindings.ts

One self-contained file per hash:

- `import { contract } from "@stellar/stellar-sdk"` and type-only aliases (`u32`, `i128`, `Timepoint`, ...) from `@stellar/stellar-sdk/contract`.
- `WASM_HASH`, `SPEC_XDR` (base64 entries), one type per struct (interface, or readonly tuple for tuple structs), union (`{ tag; values }` arms), enum and error enum (`const` object plus a type of its values), `Errors` (code -> `{ message }`, first name wins on a clash), one interface per event plus an `EVENTS` table, `interface Client` with one method per contract function, and `class Client extends contract.Client` that passes `SPEC_XDR` to `contract.Spec`.
- Type mapping: `u32/i32` -> `u32/i32` (number), 64/128/256-bit ints and `timepoint/duration` -> bigint aliases, `bool` -> boolean, `void` -> `null`, `option<T>` -> `T | null` (what `scValToNative` returns for an absent value), `result<T,E>` -> `contract.Result<T>`, `vec<T>` -> `Array<T>`, `map<K,V>` -> `Map<K, V>`, `tuple` -> `readonly [...]` (empty tuple -> `void`), `bytes/bytes_n` -> `Uint8Array`, `string/symbol/address/muxed_address` -> string, `val` -> any, `error` -> `contract.ErrorMessage`, undeclared UDT -> `unknown`.
- Method names follow `contract.Client`'s own sanitising (`[^a-zA-Z0-9_$]` -> `_`, reserved word -> `name_`, leading digit -> `_name`). Functions whose method name collides with a `contract.Client` or `Object.prototype` member, or with an earlier method, are left out of the typed interface. `__constructor` is not a method.
- Names: type names must match `^[A-Za-z_$][A-Za-z0-9_$]*$` and not be a reserved word or a name the file uses (`Client`, `Map`, `Array`, `Uint8Array`, `Promise`, `Errors`, `contract`, the integer aliases, `WASM_HASH`, `SPEC_XDR`, `EVENTS`); otherwise they are rewritten and numbered (`Client_2`). Property keys are kept verbatim (quoted when not identifiers) because the runtime keys arguments and fields by spec name. Every rename, collision, duplicate error code and undeclared type reference is reported as a diagnostic string.
- Doc text goes into `/** */` with `*/` written as `*\/`, CR/LF and U+2028/9 normalised, other control characters replaced.

## 8. Coverage (`coverage.json`)

Counts over the harvest and the decoded blobs: contracts by source and executable, hashes seen/selected/fetched, wasm parse, spec present/decodes/`fromWasm`/multi-section/empty, events declared, meta present/decodes, env meta, protocol and soroban-sdk histograms, meta key histogram, SEP-47/55/58 adoption, bindings generated, diagnostic classes, `tsc --strict` pass/fail for our bindings and for the SDK `BindingGenerator` output (with error-code histograms), and duplicate groups by interface hash, spec bytes and code hash.
