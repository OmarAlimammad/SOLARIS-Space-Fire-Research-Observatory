import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Global scroll-reveal: any element with [data-reveal] fades/slides in once when it
 * enters the viewport. A MutationObserver picks up elements added after navigation.
 * Optional data-reveal-group staggers children via --reveal-i.
 */
export function useGlobalReveal(routeKey) {
  useEffect(() => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => {
      document.querySelectorAll('[data-reveal-group]').forEach(group => {
        [...group.querySelectorAll(':scope > [data-reveal]')].forEach((el, i) => el.style.setProperty('--reveal-i', String(Math.min(i, 8))));
      });
      document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(el => io.observe(el));
    };
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.getElementById('main-content') || document.body, { childList: true, subtree: true });
    // Safety net: never leave content invisible (e.g. printing, odd layouts).
    const safety = window.setTimeout(() => document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed')), 4000);
    return () => { io.disconnect(); mo.disconnect(); window.clearTimeout(safety); };
  }, [routeKey]);
}

/** Measures the active child and moves an indicator with transform only. */
export function useSlidingIndicator(containerRef, activeSelector, deps = []) {
  const [style, setStyle] = useState({ opacity: 0 });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => {
      const active = container.querySelector(activeSelector);
      if (!active) { setStyle({ opacity: 0 }); return; }
      const c = container.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      setStyle({ opacity: 1, transform: `translate3d(${a.left - c.left + container.scrollLeft}px,0,0) scaleX(${a.width})` });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return style;
}

/** Animate a number toward a target (respects reduced motion). For display only. */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (target === null || target === undefined || !Number.isFinite(target)) { setValue(target); return undefined; }
    if (prefersReducedMotion()) { setValue(target); return undefined; }
    const start = performance.now();
    const from = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}
