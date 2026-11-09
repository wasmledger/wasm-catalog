# Prior art (WCT-001)

Searched 2026-11-04. Trust tags: [P] primary source read, [V] checked by us on the date, [S] secondary, [I] inference, [U] unverified.

## Verdict

**Partial overlap, no STOP. Scope narrowed.** Nobody we found publishes a static, hash-keyed catalog of mainnet wasm with docs and bindings, or measures coverage and near-duplicates across mainnet. But every building block exists: per-contract interface viewers (stellar.expert, Stellar Lab), an on-demand ABI registry with TypeScript clients and Markdown docs (SoroVault), multi-language on-demand binding generators (stellar CLI, lightsail `stellar-contract-bindings`), and a TypeScript binding generator inside `@stellar/stellar-sdk` itself (`BindingGenerator`, 17.x). So "docs and bindings per wasm" is not new.

What is left, and what this project does:

1. **Mainnet census**: which wasm hashes exist, how many carry a spec / meta / env meta, SEP-47/55/58 adoption, how many still decode on the current SDK, and the near-duplicate structure (same interface, same spec bytes, same code once custom sections are stripped). No source above publishes this.
2. **Binding quality at mainnet scale**: generate and type-check bindings for every harvested hash, with our generator and with the SDK's, and record why they fail. This found real SDK generator failures (see README).
3. **A static git-able tree keyed by hash** (`catalog/<hash>/{spec.json,README.md,bindings.ts}` + `index.json`), the shape laboratory-backend#36 asks for, as an input SDF Lab could adopt. The hosted docs site, jsr/npm publishing and MCP generation from the issue are out of scope for v1 and need the user's decision.

We do not claim "first" or "novel" (gate G-NOVELTY): the census and binding-quality angle had no match in the searches below, which is not proof that nobody has done it privately.

## What we checked

| Candidate | What it does | Overlap | Evidence |
|---|---|---|---|
| stellar/laboratory-backend#36 | SDF brainstorm (janewang, 2026-02-13): stream testnet/pubnet ledgers, capture every wasm into a git repo by hash, docs.rs-style site `stellarcontracts.rs/<hash>`, bindings auto-published to jsr `@stellar-contracts/<hash>`, verified status, MCP per wasm | The goal itself; open, 0 comments, unassigned | [V] `gh api repos/stellar/laboratory-backend/issues/36` 2026-11-04 |
| stellar/laboratory-backend (code) | Express + Prisma API: `contract_data`, `keys`, `network_limits` routes only | None for wasm | [V] repo tree 2026-11-04; no wasm/spec module |
| Stellar Lab contract explorer | Per contract id: Contract Info (wasm hash, repo), Contract Spec/Meta/Env Meta viewer (Interface/JSON/XDR), Download Wasm, Build Info (SEP-55 attestation), Version History, Storage, Invoke. The "Bindings" tab is static text pointing to the stellar CLI | Per-contract viewer, on demand; no bindings generated, no catalog, no census | [P] developers.stellar.org "Contract Explorer" page (local mirror `zero-to-one-discovery/data/docs/md/tools__lab__smart-contracts__contract-explorer.mdx`); [V] `stellar/laboratory` `src/app/(sidebar)/smart-contracts/contract-explorer/components/Bindings.tsx` is a `<Notification>` with a link, 2026-11-04 |
| stellar.expert | Contract pages with interface view (parsed in browser by `@stellar-expert/contract-wasm-interface-parser`, MIT), versions history, validation status; API: `/explorer/{network}/contract/{id}`, `/contract/{id}/versions`, `/wasm/{hash}` (binary), plus undocumented listing `/explorer/public/contract?order&limit&cursor` and `/top-contracts/{metric}` | Indexes every contract with its current wasm hash, serves blobs by hash. No per-hash docs pages, no bindings, no coverage/near-duplicate reports | [V] `open-api/contracts-api.yml` in `stellar-expert/stellar-expert-explorer` (MIT); [V] GETs 2026-11-04; Lab's `useSEContractWasmBinary.ts` calls `/wasm/{hash}` |
| soroworks/sorovault | Go service (Apache-2.0, created 2026-08-07, 3 stars, "MVP"): register a contract **by id**, fetch wasm, decode `contractspecv0`, store, serve searchable ABI JSON + small server-rendered UI; versioning on upgrade; "find contracts that share a WASM"; TypeScript typed-client generator; Markdown reference generator; SEP-41 detection | Closest match for docs + TS client + shared-wasm lookup. On-demand per contract (no mainnet crawler), verified against testnet, no public instance found, no coverage census | [V] README read via `gh api` 2026-11-04 ("Open ground": more codegen targets, contract names) |
| ANTAPEX/Soroban-Registry | Rust + Next.js package manager/registry (MIT, created 2026-01-21): publish/discover/verify contracts; seeded data | Publisher-driven registry, not a chain census | [V] README 2026-11-04 |
| Stellar Registry (org `stellar-registry`, formerly Aha Labs' loam registry; UI at rgstry.xyz) | On-chain registry contract where publishers name and version wasm; Goldsky indexer of registry events into Postgres + Fly API; React UI with `/wasms`, wasm details and versions pages; CLI plugin; attested-build GitHub Action; pre-built OZ combination wasms | Covers wasm **published to the registry** (opt-in, by name), not every hash on mainnet; no bindings or coverage census seen in the UI tree | [V] org repo list, `indexer` and `ui` READMEs and `ui` file tree via `gh api`, 2026-11-04 (`theahaco/stellar-registry` and `theahaco/loam` return 404) |
| lightsail-network/stellar-contract-bindings | Python CLI + web UI: bindings for Python, Java, Dart, PHP, Swift, KMP from a contract id via RPC; handles SAC and CAP-85 external refs | On-demand bindings, other languages; no catalog | [V] README 2026-11-04 |
| stellar CLI 25.2.0 `contract bindings typescript`, `contract info interface/meta/env-meta` | Bindings and spec/meta dump from `--wasm`, `--wasm-hash` or `--id` | On-demand, one at a time | [V] installed CLI; run on our own fixtures only (census/binding-comparison.md) |
| `@stellar/stellar-sdk` 17.x `BindingGenerator` (`fromWasm`, `fromWasmHash`, `fromContractId`, `fromSpec`) | In-SDK TypeScript bindings generator | Bindings generation is upstream already; we compare against it | [V] `node_modules/@stellar/stellar-sdk/lib/esm/bindings/generator.d.ts`, 17.4.0 |
| AhaLabs `soroban-spec-tools` | Rust spec tooling used by the CLI | Library, not a catalog | [U] repo `AhaLabs/soroban-spec-tools` returned 404 on 2026-11-04; tooling now lives in stellar-cli |
| soroban-docgen/contract-docgen | Markdown/MDX docs from a contract's wasm spec, CI staleness check (MIT, created 2026-10-26, 0 stars) | Docgen for your own contract | [V] README 2026-11-04 |
| Raveu-lab soroban-devkit-core/-cli | TS library: simulate, decode events, generate TS bindings (2026-08) | On-demand bindings | [V] search result description 2026-11-04 |
| kaankacar/soroban-diagnose | Uses `contractspecv0` to name contract errors | Spec consumer, not a catalog | [V] search 2026-11-04 |
| Creit-Tech SorobanHub | Desktop app (last push 2025-09-04) | Stale, per-project | [V] search 2026-11-04 |
| jsr `@stellar-contracts` scope; `stellarcontracts.rs` | Names proposed in #36 | Scope does not exist on jsr ("scopeNotFound"); domain did not resolve | [V] 2026-11-04 |
| shilpachittara/SourceProof | Reproducible-build verification (pinned Docker builder) comparing source to live wasm; REST API, small registry and lookup (2026-06) | Verification, not a catalog; relevant to SEP-58 fields we report | [V] search result description 2026-11-04 |
| Hubble (BigQuery) `contract_code` tables | Full history of contract code entries | Would enumerate every hash ever uploaded, but needs a Google account / BigQuery auth, which agents may not create | [I] from discovery notes; not accessed (AGENT_GUIDE: no sign-ups) |

## Searches run (2026-11-04)

GitHub repository search (7 s between calls): `contractspecv0` (1 hit), `soroban bindings` (12), `soroban docgen` (1), `soroban contract registry` (117, top 15 read), `sorobanhub` (1), `stellar-registry` (top 10), `soroban wasm hash created:>2026-01-01` (3599 total, top 20 read; all app contracts or unrelated tools except ShippedLabs upgrade-safeguard and SaboLabs devkit, which compare or validate builds, not catalog them), `stellar wasm catalog` (0), `soroban contract docs generator` (0), `soroban bindings generator` (0). GitHub org listing `stellar-expert` (repos and licences). npm search `soroban wasm catalog` (no Stellar hits). Web search for stellar.expert wasm API (docs not indexed; read the OpenAPI from source instead).

## SEP status (primary, `stellar/stellar-protocol` `ecosystem/`, read 2026-11-04)

| SEP | Title | Status | Version / updated | Used here |
|---|---|---|---|---|
| SEP-46 | Contract Meta | Active | 1.0.0, 2025-04-16 | `contractmetav0` decoding |
| SEP-47 | Contract Interface Discovery | Draft | 0.1.0, 2025-02-14 | `sep` meta key, comma list, may repeat |
| SEP-48 | Contract Interface Specification | Active | 1.1.0, 2025-04-16 | `contractspecv0` decoding |
| SEP-55 | Contract Build Verification | Draft | 0.4.1, 2025-03-12 | `source_repo`, `home_domain` meta keys |
| SEP-58 | Contract Build Reproducibility for Verification | Draft | 0.6.0, 2026-07-15 | `bldimg`, `bldopt`, `bldarg`, `source_uri`, `source_sha256` and their regexes |

## What would make us STOP later

- SDF ships the #36 service (watch laboratory-backend and laboratory PRs), or stellar.expert adds per-hash bindings/docs pages and a coverage view.
- SoroVault adds a mainnet crawler and a public instance. Then this project should become a contribution there (Apache-2.0) instead of a parallel tool.
