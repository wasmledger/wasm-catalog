# Risks

| # | Risk | Effect | Mitigation / status |
|---|---|---|---|
| R1 | Absorber risk: SDF builds laboratory-backend#36 in house, or SoroVault/Stellar Registry/stellar.expert extend to a full catalog | This tool becomes redundant | Keep it small and adoptable (static tree + census + generator, Apache-2.0); the census and binding-quality findings are useful to SDF either way. PRIOR-ART lists stop triggers |
| R2 | Enumeration depends on stellar.expert's undocumented contract listing | Listing could change, rate-limit or disappear; it shows only each contract's current wasm | Cross-checked against RPC (200/200 on 2026-11-04); RPC events source is independent; blobs always come from RPC or are hash-checked. Hubble needs a login (not used). WCT-014 adds upload/version sources |
| R3 | Coverage is of hashes that contracts run today, not every hash ever uploaded | "How many hashes exist" is undercounted | Stated in every report; WCT-014 |
| R4 | Untrusted spec text injected into generated code or pages | Code execution for someone who compiles bindings; phishing links or HTML in pages | Identifier allowlist, quoted keys, `JSON.stringify` literals, escaped comments, `tsc --strict` gate; Markdown only in code spans / sized fences; adversarial fixture and tests. Residual: a human may still trust a malicious contract's names/docs (the page says so) |
| R5 | Malformed or hostile wasm crashes or hangs the parser | Lost run, or worse | Bounds checks, 4 MiB cap, 5-byte LEB128 cap, never compiled or executed (lint rule) |
| R6 | Public endpoint load | Being rate-limited or blocked; unfair load on community infra | <= 2 req/s global (1 req/s used for the full walk), backoff on 429, disk cache so re-runs are offline |
| R7 | Bindings that type-check can still be wrong at runtime (e.g. tuple vs struct encoding, option null vs undefined) | Silent client bugs | Mapping follows `scValToNative`/`contract.Client` behaviour. Offline runtime smoke test on 2 hashes (WCT-021, 2026-11-08): methods exist and scalar arguments encode as the SDK encodes them. UDT arguments, simulation and scale: WCT-029 (not done) |
| R8 | Spec/meta can lie (a contract can claim SEP-41 or a source repo it does not implement) | Misleading catalog entries | Pages label every field as copied from the blob; SEP-58 fields are format-checked only; nothing is "verified" here |
| R9 | Publishing per-hash packages to jsr/npm (as #36 suggests) would publish code derived from third-party contracts under a namespace that looks official | Impersonation / trust issues | Not done; needs the user's decision (WCT-020), G-OUTREACH applies |
| R10 | CAP-85 external executable refs (protocol 30) | Contracts with no direct wasm hash are missed | Recorded as `external_ref`; resolution is WCT-016 |
| R11 | The web catalog is read as current, but it is a dated capture | A viewer trusts a stale mapping (a contract upgraded since) | Every figure carries the recorded-capture chip with ledger and date; the live check is labelled Live; Method page lists what is not covered |

## Gates touched

- G-NOVELTY: no "first"/"novel" claims; PRIOR-ART.md dated 2026-11-04.
- G-OUTREACH: drafts only (`drafts/`).
- G-VALUE / G-SECRETS: no transactions, no keys; network is GET + allow-listed RPC reads.
- G-LICENCE: no third-party code copied. stellar.expert's parser (MIT) and SoroVault (Apache-2.0) were read for comparison only.

## Open questions

- Does SDF want the tree as a git repo (as #36 says), as data inside Lab, or not at all?
- Should per-hash bindings be published as packages at all, given R9?
