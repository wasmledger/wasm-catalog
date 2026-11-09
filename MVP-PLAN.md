# MVP plan: wasm-catalog

<!-- SPDX-License-Identifier: Apache-2.0 -->

Written 2026-11-08 by the MVP build agent. Tags: [P] primary/measured in this project, [I] inferred, [E] estimate, [U] unverified.

## Current state (2026-11-08, before this session)

- Core pipeline works and was run on all of mainnet on 2026-11-04 [P]: harvester (stellar.expert full listing walk, 166,382 contracts; RPC `getLedgerEntries` for code), decoder for `contractspecv0` / `contractmetav0` / `contractenvmetav0`, SEP-47/55/58 meta, Markdown page and TypeScript bindings per hash, coverage and exact-duplicate census. 4,200 distinct hashes fetched and hash-verified; 4,191 bindings pass `tsc --strict` (SDK `BindingGenerator`: 3,032).
- `pnpm run check` (lint, typecheck, 29 tests) was green on 2026-11-04.
- The full 214 MB output tree and the 54 MB harvest live in `out/` (gitignored). Only `census/` summaries, two `examples/` and < 1 MB of fixtures are kept.
- No demo surface. Near-duplicate depth (WCT-018), runtime smoke tests of bindings (WCT-021), undeployed hashes (WCT-014), testnet (WCT-015), CAP-85 refs (WCT-016), watcher (WCT-017) are TODO.

## MVP definition: what an investor sees in 3 to 5 minutes

A static web catalog (`web/`) that opens on the real census and lets the viewer drill into any one of the 4,200 mainnet wasm hashes:

1. **Overview.** Hero figure: 4,200 distinct contract codes behind 161,949 mainnet contracts, with the recorded-capture chip (ledger 65,293,972, 2026-11-04). Tiles: spec coverage, our bindings vs the SDK generator under `tsc --strict`, the one hash that runs 131,459 contracts (81.2% of contracts with a wasm hash). Gate badges (MAINNET READ-ONLY, UNAUDITED, G-VALUE closed) in the header.
2. **Catalog.** Search by hash prefix, function name, or a contract ID (C...); filters (has spec, SEP-41 function set, source repo declared, protocol). Pre-built index, paged list, stays fast at 4,200 rows.
3. **Hash page.** Functions with Rust-like signatures, types, error enums, events, meta (soroban-sdk, Rust, protocol, SEP-47/55/58), contracts seen running it, siblings (same interface / same code / nearest by function set), `tsc` result for our bindings and the SDK's with its error codes, download `bindings.ts` and `spec.json`. A **Check on mainnet now** button does one live read-only `getLedgerEntries` call from the browser, recomputes sha256 of the returned wasm and shows match or mismatch with a Live chip.
4. **Census.** Env protocol, soroban-sdk major versions, contracts-per-hash distribution, contracts created per month (stellar.expert listing timestamps), binding comparison failure classes. Every chart in a ChartFrame with table view and provenance.
5. **Clusters.** Exact groups (same interface, same spec bytes, same code) and near-duplicate clusters by function-name Jaccard (WCT-018), with the method and threshold printed.
6. **SEP adoption.** SEP-41 function set (derived), SEP-48 events, SEP-47 `sep` meta, SEP-55 source repo, SEP-58 build fields; hash-weighted and contract-weighted.
7. **Method and limits.** What was measured, how, and what is not covered (undeployed uploads, testnet, CAP-85, runtime behaviour of bindings).

## Surface choice

**Web app only (`web/`, Vite + React + TS strict + Tailwind v4).** The value is browsing and drilling into 4,200 hashes, which is interactive. A docs site is not built: the developer-facing docs are the per-hash README.md files the CLI already generates, plus this project's README; a Starlight site would repeat them without adding a demo moment. Written reason, per the brief.

Data path: `pnpm demo:data` (`scripts/web-data.ts`) reads `out/full/index.json`, `out/full/catalog/*` and `out/harvest-full/harvest.json` and writes `web/public/data/`:

- `summary.json`: aggregates for overview, census, clusters, SEP pages, with provenance (harvest time, latest ledger, RPC version, build time).
- `index.json`: one compact row per hash (function names included for search).
- `h/<xx>.json.gz`: 256 shards by hash prefix holding `spec.json`, `bindings.ts`, `tsc` diagnostics and up to 200 contract IDs per hash; loaded lazily and gunzipped in the browser (`DecompressionStream`).
- `c/<x>.json.gz`: 32 shards mapping contract ID to hash for the contract search.

The data directory is kept with the project (not gitignored) so `pnpm build` works offline from a clean checkout; regenerating it needs the 2026-11-04 harvest in `out/` (a 75 min mainnet walk, not re-run this session).

## Tasks this session

| Id | Work |
|---|---|
| WCT-018 | `src/similarity.ts`: Jaccard over function-name sets, clusters at a stated threshold, nearest neighbours, and the SEP-41 function-set label; tests; report section |
| WCT-024 | `scripts/web-data.ts` (`pnpm demo:data`): export with provenance; tests that summary figures equal `census/full-walk-2026-11-04/coverage.json` |
| WCT-025 | `web/` app: overview, catalog, hash page, census, clusters, SEPs, method; kit tokens copied, accent `wasm-catalog` (WCT, hue 339) |
| WCT-026 | Live check in the browser: `getLedgerEntries` on `CONTRACT_CODE`, XDR parsing of the entry, sha256 via WebCrypto; tests on a recorded RPC response |
| WCT-021 | Runtime smoke test of generated bindings, if time allows. Done offline (no RPC) on the two example hashes; the rest is WCT-029 and the UI says so |
| WCT-027 | DEMO.md, PITCH.md, DEPLOY.md, README status table, TASKS |

## Left out, and why

- **WCT-014 undeployed / superseded hashes**: needs a ledger-history source (Galexie lake or long `getTransactions` walk); hours of network and disk. The UI states the catalog covers only code run by a listed contract.
- **WCT-015 testnet, WCT-016 CAP-85, WCT-017 watcher**: service-shape work, not needed to show the census; shown as not yet available.
- **WCT-023 atomic build**: robustness, not visible in a demo.
- **Re-harvesting mainnet**: the brief forbids re-running multi-hour network jobs; the demo uses the recorded 2026-11-04 capture and says so on every figure.
- **Hosting, npm/jsr publishing**: later phase, see DEPLOY.md.
- **A docs site**: see surface choice.

## Outcome (2026-11-08)

Done: WCT-018, WCT-021 (narrowed), WCT-024 to WCT-027. `pnpm run check:all` green (lint, tsc, 37 core tests, 9 web tests, web build). The web app was checked in a browser in both themes at 1440 and 375 px; one live check matched at ledger 65,367,013. Still open: WCT-014/015/016/017/020/022/023/028/029 (listed on the app's Method and limits page).
