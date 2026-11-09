# Deploy checklist (later phase)

<!-- SPDX-License-Identifier: Apache-2.0 -->

Nothing here has been done. The user decides and runs it; agents do not deploy, publish or push (AGENT_GUIDE, G-OUTREACH).

## 1. Static web catalog (`web/`)

| Item | Value |
|---|---|
| Build | `cd web && pnpm install --frozen-lockfile && pnpm build` (Node >= 22.18, pnpm 10.22) |
| Output | `web/dist/`, about 36 MB (34 MB is `data/`), relative base: serve from any path |
| Routing | Hash routes (`#/h/<hash>`): no server rewrites needed |
| Hosts | Any static host (GitHub Pages, Cloudflare Pages, Netlify, S3 + CDN). `data/h/*.json.gz` and `data/c/*.json.gz` may be served either as raw gzip bytes or with `Content-Encoding: gzip`; the app detects both (`src/lib/gz.ts`) |
| Caching | `assets/*` immutable (hashed names). `data/*` changes on each re-harvest: short TTL or purge on deploy |
| Env vars (build time, optional) | `VITE_WCT_RPC`: mainnet RPC URL for the live check (default `https://mainnet.sorobanrpc.com`). It must be a public, read-only endpoint that allows CORS. No secrets exist or are needed |
| CSP | `default-src 'self'; connect-src 'self' https://mainnet.sorobanrpc.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'sha256-<hash of the inline theme script>'` (the inline theme script in `index.html` needs its hash or `'unsafe-inline'`) |
| Before going public | Re-run `pnpm run check:all`; look at both themes at 375 px and 1440 px; confirm the header gate badges and the capture date on the overview chip |

## 2. Data refresh job (optional, e.g. a scheduled GitHub Action)

Read-only against mainnet. Measured on 2026-11-04: about 75 minutes for the listing walk at 1 request per second, a few minutes to fetch blobs, about 8 minutes to build. Disk: about 190 MB of harvest plus about 330 MB of output.

```sh
pnpm install --frozen-lockfile
node src/cli.ts harvest --se-full --max-hashes 5000 --interval-ms 1000 --out out/harvest-full
node src/cli.ts build --harvest out/harvest-full --out out/full --typecheck --compare-sdk
cp out/full/coverage.json census/<new-dated-dir>/coverage.json   # keep the census with the data
node scripts/web-data.ts --coverage census/<new-dated-dir>/coverage.json --report census/<new-dated-dir>/SIMILARITY.md
pnpm run check:all
```

- Keep `--interval-ms` at 1000 or more for the stellar.expert walk; `src/net.ts` refuses anything faster than 2 requests per second.
- `test/webdata.test.ts` compares the shipped data with `census/full-walk-2026-11-04/coverage.json`; point it at the new census directory when the capture changes.
- No secrets: every request is an unauthenticated GET or a JSON-RPC read (`READ_METHODS` in `src/net.ts`).

## 3. Packages

| Package | State | To publish |
|---|---|---|
| `@sik/wasm-catalog` (CLI: harvest, build, decode, page) | `private: true`, version 0.0.0 | Pick a public scope, set `private: false`, add `files`, `bin` build or keep `.ts` with Node >= 22.18 type stripping, `repository`, changelog. `npm publish --access public` |
| `@sik/wasm-catalog-web` | Private app, never a package | Not published; deploy `dist/` |
| Per-hash bindings (`@stellar-contracts/<hash>` as laboratory-backend#36 suggests) | **Not recommended without SDF.** Code derived from third-party contracts under an official-looking namespace (RISKS R9) | Needs the user's written decision (WCT-020) |
| crates | None (TypeScript project) | n/a |

## 4. Contracts

None. This project deploys no contracts on testnet or mainnet and holds no keys.

## 5. Must never happen

- Any mainnet write. The tools have no signing code and the RPC allow-list is read methods only. Keep it that way (G-VALUE).
- Running the stellar CLI or any build tool on a mainnet blob (the blobs are untrusted); `scripts/compare-bindings.ts` runs only on `fixtures/synthetic/`.
- Committing `out/` or `.cache/` (500 MB+, regenerable), or any key.
- Posting the drafts in `drafts/` without the user (G-OUTREACH).
- Calling the catalog "verified": SEP-55/58 fields are copied and format-checked only.
