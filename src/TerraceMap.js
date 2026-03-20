// TerraceMap.js — SVG bird's eye terrace map
// The wisteria fence and rose trellises are the focal mechanics.
import React, { useState, useRef, useCallback, useEffect } from 'react';

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
    case 'recovering': return { leafOp:0.72,vib:0.72,droop:0.08, shift:0.18, stemOp:0.78 };
    case 'thirsty':    return { leafOp:0.60,vib:0.62,droop:0.18, shift:0.38, stemOp:0.72 };
    case 'overlooked': return { leafOp:0.48,vib:0.50,droop:0.28, shift:0.52, stemOp:0.65 };
    case 'struggling': return { leafOp:0.32,vib:0.32,droop:0.48, shift:0.78, stemOp:0.55 };
    case 'resting':    return { leafOp:0.04,vib:0.55,droop:0,    shift:0,    stemOp:0.60 };
    default:           return { leafOp:0.80,vib:0.80,droop:0,    shift:0,    stemOp:0.80 };
  }
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
              const amt = Math.min(1, (z.g - 0.60) * 2.5);
              return (
                <g opacity={amt}>
                  <circle cx={FW * 0.18} cy={z.upTop + 2} r={4.0} fill="#9860c8"/>
                  <circle cx={FW * 0.46} cy={z.upTop - 2} r={3.5} fill="#a870d8"/>
                  <circle cx={FW * 0.76} cy={z.upTop + 3} r={3.8} fill="#9060c0"/>
                  <circle cx={FW * 0.32} cy={z.upTop + 7} r={3.0} fill="#b080dc"/>
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
        strokeWidth={2.2} strokeDasharray="5 3" opacity={0.95}/>}
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

function PlantToken({ plant, isSelected, isHovered }) {
  const { x, y } = pxy(plant.pos);
  const color = plant.color || '#909080';
  const r = tokenR(plant.type);
  const isEmpty = plant.health === 'empty';
  const sc = isSelected ? 1.14 : isHovered ? 1.07 : 1;
  const showLabel = isHovered ||
    ['hydrangea','serviceberry','maple','evergreen','evergreen-xmas'].includes(plant.type);

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
      <circle cx={2} cy={3} r={r} fill="rgba(0,0,0,0.40)"
        opacity={isEmpty ? 0.25 : 0.65}/>
      <circle cx={0} cy={0} r={r}
        fill={isEmpty ? 'rgba(38,36,34,0.65)' : color}
        fillOpacity={isEmpty ? 1 : 0.88}
        stroke={isEmpty ? color : 'rgba(255,255,255,0.14)'}
        strokeWidth={isEmpty ? 1.5 : 1}/>
      <PlantIcon type={plant.type} r={r}/>
      {showLabel && (
        <text x={0} y={r + 13} textAnchor="middle"
          fontFamily={SERIF} fontSize={9} fontStyle="italic"
          fill="rgba(240,228,200,0.90)"
          style={{ pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))' }}>
          {plant.name.length > 11 ? plant.name.slice(0, 10) + '…' : plant.name}
        </text>
      )}
    </g>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export function TerraceMap({ plants, selectedId, onSelect, onMove, onDescend, onHover }) {
  const [hovId, setHovId] = useState(null);

  useEffect(() => {
    const p = hovId ? plants.find(pl => pl.id === hovId) : null;
    onHover?.(p ?? null);
  }, [hovId, plants, onHover]);
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
    setHovId(onDoor ? null : (hitTest(pt)?.id ?? null));
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
    onSelect?.(hit ?? null);
  }, [svgPt, hitTest, onSelect, onDescend]);

  const onMouseUp = useCallback(() => setDragId(null), []);

  const wisteria   = plants.filter(p => p.type === 'wisteria');
  const wall3      = plants.filter(p => ['climbing-rose','lavender'].includes(p.type));
  const tokens     = plants.filter(p => !INTEGRATED_TYPES.has(p.type) && !WALL4_TYPES.has(p.type) && p.health !== 'memorial');
  const memorials  = plants.filter(p => p.health === 'memorial');

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
        `}</style>

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
          isHovered={p.id === hovId}/>
      ))}

      {/* ── Vignette (depth) ── */}
      <rect x={0} y={0} width={VW} height={VH} fill="url(#vignette)" clipPath="url(#deckClip)"/>

      {/* ── Cookie — seated on couch cushion ── */}
      {(() => {
        const cx = couchX + 48;
        const cy = couchMainTop + Math.round(couchMainLen * 0.38);
        return (
          <g transform={`translate(${cx},${cy})`} style={{pointerEvents:'none'}}>
            {/* Shadow */}
            <ellipse cx={0} cy={9} rx={12} ry={4} fill="rgba(0,0,0,0.18)"/>
            {/* Body — white */}
            <ellipse cx={0} cy={2} rx={10} ry={8} fill="#f5f5f5"/>
            {/* Head — white */}
            <circle cx={0} cy={-8} r={7} fill="#f5f5f5"/>
            {/* Black crown patch — top of head only */}
            <ellipse cx={0} cy={-12} rx={5.5} ry={4} fill="#1a1a1a" opacity={0.88}/>
            {/* Ears (render after crown so they show white) */}
            <polygon points="-6,-14 -5,-21 -1,-14" fill="#f5f5f5"/>
            <polygon points="1,-14 5,-21 6,-14" fill="#f5f5f5"/>
            <polygon points="-5,-15 -4,-19 -2,-15" fill="#ffc8c8" opacity={0.65}/>
            <polygon points="2,-15 4,-19 5,-15" fill="#ffc8c8" opacity={0.65}/>
            {/* Green eyes */}
            <ellipse cx={-2.5} cy={-8} rx={2} ry={1.7} fill="#33aa33"/>
            <circle cx={-2.5} cy={-8} r={1.1} fill="#0a0a0a"/>
            <circle cx={-2.0} cy={-8.5} r={0.4} fill="rgba(255,255,255,0.75)"/>
            <ellipse cx={2.5} cy={-8} rx={2} ry={1.7} fill="#33aa33"/>
            <circle cx={2.5} cy={-8} r={1.1} fill="#0a0a0a"/>
            <circle cx={3.0} cy={-8.5} r={0.4} fill="rgba(255,255,255,0.75)"/>
            {/* Pink nose */}
            <ellipse cx={0} cy={-5.5} rx={1.4} ry={1} fill="#ffaaaa"/>
            {/* Tail tucked around */}
            <path d="M10,4 C14,6 14,11 8,11"
              fill="none" stroke="#f5f5f5" strokeWidth={2.8} strokeLinecap="round"/>
          </g>
        );
      })()}

      {/* ── Floating poem on hover ── */}
      {hovId && (() => {
        const hp = plants.find(p => p.id === hovId);
        if (!hp?.poem) return null;

        let px, py;
        if (hp.wall === 3) {
          const roses = plants.filter(p => p.type === 'climbing-rose').sort((a,b) => a.pos.x - b.pos.x);
          const isRight = hp.type === 'climbing-rose' && roses.indexOf(hp) === 1;
          px = (isRight ? W3_R_BOX_X : W3_L_BOX_X) + W3_PLANTER_W / 2;
          py = DT + W3_PLANTER_H + 10;
        } else {
          const pt = pxy(hp.pos);
          px = pt.x;
          py = pt.y;
        }

        const lines = hp.poem.split('\n').slice(0, 3);
        const boxW = 148;
        const boxH = lines.length * 15 + 18;

        let bx = px + 18;
        let by = py - boxH - 12;
        if (bx + boxW > VW - 10) bx = px - boxW - 18;
        if (by < DT + 4) by = py + 16;
        if (by + boxH > DB - 4) by = DB - boxH - 8;
        if (bx < DL + 4) bx = DL + 6;

        return (
          <g opacity={0.94}>
            <rect x={bx + 2} y={by + 2} width={boxW} height={boxH}
              fill="rgba(0,0,0,0.35)" rx={4}/>
            <rect x={bx} y={by} width={boxW} height={boxH}
              fill="rgba(20,12,4,0.92)" rx={4}
              stroke="rgba(160,130,80,0.28)" strokeWidth={0.8}/>
            <rect x={bx} y={by} width={3} height={boxH}
              fill={hp.color || '#d4a830'} rx={2} opacity={0.80}/>
            {lines.map((line, i) => (
              <text key={i} x={bx + 11} y={by + 14 + i * 15}
                fontFamily={SERIF} fontSize={10} fontStyle="italic"
                fill="rgba(240,228,200,0.90)">
                {line}
              </text>
            ))}
          </g>
        );
      })()}

      </g>{/* end visual layer */}

    </svg>
  );
}
