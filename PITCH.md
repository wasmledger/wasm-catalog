# wasm-catalog: one-page brief

<!-- SPDX-License-Identifier: Apache-2.0 -->

Tags: [P] measured by this project (date given), [V] checked by us on the date, [I] inferred, [E] estimate. No figure here is projected or rounded up.

## Problem

A Soroban contract is identified by an address, but what it *does* is the wasm it runs, identified by a sha256 hash. Anyone integrating with, auditing or risk-scoring a contract needs that code's interface, a typed client and the answer to "what else runs this code?"

- SDF asked for this. stellar/laboratory-backend#36 (2026-02-13): capture every wasm by hash, publish docs per hash and auto-generated bindings. Open, unassigned, 0 comments [V 2026-11-04].
- Today's tools work one contract at a time and on demand: Stellar Lab's contract explorer (its Bindings tab points to the CLI), stellar.expert, SoroVault, the stellar CLI, lightsail's multi-language generator. None publishes a census of mainnet code (PRIOR-ART.md, searched 2026-11-04).
- Bindings break at scale. We ran the SDK's own `BindingGenerator` (@stellar/stellar-sdk 17.4.0) on every mainnet spec. Its output fails `tsc --strict` on **1,159 of 4,191** (27.7%), mostly by using an error enum as a type (890 hashes) [P 2026-11-04].
- Self-description is rare. Only 11 of 4,200 hashes declare which SEPs they implement (SEP-47), and 168 declare a source repository (SEP-55) [P 2026-11-04].

## What it does

1. **Harvests** mainnet read-only: the full stellar.expert contract listing plus RPC event windows, then every distinct wasm via RPC `getLedgerEntries`, sha256-checked.
2. **Decodes** the spec, meta and env-meta custom sections (SEP-46/47/48/55/58), never executing the wasm.
3. **Generates** per hash: a Markdown page, `spec.json` and TypeScript bindings hardened against hostile on-chain names. All bindings are compiled with `tsc --strict`.
4. **Measures** coverage, exact duplicates, near-duplicate clusters (function-name Jaccard) and SEP adoption.
5. **Publishes** a static web catalog: search by function, hash or contract ID; per-hash interface, bindings download, related code; a one-click live re-check of any hash against mainnet RPC.

## Who it is for

Tooling teams who want a hash-keyed data source (SDF Lab, explorers, wallets). Integrators who need a typed client for a contract they did not write. Auditors and risk teams asking "which contracts share this code?" and "which tokens look SEP-41?". Ecosystem analysts tracking SDK and protocol adoption.

## Measured today (recorded mainnet capture, ledger 65,293,972, 2026-11-04) [P]

| Measure | Value |
|---|---|
| Contracts in the capture / with a wasm hash | 166,382 / 161,949 |
| Distinct wasm hashes, all fetched and sha256-checked | 4,200 (79.6 MB) |
| With an interface spec; all decode with SDK 17.4.0 | 4,191 (99.8%) |
| Our bindings passing `tsc --strict` | 4,191 of 4,191 |
| SDK `BindingGenerator` output passing `tsc --strict` | 3,032 of 4,191 |
| Single most-used code | 131,459 contracts (81.2% of those with a hash) |
| Same-interface groups / near-duplicate clusters (Jaccard >= 0.8) | 468 / 594 covering 2,079 hashes |
| SEP-41 token function set (names and arity) | 235 hashes, 4,082 contracts |
| Listing vs RPC cross-check | 200 of 200 agree |
| Live re-check in the demo | sha256 match for `0a41411f…`, ledger 65,367,013, 2026-11-08 [V] |

Runtime use of generated clients is smoke-tested offline on two hashes only (method dispatch, scalar argument encoding). It is not yet tested at scale (WCT-029).

## Why Stellar

Contract code is content-addressed and stored on-ledger as `CONTRACT_CODE` entries anyone can read through public RPC. Interfaces are embedded in the wasm itself (SEP-48 `contractspecv0`). A complete, verifiable census can therefore be built from public chain data alone, with no source code, no publisher opt-in and no indexer account. The same work on chains without embedded interfaces needs verified source.

## Roadmap

1. Code no contract runs today: undeployed uploads and superseded versions, from ledger history (WCT-014).
2. Incremental watcher for new uploads, so the catalog stays current (WCT-017). Testnet (WCT-015). CAP-85 external refs (WCT-016).
3. Bindings runtime tests at scale (WCT-029). OpenZeppelin template labels (WCT-028).
4. Publishing decision with SDF (WCT-020): host the tree, contribute it to Lab or SoroVault, or both.

## Risks and gates

- **Absorber risk:** SDF, SoroVault, Stellar Registry or stellar.expert could ship the same. The project stays a small Apache-2.0 data set plus generator that any of them can adopt. Stop triggers are in PRIOR-ART.md.
- **Data source:** enumeration relies on stellar.expert's undocumented listing. It is cross-checked against RPC, and every blob comes from RPC.
- **Untrusted input:** names and docs in specs are attacker-controlled. Generated code and pages neutralise them (adversarial fixture tests). Labels say what the spec claims, not what the code does.
- **Gates:** MAINNET READ-ONLY (no transactions, no keys, G-VALUE closed), UNAUDITED, G-NOVELTY (no "first" claims), G-OUTREACH (upstream issue drafts in `drafts/`, not posted).

## What launch needs

- A static host for `web/dist` (about 36 MB) and a scheduled job to re-harvest and rebuild: 75 minutes of read-only requests at 1 per second plus about 8 minutes of build per run, measured 2026-11-04.
- A decision on publishing per-hash bindings as packages. Not recommended without SDF: it risks looking like an official namespace (RISKS R9).
- A security review of the bindings generator (it turns untrusted input into code). No value is held, so no financial audit is needed.
