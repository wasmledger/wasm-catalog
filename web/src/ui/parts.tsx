// SPDX-License-Identifier: Apache-2.0
// Project-level UI parts built on the kit components: the recorded-capture chip,
// an ordinal column chart, a definition grid, small labels and a section wrapper.
import { useState, type ReactNode } from 'react';
import { cn, formatCompact, formatExact, ProvenanceChip, type Provenance } from './kit';
import type { Summary, TemplateLabel } from '../lib/types';

/** Provenance of everything derived from the 2026-11-04 full walk. */
export function recorded(s: Summary, note?: string): Provenance {
  return {
    kind: 'recorded',
    ledger: s.provenance.latestLedger,
    date: s.provenance.harvestedAt.slice(0, 10),
    source: `${s.provenance.listing}; ${s.provenance.rpcUrl}`,
    note,
  };
}

export function RecordedChip({ s, note }: { s: Summary; note?: string }) {
  return <ProvenanceChip {...recorded(s, note)} />;
}

/** Share as a percentage; a nonzero share too small to show at two decimals reads "<0.01%", never "0.00%". */
export const pct = (n: number, d: number) => {
  if (d === 0) return 'Unknown';
  const r = n / d;
  if (n > 0 && r < 0.0001) return '<0.01%';
  return `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`;
};

/** Section with a top hairline, title and optional one-line description. */
export function Section({ title, description, children, id, actions, first = false }: { title: string; description?: ReactNode; children: ReactNode; id?: string; actions?: ReactNode; first?: boolean }) {
  return (
    <section id={id} className={first ? 'mt-0' : 'mt-10 border-t border-line pt-8 first:mt-0 first:border-t-0 first:pt-0'}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
}

/**
 * Ordinal column chart (versions, buckets, months): one series in viz-1, bars at
 * most 24px wide with a 4px rounded data-end and square baseline, 2px gaps,
 * hover and keyboard tooltip with the exact value. The order of `data` is kept.
 */
export function ColumnChart({ data, unit, height = 168, tickEvery = 1, className }: { data: Column[]; unit: string; height?: number; tickEvery?: number; className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-2', className)}>
      <div className="relative text-right text-xs text-viz-label tabular" style={{ height }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 leading-none" style={{ bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>
            {formatCompact(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 pr-5">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} aria-hidden className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-viz-axis' : 'bg-viz-grid')} style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <ul role="list" className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d) => {
              const on = active === d.key;
              return (
                <li key={d.key} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                  <span
                    tabIndex={0}
                    aria-label={`${d.label}: ${formatExact(d.value)} ${unit}`}
                    onPointerEnter={() => setActive(d.key)}
                    onPointerLeave={() => setActive((a) => (a === d.key ? null : a))}
                    onFocus={() => setActive(d.key)}
                    onBlur={() => setActive((a) => (a === d.key ? null : a))}
                    className="flex h-full w-full max-w-6 items-end justify-center rounded-xs outline-offset-1"
                  >
                    <span
                      className="block w-full rounded-t-bar bg-viz-1 transition-[filter] duration-[120ms] ease-settle"
                      style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 2 : 0, filter: on ? 'brightness(1.15)' : undefined }}
                    />
                  </span>
                  {on && (
                    <span role="tooltip" className="pointer-events-none absolute bottom-full z-[var(--sik-z-popover)] mb-1 whitespace-nowrap rounded-sm border border-line bg-raised px-2.5 py-1.5 text-xs shadow-2">
                      <span className="font-semibold text-ink tabular">{formatExact(d.value)} {unit}</span>
                      <span className="ml-2 text-ink-3">{d.label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="mt-1.5 flex h-4 gap-[2px] text-xs text-viz-label" aria-hidden>
          {data.map((d, i) => (
            <span key={d.key} className="relative min-w-0 flex-1">
              {i % tickEvery === 0 && <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">{d.label}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Two-column definition grid for facts about one hash. */
export function Facts({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.k} className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3 border-b border-line py-2 text-sm">
          <dt className="text-ink-3">{i.k}</dt>
          <dd className="min-w-0 break-words text-ink">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

const LABEL_TEXT: Record<TemplateLabel, { text: string; title: string }> = {
  sep41: { text: 'SEP-41 set', title: 'All ten SEP-41 token functions with the SEP input counts (names and arity only; types not compared).' },
  'sep41-partial': { text: 'SEP-41 partial', title: 'Seven to nine SEP-41 function names, or all ten with a different input count.' },
  'sep41-sac-admin': { text: 'SAC admin set', title: 'SEP-41 plus set_admin, admin, set_authorized, authorized, mint and clawback.' },
};

/** Neutral label chip (not a status, not data colour). */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex h-5 items-center whitespace-nowrap rounded-xs border border-line bg-sunken px-1.5 text-xs text-ink-2">
      {children}
    </span>
  );
}

export function TemplateTags({ labels }: { labels: TemplateLabel[] }) {
  return (
    <>
      {labels.map((l) => (
        <Tag key={l} title={LABEL_TEXT[l].title}>
          {LABEL_TEXT[l].text}
        </Tag>
      ))}
    </>
  );
}

/** Untrusted on-chain identifier shown as inert mono text. */
export function Ident({ children }: { children: string }) {
  return <code className="rounded-xs bg-sunken px-1 py-px font-mono text-[12px] text-ink">{children}</code>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = 'inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-sunken disabled:pointer-events-none disabled:opacity-50';
  return (
    <nav aria-label="Pages" className="flex items-center gap-2">
      <button type="button" className={btn} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-ink-2 tabular">
        Page {page + 1} of {pages}
      </span>
      <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

/** Loading skeleton for a view: keeps the final layout shape. */
export function ViewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="h-8 w-64 animate-none rounded-xs bg-sunken" />
      <div className="h-4 w-96 max-w-full rounded-xs bg-sunken" />
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-md border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
