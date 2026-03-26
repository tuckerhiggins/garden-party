// PlantPortraits.js — Hand-illustrated SVG portraits for the Garden View roster
// Miyazaki soft palette · Each plant has a distinct personality and silhouette

import React from 'react';

// Shared soft color palette for portraits
const P = {
  wistP: '#9860c8', wistL: '#c8a8f0', wistD: '#6840a0',
  wistBud: '#e0c8f8', wistStem: '#8a6840',
  roseP: '#e84070', roseL: '#f8b0c8', roseBud: '#c03058',
  roseStem: '#6a8040', roseLeaf: '#4a7030',
  lavP: '#b890e0', lavL: '#dcc8f8', lavStem: '#90986a',
  hydDry: '#d8c898', hydDryD: '#b8a878', hydStem: '#787060',
  evG: '#4a7828', evGL: '#70a848', evD: '#2e5018',
  evBr: '#888040', evBrD: '#686030',
  svcO: '#d06030', svcL: '#f0a870', svcBud: '#f8c8a0',
  mapR: '#d85828', mapBr: '#907050',
  soilA: '#8a6040', soilB: '#6a4828',
  potGrey: '#a8a8a0', potGreyL: '#c8c8c0',
  potCedar: '#c09020', potBarrel: '#7a5030',
  sky: '#e8e0c8', skyD: '#d0c8b0',
  // Soft warm neutrals
  cream: '#f8f0e0', parchment: '#f0e8d0',
  warmWhite: '#faf6ee',
};

// SVG viewBox is always 240x180 for consistency
const VB = '0 0 240 180';

export function WisteriaPortrait({ season = 'early-spring' }) {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      {/* Sky wash */}
      <rect width="240" height="180" fill={P.sky} opacity="0.4"/>
      {/* Fence planks background */}
      {[0,28,56,84,112,140,168,196,224].map(x=>(
        <rect key={x} x={x} y="0" width="26" height="180"
          fill={x/28%2===0?'#d4a030':'#c09020'} opacity="0.35"/>
      ))}
      {/* Wire diamond grid */}
      {[[-20,90],[20,50],[60,90],[100,50],[140,90],[180,50],[220,90]].map(([wx,wy],i)=>(
        <line key={i} x1={wx} y1={wy} x2={wx+40} y2={wy-40} stroke="#c8b880" strokeWidth="0.8" opacity="0.6"/>
      ))}
      {[[-20,50],[20,90],[60,50],[100,90],[140,50],[180,90],[220,50]].map(([wx,wy],i)=>(
        <line key={i+10} x1={wx} y1={wy} x2={wx+40} y2={wy+40} stroke="#c8b880" strokeWidth="0.8" opacity="0.6"/>
      ))}

      {/* Barrel planter */}
      <rect x="100" y="156" width="40" height="16" rx="4" fill={P.potBarrel}/>
      <line x1="100" y1="161" x2="140" y2="161" stroke="#503010" strokeWidth="1.2"/>
      <line x1="100" y1="165" x2="140" y2="165" stroke="#503010" strokeWidth="1"/>

      {/* Woody trunk */}
      <path d="M120 156 Q118 140 120 120" stroke={P.wistStem} strokeWidth="3" fill="none" strokeLinecap="round"/>

      {/* Main tendrils — organic, reaching */}
      {[
        { d:"M120 120 Q108 100 95 75 Q85 55 88 35", w:2 },
        { d:"M120 120 Q125 98 118 72 Q112 48 115 22", w:2 },
        { d:"M120 120 Q138 102 148 78 Q155 55 150 30", w:1.8 },
        { d:"M118 100 Q104 82 98 58 Q94 38 96 18", w:1.5 },
        { d:"M122 108 Q140 88 155 65 Q162 45 158 20", w:1.5 },
        { d:"M116 88 Q100 70 92 48 Q88 28 90 8", w:1.2 },
        { d:"M124 95 Q144 75 158 52 Q165 32 162 8", w:1.2 },
      ].map((t,i)=>(
        <path key={i} d={t.d} stroke={i%3===0?P.wistP:i%3===1?P.wistL:P.wistD}
          strokeWidth={t.w} fill="none" strokeLinecap="round" opacity="0.85"/>
      ))}

      {/* Bud clusters — early spring, sparse and hopeful */}
      {[
        {cx:88,cy:35,r:5},{cx:115,cy:22,r:5.5},{cx:150,cy:30,r:5},
        {cx:96,cy:18,r:4},{cx:158,cy:20,r:4.5},{cx:90,cy:8,r:3.5},{cx:162,cy:8,r:3.5},
        {cx:102,cy:48,r:3},{cx:148,cy:45,r:3.5},
      ].map((b,i)=>(
        <g key={i}>
          <circle cx={b.cx} cy={b.cy} r={b.r+2} fill={P.wistBud} opacity="0.3"/>
          <circle cx={b.cx} cy={b.cy} r={b.r} fill={i%2===0?P.wistL:P.wistP}/>
          <circle cx={b.cx-1} cy={b.cy-1} r={1.2} fill="rgba(255,255,255,0.5)"/>
        </g>
      ))}

      {/* Soft light wash over everything */}
      <rect width="240" height="180" fill="rgba(255,248,220,0.08)"/>
    </svg>
  );
}

export function ClimbingRosePortrait({ variety = 'zephirine' }) {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#f0ece0" opacity="0.5"/>
      {/* Lattice background */}
      {[0,30,60,90,120,150,180,210].map(x=>(
        <line key={x} x1={x} y1="0" x2={x+60} y2="180" stroke="#c09020" strokeWidth="0.6" opacity="0.3"/>
      ))}
      {[0,30,60,90,120,150].map(y=>(
        <line key={y} x1="0" y1={y} x2="240" y2={y+60} stroke="#c09020" strokeWidth="0.6" opacity="0.3"/>
      ))}

      {/* Cedar planter */}
      <rect x="80" y="158" width="80" height="14" rx="2" fill={P.potCedar}/>
      <rect x="80" y="158" width="80" height="3" fill="rgba(0,0,0,0.15)"/>

      {/* Main canes — bare, early March */}
      {[
        {d:"M120 158 Q117 138 122 108 Q126 80 118 48", w:2.5},
        {d:"M112 155 Q106 132 100 108 Q94 82 98 52", w:2},
        {d:"M128 155 Q136 130 140 104 Q143 78 138 50", w:2},
        {d:"M108 148 Q98 122 88 96 Q80 70 84 38", w:1.5},
        {d:"M132 148 Q146 122 154 96 Q160 70 155 40", w:1.5},
      ].map((c,i)=>(
        <path key={i} d={c.d} stroke={P.roseStem} strokeWidth={c.w} fill="none" strokeLinecap="round"/>
      ))}

      {/* Tiny red buds at tips — the only sign of life */}
      {[
        {cx:118,cy:48},{cx:98,cy:52},{cx:138,cy:50},
        {cx:84,cy:38},{cx:155,cy:40},{cx:92,cy:22},{cx:150,cy:24},
      ].map((b,i)=>(
        <g key={i}>
          <circle cx={b.cx} cy={b.cy} r={5} fill="rgba(180,80,100,0.2)"/>
          <circle cx={b.cx} cy={b.cy} r={3.5} fill={P.roseBud}/>
          <circle cx={b.cx-1} cy={b.cy-1} r={1} fill="rgba(255,200,210,0.6)"/>
        </g>
      ))}

      {/* Lavender hint (if in same planter) */}
      {variety === 'with-lavender' && (
        <g opacity="0.7">
          {[-12,-4,4,12].map((ox,i)=>(
            <g key={i}>
              <line x1={120+ox} y1="158" x2={118+ox} y2="138"
                stroke={P.lavStem} strokeWidth="1.5"/>
              <circle cx={118+ox} cy="136" r="4" fill={P.lavL} opacity="0.85"/>
            </g>
          ))}
        </g>
      )}

      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

export function LavenderPortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#ede8f5" opacity="0.4"/>
      {/* Cedar planter base */}
      <rect x="70" y="155" width="100" height="18" rx="3" fill={P.potCedar}/>
      <rect x="70" y="155" width="100" height="3" fill="rgba(0,0,0,0.12)"/>

      {/* Silver-green stems */}
      {[-40,-28,-16,-4,8,20,32,44].map((ox,i)=>(
        <g key={i}>
          <line x1={120+ox} y1="155"
            x2={118+ox+Math.sin(i*1.3)*4} y2={110+i%3*4}
            stroke={P.lavStem} strokeWidth="1.8" strokeLinecap="round"/>
          {/* Flower spike */}
          <ellipse cx={118+ox+Math.sin(i*1.3)*4} cy={106+i%3*4}
            rx="5" ry="8"
            fill={i%2===0?P.lavP:P.lavL} opacity="0.85"/>
          <ellipse cx={116+ox+Math.sin(i*1.3)*4} cy={104+i%3*4}
            rx="2" ry="3"
            fill="rgba(255,255,255,0.3)"/>
        </g>
      ))}

      {/* Silver foliage at base */}
      {[-35,-20,-5,10,25,40].map((ox,i)=>(
        <ellipse key={i} cx={120+ox} cy={148+i%2*3}
          rx="8" ry="4" fill="#b0b890" opacity="0.6"
          transform={`rotate(${-20+i*8} ${120+ox} ${148+i%2*3})`}/>
      ))}

      {/* Soft purple bloom glow */}
      <ellipse cx="120" cy="118" rx="60" ry="30" fill={P.lavP} opacity="0.06"/>
      <rect width="240" height="180" fill="rgba(255,248,220,0.05)"/>
    </svg>
  );
}

export function HydrangeaPortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#f0ede8" opacity="0.4"/>

      {/* Large round pot */}
      <ellipse cx="120" cy="170" rx="44" ry="8" fill="#888" opacity="0.3"/>
      <rect x="76" y="150" width="88" height="22" rx="6" fill={P.potGrey}/>
      <rect x="78" y="148" width="84" height="10" rx="4" fill={P.potGreyL}/>
      <rect x="78" y="148" width="84" height="3" rx="3" fill="rgba(255,255,255,0.15)"/>

      {/* Woody stems */}
      <path d="M120 148 Q118 130 120 112" stroke={P.hydStem} strokeWidth="3" fill="none"/>
      <path d="M120 130 Q108 118 100 100" stroke={P.hydStem} strokeWidth="2" fill="none"/>
      <path d="M120 130 Q132 118 140 100" stroke={P.hydStem} strokeWidth="2" fill="none"/>
      <path d="M120 112 Q108 96 102 78" stroke={P.hydStem} strokeWidth="1.8" fill="none"/>
      <path d="M120 112 Q132 96 138 78" stroke={P.hydStem} strokeWidth="1.8" fill="none"/>
      <path d="M120 112 Q120 92 120 72" stroke={P.hydStem} strokeWidth="1.8" fill="none"/>

      {/* Dried papery flower heads — the beautiful winter state */}
      {[
        {cx:120,cy:68,r:18},{cx:100,cy:76,r:15},{cx:140,cy:74,r:16},
        {cx:102,cy:56,r:13},{cx:138,cy:54,r:14},
      ].map((h,i)=>(
        <g key={i}>
          {/* Soft glow behind */}
          <circle cx={h.cx} cy={h.cy} r={h.r+6} fill={P.hydDry} opacity="0.2"/>
          {/* Petal cluster */}
          {Array.from({length:10}).map((_,j)=>{
            const a=(j/10)*Math.PI*2;
            const r2=h.r*0.7;
            return (
              <ellipse key={j}
                cx={h.cx+Math.cos(a)*r2*0.7} cy={h.cy+Math.sin(a)*r2*0.5}
                rx="5" ry="3.5"
                fill={j%2===0?P.hydDry:P.hydDryD}
                transform={`rotate(${a*180/Math.PI} ${h.cx+Math.cos(a)*r2*0.7} ${h.cy+Math.sin(a)*r2*0.5})`}
                opacity="0.9"/>
            );
          })}
          {/* Center */}
          <circle cx={h.cx} cy={h.cy} r={h.r*0.3} fill={P.hydDryD} opacity="0.6"/>
          {/* Highlight */}
          <circle cx={h.cx-h.r*0.2} cy={h.cy-h.r*0.2} r={h.r*0.15} fill="rgba(255,255,255,0.25)"/>
        </g>
      ))}

      <rect width="240" height="180" fill="rgba(255,248,210,0.07)"/>
    </svg>
  );
}

export function ServiceberryPortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      {/* Warm morning light */}
      <rect width="240" height="180" fill="#f5ece0" opacity="0.5"/>
      <ellipse cx="60" cy="60" rx="80" ry="60" fill="#f8d090" opacity="0.12"/>

      {/* Grey glazed pot */}
      <ellipse cx="120" cy="172" rx="28" ry="6" fill="#888" opacity="0.25"/>
      <rect x="92" y="158" width="56" height="16" rx="4" fill="#a0a098"/>
      <rect x="94" y="156" width="52" height="7" rx="3" fill="#b8b8b0"/>
      <rect x="94" y="156" width="52" height="2" rx="2" fill="rgba(255,255,255,0.2)"/>

      {/* Main trunk — elegant, coral-red */}
      <path d="M120 158 Q118 138 120 108" stroke={P.svcO} strokeWidth="3.5" fill="none" strokeLinecap="round"/>

      {/* Primary branches */}
      <path d="M120 130 Q132 112 148 90" stroke={P.svcO} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M120 130 Q106 110 90 88" stroke={P.svcO} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M120 108 Q134 90 148 68" stroke="#d06840" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M120 108 Q104 88 88 66" stroke="#d06840" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* Fine branches */}
      <path d="M148 90 Q158 74 162 52" stroke="#e07848" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M90 88 Q78 70 76 48" stroke="#e07848" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M148 68 Q156 50 154 30" stroke="#e07848" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M88 66 Q78 48 80 28" stroke="#e07848" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M120 108 Q122 88 120 62" stroke="#d06840" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* Bud tips — coral glow, swelling in early spring */}
      {[
        {cx:162,cy:52},{cx:76,cy:48},{cx:154,cy:30},{cx:80,cy:28},
        {cx:120,cy:62},{cx:148,cy:90},{cx:90,cy:88},
      ].map((b,i)=>(
        <g key={i}>
          <circle cx={b.cx} cy={b.cy} r={7} fill={P.svcL} opacity="0.25"/>
          <circle cx={b.cx} cy={b.cy} r={4} fill={P.svcBud}/>
          <circle cx={b.cx-1} cy={b.cy-1} r={1.5} fill="rgba(255,255,255,0.5)"/>
        </g>
      ))}

      {/* Warm glow around whole plant */}
      <ellipse cx="120" cy="90" rx="70" ry="80" fill={P.svcO} opacity="0.04"/>
      <rect width="240" height="180" fill="rgba(255,245,220,0.07)"/>
    </svg>
  );
}

export function MaplePortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#f2ede8" opacity="0.4"/>

      {/* Grey pot */}
      <ellipse cx="120" cy="172" rx="24" ry="5" fill="#888" opacity="0.2"/>
      <rect x="96" y="158" width="48" height="15" rx="4" fill="#909090"/>
      <rect x="98" y="156" width="44" height="7" rx="3" fill="#a8a8a8"/>

      {/* Main trunk — slender, contemplative */}
      <path d="M120 158 Q119 142 120 118" stroke={P.mapBr} strokeWidth="2.5" fill="none" strokeLinecap="round"/>

      {/* Delicate branching — the maple's fine architecture */}
      <path d="M120 132 Q130 118 142 102" stroke={P.mapBr} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M120 132 Q108 116 96 100" stroke={P.mapBr} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M120 118 Q132 102 146 84" stroke="#807040" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M120 118 Q106 100 92 82" stroke="#807040" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M120 118 Q120 98 120 74" stroke="#807040" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* Fine twigs */}
      {[
        [142,102,154,82],[142,102,138,78],[96,100,84,80],[96,100,100,76],
        [146,84,156,62],[146,84,142,58],[92,82,80,60],[92,82,86,56],
        [120,74,126,50],[120,74,114,50],[120,74,120,44],
      ].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#706838" strokeWidth="1" strokeLinecap="round"/>
      ))}

      {/* Very early buds — tiny, barely there */}
      {[
        {cx:154,cy:82},{cx:138,cy:78},{cx:84,cy:80},{cx:100,cy:76},
        {cx:156,cy:62},{cx:80,cy:60},{cx:126,cy:50},{cx:114,cy:50},{cx:120,cy:44},
      ].map((b,i)=>(
        <g key={i} opacity="0.65">
          <circle cx={b.cx} cy={b.cy} r={4} fill="#d0a060" opacity="0.2"/>
          <circle cx={b.cx} cy={b.cy} r={2.5} fill="#c08860"/>
        </g>
      ))}

      {/* Quiet atmosphere */}
      <rect width="240" height="180" fill="rgba(255,248,220,0.05)"/>
    </svg>
  );
}

export function EvergreenPortrait({ isXmas = false }) {
  const c1 = isXmas ? P.evBr : P.evG;
  const c2 = isXmas ? P.evBrD : P.evD;
  const c3 = isXmas ? '#c0b870' : P.evGL;

  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#eef2e8" opacity="0.4"/>

      {/* White ribbed cylinder pot */}
      <ellipse cx="120" cy="172" rx="26" ry="5" fill="#888" opacity="0.2"/>
      <rect x="94" y="154" width="52" height="20" rx="4" fill="#c8c8c0"/>
      {[158,162,166,170].map(y=>(
        <line key={y} x1="95" y1={y} x2="145" y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth="0.8"/>
      ))}
      <rect x="96" y="152" width="48" height="5" rx="3" fill="#d8d8d0"/>

      {/* Columnar layered foliage */}
      {[
        {w:14,y:150},{w:22,y:138},{w:30,y:126},{w:36,y:114},
        {w:36,y:102},{w:32,y:90},{w:26,y:78},{w:20,y:66},
        {w:14,y:54},{w:10,y:42},{w:6,y:30},
      ].map((l,i)=>(
        <g key={i}>
          <polygon
            points={`${120},${l.y-12} ${120-l.w/2-2+Math.sin(i)*1.5},${l.y} ${120+l.w/2+2-Math.sin(i)*1.5},${l.y}`}
            fill={i%2===0?c1:c2}/>
          <polygon
            points={`${120},${l.y-12} ${120-l.w/2+4},${l.y} ${120},${l.y}`}
            fill={c3} opacity="0.2"/>
        </g>
      ))}

      {/* Christmas ornaments */}
      {isXmas && [
        {cx:108,cy:90,c:'#e03030'},{cx:132,cy:102,c:'#e8d020'},
        {cx:112,cy:114,c:'#2880e0'},{cx:130,cy:78,c:'#e03030'},
      ].map((o,i)=>(
        <g key={i}>
          <circle cx={o.cx} cy={o.cy} r={5.5} fill={o.c}/>
          <circle cx={o.cx-1} cy={o.cy-2} r={1.8} fill="rgba(255,255,255,0.55)"/>
          <rect x={o.cx-1} y={o.cy-8} width="2" height="4" fill="#a08040" rx="1"/>
        </g>
      ))}

      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

export function DKORosePortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#f5ece8" opacity="0.4"/>
      {/* Soil */}
      <rect x="20" y="155" width="200" height="25" rx="4" fill={P.soilA} opacity="0.8"/>
      <rect x="20" y="155" width="200" height="5" rx="4" fill={P.soilB} opacity="0.5"/>
      {/* Rock texture */}
      {[40,70,100,130,160,190].map((x,i)=>(
        <ellipse key={i} cx={x} cy={163+i%2*3} rx={3+i%2} ry="2" fill="#888060" opacity="0.4"/>
      ))}

      {/* Six rose bushes — bare canes in March */}
      {[42,80,118,156,194,232].slice(0,5).map((bx,i)=>(
        <g key={i} transform={`translate(${bx},155)`}>
          {[-40,-20,0,20,40].map((a,j)=>{
            const angle=(a*Math.PI)/180;
            return <line key={j} x1="0" y1="0"
              x2={Math.cos(angle-Math.PI/2)*38}
              y2={Math.sin(angle-Math.PI/2)*38}
              stroke={P.roseStem} strokeWidth="1.8" strokeLinecap="round"/>;
          })}
          {/* Bud at top */}
          <circle cx="0" cy="-36" r="4.5" fill="rgba(180,80,100,0.2)"/>
          <circle cx="0" cy="-36" r="3" fill={P.roseBud}/>
        </g>
      ))}

      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

export function WormPortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#ede8e0" opacity="0.4"/>
      {/* Rich soil */}
      <rect x="0" y="80" width="240" height="100" fill={P.soilA} opacity="0.7"/>
      <rect x="0" y="80" width="240" height="8" rx="2" fill={P.soilB} opacity="0.5"/>
      {/* Soil texture */}
      {Array.from({length:20}).map((_,i)=>(
        <ellipse key={i} cx={12+i*12} cy={95+i%3*15} rx={2+i%3} ry="1.5" fill="#5a3818" opacity="0.4"/>
      ))}
      {/* Worms */}
      {[
        {d:"M50 120 Q70 108 90 120 Q110 132 130 120",c:"#c09870"},
        {d:"M80 145 Q100 135 120 145 Q140 155 160 145",c:"#b08860"},
        {d:"M140 115 Q155 105 170 115 Q185 125 200 112",c:"#c09870"},
      ].map((w,i)=>(
        <g key={i}>
          <path d={w.d} stroke={w.c} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.85"/>
          <path d={w.d} stroke="rgba(255,200,160,0.3)" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </g>
      ))}
      {/* Small rocks */}
      {[30,80,140,190].map((x,i)=>(
        <ellipse key={i} cx={x} cy={90+i*3} rx={5+i} ry={3+i%2} fill="#888060" opacity="0.5"/>
      ))}
      {/* Text label */}
      <text x="120" y="50" textAnchor="middle" fontFamily="Georgia, serif"
        fontSize="13" fill="#8a6840" fontStyle="italic" opacity="0.8">
        the quiet engineers
      </text>
      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

export function EmptyPotPortrait({ potColor = '#d0d0c0', isMemorial = false }) {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#eeeae4" opacity="0.4"/>
      {/* Pot */}
      <path d="M80 160 L70 108 L170 108 L160 160 Z" fill={potColor} opacity="0.7"/>
      <ellipse cx="120" cy="108" rx="50" ry="10" fill={potColor}/>
      <ellipse cx="120" cy="108" rx="44" ry="8" fill="rgba(0,0,0,0.1)"/>
      {/* Soil */}
      <ellipse cx="120" cy="108" rx="44" ry="8" fill={P.soilA} opacity="0.6"/>
      {isMemorial ? (
        // Cross
        <g opacity="0.6">
          <line x1="120" y1="70" x2="120" y2="40" stroke="#907060" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="108" y1="57" x2="132" y2="57" stroke="#907060" strokeWidth="2.5" strokeLinecap="round"/>
          <text x="120" y="30" textAnchor="middle" fontFamily="Georgia, serif"
            fontSize="10" fill="#907060" fontStyle="italic">in memoriam</text>
        </g>
      ) : (
        // Plus sign
        <g opacity="0.4">
          <line x1="120" y1="70" x2="120" y2="48" stroke={potColor} strokeWidth="3" strokeLinecap="round"/>
          <line x1="109" y1="59" x2="131" y2="59" stroke={potColor} strokeWidth="3" strokeLinecap="round"/>
          <text x="120" y="92" textAnchor="middle" fontFamily="Georgia, serif"
            fontSize="11" fill="#907060" fontStyle="italic">plant something</text>
        </g>
      )}
      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

export function StonePotPortrait() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'100%'}}>
      <rect width="240" height="180" fill="#eee8dc" opacity="0.4"/>
      {/* Ornate stone bowl */}
      <path d="M60 155 Q58 135 70 128 L170 128 Q182 135 180 155 Z"
        fill="#c8b890" stroke="#a09060" strokeWidth="0.8"/>
      {/* Carved relief detail */}
      {[80,100,120,140,160].map((x,i)=>(
        <ellipse key={i} cx={x} cy={141+i%2*3} rx="7" ry="10"
          fill="none" stroke="#b0a070" strokeWidth="0.6" opacity="0.6"
          transform={`rotate(${i%2===0?-5:5} ${x} ${141+i%2*3})`}/>
      ))}
      {/* Rim */}
      <rect x="58" y="124" width="124" height="8" rx="4" fill="#d8c8a0"/>
      <rect x="60" y="124" width="120" height="3" rx="3" fill="rgba(255,255,255,0.2)"/>
      {/* Soil */}
      <ellipse cx="120" cy="128" rx="56" ry="7" fill={P.soilA} opacity="0.7"/>
      {/* Dead mum stubs */}
      {[90,110,130,150].map((x,i)=>(
        <g key={i}>
          <line x1={x} y1="128" x2={x-2} y2={100+i%2*8} stroke="#706050" strokeWidth="2" strokeLinecap="round"/>
          <circle cx={x-2} cy={98+i%2*8} r="5" fill="#807060"/>
          <circle cx={x-3} cy={96+i%2*8} r="2" fill="rgba(255,255,255,0.15)"/>
        </g>
      ))}
      <text x="120" y="175" textAnchor="middle" fontFamily="Georgia, serif"
        fontSize="10" fill="#907060" fontStyle="italic" opacity="0.7">ready to replant</text>
      <rect width="240" height="180" fill="rgba(255,248,220,0.06)"/>
    </svg>
  );
}

// Master function — returns the right portrait for a plant
export function PlantPortrait({ plant, aiSvg }) {
  // Only render AI SVG if it looks complete — truncated SVGs cause DOM errors
  if (aiSvg && aiSvg.includes('</svg>')) {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: aiSvg }}/>
    );
  }
  const { type, id, health } = plant;

  if (health === 'memorial') return <EmptyPotPortrait isMemorial={true} potColor="#b0a080"/>;

  switch(type) {
    case 'wisteria':      return <WisteriaPortrait/>;
    case 'climbing-rose': return id === 'zephy-l'
      ? <ClimbingRosePortrait variety="with-lavender"/>
      : <ClimbingRosePortrait/>;
    case 'lavender':      return <LavenderPortrait/>;
    case 'hydrangea':     return <HydrangeaPortrait/>;
    case 'serviceberry':  return <ServiceberryPortrait/>;
    case 'maple':         return <MaplePortrait/>;
    case 'evergreen':     return <EvergreenPortrait isXmas={false}/>;
    case 'evergreen-xmas':return <EvergreenPortrait isXmas={true}/>;
    case 'rose':          return <DKORosePortrait/>;
    case 'magnolia':      return <HydrangeaPortrait/>;
    case 'worm':          return <WormPortrait/>;
    case 'stone-pot':     return <StonePotPortrait/>;
    case 'empty-pot':     return <EmptyPotPortrait potColor={plant.color||'#c0c0b8'}/>;
    default:              return <ServiceberryPortrait/>;
  }
}
