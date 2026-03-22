// Mobile view — optimized for use while actually in the garden
// Hero features: photo upload, quick care, oracle chat
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { OracleChat } from './OracleChat';
import { ACTION_DEFS } from '../data/plants';
import { PlantPortrait } from '../PlantPortraits';
import { fetchPlantBriefing, fetchMorningBrief, fetchDailyAgenda, fetchDailyBrief, fetchJournalEntry, streamGardenChat } from '../claude';
import { compressChatImage } from '../utils/compressChatImage';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO = '"Press Start 2P", monospace';

const C = {
  appBg: '#f2ece0', cardBg: '#faf6ee', cardBorder: 'rgba(160,130,80,0.18)',
  uiBg: '#120c06', uiPane: '#1c1008', uiBorder: '#5a3c18',
  uiText: '#f0e4cc', uiMuted: '#a89070', uiGold: '#d4a830',
};

// Inline action-key colors for brief narrative highlights
const BRIEF_ACTION_COLORS = {
  water: '#4a8ac8', fertilize: '#5a9a40', prune: '#c87030',
  neem: '#7050a8', train: '#a07840', worms: '#806030',
  repot: '#c05040', custom: '#c09820',
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

function actionStatus(plant, key, careLog, seasonOpen) {
  if (!seasonOpen) return { available: false, reason: 'Not yet open' };
  const def = ACTION_DEFS[key]; if (!def) return { available: false, reason: '?' };
  if (def.alwaysAvailable) return { available: true };
  const entries = (careLog[plant.id] || []).filter(e => e.action === key);
  if (def.seasonMax !== null && entries.length >= def.seasonMax)
    return { available: false, reason: 'Done for season' };
  if (def.cooldownDays > 0 && entries.length > 0) {
    const last = new Date(entries[entries.length - 1].date);
    const days = (Date.now() - last.getTime()) / 86400000;
    if (days < def.cooldownDays)
      return { available: false, reason: `${Math.ceil(def.cooldownDays - days)}d` };
  }
  return { available: true };
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

function MobileActionSheet({ plant, actionKey, task = null, careLog, portraits, weather, onLog, onClose }) {
  const def = ACTION_DEFS[actionKey];
  const color = plantColor(plant.type);
  const [mode, setMode] = React.useState(null); // null | 'confirm' | 'help'

  // confirm mode
  const [confirmPhoto, setConfirmPhoto] = React.useState(null);
  const [confirmFeedback, setConfirmFeedback] = React.useState(null);
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const confirmFileRef = React.useRef(null);

  // help/chat mode
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [chatPhoto, setChatPhoto] = React.useState(null);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [logged, setLogged] = React.useState(false);
  const chatFileRef = React.useRef(null);
  const chatEndRef = React.useRef(null);
  const inputRef = React.useRef(null);

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
    if (mode === 'help' && messages.length === 0) {
      const actionLabel = def?.label || task?.label || actionKey;
      sendChat(`I'm about to ${actionLabel.toLowerCase()} my ${plant.name}. Walk me through exactly what to do.${task?.instructions ? ' Here are the basic instructions: ' + task.instructions : ''}`);
    }
  }, [mode]); // eslint-disable-line

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
        messages: [{ role: 'user', content: `I just ${(def?.label || task?.label || actionKey).toLowerCase()}d my ${plant.name}. Here's a photo — did I do it right? One or two sentences.`, images: [dataUrl] }],
        plantContext: buildContext(), action: def?.label || task?.label || actionKey,
        onChunk: chunk => { feedback += chunk; setConfirmFeedback(feedback); },
      });
    } catch { setConfirmFeedback(mobileAffirmation(actionKey)); }
    if (!feedback) setConfirmFeedback(mobileAffirmation(actionKey));
    setConfirmLoading(false);
  }

  function readPhoto(file) { return compressChatImage(file); }

  // ── Fork screen ───────────────────────────────────────────────────────────
  if (!mode) return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', flexDirection:'column',
      background:'rgba(0,0,0,0.55)', WebkitBackdropFilter:'blur(4px)', backdropFilter:'blur(4px)' }}>
      {/* Backdrop tap closes */}
      <div style={{ flex:1 }} onClick={onClose}/>
      {/* Sheet slides up */}
      <div style={{ background:'#faf6ee', borderRadius:'18px 18px 0 0',
        padding:'0 0 calc(24px + env(safe-area-inset-bottom)) 0',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.22)' }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', paddingTop:10, paddingBottom:4 }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'rgba(160,130,80,0.25)' }}/>
        </div>
        <div style={{ padding:'12px 20px 20px' }}>
          <div style={{ fontSize:28, marginBottom:4 }}>{def?.emoji || task?.emoji || '✨'}</div>
          <div style={{ fontSize:20, color:'#2a1808', fontWeight:600, fontFamily:SERIF }}>{def?.label || task?.label || actionKey}</div>
          <div style={{ fontSize:13, color:'#907050', fontFamily:SERIF, marginBottom:24 }}>{plant.name}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <button onClick={() => setMode('help')}
              style={{ display:'flex', alignItems:'center', gap:14,
                background: color + '14', border:`1.5px solid ${color}40`,
                borderRadius:14, padding:'16px 18px', cursor:'pointer', textAlign:'left',
                WebkitTapHighlightColor:'transparent' }}>
              <span style={{ fontSize:28, flexShrink:0 }}>🌿</span>
              <div>
                <div style={{ fontSize:16, color:'#2a1808', fontFamily:SERIF, fontWeight:600, marginBottom:3 }}>
                  Walk me through it
                </div>
                <div style={{ fontSize:13, color:'#907050', fontFamily:SERIF, lineHeight:1.4 }}>
                  Step-by-step guidance. Ask questions, send photos.
                </div>
              </div>
            </button>
            <button onClick={() => setMode('confirm')}
              style={{ display:'flex', alignItems:'center', gap:14,
                background:'rgba(0,0,0,0.03)', border:`1px solid rgba(160,130,80,0.25)`,
                borderRadius:14, padding:'16px 18px', cursor:'pointer', textAlign:'left',
                WebkitTapHighlightColor:'transparent' }}>
              <span style={{ fontSize:28, flexShrink:0 }}>✓</span>
              <div>
                <div style={{ fontSize:16, color:'#2a1808', fontFamily:SERIF, fontWeight:600, marginBottom:3 }}>
                  I already did it
                </div>
                <div style={{ fontSize:13, color:'#907050', fontFamily:SERIF, lineHeight:1.4 }}>
                  Log it now. Add a photo for feedback.
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Confirm mode ──────────────────────────────────────────────────────────
  if (mode === 'confirm') {
    if (confirmed) return (
      <div style={{ position:'fixed', inset:0, zIndex:500, background:'#faf6ee',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        fontFamily:SERIF, padding:32, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✓</div>
        <div style={{ fontSize:20, color:'#2a1808', fontWeight:600, marginBottom:10 }}>{def?.label || task?.label || actionKey} logged</div>
        {confirmFeedback && (
          <div style={{ fontSize:15, color:'#605040', fontStyle:'italic', lineHeight:1.75,
            maxWidth:280, marginBottom:32, fontFamily:SERIF }}>{confirmFeedback}</div>
        )}
        <button onClick={onClose}
          style={{ background:color, border:'none', borderRadius:12, padding:'14px 40px',
            color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:9, letterSpacing:.3 }}>
          DONE
        </button>
      </div>
    );
    return (
      <div style={{ position:'fixed', inset:0, zIndex:500, background:'#faf6ee',
        display:'flex', flexDirection:'column', fontFamily:SERIF }}>
        {/* Header */}
        <div style={{ padding:'16px 18px 12px', paddingTop:'calc(16px + env(safe-area-inset-top))',
          borderBottom:'1px solid rgba(160,130,80,0.18)',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <button onClick={() => setMode(null)} style={{ background:'none', border:'none',
              color:'#b09070', cursor:'pointer', fontSize:15, fontFamily:SERIF, padding:0, marginRight:10 }}>←</button>
            <span style={{ fontSize:15, color:'#2a1808', fontWeight:600 }}>{def?.emoji || task?.emoji || '✨'} {def?.label || task?.label || actionKey}</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:26, lineHeight:1, padding:'0 4px' }}>&times;</button>
        </div>
        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
          <div style={{ fontSize:15, color:'#907050', fontFamily:SERIF, marginBottom:28, textAlign:'center' }}>
            {confirmPhoto ? 'Oracle is looking…' : `Add a photo for feedback, or just log it.`}
          </div>
          {confirmPhoto ? (
            <div style={{ marginBottom:20 }}>
              <img src={confirmPhoto} alt="" style={{ width:'100%', borderRadius:12, marginBottom:14,
                maxHeight:240, objectFit:'cover' }}/>
              {confirmLoading ? (
                <div style={{ fontSize:15, color:'#c0a880', fontStyle:'italic', fontFamily:SERIF, textAlign:'center' }}>
                  Reading the photo…
                </div>
              ) : confirmFeedback ? (
                <div style={{ fontSize:16, color:'#4a2c10', fontStyle:'italic', lineHeight:1.75,
                  fontFamily:SERIF, textAlign:'center', marginBottom:8 }}>{confirmFeedback}</div>
              ) : null}
            </div>
          ) : (
            /* Big camera button */
            <button onClick={() => confirmFileRef.current?.click()}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                width:'100%', height:180, background:color+'10', border:`2px dashed ${color}40`,
                borderRadius:16, cursor:'pointer', gap:12,
                WebkitTapHighlightColor:'transparent' }}>
              <span style={{ fontSize:48 }}>📷</span>
              <div style={{ fontSize:14, color, fontFamily:SERIF, fontWeight:600 }}>Take a photo</div>
              <div style={{ fontSize:12, color:'#907050', fontFamily:SERIF }}>Get feedback from the oracle</div>
            </button>
          )}
          <input ref={confirmFileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={async e => { const f = e.target.files?.[0]; if (f) sendConfirmPhoto(await readPhoto(f)); }}/>
        </div>
        {/* Bottom bar */}
        <div style={{ padding:'12px 20px', paddingBottom:'calc(12px + env(safe-area-inset-bottom))',
          borderTop:'1px solid rgba(160,130,80,0.18)', flexShrink:0,
          display:'flex', flexDirection:'column', gap:10 }}>
          <button
            onClick={() => { onLog(); if (!confirmPhoto) setConfirmFeedback(mobileAffirmation(actionKey)); setConfirmed(true); }}
            disabled={confirmPhoto && !confirmFeedback}
            style={{ background:color, border:'none', borderRadius:12, padding:'16px',
              color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:9, letterSpacing:.3,
              opacity:(confirmPhoto && !confirmFeedback) ? 0.4 : 1 }}>
            ✓ LOG {(def?.label || task?.label || actionKey).toUpperCase()}
          </button>
          {!confirmPhoto && (
            <button onClick={() => { onLog(); setConfirmed(true); setConfirmFeedback(mobileAffirmation(actionKey)); }}
              style={{ background:'none', border:'none', color:'#b09070', cursor:'pointer',
                fontSize:14, fontFamily:SERIF, padding:'4px 0', textAlign:'center' }}>
              Skip photo — log now
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Help / chat mode (full screen, one-handed) ────────────────────────────
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
            color:'#b09070', cursor:'pointer', fontSize:16, padding:'0 8px 0 0',
            WebkitTapHighlightColor:'transparent' }}>←</button>
          <div>
            <span style={{ fontSize:14, color:'#4a2c10', fontWeight:600 }}>{def?.emoji || task?.emoji || '✨'} {def?.label || task?.label || actionKey}</span>
            <span style={{ fontSize:12, color:'#a08060', marginLeft:6, fontStyle:'italic' }}>{plant.name}</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!logged ? (
            <button onClick={() => { onLog(); setLogged(true); }}
              style={{ background:color, border:'none', borderRadius:10, padding:'8px 14px',
                color:'#fff', cursor:'pointer', fontFamily:MONO, fontSize:7, letterSpacing:.3,
                WebkitTapHighlightColor:'transparent' }}>
              ✓ DONE
            </button>
          ) : (
            <span style={{ fontSize:13, color:'#5a9040', fontFamily:SERIF }}>✓ Logged</span>
          )}
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#b09070', cursor:'pointer', fontSize:26, lineHeight:1, padding:'0 4px',
            WebkitTapHighlightColor:'transparent' }}>&times;</button>
        </div>
      </div>

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
            ref={inputRef}
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
          onChange={async e => { const f = e.target.files?.[0]; if (f) setChatPhoto(await readPhoto(f)); }}/>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
        {stages.map((s, i) => {
          const isCurrent = i === currentIdx;
          const isPast = currentIdx >= 0 && i < currentIdx;
          const isFuture = currentIdx < 0 || i > currentIdx;
          return (
            <React.Fragment key={s}>
              {i > 0 && (
                <div style={{
                  flex: 1, height: 1,
                  background: isPast || isCurrent ? `${color}60` : 'rgba(160,130,80,0.20)',
                }}/>
              )}
              <div style={{
                width: isCurrent ? 10 : 6,
                height: isCurrent ? 10 : 6,
                borderRadius: '50%',
                background: isCurrent ? color : isPast ? `${color}50` : 'transparent',
                border: `1.5px solid ${isCurrent ? color : isPast ? `${color}50` : 'rgba(160,130,80,0.30)'}`,
                flexShrink: 0,
                transition: 'all .2s',
              }}/>
            </React.Fragment>
          );
        })}
      </div>
      {currentStage && (
        <div style={{
          fontFamily: SERIF, fontSize: 11, color,
          fontStyle: 'italic', marginTop: 5,
          textAlign: currentIdx >= 0 ? 'left' : 'center',
          paddingLeft: currentIdx > 0 ? `${Math.round((currentIdx / (stages.length - 1)) * 100) - 6}%` : 0,
        }}>
          {currentStage}
        </div>
      )}
    </div>
  );
}

function MobilePlantCard({ plant, careLog, onAction, onStartAction, onPhotoAdded, onPortraitUpdate, onGrowthUpdate, onAddPhoto, photos = [], portraits, briefing, seasonOpen }) {
  const fileRef = useRef(null);
  const color = plantColor(plant.type);
  const lastPhoto = photos[photos.length - 1];
  const portrait = portraits?.[plant.id] || {};
  const analyzing = portrait.analyzing;
  const photoSrc = lastPhoto?.dataUrl || lastPhoto?.url || null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
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
    onAction('note', plant, text);
    setNoteText('');
    setNoteOpen(false);
  }

  const waterStatus = actionStatus(plant, 'water', careLog, seasonOpen);
  // All oracle-recommended tasks that are currently actionable (no cap)
  const oracleTasks = (briefing?.tasks || [])
    .filter(t => t.key !== 'water')
    .filter(t => t.key === 'custom' || !ACTION_DEFS[t.key] || actionStatus(plant, t.key, careLog, seasonOpen).available);
  // Fall back to Visit when oracle hasn't loaded or recommends nothing
  const showVisit = !briefing || oracleTasks.length === 0;

  if (plant.health === 'memorial' || plant.type === 'empty-pot') return null;

  return (
    <div style={{
      background: C.cardBg, borderRadius: 12,
      border: `1px solid ${C.cardBorder}`,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Photo strip — tap to add */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          height: 160,
          background: lastPhoto ? 'transparent' : `${color}08`,
          cursor: 'pointer', position: 'relative', overflow: 'hidden',
          border: (!lastPhoto && !seasonOpen) ? '2px solid rgba(212,168,48,0.40)' : 'none',
          boxSizing: 'border-box',
        }}>
        {photoSrc && !photoFailed ? (
          <img src={photoSrc} alt={plant.name}
            onError={() => setPhotoFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <PlantPortrait plant={plant} aiSvg={portrait?.svg}/>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(4,2,1,0.30)',
            }}/>
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
        {/* Camera overlay button */}
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
              <div style={{ fontSize: 12, color: '#907050', fontFamily: SERIF }}>{plant.subtitle}</div>
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
              flex: '1 1 56px', padding: '10px 8px',
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
            const label = (t.label || def?.label || t.key).toUpperCase().slice(0, 9);
            return (
              <button key={`${t.key}:${t.label}`}
                onClick={() => {
                  if (t.key === 'custom' || t.optional) {
                    onStartAction ? onStartAction(plant, t.key, t) : onAction(t.key, plant, t.label);
                  } else {
                    onStartAction ? onStartAction(plant, t.key) : onAction(t.key, plant);
                  }
                }}
                style={{
                  flex: '1 1 56px', padding: '10px 8px',
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
                flex: '1 1 56px', padding: '10px 8px',
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
              flex: '1 1 56px', padding: '10px 8px',
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
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
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
                borderRadius: 8, fontFamily: SERIF, fontSize: 14,
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
              <div style={{ fontFamily: MONO, fontSize: 6, color: '#b09070', letterSpacing: .5, marginBottom: 6 }}>
                CARE HISTORY
              </div>
              {entries.map((e, i) => {
                const d = new Date(e.date);
                const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '4px 0',
                    borderBottom: i < entries.length - 1 ? '1px solid rgba(160,130,80,0.07)' : 'none',
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{e.emoji || '·'}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 12, color: '#5a3c18', flex: 1 }}>{e.label}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 11, color: '#b09070', flexShrink: 0 }}>{when}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Last photo date if exists */}
        {lastPhoto && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#b09070', fontFamily: SERIF, fontStyle: 'italic' }}>
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
  briefing, seasonOpen, portraits,
}) {
  const color = plantColor(plant.type);
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
          <div style={{ fontFamily: SERIF, fontSize: 11, color: '#907050', marginTop: 2 }}>
            {currentStage
              ? <span style={{ color, fontStyle: 'italic' }}>{currentStage}</span>
              : <span style={{ color: healthColor(plant.health) }}>{healthLabel(plant.health)}</span>
            }
            <span style={{ color: '#c0a080' }}> · 💧 {waterLabel}</span>
          </div>
        </div>

        {/* 📷 quick access — tapping expands to show full card with photo strip */}
        <div
          onClick={e => { e.stopPropagation(); onToggle(plant.id); }}
          style={{
            padding: '6px 9px', borderRadius: 8,
            border: '1px solid rgba(160,130,80,0.22)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            background: 'rgba(255,255,255,0.5)', flexShrink: 0,
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
            seasonOpen={seasonOpen}
          />
        </div>
      )}
    </div>
  );
}

function GardenAccordion({
  plants, frontPlants, careLog, onAction, onStartAction,
  onPortraitUpdate, onGrowthUpdate, onAddPhoto, allPhotos,
  portraits, briefings, seasonOpen, frozenAgendaItems,
}) {
  const attentionIds = useMemo(
    () => new Set((frozenAgendaItems || []).map(i => i.plantId)),
    [frozenAgendaItems]
  );

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

  function toggleGroup(type) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }
  function togglePlant(id) { setExpandedId(prev => prev === id ? null : id); }

  function lastWatered(plantId) {
    const entries = (careLog[plantId] || []).filter(e => e.action === 'water');
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
    // Stage: show if consistent, or first available
    const stages = [...new Set(groupPlants.map(p => portraits?.[p.id]?.currentStage).filter(Boolean))];
    // Attention actions for this group
    const activeItems = (frozenAgendaItems || []).filter(i => groupPlants.some(p => p.id === i.plantId));
    const actionEmojis = [...new Set(activeItems.map(i => ACTION_DEFS[i.actionKey]?.emoji).filter(Boolean))].join('');
    // Visual note — only for single-plant groups with no stage
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

  function renderSection(list, title, titleColor) {
    if (!list.length) return null;

    // Group by type, sort groups: attention first then alpha
    // Trees (evergreen, maple, serviceberry) merge into a single 'tree' group
    const groupMap = new Map();
    for (const p of list) {
      const key = toGroupType(p.type);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(p);
    }
    const sortedGroups = [...groupMap.entries()].sort(([tA, pA], [tB, pB]) => {
      const diff = (pA.some(p => attentionIds.has(p.id)) ? 0 : 1) - (pB.some(p => attentionIds.has(p.id)) ? 0 : 1);
      return diff !== 0 ? diff : tA.localeCompare(tB);
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
            const d = (attentionIds.has(a.id) ? 0 : 1) - (attentionIds.has(b.id) ? 0 : 1);
            return d !== 0 ? d : a.name.localeCompare(b.name);
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
    <div style={{ padding: '16px 16px 32px' }}>
      {renderSection(plants, 'TERRACE', C.uiGold)}
      {frontPlants.length > 0 && renderSection(frontPlants, '🌹 EMMA\'S ROSE GARDEN', '#e84070')}
    </div>
  );
}

// ── AGENDA ─────────────────────────────────────────────────────────────────
const AGENDA_SKIP_ACTIONS = new Set(['photo', 'visit', 'note', 'plant']);
const AGENDA_URGENT_HEALTH = new Set(['struggling', 'thirsty', 'overlooked']);
const AGENDA_TIER = { urgent: 0, recommended: 1, routine: 2, optional: 3 };
const AGENDA_HEALTH_SEV = { struggling: 0, thirsty: 1, overlooked: 2 };

function computeAgenda({ plants, frontPlants, careLog, briefings, weather, seasonOpen }) {
  if (!seasonOpen) return { items: [], isWeekend: false };
  const isWeekend = [0, 6].includes(new Date().getDay());
  const emmaPlantsSet = new Set(frontPlants.map(p => p.id));
  const hasRainSoon = weather?.forecast?.slice(0, 2).some(d => d.precipChance >= 60);
  const hasFrostSoon = weather?.forecast?.slice(0, 2).some(d => d.low <= 35);
  const items = [];

  for (const plant of [...plants, ...frontPlants]) {
    if (plant.type === 'empty-pot' || plant.health === 'memorial') continue;
    const brief = briefings[plant.id];
    const briefTasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
    const briefTaskKeys = new Set(briefTasks.map(t => t.key));
    const isUrgent = AGENDA_URGENT_HEALTH.has(plant.health);
    const section = emmaPlantsSet.has(plant.id) ? 'emma' : 'terrace';

    // AI-recommended tasks (may include novel/custom tasks not in plant.actions)
    for (const task of briefTasks) {
      if (AGENDA_SKIP_ACTIONS.has(task.key)) continue;
      if (task.key !== 'custom' && !actionStatus(plant, task.key, careLog, seasonOpen).available) continue;
      if (task.key === 'water' && hasRainSoon && !isUrgent) continue;
      if (task.key === 'neem' && hasRainSoon) continue;

      const isTaskOptional = task.optional === true;
      const priority = isTaskOptional ? 'optional' : isUrgent ? 'urgent' : hasFrostSoon ? 'urgent' : 'recommended';
      if (!isWeekend && priority === 'routine') continue;

      items.push({
        key: task.key === 'custom' ? `${plant.id}:custom:${task.label || ''}` : `${plant.id}:${task.key}`,
        plant, plantId: plant.id, plantName: plant.name,
        plantType: plant.type, plantHealth: plant.health,
        actionKey: task.key, task,
        priority,
        reason: task.reason || brief?.note || null,
        section,
      });
    }

    // Urgency-driven items from plant.actions not already covered by AI tasks
    if (isUrgent) {
      for (const actionKey of (plant.actions || [])) {
        if (AGENDA_SKIP_ACTIONS.has(actionKey)) continue;
        if (briefTaskKeys.has(actionKey)) continue;
        if (!actionStatus(plant, actionKey, careLog, seasonOpen).available) continue;
        if (actionKey === 'water' && hasRainSoon) continue;
        if (actionKey === 'neem' && hasRainSoon) continue;

        items.push({
          key: `${plant.id}:${actionKey}`,
          plant, plantId: plant.id, plantName: plant.name,
          plantType: plant.type, plantHealth: plant.health,
          actionKey, task: null,
          priority: 'urgent',
          reason: brief?.note || null,
          section,
        });
      }
    }

    // When briefing hasn't loaded yet, fall back to plant.actions for routine items
    if (!brief) {
      for (const actionKey of (plant.actions || [])) {
        if (AGENDA_SKIP_ACTIONS.has(actionKey)) continue;
        if (!actionStatus(plant, actionKey, careLog, seasonOpen).available) continue;
        if (actionKey === 'water' && hasRainSoon && !isUrgent) continue;
        if (actionKey === 'neem' && hasRainSoon) continue;

        const priority = isUrgent ? 'urgent' : hasFrostSoon ? 'recommended' : 'routine';
        if (!isWeekend && priority === 'routine') continue;

        items.push({
          key: `${plant.id}:${actionKey}`,
          plant, plantId: plant.id, plantName: plant.name,
          plantType: plant.type, plantHealth: plant.health,
          actionKey, task: null,
          priority,
          reason: null,
          section,
        });
      }
    }
  }

  items.sort((a, b) => {
    const td = AGENDA_TIER[a.priority] - AGENDA_TIER[b.priority];
    if (td !== 0) return td;
    return (AGENDA_HEALTH_SEV[a.plantHealth] ?? 3) - (AGENDA_HEALTH_SEV[b.plantHealth] ?? 3);
  });

  return { items, isWeekend };
}

function AgendaRow({ item, completed, onTap, onDone, portrait }) {
  const def = ACTION_DEFS[item.actionKey];
  const rowEmoji = def?.emoji || item.task?.emoji || '✨';
  const rowLabel = def?.label || item.task?.label || item.actionKey;
  const isOptional = item.task?.optional === true || item.actionKey === 'custom';
  const tierColors = {
    urgent:      { border: 'rgba(200,80,30,0.35)', bg: 'rgba(200,80,30,0.06)', accent: '#b84018', dot: '#c85020' },
    recommended: { border: 'rgba(72,120,32,0.28)', bg: 'rgba(72,120,32,0.05)', accent: '#3a6818', dot: '#487820' },
    routine:     { border: 'rgba(160,130,80,0.22)', bg: 'rgba(250,246,238,0.9)', accent: '#7a5c30', dot: '#907050' },
    optional:    { border: 'rgba(80,120,80,0.22)', bg: 'rgba(80,120,80,0.04)', accent: '#507050', dot: '#608060' },
  }[isOptional ? 'optional' : item.priority];

  return (
    <div
      onClick={() => !completed && onTap(item)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 11,
        padding: '11px 13px', borderRadius: 10, marginBottom: 9,
        border: `1.5px solid ${tierColors.border}`,
        background: completed ? 'rgba(160,130,80,0.04)' : tierColors.bg,
        opacity: completed ? 0.45 : 1,
        cursor: completed ? 'default' : 'pointer',
        transition: 'opacity .2s',
      }}
    >
      {/* Priority dot */}
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: completed ? '#c0b090' : tierColors.dot,
        marginTop: 6, flexShrink: 0,
      }}/>

      {/* Portrait */}
      {portrait?.svg && (
        <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 6, overflow: 'hidden',
          border: '1px solid rgba(160,130,80,0.18)', background: '#f8f0e0' }}>
          <PlantPortrait plant={item.plant} aiSvg={portrait.svg}/>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 6.5, color: completed ? '#b0a080' : tierColors.accent,
            letterSpacing: .4, textDecoration: completed ? 'line-through' : 'none' }}>
            {item.plantName.toUpperCase()}
          </span>
          {isOptional && !completed && (
            <span style={{ fontFamily: MONO, fontSize: 5.5, color: '#507050', border: '1px solid rgba(80,120,80,0.30)', borderRadius: 6, padding: '1px 5px' }}>EXPLORE</span>
          )}
          <span style={{ fontSize: 13 }}>{rowEmoji}</span>
          <span style={{ fontFamily: SERIF, fontSize: 12, color: completed ? '#b0a080' : tierColors.accent }}>
            {rowLabel}
          </span>
        </div>
        {item.reason && !completed && (
          <div style={{ fontSize: 12, color: '#6a4020', fontStyle: 'italic', lineHeight: 1.45 }}>
            {item.reason}
          </div>
        )}
      </div>

      {/* Done button */}
      {!completed && (
        <button
          onClick={e => { e.stopPropagation(); onDone(item); }}
          style={{
            background: 'none', border: '1px solid rgba(160,130,80,0.32)',
            borderRadius: 6, padding: '5px 10px', color: '#907050',
            fontSize: 11, fontFamily: SERIF, cursor: 'pointer', flexShrink: 0, marginTop: 1,
          }}
        >
          Done
        </button>
      )}
    </div>
  );
}

function TodayAgenda({ rawItems = [], isWeekend = false, agendaData = null, seasonOpen,
  totalActivePlants = 0, morningBrief, fullBrief, onStartAction, portraits, completedThisSession = new Set(),
  doneTodayItems = [], onMarkDone, onOpenAsk }) {
  const [briefExpanded, setBriefExpanded] = React.useState(false);
  const essentialsDoneLatchRef = React.useRef(false);

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
  const urgentRec = pendingNotDone.filter(i => i.priority !== 'routine');
  const routineItems = pendingNotDone.filter(i => i.priority === 'routine');
  const doneCount = items.filter(isCompleted).length;
  const totalCount = items.length;
  const allDone = totalCount > 0 && doneCount === totalCount;
  // Latch the "essential tasks done" banner once it first becomes true — don't let briefing
  // reloads or new tasks arriving flip it back off mid-session.
  const essentialsDoneNow = urgentRec.length === 0 && doneTodayItems.length > 0 && routineItems.length > 0;
  if (essentialsDoneNow) essentialsDoneLatchRef.current = true;
  const urgentRecAllDone = essentialsDoneLatchRef.current && !allDone;
  const hasRemainingRoutine = routineItems.length > 0;

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
        }}>
          Anything I missed? →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 14px 24px' }}>

      {/* Progress header */}
      {totalCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, letterSpacing: .5 }}>
              {isWeekend ? 'WEEKEND SESSION' : 'TODAY\'S ROUNDS'}
              {agendaData?.sessionMinutes ? ` · ~${agendaData.sessionMinutes} MIN` : ''}
            </span>
            <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: '#2a1808' }}>
              {doneCount} <span style={{ fontSize: 14, fontWeight: 400, color: '#907050' }}>of {totalCount}</span>
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(160,130,80,0.15)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: doneCount === 0 ? 'transparent' : 'linear-gradient(90deg, #d4a830, #a07828)',
              width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
              transition: 'width .4s ease',
            }}/>
          </div>
        </div>
      )}

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

      {/* Essential tasks done — routine tasks still available */}
      {urgentRecAllDone && hasRemainingRoutine && (
        <div style={{ background: 'rgba(72,120,32,0.07)', border: '1px solid rgba(72,120,32,0.22)',
          borderRadius: 9, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>✦</span>
          <div style={{ fontFamily: SERIF, fontSize: 13, color: '#3a6818', fontStyle: 'italic', lineHeight: 1.4 }}>
            Essential tasks done. Optional tasks below.
          </div>
        </div>
      )}

      {/* Agenda items */}
      {items.length === 0 ? (
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
      ) : (
        items.map(item => (
          <AgendaRow
            key={item.key}
            item={item}
            completed={isCompleted(item)}
            onTap={i => onStartAction(i.plant, i.actionKey, i.task)}
            onDone={onMarkDone}
            portrait={portraits[item.plantId]}
          />
        ))
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
      ensure(e.date.slice(0, 10)).careEntries.push({
        plantId, plantName: plant.name, label: e.label, action: e.action, withEmma: !!e.withEmma,
      });
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

function MobileJournalDay({ dateStr, careEntries, portraitObservations, photos, allPlants, careLog }) {
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(true);

  const versionKey = `${careEntries.length}_${portraitObservations.map(o => (o.visualNote || '').slice(0, 6)).join('')}`;

  React.useEffect(() => {
    setLoading(true);
    setNarrative(null);
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
      .then(text => { setNarrative(text); setLoading(false); })
      .catch(() => setLoading(false));
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

      {loading ? (
        <div style={{ fontFamily: SERIF, fontSize: 13, color: 'rgba(160,130,80,0.3)', fontStyle: 'italic', lineHeight: 1.7 }}>…</div>
      ) : narrative ? (
        <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.8, color: '#3a2010', margin: '0 0 10px' }}>
          {narrative}
        </p>
      ) : null}

      {careEntries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: narrative ? 10 : 4 }}>
          {careEntries.map((e, i) => (
            <span key={i} style={{
              fontSize: 9, fontFamily: MONO,
              background: e.withEmma ? 'rgba(232,64,112,0.06)' : 'rgba(160,130,80,0.07)',
              border: `1px solid ${e.withEmma ? 'rgba(232,64,112,0.18)' : 'rgba(160,130,80,0.15)'}`,
              borderRadius: 10, padding: '2px 7px',
              color: e.withEmma ? '#c04060' : '#907050',
            }}>
              {e.plantName} · {e.label}
            </span>
          ))}
        </div>
      )}

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
            fontFamily:SERIF,fontSize:18,cursor:'pointer'}}>
          🌿 Tucker
        </button>
        <button onClick={() => setWho('emma')}
          style={{width:'100%',maxWidth:280,padding:'16px',background:'rgba(232,64,112,0.10)',
            border:'1px solid rgba(232,64,112,0.25)',borderRadius:10,color:C.uiText,
            fontFamily:SERIF,fontSize:18,cursor:'pointer'}}>
          🌹 Emma
        </button>
        <button onClick={close}
          style={{background:'none',border:'none',color:C.uiMuted,fontFamily:SERIF,fontSize:14,cursor:'pointer',marginTop:8}}>
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
            borderRadius:7,cursor:'pointer',fontFamily:MONO,fontSize:7,color:'#2a1808'}}>
          {showForm?'CANCEL':'+ LOG'}
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div style={{background:'rgba(160,130,80,0.06)',borderRadius:10,padding:'14px',display:'flex',flexDirection:'column',gap:11,border:'1px solid rgba(160,130,80,0.18)'}}>
          <input value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}
            placeholder="What did you buy?" onKeyDown={e=>{if(e.key==='Enter')submit();}}
            style={{background:'#fff',border:'1px solid rgba(160,130,80,0.30)',borderRadius:6,
              padding:'9px 12px',color:'#2a1808',fontSize:14,fontFamily:SERIF,outline:'none'}}/>
          <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}
            placeholder="Amount ($)" step=".01"
            style={{background:'#fff',border:'1px solid rgba(160,130,80,0.30)',borderRadius:6,
              padding:'9px 12px',color:'#2a1808',fontSize:14,fontFamily:SERIF,outline:'none'}}/>
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
}) {
  const [tab, setTab] = useState('today');
  const [flash, setFlash] = useState(null);
  const [actionSession, setActionSession] = useState(null); // { plant, actionKey } | null
  const [briefings, setBriefings] = useState({});
  const [agendaData, setAgendaData] = useState(null); // { sessionMinutes, tasks }
  const [morningBrief, setMorningBrief] = useState(null);
  const [dailyBrief, setDailyBrief] = useState(null); // structured: { weather, garden, today, watch }
  const [analysisNotice, setAnalysisNotice] = useState(null);
  const prevAnalyzingRef = useRef({});
  const completedKeysRef = useRef(new Set());
  const [completedCount, setCompletedCount] = useState(0); // triggers re-render when item is marked done

  function handleMarkDone(item) {
    completedKeysRef.current.add(item.key);
    setCompletedCount(n => n + 1);
    handleAction(item.actionKey, item.plant, item.actionKey === 'custom' ? item.task?.label : undefined);
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
    [...plants, ...frontPlants]
      .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
      .forEach((p, i) => {
        setTimeout(() => {
          fetchPlantBriefing(p, careLog, weather, portraits)
            .then(b => setBriefings(prev => ({ ...prev, [p.id]: b })))
            .catch(() => {});
        }, i * 600); // stagger 600ms — avoids Anthropic rate limits
      });
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

  // Compute today's agenda deterministically (instant, no API needed)
  const { items: rawAgendaItems, isWeekend: agendaIsWeekend } = useMemo(
    () => computeAgenda({ plants, frontPlants, careLog, briefings: mergedBriefings, weather, seasonOpen }),
    [plants, frontPlants, careLog, mergedBriefings, weather, seasonOpen]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const allPlantsFlat = useMemo(() => [...plants, ...frontPlants], [plants, frontPlants]);

  // Tasks completed today from careLog — persists across page reloads.
  // Grows as care is logged; complements rawAgendaItems (which shrinks as tasks are done).
  const doneTodayItems = useMemo(() => {
    const skipActions = new Set(['note', 'photo', 'visit']);
    const seen = new Set();
    const result = [];
    for (const [plantId, entries] of Object.entries(careLog)) {
      for (const entry of entries) {
        if (!entry.date?.startsWith(todayStr)) continue;
        if (skipActions.has(entry.action)) continue;
        const key = entry.action === 'custom'
          ? `${plantId}:custom:${entry.label || ''}`
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

  // Fetch AI-enriched agenda once per day (busts on care or weather changes)
  const rawAgendaKeys = rawAgendaItems.map(i => i.key).join(',');
  useEffect(() => {
    if (!weather || !seasonOpen || !rawAgendaItems.length) return;
    fetchDailyAgenda({ candidateTasks: rawAgendaItems, weather, careLog, portraits })
      .then(data => setAgendaData(data))
      .catch(() => {}); // fallback: rawAgendaItems shown with no AI reasons
  }, [rawAgendaKeys, weather]); // intentional: stable string dep

  // Fetch morning brief once weather is available
  useEffect(() => {
    if (!weather || morningBrief) return;
    fetchMorningBrief({ plants: [...plants, ...frontPlants], careLog, weather, portraits })
      .then(brief => { if (brief) setMorningBrief(brief); })
      .catch(() => {});
  }, [weather]); // intentional: fetch once per weather load

  // Fetch structured daily brief (weather/garden/today/watch) — for expanded view
  useEffect(() => {
    if (!weather || dailyBrief) return;
    fetchDailyBrief({
      plants: [...plants, ...frontPlants], careLog, weather, portraits,
      agendaTasks: rawAgendaItems,
    })
      .then(brief => { if (brief) setDailyBrief(brief); })
      .catch(() => {});
  }, [weather]); // intentional: fetch once per weather load

  // Watch portraits for analysis completion → show notification
  useEffect(() => {
    const prev = prevAnalyzingRef.current;
    const allPlants = [...plants, ...frontPlants];
    for (const [id, portrait] of Object.entries(portraits)) {
      if (prev[id]?.analyzing && !portrait.analyzing) {
        const plant = allPlants.find(p => p.id === id);
        if (plant) {
          setAnalysisNotice(`${plant.name} portrait updated`);
          setTimeout(() => setAnalysisNotice(null), 4000);
        }
      }
    }
    prevAnalyzingRef.current = Object.fromEntries(
      Object.entries(portraits).map(([id, p]) => [id, { analyzing: !!p.analyzing }])
    );
  }, [portraits]); // intentional: only track portrait analyzing transitions

  function handleAction(key, plant, customLabel) {
    onAction(key, plant, customLabel);
    const def = ACTION_DEFS[key];
    const displayLabel = customLabel || def?.label || key;
    const emoji = def?.emoji || '✨';
    setFlash(`${emoji} ${displayLabel}`);
    setTimeout(() => setFlash(null), 2000);
  }

  function handleStartAction(plant, key, task = null) {
    setActionSession({ plant, key, task });
  }

  const TABS = [
    { id: 'today',   label: '✦',  title: 'Today'   },
    { id: 'garden',  label: '🌿', title: 'Garden'  },
    { id: 'ask',     label: '🌸', title: 'Ask'     },
    { id: 'journal', label: '📖', title: 'Journal' },
    { id: 'spend',   label: '💰', title: 'Spend'   },
  ];

  return (
    <div style={{
      width: '100vw', height: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: C.appBg, fontFamily: SERIF,
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        height: 52, background: C.uiPane,
        borderBottom: `2px solid ${C.uiBorder}`,
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.uiGold, letterSpacing: .5 }}>
          GARDEN PARTY
        </span>
        <div style={{ flex: 1 }}/>
        {/* Front garden nav */}
        {onGoFront && (
          <button onClick={onGoFront}
            style={{background:'none',border:'none',fontSize:16,cursor:'pointer',padding:'4px 6px',lineHeight:1}}
            title="Emma's Rose Garden">
            🌹
          </button>
        )}
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
      <div style={{ flex: 1, overflowY: tab !== 'ask' ? 'auto' : 'hidden', position: 'relative' }}>
        {tab === 'today' && (
          <TodayAgenda
            rawItems={rawAgendaItems} isWeekend={agendaIsWeekend}
            agendaData={agendaData} seasonOpen={seasonOpen}
            totalActivePlants={totalActivePlants}
            morningBrief={morningBrief} fullBrief={dailyBrief}
            onStartAction={handleStartAction}
            portraits={portraits} completedThisSession={completedKeysRef.current}
            doneTodayItems={doneTodayItems}
            onMarkDone={handleMarkDone}
            onOpenAsk={() => setTab('ask')}
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
