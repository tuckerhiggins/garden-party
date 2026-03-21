// Mobile view — optimized for use while actually in the garden
// Hero features: photo upload, quick care, oracle chat
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { OracleChat } from './OracleChat';
import { ACTION_DEFS } from '../data/plants';
import { PlantPortrait } from '../PlantPortraits';
import { fetchPlantBriefing, fetchMorningBrief, fetchDailyAgenda, streamGardenChat } from '../claude';
import { compressChatImage } from '../utils/compressChatImage';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO = '"Press Start 2P", monospace';

const C = {
  appBg: '#f2ece0', cardBg: '#faf6ee', cardBorder: 'rgba(160,130,80,0.18)',
  uiBg: '#120c06', uiPane: '#1c1008', uiBorder: '#5a3c18',
  uiText: '#f0e4cc', uiMuted: '#a89070', uiGold: '#d4a830',
};

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

function MobileActionSheet({ plant, actionKey, careLog, portraits, weather, onLog, onClose }) {
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
      sendChat(`I'm about to ${def.label.toLowerCase()} my ${plant.name}. Walk me through exactly what to do.`);
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
          <div style={{ fontSize:28, marginBottom:4 }}>{def.emoji}</div>
          <div style={{ fontSize:20, color:'#2a1808', fontWeight:600, fontFamily:SERIF }}>{def.label}</div>
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
        <div style={{ fontSize:20, color:'#2a1808', fontWeight:600, marginBottom:10 }}>{def.label} logged</div>
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
            <span style={{ fontSize:15, color:'#2a1808', fontWeight:600 }}>{def.emoji} {def.label}</span>
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
            ✓ LOG {def.label.toUpperCase()}
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
            <span style={{ fontSize:14, color:'#4a2c10', fontWeight:600 }}>{def.emoji} {def.label}</span>
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
        .catch(() => { clearTimeout(timeout); onPortraitUpdate?.(plant.id, { analyzing: false }); });
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
  // Oracle-recommended actions, filtered through cooldown check
  const oracleActions = (briefing?.actions || [])
    .filter(a => ACTION_DEFS[a])
    .filter(a => actionStatus(plant, a, careLog, seasonOpen).available)
    .slice(0, 2);
  // Fall back to Visit when oracle hasn't loaded or recommends nothing
  const showVisit = !briefing || oracleActions.length === 0;

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

        {/* Quick action row */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Water — always shown */}
          <button
            onClick={() => waterStatus.available && onAction('water', plant)}
            disabled={!waterStatus.available}
            style={{
              flex: 1, padding: '10px 8px',
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

          {/* Oracle-recommended actions */}
          {oracleActions.map(a => {
            const def = ACTION_DEFS[a];
            return (
              <button key={a} onClick={() => onStartAction ? onStartAction(plant, a) : onAction(a, plant)}
                style={{
                  flex: 1, padding: '10px 8px',
                  background: `${color}10`,
                  border: `1px solid ${color}40`,
                  borderRadius: 8, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                }}>
                <span style={{ fontSize: 18 }}>{def.emoji}</span>
                <span style={{ fontFamily: MONO, fontSize: 6, color }}>
                  {def.label.toUpperCase().slice(0, 8)}
                </span>
              </button>
            );
          })}

          {/* Visit — shown while oracle loads or when nothing is recommended */}
          {showVisit && (
            <button
              onClick={() => onAction('visit', plant)}
              style={{
                flex: 1, padding: '10px 8px',
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
              flex: 1, padding: '10px 8px',
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

// ── AGENDA ─────────────────────────────────────────────────────────────────
const AGENDA_SKIP_ACTIONS = new Set(['photo', 'visit', 'note', 'plant']);
const AGENDA_URGENT_HEALTH = new Set(['struggling', 'thirsty', 'overlooked']);
const AGENDA_TIER = { urgent: 0, recommended: 1, routine: 2 };
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
    const oracleActions = brief?.actions || [];

    for (const actionKey of (plant.actions || [])) {
      if (AGENDA_SKIP_ACTIONS.has(actionKey)) continue;
      if (!actionStatus(plant, actionKey, careLog, seasonOpen).available) continue;

      // Skip watering if rain expected and plant not in distress
      if (actionKey === 'water' && hasRainSoon && !AGENDA_URGENT_HEALTH.has(plant.health)) continue;

      let priority;
      if (AGENDA_URGENT_HEALTH.has(plant.health)) {
        priority = 'urgent';
      } else if (oracleActions.includes(actionKey)) {
        priority = hasFrostSoon ? 'urgent' : 'recommended';
      } else {
        priority = hasFrostSoon ? 'recommended' : 'routine';
      }

      // Weekday: only urgent + recommended
      if (!isWeekend && priority === 'routine') continue;

      items.push({
        key: `${plant.id}:${actionKey}`,
        plant,
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        plantHealth: plant.health,
        actionKey,
        priority,
        reason: brief?.note || null,
        section: emmaPlantsSet.has(plant.id) ? 'emma' : 'terrace',
      });
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
  const tierColors = {
    urgent:      { border: 'rgba(200,80,30,0.35)', bg: 'rgba(200,80,30,0.06)', accent: '#b84018', dot: '#c85020' },
    recommended: { border: 'rgba(72,120,32,0.28)', bg: 'rgba(72,120,32,0.05)', accent: '#3a6818', dot: '#487820' },
    routine:     { border: 'rgba(160,130,80,0.22)', bg: 'rgba(250,246,238,0.9)', accent: '#7a5c30', dot: '#907050' },
  }[item.priority];

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
          <span style={{ fontSize: 13 }}>{def?.emoji}</span>
          <span style={{ fontFamily: SERIF, fontSize: 12, color: completed ? '#b0a080' : tierColors.accent }}>
            {def?.label}
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
  morningBrief, onStartAction, portraits, completedThisSession, onMarkDone, onOpenAsk }) {

  // Merge deterministic items with AI-enriched agenda (reason + priority + order)
  const items = useMemo(() => {
    const apiTasks = agendaData?.tasks;
    if (!apiTasks?.length) return rawItems;
    // Build map from raw items for fast lookup
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
    // Append items the API didn't cover (safety net)
    for (const raw of rawItems) {
      if (!covered.has(raw.key)) ordered.push(raw);
    }
    return ordered;
  }, [rawItems, agendaData]);

  const urgentRec = items.filter(i => i.priority !== 'routine');
  const routineItems = items.filter(i => i.priority === 'routine');
  const doneCount = items.filter(i => completedThisSession.has(i.key)).length;
  const totalCount = items.length;
  const allDone = totalCount > 0 && doneCount === totalCount;
  const urgentRecAllDone = urgentRec.length > 0 && urgentRec.every(i => completedThisSession.has(i.key));
  const hasRemainingRoutine = routineItems.some(i => !completedThisSession.has(i.key));

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

      {/* Morning brief */}
      {morningBrief && (
        <div style={{ background: 'rgba(212,168,48,0.07)', border: '1px solid rgba(212,168,48,0.18)',
          borderRadius: 9, padding: '10px 13px', marginBottom: 16 }}>
          <div style={{ fontFamily: SERIF, fontSize: 13, color: '#5a3c18', fontStyle: 'italic', lineHeight: 1.5 }}>
            {morningBrief}
          </div>
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
            completed={completedThisSession.has(item.key)}
            onTap={i => onStartAction(i.plant, i.actionKey)}
            onDone={onMarkDone}
            portrait={portraits[item.plantId]}
          />
        ))
      )}

      {/* Resting plants count */}
      {(() => {
        const allActive = [...plants, ...frontPlants].filter(p => p.type !== 'empty-pot' && p.health !== 'memorial');
        const activePlantIds = new Set(items.map(i => i.plantId));
        const restingCount = allActive.filter(p => !activePlantIds.has(p.id)).length;
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
function MobileJournal({ plants, frontPlants = [], careLog, portraits = {} }) {
  const allPlants = [...plants, ...frontPlants];
  const allEntries = [];

  // Care log entries
  Object.entries(careLog).forEach(([id, entries]) => {
    const plant = allPlants.find(p => p.id === id);
    if (plant) entries.forEach(e => allEntries.push({ ...e, plant, entryType: e.action === 'note' ? 'note' : 'care' }));
  });

  // Portrait observation entries (from AI analysis)
  allPlants.forEach(p => {
    const portrait = portraits[p.id];
    if (!portrait?.visualNote || !portrait?.date) return;
    allEntries.push({
      entryType: 'observation',
      plant: p,
      label: portrait.visualNote,
      date: portrait.date,
      emoji: '🔍',
      earned: 0,
    });
    // Also include history observations
    (portrait.history || []).forEach(h => {
      if (h.visualNote && h.date) {
        allEntries.push({
          entryType: 'observation',
          plant: p,
          label: h.visualNote,
          date: h.date,
          emoji: '🔍',
          earned: 0,
        });
      }
    });
  });

  allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
  // Deduplicate by plant + date + label
  const seen = new Set();
  const deduped = allEntries.filter(e => {
    const key = `${e.plant.id}|${e.date}|${e.label}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  if (deduped.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: '#907050', fontStyle: 'italic' }}>
          No care logged yet this season.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
        SEASON 2 LOG
      </div>
      {deduped.slice(0, 60).map((e, i) => {
        const color = plantColor(e.plant.type);
        const isObservation = e.entryType === 'observation';
        const isNote = e.entryType === 'note';
        return (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '10px 0',
            borderBottom: '1px solid rgba(160,130,80,0.12)',
            alignItems: 'flex-start',
            opacity: isObservation ? 0.85 : 1,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{e.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: isObservation ? 12 : 14,
                color: isNote ? '#5a3c18' : isObservation ? '#7a5c3c' : '#2a1808',
                fontFamily: SERIF,
                fontStyle: isObservation ? 'italic' : 'normal',
                lineHeight: 1.4,
              }}>
                {e.label}
              </div>
              <div style={{ fontSize: 12, color, fontFamily: SERIF }}>{e.plant.name}</div>
              {e.withEmma && <div style={{ fontSize: 11, color: '#a07030', fontFamily: SERIF }}>with Emma ♥</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: '#b09070', fontFamily: SERIF }}>{fmtDate(e.date)}</div>
              </div>
          </div>
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
export function MobileView({
  plants, frontPlants = [], careLog, weather,
  onAction, onPortraitUpdate, onGrowthUpdate, allPhotos = {}, onAddPhoto,
  portraits = {}, role, signIn, signOut, seasonOpen, onGoFront,
}) {
  const [tab, setTab] = useState('today');
  const [flash, setFlash] = useState(null);
  const [actionSession, setActionSession] = useState(null); // { plant, actionKey } | null
  const [briefings, setBriefings] = useState({});
  const [agendaData, setAgendaData] = useState(null); // { sessionMinutes, tasks }
  const [morningBrief, setMorningBrief] = useState(null);
  const [analysisNotice, setAnalysisNotice] = useState(null);
  const prevAnalyzingRef = useRef({});
  const [completedThisSession, setCompletedThisSession] = useState(() => new Set());

  function handleMarkDone(item) {
    setCompletedThisSession(prev => new Set([...prev, item.key]));
    handleAction(item.actionKey, item.plant);
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
      .forEach(p => {
        fetchPlantBriefing(p, careLog, weather, portraits)
          .then(b => setBriefings(prev => ({ ...prev, [p.id]: b })))
          .catch(() => {});
      });
  }, [careVersion, weather]); // intentional: portraits/careLog refs change too often

  // Compute today's agenda deterministically (instant, no API needed)
  const { items: rawAgendaItems, isWeekend: agendaIsWeekend } = useMemo(
    () => computeAgenda({ plants, frontPlants, careLog, briefings, weather, seasonOpen }),
    [plants, frontPlants, careLog, briefings, weather, seasonOpen]
  );

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
    if (def) {
      const displayLabel = customLabel || def.label;
      setFlash(`${def.emoji} ${displayLabel}`);
      setTimeout(() => setFlash(null), 2000);
    }
  }

  function handleStartAction(plant, key) {
    setActionSession({ plant, key });
  }

  const TABS = [
    { id: 'today',   label: '✦',  title: 'Today'   },
    { id: 'garden',  label: '🌿', title: 'Garden'  },
    { id: 'ask',     label: '🌸', title: 'Ask'     },
    { id: 'journal', label: '📖', title: 'Journal' },
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
            morningBrief={morningBrief} onStartAction={handleStartAction}
            portraits={portraits} completedThisSession={completedThisSession}
            onMarkDone={handleMarkDone}
            onOpenAsk={() => setTab('ask')}
          />
        )}

        {tab === 'garden' && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
              TERRACE
            </div>
            {plants
              .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
              .map(p => (
                <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={handleAction}
                  onStartAction={handleStartAction}
                  onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
                  onAddPhoto={onAddPhoto} photos={allPhotos[p.id] || []} portraits={portraits}
                  briefing={briefings[p.id]} seasonOpen={seasonOpen}/>
              ))
            }
            {frontPlants.length > 0 && <>
              <div style={{ fontFamily: MONO, fontSize: 7, color: '#e84070', margin: '20px 0 14px', letterSpacing: .5 }}>
                🌹 EMMA'S ROSE GARDEN
              </div>
              {frontPlants
                .filter(p => p.health !== 'memorial')
                .map(p => (
                  <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={handleAction}
                    onStartAction={handleStartAction}
                    onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
                    onAddPhoto={onAddPhoto} photos={allPhotos[p.id] || []} portraits={portraits}
                    briefing={briefings[p.id]} seasonOpen={seasonOpen}/>
                ))
              }
            </>}
          </div>
        )}

        {tab === 'ask' && (
          <OracleChat
            plants={[...plants, ...frontPlants]} careLog={careLog} weather={weather}
            style={{ height: '100%' }}
          />
        )}

        {tab === 'journal' && (
          <MobileJournal
            plants={plants} frontPlants={frontPlants} careLog={careLog} portraits={portraits}
          />
        )}
      </div>

      {/* Care action sheet */}
      {actionSession && (
        <MobileActionSheet
          plant={actionSession.plant}
          actionKey={actionSession.key}
          careLog={careLog}
          portraits={portraits}
          weather={weather}
          onLog={() => handleAction(actionSession.key, actionSession.plant)}
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
