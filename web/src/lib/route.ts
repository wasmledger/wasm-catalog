// SPDX-License-Identifier: Apache-2.0
// Hash routing: the build is static and may be served from any sub-path.
import { useEffect, useState } from 'react';

export type Route =
  | { view: 'overview' }
  | { view: 'catalog'; q: string }
  | { view: 'hash'; hash: string }
  | { view: 'contract'; id: string }
  | { view: 'census' }
  | { view: 'clusters' }
  | { view: 'seps' }
  | { view: 'method' };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case 'catalog':
      return { view: 'catalog', q: params.get('q') ?? '' };
    case 'h':
      return parts[1] && /^[0-9a-f]{64}$/.test(parts[1]) ? { view: 'hash', hash: parts[1] } : { view: 'catalog', q: parts[1] ?? '' };
    case 'c':
      return { view: 'contract', id: (parts[1] ?? '').toUpperCase() };
    case 'census':
      return { view: 'census' };
    case 'clusters':
      return { view: 'clusters' };
    case 'seps':
      return { view: 'seps' };
    case 'method':
      return { view: 'method' };
    default:
      return { view: 'overview' };
  }
}

export const hrefHash = (h: string) => `#/h/${h}`;
export const hrefCatalog = (q = '') => (q ? `#/catalog?q=${encodeURIComponent(q)}` : '#/catalog');

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
