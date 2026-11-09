// SPDX-License-Identifier: Apache-2.0
// Census: coverage of the recorded mainnet walk. Single-series charts in ChartFrame
// with a table view each (dataviz skill + DESIGN.md 7).
import type { ReactNode } from 'react';
import { ChartFrame, DataTable, PageHeader, RankedBars, StatTile, StatusTable, formatExact, type StatusRow } from '../ui/kit';
import { ColumnChart, pct, recorded, RecordedChip, Section, type Column } from '../ui/parts';
import type { Summary } from '../lib/types';

const TS_ERRORS: Record<string, string> = {
  TS2749: 'Error enum used as a type',
  TS2305: 'Imports a type the module does not export',
  TS2304: 'Cannot find name',
  TS2300: 'Duplicate identifier',
  TS2451: 'Redeclared block-scoped variable',
  TS2344: 'Type does not satisfy a constraint',
  TS2724: 'No exported member (did you mean)',
  TS2567: 'Enum declarations can only merge with namespaces or other enums',
  TS1117: 'Object literal has duplicate properties',
  TS2552: 'Cannot find name (did you mean)',
};

/** Fill every month between the first and last, so a month with no creations shows as a real zero. */
export function fillMonths(rows: { month: string; contracts: number; newHashes: number }[]): { month: string; contracts: number; newHashes: number }[] {
  if (rows.length === 0) return [];
  const have = new Map(rows.map((r) => [r.month, r]));
  const out = [];
  let [y, m] = rows[0]!.month.split('-').map(Number) as [number, number];
  const last = rows[rows.length - 1]!.month;
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(have.get(key) ?? { month: key, contracts: 0, newHashes: 0 });
    if (key === last) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function table(rows: Column[], header: string, unit: string): ReactNode {
  return (
    <DataTable
      dense
      rows={rows}
      rowKey={(r) => r.key}
      maxHeight={320}
      columns={[
        { key: 'k', header, cell: (r) => r.label },
        { key: 'v', header: unit, numeric: true, cell: (r) => formatExact(r.value) },
      ]}
    />
  );
}

export function Census({ s }: { s: Summary }) {
  const c = s.coverage;
  const prov = recorded(s);
  const chip = <RecordedChip s={s} />;
  const months = fillMonths(s.created.byMonth);
  const lastMonth = months[months.length - 1]?.month;
  const contractsByMonth: Column[] = months.map((m) => ({ key: m.month, label: m.month, value: m.contracts }));
  const hashesByMonth: Column[] = months.map((m) => ({ key: m.month, label: m.month, value: m.newHashes }));
  const protocols: Column[] = Object.entries(c.sections.protocols)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => ({ key: k, label: k === '0' ? '0' : k, value: v }));
  const sdk: Column[] = Object.entries(c.sections.sdkMajor)
    .filter(([k]) => k !== '(none)')
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => ({ key: k, label: `${k}.x`, value: v }));
  const sdkNone = c.sections.sdkMajor['(none)'] ?? 0;
  const order = ['1', '2-9', '10-99', '100-999', '1000+'];
  const perHash: Column[] = order.filter((k) => k in c.hashes.contractsPerHash).map((k) => ({ key: k, label: k, value: c.hashes.contractsPerHash[k]! }));
  const sdkErr = Object.entries(c.bindings.sdkGenerator?.errorCodes ?? {}).map(([k, v]) => ({ key: k, label: <span><span className="font-mono">{k}</span> {TS_ERRORS[k] ?? ''}</span>, text: `${k} ${TS_ERRORS[k] ?? ''}`, value: v }));
  const diag = Object.entries(c.bindings.hashesByDiagnosticClass).map(([k, v]) => ({ key: k, label: k, text: k, value: v }));
  const tick = Math.max(1, Math.ceil(months.length / 8));

  const checks: StatusRow[] = [
    { id: 'walk', name: 'stellar.expert listing walked to the end', status: 'pass', value: `${formatExact(c.harvest.sePages)} pages`, detail: `${formatExact(c.contracts.bySource['se-contracts'] ?? 0)} listed contracts` },
    { id: 'xc', name: 'Listing hash agrees with RPC contract instance', status: c.harvest.crossCheck.disagree === 0 ? 'pass' : 'warn', value: `${c.harvest.crossCheck.agree} of ${c.harvest.crossCheck.checked}`, detail: 'Random sample cross-checked with getLedgerEntries' },
    { id: 'fetch', name: 'Every distinct hash fetched and sha256-checked', status: (c.hashes.fetch['rpc'] ?? 0) === c.hashes.seen ? 'pass' : 'warn', value: `${formatExact(c.hashes.fetch['rpc'] ?? 0)} of ${formatExact(c.hashes.seen)}`, detail: 'From mainnet RPC; no explorer fallback was needed' },
    { id: 'spec', name: 'Every spec decodes with @stellar/stellar-sdk', status: 'pass', value: `${formatExact(c.sections.specPresent)} of ${formatExact(c.sections.specPresent)}`, detail: `SDK ${c.sdkVersion}, also via Spec.fromWasm` },
    { id: 'tsc', name: 'Generated bindings pass tsc --strict', status: (c.bindings.typecheck?.fail ?? 1) === 0 ? 'pass' : 'fail', value: `${formatExact(c.bindings.typecheck?.pass ?? 0)} of ${formatExact(c.bindings.generated)}` },
    { id: 'events', name: 'RPC event windows read', status: 'pass', value: `${c.harvest.eventWindows} windows`, detail: `${formatExact(c.harvest.eventsRead)} events, to catch contracts missing from the listing` },
    { id: 'undeployed', name: 'Code uploaded but run by no contract', status: 'skipped', detail: 'Not covered yet (WCT-014)' },
  ];

  return (
    <div>
      <PageHeader title="Census" lede="Coverage of every wasm hash run by a listed mainnet contract, from one full walk." meta={chip} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Contracts in the capture" value={c.contracts.total} format={formatExact} footnote={`${formatExact(c.contracts.seListingNoWasm)} listed without a wasm hash (mostly Stellar Asset Contracts [I]), plus ${formatExact(c.contracts.rpcExecutable['no_instance'] ?? 0)} found through RPC with no instance.`} provenance={prov} />
        <StatTile label="Distinct wasm hashes" value={c.hashes.seen} format={formatExact} footnote={`${(c.hashes.sizeBytes.total / 1e6).toFixed(1)} MB of wasm; ${formatExact(c.hashes.sizeBytes.min)} to ${formatExact(c.hashes.sizeBytes.max)} bytes each.`} provenance={prov} />
        <StatTile label="Hashes that declare events" value={c.sections.withEvents} format={formatExact} footnote={`${pct(c.sections.withEvents, c.hashes.seen)} carry SEP-48 event specs.`} provenance={prov} />
        <StatTile label="Hashes run by one contract only" value={c.hashes.contractsPerHash['1'] ?? 0} format={formatExact} footnote={`${pct(c.hashes.contractsPerHash['1'] ?? 0, c.hashes.seen)} of hashes; most code is deployed once.`} provenance={prov} />
      </div>

      <Section title="Deployment over time" description={`From the listing's created timestamps (UTC). ${lastMonth} is a partial month: the capture ends ${s.provenance.harvestedAt.slice(0, 10)}. ${formatExact(s.created.contractsWithoutDate)} contracts have no date and are left out.`}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame title="Contracts created per month" subtitle={`Contracts, ${months[0]?.month} to ${lastMonth}`} provenance={chip} table={table(contractsByMonth, 'Month', 'Contracts')}>
            <ColumnChart data={contractsByMonth} unit="contracts" tickEvery={tick} />
          </ChartFrame>
          <ChartFrame title="New distinct code per month" subtitle="Wasm hashes by the month their first contract was created" provenance={chip} table={table(hashesByMonth, 'Month', 'Hashes')}>
            <ColumnChart data={hashesByMonth} unit="hashes" tickEvery={tick} />
          </ChartFrame>
        </div>
      </Section>

      <Section title="Toolchain" description="What the wasm says it was built with. Meta is written by the builder and not verified.">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartFrame title="Env interface protocol" subtitle="Hashes per protocol in contractenvmetav0" provenance={chip} table={table(protocols, 'Protocol', 'Hashes')}>
            <ColumnChart data={protocols} unit="hashes" />
          </ChartFrame>
          <ChartFrame title="soroban-sdk major version" subtitle={`Hashes per version; ${formatExact(sdkNone)} record none`} provenance={chip} table={table(sdk, 'soroban-sdk', 'Hashes')}>
            <ColumnChart data={sdk} unit="hashes" />
          </ChartFrame>
          <ChartFrame title="Contracts per hash" subtitle="Hashes by how many contracts run them" provenance={chip} table={table(perHash, 'Contracts', 'Hashes')}>
            <ColumnChart data={perHash} unit="hashes" />
          </ChartFrame>
        </div>
      </Section>

      <Section title="Bindings at scale" description="TypeScript bindings generated for every hash with a spec, then compiled with tsc --strict. The SDK's BindingGenerator ran on the same specs.">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatTile label="wasm-catalog generator" value={`${formatExact(c.bindings.typecheck?.pass ?? 0)} pass`} footnote={`${formatExact(c.bindings.typecheck?.fail ?? 0)} fail of ${formatExact(c.bindings.generated)}. Runtime smoke-tested offline on 2 hashes only (WCT-021).`} provenance={prov} />
          <StatTile label="@stellar/stellar-sdk BindingGenerator" value={`${formatExact(c.bindings.sdkGenerator?.pass ?? 0)} pass`} footnote={`${formatExact(c.bindings.sdkGenerator?.fail ?? 0)} fail of ${formatExact(c.bindings.generated)}, same specs and compiler settings.`} provenance={prov} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            title="Why SDK-generated bindings fail"
            subtitle="Hashes whose SDK output has each TypeScript error (a hash can have several)"
            provenance={chip}
            table={<DataTable dense rows={sdkErr} rowKey={(r) => r.key} columns={[{ key: 'k', header: 'Error', cell: (r) => r.label }, { key: 'v', header: 'Hashes', numeric: true, cell: (r) => formatExact(r.value) }]} />}
          >
            <RankedBars bars={sdkErr} unit="hashes" format={formatExact} labelWidth="17rem" />
          </ChartFrame>
          <ChartFrame
            title="Spec problems our generator handled"
            subtitle="Hashes with each class of problem in their on-chain spec"
            provenance={chip}
            table={<DataTable dense rows={diag} rowKey={(r) => r.key} columns={[{ key: 'k', header: 'Problem', cell: (r) => r.label }, { key: 'v', header: 'Hashes', numeric: true, cell: (r) => formatExact(r.value) }]} />}
          >
            <RankedBars bars={diag} unit="hashes" format={formatExact} labelWidth="17rem" />
          </ChartFrame>
        </div>
      </Section>

      <Section title="How the capture was checked">
        <StatusTable rows={checks} caption="Checks on the capture" valueHeader="Measured" meta={chip} />
      </Section>
    </div>
  );
}
