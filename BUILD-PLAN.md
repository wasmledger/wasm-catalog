# Build plan

Estimates are [E]: rough guesses by the 2026-11-04 build agent, not measured unless stated.

| Milestone | Contents | Acceptance | Estimate | State |
|---|---|---|---|---|
| M1 First working version | WCT-001..011: harvester, decoder, docs, bindings, coverage, fixtures, comparison | `pnpm run check` green; live sample harvest and build; COVERAGE.md in `census/` | 1 day | done 2026-11-04 |
| M2 All of mainnet | WCT-012..014: full listing walk, fetch and decode every distinct hash, find hashes no contract runs | Coverage over every listed hash; method and gaps documented | measured 2026-11-04: listing walk about 75 min at 1 req/s, fetch-all a few minutes, build 450 s | WCT-012/013 done; WCT-014 TODO |
| M3 Correctness depth | WCT-016, 018, 021: CAP-85 refs, similarity labels, runtime smoke tests for bindings | Tests per item | 2-3 days [E] | TODO |
| M4 Service shape | WCT-015, 017: testnet, incremental watcher | Re-runs are incremental and idempotent | 2 days [E] | TODO |
| M5 Publishing (needs the user) | WCT-020, 022: where the tree lives, per-hash packages, hosted pages, or contributing to SDF Lab / SoroVault instead | Written decision; no outreach by agents | depends on decision | TODO |
