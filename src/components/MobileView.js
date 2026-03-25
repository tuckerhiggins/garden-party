// Mobile view — optimized for use while actually in the garden
// Hero features: photo upload, quick care, oracle chat
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { OracleChat } from './OracleChat';
import { ACTION_DEFS } from '../data/plants';
import { PlantPortrait } from '../PlantPortraits';
import { fetchPlantBriefing, fetchDailyAgenda, fetchJournalEntry, streamGardenChat } from '../claude';
import { compressChatImage } from '../utils/compressChatImage';
import { actionStatus, extractFutureActionDate, computeAgenda } from '../utils/agenda';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO = '"Press Start 2P", monospace';

const AGENDA_CSS = `
  @keyframes gpPulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.5)} }
  @keyframes gpFlashRow { 0%{background:rgba(72,120,32,0.22)} 80%{background:rgba(72,120,32,0.06)} 100%{background:transparent} }
  .gp-pulse-dot { animation: gpPulseDot 1.6s ease-in-out infinite; }
  .gp-flash-row { animation: gpFlashRow 1.4s ease forwards; }
`;

const C = {
  appBg: '#f2ece0', cardBg: '#faf6ee', cardBorder: 'rgba(160,130,80,0.18)',
  uiBg: '#120c06', uiPane: '#1c1008', uiBorder: '#5a3c18',
  uiText: '#f0e4cc', uiMuted: '#a89070', uiGold: '#d4a830',
};

// High-contrast outdoor mode — boosts secondary text for bright sunlight readability
const HighContrastCtx = React.createContext(false);
function useCC() {
  const hc = React.useContext(HighContrastCtx);
  return hc ? {
    muted:    '#5a3010',  // was #907050
    dim:      '#6a4020',  // was #b09070
    faint:    '#7a5030',  // was #c0a080
    tertiary: '#5a3818',  // was #a08060
  } : {
    muted:    '#907050',
    dim:      '#b09070',
    faint:    '#c0a080',
    tertiary: '#a08060',
  };
}

// Inline action-key colors for brief narrative highlights
const BRIEF_ACTION_COLORS = {
  water: '#4a8ac8', fertilize: '#5a9a40', prune: '#c87030',
  neem: '#7050a8', train: '#a07840', worms: '#806030',
  repot: '#c05040', tend: '#c09820',
};

// Parse [key] markers in brief text into styled inline spans
function renderBriefText(text) {
  if (!text) return null;
  const parts = text.split(/(\[[a-z]+\])/);
  return parts.map((part, i) => {
    const m = part.match(/^\[([a-z]+)\]$/);
    if (m) {
      const color = BRIEF_ACTION_COLORS[m[1]] || '#c09820';
      return <span key={i} style={{ color, fontWeight: 700 }}>{m[1]}</span>;
    }
    return part;
  });
}

function plantColor(type) {
  return {
    wisteria: '#9860c8', 'climbing-rose': '#e84070', rose: '#e84070',
    lavender: '#b890e0', hydrangea: '#9ab8d0', serviceberry: '#d06030',
    maple: '#d85828', evergreen: '#4a7828', 'evergreen-xmas': '#888040',
    'empty-pot': '#909088', memorial: '#907060', worm: '#c09060',
    'stone-pot': '#b0a070',
  }[type] || '#909080';
}

function healthColor(h) {
  return {
    thriving: '#58c030', content: '#88c838', thirsty: '#c8a820',
    overlooked: '#c87020', struggling: '#c83020', resting: '#7898a8',
    empty: '#909088', memorial: '#907060', recovering: '#98a828',
  }[h] || '#909080';
}

function healthLabel(h) {
  return {
    thriving: 'Thriving', content: 'Content', thirsty: 'Thirsty',
    overlooked: 'Overlooked', struggling: 'Struggling', resting: 'Resting',
    empty: 'Awaiting', memorial: 'In memoriam', recovering: 'Recovering',
  }[h] || h;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


// ── PHOTO helpers ──────────────────────────────────────────────────────────
async function compressImage(file, maxPx = 800, quality = 0.72) {
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
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── MOBILE ACTION SHEET ────────────────────────────────────────────────────
// Full-screen care session: fork → confirm or guided chat
// Designed for one-handed use while actively gardening.
const MOBILE_AFFIRMATIONS = {
  fertilize: ['Feeding logged. Watch for new growth.', 'Nutrients in. Good timing.'],
  neem:      ['Pest prevention logged.', 'Good preventive care.'],
  prune:     ['Logged. Clean cuts mean strong growth.', 'Pruning directs the plant\'s energy.'],
  train:     ['Training logged. Good for the season.', 'Logged — patience pays off.'],
  repot:     ['Logged. Keep water consistent.', 'New roots incoming.'],
  worms:     ['Soil biology logged.', 'Good long-term investment.'],
};
// ── NATURAL LANGUAGE DATE PARSER ──────────────────────────────────────────
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
    const d = new Date();
    let back = (d.getDay() - target + 7) % 7;
    if (back === 0) back = 7;
    d.setDate(d.getDate() - back);
    return d.toISOString();
  }

  const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
  const monthDayM = t.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayM) {
    const d = new Date(now.getFullYear(), MONTHS[monthDayM[1]], parseInt(monthDayM[2]));
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  }

  // ISO or native parseable date (e.g. "2026-03-15")
  const native = new Date(text);
  if (!isNaN(native.getTime())) return native.toISOString();

  return null;
}

function mobileAffirmation(key) {
  const arr = MOBILE_AFFIRMATIONS[key] || ['Logged.'];
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

function MobileActionSheet({ plant, actionKey, task = null, careLog, portraits, weather, onLog, onClose, onGoToPlant }) {
  const def = ACTION_DEFS[actionKey];
  const color = plantColor(plant.type);
  const [mode, setMode] = React.useState(null); // null | 'explain'
  const [logged, setLogged] = React.useState(false);

  // chat state (only used in explain mode)
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [chatPhoto, setChatPhoto] = React.useState(null);
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatFileRef = React.useRef(null);
  const chatEndRef = React.useRef(null);

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

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendChat(text, images = []) {
    const userMsg = { role: 'user', content: text, ...(images.length ? { images } : {}) };
    const nextMsgs = [...messages, userMsg];
    setMessages([...nextMsgs, { role: 'assistant', content: '' }]);
    setInput(''); setChatPhoto(null); setChatLoading(true);
    try {
      await streamGardenChat({
        messages: nextMsgs, plantContext: buildContext(), action: def?.label || task?.label || actionKey,
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
    setMessages(m => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last?.role !== 'assistant') return c;
      const { text: cleanText, diagram, photoRequest } = parseOracleMsg(last.content);
      c[c.length - 1] = { ...last, content: cleanText, ...(diagram ? { diagram } : {}), ...(photoRequest ? { photoRequest } : {}) };
      return c;
    });
  }

  function readPhoto(file) { return compressChatImage(file); }

  const actionLabel = def?.label || task?.label || actionKey;
  const actionEmoji = def?.emoji || task?.emoji || '✨';

  // ── Preview / fork screen ─────────────────────────────────────────────────
  if (!mode) return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', flexDirection:'column',
      background:'rgba(0,0,0,0.55)', WebkitBackdropFilter:'blur(4px)', backdropFilter:'blur(4px)' }}>
      {/* Backdrop tap closes */}
      <div style={{ flex:1 }} onClick={onClose}/>
      {/* Sheet slides up */}
      <div style={{ background:'#faf6ee', borderRadius:'18px 18px 0 0',
        padding:'0 0 calc(20px + env(safe-area-inset-bottom)) 0',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.22)' }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', paddingTop:10, paddingBottom:4 }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'rgba(160,130,80,0.25)' }}/>
        </div>
        <div style={{ padding:'12px 20px 20px' }}>
          {/* Plant portrait — tappable to open plant in Garden tab */}
          {portraits?.[plant.id]?.svg ? (
            <button
              onClick={() => { onGoToPlant?.(plant.id); onClose(); }}
              style={{ display:'block', width:'100%', height:160, borderRadius:12, overflow:'hidden',
                border:`1.5px solid ${color}28`, background:`${color}08`, marginBottom:12,
                cursor:'pointer', padding:0, WebkitTapHighlightColor:'transparent', position:'relative' }}>
              <PlantPortrait plant={plant} aiSvg={portraits[plant.id].svg}/>
              <div style={{ position:'absolute', bottom:8, right:10,
                fontFamily:SERIF, fontSize:11, color:`${color}cc`, fontStyle:'italic',
                textShadow:'0 1px 3px rgba(0,0,0,0.18)' }}>
                {plant.name} →
              </div>
            </button>
          ) : (
            <div style={{ fontSize:28, marginBottom:4 }}>{actionEmoji}</div>
          )}
          <div style={{ fontSize:20, color:'#2a1808', fontWeight:600, fontFamily:SERIF, marginBottom:2 }}>{actionLabel}</div>
          <div style={{ fontSize:13, color:'#907050', fontFamily:SERIF, marginBottom:16 }}>{plant.name}</div>

          {/* Task preview — instructions already generated, no API call */}
          {(task?.instructions || task?.reason) && (
            <div style={{ background:'rgba(160,130,80,0.07)', borderRadius:10, padding:'12px 14px', marginBottom:20,
              border:'1px solid rgba(160,130,80,0.18)' }}>
              {task.reason && (
                <div style={{ fontFamily:SERIF, fontSize:13, color:'#6a4020', fontStyle:'italic', lineHeight:1.55, marginBottom: task.instructions ? 8 : 0 }}>
                  {task.reason}
                </div>
              )}
              {task.instructions && (
                <div style={{ fontFamily:SERIF, fontSize:13, color:'#4a2c10', lineHeight:1.6 }}>
                  {task.instructions}
                </div>
              )}
            </div>
          )}

          {/* Done / Explain */}
          <div style={{ display:'flex', gap:10 }}>
            <button
              onClick={() => { onLog(); onClose(); }}
              style={{ flex:1, background:color, border:'none', borderRadius:12, padding:'15px',
                color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:8, letterSpacing:.3,
                WebkitTapHighlightColor:'transparent' }}>
              ✓ DONE
            </button>
            <button
              onClick={() => setMode('explain')}
              style={{ flex:1, background:'none', border:`1.5px solid ${color}40`,
                borderRadius:12, padding:'15px', cursor:'pointer',
                fontFamily:MONO, fontSize:8, letterSpacing:.3, color,
                WebkitTapHighlightColor:'transparent' }}>
              EXPLAIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Explain mode: instructions inline + follow-up chat ────────────────────
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'#f5ede0',
      display:'flex', flexDirection:'column', fontFamily:SERIF }}>

      {/* Sticky header */}
      <div style={{ padding:'12px 16px', paddingTop:'calc(12px + env(safe-area-inset-top))',
        borderBottom:'1px solid rgba(160,130,80,0.22)',
        background:'rgba(245,237,224,0.98)', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={() => setMode(null)} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:16,
            minHeight:44, minWidth:44, display:'flex', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent' }}>←</button>
          <div>
            <span style={{ fontSize:14, color:'#4a2c10', fontWeight:600 }}>{actionEmoji} {actionLabel}</span>
            <span style={{ fontSize:12, color:'#a08060', marginLeft:6, fontStyle:'italic' }}>{plant.name}</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!logged ? (
            <button onClick={() => { onLog(); setLogged(true); }}
              style={{ background:color, border:'none', borderRadius:10, padding:'0 16px',
                color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:7, letterSpacing:.3,
                minHeight:44, display:'flex', alignItems:'center',
                WebkitTapHighlightColor:'transparent' }}>
              ✓ DONE
            </button>
          ) : (
            <span style={{ fontSize:13, color:'#5a9040', fontFamily:SERIF }}>✓ Logged</span>
          )}
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:26, lineHeight:1,
            minHeight:44, minWidth:44, display:'flex', alignItems:'center', justifyContent:'center',
            WebkitTapHighlightColor:'transparent' }}>&times;</button>
        </div>
      </div>

      {/* Static how-to — displayed immediately, no API call */}
      {(task?.reason || task?.instructions) && (
        <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(160,130,80,0.18)',
          background:'rgba(250,246,238,0.95)', flexShrink:0 }}>
          {task.reason && (
            <div style={{ fontFamily:SERIF, fontSize:13, color:'#6a4020', fontStyle:'italic', lineHeight:1.55, marginBottom: task.instructions ? 8 : 0 }}>
              {task.reason}
            </div>
          )}
          {task.instructions && (
            <div style={{ fontFamily:SERIF, fontSize:13.5, color:'#3a2010', lineHeight:1.65 }}>
              {task.instructions}
            </div>
          )}
          <div style={{ marginTop:8, fontFamily:MONO, fontSize:5.5, color:'rgba(160,130,80,0.55)', letterSpacing:.4 }}>
            QUESTIONS? ASK BELOW
          </div>
        </div>
      )}

      {/* Message thread */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px',
        display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column',
            alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.images?.length > 0 && (
              <img src={m.images[0]} alt="" style={{ width:130, height:98, borderRadius:8,
                marginBottom:6, objectFit:'cover', alignSelf:'flex-end' }}/>
            )}
            <div style={{
              maxWidth:'88%', padding:'11px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.role === 'user' ? color+'20' : '#fff',
              border: m.role === 'user' ? `1px solid ${color}38` : '1px solid rgba(160,130,80,0.20)',
              fontSize:15, color:'#2a1808', lineHeight:1.65,
              fontStyle: m.role === 'assistant' ? 'italic' : 'normal',
            }}>
              {(m.content || '').replace(/<(diagram|photo-request)>[\s\S]*/g, '').trim() || (chatLoading && i === messages.length - 1 ? '…' : '')}
            </div>
            {m.photoRequest && (
              <div style={{ marginTop:6, background:'rgba(212,168,48,0.08)',
                border:'1px solid rgba(212,168,48,0.32)', borderRadius:10, padding:'10px 12px',
                display:'flex', alignItems:'center', gap:10, maxWidth:'88%' }}>
                <span style={{ fontSize:16 }}>📷</span>
                <span style={{ flex:1, fontSize:14, color:'#6a4010', fontStyle:'italic', lineHeight:1.5 }}>{m.photoRequest}</span>
                <button onClick={() => chatFileRef.current?.click()}
                  style={{ background:'#d4a830', border:'none', borderRadius:8, padding:'8px 12px',
                    color:'#fff', cursor:'pointer', fontSize:13, fontFamily:SERIF, flexShrink:0,
                    WebkitTapHighlightColor:'transparent' }}>
                  📷 Send
                </button>
              </div>
            )}
            {m.diagram && (
              <div style={{ marginTop:6, borderRadius:10, overflow:'hidden',
                border:'1px solid rgba(160,130,80,0.22)', maxWidth:240, alignSelf:'flex-start' }}
                dangerouslySetInnerHTML={{ __html: m.diagram }}/>
            )}
          </div>
        ))}
        <div ref={chatEndRef}/>
      </div>

      {/* Input row — pinned to bottom, thumb-zone */}
      <div style={{ padding:'10px 12px', paddingBottom:'calc(10px + env(safe-area-inset-bottom))',
        borderTop:'1px solid rgba(160,130,80,0.18)', background:'rgba(245,237,224,0.98)', flexShrink:0 }}>
        {chatPhoto && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <img src={chatPhoto} alt="" style={{ width:52, height:52, borderRadius:6, objectFit:'cover' }}/>
            <button onClick={() => setChatPhoto(null)}
              style={{ background:'none', border:'none', color:'#b09070', cursor:'pointer', fontSize:22 }}>×</button>
          </div>
        )}
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          {/* Camera — large tap target */}
          <button onClick={() => chatFileRef.current?.click()}
            style={{ background:'#fff', border:`1px solid rgba(160,130,80,0.28)`,
              borderRadius:12, padding:'12px 14px', cursor:'pointer', fontSize:22, flexShrink:0, lineHeight:1,
              WebkitTapHighlightColor:'transparent' }}>📷</button>
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if ((input.trim() || chatPhoto) && !chatLoading) sendChat(input.trim(), chatPhoto ? [chatPhoto] : []);
              }
            }}
            placeholder="Ask anything…" rows={1}
            style={{ flex:1, border:`1px solid rgba(160,130,80,0.25)`, borderRadius:12,
              padding:'12px 14px', fontSize:16, fontFamily:SERIF, background:'#fff',
              resize:'none', color:'#2a1808', outline:'none', lineHeight:1.4,
              WebkitAppearance:'none' }}/>
          <button
            onClick={() => { if ((input.trim() || chatPhoto) && !chatLoading) sendChat(input.trim(), chatPhoto ? [chatPhoto] : []); }}
            disabled={chatLoading || (!input.trim() && !chatPhoto)}
            style={{ background:color, border:'none', borderRadius:12, padding:'12px 16px',
              color:'#fff', cursor:'pointer', fontSize:20, flexShrink:0,
              opacity:(chatLoading || (!input.trim() && !chatPhoto)) ? 0.35 : 1,
              WebkitTapHighlightColor:'transparent' }}>→</button>
        </div>
        <input ref={chatFileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={async e => { const f = e.target.files?.[0]; if (f) readPhoto(f).then(setChatPhoto).catch(e => console.warn('action chat photo read failed', e)); }}/>
      </div>
    </div>
  );
}

// ── MOBILE PLANT CARD ──────────────────────────────────────────────────────
// ── STAGE ARC ──────────────────────────────────────────────────────────────
function StageArc({ stages, currentStage, color }) {
  if (!stages || stages.length < 2) return null;
  const currentIdx = stages.indexOf(currentStage);
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(160,130,80,0.12)' }}>
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
                fontSize: 10,
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

function MobilePlantCard({ plant, careLog, onAction, onStartAction, onPhotoAdded, onPortraitUpdate, onGrowthUpdate, onAddPhoto, photos = [], portraits, briefing, seasonOpen, onDeleteAction }) {
  const fileRef = useRef(null);
  const color = plantColor(plant.type);
  const CC = useCC();
  const lastPhoto = photos[photos.length - 1];
  const portrait = portraits?.[plant.id] || {};
  const analyzing = portrait.analyzing;
  const photoSrc = lastPhoto?.dataUrl || lastPhoto?.url || null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const [confirmDeleteDate, setConfirmDeleteDate] = useState(null);
  const { stages, currentStage } = portrait;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (!files.length) return;
    // iOS-safe input reset
    try { fileRef.current.value = null; } catch { fileRef.current.value = ''; }

    // Compress files sequentially — parallel canvas ops can crash mobile Safari
    const dataUrls = [];
    for (const f of files) {
      const result = await compressImage(f);
      if (result) dataUrls.push(result);
    }
    if (!dataUrls.length) { onPortraitUpdate?.(plant.id, { analyzing: false }); return; }

    const date = new Date().toISOString();
    // Store each photo individually
    dataUrls.forEach(dataUrl => onAddPhoto?.(plant.id, dataUrl, date));
    // Log photo action once
    if (plant.actions?.includes('photo')) onAction('photo', plant);
    // Signal analysis start
    onPortraitUpdate?.(plant.id, { analyzing: true });

    // Send all images together in one analysis call
    try {
      const stored = JSON.parse(localStorage.getItem('gp_portraits_v1') || '{}');
      const plantPortrait = stored[plant.id] || {};
      const plantHistory = (plantPortrait.history || []).slice(-5);
      const existingStages = plantPortrait.stages || [];
      const careStore = JSON.parse(localStorage.getItem('gp_care_v4') || '{}');
      const plantEntries = (careStore[plant.id] || []).slice(-20).reverse();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      fetch('/api/analyze-plant', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagesBase64: dataUrls,
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
          stages: existingStages,
        }),
      })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
        .then(({ analysis, svg, stages: newStages }) => {
          clearTimeout(timeout);
          const analysisDate = new Date().toISOString();
          const growth = typeof analysis?.growth === 'number' && isFinite(analysis.growth)
            ? Math.max(0, Math.min(1, analysis.growth)) : null;
          onPortraitUpdate?.(plant.id, {
            svg: svg || null,
            visualNote: analysis?.visualNote || null,
            growth,
            bloomState: analysis?.bloomState || null,
            foliageState: analysis?.foliageState || null,
            // Stage data — newStages only present when bootstrapping
            ...(newStages ? { stages: newStages } : {}),
            currentStage: analysis?.stage || null,
            analyzing: false,
            date: analysisDate,
          });
          if (growth != null) onGrowthUpdate?.(plant.id, growth);
        })
        .catch(err => { clearTimeout(timeout); console.error('[portrait analysis failed]', err); onPortraitUpdate?.(plant.id, { analyzing: false }); });
    } catch {
      onPortraitUpdate?.(plant.id, { analyzing: false });
    }
  }

  function submitNote() {
    const text = noteText.trim();
    if (!text) { setNoteOpen(false); return; }
    const customDate = parsePastDate(noteDate) || null;
    onAction('note', plant, text, customDate);
    setNoteText(''); setNoteDate(''); setNoteOpen(false);
  }

  const waterStatus = actionStatus(plant, 'water', careLog, seasonOpen);
  // All oracle-recommended tasks that are currently actionable (no cap)
  const oracleTasks = (briefing?.tasks || [])
    .filter(t => t.key !== 'water')
    .filter(t => t.key === 'tend' || !ACTION_DEFS[t.key] || actionStatus(plant, t.key, careLog, seasonOpen).available);
  // Fall back to Visit when oracle hasn't loaded or recommends nothing
  const showVisit = !briefing || oracleTasks.length === 0;

  if (plant.health === 'memorial' || plant.type === 'empty-pot') return null;

  return (
    <div style={{
      background: C.cardBg, borderRadius: 12,
      border: `1px solid ${C.cardBorder}`,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Hero — SVG illustration preferred; fall back to photo, then generic portrait */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          height: 160,
          background: `${color}08`,
          cursor: 'pointer', position: 'relative', overflow: 'hidden',
          border: (!lastPhoto && !seasonOpen) ? '2px solid rgba(212,168,48,0.40)' : 'none',
          boxSizing: 'border-box',
        }}>
        {portrait?.svg ? (
          /* AI SVG illustration — primary hero */
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <PlantPortrait plant={plant} aiSvg={portrait.svg}/>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,2,1,0.18)' }}/>
            {/* Photo count badge so user knows photos exist */}
            {photos.length > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(18,12,6,0.70)',
                borderRadius: 20, padding: '3px 9px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 9 }}>📷</span>
                <span style={{ fontFamily: MONO, fontSize: 5, color: 'rgba(212,168,48,0.85)' }}>{photos.length}</span>
              </div>
            )}
          </div>
        ) : photoSrc && !photoFailed ? (
          /* No SVG yet — show raw photo as fallback */
          <img src={photoSrc} alt={plant.name}
            onError={() => setPhotoFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          /* No photo either — generic portrait */
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <PlantPortrait plant={plant} aiSvg={null}/>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,2,1,0.30)' }}/>
            {!seasonOpen && !lastPhoto && (
              <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(18,12,6,0.78)',
                border: '1px solid rgba(212,168,48,0.40)',
                borderRadius: 20, padding: '3px 10px',
              }}>
                <span style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(212,168,48,0.85)', letterSpacing: .3 }}>
                  unseen · tap to document
                </span>
              </div>
            )}
          </div>
        )}
        {/* Analyzing indicator — subtle, non-blocking */}
        {analyzing && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(18,12,6,0.82)',
            borderRadius: 20, padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 10 }}>🌿</span>
            <span style={{ fontFamily: MONO, fontSize: 5, color: C.uiGold, letterSpacing: .5 }}>analyzing…</span>
          </div>
        )}
        {/* Camera overlay button — hidden when photo badge is shown (SVG mode) */}
        {!portrait?.svg && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(18,12,6,0.75)',
            borderRadius: 20, padding: '5px 10px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 13 }}>📷</span>
            <span style={{ fontFamily: MONO, fontSize: 6, color: '#d4a830' }}>
              {photos.length > 0 ? `${photos.length} · ADD` : 'ADD 1-4'}
            </span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple
        style={{ display: 'none' }} onChange={handleFiles}/>

      {/* Visual note from AI analysis */}
      {portrait?.visualNote && !portrait?.analyzing && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(160,130,80,0.12)',
          fontFamily: SERIF, fontSize: 12, fontStyle: 'italic',
          color: 'rgba(120,90,50,0.80)', lineHeight: 1.5,
        }}>
          {portrait.visualNote}
        </div>
      )}

      {/* Info + actions */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ flex: 1, marginRight: 10 }}>
            <div style={{ fontSize: 17, fontFamily: SERIF, fontWeight: 600, color: '#2a1808' }}>
              {plant.name}
            </div>
            {plant.subtitle && (
              <div style={{ fontSize: 12, color: CC.muted, fontFamily: SERIF }}>{plant.subtitle}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {/* Stage is primary when available */}
            {currentStage ? (
              <div style={{
                background: `${color}18`,
                border: `1px solid ${color}40`,
                borderRadius: 20, padding: '3px 10px',
                fontSize: 11, color, fontFamily: SERIF, fontStyle: 'italic',
              }}>
                {currentStage}
              </div>
            ) : (
              <div style={{
                background: `${healthColor(plant.health)}18`,
                border: `1px solid ${healthColor(plant.health)}40`,
                borderRadius: 20, padding: '3px 10px',
                fontSize: 11, color: healthColor(plant.health), fontFamily: SERIF,
              }}>
                {healthLabel(plant.health)}
              </div>
            )}
            {/* Health as secondary when stage is shown */}
            {currentStage && (
              <div style={{ fontSize: 10, color: healthColor(plant.health), fontFamily: SERIF, opacity: 0.7 }}>
                {healthLabel(plant.health)}
              </div>
            )}
          </div>
        </div>

        {/* Quick action row — wraps when many actions are recommended */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Water — always shown */}
          <button
            onClick={() => waterStatus.available && onAction('water', plant)}
            disabled={!waterStatus.available}
            style={{
              flex: '1 1 56px', padding: '10px 8px', minHeight: 44,
              background: waterStatus.available ? '#e8f4ff' : 'rgba(0,0,0,.03)',
              border: `1px solid ${waterStatus.available ? '#a8d0f0' : 'rgba(160,130,80,.15)'}`,
              borderRadius: 8, cursor: waterStatus.available ? 'pointer' : 'default',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
            <span style={{ fontSize: 18 }}>💧</span>
            <span style={{ fontFamily: MONO, fontSize: 6, color: waterStatus.available ? '#4080b0' : '#c0a080' }}>
              {waterStatus.available ? 'WATER' : waterStatus.reason}
            </span>
          </button>

          {/* Oracle-recommended tasks */}
          {oracleTasks.map(t => {
            const def = ACTION_DEFS[t.key];
            const emoji = def?.emoji || '✨';
            const label = (t.label || def?.label || t.key || '').toUpperCase().slice(0, 9);
            return (
              <button key={`${t.key}:${t.label}`}
                onClick={() => {
                  if (t.key === 'tend' || t.optional) {
                    onStartAction ? onStartAction(plant, t.key, t) : onAction(t.key, plant, t.label);
                  } else {
                    onStartAction ? onStartAction(plant, t.key) : onAction(t.key, plant);
                  }
                }}
                style={{
                  flex: '1 1 56px', padding: '10px 8px', minHeight: 44,
                  background: `${color}10`,
                  border: `1px solid ${color}40`,
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                }}>
                <span style={{ fontSize: 18 }}>{emoji}</span>
                <span style={{ fontFamily: MONO, fontSize: 6, color }}>
                  {label}
                </span>
              </button>
            );
          })}

          {/* Visit — shown while oracle loads or when nothing is recommended */}
          {showVisit && (
            <button
              onClick={() => onAction('visit', plant)}
              style={{
                flex: '1 1 56px', padding: '10px 8px', minHeight: 44,
                background: briefing ? 'rgba(0,0,0,.03)' : 'rgba(0,0,0,.02)',
                border: '1px solid rgba(160,130,80,.15)',
                borderRadius: 8, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                opacity: briefing ? 1 : 0.5,
              }}>
              <span style={{ fontSize: 18 }}>{briefing ? '👀' : '·'}</span>
              <span style={{ fontFamily: MONO, fontSize: 6, color: '#a08060' }}>
                {briefing ? 'VISIT' : '···'}
              </span>
            </button>
          )}

          {/* Note button */}
          <button
            onClick={() => setNoteOpen(o => !o)}
            style={{
              flex: '1 1 56px', padding: '10px 8px', minHeight: 44,
              background: noteOpen ? 'rgba(212,168,48,0.10)' : 'rgba(0,0,0,.02)',
              border: `1px solid ${noteOpen ? 'rgba(212,168,48,0.35)' : 'rgba(160,130,80,.15)'}`,
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
            <span style={{ fontSize: 18 }}>📝</span>
            <span style={{ fontFamily: MONO, fontSize: 6, color: '#a08060' }}>NOTE</span>
          </button>
        </div>

        {/* Note input — inline, expands when open */}
        {noteOpen && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNote(); if (e.key === 'Escape') setNoteOpen(false); }}
                placeholder="What did you notice?"
                style={{
                  flex: 1, padding: '9px 12px',
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(160,130,80,0.3)',
                  borderRadius: 8, fontFamily: SERIF, fontSize: 16,
                  color: '#2a1808', outline: 'none',
                }}
              />
              <button onClick={submitNote}
                style={{
                  padding: '9px 14px',
                  background: 'rgba(212,168,48,0.15)',
                  border: '1px solid rgba(212,168,48,0.35)',
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: MONO, fontSize: 6, color: C.uiGold,
                }}>
                LOG
              </button>
            </div>
            {/* When? date input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 6, color: CC.dim, letterSpacing: .5, flexShrink: 0 }}>WHEN?</span>
              <input
                type="text"
                value={noteDate}
                onChange={e => setNoteDate(e.target.value)}
                placeholder="today · yesterday · last Thursday · April 5"
                style={{
                  flex: 1, padding: '6px 10px',
                  background: 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(160,130,80,0.2)',
                  borderRadius: 6, fontFamily: SERIF, fontSize: 16,
                  color: '#5a3c18', outline: 'none',
                  fontStyle: 'italic',
                }}
              />
            </div>
            {/* Parsed date confirmation */}
            {noteDate.trim() && (() => {
              const parsed = parsePastDate(noteDate);
              return parsed ? (
                <div style={{ fontFamily: SERIF, fontSize: 11, color: '#6a9a40', fontStyle: 'italic', paddingLeft: 2 }}>
                  → {new Date(parsed).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
              ) : (
                <div style={{ fontFamily: SERIF, fontSize: 11, color: '#b07040', fontStyle: 'italic', paddingLeft: 2 }}>
                  couldn't parse date — will log as today
                </div>
              );
            })()}
          </div>
        )}

        {/* Stage arc */}
        <StageArc stages={stages} currentStage={currentStage} color={color}/>

        {/* Care history */}
        {(() => {
          const entries = (careLog[plant.id] || [])
            .filter(e => e.action !== 'note')
            .slice(-8).reverse();
          if (!entries.length) return null;
          return (
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(160,130,80,0.12)', paddingTop: 10 }}>
              <div style={{ fontFamily: MONO, fontSize: 6, color: CC.dim, letterSpacing: .5, marginBottom: 6 }}>
                CARE HISTORY
              </div>
              {entries.map((e, i) => {
                const d = new Date(e.date);
                const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
                const isPendingDelete = confirmDeleteDate === e.date;
                const isRain = e.action === 'rain';
                return (
                  <div key={i} style={{
                    padding: '4px 0',
                    borderBottom: i < entries.length - 1 ? '1px solid rgba(160,130,80,0.07)' : 'none',
                    ...(isRain ? { background: 'rgba(80,140,200,0.08)', borderRadius: 6, padding: '4px 7px', margin: '0 -7px' } : {}),
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{e.emoji || '·'}</span>
                      <span style={{ fontFamily: SERIF, fontSize: 12, color: isRain ? '#2a5080' : '#5a3c18', flex: 1 }}>{e.label}</span>
                      <span style={{ fontFamily: SERIF, fontSize: 11, color: CC.dim, flexShrink: 0 }}>{when}</span>
                      {onDeleteAction && (
                        <button onClick={() => setConfirmDeleteDate(isPendingDelete ? null : e.date)}
                          style={{ background: 'none', border: 'none', color: '#b09070', cursor: 'pointer',
                            fontSize: 15, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                            minHeight: 44, display: 'flex', alignItems: 'center',
                            WebkitTapHighlightColor: 'transparent' }}>
                          ×
                        </button>
                      )}
                    </div>
                    {isPendingDelete && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                        background: 'rgba(200,80,30,0.06)', borderRadius: 6, padding: '6px 10px' }}>
                        <span style={{ fontFamily: SERIF, fontSize: 12, color: '#a05020', flex: 1, fontStyle: 'italic' }}>
                          Delete this entry?
                        </span>
                        <button
                          onClick={() => { onDeleteAction(plant.id, e.date); setConfirmDeleteDate(null); }}
                          style={{ background: 'rgba(200,80,30,0.15)', border: '1px solid rgba(200,80,30,0.35)',
                            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                            fontSize: 12, color: '#a05020', fontFamily: SERIF,
                            WebkitTapHighlightColor: 'transparent' }}>
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteDate(null)}
                          style={{ background: 'none', border: '1px solid rgba(160,130,80,0.30)',
                            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                            fontSize: 12, color: '#b09070', fontFamily: SERIF,
                            WebkitTapHighlightColor: 'transparent' }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Last photo date if exists */}
        {lastPhoto && (
          <div style={{ marginTop: 8, fontSize: 11, color: CC.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
            Last photo {fmtDate(lastPhoto.date)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── GARDEN TAB ACCORDION ───────────────────────────────────────────────────

function PlantAccordionRow({
  plant, isExpanded, onToggle, needsAttention,
  portrait, photos, lastWateredDate,
  careLog, onAction, onStartAction, onPortraitUpdate, onGrowthUpdate, onAddPhoto,
  briefing, seasonOpen, portraits, onDeleteAction,
}) {
  const color = plantColor(plant.type);
  const CC = useCC();
  const expandedRef = useRef(null);

  useEffect(() => {
    if (isExpanded) expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isExpanded]);

  const waterLabel = lastWateredDate == null
    ? 'not yet this season'
    : (() => {
        const days = Math.floor((Date.now() - new Date(lastWateredDate).getTime()) / 86400000);
        if (days === 0) return 'today';
        if (days === 1) return '1 day ago';
        return `${days}d ago`;
      })();

  const { currentStage } = portrait || {};

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Compact row */}
      <div
        onClick={() => onToggle(plant.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px',
          background: isExpanded ? 'rgba(212,168,48,0.07)' : '#faf6ee',
          border: `1px solid ${isExpanded ? 'rgba(160,130,80,0.35)' : 'rgba(160,130,80,0.18)'}`,
          borderRadius: isExpanded ? '10px 10px 0 0' : 10,
          cursor: 'pointer', transition: 'border-color .15s',
        }}
      >
        {/* Attention dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: needsAttention ? '#d4a830' : 'rgba(160,130,80,0.25)',
        }}/>

        {/* Portrait thumbnail */}
        <div style={{
          width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
          border: '1px solid rgba(160,130,80,0.18)', background: '#f0e8d8',
        }}>
          <PlantPortrait plant={plant} aiSvg={portrait?.svg}/>
        </div>

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: '#2a1808',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {plant.name}
          </div>
          {plant.subtitle && (
            <div style={{ fontFamily: SERIF, fontSize: 11, color: '#b09070', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {plant.subtitle}
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 11, color: '#907050', marginTop: 1 }}>
            {currentStage
              ? <span style={{ color, fontStyle: 'italic' }}>{currentStage}</span>
              : <span style={{ color: healthColor(plant.health) }}>{healthLabel(plant.health)}</span>
            }
            <span style={{ color: CC.faint }}> · 💧 {waterLabel}</span>
          </div>
        </div>

        {/* 📷 quick access — tapping expands to show full card with photo strip */}
        <div
          onClick={e => { e.stopPropagation(); onToggle(plant.id); }}
          style={{
            padding: '6px 9px', borderRadius: 8, minHeight: 44, minWidth: 44,
            border: '1px solid rgba(160,130,80,0.22)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            background: 'rgba(255,255,255,0.5)', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: 14 }}>📷</span>
          <span style={{ fontFamily: MONO, fontSize: 5, color: '#a08060' }}>OPEN</span>
        </div>

        {/* Chevron */}
        <span style={{
          fontSize: 10, color: '#c0a080', flexShrink: 0,
          transform: isExpanded ? 'rotate(180deg)' : 'none',
          transition: 'transform .2s',
        }}>▼</span>
      </div>

      {/* Expanded: full plant card */}
      {isExpanded && (
        <div ref={expandedRef} style={{
          border: '1px solid rgba(160,130,80,0.18)', borderTop: 'none',
          borderRadius: '0 0 10px 10px', overflow: 'hidden',
        }}>
          <MobilePlantCard
            plant={plant} careLog={careLog} onAction={onAction}
            onStartAction={onStartAction} onPortraitUpdate={onPortraitUpdate}
            onGrowthUpdate={onGrowthUpdate} onAddPhoto={onAddPhoto}
            photos={photos} portraits={portraits} briefing={briefing}
            seasonOpen={seasonOpen} onDeleteAction={onDeleteAction}
          />
        </div>
      )}
    </div>
  );
}

const SORT_OPTIONS = [
  { key: 'care',      label: 'Needs Care' },
  { key: 'phenology', label: 'Most Active' },
  { key: 'neglected', label: 'Most Neglected' },
  { key: 'alpha',     label: 'A–Z' },
];

function plantPhenologyScore(plant, portraits) {
  const p = portraits?.[plant.id] || {};
  let score = 0;
  if (p.stages?.length) score += p.stages.length;       // more tracked stages = richer lifecycle
  if (p.currentStage) score += 2;                       // actively in a known stage
  if (p.visualNote) score += 1;                         // portrait has AI observation
  if (p.svg) score += 1;                                // AI portrait generated
  // Phenologically rich plant types get a boost
  const richTypes = new Set(['wisteria','climbing-rose','rose','tomato','fig','magnolia','pepper']);
  if (richTypes.has(plant.type)) score += 2;
  return score;
}

function plantLastCareMs(plantId, careLog) {
  const skip = new Set(['visit', 'photo', 'note']);
  const entries = (careLog[plantId] || []).filter(e => !skip.has(e.action));
  if (!entries.length) return 0;
  return Math.max(...entries.map(e => new Date(e.date).getTime()));
}

function GardenAccordion({
  plants, frontPlants, careLog, onAction, onStartAction,
  onPortraitUpdate, onGrowthUpdate, onAddPhoto, allPhotos,
  portraits, briefings, seasonOpen, frozenAgendaItems, onDeleteAction,
  openPlantId = null, onOpenPlantHandled,
}) {
  const [sortBy, setSortBy] = useState('care');
  const attentionIds = useMemo(
    () => new Set((frozenAgendaItems || []).map(i => i.plantId)),
    [frozenAgendaItems]
  );
  // Priority of the most urgent agenda item per plant
  const plantUrgency = useMemo(() => {
    const TIER = { urgent: 0, recommended: 1, routine: 2, optional: 3 };
    const map = {};
    for (const item of frozenAgendaItems || []) {
      const cur = map[item.plantId] ?? 99;
      const tier = TIER[item.priority] ?? 99;
      if (tier < cur) map[item.plantId] = tier;
    }
    return map;
  }, [frozenAgendaItems]);

  // Auto-open groups that have today's attention items
  const TREE_TYPES = new Set(['evergreen', 'maple', 'serviceberry']);
  function toGroupType(type) { return TREE_TYPES.has(type) ? 'tree' : type; }

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const open = new Set();
    const all = [...plants, ...frontPlants];
    for (const item of frozenAgendaItems || []) {
      const p = all.find(x => x.id === item.plantId);
      if (p) open.add(toGroupType(p.type));
    }
    return open;
  });
  const [expandedId, setExpandedId] = useState(null);

  // Auto-expand plant when navigating from Today tab portrait tap
  React.useEffect(() => {
    if (!openPlantId) return;
    const all = [...plants, ...frontPlants];
    const plant = all.find(p => p.id === openPlantId);
    if (plant) {
      setExpandedGroups(prev => { const next = new Set(prev); next.add(toGroupType(plant.type)); return next; });
      setExpandedId(openPlantId);
    }
    onOpenPlantHandled?.();
  }, [openPlantId]);

  function toggleGroup(type) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }
  function togglePlant(id) { setExpandedId(prev => prev === id ? null : id); }

  function lastWatered(plantId) {
    const entries = (careLog[plantId] || []).filter(e => e.action === 'water' || e.action === 'rain');
    return entries.length ? entries[entries.length - 1].date : null;
  }

  const GROUP_NAMES = {
    tree: count => count === 1 ? 'The Tree' : 'The Trees',
    hydrangea: count => count === 1 ? 'The Hydrangea' : 'The Hydrangeas',
    wisteria: count => count === 1 ? 'The Wisteria' : 'The Wisterias',
    lavender: count => count === 1 ? 'The Lavender' : 'The Lavenders',
    'climbing-rose': count => count === 1 ? 'The Climbing Rose' : 'The Climbing Roses',
    rose: count => count === 1 ? 'The Rose' : 'The Roses',
    magnolia: () => 'The Magnolia',
    tomato: count => count === 1 ? 'The Tomato' : 'The Tomatoes',
    pepper: count => count === 1 ? 'The Pepper' : 'The Peppers',
    herb: count => count === 1 ? 'The Herb' : 'The Herbs',
  };
  function groupDisplayName(type, count) {
    if (GROUP_NAMES[type]) return GROUP_NAMES[type](count);
    const base = type.replace(/-/g, ' ');
    if (count === 1) return 'The ' + base.charAt(0).toUpperCase() + base.slice(1);
    const plural = base.endsWith('y')
      ? base.slice(0, -1) + 'ies'
      : base.endsWith('s') ? base : base + 's';
    return 'The ' + plural.charAt(0).toUpperCase() + plural.slice(1);
  }

  function groupSubtitle(groupPlants) {
    const activeItems = (frozenAgendaItems || []).filter(i => groupPlants.some(p => p.id === i.plantId));
    const actionEmojis = [...new Set(activeItems.map(i => ACTION_DEFS[i.actionKey]?.emoji).filter(Boolean))].join('');

    if (sortBy === 'neglected') {
      // Show days since last care for the most neglected plant in group
      const nowMs = Date.now();
      const maxGap = Math.max(...groupPlants.map(p => {
        const last = plantLastCareMs(p.id, careLog);
        return last ? (nowMs - last) / 86400000 : 999;
      }));
      const gapStr = maxGap >= 999 ? 'never tended' : maxGap < 1 ? 'tended today' : `${Math.floor(maxGap)}d since care`;
      return actionEmojis ? `${gapStr}  ·  ${actionEmojis} today` : gapStr;
    }

    if (sortBy === 'phenology') {
      const stages = [...new Set(groupPlants.map(p => portraits?.[p.id]?.currentStage).filter(Boolean))];
      const parts = [];
      if (stages.length === 1) parts.push(stages[0]);
      else if (stages.length === 2) parts.push(stages.join(' · '));
      else if (stages.length > 2) parts.push(`${stages.length} stages`);
      if (!parts.length) parts.push(healthLabel(groupPlants[0].health));
      if (actionEmojis) parts.push(`${actionEmojis} today`);
      return parts.join('  ·  ');
    }

    // Default (care + alpha): stage or visual note + action emojis
    const stages = [...new Set(groupPlants.map(p => portraits?.[p.id]?.currentStage).filter(Boolean))];
    const visualNote = groupPlants.length === 1 && !stages.length
      ? portraits?.[groupPlants[0].id]?.visualNote
      : null;
    const parts = [];
    if (stages.length === 1) parts.push(stages[0]);
    else if (stages.length === 2) parts.push(stages.join(' · '));
    else if (stages.length > 2) parts.push(`${stages.length} stages`);
    if (!parts.length && visualNote) parts.push(visualNote);
    if (!parts.length) parts.push(healthLabel(groupPlants[0].health));
    if (actionEmojis) parts.push(`${actionEmojis} today`);
    return parts.join('  ·  ');
  }

  function plantSortKey(p) {
    if (sortBy === 'care') {
      const urgency = plantUrgency[p.id] ?? 99;
      return [urgency, p.name];
    }
    if (sortBy === 'phenology') {
      return [-plantPhenologyScore(p, portraits), p.name];
    }
    if (sortBy === 'neglected') {
      return [-(Date.now() - plantLastCareMs(p.id, careLog)), p.name]; // most neglected = largest gap
    }
    return [p.name]; // alpha
  }

  function renderSection(list, title, titleColor) {
    if (!list.length) return null;

    // Group by type, Trees merge into a single 'tree' group
    const groupMap = new Map();
    for (const p of list) {
      const key = toGroupType(p.type);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(p);
    }

    // Sort groups based on the best plant score in the group
    const sortedGroups = [...groupMap.entries()].sort(([tA, pA], [tB, pB]) => {
      if (sortBy === 'alpha') return tA.localeCompare(tB);
      // Use the best (lowest/highest) score among plants in each group
      const bestA = pA.map(p => plantSortKey(p)[0]).reduce((a, b) => a < b ? a : b, Infinity);
      const bestB = pB.map(p => plantSortKey(p)[0]).reduce((a, b) => a < b ? a : b, Infinity);
      return bestA !== bestB ? bestA - bestB : tA.localeCompare(tB);
    });

    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 7, color: titleColor, marginBottom: 10, letterSpacing: .5 }}>
          {title}
        </div>
        {sortedGroups.map(([type, groupPlants]) => {
          const isOpen = expandedGroups.has(type);
          const anyAttention = groupPlants.some(p => attentionIds.has(p.id));
          const subtitle = groupSubtitle(groupPlants);
          const sortedGroupPlants = [...groupPlants].sort((a, b) => {
            const ka = plantSortKey(a), kb = plantSortKey(b);
            for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
              if (ka[i] === undefined) return -1;
              if (kb[i] === undefined) return 1;
              if (ka[i] < kb[i]) return -1;
              if (ka[i] > kb[i]) return 1;
            }
            return 0;
          });

          return (
            <div key={type} style={{ marginBottom: 8 }}>
              {/* Group header */}
              <div
                onClick={() => toggleGroup(type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: isOpen ? 'rgba(212,168,48,0.06)' : '#f5f0e8',
                  border: `1px solid rgba(160,130,80,${isOpen ? '0.30' : '0.18'})`,
                  borderRadius: isOpen ? '10px 10px 0 0' : 10,
                  cursor: 'pointer',
                }}
              >
                {/* Stacked mini portraits */}
                <div style={{ display: 'flex', flexShrink: 0, marginRight: 2 }}>
                  {sortedGroupPlants.slice(0, 3).map((p, i) => (
                    <div key={p.id} style={{
                      width: 30, height: 30, borderRadius: 7, overflow: 'hidden',
                      border: '1.5px solid rgba(160,130,80,0.22)',
                      marginLeft: i > 0 ? -10 : 0,
                      background: '#f0e8d8', flexShrink: 0,
                      position: 'relative', zIndex: sortedGroupPlants.length - i,
                    }}>
                      <PlantPortrait plant={p} aiSvg={portraits?.[p.id]?.svg}/>
                    </div>
                  ))}
                </div>

                {/* Name + subtitle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: '#2a1808' }}>
                      {groupDisplayName(type, groupPlants.length)}
                    </span>
                    {anyAttention && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d4a830', flexShrink: 0 }}/>
                    )}
                  </div>
                  {subtitle && (
                    <div style={{ fontFamily: SERIF, fontSize: 11, color: '#907050', marginTop: 2,
                      fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {subtitle}
                    </div>
                  )}
                </div>

                {/* Chevron */}
                <span style={{
                  fontSize: 10, color: '#c0a080', flexShrink: 0,
                  transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
                }}>▼</span>
              </div>

              {/* Group contents */}
              {isOpen && (
                <div style={{
                  border: '1px solid rgba(160,130,80,0.18)', borderTop: 'none',
                  borderRadius: '0 0 10px 10px', overflow: 'hidden',
                  background: 'rgba(250,246,238,0.6)', padding: '8px 8px 4px',
                }}>
                  {sortedGroupPlants.map(p => (
                    <PlantAccordionRow
                      key={p.id} plant={p}
                      isExpanded={expandedId === p.id}
                      onToggle={togglePlant}
                      needsAttention={attentionIds.has(p.id)}
                      portrait={portraits?.[p.id] || {}}
                      photos={allPhotos[p.id] || []}
                      lastWateredDate={lastWatered(p.id)}
                      careLog={careLog} onAction={onAction}
                      onStartAction={onStartAction}
                      onPortraitUpdate={onPortraitUpdate}
                      onGrowthUpdate={onGrowthUpdate}
                      onAddPhoto={onAddPhoto}
                      briefing={briefings[p.id]}
                      seasonOpen={seasonOpen}
                      portraits={portraits}
                      onDeleteAction={onDeleteAction}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 32px' }}>
      {/* Sort bar */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {SORT_OPTIONS.map(opt => {
          const active = sortBy === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              style={{
                flexShrink: 0,
                padding: '5px 11px', minHeight: 44,
                borderRadius: 20,
                border: `1px solid ${active ? 'rgba(212,168,48,0.55)' : 'rgba(160,130,80,0.22)'}`,
                background: active ? 'rgba(212,168,48,0.12)' : 'transparent',
                fontFamily: MONO, fontSize: 6, letterSpacing: .3,
                color: active ? C.uiGold : '#907050',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {renderSection(plants, 'TERRACE', C.uiGold)}
      {frontPlants.length > 0 && renderSection(frontPlants, '🌹 EMMA\'S ROSE GARDEN', '#e84070')}
    </div>
  );
}

function computeStreak(plantId, careLog) {
  const entries = careLog[plantId] || [];
  const days = new Set(
    entries
      .filter(e => !['note', 'visit', 'photo'].includes(e.action))
      .map(e => e.date?.slice(0, 10))
      .filter(Boolean)
  );
  if (!days.size) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(d.toISOString().slice(0, 10))) { streak++; } else { break; }
  }
  return streak;
}

function AgendaRow({ item, completed, justDone, justDoneStreak, onTap, onDone, portrait }) {
  const [howToOpen, setHowToOpen] = React.useState(false);
  const def = ACTION_DEFS[item.actionKey];
  const rowEmoji = item.task?.emoji || def?.emoji || '✨';
  // Task-specific label takes priority over the generic ACTION_DEFS label
  const rowLabel = item.task?.label || def?.label || item.actionKey;
  const isOptional = item.priority === 'optional';
  const tierColors = {
    urgent:      { border: 'rgba(200,80,30,0.35)', bg: 'rgba(200,80,30,0.06)', accent: '#b84018', dot: '#c85020' },
    recommended: { border: 'rgba(72,120,32,0.28)', bg: 'rgba(72,120,32,0.05)', accent: '#3a6818', dot: '#487820' },
    routine:     { border: 'rgba(160,130,80,0.22)', bg: 'rgba(250,246,238,0.9)', accent: '#7a5c30', dot: '#907050' },
    optional:    { border: 'rgba(80,120,80,0.22)', bg: 'rgba(80,120,80,0.04)', accent: '#507050', dot: '#608060' },
  }[item.priority] || { border: 'rgba(160,130,80,0.22)', bg: 'rgba(250,246,238,0.9)', accent: '#7a5c30', dot: '#907050' };

  const isUrgentOrRec = item.priority === 'urgent' || item.priority === 'recommended';
  const hasHowTo = !!item.task?.instructions;

  return (
    <div
      className={justDone ? 'gp-flash-row' : undefined}
      style={{
        borderRadius: 10, marginBottom: 8,
        border: `1.5px solid ${justDone ? 'rgba(72,120,32,0.45)' : tierColors.border}`,
        background: completed && !justDone ? 'rgba(160,130,80,0.04)' : tierColors.bg,
        opacity: completed && !justDone ? 0.40 : 1,
        transition: 'opacity .2s, border-color .3s',
        overflow: 'hidden',
      }}
    >
      {/* Main row — tappable to open action sheet */}
      <div
        onClick={() => !completed && onTap(item)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          cursor: completed ? 'default' : 'pointer',
        }}
      >
        {/* Priority dot — pulses for urgent/recommended */}
        <div
          className={isUrgentOrRec && !completed ? 'gp-pulse-dot' : undefined}
          style={{
            width: isUrgentOrRec ? 8 : 6, height: isUrgentOrRec ? 8 : 6,
            borderRadius: '50%',
            background: completed ? '#c0b090' : tierColors.dot,
            flexShrink: 0,
          }}
        />

        {/* Portrait — glow border when just done */}
        {portrait?.svg && (
          <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 5, overflow: 'hidden',
            border: justDone ? '1.5px solid rgba(72,120,32,0.55)' : '1px solid rgba(160,130,80,0.15)',
            background: '#f8f0e0', transition: 'border-color .4s',
          }}>
            <PlantPortrait plant={item.plant} aiSvg={portrait.svg}/>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 6, color: completed ? '#b0a080' : tierColors.accent,
              letterSpacing: .4, textDecoration: completed && !justDone ? 'line-through' : 'none' }}>
              {item.plantName.toUpperCase()}
            </span>
            <span style={{ fontSize: 12 }}>{rowEmoji}</span>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: completed ? '#b0a080' : '#2a1808',
              textDecoration: completed && !justDone ? 'line-through' : 'none', fontWeight: isUrgentOrRec ? 500 : 400 }}>
              {rowLabel}
            </span>
          </div>
          {/* Reason — one line, always visible */}
          {!completed && !justDone && item.reason && (
            <div style={{ fontSize: 11.5, color: '#7a5030', fontStyle: 'italic', lineHeight: 1.4, marginTop: 2 }}>
              {item.reason}
            </div>
          )}
          {/* Just-done streak */}
          {justDone && justDoneStreak > 1 && (
            <div style={{ fontFamily: SERIF, fontSize: 11, color: '#487820', fontStyle: 'italic', marginTop: 2 }}>
              ✦ {justDoneStreak}-day streak
            </div>
          )}
        </div>

        {/* Done button */}
        {!completed && (
          <button
            onClick={e => { e.stopPropagation(); onDone(item); }}
            style={{
              background: 'none', border: '1px solid rgba(160,130,80,0.32)',
              borderRadius: 7, padding: '0 12px', color: '#907050',
              fontSize: 13, fontFamily: SERIF, cursor: 'pointer', flexShrink: 0,
              minHeight: 44, display: 'flex', alignItems: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Done
          </button>
        )}
      </div>

      {/* How-to expand — only when instructions exist and task isn't complete */}
      {!completed && hasHowTo && (
        <div style={{ borderTop: `1px solid ${tierColors.border}`, padding: '0 12px' }}>
          <button
            onClick={e => { e.stopPropagation(); setHowToOpen(o => !o); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
              fontFamily: SERIF, fontSize: 11, color: '#907050', fontStyle: 'italic',
              display: 'flex', alignItems: 'center', gap: 4,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span>{howToOpen ? '▴' : '▾'}</span>
            <span>How to</span>
          </button>
          {howToOpen && (
            <div style={{ fontSize: 12, color: '#5a3c18', lineHeight: 1.6, paddingBottom: 10, fontStyle: 'italic' }}>
              {item.task.instructions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bulk task grouping helpers ─────────────────────────────────────────────

function plantTypePlural(type) {
  return {
    'climbing-rose': 'climbing roses', wisteria: 'wisteria', lavender: 'lavender',
    hydrangea: 'hydrangeas', serviceberry: 'serviceberry', maple: 'maples',
    evergreen: 'evergreens', 'evergreen-xmas': 'evergreens', rose: 'roses',
  }[type] || type;
}

// Returns array of { type:'item', item } | { type:'group', actionKey, items, label, emoji }
// Groups 2+ items sharing the same actionKey+plantType
function groupAgendaItems(items) {
  const byGroup = {};
  for (const item of items) {
    const gk = `${item.actionKey}:${item.plantType}`;
    if (!byGroup[gk]) byGroup[gk] = [];
    byGroup[gk].push(item);
  }
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const gk = `${item.actionKey}:${item.plantType}`;
    if (seen.has(gk)) continue;
    seen.add(gk);
    const group = byGroup[gk];
    if (group.length >= 2) {
      const def = ACTION_DEFS[item.actionKey];
      result.push({
        type: 'group', gk, items: group,
        label: item.task?.label || def?.label || item.actionKey,
        emoji: item.task?.emoji || def?.emoji || '✨',
      });
    } else {
      result.push({ type: 'item', item: group[0] });
    }
  }
  return result;
}

function AgendaGroupCard({ group, onDoneAll, onDoneOne, justDoneKeys = new Set() }) {
  const [expanded, setExpanded] = React.useState(false);
  const allDone = group.items.every(i => justDoneKeys.has(i.key));
  const doneSoFar = group.items.filter(i => justDoneKeys.has(i.key)).length;
  const accentColor = plantColor(group.items[0].plantType);
  return (
    <div style={{
      background: allDone ? 'rgba(72,120,32,0.06)' : C.cardBg,
      border: `1px solid ${allDone ? 'rgba(72,120,32,0.22)' : C.cardBorder}`,
      borderRadius: 10, marginBottom: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{group.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: '#2a1808', lineHeight: 1.2 }}>
            {group.label}
          </div>
          <div style={{ fontSize: 11, color: '#907050', marginTop: 2 }}>
            {group.items.length} {plantTypePlural(group.items[0].plantType)}
            {doneSoFar > 0 && !allDone && <span style={{ color: '#5a9030', marginLeft: 6 }}>· {doneSoFar}/{group.items.length} done</span>}
            {allDone && <span style={{ color: '#5a9030', marginLeft: 6 }}>· all done ✓</span>}
          </div>
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', padding: '3px 0 0', cursor: 'pointer',
              fontFamily: SERIF, fontSize: 11, color: 'rgba(160,130,80,0.65)', textDecoration: 'underline' }}>
            {expanded ? 'hide plants' : group.items.map(i => i.plant.name).join(', ')}
          </button>
        </div>
        {!allDone && (
          <button onClick={onDoneAll}
            style={{
              flexShrink: 0, fontFamily: SERIF, fontSize: 13, fontWeight: 600,
              background: '#2a1808', color: '#f0e4cc',
              border: 'none', borderRadius: 7, padding: '7px 13px', cursor: 'pointer',
            }}>
            Done all
          </button>
        )}
        {allDone && <span style={{ fontSize: 18, flexShrink: 0 }}>✓</span>}
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: '6px 13px 8px' }}>
          {group.items.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }}/>
                <span style={{ fontFamily: SERIF, fontSize: 13, color: justDoneKeys.has(item.key) ? '#5a9030' : '#3a2010' }}>
                  {item.plant.name}
                </span>
              </div>
              {!justDoneKeys.has(item.key)
                ? <button onClick={() => onDoneOne(item)}
                    style={{ fontFamily: SERIF, fontSize: 12, background: 'none', border: `1px solid ${C.cardBorder}`,
                      borderRadius: 5, padding: '2px 10px', cursor: 'pointer', color: '#5a3818' }}>
                    Done
                  </button>
                : <span style={{ fontSize: 11, color: '#5a9030' }}>✓</span>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodayAgenda({ rawItems = [], isWeekend = false, agendaData = null, seasonOpen,
  totalActivePlants = 0, morningBrief, fullBrief, onStartAction, portraits, completedThisSession = new Set(),
  doneTodayItems = [], onMarkDone, onOpenAsk, careLog = {}, onRefreshAgenda }) {
  const [briefExpanded, setBriefExpanded] = React.useState(false);
  const [justDoneKey, setJustDoneKey] = React.useState(null);
  const [justDoneStreak, setJustDoneStreak] = React.useState(0);
  const [groupJustDoneKeys, setGroupJustDoneKeys] = React.useState(new Set());

  // Inject CSS animations once
  React.useEffect(() => {
    if (document.getElementById('gp-agenda-css')) return;
    const el = document.createElement('style');
    el.id = 'gp-agenda-css';
    el.textContent = AGENDA_CSS;
    document.head.appendChild(el);
  }, []);

  function handleDone(item) {
    const streak = computeStreak(item.plantId, careLog);
    setJustDoneKey(item.key);
    setGroupJustDoneKeys(prev => new Set([...prev, item.key]));
    setJustDoneStreak(streak + 1);
    onMarkDone(item);
    setTimeout(() => setJustDoneKey(null), 3000);
  }

  function handleDoneAll(groupItems) {
    groupItems.forEach(item => {
      setGroupJustDoneKeys(prev => new Set([...prev, item.key]));
      onMarkDone(item);
    });
    setJustDoneStreak(s => s + 1);
  }

  // Merge deterministic items with AI-enriched agenda (reason + priority + order)
  const pendingItems = useMemo(() => {
    const apiTasks = agendaData?.tasks;
    if (!apiTasks?.length) return rawItems;
    const rawMap = new Map(rawItems.map(r => [r.key, r]));
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
    for (const raw of rawItems) {
      if (!covered.has(raw.key)) ordered.push(raw);
    }
    return ordered;
  }, [rawItems, agendaData]);

  // Full today list = pending tasks + done-today tasks (deduped)
  const doneTodayKeys = useMemo(() => new Set(doneTodayItems.map(i => i.key)), [doneTodayItems]);
  const items = useMemo(() => {
    const pendingNotDone = pendingItems.filter(i => !doneTodayKeys.has(i.key));
    return [...pendingNotDone, ...doneTodayItems];
  }, [pendingItems, doneTodayItems, doneTodayKeys]);

  // An item is completed if it's been logged today (careLog) or just tapped (optimistic)
  const isCompleted = (item) => doneTodayKeys.has(item.key) || completedThisSession.has(item.key);

  const pendingNotDone = items.filter(i => !isCompleted(i));
  const todayItems   = pendingNotDone.filter(i => (i.priority === 'urgent' || i.priority === 'recommended') && !extractFutureActionDate(i.task?.instructions)).slice(0, 6);
  const weekItems    = pendingNotDone.filter(i => i.priority === 'routine' || ((i.priority === 'urgent' || i.priority === 'recommended') && !!extractFutureActionDate(i.task?.instructions))).slice(0, 5);
  const optItems     = pendingNotDone.filter(i => i.priority === 'optional').slice(0, 5);
  const completedItems = items.filter(isCompleted);
  const doneCount = completedItems.length;
  const totalCount = todayItems.length + weekItems.length + optItems.length;
  const allDone = (todayItems.length + weekItems.length) === 0 && doneCount > 0;
  // Essential counts: derive from pendingItems (correct priorities) rather than doneTodayItems
  // (doneTodayItems are built from careLog with hardcoded priority:'routine', so can't be trusted)
  const essentialKeys = useMemo(() => new Set(
    pendingItems
      .filter(i => (i.priority === 'urgent' || i.priority === 'recommended') && !extractFutureActionDate(i.task?.instructions))
      .slice(0, 6)
      .map(i => i.key)
  ), [pendingItems]);
  const essentialTotalCount = essentialKeys.size;
  const essentialDoneCount = [...essentialKeys].filter(k => doneTodayKeys.has(k) || completedThisSession.has(k)).length;
  const urgentRecAllDone = rawItems.length > 0 && essentialTotalCount > 0 && todayItems.length === 0 && (weekItems.length > 0 || optItems.length > 0);

  if (!seasonOpen) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
        <div style={{ fontFamily: SERIF, fontSize: 16, color: '#907050', fontStyle: 'italic' }}>
          Season 2 isn't open yet. Keep photographing your plants.
        </div>
      </div>
    );
  }

  // Full completion moment — only when every task is done
  if (allDone) {
    const donePlants = [...new Set(items.map(i => i.plantName))];
    return (
      <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '70vh', justifyContent: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>✦</div>
        <div style={{ fontFamily: SERIF, fontSize: 22, color: '#2a1808', marginBottom: 8, textAlign: 'center' }}>
          Garden tended.
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: '#907050', fontStyle: 'italic', textAlign: 'center', marginBottom: 6, lineHeight: 1.6 }}>
          All {totalCount} task{totalCount !== 1 ? 's' : ''} complete.
        </div>
        {donePlants.length > 0 && (
          <div style={{ fontFamily: SERIF, fontSize: 13, color: '#7a5c30', textAlign: 'center', lineHeight: 1.7, marginBottom: 28, fontStyle: 'italic' }}>
            {donePlants.join(', ')} {donePlants.length === 1 ? 'is' : 'are'} tended to.
          </div>
        )}
        <button onClick={onOpenAsk} style={{
          background: 'none', border: '1px solid rgba(160,130,80,0.35)',
          borderRadius: 8, padding: '10px 22px', fontFamily: SERIF,
          fontSize: 14, color: '#6a4020', cursor: 'pointer', fontStyle: 'italic',
          minHeight: 44, WebkitTapHighlightColor: 'transparent',
        }}>
          Anything I missed? →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 14px 24px' }}>

      {/* Progress header */}
      {(() => {
        const optRemaining = optItems.length;
        if (essentialTotalCount === 0 && optRemaining === 0) return null;
        const pct = essentialTotalCount > 0 ? (essentialDoneCount / essentialTotalCount) * 100 : 0;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: '#2a1808', lineHeight: 1 }}>
                    {essentialDoneCount}/{essentialTotalCount}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, letterSpacing: .4, lineHeight: 1 }}>
                    ESSENTIAL
                  </span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 6.5, color: '#a08050', letterSpacing: .4 }}>
                    {isWeekend ? 'WEEKEND SESSION' : 'TODAY\'S ROUNDS'}
                    {agendaData?.sessionMinutes ? ` · ~${agendaData.sessionMinutes} MIN` : ''}
                  </span>
                  {optRemaining > 0 && (
                    <span style={{ fontFamily: SERIF, fontSize: 12, color: '#907050', fontStyle: 'italic' }}>
                      {optRemaining} optional
                    </span>
                  )}
                </div>
              </div>
              {onRefreshAgenda && (
                <button onClick={onRefreshAgenda} title="Refresh agenda"
                  style={{ background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer',
                    color: '#a08050', fontSize: 16, opacity: 0.55, lineHeight: 1,
                    WebkitTapHighlightColor: 'transparent', minHeight: 36 }}>
                  ↻
                </button>
              )}
            </div>
            <div style={{ height: 4, background: 'rgba(160,130,80,0.15)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: essentialDoneCount === 0 ? 'transparent' : 'linear-gradient(90deg, #d4a830, #a07828)',
                width: `${pct}%`,
                transition: 'width .4s ease',
              }}/>
            </div>
          </div>
        );
      })()}

      {/* Morning brief — tap to expand to full daily briefing */}
      {morningBrief && (
        <div
          onClick={() => fullBrief && setBriefExpanded(e => !e)}
          style={{
            background: briefExpanded ? 'rgba(212,168,48,0.10)' : 'rgba(212,168,48,0.07)',
            border: `1px solid rgba(212,168,48,${briefExpanded ? '0.28' : '0.18'})`,
            borderRadius: 9, padding: '11px 13px', marginBottom: 16,
            cursor: fullBrief ? 'pointer' : 'default',
            transition: 'background .15s, border-color .15s',
          }}
        >
          {/* Always-visible one-liner */}
          <div style={{ fontFamily: SERIF, fontSize: 13, color: '#5a3c18', fontStyle: 'italic', lineHeight: 1.55 }}>
            {renderBriefText(morningBrief)}
          </div>

          {/* Expand hint when collapsed and full brief is available */}
          {!briefExpanded && fullBrief && (
            <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(160,130,80,0.55)', marginTop: 6, letterSpacing: .4 }}>
              DAILY BRIEF ▾
            </div>
          )}

          {/* Structured daily brief — expanded */}
          {briefExpanded && fullBrief && (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(212,168,48,0.20)' }}>
              {[
                { key: 'weather', label: 'WEATHER' },
                { key: 'garden',  label: 'GARDEN STATE' },
                { key: 'today',   label: 'TODAY' },
                { key: 'watch',   label: 'WATCH' },
              ].filter(s => fullBrief[s.key]).map(s => (
                <div key={s.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 6, color: C.uiGold, letterSpacing: .5, marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 13, color: '#4a3010', lineHeight: 1.6 }}>
                    {renderBriefText(fullBrief[s.key])}
                  </div>
                </div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(160,130,80,0.55)', marginTop: 4, letterSpacing: .4 }}>
                ▴ CLOSE
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TODAY section ── */}
      {todayItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: MONO, fontSize: 6.5, letterSpacing: .6,
            color: '#b84018', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>TODAY</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(200,80,30,0.20)' }}/>
            <span style={{ color: 'rgba(200,80,30,0.55)' }}>{todayItems.length}</span>
          </div>
          {groupAgendaItems(todayItems).map(entry =>
            entry.type === 'group'
              ? <AgendaGroupCard key={entry.gk} group={entry}
                  onDoneAll={() => handleDoneAll(entry.items)}
                  onDoneOne={handleDone}
                  justDoneKeys={groupJustDoneKeys}/>
              : <AgendaRow key={entry.item.key} item={entry.item} completed={false}
                  justDone={justDoneKey === entry.item.key} justDoneStreak={justDoneStreak}
                  onTap={i => onStartAction(i.plant, i.actionKey, i.task)}
                  onDone={handleDone} portrait={portraits[entry.item.plantId]}/>
          )}
        </div>
      )}

      {/* "Essential tasks done" — when today is clear but more below */}
      {urgentRecAllDone && weekItems.length + optItems.length > 0 && (
        <div style={{ background: 'rgba(72,120,32,0.07)', border: '1px solid rgba(72,120,32,0.22)',
          borderRadius: 9, padding: '9px 13px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 15 }}>✦</span>
          <div style={{ fontFamily: SERIF, fontSize: 12.5, color: '#3a6818', fontStyle: 'italic' }}>
            Today's essentials done.
          </div>
        </div>
      )}

      {/* ── THIS WEEK section ── */}
      {weekItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: MONO, fontSize: 6.5, letterSpacing: .6,
            color: '#7a5c30', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>THIS WEEK</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(160,130,80,0.20)' }}/>
            <span style={{ color: 'rgba(160,130,80,0.45)' }}>{weekItems.length}</span>
          </div>
          {groupAgendaItems(weekItems).map(entry =>
            entry.type === 'group'
              ? <AgendaGroupCard key={entry.gk} group={entry}
                  onDoneAll={() => handleDoneAll(entry.items)}
                  onDoneOne={handleDone}
                  justDoneKeys={groupJustDoneKeys}/>
              : <AgendaRow key={entry.item.key} item={entry.item} completed={false}
                  justDone={justDoneKey === entry.item.key} justDoneStreak={justDoneStreak}
                  onTap={i => onStartAction(i.plant, i.actionKey, i.task)}
                  onDone={handleDone} portrait={portraits[entry.item.plantId]}/>
          )}
        </div>
      )}

      {/* ── WHEN YOU HAVE TIME section ── */}
      {optItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: MONO, fontSize: 6.5, letterSpacing: .6,
            color: '#507050', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>WHEN YOU HAVE TIME</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(80,120,80,0.18)' }}/>
            <span style={{ color: 'rgba(80,120,80,0.40)' }}>{optItems.length}</span>
          </div>
          {groupAgendaItems(optItems).map(entry =>
            entry.type === 'group'
              ? <AgendaGroupCard key={entry.gk} group={entry}
                  onDoneAll={() => handleDoneAll(entry.items)}
                  onDoneOne={handleDone}
                  justDoneKeys={groupJustDoneKeys}/>
              : <AgendaRow key={entry.item.key} item={entry.item} completed={false}
                  justDone={justDoneKey === entry.item.key} justDoneStreak={justDoneStreak}
                  onTap={i => onStartAction(i.plant, i.actionKey, i.task)}
                  onDone={handleDone} portrait={portraits[entry.item.plantId]}/>
          )}
        </div>
      )}

      {/* ── Nothing pending ── */}
      {todayItems.length === 0 && weekItems.length === 0 && optItems.length === 0 && doneCount === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: '#907050', fontStyle: 'italic' }}>
            Everything is tended to.
          </div>
          {!isWeekend && (
            <div style={{ fontFamily: SERIF, fontSize: 12, color: '#b09070', marginTop: 8, fontStyle: 'italic' }}>
              More tasks surface on weekends.
            </div>
          )}
        </div>
      )}

      {/* ── Completed today — collapsed footer ── */}
      {completedItems.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(160,130,80,0.12)', paddingTop: 12 }}>
          {completedItems.map(item => (
            <AgendaRow key={item.key} item={item} completed={true}
              justDone={justDoneKey === item.key} justDoneStreak={justDoneStreak}
              onTap={() => {}} onDone={handleDone} portrait={portraits[item.plantId]}/>
          ))}
        </div>
      )}

      {/* Resting plants count */}
      {(() => {
        const activePlantIds = new Set(pendingItems.map(i => i.plantId));
        const restingCount = totalActivePlants - activePlantIds.size;
        return restingCount > 0 ? (
          <div style={{ fontFamily: SERIF, fontSize: 12, color: '#b09070', fontStyle: 'italic',
            textAlign: 'center', marginTop: 16, paddingTop: 16,
            borderTop: '1px solid rgba(160,130,80,0.12)' }}>
            {restingCount} plant{restingCount !== 1 ? 's' : ''} resting — no action needed.
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ── JOURNAL TAB (mobile) ───────────────────────────────────────────────────

function buildMobileDayMap(allPlants, careLog, portraits, allPhotos) {
  const days = {};
  const ensure = d => { if (!days[d]) days[d] = { careEntries: [], portraitObservations: [], photos: [] }; return days[d]; };

  Object.entries(careLog).forEach(([plantId, entries]) => {
    const plant = allPlants.find(p => p.id === plantId);
    if (!plant) return;
    entries.forEach(e => {
      const bucket = ensure(e.date.slice(0, 10));
      const entryLabel = e.label || e.action;
      // Skip duplicate entries (same plant + action + label on same day)
      const isDupe = bucket.careEntries.some(
        c => c.plantId === plantId && c.action === e.action && c.label === entryLabel
      );
      if (!isDupe) {
        bucket.careEntries.push({
          plantId, plantName: plant.name, label: entryLabel, action: e.action, withEmma: !!e.withEmma, loggedBy: e.loggedBy || null,
        });
      }
    });
  });

  allPlants.forEach(p => {
    const port = portraits[p.id];
    if (!port) return;
    if (port.visualNote && port.date) {
      ensure(port.date.slice(0, 10)).portraitObservations.push({
        plantId: p.id, plantName: p.name,
        visualNote: port.visualNote, bloomState: port.bloomState,
        foliageState: port.foliageState, stage: port.stage || port.currentStage,
      });
    }
    (port.history || []).forEach(h => {
      if (!h.visualNote || !h.date) return;
      const bucket = ensure(h.date.slice(0, 10));
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
      const d = (ph.date || '').slice(0, 10);
      if (d) ensure(d).photos.push({ ...ph, plantId });
    });
  });

  return days;
}

function PortraitCarousel({ plantIds, portraits, allPlants }) {
  const [idx, setIdx] = React.useState(0);
  const safeIdx = Math.min(idx, plantIds.length - 1);
  const plantId = plantIds[safeIdx];
  const plant = allPlants.find(p => p.id === plantId);
  const portrait = portraits[plantId];
  if (!plant || !portrait?.svg) return null;
  const accentColor = plant.color || plantColor(plant.type);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 260,
        aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
        border: `2px solid ${accentColor}55`,
        boxShadow: `0 0 0 3px ${accentColor}18, 0 3px 14px rgba(0,0,0,0.09)`,
        background: '#faf6ee',
      }}>
        <PlantPortrait plant={plant} aiSvg={portrait.svg}/>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(30,18,8,0.55))',
          padding: '18px 10px 8px',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 6.5, color: 'rgba(240,228,200,0.88)', letterSpacing: 0.4 }}>
            {plant.name.toUpperCase()}
          </span>
        </div>
        {plantIds.length > 1 && (
          <>
            <button onClick={() => setIdx(i => (i - 1 + plantIds.length) % plantIds.length)}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 36,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(240,228,200,0.65)', fontSize: 18,
                WebkitTapHighlightColor: 'transparent' }}>‹</button>
            <button onClick={() => setIdx(i => (i + 1) % plantIds.length)}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(240,228,200,0.65)', fontSize: 18,
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
        <div style={{ fontFamily: SERIF, fontSize: 12, color: '#907050', fontStyle: 'italic',
          lineHeight: 1.55, marginTop: 7, paddingLeft: 2 }}>
          {portrait.visualNote}
        </div>
      )}
    </div>
  );
}

function MobileJournalDay({ dateStr, careEntries, portraitObservations, photos, allPlants, careLog, portraits = {} }) {
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);

  const versionKey = `${careEntries.length}_${portraitObservations.map(o => (o.visualNote || '').slice(0, 6)).join('')}`;

  React.useEffect(() => {
    setLoading(true);
    setNarrative(null);
    let isMounted = true;
    const plantIds = [...new Set([...careEntries.map(e => e.plantId), ...portraitObservations.map(o => o.plantId)])];
    const plantHistories = plantIds.map(pid => {
      const plant = allPlants.find(p => p.id === pid);
      if (!plant) return null;
      const recentCare = (careLog[pid] || [])
        .filter(e => e.date.slice(0, 10) < dateStr)
        .slice(-8)
        .map(e => ({ label: e.label, date: e.date }));
      return { plantName: plant.name, recentCare };
    }).filter(Boolean);

    fetchJournalEntry({ dateStr, careEntries, portraitObservations, photoCount: photos.length, plantHistories })
      .then(text => { if (isMounted) { setNarrative(text); setLoading(false); } })
      .catch(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [dateStr, versionKey]);

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const hasEmma = careEntries.some(e => e.withEmma);

  return (
    <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid rgba(160,130,80,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: '#a08060', fontFamily: MONO, letterSpacing: 0.6 }}>
          {dateLabel.toUpperCase()}
        </span>
        {isToday && (
          <span style={{ fontSize: 8, color: C.uiGold, fontFamily: MONO, border: '1px solid rgba(212,168,48,0.4)', borderRadius: 8, padding: '1px 6px' }}>
            IN PROGRESS
          </span>
        )}
        {hasEmma && <span style={{ fontSize: 11, color: '#e84070' }}>♥</span>}
      </div>

      {/* SVG portrait carousel — only plants with photos taken that day */}
      {(() => {
        const withSvg = [...new Set(portraitObservations.map(o => o.plantId))].filter(id => portraits[id]?.svg);
        if (!withSvg.length) return null;
        return <PortraitCarousel plantIds={withSvg} portraits={portraits} allPlants={allPlants}/>;
      })()}

      {loading ? (
        <div style={{ fontFamily: SERIF, fontSize: 13, color: 'rgba(160,130,80,0.3)', fontStyle: 'italic', lineHeight: 1.7 }}>…</div>
      ) : narrative ? (
        <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.8, color: '#3a2010', margin: '0 0 10px' }}>
          {narrative}
        </p>
      ) : null}

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
          {photos.slice(0, 4).map((ph, i) => (
            <img key={i} src={ph.url || ph.dataUrl} alt=""
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(160,130,80,0.2)' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileJournal({ plants, frontPlants = [], careLog, portraits = {}, allPhotos = {} }) {
  const allPlants = React.useMemo(() => [...plants, ...frontPlants], [plants, frontPlants]);
  const dayMap = React.useMemo(
    () => buildMobileDayMap(allPlants, careLog, portraits, allPhotos),
    [allPlants, careLog, portraits, allPhotos]
  );
  const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a)).slice(0, 60);

  if (sortedDays.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: '#907050', fontStyle: 'italic' }}>
          No care logged yet this season.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 32px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 16, letterSpacing: 0.5 }}>
        SEASON 2 JOURNAL
      </div>
      {sortedDays.map(dateStr => {
        const day = dayMap[dateStr];
        return (
          <MobileJournalDay key={dateStr} dateStr={dateStr}
            careEntries={day.careEntries}
            portraitObservations={day.portraitObservations}
            photos={day.photos}
            allPlants={allPlants}
            careLog={careLog}
            portraits={portraits}
          />
        );
      })}
    </div>
  );
}

// ── MOBILE SIGN IN ─────────────────────────────────────────────────────────
function MobileSignIn({ signIn }) {
  const [open, setOpen] = React.useState(false);
  const [who, setWho] = React.useState(null); // 'tucker' | 'emma'
  const [pw, setPw] = React.useState('');
  const [error, setError] = React.useState('');
  const [checking, setChecking] = React.useState(false);

  const close = () => { setOpen(false); setWho(null); setPw(''); setError(''); };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{background:'none',border:'none',fontFamily:MONO,fontSize:6,color:C.uiMuted,cursor:'pointer',padding:'4px 6px'}}>
        sign in
      </button>
    );
  }

  const attempt = async () => {
    setError(''); setChecking(true);
    try { await signIn(who, pw); close(); }
    catch (e) { setError(e.message); }
    finally { setChecking(false); }
  };

  // Step 1 — pick who you are
  if (!who) {
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(4,2,1,0.95)',zIndex:200,
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,gap:16}}>
        <div style={{fontFamily:MONO,fontSize:8,color:C.uiGold,marginBottom:8}}>WHO ARE YOU?</div>
        <button onClick={() => setWho('tucker')}
          style={{width:'100%',maxWidth:280,padding:'16px',background:'rgba(212,168,48,0.12)',
            border:'1px solid rgba(212,168,48,0.3)',borderRadius:10,color:C.uiText,
            fontFamily:SERIF,fontSize:18,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          🌿 Tucker
        </button>
        <button onClick={() => setWho('emma')}
          style={{width:'100%',maxWidth:280,padding:'16px',background:'rgba(232,64,112,0.10)',
            border:'1px solid rgba(232,64,112,0.25)',borderRadius:10,color:C.uiText,
            fontFamily:SERIF,fontSize:18,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
          🌹 Emma
        </button>
        <button onClick={close}
          style={{background:'none',border:'none',color:C.uiMuted,fontFamily:SERIF,fontSize:14,cursor:'pointer',marginTop:8,
            WebkitTapHighlightColor:'transparent'}}>
          cancel
        </button>
      </div>
    );
  }

  // Step 2 — enter password
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(4,2,1,0.95)',zIndex:200,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{fontFamily:MONO,fontSize:8,color:C.uiGold,marginBottom:8}}>
        {who === 'tucker' ? '🌿 TUCKER' : '🌹 EMMA'}
      </div>
      <div style={{fontFamily:SERIF,fontSize:13,color:C.uiMuted,marginBottom:24}}>Enter your password</div>
      <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&attempt()}
        placeholder="password" autoFocus
        style={{width:'100%',maxWidth:280,padding:'14px',marginBottom:16,textAlign:'center',
          background:'rgba(255,255,255,0.06)',border:`1px solid ${error?'#c07050':'rgba(90,60,24,0.5)'}`,
          borderRadius:8,color:'#f0e4cc',fontFamily:SERIF,fontSize:18,outline:'none'}}/>
      {error && <div style={{color:'#c07050',fontFamily:SERIF,fontSize:13,marginBottom:12}}>{error}</div>}
      <button onClick={attempt} disabled={checking}
        style={{width:'100%',maxWidth:280,padding:'14px',background:C.uiGold,
          border:'none',borderRadius:8,color:C.uiBg,fontFamily:MONO,fontSize:9,
          cursor:'pointer',marginBottom:12,opacity:checking?0.6:1}}>
        {checking ? '…' : 'SIGN IN'}
      </button>
      <button onClick={() => { setWho(null); setPw(''); setError(''); }}
        style={{background:'none',border:'none',color:C.uiMuted,fontFamily:SERIF,fontSize:14,cursor:'pointer'}}>
        ← back
      </button>
    </div>
  );
}

// ── MAIN MOBILE VIEW ───────────────────────────────────────────────────────
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

function MobileSpend({ expenses = [], onAddExpense }) {
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({desc:'',amount:'',group:'',category:''});

  const totalSpend = expenses.reduce((s,e)=>s+e.cents,0);

  const byCategory = {};
  const byGroup = {};
  for (const e of expenses) {
    const cat = e.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + e.cents;
    const grp = e.group || '';
    byGroup[grp] = (byGroup[grp] || 0) + e.cents;
  }

  // Monthly buckets for SVG chart (March = season start)
  const SEASON_START_MONTH = 2; // March = index 2
  const now = new Date();
  const months = [];
  for (let m = SEASON_START_MONTH; m <= now.getMonth(); m++) {
    const label = new Date(2026, m, 1).toLocaleDateString('en-US', {month:'short'});
    const total = expenses.filter(e => new Date(e.date).getMonth() === m).reduce((s,e)=>s+e.cents,0);
    months.push({ label, total });
  }
  const maxMonth = Math.max(...months.map(m=>m.total), 1);
  const svgW = 300, svgH = 60;
  const pts = months.map((m, i) => {
    const x = months.length < 2 ? svgW/2 : Math.round(i * (svgW-20) / (months.length-1)) + 10;
    const y = svgH - 6 - Math.round((m.total / maxMonth) * (svgH - 16));
    return `${x},${y}`;
  }).join(' ');

  function submit() {
    const amt = parseFloat(form.amount);
    if (!form.desc || isNaN(amt) || amt <= 0) return;
    onAddExpense(form.desc, Math.round(amt*100), null, form.group||null, form.category||null);
    setForm({desc:'',amount:'',group:'',category:''});
    setShowForm(false);
  }

  const pillStyle = (active) => ({
    padding:'5px 10px', borderRadius:20, cursor:'pointer', fontFamily:SERIF, fontSize:13,
    background: active ? 'rgba(212,168,48,0.18)' : '#fff',
    border: `1px solid ${active ? '#d4a830' : 'rgba(160,130,80,0.25)'}`,
    color: active ? '#2a1808' : '#5a3818',
    minHeight: 44, WebkitTapHighlightColor: 'transparent',
  });

  return (
    <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:16}}>
      {/* Season total + log button */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',letterSpacing:.5,marginBottom:4}}>SEASON TOTAL</div>
          <div style={{fontSize:34,fontWeight:600,color:'#2a1808',fontFamily:SERIF,lineHeight:1}}>${(totalSpend/100).toFixed(2)}</div>
          <div style={{fontSize:11,color:'#907050',fontFamily:SERIF,marginTop:2}}>{expenses.length} purchase{expenses.length!==1?'s':''}</div>
        </div>
        <button onClick={()=>setShowForm(v=>!v)}
          style={{padding:'8px 14px',background:'rgba(212,168,48,0.14)',border:'1px solid rgba(212,168,48,0.5)',
            borderRadius:7,cursor:'pointer',fontFamily:MONO,fontSize:7,color:'#2a1808',
            minHeight:44,WebkitTapHighlightColor:'transparent'}}>
          {showForm?'CANCEL':'+ LOG'}
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div style={{background:'rgba(160,130,80,0.06)',borderRadius:10,padding:'14px',display:'flex',flexDirection:'column',gap:11,border:'1px solid rgba(160,130,80,0.18)'}}>
          <input value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}
            placeholder="What did you buy?" onKeyDown={e=>{if(e.key==='Enter')submit();}}
            style={{background:'#fff',border:'1px solid rgba(160,130,80,0.30)',borderRadius:6,
              padding:'9px 12px',color:'#2a1808',fontSize:16,fontFamily:SERIF,outline:'none'}}/>
          <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}
            placeholder="Amount ($)" step=".01"
            style={{background:'#fff',border:'1px solid rgba(160,130,80,0.30)',borderRadius:6,
              padding:'9px 12px',color:'#2a1808',fontSize:16,fontFamily:SERIF,outline:'none'}}/>
          <div>
            <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',marginBottom:6}}>CATEGORY</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {EXP_CATS.map(c=>(
                <button key={c.key} onClick={()=>setForm(p=>({...p,category:p.category===c.key?'':c.key}))}
                  style={pillStyle(form.category===c.key)}>{c.emoji} {c.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',marginBottom:6}}>FOR</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {EXP_GROUPS.map(g=>(
                <button key={g.key} onClick={()=>setForm(p=>({...p,group:p.group===g.key&&g.key!==''?'':g.key}))}
                  style={pillStyle(form.group===g.key)}>{g.emoji} {g.label}</button>
              ))}
            </div>
          </div>
          <button onClick={submit}
            style={{background:'rgba(212,168,48,0.20)',border:'1px solid rgba(212,168,48,0.55)',borderRadius:7,
              padding:'11px',cursor:'pointer',fontFamily:MONO,fontSize:8,color:'#2a1808'}}>
            LOG EXPENSE
          </button>
        </div>
      )}

      {expenses.length > 0 && (<>
        {/* Monthly SVG chart */}
        {months.length >= 2 && (
          <div>
            <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',letterSpacing:.5,marginBottom:8}}>THIS SEASON</div>
            <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{overflow:'visible'}}>
              <polyline points={pts} fill="none" stroke="#d4a830" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              {months.map((m, i) => {
                const x = months.length < 2 ? svgW/2 : Math.round(i*(svgW-20)/(months.length-1))+10;
                const y = svgH-6-Math.round((m.total/maxMonth)*(svgH-16));
                return <React.Fragment key={m.label}>
                  <circle cx={x} cy={y} r="3" fill="#d4a830"/>
                  <text x={x} y={svgH+2} textAnchor="middle" fontSize="8" fill="#a08060" fontFamily="sans-serif">{m.label}</text>
                </React.Fragment>;
              })}
            </svg>
          </div>
        )}

        {/* By category */}
        {Object.keys(byCategory).length > 0 && (
          <div>
            <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',letterSpacing:.5,marginBottom:8}}>BY CATEGORY</div>
            {Object.entries(byCategory).sort(([,a],[,b])=>b-a).map(([cat,total])=>{
              const def = EXP_CATS.find(c=>c.key===cat);
              return (
                <div key={cat} style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontFamily:SERIF,fontSize:13,color:'#5a3818'}}>{def?.emoji||'📦'} {def?.label||cat}</span>
                    <span style={{fontFamily:SERIF,fontSize:13,color:'#2a1808',fontWeight:600}}>${(total/100).toFixed(2)}</span>
                  </div>
                  <div style={{height:5,background:'rgba(160,130,80,0.15)',borderRadius:3}}>
                    <div style={{height:'100%',width:`${Math.round((total/totalSpend)*100)}%`,background:'#d4a830',borderRadius:3}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* By group */}
        {Object.keys(byGroup).length > 0 && (
          <div>
            <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',letterSpacing:.5,marginBottom:8}}>BY AREA</div>
            {Object.entries(byGroup).sort(([,a],[,b])=>b-a).map(([grp,total])=>{
              const def = EXP_GROUPS.find(g=>g.key===grp);
              return (
                <div key={grp||'garden'} style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontFamily:SERIF,fontSize:13,color:'#5a3818'}}>{def?.emoji||'🌿'} {def?.label||'Whole Garden'}</span>
                    <span style={{fontFamily:SERIF,fontSize:13,color:'#2a1808',fontWeight:600}}>${(total/100).toFixed(2)}</span>
                  </div>
                  <div style={{height:5,background:'rgba(160,130,80,0.15)',borderRadius:3}}>
                    <div style={{height:'100%',width:`${Math.round((total/totalSpend)*100)}%`,background:'rgba(212,168,48,0.7)',borderRadius:3}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div>
          <div style={{fontFamily:MONO,fontSize:6,color:'#a08060',letterSpacing:.5,marginBottom:8}}>ALL PURCHASES</div>
          {[...expenses].reverse().map((e,i)=>{
            const catDef = EXP_CATS.find(c=>c.key===e.category);
            const grpDef = EXP_GROUPS.find(g=>g.key===(e.group||''));
            return (
              <div key={e.id||i} style={{display:'flex',alignItems:'center',gap:10,
                padding:'9px 0',borderBottom:'1px solid rgba(160,130,80,0.12)'}}>
                <span style={{fontSize:18,flexShrink:0}}>{catDef?.emoji||'📦'}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:SERIF,fontSize:14,color:'#2a1808',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.desc}</div>
                  <div style={{fontFamily:SERIF,fontSize:11,color:'#907050'}}>
                    {grpDef?.label||'Whole Garden'}
                    {e.date && ` · ${new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
                  </div>
                </div>
                <div style={{fontFamily:SERIF,fontSize:15,color:'#2a1808',fontWeight:600,flexShrink:0}}>${(e.cents/100).toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      </>)}

      {expenses.length === 0 && !showForm && (
        <div style={{textAlign:'center',padding:'40px 0',color:'#b09070',fontFamily:SERIF,fontSize:14,fontStyle:'italic'}}>
          Nothing logged yet — the season is young.
        </div>
      )}
    </div>
  );
}

export function MobileView({
  plants, frontPlants = [], careLog, weather,
  onAction, onPortraitUpdate, onGrowthUpdate, allPhotos = {}, onAddPhoto,
  portraits = {}, role, signIn, signOut, seasonOpen, oracle, onGoFront,
  briefings: externalBriefings = {},
  expenses = [], onAddExpense,
  onDeleteAction,
  onTaskDone,
  morningBrief: externalMorningBrief = null,
  dailyBrief: externalDailyBrief = null,
  agendaItems: externalAgendaItems = null,
  agendaData: externalAgendaData = null,
  agendaIsWeekend: externalAgendaIsWeekend = false,
  onRefreshAgenda,
}) {
  const [tab, setTab] = useState('today');
  const [flash, setFlash] = useState(null);
  const [actionSession, setActionSession] = useState(null); // { plant, actionKey } | null
  const [briefings, setBriefings] = useState({});
  // Guest sign-in state
  const [guestWho, setGuestWho]     = useState(null);
  const [guestPw, setGuestPw]       = useState('');
  const [guestError, setGuestError] = useState('');
  // Briefs come exclusively from App.js (externalMorningBrief / externalDailyBrief).
  // No local fetch — App.js is the single source of truth so both platforms show identical text.
  const [analysisNotice, setAnalysisNotice] = useState(null);
  const prevAnalyzingRef = useRef({});
  const completedKeysRef = useRef(new Set());
  const [completedCount, setCompletedCount] = useState(0); // triggers re-render when item is marked done
  const [openPlantId, setOpenPlantId] = useState(null); // plant to auto-expand on Garden tab

  function handleMarkDone(item) {
    completedKeysRef.current.add(item.key);
    setCompletedCount(n => n + 1);
    // Photo tasks: navigate to garden tab instead of logging care action
    if (item.actionKey === 'photo') {
      setTab('garden');
      setFlash('📷 Find the plant in Garden to add a photo');
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    handleAction(item.actionKey, item.plant, item.actionKey === 'tend' ? item.task?.label : undefined);
    onTaskDone?.(item.plantId);
  }

  // Version string that changes when any plant's last care action changes
  const careVersion = useMemo(() =>
    [...plants, ...frontPlants].map(p => {
      const e = careLog[p.id] || [];
      return e.length ? e[e.length - 1].date : '';
    }).join('|'),
  [plants, frontPlants, careLog]);

  useEffect(() => {
    if (!weather) return;
    let cancelled = false;
    const timeoutIds = [];
    [...plants, ...frontPlants]
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
      .forEach((p, i) => {
        const tid = setTimeout(() => {
          if (cancelled) return;
          fetchPlantBriefing(p, careLog, weather, portraits)
            .then(b => { if (!cancelled) setBriefings(prev => ({ ...prev, [p.id]: b })); })
            .catch(() => {});
        }, i * 600); // stagger 600ms — avoids Anthropic rate limits
        timeoutIds.push(tid);
      });
    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [careVersion, weather]); // intentional: portraits/careLog refs change too often


  // Total active plants — passed to TodayAgenda for "N plants resting" count
  const totalActivePlants = useMemo(
    () => [...plants, ...frontPlants].filter(p => p.type !== 'empty-pot' && p.health !== 'memorial').length,
    [plants, frontPlants]
  );

  // Merge external (App.js centralized) briefings with local — external wins when loaded
  const mergedBriefings = useMemo(() => {
    const merged = { ...briefings };
    for (const [id, b] of Object.entries(externalBriefings)) {
      if (b && b !== 'loading') merged[id] = b; // prefer loaded external briefing
      else if (merged[id] === undefined) merged[id] = b; // use loading state if nothing local yet
    }
    return merged;
  }, [briefings, externalBriefings]);

  // Compute today's agenda deterministically — use App.js shared items if provided
  // (single source of truth), otherwise compute locally as fallback.
  const { items: localAgendaItems, isWeekend: localAgendaIsWeekend } = useMemo(
    () => externalAgendaItems
      ? { items: externalAgendaItems, isWeekend: externalAgendaIsWeekend }
      : computeAgenda({ plants, frontPlants, careLog, briefings: mergedBriefings, weather, seasonOpen, allPhotos }),
    [externalAgendaItems, externalAgendaIsWeekend, plants, frontPlants, careLog, mergedBriefings, weather, seasonOpen, allPhotos]
  );
  const rawAgendaItems = localAgendaItems;
  const agendaIsWeekend = localAgendaIsWeekend;

  const todayStr = new Date().toISOString().slice(0, 10);
  const allPlantsFlat = useMemo(() => [...plants, ...frontPlants], [plants, frontPlants]);

  // Tasks completed today from careLog — persists across page reloads.
  // Grows as care is logged; complements rawAgendaItems (which shrinks as tasks are done).
  const doneTodayItems = useMemo(() => {
    const skipActions = new Set(['note', 'visit']); // 'photo' included so photo-logged-today counts as done
    const seen = new Set();
    const result = [];
    for (const [plantId, entries] of Object.entries(careLog)) {
      for (const entry of entries) {
        if (!entry.date?.startsWith(todayStr)) continue;
        if (skipActions.has(entry.action)) continue;
        const key = entry.action === 'tend'
          ? `${plantId}:tend:${entry.label || ''}`
          : `${plantId}:${entry.action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const plant = allPlantsFlat.find(p => p.id === plantId);
        if (!plant) continue;
        result.push({ key, plantId, plantName: plant.name, actionKey: entry.action, plant, priority: 'routine', reason: '' });
      }
    }
    return result;
  }, [careLog, allPlantsFlat, todayStr]);

  // agendaData now comes from App.js (single source of truth)
  const agendaData = externalAgendaData;


  // Watch portraits for analysis completion → show notification
  useEffect(() => {
    const prev = prevAnalyzingRef.current;
    const allPlants = [...plants, ...frontPlants];
    let noticeTimer = null;
    for (const [id, portrait] of Object.entries(portraits)) {
      if (prev[id]?.analyzing && !portrait.analyzing) {
        const plant = allPlants.find(p => p.id === id);
        if (plant) {
          setAnalysisNotice(`${plant.name} portrait updated`);
          noticeTimer = setTimeout(() => setAnalysisNotice(null), 4000);
        }
      }
    }
    prevAnalyzingRef.current = Object.fromEntries(
      Object.entries(portraits).map(([id, p]) => [id, { analyzing: !!p.analyzing }])
    );
    return () => { if (noticeTimer !== null) clearTimeout(noticeTimer); };
  }, [portraits]); // intentional: only track portrait analyzing transitions

  function handleAction(key, plant, customLabel, customDate = null) {
    onAction(key, plant, customLabel, customDate);
    const def = ACTION_DEFS[key];
    const displayLabel = customLabel || def?.label || key;
    const emoji = def?.emoji || '✨';
    setFlash(`${emoji} ${displayLabel}`);
    setTimeout(() => setFlash(null), 2000);
  }

  function handleStartAction(plant, key, task = null) {
    // Photo tasks: navigate to garden tab so user can add a photo from the plant card
    if (key === 'photo') {
      setTab('garden');
      setFlash('📷 Find the plant in Garden to add a photo');
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    setActionSession({ plant, key, task });
  }

  const TABS = [
    { id: 'today',   label: '✦',  title: 'Today'   },
    { id: 'garden',  label: '🌿', title: 'Garden'  },
    { id: 'ask',     label: '🌸', title: 'Ask'     },
    { id: 'journal', label: '📖', title: 'Journal' },
    { id: 'spend',   label: '💰', title: 'Spend'   },
  ];

  // ── GUEST GATE — full-screen sign-in for unauthenticated mobile visitors ──
  if (role === 'guest') {
    return (
      <div style={{
        width: '100vw', height: '100dvh',
        background: C.uiBg, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: SERIF, padding: '0 32px',
      }}>
        {/* Botanical emblem */}
        <svg width="52" height="54" viewBox="0 0 54 56" style={{ display: 'block', marginBottom: 14 }}>
          <path d="M27 52 C26 44 26 34 27 22" stroke="#3a5810" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="27" y1="42" x2="22" y2="38" stroke="#3a5810" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="27" y1="33" x2="32" y2="29" stroke="#3a5810" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M27 44 C18 39 12 30 14 21 C20 27 25 36 27 44Z" fill="#4a6820" opacity="0.90"/>
          <path d="M27 38 C36 33 41 24 39 15 C33 22 28 31 27 38Z" fill="#4a6820" opacity="0.90"/>
          <circle cx="11" cy="15" r="3.2" fill="#9ab8d0" opacity="0.82"/>
          <circle cx="7" cy="21" r="2.6" fill="#b0c8e0" opacity="0.70"/>
          <circle cx="43" cy="13" r="3.2" fill="#9ab8d0" opacity="0.82"/>
          <circle cx="47" cy="19" r="2.6" fill="#b0c8e0" opacity="0.70"/>
          <circle cx="27" cy="18" r="10.5" fill="#8a1c2c" opacity="0.92"/>
          <path d="M17 18 C17 9 27 7 37 9 C36 18 27 19 17 18Z" fill="#b02030" opacity="0.62"/>
          <circle cx="27" cy="17" r="7" fill="#c22838" opacity="0.93"/>
          <circle cx="27" cy="15.5" r="4.2" fill="#d83848" opacity="0.90"/>
          <circle cx="27" cy="13.5" r="2.2" fill="#f04858" opacity="0.85"/>
        </svg>

        <div style={{ fontFamily: MONO, fontSize: 14, color: C.uiGold, letterSpacing: 3,
          textShadow: `1px 2px 0 #1a0804, 0 0 20px rgba(200,160,24,0.35)`,
          marginBottom: 6, textAlign: 'center' }}>
          GARDEN<br/>PARTY
        </div>
        <div style={{ marginBottom: 40 }}/>

        {/* Who-picker or password step */}
        {!guestWho ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 260 }}>
            <div style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic',
              color: 'rgba(200,180,140,0.50)', marginBottom: 4 }}>who's there?</div>
            {['tucker', 'emma'].map(who => (
              <button key={who} onClick={() => { setGuestWho(who); setGuestPw(''); setGuestError(''); }}
                style={{ width: '100%', padding: '14px 0', background: 'rgba(30,15,5,0.80)',
                  border: '1px solid rgba(90,60,24,0.45)', borderRadius: 10,
                  fontFamily: MONO, fontSize: 8, color: C.uiText, cursor: 'pointer',
                  minHeight: 52, WebkitTapHighlightColor: 'transparent' }}>
                {who === 'tucker' ? '🌿 Tucker' : '🌹 Emma'}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 260 }}>
            <div style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic',
              color: 'rgba(200,180,140,0.55)' }}>
              {guestWho === 'tucker' ? '🌿 Tucker' : '🌹 Emma'}
            </div>
            <input
              type="password"
              placeholder="password"
              value={guestPw}
              onChange={e => setGuestPw(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  setGuestError('');
                  try { await signIn(guestWho, guestPw); }
                  catch (err) { setGuestError(err.message); }
                }
              }}
              autoFocus
              style={{ width: '100%', padding: '14px 16px', boxSizing: 'border-box',
                background: 'rgba(20,10,3,0.80)', border: '1px solid rgba(90,60,24,0.45)',
                borderRadius: 10, fontFamily: SERIF, fontSize: 16,
                color: C.uiText, outline: 'none', textAlign: 'center',
                WebkitAppearance: 'none', minHeight: 52 }}
            />
            {guestError && (
              <div style={{ fontFamily: SERIF, fontSize: 12, color: '#e87040', fontStyle: 'italic' }}>{guestError}</div>
            )}
            <button
              onClick={async () => {
                setGuestError('');
                try { await signIn(guestWho, guestPw); }
                catch (err) { setGuestError(err.message); }
              }}
              style={{ width: '100%', padding: '14px 0', minHeight: 52,
                background: 'rgba(212,168,48,0.16)', border: '1px solid rgba(212,168,48,0.45)',
                borderRadius: 10, fontFamily: MONO, fontSize: 8, color: C.uiGold,
                cursor: 'pointer', letterSpacing: 0.5, WebkitTapHighlightColor: 'transparent' }}>
              ENTER
            </button>
            <button onClick={() => { setGuestWho(null); setGuestPw(''); setGuestError(''); }}
              style={{ background: 'none', border: 'none', color: 'rgba(160,130,80,0.45)',
                fontFamily: SERIF, fontSize: 12, cursor: 'pointer', fontStyle: 'italic',
                padding: '4px 0', WebkitTapHighlightColor: 'transparent' }}>
              back
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: C.appBg, fontFamily: SERIF,
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        height: 'calc(52px + env(safe-area-inset-top))', background: C.uiPane,
        borderBottom: `2px solid ${C.uiBorder}`,
        display: 'flex', alignItems: 'center',
        padding: '0 16px', paddingTop: 'env(safe-area-inset-top)', gap: 10, flexShrink: 0,
      }}>
        <button onClick={() => setTab('today')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.uiGold, letterSpacing: .5 }}>
            GARDEN PARTY
          </span>
        </button>
        <div style={{ flex: 1 }}/>
        {/* Auth indicator */}
        {role !== 'guest' ? (
          <button onClick={signOut}
            style={{background:'none',border:'none',fontFamily:MONO,fontSize:6,color:C.uiMuted,cursor:'pointer',padding:'4px 6px'}}>
            {role === 'tucker' ? '🌿' : '🌹'} ×
          </button>
        ) : (
          <MobileSignIn signIn={signIn}/>
        )}
      </div>

      {/* Analysis notification bar */}
      {analysisNotice && (
        <div style={{
          background: 'rgba(18,12,6,0.90)',
          borderBottom: `1px solid ${C.uiBorder}`,
          padding: '7px 16px',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>🌿</span>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: C.uiGold, fontStyle: 'italic' }}>
            {analysisNotice}
          </span>
        </div>
      )}

      {/* Flash message */}
      {flash && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(18,12,6,0.92)', border: `1px solid ${C.uiBorder}`,
          borderRadius: 6, padding: '8px 16px', zIndex: 100,
          fontFamily: SERIF, fontSize: 14, color: C.uiGold,
          pointerEvents: 'none',
        }}>
          {flash}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflowY: tab !== 'ask' ? 'auto' : 'hidden', position: 'relative', overscrollBehavior: 'contain' }}>
        {tab === 'today' && (
          <TodayAgenda
            rawItems={rawAgendaItems} isWeekend={agendaIsWeekend}
            agendaData={agendaData} seasonOpen={seasonOpen}
            totalActivePlants={totalActivePlants}
            morningBrief={externalMorningBrief} fullBrief={externalDailyBrief}
            onStartAction={handleStartAction}
            portraits={portraits} completedThisSession={completedKeysRef.current}
            doneTodayItems={doneTodayItems}
            onMarkDone={handleMarkDone}
            onOpenAsk={() => setTab('ask')}
            careLog={careLog}
            onRefreshAgenda={onRefreshAgenda}
          />
        )}

        {tab === 'garden' && (
          <GardenAccordion
            plants={plants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')}
            frontPlants={frontPlants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')}
            careLog={careLog}
            onAction={handleAction}
            onStartAction={handleStartAction}
            onPortraitUpdate={onPortraitUpdate}
            onGrowthUpdate={onGrowthUpdate}
            onAddPhoto={onAddPhoto}
            allPhotos={allPhotos}
            portraits={portraits}
            briefings={mergedBriefings}
            seasonOpen={seasonOpen}
            frozenAgendaItems={rawAgendaItems}
            onDeleteAction={onDeleteAction}
            openPlantId={openPlantId}
            onOpenPlantHandled={() => setOpenPlantId(null)}
          />
        )}

        {tab === 'ask' && (
          <OracleChat
            plants={[...plants, ...frontPlants]} careLog={careLog} weather={weather}
            style={{ height: '100%' }}
          />
        )}

        {tab === 'journal' && (
          <MobileJournal
            plants={plants} frontPlants={frontPlants} careLog={careLog} portraits={portraits} allPhotos={allPhotos}
          />
        )}

        {tab === 'spend' && (
          <MobileSpend expenses={expenses} onAddExpense={onAddExpense} />
        )}
      </div>

      {/* Care action sheet */}
      {actionSession && (
        <MobileActionSheet
          plant={actionSession.plant}
          actionKey={actionSession.key}
          task={actionSession.task}
          careLog={careLog}
          portraits={portraits}
          weather={weather}
          onLog={() => handleAction(actionSession.key, actionSession.plant, actionSession.task?.label)}
          onClose={() => setActionSession(null)}
          onGoToPlant={id => { setOpenPlantId(id); setTab('garden'); }}
        />
      )}

      {/* Bottom tab bar */}
      <div style={{
        height: 'calc(52px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: C.uiPane,
        borderTop: `2px solid ${C.uiBorder}`,
        display: 'flex', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, background: 'none', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, cursor: 'pointer',
              borderTop: `2px solid ${tab === t.id ? C.uiGold : 'transparent'}`,
              transition: 'all .12s',
            }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{t.label}</span>
            <span style={{
              fontFamily: MONO, fontSize: 6,
              color: tab === t.id ? C.uiGold : C.uiMuted,
              letterSpacing: .3,
            }}>
              {t.title.toUpperCase()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
