// SPDX-License-Identifier: Apache-2.0
// Catalog search over the pre-built index. Pure functions so they can be tested
// and stay fast on 4,200 rows (one pass, no allocation per keystroke beyond the result).
import type { WebRow } from './types';

export type QueryKind = 'empty' | 'contract' | 'hash' | 'text';

const CONTRACT = /^C[A-Z2-7]{55}$/;
const HASH_PREFIX = /^[0-9a-f]{4,64}$/;

export function classify(q: string): { kind: QueryKind; value: string } {
  const t = q.trim();
  if (!t) return { kind: 'empty', value: '' };
  if (CONTRACT.test(t.toUpperCase()) && /^c/i.test(t)) return { kind: 'contract', value: t.toUpperCase() };
  if (HASH_PREFIX.test(t.toLowerCase())) return { kind: 'hash', value: t.toLowerCase() };
  return { kind: 'text', value: t.toLowerCase() };
}

export interface Filters {
  spec: 'any' | 'with' | 'without';
  sep41: boolean;
  events: boolean;
  repo: boolean;
  protocol: number | 'any';
  sdkFails: boolean;
}

export const NO_FILTERS: Filters = { spec: 'any', sep41: false, events: false, repo: false, protocol: 'any', sdkFails: false };

export type SortKey = 'contracts' | 'functions' | 'size' | 'created' | 'hash';

/** Rows matching a hash prefix or text query (function name, soroban-sdk version, source repo) and the filters. */
export function search(rows: WebRow[], q: string, f: Filters, sort: SortKey = 'contracts'): WebRow[] {
  const { kind, value } = classify(q);
  const out = rows.filter((r) => {
    if (f.spec === 'with' && !r.sp) return false;
    if (f.spec === 'without' && r.sp) return false;
    if (f.sep41 && !r.lab.includes('sep41')) return false;
    if (f.events && !(r.ev && r.ev > 0)) return false;
    if (f.repo && !r.repo) return false;
    if (f.protocol !== 'any' && r.p !== f.protocol) return false;
    if (f.sdkFails && r.sg !== 'fail') return false;
    if (kind === 'hash') return r.h.startsWith(value);
    if (kind === 'text') {
      return r.fns.some((n) => n.toLowerCase().includes(value)) || (r.sdk ?? '').startsWith(value) || (r.repo ?? '').toLowerCase().includes(value);
    }
    return true;
  });
  const by: Record<SortKey, (a: WebRow, b: WebRow) => number> = {
    contracts: (a, b) => b.n - a.n,
    functions: (a, b) => (b.f ?? -1) - (a.f ?? -1),
    size: (a, b) => (b.sz ?? -1) - (a.sz ?? -1),
    created: (a, b) => (b.cr ?? '').localeCompare(a.cr ?? ''),
    hash: () => 0,
  };
  return out.sort((a, b) => by[sort](a, b) || a.h.localeCompare(b.h));
}

/** Function names in a row that match a text query, for highlighting why a row matched. */
export function matchedFunctions(r: WebRow, q: string, limit = 3): string[] {
  const { kind, value } = classify(q);
  if (kind !== 'text') return [];
  return r.fns.filter((n) => n.toLowerCase().includes(value)).slice(0, limit);
}
