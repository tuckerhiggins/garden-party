// Garden Party v0.5 — gardenparty.fun
// Garden View (illustrated cards) as primary · Map View as beautiful option
// Season 2 · Opens March 20, 2026

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TERRACE_PLANTS, FRONT_PLANTS, ACTION_DEFS, ACTION_HOWTO } from './data/plants';
import { computeHealth, computeWaterLevel, HEALTH_LEVEL } from './utils/health';
import { PlantPortrait } from './PlantPortraits';
import { TerraceMap } from './TerraceMap';
import { FrontMap } from './FrontMap';
import { RoseGardenMap } from './RoseGardenMap';
import { fetchOracle, fetchSeasonOpener, fetchPlantBriefing, fetchDailyAgenda, streamGardenChat, fetchMorningBrief, fetchDailyBrief, fetchJournalEntry, parseNoteActions, fetchMapCondition, fetchNoticeToday } from './claude';
import { usePortraits } from './hooks/usePortraits';
import { usePhotos } from './hooks/usePhotos';
import { useAuth } from './hooks/useAuth';
import { useGardenData } from './hooks/useGardenData';
import { useMigration } from './hooks/useMigration';
import { OracleChat } from './components/OracleChat';
import { MobileView } from './components/MobileView';
import { compressChatImage } from './utils/compressChatImage';
import { PlantShopModal } from './components/PlantShopModal';
import { MapInfoPanel, MapContextPanel, MapCarePanel } from './components/MapInfoPanel';
import { getPhenologicalStage } from './utils/phenology';
import { computeAgenda } from './utils/agenda';
import { localDate } from './utils/dates';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = e => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

// ── PALETTE ──────────────────────────────────────────────────────────────
const C = {
  // App background — warm off-white parchment
  appBg: '#f2ece0',
  // Card surfaces
  cardBg: '#faf6ee', cardBorder: 'rgba(160,130,80,0.18)',
  cardShadow: 'rgba(100,70,30,0.10)',
  // Section headers
  sectionBg: '#ede5d4',
  // UI chrome — warm dark
  uiBg: '#120c06', uiPane: '#1c1008', uiMid: '#281808',
  uiLight: '#342010', uiBorder: '#5a3c18',
  uiText: '#f0e4cc', uiMuted: '#a89070', uiDim: '#706040',
  uiGold: '#d4a830', uiGoldD: '#a07820',
  // Plant identity colors (consistent throughout)
  wisteria: '#9860c8', rose: '#e84070', lavender: '#b890e0',
  hydrangea: '#9ab8d0', serviceberry: '#d06030', maple: '#d85828',
  evergreen: '#4a7828', 'evergreen-xmas': '#888040',
  'empty-pot': '#909088', memorial: '#907060',
  worm: '#c09060', 'stone-pot': '#b0a070', 'climbing-rose': '#e84070',
  // Health
  thriving: '#58c030', content: '#88c838', thirsty: '#c8a820',
  overlooked: '#c87020', struggling: '#c83020', resting: '#7898a8',
  empty: '#909088', memorial2: '#907060', recovering: '#98a828',
};

function plantColor(type) { return C[type] || '#909080'; }

// ── AUTH BUTTON ───────────────────────────────────────────────────────────
function AuthButton({ role, signIn, signOut, checking, authError }) {
  const [open, setOpen] = React.useState(false);
  const [who, setWho] = React.useState(null); // 'tucker' | 'emma'
  const [pw, setPw] = React.useState('');
  const [localError, setLocalError] = React.useState('');

  const close = () => { setOpen(false); setWho(null); setPw(''); setLocalError(''); };

  const attempt = async () => {
    setLocalError('');
    try { await signIn(who, pw); close(); }
    catch (e) { setLocalError(e.message); }
  };

  if (role !== 'guest') {
    return (
      <button onClick={signOut}
        style={{background:'none',border:`1px solid rgba(90,60,24,0.5)`,borderRadius:3,
          padding:'4px 8px',color:'#a89070',fontFamily:MONO,fontSize:7,cursor:'pointer'}}>
        {role === 'tucker' ? '🌿 Tucker' : '🌹 Emma'} ×
      </button>
    );
  }

  if (open && !who) {
    return (
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <button onClick={()=>setWho('tucker')}
          style={{background:'#2a1808',border:'1px solid rgba(90,60,24,0.5)',borderRadius:3,
            padding:'4px 10px',color:'#f0e4cc',fontFamily:MONO,fontSize:7,cursor:'pointer'}}>
          🌿 Tucker
        </button>
        <button onClick={()=>setWho('emma')}
          style={{background:'#2a1808',border:'1px solid rgba(90,60,24,0.5)',borderRadius:3,
            padding:'4px 10px',color:'#f0e4cc',fontFamily:MONO,fontSize:7,cursor:'pointer'}}>
          🌹 Emma
        </button>
        <button onClick={close}
          style={{background:'none',border:'none',color:'#706040',fontSize:16,cursor:'pointer',padding:'0 2px'}}>
          ×
        </button>
      </div>
    );
  }

  if (open && who) {
    return (
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <input
          type="password" value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&attempt()}
          placeholder="password" autoFocus
          style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${localError?'#c07050':'rgba(90,60,24,0.5)'}`,
            borderRadius:3,padding:'4px 8px',color:'#f0e4cc',fontFamily:SERIF,fontSize:13,
            width:100,outline:'none'}}/>
        <button onClick={attempt} disabled={checking}
          style={{background:'#2a1808',border:'none',borderRadius:3,padding:'4px 10px',
            color:'#f0e4cc',fontFamily:MONO,fontSize:7,cursor:'pointer',opacity:checking?0.6:1}}>
          {checking ? '…' : 'GO'}
        </button>
        <button onClick={close}
          style={{background:'none',border:'none',color:'#706040',fontSize:16,cursor:'pointer',padding:'0 2px'}}>
          ×
        </button>
        {localError && <span style={{fontFamily:SERIF,fontSize:11,color:'#c07050'}}>{localError}</span>}
      </div>
    );
  }

  return (
    <button onClick={()=>setOpen(true)}
      style={{background:'none',border:`1px solid rgba(90,60,24,0.5)`,borderRadius:3,
        padding:'4px 8px',color:'#706040',fontFamily:MONO,fontSize:7,cursor:'pointer'}}>
      sign in
    </button>
  );
}
function healthColor(h) { return C[h] || '#909080'; }
function healthLabel(h) {
  return {thriving:'Thriving',content:'Content',thirsty:'Thirsty',
    overlooked:'Overlooked',struggling:'Struggling',resting:'Resting',
    empty:'Awaiting',memorial:'In memoriam',recovering:'Recovering'}[h]||h;
}
function typeEmoji(type) {
  return {wisteria:'🌸','climbing-rose':'🌹',rose:'🌹',lavender:'💜',
    hydrangea:'💐',serviceberry:'🌳',maple:'🍁',evergreen:'🌲',
    'evergreen-xmas':'🎄','empty-pot':'🪴',memorial:'✝️',worm:'🪱',
    'stone-pot':'🪨'}[type]||'🌿';
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

// ── PHOTO STORAGE ─────────────────────────────────────────────────────────
async function compressImage(file, maxPx = 900, quality = 0.78) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

// ── WEATHER HOOK ─────────────────────────────────────────────────────────
const WMO_POEM = {
  0:  (t) => `${t}°F and clear. The terrace is waiting.`,
  1:  (t) => `${t}°F, mostly clear.`,
  2:  (t) => `${t}°F, partly cloudy.`,
  3:  (t) => `${t}°F, overcast.`,
  45: (t) => `${t}°F. Fog over the terrace.`,
  48: (t) => `${t}°F. Freezing fog.`,
  51: (t) => `${t}°F. Light drizzle. The garden is drinking.`,
  53: (t) => `${t}°F. Drizzle.`,
  61: (t) => `${t}°F. Rain. Good day to stay in.`,
  63: (t) => `${t}°F. Rain.`,
  71: (t) => `${t}°F. Snow on the terrace.`,
  80: (t) => `${t}°F. Rain showers.`,
  95: (t) => `${t}°F. Thunder somewhere.`,
};

function wmoPoem(code, temp) {
  const t = Math.round(temp);
  const known = Object.keys(WMO_POEM).map(Number).sort((a,b) => a-b);
  const match = known.reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);
  return WMO_POEM[match]?.(t) ?? `${t}°F`;
}

const WMO_LABEL = (code) => {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly cloudy';
  if (code <= 3) return 'overcast';
  if (code <= 48) return 'foggy';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'showers';
  return 'storm';
};

function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    const fetch_ = () => {
      fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=40.6782&longitude=-73.9442' +
        '&current=temperature_2m,weathercode' +
        '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max' +
        '&temperature_unit=fahrenheit&forecast_days=10&timezone=America%2FNew_York'
      )
        .then(r => r.json())
        .then(d => {
          const temp = d.current.temperature_2m;
          const code = d.current.weathercode;
          const dl = d.daily;
          const forecast = dl.time.map((date, i) => ({
            date,
            code: dl.weathercode[i],
            high: Math.round(dl.temperature_2m_max[i]),
            low: Math.round(dl.temperature_2m_min[i]),
            precip: Math.round((dl.precipitation_sum[i] || 0) * 10) / 10,
            precipChance: dl.precipitation_probability_max[i] || 0,
            label: WMO_LABEL(dl.weathercode[i]),
          }));
          setWeather({ temp, code, poem: wmoPoem(code, temp), forecast });
        })
        .catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return weather;
}

// ── PLANTING SUGGESTIONS ──────────────────────────────────────────────────
const PLANTING_SUGGESTIONS = [
  { name: 'Geranium', emoji: '🌸', desc: 'Cheerful, drought-tolerant, blooms all summer. Classic terrace plant.', color: '#e86080' },
  { name: 'Basil', emoji: '🌿', desc: 'Fragrant, useful. Wants full sun. Harvest keeps it bushy.', color: '#5a9020' },
  { name: 'Calibrachoa', emoji: '🌺', desc: 'Million bells. Cascades over the edge, non-stop color.', color: '#e070a0' },
  { name: 'Sweet potato vine', emoji: '🍃', desc: 'Dramatic trailing foliage. Chartreuse or black. Heat-loving.', color: '#7a9830' },
  { name: 'Marigold', emoji: '🌼', desc: 'Pest deterrent. Bright orange and gold. Asks for almost nothing.', color: '#e0a020' },
  { name: 'Lavender', emoji: '💜', desc: 'If you want another one. Bees will come.', color: '#b890e0' },
];

// ── SPECIES GROUPS (garden view grouping order) ──────────────────────────
const TERRACE_GROUPS = [
  { key:'wisteria',       label:'Wisteria',              types:['wisteria'] },
  { key:'climbing-rose',  label:'Zéphirine Drouhin',     types:['climbing-rose','lavender'] },
  { key:'hydrangea',      label:'Pinnacle Lime Hydrangeas (4)', types:['hydrangea'] },
  { key:'trees',          label:'Trees',                 types:['serviceberry','maple'] },
  { key:'evergreen',      label:'Evergreens',            types:['evergreen','evergreen-xmas'] },
  { key:'additions',      label:'New Additions',         types:['custom','annual','herb','fern','succulent','grass'] },
];

const FRONT_GROUPS = [
  { key:'magnolia',       label:'Magnolia',              types:['magnolia'] },
  { key:'rose',           label:'Double Knock Out Roses (6)', types:['rose'] },
];

// ── STORAGE ───────────────────────────────────────────────────────────────
const LS = { care:'gp_care_v4',
  expenses:'gp_expenses_v4', positions:'gp_pos_v4', growth:'gp_growth_v4' };
const load = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{return d;} };
const save = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} };



// ── MAP RENDERER (terrace + front) ────────────────────────────────────────
// Kept compact — the Garden View is the hero, Map View is atmospheric
function lerp(a,b,t){return a+(b-a)*t;}
function ease(t){return t<.5?2*t*t:-1+(4-2*t)*t;}

function proj(bx,by,W,H,tilt){
  const pad={l:30,r:24,t:28,b:24};
  let px=pad.l+bx*(W-pad.l-pad.r);
  let py=pad.t+by*(H-pad.t-pad.b);
  if(tilt>0){
    const vy=H*0.08, et=ease(tilt);
    py=lerp(py, vy+by*(H-vy)*0.72, et);
    px=(W/2)+lerp(px-W/2,(px-W/2)*(0.7+by*0.3),et*0.4);
  }
  return {px,py};
}

function drawMap(ctx,W,H,tilt,f,plants,selId,hovId,cookiePos){
  ctx.clearRect(0,0,W,H);
  drawTerraceMap(ctx,W,H,0,f,plants,selId,hovId,cookiePos);
}

function drawTerraceMap(ctx,W,H,T,f,plants,selId,hovId,cookiePos){
  // Always pure bird's eye — T is ignored
  const fW=24;   // Wall 2: cedar fence (left)
  const rW=18;   // Wall 4: metal railing (right)
  const bH=28;   // Wall 3: neighbor building strip (top, no windows in bird's eye)
  const w1H=22;  // Wall 1: building wall strip (bottom)
  const dL=fW, dR=W-rW, dT=bH, dB=H-w1H;
  const dW=dR-dL, dH=dB-dT;

  // ── Wall 3 / Neighbor building top strip (bird's eye — no windows) ──────
  ctx.fillStyle='#d4d09a'; ctx.fillRect(0,0,W,bH);
  ctx.strokeStyle='rgba(155,148,88,0.16)'; ctx.lineWidth=.8;
  for(let by=8;by<bH;by+=10){ctx.beginPath();ctx.moveTo(0,by);ctx.lineTo(W,by);ctx.stroke();}
  ctx.strokeStyle='rgba(155,148,88,0.10)'; ctx.lineWidth=.5;
  for(let row=0;row<Math.ceil(bH/10);row++){const off=row%2===0?0:15;for(let bx2=off;bx2<W;bx2+=30){ctx.beginPath();ctx.moveTo(bx2,row*10);ctx.lineTo(bx2,row*10+10);ctx.stroke();}}

  // ── Deck — dark charcoal herringbone tile ──────────────────────────────
  ctx.fillStyle='#3a3836'; ctx.fillRect(dL,dT,dW,dH);
  const ts=13;
  for(let tx=dL;tx<dR;tx+=ts){for(let ty=dT;ty<dB;ty+=ts){
    ctx.fillStyle=(Math.floor((tx-dL)/ts)+Math.floor((ty-dT)/ts))%2===0?'#3e3c3a':'#424040';
    ctx.fillRect(tx,ty,ts-.5,ts-.5);
  }}
  ctx.strokeStyle='rgba(24,22,20,0.35)'; ctx.lineWidth=.5;
  for(let tx=dL;tx<dR;tx+=ts){ctx.beginPath();ctx.moveTo(tx,dT);ctx.lineTo(tx,dB);ctx.stroke();}
  for(let ty=dT;ty<dB;ty+=ts){ctx.beginPath();ctx.moveTo(dL,ty);ctx.lineTo(dR,ty);ctx.stroke();}

  // ── Sunbeam: Wall 1 (bottom) → Wall 3 (top) ───────────────────────────
  ctx.save(); ctx.globalAlpha=.07; ctx.fillStyle='#fff8d0';
  ctx.beginPath(); ctx.moveTo(W*.28,dB); ctx.lineTo(W*.72,dB); ctx.lineTo(W*.77,dT); ctx.lineTo(W*.23,dT); ctx.closePath(); ctx.fill();
  ctx.globalAlpha=1; ctx.restore();

  // ── Cedar fence: Wall 2 (left) ─────────────────────────────────────────
  // Planks
  for(let fy=0;fy<H;fy+=22){
    ctx.fillStyle=Math.floor(fy/22)%3===0?'#d4a030':Math.floor(fy/22)%3===1?'#c09020':'#9a7010';
    ctx.fillRect(0,fy,fW,21);
    ctx.fillStyle='rgba(0,0,0,.07)'; ctx.fillRect(0,fy,fW,2);
  }
  // Diamond wire grid on fence face (wisteria training structure)
  ctx.strokeStyle='rgba(210,195,130,0.60)'; ctx.lineWidth=1.1; ctx.setLineDash([]);
  for(let wy=-20;wy<H+20;wy+=36){
    ctx.beginPath();ctx.moveTo(0,wy+18);ctx.lineTo(fW*.5,wy);ctx.lineTo(fW,wy+18);ctx.lineTo(fW*.5,wy+36);ctx.lineTo(0,wy+18);ctx.stroke();
  }
  // Wire extensions into deck for wisteria cane routing
  ctx.strokeStyle='rgba(210,195,130,0.30)'; ctx.lineWidth=.8;
  [dT+dH*.28, dT+dH*.50, dT+dH*.72].forEach(wy=>{
    ctx.beginPath();ctx.moveTo(fW,wy);ctx.lineTo(fW+38,wy);ctx.stroke();
  });

  // ── Wisteria cane traces (pre-plant layer — trained along fence) ───────
  plants.filter(p=>p.type==='wisteria').forEach(p=>{
    if(!p.pos) return;
    const {px,py}=proj(p.pos.x,p.pos.y,W,H,0);
    // Cane lines spreading up and down from planter along fence
    ctx.strokeStyle='rgba(120,90,160,0.35)'; ctx.lineWidth=2; ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(fW+4,py);ctx.lineTo(fW+4,dT+dH*.04);ctx.stroke();
    ctx.strokeStyle='rgba(120,90,160,0.20)'; ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(fW+12,py);ctx.lineTo(fW+12,dT+dH*.06);ctx.stroke();
    ctx.setLineDash([]);
    // Connector from planter to fence
    ctx.strokeStyle='rgba(150,110,50,0.50)'; ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(fW+6,py);ctx.stroke();
  });

  // ── Metal railing: Wall 4 (right) ─────────────────────────────────────
  ctx.fillStyle='#383e38'; ctx.fillRect(W-rW,0,6,H);
  for(let ry=6;ry<H;ry+=13) ctx.fillRect(W-rW-3,ry,3,9);

  // ── Wall 1: yellow painted brick + sliding door + HVAC (bottom) ───────
  const w1T=dB;
  for(let bx=fW;bx<dR;bx+=26){
    ctx.fillStyle=Math.floor(bx/26)%2===0?'#d0cc8e':'#cac88a'; ctx.fillRect(bx,w1T,25,w1H);
  }
  ctx.strokeStyle='rgba(150,142,80,0.18)'; ctx.lineWidth=.5;
  for(let bx=fW+26;bx<dR;bx+=26){ctx.beginPath();ctx.moveTo(bx,w1T);ctx.lineTo(bx,H);ctx.stroke();}
  // Sliding glass door
  const sdX=W*.55, sdW=58;
  ctx.fillStyle='#181c1a'; ctx.fillRect(sdX-sdW/2,w1T-3,sdW,w1H+3);
  ctx.strokeStyle='#101412'; ctx.lineWidth=1.5;
  ctx.strokeRect(sdX-sdW/2,w1T-3,sdW/2,w1H+3); ctx.strokeRect(sdX,w1T-3,sdW/2,w1H+3);
  ctx.fillStyle='rgba(150,185,205,.20)'; ctx.fillRect(sdX-sdW/2+3,w1T,sdW/2-5,w1H-2); ctx.fillRect(sdX+3,w1T,sdW/2-6,w1H-2);
  // HVAC unit
  const hvX=W*.81,hvY=w1T+3;
  ctx.fillStyle='#e4e4dc'; ctx.fillRect(hvX,hvY,28,12);
  ctx.strokeStyle='#c0c0b4'; ctx.lineWidth=.7; ctx.strokeRect(hvX,hvY,28,12);
  for(let li=0;li<4;li++){ctx.beginPath();ctx.moveTo(hvX+3,hvY+3+li*2.5);ctx.lineTo(hvX+25,hvY+3+li*2.5);ctx.stroke();}

  // ── Jute rug — under the seating area near the fence ──────────────────
  const rugX=dL+4, rugY=dT+dH*.18, rugW=dW*.33, rugH=dH*.56;
  ctx.fillStyle='rgba(182,158,100,0.24)'; ctx.fillRect(rugX,rugY,rugW,rugH);
  ctx.strokeStyle='rgba(160,128,68,0.42)'; ctx.lineWidth=1.2;
  ctx.strokeRect(rugX+3,rugY+3,rugW-6,rugH-6);
  ctx.strokeStyle='rgba(160,128,68,0.14)'; ctx.lineWidth=.5;
  for(let ry=rugY+9;ry<rugY+rugH-6;ry+=7){ctx.beginPath();ctx.moveTo(rugX+4,ry);ctx.lineTo(rugX+rugW-4,ry);ctx.stroke();}

  // ── Couch — along Wall 2 fence, between the two wisteria ──────────────
  // Oriented top-down (runs parallel to fence): back against fence, seats face right
  const couchX=dL+9, couchY=dT+dH*.22, couchW=dW*.19, couchH=dH*.50;
  // Back cushion strip (against fence)
  ctx.fillStyle='#a89878'; ctx.beginPath(); ctx.roundRect(couchX,couchY,10,couchH,3); ctx.fill();
  // Seat cushions
  ctx.fillStyle='#e0d8b8'; ctx.beginPath(); ctx.roundRect(couchX+10,couchY,couchW,couchH,4); ctx.fill();
  ctx.strokeStyle='rgba(120,100,60,.14)'; ctx.lineWidth=.8;
  const cushH=couchH/3;
  for(let cl=0;cl<3;cl++) ctx.strokeRect(couchX+13,couchY+cl*cushH+3,couchW-5,cushH-4);
  // Armrests (top and bottom)
  ctx.fillStyle='#a89878';
  ctx.beginPath(); ctx.roundRect(couchX,couchY-9,couchW+14,10,2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(couchX,couchY+couchH,couchW+14,10,2); ctx.fill();

  // ── Fire pit — large rectangle, center of terrace ─────────────────────
  const fpCX=dL+dW*.46, fpCY=dT+dH*.46;
  const fpW=dW*.13, fpHh=dH*.15;
  ctx.fillStyle='#1e1e18'; ctx.fillRect(fpCX-fpW/2,fpCY-fpHh/2,fpW,fpHh);
  ctx.strokeStyle='#3a3830'; ctx.lineWidth=1.5; ctx.strokeRect(fpCX-fpW/2,fpCY-fpHh/2,fpW,fpHh);
  ctx.fillStyle='#2a2a22'; ctx.fillRect(fpCX-fpW/2+3,fpCY-fpHh/2+3,fpW-6,fpHh-6);
  // Ember glow
  ctx.save(); ctx.globalAlpha=.20;
  const eg=ctx.createRadialGradient(fpCX,fpCY,2,fpCX,fpCY,fpW*.7);
  eg.addColorStop(0,'#ff6820'); eg.addColorStop(1,'rgba(255,80,0,0)');
  ctx.fillStyle=eg; ctx.beginPath();ctx.ellipse(fpCX,fpCY,fpW*.8,fpHh*.8,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1; ctx.restore();

  // ── Grill — near Wall 1 / Wall 2 corner (bottom-left) ─────────────────
  const grX=dL+26, grY=dB-28;
  ctx.fillStyle='#282828'; ctx.beginPath(); ctx.ellipse(grX,grY,20,13,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#181818'; ctx.fillRect(grX-6,grY+3,12,12);
  ctx.strokeStyle='#383838'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.ellipse(grX,grY,18,11,0,Math.PI,Math.PI*2); ctx.stroke();

  // ── Dining table — near Wall 1, right of center ────────────────────────
  const tX=dL+dW*.68, tY=dT+dH*.76;
  ctx.fillStyle='#c0b090'; ctx.beginPath(); ctx.roundRect(tX-28,tY-18,56,36,5); ctx.fill();
  ctx.strokeStyle='#706248'; ctx.lineWidth=.8; ctx.strokeRect(tX-25,tY-15,50,30);
  // Chairs
  [[tX-36,tY],[tX+36,tY],[tX,tY-26],[tX,tY+26]].forEach(([cx,cy])=>{
    ctx.fillStyle='#a89878'; ctx.beginPath(); ctx.roundRect(cx-7,cy-7,14,14,3); ctx.fill();
  });

  // ── Plants ────────────────────────────────────────────────────────────
  plants.forEach(p=>{
    if(!p.pos) return;
    const {px,py}=proj(p.pos.x,p.pos.y,W,H,0);
    const isSel=p.id===selId, isHov=p.id===hovId;
    const sc=isSel?1.12:isHov?1.06:1;
    ctx.save(); ctx.translate(px,py); ctx.scale(sc,sc);
    drawMapPlant(ctx,p,0,0,Math.sin(f*.022+p.pos.x*12)*2.5,f,0);
    if(isSel){ctx.strokeStyle='#d4a830';ctx.lineWidth=2.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.arc(0,-8,28,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.restore();
  });

  // ── Cookie ────────────────────────────────────────────────────────────
  if(cookiePos){const {px,py}=proj(cookiePos.x,cookiePos.y,W,H,0);drawCookieSprite(ctx,px,py,f);}
}

// Compact map sprites
function drawMapPlant(ctx,p,x,y,wobble,f,T){
  const {type,health}=p;
  if(health==='empty'||health==='memorial'){drawEmptyPotSprite(ctx,x,y,p.color||'#888');return;}
  switch(type){
    case 'wisteria': drawWisteriaSprite(ctx,x,y,wobble,f,p.id); break;
    case 'evergreen': case 'evergreen-xmas': drawEvergreenSprite(ctx,x,y,type==='evergreen-xmas'); break;
    case 'climbing-rose': drawClimbingRoseSprite(ctx,x,y,wobble); break;
    case 'lavender': drawLavSprite(ctx,x,y,wobble,f); break;
    case 'hydrangea': drawHydSprite(ctx,x,y,f); break;
    case 'serviceberry': drawSvcSprite(ctx,x,y,wobble); break;
    case 'maple': drawMapleSprite(ctx,x,y,wobble); break;
    default: drawEmptyPotSprite(ctx,x,y,p.color||'#888'); break;
  }
}
function drawWisteriaSprite(ctx,x,y,wobble,f,id){
  ctx.fillStyle='#7a5030';ctx.beginPath();ctx.roundRect(x-14,y+2,28,14,4);ctx.fill();
  ctx.strokeStyle='#8a6840';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x,y-10);ctx.stroke();
  for(let i=0;i<8;i++){
    const tx=x+(i-3.5)*5.5,sw=Math.sin(f*.022+i*.85+(id.includes('r')?1.4:0))*3.5;
    ctx.strokeStyle=i%3===0?'#9860c8':i%3===1?'#c8a8f0':'#7848a8';ctx.lineWidth=i%2===0?2:1.5;ctx.globalAlpha=.85;
    ctx.beginPath();ctx.moveTo(tx,y-10);ctx.bezierCurveTo(tx+sw*.6+3,y-24,tx-sw*.4,y-40,tx+sw*.5,y-52);ctx.stroke();
  }
  ctx.globalAlpha=1;
  [[x-6,y-52],[x+7,y-48],[x,y-56],[x-12,y-46],[x+13,y-50]].forEach(([bx,by],i)=>{
    ctx.fillStyle=i%2===0?'#c8a8f0':'#9860c8';ctx.beginPath();ctx.arc(bx,by,3.5,0,Math.PI*2);ctx.fill();
  });
}
function drawEvergreenSprite(ctx,x,y,isXmas){
  const c1=isXmas?'#888040':'#4a7828',c2=isXmas?'#686030':'#2e5018',c3=isXmas?'#b8b070':'#70a848';
  [{w:10,dy:-12},{w:18,dy:-22},{w:26,dy:-33},{w:30,dy:-44},{w:28,dy:-55},{w:22,dy:-65},{w:15,dy:-74},{w:8,dy:-82}].forEach((l,i)=>{
    ctx.fillStyle=i%2===0?c1:c2;ctx.beginPath();ctx.moveTo(x,y+l.dy-10);ctx.lineTo(x-l.w/2,y+l.dy);ctx.lineTo(x+l.w/2,y+l.dy);ctx.closePath();ctx.fill();
    ctx.fillStyle=c3;ctx.globalAlpha=.18;ctx.fillRect(x-l.w/2+3,y+l.dy-7,l.w/3,4);ctx.globalAlpha=1;
  });
  if(isXmas)[{dx:0,dy:-33,c:'#e03030'},{dx:-9,dy:-47,c:'#e8d020'},{dx:10,dy:-41,c:'#2880e0'}].forEach(o=>{
    ctx.fillStyle=o.c;ctx.beginPath();ctx.arc(x+o.dx,y+o.dy,4.5,0,Math.PI*2);ctx.fill();
  });
  ctx.fillStyle='#a8a8a0';ctx.beginPath();ctx.roundRect(x-12,y,24,10,3);ctx.fill();
}
function drawClimbingRoseSprite(ctx,x,y,wobble){
  ctx.fillStyle='#c09020';ctx.fillRect(x-18,y+2,36,10);
  ctx.strokeStyle='#6a8040';ctx.lineWidth=2;
  [[0,-5,wobble*.3,-42],[-9,-2,-8+wobble*.2,-38],[9,-2,11+wobble*.2,-34],[-5,-3,-14+wobble*.15,-50],[5,-3,16+wobble*.15,-46]].forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(x+x1,y+y1);ctx.lineTo(x+x2,y+y2);ctx.stroke();});
  ctx.fillStyle='#b05070';[[wobble*.3,-44],[-8+wobble*.2,-40],[11+wobble*.2,-36],[-14+wobble*.15,-52]].forEach(([bx,by])=>{ctx.beginPath();ctx.arc(x+bx,y+by,3.5,0,Math.PI*2);ctx.fill();});
}
function drawLavSprite(ctx,x,y,wobble,f){
  for(let i=0;i<7;i++){const lx=x+(i-3)*4.5,sw=Math.sin(f*.018+i*.9)*2.5;ctx.strokeStyle='#909860';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(lx,y+2);ctx.lineTo(lx+sw,y-22);ctx.stroke();ctx.fillStyle=i%2===0?'#dcc8f8':'#b890e0';ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(lx+sw,y-24,4.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
}
function drawHydSprite(ctx,x,y,f){
  ctx.fillStyle='#989898';ctx.beginPath();ctx.roundRect(x-24,y-2,48,22,6);ctx.fill();
  ctx.strokeStyle='#787060';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x,y-25);ctx.stroke();
  ctx.lineWidth=1.5;[[x,y-19,x-17,y-40],[x,y-19,x+16,y-38],[x,y-25,x-10,y-48],[x,y-25,x+10,y-46],[x,y-25,x,y-52]].forEach(([x1,y1,x2,y2])=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();});
  [{bx:0,by:-52},{bx:-16,by:-40},{bx:15,by:-38},{bx:-10,by:-48},{bx:10,by:-46}].forEach((h,i)=>{
    const sw=Math.sin(f*.013+i*1.4)*2.2;ctx.fillStyle=i%2===0?'#d8c898':'#c0b080';ctx.globalAlpha=.86;
    for(let p=0;p<8;p++){ctx.beginPath();ctx.arc(x+h.bx+sw+Math.cos(p*.8)*6.5,h.by+Math.sin(p*.8)*4.5,4,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  });
}
function drawSvcSprite(ctx,x,y,wobble){
  ctx.strokeStyle='#c05828';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x+wobble*.2,y-44);ctx.stroke();
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-22);ctx.lineTo(x+18,y-50);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y-28);ctx.lineTo(x-16,y-54);ctx.stroke();
  ctx.fillStyle='#f0b090';[[x+wobble*.2,y-44],[x+18,y-50],[x-16,y-54],[x+12,y-56],[x-20,y-62],[x+24,y-60]].forEach(([bx,by])=>{ctx.beginPath();ctx.arc(bx,by,3.8,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#a0a098';ctx.beginPath();ctx.roundRect(x-14,y,28,10,3);ctx.fill();
}
function drawMapleSprite(ctx,x,y,wobble){
  ctx.strokeStyle='#907050';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x,y-34);ctx.stroke();
  [[x,y-20,x+16,y-42],[x,y-20,x-14,y-40],[x,y-28,x+21,y-50],[x,y-28,x-18,y-48],[x,y-34,x+6,y-54],[x,y-34,x-6,y-52]].forEach(([x1,y1,x2,y2])=>{ctx.strokeStyle='#807040';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();});
  ctx.fillStyle='#909090';ctx.beginPath();ctx.roundRect(x-12,y,24,10,3);ctx.fill();
}
function drawRoseBushSprite(ctx,x,y,wobble){
  ctx.strokeStyle='#6a8040';ctx.lineWidth=2;
  for(let i=0;i<5;i++){const a=(i/5)*Math.PI*1.7-Math.PI*.85;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*23+wobble*.3,y+Math.sin(a)*26-18);ctx.stroke();}
  ctx.fillStyle='#a04060';ctx.beginPath();ctx.arc(x+wobble*.3,y-25,4,0,Math.PI*2);ctx.fill();
}
function drawWormSprite(ctx,x,y,f){const w=Math.sin(f*.08)*3.5;ctx.strokeStyle='#c09870';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-11,y+w);ctx.bezierCurveTo(x-4,y-7-w,x+4,y+7+w,x+11,y-w);ctx.stroke();ctx.fillStyle='#d0a880';ctx.beginPath();ctx.arc(x+11,y-w,4,0,Math.PI*2);ctx.fill();}
function drawStonePotSprite(ctx,x,y){ctx.fillStyle='#c8b890';ctx.beginPath();ctx.roundRect(x-17,y-6,34,24,10);ctx.fill();ctx.strokeStyle='rgba(140,120,80,.5)';ctx.lineWidth=.5;for(let li=0;li<4;li++) ctx.strokeRect(x-12+li*6,y-2,4,14);ctx.fillStyle='#b0a070';ctx.beginPath();ctx.roundRect(x-16,y-8,32,5,3);ctx.fill();ctx.fillStyle='#8a6840';ctx.beginPath();ctx.ellipse(x,y-5,13,5,0,0,Math.PI*2);ctx.fill();}
function drawEmptyPotSprite(ctx,x,y,color){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.fillStyle=color+'22';ctx.beginPath();ctx.moveTo(x-13,y-5);ctx.lineTo(x-11,y+10);ctx.lineTo(x+11,y+10);ctx.lineTo(x+13,y-5);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(x,y-5,13,4,0,0,Math.PI*2);ctx.stroke();}
function drawCookieSprite(ctx,cx,cy,f){
  const blink=Math.floor(f/80)%8===0,tw=Math.sin(f*.055)*9;
  ctx.fillStyle='rgba(255,245,190,.22)';ctx.beginPath();ctx.ellipse(cx+4,cy+7,24,9,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1e1e1e';ctx.beginPath();ctx.roundRect(cx-13,cy-7,27,14,7);ctx.fill();
  ctx.fillStyle='#f0f0f0';ctx.beginPath();ctx.roundRect(cx-5,cy-5,13,9,4);ctx.fill();
  ctx.fillStyle='#1e1e1e';ctx.beginPath();ctx.arc(cx-9,cy-11,11,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f0f0f0';ctx.beginPath();ctx.arc(cx-8,cy-10,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1e1e1e';ctx.beginPath();ctx.moveTo(cx-18,cy-17);ctx.lineTo(cx-13,cy-25);ctx.lineTo(cx-8,cy-17);ctx.fill();
  ctx.beginPath();ctx.moveTo(cx-9,cy-18);ctx.lineTo(cx-4,cy-25);ctx.lineTo(cx+1,cy-17);ctx.fill();
  if(!blink){ctx.fillStyle='#48c848';ctx.beginPath();ctx.ellipse(cx-12,cy-10,3,2,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(cx-6,cy-10,3,2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(cx-12,cy-10,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(cx-6,cy-10,1.5,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#1e1e1e';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(cx+14,cy);ctx.bezierCurveTo(cx+25,cy-3,cx+31,cy-11-tw,cx+26,cy-22-tw);ctx.stroke();
}


function PlantBriefing({ plant, careLog, weather, portraits, photos = [] }) {
  const [briefing, setBriefing] = useState(null);
  useEffect(() => {
    setBriefing(null);
    let isMounted = true;
    fetchPlantBriefing(plant, careLog, weather, portraits, { [plant.id]: photos })
      .then(b => { if (isMounted) setBriefing(b); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [plant.id, plant.health, photos.length]);
  const note = briefing?.note || (typeof briefing === 'string' ? briefing : null);
  if (!note) return null;
  return (
    <div style={{ padding:'12px 22px', borderBottom:'1px solid rgba(160,130,80,0.10)',
      fontStyle:'italic', fontSize:12.5, lineHeight:1.6,
      color:'rgba(212,190,140,0.78)' }}>
      {note}
    </div>
  );
}

// ── PLANT CARD ────────────────────────────────────────────────────────────
function PlantCard({ plant, careLog, onSelect, isSelected, seasonOpen, portrait, photos = [] }) {
  const history = careLog[plant.id] || [];
  const lastAction = history.length > 0 ? history[history.length-1] : null;
  const URGENT = new Set(['thirsty','overlooked','struggling']);
  const needsCare = seasonOpen && URGENT.has(plant.health);
  const color = plantColor(plant.type);
  const hColor = healthColor(plant.health);
  const hasPhoto = photos.length > 0;
  const needsDoc = !seasonOpen && !hasPhoto && plant.health !== 'memorial' && plant.type !== 'empty-pot';
  const healthLevel = HEALTH_LEVEL[plant.health] ?? 0.5;
  const waterLevel = computeWaterLevel(plant, careLog, portrait || null);
  const needsWater = plant.actions?.includes('water');

  return (
    <div onClick={() => onSelect(plant)}
      style={{
        background: C.cardBg,
        border: isSelected ? `2px solid ${color}` : needsDoc ? '1.5px solid rgba(212,168,48,0.50)' : `1px solid ${C.cardBorder}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all .18s ease',
        boxShadow: isSelected
          ? `0 6px 24px ${color}28, 0 2px 8px ${C.cardShadow}`
          : `0 2px 8px ${C.cardShadow}`,
        transform: isSelected ? 'translateY(-2px)' : 'none',
      }}>

      {/* Portrait illustration */}
      <div style={{height:164, background:`linear-gradient(170deg,${color}14 0%,${color}04 100%)`,
        position:'relative', overflow:'hidden'}}>
        <PlantPortrait plant={plant} aiSvg={portrait?.svg}/>

        {needsDoc && !portrait?.analyzing && (
          <div style={{position:'absolute',top:8,left:8,background:'rgba(18,12,6,0.72)',
            border:'1px solid rgba(212,168,48,0.40)',borderRadius:20,padding:'2px 8px'}}>
            <span style={{fontSize:9,color:'rgba(212,168,48,0.80)',fontFamily:MONO,letterSpacing:.3}}>unseen</span>
          </div>
        )}

        {/* Health pill — bottom right, colored to match health state */}
        <div style={{position:'absolute',bottom:8,right:8,display:'flex',alignItems:'center',gap:4,
          background:`${hColor}22`, border:`1px solid ${hColor}55`,
          borderRadius:20, padding:'3px 8px', backdropFilter:'blur(6px)'}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:hColor,flexShrink:0}}/>
          <span style={{fontSize:10,color:hColor,fontFamily:SERIF,fontWeight:600}}>{healthLabel(plant.health)}</span>
        </div>

        {/* Care needed — top left */}
        {needsCare && (
          <div style={{position:'absolute',top:8,left:8,background:color,borderRadius:20,
            padding:'2px 8px',opacity:0.92}}>
            <span style={{fontSize:9,color:'#fff',fontFamily:MONO}}>needs care</span>
          </div>
        )}

        {portrait?.analyzing && (
          <div style={{position:'absolute',top:8,left:8,background:'rgba(18,12,6,0.72)',
            border:'1px solid rgba(212,168,48,0.50)',borderRadius:20,padding:'2px 8px',
            animation:'pulse 1.5s infinite'}}>
            <span style={{fontSize:9,color:'rgba(212,168,48,0.90)',fontFamily:MONO,letterSpacing:.3}}>READING</span>
          </div>
        )}

        {/* Subtle identity color gradient at portrait bottom */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:28,
          background:`linear-gradient(0deg,${color}20 0%,transparent 100%)`}}/>
      </div>

      {/* Card body */}
      <div style={{padding:'10px 12px 11px',
        background:`linear-gradient(180deg,${color}07 0%,transparent 48px)`}}>

        {portrait?.visualNote && !portrait?.analyzing && (
          <div style={{fontSize:11,color:'#907050',fontStyle:'italic',fontFamily:'"Crimson Pro", Georgia, serif',
            lineHeight:1.55,marginBottom:7,paddingTop:1,opacity:0.88}}>
            {portrait.visualNote}
          </div>
        )}

        {/* Name row */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:2}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,color:'#2a1808',fontWeight:600,lineHeight:1.2,fontFamily:SERIF}}>{plant.name}</div>
            {plant.subtitle && (
              <div style={{fontSize:12,color:color,marginTop:2,fontFamily:SERIF,fontStyle:'italic',opacity:0.85}}>
                {plant.subtitle}
              </div>
            )}
          </div>
          <span style={{fontSize:15,flexShrink:0,marginLeft:6,opacity:0.8}}>{typeEmoji(plant.type)}</span>
        </div>

        {/* Current stage — prominent */}
        {portrait?.currentStage && (
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7,marginTop:4}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0,opacity:0.75}}/>
            <span style={{fontSize:13,color:color,fontFamily:SERIF,fontStyle:'italic',fontWeight:600,opacity:0.92}}>
              {portrait.currentStage}
            </span>
          </div>
        )}

        {/* Stage arc — full progression */}
        {portrait?.stages?.length > 1 && portrait?.currentStage && (() => {
          const stages = portrait.stages;
          const currentIdx = stages.indexOf(portrait.currentStage);
          return (
            <div style={{display:'flex',alignItems:'center',gap:0,flexWrap:'wrap',rowGap:3,marginBottom:8}}>
              {stages.map((s, i) => {
                const isCurrent = i === currentIdx;
                const isPast = currentIdx >= 0 && i < currentIdx;
                return (
                  <React.Fragment key={s}>
                    {i > 0 && <div style={{width:8,height:1,flexShrink:0,
                      background:isPast?`${color}50`:'rgba(160,130,80,0.18)'}}/>}
                    <span style={{fontFamily:SERIF,fontSize:isCurrent?12:10,fontStyle:'italic',
                      color:isCurrent?color:isPast?`${color}70`:'rgba(160,130,80,0.40)',
                      fontWeight:isCurrent?600:400,
                      textDecoration:isPast?'line-through':'none',
                      whiteSpace:'nowrap'}}>
                      {s}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}

        {/* Species · container */}
        {(plant.species || plant.container) && (
          <div style={{fontSize:10,color:'#a08060',fontStyle:'italic',marginBottom:7,fontFamily:SERIF,lineHeight:1.4}}>
            {plant.species}
            {plant.species && plant.container && <span style={{opacity:0.55}}> · </span>}
            {plant.container && <span style={{opacity:0.7}}>{plant.container}</span>}
          </div>
        )}

        {/* Special badges */}
        {plant.special === 'wedding' && (
          <div style={{fontSize:10,color:'#c06040',marginBottom:6,fontFamily:SERIF,
            display:'flex',alignItems:'center',gap:3}}>
            <span style={{fontSize:11}}>♥</span> Wedding gift for Emma
          </div>
        )}
        {plant.special === 'gift' && (
          <div style={{fontSize:10,color:'#5080a8',marginBottom:6,fontFamily:SERIF}}>★ From Lexie</div>
        )}
        {plant.special === 'xmas' && (
          <div style={{fontSize:10,color:'#806020',marginBottom:6,fontFamily:SERIF}}>🎄 Was the Christmas tree</div>
        )}

        {/* Health + water bars */}
        {plant.health !== 'memorial' && plant.type !== 'empty-pot' && (
          <div style={{marginBottom:8,marginTop:4,display:'flex',flexDirection:'column',gap:4}}>
            {/* Health bar */}
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:9,color:'rgba(160,130,80,0.55)',fontFamily:MONO,width:36,flexShrink:0,letterSpacing:.2}}>HEALTH</span>
              <div style={{flex:1,height:3,background:'rgba(160,130,80,0.12)',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${healthLevel*100}%`,
                  background:healthLevel>=0.75?'#58c030':healthLevel>=0.5?'#a8c820':healthLevel>=0.25?'#d4820a':'#c83020',
                  borderRadius:2,transition:'width .4s'}}/>
              </div>
            </div>
            {/* Water bar */}
            {needsWater && (
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,color:'rgba(160,130,80,0.55)',fontFamily:MONO,width:36,flexShrink:0,letterSpacing:.2}}>WATER</span>
                <div style={{flex:1,height:3,background:'rgba(160,130,80,0.12)',borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${waterLevel*100}%`,
                    background:waterLevel>=0.6?'#4a8ac8':waterLevel>=0.3?'#7aa8d0':'#c87030',
                    borderRadius:2,transition:'width .4s'}}/>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer: last action */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          paddingTop:6,borderTop:`1px solid ${color}1a`}}>
          <span style={{fontSize:10,color:'#a08060',fontFamily:SERIF}}>
            {lastAction
              ? `${lastAction.emoji} ${lastAction.label} · ${fmtDate(lastAction.date)}`
              : 'No history yet'}
          </span>
          {history.length > 0 && (
            <span style={{fontSize:10,color:color,fontFamily:SERIF,opacity:0.8}}>{history.length}×</span>
          )}
        </div>
        <PlantBriefing plant={plant} careLog={careLog} weather={null} portraits={portrait ? {[plant.id]: portrait} : {}} photos={photos}/>
      </div>
    </div>
  );
}

// ── PHOTO SECTION ─────────────────────────────────────────────────────────
function PhotoSection({ plant, color, careLog, onAnalyze, portraits, photos = [], onAddPhoto, onGrowthUpdate }) {
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const dataUrl = await compressImage(file);
    const date = new Date().toISOString();
    onAddPhoto?.(plant.id, dataUrl, date);
    e.target.value = '';
    // Trigger AI analysis in background with full plant context
    if (onAnalyze) {
      onAnalyze(plant.id, { analyzing: true });
      const plantEntries = (careLog[plant.id] || []).slice().reverse(); // recent-first
      const portrait = portraits?.[plant.id] || {};
      const plantHistory = (portrait.history || []).slice(-5); // last 5 observations
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fetch('/api/analyze-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          plantName: plant.name,
          plantType: plant.type,
          plantSpecies: plant.species || '',
          today: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          careLog: plantEntries,
          plantHistory,
          plantContext: {
            health: plant.health,
            container: plant.container,
            poem: plant.poem,
            lore: plant.lore,
            special: plant.special,
          },
        }),
      })
        .then(r => r.json())
        .then(({ analysis, svg }) => {
          onAnalyze(plant.id, {
            svg: svg || null,
            visualNote: analysis?.visualNote || null,
            growth: analysis?.growth ?? null,
            bloomState: analysis?.bloomState || null,
            foliageState: analysis?.foliageState || null,
            analyzing: false,
            date: new Date().toISOString(),
          });
          if (analysis?.growth != null) {
            onGrowthUpdate?.(plant.id, analysis.growth);
          }
        })
        .catch(() => onAnalyze(plant.id, { analyzing: false }));
    }
  }

  const lastPhoto = photos[photos.length - 1];
  return (
    <div style={{marginBottom:14,borderRadius:8,overflow:'hidden',border:`1px solid ${color}22`}}>
      {lastPhoto ? (
        <img src={lastPhoto.dataUrl || lastPhoto.url} alt={plant.name}
          onError={e => { e.target.style.display='none'; }}
          style={{width:'100%',maxHeight:200,objectFit:'cover',display:'block'}}/>
      ) : (
        <div style={{height:72,display:'flex',alignItems:'center',justifyContent:'center',
          background:`${color}07`,color:'#b09070',fontFamily:SERIF,fontSize:13,fontStyle:'italic'}}>
          No photos yet this season
        </div>
      )}
      <div style={{padding:'7px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',
        background:`${color}06`,borderTop:`1px solid ${color}15`}}>
        <span style={{fontFamily:SERIF,fontSize:12,color:'#907050'}}>
          {photos.length === 0
            ? 'Document its season'
            : `${photos.length} photo${photos.length > 1 ? 's' : ''} · last ${fmtDate(lastPhoto.date)}`}
        </span>
        <button onClick={() => fileRef.current?.click()}
          style={{background:color,border:'none',borderRadius:4,padding:'5px 11px',
            color:'#fff',cursor:'pointer',fontFamily:MONO,fontSize:7,letterSpacing:.5}}>
          📷 ADD
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{display:'none'}} onChange={handleFile}/>
    </div>
  );
}

// ── ACTION MODAL — "help me do it" / "I did it" ───────────────────────────
const AFFIRMATIONS = {
  fertilize: ['Feeding logged. Watch for new growth in 7–10 days.', 'Nutrients in. Good timing.'],
  neem:      ['Pest prevention logged. Let it dry before any rain.', 'Logged — good preventive care.'],
  prune:     ['Logged. Clean cuts mean strong growth.', 'Pruning directs the plant\'s energy. Good work.'],
  train:     ['Training logged. Directional growth shapes the whole season.', 'Logged — patience pays off.'],
  repot:     ['Logged. Keep water consistent for the next few weeks.', 'Big move. New roots incoming.'],
  worms:     ['Soil biology logged.', 'Worm castings noted — good long-term investment.'],
};
function getAffirmation(key) {
  const arr = AFFIRMATIONS[key] || ['Logged.'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseOracleMsg(raw) {
  let text = raw || '';
  let diagram = null, photoRequest = null;
  const dM = text.match(/<diagram>([\s\S]*?)<\/diagram>/);
  if (dM) {
    const svg = dM[1].trim();
    if (svg.startsWith('<svg')) diagram = svg;
    text = text.replace(dM[0], '').trim();
  }
  const pM = text.match(/<photo-request>([\s\S]*?)<\/photo-request>/);
  if (pM) { photoRequest = pM[1].trim(); text = text.replace(pM[0], '').trim(); }
  return { text: text.trim(), diagram, photoRequest };
}

function ActionModal({ plant, actionKey, task = null, careLog, portraits, weather, onLog, onClose }) {
  const def = ACTION_DEFS[actionKey] || { emoji: task?.emoji || '✨', label: task?.label || actionKey };
  const color = plantColor(plant.type);
  const [mode, setMode] = useState(null); // null | 'confirm' | 'help'

  // confirm mode
  const [confirmPhoto, setConfirmPhoto] = useState(null);
  const [confirmFeedback, setConfirmFeedback] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const confirmFileRef = useRef(null);

  // help/chat mode
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatPhoto, setChatPhoto] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [logged, setLogged] = useState(false);
  const chatFileRef = useRef(null);
  const chatEndRef = useRef(null);

  function buildContext() {
    const portrait = portraits?.[plant.id] || {};
    const next3 = weather?.forecast?.slice(0, 3).map(d =>
      `${d.date}: ${d.label} ${d.high}°/${d.low}°F, ${d.precipChance}% rain`
    ).join('; ') ?? '';
    return {
      name: plant.name, species: plant.species, type: plant.type,
      health: plant.health, container: plant.container,
      visualNote: portrait.visualNote, stage: portrait.currentStage,
      careHistory: (careLog[plant.id] || []).slice(-5),
      forecast: next3 || null,
    };
  }

  useEffect(() => {
    if (mode === 'help' && messages.length === 0) {
      const initMsg = task?.instructions
        ? `I'm about to work on "${task.label}" for my ${plant.name}. Context: ${task.instructions} Walk me through it step by step.`
        : `I'm about to ${def.label.toLowerCase()} my ${plant.name} right now. Walk me through exactly what to do.`;
      sendChat(initMsg);
    }
  }, [mode]); // eslint-disable-line

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendChat(text, images = []) {
    const userMsg = { role: 'user', content: text, ...(images.length ? { images } : {}) };
    const nextMsgs = [...messages, userMsg];
    setMessages([...nextMsgs, { role: 'assistant', content: '' }]);
    setInput(''); setChatPhoto(null); setChatLoading(true);
    try {
      await streamGardenChat({
        messages: nextMsgs, plantContext: buildContext(), action: def.label,
        onChunk: chunk => setMessages(m => {
          const c = [...m];
          c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + chunk };
          return c;
        }),
      });
    } catch {
      setMessages(m => { const c=[...m]; c[c.length-1]={...c[c.length-1],content:'Could not reach the oracle.'}; return c; });
    }
    setChatLoading(false);
    // Parse diagram/photo-request tags out of the final streamed response
    setMessages(m => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last?.role !== 'assistant') return c;
      const { text: cleanText, diagram, photoRequest } = parseOracleMsg(last.content);
      c[c.length - 1] = { ...last, content: cleanText, ...(diagram ? { diagram } : {}), ...(photoRequest ? { photoRequest } : {}) };
      return c;
    });
  }

  async function sendConfirmPhoto(dataUrl) {
    setConfirmPhoto(dataUrl); setConfirmLoading(true);
    let feedback = '';
    try {
      await streamGardenChat({
        messages: [{ role: 'user', content: `I just ${def.label.toLowerCase()}d my ${plant.name}. Here's a photo — did I do it right? One or two sentences.`, images: [dataUrl] }],
        plantContext: buildContext(), action: def.label,
        onChunk: chunk => { feedback += chunk; setConfirmFeedback(feedback); },
      });
    } catch { setConfirmFeedback(getAffirmation(actionKey)); }
    if (!feedback) setConfirmFeedback(getAffirmation(actionKey));
    setConfirmLoading(false);
  }

  function readPhoto(file) { return compressChatImage(file); }

  // ── Mode chooser ──────────────────────────────────────────────────────────
  if (!mode) return (
    <div style={{ position:'absolute', inset:0, background:'#faf6ee', zIndex:20,
      display:'flex', flexDirection:'column', fontFamily:SERIF, padding:'18px 16px', overflowY:'auto' }}>
      <button onClick={onClose} style={{ alignSelf:'flex-start', background:'none', border:'none',
        color:'#b09070', cursor:'pointer', fontSize:13, fontFamily:SERIF, marginBottom:14, padding:0 }}>
        ← back
      </button>
      <div style={{ fontSize:26, marginBottom:4 }}>{def.emoji}</div>
      <div style={{ fontSize:18, color:'#2a1808', fontWeight:600, fontFamily:SERIF }}>{def.label}</div>
      <div style={{ fontSize:12, color:'#907050', fontStyle:'italic', fontFamily:SERIF, marginBottom:22 }}>{plant.name}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={() => setMode('help')}
          style={{ display:'flex', alignItems:'flex-start', gap:12, background:'#fff',
            border:`1.5px solid ${color}45`, borderRadius:10, padding:'13px 13px',
            cursor:'pointer', textAlign:'left', boxShadow:`0 2px 8px ${color}12`, transition:'all .12s' }}>
          <span style={{ fontSize:22, marginTop:2 }}>🌿</span>
          <div>
            <div style={{ fontSize:14, color:'#2a1808', fontFamily:SERIF, fontWeight:600, marginBottom:3 }}>
              Walk me through it
            </div>
            <div style={{ fontSize:11.5, color:'#907050', fontFamily:SERIF, lineHeight:1.5 }}>
              Step-by-step guidance. Ask questions, share photos while you work.
            </div>
          </div>
        </button>
        <button onClick={() => setMode('confirm')}
          style={{ display:'flex', alignItems:'flex-start', gap:12, background:'#fff',
            border:`1px solid rgba(160,130,80,0.28)`, borderRadius:10, padding:'13px 13px',
            cursor:'pointer', textAlign:'left', transition:'all .12s' }}>
          <span style={{ fontSize:22, marginTop:2 }}>✓</span>
          <div>
            <div style={{ fontSize:14, color:'#2a1808', fontFamily:SERIF, fontWeight:600, marginBottom:3 }}>
              I already did it
            </div>
            <div style={{ fontSize:11.5, color:'#907050', fontFamily:SERIF, lineHeight:1.5 }}>
              Log it now. Add a photo if you want feedback.
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  // ── Confirm mode ──────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    if (confirmed) return (
      <div style={{ position:'absolute', inset:0, background:'#faf6ee', zIndex:20,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        fontFamily:SERIF, padding:24, textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:10 }}>✓</div>
        <div style={{ fontSize:16, color:'#2a1808', fontWeight:600, marginBottom:8 }}>
          {def.label} logged
        </div>
        {confirmFeedback && (
          <div style={{ fontSize:13, color:'#605040', fontStyle:'italic', lineHeight:1.75,
            maxWidth:250, marginBottom:22, fontFamily:SERIF }}>{confirmFeedback}</div>
        )}
        <button onClick={onClose}
          style={{ background:color, border:'none', borderRadius:6, padding:'8px 24px',
            color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:8 }}>DONE</button>
      </div>
    );
    return (
      <div style={{ position:'absolute', inset:0, background:'#faf6ee', zIndex:20,
        display:'flex', flexDirection:'column', fontFamily:SERIF, padding:'18px 16px', overflowY:'auto' }}>
        <button onClick={() => setMode(null)} style={{ alignSelf:'flex-start', background:'none', border:'none',
          color:'#b09070', cursor:'pointer', fontSize:13, fontFamily:SERIF, marginBottom:14, padding:0 }}>
          ← back
        </button>
        <div style={{ fontSize:14, color:'#2a1808', fontWeight:600, marginBottom:4, fontFamily:SERIF }}>
          {def.emoji} {def.label} — {plant.name}
        </div>
        <div style={{ fontSize:12, color:'#907050', marginBottom:18, fontFamily:SERIF }}>
          Add a photo for feedback, or log it directly.
        </div>
        {confirmPhoto ? (
          <div style={{ marginBottom:14 }}>
            <img src={confirmPhoto} alt="" style={{ width:'100%', borderRadius:8, marginBottom:10,
              maxHeight:160, objectFit:'cover' }}/>
            {confirmLoading ? (
              <div style={{ fontSize:12, color:'#c0a880', fontStyle:'italic', fontFamily:SERIF }}>Reviewing…</div>
            ) : confirmFeedback ? (
              <div style={{ fontSize:13, color:'#4a2c10', fontStyle:'italic', lineHeight:1.75,
                fontFamily:SERIF, marginBottom:14 }}>{confirmFeedback}</div>
            ) : null}
          </div>
        ) : (
          <button onClick={() => confirmFileRef.current?.click()}
            style={{ display:'flex', alignItems:'center', gap:10, background:'#fff',
              border:`1px solid ${color}40`, borderRadius:8, padding:'11px 13px',
              cursor:'pointer', marginBottom:10, textAlign:'left' }}>
            <span style={{ fontSize:20 }}>📷</span>
            <div>
              <div style={{ fontSize:13, color:'#2a1808', fontFamily:SERIF, fontWeight:600 }}>Add a photo</div>
              <div style={{ fontSize:11, color:'#907050', fontFamily:SERIF }}>Get feedback from the oracle</div>
            </div>
          </button>
        )}
        <input ref={confirmFileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={async e => { const f = e.target.files?.[0]; if (f) readPhoto(f).then(sendConfirmPhoto).catch(e => console.warn('confirm photo read failed', e)); }}/>
        <button
          onClick={() => { onLog(); if (!confirmPhoto) setConfirmFeedback(getAffirmation(actionKey)); setConfirmed(true); }}
          disabled={confirmPhoto && !confirmFeedback}
          style={{ background:color, border:'none', borderRadius:6, padding:'10px',
            color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:8,
            opacity:(confirmPhoto && !confirmFeedback) ? 0.4 : 1, marginBottom:8 }}>
          ✓ LOG IT
        </button>
        {!confirmPhoto && (
          <button onClick={() => { onLog(); setConfirmed(true); setConfirmFeedback(getAffirmation(actionKey)); }}
            style={{ background:'none', border:'none', color:'#b09070', cursor:'pointer',
              fontSize:12, fontFamily:SERIF, padding:'2px 0' }}>
            Skip photo — log now
          </button>
        )}
      </div>
    );
  }

  // ── Help / chat mode ──────────────────────────────────────────────────────
  return (
    <div style={{ position:'absolute', inset:0, background:'#f5ede0', zIndex:20,
      display:'flex', flexDirection:'column', fontFamily:SERIF }}>

      {/* Header bar */}
      <div style={{ padding:'9px 13px', borderBottom:`1px solid rgba(160,130,80,0.22)`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background:'rgba(245,237,224,0.98)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <button onClick={() => setMode(null)} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:13, fontFamily:SERIF, padding:'0 10px 0 0' }}>←</button>
          <span style={{ fontSize:13, color:'#4a2c10', fontWeight:600 }}>{def.emoji} {def.label}</span>
          <span style={{ fontSize:11, color:'#a08060', marginLeft:7, fontStyle:'italic' }}>{plant.name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!logged ? (
            <button onClick={() => { onLog(); setLogged(true); }}
              style={{ background:color, border:'none', borderRadius:6, padding:'5px 10px',
                color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:7, letterSpacing:.3 }}>
              ✓ DONE
            </button>
          ) : (
            <span style={{ fontSize:11, color:'#5a9040', fontFamily:SERIF }}>✓ Logged</span>
          )}
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:22, padding:'0 4px', lineHeight:1,
            opacity: logged ? 1 : 0.6 }}>&times;</button>
        </div>
      </div>

      {/* Message thread */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 13px 6px', display:'flex', flexDirection:'column', gap:10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column',
            alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.images?.length > 0 && (
              <img src={m.images[0]} alt="" style={{ width:110, height:82, borderRadius:6,
                marginBottom:4, objectFit:'cover', alignSelf:'flex-end' }}/>
            )}
            <div style={{
              maxWidth:'90%', padding:'8px 11px',
              borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: m.role === 'user' ? color+'1e' : '#fff',
              border: m.role === 'user' ? `1px solid ${color}38` : '1px solid rgba(160,130,80,0.18)',
              fontSize:13, color:'#2a1808', lineHeight:1.65,
              fontStyle: m.role === 'assistant' ? 'italic' : 'normal',
            }}>
              {(m.content || '').replace(/<(diagram|photo-request)>[\s\S]*/g, '').trim() || (chatLoading && i === messages.length - 1 ? '…' : '')}
            </div>
            {m.photoRequest && (
              <div style={{ marginTop:5, background:'rgba(212,168,48,0.08)',
                border:'1px solid rgba(212,168,48,0.32)', borderRadius:7, padding:'7px 10px',
                display:'flex', alignItems:'center', gap:8, maxWidth:'90%' }}>
                <span style={{ fontSize:13 }}>📷</span>
                <span style={{ flex:1, fontSize:12, color:'#6a4010', fontStyle:'italic', lineHeight:1.5 }}>{m.photoRequest}</span>
                <button onClick={() => chatFileRef.current?.click()}
                  style={{ background:'#d4a830', border:'none', borderRadius:5, padding:'5px 8px',
                    color:'#fff', cursor:'pointer', fontSize:11, fontFamily:SERIF, flexShrink:0 }}>
                  📷 Send
                </button>
              </div>
            )}
            {m.diagram && (
              <div style={{ marginTop:5, borderRadius:7, overflow:'hidden',
                border:'1px solid rgba(160,130,80,0.22)', maxWidth:220, alignSelf:'flex-start' }}
                dangerouslySetInnerHTML={{ __html: m.diagram }}/>
            )}
          </div>
        ))}
        <div ref={chatEndRef}/>
      </div>

      {/* Input row */}
      <div style={{ padding:'8px 10px', borderTop:`1px solid rgba(160,130,80,0.18)`,
        background:'rgba(245,237,224,0.98)', flexShrink:0 }}>
        {chatPhoto && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
            <img src={chatPhoto} alt="" style={{ width:44, height:44, borderRadius:4, objectFit:'cover' }}/>
            <button onClick={() => setChatPhoto(null)}
              style={{ background:'none', border:'none', color:'#b09070', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
        )}
        <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
          <button onClick={() => chatFileRef.current?.click()}
            style={{ background:'#fff', border:`1px solid rgba(160,130,80,0.28)`, borderRadius:6,
              padding:'7px 8px', cursor:'pointer', fontSize:17, flexShrink:0, lineHeight:1 }}>📷</button>
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if ((input.trim() || chatPhoto) && !chatLoading) sendChat(input.trim(), chatPhoto ? [chatPhoto] : []);
              }
            }}
            placeholder="Ask anything…" rows={1}
            style={{ flex:1, border:`1px solid rgba(160,130,80,0.25)`, borderRadius:6,
              padding:'8px 10px', fontSize:13, fontFamily:SERIF, background:'#fff',
              resize:'none', color:'#2a1808', outline:'none', lineHeight:1.5 }}/>
          <button
            onClick={() => { if ((input.trim() || chatPhoto) && !chatLoading) sendChat(input.trim(), chatPhoto ? [chatPhoto] : []); }}
            disabled={chatLoading || (!input.trim() && !chatPhoto)}
            style={{ background:color, border:'none', borderRadius:6, padding:'8px 12px',
              color:'#fff', cursor:'pointer', fontFamily:SERIF, fontSize:14, flexShrink:0,
              opacity:(chatLoading || (!input.trim() && !chatPhoto)) ? 0.4 : 1 }}>→</button>
        </div>
        <input ref={chatFileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={async e => { const f = e.target.files?.[0]; if (f) readPhoto(f).then(setChatPhoto).catch(e => console.warn('chat photo read failed', e)); }}/>
      </div>
    </div>
  );
}

// ── STAGE ARC (desktop) ────────────────────────────────────────────────────
function StageArc({ stages, currentStage, color }) {
  if (!stages || stages.length < 2) return null;
  const currentIdx = stages.indexOf(currentStage);
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid rgba(160,130,80,0.12)`, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', rowGap: 4 }}>
        {stages.map((s, i) => {
          const isCurrent = i === currentIdx;
          const isPast = currentIdx >= 0 && i < currentIdx;
          return (
            <React.Fragment key={s}>
              {i > 0 && (
                <div style={{
                  width: 10, height: 1, flexShrink: 0,
                  background: isPast ? `${color}60` : 'rgba(160,130,80,0.20)',
                }}/>
              )}
              <span style={{
                fontFamily: SERIF,
                fontSize: 11,
                fontStyle: 'italic',
                color: isCurrent ? color : isPast ? `${color}70` : 'rgba(160,130,80,0.40)',
                textDecoration: isPast ? 'line-through' : 'none',
                fontWeight: isCurrent ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {s}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── DETAIL PANEL ──────────────────────────────────────────────────────────
function parsePastDate(text) {
  const t = (text || '').toLowerCase().trim();
  if (!t) return null;
  const now = new Date();
  if (t === 'today') return now.toISOString();
  if (t === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); }
  const daysAgoM = t.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoM) { const d = new Date(); d.setDate(d.getDate() - parseInt(daysAgoM[1])); return d.toISOString(); }
  const weeksAgoM = t.match(/^(\d+)\s+weeks?\s+ago$/);
  if (weeksAgoM) { const d = new Date(); d.setDate(d.getDate() - parseInt(weeksAgoM[1]) * 7); return d.toISOString(); }
  const DAYS = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
  const weekdayM = t.match(/^(?:last\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayM) {
    const target = DAYS[weekdayM[1]];
    const d = new Date(); let back = (d.getDay() - target + 7) % 7; if (back === 0) back = 7;
    d.setDate(d.getDate() - back); return d.toISOString();
  }
  const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
  const monthDayM = t.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayM) {
    const d = new Date(now.getFullYear(), MONTHS[monthDayM[1]], parseInt(monthDayM[2]));
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  }
  const native = new Date(text);
  if (!isNaN(native.getTime())) return native.toISOString();
  return null;
}

function DetailPanel({ plant, careLog, onClose, onAction, seasonOpen, onAnalyze, portraits, photos, onAddPhoto, onGrowthUpdate, weather, briefings = {}, onDeleteAction }) {
  const [tab, setTab] = useState('care');
  const [actionModal, setActionModal] = useState(null); // { key, task } or null
  const [confirmDeleteDate, setConfirmDeleteDate] = useState(null); // ISO date string of entry pending deletion
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const briefing = briefings[plant.id] && briefings[plant.id] !== 'loading' ? briefings[plant.id] : null;
  const history = careLog[plant.id] || [];
  const color = plantColor(plant.type);

  const handleAction = (key, task = null) => {
    if (key === 'water') { onAction(key, plant); return; }
    setActionModal({ key, task });
  };

  const submitNote = () => {
    const text = noteText.trim();
    if (!text) { setNoteOpen(false); return; }
    const customDate = parsePastDate(noteDate) || null;
    onAction('note', plant, text, customDate);
    setNoteText(''); setNoteDate(''); setNoteOpen(false);
  };

  return (
    <div style={{width:320,flexShrink:0,background:'#faf6ee',borderLeft:`1px solid ${C.cardBorder}`,
      display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',
      animation:'slideIn .16s ease',boxShadow:'-4px 0 20px rgba(100,70,30,0.08)'}}>

      {/* Header */}
      <div style={{padding:'12px 14px 0',borderBottom:`1px solid ${C.cardBorder}`}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
          <div>
            <div style={{fontSize:18,color:'#2a1808',fontWeight:600,fontFamily:SERIF}}>{plant.name}</div>
            {plant.subtitle&&<div style={{fontSize:12,color:'#907050',fontFamily:SERIF}}>{plant.subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#b09070',cursor:'pointer',fontSize:22,padding:0,lineHeight:1}}>&times;</button>
        </div>
        {/* Tabs */}
        <div style={{display:'flex',gap:0}}>
          {['history','care'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,background:'none',border:'none',borderBottom:tab===t?`2px solid ${color}`:'2px solid transparent',
                padding:'6px 0',color:tab===t?color:'#a08060',fontFamily:MONO,fontSize:7,cursor:'pointer',letterSpacing:.5,transition:'all .1s'}}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'14px'}}>

        {/* HISTORY TAB */}
        {tab==='history'&&(
          <>
            {/* Portrait */}
            <div style={{height:140,background:`${color}08`,borderRadius:8,overflow:'hidden',marginBottom:12,
              border:`1px solid ${color}20`}}>
              <PlantPortrait plant={plant} aiSvg={portraits?.[plant.id]?.svg}/>
            </div>
            {/* Stage arc */}
            {(() => { const p = portraits?.[plant.id]; return p?.stages?.length > 1 ? <StageArc stages={p.stages} currentStage={p.currentStage} color={color}/> : null; })()}

            {/* Photo section */}
            {plant.type !== 'empty-pot' && plant.health !== 'memorial' && (
              <PhotoSection plant={plant} color={color} careLog={careLog} onAnalyze={onAnalyze}
                portraits={portraits} photos={photos} onAddPhoto={onAddPhoto} onGrowthUpdate={onGrowthUpdate}/>
            )}

            {/* Badges */}
            <div style={{marginBottom:10}}>
              {plant.special==='wedding'&&<div style={{fontSize:11,color:'#a07030',marginBottom:4,fontFamily:SERIF}}>♥ Wedding gift for Emma</div>}
              {plant.special==='gift'&&<div style={{fontSize:11,color:'#5080a8',marginBottom:4,fontFamily:SERIF}}>★ From Lexie</div>}
              {plant.special==='xmas'&&<div style={{fontSize:11,color:'#806020',marginBottom:4,fontFamily:SERIF}}>🎄 Was the Christmas tree</div>}
              {plant.special==='zephirine'&&<div style={{fontSize:11,color:'#c03058',marginBottom:4,fontFamily:SERIF}}>🌹 Thornless · Deep pink · Fragrant</div>}
            </div>
            {/* Last photo observation */}
            {portraits?.[plant.id]?.visualNote && !portraits?.[plant.id]?.analyzing && (
              <div style={{fontSize:11.5, color:'#907050', fontStyle:'italic', fontFamily:SERIF,
                lineHeight:1.6, marginBottom:12, paddingBottom:12,
                borderBottom:`1px solid ${color}18`}}>
                {portraits[plant.id].visualNote}
              </div>
            )}
            {/* History log */}
            <div style={{fontFamily:MONO,fontSize:7,color:'#a08060',marginBottom:8,letterSpacing:.5}}>
              SEASON 2 LOG
            </div>
            {history.length===0 ? (
              <div style={{fontSize:13,color:'#b09070',fontStyle:'italic',fontFamily:SERIF,lineHeight:1.7}}>
                No care logged yet this season.
                {seasonOpen ? ' Tend this plant to begin its story.' : ''}
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {[...history].reverse().map((e,i)=>{
                  const isPendingDelete = confirmDeleteDate === e.date;
                  const isRain = e.action === 'rain';
                  return (
                    <div key={`${e.date}_${e.action}_${i}`} style={{padding:'8px 0',
                      borderBottom:i<history.length-1?`1px solid rgba(160,130,80,0.12)`:'none',
                      ...(isRain ? {background:'rgba(80,140,200,0.07)',borderRadius:6,padding:'8px 8px',margin:'0 -8px'} : {})}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                        <span style={{fontSize:14,flexShrink:0}}>{e.emoji}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color: isRain ? '#2a5080' : '#2a1808',fontFamily:SERIF}}>{e.label}</div>
                          {e.withEmma&&<div style={{fontSize:11,color:'#a07030',fontFamily:SERIF}}>with Emma ♥</div>}
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:11,color:'#b09070',fontFamily:SERIF,marginBottom:4}}>{fmtDate(e.date)}</div>
                          {onDeleteAction && (
                            <button onClick={()=>setConfirmDeleteDate(isPendingDelete ? null : e.date)}
                              style={{background:'none',border:'none',color:'#c09070',cursor:'pointer',
                                fontSize:11,fontFamily:SERIF,padding:0,opacity:0.6}}>
                              {isPendingDelete ? 'cancel' : '×'}
                            </button>
                          )}
                        </div>
                      </div>
                      {isPendingDelete && (
                        <div style={{marginTop:6,display:'flex',alignItems:'center',gap:8,
                          background:'rgba(200,80,30,0.06)',borderRadius:6,padding:'6px 10px'}}>
                          <span style={{fontSize:12,color:'#a05020',fontFamily:SERIF,flex:1,fontStyle:'italic'}}>
                            Delete this entry?
                          </span>
                          <button
                            onClick={()=>{ onDeleteAction(plant.id, e.date); setConfirmDeleteDate(null); }}
                            style={{background:'rgba(200,80,30,0.15)',border:'1px solid rgba(200,80,30,0.35)',
                              borderRadius:6,padding:'4px 10px',cursor:'pointer',
                              fontSize:12,color:'#a05020',fontFamily:SERIF}}>
                            Delete
                          </button>
                          <button
                            onClick={()=>setConfirmDeleteDate(null)}
                            style={{background:'none',border:'1px solid rgba(160,130,80,0.30)',
                              borderRadius:6,padding:'4px 10px',cursor:'pointer',
                              fontSize:12,color:'#b09070',fontFamily:SERIF}}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CARE TAB */}
        {tab==='care'&&(
          <>
            {/* Empty pot planting ceremony */}
            {plant.type === 'empty-pot' && (
              <div>
                <div style={{fontFamily:MONO, fontSize:7, color:color, letterSpacing:.5, marginBottom:12}}>
                  WHAT WILL YOU PLANT HERE?
                </div>
                <div style={{fontSize:12, color:'#907050', fontFamily:SERIF, lineHeight:1.7, marginBottom:14}}>
                  {plant.container}
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {PLANTING_SUGGESTIONS.map(s => (
                    <button key={s.name}
                      onClick={() => { onAction('plant', {...plant, name: s.name}); }}
                      style={{
                        display:'flex', alignItems:'flex-start', gap:10,
                        background:'#fff', border:`1px solid ${s.color}40`,
                        borderRadius:8, padding:'10px 12px',
                        cursor:'pointer', textAlign:'left',
                        transition:'all .12s',
                      }}>
                      <span style={{fontSize:18, flexShrink:0}}>{s.emoji}</span>
                      <div>
                        <div style={{fontSize:13, color:'#2a1808', fontFamily:SERIF, fontWeight:600, marginBottom:2}}>{s.name}</div>
                        <div style={{fontSize:11, color:'#907050', fontFamily:SERIF, lineHeight:1.5}}>{s.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {plant.type !== 'empty-pot' && (
              <>
                {/* AI Portrait */}
                <div style={{height:150, background:`${color}08`, borderRadius:8, overflow:'hidden',
                  marginBottom:12, border:`1px solid ${color}20`}}>
                  <PlantPortrait plant={plant} aiSvg={portraits?.[plant.id]?.svg}/>
                </div>

                {/* Oracle briefing */}
                {briefing?.note ? (
                  <div style={{fontSize:13, color:'#4a2c10', fontStyle:'italic', fontFamily:SERIF,
                    lineHeight:1.7, marginBottom:14, paddingBottom:14,
                    borderBottom:`1px solid ${color}18`}}>
                    {briefing.note}
                  </div>
                ) : (
                  <div style={{fontSize:11, color:'#c0a880', fontStyle:'italic', fontFamily:SERIF,
                    marginBottom:12}}>Reading the garden…</div>
                )}

                {!seasonOpen && (
                  <div style={{background:'rgba(40,80,120,0.06)',border:'1px solid rgba(60,100,160,0.18)',
                    borderRadius:6,padding:'8px 10px',marginBottom:12}}>
                    <div style={{fontSize:11,color:'#6090b0',fontFamily:SERIF,lineHeight:1.6}}>
                      Care actions unlock when Season 2 opens.
                    </div>
                  </div>
                )}

                {/* Action buttons — AI-generated tasks from briefing */}
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                  {briefing?.tasks?.length > 0 ? (
                    <>
                      {briefing.tasks.map((task, i) => {
                        const isOptional = task.optional === true;
                        return (
                          <button key={task.key + i} onClick={() => handleAction(task.key, task)}
                            style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4,
                              background: isOptional ? 'rgba(80,120,60,0.06)' : 'rgba(180,120,20,0.08)',
                              border: isOptional ? '1px solid rgba(80,120,60,0.22)' : `1.5px solid rgba(180,120,20,0.38)`,
                              borderRadius:8,padding:'10px 12px',cursor:'pointer',
                              transition:'all .12s',textAlign:'left',width:'100%',
                              boxShadow: isOptional ? 'none' : `0 1px 4px rgba(180,120,20,0.08)`}}>
                            <div style={{display:'flex',alignItems:'center',gap:7,width:'100%'}}>
                              <span style={{fontSize:15,opacity: isOptional ? 0.7 : 1}}>
                                {ACTION_DEFS[task.key]?.emoji || '✨'}
                              </span>
                              <span style={{flex:1,fontSize:13,
                                color: isOptional ? '#607050' : '#7a4a08',
                                fontFamily:SERIF,fontWeight:600}}>
                                {task.label}
                              </span>
                              <span style={{fontSize:8,fontFamily:MONO,letterSpacing:.3,
                                color: isOptional ? '#7a9868' : '#b07010',
                                background: isOptional ? 'rgba(80,120,60,0.12)' : 'rgba(180,120,20,0.12)',
                                borderRadius:3,padding:'2px 5px'}}>
                                {isOptional ? 'EXPLORE' : 'NOW'}
                              </span>
                            </div>
                            {task.reason && (
                              <div style={{fontSize:11,color:'#907050',fontStyle:'italic',
                                fontFamily:SERIF,lineHeight:1.5,paddingLeft:22}}>
                                {task.reason}
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {/* Water — always available as a quick option if not in tasks */}
                      {!briefing.tasks.some(t => t.key === 'water') && seasonOpen && (
                        <button onClick={() => handleAction('water')}
                          style={{display:'flex',alignItems:'center',gap:8,
                            background:'#fff',border:`1px solid ${color}30`,
                            borderRadius:8,padding:'9px 12px',cursor:'pointer',
                            transition:'all .12s',textAlign:'left',
                            boxShadow:`0 1px 3px rgba(100,70,30,0.05)`}}>
                          <span style={{fontSize:15}}>💧</span>
                          <span style={{flex:1,fontSize:13,color:'#2a1808',fontFamily:SERIF}}>Water</span>
                        </button>
                      )}
                    </>
                  ) : briefing && briefing.tasks?.length === 0 ? (
                    <>
                      <div style={{fontSize:12,color:'#a09070',fontStyle:'italic',fontFamily:SERIF,
                        marginBottom:6}}>{plant.name} is doing well right now.</div>
                      {seasonOpen && (
                        <button onClick={() => handleAction('water')}
                          style={{display:'flex',alignItems:'center',gap:8,
                            background:'#fff',border:`1px solid ${color}30`,
                            borderRadius:8,padding:'9px 12px',cursor:'pointer',
                            textAlign:'left'}}>
                          <span style={{fontSize:15}}>💧</span>
                          <span style={{flex:1,fontSize:13,color:'#2a1808',fontFamily:SERIF}}>Water</span>
                        </button>
                      )}
                    </>
                  ) : seasonOpen ? (
                    <button onClick={() => handleAction('water')}
                      style={{display:'flex',alignItems:'center',gap:8,
                        background:'#fff',border:`1px solid ${color}30`,
                        borderRadius:8,padding:'9px 12px',cursor:'pointer',textAlign:'left'}}>
                      <span style={{fontSize:15}}>💧</span>
                      <span style={{flex:1,fontSize:13,color:'#2a1808',fontFamily:SERIF}}>Water</span>
                    </button>
                  ) : null}
                </div>

                {/* Add note */}
                <div style={{marginTop:12,borderTop:`1px solid ${color}14`,paddingTop:12}}>
                  <button onClick={() => setNoteOpen(o => !o)}
                    style={{display:'flex',alignItems:'center',gap:8,width:'100%',
                      background:noteOpen?'rgba(212,168,48,0.07)':'transparent',
                      border:`1px solid ${noteOpen?'rgba(212,168,48,0.35)':C.cardBorder}`,
                      borderRadius:8,padding:'8px 12px',cursor:'pointer',transition:'all .1s',textAlign:'left'}}>
                    <span style={{fontSize:14}}>📝</span>
                    <span style={{flex:1,fontSize:12,color:'#907050',fontFamily:SERIF,fontStyle:'italic'}}>
                      Add a note…
                    </span>
                  </button>
                  {noteOpen && (
                    <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:6}}>
                      <div style={{display:'flex',gap:6}}>
                        <input autoFocus type="text" value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') submitNote(); if (e.key === 'Escape') setNoteOpen(false); }}
                          placeholder="What did you do or notice?"
                          style={{flex:1,padding:'8px 11px',background:'rgba(255,255,255,0.8)',
                            border:'1px solid rgba(160,130,80,0.3)',borderRadius:7,
                            fontFamily:SERIF,fontSize:13,color:'#2a1808',outline:'none'}}/>
                        <button onClick={submitNote}
                          style={{padding:'8px 12px',background:'rgba(212,168,48,0.12)',
                            border:'1px solid rgba(212,168,48,0.35)',borderRadius:7,cursor:'pointer',
                            fontFamily:MONO,fontSize:7,color:C.uiGold,letterSpacing:.3}}>
                          LOG
                        </button>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <span style={{fontFamily:MONO,fontSize:6,color:C.uiDim,letterSpacing:.5,flexShrink:0}}>WHEN?</span>
                        <input type="text" value={noteDate}
                          onChange={e => setNoteDate(e.target.value)}
                          placeholder="today · yesterday · last Thursday · March 20"
                          style={{flex:1,padding:'5px 9px',background:'rgba(255,255,255,0.5)',
                            border:'1px solid rgba(160,130,80,0.2)',borderRadius:6,
                            fontFamily:SERIF,fontSize:12,color:'#5a3c18',outline:'none',fontStyle:'italic'}}/>
                      </div>
                      {noteDate.trim() && (() => {
                        const parsed = parsePastDate(noteDate);
                        return parsed ? (
                          <div style={{fontFamily:SERIF,fontSize:11,color:'#6a9a40',fontStyle:'italic',paddingLeft:2}}>
                            → {new Date(parsed).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                          </div>
                        ) : (
                          <div style={{fontFamily:SERIF,fontSize:11,color:'#b07040',fontStyle:'italic',paddingLeft:2}}>
                            couldn't parse date — will log as today
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Action modal — "walk me through it" / "I already did it" */}
      {actionModal && (
        <ActionModal
          plant={plant}
          actionKey={actionModal.key}
          task={actionModal.task}
          careLog={careLog}
          portraits={portraits}
          weather={weather}
          onLog={() => onAction(actionModal.key, plant, actionModal.task?.label)}
          onClose={() => setActionModal(null)}
        />
      )}
    </div>
  );
}

// ── JOURNAL VIEW ──────────────────────────────────────────────────────────

function JournalPortraitCarousel({ plantIds, portraits, allPlants }) {
  const [idx, setIdx] = React.useState(0);
  const safeIdx = Math.min(idx, plantIds.length - 1);
  const plantId = plantIds[safeIdx];
  const plant = allPlants.find(p => p.id === plantId);
  const portrait = portraits[plantId];
  if (!plant || !portrait?.svg) return null;
  const accentColor = plant.color || plantColor(plant.type);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420,
        aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
        border: `2px solid ${accentColor}55`,
        boxShadow: `0 0 0 4px ${accentColor}18, 0 4px 18px rgba(0,0,0,0.10)`,
        background: '#faf6ee',
      }}>
        <PlantPortrait plant={plant} aiSvg={portrait.svg}/>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(30,18,8,0.52))',
          padding: '24px 12px 10px',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 6.5, color: 'rgba(240,228,200,0.90)', letterSpacing: 0.4 }}>
            {plant.name.toUpperCase()}
          </span>
        </div>
        {plantIds.length > 1 && (
          <>
            <button onClick={() => setIdx(i => (i - 1 + plantIds.length) % plantIds.length)}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(240,228,200,0.65)', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent' }}>‹</button>
            <button onClick={() => setIdx(i => (i + 1) % plantIds.length)}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(240,228,200,0.65)', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent' }}>›</button>
          </>
        )}
      </div>
      {plantIds.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 7 }}>
          {plantIds.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              style={{ width: 5, height: 5, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
                background: i === safeIdx ? accentColor : `${accentColor}44`,
                WebkitTapHighlightColor: 'transparent' }}/>
          ))}
        </div>
      )}
      {portrait.visualNote && (
        <div style={{ fontFamily: SERIF, fontSize: 13, color: '#907050', fontStyle: 'italic',
          lineHeight: 1.6, marginTop: 8, maxWidth: 420 }}>
          {portrait.visualNote}
        </div>
      )}
    </div>
  );
}

function buildJournalDayMap(allPlants, careLog, portraits, allPhotos) {
  const days = {};
  const ensure = d => { if (!days[d]) days[d] = { careEntries: [], portraitObservations: [], photos: [] }; return days[d]; };

  Object.entries(careLog).forEach(([plantId, entries]) => {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) return;
    entries.forEach(e => {
      if (!e.date) return;
      ensure(localDate(e.date)).careEntries.push({
        plantId, plantName: plant.name, label: e.label, action: e.action, withEmma: !!e.withEmma, loggedBy: e.loggedBy || null,
      });
    });
  });

  allPlants.forEach(p => {
    const port = portraits[p.id];
    if (!port) return;
    if (port.visualNote && port.date) {
      ensure(localDate(port.date)).portraitObservations.push({
        plantId: p.id, plantName: p.name,
        visualNote: port.visualNote, bloomState: port.bloomState,
        foliageState: port.foliageState, stage: port.stage || port.currentStage,
      });
    }
    (port.history || []).forEach(h => {
      if (!h.visualNote || !h.date) return;
      const bucket = ensure(localDate(h.date));
      if (!bucket.portraitObservations.some(o => o.plantId === p.id && o.visualNote === h.visualNote)) {
        bucket.portraitObservations.push({
          plantId: p.id, plantName: p.name,
          visualNote: h.visualNote, bloomState: h.bloomState,
          foliageState: h.foliageState, stage: h.stage,
        });
      }
    });
  });

  Object.entries(allPhotos).forEach(([plantId, photos]) => {
    photos.forEach(ph => {
      const d = ph.date ? localDate(ph.date) : '';
      if (d) ensure(d).photos.push({ ...ph, plantId });
    });
  });

  return days;
}

function getPlantHistories(plantIds, allPlants, careLog, dateStr) {
  return plantIds.map(pid => {
    const plant = allPlants.find(p => p.id === pid);
    if (!plant) return null;
    const recentCare = (careLog[pid] || [])
      .filter(e => e.date && localDate(e.date) < dateStr)
      .slice(-8)
      .map(e => ({ label: e.label, date: e.date }));
    return { plantName: plant.name, recentCare };
  }).filter(Boolean);
}

function JournalDay({ dateStr, careEntries, portraitObservations, photos, allPlants, careLog, portraits = {} }) {
  const isToday = dateStr === localDate();
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);

  const versionKey = `${careEntries.length}_${portraitObservations.map(o => (o.visualNote || '').slice(0, 6)).join('')}`;

  useEffect(() => {
    setLoading(true);
    setNarrative(null);
    let isMounted = true;
    const plantIds = [...new Set([...careEntries.map(e => e.plantId), ...portraitObservations.map(o => o.plantId)])];
    const plantHistories = getPlantHistories(plantIds, allPlants, careLog, dateStr);
    fetchJournalEntry({ dateStr, careEntries, portraitObservations, photoCount: photos.length, plantHistories })
      .then(text => { if (isMounted) { setNarrative(text); setLoading(false); } })
      .catch(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [dateStr, versionKey]);

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hasEmma = careEntries.some(e => e.withEmma);

  // Only show portrait carousel for plants that had a photo taken that specific day
  const withSvg = [...new Set(portraitObservations.map(o => o.plantId))].filter(id => portraits[id]?.svg);

  return (
    <div style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${C.cardBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: '#a08060', fontFamily: MONO, letterSpacing: 0.8 }}>
          {dateLabel.toUpperCase()}
        </span>
        {isToday && (
          <span style={{ fontSize: 9, color: C.uiGold, fontFamily: MONO, border: '1px solid rgba(212,168,48,0.4)', borderRadius: 10, padding: '1px 7px' }}>
            IN PROGRESS
          </span>
        )}
        {hasEmma && <span style={{ fontSize: 12, color: '#e84070' }}>♥</span>}
      </div>

      {/* Portrait carousel — at the top like an article header */}
      {withSvg.length > 0 && (
        <JournalPortraitCarousel plantIds={withSvg} portraits={portraits} allPlants={allPlants}/>
      )}

      {loading ? (
        <div style={{ fontFamily: SERIF, fontSize: 14, color: 'rgba(160,130,80,0.3)', fontStyle: 'italic', lineHeight: 1.75 }}>…</div>
      ) : narrative ? (
        <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.85, color: '#3a2010', margin: '0 0 14px', maxWidth: 560 }}>
          {narrative}
        </p>
      ) : null}

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {photos.slice(0, 6).map((ph, i) => (
            <img key={ph.date || i} src={ph.url || ph.dataUrl} alt=""
              style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(160,130,80,0.22)' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function JournalView({ careLog, plants, portraits = {}, allPhotos = {} }) {
  const dayMap = useMemo(
    () => buildJournalDayMap(plants, careLog, portraits, allPhotos),
    [plants, careLog, portraits, allPhotos]
  );
  const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a)).slice(0, 60);

  if (sortedDays.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🌱</div>
        <div style={{ fontSize: 16, color: '#907050', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.8 }}>
          The journal is empty.<br />Season 2 opens March 20.<br />Your first entry will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.uiGold, letterSpacing: 0.5, marginBottom: 28 }}>
        SEASON 2 JOURNAL
      </div>
      {sortedDays.map(dateStr => {
        const day = dayMap[dateStr];
        return (
          <JournalDay key={dateStr} dateStr={dateStr}
            careEntries={day.careEntries}
            portraitObservations={day.portraitObservations}
            photos={day.photos}
            allPlants={plants}
            careLog={careLog}
            portraits={portraits}
          />
        );
      })}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [scene, setScene] = useState('front'); // 'front' | 'game'
  const [mode, setMode] = useState('garden'); // 'garden' | 'journal' | 'oracle'
  const [gardenView, setGardenView] = useState('cards'); // 'cards' | 'map'
  const [gardenSection, setGardenSection] = useState('all');
  const [desktopSortBy, setDesktopSortBy] = useState('care');
  const [mapLayer, setMapLayer] = useState('terrace'); // 'terrace' | 'front'
  const [mapSwitchHovered, setMapSwitchHovered] = useState(false);
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);
  const { user, role, signIn, signOut, checking, authError } = useAuth();
  const { careLog, expenses, positions, growth, dbLoading, logAction, deleteAction, updateGrowth, movePosition, addExpense: addExpenseDb } = useGardenData({ user });
  useMigration({ user });
  const isMobile = useIsMobile();
  const [flash, setFlash] = useState(null);
  const [showExpense, setShowExpense] = useState(false);
  const [expTab, setExpTab] = useState('log'); // 'log' | 'ledger'
  const [expInput, setExpInput] = useState({desc:'',amount:'',group:'',category:''});
  const [draggingId, setDraggingId] = useState(null);
  const [oracle, setOracle] = useState(null);
  const [morningBrief, setMorningBrief] = useState(null);
  const [dailyBrief, setDailyBrief] = useState(null);
  const [noticeToday, setNoticeToday] = useState(null);
  // Centralized briefings: { [plantId]: { note, tasks, actions } | 'loading' | null }
  // Fetched for all active plants in the background; shared across map, cards, mobile
  const [briefings, setBriefings] = useState({});
  const [briefingRefreshToken, setBriefingRefreshToken] = useState(0);
  const [agendaData, setAgendaData] = useState(null); // { sessionMinutes, tasks } — AI ordering + priorities
  const _todayStr = localDate();
  const { portraits, updatePortrait } = usePortraits({ user });
  const { allPhotos, addPhoto: _addPhoto } = usePhotos({ user });
  // When a new photo is added, re-fetch that plant's briefing immediately with the new
  // photo included so Claude can do a fresh visual health assessment.
  const addPhoto = useCallback((plantId, dataUrl, date) => {
    _addPhoto(plantId, dataUrl, date);
  }, [_addPhoto]);
  const [mapConditions, setMapConditions] = useState({});
  const [glowPlantId, setGlowPlantId] = useState(null);
  const [customPlants, setCustomPlants] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gp_custom_plants_v1') || '[]'); } catch { return []; }
  });
  const addCustomPlant = useCallback((plant) => {
    setCustomPlants(prev => {
      const next = [...prev, plant];
      try { localStorage.setItem('gp_custom_plants_v1', JSON.stringify(next)); } catch {}
      return next;
    });
    setSel(plant);
    setFlash('🌱 Added to garden · drag it to its spot on the map');
    setTimeout(() => setFlash(null), 3500);
    setShowShop(false);
  }, []);
  const [showShop, setShowShop] = useState(false);

  const [seasonOpener, setSeasonOpener] = useState(null); // null | 'loading' | string
  const [seasonOpenerDismissed, setSeasonOpenerDismissed] = useState(
    () => { try { return !!localStorage.getItem('gp_season_opener_dismissed_2026'); } catch { return false; } }
  );
  const weather = useWeather();
  const frontPlants = useMemo(() =>
    FRONT_PLANTS.map(p => ({ ...p, health: computeHealth(p, careLog, portraits[p.id] || null, weather) })),
    [careLog, portraits, weather]);

  const terracePlants = useMemo(()=>
    TERRACE_PLANTS.map(p=>({...p, pos:p.moveable ? (positions[p.id]||p.pos) : p.pos, growth:growth[p.id]??p.growth??0, health: computeHealth(p, careLog, portraits[p.id] || null, weather)})),
    [positions, growth, careLog, portraits, weather]);

  // Custom plants with positions/growth merged from localStorage
  const customPlantsWithState = useMemo(() =>
    customPlants.map(p => ({ ...p, pos: positions[p.id] || p.pos, growth: growth[p.id] ?? p.growth ?? 0 })),
    [customPlants, positions, growth]);

  // Containers occupied by custom plants
  const occupiedContainerIds = useMemo(() =>
    new Set(customPlants.map(p => p.containerId).filter(Boolean)),
    [customPlants]);

  // Available containers = empty pots not occupied by a custom plant
  const availableContainers = useMemo(() =>
    TERRACE_PLANTS.filter(p => p.type === 'empty-pot' && !occupiedContainerIds.has(p.id)),
    [occupiedContainerIds]);

  // Map plants = terrace plants without empty pots + custom plants
  const mapPlants = useMemo(() => [
    ...terracePlants.filter(p => p.type !== 'empty-pot'),
    ...customPlantsWithState,
  ], [terracePlants, customPlantsWithState]);

  const ALL_PLANTS = useMemo(() => [...TERRACE_PLANTS, ...customPlants], [customPlants]);

  // ── SEASON READINESS ──────────────────────────────────────────────────────
  // Three gates — all must be true for the season to open:
  //   1. Readiness: ≥75% of active plants photographed
  //   2. Calendar: not before March 10 (absolute earliest for Brooklyn Zone 7b)
  //   3. Weather: not raining today, <60% rain chance tomorrow
  const { seasonOpen, seasonReadiness, plantsNeedingPhotos, photoCount, activePlantCount, seasonBlocking } = useMemo(() => {
    const active = terracePlants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');
    const withPhotos = active.filter(p => (allPhotos[p.id] || []).length > 0);
    const score = active.length > 0 ? withPhotos.length / active.length : 0;
    const readinessOk = score >= 0.75;

    const calendarOk = new Date() >= new Date('2026-03-10');

    let blocking = null;
    if (!readinessOk) blocking = 'readiness';
    else if (!calendarOk) blocking = 'calendar';

    return {
      seasonOpen: readinessOk && calendarOk,
      seasonReadiness: score,
      plantsNeedingPhotos: active.filter(p => (allPhotos[p.id] || []).length === 0).map(p => p.name),
      photoCount: withPhotos.length,
      activePlantCount: active.length,
      seasonBlocking: blocking,
    };
  }, [terracePlants, allPhotos]);

  // Re-run oracle when today's care count changes so recommendations stay current
  const todayCareCount = useMemo(() => {
    const today = localDate();
    return Object.values(careLog).flat().filter(e => e.date && localDate(e.date) === today).length;
  }, [careLog]);

  // Tracks total rain entries — used to bust briefing cache after auto-rain logging
  const rainEntryCount = useMemo(() =>
    Object.values(careLog).flat().filter(e => e.action === 'rain').length,
  [careLog]);

  // Garden view plants (no empty pots — those become available containers in the UI)
  const gardenPlants = useMemo(()=>({
    terrace: [...terracePlants.filter(p => p.type !== 'empty-pot'), ...customPlantsWithState],
  }),[terracePlants, customPlantsWithState]);

  // Live attention items — computed from briefings, used as fallback before agenda freezes
  // Shared agenda — single source of truth for both Maps page and Mobile Today tab.
  // Both views receive agendaItems from here so they always show identical tasks.
  const { items: sharedAgendaItems, isWeekend: agendaIsWeekend } = useMemo(
    () => computeAgenda({ plants: gardenPlants.terrace, frontPlants, careLog, briefings, weather, seasonOpen, allPhotos }),
    [gardenPlants.terrace, frontPlants, careLog, briefings, weather, seasonOpen, allPhotos]
  );

  const desktopPlantUrgency = useMemo(() => {
    const TIER = { urgent: 0, recommended: 1, routine: 2, optional: 3 };
    const map = {};
    for (const item of sharedAgendaItems) {
      const cur = map[item.plantId] ?? 99;
      const tier = TIER[item.priority] ?? 99;
      if (tier < cur) map[item.plantId] = tier;
    }
    return map;
  }, [sharedAgendaItems]);

  // Morning brief + daily brief — frozen daily; only re-fetches on manual refresh
  useEffect(() => {
    if (!weather) return;
    let isMounted = true;
    const allPlants = [...gardenPlants.terrace, ...frontPlants];
    const agendaTasks = sharedAgendaItems.map(item => ({
      plantName: item.plant.name,
      actionKey: item.actionKey,
      label: item.task?.label || null,
      reason: item.task?.reason || null,
      optional: item.task?.optional || false,
    }));
    fetchMorningBrief({ plants: allPlants, careLog, weather, portraits, agendaTasks })
      .then(brief => { if (isMounted && brief) setMorningBrief(brief); })
      .catch(() => {});
    fetchDailyBrief({ plants: allPlants, careLog, weather, portraits, agendaTasks })
      .then(brief => { if (isMounted && brief) setDailyBrief(brief); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [weather, briefingRefreshToken]);

  // Fetch AI-enriched agenda once per day — single source of truth for both mobile and desktop
  const rawAgendaKeys = sharedAgendaItems.map(i => i.key).join(',');

  // Oracle — fetch on mount (after weather loads) and whenever care is logged or agenda changes
  useEffect(() => {
    if (!weather) return;
    const allGardenPlants = [...TERRACE_PLANTS, ...frontPlants];
    const photoContext = allGardenPlants
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
      .map(p => {
        const all = allPhotos[p.id] || [];
        return { name: p.name, count: all.length, lastDate: all[all.length - 1]?.date ?? null };
      });
    const totalPhotos = photoContext.reduce((s, p) => s + p.count, 0);
    fetchOracle({ weather, plants: allGardenPlants, careLog, seasonOpen, seasonBlocking, plantsNeedingPhotos, photoCount, activePlantCount, photoContext, totalPhotos, portraits, role, agendaItems: sharedAgendaItems })
      .then(setOracle)
      .catch(() => {});
  }, [weather, role, todayCareCount, seasonOpen, rawAgendaKeys]); // intentionally excludes other deps — oracle is cached daily

  useEffect(() => {
    if (!weather || !seasonOpen || !sharedAgendaItems.length) return;
    fetchDailyAgenda({ candidateTasks: sharedAgendaItems, weather, careLog, portraits })
      .then(data => setAgendaData(data))
      .catch(() => {});
  }, [rawAgendaKeys, weather]); // stable string dep intentional

  // pendingAgendaItems — sharedAgendaItems enriched with AI order + priorities/reasons
  const pendingAgendaItems = useMemo(() => {
    const apiTasks = agendaData?.tasks;
    if (!apiTasks?.length) return sharedAgendaItems;
    const rawMap = new Map(sharedAgendaItems.map(r => [r.key, r]));
    const ordered = [];
    const covered = new Set();
    for (const apiTask of apiTasks) {
      const key = `${apiTask.plantId}:${apiTask.actionKey}`;
      const raw = rawMap.get(key);
      if (raw) {
        ordered.push({ ...raw, reason: apiTask.reason || raw.reason, priority: apiTask.priority || raw.priority });
        covered.add(key);
      }
    }
    for (const raw of sharedAgendaItems) {
      if (!covered.has(raw.key)) ordered.push(raw);
    }
    return ordered;
  }, [sharedAgendaItems, agendaData]);

  // Fetch "one thing to notice" — daily AI observation for the map left panel
  useEffect(() => {
    if (!weather || !seasonOpen) return;
    let isMounted = true;
    const allPlants = [...gardenPlants.terrace, ...frontPlants];
    fetchNoticeToday({ plants: allPlants, portraits, weather })
      .then(text => { if (isMounted && text) setNoticeToday(text); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [weather, seasonOpen, briefingRefreshToken]);

  // Fetch plant briefings for all active plants in the background.
  // Staggered to avoid hammering the API simultaneously; cachedClaude handles dedup.
  // Frozen daily — only re-fetches on manual refresh (briefingRefreshToken).
  useEffect(() => {
    if (!weather || !seasonOpen) return;
    const active = [...gardenPlants.terrace, ...frontPlants]
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot' && !p.noTasks);
    let cancelled = false;
    const timeoutIds = [];
    active.forEach((plant, i) => {
      if (briefings[plant.id] !== undefined) return; // already loaded or loading
      setBriefings(prev => ({ ...prev, [plant.id]: 'loading' }));
      const tid = setTimeout(() => {
        if (cancelled) return;
        fetchPlantBriefing(plant, careLog, weather, portraits, allPhotos)
          .then(b => {
            if (cancelled) return;
            setBriefings(prev => ({ ...prev, [plant.id]: b }));
            // Persist health + waterDays from briefing into portrait so they
            // survive app restarts without re-fetching the AI.
            if (b && (b.health || b.waterDays)) {
              const update = {};
              if (b.health)    { update.health = b.health; update.healthDate = new Date().toISOString(); }
              if (b.waterDays) { update.waterDays = b.waterDays; update.waterDaysDate = new Date().toISOString(); }
              updatePortrait(plant.id, update);
            }
          })
          .catch(() => { if (!cancelled) setBriefings(prev => ({ ...prev, [plant.id]: null })); });
      }, i * 600);
      timeoutIds.push(tid);
    });
    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [weather, seasonOpen, briefingRefreshToken]);

  // When a new photo arrives for a specific plant, re-fetch that plant's briefing
  // immediately so the visual health assessment reflects the latest photo.
  const prevPhotoCountsRef = useRef({});
  useEffect(() => {
    if (!weather || !seasonOpen) return;
    const allPlants = [...gardenPlants.terrace, ...frontPlants];
    for (const plant of allPlants) {
      const prevCount = prevPhotoCountsRef.current[plant.id] ?? null;
      const currCount = (allPhotos[plant.id] || []).length;
      if (prevCount !== null && currCount > prevCount) {
        // New photo arrived — re-fetch briefing with latest photo
        const newPhotos = allPhotos[plant.id] || [];
        setBriefings(prev => ({ ...prev, [plant.id]: 'loading' }));
        fetchPlantBriefing(plant, careLog, weather, portraits, { [plant.id]: newPhotos })
          .then(b => {
            setBriefings(prev => ({ ...prev, [plant.id]: b }));
            if (b && (b.health || b.waterDays)) {
              const update = {};
              if (b.health)    { update.health = b.health; update.healthDate = new Date().toISOString(); }
              if (b.waterDays) { update.waterDays = b.waterDays; update.waterDaysDate = new Date().toISOString(); }
              updatePortrait(plant.id, update);
            }
          })
          .catch(() => setBriefings(prev => ({ ...prev, [plant.id]: null })));
      }
      prevPhotoCountsRef.current[plant.id] = currCount;
    }
  }, [allPhotos]); // intentionally omits other deps — reads them via closure, fires only on photo count changes

  // Manual refresh — clears today's cached AI responses and re-fetches everything
  const refreshBriefings = useCallback(() => {
    const today = localDate();
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('gp_claude_') && k.includes(today))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) { console.warn('refreshBriefings localStorage clear failed', e); }
    setBriefings({});
    setMorningBrief(null);
    setDailyBrief(null);
    setBriefingRefreshToken(t => t + 1);
  }, []);

  // One-time backfill: log March 23 2026 rain for all active plants.
  // Must guard on BOTH dbLoading=false AND user being non-null.
  // Root cause of prior failures: Supabase loads once unauthenticated on mount
  // (user=null), sets dbLoading=false, backfill fires but logAction saves
  // locally only. Auth then resolves but dbLoading never changes again, so
  // backfill never re-runs. Depending on user?.id ensures it fires once auth completes.
  useEffect(() => {
    if (dbLoading || !user) return;
    if (!gardenPlants.terrace.length) return;
    const rainDate = '2026-03-23';
    const yISO = new Date('2026-03-23T18:00:00').toISOString();
    const activePlants = [...gardenPlants.terrace, ...frontPlants]
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');
    activePlants.forEach(plant => {
      const alreadyLogged = (careLog[plant.id] || [])
        .some(e => e.action === 'rain' && e.date?.startsWith(rainDate));
      if (!alreadyLogged) {
        logAction('rain', plant, false, 'Rained in Brooklyn', yISO);
      }
    });
  }, [dbLoading, user?.id]); 

  // Auto-log rain watering — fires when weather shows actual precip > 1mm today.
  // DEDUP_KEYS prevents double-logging on reload.
  useEffect(() => {
    if (!weather || !seasonOpen) return;
    const today = weather.forecast?.[0];
    if (!today || today.precip <= 1) return;
    const inchesRaw = today.precip / 25.4;
    const inches = inchesRaw < 0.1 ? inchesRaw.toFixed(2) : inchesRaw.toFixed(1);
    const label = `Rained ${inches}" in Brooklyn`;
    const activePlants = [...gardenPlants.terrace, ...frontPlants]
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');
    activePlants.forEach(plant => { doAction('rain', plant, label); });
  }, [weather?.forecast?.[0]?.precip, seasonOpen]);

  // Map condition synthesis — runs when photos change, only for plants with ≥3 photos
  // and only when ≥2 new photos have accumulated since the last synthesis.
  useEffect(() => {
    const allPlants = [...gardenPlants.terrace, ...frontPlants];
    allPlants.forEach(plant => {
      const photos = allPhotos[plant.id] || [];
      if (photos.length < 3) return;
      const lastSynthCount = mapConditions[plant.id]?.photoCount ?? 0;
      if (photos.length < lastSynthCount + 2 && lastSynthCount > 0) return; // not enough new photos
      const dataUrls = photos.map(p => p.dataUrl || p.url).filter(Boolean);
      if (dataUrls.length < 3) return;
      fetchMapCondition(plant, dataUrls)
        .then(cond => {
          if (cond) setMapConditions(prev => ({ ...prev, [plant.id]: { ...cond, photoCount: photos.length } }));
        })
        .catch(() => {});
    });
  }, [allPhotos]); // eslint-disable-line

  // Season opener — show once when season first opens
  useEffect(() => {
    if (!seasonOpen) return;
    if (seasonOpenerDismissed) return;
    setSeasonOpener('loading');
    fetchSeasonOpener({ plants: TERRACE_PLANTS })
      .then(text => setSeasonOpener(text))
      .catch(() => setSeasonOpener(null));
  }, []);

  // Route to front scene for opening ceremony
  useEffect(() => {
    if (seasonOpener && seasonOpener !== 'loading' && !seasonOpenerDismissed) {
      setScene('front');
    }
  }, [seasonOpener]);

  // ── WARMTH ─────────────────────────────────────────────────────────────
  const WARMTH_PTS = { water:10, neem:30, prune:50, fertilize:40, train:25, photo:15, visit:5, note:8, worms:35 };
  const WARMTH_CAP = 1000;
  const warmth = useMemo(() => {
    const cutoff = new Date('2026-03-20').getTime(); // season start
    let pts = 0;
    Object.values(careLog).forEach(entries => {
      entries.forEach(e => {
        if (!e.date || new Date(e.date).getTime() < cutoff) return;
        const base = WARMTH_PTS[e.action] ?? 0;
        pts += e.withEmma ? base * 2 : base;
      });
    });
    return Math.min(pts, WARMTH_CAP);
  }, [careLog]);

  // Care action
  const doAction = useCallback(async (key, plant, customLabel, customDate = null) => {
    const def = ACTION_DEFS[key];
    if (!def && key !== 'tend') return;
    const isWithEmma = false; // Emma doesn't tend the garden — withEmma is never set from auth role

    // Notes: parse first — log as detected care actions if found, else as a note
    if (key === 'note' && customLabel) {
      parseNoteActions(customLabel, plant.name).then(async actions => {
        if (actions.length > 0) {
          for (const act of actions) {
            await logAction(act.key, plant, isWithEmma, act.label, customDate, role);
          }
          const firstDef = ACTION_DEFS[actions[0].key];
          setFlash(`${firstDef?.emoji || '✨'} ${actions[0].label}${isWithEmma ? ' with Emma' : ''}${actions.length > 1 ? ` +${actions.length - 1} more` : ''}`);
        } else {
          await logAction('note', plant, isWithEmma, customLabel, customDate, role);
          setFlash(`📝 ${customLabel}${isWithEmma ? ' with Emma' : ''}`);
        }
        setTimeout(() => setFlash(null), 2500);
      }).catch(async () => {
        await logAction('note', plant, isWithEmma, customLabel, customDate, role);
        setFlash(`📝 ${customLabel}${isWithEmma ? ' with Emma' : ''}`);
        setTimeout(() => setFlash(null), 2500);
      });
      return;
    }

    const syncError = await logAction(key, plant, isWithEmma, customLabel, customDate, role);
    if (syncError === 'duplicate') return; // already logged today — silent skip
    const displayLabel = customLabel || def?.label || key;
    const emoji = def?.emoji || '✨';
    setFlash(syncError
      ? `⚠️ Logged locally but sync failed: ${syncError}`
      : `${emoji} ${displayLabel}${isWithEmma ? ' with Emma' : ''}`
    );
    setTimeout(() => setFlash(null), syncError ? 5000 : 2500);
  }, [role, logAction]);

  // Expense
  const addExpense = () => {
    const amt = parseFloat(expInput.amount);
    if (!expInput.desc || isNaN(amt) || amt <= 0) return;
    addExpenseDb(expInput.desc, Math.round(amt * 100), null, expInput.group || null, expInput.category || null);
    setExpInput({ desc: '', amount: '', group: '', category: '' });
    setExpTab('ledger');
    setFlash(`💰 $${amt.toFixed(2)} logged`);
    setTimeout(() => setFlash(null), 2000);
  };

  const totalSpend = expenses.reduce((s,e)=>s+e.cents,0);

  const URGENT_SET = new Set(['thirsty','overlooked','struggling']);
  const needsCareCount = gardenPlants.terrace.filter(p=> seasonOpen && URGENT_SET.has(p.health)).length;

  // Map info panel data — shared agenda minus tasks already completed today
  // Converted to { plant, action, def, task } format for MapCarePanel compatibility
  const attentionItems = useMemo(() => {
    const todayStr = localDate();
    return pendingAgendaItems
      .filter(item => {
        const entries = careLog[item.plantId] || [];
        if (item.actionKey === 'tend') {
          return !entries.some(e => e.action === 'tend' && e.label === (item.task?.label || '') && e.date && localDate(e.date) === todayStr);
        }
        return !entries.some(e => e.action === item.actionKey && e.date && localDate(e.date) === todayStr);
      })
      .map(item => ({
        plant: item.plant,
        action: item.actionKey,
        def: ACTION_DEFS[item.actionKey] || null,
        task: item.task,
      }));
  }, [pendingAgendaItems, careLog]);

  const recentCare = useMemo(() => {
    const all = gardenPlants.terrace.flatMap(p =>
      (careLog[p.id] || []).map(e => ({ ...e, plant: p }))
    );
    return all.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  }, [gardenPlants.terrace, careLog]);

  const recentPhotoCount = useMemo(() => {
    const cutoff = Date.now() - 10 * 86400000;
    const active = gardenPlants.terrace.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');
    return active.filter(p => (allPhotos[p.id] || []).some(photo => new Date(photo.date).getTime() >= cutoff)).length;
  }, [gardenPlants.terrace, allPhotos]);

  // Mobile — always go straight to MobileView, skip the front scene
  if (isMobile) {
    return (
      <MobileView
        plants={terracePlants}
        frontPlants={frontPlants}
        careLog={careLog}
        weather={weather}
        onAction={doAction}
        onPortraitUpdate={updatePortrait}
        onGrowthUpdate={updateGrowth}
        allPhotos={allPhotos}
        onAddPhoto={addPhoto}
        portraits={portraits}
        briefings={briefings}
        role={role}
        signIn={signIn}
        signOut={signOut}
        seasonOpen={seasonOpen}
        oracle={oracle}
        onGoFront={() => setScene('front')}
        expenses={expenses}
        onAddExpense={addExpenseDb}
        onDeleteAction={deleteAction}
        onTaskDone={plantId => {
          setGlowPlantId(plantId);
          setTimeout(() => setGlowPlantId(null), 2500);
        }}
        morningBrief={morningBrief}
        dailyBrief={dailyBrief}
        agendaItems={pendingAgendaItems}
        agendaData={agendaData}
        agendaIsWeekend={agendaIsWeekend}
        onRefreshAgenda={refreshBriefings}
      />
    );
  }

  // ── FRONT SCENE (desktop opening screen) ───────────────────────────────
  // If logged in and on the front scene, skip directly to the map
  if (scene === 'front' && !checking && role !== 'guest') {
    setScene('game');
    setMode('garden');
    setGardenView('map');
    return null;
  }

  // If not logged in and somehow on the game scene, bounce back to front
  if (scene === 'game' && role === 'guest') {
    setScene('front');
    return null;
  }

  if (scene === 'front') {
    const isOpener = seasonOpen && !seasonOpenerDismissed && seasonOpener && seasonOpener !== 'loading';
    const isGuest = role === 'guest';
    return (
      <div style={{width:'100vw',height:'100dvh',overflow:'hidden'}}>
        <FrontMap
          plants={frontPlants}
          growth={growth}
          weather={weather}
          skipDelay={seasonOpenerDismissed}
          oracle={null}
          seasonOpenerText={isOpener && !isGuest ? seasonOpener : null}
          selectedId={isOpener ? null : sel}
          onSelect={isOpener ? () => {} : (p) => setSel(p?.id ?? null)}
          onEnter={isGuest ? null : isOpener
            ? () => {
                try { localStorage.setItem('gp_season_opener_dismissed_2026', '1'); } catch {}
                setSeasonOpenerDismissed(true);
                setScene('game');
                setMode('garden');
                setGardenView('cards');
              }
            : () => { setScene('game'); setMode('garden'); setGardenView('map'); }
          }
          warmth={warmth}
          signIn={signIn}
          checking={checking}
          isGuest={isGuest}
          portraits={portraits}
        />
      </div>
    );
  }

  return (
    <div style={{width:'100vw',height:'100vh',background:C.appBg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SERIF}}>

      {/* ── TOP CHROME ── */}
      <div style={{height:46,background:C.uiPane,borderBottom:`2px solid ${C.uiBorder}`,
        display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}}>
        <button onClick={()=>{ setMode('garden'); setGardenView('cards'); }}
          style={{background:'none',border:'none',padding:0,cursor:'pointer'}}>
          <span style={{fontFamily:MONO,fontSize:10,color:C.uiGold,letterSpacing:.5}}>GARDEN PARTY</span>
        </button>
        <div style={{background:C.uiLight,border:`1px solid ${C.uiBorder}`,borderRadius:3,
          padding:'2px 8px',fontFamily:MONO,fontSize:7,color:seasonOpen?C.uiGold:'#6090a0'}}>
          {seasonOpen?'S2 · OPEN':`${photoCount}/${activePlantCount} seen`}
        </div>
        {!seasonOpen&&<span style={{fontSize:11,color:'#6090a0',fontStyle:'italic'}}>
          {seasonBlocking==='readiness'?'Photograph your plants to open Season 2':
           seasonBlocking==='calendar'?'Too early in the year':
           seasonBlocking==='rain-today'?'Waiting for clear weather':
           seasonBlocking==='rain-tomorrow'?'Rain forecast tomorrow':'Season not yet open'}
        </span>}
        <div style={{flex:1}}/>

        {/* Weather */}
        {weather && (
          <span style={{fontSize:11,color:C.uiMuted,fontStyle:'italic',fontFamily:SERIF}}>
            {Math.round(weather.temp)}°F
          </span>
        )}

        {/* Auth */}
        <AuthButton role={role} signIn={signIn} signOut={signOut} checking={checking} authError={authError}/>

        {/* Expense */}
        <button onClick={()=>setShowExpense(v=>!v)}
          style={{background:C.uiLight,border:`1px solid ${C.uiBorder}`,borderRadius:3,
            padding:'4px 9px',color:C.uiMuted,fontFamily:MONO,fontSize:7,cursor:'pointer'}}>
          💰 ${(totalSpend/100).toFixed(0)}
        </button>
      </div>

      {/* ── BODY: SIDEBAR + CONTENT ── */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── LEFT SIDEBAR NAV ── */}
        <div style={{
          width:58,flexShrink:0,background:C.uiPane,
          borderRight:`2px solid ${C.uiBorder}`,
          display:'flex',flexDirection:'column',
          paddingTop:8,
        }}>
          {[
            {id:'garden',  icon:'🌿', label:'Garden',  onClick:()=>{ setMode('garden'); setGardenView('cards'); }, active: mode==='garden' && gardenView==='cards' },
            {id:'map',     icon:'🗺',  label:'Map',     onClick:()=>{ setMode('garden'); setGardenView('map');   }, active: mode==='garden' && gardenView==='map'   },
            {id:'journal', icon:'📖', label:'Journal', onClick:()=>setMode('journal'),                            active: mode==='journal' },
          ].map(item=>(
            <button key={item.id} onClick={item.onClick}
              style={{
                background:'none',border:'none',cursor:'pointer',
                padding:'10px 0',width:'100%',
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                borderLeft:`3px solid ${item.active?C.uiGold:'transparent'}`,
                transition:'border-color .15s',
              }}>
              <span style={{fontSize:18,lineHeight:1}}>{item.icon}</span>
              <span style={{fontFamily:MONO,fontSize:5.5,
                color:item.active?C.uiGold:C.uiDim,letterSpacing:.4,transition:'color .15s'}}>
                {item.label.toUpperCase()}
              </span>
            </button>
          ))}

          {/* Oracle — separated, pushed toward bottom */}
          <div style={{marginTop:'auto',paddingBottom:12,borderTop:`1px solid ${C.uiBorder}`,paddingTop:8}}>
            <button onClick={()=>setMode('oracle')}
              style={{
                background:'none',border:'none',cursor:'pointer',
                padding:'10px 0',width:'100%',
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                borderLeft:`3px solid ${mode==='oracle'?C.uiGold:'transparent'}`,
                transition:'border-color .15s',
              }}>
              <span style={{fontSize:18,lineHeight:1}}>🌸</span>
              <span style={{fontFamily:MONO,fontSize:5.5,
                color:mode==='oracle'?C.uiGold:C.uiDim,letterSpacing:.4,transition:'color .15s'}}>
                ORACLE
              </span>
            </button>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── GARDEN VIEW ── */}
        {mode==='garden'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Top bar — cards view only, New Plant shortcut */}
            {gardenView==='cards'&&(
            <div style={{
              height:38,flexShrink:0,background:C.appBg,
              borderBottom:`1px solid ${C.cardBorder}`,
              display:'flex',alignItems:'center',padding:'0 16px',
              justifyContent:'flex-end',
            }}>
              <button onClick={()=>setShowShop(true)}
                style={{background:'rgba(212,168,48,0.12)',border:'1px solid rgba(212,168,48,0.35)',
                  borderRadius:20,padding:'3px 14px',color:C.uiGold,
                  fontFamily:SERIF,fontSize:12,cursor:'pointer',transition:'all .12s'}}
                onMouseEnter={e=>e.target.style.background='rgba(212,168,48,0.22)'}
                onMouseLeave={e=>e.target.style.background='rgba(212,168,48,0.12)'}>
                + New Plant
              </button>
            </div>
            )}
            <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            {/* ── CARDS SUB-VIEW ── */}
            {gardenView==='cards'&&(<>
            <div style={{flex:1,overflowY:'auto',padding:'0'}}>
              <div style={{padding:'14px 16px 24px',display:'flex',flexDirection:'column',gap:0}}>
                {(()=>{
                  const DESKTOP_SORT_OPTIONS = [
                    { key:'care',      label:'Needs Care' },
                    { key:'phenology', label:'Most Active' },
                    { key:'neglected', label:'Most Neglected' },
                    { key:'alpha',     label:'A–Z' },
                  ];
                  function deskLastCareMs(plantId) {
                    const skip = new Set(['visit','photo','note']);
                    const entries = (careLog[plantId] || []).filter(e => !skip.has(e.action));
                    if (!entries.length) return 0;
                    return Math.max(...entries.map(e => new Date(e.date).getTime()));
                  }
                  function deskPhenologyScore(p) {
                    const port = portraits[p.id] || {};
                    let score = 0;
                    if (port.stages?.length) score += port.stages.length;
                    if (port.currentStage) score += 2;
                    if (port.visualNote) score += 1;
                    if (port.svg) score += 1;
                    const rich = new Set(['wisteria','climbing-rose','rose','tomato','fig','magnolia','pepper']);
                    if (rich.has(p.type)) score += 2;
                    return score;
                  }
                  function deskSortKey(p) {
                    if (desktopSortBy === 'care') return [desktopPlantUrgency[p.id] ?? 99, p.name];
                    if (desktopSortBy === 'phenology') return [-deskPhenologyScore(p), p.name];
                    if (desktopSortBy === 'neglected') return [-(Date.now() - deskLastCareMs(p.id)), p.name];
                    return [p.name]; // alpha
                  }
                  const renderGroups = (plants, groups, sectionLabel) => {
                    const populated = groups.map(grp => ({
                      ...grp,
                      ps: [...plants.filter(p => grp.types.includes(p.type))]
                        .sort((a,b) => {
                          const ka = deskSortKey(a), kb = deskSortKey(b);
                          for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
                            if (ka[i] === undefined) return -1;
                            if (kb[i] === undefined) return 1;
                            if (ka[i] < kb[i]) return -1;
                            if (ka[i] > kb[i]) return 1;
                          }
                          return 0;
                        }),
                    })).filter(grp => grp.ps.length > 0);
                    // Sort groups by best plant score within group
                    populated.sort((a,b) => {
                      if (desktopSortBy === 'alpha') return a.label.localeCompare(b.label);
                      const bestA = a.ps.map(p => deskSortKey(p)[0]).reduce((x,y) => x < y ? x : y, Infinity);
                      const bestB = b.ps.map(p => deskSortKey(p)[0]).reduce((x,y) => x < y ? x : y, Infinity);
                      return bestA !== bestB ? bestA - bestB : a.label.localeCompare(b.label);
                    });
                    return populated.map(grp => {
                      const hasUrgent = grp.ps.some(p => (desktopPlantUrgency[p.id] ?? 99) < 9);
                      const grpColor = hasUrgent ? healthColor(grp.ps[0].health) : '#a08060';
                      return (
                        <div key={grp.key} style={{marginBottom:24}}>
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                            <span style={{fontSize:10,color:grpColor,fontFamily:MONO,letterSpacing:.5,whiteSpace:'nowrap'}}>
                              {sectionLabel ? `${sectionLabel} · ` : ''}{grp.label.toUpperCase()}
                            </span>
                            <div style={{height:1,flex:1,background:hasUrgent?`${grpColor}30`:C.cardBorder}}/>
                            <span style={{fontSize:9,color:hasUrgent?grpColor:C.uiDim,fontFamily:MONO}}>{grp.ps.length}</span>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                            {grp.ps.map(p=>(
                              <PlantCard key={p.id} plant={p} careLog={careLog}
                                onSelect={p=>{setSel(p);}} isSelected={sel?.id===p.id} seasonOpen={seasonOpen}
                                portrait={portraits[p.id]} photos={allPhotos[p.id] || []}/>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  };
                  return (
                    <>
                      {/* Sort bar */}
                      <div style={{display:'flex',gap:5,marginBottom:18,flexWrap:'wrap'}}>
                        {DESKTOP_SORT_OPTIONS.map(opt => {
                          const active = desktopSortBy === opt.key;
                          return (
                            <button key={opt.key} onClick={()=>setDesktopSortBy(opt.key)}
                              style={{padding:'5px 12px',borderRadius:20,cursor:'pointer',
                                border:`1px solid ${active?'rgba(90,60,24,0.55)':C.cardBorder}`,
                                background:active?'rgba(90,60,24,0.08)':'transparent',
                                fontFamily:MONO,fontSize:7,letterSpacing:.3,
                                color:active?'#2a1808':'#907050',transition:'all .1s'}}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {gardenPlants.terrace.length>0&&renderGroups(gardenPlants.terrace, TERRACE_GROUPS, null)}
                      {frontPlants.length>0&&renderGroups(frontPlants, FRONT_GROUPS, "🌹 Emma's Rose Garden")}
                      {/* Available containers — empty pots that can receive a new plant */}
                      {availableContainers.length > 0 && (
                        <div style={{marginBottom:24}}>
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                            <span style={{fontSize:10,color:'#a08060',fontFamily:MONO,letterSpacing:.5}}>
                              AVAILABLE CONTAINERS
                            </span>
                            <div style={{height:1,flex:1,background:C.cardBorder}}/>
                            <span style={{fontSize:9,color:C.uiDim,fontFamily:MONO}}>{availableContainers.length}</span>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
                            {availableContainers.map(c => (
                              <div key={c.id} onClick={()=>setShowShop(true)}
                                style={{background:C.cardBg,border:`1px dashed rgba(160,130,80,0.30)`,
                                  borderRadius:10,padding:'10px 12px',cursor:'pointer',
                                  display:'flex',alignItems:'center',gap:10,
                                  transition:'all .15s'}}
                                onMouseEnter={e=>e.currentTarget.style.border='1px dashed rgba(212,168,48,0.55)'}
                                onMouseLeave={e=>e.currentTarget.style.border='1px dashed rgba(160,130,80,0.30)'}>
                                <span style={{fontSize:22,opacity:0.5}}>🪴</span>
                                <div>
                                  <div style={{fontSize:12,color:'#907050',fontFamily:SERIF}}>{c.container}</div>
                                  <div style={{fontSize:10,color:'rgba(160,130,80,0.6)',fontFamily:SERIF,fontStyle:'italic'}}>
                                    tap to add a plant
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {sel&&(
              <div style={{position:'relative',width:320,flexShrink:0}}>
                <DetailPanel plant={sel} careLog={careLog} onClose={()=>setSel(null)}
                  onAction={doAction} seasonOpen={seasonOpen} onAnalyze={updatePortrait} portraits={portraits}
                  photos={allPhotos[sel.id] || []} onAddPhoto={addPhoto} onGrowthUpdate={updateGrowth}
                  weather={weather} briefings={briefings} onDeleteAction={deleteAction}/>
              </div>
            )}
            </>)}

            {/* ── MAP SUB-VIEW ── */}
            {gardenView==='map'&&(
              <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',inset:'-8%',backgroundImage:'url(/brownstone.jpg)',
                  backgroundSize:'cover',backgroundPosition:'center 35%',filter:'blur(32px)',zIndex:0}}/>
                <div style={{position:'absolute',inset:0,background:'rgba(7,4,1,0.60)',zIndex:0}}/>
                <div style={{flex:1,position:'relative',zIndex:1,display:'flex',overflow:'hidden'}}>
                  <div style={{position:'relative',height:'100%',aspectRatio:'820 / 854',maxWidth:'58vw',flexShrink:0}}>
                      {mapLayer === 'terrace' ? (
                        <TerraceMap
                          plants={mapPlants}
                          frontPlants={frontPlants}
                          selectedId={sel?.id}
                          onSelect={p=>{ if(p) setSel(p); else setSel(null); }}
                          onMove={(id,pos)=>movePosition(id,pos)}
                          onHover={setHov}
                          onDescend={()=>setScene('front')}
                          onAction={(k,p)=>doAction(k,p)}
                          onPetCookie={() => {}}
                          seasonOpen={seasonOpen}
                          portraits={portraits}
                          careLog={careLog}
                          warmth={warmth}
                          weather={weather}
                          briefings={briefings}
                          mapConditions={mapConditions}
                          glowPlantId={glowPlantId}
                        />
                      ) : (
                        <RoseGardenMap
                          plants={frontPlants}
                          selectedId={sel?.id}
                          onSelect={p=>{ if(p) setSel(p); else setSel(null); }}
                          onHover={setHov}
                          portraits={portraits}
                          careLog={careLog}
                          briefings={briefings}
                          mapConditions={mapConditions}
                          glowPlantId={glowPlantId}
                          seasonOpen={seasonOpen}
                          weather={weather}
                        />
                      )}
                      {/* Garden switcher — dog-eared map corner, bottom-left */}
                      {(() => {
                        const isT = mapLayer === 'terrace';
                        // rose for terrace→emma transition; green for emma→terrace
                        const foldColor = isT ? 'rgba(200,48,88,0.82)' : 'rgba(52,160,60,0.82)';
                        const foldColorHover = isT ? 'rgba(220,60,100,0.95)' : 'rgba(64,185,72,0.95)';
                        const label = isT ? "EMMA'S" : 'TERRACE';
                        const sz = mapSwitchHovered ? 80 : 52;
                        return (
                          <button
                            onClick={()=>{ setMapLayer(isT?'front':'terrace'); setSel(null); setMapSwitchHovered(false); }}
                            onMouseEnter={()=>setMapSwitchHovered(true)}
                            onMouseLeave={()=>setMapSwitchHovered(false)}
                            style={{
                              position:'absolute', bottom:0, left:0,
                              width:sz, height:sz,
                              background:'none', border:'none', padding:0, cursor:'pointer',
                              zIndex:10, overflow:'hidden',
                              transition:'width .2s ease, height .2s ease',
                            }}>
                            {/* The fold triangle */}
                            <div style={{
                              position:'absolute', bottom:0, left:0,
                              width:'100%', height:'100%',
                              background: mapSwitchHovered ? foldColorHover : foldColor,
                              clipPath:'polygon(0 0, 0 100%, 100% 100%)',
                              boxShadow: mapSwitchHovered ? '3px -3px 12px rgba(0,0,0,0.5)' : '2px -2px 6px rgba(0,0,0,0.3)',
                              transition:'background .2s ease, box-shadow .2s ease',
                            }}/>
                            {/* Label rotated along the hypotenuse */}
                            <span style={{
                              position:'absolute',
                              bottom: mapSwitchHovered ? 18 : 11,
                              left: mapSwitchHovered ? 7 : 4,
                              fontFamily:MONO, fontSize: mapSwitchHovered ? 6.5 : 5.5,
                              letterSpacing:.5, color:'rgba(255,255,255,0.92)',
                              transform:'rotate(-45deg)',
                              transformOrigin:'bottom left',
                              whiteSpace:'nowrap',
                              transition:'font-size .2s ease, bottom .2s ease, left .2s ease',
                              pointerEvents:'none',
                            }}>
                              {label}
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                </div>
                {/* Right panels: context (left) + care (right) by default, detail panel when plant selected */}
                {!sel && (
                  <>
                    <MapContextPanel
                      plants={[...gardenPlants.terrace, ...frontPlants]}
                      careLog={careLog}
                      weather={weather}
                      portraits={portraits}
                      allPhotos={allPhotos}
                      noticeToday={noticeToday}
                    />
                    <MapCarePanel
                      plants={[...gardenPlants.terrace, ...frontPlants]}
                      careLog={careLog}
                      seasonOpen={seasonOpen}
                      seasonBlocking={seasonBlocking}
                      photoCount={photoCount}
                      activePlantCount={activePlantCount}
                      recentPhotoCount={recentPhotoCount}
                      attentionItems={attentionItems}
                      warmth={warmth}
                      morningBrief={morningBrief}
                      fullBrief={dailyBrief}
                      portraits={portraits}
                      onSelectPlant={p=>setSel(p)}
                      onAction={doAction}
                    />
                  </>
                )}
                {sel && (
                  <div style={{position:'relative',zIndex:2,width:320,flexShrink:0,
                    background:'rgba(250,246,238,0.97)',borderLeft:`1px solid ${C.cardBorder}`}}>
                    <DetailPanel plant={sel} careLog={careLog} onClose={()=>setSel(null)}
                      onAction={doAction} seasonOpen={seasonOpen} onAnalyze={updatePortrait} portraits={portraits}
                      photos={allPhotos[sel.id] || []} onAddPhoto={addPhoto} onGrowthUpdate={updateGrowth}
                      briefings={briefings} onDeleteAction={deleteAction} weather={weather}/>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── JOURNAL VIEW ── */}
        {mode==='journal'&&(
          <div style={{flex:1, overflowY:'auto', background:C.appBg}}>
            <JournalView careLog={careLog} plants={[...terracePlants, ...frontPlants]} portraits={portraits} allPhotos={allPhotos}/>
          </div>
        )}

        {/* ── ORACLE VIEW ── */}
        {mode==='oracle'&&(
          <OracleChat
            plants={[...terracePlants, ...frontPlants]}
            careLog={careLog}
            weather={weather}
            seasonOpen={seasonOpen}
            seasonBlocking={seasonBlocking}
            portraits={portraits}
            style={{flex:1}}
          />
        )}

      </div>{/* end inner main content */}
      </div>{/* end body: sidebar + content */}

      {/* ── EXPENSE MODAL ── */}
      {showExpense&&(()=>{
        const EXP_CATS = [
          {key:'plants',label:'Plants',emoji:'🪴'},{key:'soil',label:'Soil',emoji:'🌱'},
          {key:'fertilizer',label:'Fertilizer',emoji:'🧪'},{key:'pest',label:'Pest Control',emoji:'🛡️'},
          {key:'tools',label:'Tools',emoji:'🪚'},{key:'other',label:'Other',emoji:'📦'},
        ];
        const EXP_GROUPS = [
          {key:'',label:'Whole Garden',emoji:'🌿'},{key:'wisteria',label:'Wisteria',emoji:'💜'},
          {key:'climbing-roses',label:'Climbing Roses',emoji:'🌹'},{key:'lavender',label:'Lavender',emoji:'🌸'},
          {key:'hydrangea',label:'Hydrangea',emoji:'💧'},{key:'serviceberry',label:'Serviceberry',emoji:'🌳'},
          {key:'maple',label:'Japanese Maple',emoji:'🍁'},{key:'evergreens',label:'Evergreens',emoji:'🌲'},
          {key:'emmas-roses',label:"Emma's Roses",emoji:'🌹'},
        ];
        // Ledger computations
        const byCategory = {};
        const byGroup = {};
        for (const e of expenses) {
          const cat = e.category || 'other';
          byCategory[cat] = (byCategory[cat] || 0) + e.cents;
          const grp = e.group || '';
          byGroup[grp] = (byGroup[grp] || 0) + e.cents;
        }
        // Weekly buckets for sparkline
        const weekBuckets = {};
        for (const e of expenses) {
          const d = new Date(e.date);
          const week = `${d.getFullYear()}-W${String(Math.ceil((d - new Date(d.getFullYear(),0,1)) / 604800000)).padStart(2,'0')}`;
          weekBuckets[week] = (weekBuckets[week] || 0) + e.cents;
        }
        const weekKeys = Object.keys(weekBuckets).sort();
        const maxWeek = Math.max(...Object.values(weekBuckets), 1);
        const inputStyle = {width:'100%',background:'#fff',border:`1px solid ${C.cardBorder}`,borderRadius:5,padding:'8px 10px',color:'#2a1808',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:SERIF};
        const labelStyle = {fontFamily:MONO,fontSize:7,color:'#a08060',marginBottom:5};
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
            <div style={{width:460,maxHeight:'90vh',background:'#faf6ee',border:`1px solid ${C.cardBorder}`,borderRadius:10,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,.25)',display:'flex',flexDirection:'column'}}>
              {/* Header */}
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.cardBorder}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                <div style={{display:'flex',gap:0}}>
                  {['log','ledger'].map(t=>(
                    <button key={t} onClick={()=>setExpTab(t)}
                      style={{background:expTab===t?'#2a1808':'none',border:`1px solid ${expTab===t?'#2a1808':C.cardBorder}`,
                        borderRadius:t==='log'?'4px 0 0 4px':'0 4px 4px 0',
                        padding:'5px 12px',cursor:'pointer',fontFamily:MONO,fontSize:7,
                        color:expTab===t?'#f0e4cc':'#a08060'}}>
                      {t==='log'?'LOG':'LEDGER'}
                    </button>
                  ))}
                </div>
                <button onClick={()=>setShowExpense(false)} style={{background:'none',border:'none',color:'#b09070',fontSize:22,cursor:'pointer',padding:0}}>&times;</button>
              </div>

              <div style={{overflowY:'auto',flex:1}}>
              {expTab==='log'?(
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:12}}>
                  {/* Description */}
                  <div>
                    <div style={labelStyle}>WHAT DID YOU BUY?</div>
                    <input type="text" value={expInput.desc} onChange={e=>setExpInput(p=>({...p,desc:e.target.value}))}
                      placeholder="Neem oil, new trowel, bag of soil..." style={inputStyle}
                      onKeyDown={e=>{ if(e.key==='Enter') addExpense(); }}/>
                  </div>
                  {/* Amount */}
                  <div>
                    <div style={labelStyle}>AMOUNT ($)</div>
                    <input type="number" value={expInput.amount} onChange={e=>setExpInput(p=>({...p,amount:e.target.value}))}
                      placeholder="0.00" step=".01" style={inputStyle}/>
                  </div>
                  {/* Category pills */}
                  <div>
                    <div style={labelStyle}>CATEGORY</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {EXP_CATS.map(c=>(
                        <button key={c.key} onClick={()=>setExpInput(p=>({...p,category:p.category===c.key?'':c.key}))}
                          style={{padding:'5px 10px',borderRadius:20,cursor:'pointer',fontFamily:SERIF,fontSize:12,
                            background:expInput.category===c.key?'rgba(180,120,20,0.15)':'#fff',
                            border:`1px solid ${expInput.category===c.key?'rgba(180,120,20,0.5)':C.cardBorder}`,
                            color:expInput.category===c.key?'#7a4a08':'#5a3818'}}>
                          {c.emoji} {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Group pills */}
                  <div>
                    <div style={labelStyle}>FOR</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {EXP_GROUPS.map(g=>(
                        <button key={g.key} onClick={()=>setExpInput(p=>({...p,group:p.group===g.key&&g.key!==''?'':g.key}))}
                          style={{padding:'5px 10px',borderRadius:20,cursor:'pointer',fontFamily:SERIF,fontSize:12,
                            background:expInput.group===g.key?'rgba(180,120,20,0.15)':'#fff',
                            border:`1px solid ${expInput.group===g.key?'rgba(180,120,20,0.5)':C.cardBorder}`,
                            color:expInput.group===g.key?'#7a4a08':'#5a3818'}}>
                          {g.emoji} {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={addExpense}
                    style={{background:'#2a1808',border:'none',borderRadius:6,padding:'11px',
                      color:'#f0e4cc',cursor:'pointer',fontFamily:MONO,fontSize:8,marginTop:2}}>
                    LOG EXPENSE
                  </button>
                </div>
              ):(
                /* LEDGER VIEW */
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:16}}>
                  {/* Season total */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                    <div>
                      <div style={labelStyle}>SEASON TOTAL</div>
                      <div style={{fontSize:32,fontWeight:600,color:'#2a1808',fontFamily:SERIF,lineHeight:1}}>${(totalSpend/100).toFixed(2)}</div>
                      <div style={{fontSize:11,color:'#a08060',fontFamily:SERIF,marginTop:3}}>{expenses.length} purchase{expenses.length!==1?'s':''}</div>
                    </div>
                    <button onClick={()=>setExpTab('log')}
                      style={{background:'rgba(180,120,20,0.12)',border:'1px solid rgba(180,120,20,0.3)',borderRadius:6,
                        padding:'7px 12px',cursor:'pointer',fontFamily:MONO,fontSize:7,color:'#7a4a08'}}>
                      + LOG
                    </button>
                  </div>

                  {/* Weekly spend bars */}
                  {weekKeys.length>1&&(
                    <div>
                      <div style={labelStyle}>BY WEEK</div>
                      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:48}}>
                        {weekKeys.map(w=>(
                          <div key={w} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                            <div style={{width:'100%',background:'#d4a830',borderRadius:'2px 2px 0 0',
                              height:`${Math.round((weekBuckets[w]/maxWeek)*44)}px`,minHeight:2}}/>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                        <span style={{fontFamily:MONO,fontSize:5,color:'#c0a880'}}>
                          {weekKeys[0]?.replace(/^\d+-W/,'Wk ')}
                        </span>
                        <span style={{fontFamily:MONO,fontSize:5,color:'#c0a880'}}>
                          {weekKeys[weekKeys.length-1]?.replace(/^\d+-W/,'Wk ')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* By category */}
                  {Object.keys(byCategory).length>0&&(
                    <div>
                      <div style={labelStyle}>BY CATEGORY</div>
                      <div style={{display:'flex',flexDirection:'column',gap:7}}>
                        {Object.entries(byCategory).sort(([,a],[,b])=>b-a).map(([cat,total])=>{
                          const catDef = EXP_CATS.find(c=>c.key===cat);
                          return (
                            <div key={cat}>
                              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                <span style={{fontFamily:SERIF,fontSize:12,color:'#5a3818'}}>{catDef?.emoji||'📦'} {catDef?.label||cat}</span>
                                <span style={{fontFamily:SERIF,fontSize:12,color:'#7a4a08',fontWeight:600}}>${(total/100).toFixed(2)}</span>
                              </div>
                              <div style={{height:5,background:'#ede8dc',borderRadius:3}}>
                                <div style={{height:'100%',width:`${Math.round((total/totalSpend)*100)}%`,background:'#d4a830',borderRadius:3}}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* By group */}
                  {Object.keys(byGroup).length>0&&(
                    <div>
                      <div style={labelStyle}>BY AREA</div>
                      <div style={{display:'flex',flexDirection:'column',gap:7}}>
                        {Object.entries(byGroup).sort(([,a],[,b])=>b-a).map(([grp,total])=>{
                          const grpDef = EXP_GROUPS.find(g=>g.key===grp);
                          return (
                            <div key={grp||'garden'}>
                              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                <span style={{fontFamily:SERIF,fontSize:12,color:'#5a3818'}}>{grpDef?.emoji||'🌿'} {grpDef?.label||'Whole Garden'}</span>
                                <span style={{fontFamily:SERIF,fontSize:12,color:'#7a4a08',fontWeight:600}}>${(total/100).toFixed(2)}</span>
                              </div>
                              <div style={{height:5,background:'#ede8dc',borderRadius:3}}>
                                <div style={{height:'100%',width:`${Math.round((total/totalSpend)*100)}%`,background:'rgba(180,120,20,0.55)',borderRadius:3}}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Full expense list */}
                  {expenses.length>0&&(
                    <div>
                      <div style={labelStyle}>ALL PURCHASES</div>
                      <div style={{display:'flex',flexDirection:'column',gap:0}}>
                        {[...expenses].reverse().map((e,i)=>{
                          const catDef = EXP_CATS.find(c=>c.key===e.category);
                          const grpDef = EXP_GROUPS.find(g=>g.key===(e.group||''));
                          return (
                            <div key={e.id||i} style={{display:'flex',alignItems:'center',gap:10,
                              padding:'8px 0',borderBottom:`1px solid ${C.cardBorder}`}}>
                              <span style={{fontSize:16,flexShrink:0}}>{catDef?.emoji||'📦'}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontFamily:SERIF,fontSize:13,color:'#2a1808',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.desc}</div>
                                <div style={{fontFamily:SERIF,fontSize:11,color:'#a08060'}}>
                                  {grpDef?.label||'Whole Garden'}
                                  {e.date && ` · ${new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
                                </div>
                              </div>
                              <div style={{fontFamily:SERIF,fontSize:14,color:'#5a3818',fontWeight:600,flexShrink:0}}>${(e.cents/100).toFixed(2)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {expenses.length===0&&(
                    <div style={{textAlign:'center',padding:'24px 0',color:'#c0a880',fontFamily:SERIF,fontSize:13,fontStyle:'italic'}}>
                      No expenses logged yet this season.
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PLANT SHOP MODAL ── */}
      {showShop && (
        <PlantShopModal
          onClose={() => setShowShop(false)}
          onAdd={addCustomPlant}
          availableContainers={availableContainers}
          existingPlants={gardenPlants.terrace}
          weather={weather?.poem}
        />
      )}

      {/* ── FLASH ── */}
      {flash&&(
        <div style={{position:'fixed',top:58,right:14,background:'#2a1808',color:'#f0e4cc',
          padding:'8px 16px',borderRadius:5,fontFamily:SERIF,fontSize:13,
          animation:'flashOut 2.2s forwards',pointerEvents:'none',zIndex:300,
          boxShadow:'0 2px 16px rgba(0,0,0,.3)',border:`1px solid ${C.uiBorder}`}}>
          {flash}
        </div>
      )}

      <style>{`
        @keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes flashOut{0%{opacity:1;transform:translateY(0)}70%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
        @keyframes fadeInModal{from{opacity:0}to{opacity:1}}
        @keyframes fadeConfirm{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(160,130,80,.3);border-radius:3px}
        button:active{transform:scale(.97)}
        input::placeholder{color:#c0a888}
        select option{background:#faf6ee;color:#2a1808}
      `}</style>
    </div>
  );
}
