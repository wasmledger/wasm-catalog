// SPDX-License-Identifier: Apache-2.0
// Clusters: exact duplicates (interface, spec bytes, code) and near-duplicates by
// function-name Jaccard (WCT-018), with the method printed beside the results.
import { useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { GateNotice, Hash, PageHeader, StatTile, formatExact } from '../ui/kit';
import { Ident, recorded, RecordedChip, Section } from '../ui/parts';
import { hrefHash } from '../lib/route';
import type { Group, Summary } from '../lib/types';

function GroupList({ groups, near }: { groups: Group[]; near?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="hidden grid-cols-[2rem_5rem_6rem_minmax(0,1fr)_minmax(0,14rem)] gap-3 border-b border-line bg-sunken px-4 py-2 text-xs text-ink-2 md:grid">
        <span />
        <span className="text-right">Hashes</span>
        <span className="text-right">Contracts</span>
        <span>{near ? 'Functions shared by every member' : 'Largest member'}</span>
        <span>soroban-sdk</span>
      </div>
      <ul role="list">
        {groups.map((g) => {
          const isOpen = open === g.id;
          return (
            <li key={g.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : g.id)}
                className="grid w-full grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-4 py-2.5 text-left text-sm hover:bg-sunken/70 md:grid-cols-[2rem_5rem_6rem_minmax(0,1fr)_minmax(0,14rem)]"
              >
                <span aria-hidden className="pt-0.5 text-ink-3">{isOpen ? <CaretDown /> : <CaretRight />}</span>
                <span className="text-ink md:text-right tabular">
                  {formatExact(g.size)}
                  <span className="text-ink-3 md:hidden"> hashes, {formatExact(g.contracts)} contracts</span>
                </span>
                <span className="hidden text-right text-ink tabular md:block">{formatExact(g.contracts)}</span>
                <span className="col-start-2 flex min-w-0 flex-wrap gap-1 md:col-start-auto">
                  {near ? (
                    <>
                      {(g.shared ?? []).slice(0, 6).map((n) => (
                        <Ident key={n}>{n}</Ident>
                      ))}
                      <span className="text-xs text-ink-3">
                        {g.shared?.length ?? 0} of {g.unionSize} names; weakest link {g.minJ?.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <Hash value={g.members[0]!} />
                  )}
                </span>
                <span className="col-start-2 truncate font-mono text-xs text-ink-2 md:col-start-auto" title={g.sdkVersions.join(', ')}>
                  {g.sdkVersions.slice(0, 3).join(', ')}
                  {g.sdkVersions.length > 3 ? ` +${g.sdkVersions.length - 3}` : ''}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-line bg-canvas px-4 py-3 md:pl-[3.25rem]">
                  <ul role="list" className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {g.members.map((m) => (
                      <li key={m}>
                        <Hash value={m} href={hrefHash(m)} />
                      </li>
                    ))}
                  </ul>
                  {g.size > g.members.length && <p className="mt-2 text-xs text-ink-3">Showing the {g.members.length} with the most contracts of {formatExact(g.size)}.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Clusters({ s }: { s: Summary }) {
  const g = s.groups;
  const prov = recorded(s);
  const o = g.near.options;
  return (
    <div>
      <PageHeader title="Clusters" lede="Which mainnet contract code is the same, or nearly the same, under different hashes." meta={<RecordedChip s={s} />} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Same interface, different hash" value={g.sameInterface.groups} format={formatExact} unit="groups" footnote={`${formatExact(g.sameInterface.hashes)} hashes. Docs and entry order ignored.`} provenance={prov} />
        <StatTile label="Byte-identical spec" value={g.sameSpec.groups} format={formatExact} unit="groups" footnote={`${formatExact(g.sameSpec.hashes)} hashes.`} provenance={prov} />
        <StatTile label="Same code, sections stripped" value={g.sameCode.groups} format={formatExact} unit="groups" footnote={`${formatExact(g.sameCode.hashes)} hashes differ only in custom sections (meta, spec).`} provenance={prov} />
        <StatTile label="Near-duplicate clusters" value={g.near.clusters} format={formatExact} unit="clusters" footnote={`${formatExact(g.near.hashes)} hashes, Jaccard ${o.threshold} or more on function names.`} provenance={prov} />
      </div>

      <GateNotice tone="neutral" title="How near-duplicates are found" className="mt-6">
        For each hash with at least {o.minFunctions} functions, the set of function names in its contractspecv0. Two sets are linked when their Jaccard index (shared names over all names) is {o.threshold} or more; clusters are connected components (single linkage), so two members can be less alike than the threshold and the weakest link is shown. Argument types are not compared. {formatExact(g.near.considered)} hashes considered, {formatExact(g.near.distinctSets)} distinct name sets, {formatExact(g.near.edges)} links.
      </GateNotice>

      <Section title="Largest near-duplicate clusters" description="Open a row to list its members.">
        <GroupList groups={g.near.top} near />
      </Section>

      <Section title="Largest same-interface groups" description="Identical interface under different hashes: usually one codebase rebuilt with another compiler, SDK or doc text.">
        <GroupList groups={g.sameInterface.top} />
      </Section>

      <Section title="Largest same-code groups" description="Identical code after stripping custom sections: the same build with different metadata.">
        <GroupList groups={g.sameCode.top} />
      </Section>
    </div>
  );
}
