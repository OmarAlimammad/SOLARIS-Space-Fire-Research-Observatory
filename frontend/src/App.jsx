import React, { useEffect, useState } from 'react';
import SiteHeader from './components/SiteHeader.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import Home from './pages/Home.jsx';
import Discover from './pages/Discover.jsx';
import Explore from './pages/Explore.jsx';
import Research from './pages/Research.jsx';
import About from './pages/About.jsx';

const routes = {'/':Home, '/discover':Discover, '/explore':Explore, '/research':Research, '/about':About};
const pathFromHash = () => {
  const hash = window.location.hash.slice(1).split('?')[0];
  return Object.hasOwn(routes, hash) ? hash : '/';
};
export default function App() {
  const [path,setPath] = useState(pathFromHash);
  useEffect(() => {
    function update() { setPath(pathFromHash()); window.scrollTo({top:0,behavior:'instant'}); }
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const Page = routes[path] || Home;
  return <div className="app-shell"><SiteHeader current={path}/><main id="main-content"><Page/></main><SiteFooter/></div>;
}
