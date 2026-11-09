// SPDX-License-Identifier: Apache-2.0
// Loaders for the committed catalog data. The summary is small and loads first;
// the 4,200-row index loads when the catalog is opened; per-hash detail and the
// contract lookup load one shard at a time. Every promise is cached.
import { gunzipToText } from './gz';
import type { HashDetail, Summary, WebIndex } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

async function getText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return await gunzipToText(new Uint8Array(await res.arrayBuffer()));
}

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export const loadSummary = () => once('summary', async () => JSON.parse(await getText('summary.json')) as Summary);
export const loadIndex = () => once('index', async () => JSON.parse(await getText('index.json')) as WebIndex);

export async function loadDetail(hash: string): Promise<HashDetail | null> {
  const key = hash.slice(0, 2).toLowerCase();
  const shard = await once(`h/${key}`, async () => JSON.parse(await getText(`h/${key}.json.gz`)) as { hashes: Record<string, HashDetail> });
  return shard.hashes[hash] ?? null;
}

/** Contract ID -> wasm hash, or the executable kind (`stellar_asset`, `no_instance`, `no_wasm_listed`). Null: not in the listing. */
export async function lookupContract(id: string): Promise<string | null> {
  const key = id.charAt(2);
  const shard = await once(`c/${key}`, async () => JSON.parse(await getText(`c/${key}.json.gz`)) as Record<string, string>);
  return shard[id] ?? null;
}
