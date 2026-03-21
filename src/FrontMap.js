// FrontMap.js — Garden Party
// Close-up garden view: Emma's Rose Garden in foreground
// 75 8th Ave blurry in background, magnolia drifting in from upper-left

import React, { useState, useEffect } from 'react';

const VW = 1400, VH = 900;
const GBR = 1400;         // garden bed spans full width
const SOIL_Y = 612;       // soil surface y — more soil visible for ground mechanics
const CANE_BASE_Y = 916;  // cane bases just below screen edge
const CANE_H = 530;       // cane height — tall, close-up feel
const CANE_CX = [88, 278, 468, 660, 858, 1148]; // 6 rose x-positions, full width

// Colors
const C1   = '#4a3018';  // dark warm brown — thick canes
const C2   = '#5a3a20';  // medium brown
const C3   = '#6a4828';  // lighter brown — fine laterals
const DEAD = '#1c1410';  // near-black dead winter stalks
const BUDR = '#921520';  // deep red bud
const BUDB = '#b02030';  // bright red bud (just opening)
const BUDG = '#3a6020';  // green bud (a few)
const GLD  = '#c8a018';
const IRON = '#151210';

function wmoIcon(code) {
  if (!code && code !== 0) return '☁';
  if (code === 0) return '☀';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁';
  if (code <= 48) return '🌫';
  if (code <= 57) return '🌦';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄';
  if (code <= 82) return '🌦';
  return '⛈';
}
function wmoShort(code) {
  if (!code && code !== 0) return 'overcast';
  if (code === 0) return 'clear skies';
  if (code <= 2) return 'partly cloudy';
  if (code <= 3) return 'overcast';
  if (code <= 48) return 'foggy';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowing';
  if (code <= 82) return 'showers';
  return 'stormy';
}

function BotanicalEmblem() {
  return (
    <svg width="54" height="56" viewBox="0 0 54 56" style={{ display: 'block' }}>
      {/* Stem */}
      <path d="M27 52 C26 44 26 34 27 22" stroke="#3a5810" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Thorns */}
      <line x1="27" y1="42" x2="22" y2="38" stroke="#3a5810" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="27" y1="33" x2="32" y2="29" stroke="#3a5810" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Left leaf */}
      <path d="M27 44 C18 39 12 30 14 21 C20 27 25 36 27 44Z" fill="#4a6820" opacity="0.90"/>
      <path d="M27 44 C19 38 15 29 16 22" stroke="#3a5810" strokeWidth="0.7" fill="none" opacity="0.45" strokeLinecap="round"/>
      {/* Right leaf */}
      <path d="M27 38 C36 33 41 24 39 15 C33 22 28 31 27 38Z" fill="#4a6820" opacity="0.90"/>
      <path d="M27 38 C35 32 39 24 38 16" stroke="#3a5810" strokeWidth="0.7" fill="none" opacity="0.45" strokeLinecap="round"/>
      {/* Small hydrangea florets — left */}
      <circle cx="11" cy="15" r="3.2" fill="#9ab8d0" opacity="0.82"/>
      <circle cx="7" cy="21" r="2.6" fill="#b0c8e0" opacity="0.70"/>
      <circle cx="13" cy="9" r="2.2" fill="#9ab8d0" opacity="0.65"/>
      {/* Small hydrangea florets — right */}
      <circle cx="43" cy="13" r="3.2" fill="#9ab8d0" opacity="0.82"/>
      <circle cx="47" cy="19" r="2.6" fill="#b0c8e0" opacity="0.70"/>
      <circle cx="41" cy="7" r="2.2" fill="#9ab8d0" opacity="0.65"/>
      {/* Rose outer */}
      <circle cx="27" cy="18" r="10.5" fill="#8a1c2c" opacity="0.92"/>
      {/* Rose mid petal sweep */}
      <path d="M17 18 C17 9 27 7 37 9 C36 18 27 19 17 18Z" fill="#b02030" opacity="0.62"/>
      {/* Rose inner */}
      <circle cx="27" cy="17" r="7" fill="#c22838" opacity="0.93"/>
      <circle cx="27" cy="15.5" r="4.2" fill="#d83848" opacity="0.90"/>
      <circle cx="27" cy="13.5" r="2.2" fill="#f04858" opacity="0.85"/>
      {/* Sepal lines */}
      <path d="M20 20 C17 25 18 30 21 32" stroke="#3a5810" strokeWidth="1" fill="none" opacity="0.5" strokeLinecap="round"/>
      <path d="M34 20 C37 25 36 30 33 32" stroke="#3a5810" strokeWidth="1" fill="none" opacity="0.5" strokeLinecap="round"/>
    </svg>
  );
}

export function FrontMap({ plants = [], selectedId, onSelect, onEnter, growth = {}, weather = null, oracle = null, seasonOpenerText = null }) {
  const [hoveredId, setHoveredId]     = useState(null);
  const [showEnter, setShowEnter]     = useState(false);
  const [enterHover, setEnterHover]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowEnter(true), 1600);
    return () => clearTimeout(t);
  }, []);

  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;
  const skyTop = isNight ? '#0a0e1a' : '#9aaebb';
  const skyMid = isNight ? '#111b2e' : '#b0c2cc';
  const skyBot = isNight ? '#1c2a42' : '#cdd8de';

  // Sort dko plants left-to-right and map to the 6 cane positions
  const dkoPlants = [...plants]
    .filter(p => p.id?.startsWith('dko'))
    .sort((a, b) => (a.pos?.x ?? 0) - (b.pos?.x ?? 0));

  // Per-rose variety seeds so each looks distinct
  const variety = [
    { lean: -6,  h: 1.00, dead: 2, tallDead: 0.72 },
    { lean:  4,  h: 0.92, dead: 1, tallDead: 0.80 },
    { lean: -3,  h: 1.08, dead: 3, tallDead: 0.68 },
    { lean:  7,  h: 0.96, dead: 2, tallDead: 0.75 },
    { lean: -5,  h: 1.02, dead: 1, tallDead: 0.82 },
    { lean:  3,  h: 0.94, dead: 2, tallDead: 0.70 },
  ];

  function CloseRoseCane({ cx, idx }) {
    const plant  = dkoPlants[idx];
    const plantId = plant?.id;
    const g      = plant ? (growth[plantId] ?? 0) : 0;
    const v      = variety[idx];
    const h      = CANE_H * v.h;
    const base   = CANE_BASE_Y;
    const lx     = cx + v.lean; // lean offset at tip
    const sel    = selectedId === plantId;
    const hov    = hoveredId  === plantId;

    const handleClick = () => {
      if (!plant || !onSelect) return;
      onSelect(sel ? null : plant);
    };
    const handleEnter = () => plantId && setHoveredId(plantId);
    const handleLeave = () => setHoveredId(null);

    return (
      <g
        onClick={handleClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ cursor: plant ? 'pointer' : 'default' }}
      >
        {/* ── DEAD WINTER STALKS — thin, near-black, from last season ── */}
        {v.dead >= 1 && (
          <line x1={cx+18} y1={base} x2={cx+22} y2={base - h*v.tallDead}
            stroke={DEAD} strokeWidth={2.5} strokeLinecap="round"/>
        )}
        {v.dead >= 2 && (
          <line x1={cx-20} y1={base} x2={cx-26} y2={base - h*(v.tallDead-0.12)}
            stroke={DEAD} strokeWidth={2} strokeLinecap="round"/>
        )}
        {v.dead >= 3 && (
          <line x1={cx+32} y1={base} x2={cx+36} y2={base - h*(v.tallDead-0.22)}
            stroke={DEAD} strokeWidth={1.8} strokeLinecap="round"/>
        )}
        {/* Broken dead tip stubs */}
        {v.dead >= 2 && (
          <>
            <line x1={cx+22} y1={base - h*v.tallDead}
                  x2={cx+28} y2={base - h*v.tallDead - 18}
              stroke={DEAD} strokeWidth={1.5} strokeLinecap="round"/>
            <line x1={cx-26} y1={base - h*(v.tallDead-0.12)}
                  x2={cx-32} y2={base - h*(v.tallDead-0.12) - 14}
              stroke={DEAD} strokeWidth={1.3} strokeLinecap="round"/>
          </>
        )}

        {/* ── LIVE CANES — warm brown, main stems ── */}
        <line x1={cx-6}  y1={base} x2={lx-18} y2={base-h*0.90}
          stroke={C1} strokeWidth={13} strokeLinecap="round"/>
        <line x1={cx+1}  y1={base} x2={lx}    y2={base-h}
          stroke={C2} strokeWidth={15} strokeLinecap="round"/>
        <line x1={cx+8}  y1={base} x2={lx+16} y2={base-h*0.93}
          stroke={C1} strokeWidth={12} strokeLinecap="round"/>
        <line x1={cx+16} y1={base} x2={lx+32} y2={base-h*0.74}
          stroke={C3} strokeWidth={9}  strokeLinecap="round"/>
        <line x1={cx-14} y1={base} x2={lx-36} y2={base-h*0.70}
          stroke={C1} strokeWidth={9}  strokeLinecap="round"/>

        {/* ── LATERAL BRANCHES ── */}
        <line x1={lx-8}  y1={base-h*0.40} x2={lx-54} y2={base-h*0.55}
          stroke={C2} strokeWidth={5}   strokeLinecap="round"/>
        <line x1={lx+4}  y1={base-h*0.52} x2={lx+58} y2={base-h*0.65}
          stroke={C1} strokeWidth={4.5} strokeLinecap="round"/>
        <line x1={lx-12} y1={base-h*0.63} x2={lx-62} y2={base-h*0.76}
          stroke={C2} strokeWidth={4}   strokeLinecap="round"/>
        <line x1={lx+6}  y1={base-h*0.72} x2={lx+56} y2={base-h*0.83}
          stroke={C1} strokeWidth={3.5} strokeLinecap="round"/>
        <line x1={lx-4}  y1={base-h*0.80} x2={lx-44} y2={base-h*0.90}
          stroke={C3} strokeWidth={3}   strokeLinecap="round"/>
        <line x1={lx+2}  y1={base-h*0.86} x2={lx+40} y2={base-h*0.95}
          stroke={C2} strokeWidth={2.5} strokeLinecap="round"/>
        {/* Fine tip twigs */}
        <line x1={lx-18} y1={base-h*0.90} x2={lx-28} y2={base-h*0.98}
          stroke={C3} strokeWidth={2}   strokeLinecap="round"/>
        <line x1={lx+16} y1={base-h*0.93} x2={lx+24} y2={base-h*1.00}
          stroke={C3} strokeWidth={2}   strokeLinecap="round"/>

        {/* ── THORNS — small diagonal cuts off main cane ── */}
        <line x1={lx}    y1={base-h*0.28} x2={lx-9}  y2={base-h*0.25}
          stroke={C1} strokeWidth={2.2} strokeLinecap="round"/>
        <line x1={lx+2}  y1={base-h*0.46} x2={lx+11} y2={base-h*0.43}
          stroke={C1} strokeWidth={2}   strokeLinecap="round"/>
        <line x1={lx-2}  y1={base-h*0.60} x2={lx-11} y2={base-h*0.57}
          stroke={C1} strokeWidth={1.8} strokeLinecap="round"/>
        <line x1={lx+1}  y1={base-h*0.75} x2={lx+10} y2={base-h*0.72}
          stroke={C2} strokeWidth={1.6} strokeLinecap="round"/>

        {/* ── RED BUDS — main tip buds, swelling ── */}
        <circle cx={lx}    cy={base-h}      r={11} fill={BUDB}/>
        <circle cx={lx-18} cy={base-h*0.90} r={10} fill={BUDR}/>
        <circle cx={lx+16} cy={base-h*0.93} r={9}  fill={BUDR}/>
        {/* Lateral tip buds */}
        <circle cx={lx-54} cy={base-h*0.55} r={7}  fill={BUDR} opacity="0.9"/>
        <circle cx={lx+58} cy={base-h*0.65} r={7}  fill={BUDR} opacity="0.88"/>
        <circle cx={lx-62} cy={base-h*0.76} r={6}  fill={BUDR} opacity="0.85"/>
        <circle cx={lx+56} cy={base-h*0.83} r={6}  fill={BUDR} opacity="0.82"/>
        <circle cx={lx-44} cy={base-h*0.90} r={5}  fill={BUDR} opacity="0.78"/>
        <circle cx={lx+40} cy={base-h*0.95} r={5}  fill={BUDR} opacity="0.75"/>
        <circle cx={lx-28} cy={base-h*0.98} r={4.5} fill={BUDR} opacity="0.70"/>
        <circle cx={lx+24} cy={base-h*1.00} r={4.5} fill={BUDR} opacity="0.70"/>
        {/* A couple of green buds (fewer) */}
        <circle cx={lx+32} cy={base-h*0.74} r={5.5} fill={BUDG} opacity="0.80"/>
        <circle cx={lx-36} cy={base-h*0.70} r={5}   fill={BUDG} opacity="0.72"/>

        {/* Bud sepal details on main tip */}
        <path d={`M ${lx-5} ${base-h+2} Q ${lx} ${base-h-6} ${lx+5} ${base-h+2}`}
          fill="none" stroke="#6a1c20" strokeWidth="1.5"/>

        {/* ── GROWTH STATE: petals starting if g > 0.6 ── */}
        {g > 0.6 && [0,60,120,180,240,300].map(angle => (
          <ellipse key={angle}
            cx={lx + Math.cos(angle*Math.PI/180)*11}
            cy={(base-h) + Math.sin(angle*Math.PI/180)*11}
            rx={6} ry={4} fill="#d84060" opacity={Math.min(1,(g-0.6)*2.5)}
            transform={`rotate(${angle},${lx+Math.cos(angle*Math.PI/180)*11},${(base-h)+Math.sin(angle*Math.PI/180)*11})`}
          />
        ))}

        {/* ── INTERACTIVE HIT AREA + SELECTION RING ── */}
        <rect
          x={cx - 80} y={base - h - 20}
          width={160} height={h + 20}
          fill="transparent"
        />
        {(sel || hov) && (
          <ellipse cx={cx} cy={base - 30} rx={50} ry={16}
            fill="none"
            stroke={GLD}
            strokeWidth={sel ? 2.5 : 1.5}
            strokeDasharray={sel ? "0" : "6 4"}
            opacity={sel ? 0.92 : 0.65}
          />
        )}
        {sel && (
          <text x={cx} y={base - 50}
            textAnchor="middle"
            fontFamily="Georgia, serif" fontSize="13"
            fill={GLD} opacity="0.9" fontStyle="italic">
            {plant?.name ?? ''}
          </text>
        )}

        {/* ── HOVER TOOLTIP ── */}
        {hov && plant && (() => {
          const tx = Math.max(90, Math.min(lx, VW - 90));
          const pruneNeeded = v.dead >= 3;
          const tooltipH = 58;
          return (
            <g>
              <rect x={tx - 90} y={base - h - 14 - tooltipH} width={180} height={tooltipH}
                rx={7} fill="#120c06" opacity={0.90}/>
              <rect x={tx - 90} y={base - h - 14 - tooltipH} width={180} height={tooltipH}
                rx={7} fill="none" stroke="rgba(232,64,112,0.35)" strokeWidth={1}/>
              {/* Plant name */}
              <text x={tx} y={base - h - tooltipH + 2}
                textAnchor="middle"
                fontFamily='"Crimson Pro", Georgia, serif' fontSize={13} fontWeight={600}
                fill="#e84070">
                Double Knock Out Rose
              </text>
              {/* Subtitle */}
              <text x={tx} y={base - h - tooltipH + 18}
                textAnchor="middle"
                fontFamily='"Crimson Pro", Georgia, serif' fontSize={11} fontStyle="italic"
                fill="#a09070">
                {plant.subtitle}
              </text>
              {/* Health */}
              <circle cx={tx - 52} cy={base - h - tooltipH + 32} r={3.5} fill="#7898a8"/>
              <text x={tx - 44} y={base - h - tooltipH + 36}
                fontFamily='"Crimson Pro", Georgia, serif' fontSize={11} fontStyle="italic"
                fill="#7898a8">
                resting · dormant
              </text>
              {/* Prune warning */}
              {pruneNeeded && (
                <text x={tx + 14} y={base - h - tooltipH + 36}
                  fontFamily='"Crimson Pro", Georgia, serif' fontSize={11}
                  fill="#e87040">
                  ⚠ prune
                </text>
              )}
              {/* "click for more" hint */}
              <text x={tx} y={base - h - tooltipH + tooltipH - 6}
                textAnchor="middle"
                fontFamily='"Crimson Pro", Georgia, serif' fontSize={9}
                fill="#706040" fontStyle="italic">
                click for details
              </text>
            </g>
          );
        })()}
      </g>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* ── TITLE ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 16, pointerEvents: 'none',
        gap: 2,
      }}>
        <BotanicalEmblem />
        <div style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 18, color: '#d4a830', letterSpacing: 3,
          textShadow: '2px 3px 0 #1a0804, 0 0 28px rgba(200,160,24,0.45)',
          marginTop: 2,
        }}>GARDEN  PARTY</div>
      </div>

      {/* ── WEATHER + WARMTH HUD — top right ── */}
      <div style={{
        position: 'absolute', top: 16, right: 18, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5,
        pointerEvents: 'none',
      }}>
        {weather && (
          <div style={{
            background: 'rgba(16,8,3,0.62)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(200,165,90,0.18)', borderRadius: 8,
            padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>{wmoIcon(weather.code)}</span>
            <span style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontSize: 13, color: '#d8ccb0' }}>
              {Math.round(weather.temp)}°F
            </span>
            <span style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontSize: 11, color: '#a09078', fontStyle: 'italic' }}>
              {wmoShort(weather.code)}
            </span>
          </div>
        )}
      </div>

      {/* ── ORACLE / SEASON OPENER TEXT — fades in with enter prompt ── */}
      {(oracle || seasonOpenerText) && (
        <div style={{
          position: 'absolute',
          bottom: selectedId ? 82 : 108, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          textAlign: 'center',
          maxWidth: seasonOpenerText ? 580 : 520,
          width: '80vw',
          opacity: showEnter ? (seasonOpenerText ? 0.95 : 0.82) : 0,
          transition: showEnter ? `opacity ${seasonOpenerText ? '3.2s' : '2.2s'} ease-in` : 'none',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontSize: seasonOpenerText ? 18 : 15,
            fontStyle: 'italic',
            color: seasonOpenerText ? '#e8cc78' : '#d8ccb0',
            letterSpacing: seasonOpenerText ? 0.5 : 0.3,
            lineHeight: seasonOpenerText ? 1.9 : 1.7,
            textShadow: '0 1px 14px rgba(4,2,1,0.95)',
            whiteSpace: 'pre-line',
          }}>{seasonOpenerText || oracle}</div>
        </div>
      )}

      {/* ── ENTER PROMPT — fades in after 1.6s ── */}
      <div
        onClick={onEnter}
        onMouseEnter={() => setEnterHover(true)}
        onMouseLeave={() => setEnterHover(false)}
        style={{
          position: 'absolute',
          bottom: selectedId ? 2 : 20, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          textAlign: 'center',
          cursor: 'pointer',
          opacity: showEnter ? (enterHover ? 1 : 0.78) : 0,
          transition: showEnter ? 'opacity 1.4s ease-in' : 'none',
          pointerEvents: showEnter ? 'auto' : 'none',
          userSelect: 'none',
          padding: '22px 48px',
          touchAction: 'manipulation',
        }}
      >
        <div style={{
          fontFamily: '"Crimson Pro", Georgia, serif',
          fontSize: 18, fontStyle: 'italic',
          color: enterHover ? '#f0e0b0' : '#e0cfa0',
          letterSpacing: 1,
          textShadow: '0 1px 10px rgba(15,8,3,0.9)',
          transition: 'color 0.2s',
        }}>{seasonOpenerText ? 'begin season 2' : isNight ? 'the fire is lit' : 'step inside'}</div>
        <div style={{
          color: enterHover ? '#e8c030' : '#c8a018',
          fontSize: 13, marginTop: 5,
          textShadow: '0 1px 6px rgba(15,8,3,0.8)',
          transition: 'color 0.2s',
        }}>↑</div>
      </div>

      {/* ── MAIN SVG ── */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%" height="100%"
        style={{ display: 'block', background: '#6a7e8e' }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Depth blur filters */}
          <filter id="bgBlur"    x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="11"/>
          </filter>
          <filter id="magBlur"   x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7"/>
          </filter>
          <filter id="fenceBlur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2.2"/>
          </filter>
          <filter id="cloudBlur" x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="18"/>
          </filter>
          <filter id="labelGlow">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#0d0800" floodOpacity="0.8"/>
          </filter>

          {/* Sky */}
          <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={skyTop}/>
            <stop offset="35%"  stopColor={skyMid}/>
            <stop offset="100%" stopColor={skyBot}/>
          </linearGradient>
          {/* Terrace fire glow — night only */}
          {isNight && (
            <radialGradient id="fireGlowG" cx="50%" cy="0%" r="60%">
              <stop offset="0%"   stopColor="#f0a030" stopOpacity="0.32"/>
              <stop offset="100%" stopColor="#f0a030" stopOpacity="0"/>
            </radialGradient>
          )}

          {/* Soil */}
          <linearGradient id="soilG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4a2e14"/>
            <stop offset="35%"  stopColor="#3a2210"/>
            <stop offset="100%" stopColor="#251508"/>
          </linearGradient>

          {/* Depth haze — softens fence-to-soil transition */}
          <linearGradient id="hazeG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#a8a09880" stopOpacity="0"/>
            <stop offset="58%"  stopColor="#a8a09880" stopOpacity="0"/>
            <stop offset="100%" stopColor="#a8a098"   stopOpacity="0.38"/>
          </linearGradient>

          {/* Vignette */}
          <radialGradient id="vig" cx="50%" cy="50%" r="68%">
            <stop offset="0%"   stopColor="transparent"/>
            <stop offset="100%" stopColor="#140a04" stopOpacity="0.52"/>
          </radialGradient>

          {/* Sconce glow */}
          <radialGradient id="sconceGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#fff5c0" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#f0c840" stopOpacity="0"/>
          </radialGradient>

          {/* Soil texture tile */}
          <pattern id="soilTex" x="0" y="0" width="20" height="11" patternUnits="userSpaceOnUse">
            <rect width="20" height="11" fill="#3a2210"/>
            <line x1="0" y1="4"  x2="9"  y2="4"  stroke="#2a1508" strokeWidth="0.9" opacity="0.55"/>
            <line x1="12" y1="8" x2="18" y2="8"  stroke="#2a1508" strokeWidth="0.8" opacity="0.4"/>
          </pattern>
        </defs>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 1 — SKY + WATERCOLOR CLOUDS                           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <rect x="0" y="0" width={VW} height={VH} fill="url(#skyG)"/>
        {/* Soft cloud wisps — Miyazaki watercolor sky */}
        <g filter="url(#cloudBlur)" opacity="0.62">
          <ellipse cx="220"  cy="22" rx="210" ry="38" fill="#f0f4f8"/>
          <ellipse cx="560"  cy="14" rx="280" ry="28" fill="#eef2f6" opacity="0.85"/>
          <ellipse cx="960"  cy="28" rx="240" ry="34" fill="#f0f4f8"/>
          <ellipse cx="1260" cy="16" rx="190" ry="26" fill="#eef2f6" opacity="0.80"/>
          <ellipse cx="760"  cy="44" rx="170" ry="22" fill="#f4f6f8" opacity="0.70"/>
        </g>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* NIGHT ELEMENTS                                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {isNight && (
          <>
            {/* Moon — crescent, upper right */}
            <circle cx="1190" cy="78" r="36" fill="#e8e0c8" opacity="0.82"/>
            <circle cx="1207" cy="68" r="30" fill={skyTop} opacity="0.97"/>
            {/* Stars */}
            {[
              [180,52,1.8],[340,38,1.4],[510,28,1.6],[670,48,1.3],
              [820,36,1.7],[990,52,1.4],[1060,30,1.8],[1290,58,1.5],
              [430,68,1.2],[760,22,1.5],[260,18,1.3],[920,44,1.6],
            ].map(([cx,cy,r],i) => (
              <circle key={i} cx={cx} cy={cy} r={r} fill="#e8e8d8" opacity={0.55+i%3*0.1}/>
            ))}
            {/* Terrace fire glow — warm bloom from rooftop above */}
            <rect x="0" y="0" width={VW} height="260" fill="url(#fireGlowG)"/>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 2 — BLURRY BROWNSTONE                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <g filter="url(#bgBlur)" opacity="0.87">
          {/* Main facade — starts at y=40, revealing a band of sky above */}
          <rect x="0"   y="40"  width={VW} height="560" fill="#b87850"/>
          {/* Upper floor slightly darker */}
          <rect x="0"   y="40"  width={VW} height="175" fill="#a05e36"/>
          {/* Dentil cornice just below roofline */}
          <rect x="0"   y="40"  width={VW} height="10"  fill="#7a4420"/>
          <rect x="0"   y="50"  width={VW} height="7"   fill="#c09068"/>
          {/* Belt course */}
          <rect x="0"   y="213" width={VW} height="14"  fill="#8a4e22"/>
          {/* Parlor floor */}
          <rect x="0"   y="193" width={VW} height="250" fill="#c07850"/>
          {/* Upper windows L */}
          <rect x="50"  y="68"  width="130" height="118" fill="#0d1820" rx="2"/>
          <rect x="218" y="68"  width="128" height="118" fill="#0d1820" rx="2" opacity="0.9"/>
          {/* Upper windows R */}
          <rect x="1020" y="68" width="130" height="118" fill="#0d1820" rx="2"/>
          <rect x="1198" y="68" width="128" height="118" fill="#0d1820" rx="2" opacity="0.9"/>
          {/* Parlor windows */}
          <rect x="28"  y="250" width="210" height="200" fill="#0d1820" rx="2"/>
          <rect x="1162" y="250" width="210" height="200" fill="#0d1820" rx="2"/>
          {/* Door arch — dark shape */}
          <ellipse cx="700" cy="405" rx="148" ry="178" fill="#110e0a"/>
          <rect x="552" y="405" width="296" height="200" fill="#110e0a"/>
          {/* Stoop plinth */}
          <rect x="450" y="560" width="500" height="110" fill="#a86838"/>
          {/* Globe sconce glow blobs — small, atmospheric */}
          <circle cx="528" cy="358" r="24" fill="#fff8c0" opacity="0.50"/>
          <circle cx="872" cy="358" r="24" fill="#fff8c0" opacity="0.50"/>
          {/* Softer outer bloom */}
          <circle cx="528" cy="358" r="54" fill="#f8e068" opacity="0.14"/>
          <circle cx="872" cy="358" r="54" fill="#f8e068" opacity="0.14"/>
        </g>

        {/* Night window glows */}
        {isNight && (
          <g filter="url(#bgBlur)" opacity="0.78">
            <rect x="50"  y="68"  width="130" height="118" fill="#f8b840" opacity="0.35" rx="2"/>
            <rect x="218" y="68"  width="128" height="118" fill="#f8b840" opacity="0.22" rx="2"/>
            <rect x="1020" y="68" width="130" height="118" fill="#f8b840" opacity="0.35" rx="2"/>
            <rect x="1198" y="68" width="128" height="118" fill="#f8b840" opacity="0.22" rx="2"/>
            <rect x="28"  y="250" width="210" height="200" fill="#f8b840" opacity="0.28" rx="2"/>
            <rect x="1162" y="250" width="210" height="200" fill="#f8b840" opacity="0.28" rx="2"/>
            {/* Sconce blooms — stronger at night */}
            <circle cx="528" cy="358" r="70" fill="#f8d060" opacity="0.30"/>
            <circle cx="872" cy="358" r="70" fill="#f8d060" opacity="0.30"/>
            <circle cx="528" cy="358" r="140" fill="#f0c040" opacity="0.10"/>
            <circle cx="872" cy="358" r="140" fill="#f0c040" opacity="0.10"/>
          </g>
        )}

        {/* 75 on the door arch — blurred, atmospheric */}
        <text x="700" y="398"
          textAnchor="middle" fontFamily="Georgia, serif" fontSize="30"
          fill="#d4b888" opacity="0.38" filter="url(#bgBlur)"
          fontWeight="400" letterSpacing="2">75</text>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 3 — MAGNOLIA (upper-left, medium blur, March blooms)   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <g filter="url(#magBlur)" opacity="0.93">
          {/* Main trunk from lower-left — thick, entering frame */}
          <line x1="-30" y1={VH} x2="110"  y2="320" stroke="#c0b8a8" strokeWidth="42" strokeLinecap="round"/>
          <line x1="110"  y1="320" x2="92"  y2="110" stroke="#c0b8a8" strokeWidth="28" strokeLinecap="round"/>
          <line x1="92"  y1="110" x2="96"  y2="45"  stroke="#b8b0a0" strokeWidth="18" strokeLinecap="round"/>
          {/* Primary right-sweeping branch */}
          <line x1="96"  y1="240" x2="320" y2="148" stroke="#bfb8a8" strokeWidth="18" strokeLinecap="round"/>
          <line x1="320" y1="148" x2="560" y2="96"  stroke="#b4aca0" strokeWidth="12" strokeLinecap="round"/>
          <line x1="560" y1="96"  x2="760" y2="66"  stroke="#a8a090" strokeWidth="8"  strokeLinecap="round"/>
          <line x1="760" y1="66"  x2="920" y2="44"  stroke="#a0988a" strokeWidth="6"  strokeLinecap="round"/>
          {/* Secondary upper branch */}
          <line x1="94"  y1="178" x2="270" y2="88"  stroke="#bab4a4" strokeWidth="14" strokeLinecap="round"/>
          <line x1="270" y1="88"  x2="480" y2="44"  stroke="#b0a898" strokeWidth="10" strokeLinecap="round"/>
          <line x1="480" y1="44"  x2="640" y2="22"  stroke="#a8a090" strokeWidth="6"  strokeLinecap="round"/>
          {/* Tertiary small branches */}
          <line x1="92"  y1="300" x2="200" y2="240" stroke="#b8b0a0" strokeWidth="10" strokeLinecap="round"/>
          {/* Fine twigs */}
          <line x1="920" y1="44"  x2="970" y2="26"  stroke="#a0988a" strokeWidth="4.5" strokeLinecap="round"/>
          <line x1="760" y1="66"  x2="800" y2="44"  stroke="#a0988a" strokeWidth="4"  strokeLinecap="round"/>
          <line x1="560" y1="96"  x2="595" y2="68"  stroke="#a0988a" strokeWidth="4.5" strokeLinecap="round"/>
          <line x1="320" y1="148" x2="352" y2="116" stroke="#a0988a" strokeWidth="5"  strokeLinecap="round"/>
          <line x1="270" y1="88"  x2="302" y2="58"  stroke="#a0988a" strokeWidth="4"  strokeLinecap="round"/>
          <line x1="640" y1="22"  x2="668" y2="6"   stroke="#a0988a" strokeWidth="3.5" strokeLinecap="round"/>
          <line x1="200" y1="240" x2="228" y2="214" stroke="#a0988a" strokeWidth="4"  strokeLinecap="round"/>
          {/* Tight buds — pre-bloom, silvery grey, mid-March */}
          {[
            [920,44,9,16,-25], [800,44,8,14,-15], [760,66,8,15,10],
            [595,68,9,16,-20], [640,22,7,13,-10], [668,6,6,11,5],
            [480,44,9,16,-18], [352,116,10,18,-22], [302,58,8,14,8],
            [270,88,8,14,-5], [320,148,9,15,12], [96,45,9,16,3],
            [228,214,8,14,-10],
          ].map(([cx,cy,rx,ry,rot],i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
              fill="#d4cfc4" opacity={0.78 + (i%3)*0.05}
              transform={`rotate(${rot},${cx},${cy})`}/>
          ))}
        </g>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 4 — RETAINING WALL + IRON FENCE (light blur)           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <g filter="url(#fenceBlur)">
          {/* Retaining wall body */}
          <rect x="-10" y="592" width={VW + 20} height="52" fill="#be7858"/>
          {/* Wall cap molding */}
          <rect x="-10" y="576" width={VW + 20} height="18" fill="#d09070"/>
          <rect x="-10" y="571" width={VW + 20} height="8"  fill="#d8a880"/>
          {/* Shadow under cap */}
          <rect x="-10" y="593" width={VW + 20} height="4"  fill="#9a5838" opacity="0.4"/>
          {/* Fence top rail */}
          <rect x="-10" y="550" width={VW + 20} height="5"  fill={IRON} opacity="0.93"/>
          <rect x="-10" y="564" width={VW + 20} height="3"  fill={IRON} opacity="0.72"/>
          {/* Fence pickets */}
          {Array.from({ length: 95 }).map((_, i) => (
            <g key={i}>
              <line
                x1={i * 15 + 4} y1="554"
                x2={i * 15 + 4} y2="522"
                stroke={IRON} strokeWidth="3.5"
              />
              <circle cx={i * 15 + 4} cy="522" r="4.2" fill={IRON}/>
            </g>
          ))}
        </g>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 5 — SOIL (foreground, sharp)                           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <rect x="0"   y={SOIL_Y} width={VW} height={VH - SOIL_Y} fill="url(#soilG)"/>
        <rect x="0"   y={SOIL_Y} width={VW} height="28"          fill="url(#soilTex)"/>
        {/* Surface texture lines — full width */}
        {[
          [18, 646, 185, 646], [72, 672, 255, 672], [0, 700, 130, 700],
          [210, 655, 390, 655], [320, 688, 498, 688], [450, 665, 628, 665],
          [550, 708, 720, 708], [660, 675, 820, 675], [740, 714, 892, 714],
          [850, 650, 1010, 650], [920, 680, 1100, 680], [1040, 660, 1200, 660],
          [1120, 700, 1280, 700], [1180, 672, 1340, 672], [1260, 715, 1400, 715],
        ].map(([x1,y1,x2,y2],i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#291508" strokeWidth="1.2" opacity="0.42"/>
        ))}
        {/* Mulch pebbles — full width */}
        {[
          [55,652,15,7],[182,668,12,6],[328,654,17,8],
          [462,666,11,6],[608,658,14,7],[730,672,10,5],
          [848,660,13,7],[126,702,9,4],[440,712,11,5],
          [670,698,8,4],[290,720,10,5],[560,728,7,4],
          [920,655,14,6],[1040,670,11,5],[1160,658,15,7],
          [1260,672,10,5],[1340,660,12,6],[980,710,9,4],
          [1100,698,11,5],[1220,720,8,4],[1380,680,10,5],
        ].map(([cx,cy,rx,ry],i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
            fill="#4e3018" opacity="0.48"/>
        ))}

        {/* Sidewalk strip at very bottom */}
        <rect x="0" y="845" width={VW} height="55" fill="#c4bdb0" opacity="0.45"/>

        {/* Subtle green groundcover near soil surface — crawling thyme hints */}
        {[
          [140,626,22,5],[310,619,18,4],[520,630,24,6],[688,622,16,4],
          [870,627,20,5],[1060,621,18,4],[1200,632,22,5],[240,638,14,4],
          [440,641,16,4],[760,635,18,4],[990,628,14,3],[1310,636,16,4],
        ].map(([cx,cy,rx,ry],i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
            fill="#4a6830" opacity="0.35"/>
        ))}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 6 — DEPTH HAZE                                         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <rect x="0" y="420" width={VW} height="230" fill="url(#hazeG)"/>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 6b — GARDEN SIGN                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <g transform="rotate(-3, 1003, 612)">
          {/* Post — thin stake into soil */}
          <rect x="1000" y="606" width="6" height="52" fill="#3a2010" rx="1"/>
          <rect x="1001" y="606" width="2" height="52" fill="#251408" opacity="0.5"/>
          {/* Signboard */}
          <rect x="922" y="565" width="162" height="44" fill="#6a3e1c" rx="3"/>
          {/* Wood grain */}
          <line x1="924" y1="575" x2="1082" y2="575" stroke="#4a2a0e" strokeWidth="0.9" opacity="0.4"/>
          <line x1="924" y1="583" x2="1078" y2="583" stroke="#4a2a0e" strokeWidth="0.7" opacity="0.28"/>
          <line x1="926" y1="591" x2="1080" y2="591" stroke="#4a2a0e" strokeWidth="0.6" opacity="0.2"/>
          {/* Top highlight */}
          <rect x="922" y="565" width="162" height="4" fill="#8a5e34" rx="2" opacity="0.7"/>
          {/* Bottom shadow */}
          <rect x="922" y="607" width="162" height="2" fill="#251008" opacity="0.55"/>
          {/* Corner nails */}
          <circle cx="932" cy="572" r="2.2" fill="#907050" opacity="0.75"/>
          <circle cx="1072" cy="572" r="2.2" fill="#907050" opacity="0.75"/>
          <circle cx="932" cy="604" r="2.2" fill="#907050" opacity="0.75"/>
          <circle cx="1072" cy="604" r="2.2" fill="#907050" opacity="0.75"/>
          {/* Text */}
          <text x="1003" y="593"
            textAnchor="middle"
            fontFamily='"Cormorant Garamond", Georgia, serif'
            fontSize="15" fontStyle="italic"
            fill="#f0ddb8" opacity="0.90">
            Emma's Rose Garden
          </text>
        </g>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 7 — ROSE CANES (sharp foreground, interactive)         */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {CANE_CX.map((cx, idx) => (
          <CloseRoseCane key={idx} cx={cx} idx={idx} />
        ))}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* LAYER 8 — VIGNETTE                                           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <rect x="0" y="0" width={VW} height={VH} fill="url(#vig)" pointerEvents="none"/>

      </svg>

      {/* ── SELECTED ROSE DETAIL PANEL ── */}
      {(() => {
        const plant = dkoPlants.find(p => p.id === selectedId);
        if (!plant) return null;
        const vi = dkoPlants.indexOf(plant);
        const v = variety[vi];
        const pruneNeeded = v.dead >= 3;
        return (
          <div style={{
            position: 'absolute',
            bottom: 78, left: '50%', transform: 'translateX(-50%)',
            width: 300, maxWidth: '80vw',
            background: 'rgba(14,6,2,0.92)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(232,64,112,0.38)',
            borderRadius: 12, padding: '13px 16px',
            zIndex: 12,
          }}>
            {/* Close hint */}
            <div style={{ position: 'absolute', top: 8, right: 12,
              fontSize: 10, color: 'rgba(160,140,100,0.55)',
              fontFamily: '"Crimson Pro", Georgia, serif', cursor: 'pointer' }}
              onClick={() => onSelect && onSelect(null)}>
              ✕
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 16 }}>🌹</span>
              <div>
                <div style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                  fontSize: 15, fontWeight: 600, color: '#e84070', lineHeight: 1.2 }}>
                  Double Knock Out Rose
                </div>
                <div style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                  fontSize: 11, color: '#a09070', fontStyle: 'italic' }}>
                  {plant.subtitle} · {plant.species}
                </div>
              </div>
            </div>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7898a8', flexShrink: 0 }}/>
                <span style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                  fontSize: 12, color: '#7898a8', fontStyle: 'italic' }}>Resting · dormant</span>
              </div>
              {pruneNeeded && (
                <div style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                  fontSize: 12, color: '#e87040' }}>⚠ prune dead canes</div>
              )}
            </div>
            {plant.lore && (
              <div style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                fontSize: 11, color: '#907060', marginTop: 6, fontStyle: 'italic' }}>
                {plant.lore}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
