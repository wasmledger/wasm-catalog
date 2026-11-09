// SPDX-License-Identifier: Apache-2.0
// wasm-catalog web: a static browser for the recorded mainnet census.
// Skills applied: design-taste-frontend + high-end-visual-design (craft), dataviz
// (charts); the kit design system (design/DESIGN.md) wins on specifics.
import { useEffect, useState } from 'react';
import { ChartBar, Graph, House, Info, MagnifyingGlass, Seal } from '@phosphor-icons/react';
import { AppShell, EmptyState, type NavItem } from './ui/kit';
import { GATES } from './ui/gates';
import { ViewSkeleton } from './ui/parts';
import { loadSummary } from './lib/data';
import { useRoute, type Route } from './lib/route';
import type { Summary } from './lib/types';
import { Overview } from './views/Overview';
import { Catalog } from './views/Catalog';
import { HashPage } from './views/HashPage';
import { ContractRedirect } from './views/ContractRedirect';
import { Census } from './views/Census';
import { Clusters } from './views/Clusters';
import { Seps } from './views/Seps';
import { Method } from './views/Method';

const NAV: { label: string; href: string; icon: React.ReactNode; views: Route['view'][] }[] = [
  { label: 'Overview', href: '#/', icon: <House />, views: ['overview'] },
  { label: 'Catalog', href: '#/catalog', icon: <MagnifyingGlass />, views: ['catalog', 'hash', 'contract'] },
  { label: 'Census', href: '#/census', icon: <ChartBar />, views: ['census'] },
  { label: 'Clusters', href: '#/clusters', icon: <Graph />, views: ['clusters'] },
  { label: 'SEP adoption', href: '#/seps', icon: <Seal />, views: ['seps'] },
  { label: 'Method and limits', href: '#/method', icon: <Info />, views: ['method'] },
];

const SITE = 'WCT Wasm Catalog';
function routeTitle(r: Route): string {
  switch (r.view) {
    case 'overview': return SITE;
    case 'catalog': return r.q ? `Catalog: ${r.q.slice(0, 40)} | ${SITE}` : `Catalog | ${SITE}`;
    case 'hash': return `Wasm ${r.hash.slice(0, 8)} | ${SITE}`;
    case 'contract': return `Contract ${r.id.slice(0, 4)}...${r.id.slice(-4)} | ${SITE}`;
    case 'census': return `Census | ${SITE}`;
    case 'clusters': return `Clusters | ${SITE}`;
    case 'seps': return `SEP adoption | ${SITE}`;
    case 'method': return `Method and limits | ${SITE}`;
  }
}

export function App() {
  const route = useRoute();
  useEffect(() => {
    document.title = routeTitle(route);
  }, [route]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadSummary().then(setSummary, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const nav: NavItem[] = NAV.map((n) => ({ label: n.label, href: n.href, icon: n.icon, active: n.views.includes(route.view) }));

  return (
    <AppShell
      project={{ name: 'wasm-catalog', code: 'WCT', family: 'Contract tooling and payments', href: '#/' }}
      gates={GATES}
      nav={nav}
      footer={<a className="text-accent hover:underline" href="#/method">Method and limits</a>}
    >
      {error ? (
        <EmptyState tone="error" title="The catalog data did not load" detail={error}>
          Nothing on this page was updated. The data files ship with the build under data/; check that the site was built with them.
        </EmptyState>
      ) : !summary ? (
        <ViewSkeleton />
      ) : (
        <View route={route} s={summary} />
      )}
    </AppShell>
  );
}

function View({ route, s }: { route: Route; s: Summary }) {
  switch (route.view) {
    case 'overview':
      return <Overview s={s} />;
    case 'catalog':
      return <Catalog s={s} initialQuery={route.q} />;
    case 'hash':
      return <HashPage s={s} hash={route.hash} />;
    case 'contract':
      return <ContractRedirect s={s} id={route.id} />;
    case 'census':
      return <Census s={s} />;
    case 'clusters':
      return <Clusters s={s} />;
    case 'seps':
      return <Seps s={s} />;
    case 'method':
      return <Method s={s} />;
  }
}
