import React from 'react';

export default function Brand({ light = false }) {
  return (
    <a className={`brand ${light ? 'brand-light' : ''}`} href="#/" aria-label="SOLARIS home">
      <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label="SOLARIS mark">
        <circle cx="24" cy="24" r="16.5" stroke="currentColor" strokeWidth="1.6" fill="none" opacity=".55" />
        <ellipse cx="24" cy="24" rx="22" ry="9.5" transform="rotate(-30 24 24)" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".48" />
        <path d="M30.3 15.5c-5.6-2.8-14.3-1.4-14.3 4.1 0 5.4 16.2 3.2 16.2 9.8 0 6.3-8.6 8.5-16.3 4.8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <circle cx="35.7" cy="12.3" r="3.8" fill="#52BBD9" stroke="#fff" strokeWidth="1.6" />
      </svg>
      <span className="brand-type"><strong>SOLARIS</strong><small>FIRE INTELLIGENCE</small></span>
    </a>
  );
}
