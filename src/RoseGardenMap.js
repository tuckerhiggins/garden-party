// RoseGardenMap.js — Emma's Rose Garden bird's-eye map
// A rectangular in-ground bed: 6 DKO roses + 1 magnolia.
// Same interaction contract as TerraceMap.

import React, { useState, useRef, useCallback, useEffect } from 'react';

const VW = 820, VH = 854;
const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

// ── Soil patch bounds ──────────────────────────────────────────────────────
const SX = 82, SY = 82, SW = 660, SH = 712;

// Normalize plant pos (0–1) → SVG coords within the soil patch
function pxy(pos) {
  return { x: SX + pos.x * SW, y: SY + pos.y * SH };
}

// Click / hover hit radius per type
function hitR(type) { return type === 'magnolia' ? 56 : 30; }

function healthColor(h) {
  return {
    thriving:'#58c030', content:'#88c838', thirsty:'#c8a820',
    overlooked:'#c87020', struggling:'#c83020', resting:'#7898a8',
    recovering:'#98a828',
  }[h] || '#909080';
}

function healthMod(health) {
  switch (health) {
    case 'thriving':   return { op: 1.00, vibrancy: 1.0 };
    case 'content':    return { op: 0.92, vibrancy: 0.92 };
    case 'recovering': return { op: 0.72, vibrancy: 0.70 };
    case 'thirsty':    return { op: 0.56, vibrancy: 0.55 };
    case 'overlooked': return { op: 0.44, vibrancy: 0.40 };
    case 'struggling': return { op: 0.28, vibrancy: 0.25 };
    case 'resting':    return { op: 0.78, vibrancy: 0.65 };
    default:           return { op: 0.80, vibrancy: 0.70 };
  }
}

// ── ROSE TOKEN — dormant Double Knock Out, bird's-eye ────────────────────
function RoseToken({ plant, isSelected, isHovered, isGlowing, mapCondition }) {
  const { x, y } = pxy(plant.pos);
  const color = plant.color || '#e84070';
  const { op } = healthMod(plant.health);
  const sc = isSelected ? 1.15 : isHovered ? 1.08 : 1;
  const r = 22;

  const isBlooming = mapCondition && ['budding','blooming','peak'].includes(mapCondition.bloomStatus);

  // Cane spokes — 7 radiating bare canes at early spring dormancy
  const canes = [0, 52, 104, 156, 208, 260, 312];

  return (
    <g transform={`translate(${x},${y}) scale(${sc})`} opacity={op}
      style={{ cursor: 'pointer' }}>

      {/* Selection ring */}
      {isSelected && (
        <circle cx={0} cy={0} r={r + 14} fill="none"
          stroke="#d4a830" strokeWidth={2.2} strokeDasharray="5 3" opacity={0.95}/>
      )}
      {/* Hover ring */}
      {isHovered && !isSelected && (
        <circle cx={0} cy={0} r={r + 9} fill="none"
          stroke={color} strokeWidth={1.2} opacity={0.45}/>
      )}
      {/* Care-logged glow */}
      {isGlowing && (
        <circle cx={0} cy={0} r={r + 13} fill="none"
          stroke="#d4a830" strokeWidth={3} opacity={0.55}/>
      )}
      {/* Bloom glow */}
      {isBlooming && (
        <circle cx={0} cy={0} r={r + 8} fill="none"
          stroke={color} strokeWidth={2.5} opacity={0.28}/>
      )}

      {/* Shadow */}
      <circle cx={2} cy={3} r={r} fill="rgba(0,0,0,0.48)"/>
      {/* Mulch base */}
      <circle cx={0} cy={0} r={r} fill="#2a1808"/>
      {/* Plant color ring */}
      <circle cx={0} cy={0} r={r} fill="none"
        stroke={color} strokeWidth={2.5} opacity={0.55}/>

      {/* Dormant canes */}
      {canes.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const len = i % 2 === 0 ? 15 : 11;
        const ex = Math.cos(rad) * len;
        const ey = Math.sin(rad) * len;
        return (
          <g key={i}>
            <line x1={0} y1={0} x2={ex} y2={ey}
              stroke="#7a4c28" strokeWidth={1.5} strokeLinecap="round" opacity={0.85}/>
            {/* Reddish bud nub at tip */}
            <circle cx={ex} cy={ey} r={1.8} fill="#8a1828" opacity={0.80}/>
          </g>
        );
      })}

      {/* Central woody crown */}
      <circle cx={0} cy={0} r={4} fill="#5a3218"/>
      <circle cx={0} cy={0} r={2.2} fill="#7a4c2a"/>

      {/* Health indicator dot */}
      <circle cx={r - 4} cy={-(r - 4)} r={3.5}
        fill={healthColor(plant.health)} stroke="rgba(0,0,0,0.45)" strokeWidth={0.8}/>

      {/* Label on hover / select */}
      {(isHovered || isSelected) && (
        <text x={0} y={r + 14} textAnchor="middle"
          fontFamily={SERIF} fontSize={9.5} fontStyle="italic"
          fill="rgba(240,228,200,0.92)"
          style={{ pointerEvents: 'none',
            filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}>
          {plant.subtitle}
        </text>
      )}
    </g>
  );
}

// ── MAGNOLIA TOKEN — bespoke, spreading, pre-bloom ────────────────────────
// Magnolia x soulangeana blooms before leaves in early April.
// Currently: bare spreading branches with tight pink-white goblet buds forming.
function MagnoliaToken({ plant, isSelected, isHovered, isGlowing, mapCondition }) {
  const { x, y } = pxy(plant.pos);
  const color = plant.color || '#e8a0c0';
  const { op } = healthMod(plant.health);
  const sc = isSelected ? 1.08 : isHovered ? 1.04 : 1;

  const isBlooming = mapCondition && ['budding','blooming','peak'].includes(mapCondition.bloomStatus);

  const trunk   = '#3a2010';
  const branch  = '#4e3018';
  const branch2 = '#5a3820';
  const budPink = '#c8607a';
  const budPale = '#e8c0cc';
  const budCream= '#f0dce4';

  return (
    <g transform={`translate(${x},${y}) scale(${sc})`} opacity={op}
      style={{ cursor: 'pointer' }}>

      {/* Selection ellipse — irregular, organic */}
      {isSelected && (
        <ellipse cx={0} cy={6} rx={62} ry={52} fill="none"
          stroke="#d4a830" strokeWidth={2.2} strokeDasharray="5 3" opacity={0.95}/>
      )}
      {isHovered && !isSelected && (
        <ellipse cx={0} cy={6} rx={58} ry={48} fill="none"
          stroke={color} strokeWidth={1.2} opacity={0.38}/>
      )}
      {isGlowing && (
        <ellipse cx={0} cy={6} rx={66} ry={55} fill="none"
          stroke="#d4a830" strokeWidth={3} opacity={0.55}/>
      )}
      {isBlooming && (
        <ellipse cx={0} cy={6} rx={60} ry={50} fill="none"
          stroke={color} strokeWidth={2.5} opacity={0.28}/>
      )}

      {/* Ground shadow — wide, blotchy, suggesting canopy spread */}
      <ellipse cx={4} cy={8} rx={50} ry={40} fill="rgba(0,0,0,0.32)"/>

      {/* Soil circle beneath — slightly lighter than bed soil */}
      <ellipse cx={0} cy={5} rx={46} ry={37} fill="#2e1a0c" opacity={0.80}/>

      {/* ── Main trunk structure — multi-stemmed, spreading ── */}
      {/* Three main trunks from a shared base */}
      <line x1={0} y1={10} x2={-7} y2={-4}   stroke={trunk} strokeWidth={5.5} strokeLinecap="round"/>
      <line x1={0} y1={10} x2={6}  y2={-3}   stroke={trunk} strokeWidth={5}   strokeLinecap="round"/>
      <line x1={0} y1={10} x2={1}  y2={-12}  stroke={trunk} strokeWidth={4.5} strokeLinecap="round"/>

      {/* ── Left branch system ── */}
      <line x1={-7} y1={-4} x2={-34} y2={-24} stroke={branch} strokeWidth={3.2} strokeLinecap="round"/>
      <line x1={-7} y1={-4} x2={-30} y2={2}   stroke={branch} strokeWidth={2.8} strokeLinecap="round"/>
      <line x1={-7} y1={-4} x2={-22} y2={-38} stroke={branch} strokeWidth={2.2} strokeLinecap="round"/>
      {/* Left sub-branches */}
      <line x1={-34} y1={-24} x2={-46} y2={-18} stroke={branch2} strokeWidth={1.8} strokeLinecap="round"/>
      <line x1={-34} y1={-24} x2={-40} y2={-36} stroke={branch2} strokeWidth={1.6} strokeLinecap="round"/>
      <line x1={-30} y1={2}   x2={-44} y2={8}   stroke={branch2} strokeWidth={1.8} strokeLinecap="round"/>
      <line x1={-30} y1={2}   x2={-38} y2={-8}  stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>
      <line x1={-22} y1={-38} x2={-30} y2={-48} stroke={branch2} strokeWidth={1.6} strokeLinecap="round"/>
      <line x1={-22} y1={-38} x2={-14} y2={-50} stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>

      {/* ── Right branch system ── */}
      <line x1={6} y1={-3} x2={32} y2={-20}  stroke={branch} strokeWidth={3.0} strokeLinecap="round"/>
      <line x1={6} y1={-3} x2={34} y2={4}    stroke={branch} strokeWidth={2.8} strokeLinecap="round"/>
      <line x1={6} y1={-3} x2={24} y2={-36}  stroke={branch} strokeWidth={2.2} strokeLinecap="round"/>
      {/* Right sub-branches */}
      <line x1={32} y1={-20} x2={44} y2={-14} stroke={branch2} strokeWidth={1.8} strokeLinecap="round"/>
      <line x1={32} y1={-20} x2={40} y2={-32} stroke={branch2} strokeWidth={1.6} strokeLinecap="round"/>
      <line x1={34} y1={4}   x2={46} y2={10}  stroke={branch2} strokeWidth={1.8} strokeLinecap="round"/>
      <line x1={34} y1={4}   x2={42} y2={-5}  stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>
      <line x1={24} y1={-36} x2={32} y2={-48} stroke={branch2} strokeWidth={1.6} strokeLinecap="round"/>
      <line x1={24} y1={-36} x2={16} y2={-50} stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>

      {/* ── Center-top branch system ── */}
      <line x1={1} y1={-12} x2={-10} y2={-38} stroke={branch} strokeWidth={2.8} strokeLinecap="round"/>
      <line x1={1} y1={-12} x2={9}   y2={-40} stroke={branch} strokeWidth={2.5} strokeLinecap="round"/>
      <line x1={1} y1={-12} x2={0}   y2={-48} stroke={branch} strokeWidth={2.2} strokeLinecap="round"/>
      {/* Center sub-branches */}
      <line x1={-10} y1={-38} x2={-18} y2={-50} stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>
      <line x1={-10} y1={-38} x2={-4}  y2={-52} stroke={branch2} strokeWidth={1.4} strokeLinecap="round"/>
      <line x1={9}   y1={-40} x2={16}  y2={-52} stroke={branch2} strokeWidth={1.5} strokeLinecap="round"/>
      <line x1={9}   y1={-40} x2={4}   y2={-54} stroke={branch2} strokeWidth={1.4} strokeLinecap="round"/>

      {/* ── Bud clusters — goblet-shaped, tight, not yet open ── */}
      {/* Left outer cluster */}
      <ellipse cx={-47} cy={-17} rx={5.5} ry={4}   fill={budPink}  opacity={0.90} transform="rotate(-20,-47,-17)"/>
      <ellipse cx={-41} cy={-36} rx={5}   ry={3.8} fill={budPale}  opacity={0.82} transform="rotate(10,-41,-36)"/>
      <ellipse cx={-45} cy={8}   rx={5}   ry={4}   fill={budCream} opacity={0.78} transform="rotate(5,-45,8)"/>
      <ellipse cx={-38} cy={-8}  rx={4}   ry={3.2} fill={budPink}  opacity={0.72}/>
      <ellipse cx={-31} cy={-50} rx={5}   ry={3.8} fill={budPale}  opacity={0.80}/>
      <ellipse cx={-15} cy={-52} rx={4.5} ry={3.5} fill={budPink}  opacity={0.85}/>

      {/* Right outer cluster */}
      <ellipse cx={45}  cy={-13} rx={5.5} ry={4}   fill={budPink}  opacity={0.90} transform="rotate(20,45,-13)"/>
      <ellipse cx={41}  cy={-32} rx={5}   ry={3.8} fill={budPale}  opacity={0.82} transform="rotate(-10,41,-32)"/>
      <ellipse cx={47}  cy={10}  rx={5}   ry={4}   fill={budCream} opacity={0.78} transform="rotate(-5,47,10)"/>
      <ellipse cx={42}  cy={-5}  rx={4}   ry={3.2} fill={budPink}  opacity={0.72}/>
      <ellipse cx={33}  cy={-50} rx={5}   ry={3.8} fill={budPale}  opacity={0.80}/>
      <ellipse cx={17}  cy={-54} rx={4.5} ry={3.5} fill={budPink}  opacity={0.85}/>

      {/* Center top cluster */}
      <ellipse cx={-18} cy={-52} rx={4.5} ry={3.5} fill={budPale}  opacity={0.80}/>
      <ellipse cx={-5}  cy={-55} rx={5}   ry={3.8} fill={budPink}  opacity={0.90}/>
      <ellipse cx={5}   cy={-57} rx={4.5} ry={3.5} fill={budCream} opacity={0.82}/>
      <ellipse cx={17}  cy={-55} rx={4.5} ry={3.5} fill={budPink}  opacity={0.85}/>

      {/* Scattered accent buds — give organic density */}
      <circle cx={-16} cy={-28} r={2.5} fill={budPink}  opacity={0.60}/>
      <circle cx={18}  cy={-22} r={2.5} fill={budCream} opacity={0.58}/>
      <circle cx={-6}  cy={-44} r={2.2} fill={budPale}  opacity={0.55}/>
      <circle cx={8}   cy={-30} r={2}   fill={budPink}  opacity={0.52}/>
      <circle cx={-26} cy={-42} r={2.2} fill={budCream} opacity={0.55}/>
      <circle cx={26}  cy={-42} r={2.2} fill={budPink}  opacity={0.55}/>

      {/* Health dot */}
      <circle cx={44} cy={-28} r={4.2}
        fill={healthColor(plant.health)} stroke="rgba(0,0,0,0.45)" strokeWidth={0.9}/>

      {/* Label — magnolia always labeled (it's the only one) */}
      <text x={0} y={20} textAnchor="middle"
        fontFamily={SERIF} fontSize={10} fontStyle="italic"
        fill="rgba(240,228,200,0.88)"
        style={{ pointerEvents: 'none',
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1))' }}>
        Magnolia
      </text>
    </g>
  );
}

// ── SCENE: planter walls + soil ───────────────────────────────────────────
function GardenScene() {
  const wallColor    = '#6a3e20';  // composite planter wall — warm brown
  const wallFace     = '#7a4a28';
  const wallHighlight= '#8a5630';
  const wallShadow   = '#4a2c14';

  // Generate stone block rows for the planter walls
  function PlasterWall({ x, y, w, h, horizontal }) {
    const blockH = horizontal ? 20 : 22;
    const rows = Math.ceil(h / blockH);
    const blocks = [];
    for (let row = 0; row < rows; row++) {
      const by = y + row * blockH;
      const bh = Math.min(blockH - 1, y + h - by);
      if (bh <= 0) continue;
      // Alternate row offset
      const offset = (row % 2) * 48;
      const blockW = horizontal ? 88 : 76;
      const numBlocks = Math.ceil(w / blockW) + 1;
      for (let col = 0; col < numBlocks; col++) {
        const bx = x - offset + col * blockW;
        if (bx + blockW < x || bx > x + w) continue;
        const clampedX = Math.max(x, bx);
        const clampedW = Math.min(bx + blockW - 1, x + w) - clampedX;
        blocks.push(
          <rect key={`${row}-${col}`}
            x={clampedX} y={by} width={Math.max(0, clampedW)} height={bh}
            fill={row % 3 === 0 ? wallFace : row % 3 === 1 ? wallColor : wallHighlight}
            stroke={wallShadow} strokeWidth={0.6} opacity={0.95}/>
        );
      }
    }
    return <g>{blocks}</g>;
  }

  return (
    <g>
      {/* ── Urban exterior background (sidewalk / street context) ── */}
      <rect width={VW} height={VH} fill="#161210"/>
      {/* Concrete sidewalk texture — subtle variation */}
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={0} y={i * 142} width={VW} height={141}
          fill={i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.025)'}/>
      ))}
      {/* Expansion joint lines on sidewalk */}
      {[200,400,600].map(y => (
        <line key={y} x1={0} y1={y} x2={VW} y2={y}
          stroke="rgba(255,255,255,0.05)" strokeWidth={0.8}/>
      ))}
      {[250,500,750].map(x => (
        <line key={x} x1={x} y1={0} x2={x} y2={VH}
          stroke="rgba(255,255,255,0.04)" strokeWidth={0.8}/>
      ))}

      {/* ── Planter wall — left edge (runs full height of bed) ── */}
      <PlasterWall x={0} y={0} w={SX} h={VH} horizontal={false}/>
      {/* Left wall inner shadow / depth */}
      <rect x={SX - 8} y={SY} width={8} height={SH}
        fill="rgba(0,0,0,0.35)"/>

      {/* ── Planter wall — top edge (runs full width) ── */}
      <PlasterWall x={0} y={0} w={VW} h={SY} horizontal={true}/>
      {/* Top wall inner shadow */}
      <rect x={SX} y={SY - 8} width={SW} height={8}
        fill="rgba(0,0,0,0.30)"/>

      {/* ── The soil patch ── */}
      {/* Base soil — dark amended earth */}
      <rect x={SX} y={SY} width={SW} height={SH} fill="#1e0e06"/>

      {/* Soil texture — subtle lighter patches suggesting amended organic matter */}
      <rect x={SX + 20}  y={SY + 30}  width={180} height={90}  fill="rgba(80,40,10,0.18)" rx={30}/>
      <rect x={SX + 280} y={SY + 120} width={220} height={110} fill="rgba(80,40,10,0.14)" rx={40}/>
      <rect x={SX + 80}  y={SY + 350} width={160} height={120} fill="rgba(80,40,10,0.16)" rx={30}/>
      <rect x={SX + 380} y={SY + 480} width={180} height={100} fill="rgba(80,40,10,0.12)" rx={35}/>
      <rect x={SX + 140} y={SY + 580} width={200} height={100} fill="rgba(80,40,10,0.15)" rx={30}/>

      {/* Rock / gravel scatter at bottom edge of bed (matching photo) */}
      {[
        [SX+30,  SY+SH-18, 5, 3.5], [SX+68,  SY+SH-14, 4,   3],
        [SX+110, SY+SH-20, 6, 4],   [SX+160, SY+SH-12, 4.5, 3],
        [SX+210, SY+SH-18, 5, 3.5], [SX+260, SY+SH-14, 4,   3],
        [SX+310, SY+SH-20, 5.5, 4], [SX+360, SY+SH-12, 4,   3],
        [SX+420, SY+SH-18, 5,   3.5],[SX+480, SY+SH-14, 4.5, 3],
        [SX+530, SY+SH-20, 5,   4],  [SX+580, SY+SH-12, 4,   3],
        [SX+620, SY+SH-18, 5.5, 3.5],[SX+650, SY+SH-14, 4,   3],
      ].map(([rx, ry, rw, rh], i) => (
        <ellipse key={i} cx={rx} cy={ry} rx={rw} ry={rh}
          fill="#4a3820" stroke="#362818" strokeWidth={0.5} opacity={0.80}/>
      ))}

      {/* Right-side gap — open to sidewalk */}
      <rect x={SX + SW} y={SY} width={VW - (SX + SW)} height={SH}
        fill="rgba(0,0,0,0.12)"/>
      {/* Bottom gap — open to sidewalk */}
      <rect x={SX} y={SY + SH} width={SW} height={VH - (SY + SH)}
        fill="rgba(0,0,0,0.10)"/>

      {/* Corner accent where walls meet */}
      <rect x={0} y={0} width={SX} height={SY} fill={wallColor} opacity={0.95}/>
      <rect x={SX - 6} y={SY - 6} width={10} height={10}
        fill={wallShadow} opacity={0.60}/>

      {/* ── Map title label ── */}
      <text x={SX + 14} y={SY + 22}
        fontFamily={MONO} fontSize={7} letterSpacing={0.8}
        fill="rgba(212,168,48,0.55)"
        style={{ pointerEvents: 'none' }}>
        EMMA'S ROSE GARDEN
      </text>
    </g>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export function RoseGardenMap({
  plants = [],
  selectedId,
  onSelect,
  onHover,
  portraits = {},
  careLog = {},
  briefings = {},
  mapConditions = {},
  glowPlantId = null,
}) {
  const [hovId, setHovId] = useState(null);
  const svgRef = useRef(null);
  const leaveTimerRef = useRef(null);

  useEffect(() => {
    const p = hovId ? plants.find(pl => pl.id === hovId) : null;
    onHover?.(p ?? null);
  }, [hovId, plants, onHover]);

  const svgPt = useCallback((e) => {
    const svg = svgRef.current; if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.touches ? e.touches[0].clientX : e.clientX;
    pt.y = e.touches ? e.touches[0].clientY : e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const hitTest = useCallback((pt) => {
    if (!pt) return null;
    return plants.find(p => {
      const { x, y } = pxy(p.pos);
      return Math.hypot(pt.x - x, pt.y - y) <= hitR(p.type);
    }) ?? null;
  }, [plants]);

  const onMouseMove = useCallback((e) => {
    const pt = svgPt(e); if (!pt) return;
    const hit = hitTest(pt);
    if (hit) {
      if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
      setHovId(hit.id);
    } else {
      if (!leaveTimerRef.current) {
        leaveTimerRef.current = setTimeout(() => {
          setHovId(null); leaveTimerRef.current = null;
        }, 180);
      }
    }
  }, [svgPt, hitTest]);

  const onClick = useCallback((e) => {
    const pt = svgPt(e); if (!pt) return;
    const hit = hitTest(pt);
    onSelect?.(hit ?? null);
  }, [svgPt, hitTest, onSelect]);

  const onMouseLeave = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setHovId(null);
    onHover?.(null);
  }, [onHover]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%" height="100%"
      style={{ display: 'block', cursor: 'default' }}
      onMouseMove={onMouseMove}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
    >
      <GardenScene />

      {/* Render plants — roses first, magnolia on top */}
      {plants
        .filter(p => p.type !== 'magnolia')
        .map(plant => (
          <RoseToken
            key={plant.id}
            plant={plant}
            isSelected={selectedId === plant.id}
            isHovered={hovId === plant.id}
            isGlowing={glowPlantId === plant.id}
            mapCondition={mapConditions[plant.id]}
          />
        ))}
      {plants
        .filter(p => p.type === 'magnolia')
        .map(plant => (
          <MagnoliaToken
            key={plant.id}
            plant={plant}
            isSelected={selectedId === plant.id}
            isHovered={hovId === plant.id}
            isGlowing={glowPlantId === plant.id}
            mapCondition={mapConditions[plant.id]}
          />
        ))}
    </svg>
  );
}
