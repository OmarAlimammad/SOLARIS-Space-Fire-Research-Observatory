import { useEffect, useState } from 'react';

/** Hash routing: "#/path?key=value". Browser back/forward works through hashchange. */
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path: path.length > 1 ? path.replace(/\/+$/, '') : '/', params: new URLSearchParams(queryPart) };
}

export function href(path, params) {
  const query = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  return `#${path}${query ? `?${query}` : ''}`;
}

export function navigate(path, params) {
  window.location.hash = href(path, params).slice(1);
}

/** Replace query params without adding a history entry or re-triggering a page transition. */
export function replaceParams(params) {
  const { path } = parseHash();
  const next = href(path, params);
  window.history.replaceState(null, '', next);
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const update = () => setRoute(parseHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

/** Smooth-scroll to an in-page element without touching the hash (the hash is the router). */
export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
