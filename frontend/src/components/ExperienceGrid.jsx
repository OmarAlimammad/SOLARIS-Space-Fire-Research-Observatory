import React from 'react';
import { ArrowUpRight, BookOpenText, Clock3, FileDown, Flame, GitCompareArrows, Home as HomeIcon, MessageSquareText, Network } from 'lucide-react';

const ITEMS = [
  { href: '#/lab', icon: Flame, n: '01', title: 'Cosmic Flame Lab', text: 'Pick Earth, the ISS, the Moon or Mars and see which transport mechanism a simple, labelled model says dominates.', tag: 'Simplified model' },
  { href: '#/theater', icon: GitCompareArrows, n: '02', title: 'Comparison Theater', text: 'Two BASS-II tests side by side: recorded conditions, synchronized NASA footage you load, and comparability warnings.', tag: 'NASA records' },
  { href: '#/universe', icon: Network, n: '03', title: 'Evidence Universe', text: 'Investigations, materials, quoted findings and gaps in one graph — every edge with a stated basis.', tag: 'Knowledge graph' },
  { href: '#/copilot', icon: MessageSquareText, n: '04', title: 'Research Copilot', text: 'Ask questions; get ranked NASA passages and, when configured, a cited AI summary. Never a simulated answer.', tag: 'Retrieval + AI' },
  { href: '#/habitat', icon: HomeIcon, n: '05', title: 'Habitat Safety Explorer', text: 'Station, lunar and Mars cabins: which evidence applies to a material and ventilation state — and what is missing.', tag: 'Evidence gaps' },
  { href: '#/report', icon: FileDown, n: '06', title: 'Scientific Report', text: 'A reproducible PDF with tables, a chart, verbatim findings and an Evidence Passport that hashes its input file.', tag: 'PDF export' },
  { href: '#/timeline', icon: Clock3, n: '07', title: 'Discovery Timeline', text: 'NASA milestones dated by their own sources, plus test dates read straight from the BASS-II table.', tag: 'Sourced dates' },
  { href: '#/library', icon: BookOpenText, n: '+', title: 'NASA Research Library', text: 'Eleven investigations from NASA PSI records, with DOIs, publications and an honest data-availability badge.', tag: 'Catalog' },
];

export default function ExperienceGrid() {
  return <section className="xp-section" aria-labelledby="xp-title">
    <div className="container">
      <div className="xp-head" data-reveal>
        <span className="obs-eyebrow"><span className="obs-eyebrow-line" />03b / THE SOLARIS EXPERIENCES</span>
        <h2 id="xp-title">Seven ways in. <em>One evidence base.</em></h2>
        <p>Every experience shares your selected experiments and question, so you can move from a picture to the data, to a comparison, to a report without starting over.</p>
      </div>
      <div className="xp-grid" data-reveal-group>
        {ITEMS.map(({ href, icon: Icon, n, title, text, tag }) => <a key={href} href={href} className="xp-card s-card" data-reveal>
          <div className="xp-top"><span className="xp-n">{n}</span><Icon size={22} strokeWidth={1.6} /></div>
          <h3>{title}</h3>
          <p>{text}</p>
          <div className="xp-foot"><span className="s-chip">{tag}</span><ArrowUpRight size={16} className="xp-arrow" /></div>
        </a>)}
      </div>
    </div>
  </section>;
}
