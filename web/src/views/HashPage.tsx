// SPDX-License-Identifier: Apache-2.0
// One wasm hash: facts, interface, bindings with their tsc results, the contracts
// that run it, related code, and a live re-check against mainnet RPC.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DownloadSimple, ShieldCheck } from '@phosphor-icons/react';
import { Button, EmptyState, GateNotice, Hash, PageHeader, ProvenanceChip, StatusLabel, UnknownValue, cn, formatExact, formatLedger } from '../ui/kit';
import { Facts, Ident, RecordedChip, Section, Tag, TemplateTags, ViewSkeleton } from '../ui/parts';
import { loadDetail, loadIndex } from '../lib/data';
import { checkOnMainnet, MAINNET_RPC, type LiveResult } from '../lib/live';

/** Read-only mainnet RPC for the live check; override at build time with VITE_WCT_RPC. */
const RPC = (import.meta.env.VITE_WCT_RPC as string | undefined) || MAINNET_RPC;
import { hrefHash } from '../lib/route';
import type { HashDetail, Summary, WebIndex, WebRow } from '../lib/types';
import { InterfaceView, modelOf } from './Interface';

type Tab = 'interface' | 'bindings' | 'contracts' | 'related';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const liveCache = new Map<string, LiveResult>();

export function HashPage({ s, hash }: { s: Summary; hash: string }) {
  const [index, setIndex] = useState<WebIndex | null>(null);
  const [detail, setDetail] = useState<HashDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('interface');

  useEffect(() => {
    setDetail(undefined);
    setError(null);
    setTab('interface');
    Promise.all([loadIndex(), loadDetail(hash)]).then(
      ([i, d]) => {
        setIndex(i);
        setDetail(d);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [hash]);

  const row = useMemo(() => index?.rows.find((r) => r.h === hash), [index, hash]);
  const model = useMemo(() => (detail?.spec?.spec?.present ? modelOf(detail.spec.spec.entries ?? []) : null), [detail]);

  if (error) return <EmptyState tone="error" title="This hash did not load" detail={error} />;
  if (detail === undefined || !index) return <ViewSkeleton />;
  if (!detail || !row)
    return (
      <EmptyState title="Not in the catalog" action={<a className="text-sm text-accent hover:underline" href="#/catalog">Open the catalog</a>}>
        <span className="break-all font-mono">{hash}</span> was not run by any contract in the recorded listing of {s.provenance.harvestedAt.slice(0, 10)}. Uploaded-but-undeployed code is not catalogued yet (WCT-014).
      </EmptyState>
    );

  const meta = detail.spec?.meta?.entries ?? [];
  const metaVal = (k: string) => meta.find((e) => e.key === k)?.val;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'interface', label: 'Interface', count: row.sp ? (row.f ?? 0) : undefined },
    { id: 'bindings', label: 'Bindings' },
    { id: 'contracts', label: 'Contracts', count: row.n },
    { id: 'related', label: 'Related code' },
  ];

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-col gap-1">
            <span>Wasm {hash.slice(0, 8)}</span>
            <span className="break-all font-mono text-sm font-normal tracking-normal text-ink-2">{hash}</span>
          </span>
        }
        lede={`Run by ${formatExact(row.n)} mainnet contract${row.n === 1 ? '' : 's'}. ${row.sp ? `${formatExact(row.f ?? 0)} functions` : 'No contract spec'}${row.sdk ? `, soroban-sdk ${row.sdk}` : ''}${row.p !== null ? `, protocol ${row.p}` : ''}.`}
        meta={
          <>
            <RecordedChip s={s} />
            <TemplateTags labels={row.lab} />
            {(row.ev ?? 0) > 0 && <Tag title="Declares SEP-48 events in its spec">Declares events</Tag>}
          </>
        }
        actions={
          <>
            <Button disabled={!detail.bindings} onClick={() => detail.bindings && download(`wct-${hash.slice(0, 12)}-bindings.ts`, detail.bindings, 'text/plain')}>
              <DownloadSimple aria-hidden /> bindings.ts
            </Button>
            <Button disabled={!detail.spec} onClick={() => detail.spec && download(`wct-${hash.slice(0, 12)}-spec.json`, `${JSON.stringify(detail.spec, null, 2)}\n`, 'application/json')}>
              <DownloadSimple aria-hidden /> spec.json
            </Button>
          </>
        }
      />

      <LivePanel hash={hash} recordedSize={row.sz} />

      <Section title="Facts" description="Decoded from the wasm's custom sections. Meta values are written by whoever built the wasm and are not verified.">
        <Facts
          items={[
            { k: 'Size', v: row.sz === null ? <UnknownValue reason="Blob not fetched." /> : `${formatExact(row.sz)} bytes` },
            { k: 'Code sha256 (sections stripped)', v: detail.spec?.codeSha256 ? <span className="break-all font-mono text-xs">{detail.spec.codeSha256}</span> : <UnknownValue reason="Not computed." /> },
            { k: 'Contract spec', v: row.sp ? `${detail.spec?.spec?.bytes ?? '?'} bytes, ${detail.spec?.spec?.entries?.length ?? 0} entries` : 'none' },
            { k: 'Env protocol', v: row.p === null ? <UnknownValue reason="No contractenvmetav0 section." /> : String(row.p) },
            { k: 'soroban-sdk', v: metaVal('rssdkver') ? <Ident>{metaVal('rssdkver')!}</Ident> : 'not recorded' },
            { k: 'Rust', v: metaVal('rsver') ? <Ident>{metaVal('rsver')!}</Ident> : 'not recorded' },
            { k: 'stellar-cli', v: metaVal('cliver') ? <Ident>{metaVal('cliver')!}</Ident> : 'not recorded' },
            { k: 'SEP-47 seps declared', v: row.sep.length ? row.sep.map((x) => `SEP-${x}`).join(', ') : 'none' },
            { k: 'SEP-55 source repo', v: row.repo ? <Ident>{row.repo}</Ident> : 'none' },
            { k: 'SEP-58 build fields', v: row.s58 ?? 'none' },
            { k: 'Other meta keys', v: meta.filter((e) => !['rssdkver', 'rsver', 'cliver', 'source_repo', 'sep'].includes(e.key)).map((e) => e.key).join(', ') || 'none' },
            { k: 'Contracts created', v: detail.created.first ? (detail.created.first === detail.created.last ? detail.created.first : `${detail.created.first} to ${detail.created.last}`) : 'no dates in listing' },
            { k: 'Code entry last modified', v: detail.lastModifiedLedger ? `ledger ${formatLedger(detail.lastModifiedLedger)}` : 'not recorded' },
            { k: 'Fetched from', v: detail.fetch === 'rpc' ? 'mainnet RPC getLedgerEntries, sha256 checked' : (detail.fetch ?? 'not fetched') },
          ]}
        />
      </Section>

      <div role="tablist" aria-label="Hash detail" className="mt-10 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-[120ms] ease-settle',
              tab === t.id ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 text-ink-3 tabular">{formatExact(t.count)}</span>}
          </button>
        ))}
      </div>
      <div className="pt-6" role="tabpanel">
        {tab === 'interface' &&
          (model ? (
            <InterfaceView m={model} />
          ) : (
            <EmptyState title="No contract spec">This wasm has no contractspecv0 section, so there is no declared interface and no bindings.</EmptyState>
          ))}
        {tab === 'bindings' && <BindingsTab row={row} d={detail} />}
        {tab === 'contracts' && <ContractsTab d={detail} />}
        {tab === 'related' && <RelatedTab row={row} d={detail} index={index} />}
      </div>
    </div>
  );
}

function LivePanel({ hash, recordedSize }: { hash: string; recordedSize: number | null }) {
  const [r, setR] = useState<LiveResult | null>(() => liveCache.get(hash) ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setR(liveCache.get(hash) ?? null), [hash]);
  const run = async () => {
    setBusy(true);
    const res = await checkOnMainnet(hash, { rpc: RPC });
    liveCache.set(hash, res);
    setR(res);
    setBusy(false);
  };
  let body: ReactNode = null;
  if (!r) {
    body = <p className="text-sm text-ink-2">One read-only getLedgerEntries call to {new URL(RPC).host} from your browser. The wasm comes back as XDR and its sha256 is recomputed here with WebCrypto.</p>;
  } else if (r.status === 'match' || r.status === 'mismatch') {
    body = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusLabel status={r.status === 'match' ? 'pass' : 'fail'} label={r.status === 'match' ? 'sha256 matches the hash' : 'sha256 does not match'} />
          <ProvenanceChip kind="live" ledger={r.latestLedger} date={r.checkedAt} source={r.rpc} />
        </div>
        <p className="text-sm text-ink-2 tabular">
          {formatExact(r.size)} bytes{recordedSize !== null && (recordedSize === r.size ? ', same size as recorded' : `, recorded size was ${formatExact(recordedSize)}`)}
          {r.lastModifiedLedger !== null && `; entry last modified at ledger ${formatLedger(r.lastModifiedLedger)}`}
          {r.liveUntilLedger !== null && (r.liveUntilLedger > 0 ? `; live until ledger ${formatLedger(r.liveUntilLedger)}` : '; RPC reported no TTL (liveUntilLedgerSeq 0)')}.
        </p>
        {r.status === 'mismatch' && <p className="break-all font-mono text-xs text-critical-ink">computed {r.computed}</p>}
      </div>
    );
  } else if (r.status === 'absent') {
    body = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusLabel status="unknown" label="Not returned by RPC" />
          <ProvenanceChip kind="live" ledger={r.latestLedger} date={r.checkedAt} source={r.rpc} />
        </div>
        <p className="text-sm text-ink-2">RPC returns only live entries. The code may have been archived (its TTL ran out) since the capture; that does not mean it never existed.</p>
      </div>
    );
  } else if (r.status === 'error') {
    body = (
      <div className="flex flex-col gap-2">
        <StatusLabel status="unknown" label="Read failed" />
        <p className="break-words font-mono text-xs text-ink-2">{r.message}</p>
        <p className="text-sm text-ink-2">Nothing was updated; the recorded data below is unchanged.</p>
      </div>
    );
  }
  return (
    <section className="rounded-md border border-line bg-surface p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck aria-hidden className="text-ink-3" /> Check this hash on mainnet now
          </h2>
          <div className="mt-2">{body}</div>
        </div>
        <Button variant="primary" onClick={run} disabled={busy}>
          {busy ? 'Checking' : r ? 'Check again' : 'Check on mainnet'}
        </Button>
      </div>
    </section>
  );
}

function BindingsTab({ row, d }: { row: WebRow; d: HashDetail }) {
  if (!d.bindings) return <EmptyState title="No bindings">There is no contract spec to generate bindings from.</EmptyState>;
  const lines = d.bindings.split('\n').length;
  return (
    <div className="flex flex-col gap-6">
      <GateNotice tone="warning" title="Generated from untrusted on-chain data">
        Names were checked and doc text escaped, and the file passes tsc --strict. Runtime use was smoke-tested offline on two example hashes (method dispatch, scalar argument encoding); calls against a live contract are not tested (WCT-029). Review it before depending on it.
      </GateNotice>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-sm text-ink-2">wasm-catalog generator, tsc --strict</p>
          <div className="mt-2">
            <StatusLabel status={row.tc === 'pass' ? 'pass' : 'fail'} />
          </div>
          {d.tcErrors.length > 0 && <ErrorList errors={d.tcErrors} />}
          {d.diagnostics.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-ink-3">Spec problems the generator worked around ({d.diagnostics.length})</p>
              <ul role="list" className="mt-1 flex flex-col gap-1">
                {d.diagnostics.slice(0, 12).map((x, i) => (
                  <li key={i} className="break-words font-mono text-xs text-ink-2">{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-sm text-ink-2">@stellar/stellar-sdk BindingGenerator, same tsc settings</p>
          <div className="mt-2">
            <StatusLabel status={row.sg === 'pass' ? 'pass' : row.sg === 'fail' ? 'fail' : 'unknown'} />
          </div>
          {d.sdkErrors.length > 0 && <ErrorList errors={d.sdkErrors} />}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-ink-3">
          <span>bindings.ts, {formatExact(lines)} lines</span>
        </div>
        <pre className="code-block max-h-[560px] overflow-auto rounded-md border border-line bg-sunken p-4 font-mono text-[12px] leading-relaxed text-ink">{d.bindings}</pre>
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <ul role="list" className="mt-3 flex flex-col gap-1">
      {errors.slice(0, 10).map((e, i) => (
        <li key={i} className="break-words font-mono text-xs text-ink-2">{e}</li>
      ))}
      {errors.length > 10 && <li className="text-xs text-ink-3">and {errors.length - 10} more</li>}
    </ul>
  );
}

function ContractsTab({ d }: { d: HashDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        {d.contracts.length < d.contractCount
          ? `First ${formatExact(d.contracts.length)} of ${formatExact(d.contractCount)} contracts, sorted by ID.`
          : `${formatExact(d.contractCount)} contract${d.contractCount === 1 ? '' : 's'}.`}
      </p>
      <ul role="list" className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        {d.contracts.map((c) => (
          <li key={c} className="break-all font-mono text-xs text-ink">{c}</li>
        ))}
      </ul>
    </div>
  );
}

function RelatedTab({ row, d, index }: { row: WebRow; d: HashDetail; index: WebIndex }) {
  const groups: { title: string; note: string; key: keyof WebRow }[] = [
    { title: 'Same interface', note: 'Same functions, types, errors and events; docs and entry order ignored.', key: 'gi' },
    { title: 'Same spec bytes', note: 'Byte-identical contractspecv0.', key: 'gs' },
    { title: 'Same code', note: 'Identical code once custom sections are stripped.', key: 'gc' },
    { title: 'Near-duplicate cluster', note: 'Function-name sets linked at Jaccard 0.8 or more (single linkage).', key: 'nc' },
  ];
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-sm font-semibold text-ink">Nearest by function names</h3>
        <p className="mt-0.5 text-xs text-ink-3">Jaccard index of the function-name sets, 1.0 means the same names. Types are not compared.</p>
        {d.neighbours.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No other hash shares at least half of its function names{(row.f ?? 0) < 3 ? ' (hashes with fewer than three functions are left out)' : ''}.</p>
        ) : (
          <ul role="list" className="mt-3 flex flex-col gap-1.5">
            {d.neighbours.map((n) => (
              <li key={n.h} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-right tabular text-ink">{n.j.toFixed(2)}</span>
                <Hash value={n.h} href={hrefHash(n.h)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {groups.map((g) => {
        const id = row[g.key] as number | null;
        const members = id === null ? [] : index.rows.filter((r) => r[g.key] === id && r.h !== row.h).sort((a, b) => b.n - a.n);
        return (
          <div key={g.title}>
            <h3 className="text-sm font-semibold text-ink">
              {g.title} <span className="font-normal text-ink-3 tabular">{id === null ? 'none' : `${formatExact(members.length)} other`}</span>
            </h3>
            <p className="mt-0.5 text-xs text-ink-3">{g.note}</p>
            {members.length > 0 && (
              <ul role="list" className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
                {members.slice(0, 24).map((m) => (
                  <li key={m.h} className="flex items-center gap-2 text-sm">
                    <Hash value={m.h} href={hrefHash(m.h)} />
                    <span className="text-xs text-ink-3 tabular">{formatExact(m.n)} contracts{m.sdk ? `, sdk ${m.sdk}` : ''}</span>
                  </li>
                ))}
                {members.length > 24 && <li className="text-xs text-ink-3">and {members.length - 24} more</li>}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
