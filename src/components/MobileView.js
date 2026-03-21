// Mobile view — optimized for use while actually in the garden
// Hero features: photo upload, quick care, oracle chat
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { OracleChat } from './OracleChat';
import { ACTION_DEFS } from '../data/plants';
import { PlantPortrait } from '../PlantPortraits';
import { fetchPlantBriefing, fetchMorningBrief } from '../claude';

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

function MobilePlantCard({ plant, careLog, onAction, onPhotoAdded, onPortraitUpdate, onGrowthUpdate, onAddPhoto, photos = [], portraits, briefing, seasonOpen }) {
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
            <PlantPortrait plant={plant}/>
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
              <button key={a} onClick={() => onAction(a, plant)}
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

// ── QUICK CARE TAB ─────────────────────────────────────────────────────────
function QuickCareTab({ plants, frontPlants = [], careLog, onAction, onPortraitUpdate, onGrowthUpdate, onAddPhoto, allPhotos = {}, portraits, briefings = {}, seasonOpen, morningBrief }) {
  function getActionable(pList) {
    const needsWater = pList.filter(p => {
      if (p.health === 'memorial' || p.type === 'empty-pot') return false;
      if (!p.actions?.includes('water')) return false;
      const entries = (careLog[p.id] || []).filter(e => e.action === 'water');
      if (!entries.length) return true;
      return (Date.now() - new Date(entries[entries.length - 1].date).getTime()) / 86400000 > 1;
    });
    const hasOracleActions = pList.filter(p =>
      p.health !== 'memorial' && p.type !== 'empty-pot' &&
      (briefings[p.id]?.actions || []).length > 0
    );
    return [...new Map(
      [...needsWater, ...hasOracleActions].map(p => [p.id, p])
    ).values()];
  }

  const terraceActionable = getActionable(plants);
  const emmaActionable = getActionable(frontPlants);
  const totalActionable = terraceActionable.length + emmaActionable.length;

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

  return (
    <div style={{ padding: '16px' }}>
      {/* Morning brief */}
      {morningBrief && (
        <div style={{
          background: 'rgba(212,168,48,0.08)',
          border: '1px solid rgba(212,168,48,0.20)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 18,
        }}>
          <div style={{ fontFamily: SERIF, fontSize: 14, color: '#5a3c18', fontStyle: 'italic', lineHeight: 1.5 }}>
            {morningBrief}
          </div>
        </div>
      )}

      {totalActionable === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: '#907050', fontStyle: 'italic' }}>
            Everything is tended to.
          </div>
        </div>
      ) : (
        <>
          {/* Terrace section */}
          {terraceActionable.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
                TERRACE · {terraceActionable.length} NEED{terraceActionable.length !== 1 ? 'S' : ''} CARE
              </div>
              {terraceActionable.map(p => (
                <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={onAction}
                  onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
                  onAddPhoto={onAddPhoto} photos={allPhotos[p.id] || []} portraits={portraits}
                  briefing={briefings[p.id]} seasonOpen={seasonOpen}/>
              ))}
            </>
          )}

          {/* Emma's Rose Garden section */}
          {emmaActionable.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 7, color: '#e84070', margin: `${terraceActionable.length > 0 ? 20 : 0}px 0 14px`, letterSpacing: .5 }}>
                🌹 EMMA'S GARDEN · {emmaActionable.length} NEED{emmaActionable.length !== 1 ? 'S' : ''} CARE
              </div>
              {emmaActionable.map(p => (
                <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={onAction}
                  onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
                  onAddPhoto={onAddPhoto} photos={allPhotos[p.id] || []} portraits={portraits}
                  briefing={briefings[p.id]} seasonOpen={seasonOpen}/>
              ))}
            </>
          )}
        </>
      )}
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
  const [tab, setTab] = useState('care');
  const [flash, setFlash] = useState(null);
  const [briefings, setBriefings] = useState({});
  const [morningBrief, setMorningBrief] = useState(null);
  const [analysisNotice, setAnalysisNotice] = useState(null);
  const prevAnalyzingRef = useRef({});

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
      <div style={{ flex: 1, overflowY: tab !== 'oracle' ? 'auto' : 'hidden', position: 'relative' }}>
        {tab === 'plants' && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold, marginBottom: 14, letterSpacing: .5 }}>
              TERRACE
            </div>
            {plants
              .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot')
              .map(p => (
                <MobilePlantCard key={p.id} plant={p} careLog={careLog} onAction={handleAction}
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
                    onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
                    onAddPhoto={onAddPhoto} photos={allPhotos[p.id] || []} portraits={portraits}
                    briefing={briefings[p.id]} seasonOpen={seasonOpen}/>
                ))
              }
            </>}
          </div>
        )}

        {tab === 'care' && (
          <QuickCareTab
            plants={plants} frontPlants={frontPlants} careLog={careLog} onAction={handleAction}
            onPortraitUpdate={onPortraitUpdate} onGrowthUpdate={onGrowthUpdate}
            onAddPhoto={onAddPhoto} allPhotos={allPhotos} portraits={portraits}
            briefings={briefings} seasonOpen={seasonOpen} morningBrief={morningBrief}
          />
        )}

        {tab === 'oracle' && (
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
