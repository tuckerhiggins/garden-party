// TerraceMap.js — SVG bird's eye terrace map
// The wisteria fence and rose trellises are the focal mechanics.
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ACTION_DEFS } from './data/plants';
import { PlantPortrait } from './PlantPortraits';
import { computeWaterLevel, HEALTH_LEVEL } from './utils/health';

// Build portrait history newest-first, deduping current from history
function buildPortraitHistory(portrait) {
  const current = portrait.svg ? { svg: portrait.svg, visualNote: portrait.visualNote, date: portrait.date } : null;
  const hist = (portrait.history || []).filter(h => h.svg).reverse();
  if (!current) return hist;
  const deduped = hist.filter(h => h.svg !== current.svg);
  return [current, ...deduped];
}

// Estimate days until next phenological stage based on history
function daysToNextStage(portrait) {
  const stages = portrait.stages || [];
  const currentIdx = stages.indexOf(portrait.currentStage);
  if (currentIdx < 0 || currentIdx >= stages.length - 1) return null;
  const stageHistory = portrait.stageHistory || [];
  const currentEntry = [...stageHistory].reverse().find(e => e.stage === portrait.currentStage);
  if (!currentEntry) return null;
  const daysInStage = (Date.now() - new Date(currentEntry.date).getTime()) / 86400000;
  const durations = [];
  for (let i = 1; i < stageHistory.length; i++) {
    const dur = (new Date(stageHistory[i].date) - new Date(stageHistory[i - 1].date)) / 86400000;
    if (dur >= 1 && dur <= 45) durations.push(dur);
  }
  const avgDur = durations.length > 0
    ? durations.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, durations.length)
    : 6;
  return Math.max(1, Math.round(avgDur - daysInStage));
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── COORDINATE SYSTEM ─────────────────────────────────────────────────────
// viewBox: 870 × 694
// Wall 2 (cedar fence + wisteria):  x = 0  → FW
// Wall 4 (metal railing):           x = DR  → VW
// Wall 3 (back / neighbor bldg):    y = 0  → BH
// Wall 1 (building / sliding door): y = DB  → VH
// Deck:                             x = DL → DR, y = DT → DB

// Terrace: 16 ft wide × 20 ft deep = 320 sq ft (per offering plan)
// Scale: 40 px = 1 ft
const SCALE = 40;
const VW = 820, VH = 854;  // extra right margin for stepped terrace extension
const FW = 46;    // cedar fence (Wall 2, left) — ~1.15 ft visual width
const BH = 32;    // back strip (Wall 3, neighbor building)
const W1H = 22;   // building wall strip (Wall 1, bottom)
const DL = FW, DT = BH, DB = VH - W1H;
const DW = 640;   // 16 ft at 40 px/ft — fixed
const DH = DB - DT;   // 800 px = 20 ft
const DR = DL + DW;   // 686 — right edge of main deck rectangle

// Hexagonal parapet protrusion — lower-right (4 equal segments, last diagonal ends at DB)
const DR_EXT    = DR + 90;                           // 776 — max extension ~2.25 ft
const ANNEX_TOP  = DT + Math.round(DH * 0.25);      // 232 — straight section ends, first diagonal starts
const ANNEX_MID1 = DT + Math.round(DH * 0.50);      // 432 — first diagonal ends / flat face starts
const ANNEX_MID2 = DT + Math.round(DH * 0.75);      // 632 — flat face ends / second diagonal starts (ends at DB)

const WIRE_STEP = 30;   // diamond wire grid repeat
const SERIF = '"Crimson Pro", Georgia, serif';

// ── Season awareness ──────────────────────────────────────────────────────
const SEASON_OPEN_MS = new Date('2026-03-20').getTime();
const DAYS = (Date.now() - SEASON_OPEN_MS) / 86400000;

// ── Wall 4 plant types — rendered structurally, not as tokens ─────────────
const WALL4_TYPES = new Set(['hydrangea','serviceberry','maple','evergreen','evergreen-xmas']);

// ── HEALTH MODIFIER ────────────────────────────────────────────────────────
function healthMod(health) {
  switch(health) {
    case 'thriving':   return { leafOp:1.0, vib:1.0, droop:0,    shift:0,    stemOp:0.88 };
    case 'content':    return { leafOp:0.92,vib:0.95,droop:0,    shift:0,    stemOp:0.85 };
    case 'recovering': return { leafOp:0.70,vib:0.70,droop:0.10, shift:0.22, stemOp:0.76 };
    case 'thirsty':    return { leafOp:0.55,vib:0.58,droop:0.22, shift:0.44, stemOp:0.68 };
    case 'overlooked': return { leafOp:0.42,vib:0.44,droop:0.34, shift:0.60, stemOp:0.60 };
    case 'struggling': return { leafOp:0.26,vib:0.28,droop:0.58, shift:0.88, stemOp:0.50 };
    case 'resting':    return { leafOp:0.04,vib:0.55,droop:0,    shift:0,    stemOp:0.60 };
    default:           return { leafOp:0.80,vib:0.80,droop:0,    shift:0,    stemOp:0.80 };
  }
}

// Next-action timeline for pinned plant card
const TIMELINE_KEYS = ['water','prune','fertilize','neem','train','worms'];
function getActionTimeline(plant, careLog, seasonOpen) {
  if (!seasonOpen) return [];
  const plantActionSet = new Set(plant.actions || []);
  return TIMELINE_KEYS
    .filter(key => plantActionSet.has(key))  // only show actions this plant actually supports
    .map(key => {
      const def = ACTION_DEFS[key]; if (!def) return null;
      const entries = (careLog[plant.id] || []).filter(e => e.action === key);
      let available = true, daysLeft = 0, neverDone = entries.length === 0;
      if (!def.alwaysAvailable && def.cooldownDays > 0 && entries.length > 0) {
        const last = new Date(entries[entries.length - 1].date);
        const daysSince = (Date.now() - last.getTime()) / 86400000;
        daysLeft = Math.ceil(def.cooldownDays - daysSince);
        available = daysLeft <= 0;
      }
      return { key, label: def.label, emoji: def.emoji, available, daysLeft: Math.max(0, daysLeft), neverDone };
    }).filter(Boolean);
}

function fmtDaysLeft(daysLeft) {
  if (daysLeft <= 1) return 'tomorrow';
  if (daysLeft <= 6) return `in ${daysLeft}d`;
  return new Date(Date.now() + daysLeft * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function healthLabel(h) {
  return { thriving:'Thriving', content:'Content', thirsty:'Thirsty', overlooked:'Overlooked',
    struggling:'Struggling', resting:'Resting', recovering:'Recovering' }[h] || h;
}
function healthColor(h) {
  return { thriving:'#58c030', content:'#88c838', thirsty:'#c8a820', overlooked:'#c87020',
    struggling:'#c83020', resting:'#7898a8', recovering:'#98a828' }[h] || '#909080';
}

// Blend healthy leaf color toward stressed yellow-brown
function stressLeaf(healthyHex, shift) {
  if (shift <= 0) return healthyHex;
  const stressed = '#9a8020';
  const r1=parseInt(healthyHex.slice(1,3),16), g1=parseInt(healthyHex.slice(3,5),16), b1=parseInt(healthyHex.slice(5,7),16);
  const r2=parseInt(stressed.slice(1,3),16), g2=parseInt(stressed.slice(3,5),16), b2=parseInt(stressed.slice(5,7),16);
  const r=Math.round(r1+(r2-r1)*shift), g=Math.round(g1+(g2-g1)*shift), b=Math.round(b1+(b2-b1)*shift);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ── Sliding door — lower-left of deck (the only way in/out) ──────────────
const DOOR_X = DL + Math.round(DW * 0.26);  // ~254px — left third of Wall 1
const DOOR_W = 60;

// ── Wall 3 planter geometry (shared by renderer + hit test) ──────────────
const W3_PLANTER_W = 200;   // 5 ft each
const W3_PLANTER_H = 52;    // ~1.3 ft deep into deck
const W3_GAP       = 20;    // gap between the two planters
const W3_START_X   = DL + (DW - (W3_PLANTER_W * 2 + W3_GAP)) / 2;
const W3_L_BOX_X   = W3_START_X;
const W3_R_BOX_X   = W3_START_X + W3_PLANTER_W + W3_GAP;

// Plant pos (0–1) → SVG deck coords
function pxy(pos) {
  return { x: DL + pos.x * DW, y: DT + pos.y * DH };
}

// Right-wall boundary at a given y (accounts for hex protrusion)
function drAtY(y) {
  if (y <= ANNEX_TOP) return DR;
  if (y < ANNEX_MID1) return DR + (DR_EXT - DR) * (y - ANNEX_TOP) / (ANNEX_MID1 - ANNEX_TOP);
  if (y <= ANNEX_MID2) return DR_EXT;
  return DR + (DR_EXT - DR) * (DB - y) / (DB - ANNEX_MID2);
}

// Wall 4 plant pos → SVG coords, x maps to the actual extended right boundary at that y
function pxyW4(pos) {
  const y = DT + pos.y * DH;
  return { x: DL + pos.x * (drAtY(y) - DL), y };
}

// ── BARREL PLANTER ────────────────────────────────────────────────────────
function BarrelPlanter({ cx, cy, selected, hovered, color = '#9860c8' }) {
  return (
    <g>
      {selected && <circle cx={cx} cy={cy} r={20} fill="none"
        stroke="#d4a830" strokeWidth={2} strokeDasharray="4 3" opacity={0.95}/>}
      {hovered && !selected && <circle cx={cx} cy={cy} r={17} fill="none"
        stroke={color} strokeWidth={1.2} opacity={0.45}/>}
      {/* Shadow */}
      <circle cx={cx+2} cy={cy+3} r={13} fill="rgba(0,0,0,0.40)"/>
      {/* Staves */}
      <circle cx={cx} cy={cy} r={13} fill="#4a3215"/>
      {/* Barrel hoops */}
      <circle cx={cx} cy={cy} r={13} fill="none" stroke="#8a6030" strokeWidth={3.5} opacity={0.55}/>
      <circle cx={cx} cy={cy} r={13} fill="none" stroke="#7a5225" strokeWidth={1.2} opacity={0.45}/>
      {/* Top rim / soil */}
      <ellipse cx={cx} cy={cy} rx={9} ry={4} fill="#2e1e08" opacity={0.80}/>
      <ellipse cx={cx} cy={cy} rx={9} ry={4} fill="none" stroke="#5a3a18" strokeWidth={0.8}/>
    </g>
  );
}

// ── CEDAR PLANTER BOX ─────────────────────────────────────────────────────
function CedarBox({ x, y, w, h }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#9a6c28" rx={2}/>
      <rect x={x} y={y} width={w} height={h} fill="none"
        stroke="#6a4618" strokeWidth={1.2} rx={2}/>
      {[h * 0.35, h * 0.68].map((dy, i) => (
        <line key={i} x1={x + 3} y1={y + dy} x2={x + w - 3} y2={y + dy}
          stroke="rgba(90,50,12,0.28)" strokeWidth={0.9}/>
      ))}
      <rect x={x} y={y} width={6} height={h} fill="rgba(60,35,8,0.30)" rx={1}/>
      <rect x={x + w - 6} y={y} width={6} height={h} fill="rgba(60,35,8,0.30)" rx={1}/>
    </g>
  );
}

// ── LATTICE PANEL (Wall 3 strip for roses) ───────────────────────────────
function LatticePanel({ x, y, w, h, growth, roseColor }) {
  const cols = Math.floor(w / 9);
  const rows = Math.floor(h / 8);
  const coverW = w * Math.min(1, growth * 1.4);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="rgba(140,110,55,0.18)" rx={1}/>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`lv${i}`} x1={x + i * 9} y1={y} x2={x + i * 9} y2={y + h}
          stroke="rgba(170,135,65,0.40)" strokeWidth={0.8}/>
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`lh${i}`} x1={x} y1={y + i * 8} x2={x + w} y2={y + i * 8}
          stroke="rgba(170,135,65,0.28)" strokeWidth={0.7}/>
      ))}
    </g>
  );
}

// ── WISTERIA FENCE (the focal piece) ─────────────────────────────────────
function WisteriaFence({ wisteriaPlants, selectedId, hoveredId }) {
  const numRows = Math.ceil((VH + WIRE_STEP * 2) / WIRE_STEP) + 2;

  const zones = wisteriaPlants.map(p => {
    const g = p.growth || 0;
    const m = healthMod(p.health);
    const { y: py } = pxy(p.pos);
    const isLeft = p.id === 'wisteria-l';
    const upReach = g * Math.max(0, py - DT - 24);
    const latReach = g * DH * 0.26;
    return {
      p, g, m, py, isLeft,
      upTop: py - upReach, upBot: py,
      latTop: isLeft ? py : Math.max(DT, py - latReach),
      latBot: isLeft ? Math.min(DB, py + latReach) : py,
    };
  });

  return (
    <g>
      {/* ── Cedar fence planks ── */}
      {Array.from({ length: Math.ceil(VH / 18) }, (_, i) => (
        <g key={`fp${i}`}>
          <rect x={0} y={i * 18} width={FW} height={17}
            fill={['#c8982a','#b88222','#a8721a'][i % 3]}/>
          <rect x={0} y={i * 18} width={FW} height={1.5}
            fill="rgba(0,0,0,0.07)"/>
          <line x1={FW * 0.38} y1={i * 18} x2={FW * 0.38} y2={i * 18 + 17}
            stroke="rgba(0,0,0,0.035)" strokeWidth={0.6}/>
          <line x1={FW * 0.72} y1={i * 18} x2={FW * 0.72} y2={i * 18 + 17}
            stroke="rgba(0,0,0,0.025)" strokeWidth={0.5}/>
        </g>
      ))}

      {/* ── Coverage fills (behind wire) ── */}
      {zones.map(z => z.g > 0 && z.p.health !== 'resting' && (
        <g key={`cov${z.p.id}`} opacity={z.m.vib}>
          <rect x={0} y={z.upTop} width={FW} height={z.upBot - z.upTop}
            fill={`rgba(68,96,24,${0.15 + z.g * 0.12})`}/>
          <rect x={0} y={z.latTop} width={FW} height={z.latBot - z.latTop}
            fill={`rgba(68,96,24,${0.09 + z.g * 0.07})`}/>
        </g>
      ))}

      {/* ── Diamond wire grid ── */}
      {Array.from({ length: numRows }, (_, i) => {
        const wy = (i - 1) * WIRE_STEP;
        const midY = wy + WIRE_STEP / 2;

        const covering = zones.filter(z => {
          const inUp  = midY >= z.upTop  && midY <= z.upBot;
          const inLat = midY >= z.latTop && midY <= z.latBot;
          return inUp || inLat;
        });
        const n = covering.length;
        const wireStroke = n === 0
          ? 'rgba(225,202,138,0.72)'
          : n === 1 ? '#5a7e28' : '#4a7020';
        const wireW = n > 0 ? 1.7 : 1.1;
        const fill   = n > 0 ? `rgba(68,96,24,${n === 1 ? 0.14 : 0.22})` : 'none';

        return (
          <polyline key={`w${i}`}
            points={`0,${midY} ${FW * 0.5},${wy} ${FW},${midY} ${FW * 0.5},${wy + WIRE_STEP} 0,${midY}`}
            fill={fill} stroke={wireStroke} strokeWidth={wireW}/>
        );
      })}

      {/* ── Per-plant: main cane, connector, planter, tips ── */}
      {zones.map(z => {
        const { x: px, y: py } = pxy(z.p.pos);
        const isSel = z.p.id === selectedId;
        const isHov = z.p.id === hoveredId;

        return (
          <g key={`wz${z.p.id}`}>
            {z.g > 0 && z.p.health !== 'resting' && (
              <line x1={FW * 0.64} y1={py} x2={FW * 0.64} y2={z.upTop}
                stroke={z.g > 0 && z.m.shift < 0.5 ? '#3e6018' : '#6a5018'} strokeWidth={2.6}
                opacity={0.52 * z.m.vib} strokeLinecap="round"/>
            )}
            {z.g > 0.15 && z.p.health !== 'resting' && (
              <line
                x1={FW * 0.50} y1={py}
                x2={FW * 0.50} y2={z.isLeft ? z.latBot : z.latTop}
                stroke={z.g > 0 && z.m.shift < 0.5 ? '#3e6018' : '#6a5018'} strokeWidth={1.6}
                opacity={0.38 * z.m.vib} strokeLinecap="round"/>
            )}
            {z.g > 0.04 && z.upTop < py - WIRE_STEP && (
              <g>
                <circle cx={FW * 0.22} cy={z.upTop + 5} r={2.2} fill="#5c8a28" opacity={0.70}/>
                <circle cx={FW * 0.55} cy={z.upTop + 3} r={2.0} fill="#5c8a28" opacity={0.62}/>
                <circle cx={FW * 0.82} cy={z.upTop + 6} r={1.8} fill="#6a9a30" opacity={0.55}/>
              </g>
            )}
            {z.g > 0.60 && (() => {
              const wisBloomSeason = DAYS < 30 ? 0
                : DAYS < 42 ? (DAYS - 30) / 12
                : DAYS < 60 ? 1.0
                : DAYS < 75 ? 1 - (DAYS - 60) / 15
                : 0;
              const amt = Math.min(1, (z.g - 0.60) * 2.5) * wisBloomSeason;
              if (amt <= 0) return null;
              return (
                <g opacity={amt}>
                  <circle cx={FW * 0.18} cy={z.upTop + 2} r={4.0} fill="#9860c8"/>
                  <circle cx={FW * 0.46} cy={z.upTop - 2} r={3.5} fill="#a870d8"/>
                  <circle cx={FW * 0.76} cy={z.upTop + 3} r={3.8} fill="#9060c0"/>
                  <circle cx={FW * 0.32} cy={z.upTop + 7} r={3.0} fill="#b080dc"/>
                  <circle cx={FW * 0.28} cy={z.upTop + 10} r={3.2} fill="#8850be"/>
                  <circle cx={FW * 0.58} cy={z.upTop + 8}  r={3.5} fill="#a070d0"/>
                  <circle cx={FW * 0.12} cy={z.upTop + 11} r={2.8} fill="#7040b0"/>
                  <circle cx={FW * 0.65} cy={z.upTop + 12} r={3.0} fill="#9868c8"/>
                </g>
              );
            })()}
            <line x1={px - 13} y1={py} x2={FW} y2={py}
              stroke={z.g > 0 ? '#3e6018' : '#5a4020'}
              strokeWidth={z.g > 0 ? 2.2 : 1.5} opacity={0.58}/>
            <BarrelPlanter cx={px} cy={py}
              selected={isSel} hovered={isHov} color={z.p.color}/>
          </g>
        );
      })}
    </g>
  );
}

// ── WALL 3 ROSE TRELLISES ────────────────────────────────────────────────
function WallThreePlanters({ plants, selectedId, hoveredId }) {
  const roses   = plants.filter(p => p.type === 'climbing-rose')
    .sort((a, b) => a.pos.x - b.pos.x);
  const lavs    = plants.filter(p => p.type === 'lavender')
    .sort((a, b) => a.pos.x - b.pos.x);

  const planterY = DT;
  const planterH = W3_PLANTER_H;
  const planterW = W3_PLANTER_W;
  const latticeY = 3;
  const latticeH = BH - 4;
  const lBoxX = W3_L_BOX_X;
  const rBoxX = W3_R_BOX_X;

  const gL = roses[0]?.growth || 0;
  const gR = roses[1]?.growth || 0;
  const mL = healthMod(roses[0]?.health || 'content');
  const mR = healthMod(roses[1]?.health || 'content');

  function PlanterContents({ boxX, growth, roseColor = '#e84070', hm = {leafOp:1,shift:0,stemOp:0.85}, lRosePlant, rRosePlant, lavPlant }) {
    const midX  = boxX + planterW / 2;
    const lRoseX = boxX + planterW * 0.22;
    const rRoseX = boxX + planterW * 0.78;
    const lavX   = midX;
    const caneColor = hm.shift > 0.2 ? '#8a5820' : '#7a5025';
    const caneOp = Math.max(0.45, 0.45 + growth * 0.40) * hm.stemOp;

    return (
      <g>
        <CedarBox x={boxX} y={planterY} w={planterW} h={planterH}/>
        <LatticePanel x={boxX + 4} y={latticeY} w={planterW - 8} h={latticeH}
          growth={growth} roseColor={roseColor}/>

        <line x1={lRoseX} y1={planterY + 4} x2={lRoseX - 3} y2={latticeY + 2}
          stroke={caneColor} strokeWidth={Math.max(1.2, 1.2 + growth * 1.2)}
          opacity={caneOp} strokeLinecap="round"/>
        <line x1={lRoseX + 6} y1={planterY + 4} x2={lRoseX + 4} y2={latticeY + 4}
          stroke={caneColor} strokeWidth={Math.max(0.9, 0.9 + growth * 0.8)}
          opacity={caneOp * 0.75} strokeLinecap="round"/>
        {growth > 0.15 && (
          <path
            d={`M${lRoseX - 3},${latticeY + 3} C${lRoseX - 18},${latticeY + 2} ${boxX + 14},${latticeY + 1} ${boxX + 8},${latticeY + 2}`}
            fill="none" stroke={caneColor}
            strokeWidth={Math.max(0.8, growth * 1.0)} opacity={0.45}/>
        )}

        <line x1={rRoseX} y1={planterY + 4} x2={rRoseX + 3} y2={latticeY + 2}
          stroke={caneColor} strokeWidth={Math.max(1.2, 1.2 + growth * 1.2)}
          opacity={caneOp} strokeLinecap="round"/>
        <line x1={rRoseX - 6} y1={planterY + 4} x2={rRoseX - 4} y2={latticeY + 4}
          stroke={caneColor} strokeWidth={Math.max(0.9, 0.9 + growth * 0.8)}
          opacity={caneOp * 0.75} strokeLinecap="round"/>
        {growth > 0.15 && (
          <path
            d={`M${rRoseX + 3},${latticeY + 3} C${rRoseX + 18},${latticeY + 2} ${boxX + planterW - 14},${latticeY + 1} ${boxX + planterW - 8},${latticeY + 2}`}
            fill="none" stroke={caneColor}
            strokeWidth={Math.max(0.8, growth * 1.0)} opacity={0.45}/>
        )}

        <g opacity={0.85}>
          {[-5, 0, 5].map((dx, i) => (
            <g key={i}>
              <line x1={lavX + dx} y1={planterY + 8} x2={lavX + dx - 1} y2={planterY - 2}
                stroke="#b890e0" strokeWidth={1.1}/>
              <circle cx={lavX + dx - 1} cy={planterY - 3} r={2.2} fill="#c8a0f0"/>
            </g>
          ))}
        </g>

        {growth > 0.55 && (() => {
          const a = Math.min(1, (growth - 0.55) * 2.2) * hm.leafOp;
          return (
            <g opacity={a}>
              <circle cx={lRoseX - 3} cy={latticeY + 2} r={4.0} fill={roseColor}/>
              <circle cx={lRoseX + 4} cy={latticeY + 4} r={3.0} fill="#f06888"/>
              <circle cx={rRoseX + 3} cy={latticeY + 2} r={4.0} fill={roseColor}/>
              <circle cx={rRoseX - 4} cy={latticeY + 4} r={3.0} fill="#f06888"/>
            </g>
          );
        })()}

        {[
          { plant: lRosePlant, cx: lRoseX, w: planterW * 0.35 },
          { plant: lavPlant,   cx: midX,   w: planterW * 0.30 },
          { plant: rRosePlant, cx: rRoseX, w: planterW * 0.35 },
        ].map(({ plant, cx: pcx, w }) => {
          if (!plant) return null;
          const isSel = plant.id === selectedId;
          const isHov = plant.id === hoveredId;
          if (!isSel && !isHov) return null;
          const hw = w / 2;
          return (
            <rect key={plant.id}
              x={pcx - hw} y={latticeY - 1}
              width={w} height={BH + planterH - latticeY + 1}
              fill={isSel ? 'rgba(212,168,48,0.08)' : 'rgba(200,180,140,0.05)'}
              stroke={isSel ? '#d4a830' : 'rgba(200,180,140,0.45)'}
              strokeWidth={isSel ? 1.4 : 0.9}
              strokeDasharray={isSel ? '4 3' : '3 3'}
              rx={3}/>
          );
        })}
      </g>
    );
  }

  return (
    <g>
      <PlanterContents boxX={lBoxX} growth={gL} hm={mL}
        lRosePlant={roses[0]} rRosePlant={roses[0]} lavPlant={lavs[0]}/>
      <PlanterContents boxX={rBoxX} growth={gR} hm={mR}
        lRosePlant={roses[1]} rRosePlant={roses[1]} lavPlant={lavs[1]}/>
    </g>
  );
}

// ── WALL 4: SHARED HELPERS ────────────────────────────────────────────────

// Grey glazed pot seen from bird's eye — larger for hydrangeas
function GreyPot({ cx, cy, r = 20, tint = '#8a8888' }) {
  const ry = r * 0.46;
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + ry + 3} rx={r + 1} ry={ry + 1} fill="rgba(0,0,0,0.32)"/>
      <ellipse cx={cx} cy={cy + ry} rx={r} ry={ry} fill={tint}/>
      <ellipse cx={cx} cy={cy + ry} rx={r} ry={ry} fill="none" stroke="rgba(60,60,58,0.45)" strokeWidth={0.8}/>
      <ellipse cx={cx} cy={cy + ry - 1} rx={r - 2} ry={ry - 1} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={0.9}/>
      {/* Soil surface */}
      <ellipse cx={cx} cy={cy + 2} rx={r - 4} ry={(r - 4) * 0.44} fill="#2a1c0a" opacity={0.70}/>
    </g>
  );
}

// White ribbed cylinder pot (evergreens)
function WhitePot({ cx, cy, r = 13 }) {
  const ry = r * 0.42;
  return (
    <g>
      <ellipse cx={cx + 2} cy={cy + ry + 2} rx={r + 1} ry={ry} fill="rgba(0,0,0,0.28)"/>
      <ellipse cx={cx} cy={cy + ry} rx={r} ry={ry} fill="#d4d4cc"/>
      {[-4, 0, 4].map((dx, i) => (
        <line key={i} x1={cx + dx} y1={cy} x2={cx + dx} y2={cy + ry * 2}
          stroke="rgba(140,140,132,0.28)" strokeWidth={0.7}/>
      ))}
      <ellipse cx={cx} cy={cy + ry} rx={r} ry={ry} fill="none" stroke="rgba(160,160,150,0.40)" strokeWidth={0.7}/>
      <ellipse cx={cx} cy={cy - 1} rx={r} ry={ry} fill="none" stroke="rgba(200,200,192,0.35)" strokeWidth={0.8}/>
    </g>
  );
}

function SelRing({ cx, cy, r, color, selected, hovered }) {
  return (
    <>
      {selected && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d4a830"
        strokeWidth={2.5} opacity={0.95}/>}
      {hovered && !selected && <circle cx={cx} cy={cy} r={r - 5} fill="none"
        stroke={color} strokeWidth={1.2} opacity={0.40}/>}
    </>
  );
}

// ── WALL 4: HYDRANGEA (Pinnacle Lime) ─────────────────────────────────────
function HydrangeaPlant({ cx, cy, g, health, selected, hovered }) {
  const m = healthMod(health);
  const leafAmtRaw  = Math.max(0, Math.min(1, (g - 0.12) / 0.30));
  const leafAmt     = health === 'resting' ? 0 : leafAmtRaw * m.leafOp;
  const panicleAmtRaw = Math.max(0, Math.min(1, (g - 0.38) / 0.55));
  const panicleAmt  = health === 'resting' ? 0 : panicleAmtRaw * Math.max(0, 1 - m.shift * 1.4);
  const driedAmt    = Math.max(0, 1 - g * 4.5);

  const stemC  = g < 0.25 ? '#8a6830' : '#5e6a1e';
  const leafC  = stressLeaf('#5a9020', m.shift);
  const leafD  = stressLeaf('#3e7010', m.shift);
  const panBase = g < 0.65 ? '#b0d030' : g < 0.85 ? '#d8ee90' : '#eef4c0';
  const panTip  = g < 0.65 ? '#d0e870' : '#f4f8de';

  const stems = [
    { dx: -18, lean: -0.28, len: 52 + g * 22 },
    { dx: -10, lean: -0.14, len: 62 + g * 28 },
    { dx: -3,  lean: -0.04, len: 67 + g * 30 },
    { dx:  5,  lean:  0.10, len: 58 + g * 24 },
    { dx: 12,  lean:  0.22, len: 50 + g * 18 },
  ];

  return (
    <g>
      <SelRing cx={cx - 5} cy={cy - 26} r={50} color="#b8c8e0" selected={selected} hovered={hovered}/>

      <ellipse cx={cx - 2} cy={cy + 8} rx={22 + g * 10} ry={9 + g * 3} fill="rgba(0,0,0,0.28)"/>

      {stems.map((s, i) => {
        const x2 = cx + s.dx + Math.sin(s.lean) * s.len * 0.90;
        const y2 = m.droop > 0
          ? cy - s.len * Math.cos(s.lean) * (0.90 - m.droop * 0.25)
          : cy - s.len * Math.cos(s.lean) * 0.90;
        return (
        <line key={i}
          x1={cx + s.dx} y1={cy}
          x2={x2}
          y2={y2}
          stroke={stemC} strokeWidth={g > 0.35 ? 2.0 : 1.4}
          strokeLinecap="round" opacity={m.stemOp}/>
        );
      })}

      {driedAmt > 0.05 && stems.slice(1, 4).map((s, i) => {
        const hx = cx + s.dx + Math.sin(s.lean) * s.len * 0.88;
        const hy = cy - s.len * 0.86;
        return (
          <g key={i} opacity={driedAmt * 0.75}>
            {Array.from({ length: 12 }, (_, j) => {
              const a = (j / 12) * Math.PI * 2;
              return <circle key={j} cx={hx + Math.cos(a) * 5.5} cy={hy + Math.sin(a) * 3.5}
                r={1.6} fill="#c0aa78" opacity={0.52}/>;
            })}
            <circle cx={hx} cy={hy} r={2.2} fill="#b09860" opacity={0.58}/>
          </g>
        );
      })}

      {leafAmt > 0.01 && stems.map((s, i) => {
        const l1x = cx + s.dx + Math.sin(s.lean) * s.len * 0.44;
        const l1y = cy - s.len * 0.42;
        const l2x = cx + s.dx + Math.sin(s.lean) * s.len * 0.66;
        const l2y = cy - s.len * 0.64;
        const rot1 = s.lean * 60 - 38;
        const rot2 = s.lean * 60 + 28;
        return (
          <g key={i} opacity={leafAmt}>
            <ellipse cx={l1x - 6} cy={l1y} rx={10} ry={6} fill={leafC}
              transform={`rotate(${rot1}, ${l1x - 6}, ${l1y})`}/>
            <ellipse cx={l1x + 5} cy={l1y - 3} rx={9} ry={5.5} fill={leafD}
              transform={`rotate(${rot2}, ${l1x + 5}, ${l1y - 3})`}/>
            <ellipse cx={l2x - 4} cy={l2y} rx={8} ry={5} fill={leafC}
              transform={`rotate(${rot1 + 12}, ${l2x - 4}, ${l2y})`}/>
          </g>
        );
      })}

      {panicleAmt > 0.01 && stems.map((s, i) => {
        const tipX = cx + s.dx + Math.sin(s.lean) * s.len;
        const tipY = cy - s.len * Math.cos(s.lean) * 0.96;
        const pH = 16 + panicleAmt * 20;
        const pW = 6 + panicleAmt * 6;
        const op = Math.min(1, panicleAmt * 1.8);

        return (
          <g key={i} opacity={op}>
            {Array.from({ length: 8 }, (_, row) => {
              const frac = row / 7;
              const rowW = pW * (1 - frac * 0.78);
              const rowY = tipY - frac * pH;
              const dotsN = Math.max(1, Math.round((1 - frac * 0.65) * (pW / 2.2)));
              const dotR = 1.9 + (1 - frac) * 0.7;
              const dotC = frac < 0.35 ? panBase : panTip;
              return Array.from({ length: dotsN }, (_, d) => {
                const dx = dotsN > 1 ? (d / (dotsN - 1) - 0.5) * rowW * 2 : 0;
                return <circle key={`${row}_${d}`}
                  cx={tipX + dx} cy={rowY} r={dotR}
                  fill={dotC} opacity={0.88}/>;
              });
            })}
          </g>
        );
      })}

      <GreyPot cx={cx} cy={cy} r={24} tint="#8a9090"/>

      <text x={cx - 4} y={cy + 34} textAnchor="middle"
        fontFamily={SERIF} fontSize={7.5} fontStyle="italic"
        fill="rgba(240,228,200,0.78)"
        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
        Limelight
      </text>
    </g>
  );
}

// ── WALL 4: SERVICEBERRY ──────────────────────────────────────────────────
function ServiceberryPlant({ cx, cy, g, health, selected, hovered }) {
  const m = healthMod(health);
  const flowerAmtRaw = DAYS < 25
    ? Math.min(1, Math.max(0, 1 - DAYS * 0.01))
    : Math.max(0, 1 - (DAYS - 25) / 20);
  const flowerAmt = flowerAmtRaw * m.leafOp;

  // White blossom cluster — peaks Day 12–35, gone by Day 40
  const blossomPeakAmt = DAYS < 12 ? 0
    : DAYS < 22 ? (DAYS - 12) / 10   // ramp up
    : DAYS < 30 ? 1.0                  // peak
    : DAYS < 40 ? 1 - (DAYS - 30) / 10 // fade
    : 0;
  const blossomAmt = blossomPeakAmt * m.leafOp;

  const leafAmtRaw = DAYS < 15
    ? 0
    : Math.min(1, Math.max(g * 0.8, (DAYS - 15) / 40));
  const leafAmt = leafAmtRaw * m.leafOp;
  const berryAmt = DAYS > 75 ? Math.min(1, (DAYS - 75) / 25) * g : 0;

  const stems = [
    { dx: -7, lean: -0.24, len: 68 },
    { dx:  0, lean:  0.02, len: 82 },
    { dx:  9, lean:  0.22, len: 72 },
  ];

  const subFracs = [0.48, 0.66, 0.82, 0.94];

  return (
    <g>
      <SelRing cx={cx - 2} cy={cy - 30} r={44} color="#d06030" selected={selected} hovered={hovered}/>

      <ellipse cx={cx + 2} cy={cy + 6} rx={18 + g * 6} ry={7} fill="rgba(0,0,0,0.24)"/>

      {stems.map((s, si) => {
        const ex = cx + s.dx + Math.sin(s.lean) * s.len;
        const ey = cy - s.len;
        return (
          <g key={si}>
            <line x1={cx + s.dx} y1={cy} x2={ex} y2={ey}
              stroke="#b85020" strokeWidth={2.0} strokeLinecap="round" opacity={m.stemOp}/>
            {subFracs.map((frac, fi) => {
              const bx = cx + s.dx + Math.sin(s.lean) * s.len * frac;
              const by = cy - s.len * frac;
              const side = (si + fi) % 2 === 0 ? 1 : -1;
              const bLean = s.lean + side * (0.38 + fi * 0.06);
              const bLen = 12 + fi * 4;
              const ex2 = bx + Math.sin(bLean) * bLen;
              const ey2 = by - bLen * 0.92;
              return (
                <g key={fi}>
                  <line x1={bx} y1={by} x2={ex2} y2={ey2}
                    stroke="#c86030" strokeWidth={1.0} strokeLinecap="round" opacity={0.72}/>
                  {fi >= 2 && [-1, 1].map(t => (
                    <line key={t} x1={ex2} y1={ey2}
                      x2={ex2 + t * 4} y2={ey2 - 5}
                      stroke="#d07040" strokeWidth={0.6} opacity={0.55}/>
                  ))}
                </g>
              );
            })}
          </g>
        );
      })}

      {flowerAmt > 0.02 && stems.map((s, si) =>
        subFracs.map((frac, fi) => {
          const bx = cx + s.dx + Math.sin(s.lean) * s.len * frac;
          const by = cy - s.len * frac;
          const side = (si + fi) % 2 === 0 ? 1 : -1;
          const bLean = s.lean + side * (0.38 + fi * 0.06);
          const bLen = 12 + fi * 4;
          const fx = bx + Math.sin(bLean) * bLen;
          const fy = by - bLen * 0.92;
          return Array.from({ length: 2 + fi % 2 }, (_, flower) => {
            const fa = (flower / (2 + fi % 2)) * Math.PI * 2 + si * 0.8;
            const fr = 3.5 + flower * 1.8;
            const flx = fx + Math.cos(fa) * fr * 0.65;
            const fly = fy + Math.sin(fa) * fr * 0.45;
            return (
              <g key={`${si}_${fi}_${flower}`} opacity={flowerAmt * 0.90}>
                {Array.from({ length: 5 }, (_, p) => {
                  const pa = (p / 5) * Math.PI * 2 - Math.PI * 0.5;
                  return (
                    <ellipse key={p}
                      cx={flx + Math.cos(pa) * 2.8}
                      cy={fly + Math.sin(pa) * 2.0}
                      rx={1.6} ry={0.9}
                      fill={m.shift > 0.3 ? '#e8e0d0' : '#f6f6f2'}
                      transform={`rotate(${pa * 180 / Math.PI + 90}, ${flx + Math.cos(pa) * 2.8}, ${fly + Math.sin(pa) * 2.0})`}
                      opacity={0.92}/>
                  );
                })}
                <circle cx={flx} cy={fly} r={1.0} fill="#f0e030" opacity={0.85}/>
              </g>
            );
          });
        })
      )}

      {leafAmt > 0.02 && stems.map((s, si) =>
        subFracs.map((frac, fi) => {
          const bx = cx + s.dx + Math.sin(s.lean) * s.len * frac;
          const by = cy - s.len * frac;
          return Array.from({ length: 3 }, (_, li) => {
            const la = (li / 3) * Math.PI * 2 + si;
            return (
              <ellipse key={`${si}_${fi}_${li}`}
                cx={bx + Math.cos(la) * 5}
                cy={by + Math.sin(la) * 3.5}
                rx={4} ry={2.5}
                fill="#6a9828"
                transform={`rotate(${la * 57 + 20}, ${bx + Math.cos(la) * 5}, ${by + Math.sin(la) * 3.5})`}
                opacity={leafAmt * 0.82}/>
            );
          });
        })
      )}

      {berryAmt > 0.02 && stems.map((s, si) => (
        [0.72, 0.88].map((frac, fi) => {
          const bx = cx + s.dx + Math.sin(s.lean) * s.len * frac;
          const by = cy - s.len * frac;
          return Array.from({ length: 4 }, (_, bi) => (
            <circle key={`${si}_${fi}_${bi}`}
              cx={bx + (bi - 1.5) * 3.5} cy={by - 3 + (bi % 2) * 2}
              r={2.0} fill="#503880" opacity={berryAmt * 0.78}/>
          ));
        })
      ))}

      {blossomAmt > 0.05 && (
        <g opacity={blossomAmt * 0.88}>
          <circle cx={cx-18} cy={cy-110} r={7}  fill="white" opacity={0.90}/>
          <circle cx={cx-4}  cy={cy-122} r={8}  fill="white" opacity={0.85}/>
          <circle cx={cx+14} cy={cy-116} r={6}  fill="white" opacity={0.88}/>
          <circle cx={cx-10} cy={cy-98}  r={5}  fill="white" opacity={0.82}/>
          <circle cx={cx+6}  cy={cy-104} r={6}  fill="white" opacity={0.80}/>
          <circle cx={cx+20} cy={cy-100} r={5}  fill="#fff8f0" opacity={0.75}/>
        </g>
      )}

      <GreyPot cx={cx} cy={cy} r={17} tint="#8c8a88"/>

      <text x={cx - 2} y={cy + 28} textAnchor="middle"
        fontFamily={SERIF} fontSize={7.5} fontStyle="italic"
        fill="rgba(240,228,200,0.78)"
        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
        Serviceberry
      </text>
    </g>
  );
}

// ── WALL 4: JAPANESE MAPLE ────────────────────────────────────────────────
function MaplePlant({ cx, cy, g, health, selected, hovered }) {
  const m = healthMod(health);
  const seasonLeaf = DAYS < 0 ? 0 : DAYS < 28 ? DAYS / 28 * 0.35 : Math.min(0.9, 0.35 + (DAYS - 28) / 55);
  const effectiveLeafRaw = Math.max(seasonLeaf, g);
  const leafAmt = effectiveLeafRaw * m.leafOp;

  function stressMapleLeaf(hex, shift) {
    if (shift <= 0) return hex;
    const stressed = '#8a5020';
    const r1=parseInt(hex.slice(1,3),16), g1=parseInt(hex.slice(3,5),16), b1=parseInt(hex.slice(5,7),16);
    const r2=parseInt(stressed.slice(1,3),16), g2=parseInt(stressed.slice(3,5),16), b2=parseInt(stressed.slice(5,7),16);
    const r=Math.round(r1+(r2-r1)*shift), gv=Math.round(g1+(g2-g1)*shift), b=Math.round(b1+(b2-b1)*shift);
    return `#${r.toString(16).padStart(2,'0')}${gv.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  const leafC1 = stressMapleLeaf(g > 0.55 ? '#c03018' : g > 0.25 ? '#b84020' : '#a85030', m.shift * 0.6);
  const leafC2 = stressMapleLeaf(g > 0.55 ? '#9a2010' : '#883020', m.shift * 0.6);
  const leafC3 = stressMapleLeaf(g > 0.70 ? '#e84828' : '#c04028', m.shift * 0.6);

  const layers = [
    { cy: -22, spread: 30, n: 3 },
    { cy: -38, spread: 24, n: 4 },
    { cy: -52, spread: 18, n: 3 },
    { cy: -64, spread: 12, n: 2 },
  ];

  return (
    <g>
      <SelRing cx={cx - 3} cy={cy - 32} r={42} color="#d85828" selected={selected} hovered={hovered}/>

      <ellipse cx={cx + 2} cy={cy + 5} rx={16 + leafAmt * 12} ry={6 + leafAmt * 3} fill="rgba(0,0,0,0.26)"/>

      <line x1={cx} y1={cy} x2={cx - 2} y2={cy - 68}
        stroke="#7a5030" strokeWidth={2.8} strokeLinecap="round" opacity={0.85}/>

      {layers.map((layer, li) => {
        const ly = cy + layer.cy;
        return (
          <g key={li}>
            {Array.from({ length: layer.n }, (_, bi) => {
              const side = bi % 2 === 0 ? 1 : -1;
              const tier = Math.floor(bi / 2);
              const bx = cx + side * (layer.spread * 0.35 + tier * layer.spread * 0.40);
              return (
                <g key={bi}>
                  <line x1={cx + (li === 0 ? side * 3 : 0)} y1={ly + 3}
                    x2={bx} y2={ly}
                    stroke="#886040" strokeWidth={1.4 - li * 0.22}
                    strokeLinecap="round" opacity={0.78}/>
                  {[0, 1, 2].map(ti => {
                    const ta = -Math.PI * 0.5 + side * (0.2 + ti * 0.28);
                    return (
                      <line key={ti}
                        x1={bx} y1={ly}
                        x2={bx + Math.cos(ta) * (8 + ti * 2.5)}
                        y2={ly + Math.sin(ta) * (8 + ti * 2.5)}
                        stroke="#a07848" strokeWidth={0.65}
                        strokeLinecap="round" opacity={0.60}/>
                    );
                  })}

                  {leafAmt > 0.02 && (
                    <g opacity={leafAmt * 0.88}>
                      {Array.from({ length: 7 }, (_, li2) => {
                        const la = (li2 / 7) * Math.PI * 1.6 - Math.PI * 0.8 + side * 0.2;
                        const lx = bx + Math.cos(la) * (10 + li2 % 2 * 4);
                        const lly = ly + Math.sin(la) * 6;
                        return (
                          <polygon key={li2}
                            points={`${lx},${lly - 4} ${lx + 1.8},${lly - 1.5} ${lx + 4.2},${lly - 1.5} ${lx + 1.8},${lly + 0.5} ${lx + 2.8},${lly + 3.5} ${lx},${lly + 1.8} ${lx - 2.8},${lly + 3.5} ${lx - 1.8},${lly + 0.5} ${lx - 4.2},${lly - 1.5} ${lx - 1.8},${lly - 1.5}`}
                            fill={li2 % 3 === 0 ? leafC3 : li2 % 3 === 1 ? leafC1 : leafC2}
                            opacity={0.84}/>
                        );
                      })}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      <GreyPot cx={cx} cy={cy} r={17} tint="#8a8886"/>

      <text x={cx - 3} y={cy + 28} textAnchor="middle"
        fontFamily={SERIF} fontSize={7.5} fontStyle="italic"
        fill="rgba(240,228,200,0.78)"
        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
        Jpn. Maple
      </text>
    </g>
  );
}

// ── WALL 4: EVERGREEN ─────────────────────────────────────────────────────
function WallFourEvergreen({ cx, cy, g, health, isXmas, selected, hovered }) {
  const m = healthMod(health);
  const recovering = health === 'recovering';
  const baseC  = isXmas ? (recovering ? '#747834' : '#848040') : '#487820';
  const midC   = isXmas ? (recovering ? '#606030' : '#606028') : '#2c5016';
  const highC  = isXmas ? '#b0b068' : '#6aa040';

  const tiers = [
    { w: 34, dy: -18 },
    { w: 28, dy: -30 },
    { w: 22, dy: -41 },
    { w: 16, dy: -51 },
    { w: 10, dy: -60 },
    { w: 6,  dy: -68 },
  ];

  return (
    <g>
      <SelRing cx={cx} cy={cy - 36} r={38} color={baseC} selected={selected} hovered={hovered}/>

      <ellipse cx={cx + 2} cy={cy + 5} rx={18} ry={7} fill="rgba(0,0,0,0.26)"/>

      {tiers.map((t, i) => (
        <g key={i}>
          <polygon
            points={`${cx},${cy + t.dy - 13} ${cx - t.w / 2},${cy + t.dy} ${cx + t.w / 2},${cy + t.dy}`}
            fill={i % 2 === 0 ? baseC : midC}
            opacity={(recovering ? 0.70 : 0.90) * m.vib}/>
          <line x1={cx} y1={cy + t.dy - 13} x2={cx - t.w / 2} y2={cy + t.dy}
            stroke={highC} strokeWidth={0.5} opacity={recovering ? 0.10 : 0.22}/>
          {i < 4 && (
            <line x1={cx - t.w * 0.25} y1={cy + t.dy - 5}
              x2={cx + t.w * 0.25} y2={cy + t.dy - 5}
              stroke={highC} strokeWidth={0.4} opacity={0.14}/>
          )}
        </g>
      ))}

      {isXmas && [
        { dx: 0,   dy: -32, c: '#e02828' },
        { dx: -8,  dy: -46, c: '#e8d018' },
        { dx:  9,  dy: -40, c: '#2068e0' },
      ].map((o, i) => (
        <g key={i}>
          <circle cx={cx + o.dx} cy={cy + o.dy} r={4.5} fill={o.c} opacity={0.84}/>
          <circle cx={cx + o.dx - 1.5} cy={cy + o.dy - 1.5} r={1.5}
            fill="rgba(255,255,255,0.55)"/>
        </g>
      ))}

      <WhitePot cx={cx} cy={cy} r={13}/>

      <text x={cx} y={cy + 20} textAnchor="middle"
        fontFamily={SERIF} fontSize={7.5} fontStyle="italic"
        fill="rgba(240,228,200,0.75)"
        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
        {isXmas ? 'Evergreen' : 'Evergreen'}
      </text>
    </g>
  );
}

// ── WALL 4: CONTAINER COMPONENT ───────────────────────────────────────────
function WallFourPlants({ plants, selectedId, hoveredId }) {
  return (
    <g>
      {plants.filter(p => WALL4_TYPES.has(p.type)).map(p => {
        const { x, y } = pxyW4(p.pos);
        const common = {
          cx: x, cy: y,
          g: p.growth || 0,
          health: p.health,
          selected: p.id === selectedId,
          hovered: p.id === hoveredId,
        };
        let plant;
        switch (p.type) {
          case 'hydrangea':      plant = <HydrangeaPlant {...common}/>; break;
          case 'serviceberry':   plant = <ServiceberryPlant {...common}/>; break;
          case 'maple':          plant = <MaplePlant {...common}/>; break;
          case 'evergreen':      plant = <WallFourEvergreen {...common} isXmas={false}/>; break;
          case 'evergreen-xmas': plant = <WallFourEvergreen {...common} isXmas={true}/>; break;
          default: plant = null;
        }
        const isCornerEvergreen = p.type === 'evergreen' || p.type === 'evergreen-xmas';
        return plant ? (
          <g key={p.id} transform={isCornerEvergreen ? undefined : `translate(${x},${y}) scale(1.5) translate(${-x},${-y})`}>
            {plant}
          </g>
        ) : null;
      })}
    </g>
  );
}

// ── PLANT ICON (inside token circle) ─────────────────────────────────────
function PlantIcon({ type, r }) {
  const w = r * 0.58;
  switch (type) {
    case 'hydrangea':
      return (
        <g fill="rgba(255,255,255,0.52)">
          <circle cx={0} cy={-w*0.44} r={w*0.26}/>
          <circle cx={w*0.42} cy={-w*0.22} r={w*0.24}/>
          <circle cx={w*0.42} cy={ w*0.22} r={w*0.24}/>
          <circle cx={0} cy={ w*0.44} r={w*0.26}/>
          <circle cx={-w*0.42} cy={ w*0.22} r={w*0.24}/>
          <circle cx={-w*0.42} cy={-w*0.22} r={w*0.24}/>
          <circle cx={0} cy={0} r={w*0.20}/>
        </g>
      );
    case 'serviceberry':
      return (
        <g>
          <line x1={0} y1={w*0.70} x2={0} y2={0}
            stroke="rgba(255,255,255,0.55)" strokeWidth={w*0.24} strokeLinecap="round"/>
          <line x1={0} y1={0} x2={-w*0.46} y2={-w*0.55}
            stroke="rgba(255,255,255,0.48)" strokeWidth={w*0.18} strokeLinecap="round"/>
          <line x1={0} y1={0} x2={ w*0.46} y2={-w*0.55}
            stroke="rgba(255,255,255,0.48)" strokeWidth={w*0.18} strokeLinecap="round"/>
          <line x1={0} y1={-w*0.12} x2={0} y2={-w*0.70}
            stroke="rgba(255,255,255,0.42)" strokeWidth={w*0.15} strokeLinecap="round"/>
          <circle cx={-w*0.48} cy={-w*0.62} r={w*0.26} fill="rgba(255,255,255,0.42)"/>
          <circle cx={ w*0.48} cy={-w*0.62} r={w*0.26} fill="rgba(255,255,255,0.42)"/>
          <circle cx={0}       cy={-w*0.78} r={w*0.28} fill="rgba(255,255,255,0.46)"/>
        </g>
      );
    case 'maple':
      return (
        <g>
          <line x1={0} y1={w*0.70} x2={0} y2={w*0.08}
            stroke="rgba(255,255,255,0.55)" strokeWidth={w*0.22} strokeLinecap="round"/>
          <line x1={0} y1={w*0.08} x2={-w*0.55} y2={-w*0.52}
            stroke="rgba(255,255,255,0.45)" strokeWidth={w*0.15} strokeLinecap="round"/>
          <line x1={0} y1={w*0.08} x2={ w*0.55} y2={-w*0.52}
            stroke="rgba(255,255,255,0.45)" strokeWidth={w*0.15} strokeLinecap="round"/>
          <line x1={0} y1={-w*0.08} x2={0} y2={-w*0.72}
            stroke="rgba(255,255,255,0.40)" strokeWidth={w*0.14} strokeLinecap="round"/>
          <circle cx={-w*0.58} cy={-w*0.58} r={w*0.22} fill="rgba(255,255,255,0.38)"/>
          <circle cx={ w*0.58} cy={-w*0.58} r={w*0.22} fill="rgba(255,255,255,0.38)"/>
          <circle cx={-w*0.28} cy={-w*0.80} r={w*0.20} fill="rgba(255,255,255,0.35)"/>
          <circle cx={ w*0.28} cy={-w*0.80} r={w*0.20} fill="rgba(255,255,255,0.35)"/>
          <circle cx={0}       cy={-w*0.90} r={w*0.22} fill="rgba(255,255,255,0.40)"/>
        </g>
      );
    case 'evergreen':
    case 'evergreen-xmas':
      return (
        <g fill="rgba(255,255,255,0.52)">
          <polygon points={`0,${-w*0.82} ${-w*0.62},${w*0.52} ${w*0.62},${w*0.52}`}/>
          <rect x={-w*0.15} y={w*0.48} width={w*0.30} height={w*0.26}
            fill="rgba(255,255,255,0.32)"/>
        </g>
      );
    case 'empty-pot':
      return (
        <g stroke="rgba(255,255,255,0.55)" strokeWidth={w*0.22}
          fill="none" strokeLinecap="round">
          <path d={`M${-w*0.56},${-w*0.20} L${-w*0.42},${w*0.62} L${w*0.42},${w*0.62} L${w*0.56},${-w*0.20}`}/>
          <ellipse cx={0} cy={-w*0.20} rx={w*0.56} ry={w*0.26}/>
        </g>
      );
    default:
      return <circle cx={0} cy={0} r={w * 0.42} fill="rgba(255,255,255,0.35)"/>;
  }
}

// ── PLANT TOKEN (floating, for non-integrated plants) ─────────────────────
const INTEGRATED_TYPES = new Set(['wisteria', 'climbing-rose', 'lavender']);

function tokenR(type) {
  return ['hydrangea','serviceberry','evergreen','evergreen-xmas','maple'].includes(type)
    ? 28 : 18;
}

// PS5-style bar fill colors
function healthBarColor(level) {
  if (level > 0.65) return '#28ff78';
  if (level > 0.45) return '#ffdd11';
  if (level > 0.2)  return '#ff8811';
  return '#ff2244';
}
function waterBarColor(level) {
  if (level > 0.55) return '#22aaff';
  if (level > 0.3)  return '#ffcc22';
  return '#ff4411';
}

function PlantToken({ plant, isSelected, isHovered, mapCondition = null, isGlowing = false, waterLevel = 1 }) {
  const { x, y } = pxy(plant.pos);
  const color = plant.color || '#909080';
  const r = tokenR(plant.type);
  const isEmpty = plant.health === 'empty';
  const sc = isSelected ? 1.14 : isHovered ? 1.07 : 1;
  const showLabel = isHovered ||
    ['hydrangea','serviceberry','maple','evergreen','evergreen-xmas'].includes(plant.type);

  // Map condition visual modifiers
  const isBlooming = mapCondition && ['budding','blooming','peak'].includes(mapCondition.bloomStatus);
  const isStressed = mapCondition?.healthSignal === 'stressed';
  const isLush = mapCondition?.leafCoverage === 'lush' && mapCondition?.healthSignal === 'excellent';
  const tokenOpacity = isEmpty ? 0.88 : isStressed ? 0.55 : 0.88;

  return (
    <g transform={`translate(${x},${y}) scale(${sc})`}
      style={{ cursor: plant.moveable ? 'grab' : 'pointer' }}>
      {isSelected && (
        <circle cx={0} cy={0} r={r + 11} fill="none"
          stroke="#d4a830" strokeWidth={2.2} strokeDasharray="5 3" opacity={0.95}/>
      )}
      {isHovered && !isSelected && (
        <circle cx={0} cy={0} r={r + 7} fill="none"
          stroke={color} strokeWidth={1.2} opacity={0.40}/>
      )}
      {/* Tended glow — brief gold ring after care action logged from mobile */}
      {isGlowing && !isEmpty && (
        <circle cx={0} cy={0} r={r + 10} fill="none"
          stroke="#d4a830" strokeWidth={3} opacity={0.55}/>
      )}
      {/* Bloom glow ring — subtle warm halo when plant is blooming */}
      {isBlooming && !isEmpty && (
        <circle cx={0} cy={0} r={r + 6} fill="none"
          stroke={color} strokeWidth={2.5} opacity={0.30}/>
      )}
      {/* Lush health glow */}
      {isLush && !isEmpty && (
        <circle cx={0} cy={0} r={r + 4} fill={color} opacity={0.12}/>
      )}
      <circle cx={2} cy={3} r={r} fill="rgba(0,0,0,0.40)"
        opacity={isEmpty ? 0.25 : 0.65}/>
      <circle cx={0} cy={0} r={r}
        fill={isEmpty ? 'rgba(38,36,34,0.65)' : color}
        fillOpacity={isEmpty ? 1 : tokenOpacity}
        stroke={isEmpty ? color : 'rgba(255,255,255,0.14)'}
        strokeWidth={isEmpty ? 1.5 : 1}/>
      <PlantIcon type={plant.type} r={r}/>
      {/* Bloom indicator dot — small colored dot at top of token */}
      {isBlooming && !isEmpty && (
        <circle cx={r * 0.55} cy={-r * 0.55} r={3} fill="#fff8e0" opacity={0.90}/>
      )}
      {showLabel && (
        <text x={0} y={r + 13} textAnchor="middle"
          fontFamily={SERIF} fontSize={9} fontStyle="italic"
          fill="rgba(240,228,200,0.90)"
          style={{ pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
          {plant.name.length > 11 ? plant.name.slice(0, 10) + '…' : plant.name}
        </text>
      )}
      {/* ── PS5-style health / water bars ── */}
      {!isEmpty && plant.health !== 'memorial' && (() => {
        const BW = 32, BH = 4, GAP = 3;
        const barY = r + (showLabel ? 22 : 8);
        const hl = HEALTH_LEVEL[plant.health] ?? 0.5;
        const hc = healthBarColor(hl);
        const wc = waterBarColor(waterLevel);
        const needsWater = plant.actions?.includes('water');
        return (
          <g style={{ pointerEvents: 'none' }}>
            {/* Health bar track + fill */}
            <rect x={-BW/2} y={barY} width={BW} height={BH} rx={BH/2} fill="rgba(0,0,0,0.65)"/>
            {hl > 0 && <rect x={-BW/2} y={barY} width={BW * hl} height={BH} rx={BH/2} fill={hc}/>}
            {/* Highlight line at top of fill for depth */}
            {hl > 0 && <rect x={-BW/2} y={barY} width={BW * hl} height={1} rx={0.5} fill="rgba(255,255,255,0.30)"/>}
            {/* Water bar — only for plants that need watering */}
            {needsWater && (
              <>
                <rect x={-BW/2} y={barY + BH + GAP} width={BW} height={BH} rx={BH/2} fill="rgba(0,0,0,0.65)"/>
                {waterLevel > 0 && <rect x={-BW/2} y={barY + BH + GAP} width={BW * waterLevel} height={BH} rx={BH/2} fill={wc}/>}
                {waterLevel > 0 && <rect x={-BW/2} y={barY + BH + GAP} width={BW * waterLevel} height={1} rx={0.5} fill="rgba(255,255,255,0.30)"/>}
              </>
            )}
          </g>
        );
      })()}
    </g>
  );
}

// ── COOKIE POSES (bird's-eye SVG fragments) ───────────────────────────────
function CookieSVG({ pose }) {
  const W = '#f5f5f5', B = '#1a1a1a', PINK = '#ffaaaa', EAR = '#ffc8c8';
  if (pose === 0) return ( // sitting upright
    <>
      <ellipse cx={0} cy={9} rx={12} ry={4} fill="rgba(0,0,0,0.18)"/>
      <ellipse cx={0} cy={2} rx={10} ry={8} fill={W}/>
      <ellipse cx={1} cy={0} rx={7} ry={6} fill={B} opacity={0.82}/>
      <circle cx={0} cy={-8} r={7} fill={W}/>
      <ellipse cx={0} cy={-12} rx={5.5} ry={4} fill={B} opacity={0.88}/>
      <polygon points="-6,-14 -5,-21 -1,-14" fill={W}/>
      <polygon points="1,-14 5,-21 6,-14" fill={W}/>
      <polygon points="-5,-15 -4,-19 -2,-15" fill={EAR} opacity={0.65}/>
      <polygon points="2,-15 4,-19 5,-15" fill={EAR} opacity={0.65}/>
      <ellipse cx={-2.5} cy={-8} rx={2} ry={1.7} fill="#33aa33"/>
      <circle cx={-2.5} cy={-8} r={1.1} fill={B}/>
      <circle cx={-2.0} cy={-8.5} r={0.35} fill="rgba(255,255,255,0.75)"/>
      <ellipse cx={2.5} cy={-8} rx={2} ry={1.7} fill="#33aa33"/>
      <circle cx={2.5} cy={-8} r={1.1} fill={B}/>
      <circle cx={3.0} cy={-8.5} r={0.35} fill="rgba(255,255,255,0.75)"/>
      <ellipse cx={0} cy={-5.5} rx={1.4} ry={1} fill={PINK}/>
      <path d="M10,4 C14,6 14,11 8,11" fill="none" stroke={W} strokeWidth={2.8} strokeLinecap="round"/>
    </>
  );
  if (pose === 1) return ( // loaf — wide, compact, head peeking right
    <>
      <ellipse cx={0} cy={8} rx={14} ry={5} fill="rgba(0,0,0,0.18)"/>
      <ellipse cx={0} cy={0} rx={13} ry={7} fill={W}/>
      <ellipse cx={1} cy={-1} rx={9} ry={5} fill={B} opacity={0.85}/>
      <circle cx={11} cy={-1} r={5.5} fill={W}/>
      <ellipse cx={12} cy={-4} rx={4} ry={3} fill={B} opacity={0.85}/>
      <polygon points="8,-5 10,-11 14,-5" fill={W}/>
      <polygon points="9,-5.5 10.5,-9.5 13,-5.5" fill={EAR} opacity={0.6}/>
      <ellipse cx={12} cy={0} rx={2} ry={1.7} fill="#33aa33"/>
      <circle cx={12} cy={0} r={1.1} fill={B}/>
      <circle cx={12.5} cy={-0.5} r={0.35} fill="rgba(255,255,255,0.75)"/>
      <ellipse cx={14} cy={1.5} rx={1.2} ry={0.9} fill={PINK}/>
      <ellipse cx={-5} cy={5.5} rx={4} ry={2.5} fill="rgba(245,245,245,0.8)"/>
      <ellipse cx={3} cy={6.5} rx={4} ry={2.5} fill="rgba(245,245,245,0.8)"/>
    </>
  );
  if (pose === 2) return ( // sprawled — stretched diagonally, legs out
    <g transform="rotate(-18)">
      <ellipse cx={0} cy={8} rx={17} ry={5} fill="rgba(0,0,0,0.18)"/>
      <ellipse cx={0} cy={0} rx={16} ry={7} fill={W}/>
      <ellipse cx={2} cy={-2} rx={11} ry={5} fill={B} opacity={0.85}/>
      <circle cx={-14} cy={1} r={6} fill={W}/>
      <ellipse cx={-14} cy={-2} rx={4.5} ry={3.5} fill={B} opacity={0.85}/>
      <polygon points="-18,-3 -17,-10 -13,-3" fill={W}/>
      <polygon points="-13,-3 -11,-9 -9,-3" fill={W}/>
      <polygon points="-17,-4 -16,-8 -14,-4" fill={EAR} opacity={0.6}/>
      <polygon points="-12,-4 -11,-7.5 -10,-4" fill={EAR} opacity={0.6}/>
      <ellipse cx={-15} cy={2} rx={2} ry={1.7} fill="#33aa33"/>
      <circle cx={-15} cy={2} r={1.1} fill={B}/>
      <ellipse cx={-10} cy={2} rx={2} ry={1.7} fill="#33aa33"/>
      <circle cx={-10} cy={2} r={1.1} fill={B}/>
      <ellipse cx={-12.5} cy={4} rx={1.4} ry={1} fill={PINK}/>
      <ellipse cx={11} cy={5} rx={5} ry={2.5} fill="rgba(245,245,245,0.85)"/>
      <ellipse cx={9} cy={-5} rx={3.5} ry={2} fill="rgba(245,245,245,0.85)"/>
      <path d="M16,3 C22,2 24,-5 19,-9" fill="none" stroke={B} strokeWidth={2.5} strokeLinecap="round"/>
    </g>
  );
  return ( // pose 3: curled sleeping — tight donut
    <>
      <ellipse cx={0} cy={8} rx={13} ry={5} fill="rgba(0,0,0,0.18)"/>
      <ellipse cx={0} cy={0} rx={11} ry={9} fill={W}/>
      <ellipse cx={1} cy={-2} rx={8} ry={6.5} fill={B} opacity={0.88}/>
      <ellipse cx={-1} cy={2} rx={5.5} ry={4.5} fill={W}/>
      <circle cx={3} cy={5} r={4.5} fill={W}/>
      <ellipse cx={4} cy={3} rx={3.5} ry={2.5} fill={B} opacity={0.85}/>
      <path d="M1,5.5 C2,4.5 3.5,4.5 4.5,5.5" fill="none" stroke={B} strokeWidth={0.9} strokeLinecap="round"/>
      <ellipse cx={3} cy={7} rx={1.2} ry={0.9} fill={PINK}/>
      <path d="M11,3 C15,-1 13,-9 5,-11 C-1,-13 -9,-8 -11,-2"
        fill="none" stroke={B} strokeWidth={2.8} strokeLinecap="round"/>
    </>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export function TerraceMap({ plants, selectedId, onSelect, onMove, onDescend, onHover, onAction, onPetCookie, seasonOpen, portraits = {}, careLog = {}, warmth = 0, weather = null, briefings = {}, mapConditions = {}, glowPlantId = null }) {
  const [hovId, setHovId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [cookiePetted, setCookiePetted] = useState(false);
  const [portraitCarouselIdx, setPortraitCarouselIdx] = useState(0);
  const [actionFlash, setActionFlash] = useState(null); // {x, y, key}
  const leaveTimerRef = useRef(null);
  const cookieRef = useRef(null);
  if (!cookieRef.current) {
    cookieRef.current = {
      pose: Math.floor(Math.random() * 4),
      yFrac: 0.15 + Math.random() * 0.60,
      xOff: 38 + Math.floor(Math.random() * 22),
    };
  }

  useEffect(() => {
    const p = hovId ? plants.find(pl => pl.id === hovId) : null;
    onHover?.(p ?? null);
  }, [hovId, plants, onHover]);

  useEffect(() => { setPortraitCarouselIdx(0); }, [pinnedId]);


  const [dragId, setDragId] = useState(null);
  const [doorHover, setDoorHover] = useState(false);
  const svgRef = useRef(null);
  const didDragRef = useRef(false);

  const svgPt = useCallback((e) => {
    const svg = svgRef.current; if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.touches ? e.touches[0].clientX : e.clientX;
    pt.y = e.touches ? e.touches[0].clientY : e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const hitTest = useCallback((pt) => {
    if (!pt) return null;
    const wall3 = plants
      .filter(p => p.wall === 3 && p.health !== 'memorial')
      .sort((a, b) => a.pos.x - b.pos.x);
    const roses  = wall3.filter(p => p.type === 'climbing-rose');
    const lavs   = wall3.filter(p => p.type === 'lavender');
    const leftPlanterPlants  = [roses[0], lavs[0]].filter(Boolean);
    const rightPlanterPlants = [roses[1], lavs[1]].filter(Boolean);
    const LAV_LO = 0.35, LAV_HI = 0.65;
    const hitY = pt.y >= DT - BH && pt.y <= DT + W3_PLANTER_H;
    if (hitY) {
      for (const [boxX, planterPlants] of [[W3_L_BOX_X, leftPlanterPlants], [W3_R_BOX_X, rightPlanterPlants]]) {
        if (pt.x >= boxX && pt.x <= boxX + W3_PLANTER_W) {
          const frac = (pt.x - boxX) / W3_PLANTER_W;
          const wantLav = frac >= LAV_LO && frac <= LAV_HI;
          const lav  = planterPlants.find(p => p.type === 'lavender');
          const rose = planterPlants.find(p => p.type === 'climbing-rose');
          return (wantLav ? lav : rose) ?? rose ?? lav ?? null;
        }
      }
    }
    return plants
      .filter(p => p.health !== 'memorial' && p.wall !== 3)
      .find(p => {
        const { x, y } = WALL4_TYPES.has(p.type) ? pxyW4(p.pos) : pxy(p.pos);
        const r = INTEGRATED_TYPES.has(p.type) ? 32
          : WALL4_TYPES.has(p.type) ? 44
          : tokenR(p.type) + 10;
        return Math.hypot(pt.x - x, pt.y - y) <= r;
      }) ?? null;
  }, [plants]);

  const onMouseMove = useCallback((e) => {
    const pt = svgPt(e); if (!pt) return;
    if (dragId) {
      didDragRef.current = true;
      const nx = Math.max(0.04, Math.min(0.95, (pt.x - DL) / DW));
      const ny = Math.max(0.04, Math.min(0.95, (pt.y - DT) / DH));
      onMove?.(dragId, { x: nx, y: ny });
      return;
    }
    const onDoor = pt.y >= DB - 4 && pt.x >= DOOR_X - DOOR_W/2 && pt.x <= DOOR_X + DOOR_W/2;
    setDoorHover(onDoor);
    const hit = hitTest(pt);
    if (onDoor || hit) {
      if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
      setHovId(onDoor ? null : hit.id);
    } else {
      if (!leaveTimerRef.current) {
        leaveTimerRef.current = setTimeout(() => { setHovId(null); leaveTimerRef.current = null; }, 200);
      }
    }
  }, [dragId, svgPt, hitTest, onMove]);

  const onMouseDown = useCallback((e) => {
    didDragRef.current = false;
    const pt = svgPt(e); if (!pt) return;
    const hit = hitTest(pt); if (!hit) return;
    if (hit.moveable) setDragId(hit.id);
  }, [svgPt, hitTest]);

  const onClick = useCallback((e) => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    const pt = svgPt(e); if (!pt) return;
    if (pt.y >= DB - 4 && pt.x >= DOOR_X - DOOR_W/2 && pt.x <= DOOR_X + DOOR_W/2) {
      onDescend?.(); return;
    }
    const hit = hitTest(pt);
    if (hit && hit.type !== 'empty-pot') {
      setPinnedId(prev => prev === hit.id ? null : hit.id);
    } else {
      setPinnedId(null);
    }
    onSelect?.(hit ?? null);
  }, [svgPt, hitTest, onSelect, onDescend]);

  const onMouseUp = useCallback(() => setDragId(null), []);

  const wisteria   = plants.filter(p => p.type === 'wisteria');
  const wall3      = plants.filter(p => ['climbing-rose','lavender'].includes(p.type));
  const tokens     = plants.filter(p => !INTEGRATED_TYPES.has(p.type) && !WALL4_TYPES.has(p.type) && p.health !== 'memorial');
  const memorials  = plants.filter(p => p.health === 'memorial');

  // Pre-compute water levels for all token plants (avoids re-computing inside render)
  const waterLevels = useMemo(() => {
    const map = {};
    for (const p of tokens) map[p.id] = computeWaterLevel(p, careLog, briefings[p.id] || null);
    return map;
  }, [tokens, careLog, briefings]);

  // Garden-wide aggregate metrics for the HUD
  const { gardenHealth, gardenWater } = useMemo(() => {
    const active = tokens.filter(p => p.health !== 'empty' && p.health !== 'resting');
    if (!active.length) return { gardenHealth: 1, gardenWater: 1 };
    const avgHealth = active.reduce((s, p) => s + (HEALTH_LEVEL[p.health] ?? 0.5), 0) / active.length;
    const waterPlants = active.filter(p => p.actions?.includes('water'));
    const avgWater = waterPlants.length
      ? waterPlants.reduce((s, p) => s + (waterLevels[p.id] ?? 1), 0) / waterPlants.length
      : 1;
    return { gardenHealth: avgHealth, gardenWater: avgWater };
  }, [tokens, waterLevels]);

  const brickRows = Math.ceil(BH / 10);

  const hovPlant = hovId ? plants.find(p => p.id === hovId) : null;
  const svgCursor = dragId ? 'grabbing' : doorHover ? 'pointer' : hovPlant ? (hovPlant.moveable ? 'grab' : 'pointer') : 'default';

  // ── Couch dimensions ──────────────────────────────────────────────────
  const wyTop = DT + 0.11 * DH;
  const couchX = DL + 3;
  const couchMainTop = wyTop + 18;
  const couchMainLen = Math.round(SCALE * 11.0);  // 440px ~11ft N-S (dominant arm)
  const couchMainBot = couchMainTop + couchMainLen;
  const couchW = Math.round(SCALE * 5.25);          // 210px depth E-W (50% thicker)
  const couchRetW = Math.round(SCALE * 4.5);        // 180px return section E-W (shorter)
  const couchRetH = Math.round(SCALE * 5.25);       // 210px return section N-S (thicker, matches couchW)
  const couchRetTop = couchMainBot - couchRetH;

  // ── Fire pit dimensions ───────────────────────────────────────────────
  // Anchored near top of couch, in the L's open interior
  const fpW = Math.round(SCALE * 3.5);   // 140px ≈ 3.5ft wide
  const fpH = Math.round(SCALE * 4.0);   // 160px ≈ 4ft deep (taller vertically)
  const fpCX = couchX + couchW + Math.round(SCALE * 3);  // 3ft clear of main section
  const fpCY = couchMainTop + Math.round(fpH / 2) + 15;  // near top of couch + small pad

  // Lava rocks — scaled for larger fire pit (~1.5× dx/dy, ~1.3× rx/ry)
  const lavaRocks = [
    {dx:-39,dy:-42,rx:12,ry:7, rot:18, c:'#6a5030'},
    {dx: 15,dy:-45,rx:9, ry:5, rot:-22,c:'#7a6040'},
    {dx: 39,dy:-33,rx:10,ry:7, rot:32, c:'#5e4828'},
    {dx:-42,dy:-12,rx:8, ry:5, rot: 8, c:'#7a5838'},
    {dx: 41,dy: -8,rx:9, ry:5, rot:-18,c:'#6a5030'},
    {dx:-36,dy: 15,rx:10,ry:7, rot:14, c:'#725438'},
    {dx: 32,dy: 20,rx:9, ry:5, rot:-12,c:'#5e4828'},
    {dx:-41,dy: 41,rx:12,ry:7, rot:24, c:'#7a5838'},
    {dx:  9,dy: 45,rx:9, ry:5, rot: -4,c:'#685030'},
    {dx: 36,dy: 38,rx:10,ry:7, rot:28, c:'#6a5030'},
    {dx:-21,dy:-30,rx:8, ry:5, rot:-28,c:'#725438'},
    {dx: 24,dy:-30,rx:8, ry:5, rot:18, c:'#7a5838'},
    {dx:-24,dy: 29,rx:8, ry:5, rot:13, c:'#5e4828'},
    {dx:  0,dy:-48,rx:9, ry:5, rot: 5, c:'#6a5030'},
    {dx:-48,dy:  0,rx:7, ry:5, rot:20, c:'#7a6040'},
  ];

  return (
    <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none', cursor: svgCursor }}
      onMouseMove={onMouseMove} onMouseDown={onMouseDown} onClick={onClick}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      <defs>
        {/* Flame animation */}
        <style>{`
          @keyframes fp-flicker {
            0%,100%{opacity:.72;transform:scaleY(1) scaleX(1)}
            35%{opacity:.92;transform:scaleY(1.12) scaleX(0.94)}
            65%{opacity:.65;transform:scaleY(0.93) scaleX(1.06)}
          }
          @keyframes fp-ember {
            0%,100%{opacity:.50} 50%{opacity:.80}
          }
          .fp-flame{animation:fp-flicker 2.3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 90%}
          .fp-ember{animation:fp-ember 3.1s ease-in-out infinite}
          @keyframes fpPulse {
            0%, 100% { opacity: 0.70; }
            50%       { opacity: 1.0; }
          }
          @keyframes cookiePet {
            0%   { opacity: 0.92; transform: translateY(0px); }
            60%  { opacity: 0.70; transform: translateY(-12px); }
            100% { opacity: 0;    transform: translateY(-22px); }
          }
        `}</style>

        {/* Glow filter for PS5-style health bars */}
        <filter id="barGlow" x="-30%" y="-80%" width="160%" height="360%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>

        {/* Warm basketweave deck pattern — 80×80 unit, 4 quadrants */}
        <pattern id="bwDeck" x={DL} y={DT} width={80} height={80} patternUnits="userSpaceOnUse">
          {/* Base */}
          <rect x={0} y={0} width={80} height={80} fill="#6a4a28"/>
          {/* Top-left: 2 horizontal planks */}
          <rect x={0.5} y={0.5} width={38.5} height={18.8} fill="#7c5c38" rx={1}/>
          <rect x={0.5} y={20.2} width={38.5} height={18.8} fill="#896448" rx={1}/>
          {/* Top-right: 2 vertical planks */}
          <rect x={41} y={0.5} width={18.8} height={38.5} fill="#896448" rx={1}/>
          <rect x={60.7} y={0.5} width={18.8} height={38.5} fill="#7c5c38" rx={1}/>
          {/* Bottom-left: 2 vertical planks */}
          <rect x={0.5} y={41} width={18.8} height={38.5} fill="#7c5c38" rx={1}/>
          <rect x={20.2} y={41} width={18.8} height={38.5} fill="#896448" rx={1}/>
          {/* Bottom-right: 2 horizontal planks */}
          <rect x={41} y={41} width={38.5} height={18.8} fill="#896448" rx={1}/>
          <rect x={41} y={60.7} width={38.5} height={18.8} fill="#7c5c38" rx={1}/>
        </pattern>

        {/* Deck clip path (hexagonal parapet protrusion) */}
        <clipPath id="deckClip">
          <polygon points={`${DL},${DT} ${DR},${DT} ${DR},${ANNEX_TOP} ${DR_EXT},${ANNEX_MID1} ${DR_EXT},${ANNEX_MID2} ${DR},${DB} ${DL},${DB}`}/>
        </clipPath>

        {/* Ember glow */}
        <radialGradient id="ember" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6820" stopOpacity={0.45}/>
          <stop offset="100%" stopColor="#ff4400" stopOpacity={0}/>
        </radialGradient>

        {/* Cookie glow */}
        <radialGradient id="cookieglow" cx="40%" cy="55%" r="55%">
          <stop offset="0%" stopColor="rgba(255,245,190,0.22)"/>
          <stop offset="100%" stopColor="rgba(255,245,190,0)"/>
        </radialGradient>

        {/* Vignette */}
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="rgba(0,0,0,0)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)"/>
        </radialGradient>
        <radialGradient id="fpCeremonyGlow">
          <stop offset="0%" stopColor="#f0a030" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#f0a030" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* ══ ALL VISUAL CONTENT — no pointer events ══ */}
      <g style={{ pointerEvents: 'none' }}>

      {/* ── Wall 3: neighbor building back strip (full width) ── */}
      <rect x={0} y={0} width={DR} height={BH} fill="#ceca92"/>
      {Array.from({ length: brickRows }, (_, row) => (
        <g key={`br${row}`}>
          <line x1={0} y1={row * 10} x2={DR} y2={row * 10}
            stroke="rgba(148,138,72,0.20)" strokeWidth={0.7}/>
          {Array.from({ length: Math.ceil(DR / 30) + 1 }, (_, col) => {
            const bx = (row % 2 === 0 ? 0 : 15) + col * 30;
            return bx < DR
              ? <line key={col} x1={bx} y1={row*10} x2={bx} y2={row*10+10}
                  stroke="rgba(148,138,72,0.11)" strokeWidth={0.5}/>
              : null;
          })}
        </g>
      ))}


      {/* ── Deck floor: hexagonal parapet protrusion on lower-right ── */}
      <polygon
        points={`${DL},${DT} ${DR},${DT} ${DR},${ANNEX_TOP} ${DR_EXT},${ANNEX_MID1} ${DR_EXT},${ANNEX_MID2} ${DR},${DB} ${DL},${DB}`}
        fill="url(#bwDeck)"/>
      {/* Subtle tile joint grid lines */}
      <g clipPath="url(#deckClip)" opacity={0.18}>
        {Array.from({ length: Math.ceil((DR_EXT - DL) / 80) + 1 }, (_, i) => (
          <line key={`gv${i}`} x1={DL + i*80} y1={DT} x2={DL + i*80} y2={DB}
            stroke="#3a2810" strokeWidth={0.8}/>
        ))}
        {Array.from({ length: Math.ceil(DH / 80) + 1 }, (_, i) => (
          <line key={`gh${i}`} x1={DL} y1={DT + i*80} x2={DR_EXT} y2={DT + i*80}
            stroke="#3a2810" strokeWidth={0.8}/>
        ))}
      </g>

      {/* ── Sunbeam ── */}
      <polygon
        points={`${VW*0.26},${DB} ${VW*0.74},${DB} ${VW*0.80},${DT} ${VW*0.20},${DT}`}
        fill="rgba(255,248,208,0.045)"/>

      {/* ── Wall 3 rose trellises + cedar planters ── */}
      <WallThreePlanters plants={wall3} selectedId={selectedId} hoveredId={hovId}/>

      {/* ── Jute rug (drawn here so wisteria barrels sit on top of it) ── */}
      {(() => {
        const rw = SCALE * 13, rh = SCALE * 12;
        const rx = DL + 2, ry = DT + W3_PLANTER_H + 24;
        return (
          <g>
            <rect x={rx} y={ry} width={rw} height={rh}
              fill="rgba(185,162,108,0.72)" rx={3}/>
            <rect x={rx+4} y={ry+4} width={rw-8} height={rh-8}
              fill="none" stroke="rgba(140,110,55,0.55)" strokeWidth={1.5} rx={2}/>
            {Array.from({ length: Math.floor(rh/8) }, (_, i) => (
              <line key={i} x1={rx+5} y1={ry+9+i*8} x2={rx+rw-5} y2={ry+9+i*8}
                stroke="rgba(140,110,55,0.18)" strokeWidth={0.6}/>
            ))}
          </g>
        );
      })()}

      {/* ── Wisteria fence (THE focal piece) ── */}
      <WisteriaFence wisteriaPlants={wisteria}
        selectedId={selectedId} hoveredId={hovId}/>

      {/* ── Metal railing: right side, hexagonal parapet protrusion ── */}
      <g>
        {/* Upper straight: DT → ANNEX_TOP at x=DR */}
        <rect x={DR} y={DT} width={5} height={ANNEX_TOP - DT} fill="#363c36"/>
        {Array.from({ length: Math.ceil((ANNEX_TOP - DT) / 13) }, (_, i) => (
          <rect key={`ru${i}`} x={DR - 4} y={DT + 6 + i*13} width={5} height={9} fill="#48504a"/>
        ))}
        {/* First diagonal: (DR,ANNEX_TOP) → (DR_EXT,ANNEX_MID1) */}
        <line x1={DR} y1={ANNEX_TOP} x2={DR_EXT} y2={ANNEX_MID1}
          stroke="#363c36" strokeWidth={5} strokeLinecap="square"/>
        {/* Outer flat face: ANNEX_MID1 → ANNEX_MID2 at x=DR_EXT */}
        <rect x={DR_EXT} y={ANNEX_MID1} width={5} height={ANNEX_MID2 - ANNEX_MID1} fill="#363c36"/>
        {Array.from({ length: Math.ceil((ANNEX_MID2 - ANNEX_MID1) / 13) }, (_, i) => (
          <rect key={`rf${i}`} x={DR_EXT - 4} y={ANNEX_MID1 + 6 + i*13} width={5} height={9} fill="#48504a"/>
        ))}
        {/* Second diagonal: (DR_EXT,ANNEX_MID2) → (DR,DB) — ends at bottom-right corner */}
        <line x1={DR_EXT} y1={ANNEX_MID2} x2={DR} y2={DB}
          stroke="#363c36" strokeWidth={5} strokeLinecap="square"/>
      </g>

      {/* ── Wall 1: yellow painted brick + door + HVAC ── */}
      {Array.from({ length: Math.ceil(DW / 26) }, (_, i) => (
        <rect key={`wb${i}`} x={DL + i*26} y={DB} width={25} height={W1H}
          fill={i % 2 === 0 ? '#d0cc8e' : '#cac88a'}/>
      ))}
      {Array.from({ length: Math.ceil(DW / 26) }, (_, i) => (
        <line key={`ws${i}`} x1={DL + i*26} y1={DB} x2={DL + i*26} y2={VH}
          stroke="rgba(148,140,78,0.18)" strokeWidth={0.5}/>
      ))}
      {/* Sliding glass door */}
      {(() => {
        const sdX = DOOR_X, sdW = DOOR_W;
        return (
          <g>
            <rect x={sdX - sdW/2} y={DB - 3} width={sdW} height={W1H + 3} fill="#181c1a"/>
            <rect x={sdX - sdW/2} y={DB-3} width={sdW/2} height={W1H+3}
              fill="none" stroke="#101412" strokeWidth={1.5}/>
            <rect x={sdX} y={DB-3} width={sdW/2} height={W1H+3}
              fill="none" stroke="#101412" strokeWidth={1.5}/>
            <rect x={sdX - sdW/2 + 3} y={DB} width={sdW/2 - 5} height={W1H - 2}
              fill="rgba(148,182,205,0.20)"/>
            <rect x={sdX + 3} y={DB} width={sdW/2 - 6} height={W1H - 2}
              fill="rgba(148,182,205,0.20)"/>
          </g>
        );
      })()}
      {/* Door hover: glow + wayfinding label */}
      {doorHover && (
        <g>
          <rect x={DOOR_X - DOOR_W/2 - 2} y={DB - 5} width={DOOR_W + 4} height={W1H + 5}
            fill="rgba(160,210,255,0.07)" stroke="rgba(148,192,215,0.55)" strokeWidth={1} rx={1}/>
          <text x={DOOR_X} y={DB - 14} textAnchor="middle"
            fill="rgba(180,220,255,0.72)" fontSize={9} fontFamily={SERIF} fontStyle="italic">
            Emma's Garden ↓
          </text>
        </g>
      )}
      {/* HVAC */}
      {(() => {
        const hvX = VW * 0.81, hvY = DB + 3;
        return (
          <g>
            <rect x={hvX} y={hvY} width={28} height={12} fill="#e2e0d8"
              stroke="#bab8b0" strokeWidth={0.7}/>
            {[0,1,2,3].map(li => (
              <line key={li} x1={hvX+3} y1={hvY+3+li*2.5} x2={hvX+25} y2={hvY+3+li*2.5}
                stroke="#bab8b0" strokeWidth={0.6}/>
            ))}
          </g>
        );
      })()}

      {/* ── Memorial window box outlines (sill-l, sill-r) ── */}
      {memorials.map(p => {
        const { x, y } = pxy(p.pos);
        return (
          <rect key={`mem${p.id}`}
            x={x - 20} y={y - 6} width={40} height={11}
            fill="rgba(130,100,80,0.10)"
            stroke="rgba(130,100,80,0.32)" strokeWidth={1}
            strokeDasharray="3 2" rx={2}/>
        );
      })}


      {/* ── L-shaped sectional couch ── */}
      {(() => {
        const TEAK = '#9a7848';
        const TEAKD = '#7a5c30';
        const CUSHION = '#e8e2d0';
        const SEAM = 'rgba(140,110,60,0.15)';
        const SHADOW = 'rgba(0,0,0,0.22)';

        // Shadow (L-shape)
        const pts = [
          couchX+3, couchMainTop+3,
          couchX+couchW+3, couchMainTop+3,
          couchX+couchW+3, couchRetTop+3,
          couchX+couchW+couchRetW+3, couchRetTop+3,
          couchX+couchW+couchRetW+3, couchMainBot+3,
          couchX+3, couchMainBot+3,
        ];
        return (
          <g>
            {/* Shadow */}
            <polygon points={pts.join(',')} fill={SHADOW}/>

            {/* ── Main section (N-S along fence) ── */}
            {/* Back frame against fence */}
            <rect x={couchX} y={couchMainTop} width={12} height={couchMainLen}
              fill={TEAK} rx={3}/>
            {/* Top armrest */}
            <rect x={couchX} y={couchMainTop - 10} width={couchW} height={10}
              fill={TEAKD} rx={3}/>
            {/* Cushion area */}
            <rect x={couchX + 12} y={couchMainTop} width={couchW - 12} height={couchMainLen}
              fill={CUSHION} rx={3}/>
            {/* 3 cushion seams */}
            {[1/3, 2/3].map((f, i) => (
              <line key={i}
                x1={couchX + 14} y1={couchMainTop + couchMainLen * f}
                x2={couchX + couchW - 2} y2={couchMainTop + couchMainLen * f}
                stroke={SEAM} strokeWidth={1.4}/>
            ))}
            {/* Cushion highlight */}
            <rect x={couchX + 14} y={couchMainTop + 4}
              width={couchW - 18} height={couchMainLen - 8}
              fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.7} rx={2}/>
            {/* Back cushions — raised strip along fence side */}
            <rect x={couchX + 12} y={couchMainTop + 2} width={22} height={couchMainLen - 4}
              fill="#f6f3ec" rx={2}/>
            {[0.33, 0.66].map((f, i) => (
              <line key={`bcm${i}`}
                x1={couchX + 13} y1={couchMainTop + couchMainLen * f}
                x2={couchX + 33} y2={couchMainTop + couchMainLen * f}
                stroke="rgba(140,110,60,0.22)" strokeWidth={1.2}/>
            ))}

            {/* ── Return section (E-W from south end of main) ── */}
            {/* Back frame at south edge */}
            <rect x={couchX + couchW} y={couchMainBot - 12} width={couchRetW} height={12}
              fill={TEAKD} rx={2}/>
            {/* East armrest */}
            <rect x={couchX + couchW + couchRetW} y={couchRetTop} width={10} height={couchRetH}
              fill={TEAKD} rx={3}/>
            {/* Return cushion */}
            <rect x={couchX + couchW} y={couchRetTop} width={couchRetW} height={couchRetH - 12}
              fill={CUSHION} rx={3}/>
            {/* Cushion highlight */}
            <rect x={couchX + couchW + 3} y={couchRetTop + 3}
              width={couchRetW - 6} height={couchRetH - 18}
              fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={0.7} rx={2}/>

            {/* Corner fill (shared L joint) */}
            <rect x={couchX} y={couchRetTop} width={couchW} height={couchRetH}
              fill={CUSHION}/>
            {/* Corner back frame (vertical) */}
            <rect x={couchX} y={couchRetTop} width={12} height={couchRetH}
              fill={TEAK}/>
            {/* Corner back frame (horizontal, south edge) */}
            <rect x={couchX} y={couchMainBot - 12} width={couchW} height={12}
              fill={TEAKD}/>
            {/* Back cushion — west wall of corner joint, continues main cushion downward */}
            <rect x={couchX + 12} y={couchRetTop + 2} width={22} height={couchRetH - 4}
              fill="#f6f3ec" rx={2}/>
            {[0.33, 0.66].map((f, i) => (
              <line key={`bcr${i}`}
                x1={couchX + 13} y1={couchRetTop + (couchRetH - 4) * f}
                x2={couchX + 33} y2={couchRetTop + (couchRetH - 4) * f}
                stroke="rgba(140,110,60,0.22)" strokeWidth={1.2}/>
            ))}
          </g>
        );
      })()}

      {/* ── Fire pit: graphite rectangle with lava rocks ── */}
      {(() => {
        return (
          <g>
            {/* Shadow */}
            <rect x={fpCX - fpW/2 + 4} y={fpCY - fpH/2 + 4} width={fpW} height={fpH}
              fill="rgba(0,0,0,0.30)" rx={7}/>
            {/* Outer graphite frame */}
            <rect x={fpCX - fpW/2} y={fpCY - fpH/2} width={fpW} height={fpH}
              fill="#252422" stroke="#3e3c38" strokeWidth={3} rx={6}/>
            {/* Inner lava bed */}
            <rect x={fpCX - fpW/2 + 5} y={fpCY - fpH/2 + 5} width={fpW - 10} height={fpH - 10}
              fill="#1a1612" rx={4}/>
            {/* Lava rocks */}
            {lavaRocks.map(({dx, dy, rx, ry, rot, c}, i) => (
              <ellipse key={i}
                cx={fpCX + dx} cy={fpCY + dy}
                rx={rx} ry={ry}
                fill={c} opacity={0.88}
                transform={`rotate(${rot}, ${fpCX + dx}, ${fpCY + dy})`}/>
            ))}
            {/* Ember glow */}
            <ellipse cx={fpCX} cy={fpCY} rx={fpW * 0.38} ry={fpH * 0.20}
              fill="url(#ember)" className="fp-ember"/>
            {/* Flame */}
            <g className="fp-flame">
              <ellipse cx={fpCX} cy={fpCY - fpH * 0.14} rx={20} ry={30}
                fill="rgba(255,130,15,0.42)"/>
              <ellipse cx={fpCX - 6} cy={fpCY - fpH * 0.20} rx={13} ry={20}
                fill="rgba(255,190,30,0.50)"/>
              <ellipse cx={fpCX + 5} cy={fpCY - fpH * 0.18} rx={9} ry={15}
                fill="rgba(255,230,60,0.55)"/>
              <ellipse cx={fpCX} cy={fpCY - fpH * 0.26} rx={6} ry={9}
                fill="rgba(255,248,120,0.58)"/>
            </g>
          </g>
        );
      })()}

      {warmth >= 1000 && (
        <g style={{pointerEvents:'none'}}>
          <ellipse cx={fpCX} cy={fpCY} rx={55} ry={40}
            fill="url(#fpCeremonyGlow)" style={{animation:'fpPulse 2.4s ease-in-out infinite'}}/>
        </g>
      )}

      {/* ── Grill: compact rectangular gas grill, against Wall 2 ── */}
      {(() => {
        const gH = Math.round(SCALE * 4.375);
        const gW = Math.round(SCALE * 2.625);
        const gX = DL + 4;
        const gY = DB - gH - 10;
        return (
          <g>
            <rect x={gX+3} y={gY+3} width={gW} height={gH} fill="rgba(0,0,0,0.35)" rx={3}/>
            <rect x={gX} y={gY} width={gW} height={gH} fill="#2a2a2a" rx={3}/>
            <rect x={gX+3} y={gY+3} width={gW-6} height={gH-6} fill="#202020" rx={2}/>
            {[0,1,2,3,4].map(i => (
              <line key={i}
                x1={gX+6} y1={gY+10+i*((gH-20)/4)}
                x2={gX+gW-6} y2={gY+10+i*((gH-20)/4)}
                stroke="#3a3a3a" strokeWidth={1.2}/>
            ))}
            {[0.28, 0.50, 0.72].map((f, i) => (
              <circle key={i} cx={gX+gW-4} cy={gY + gH*f} r={3} fill="#444"/>
            ))}
          </g>
        );
      })()}

      {/* ── Dining table: 3 ft × 5 ft with 4 chairs, bottom-right jut ── */}
      {(() => {
        const tCX = DL + DW * 0.72;
        const tCY = DT + DH * 0.84;
        const tHW = SCALE * 2.5;
        const tHD = SCALE * 1.5;
        const ch  = SCALE * 1.25;
        const gap = 8;
        const chairs = [
          [tCX - tHW*0.45, tCY - tHD - ch - gap],
          [tCX + tHW*0.45, tCY - tHD - ch - gap],
          [tCX - tHW*0.45, tCY + tHD + gap],
          [tCX + tHW*0.45, tCY + tHD + gap],
        ];
        return (
          <g>
            {chairs.map(([cx, cy], i) => (
              <rect key={i} x={cx-ch/2} y={cy} width={ch} height={ch}
                fill="#9a8060" rx={4}/>
            ))}
            <rect x={tCX-tHW} y={tCY-tHD} width={tHW*2} height={tHD*2}
              fill="#b4a87e" rx={5}/>
            <rect x={tCX-tHW+3} y={tCY-tHD+3} width={tHW*2-6} height={tHD*2-6}
              fill="none" stroke="rgba(95,80,50,0.45)" strokeWidth={0.9} rx={4}/>
            {[-tHD*0.2, tHD*0.2].map((dy, i) => (
              <line key={i} x1={tCX-tHW+4} y1={tCY+dy} x2={tCX+tHW-4} y2={tCY+dy}
                stroke="rgba(95,80,50,0.12)" strokeWidth={0.8}/>
            ))}
          </g>
        );
      })()}

      {/* ── Wall 4: hydrangeas, serviceberry, maple, evergreens ── */}
      <WallFourPlants plants={plants} selectedId={selectedId} hoveredId={hovId}/>

      {/* ── Plant tokens (non-integrated plants) ── */}
      {tokens.map(p => (
        <PlantToken
          key={p.id}
          plant={p}
          isSelected={p.id === selectedId}
          isHovered={p.id === hovId}
          mapCondition={mapConditions[p.id] || null}
          isGlowing={p.id === glowPlantId}
          waterLevel={waterLevels[p.id] ?? 1}/>
      ))}

      {/* ── Vignette (depth) ── */}
      <rect x={0} y={0} width={VW} height={VH} fill="url(#vignette)" clipPath="url(#deckClip)"/>

      {/* ── Garden HUD — global health + water meters ── */}
      {(() => {
        const HX = VW - 148, HY = 6, HW = 140, barW = 90, barH = 4.5, mono = '"SF Mono", "Fira Mono", monospace';
        const hc = healthBarColor(gardenHealth), wc = waterBarColor(gardenWater);
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={HX - 6} y={HY - 4} width={HW} height={46} rx={4} fill="rgba(0,0,0,0.62)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.8}/>
            {/* Health row */}
            <text x={HX} y={HY + 8} fontFamily={mono} fontSize={7} fill="rgba(200,240,200,0.75)" letterSpacing="0.08em">GARDEN HEALTH</text>
            <rect x={HX} y={HY + 12} width={barW} height={barH} rx={barH/2} fill="rgba(255,255,255,0.10)"/>
            <rect x={HX} y={HY + 12} width={barW * gardenHealth} height={barH} rx={barH/2} fill={hc} opacity={0.9} filter="url(#barGlow)"/>
            <text x={HX + barW + 4} y={HY + 17} fontFamily={mono} fontSize={6.5} fill={hc} opacity={0.85}>{Math.round(gardenHealth * 100)}%</text>
            {/* Water row */}
            <text x={HX} y={HY + 27} fontFamily={mono} fontSize={7} fill="rgba(180,220,255,0.75)" letterSpacing="0.08em">WATER STATUS</text>
            <rect x={HX} y={HY + 31} width={barW} height={barH} rx={barH/2} fill="rgba(255,255,255,0.10)"/>
            <rect x={HX} y={HY + 31} width={barW * gardenWater} height={barH} rx={barH/2} fill={wc} opacity={0.9} filter="url(#barGlow)"/>
            <text x={HX + barW + 4} y={HY + 36} fontFamily={mono} fontSize={6.5} fill={wc} opacity={0.85}>{Math.round(gardenWater * 100)}%</text>
          </g>
        );
      })()}

      {/* ── Cookie — random pose, random spot on couch ── */}
      {(() => {
        const cx = couchX + cookieRef.current.xOff;
        const cy = couchMainTop + Math.round(couchMainLen * cookieRef.current.yFrac);
        return (
          <g transform={`translate(${cx},${cy})`}
            style={{pointerEvents:'auto', cursor:'pointer'}}
            onClick={() => {
              if (cookiePetted) return;
              setCookiePetted(true);
              onPetCookie?.();
              setTimeout(() => setCookiePetted(false), 1800);
            }}>
            <CookieSVG pose={cookieRef.current.pose}/>
            {cookiePetted && (
              <text x={0} y={-28} textAnchor="middle"
                fontFamily="'Crimson Pro', Georgia, serif" fontSize={13}
                fill="#d4a830" opacity={0.92}
                style={{animation:'cookiePet 1.8s ease-out forwards', pointerEvents:'none'}}>
                +5 ♥
              </text>
            )}
          </g>
        );
      })()}

      {/* ── Action feedback ripple ── */}
      {actionFlash && (
        <g style={{pointerEvents:'none'}}>
          <circle cx={actionFlash.x} cy={actionFlash.y} r={28} fill="none"
            stroke="#d4a830" strokeWidth={2} opacity={0.70}
            style={{animation:'terraceRipple 0.9s ease-out forwards'}}/>
          <circle cx={actionFlash.x} cy={actionFlash.y} r={14} fill="rgba(212,168,48,0.18)"
            style={{animation:'terraceRippleFill 0.9s ease-out forwards'}}/>
        </g>
      )}

      {/* ── Hover tooltip (small, non-pinned plants) ── */}
      {hovId && hovId !== pinnedId && (() => {
        const hp = plants.find(p => p.id === hovId);
        if (!hp || hp.type === 'empty-pot') return null;
        const portrait = portraits[hp.id] || {};
        const entries = careLog[hp.id] || [];
        const lastWater = [...entries].reverse().find(e => e.action === 'water' || e.action === 'rain');
        const daysSinceWater = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
        const waterUrgent = daysSinceWater === null || daysSinceWater > 3;
        const recentActions = [...entries].reverse().slice(0, 3);
        const portHistory = buildPortraitHistory(portrait);
        const hasHistory = portHistory.length > 1;
        let px, py;
        if (hp.wall === 3) {
          const roses = plants.filter(p => p.type === 'climbing-rose').sort((a,b) => a.pos.x - b.pos.x);
          const isRight = hp.type === 'climbing-rose' && roses.indexOf(hp) === 1;
          px = (isRight ? W3_R_BOX_X : W3_L_BOX_X) + W3_PLANTER_W / 2;
          py = DT + W3_PLANTER_H + 10;
        } else { const pt = pxy(hp.pos); px = pt.x; py = pt.y; }
        const boxW = 192;
        // Height estimate: base + portrait row + action tags. Overestimate slightly, never clip.
        const boxH = portHistory.length > 0 ? 155 : 100;
        let bx = px + 20, by = py - boxH - 14;
        if (bx + boxW > VW - 10) bx = px - boxW - 20;
        if (by < DT + 4) by = py + 18;
        if (by + boxH > DB - 4) by = DB - boxH - 8;
        if (bx < DL + 4) bx = DL + 6;
        const accentColor = hp.color || '#d4a830';
        return (
          <g style={{ pointerEvents: 'auto' }}
            onMouseEnter={() => { if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; } }}
            onMouseLeave={() => { leaveTimerRef.current = setTimeout(() => { setHovId(null); leaveTimerRef.current = null; }, 200); }}>
            {/* No separate shadow rect — box-shadow on the div follows actual content height */}
            <foreignObject x={bx} y={by} width={boxW} height={boxH} style={{ overflow: 'visible' }}>
              <div style={{
                width: boxW, fontFamily: '"Crimson Pro", Georgia, serif',
                background: 'rgba(12,7,3,0.97)', borderRadius: 8,
                border: `1px solid ${accentColor}38`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.70)',
              }}>
                <div style={{ height: 2, background: accentColor, opacity: 0.75 }}/>
                {/* Portrait + name header */}
                <div style={{ display: 'flex', gap: 9, padding: '9px 11px 8px', alignItems: 'flex-start' }}>
                  {portHistory.length > 0 && (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 54, height: 54, borderRadius: 5, overflow: 'hidden', border: `1px solid ${accentColor}28` }}>
                        <PlantPortrait aiSvg={portHistory[0].svg}/>
                      </div>
                      {hasHistory && (
                        <div style={{ position: 'absolute', bottom: 2, left: 2,
                          fontFamily: '"Crimson Pro", Georgia, serif',
                          fontSize: 9, color: 'rgba(240,228,200,0.52)',
                          background: 'rgba(10,6,2,0.82)', padding: '1px 4px', borderRadius: 2 }}>
                          ‹ {portHistory.length - 1}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Plant name — largest, most prominent element */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(240,228,200,0.96)', lineHeight: 1.2, marginBottom: 3 }}>
                      {hp.name}
                    </div>
                    {/* Stage — italic, accent color, clearly secondary */}
                    {portrait.currentStage && (
                      <div style={{ fontSize: 12, color: accentColor, fontStyle: 'italic', lineHeight: 1.3, opacity: 0.88 }}>
                        {portrait.currentStage}
                        {portrait.stages?.length > 1 && (() => {
                          const nextIdx = portrait.stages.indexOf(portrait.currentStage) + 1;
                          const nextStage = portrait.stages[nextIdx];
                          const days = daysToNextStage(portrait);
                          if (!nextStage) return null;
                          return (
                            <span style={{ fontSize: 10.5, color: 'rgba(240,228,200,0.36)', fontStyle: 'normal', marginLeft: 5 }}>
                              → {nextStage}{days !== null ? ` ~${days}d` : ''}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                    {/* Water status */}
                    <div style={{ fontSize: 11.5, color: waterUrgent ? '#e8905a' : 'rgba(240,228,200,0.52)', marginTop: 5 }}>
                      {lastWater?.action === 'rain' ? '🌧' : '💧'} {daysSinceWater === null ? 'No water logged' : daysSinceWater === 0 ? (lastWater?.action === 'rain' ? 'Rained today' : 'Watered today') : `${daysSinceWater}d since ${lastWater?.action === 'rain' ? 'rain' : 'water'}`}
                    </div>
                  </div>
                </div>
                {/* Recent actions — serif, readable size */}
                {recentActions.length > 0 && (
                  <div style={{ padding: '5px 11px 7px', borderTop: '1px solid rgba(160,130,80,0.10)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {recentActions.map((e, i) => {
                      const def = ACTION_DEFS[e.action];
                      return (
                        <span key={i} style={{ fontSize: 10.5, color: 'rgba(220,205,170,0.68)',
                          background: 'rgba(160,130,80,0.08)', border: '1px solid rgba(160,130,80,0.14)',
                          borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                          {def?.emoji || '·'} {def?.label || e.action}
                        </span>
                      );
                    })}
                  </div>
                )}
                {/* Footer hint */}
                <div style={{ padding: '4px 11px 5px', borderTop: '1px solid rgba(160,130,80,0.07)',
                  fontSize: 9.5, color: 'rgba(160,130,80,0.42)', textAlign: 'right', fontStyle: 'italic' }}>
                  click to pin
                </div>
              </div>
            </foreignObject>
          </g>
        );
      })()}

      {/* ── Pinned plant card (larger, Claude-informed) ── */}
      {pinnedId && (() => {
        const pp = plants.find(p => p.id === pinnedId);
        if (!pp || pp.type === 'empty-pot') return null;
        const portrait = portraits[pp.id] || {};
        const entries = careLog[pp.id] || [];
        const lastWater = [...entries].reverse().find(e => e.action === 'water' || e.action === 'rain');
        const daysSinceWater = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
        const waterUrgent = daysSinceWater === null || daysSinceWater > 3;
        const recentActions = [...entries].reverse().slice(0, 4);
        const portHistory = buildPortraitHistory(portrait);
        const briefing = externalBriefings[pinnedId];
        const isLoading = briefing === 'loading' || briefing === undefined;
        const aiTasks = (briefing && briefing !== 'loading') ? (briefing.tasks || []) : [];
        const timeline = getActionTimeline(pp, careLog, seasonOpen);
        const accentColor = pp.color || '#d4a830';
        const hc = healthColor(pp.health);
        let px, py;
        if (pp.wall === 3) {
          const roses = plants.filter(p => p.type === 'climbing-rose').sort((a,b) => a.pos.x - b.pos.x);
          const isRight = pp.type === 'climbing-rose' && roses.indexOf(pp) === 1;
          px = (isRight ? W3_R_BOX_X : W3_L_BOX_X) + W3_PLANTER_W / 2;
          py = DT + W3_PLANTER_H + 10;
        } else { const pt = pxy(pp.pos); px = pt.x; py = pt.y; }
        const cardW = 252, cardH = 460;
        let bx = px + 26, by = py - cardH / 2;
        if (bx + cardW > VW - 8) bx = px - cardW - 26;
        if (by < DT + 4) by = DT + 4;
        if (by + cardH > DB - 4) by = DB - cardH - 4;
        if (bx < DL + 4) bx = DL + 4;
        return (
          <g style={{ pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* shadow */}
            <rect x={bx+4} y={by+4} width={cardW} height={cardH} fill="rgba(0,0,0,0.38)" rx={11}/>
            <foreignObject x={bx} y={by} width={cardW} height={cardH} style={{ overflow: 'visible' }}>
              <div style={{
                width: cardW, fontFamily: '"Crimson Pro", Georgia, serif',
                background: 'rgba(10,6,2,0.97)',
                border: `1px solid ${accentColor}55`,
                borderRadius: 11, overflow: 'hidden',
                boxShadow: `0 0 0 0.5px ${accentColor}20`,
              }}>
                {/* top accent bar */}
                <div style={{ height: 3, background: accentColor, opacity: 0.85 }}/>

                {/* Portrait carousel */}
                {portHistory.length > 0 && (
                  <div style={{ position: 'relative', width: cardW, background: 'rgba(0,0,0,0.30)' }}>
                    <div style={{ width: cardW, height: 120, overflow: 'hidden' }}>
                      <PlantPortrait aiSvg={portHistory[portraitCarouselIdx]?.svg}/>
                    </div>
                    {/* Date overlay */}
                    {portHistory[portraitCarouselIdx]?.date && (
                      <div style={{ position: 'absolute', bottom: 6, left: 9,
                        fontFamily: '"Crimson Pro", Georgia, serif',
                        fontSize: 10, color: 'rgba(240,228,200,0.70)',
                        background: 'rgba(10,6,2,0.72)', padding: '2px 6px', borderRadius: 4 }}>
                        {fmtDate(portHistory[portraitCarouselIdx].date)}
                      </div>
                    )}
                    {/* Carousel nav */}
                    {portHistory.length > 1 && (
                      <div style={{ position: 'absolute', bottom: 6, right: 9, display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button onClick={e => { e.stopPropagation(); setPortraitCarouselIdx(i => Math.min(portHistory.length - 1, i + 1)); }}
                          disabled={portraitCarouselIdx >= portHistory.length - 1}
                          style={{ background: 'rgba(10,6,2,0.72)', border: '1px solid rgba(160,130,80,0.30)',
                            borderRadius: 3, color: portraitCarouselIdx >= portHistory.length - 1 ? 'rgba(160,130,80,0.25)' : 'rgba(240,228,200,0.75)',
                            cursor: portraitCarouselIdx >= portHistory.length - 1 ? 'default' : 'pointer',
                            fontSize: 11, padding: '1px 6px', lineHeight: 1.4 }}>‹</button>
                        <button onClick={e => { e.stopPropagation(); setPortraitCarouselIdx(i => Math.max(0, i - 1)); }}
                          disabled={portraitCarouselIdx === 0}
                          style={{ background: 'rgba(10,6,2,0.72)', border: '1px solid rgba(160,130,80,0.30)',
                            borderRadius: 3, color: portraitCarouselIdx === 0 ? 'rgba(160,130,80,0.25)' : 'rgba(240,228,200,0.75)',
                            cursor: portraitCarouselIdx === 0 ? 'default' : 'pointer',
                            fontSize: 11, padding: '1px 6px', lineHeight: 1.4 }}>›</button>
                      </div>
                    )}
                  </div>
                )}

                {/* header */}
                <div style={{ padding: '10px 13px 9px', borderBottom: '1px solid rgba(160,130,80,0.14)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: accentColor, letterSpacing: 0.4, lineHeight: 1.7 }}>
                        {pp.name.toUpperCase()}
                      </div>
                      {/* Current stage + next stage only */}
                      {portrait.currentStage && (
                        <div style={{ marginTop: 3 }}>
                          <span style={{ fontSize: 14, color: accentColor, fontStyle: 'italic',
                            fontFamily: '"Crimson Pro", Georgia, serif', fontWeight: 600, opacity: 0.95 }}>
                            {portrait.currentStage}
                          </span>
                          {portrait.stages?.length > 1 && (() => {
                            const nextIdx = portrait.stages.indexOf(portrait.currentStage) + 1;
                            const nextStage = portrait.stages[nextIdx];
                            const days = daysToNextStage(portrait);
                            if (!nextStage) return null;
                            return (
                              <span style={{ fontFamily: '"Crimson Pro", Georgia, serif',
                                fontSize: 11, color: 'rgba(240,228,200,0.40)', fontStyle: 'italic', marginLeft: 6 }}>
                                → {nextStage}
                                {days !== null && (
                                  <span style={{ fontSize: 10, marginLeft: 4, color: 'rgba(240,228,200,0.35)' }}>
                                    (next up ~{days}d)
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 10, padding: '2px 7px', borderRadius: 9,
                        background: hc + '22', color: hc, border: `1px solid ${hc}44`, whiteSpace: 'nowrap' }}>
                        {healthLabel(pp.health)}
                      </div>
                      {/* close button */}
                      <div onClick={e => { e.stopPropagation(); setPinnedId(null); }}
                        style={{ cursor: 'pointer', fontSize: 11, color: 'rgba(240,228,200,0.30)',
                          padding: '1px 4px', lineHeight: 1 }}>✕</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, color: waterUrgent ? '#e8905a' : 'rgba(240,228,200,0.45)' }}>
                      {lastWater?.action === 'rain' ? '🌧' : '💧'} {daysSinceWater === null ? 'No water logged' : daysSinceWater === 0 ? (lastWater?.action === 'rain' ? 'Rained today' : 'Watered today') : `${daysSinceWater}d since ${lastWater?.action === 'rain' ? 'rain' : 'water'}`}
                    </div>
                    {/* Recent action tags */}
                    {recentActions.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap' }}>
                        {recentActions.slice(0, 3).map((e, i) => {
                          const def = ACTION_DEFS[e.action];
                          return (
                            <span key={i} style={{ fontSize: 8.5, color: 'rgba(240,228,200,0.45)',
                              background: 'rgba(160,130,80,0.08)', border: '1px solid rgba(160,130,80,0.15)',
                              borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                              {def?.emoji || '·'}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Claude note */}
                <div style={{ padding: '9px 13px 9px', borderBottom: '1px solid rgba(160,130,80,0.10)', minHeight: 52 }}>
                  {isLoading ? (
                    <div style={{ fontSize: 11.5, color: 'rgba(240,228,200,0.28)', fontStyle: 'italic' }}>Reading the garden…</div>
                  ) : briefing?.note ? (
                    <div style={{ fontSize: 12.5, color: 'rgba(212,190,140,0.85)', fontStyle: 'italic', lineHeight: 1.65 }}>
                      {briefing.note}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'rgba(240,228,200,0.25)', fontStyle: 'italic' }}>No note available</div>
                  )}
                </div>

                {/* AI task recommendations with reasons + expandable instructions */}
                <div style={{ padding: '9px 13px 4px', borderBottom: '1px solid rgba(160,130,80,0.10)' }}>
                  <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5.5, color: 'rgba(212,168,48,0.65)', letterSpacing: 0.5, marginBottom: 8 }}>
                    {aiTasks.length > 0 ? 'RECOMMENDED NOW' : 'NEXT CARE'}
                  </div>

                  {aiTasks.length > 0 ? (
                    aiTasks.map((task, idx) => {
                      const def = ACTION_DEFS[task.key];
                      const emoji = def?.emoji || '🌿';
                      return (
                        <div key={idx} style={{ marginBottom: 9 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'rgba(240,228,200,0.88)', flex: 1, lineHeight: 1.4 }}>
                              {emoji} {task.label}
                            </span>
                            {task.optional ? (
                              <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5.5, color: 'rgba(160,200,120,0.7)',
                                background: 'rgba(80,120,40,0.14)', border: '1px solid rgba(80,120,40,0.30)',
                                padding: '2px 5px', borderRadius: 3, flexShrink: 0 }}>EXPLORE ✦</span>
                            ) : (
                              <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5.5, color: '#d4a830',
                                background: 'rgba(212,168,48,0.14)', border: '1px solid rgba(212,168,48,0.38)',
                                padding: '2px 5px', borderRadius: 3, flexShrink: 0 }}>NOW ★</span>
                            )}
                          </div>
                          {task.reason && (
                            <div style={{ fontSize: 10.5, color: 'rgba(212,190,140,0.52)', lineHeight: 1.4, marginTop: 2, marginLeft: 18 }}>
                              {task.reason}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    timeline.map(({ key, label, emoji, available, daysLeft, neverDone }) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: available ? 'rgba(240,228,200,0.78)' : 'rgba(240,228,200,0.32)' }}>
                          {emoji} {label}
                        </span>
                        <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5.5,
                          color: available ? '#78b840' : 'rgba(160,130,80,0.38)',
                          background: available ? 'rgba(100,180,60,0.10)' : 'transparent',
                          border: `1px solid ${available ? 'rgba(100,180,60,0.28)' : 'rgba(160,130,80,0.18)'}`,
                          padding: '2px 5px', borderRadius: 3 }}>
                          {available ? (neverDone ? 'NEVER DONE' : 'READY') : fmtDaysLeft(daysLeft)}
                        </span>
                      </div>
                    ))
                  )}

                  {/* Upcoming schedule (muted) when AI tasks are shown */}
                  {aiTasks.length > 0 && timeline.some(t => !t.available) && (
                    <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(160,130,80,0.08)' }}>
                      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5, color: 'rgba(160,130,80,0.35)', letterSpacing: 0.3, marginBottom: 5 }}>UPCOMING</div>
                      {timeline.filter(t => !t.available).map(({ key, label, emoji, daysLeft }) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 10.5, color: 'rgba(240,228,200,0.25)' }}>{emoji} {label}</span>
                          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 5, color: 'rgba(160,130,80,0.32)',
                            border: '1px solid rgba(160,130,80,0.12)', padding: '1px 4px', borderRadius: 2 }}>
                            {fmtDaysLeft(daysLeft)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick water button if urgent */}
                {seasonOpen && onAction && waterUrgent && (
                  <div style={{ padding: '8px 13px 10px' }}>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onAction('water', pp);
                        const fpt = WALL4_TYPES.has(pp.type) ? pxyW4(pp.pos) : pxy(pp.pos);
                        setActionFlash({ x: fpt.x, y: fpt.y, key: 'water' });
                        setTimeout(() => setActionFlash(null), 900);
                      }}
                      style={{ width: '100%', padding: '8px 0', border: '1px solid rgba(220,130,60,0.55)',
                        borderRadius: 6, background: 'rgba(200,100,30,0.30)',
                        color: '#f0a070', fontFamily: '"Crimson Pro", Georgia, serif',
                        fontSize: 13, cursor: 'pointer' }}>
                      💧 Water now
                    </button>
                  </div>
                )}
              </div>
            </foreignObject>
          </g>
        );
      })()}

      </g>{/* end visual layer */}

      <style>{`
        @keyframes terraceRipple {
          0%   { opacity: 0.80; }
          100% { opacity: 0; }
        }
        @keyframes terraceRippleFill {
          0%   { opacity: 0.30; }
          100% { opacity: 0; }
        }
      `}</style>

    </svg>
  );
}
