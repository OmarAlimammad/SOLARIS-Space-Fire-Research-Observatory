import React, { useId } from 'react';

/** An ORIGINAL qualitative illustration. Not a CFD simulation or NASA measurement. */
export default function FlameVisual({ mode = 'micro', flow = 2, compact = false }) {
  const uid = useId().replaceAll(':','');
  const micro = mode === 'micro';
  return <svg className={`flame-svg ${compact ? 'compact' : ''}`} viewBox="0 0 640 490" role="img" aria-label={`Illustrative ${micro ? 'microgravity' : 'Earth gravity'} flame diagram`}>
    <defs>
      <radialGradient id={`${uid}-halo`}><stop offset="0" stopColor="#A7E8FF" stopOpacity=".58"/><stop offset=".55" stopColor="#61B1F3" stopOpacity=".18"/><stop offset="1" stopColor="#85D1FF" stopOpacity="0"/></radialGradient>
      <radialGradient id={`${uid}-micro`} cx="45%" cy="42%" r="65%"><stop offset="0" stopColor="#ECFCFF"/><stop offset=".22" stopColor="#BBF2FC"/><stop offset=".56" stopColor="#69C8F8"/><stop offset=".85" stopColor="#377EC6" stopOpacity=".8"/><stop offset="1" stopColor="#236AA9" stopOpacity=".05"/></radialGradient>
      <linearGradient id={`${uid}-earth`} x1="0" x2=".45" y1="1" y2="0"><stop stopColor="#2675CE"/><stop offset=".45" stopColor="#75D1FE"/><stop offset=".84" stopColor="#E6FBFF"/><stop offset="1" stopColor="#F7FEFF"/></linearGradient>
      <linearGradient id={`${uid}-outline`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#A8D8F8"/><stop offset="1" stopColor="#2D7CB9"/></linearGradient>
      <pattern id={`${uid}-grid`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" stroke="#769BB7" strokeOpacity=".13" fill="none" strokeWidth="1"/></pattern>
      <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>
    </defs>
    <rect width="640" height="490" fill={`url(#${uid}-grid)`}/>
    <circle cx="340" cy="236" r="206" fill={`url(#${uid}-halo)`}/>
    <circle cx="340" cy="236" r="180" stroke="#77A9C8" strokeOpacity=".3" strokeDasharray="4 9" fill="none" />
    <circle cx="340" cy="236" r="137" stroke="#77A9C8" strokeOpacity=".32" fill="none"/>
    <circle cx="340" cy="236" r="88" stroke="#77A9C8" strokeOpacity=".22" fill="none"/>
    <path d="M96 236H584 M340 20V450" stroke="#73A7C9" strokeOpacity=".28" strokeDasharray="6 8"/>
    <g className="flame-orbit" transform="rotate(-22 340 236)"><ellipse cx="340" cy="236" rx="232" ry="85" stroke={`url(#${uid}-outline)`} strokeWidth="1.5" strokeOpacity=".44" fill="none"/><circle cx="550" cy="209" r="5" fill="#58C1E4"/></g>
    {micro ? <g className="flame-core">
      <circle cx="340" cy="236" r="113" fill="#329ADD" opacity=".22" filter={`url(#${uid}-glow)`}/>
      <circle cx="340" cy="236" r="108" fill={`url(#${uid}-micro)`} opacity=".92"/>
      <circle cx="325" cy="215" r="52" fill="#E9FBFF" opacity=".23"/>
      <circle cx="340" cy="236" r="24" fill="#E6FBFF" opacity=".95"/>
      <circle cx="340" cy="236" r="8" fill="#FFFFFF"/>
      <path d="M225 236h-35 M455 236h35 M340 121V86 M340 351v35" stroke="#6DC9EE" strokeOpacity=".66" strokeWidth="2" strokeLinecap="round"/>
      <path d="M200 226l-10 10 10 10 M480 226l10 10-10 10" stroke="#6DC9EE" strokeOpacity=".66" strokeWidth="2" fill="none"/>
    </g> : <g className="flame-core">
      <path d="M340 85 C366 137 410 166 405 240 C402 319 365 352 338 349 C295 349 271 315 275 254 C280 194 312 168 340 85Z" fill="#5AAFE6" opacity=".26" filter={`url(#${uid}-glow)`}/>
      <path d="M340 85 C362 139 405 180 400 250 C395 314 366 347 338 347 C294 346 275 316 278 257 C282 201 314 164 340 85Z" fill={`url(#${uid}-earth)`} opacity=".9"/>
      <path d="M342 184 C361 225 369 257 362 293 C356 313 340 328 323 315 C301 296 317 243 342 184Z" fill="#F3FCFF" opacity=".75"/>
      <path d="M459 300V130m0 0-9 14m9-14 9 14" stroke="#5DABDB" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </g>}
    {Array.from({length: Math.min(flow + 1, 8)},(_,i) => <g key={i} opacity={.2+i*.07}><path d={`M${75 - i*3} ${160 + i*26}h${70 + i*7}`} stroke="#2B92CA" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 7"/></g>)}
    <circle cx="340" cy="236" r="3.5" fill="#FFFFFF"/>
    <path d="M340 350v48" stroke="#5789AF" strokeWidth="1.6" strokeDasharray="3 5"/>
    <path d="M302 398h76" stroke="#5B92B6" strokeWidth="3" strokeLinecap="round"/>
    <path d="M315 407h50" stroke="#5B92B6" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
    <g fontFamily="DM Sans,Arial,sans-serif" fill="#527B9E" fontSize="11" letterSpacing="2">
      <text x="42" y="45">CONCEPTUAL VIEW / 01</text>
      <text x="455" y="443">NOT TO SCALE</text>
      <text x="42" y="442">NO MEASURED DATA</text>
    </g>
    <g><circle cx="545" cy="70" r="3" fill="#3EC5BB"/><circle cx="545" cy="70" r="11" stroke="#3EC5BB" strokeOpacity=".25" fill="none"/></g>
  </svg>;
}
