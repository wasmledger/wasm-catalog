# wasm-catalog

A catalog of mainnet Soroban contract code keyed by wasm hash: a read-only harvester, a decoder for the Soroban custom sections, a Markdown page and TypeScript bindings per hash, and a coverage and near-duplicate census. Opening A10 in the discovery report; source issue [stellar/laboratory-backend#36](https://github.com/stellar/laboratory-backend/issues/36) (SDF brainstorm, 0 comments).

**Live catalog: https://wasm-catalog.vercel.app/** (static site, recorded mainnet capture of 2026-11-04, read-only, unaudited). Source: https://github.com/wasmledger/wasm-catalog

Package `@sik/wasm-catalog` (private). Ticket prefix WCT. Node 24, pnpm 10.22, `@stellar/stellar-sdk` ^17.3 (17.4.0 resolved), TypeScript 7.

**Scope after prior art (PRIOR-ART.md):** per-contract interface viewers, an on-demand ABI registry with TS clients (SoroVault), publisher registries (Stellar Registry) and binding generators (stellar CLI, SDK `BindingGenerator`, lightsail) already exist. This project therefore focuses on (1) the mainnet census, (2) binding quality at scale, and (3) a static hash-keyed tree that SDF Lab could consume. The static web catalog is hosted (link above); per-hash pages on an official SDF host, package publishing and MCP generation from #36 are not built.

## Status (2026-11-09)

MVP for an investor demo: see [MVP-PLAN.md](MVP-PLAN.md), [DEMO.md](DEMO.md), [PITCH.md](PITCH.md), [DEPLOY.md](DEPLOY.md). Gates: MAINNET READ-ONLY, UNAUDITED, G-VALUE closed.

| Part | State | Evidence |
|---|---|---|
| Harvester (`wct harvest`) | Works, live on mainnet. Sources: stellar.expert contract listing (stratified or full walk), stellar.expert top contracts, RPC `getEvents`; instance lookup and wasm fetch via RPC `getLedgerEntries`, stellar.expert `/wasm/{hash}` fallback; sha256 checked on every blob | Sample and full runs below; fake-network test |
| Decoder (`contractspecv0`, `contractmetav0`, `contractenvmetav0`, SEP-47/55/58) | Works | 13 mainnet + 9 synthetic fixtures; our encoder re-encodes 54/54 real specs byte for byte |
| README.md per hash | Works; untrusted text rendered inert | adversarial fixture test |
| bindings.ts per hash (own generator on `contract.Spec`) | Works; 280/280 (sample) and 4,191/4,191 (full) pass `tsc --strict`. Runtime: smoke-tested offline on the 2 `examples/` hashes (every function is a client method; every scalar-argument call builds and encodes as the SDK encodes it). UDT arguments, simulation and many-hash runtime tests not done (WCT-029) | `census/*/COVERAGE.md`, `test/bindings-runtime.test.ts` |
| Coverage + near-duplicate census | Works | `census/sample-2026-11-04/`, `census/full-walk-2026-11-04/` |
| Near-duplicate depth (function-name Jaccard, SEP-41 / SAC-admin labels) | Works (WCT-018): 594 clusters at Jaccard >= 0.8 over 2,079 hashes; 235 hashes have the full SEP-41 function set. OZ template labels not done (WCT-028) | `census/full-walk-2026-11-04/SIMILARITY.md`, `test/similarity.test.ts` |
| Web catalog (`web/`, static) | Works: overview, search (function, hash prefix, contract ID), per-hash page (interface, bindings download, contracts, related code), census charts, clusters, SEP adoption, method and limits. Builds offline from committed `web/public/data/` (36 MB) | `pnpm -C web build`; `test/webdata.test.ts` checks the data against the census |
| Live check of one hash against mainnet (browser) | Works: one read-only `getLedgerEntries`, XDR parsed, sha256 by WebCrypto. 2026-11-08: match for `0a41411f…` at ledger 65,367,013 | `web/test/lib.test.ts` (recorded RPC reply) |
| Binding comparison | SDK `BindingGenerator` on the same specs: 190/280 (sample) and 3,032/4,191 (full) pass `tsc`. stellar CLI 25.2.0 on our own fixtures: passes `full.wasm`, emits unparseable TS for `adversarial.wasm` | `census/binding-comparison.md` |
| Full stellar.expert walk (all listed contracts) | Done 2026-11-04: 166,101 listed contracts, 4,200 distinct hashes | `census/full-walk-2026-11-04/` |
| Hashes no contract runs today (undeployed uploads, superseded versions) | Not done (WCT-014) | |
| Every distinct hash run by a listed contract: fetched, decoded, paged, bindings type-checked | Done 2026-11-04: 4,200/4,200 fetched, 4,191 bindings, all pass `tsc --strict` | `census/full-walk-2026-11-04/` |
| Testnet, CAP-85 external refs, incremental watcher | Not done (WCT-015/016/017) | |
| Regenerating `web/public/data` from a clean checkout | Not possible yet: `pnpm demo:data` needs the 553 MB recorded harvest in `out/` (gitignored, this machine only). The committed data is verified against `census/` by `test/webdata.test.ts` (WCT-030) | |
| Publishing | Git repo public at wasmledger/wasm-catalog and static web catalog on Vercel, both 2026-11-09. Not done: jsr/npm packages, per-hash bindings packages, hosting under an SDF domain (WCT-020); checklist in DEPLOY.md | https://wasm-catalog.vercel.app/ |

### Sample run, 2026-11-04 (measured)

Method: 16 stellar.expert listing pages starting at cursors spread evenly over the contract-id keyspace (3,200 contracts, a stratified sample of all contracts), the top 100 contracts by invocations, 24 RPC `getEvents` windows over the retention window (24,000 events), RPC instance lookups (715) with a 200-contract cross-check of the listing (200/200 agree), then every distinct hash fetched. 78 live requests, 23 MB, a few minutes.

| Measure | Value |
|---|---|
| Contracts | 3,715 (3,221 with a wasm hash; the rest are Stellar Asset Contracts or event emitters with no instance) |
| Distinct wasm hashes | 282, all fetched from RPC and hash-verified |
| With `contractspecv0` | 280 (99.3%); all 280 decode with SDK 17.4.0, also via `Spec.fromWasm` |
| Declare SEP-48 events | 101 (35.8%) |
| With `contractmetav0` / `contractenvmetav0` | 280 / 282 |
| Env protocol | 20: 24, 21: 14, 22: 85, 23: 41, 25: 55, 26: 21, 27: 13, 28: 26, 29: 3 |
| SEP-47 `sep` meta | 1 hash |
| SEP-55 `source_repo` | 13 hashes |
| SEP-58 build fields | 4 hashes |
| Same interface (docs and order ignored) | 6 groups, 15 hashes; the largest: 5 hashes, 129 contracts, soroban-sdk 22.0.3 / 22.0.7 / 23.0.2 |
| Same code with custom sections stripped | 0 groups |
| Our bindings, `tsc --strict` | 280 pass, 0 fail |
| Diagnostics our generator handled | same error code under two names across error enums (121 occurrences), references to types the spec does not declare (82), duplicate type/event names (44), reserved or taken names (3) |
| SDK `BindingGenerator`, `tsc --strict` | 190 pass, 90 fail: TS2749 (error enum used as a type, 57 hashes), TS2305 (undeclared type imported, 38) |

These are sample figures for contracts that exist today; they say nothing about wasm uploaded but never deployed.

### Full walk

Run 2026-11-04, measured: `wct harvest --se-full --max-hashes 5000 --interval-ms 1000` walked the whole stellar.expert listing (832 pages, 166,101 contracts; about 75 min at 1 req/s plus endpoint latency), added the top-100 list and 24 RPC event windows, cross-checked 200 listing entries against RPC (200/200 agree), then fetched **every one of the 4,200 distinct hashes** from RPC `getLedgerEntries` (none needed the stellar.expert fallback; 85 MB of wasm). The build (`--typecheck --compare-sdk`, offline) took 450 s. A reboot interrupted the first build after 2,996 of 4,200 pages; the harvest on disk was intact (4,200/4,200 blobs re-hashed OK), and the build was re-run from it in full. Results: `census/full-walk-2026-11-04/` (`COVERAGE.md`, `coverage.json`, `hashes.csv`); the 214 MB tree is in `out/full/` (gitignored).

| Measure | Value |
|---|---|
| Contracts | 166,382 (161,949 with a wasm hash; 4,152 listed without one, presumably Stellar Asset Contracts [I]; 281 more found through RPC with no instance) |
| Distinct wasm hashes run by those contracts | 4,200, all fetched and hash-verified |
| With `contractspecv0` | 4,191 (99.8%); all decode with SDK 17.4.0, all via `Spec.fromWasm`; none split over sections |
| With `contractmetav0` / `contractenvmetav0` | 4,184 / 4,200 |
| Declare SEP-48 events | 1,150 (27.4%) |
| SEP-47 `sep` / SEP-55 `source_repo` / SEP-58 fields | 11 / 168 / 33 hashes |
| Env protocol | 0: 7, 20: 419, 21: 370, 22: 1,120, 23: 643, 25: 783, 26: 366, 27: 266, 28: 180, 29: 46 |
| Contracts per hash | 1: 3,035 hashes; 2-9: 931; 10-99: 208; 100-999: 18; 1,000+: 8. One hash (`07097f83...`, soroban-sdk 22.0.7, 12 functions) runs 131,459 contracts (79%) |
| Same interface (docs and order ignored) | 468 groups covering 1,260 hashes (3,399 distinct interfaces); largest 18 hashes across soroban-sdk 20.2 to 25.1 |
| Same spec bytes / same code with custom sections stripped | 435 groups (1,129 hashes) / 78 groups (174 hashes) |
| Our bindings, `tsc --strict` | **4,191 pass, 0 fail** |
| Diagnostics our generator handled (hashes) | undeclared type references 255, same error code under two names 212, duplicate names 199, reserved/taken names 15, two functions on one method name 1 |
| SDK `BindingGenerator` output, `tsc --strict` | 3,032 pass, **1,159 fail** (TS2749 error enum used as type: 890 hashes; TS2305 undeclared type import: 225; TS2304: 62; TS2300 duplicate identifier: 50; TS2451: 37; others: 20) |

Still not covered: wasm uploaded but run by no contract today, and superseded versions (WCT-014).

## Run

```sh
pnpm install
node src/cli.ts harvest --out out/harvest                 # live, read-only, <= 2 req/s, cached in .cache/
node src/cli.ts build --harvest out/harvest --out out --typecheck --compare-sdk   # offline
node src/cli.ts decode some.wasm                          # one blob -> JSON
node src/cli.ts page some.wasm --out dir                  # one blob -> spec.json, README.md, bindings.ts
node scripts/make-synthetic.ts                            # regenerate our own fixtures
node scripts/capture-fixtures.ts out/harvest out/index.json  # refresh mainnet fixtures from a run
node scripts/compare-bindings.ts                          # ours vs SDK vs stellar CLI, own fixtures only
pnpm demo:data                                            # out/full + out/harvest-full -> web/public/data + SIMILARITY.md (offline)
```

Web catalog (data is committed, so this works from a clean checkout):

```sh
cd web && pnpm install --frozen-lockfile && pnpm build && pnpm preview   # http://localhost:4173
```

Output tree (`out/`, gitignored; 17 MB for the 282-hash sample, 214 MB for all 4,200): `catalog/<hash>/{spec.json,README.md,bindings.ts}`, `index.json`, `coverage.json`, `COVERAGE.md`. Two entries are copied to `examples/catalog/` to show the shape.

## Check

```sh
pnpm run lint        # SPDX headers, WCT ticket ids, no keys in fixtures, no WebAssembly API in src/
pnpm run typecheck   # tsc --noEmit
pnpm run test        # 37 tests, offline
pnpm run check       # all three
pnpm run check:all   # check + web tests (9) + web build
```

## Safety

Wasm blobs are parsed, never compiled or executed. Network use is HTTP GET and allow-listed RPC reads, one request per >= 500 ms, cached. The stellar CLI is run only on our own synthetic fixtures. No keys, no transactions, no outreach (unposted drafts stay local, gitignored).

## Layout

`src/` code (see ARCHITECTURE.md), `test/`, `scripts/`, `fixtures/synthetic` (own), `fixtures/mainnet` (captured, with provenance), `census/` (committed run results), `examples/`, `drafts/` (unposted upstream text; kept local and gitignored, not in this repo).
