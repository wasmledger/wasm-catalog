// SPDX-License-Identifier: Apache-2.0
// SEP adoption: what mainnet wasm declares (SEP-47/48/55/58) and what its interface
// matches (SEP-41 function set), counted by hash and by contract.
import { ChartFrame, DataTable, PageHeader, RankedBars, formatExact } from '../ui/kit';
import { pct, RecordedChip, Section } from '../ui/parts';
import type { Measure, Summary } from '../lib/types';

interface Line {
  key: string;
  sep: string;
  what: string;
  how: string;
  m: Measure;
}

export function Seps({ s }: { s: Summary }) {
  const p = s.seps;
  const H = s.totals.hashes;
  const C = p.contractsWithHash;
  const chip = <RecordedChip s={s} />;
  const lines: Line[] = [
    { key: 'sep48', sep: 'SEP-48', what: 'Declares contract events in its spec', how: 'event_v0 entries in contractspecv0', m: p.sep48Events },
    { key: 'sep41', sep: 'SEP-41', what: 'Token interface, full function set', how: p.sep41.method ?? '', m: p.sep41 },
    { key: 'sep41p', sep: 'SEP-41', what: 'Token interface, partial', how: p.sep41Partial.method ?? '', m: p.sep41Partial },
    { key: 'sac', sep: 'SEP-41 + SAC', what: 'Token with SAC admin functions', how: p.sep41SacAdmin.method ?? '', m: p.sep41SacAdmin },
    { key: 'sep55', sep: 'SEP-55', what: 'Declares a source repository', how: 'source_repo key in contractmetav0', m: p.sep55SourceRepo },
    { key: 'sep58', sep: 'SEP-58', what: 'Build fields, well-formed', how: 'SEP-58 meta keys present and conformant', m: p.sep58Conformant },
    { key: 'sep58n', sep: 'SEP-58', what: 'Build fields, malformed', how: 'SEP-58 meta keys present but not conformant', m: p.sep58NonConformant },
    { key: 'sep47', sep: 'SEP-47', what: 'Declares which SEPs it implements', how: 'sep key in contractmetav0', m: p.sep47Declared },
  ];
  const bars = lines.map((l) => ({ key: l.key, label: `${l.sep}: ${l.what}`, text: `${l.sep}: ${l.what}`, value: l.m.hashes }));

  return (
    <div>
      <PageHeader title="SEP adoption" lede="Which Stellar Ecosystem Proposals mainnet contract code declares or matches, by hash and by contract." meta={chip} />

      <DataTable
        dense
        rows={lines}
        rowKey={(l) => l.key}
        caption="Adoption"
        meta={chip}
        columns={[
          { key: 'sep', header: 'SEP', cell: (l) => <span className="font-medium md:whitespace-nowrap">{l.sep}</span> },
          { key: 'what', header: 'What', cell: (l) => <span><span className="text-ink">{l.what}</span><span className="block text-xs text-ink-3">{l.how}</span></span> },
          { key: 'h', header: 'Hashes', numeric: true, cell: (l) => formatExact(l.m.hashes) },
          { key: 'hp', header: `of ${formatExact(H)}`, numeric: true, hideOnMobile: true, cell: (l) => pct(l.m.hashes, H) },
          { key: 'c', header: 'Contracts', numeric: true, cell: (l) => formatExact(l.m.contracts) },
          { key: 'cp', header: `of ${formatExact(C)}`, numeric: true, hideOnMobile: true, cell: (l) => pct(l.m.contracts, C) },
        ]}
      />

      <Section title="By hash" description="Self-declaration (SEP-47, SEP-55, SEP-58) is rare; matching an interface (SEP-41) or emitting declared events (SEP-48) is more common.">
        <ChartFrame
          title="Hashes per SEP signal"
          subtitle={`Wasm hashes, of ${formatExact(H)}`}
          provenance={chip}
          table={<DataTable dense rows={bars} rowKey={(b) => b.key} columns={[{ key: 'k', header: 'Signal', cell: (b) => b.text }, { key: 'v', header: 'Hashes', numeric: true, cell: (b) => formatExact(b.value) }]} />}
        >
          <RankedBars bars={bars} unit="hashes" format={formatExact} labelWidth="min(20rem, 45vw)" />
        </ChartFrame>
      </Section>

      <Section title="What declarers say" description="Values are written by the builder of the wasm and are not verified.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DataTable
            dense
            caption="SEP-47: SEPs declared"
            rows={Object.entries(p.sep47Declared.seps).map(([k, v]) => ({ k, v }))}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', header: 'Declared SEP', cell: (r) => `SEP-${r.k}` },
              { key: 'v', header: 'Hashes', numeric: true, cell: (r) => formatExact(r.v) },
            ]}
          />
          <DataTable
            dense
            caption="SEP-55: source repo form"
            rows={Object.entries(p.sep55SourceRepo.hosts).map(([k, v]) => ({ k, v }))}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', header: 'Form or host', mono: true, cell: (r) => r.k },
              { key: 'v', header: 'Hashes', numeric: true, cell: (r) => formatExact(r.v) },
            ]}
          />
        </div>
      </Section>
    </div>
  );
}
