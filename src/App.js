// Garden Party v0.5 — gardenparty.fun
// Garden View (illustrated cards) as primary · Map View as beautiful option
// Season 2 · Opens March 20, 2026

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TERRACE_PLANTS, FRONT_PLANTS, ACTION_DEFS, ACTION_HOWTO } from './data/plants';
import { PlantPortrait } from './PlantPortraits';
import { TerraceMap } from './TerraceMap';
import { FrontMap } from './FrontMap';
import { fetchOracle, fetchSeasonOpener, fetchMissedCareVoice } from './claude';
import { usePortraits } from './hooks/usePortraits';
import { usePhotos } from './hooks/usePhotos';
import { useAuth } from './hooks/useAuth';
import { useGardenData } from './hooks/useGardenData';
import { useMigration } from './hooks/useMigration';
import { OracleChat } from './components/OracleChat';
import { MobileView } from './components/MobileView';
import { PlantShopModal } from './components/PlantShopModal';
import { MapInfoPanel } from './components/MapInfoPanel';

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
  { key:'gifts',          label:'The Gifts',             types:['serviceberry','maple'] },
  { key:'evergreen',      label:'Evergreens',            types:['evergreen','evergreen-xmas'] },
  { key:'additions',      label:'New Additions',         types:['custom','annual','herb','fern','succulent','grass'] },
];

// ── STORAGE ───────────────────────────────────────────────────────────────
const LS = { care:'gp_care_v4', warmth:'gp_warmth_v4',
  expenses:'gp_expenses_v4', positions:'gp_pos_v4', growth:'gp_growth_v4' };
const load = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{return d;} };
const save = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} };

// ── CARE LOGIC ────────────────────────────────────────────────────────────
function actionStatus(plant, key, careLog, seasonOpen) {
  if (!seasonOpen) return { available:false, reason:'Not yet open' };
  const def = ACTION_DEFS[key]; if (!def) return { available:false, reason:'?' };
  if (def.alwaysAvailable) return { available:true };
  const entries = (careLog[plant.id]||[]).filter(e=>e.action===key);
  if (def.seasonMax !== null && entries.length >= def.seasonMax)
    return { available:false, reason:'Done for season' };
  if (def.cooldownDays > 0 && entries.length > 0) {
    const last = new Date(entries[entries.length-1].date);
    const days = (Date.now()-last.getTime())/86400000;
    if (days < def.cooldownDays)
      return { available:false, reason:`${Math.ceil(def.cooldownDays-days)}d` };
  }
  return { available:true };
}

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

// ── COOKIE WANDER ─────────────────────────────────────────────────────────
const WAYPOINTS=[{x:.32,y:.55},{x:.42,y:.65},{x:.50,y:.50},{x:.44,y:.42},{x:.36,y:.58},{x:.48,y:.72},{x:.38,y:.62}];
function useCookie(){
  const [pos,setPos]=useState({x:.40,y:.60});
  const [shooed,setShooed]=useState(false);
  const ref=useRef({wp:0,t:0});
  const timerRef=useRef(null);

  const shoo=useCallback(()=>{
    setShooed(true);
    clearTimeout(timerRef.current);
    timerRef.current=setTimeout(()=>setShooed(false), 10*60*1000); // returns in 10 min
  },[]);

  useEffect(()=>{
    if(shooed) return;
    let last=null,raf;
    const step=ts=>{
      if(last!==null){const dt=Math.min(ts-last,50);ref.current.t+=dt*.00007;
        if(ref.current.t>=1){ref.current.t=0;ref.current.wp=(ref.current.wp+1)%WAYPOINTS.length;}
        const fr=WAYPOINTS[ref.current.wp],to=WAYPOINTS[(ref.current.wp+1)%WAYPOINTS.length];
        const st=ease(ref.current.t);setPos({x:fr.x+(to.x-fr.x)*st,y:fr.y+(to.y-fr.y)*st});}
      last=ts;raf=requestAnimationFrame(step);};
    raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);
  },[shooed]);
  return {pos: shooed ? null : pos, shoo};
}

// ── MAP HOVER CARD ────────────────────────────────────────────────────────
function MissedCareVoice({ plant, daysSinceWater }) {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    fetchMissedCareVoice(plant, daysSinceWater)
      .then(setVoice)
      .catch(() => {});
  }, [plant.id, plant.health]);
  if (!voice) return null;
  return (
    <div style={{ fontSize:11, color:'#e09060', fontStyle:'italic', marginBottom:8 }}>
      {voice}
    </div>
  );
}

function MapPlantCard({ hovPlant, plants: allPlants, careLog, onAction, withEmma, setWithEmma, seasonOpen }) {
  const [confirmed, setConfirmed] = useState({}); // plantId → action key just logged
  const group = TERRACE_GROUPS.find(g => g.types.includes(hovPlant.type)) ||
    { key: hovPlant.type, label: hovPlant.name, types: [hovPlant.type] };
  const groupPlants = allPlants.filter(p => group.types.includes(p.type) && p.health !== 'memorial');
  const primaryPlant = groupPlants[0] || hovPlant;

  const URGENT_HEALTH = new Set(['thirsty','overlooked','struggling']);

  function handleAction(p, k) {
    if (!onAction) return;
    onAction(k, p);
    setConfirmed(prev => ({ ...prev, [p.id]: k }));
    setTimeout(() => setConfirmed(prev => { const n = {...prev}; delete n[p.id]; return n; }), 2000);
  }

  return (
    <div style={{ height:'100%', overflowY:'auto', fontFamily:SERIF, display:'flex', flexDirection:'column' }}>
      {/* Portrait — large */}
      <div style={{ width:'100%', flexShrink:0, background:'rgba(14,8,3,0.9)', overflow:'hidden',
        borderBottom:'1px solid rgba(160,130,80,0.15)' }}>
        <div style={{ width:'100%', aspectRatio:'4/3' }}>
          <PlantPortrait plant={primaryPlant}/>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding:'18px 22px 14px', borderBottom:'1px solid rgba(160,130,80,0.13)' }}>
        <div style={{ fontSize:22, fontWeight:300, color:'#f0e4cc', letterSpacing:'0.01em', lineHeight:1.2 }}>
          {group.label}
        </div>
        {primaryPlant.species && (
          <div style={{ fontSize:12, fontStyle:'italic', color:'rgba(240,228,200,0.5)', marginTop:4 }}>
            {primaryPlant.species}
          </div>
        )}
      </div>

      {/* Per-plant care rows */}
      {groupPlants.map(p => {
        const entries = careLog[p.id] || [];
        const lastWater = [...entries].reverse().find(e => e.action === 'water');
        const daysSinceWater = lastWater
          ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000)
          : null;
        const alwaysAvailActions = (p.actions || []).filter(k => ACTION_DEFS[k]?.alwaysAvailable);
        const availableNonTrivial = (p.actions || []).filter(k => {
          const def = ACTION_DEFS[k];
          if (!def || def.alwaysAvailable) return false;
          return actionStatus(p, k, careLog, seasonOpen).available;
        });
        const cooldownActions = (p.actions || []).filter(k => {
          const def = ACTION_DEFS[k];
          if (!def || def.alwaysAvailable) return false;
          const s = actionStatus(p, k, careLog, seasonOpen);
          return !s.available && s.reason && !s.reason.startsWith('Not yet') && s.reason !== 'Done for season';
        });
        const needsWater = p.actions?.includes('water') && actionStatus(p,'water',careLog,seasonOpen).available && URGENT_HEALTH.has(p.health);
        const justLogged = confirmed[p.id];

        return (
          <div key={p.id} style={{ padding:'14px 22px', borderBottom:'1px solid rgba(160,130,80,0.09)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div>
                <span style={{ fontSize:14, color:'#f0e4cc' }}>{p.name}</span>
                {p.subtitle && (
                  <span style={{ fontSize:11, color:'rgba(240,228,200,0.38)', marginLeft:8 }}>{p.subtitle}</span>
                )}
              </div>
              <div style={{ fontSize:10, padding:'2px 8px', borderRadius:10,
                background: healthColor(p.health) + '28',
                color: healthColor(p.health),
                border: `1px solid ${healthColor(p.health)}44` }}>
                {healthLabel(p.health)}
              </div>
            </div>

            {/* Last watered / missed care voice */}
            {daysSinceWater !== null && needsWater && URGENT_HEALTH.has(p.health) ? (
              <MissedCareVoice plant={p} daysSinceWater={daysSinceWater}/>
            ) : daysSinceWater !== null ? (
              <div style={{ fontSize:11, color: daysSinceWater > 2 ? '#e09060' : 'rgba(240,228,200,0.4)',
                marginBottom:8 }}>
                Watered {daysSinceWater === 0 ? 'today' : `${daysSinceWater}d ago`}
              </div>
            ) : (
              <div style={{ fontSize:11, color:'rgba(240,228,200,0.3)', marginBottom:8 }}>
                No water logged yet
              </div>
            )}

            {/* Confirmation flash */}
            {justLogged && (
              <div style={{ fontSize:11, color:'#88cc48', marginBottom:8, fontStyle:'italic',
                animation:'fadeConfirm 2s forwards' }}>
                ✓ {ACTION_DEFS[justLogged]?.label} logged{withEmma ? ' with Emma' : ''} · +{ACTION_DEFS[justLogged]?.warmth * (withEmma ? 2 : 1)}♥
              </div>
            )}

            {/* Quick-tap action buttons */}
            {!justLogged && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:6 }}>
                {/* Always-available: water, visit */}
                {alwaysAvailActions.filter(k => k !== 'photo').map(k => {
                  const def = ACTION_DEFS[k];
                  const urgent = k === 'water' && needsWater;
                  return (
                    <button key={k} onClick={() => handleAction(p, k)}
                      style={{ fontSize:11, padding:'5px 11px', borderRadius:8, cursor:'pointer', border:'none',
                        background: urgent ? 'rgba(200,80,20,0.35)' : 'rgba(255,255,255,0.08)',
                        color: urgent ? '#f0a070' : 'rgba(240,228,200,0.75)',
                        transition:'all .12s' }}
                      onMouseEnter={e => e.target.style.background = urgent ? 'rgba(200,80,20,0.55)' : 'rgba(255,255,255,0.16)'}
                      onMouseLeave={e => e.target.style.background = urgent ? 'rgba(200,80,20,0.35)' : 'rgba(255,255,255,0.08)'}>
                      {def?.emoji} {def?.label}
                    </button>
                  );
                })}
                {/* Seasonal: prune, train, fertilize, etc. */}
                {availableNonTrivial.map(k => {
                  const def = ACTION_DEFS[k];
                  return (
                    <button key={k} onClick={() => handleAction(p, k)}
                      style={{ fontSize:11, padding:'5px 11px', borderRadius:8, cursor:'pointer', border:'none',
                        background:'rgba(80,180,40,0.18)', color:'#88cc48',
                        transition:'all .12s' }}
                      onMouseEnter={e => e.target.style.background = 'rgba(80,180,40,0.32)'}
                      onMouseLeave={e => e.target.style.background = 'rgba(80,180,40,0.18)'}>
                      {def?.emoji} {def?.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Cooldown actions */}
            {cooldownActions.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {cooldownActions.map(k => {
                  const def = ACTION_DEFS[k];
                  const s = actionStatus(p, k, careLog, seasonOpen);
                  return (
                    <span key={k} style={{ fontSize:10, color:'rgba(240,228,200,0.32)' }}>
                      {def?.emoji} {def?.label} in {s.reason}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* With Emma toggle */}
      {setWithEmma && (
        <div style={{ padding:'14px 22px', borderBottom:'1px solid rgba(160,130,80,0.09)' }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
            fontSize:12, color: withEmma ? '#d4a830' : 'rgba(240,228,200,0.4)' }}>
            <input type="checkbox" checked={withEmma} onChange={e => setWithEmma(e.target.checked)}
              style={{ accentColor:'#d4a830', width:13, height:13 }}/>
            Tending with Emma
            {withEmma && <span style={{ fontSize:11, color:'#d4a830' }}>♥ ×2 warmth</span>}
          </label>
        </div>
      )}

      {/* Poem */}
      {primaryPlant.poem && (
        <div style={{ padding:'18px 22px 28px', marginTop:'auto' }}>
          <div style={{ fontStyle:'italic', fontSize:13, lineHeight:1.75,
            color:'rgba(240,228,200,0.52)', whiteSpace:'pre-line' }}>
            {primaryPlant.poem}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PLANT CARD ────────────────────────────────────────────────────────────
function PlantCard({ plant, careLog, onSelect, isSelected, seasonOpen, portrait, photos = [] }) {
  const history = careLog[plant.id] || [];
  const lastAction = history.length > 0 ? history[history.length-1] : null;
  const needsCare = seasonOpen && plant.actions?.some(a => actionStatus(plant, a, careLog, seasonOpen).available && !ACTION_DEFS[a]?.alwaysAvailable);
  const color = plantColor(plant.type);
  const hColor = healthColor(plant.health);
  const poemLines = plant.poem ? plant.poem.split('\n') : [];
  const hasPhoto = photos.length > 0;
  const needsDoc = !seasonOpen && !hasPhoto && plant.health !== 'memorial' && plant.type !== 'empty-pot';

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
            {plant.subtitle && <div style={{fontSize:11,color:'#907050',marginTop:1,fontFamily:SERIF}}>{plant.subtitle}</div>}
          </div>
          <span style={{fontSize:15,flexShrink:0,marginLeft:6,opacity:0.8}}>{typeEmoji(plant.type)}</span>
        </div>

        {/* Species · container */}
        {(plant.species || plant.container) && (
          <div style={{fontSize:10,color:'#a08060',fontStyle:'italic',marginBottom:7,fontFamily:SERIF,lineHeight:1.4}}>
            {plant.species}
            {plant.species && plant.container && <span style={{opacity:0.55}}> · </span>}
            {plant.container && <span style={{opacity:0.7}}>{plant.container}</span>}
          </div>
        )}

        {/* Full poem — all lines */}
        {poemLines.length > 0 && (
          <div style={{fontSize:11.5,color:'#5a3818',fontStyle:'italic',lineHeight:1.85,
            borderLeft:`2px solid ${color}50`,paddingLeft:9,marginBottom:8,fontFamily:SERIF}}>
            {poemLines.map((line, i) => (
              <React.Fragment key={i}>{line}{i < poemLines.length-1 && <br/>}</React.Fragment>
            ))}
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
          <div style={{fontSize:10,color:'#5080a8',marginBottom:6,fontFamily:SERIF}}>★ Gift from a friend</div>
        )}
        {plant.special === 'xmas' && (
          <div style={{fontSize:10,color:'#806020',marginBottom:6,fontFamily:SERIF}}>🎄 Was the Christmas tree</div>
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

// ── DETAIL PANEL ──────────────────────────────────────────────────────────
function DetailPanel({ plant, careLog, onClose, onAction, withEmma, setWithEmma, seasonOpen, onAnalyze, portraits, photos, onAddPhoto, onGrowthUpdate }) {
  const [tab, setTab] = useState('history');
  const [showHowTo, setShowHowTo] = useState(null);
  const history = careLog[plant.id] || [];
  const color = plantColor(plant.type);

  const handleAction = (key) => {
    const st = actionStatus(plant, key, careLog, seasonOpen);
    if (!st.available) return;
    const howto = ACTION_HOWTO[key];
    if (howto) {
      const text = howto[plant.type] || howto['default'];
      if (text) { setShowHowTo({ key, text }); return; }
    }
    onAction(key, plant);
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
          {['history','poem','care'].map(t=>(
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
              <PlantPortrait plant={plant}/>
            </div>
            {/* Photo section */}
            {plant.type !== 'empty-pot' && plant.health !== 'memorial' && (
              <PhotoSection plant={plant} color={color} careLog={careLog} onAnalyze={onAnalyze}
                portraits={portraits} photos={photos} onAddPhoto={onAddPhoto} onGrowthUpdate={onGrowthUpdate}/>
            )}

            {/* Badges */}
            <div style={{marginBottom:10}}>
              {plant.special==='wedding'&&<div style={{fontSize:11,color:'#a07030',marginBottom:4,fontFamily:SERIF}}>♥ Wedding gift for Emma</div>}
              {plant.special==='xmas'&&<div style={{fontSize:11,color:'#806020',marginBottom:4,fontFamily:SERIF}}>🎄 Was the Christmas tree</div>}
              {plant.special==='gift'&&<div style={{fontSize:11,color:'#5080a8',marginBottom:4,fontFamily:SERIF}}>★ Gift from a friend</div>}
              {plant.special==='zephirine'&&<div style={{fontSize:11,color:'#c03058',marginBottom:4,fontFamily:SERIF}}>🌹 Thornless · Deep pink · Fragrant</div>}
            </div>
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
                {[...history].reverse().map((e,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 0',
                    borderBottom:i<history.length-1?`1px solid rgba(160,130,80,0.12)`:'none'}}>
                    <span style={{fontSize:14,flexShrink:0}}>{e.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:'#2a1808',fontFamily:SERIF}}>{e.label}</div>
                      {e.withEmma&&<div style={{fontSize:11,color:'#a07030',fontFamily:SERIF}}>with Emma ♥</div>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:11,color:'#b09070',fontFamily:SERIF}}>{fmtDate(e.date)}</div>
                      <div style={{fontSize:11,color:color,fontFamily:SERIF}}>+{e.earned}♥</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* POEM TAB */}
        {tab==='poem'&&(
          <>
            <div style={{height:120,background:`${color}08`,borderRadius:8,overflow:'hidden',marginBottom:14,border:`1px solid ${color}20`}}>
              <PlantPortrait plant={plant}/>
            </div>
            {plant.poem ? (
              <div style={{fontSize:16,color:'#2a1808',fontStyle:'italic',lineHeight:2,
                whiteSpace:'pre-line',fontFamily:SERIF,
                borderLeft:`3px solid ${color}60`,paddingLeft:12,marginBottom:14}}>
                {plant.poem}
              </div>
            ) : (
              <div style={{fontSize:13,color:'#b09070',fontStyle:'italic',fontFamily:SERIF}}>No poem yet.</div>
            )}
            <div style={{fontSize:12,color:'#a08060',fontFamily:SERIF,lineHeight:1.7}}>{plant.lore}</div>
            <div style={{fontSize:11,color:'#b09070',marginTop:8,fontFamily:SERIF}}>🪴 {plant.container||'In-ground'}</div>
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
            {!seasonOpen && (
              <div style={{background:'rgba(40,80,120,0.08)',border:'1px solid rgba(60,100,160,0.2)',
                borderRadius:6,padding:'10px 12px',marginBottom:12}}>
                <div style={{fontFamily:MONO,fontSize:7,color:'#6090b0',marginBottom:4}}>PRE-SEASON</div>
                <div style={{fontSize:12,color:'#608090',fontFamily:SERIF,lineHeight:1.6}}>
                  Care actions unlock when Season 2 opens.
                </div>
              </div>
            )}
            {plant.type !== 'empty-pot' && (plant.actions||[]).length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
                {(plant.actions||[]).map(a=>{
                  const def=ACTION_DEFS[a]; if(!def) return null;
                  const st=actionStatus(plant,a,careLog,seasonOpen);
                  return(
                    <button key={a} onClick={()=>handleAction(a)} disabled={!st.available}
                      style={{display:'flex',alignItems:'center',gap:8,
                        background:st.available?'#fff':'rgba(0,0,0,.03)',
                        border:`1px solid ${st.available?`${color}40`:'rgba(160,130,80,.2)'}`,
                        borderRadius:6,padding:'8px 10px',cursor:st.available?'pointer':'not-allowed',
                        transition:'all .12s',textAlign:'left',
                        boxShadow:st.available?`0 1px 4px rgba(100,70,30,0.08)`:'none'}}>
                      <span style={{fontSize:15}}>{def.emoji}</span>
                      <span style={{flex:1,fontSize:13,color:st.available?'#2a1808':'#b09070',fontFamily:SERIF}}>{def.label}</span>
                      {st.available
                        ? <span style={{fontSize:11,color:color,fontFamily:SERIF}}>+{def.warmth}{withEmma?'×2':''}</span>
                        : <span style={{fontSize:10,color:'#c0a080',fontFamily:SERIF}}>{st.reason}</span>
                      }
                    </button>
                  );
                })}
              </div>
            )}
            {plant.type !== 'empty-pot' && (
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'#907050',fontFamily:SERIF}}>
                <input type="checkbox" checked={withEmma} onChange={e=>setWithEmma(e.target.checked)}
                  style={{accentColor:color,width:14,height:14}}/>
                Tended with Emma
                <span style={{color:'#a07030',marginLeft:2}}>×2 warmth</span>
              </label>
            )}
          </>
        )}
      </div>

      {/* How-to overlay */}
      {showHowTo && (
        <div style={{position:'absolute',inset:0,background:'rgba(245,238,225,0.97)',display:'flex',flexDirection:'column',zIndex:10,padding:16}}>
          <div style={{fontFamily:MONO,fontSize:8,color:color,marginBottom:4}}>HOW TO</div>
          <div style={{fontSize:17,color:'#2a1808',fontWeight:600,fontFamily:SERIF,marginBottom:12}}>
            {ACTION_DEFS[showHowTo.key]?.emoji} {ACTION_DEFS[showHowTo.key]?.label}
          </div>
          <div style={{fontSize:13,color:'#4a2c10',lineHeight:1.85,whiteSpace:'pre-line',fontFamily:SERIF,flex:1,overflowY:'auto'}}>
            {showHowTo.text}
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button onClick={()=>setShowHowTo(null)}
              style={{flex:1,background:'none',border:`1px solid ${C.cardBorder}`,borderRadius:6,
                padding:'8px',color:'#907050',cursor:'pointer',fontSize:13,fontFamily:SERIF}}>
              Not now
            </button>
            <button onClick={()=>{setShowHowTo(null);onAction(showHowTo.key,plant);}}
              style={{flex:2,background:color,border:'none',borderRadius:6,
                padding:'8px',color:'#fff',cursor:'pointer',fontFamily:MONO,fontSize:8}}>
              I DID IT ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── JOURNAL VIEW ──────────────────────────────────────────────────────────
function JournalView({ careLog, plants }) {
  // Flatten all entries with plant info, sorted by date
  const allEntries = [];
  Object.entries(careLog).forEach(([plantId, entries]) => {
    const plant = plants.find(p => p.id === plantId);
    if (!plant) return;
    entries.forEach(e => allEntries.push({ ...e, plant }));
  });
  allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allEntries.length === 0) {
    return (
      <div style={{padding:'48px 24px', textAlign:'center'}}>
        <div style={{fontSize:32, marginBottom:16}}>🌱</div>
        <div style={{fontSize:16, color:'#907050', fontFamily:SERIF, fontStyle:'italic', lineHeight:1.8}}>
          The journal is empty.<br/>Season 2 opens March 20.<br/>Your first entry will appear here.
        </div>
      </div>
    );
  }

  // Group by week
  const weeks = {};
  allEntries.forEach(e => {
    const d = new Date(e.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(e);
  });

  return (
    <div style={{maxWidth:640, margin:'0 auto', padding:'24px 20px'}}>
      <div style={{fontFamily:MONO, fontSize:9, color:C.uiGold, letterSpacing:.5, marginBottom:20}}>
        SEASON 2 JOURNAL
      </div>
      {Object.entries(weeks).sort(([a],[b]) => b.localeCompare(a)).map(([weekKey, entries]) => {
        const weekDate = new Date(weekKey);
        const label = weekDate.toLocaleDateString('en-US', {month:'long', day:'numeric'});
        return (
          <div key={weekKey} style={{marginBottom:28}}>
            <div style={{
              display:'flex', alignItems:'center', gap:10, marginBottom:10
            }}>
              <div style={{height:1, flex:1, background:C.cardBorder}}/>
              <span style={{fontSize:10, color:'#a08060', fontFamily:MONO, letterSpacing:.3}}>
                Week of {label}
              </span>
              <div style={{height:1, flex:1, background:C.cardBorder}}/>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:0}}>
              {entries.map((e, i) => {
                const color = plantColor(e.plant.type);
                return (
                  <div key={i} style={{
                    display:'flex', gap:12, padding:'10px 0',
                    borderBottom: i < entries.length - 1 ? `1px solid ${C.cardBorder}` : 'none',
                    alignItems:'flex-start',
                  }}>
                    <div style={{
                      width:3, alignSelf:'stretch', borderRadius:2,
                      background:color, flexShrink:0, marginTop:2,
                    }}/>
                    <span style={{fontSize:18, flexShrink:0, lineHeight:1}}>{e.emoji}</span>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'baseline', gap:6, flexWrap:'wrap'}}>
                        <span style={{fontSize:13, color:'#2a1808', fontFamily:SERIF, fontWeight:600}}>
                          {e.label}
                        </span>
                        <span style={{fontSize:11, color:color, fontFamily:SERIF}}>
                          {e.plant.name}
                          {e.plant.subtitle ? ` · ${e.plant.subtitle}` : ''}
                        </span>
                      </div>
                      {e.withEmma && (
                        <div style={{fontSize:11, color:'#a07030', fontFamily:SERIF, marginTop:2}}>
                          ♥ with Emma
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:'right', flexShrink:0}}>
                      <div style={{fontSize:10, color:'#b09070', fontFamily:SERIF}}>
                        {new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                      </div>
                      <div style={{fontSize:10, color:C.uiGold, fontFamily:SERIF}}>
                        +{e.earned}♥
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);
  const [withEmma, setWithEmma] = useState(false);
  const { user, role, signIn, signOut, checking, authError } = useAuth();
  const { warmth, careLog, expenses, positions, growth, logAction, updateGrowth, movePosition, addExpense: addExpenseDb, addWarmth } = useGardenData({ user });
  useMigration({ user });
  const isMobile = useIsMobile();
  const [flash, setFlash] = useState(null);
  const [showExpense, setShowExpense] = useState(false);
  const [expInput, setExpInput] = useState({desc:'',amount:'',plantId:''});
  const [draggingId, setDraggingId] = useState(null);
  const [oracle, setOracle] = useState(null);
  const { portraits, updatePortrait } = usePortraits({ user });
  const { allPhotos, addPhoto } = usePhotos({ user });
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
    () => !!localStorage.getItem('gp_season_opener_dismissed_2026')
  );
  const weather = useWeather();
  const { pos: cookiePos, shoo: shooСookie } = useCookie();

  const frontPlants = useMemo(() => FRONT_PLANTS, []);

  const terracePlants = useMemo(()=>
    TERRACE_PLANTS.map(p=>({...p, pos:positions[p.id]||p.pos, growth:growth[p.id]??p.growth??0})),
    [positions, growth]);

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

    const todayCode = weather?.code ?? 0;
    const todayBad = todayCode >= 61; // WMO ≥61 = precipitation
    const tomorrow = weather?.forecast?.[1];
    const tomorrowBad = tomorrow ? (tomorrow.precipChance > 60 || tomorrow.code >= 61) : false;
    const weatherOk = !todayBad && !tomorrowBad;

    let blocking = null;
    if (!readinessOk) blocking = 'readiness';
    else if (!calendarOk) blocking = 'calendar';
    else if (!weatherOk) blocking = tomorrow?.precipChance > 60 ? 'rain-tomorrow' : 'rain-today';

    return {
      seasonOpen: readinessOk && calendarOk && weatherOk,
      seasonReadiness: score,
      plantsNeedingPhotos: active.filter(p => (allPhotos[p.id] || []).length === 0).map(p => p.name),
      photoCount: withPhotos.length,
      activePlantCount: active.length,
      seasonBlocking: blocking,
    };
  }, [terracePlants, weather, allPhotos]);

  // Oracle — fetch once per day on mount, after weather loads
  useEffect(() => {
    if (!weather) return; // wait for weather
    const photoContext = TERRACE_PLANTS
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
      .map(p => {
        const all = allPhotos[p.id] || [];
        return { name: p.name, count: all.length, lastDate: all[all.length - 1]?.date ?? null };
      });
    const totalPhotos = photoContext.reduce((s, p) => s + p.count, 0);
    fetchOracle({ weather, warmth, plants: TERRACE_PLANTS, careLog, seasonOpen, seasonBlocking, plantsNeedingPhotos, photoCount, activePlantCount, photoContext, totalPhotos, portraits })
      .then(setOracle)
      .catch(() => {}); // fail silently in local dev
  }, [weather]);

  // Season opener — show once when season first opens
  useEffect(() => {
    if (!seasonOpen) return;
    if (seasonOpenerDismissed) return;
    setSeasonOpener('loading');
    fetchSeasonOpener({ warmth, plants: TERRACE_PLANTS })
      .then(text => setSeasonOpener(text))
      .catch(() => setSeasonOpener(null));
  }, []);

  // Route to front scene for opening ceremony
  useEffect(() => {
    if (seasonOpener && seasonOpener !== 'loading' && !seasonOpenerDismissed) {
      setScene('front');
    }
  }, [seasonOpener]);

  // Care action
  const doAction = useCallback(async (key, plant) => {
    const def = ACTION_DEFS[key]; if (!def) return;
    const autoEmma = role === 'emma'; // Emma's actions always count as with-Emma
    const isWithEmma = withEmma || autoEmma;
    const earned = await logAction(key, plant, isWithEmma);
    setFlash(`${def.emoji} ${def.label}${isWithEmma ? ' with Emma' : ''} · +${earned || def.warmth}♥`);
    setTimeout(() => setFlash(null), 2500);
  }, [withEmma, role, logAction]);

  // Expense
  const addExpense = () => {
    const amt = parseFloat(expInput.amount);
    if (!expInput.desc || isNaN(amt) || amt <= 0) return;
    addExpenseDb(expInput.desc, Math.round(amt * 100), expInput.plantId || null);
    setExpInput({ desc: '', amount: '', plantId: '' });
    setShowExpense(false);
    setFlash(`💰 $${amt.toFixed(2)} logged`);
    setTimeout(() => setFlash(null), 2000);
  };

  const totalSpend = expenses.reduce((s,e)=>s+e.cents,0);

  // Garden view plants (no empty pots — those become available containers in the UI)
  const gardenPlants = useMemo(()=>({
    terrace: [...terracePlants.filter(p => p.type !== 'empty-pot'), ...customPlantsWithState],
  }),[terracePlants, customPlantsWithState]);

  const needsCareCount = gardenPlants.terrace.filter(p=>
    seasonOpen && p.actions?.some(a=>actionStatus(p,a,careLog,seasonOpen).available&&!ACTION_DEFS[a]?.alwaysAvailable)
  ).length;

  // Map info panel data
  const attentionItems = useMemo(() =>
    gardenPlants.terrace
      .filter(p => p.health !== 'memorial')
      .flatMap(p => (p.actions || [])
        .filter(a => {
          const def = ACTION_DEFS[a];
          return def && !def.alwaysAvailable && actionStatus(p, a, careLog, seasonOpen).available;
        })
        .map(a => ({ plant: p, action: a, def: ACTION_DEFS[a] }))
      )
      .slice(0, 6),
    [gardenPlants.terrace, careLog, seasonOpen]);

  const recentCare = useMemo(() => {
    const all = gardenPlants.terrace.flatMap(p =>
      (careLog[p.id] || []).map(e => ({ ...e, plant: p }))
    );
    return all.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  }, [gardenPlants.terrace, careLog]);

  // ── FRONT SCENE (opening screen) ────────────────────────────────────────
  if (scene === 'front') {
    const isOpener = seasonOpen && !seasonOpenerDismissed && seasonOpener && seasonOpener !== 'loading';
    return (
      <div style={{width:'100vw',height:'100vh',overflow:'hidden'}}>
        <FrontMap
          plants={frontPlants}
          growth={growth}
          weather={weather}
          warmth={warmth}
          oracle={isOpener ? null : oracle}
          seasonOpenerText={isOpener ? seasonOpener : null}
          isNight={warmth >= 1000}
          selectedId={isOpener ? null : sel}
          onSelect={isOpener ? () => {} : (p) => setSel(p?.id ?? null)}
          onEnter={isOpener
            ? () => {
                localStorage.setItem('gp_season_opener_dismissed_2026', '1');
                setSeasonOpenerDismissed(true);
                setScene('game');
                setMode('garden');
                setGardenView('cards');
              }
            : () => { setScene('game'); setMode('garden'); setGardenView('map'); }
          }
        />
      </div>
    );
  }

  // Mobile — swap to the mobile layout
  if (isMobile) {
    return (
      <MobileView
        plants={terracePlants}
        careLog={careLog}
        warmth={warmth}
        weather={weather}
        onAction={doAction}
        onPortraitUpdate={updatePortrait}
        onGrowthUpdate={updateGrowth}
        allPhotos={allPhotos}
        onAddPhoto={addPhoto}
        role={role}
        signIn={signIn}
        signOut={signOut}
        seasonOpen={seasonOpen}
      />
    );
  }

  return (
    <div style={{width:'100vw',height:'100vh',background:C.appBg,display:'flex',flexDirection:'column',overflow:'hidden',fontFamily:SERIF}}>

      {/* ── TOP CHROME ── */}
      <div style={{height:46,background:C.uiPane,borderBottom:`2px solid ${C.uiBorder}`,
        display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}}>
        <span style={{fontFamily:MONO,fontSize:10,color:C.uiGold,letterSpacing:.5}}>GARDEN PARTY</span>
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

        {/* Warmth */}
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:64,height:6,background:C.uiLight,borderRadius:3,border:`1px solid ${C.uiBorder}`,overflow:'hidden'}}>
            <div style={{width:`${warmth/10}%`,height:'100%',background:warmth>=1000?'#f0d040':C.uiGold,borderRadius:3,transition:'width .4s'}}/>
          </div>
          <span style={{fontFamily:MONO,fontSize:8,color:C.uiGold,minWidth:40}}>{warmth}/1k</span>
        </div>

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
            {id:'garden', icon:'🌿', label:'Garden'},
            {id:'journal',icon:'📖', label:'Journal'},
          ].map(item=>(
            <button key={item.id} onClick={()=>setMode(item.id)}
              style={{
                background:'none',border:'none',cursor:'pointer',
                padding:'10px 0',width:'100%',
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                borderLeft:`3px solid ${mode===item.id?C.uiGold:'transparent'}`,
                transition:'border-color .15s',
              }}>
              <span style={{fontSize:18,lineHeight:1}}>{item.icon}</span>
              <span style={{fontFamily:MONO,fontSize:5.5,
                color:mode===item.id?C.uiGold:C.uiDim,letterSpacing:.4,transition:'color .15s'}}>
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
            {/* Garden/Map toggle bar */}
            <div style={{
              height:38,flexShrink:0,background:C.appBg,
              borderBottom:`1px solid ${C.cardBorder}`,
              display:'flex',alignItems:'center',padding:'0 16px',gap:8,
            }}>
              {[{id:'cards',label:'🌿 Plants'},{id:'map',label:'🗺 Map'}].map(v=>(
                <button key={v.id} onClick={()=>setGardenView(v.id)}
                  style={{background:gardenView===v.id?'#2a1808':'transparent',
                    border:`1px solid ${gardenView===v.id?'rgba(90,60,24,0.6)':C.cardBorder}`,
                    borderRadius:20,padding:'3px 14px',
                    color:gardenView===v.id?'#f0e4cc':'#907050',
                    fontFamily:SERIF,fontSize:12,cursor:'pointer',transition:'all .12s'}}>
                  {v.label}
                </button>
              ))}
              {gardenView==='map'&&(
                <button onClick={()=>setScene('front')}
                  style={{background:'transparent',
                    border:`1px solid rgba(200,180,140,0.28)`,
                    borderRadius:20,padding:'3px 14px',
                    color:'#b09070',
                    fontFamily:SERIF,fontSize:12,cursor:'pointer',transition:'all .12s',
                    display:'flex',alignItems:'center',gap:4}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(200,180,140,0.55)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(200,180,140,0.28)'}>
                  🌹 Emma's Garden
                </button>
              )}
              <div style={{flex:1}}/>
              <button onClick={()=>setShowShop(true)}
                style={{background:'rgba(212,168,48,0.12)',border:'1px solid rgba(212,168,48,0.35)',
                  borderRadius:20,padding:'3px 14px',color:C.uiGold,
                  fontFamily:SERIF,fontSize:12,cursor:'pointer',transition:'all .12s'}}
                onMouseEnter={e=>e.target.style.background='rgba(212,168,48,0.22)'}
                onMouseLeave={e=>e.target.style.background='rgba(212,168,48,0.12)'}>
                + New Plant
              </button>
            </div>
            <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            {/* ── CARDS SUB-VIEW ── */}
            {gardenView==='cards'&&(<>
            <div style={{flex:1,overflowY:'auto',padding:'0'}}>
              <div style={{padding:'14px 16px 24px',display:'flex',flexDirection:'column',gap:0}}>
                {(()=>{
                  const renderGroups = (plants, groups, sectionLabel) => groups.map(grp => {
                    const ps = plants.filter(p => grp.types.includes(p.type));
                    if (ps.length === 0) return null;
                    return (
                      <div key={grp.key} style={{marginBottom:24}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                          <span style={{fontSize:10,color:'#a08060',fontFamily:MONO,letterSpacing:.5,whiteSpace:'nowrap'}}>
                            {sectionLabel ? `${sectionLabel} · ` : ''}{grp.label.toUpperCase()}
                          </span>
                          <div style={{height:1,flex:1,background:C.cardBorder}}/>
                          <span style={{fontSize:9,color:C.uiDim,fontFamily:MONO}}>{ps.length}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                          {ps.map(p=>(
                            <PlantCard key={p.id} plant={p} careLog={careLog}
                              onSelect={p=>{setSel(p);}} isSelected={sel?.id===p.id} seasonOpen={seasonOpen}
                              portrait={portraits[p.id]} photos={allPhotos[p.id] || []}/>
                          ))}
                        </div>
                      </div>
                    );
                  });
                  return (
                    <>
                      {gardenPlants.terrace.length>0&&renderGroups(gardenPlants.terrace, TERRACE_GROUPS, null)}
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
                  onAction={doAction} withEmma={withEmma} setWithEmma={setWithEmma}
                  seasonOpen={seasonOpen} onAnalyze={updatePortrait} portraits={portraits}
                  photos={allPhotos[sel.id] || []} onAddPhoto={addPhoto} onGrowthUpdate={updateGrowth}/>
              </div>
            )}
            </>)}

            {/* ── MAP SUB-VIEW ── */}
            {gardenView==='map'&&(
              <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',inset:'-8%',backgroundImage:'url(/brownstone.jpg)',
                  backgroundSize:'cover',backgroundPosition:'center 35%',filter:'blur(32px)',zIndex:0}}/>
                <div style={{position:'absolute',inset:0,background:'rgba(7,4,1,0.60)',zIndex:0}}/>
                <div style={{flex:1,position:'relative',zIndex:1,display:'flex',alignItems:'center',
                  justifyContent:'flex-start',padding:'0 0 0 20px',overflow:'hidden'}}>
                  <div style={{height:'100%',maxHeight:'100%',aspectRatio:'820 / 854',maxWidth:'58vw',flexShrink:0}}>
                    <TerraceMap
                      plants={mapPlants}
                      selectedId={sel?.id}
                      cookiePos={cookiePos}
                      onCookieShoo={() => {
                        shooСookie();
                        setFlash('🐱 Cookie shooed! +5♥');
                        setTimeout(() => setFlash(null), 2500);
                        addWarmth(5);
                      }}
                      onSelect={p=>{ if(p) setSel(p); else setSel(null); }}
                      onMove={(id,pos)=>movePosition(id,pos)}
                      onHover={setHov}
                      onDescend={()=>setScene('front')}
                    />
                  </div>
                </div>
                {/* Right panel: info dash by default, plant panels when hov/sel */}
                {!hov && !sel && (
                  <MapInfoPanel
                    plants={gardenPlants.terrace}
                    careLog={careLog}
                    warmth={warmth}
                    weather={weather}
                    seasonOpen={seasonOpen}
                    seasonBlocking={seasonBlocking}
                    photoCount={photoCount}
                    activePlantCount={activePlantCount}
                    attentionItems={attentionItems}
                    recentCare={recentCare}
                    onSelectPlant={p=>setSel(p)}
                  />
                )}
                {hov && !sel && (
                  <div style={{position:'relative',zIndex:2,width:294,flexShrink:0,
                    background:'rgba(10,6,3,0.93)',borderLeft:'1px solid rgba(160,130,80,0.18)',
                    overflowY:'auto'}}>
                    <MapPlantCard hovPlant={hov} plants={mapPlants} careLog={careLog}
                      onAction={doAction} withEmma={withEmma} setWithEmma={setWithEmma} seasonOpen={seasonOpen}/>
                  </div>
                )}
                {sel && (
                  <div style={{position:'relative',zIndex:2,width:320,flexShrink:0,
                    background:'rgba(250,246,238,0.97)',borderLeft:`1px solid ${C.cardBorder}`}}>
                    <DetailPanel plant={sel} careLog={careLog} onClose={()=>setSel(null)}
                      onAction={doAction} withEmma={withEmma} setWithEmma={setWithEmma}
                      seasonOpen={seasonOpen} onAnalyze={updatePortrait} portraits={portraits}
                      photos={allPhotos[sel.id] || []} onAddPhoto={addPhoto} onGrowthUpdate={updateGrowth}/>
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
            <JournalView careLog={careLog} plants={[...terracePlants]}/>
          </div>
        )}

        {/* ── ORACLE VIEW ── */}
        {mode==='oracle'&&(
          <OracleChat
            plants={terracePlants}
            careLog={careLog}
            warmth={warmth}
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
      {showExpense&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',
          alignItems:'center',justifyContent:'center',zIndex:200}}>
          <div style={{width:380,background:'#faf6ee',border:`1px solid ${C.cardBorder}`,borderRadius:10,overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,.25)'}}>
            <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.cardBorder}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontFamily:MONO,fontSize:9,color:'#5a3818'}}>LOG EXPENSE</span>
              <button onClick={()=>setShowExpense(false)} style={{background:'none',border:'none',color:'#b09070',fontSize:22,cursor:'pointer',padding:0}}>&times;</button>
            </div>
            <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:10}}>
              {[{label:'WHAT DID YOU BUY?',key:'desc',ph:'Neem oil, new trowel, roses...',type:'text'},
                {label:'AMOUNT ($)',key:'amount',ph:'0.00',type:'number'}].map(f=>(
                <div key={f.key}>
                  <div style={{fontFamily:MONO,fontSize:7,color:'#a08060',marginBottom:4}}>{f.label}</div>
                  <input type={f.type} value={expInput[f.key]} onChange={e=>setExpInput(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.ph} step={f.type==='number'?'.01':undefined}
                    style={{width:'100%',background:'#fff',border:`1px solid ${C.cardBorder}`,borderRadius:5,
                      padding:'8px 10px',color:'#2a1808',fontSize:13,outline:'none',
                      boxSizing:'border-box',fontFamily:SERIF}}/>
                </div>
              ))}
              <div>
                <div style={{fontFamily:MONO,fontSize:7,color:'#a08060',marginBottom:4}}>FOR WHICH PLANT?</div>
                <select value={expInput.plantId} onChange={e=>setExpInput(p=>({...p,plantId:e.target.value}))}
                  style={{width:'100%',background:'#fff',border:`1px solid ${C.cardBorder}`,borderRadius:5,
                    padding:'8px 10px',color:'#2a1808',fontSize:13,fontFamily:SERIF,outline:'none',boxSizing:'border-box'}}>
                  <option value="">General / garden supplies</option>
                  {ALL_PLANTS.filter(p=>p.health!=='empty'&&p.health!=='memorial').map(p=>(
                    <option key={p.id} value={p.id}>{p.name}{p.subtitle?` (${p.subtitle})`:''}</option>
                  ))}
                </select>
              </div>
              {expenses.length>0&&(
                <div style={{background:'rgba(160,130,80,.08)',borderRadius:5,padding:'8px 10px'}}>
                  <div style={{fontFamily:MONO,fontSize:7,color:'#a08060',marginBottom:4}}>SEASON TOTAL</div>
                  <div style={{fontSize:18,color:'#5a3818',fontWeight:600,fontFamily:SERIF}}>${(totalSpend/100).toFixed(2)}</div>
                  <div style={{marginTop:4,maxHeight:72,overflowY:'auto'}}>
                    {[...expenses].reverse().slice(0,5).map((e,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#907050',padding:'2px 0',fontFamily:SERIF}}>
                        <span>{e.desc}</span><span>${(e.cents/100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={addExpense}
                style={{background:'#2a1808',border:'none',borderRadius:6,padding:'10px',
                  color:'#f0e4cc',cursor:'pointer',fontFamily:MONO,fontSize:8,marginTop:2}}>
                LOG EXPENSE
              </button>
            </div>
          </div>
        </div>
      )}

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
