import React from 'react';
import { ArrowUpRight, Github } from 'lucide-react';
import Brand from './Brand.jsx';

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-lead">
          <Brand light />
          <p>Exploring the science of fire beyond Earth through transparent evidence and interactive education.</p>
        </div>
        <div className="footer-list"><strong>EXPLORE</strong><a href="#/discover">Discover the physics</a><a href="#/explore">NASA experiments</a><a href="#/research">Research tools</a></div>
        <div className="footer-list"><strong>RESOURCES</strong><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-25" target="_blank" rel="noopener noreferrer">NASA PSI-25 archive <ArrowUpRight size={14}/></a><a href="https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf" target="_blank" rel="noopener noreferrer">BASS-II summary report <ArrowUpRight size={14}/></a></div>
      </div>
      <div className="container footer-bottom"><span>© 2026 SOLARIS · Independent student research project</span><span>NASA is a data source, not a sponsor or endorser of this website.</span></div>
    </footer>
  );
}
