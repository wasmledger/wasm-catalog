// SPDX-License-Identifier: Apache-2.0
// Method and limits: how the data was captured, what it does not cover, and which
// features are not built yet (nothing simulated).
import { EmptyState, PageHeader, formatExact, formatLedger } from '../ui/kit';
import { Facts, RecordedChip, Section } from '../ui/parts';
import type { Summary } from '../lib/types';

export function Method({ s }: { s: Summary }) {
  const p = s.provenance;
  const c = s.coverage;
  return (
    <div className="max-w-report">
      <PageHeader title="Method and limits" lede="How the census was captured, what was checked, and what this catalog does not cover." meta={<RecordedChip s={s} />} />

      <Section title="Capture" first>
        <Facts
          items={[
            { k: 'Network', v: 'Stellar mainnet (read-only)' },
            { k: 'Harvest finished', v: `${p.harvestedAt.replace('T', ' ').slice(0, 16)} UTC` },
            { k: 'Latest ledger at harvest', v: formatLedger(p.latestLedger) },
            { k: 'Contract listing', v: `${p.listing}, ${formatExact(p.sePages)} pages` },
            { k: 'RPC', v: `${p.rpcUrl}${p.rpcVersion?.version ? `, ${p.rpcVersion.version.split('-')[0]}` : ''}` },
            { k: 'RPC requests', v: `${formatExact(c.harvest.net.live)} live, ${formatExact(c.harvest.net.cached)} from cache, ${(c.harvest.net.bytes / 1e6).toFixed(1)} MB` },
            { k: 'Catalog built', v: `${p.builtAt.replace('T', ' ').slice(0, 16)} UTC, offline from the harvest` },
            { k: 'Generator', v: p.generator },
            { k: 'Selection', v: p.selection },
            { k: 'This page exported', v: `${s.exportedAt.slice(0, 10)}, from the same build` },
          ]}
        />
        <div className="mt-6 max-w-prose space-y-3 text-md text-ink-2">
          <p>
            The harvester walked every page of the stellar.expert contract listing at no more than one request per second, read {c.harvest.eventWindows} windows of RPC contract events to catch contracts the listing missed, and fetched every distinct wasm hash with RPC getLedgerEntries. Each blob's sha256 was checked against its hash before it was decoded.
          </p>
          <p>
            Wasm is parsed, never compiled or executed. The decoder reads the contractspecv0, contractmetav0 and contractenvmetav0 custom sections. Every name, doc string and meta value is untrusted text written by whoever built the wasm; this site renders it as plain text only.
          </p>
          <p>
            Bindings are generated with this project's generator on @stellar/stellar-sdk contract.Spec, then the whole tree is compiled with tsc --strict. The SDK's own BindingGenerator was run on the same specs and compiled with the same settings for comparison.
          </p>
          <p>Nothing in this site writes to any network. The live check on a hash page sends one read-only RPC call from your browser.</p>
        </div>
      </Section>

      <Section title="Not covered yet" description="Shown as not available rather than estimated.">
        <div className="flex flex-col gap-3">
          <EmptyState tone="not-yet-available" title="Code no contract runs today" ticket="WCT-014">
            Wasm that was uploaded but never deployed, and versions a contract has since upgraded away from. Finding them needs ledger history (upload transactions), not the contract listing.
          </EmptyState>
          <EmptyState tone="not-yet-available" title="Runtime tests of the bindings at scale" ticket="WCT-029">
            All generated clients are type-checked. Runtime use is smoke-tested offline on two example hashes only (method dispatch and scalar argument encoding, WCT-021); user-defined argument types, simulation and live calls are not tested.
          </EmptyState>
          <EmptyState tone="not-yet-available" title="Testnet" ticket="WCT-015">
            The catalog covers mainnet only.
          </EmptyState>
          <EmptyState tone="not-yet-available" title="CAP-85 external executable references" ticket="WCT-016">
            Contracts whose executable is a reference to another owner's code are not resolved.
          </EmptyState>
          <EmptyState tone="not-yet-available" title="Updates after the capture" ticket="WCT-017">
            No watcher yet: code uploaded after {p.harvestedAt.slice(0, 10)} is not here until the harvest is re-run.
          </EmptyState>
          <EmptyState tone="not-yet-available" title="OpenZeppelin template labels" ticket="WCT-028">
            Matching against reference builds of OpenZeppelin stellar-contracts is not done; only the SEP-41 function-set label exists.
          </EmptyState>
        </div>
      </Section>

      <Section title="Reading the numbers">
        <ul role="list" className="max-w-prose list-disc space-y-2 pl-5 text-md text-ink-2">
          <li>Counts are of contracts in the listing at harvest time, and of distinct code those contracts run. A contract upgraded since then may run different code now.</li>
          <li>SEP-41 labels compare function names and input counts only. A label says the interface has that shape, not that the token behaves as SEP-41 requires.</li>
          <li>Meta fields such as soroban-sdk version are self-reported by the builder.</li>
          <li>"Live" appears only on results this page fetched in this session; everything else is the recorded capture and says so.</li>
        </ul>
      </Section>
    </div>
  );
}
