import React from 'react';
export default function SectionHeading({ eyebrow, title, description, className = '' }) {
  return <div className={`section-heading ${className}`}>
    <span className="eyebrow"><span className="eyebrow-line" />{eyebrow}</span>
    <h2>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}
