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
            const arc = p.actions?.includes('water') ? arcPath(cx, cy, 4.8, wLevel) : null;

            return (
              <g key={p.id} onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                style={{ cursor:'pointer' }}>
                {/* Transparent hit area */}
                <circle cx={cx} cy={cy} r={8} fill="transparent"/>
                {/* Urgency halo */}
                {urgent && <circle cx={cx} cy={cy} r={5.5} fill={healthColor(p.health)} opacity={0.18}
                  style={{ animation:'gpMapPulse 2s ease-in-out infinite' }}/>}
                {/* Water arc */}
                {arc && <path d={arc} fill="none" stroke={healthColor(p.health)} strokeWidth={1.2} strokeLinecap="round" opacity={0.7}/>}
                {/* Main node */}
                <circle cx={cx} cy={cy} r={3.2} fill={pColor} opacity={isSelected ? 0 : 0.9}/>
                {/* Health glyph — subtle adornment inside the dot */}
                {!isSelected && (
                  <text x={cx} y={cy + 1.1} textAnchor="middle" fontSize={2.5}
                    fill="rgba(255,255,255,0.60)" fontFamily="sans-serif" style={{ pointerEvents:'none' }}>
                    {healthGlyph(p.health)}
                  </text>
                )}
                {/* Selected state */}
                {isSelected && (
                  <>
                    <circle cx={cx} cy={cy} r={3.2} fill="none" stroke={C.uiGold} strokeWidth={0.8}/>
                    <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={C.uiGold} strokeWidth={0.5} strokeDasharray="1.8 1.4" opacity={0.6}/>
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
// Main export
// ─────────────────────────────────────────────────────
export function MobileMapProtos({ plants, frontPlants, careLog, briefings, portraits, onAction, style }) {
  return (
    <BlueprintProto plants={plants} frontPlants={frontPlants}
      careLog={careLog} briefings={briefings} portraits={portraits} onAction={onAction}/>
  );
}

