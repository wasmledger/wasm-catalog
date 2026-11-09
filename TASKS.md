# Tasks

Status values: TODO, IN-PROGRESS(date), DONE(date), BLOCKED(reason).

| Id | Title | Deps | Acceptance | Status |
|---|---|---|---|---|
| WCT-001 | Prior-art re-check | none | PRIOR-ART.md with dated searches and a verdict; STOP or narrowed scope | DONE(2026-11-04): partial overlap (SoroVault, stellar.expert, Lab, Stellar Registry, SDK BindingGenerator); narrowed to census + binding quality + static tree; no STOP |
| WCT-002 | Scaffold: ten-doc set, TS project, lint, `.gitignore` for `out/` and `.cache/` | WCT-001 | `pnpm run check` green | DONE(2026-11-04) |
| WCT-003 | Rate-limited, cached, read-only network layer | WCT-002 | GET + allow-listed RPC reads only; <= 2 req/s; 429 retry; offline mode; tests | DONE(2026-11-04) |
| WCT-004 | Wasm section walker | WCT-002 | Bounds-checked; malformed-blob tests; no WebAssembly API (lint) | DONE(2026-11-04) |
| WCT-005 | Decoder: contractspecv0, contractmetav0, contractenvmetav0; SEP-47/55/58 | WCT-004 | Synthetic + mainnet fixtures; failures recorded, never thrown | DONE(2026-11-04) |
| WCT-006 | Harvester: stellar.expert listing (stratified/full), top contracts, RPC events, instance lookup, cross-check, selection, fetch by hash with fallback | WCT-003 | Live run on mainnet; hash check on every blob; fake-network end-to-end test | DONE(2026-11-04): 282 hashes from a 3715-contract sample, 282/282 fetched |
| WCT-007 | Markdown page per hash | WCT-005 | Functions, types, errors, events, meta, env; adversarial fixture renders inert | DONE(2026-11-04) |
| WCT-008 | TypeScript bindings generator on contract.Spec | WCT-005 | Every type form; hostile names neutralised; `tsc --strict` passes on all mainnet sample bindings | DONE(2026-11-04): 280/280 pass |
| WCT-009 | Catalog build, index.json, coverage + near-duplicate census | WCT-007, WCT-008 | `out/catalog/<hash>/{spec.json,README.md,bindings.ts}`, `index.json`, `coverage.json`, `COVERAGE.md` | DONE(2026-11-04) |
| WCT-010 | Fixtures: synthetic (own) and mainnet capture scripts with provenance | WCT-006 | `fixtures/synthetic/*.provenance.json`, `fixtures/mainnet/capture.provenance.json`; < 1 MB | DONE(2026-11-04) |
| WCT-011 | Binding comparison: ours vs SDK BindingGenerator (mainnet sample) vs stellar CLI (own fixtures only) | WCT-008 | `census/binding-comparison.md`; SDK failures in COVERAGE | DONE(2026-11-04) |
| WCT-012 | Full stellar.expert walk: contract -> hash census for all listed mainnet contracts | WCT-006 | Hash count over all listed contracts in `census/` | DONE(2026-11-04): 832 pages, 166,101 listed contracts, 4,200 distinct hashes; 200/200 cross-check |
| WCT-013 | Fetch and decode every distinct mainnet hash (not only a sample) | WCT-012 | Coverage over all hashes; `out/` size and run time recorded | DONE(2026-11-04): 4,200/4,200 fetched via RPC, 85 MB wasm, 214 MB tree, build 450 s; first build cut by a reboot, re-run from the intact harvest |
| WCT-014 | Hashes no contract runs today: uploaded-but-undeployed and superseded wasm (contract `versions` history, upload txs from the Galexie lake or RPC `getTransactions`) | WCT-012 | Count of such hashes and how they were found | TODO |
| WCT-015 | Testnet support (`--network testnet`: RPC URL, stellar.expert `testnet` path, passphrase) | WCT-006 | Testnet harvest + build | TODO |
| WCT-016 | Resolve CAP-85 external executable refs (owner + tag -> wasm hash) | WCT-006 | Contracts with `external_ref` resolved or explained; fixture | TODO |
| WCT-017 | Incremental watcher: new uploads/deploys since the last run (laboratory-backend#36 "service watches for new wasms") | WCT-014 | Re-run adds only new hashes; idempotent tree | TODO |
| WCT-018 | Near-duplicate depth: function-set similarity (Jaccard) and "same interface as a known template" labels (OZ, SAC-like SEP-41) | WCT-009 | Report section with method and thresholds | DONE(2026-11-08): `src/similarity.ts` (exact Jaccard over function-name sets, single-linkage clusters at 0.8, top-5 neighbours, SEP-41 / SEP-41+SAC-admin labels by name and arity); `census/full-walk-2026-11-04/SIMILARITY.md`: 594 clusters over 2,079 hashes, 235 SEP-41 hashes. OZ template labels not done (needs reference OZ build hashes; WCT-028) |
| WCT-019 | Upstream drafts: issues for the SDK BindingGenerator failures (TS2749 error enums used as types, TS2305 undeclared types, TS2395 merged-declaration clash) and the CLI field renaming | WCT-011 | Drafts in `drafts/` with minimal synthetic repros; user posts | DONE(2026-11-04): drafts only |
| WCT-020 | Publishing decision: git repo of the tree, jsr/npm per-hash packages, hosted pages (needs the user; UI work needs a taste-skill first) | WCT-013 | Written decision in `docs/` of this project | TODO |
| WCT-021 | Bindings runtime smoke: instantiate generated `Client` against a mocked RPC for a few hashes and check method dispatch and arg encoding | WCT-008 | Tests with a fake `rpc.Server` | DONE(2026-11-08), narrower than written: `test/bindings-runtime.test.ts` instantiates the generated Client for the 2 `examples/catalog` hashes, checks every spec function is a method, and builds every scalar-argument call with `simulate:false` (no RPC; encoding compared with `nativeToScVal`). No mocked RPC, no UDT arguments: WCT-029 |
| WCT-023 | Make `buildCatalog` resumable or atomic (write to a temp dir, rename at the end) so an interrupted build cannot leave a half tree | WCT-009 | Kill mid-build, re-run, identical output | TODO |
| WCT-024 | Web export: `scripts/web-data.ts` (`pnpm demo:data`) writes summary, compact index, per-hash shards and contract lookup with provenance | WCT-013, WCT-018 | Summary figures equal the committed census (test) | DONE(2026-11-08): 4,200 rows, 256 hash shards, 32 contract shards, 36 MB |
| WCT-025 | Web catalog browser (`web/`): overview, catalog search, hash page, census, clusters, SEP adoption, method | WCT-024 | `pnpm build` offline from committed data; kit design system; provenance on every figure | DONE(2026-11-08): Vite + React + TS strict + Tailwind v4, kit tokens copied, accent WCT; checked in both themes at 375 and 1440 px; no horizontal scroll at 375 |
| WCT-026 | Live check in the browser: RPC `getLedgerEntries` for a hash, parse the entry, sha256 via WebCrypto, show match | WCT-025 | Tests on a recorded RPC response | DONE(2026-11-08): `web/src/lib/live.ts`, 6 tests on `fixtures/mainnet/ledger-entries.json`; one real check from the browser matched at ledger 65,367,013 |
| WCT-027 | Investor and launch docs: MVP-PLAN, DEMO, PITCH, DEPLOY, README status | WCT-025 | Files exist; every number traceable to census | DONE(2026-11-08) |
| WCT-028 | OZ template labels: build reference hashes of OpenZeppelin stellar-contracts examples and label exact/near matches | WCT-018 | Reference build reproducible; labels in index | TODO |
| WCT-029 | Bindings runtime at scale: UDT arguments, simulation against a mocked RPC, many hashes (sampled from the full tree) | WCT-021 | Pass rate over a stated sample | TODO |
| WCT-030 | Archive the recorded harvest (`out/harvest-full`, 553 MB, gitignored) or ship a checksum of it, so `pnpm demo:data` can be re-run from a clean checkout. Found by the 2026-11-08 audit; the demo itself does not need it (committed `web/public/data` is tested against `census/`) | WCT-024 | A documented location and sha256 for the archive | TODO |
| WCT-022 | Other binding targets via the same model (Python/Rust) or a contribution to SoroVault / lightsail instead | WCT-020 | Decision recorded | TODO |

## Cross-project requests

- `export-gate` (#13): its `census/CENSUS.md` (2026-11-03) reports 54 fetch errors and 3 wasm checked out of its top 100 contracts. Our harvester fetched 282/282 selected hashes from the same RPC on 2026-11-04 using batched `getLedgerEntries` on `CONTRACT_CODE` keys with a stellar.expert fallback; it could read `out/harvest/wasm/` or `harvest.json` as input. Owner decides; no change made there.
- `token-invariants` (#10): `index.json` rows carry function names via `spec.json`; a SEP-41 candidate list could come from here instead of a separate crawl. Owner decides.
