// src/components/MobileMapProtos.js
// Three clickable map prototypes for the mobile Maps tab.
// A selector at the top lets Tucker switch between them.
// Prototype 1: Blueprint — simplified SVG overhead map
// Prototype 2: Field Journal — parchment portrait grid
// Prototype 3: Garden Walk — numbered route with stop cards

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PlantPortrait } from '../PlantPortraits';
import { computeWaterLevel, HEALTH_LEVEL } from '../utils/health';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';
const C = {
  appBg:'#f2ece0', cardBg:'#faf6ee', cardBorder:'rgba(160,130,80,0.18)',
  uiBg:'#120c06', uiPane:'#1c1008', uiBorder:'#5a3c18',
  uiText:'#f0e4cc', uiMuted:'#a89070', uiGold:'#d4a830',
};
const ACT_EMOJI = { water:'💧', neem:'🛡️', prune:'✂️', train:'🪢', fertilize:'🌿', photo:'📸', visit:'👀', worms:'🪱', tend:'✨' };

function healthColor(h) {
  return { thriving:'#58c030', content:'#88c838', thirsty:'#c8a820',
    overlooked:'#c87020', struggling:'#c83020', resting:'#7898a8',
    recovering:'#98a828', empty:'#909088', memorial:'#907060' }[h] || '#909080';
}
function healthGlyph(h) {
  return { thriving:'◆', content:'◇', thirsty:'△', overlooked:'▽',
    struggling:'⚠', resting:'◯', recovering:'↑', empty:'○', memorial:'†' }[h] || '·';
}
function plantColor(type) {
  return { wisteria:'#9860c8', 'climbing-rose':'#e84070', lavender:'#b890e0',
    hydrangea:'#b8c8e0', serviceberry:'#d06030', maple:'#d85828',
    evergreen:'#4a7828', rose:'#e84070', magnolia:'#e8a0c0' }[type] || '#909080';
}
function arcPath(cx, cy, r, frac) {
  if (frac <= 0) return null;
  if (frac >= 0.999) return `M ${cx} ${cy-r} A ${r} ${r} 0 1 1 ${cx-0.001} ${cy-r}`;
  const a = frac * 2 * Math.PI;
  const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a);
  return `M ${cx} ${cy-r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${ex} ${ey}`;
}

// Walk stop definitions — physical garden route
const WALK_STOPS = [
  { id:'fence',      label:'The Fence',          emoji:'🌿', plantIds:['wisteria-l','wisteria-r'] },
  { id:'left-wall',  label:'Left Back Planter',  emoji:'🌹', plantIds:['ev-c23','zephy-l','lavender'] },
  { id:'right-wall', label:'Right Back Planter', emoji:'🌹', plantIds:['zephy-r','lavender-r','ev-c34'] },
  { id:'railing',    label:'The Railing',         emoji:'🍂', plantIds:['serviceberry','hydrangea-1','hydrangea-2','hydrangea-3','hydrangea-4','maple','ev-xmas'] },
  { id:'floor',      label:'Floor Pots',          emoji:'🪴', plantIds:['pot-midcentury','pot-white-1','pot-blue','pot-pink'] },
  { id:'front',      label:"Emma's Rose Garden",  emoji:'🌹', useFrontPlants:true },
];

// Journal column groupings
const JOURNAL_GROUPS = [
  { id:'fence',   label:'FENCE',     walls:[2] },
  { id:'back',    label:'BACK WALL', walls:[3,'c23','c34'] },
  { id:'railing', label:'RAILING',   walls:[4,'c41'] },
  { id:'floor',   label:'FLOOR',     walls:[1] },
];

// ─────────────────────────────────────────────────────
// Shared bottom sheet — slides up from bottom on plant tap
// ─────────────────────────────────────────────────────
function PlantSheet({ plant, careLog, briefings, portraits, onAction, onClose }) {
  const portrait = portraits?.[plant.id] || {};
  const briefing = briefings?.[plant.id] || null;
  const healthLevel = HEALTH_LEVEL[plant.health] ?? 0.5;
  const waterLevel  = computeWaterLevel(plant, careLog, briefing?.waterDays ? briefing : null);
  const needsWater  = plant.actions?.includes('water');
  const hColor = healthLevel >= 0.75 ? '#58c030' : healthLevel >= 0.5 ? '#a8c820' : healthLevel >= 0.25 ? '#d4820a' : '#c83020';
  const wColor = waterLevel  >= 0.6  ? '#3898d0' : waterLevel  >= 0.35 ? '#c8a820' : '#c83020';
  const actions = (plant.actions || []).filter(k => k !== 'note' && k !== 'visit').slice(0, 4);
  if (actions.length === 0 && plant.actions?.includes('visit')) actions.push('visit');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Drag handle */}
      <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 6px' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:'rgba(160,130,80,0.30)' }}/>
      </div>

      {/* Header row */}
      <div style={{ display:'flex', gap:12, padding:'0 16px 12px', alignItems:'flex-start' }}>
        <div style={{ width:64, height:48, borderRadius:6, overflow:'hidden', flexShrink:0,
          border:`1px solid ${plantColor(plant.type)}30` }}>
          <PlantPortrait plant={plant} aiSvg={portrait.svg || null}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:SERIF, fontSize:18, fontWeight:600, color:'#2a1808', lineHeight:1.2 }}>{plant.name}</div>
          {plant.subtitle && <div style={{ fontFamily:SERIF, fontSize:12, color:'#a08060', marginTop:2 }}>{plant.subtitle}</div>}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
            <span style={{ fontFamily:MONO, fontSize:8, color:healthColor(plant.health) }}>{healthGlyph(plant.health)}</span>
            <span style={{ fontFamily:SERIF, fontSize:11, color:healthColor(plant.health) }}>{plant.health}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'#a08060', cursor:'pointer', padding:'0 4px', lineHeight:1 }}>×</button>
      </div>

      {/* Bars */}
      <div style={{ padding:'0 16px 12px', display:'flex', flexDirection:'column', gap:5 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:MONO, fontSize:5, color:'rgba(80,50,20,0.45)', width:16 }}>HP</span>
          <div style={{ flex:1, height:6, background:'rgba(0,0,0,0.10)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ width:`${Math.round(healthLevel*100)}%`, height:'100%', background:hColor, borderRadius:3 }}/>
          </div>
          <span style={{ fontFamily:MONO, fontSize:5, color:'rgba(80,50,20,0.40)', width:24, textAlign:'right' }}>{Math.round(healthLevel*100)}%</span>
        </div>
        {needsWater && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:MONO, fontSize:5, color:'rgba(80,50,20,0.45)', width:16 }}>💧</span>
            <div style={{ flex:1, height:6, background:'rgba(0,0,0,0.10)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ width:`${Math.round(waterLevel*100)}%`, height:'100%', background:wColor, borderRadius:3 }}/>
            </div>
            <span style={{ fontFamily:MONO, fontSize:5, color:'rgba(80,50,20,0.40)', width:24, textAlign:'right' }}>{Math.round(waterLevel*100)}%</span>
          </div>
        )}
      </div>

      {/* Visual note */}
      {portrait.visualNote && !portrait.analyzing && (
        <div style={{ margin:'0 16px 12px', padding:'8px 10px', background:'rgba(160,130,80,0.08)',
          borderRadius:6, fontFamily:SERIF, fontSize:12, fontStyle:'italic', color:'rgba(120,90,50,0.80)', lineHeight:1.5 }}>
          {portrait.visualNote}
        </div>
      )}

      {/* Quick actions */}
      {actions.length > 0 && (
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {actions.map(key => (
            <button key={key} onClick={() => { onAction(key, plant); onClose(); }}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'9px 14px',
                background:C.uiPane, border:`1px solid ${C.uiBorder}`, borderRadius:8,
                color:C.uiText, fontFamily:SERIF, fontSize:13, cursor:'pointer' }}>
              <span style={{ fontSize:14 }}>{ACT_EMOJI[key] || '✨'}</span>
              <span>{ACT_EMOJI[key] ? key.charAt(0).toUpperCase()+key.slice(1) : key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// PROTOTYPE 1: Terrace Blueprint
// Minimal SVG overhead map, dark HUD aesthetic
// ─────────────────────────────────────────────────────
function BlueprintProto({ plants, frontPlants, careLog, briefings, portraits, onAction }) {
  const [section, setSection] = useState('terrace');
  const [selectedId, setSelectedId] = useState(null);
  const sheetOpen = selectedId !== null;
  const allPlants = section === 'terrace' ? plants : frontPlants;
  const selected   = allPlants.find(p => p.id === selectedId) || null;

  const urgentCount = useMemo(() =>
    plants.filter(p => ['thirsty','overlooked','struggling'].includes(p.health)).length,
  [plants]);

  const waterLevels = useMemo(() => {
    const m = {};
    allPlants.forEach(p => { m[p.id] = computeWaterLevel(p, careLog, briefings?.[p.id]?.waterDays ? briefings[p.id] : null); });
    return m;
  }, [allPlants, careLog, briefings]);

  // SVG coordinate helpers — viewBox 0 0 100 72
  // terrace: pos.x → svgX, pos.y → svgY
  function toSVG(pos) { return { x: 4 + pos.x * 89, y: 4 + pos.y * 62 }; }
  // front garden: map differently (horizontal garden bed)
  function toFrontSVG(pos) { return { x: 8 + pos.x * 84, y: 12 + pos.y * 48 }; }

  const activePlants = allPlants.filter(p => p.health !== 'empty' && p.type !== 'empty-pot');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.uiBg }}>
      {/* Header */}
      <div style={{ height:44, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 14px', borderBottom:`1px solid ${C.uiBorder}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:MONO, fontSize:7, color:C.uiGold }}>
            {section === 'terrace' ? 'TERRACE' : "EMMA'S ROSES"}
          </span>
          {section === 'terrace' && urgentCount > 0 && (
            <span style={{ fontFamily:MONO, fontSize:6, color:'#c83020' }}>· {urgentCount} need care</span>
          )}
          {section === 'terrace' && urgentCount === 0 && (
            <span style={{ fontFamily:MONO, fontSize:6, color:'#58c030' }}>· all clear</span>
          )}
        </div>
        <button onClick={() => { setSection(s => s === 'terrace' ? 'front' : 'terrace'); setSelectedId(null); }}
          style={{ background:'rgba(212,168,48,0.12)', border:`1px solid ${C.uiBorder}`, borderRadius:4,
            padding:'4px 8px', color:C.uiGold, fontFamily:MONO, fontSize:6, cursor:'pointer' }}>
          {section === 'terrace' ? 'FRONT ▾' : 'TERRACE ▾'}
        </button>
      </div>

      {/* SVG Map */}
      <div style={{ padding:'12px', flexShrink:0 }}>
        <svg viewBox="0 0 100 72" style={{ width:'100%', display:'block', touchAction:'none' }}>
          {/* Deck background */}
          {section === 'terrace' ? (
            <>
              <rect x={0} y={0} width={100} height={72} fill="#0e0b08"/>
              {/* Wall 2 — fence (left) */}
              <rect x={0} y={0} width={4} height={72} fill="rgba(184,140,60,0.30)"/>
              {/* Wall 3 — back */}
              <rect x={0} y={0} width={100} height={4} fill="rgba(190,180,140,0.25)"/>
              {/* Wall 4 — railing (right) */}
              <rect x={93} y={0} width={7} height={72} fill="rgba(60,64,56,0.80)"/>
              {/* Wall 1 — building (bottom) */}
              <rect x={0} y={66} width={100} height={6} fill="rgba(200,196,160,0.20)"/>
              {/* Deck interior */}
              <rect x={4} y={4} width={89} height={62} fill="#2a2420"/>
              {/* Wire hint on fence */}
              {[10,18,26,34,42,50,58,66].map(y => (
                <line key={y} x1={0} y1={y} x2={4} y2={y} stroke="rgba(210,195,130,0.25)" strokeWidth={0.3}/>
              ))}
            </>
          ) : (
            <>
              <rect x={0} y={0} width={100} height={72} fill="#0e0b08"/>
              <rect x={5} y={5} width={90} height={62} rx={2} fill="rgba(40,60,24,0.70)" stroke="rgba(180,160,100,0.30)" strokeWidth={0.5}/>
              <text x={8} y={13} fontFamily={SERIF} fontSize={3.5} fill="rgba(212,168,48,0.55)" fontStyle="italic">Emma's Rose Garden</text>
            </>
          )}

          {/* Plant nodes */}
          {activePlants.map(p => {
            const pos = section === 'terrace' ? toSVG(p.pos) : toFrontSVG(p.pos);
            const { x: cx, y: cy } = pos;
            const isSelected = p.id === selectedId;
            const hLevel = HEALTH_LEVEL[p.health] ?? 0.5;
            const wLevel = waterLevels[p.id] ?? 1;
            const pColor = plantColor(p.type);
            const urgent = ['thirsty','overlooked','struggling'].includes(p.health);
            const arc = p.actions?.includes('water') ? arcPath(cx, cy, 6.5, wLevel) : null;
            // Abbreviated label: first word, max 5 chars
            const shortName = p.name.split(' ')[0].slice(0, 5).toUpperCase();

            return (
              <g key={p.id} onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                style={{ cursor:'pointer' }}>
                {/* Transparent hit area — generous for fat fingers */}
                <circle cx={cx} cy={cy} r={10} fill="transparent"/>
                {/* Urgency halo */}
                {urgent && <circle cx={cx} cy={cy} r={7} fill={healthColor(p.health)} opacity={0.15}
                  style={{ animation:'gpMapPulse 2s ease-in-out infinite' }}/>}
                {/* Water arc */}
                {arc && <path d={arc} fill="none" stroke={healthColor(p.health)} strokeWidth={1.1} strokeLinecap="round" opacity={0.65}/>}
                {/* Decorative outer ring */}
                <circle cx={cx} cy={cy} r={4.8} fill="none" stroke={pColor} strokeWidth={0.5} opacity={isSelected ? 0 : 0.32}/>
                {/* Main node */}
                <circle cx={cx} cy={cy} r={3.4} fill={pColor} opacity={isSelected ? 0 : 0.92}/>
                {/* Health glyph inside node */}
                {!isSelected && (
                  <text x={cx} y={cy + 1.1} textAnchor="middle" fontSize={2.6}
                    fill="rgba(255,255,255,0.65)" fontFamily="sans-serif" style={{ pointerEvents:'none' }}>
                    {healthGlyph(p.health)}
                  </text>
                )}
                {/* Name label below */}
                <text x={cx} y={cy + 9} textAnchor="middle" fontSize={2.4}
                  fill="rgba(220,200,150,0.50)" fontFamily="monospace" style={{ pointerEvents:'none' }}>
                  {shortName}
                </text>
                {/* Selected state */}
                {isSelected && (
                  <>
                    <circle cx={cx} cy={cy} r={3.4} fill="none" stroke={C.uiGold} strokeWidth={0.8}/>
                    <circle cx={cx} cy={cy} r={6} fill="none" stroke={C.uiGold} strokeWidth={0.5} strokeDasharray="1.8 1.4" opacity={0.65}/>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        <div style={{ display:'flex', gap:12, padding:'6px 2px', flexWrap:'wrap' }}>
          {[['◉','Thriving','#58c030'],['◉','Thirsty','#c8a820'],['◉','Struggling','#c83020'],['◌','Water arc','rgba(120,180,220,0.7)']].map(([sym,lbl,clr]) => (
            <span key={lbl} style={{ display:'flex', alignItems:'center', gap:3, fontFamily:MONO, fontSize:5, color:C.uiMuted }}>
              <span style={{ color:clr }}>{sym}</span>{lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom sheet backdrop */}
      {sheetOpen && (
        <div onClick={() => setSelectedId(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.20)', zIndex:98 }}/>
      )}

      {/* Bottom sheet */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        height:'52vh', background:C.cardBg, borderRadius:'14px 14px 0 0',
        border:`1px solid ${C.cardBorder}`, zIndex:99,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        overflowY:'auto',
      }}>
        {selected && (
          <PlantSheet plant={selected} careLog={careLog} briefings={briefings}
            portraits={portraits} onAction={onAction} onClose={() => setSelectedId(null)}/>
        )}
      </div>

      <style>{`
        @keyframes gpMapPulse { 0%,100%{opacity:0.18;transform:scale(1)} 50%{opacity:0.30;transform:scale(1.4)} }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// PROTOTYPE 2: Field Journal
// Parchment portrait grid, health via border weight + glyph
// ─────────────────────────────────────────────────────
function JournalProto({ plants, frontPlants, careLog, briefings, portraits, onAction }) {
  const [selectedId, setSelectedId] = useState(null);
  const allPlants = [...plants, ...frontPlants];
  const selected = allPlants.find(p => p.id === selectedId) || null;
  const sheetOpen = selectedId !== null;

  const groupedPlants = useMemo(() => {
    return JOURNAL_GROUPS.map(g => ({
      ...g,
      plants: plants.filter(p => g.walls.includes(p.wall) && p.health !== 'empty' && p.type !== 'empty-pot'),
    })).filter(g => g.plants.length > 0);
  }, [plants]);

  const roseHealth = useMemo(() => {
    const roses = frontPlants.filter(p => p.type === 'rose');
    if (!roses.length) return null;
    const allSame = roses.every(r => r.health === roses[0].health);
    return allSame ? { uniform: true, health: roses[0].health, count: roses.length } : { uniform: false };
  }, [frontPlants]);

  function borderWeight(h) {
    return { thriving:2, content:1.5, recovering:1.8, resting:1.2, thirsty:3.5, overlooked:4.5, struggling:5.5, memorial:1, empty:1 }[h] || 2;
  }

  function PlantCard2({ plant }) {
    const portrait = portraits?.[plant.id] || {};
    const briefing = briefings?.[plant.id] || null;
    const waterLevel = computeWaterLevel(plant, careLog, briefing?.waterDays ? briefing : null);
    const needsWater = plant.actions?.includes('water');
    const wColor = waterLevel >= 0.6 ? '#3898d0' : waterLevel >= 0.35 ? '#c8a820' : '#c83020';
    const hc = healthColor(plant.health);
    const bw = borderWeight(plant.health);

    return (
      <div onClick={() => setSelectedId(plant.id)}
        style={{ width:'calc(50% - 4px)', background:C.cardBg, borderRadius:10, overflow:'hidden',
          marginBottom:8, cursor:'pointer',
          border:`${bw}px solid ${hc}`,
          boxShadow: ['thirsty','overlooked','struggling'].includes(plant.health) ? `0 0 0 3px ${hc}20` : 'none',
        }}>
        {/* Portrait */}
        <div style={{ width:'100%', paddingTop:'75%', position:'relative', background:`${plantColor(plant.type)}08` }}>
          <div style={{ position:'absolute', inset:0 }}>
            <PlantPortrait plant={plant} aiSvg={portrait.svg || null}/>
          </div>
        </div>
        {/* Info */}
        <div style={{ padding:'6px 8px 8px' }}>
          <div style={{ fontFamily:SERIF, fontSize:12, fontWeight:600, color:'#2a1808',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {plant.name}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:3 }}>
            <span style={{ fontFamily:MONO, fontSize:7, color:hc }}>{healthGlyph(plant.health)}</span>
            {needsWater && (
              <div style={{ display:'flex', alignItems:'center', gap:3, flex:1, marginLeft:6 }}>
                <span style={{ fontSize:8 }}>💧</span>
                <div style={{ flex:1, height:3, background:'rgba(0,0,0,0.10)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${Math.round(waterLevel*100)}%`, height:'100%', background:wColor, borderRadius:2 }}/>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:C.appBg, minHeight:'100%' }}>
      {/* Terrace groups */}
      {groupedPlants.map(group => (
        <div key={group.id} style={{ padding:'12px 12px 0' }}>
          <div style={{ fontFamily:MONO, fontSize:6, color:'rgba(212,168,48,0.60)',
            letterSpacing:.8, marginBottom:8, paddingBottom:6,
            borderBottom:'1px solid rgba(160,130,80,0.14)' }}>
            {group.label}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {group.plants.map(p => <PlantCard2 key={p.id} plant={p}/>)}
          </div>
        </div>
      ))}

      {/* Emma's Rose Garden */}
      {frontPlants.length > 0 && (
        <div style={{ padding:'16px 12px 0' }}>
          <div style={{ textAlign:'center', marginBottom:12 }}>
            <div style={{ height:1, background:'rgba(232,64,112,0.25)', marginBottom:10 }}/>
            <span style={{ fontFamily:SERIF, fontSize:16, fontStyle:'italic', color:'#e84070' }}>
              🌹 Emma's Rose Garden
            </span>
            {roseHealth?.uniform && (
              <div style={{ fontFamily:MONO, fontSize:6, color:healthColor(roseHealth.health),
                marginTop:4, letterSpacing:.3 }}>
                All {roseHealth.count} roses: {healthGlyph(roseHealth.health)} {roseHealth.health}
              </div>
            )}
            <div style={{ height:1, background:'rgba(232,64,112,0.25)', marginTop:10 }}/>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {frontPlants.filter(p => p.health !== 'empty' && p.type !== 'empty-pot').map(p => (
              <PlantCard2 key={p.id} plant={p}/>
            ))}
          </div>
        </div>
      )}

      <div style={{ height:24 }}/>

      {/* Backdrop */}
      {sheetOpen && (
        <div onClick={() => setSelectedId(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.20)', zIndex:98 }}/>
      )}

      {/* Bottom sheet */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        height:'55vh', background:C.cardBg, borderRadius:'14px 14px 0 0',
        border:`1px solid ${C.cardBorder}`, zIndex:99,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        overflowY:'auto',
      }}>
        {selected && (
          <PlantSheet plant={selected} careLog={careLog} briefings={briefings}
            portraits={portraits} onAction={onAction} onClose={() => setSelectedId(null)}/>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// PROTOTYPE 3: Garden Walk
// Numbered route through the garden, stop cards with actions
// ─────────────────────────────────────────────────────
function WalkProto({ plants, frontPlants, careLog, briefings, portraits, onAction }) {
  const [doneStops, setDoneStops]   = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [activeStop, setActiveStop] = useState(0);
  const stopRefs = useRef([]);
  const sheetOpen = selectedId !== null;
  const allPlants = [...plants, ...frontPlants];
  const selected  = allPlants.find(p => p.id === selectedId) || null;

  // Build resolved stops — map IDs to live plant objects
  const resolvedStops = useMemo(() => {
    return WALK_STOPS.map(stop => {
      const stopPlants = stop.useFrontPlants
        ? frontPlants.filter(p => p.health !== 'empty' && p.type !== 'empty-pot')
        : (stop.plantIds || []).map(id => plants.find(p => p.id === id)).filter(Boolean);
      const urgent = stopPlants.some(p => ['thirsty','overlooked','struggling'].includes(p.health));
      return { ...stop, plants: stopPlants, urgent };
    }).filter(s => s.plants.length > 0);
  }, [plants, frontPlants]);

  const remaining = resolvedStops.length - doneStops.size;

  function markStopDone(stopId, stopPlants) {
    // Log visit for all plants in this stop
    stopPlants.forEach(p => {
      if (p.actions?.includes('visit')) onAction('visit', p);
    });
    setDoneStops(prev => new Set([...prev, stopId]));
  }

  function scrollToStop(idx) {
    stopRefs.current[idx]?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  // IntersectionObserver for active stop tracking
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = parseInt(e.target.dataset.stopIdx);
            if (!isNaN(idx)) setActiveStop(idx);
          }
        });
      },
      { threshold: 0.4, rootMargin:'-44px 0px 0px 0px' }
    );
    stopRefs.current.forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [resolvedStops.length]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.uiBg }}>
      {/* Header */}
      <div style={{ height:44, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 14px', borderBottom:`1px solid ${C.uiBorder}`, flexShrink:0 }}>
        <div>
          <span style={{ fontFamily:MONO, fontSize:7, color: remaining === 0 ? '#58c030' : C.uiGold }}>
            {remaining === 0 ? 'WALK COMPLETE ✓' : `TODAY'S WALK · ${remaining} stops`}
          </span>
        </div>
        <button onClick={() => scrollToStop(resolvedStops.findIndex(s => !doneStops.has(s.id)))}
          style={{ background:'rgba(212,168,48,0.12)', border:`1px solid ${C.uiBorder}`, borderRadius:4,
            padding:'4px 8px', color:C.uiGold, fontFamily:MONO, fontSize:6, cursor:'pointer' }}>
          START →
        </button>
      </div>

      {/* Overview strip */}
      <div style={{ flexShrink:0, borderBottom:`1px solid ${C.uiBorder}` }}>
        <svg viewBox={`0 0 ${Math.max(390, resolvedStops.length * 56)} 56`}
          style={{ width:'100%', height:56, display:'block' }}>
          {/* Connecting dotted path */}
          {resolvedStops.map((s, i) => {
            if (i === 0) return null;
            const x1 = 28 + (i-1) * ((390-56) / Math.max(resolvedStops.length-1,1));
            const x2 = 28 + i     * ((390-56) / Math.max(resolvedStops.length-1,1));
            return <line key={i} x1={x1} y1={28} x2={x2} y2={28}
              stroke="rgba(212,168,48,0.28)" strokeWidth={1} strokeDasharray="4 4"/>;
          })}
          {/* Stop circles */}
          {resolvedStops.map((s, i) => {
            const cx = 28 + i * ((390-56) / Math.max(resolvedStops.length-1,1));
            const done = doneStops.has(s.id);
            const isActive = i === activeStop;
            return (
              <g key={s.id} onClick={() => scrollToStop(i)} style={{ cursor:'pointer' }}>
                <circle cx={cx} cy={28} r={12} fill={done ? '#2a4418' : C.uiPane}
                  stroke={isActive ? C.uiGold : (done ? '#3a6818' : C.uiBorder)} strokeWidth={isActive ? 1.5 : 1}/>
                {/* Urgency dot */}
                {s.urgent && !done && <circle cx={cx+8} cy={20} r={3.5} fill="#c83020"/>}
                {/* Number / check */}
                <text x={cx} y={32.5} textAnchor="middle" fontFamily={MONO} fontSize={8}
                  fill={done ? '#58c030' : isActive ? C.uiGold : C.uiMuted}>
                  {done ? '✓' : i+1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Stop list */}
      <div style={{ flex:1, overflowY:'auto', overscrollBehavior:'contain', padding:'12px 12px 80px' }}>
        {resolvedStops.map((stop, idx) => {
          const done = doneStops.has(stop.id);
          return (
            <div key={stop.id} ref={el => stopRefs.current[idx] = el} data-stop-idx={idx}
              style={{ marginBottom:12, borderRadius:10, overflow:'hidden',
                border:`1px solid ${done ? 'rgba(58,104,24,0.40)' : C.uiBorder}`,
                background: done ? 'rgba(18,28,10,0.60)' : C.uiPane, opacity: done ? 0.65 : 1,
              }}>
              {/* Stop header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px 10px' }}>
                <span style={{ fontFamily:SERIF, fontSize:22, color: done ? '#58c030' : C.uiGold,
                  lineHeight:1, flexShrink:0 }}>
                  {['①','②','③','④','⑤','⑥','⑦','⑧'][idx] || `${idx+1}`}
                </span>
                <div style={{ flex:1 }}>
                  <span style={{ fontFamily:SERIF, fontSize:15, fontWeight:600, color:C.uiText }}>{stop.label}</span>
                  <span style={{ fontFamily:SERIF, fontSize:12, color:C.uiMuted, marginLeft:6 }}>{stop.emoji}</span>
                </div>
                {done && <span style={{ fontFamily:MONO, fontSize:6, color:'#58c030' }}>DONE ✓</span>}
                {stop.urgent && !done && <span style={{ fontFamily:MONO, fontSize:6, color:'#c83020' }}>!</span>}
              </div>

              {/* Plant rows */}
              {!done && (
                <div style={{ padding:'0 14px 10px' }}>
                  {stop.plants.map(p => {
                    const portrait = portraits?.[p.id] || {};
                    return (
                      <div key={p.id} onClick={() => setSelectedId(p.id)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0',
                          borderTop:'1px solid rgba(90,60,24,0.20)', cursor:'pointer' }}>
                        <div style={{ width:28, height:21, borderRadius:3, overflow:'hidden', flexShrink:0,
                          border:`1px solid ${plantColor(p.type)}30` }}>
                          <PlantPortrait plant={p} aiSvg={portrait.svg || null}/>
                        </div>
                        <span style={{ fontFamily:SERIF, fontSize:13, color:C.uiText, flex:1 }}>{p.name}</span>
                        <span style={{ fontFamily:MONO, fontSize:8, color:healthColor(p.health) }}>
                          {healthGlyph(p.health)}
                        </span>
                        {(p.actions || []).slice(0,2).map(k => (
                          <span key={k} style={{ fontSize:13 }}>{ACT_EMOJI[k] || ''}</span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Mark done button */}
              {!done && (
                <button onClick={() => markStopDone(stop.id, stop.plants)}
                  style={{ width:'100%', padding:'10px', background:'rgba(58,104,24,0.12)',
                    border:'none', borderTop:`1px solid rgba(58,104,24,0.25)`,
                    color:'#58c030', fontFamily:MONO, fontSize:6, cursor:'pointer',
                    letterSpacing:.4 }}>
                  DONE WITH STOP {idx+1} ✓
                </button>
              )}
            </div>
          );
        })}

        {remaining === 0 && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontFamily:SERIF, fontSize:16, fontStyle:'italic', color:C.uiMuted }}>
              The garden is tended.
            </div>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {sheetOpen && (
        <div onClick={() => setSelectedId(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.40)', zIndex:98 }}/>
      )}

      {/* Bottom sheet */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        height:'52vh', background:C.cardBg, borderRadius:'14px 14px 0 0',
        border:`1px solid ${C.cardBorder}`, zIndex:99,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        overflowY:'auto',
      }}>
        {selected && (
          <PlantSheet plant={selected} careLog={careLog} briefings={briefings}
            portraits={portraits} onAction={onAction} onClose={() => setSelectedId(null)}/>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main export — prototype selector + active prototype
// ─────────────────────────────────────────────────────
export function MobileMapProtos({ plants, frontPlants, careLog, briefings, portraits, onAction }) {
  const [proto, setProto] = useState(() => {
    try { return parseInt(localStorage.getItem('gp_map_proto') || '1'); } catch { return 1; }
  });

  function pickProto(n) {
    setProto(n);
    try { localStorage.setItem('gp_map_proto', String(n)); } catch {}
  }

  const PROTOS = [
    { n:1, label:'BLUEPRINT' },
    { n:2, label:'JOURNAL' },
    { n:3, label:'WALK' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Prototype selector */}
      <div style={{ display:'flex', background:C.uiPane, borderBottom:`1px solid ${C.uiBorder}`,
        flexShrink:0 }}>
        {PROTOS.map(p => (
          <button key={p.n} onClick={() => pickProto(p.n)}
            style={{ flex:1, background:'none', border:'none', padding:'9px 4px',
              borderBottom: proto === p.n ? `2px solid ${C.uiGold}` : '2px solid transparent',
              color: proto === p.n ? C.uiGold : C.uiMuted,
              fontFamily:MONO, fontSize:6, cursor:'pointer', letterSpacing:.4,
              transition:'all .12s' }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Active prototype */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {proto === 1 && <BlueprintProto plants={plants} frontPlants={frontPlants}
          careLog={careLog} briefings={briefings} portraits={portraits} onAction={onAction}/>}
        {proto === 2 && <JournalProto plants={plants} frontPlants={frontPlants}
          careLog={careLog} briefings={briefings} portraits={portraits} onAction={onAction}/>}
        {proto === 3 && <WalkProto plants={plants} frontPlants={frontPlants}
          careLog={careLog} briefings={briefings} portraits={portraits} onAction={onAction}/>}
      </div>
    </div>
  );
}
