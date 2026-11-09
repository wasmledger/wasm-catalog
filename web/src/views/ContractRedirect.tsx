// SPDX-License-Identifier: Apache-2.0
// Contract ID -> the wasm it runs, from the recorded listing. Contracts that run no
// wasm (Stellar Asset Contracts, no instance) are said so plainly.
import { useEffect, useState } from 'react';
import { EmptyState, PageHeader } from '../ui/kit';
import { RecordedChip, ViewSkeleton } from '../ui/parts';
import { lookupContract } from '../lib/data';
import { hrefHash } from '../lib/route';
import type { Summary } from '../lib/types';

const KINDS: Record<string, string> = {
  stellar_asset: 'It is a Stellar Asset Contract (built into the network); it runs no uploaded wasm.',
  no_instance: 'RPC returned no contract instance for it at harvest time.',
  no_wasm_listed: 'The listing gives no wasm hash for it (most such entries are Stellar Asset Contracts [I]).',
};

export function ContractRedirect({ s, id }: { s: Summary; id: string }) {
  const [state, setState] = useState<{ v: string | null } | { err: string } | null>(null);
  useEffect(() => {
    setState(null);
    if (!/^C[A-Z2-7]{55}$/.test(id)) {
      setState({ err: 'Not a contract ID: expected C followed by 55 base32 characters.' });
      return;
    }
    lookupContract(id).then(
      (v) => {
        if (v && /^[0-9a-f]{64}$/.test(v)) window.location.replace(hrefHash(v));
        else setState({ v });
      },
      (e: unknown) => setState({ err: e instanceof Error ? e.message : String(e) }),
    );
  }, [id]);

  if (!state) return <ViewSkeleton />;
  return (
    <div>
      <PageHeader title="Contract lookup" lede={<span className="break-all font-mono text-sm">{id}</span>} meta={<RecordedChip s={s} />} />
      {'err' in state ? (
        <EmptyState tone="error" title="Lookup failed" detail={state.err} />
      ) : state.v === null ? (
        <EmptyState title="Not in the recorded listing">
          This contract was not in the stellar.expert listing on {s.provenance.harvestedAt.slice(0, 10)} (or in the RPC event windows). It may be newer than the capture, or on testnet.
        </EmptyState>
      ) : (
        <EmptyState title="This contract runs no catalogued wasm">{KINDS[state.v] ?? `Recorded as ${state.v}.`}</EmptyState>
      )}
    </div>
  );
}
