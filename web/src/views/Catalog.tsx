// SPDX-License-Identifier: Apache-2.0
// Catalog: the 4,200-row index searched in memory, 50 rows per page.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { DataTable, EmptyState, Hash, PageHeader, StatusLabel, formatExact } from '../ui/kit';
import { Ident, Pager, RecordedChip, TemplateTags, ViewSkeleton } from '../ui/parts';
import { loadIndex, lookupContract } from '../lib/data';
import { hrefHash } from '../lib/route';
import { classify, matchedFunctions, NO_FILTERS, search, type Filters, type SortKey } from '../lib/search';
import type { Summary, WebIndex } from '../lib/types';

const PAGE = 50;

export function Catalog({ s, initialQuery }: { s: Summary; initialQuery: string }) {
  const [index, setIndex] = useState<WebIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('contracts');
  const [page, setPage] = useState(0);
  const dq = useDeferredValue(q);

  useEffect(() => {
    loadIndex().then(setIndex, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => setQ(initialQuery), [initialQuery]);
  // Keep the query in the URL without triggering a route change on every keystroke.
  useEffect(() => {
    const url = dq ? `#/catalog?q=${encodeURIComponent(dq)}` : '#/catalog';
    if (window.location.hash !== url) window.history.replaceState(null, '', url);
    setPage(0);
  }, [dq]);
  useEffect(() => setPage(0), [f, sort]);

  const protocols = useMemo(() => [...new Set((index?.rows ?? []).map((r) => r.p).filter((p): p is number => p !== null))].sort((a, b) => a - b), [index]);
  const results = useMemo(() => (index ? search(index.rows, dq, f, sort) : []), [index, dq, f, sort]);
  const kind = classify(dq).kind;

  if (error) return <EmptyState tone="error" title="The catalog index did not load" detail={error} />;
  if (!index) return <ViewSkeleton />;

  const pages = Math.ceil(results.length / PAGE);
  const shown = results.slice(page * PAGE, page * PAGE + PAGE);
  const sel = 'h-8 rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none';
  const toggle = (k: 'sep41' | 'events' | 'repo' | 'sdkFails', label: string) => (
    <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-sm border border-line bg-surface px-2.5 text-sm text-ink-2 has-[:checked]:border-accent has-[:checked]:text-ink">
      <input type="checkbox" name={k} checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="accent-[var(--sik-accent)]" />
      {label}
    </label>
  );

  return (
    <div>
      <PageHeader
        title="Catalog"
        lede={`${formatExact(index.count)} distinct wasm hashes run by mainnet contracts. Search by function name, hash prefix or contract ID.`}
        meta={<RecordedChip s={s} />}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="catalog-q" className="text-sm font-medium text-ink">
            Search
          </label>
          <div className="relative">
            <MagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              id="catalog-q"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="transfer_from, 07097f83, CA7T…, 22.0.7, github:"
              spellCheck={false}
              autoComplete="off"
              className="h-10 w-full rounded-sm border border-line-strong bg-surface pl-9 pr-3 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <p className="text-xs text-ink-3">Text matches function names, soroban-sdk version prefixes and declared source repos. Four or more hex characters match a hash prefix.</p>
        </div>

        {kind === 'contract' && <ContractHit id={classify(dq).value} />}

        <div className="flex flex-wrap items-center gap-2">
          <select name="spec" aria-label="Contract spec" className={sel} value={f.spec} onChange={(e) => setF({ ...f, spec: e.target.value as Filters['spec'] })}>
            <option value="any">Any spec</option>
            <option value="with">With contract spec</option>
            <option value="without">Without contract spec</option>
          </select>
          <select name="protocol" aria-label="Env protocol" className={sel} value={String(f.protocol)} onChange={(e) => setF({ ...f, protocol: e.target.value === 'any' ? 'any' : Number(e.target.value) })}>
            <option value="any">Any protocol</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                Protocol {p}
              </option>
            ))}
          </select>
          {toggle('sep41', 'SEP-41 set')}
          {toggle('events', 'Declares events')}
          {toggle('repo', 'Source repo')}
          {toggle('sdkFails', 'SDK bindings fail')}
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-ink-2">
            Sort
            <select name="sort" className={sel} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="contracts">Contracts</option>
              <option value="functions">Functions</option>
              <option value="size">Size</option>
              <option value="created">First seen</option>
              <option value="hash">Hash</option>
            </select>
          </label>
        </div>

        <p className="text-sm text-ink-2 tabular" aria-live="polite">
          {results.length === 0 ? 'No hashes match.' : `Showing ${formatExact(page * PAGE + 1)} to ${formatExact(page * PAGE + shown.length)} of ${formatExact(results.length)} hashes`}
        </p>

        <DataTable
          rows={shown}
          rowKey={(r) => r.h}
          dense
          onRowClick={(r) => (window.location.hash = hrefHash(r.h))}
          empty={<EmptyState title="No hashes match">Clear a filter or search for a shorter function name.</EmptyState>}
          columns={[
            {
              key: 'h',
              header: 'Wasm hash',
              cell: (r) => (
                <span className="flex flex-col gap-1">
                  <Hash value={r.h} href={hrefHash(r.h)} />
                  {matchedFunctions(r, dq).length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {matchedFunctions(r, dq).map((n) => (
                        <Ident key={n}>{n}</Ident>
                      ))}
                    </span>
                  )}
                </span>
              ),
            },
            { key: 'n', header: 'Contracts', numeric: true, cell: (r) => formatExact(r.n) },
            { key: 'f', header: 'Functions', numeric: true, cell: (r) => (r.sp ? formatExact(r.f ?? 0) : <span className="text-ink-3">no spec</span>) },
            { key: 'p', header: 'Protocol', numeric: true, hideOnMobile: true, cell: (r) => (r.p === null ? <span className="text-ink-3">none</span> : r.p) },
            { key: 'sdk', header: 'soroban-sdk', mono: true, hideOnMobile: true, cell: (r) => r.sdk ?? <span className="font-sans text-ink-3">not recorded</span> },
            {
              key: 'b',
              header: 'Bindings (ours / SDK)',
              hideOnMobile: true,
              cell: (r) =>
                r.tc === null ? (
                  <span className="text-ink-3">none (no spec)</span>
                ) : (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    <StatusLabel status={r.tc === 'pass' ? 'pass' : 'fail'} />
                    <StatusLabel status={r.sg === 'pass' ? 'pass' : r.sg === 'fail' ? 'fail' : 'unknown'} />
                  </span>
                ),
            },
            { key: 'lab', header: 'Labels', hideOnMobile: true, cell: (r) => <span className="flex flex-wrap gap-1"><TemplateTags labels={r.lab} />{(r.ev ?? 0) > 0 && <span className="text-xs text-ink-3">events</span>}</span> },
            { key: 'cr', header: 'First seen', hideOnMobile: true, cell: (r) => <span className="tabular whitespace-nowrap">{r.cr ?? <span className="text-ink-3">no date</span>}</span> },
          ]}
        />
        <div className="flex justify-end">
          <Pager page={page} pages={pages} onPage={(p) => { setPage(p); window.scrollTo({ top: 0 }); }} />
        </div>
      </div>
    </div>
  );
}

function ContractHit({ id }: { id: string }) {
  const [v, setV] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setV(undefined);
    lookupContract(id).then(setV, () => setV(null));
  }, [id]);
  if (v === undefined) return <p className="text-sm text-ink-3">Looking up {id.slice(0, 8)}…</p>;
  if (v && /^[0-9a-f]{64}$/.test(v))
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-ink-2">Contract</span>
        <Hash value={id} />
        <span className="text-ink-2">runs</span>
        <Hash value={v} href={hrefHash(v)} />
      </div>
    );
  return (
    <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-2">
      {v === null ? 'This contract ID is not in the recorded listing.' : v === 'stellar_asset' ? 'This is a Stellar Asset Contract; it runs no uploaded wasm.' : 'The listing records no wasm hash for this contract.'}
    </p>
  );
}
