import React from 'react';

// Educational geometry driven by the same qualitative settings as the lab's readout.
// Changes between planets follow selected ambient/chamber settings, not a claim of validated chemistry.
export default function FlamePreview({result, fuel='wick', location='Earth', mode='ambient', onUseChamber}) {
 const visible=!!result?.isVisible;
 const lowBuoyancy=(result?.buoyancyIndex??1)<.16;
 const round=result?.roundness??0;
 const height=92*(result?.relativeHeight??1);
 const width=36+round*29+(fuel==='gas'?14:0);
 const top=240-height;
 const tilt=result?.tiltDegrees??0;
 const outer=`M 159 243 C ${159-width-16} ${237-height*.30} ${159-width-9} ${top+height*.08} 159 ${top} C ${159+width+15} ${top+height*.08} ${159+width+16} ${240-height*.30} 159 243 Z`;
 const inner=`M 159 244 C ${159-width*.52} ${231-height*.18} ${159-width*.55} ${top+height*.38} 159 ${top+height*.38} C ${159+width*.55} ${top+height*.38} ${159+width*.52} ${231-height*.18} 159 244 Z`;
 const roundRadius=Math.min(67,44+round*25);
 const visualName=lowBuoyancy?'Diffusion-dominated illustration':(result?.flowEffect??0)>.28?'Flow-shaped illustration':'Buoyancy-shaped illustration';
 const geometry=lowBuoyancy?'orb':'plume';
 const style={'--flame-tilt':`${tilt}deg`,'--flame-period':`${lowBuoyancy?3.7:2.15}s`,'--flame-core-period':`${lowBuoyancy?3.1:1.55}s`};
 return <div className={`cosmic-flame-stage cosmic-flame-${geometry}`} style={style}>
   <div className="cosmic-flame-meta"><span>COMBUSTION CHAMBER / VISUAL MODEL</span><span className={visible?'cosmic-lit':'cosmic-off'}>{visible?'ILLUSTRATIVE FLAME':'FLAME SUPPRESSED'}</span></div>
   <div className="cosmic-flame-scenario"><strong>{location}</strong><span>{mode==='sealed'?'Sealed oxygenated chamber':'Outside / local conditions'} · {visualName}</span></div>
   <svg role="img" aria-label={visible?`${location}: animated qualitative flame; ${visualName}`:`${location}: no sustained flame depicted under selected conditions`} viewBox="0 0 320 308" className="cosmic-flame-svg">
    <defs>
      <radialGradient id="cf-chamber" cx="50%" cy="58%"><stop offset="0" stopColor="#193b5a"/><stop offset="1" stopColor="#0a1a2e"/></radialGradient>
      <radialGradient id="cf-halo"><stop offset="0" stopColor={lowBuoyancy?'#65a9fd':'#ffb25f'} stopOpacity=".55"/><stop offset="1" stopColor="#ffb25f" stopOpacity="0"/></radialGradient>
      <linearGradient id="cf-flame" x1=".2" x2=".7" y1="1" y2="0"><stop stopColor={lowBuoyancy?'#345ed0':'#c44f23'}/><stop offset=".45" stopColor={lowBuoyancy?'#59a8fa':'#ffaf40'}/><stop offset="1" stopColor={lowBuoyancy?'#b9e8ff':'#fff2ad'}/></linearGradient>
      <linearGradient id="cf-heart" x1="0" x2="0" y1="1" y2="0"><stop stopColor={lowBuoyancy?'#7fa6fb':'#fff2c3'}/><stop offset="1" stopColor="#f5f7ff"/></linearGradient>
      <pattern id="cf-grid" patternUnits="userSpaceOnUse" width="24" height="24"><path d="M24 0 H0 V24" fill="none" stroke="#8eb3ce" strokeOpacity=".11" strokeWidth=".7"/></pattern>
      <filter id="cf-blur"><feGaussianBlur stdDeviation="12"/></filter>
    </defs>
    <rect width="320" height="308" rx="10" fill="url(#cf-chamber)"/>
    <rect x="22" y="25" width="276" height="250" rx="6" fill="url(#cf-grid)"/>
    <path d="M21 243 H298 M159 25 V273" stroke="#7fabc4" strokeOpacity=".18" strokeDasharray="4 7"/>
    {visible && <g className="cosmic-flame-motion" transform={`rotate(${tilt},159,241)`}>
      <ellipse className="cosmic-flame-halo" cx="159" cy={lowBuoyancy?216-roundRadius*.75:top+height*.5} rx={width*2} ry={Math.max(55,height*.88)} fill="url(#cf-halo)" filter="url(#cf-blur)"/>
      {lowBuoyancy ? <>
        <ellipse className="cosmic-flame-shell" cx="159" cy={223-roundRadius*.85} rx={roundRadius} ry={roundRadius*.92} fill="url(#cf-flame)" opacity=".90"/>
        <ellipse className="cosmic-flame-core" cx="159" cy={225-roundRadius*.7} rx={roundRadius*.55} ry={roundRadius*.59} fill="url(#cf-heart)" opacity=".80"/>
      </> : <>
        <path d={outer} fill="url(#cf-flame)" className="cosmic-flame-shell" opacity=".96"/>
        <path d={inner} fill="url(#cf-heart)" opacity=".84" className="cosmic-flame-core"/>
      </>}
      <ellipse className="cosmic-flame-wick-glow" cx="159" cy="232" rx="15" ry="15" fill="#ffefbd" opacity=".30"/>
      {[0,1,2,3,4].map(i=><circle key={i} className={`cosmic-flame-spark cosmic-spark-${i}`} cx={141+(i*11)%39} cy={185+(i*15)%38} r={1.3+(i%3)*.6} fill={lowBuoyancy?'#a7dfff':'#ffd18a'}/>) }
    </g>}
    <g><path d="M151 242 H167 L164 262 H154 Z" fill="#aab9c5"/><rect x="122" y="261" width="74" height="7" rx="3" fill="#6489a4"/><path d="M159 242 V222" stroke="#bbb6a3" strokeWidth="3" strokeLinecap="round"/></g>
    <g fill="#94b4c9" fontFamily="monospace" fontSize="8"><text x="30" y="45">REF / 000</text><text x="29" y="290">NOT TO PHYSICAL SCALE</text><text x="255" y="290">SOLARIS</text></g>
   </svg>
   {!visible && <div className="cosmic-flame-empty"><span>Insufficient oxidizer support in this illustration.</span>{mode!=='sealed' && onUseChamber && <button type="button" onClick={onUseChamber}>Try a sealed chamber</button>}</div>}
   <p className="cosmic-flame-visual-note">Animated geometry is an educational illustration, not observed NASA footage. No calibrated temperature, flame speed, or extinction time is computed.</p>
  </div>;
}
