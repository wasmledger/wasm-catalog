// SPDX-License-Identifier: Apache-2.0
// Entry search on the overview: a full hash opens its page, a contract ID is
// looked up, anything else opens the catalog filtered by it.
import { useState, type FormEvent } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { classify } from '../lib/search';
import { hrefCatalog, hrefHash } from '../lib/route';

export const EXAMPLES = ['transfer_from', 'swap', 'CA7TELVQ6D4AQWRAWTD6HUIJUHVHJP2JQBMG2QKZW2XKO4DM6GDTLIUG', '07097f83'];

export function go(q: string) {
  const { kind, value } = classify(q);
  if (kind === 'contract') window.location.hash = `#/c/${value}`;
  else if (kind === 'hash' && value.length === 64) window.location.hash = hrefHash(value);
  else window.location.hash = hrefCatalog(q.trim());
}

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(q);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" role="search">
      <label htmlFor="overview-search" className="text-sm font-medium text-ink">
        Find contract code
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlass aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="overview-search"
            name="q"
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Function name, wasm hash or prefix, or contract ID"
            spellCheck={false}
            autoComplete="off"
            className="h-10 w-full rounded-sm border border-line-strong bg-surface pl-9 pr-3 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
        </div>
        <button type="submit" className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-sm font-medium text-ink-inverse inset-shadow-highlight hover:brightness-110 active:translate-y-px">
          Search
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span>Try</span>
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => go(x)} className="max-w-full truncate rounded-xs font-mono text-accent hover:underline">
            {x.length > 20 ? `${x.slice(0, 8)}…${x.slice(-4)}` : x}
          </button>
        ))}
      </p>
    </form>
  );
}
