// SPDX-License-Identifier: Apache-2.0
// Build guard: the app ships the committed catalog data in public/data. Fail the
// build with a clear message if it is missing, and print what will ship.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'public', 'data');
const need = ['summary.json', 'index.json', 'h', 'c'];
const missing = need.filter((f) => !existsSync(join(dir, f)));
if (missing.length) {
  console.error(`public/data is missing ${missing.join(', ')}. Run \`pnpm demo:data\` (needs the recorded harvest in ../out, see ../DEMO.md).`);
  process.exit(1);
}
const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
const shards = readdirSync(join(dir, 'h')).length;
console.log(`data: ${s.totals.hashes} hashes, ${shards} shards; recorded mainnet capture, ledger ${s.provenance.latestLedger}, harvested ${s.provenance.harvestedAt}`);
if (shards !== 256) {
  console.error(`expected 256 hash shards, found ${shards}`);
  process.exit(1);
}
