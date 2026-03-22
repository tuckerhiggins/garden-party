// MapInfoPanel — right-side dashboard for the terrace map view
// Redesigned: urgency-first, warmth as ambient bar, brief as journal note

import React, { useState } from 'react';
import { fetchJournalEntry } from '../claude';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

const GOLD         = '#d4a830';
const TEXT         = 'rgba(240,228,200,0.90)';
const MUTED        = 'rgba(240,228,200,0.50)';
const DIM          = 'rgba(240,228,200,0.32)';
const RULE         = 'rgba(160,130,80,0.14)';
const RULE_STRONG  = 'rgba(160,130,80,0.22)';

function plantColor(type) {
  return {
    wisteria: '#9860c8', 'climbing-rose': '#e84070', rose: '#e84070',
    lavender: '#b890e0', hydrangea: '#9ab8d0', serviceberry: '#d06030',
    maple: '#d85828', evergreen: '#4a7828', 'evergreen-xmas': '#888040',
  }[type] || '#a09070';
}

function healthColor(h) {
  return {
    thriving: '#58c030', content: '#88c838', thirsty: '#c8a820',
    overlooked: '#c87020', struggling: '#c83020', resting: '#7898a8',
    recovering: '#98a828',
  }[h] || '#909080';
}

function wmoEmoji(code) {
  if (!code && code !== 0) return '—';
  if (code === 0)  return '☀️';
  if (code <= 2)   return '🌤';
  if (code <= 3)   return '☁️';
  if (code <= 48)  return '🌫';
  if (code <= 57)  return '🌦';
  if (code <= 67)  return '🌧';
  if (code <= 77)  return '❄️';
  if (code <= 82)  return '🌦';
  return '⛈';
}

function dayAbbr(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function fmtRelative(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ label, children, accent, noBorder }) {
  return (
    <div style={{ borderTop: noBorder ? 'none' : `1px solid ${RULE}`, padding: '12px 16px 11px' }}>
      <div style={{
        fontFamily: MONO, fontSize: 7, letterSpacing: .6, marginBottom: 9,
        color: accent || GOLD, opacity: .90,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PanelJournalLog({ careLog, plants, portraits, allPhotos }) {
  const [entries, setEntries] = React.useState({});

  const activeDays = React.useMemo(() => {
    const days = {};
    const ensure = d => { if (!days[d]) days[d] = { care: [], obs: [], photos: 0 }; return days[d]; };
    Object.entries(careLog).forEach(([plantId, es]) => {
      const plant = plants.find(p => p.id === plantId);
      if (!plant) return;
      es.forEach(e => ensure(e.date.slice(0,10)).care.push({ plantName: plant.name, label: e.label, action: e.action, withEmma: !!e.withEmma, plantId }));
    });
    plants.forEach(p => {
      const port = portraits?.[p.id];
      if (port?.visualNote && port.date) ensure(port.date.slice(0,10)).obs.push({ plantId: p.id, plantName: p.name, visualNote: port.visualNote, bloomState: port.bloomState, foliageState: port.foliageState, stage: port.currentStage });
      (port?.history || []).forEach(h => { if (h.visualNote && h.date) { const b = ensure(h.date.slice(0,10)); if (!b.obs.some(o => o.plantId === p.id && o.visualNote === h.visualNote)) b.obs.push({ plantId: p.id, plantName: p.name, visualNote: h.visualNote, bloomState: h.bloomState, foliageState: h.foliageState, stage: h.stage }); }});
      (allPhotos?.[p.id] || []).forEach(ph => { const d = (ph.date || '').slice(0,10); if (d) ensure(d).photos++; });
    });
    return Object.entries(days).sort(([a],[b]) => b.localeCompare(a)).slice(0, 3);
  }, [careLog, plants, portraits, allPhotos]);

  React.useEffect(() => {
    activeDays.forEach(([dateStr, day]) => {
      if (entries[dateStr] !== undefined) return;
      setEntries(prev => ({ ...prev, [dateStr]: 'loading' }));
      fetchJournalEntry({
        dateStr,
        careEntries: day.care,
        portraitObservations: day.obs,
        photoCount: day.photos,
        plantHistories: [],
      }).then(text => setEntries(prev => ({ ...prev, [dateStr]: text || null })))
        .catch(() => setEntries(prev => ({ ...prev, [dateStr]: null })));
    });
  }, [activeDays.map(([d]) => d).join(',')]); // eslint-disable-line

  if (activeDays.length === 0) return null;

  return (
    <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px 11px' }}>
      <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: .6, marginBottom: 9, color: GOLD, opacity: .90 }}>
        GARDEN LOG
      </div>
      {activeDays.map(([dateStr, day]) => {
        const text = entries[dateStr];
        const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const isToday = dateStr === new Date().toISOString().slice(0,10);
        const hasEmma = day.care.some(e => e.withEmma);
        return (
          <div key={dateStr} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{ fontFamily: SERIF, fontSize: 10.5, color: DIM }}>{label}</span>
              {isToday && <span style={{ fontFamily: MONO, fontSize: 5.5, color: GOLD, border: `1px solid rgba(212,168,48,0.3)`, borderRadius: 8, padding: '1px 5px' }}>TODAY</span>}
              {hasEmma && <span style={{ fontSize: 10, color: '#e84070' }}>♥</span>}
            </div>
            {text === 'loading' ? (
              <div style={{ fontFamily: SERIF, fontSize: 12, color: DIM, fontStyle: 'italic' }}>…</div>
            ) : text ? (
              <div style={{ fontFamily: SERIF, fontSize: 12, color: MUTED, lineHeight: 1.65, fontStyle: 'italic' }}>{text}</div>
            ) : day.care.length > 0 ? (
              <div style={{ fontFamily: SERIF, fontSize: 11.5, color: DIM }}>
                {[...new Set(day.care.map(e => e.plantName))].join(', ')}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function MapInfoPanel({
  plants = [],
  careLog = {},
  weather = null,
  seasonOpen = false,
  seasonBlocking = null,
  photoCount = 0,
  activePlantCount = 0,
  recentPhotoCount = 0,
  attentionItems = [],
  recentCare = [],
  warmth = 0,
  morningBrief = null,
  fullBrief = null,
  onSelectPlant,
  portraits = {},
  allPhotos = {},
}) {
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  const forecast = weather?.forecast?.slice(0, 6) ?? [];
  const warmthPct = Math.min(warmth / 10, 100);
  const atCeremony = warmth >= 1000;
  const nearCeremony = !atCeremony && warmth >= 850;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div style={{
      width: 294, flexShrink: 0,
      background: 'rgba(8,4,1,0.95)',
      borderLeft: '1px solid rgba(160,130,80,0.18)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      position: 'relative', zIndex: 2,
    }}>

      {/* ── Header strip — glassmorphism top ── */}
      <div style={{
        padding: '12px 16px 0',
        background: 'rgba(8,4,1,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        {/* Wordmark row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 7.5, color: GOLD, letterSpacing: .6 }}>GARDEN PARTY</span>
          <div style={{
            background: seasonOpen ? 'rgba(88,192,48,0.15)' : 'rgba(96,144,160,0.15)',
            border: `1px solid ${seasonOpen ? 'rgba(88,192,48,0.40)' : 'rgba(96,144,160,0.35)'}`,
            borderRadius: 20, padding: '2px 8px',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 6, color: seasonOpen ? '#88c840' : '#6090a0', letterSpacing: .3 }}>
              {seasonOpen ? 'S2 · OPEN' : 'S2 · LOCKED'}
            </span>
          </div>
        </div>

        {/* Date + warmth number inline */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic' }}>{today}</span>
          {atCeremony ? (
            <span style={{ fontFamily: SERIF, fontSize: 11, color: '#f0c060', fontStyle: 'italic' }}>
              🔥 Fire pit tonight ♥
            </span>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 7, color: nearCeremony ? '#f0a030' : 'rgba(212,168,48,0.55)', letterSpacing: .3 }}>
              {warmth}<span style={{ opacity: .55, fontSize: 6 }}>/1000</span>
            </span>
          )}
        </div>

        {/* Season blocking reason */}
        {!seasonOpen && seasonBlocking && (
          <div style={{ fontSize: 11, color: 'rgba(96,144,180,0.80)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 8 }}>
            {seasonBlocking === 'readiness'    ? `${photoCount}/${activePlantCount} plants photographed` :
             seasonBlocking === 'calendar'     ? 'Too early in the season' :
             seasonBlocking === 'rain-today'   ? 'Raining today' :
             seasonBlocking === 'rain-tomorrow'? 'Rain forecast tomorrow' : ''}
          </div>
        )}

        {/* Warmth ambient bar — full width, always visible */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 0, margin: '0 -16px' }}>
          <div style={{
            height: '100%',
            background: atCeremony ? '#f0a030' : nearCeremony
              ? 'linear-gradient(90deg,#b07820,#f0a030)'
              : 'linear-gradient(90deg,#7a4e18,#d4a830)',
            width: `${warmthPct}%`, transition: 'width .5s',
          }}/>
        </div>

        {/* Thin rule below bar */}
        <div style={{ height: 1, background: RULE_STRONG, margin: '0 -16px' }}/>
      </div>

      {/* ── Needs Care — leads when urgent ── */}
      {seasonOpen && attentionItems.length > 0 && (
        <Section label={`NEEDS CARE · ${attentionItems.length}`} accent="#c87020">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {attentionItems.map(({ plant, action, def, task }) => {
              const hc = healthColor(plant.health);
              const pc = plantColor(plant.type);
              const itemEmoji = def?.emoji || task?.emoji || '✨';
              const itemLabel = def?.label || task?.label || action;
              const isOptional = task?.optional === true;
              return (
                <div key={`${plant.id}-${action}-${task?.label || ''}`}
                  onClick={() => onSelectPlant?.(plant)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 10px 8px 0',
                    borderRadius: 7, cursor: 'pointer',
                    border: isOptional ? '1px solid rgba(160,130,80,0.16)' : '1px solid rgba(200,112,32,0.16)',
                    background: isOptional ? 'rgba(160,130,80,0.04)' : 'rgba(200,112,32,0.06)',
                    transition: 'background .12s',
                    overflow: 'hidden', position: 'relative',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isOptional ? 'rgba(160,130,80,0.09)' : 'rgba(200,112,32,0.13)'}
                  onMouseLeave={e => e.currentTarget.style.background = isOptional ? 'rgba(160,130,80,0.04)' : 'rgba(200,112,32,0.06)'}
                >
                  {/* 4px plant-color accent bar */}
                  <div style={{ width: 4, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{itemEmoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, lineHeight: 1.2 }}>
                      {plant.name}
                      {plant.subtitle && <span style={{ fontSize: 10, color: MUTED }}> · {plant.subtitle}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 11, color: isOptional ? 'rgba(160,130,80,0.55)' : MUTED }}>{itemLabel}</span>
                      {isOptional && (
                        <span style={{ fontFamily: MONO, fontSize: 5, color: 'rgba(160,130,80,0.55)', border: '1px solid rgba(160,130,80,0.22)', borderRadius: 4, padding: '1px 4px' }}>EXPLORE</span>
                      )}
                    </div>
                  </div>
                  {/* Health dot + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, paddingRight: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: hc }}/>
                    <span style={{ fontSize: 8, color: isOptional ? 'rgba(160,130,80,0.40)' : 'rgba(200,112,32,0.50)', fontFamily: MONO }}>▸</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Morning brief — journal note style ── */}
      <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px 11px' }}>
        {morningBrief ? (
          <div
            onClick={() => fullBrief && setBriefExpanded(e => !e)}
            style={{ cursor: fullBrief ? 'pointer' : 'default' }}
          >
            {/* Left gold border, no fill — journal margin note */}
            <div style={{
              borderLeft: `3px solid rgba(212,168,48,0.45)`,
              paddingLeft: 11,
            }}>
              <div style={{ fontFamily: SERIF, fontSize: 13, color: 'rgba(240,220,170,0.88)', fontStyle: 'italic', lineHeight: 1.6 }}>
                {morningBrief}
              </div>
              {fullBrief && (
                <div style={{
                  fontFamily: MONO, fontSize: 6, letterSpacing: .4, marginTop: 7,
                  color: briefExpanded ? 'rgba(160,130,80,0.50)' : GOLD,
                  opacity: briefExpanded ? .6 : 1,
                }}>
                  {briefExpanded ? '▴ CLOSE BRIEF' : 'READ TODAY\'S BRIEF ▾'}
                </div>
              )}
            </div>

            {/* Expanded brief */}
            {briefExpanded && fullBrief && (
              <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${RULE}` }}>
                {[
                  { key: 'weather', label: 'CONTEXT' },
                  { key: 'garden',  label: 'GARDEN STATE' },
                  { key: 'today',   label: 'TODAY' },
                  { key: 'watch',   label: 'WATCH' },
                ].filter(s => fullBrief[s.key]).map(s => (
                  <div key={s.key} style={{ marginBottom: 11 }}>
                    <div style={{ fontFamily: MONO, fontSize: 6, color: GOLD, letterSpacing: .5, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: SERIF, fontSize: 12, color: TEXT, lineHeight: 1.65 }}>{fullBrief[s.key]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ borderLeft: `3px solid ${RULE}`, paddingLeft: 11 }}>
            <div style={{ fontFamily: SERIF, fontSize: 12, color: DIM, fontStyle: 'italic' }}>Reading the garden…</div>
          </div>
        )}
      </div>

      {/* ── Weather — compact with expandable forecast ── */}
      {weather && (
        <Section label="WEATHER">
          {/* Compact one-line summary */}
          <div
            onClick={() => setWeatherExpanded(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginBottom: weatherExpanded ? 10 : 0 }}
          >
            <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{wmoEmoji(weather.code)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: TEXT, lineHeight: 1.1 }}>
                {Math.round(weather.temp)}°F
              </div>
              {weather.poem && (
                <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic', lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {weather.poem.replace(/^\d+°F[,.]?\s*/, '')}
                </div>
              )}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 6, color: DIM, flexShrink: 0 }}>
              {weatherExpanded ? '▴' : '▾'}
            </span>
          </div>

          {/* 6-day forecast strip — expanded */}
          {weatherExpanded && forecast.length > 0 && (
            <div style={{ display: 'flex', gap: 3 }}>
              {forecast.map((day, i) => (
                <div key={day.date} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, padding: '6px 2px',
                  background: i === 0 ? 'rgba(212,168,48,0.10)' : 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  border: `1px solid ${i === 0 ? 'rgba(212,168,48,0.24)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 6, color: i === 0 ? GOLD : DIM, letterSpacing: .2 }}>
                    {i === 0 ? 'TODAY' : dayAbbr(day.date)}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{wmoEmoji(day.code)}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: TEXT }}>{day.high}°</span>
                  {/* Precip only on today */}
                  {i === 0 && day.precipChance >= 25 && (
                    <span style={{ fontFamily: MONO, fontSize: 5.5, color: '#6090c0', letterSpacing: .2 }}>
                      {day.precipChance}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <PanelJournalLog careLog={careLog} plants={plants} portraits={portraits} allPhotos={allPhotos} />

      {/* ── Coverage — single summary line ── */}
      <Section label="DOCUMENTED">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT }}>
            {recentPhotoCount}
            <span style={{ color: MUTED, fontSize: 11 }}> of {activePlantCount} in last 10 days</span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: 7, color: recentPhotoCount >= activePlantCount ? '#88c840' : GOLD }}>
            {activePlantCount > 0 ? Math.round(recentPhotoCount / activePlantCount * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${activePlantCount > 0 ? (recentPhotoCount / activePlantCount * 100) : 0}%`,
            height: '100%',
            background: recentPhotoCount >= activePlantCount ? '#88c840' : 'linear-gradient(90deg,#7a4e18,#d4a830)',
            borderRadius: 2, transition: 'width .4s',
          }}/>
        </div>
      </Section>

      <div style={{ flex: 1, minHeight: 16 }}/>
    </div>
  );
}
