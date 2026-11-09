// SPDX-License-Identifier: Apache-2.0
// Landing view: the signature figure, the search entry point, four measured tiles,
// the most-run code and what the catalog does not cover.
import { ArrowRight } from '@phosphor-icons/react';
import { DataTable, GateNotice, Hash, ProjectHero, ProvenanceChip, StatTile, formatExact } from '../ui/kit';
import { pct, recorded, RecordedChip, Section } from '../ui/parts';
import { hrefHash } from '../lib/route';
import type { Summary } from '../lib/types';
import { GATES } from '../ui/gates';
import { SearchBox } from './SearchBox';

export function Overview({ s }: { s: Summary }) {
  const t = s.totals;
  const prov = recorded(s);
  const top = t.topHash;
  return (
    <div className="flex flex-col gap-10">
      <ProjectHero
        code="WCT"
        name="wasm-catalog"
        family="Contract tooling and payments"
        lede="Every Soroban contract code running on Stellar mainnet, keyed by wasm hash, with its interface and typed bindings."
        gates={GATES}
        actions={
          <>
            <a href="#/catalog" className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-sm font-medium text-ink-inverse inset-shadow-highlight hover:brightness-110 active:translate-y-px">
              Search the catalog
              <ArrowRight weight="bold" aria-hidden />
            </a>
            <a href="#/census" className="inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-sunken active:translate-y-px">
              Open the census
            </a>
          </>
        }
        figure={{
          label: `Distinct contract codes behind ${formatExact(t.contractsWithHash)} mainnet contracts`,
          value: t.hashes,
          unit: 'wasm hashes',
          footnote: `Each one fetched with RPC getLedgerEntries and sha256-checked; ${formatExact(s.provenance.sePages)} listing pages walked.`,
          provenance: <ProvenanceChip {...prov} />,
        }}
      />

      <div className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <SearchBox autoFocus={false} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Hashes with a contract spec"
          value={t.withSpec}
          format={formatExact}
          footnote={`${pct(t.withSpec, t.hashes)} of ${formatExact(t.hashes)}; every spec decodes with @stellar/stellar-sdk ${s.coverage.sdkVersion}.`}
          provenance={prov}
        />
        <StatTile
          label="Our bindings that pass strict tsc"
          value={`${formatExact(t.oursPass)} of ${formatExact(t.bindings)}`}
          footnote={`${formatExact(t.oursFail)} fail. Runtime smoke-tested offline on 2 example hashes only (WCT-021).`}
          provenance={prov}
        />
        <StatTile
          label="SDK BindingGenerator output that passes"
          value={`${formatExact(t.sdkPass)} of ${formatExact(t.sdkPass + t.sdkFail)}`}
          footnote={`${formatExact(t.sdkFail)} fail on the same specs, same compiler settings.`}
          provenance={prov}
        />
        <StatTile
          label="Contracts running the single most-used code"
          value={top?.contracts ?? null}
          format={formatExact}
          missing={{ reason: 'No contracts in the capture.' }}
          footnote={top ? `${pct(top.contracts, t.contractsWithHash)} of contracts with a wasm hash. soroban-sdk ${top.sdkVersion ?? 'not recorded'}, ${top.functions ?? 0} functions.` : undefined}
          provenance={prov}
        />
      </div>

      <Section title="Most-run contract code" description="The ten wasm hashes with the most contracts in the listing. Open one to see its interface and bindings.">
        <DataTable
          rows={s.coverage.hashes.mostUsed}
          rowKey={(r) => r.hash}
          meta={<RecordedChip s={s} />}
          onRowClick={(r) => (window.location.hash = hrefHash(r.hash))}
          columns={[
            { key: 'h', header: 'Wasm hash', cell: (r) => <Hash value={r.hash} href={hrefHash(r.hash)} /> },
            { key: 'c', header: 'Contracts', numeric: true, cell: (r) => formatExact(r.contracts) },
            { key: 's', header: 'Share', numeric: true, hideOnMobile: true, cell: (r) => pct(r.contracts, t.contractsWithHash) },
            { key: 'f', header: 'Functions', numeric: true, cell: (r) => (r.functions === null ? 'no spec' : formatExact(r.functions)) },
            { key: 'v', header: 'soroban-sdk', mono: true, hideOnMobile: true, cell: (r) => r.sdkVersion ?? 'not recorded' },
          ]}
        />
      </Section>

      <GateNotice tone="neutral" title="A recorded census, not a live index">
        Figures come from one full walk of the stellar.expert contract listing and mainnet RPC on {s.provenance.harvestedAt.slice(0, 10)} (latest ledger {formatExact(s.provenance.latestLedger)}). Code uploaded but run by no contract, superseded versions, testnet and CAP-85 external references are not covered yet. The hash page can re-check one blob against mainnet live.{' '}
        <a className="text-accent hover:underline" href="#/method">
          Method and limits
        </a>
      </GateNotice>
    </div>
  );
}
