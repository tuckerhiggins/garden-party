// Mobile view — optimized for use while actually in the garden
// Hero features: photo upload, quick care, oracle chat
import React, { useState, useRef, useCallback } from 'react';
import { OracleChat } from './OracleChat';
import { ACTION_DEFS, SEASON_OPEN } from '../data/plants';

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

function actionStatus(plant, key, careLog) {
  if (!SEASON_OPEN) return { available: false, reason: 'Opens Mar 20' };
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
function getPhotos(plantId) {
  try { return JSON.parse(localStorage.getItem('gp_photos_' + plantId) || '[]'); } catch { return []; }
}
function savePhotos(plantId, photos) {
  try { localStorage.setItem('gp_photos_' + plantId, JSON.stringify(photos)); } catch {}
}
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

// ── MOBILE PLANT CARD ──────────────────────────────────────────────────────
function MobilePlantCard({ plant, careLog, onAction, onPhotoAdded }) {
  const [photos, setPhotos] = useState(() => getPhotos(plant.id));
  const fileRef = useRef(null);
  const color = plantColor(plant.type);
  const lastPhoto = photos[photos.length - 1];

  async function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const dataUrl = await compressImage(file);
    const newPhoto = { dataUrl, date: new Date().toISOString() };
    const updated = [...photos, newPhoto].slice(-5);
    savePhotos(plant.id, updated);
    setPhotos(updated);
    e.target.value = '';
    onPhotoAdded?.();
    // Log the photograph action
    if (plant.actions?.includes('photo')) {
      onAction('photo', plant);
    }
  }

  const waterStatus = actionStatus(plant, 'water', careLog);
  const availableActions = (plant.actions || [])
    .filter(a => a !== 'water' && a !== 'photo' && a !== 'visit')
    .filter(a => actionStatus(plant, a, careLog).available)
    .slice(0, 1); // show one extra action max

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
          height: lastPhoto ? 160 : 80,
          background: lastPhoto ? 'transparent' : `${color}10`,
          cursor: 'pointer', position: 'relative', overflow: 'hidden',
        }}>
        {lastPhoto ? (
          <img src={lastPhoto.dataUrl} alt={plant.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 28, opacity: 0.4 }}>📷</div>
            <div style={{ fontFamily: SERIF, fontSize: 12, color: '#b09070', fontStyle: 'italic' }}>
              Tap to add first photo
            </div>
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
            {photos.length > 0 ? `${photos.length} · ADD` : 'ADD'}
          </span>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={handleFile}/>

      {/* Info + actions */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontFamily: SERIF, fontWeight: 600, color: '#2a1808' }}>
              {plant.name}
            </div>
            {plant.subtitle && (
              <div style={{ fontSize: 12, color: '#907050', fontFamily: SERIF }}>{plant.subtitle}</div>
            )}
          </div>
          <div style={{
            background: `${healthColor(plant.health)}18`,
            border: `1px solid ${healthColor(plant.health)}40`,
            borderRadius: 20, padding: '3px 10px',
            fontSize: 11, color: healthColor(plant.health), fontFamily: SERIF,
          }}>
            {healthLabel(plant.health)}
          </div>
        </div>

        {/* Quick action row */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Water */}
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

          {/* Top seasonal action */}
          {availableActions.map(a => {
            const def = ACTION_DEFS[a];
            return (
              <button key={a} onClick={() => onAction(a, plant)}
                style={{
                  flex: 1, padding: '10px 8px',
                  background: `${color}10`,
                  border: `1px solid ${color}30`,
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

          {/* Visit */}
          <button
            onClick={() => onAction('visit', plant)}
            style={{
              flex: 1, padding: '10px 8px',
              background: 'rgba(0,0,0,.03)',
              border: '1px solid rgba(160,130,80,.15)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            }}>
            <span style={{ fontSize: 18 }}>👀</span>
            <span style={{ fontFamily: MONO, fontSize: 6, color: '#a08060' }}>VISIT</span>
          </button>
        </div>

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

// ── QUICK CARE TAB ─────────────────────────────────────────────────────────
function QuickCareTab({ plants, careLog, onAction }) {
  const actionable = plants.filter(p =>
    p.health !== 'memorial' && p.type !== 'empty-pot' &&
    (p.actions || []).some(a => actionStatus(p, a, careLog).available && !ACTION_DEFS[a]?.alwaysAvailable)
  );
  const needsWater = plants.filter(p => {
    if (!p.actions?.includes('water')) return false;
    const entries = (careLog[p.id] || []).filter(e => e.action === 'water');
    if (!entries.length) return true;
    return (Date.now() - new Date(entries[entries.length - 1].date).getTime()) / 86400000 > 1;
  });

  if (!SEASON_OPEN) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
        <div style={{ fontFamily: SERIF, fontSize: 16, color: '#907050', fontStyle: 'italic' }}>
          Season 2 opens March 20.
        </div>
      </div>
    );
  }

  if (actionable.length === 0 && needsWater.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <div style={{ fontFamily: SERIF, fontSize: 16, color: '#907050', fontStyle: 'italic' }}>
          Everything is tended to.
        </div>
      </div>
    );
  }

  const prioritized = [
    ...needsWater.filter(p => !actionable.find(a => a.id === p.id)),
    ...actionable,
  ].filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
        {prioritized.length} NEED{prioritized.length !== 1 ? 'S' : ''} CARE
      </div>
      {prioritized.map(p => (
        <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={onAction}/>
      ))}
    </div>
  );
}

// ── JOURNAL TAB (mobile) ───────────────────────────────────────────────────
function MobileJournal({ plants, careLog }) {
  const allEntries = [];
  Object.entries(careLog).forEach(([id, entries]) => {
    const plant = plants.find(p => p.id === id);
    if (plant) entries.forEach(e => allEntries.push({ ...e, plant }));
  });
  allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allEntries.length === 0) {
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
      {allEntries.slice(0, 40).map((e, i) => {
        const color = plantColor(e.plant.type);
        return (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '10px 0',
            borderBottom: '1px solid rgba(160,130,80,0.12)',
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{e.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: '#2a1808', fontFamily: SERIF }}>{e.label}</div>
              <div style={{ fontSize: 12, color, fontFamily: SERIF }}>{e.plant.name}</div>
              {e.withEmma && <div style={{ fontSize: 11, color: '#a07030', fontFamily: SERIF }}>with Emma ♥</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: '#b09070', fontFamily: SERIF }}>{fmtDate(e.date)}</div>
              <div style={{ fontSize: 11, color, fontFamily: SERIF }}>+{e.earned}♥</div>
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
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{background:'none',border:'none',fontFamily:MONO,fontSize:6,color:C.uiMuted,cursor:'pointer',padding:'4px 6px'}}>
        sign in
      </button>
    );
  }

  const attempt = async () => {
    setError('');
    try { await signIn(email, password); setOpen(false); }
    catch { setError('wrong email or password'); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(4,2,1,0.95)',zIndex:200,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{fontFamily:MONO,fontSize:8,color:C.uiGold,marginBottom:24}}>SIGN IN</div>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
        placeholder="email" autoFocus
        style={{width:'100%',maxWidth:280,padding:'12px 14px',marginBottom:10,
          background:'rgba(255,255,255,0.06)',border:'1px solid rgba(90,60,24,0.5)',
          borderRadius:8,color:'#f0e4cc',fontFamily:SERIF,fontSize:16,outline:'none'}}/>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&attempt()}
        placeholder="password"
        style={{width:'100%',maxWidth:280,padding:'12px 14px',marginBottom:16,
          background:'rgba(255,255,255,0.06)',border:'1px solid rgba(90,60,24,0.5)',
          borderRadius:8,color:'#f0e4cc',fontFamily:SERIF,fontSize:16,outline:'none'}}/>
      {error && <div style={{color:'#c07050',fontFamily:SERIF,fontSize:13,marginBottom:10}}>{error}</div>}
      <button onClick={attempt}
        style={{width:'100%',maxWidth:280,padding:'12px',background:C.uiGold,
          border:'none',borderRadius:8,color:C.uiBg,fontFamily:MONO,fontSize:9,cursor:'pointer',marginBottom:12}}>
        SIGN IN
      </button>
      <button onClick={()=>setOpen(false)}
        style={{background:'none',border:'none',color:C.uiMuted,fontFamily:SERIF,fontSize:14,cursor:'pointer'}}>
        cancel
      </button>
    </div>
  );
}

// ── MAIN MOBILE VIEW ───────────────────────────────────────────────────────
export function MobileView({
  plants, careLog, warmth, weather,
  onAction, role, signIn, signOut,
}) {
  const [tab, setTab] = useState('care');
  const [flash, setFlash] = useState(null);

  function handleAction(key, plant) {
    onAction(key, plant);
    const def = ACTION_DEFS[key];
    if (def) {
      setFlash(`${def.emoji} ${def.label} · +${def.warmth}♥`);
      setTimeout(() => setFlash(null), 2000);
    }
  }

  const TABS = [
    { id: 'plants', label: '🌿', title: 'Plants' },
    { id: 'care', label: '💧', title: 'Care' },
    { id: 'oracle', label: '🌸', title: 'Oracle' },
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
        {/* Warmth bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 48, height: 5, background: 'rgba(255,255,255,0.1)',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              width: `${warmth / 10}%`, height: '100%',
              background: warmth >= 1000 ? '#f0d040' : C.uiGold,
              borderRadius: 3, transition: 'width .4s',
            }}/>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold }}>{warmth}♥</span>
        </div>
        {/* Auth indicator */}
        {role !== 'guest' ? (
          <button onClick={signOut}
            style={{background:'none',border:'none',fontFamily:MONO,fontSize:6,color:C.uiMuted,cursor:'pointer',padding:'4px 6px'}}>
            {role === 'tucker' ? '🌿' : '🌹'} sign out
          </button>
        ) : (
          <MobileSignIn signIn={signIn}/>
        )}
      </div>

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
      <div style={{ flex: 1, overflowY: tab !== 'oracle' ? 'auto' : 'hidden', position: 'relative' }}>
        {tab === 'plants' && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
              ALL PLANTS
            </div>
            {plants
              .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
              .map(p => (
                <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={handleAction}/>
              ))
            }
          </div>
        )}

        {tab === 'care' && (
          <QuickCareTab plants={plants} careLog={careLog} onAction={handleAction}/>
        )}

        {tab === 'oracle' && (
          <OracleChat
            plants={plants} careLog={careLog} warmth={warmth} weather={weather}
            style={{ height: '100%' }}
          />
        )}

        {tab === 'journal' && (
          <MobileJournal plants={plants} careLog={careLog}/>
        )}
      </div>

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
