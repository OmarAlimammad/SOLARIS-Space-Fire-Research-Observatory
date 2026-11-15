import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Compass, PackageOpen } from 'lucide-react';
import SiteHeader from './components/SiteHeader.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import SelectionDock from './components/SelectionDock.jsx';
import { EmptyState, ErrorBoundary, Skeleton } from './components/ui.jsx';
import { findRoute, pageFor } from './routes.js';
import { useRoute } from './lib/router.js';
import { useGlobalReveal } from './lib/motion.js';
import { ResearchProvider } from './state/ResearchContext.jsx';

function PageFallback() {
  return <div className="container" style={{ padding: '64px 0' }} aria-busy="true">
    <div className="s-skeleton" style={{ height: 12, width: 160, marginBottom: 22 }} />
    <div className="s-skeleton" style={{ height: 44, width: '58%', marginBottom: 14 }} />
    <Skeleton lines={3} />
  </div>;
}

function NotFound({ path }) {
  return <div className="container" style={{ padding: '80px 0' }}>
    <EmptyState icon={Compass} title="This page does not exist" action={<a className="s-btn s-btn-primary" href="#/">Go to Home</a>}>
      Nothing is published at <code>{path}</code>. Use the navigation above to continue.
    </EmptyState>
  </div>;
}

function Missing({ route }) {
  return <div className="container" style={{ padding: '80px 0' }}>
    <EmptyState icon={PackageOpen} title={`${route.label} is not installed in this build`}>
      SOLARIS expected <code>src/pages/{route.file}.jsx</code>. Add the module and this route will load it automatically.
    </EmptyState>
  </div>;
}

export default function App() {
  const route = useRoute();
  const match = findRoute(route.path);
  const Page = match ? pageFor(match) : null;
  const [progressKey, setProgressKey] = useState(0);
  const prevPath = useRef(route.path);
  useGlobalReveal(route.path);

  useEffect(() => {
    document.title = match ? (match.path === '/' ? match.title : `${match.title} · SOLARIS`) : 'Not found · SOLARIS';
    if (prevPath.current === route.path) return;
    prevPath.current = route.path;
    window.scrollTo({ top: 0, behavior: 'instant' });
    setProgressKey(k => k + 1);
    // Move focus to main content for keyboard and screen-reader users after navigation.
    const main = document.getElementById('main-content');
    main?.focus({ preventScroll: true });
  }, [route.path]); // eslint-disable-line react-hooks/exhaustive-deps

  return <ResearchProvider>
    <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <div className={`route-progress ${progressKey ? 'is-active' : ''}`} key={progressKey} aria-hidden="true" />
    <div className="app-shell">
      <SiteHeader current={route.path} />
      <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
        <ErrorBoundary resetKey={route.path}>
          <Suspense fallback={<PageFallback />}>
            <div className="route-stage" key={route.path}>
              {!match ? <NotFound path={route.path} /> : Page ? <Page params={route.params} /> : <Missing route={match} />}
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <SiteFooter />
      <SelectionDock current={route.path} />
    </div>
  </ResearchProvider>;
}
