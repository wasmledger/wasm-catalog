# Demo: wasm-catalog

<!-- SPDX-License-Identifier: Apache-2.0 -->

A static web catalog of every Soroban contract code run by a listed Stellar mainnet contract, from the recorded full census of 2026-11-04 (latest ledger 65,293,972). Nothing in the demo writes to any network. One button sends a single read-only RPC call.

## Run it from a clean checkout

Needs Node 24 and pnpm 10.22. Everything below is offline except `pnpm install`. The page needs the network only for the optional live check.

```sh
cd projects/wasm-catalog/web
pnpm install --frozen-lockfile
pnpm build            # checks public/data, tsc --noEmit, vite build -> dist/ (about 36 MB, of which 34 MB is catalog data)
pnpm preview          # http://localhost:4173
```

The catalog data ships in `web/public/data/` (summary, index, 256 hash shards, 32 contract shards). You do not need to regenerate it for the demo.

Checks (from `projects/wasm-catalog`):

```sh
pnpm install --frozen-lockfile
pnpm run check:all    # lint, tsc, 37 core tests, 9 web tests, web build
```

### Regenerating the data (not needed for the demo)

`pnpm demo:data` rebuilds `web/public/data/` and `census/full-walk-2026-11-04/SIMILARITY.md` from the recorded harvest and build in `out/` (gitignored, 500 MB+). Only the machine that ran the 2026-11-04 walk has them. To recreate them from nothing, run the mainnet walk again (about 75 minutes at 1 request per second, read-only), then the offline build (about 8 minutes):

```sh
node src/cli.ts harvest --se-full --max-hashes 5000 --interval-ms 1000 --out out/harvest-full
node src/cli.ts build --harvest out/harvest-full --out out/full --typecheck --compare-sdk
pnpm demo:data
```

A fresh walk produces a new capture with a later ledger. Every figure in the UI then changes to match, and so does its provenance chip.

## Investor script (4 minutes)

Open http://localhost:4173. The header shows three gate badges: MAINNET READ-ONLY, UNAUDITED, G-VALUE CLOSED.

1. **Overview (40 s).** "Soroban contracts run wasm. Each upload is identified by its sha256. We walked the whole public contract listing (832 pages, 166,101 contracts), added 281 more found through RPC (166,382 in all), and fetched every distinct code from mainnet RPC: 4,200 hashes behind 161,949 contracts, each hash-checked." Point at the chip: *Recorded mainnet capture, ledger 65,293,972, 2026-11-04*. Then the tiles: 99.8% carry an interface spec; our TypeScript bindings compile for 4,191 of 4,191; the SDK's own generator compiles 3,032 of 4,191. One code runs 131,459 contracts.
2. **Search (40 s).** In *Find contract code*, click the example `transfer_from`. The catalog lists 411 hashes whose function names contain it (405 expose exactly that name; the search is a substring match), ranked by contracts. Tick *SDK bindings fail* to show token contracts where the official generator's output does not compile. Clear it.
3. **Contract lookup (20 s).** Back on Overview, click the example contract ID `CA7TELVQ…LIUG`. It resolves to the code it runs (wasm `49f8f44b…`), an oracle contract.
4. **Hash page (60 s).** Open `0a41411f…969781` (the top `transfer_from` result, 2,276 contracts). Show *Facts* (soroban-sdk 22.0.6, protocol 22, created 2025-05-09 to 2025-09-23) and the *Interface* tab (16 functions in Rust-like signatures, types, error enums). Click **Check on mainnet**. One call to `mainnet.sorobanrpc.com` returns the wasm. The browser recomputes sha256 and shows *sha256 matches the hash* with a **Live read** chip and the current ledger. On 2026-11-08 at 06:58 UTC this returned a match at ledger 65,367,013, 8,179 bytes, the same size as recorded. Open *Bindings*: our generator passes, with the downloadable `bindings.ts`. *Related code* lists the same-interface and near-duplicate siblings.
5. **Census (40 s).** Contracts created per month (spike in 2026-05, 73,315 contracts: hover the tall bar to see the month; the axis labels every fifth month are centred under their own bars), new distinct code per month, protocol and soroban-sdk versions. *Why SDK-generated bindings fail*: TS2749, an error enum used as a type, hits 890 hashes. Every chart has a Table view and a provenance chip.
6. **Clusters and SEPs (30 s).** 468 same-interface groups. 594 near-duplicate clusters by function-name Jaccard 0.8, with the method printed on the page. SEP adoption: SEP-48 events 27.4% of hashes; SEP-41 function set 235 hashes / 4,082 contracts; self-declared SEP-47 just 11 hashes.
7. **Close on limits (20 s).** *Method and limits* lists what is not covered: undeployed uploads, testnet, CAP-85 refs, updates after the capture, runtime tests at scale. Each has a ticket and a NOT YET AVAILABLE tag.

If the network is down, step 4's live check shows *Read failed* with the error and leaves the recorded data untouched. Skip it and say so.

## What is real and what is not

| On screen | Source |
|---|---|
| Every count, chart and table | Recorded mainnet capture of 2026-11-04 (`census/full-walk-2026-11-04/coverage.json`, exported by `scripts/web-data.ts`); `test/webdata.test.ts` checks the shipped data against the census |
| Live check result | A read the page makes in that session; labelled Live read with its ledger |
| Bindings and specs | Generated on 2026-11-04 from the fetched wasm; type-checked then |
| SEP-41 labels, near-duplicate clusters | Computed from the specs by `src/similarity.ts` (names and arity only) |
| Nothing | is mocked, sampled or estimated |
