# Agent notes: wasm-catalog

Follow `../../docs/AGENT_GUIDE.md`, `GATES.md`, `CONVENTIONS.md` and `SESSION_BUILD_2026-11-03.md` first. Project specifics:

- Run `pnpm run check` before marking a task DONE. The suite is offline; it runs `tsc` several times, so expect minutes on a loaded machine.
- Wasm blobs are untrusted data. Parse them; never compile, instantiate or run them (lint fails on `WebAssembly.` in `src/`). Never point the stellar CLI (or any other tool that might execute or build) at a mainnet blob; `scripts/compare-bindings.ts` runs it on `fixtures/synthetic/` only.
- Network goes through `src/net.ts` only: GET plus the RPC read methods in `READ_METHODS`, one request per >= 500 ms, cached under `.cache/`. Use `--interval-ms 1000` for long stellar.expert walks.
- Anything from a spec or meta section must stay inert: code spans/sized fences in Markdown, identifier allowlist + quoted keys + escaped comments in TypeScript. Add a case to `fixtures/synthetic/adversarial.wasm` (via `scripts/make-synthetic.ts`) for any new rendering path.
- Full catalog output goes to `out/` (gitignored). Commit only `census/`, `examples/` and fixtures (< 1 MB). New mainnet fixtures go through `scripts/capture-fixtures.ts`.
- Do not publish packages, open issues or comment upstream; drafts go in `drafts/`.
