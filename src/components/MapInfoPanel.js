// MapInfoPanel — right-side dashboard for the terrace map view
// Redesigned: urgency-first, warmth as ambient bar, brief as journal note

import React, { useState } from 'react';
import { fetchJournalEntry } from '../claude';
import { PlantPortrait } from '../PlantPortraits';
import { extractFutureActionDate, groupAgendaItems } from '../utils/agenda';
import { localDate } from '../utils/dates';
import { ACTION_DEFS } from '../data/plants';

const BRIEF_ACTION_COLORS = {
  water: '#4a8ac8', fertilize: '#5a9a40', prune: '#c87030',
  neem: '#7050a8', train: '#a07840', worms: '#806030',
  repot: '#c05040', tend: '#c09820',
};

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

function plantTypePlural(type) {
  return {
    'climbing-rose': 'climbing roses', wisteria: 'wisteria', lavender: 'lavender',
    hydrangea: 'hydrangeas', serviceberry: 'serviceberry', maple: 'maples',
    evergreen: 'evergreens', 'evergreen-xmas': 'evergreens', rose: 'roses',
  }[type] || type;
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

// Garden-day condition scoring for the week-ahead grid
function gardenCondition(day) {
  const low = day.low ?? 99;
  const high = day.high ?? 65;
  const precip = day.precip ?? 0;
  const chance = day.precipChance ?? 0;

  if (low <= 32)
    return { tag: 'HARD FROST', note: `${low}°F low — cover roses`, color: '#50a8e0', bg: 'rgba(60,140,210,0.16)', icon: '🧊' };
  if (low <= 35)
    return { tag: 'FROST', note: `low ${low}°F tonight`, color: '#70b8e0', bg: 'rgba(80,160,210,0.13)', icon: '🧊' };
  if (precip >= 1.0)
    return { tag: 'HEAVY RAIN', note: `~${precip.toFixed(1)}" — skip watering`, color: '#4070c8', bg: 'rgba(50,90,190,0.14)', icon: '🌧' };
  if (precip > 0.2 || chance >= 65)
    return { tag: 'RAIN', note: precip > 0.2 ? `~${precip.toFixed(1)}" expected` : `${chance}% chance`, color: '#5080c8', bg: 'rgba(60,100,190,0.12)', icon: '🌦' };
  if (high >= 92)
    return { tag: 'HEAT', note: `${high}°F — water AM only`, color: '#c04020', bg: 'rgba(190,60,30,0.14)', icon: '🔥' };
  if (high >= 88)
    return { tag: 'HOT', note: `${high}°F high`, color: '#d05828', bg: 'rgba(200,80,32,0.12)', icon: '☀️' };
  if (chance < 30 && high >= 62 && high <= 80 && low > 40) {
    const dow = new Date(day.date).getDay();
    const notes = ['prune window', 'fertilize window', 'good to train', 'check ties', 'inspect roots', 'neem if needed', 'general rounds'];
    return { tag: 'IDEAL', note: notes[dow], color: '#4a9a30', bg: 'rgba(60,140,40,0.14)', icon: '🌱' };
  }
  if (chance < 30 && high >= 55 && low > 38)
    return { tag: 'CLEAR', note: `${high}°F`, color: '#6a8a50', bg: 'rgba(80,120,60,0.10)', icon: '🌤' };
  if (high < 45)
    return { tag: 'COLD', note: `${high}°F max — hold off`, color: '#6080a0', bg: 'rgba(70,100,140,0.12)', icon: '🌥' };
  if (high < 55)
    return { tag: 'COOL', note: `${high}°F — no fertilizing`, color: '#7090a8', bg: 'rgba(80,110,140,0.10)', icon: '🌥' };
  const mildNote = chance >= 40 ? `${chance}% rain` : `${high}°F`;
  return { tag: 'MILD', note: mildNote, color: '#807860', bg: 'rgba(100,90,60,0.06)', icon: null };
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
      es.forEach(e => { if (e.date) ensure(localDate(e.date)).care.push({ plantName: plant.name, label: e.label, action: e.action, withEmma: !!e.withEmma, plantId }); });
    });
    plants.forEach(p => {
      const port = portraits?.[p.id];
      if (port?.visualNote && port.date) ensure(localDate(port.date)).obs.push({ plantId: p.id, plantName: p.name, visualNote: port.visualNote, bloomState: port.bloomState, foliageState: port.foliageState, stage: port.currentStage });
      (port?.history || []).forEach(h => { if (h.visualNote && h.date) { const b = ensure(localDate(h.date)); if (!b.obs.some(o => o.plantId === p.id && o.visualNote === h.visualNote)) b.obs.push({ plantId: p.id, plantName: p.name, visualNote: h.visualNote, bloomState: h.bloomState, foliageState: h.foliageState, stage: h.stage }); }});
      (allPhotos?.[p.id] || []).forEach(ph => { const d = ph.date ? localDate(ph.date) : ''; if (d) ensure(d).photos++; });
    });
    return Object.entries(days).sort(([a],[b]) => b.localeCompare(a)).slice(0, 4);
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
        brief: true,
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
        const isToday = dateStr === localDate();
        const hasEmma = day.care.some(e => e.withEmma);
        return (
          <div key={dateStr} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <span style={{ fontFamily: SERIF, fontSize: 10.5, color: DIM }}>{label}</span>
              {isToday && <span style={{ fontFamily: MONO, fontSize: 5.5, color: GOLD, border: `1px solid rgba(212,168,48,0.3)`, borderRadius: 8, padding: '1px 5px' }}>TODAY</span>}
              {hasEmma && <span style={{ fontSize: 10, color: '#e84070' }}>♥</span>}
            </div>
            {/* Portrait strip — plants active this day */}
            {(() => {
              const dayPlantIds = [...new Set(day.care.map(e => e.plantId))];
              const withSvg = dayPlantIds.filter(id => portraits?.[id]?.svg);
              if (!withSvg.length) return null;
              return (
                <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
                  {withSvg.slice(0, 5).map(plantId => {
                    const plant = plants.find(p => p.id === plantId);
                    if (!plant) return null;
                    return (
                      <div key={plantId} style={{
                        width: 30, height: 30, borderRadius: 5, overflow: 'hidden', flexShrink: 0,
                        border: '1px solid rgba(160,130,80,0.22)',
                        background: 'rgba(240,228,200,0.06)',
                      }}>
                        <PlantPortrait plant={plant} aiSvg={portraits[plantId].svg} />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
  onAction,
  portraits = {},
  allPhotos = {},
}) {
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [howToOpenKey, setHowToOpenKey] = useState(null);

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
          {/* Task count summary */}
          {(() => {
            const essential = attentionItems.filter(({ task }) => !task?.optional).length;
            const optional = attentionItems.filter(({ task }) => task?.optional).length;
            return (
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
                  {essential}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 13, color: MUTED }}> essential</span>
                {optional > 0 && (
                  <span style={{ fontFamily: SERIF, fontSize: 12, color: DIM, fontStyle: 'italic' }}>
                    {' '}· {optional} optional
                  </span>
                )}
              </div>
            );
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {attentionItems.map(({ plant, action, def, task }) => {
              const pc = plantColor(plant.type);
              const itemEmoji = task?.emoji || def?.emoji || '✨';
              // Task-specific label takes priority over generic ACTION_DEFS label
              const itemLabel = task?.label || def?.label || action;
              const isOptional = task?.optional === true;
              const itemKey = `${plant.id}-${action}-${task?.label || ''}`;
              const tierBorder = isOptional ? 'rgba(160,130,80,0.18)' : 'rgba(200,112,32,0.28)';
              const tierBg = isOptional ? 'rgba(160,130,80,0.06)' : 'rgba(200,112,32,0.08)';
              const howToOpen = howToOpenKey === itemKey;
              return (
                <div key={itemKey} style={{
                  borderRadius: 9,
                  border: `1.5px solid ${tierBorder}`,
                  background: tierBg,
                  overflow: 'hidden',
                }}>
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px 10px 0' }}>
                    {/* Left color bar */}
                    <div style={{ width: 4, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                    <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{itemEmoji}</span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, fontWeight: 500 }}>
                          {plant.name}
                        </span>
                        <span style={{ fontFamily: SERIF, fontSize: 12, color: isOptional ? 'rgba(160,130,80,0.55)' : MUTED }}>
                          {itemLabel}
                        </span>
                      </div>
                      {/* Reason only — instructions behind expand */}
                      {task?.reason && (
                        <div style={{ fontFamily: SERIF, fontSize: 11.5, fontStyle: 'italic', lineHeight: 1.45, color: 'rgba(240,220,170,0.55)' }}>
                          {task.reason}
                        </div>
                      )}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, paddingRight: 2 }}>
                      <button
                        onClick={e => { e.stopPropagation(); onAction?.(action, plant, task?.label); }}
                        style={{
                          padding: '6px 10px',
                          background: isOptional ? 'rgba(80,120,40,0.20)' : 'rgba(200,112,32,0.22)',
                          border: isOptional ? '1px solid rgba(80,120,40,0.40)' : '1px solid rgba(200,112,32,0.45)',
                          borderRadius: 6, cursor: 'pointer',
                          fontFamily: SERIF, fontSize: 12,
                          color: isOptional ? 'rgba(160,210,100,0.90)' : 'rgba(240,180,80,0.95)',
                          whiteSpace: 'nowrap',
                        }}>
                        ✓ Done
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onSelectPlant?.(plant); }}
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(160,130,80,0.22)',
                          borderRadius: 6, cursor: 'pointer',
                          fontFamily: SERIF, fontSize: 12,
                          color: MUTED, whiteSpace: 'nowrap',
                        }}>
                        Details →
                      </button>
                    </div>
                  </div>

                  {/* How-to expand — only when instructions exist */}
                  {task?.instructions && (
                    <div style={{ borderTop: `1px solid ${tierBorder}`, padding: '0 11px 0 19px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setHowToOpenKey(howToOpen ? null : itemKey); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0',
                          fontFamily: SERIF, fontSize: 11, color: 'rgba(240,220,170,0.45)', fontStyle: 'italic',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <span>{howToOpen ? '▴' : '▾'}</span>
                        <span>How to</span>
                      </button>
                      {howToOpen && (
                        <div style={{ fontSize: 12, color: 'rgba(240,228,200,0.72)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.6, paddingBottom: 9 }}>
                          {task.instructions}
                        </div>
                      )}
                    </div>
                  )}
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
                {renderBriefText(morningBrief)}
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
                    <div style={{ fontFamily: SERIF, fontSize: 12, color: TEXT, lineHeight: 1.65 }}>{renderBriefText(fullBrief[s.key])}</div>
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

// ── MapContextPanel — left ambient panel (weather, brief, week ahead, log) ──
export function MapContextPanel({
  plants = [],
  careLog = {},
  weather = null,
  portraits = {},
  allPhotos = {},
  noticeToday = null,
}) {
  const forecast = weather?.forecast?.slice(0, 7) ?? [];

  return (
    <div style={{
      width: 264, flexShrink: 0,
      background: 'rgba(8,4,1,0.95)',
      borderLeft: '1px solid rgba(160,130,80,0.18)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      position: 'relative', zIndex: 2,
    }}>

      {/* ── Weather — always open ── */}
      {weather && (
        <div style={{ padding: '14px 16px 12px' }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: .6, marginBottom: 10, color: GOLD, opacity: .90 }}>
            WEATHER
          </div>
          {/* Current conditions row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{wmoEmoji(weather.code)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: TEXT, lineHeight: 1.1 }}>
                {Math.round(weather.temp)}°F
              </div>
              {weather.poem && (
                <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic', lineHeight: 1.4 }}>
                  {weather.poem.replace(/^\d+°F[,.]?\s*/, '')}
                </div>
              )}
            </div>
          </div>
          {/* 7-day forecast grid — always visible */}
          {forecast.length > 0 && (
            <div style={{ display: 'flex', gap: 3 }}>
              {forecast.map((day, i) => {
                const goodDay = day.precipChance < 25 && day.high >= 52 && day.high <= 85 && (day.low == null || day.low > 38);
                return (
                  <div key={day.date} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 2, padding: '6px 2px',
                    background: i === 0 ? 'rgba(212,168,48,0.10)' : 'rgba(255,255,255,0.03)',
                    borderRadius: 6,
                    border: `1px solid ${i === 0 ? 'rgba(212,168,48,0.24)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 5.5, color: i === 0 ? GOLD : DIM, letterSpacing: .2 }}>
                      {i === 0 ? 'NOW' : dayAbbr(day.date)}
                    </span>
                    <span style={{ fontSize: 12, lineHeight: 1 }}>{wmoEmoji(day.code)}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 11, color: TEXT }}>{day.high}°</span>
                    {day.precipChance >= 30 && (
                      <span style={{ fontFamily: MONO, fontSize: 5, color: '#6090c0', letterSpacing: .1 }}>
                        {day.precipChance}%
                      </span>
                    )}
                    {goodDay && <span style={{ fontSize: 8, lineHeight: 1 }}>🌱</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── One Thing to Notice ── */}
      {noticeToday && (
        <div style={{ borderTop: `1px solid ${RULE}`, padding: '14px 16px 14px' }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: .6, marginBottom: 10, color: GOLD, opacity: .90 }}>
            ONE THING TO NOTICE
          </div>
          {noticeToday.subject && (
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: TEXT, lineHeight: 1.15, marginBottom: 8 }}>
              {noticeToday.subject}.
            </div>
          )}
          <div style={{ fontFamily: SERIF, fontSize: 12.5, color: MUTED, lineHeight: 1.65, fontStyle: 'italic' }}>
            {noticeToday.observation || noticeToday}
          </div>
        </div>
      )}

      {/* ── Week Ahead — garden-condition grid ── */}
      {forecast.length > 1 && (
        <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px 11px' }}>
          <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: .6, marginBottom: 10, color: GOLD, opacity: .90 }}>
            WEEK AHEAD
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {forecast.slice(1, 7).map(day => {
              const gc = gardenCondition(day);
              return (
                <div key={day.date} style={{
                  borderRadius: 8,
                  background: gc.bg,
                  border: `1px solid ${gc.color}40`,
                  padding: '8px 7px 8px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 5.5, color: DIM, letterSpacing: .3 }}>
                    {dayAbbr(day.date)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {gc.icon && <span style={{ fontSize: 13, lineHeight: 1 }}>{gc.icon}</span>}
                    <span style={{ fontFamily: MONO, fontSize: 6, color: gc.color, letterSpacing: .3, lineHeight: 1.3 }}>
                      {gc.tag}
                    </span>
                  </div>
                  {gc.note && (
                    <span style={{ fontFamily: SERIF, fontSize: 10.5, color: MUTED, lineHeight: 1.35, fontStyle: 'italic' }}>
                      {gc.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Garden Log ── */}
      <PanelJournalLog careLog={careLog} plants={plants} portraits={portraits} allPhotos={allPhotos} />

      <div style={{ flex: 1, minHeight: 16 }}/>
    </div>
  );
}

// ── MapCarePanel — right action panel (tiered care tasks) ──────────────────
export function MapCarePanel({
  plants = [],
  careLog = {},
  seasonOpen = false,
  seasonBlocking = null,
  photoCount = 0,
  activePlantCount = 0,
  recentPhotoCount = 0,
  agendaSections = null,
  agendaData = null,
  warmth = 0,
  morningBrief = null,
  fullBrief = null,
  portraits = {},
  onSelectPlant,
  onAction,
}) {
  const [howToOpenKey, setHowToOpenKey] = useState(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);

  const warmthPct = Math.min(warmth / 10, 100);
  const atCeremony = warmth >= 1000;
  const nearCeremony = !atCeremony && warmth >= 850;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Use pre-computed sections from App.js — the single source of truth.
  // Neither this component nor TodayAgenda re-derives; both consume the same arrays.
  const { essentialTotal = 0, essentialDone = 0, todayItems = [], optItems = [] } = agendaSections || {};

  return (
    <div style={{
      width: 294, flexShrink: 0,
      background: 'rgba(8,4,1,0.95)',
      borderLeft: '1px solid rgba(160,130,80,0.18)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      position: 'relative', zIndex: 2,
    }}>

      {/* ── Header strip ── */}
      <div style={{
        padding: '12px 16px 0',
        background: 'rgba(8,4,1,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
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
        {!seasonOpen && seasonBlocking && (
          <div style={{ fontSize: 11, color: 'rgba(96,144,180,0.80)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 8 }}>
            {seasonBlocking === 'readiness'    ? `${photoCount}/${activePlantCount} plants photographed` :
             seasonBlocking === 'calendar'     ? 'Too early in the season' :
             seasonBlocking === 'rain-today'   ? 'Raining today' :
             seasonBlocking === 'rain-tomorrow'? 'Rain forecast tomorrow' : ''}
          </div>
        )}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 0, margin: '0 -16px' }}>
          <div style={{
            height: '100%',
            background: atCeremony ? '#f0a030' : nearCeremony
              ? 'linear-gradient(90deg,#b07820,#f0a030)'
              : 'linear-gradient(90deg,#7a4e18,#d4a830)',
            width: `${warmthPct}%`, transition: 'width .5s',
          }}/>
        </div>
        <div style={{ height: 1, background: RULE_STRONG, margin: '0 -16px' }}/>
      </div>

      {/* ── Today's Brief — above care ── */}
      <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px 11px' }}>
        {morningBrief ? (
          <div style={{ borderLeft: `3px solid rgba(212,168,48,0.45)`, paddingLeft: 11 }}>
            <div style={{ fontFamily: SERIF, fontSize: 13, color: 'rgba(240,220,170,0.88)', fontStyle: 'italic', lineHeight: 1.6 }}>
              {renderBriefText(morningBrief)}
            </div>
          </div>
        ) : (
          <div style={{ borderLeft: `3px solid ${RULE}`, paddingLeft: 11 }}>
            <div style={{ fontFamily: SERIF, fontSize: 12, color: DIM, fontStyle: 'italic' }}>Reading the garden…</div>
          </div>
        )}
      </div>

      {/* ── Today's agenda — essential + optional, identical source as Today tab ── */}
      {seasonOpen && (essentialTotal > 0 || optItems.length > 0) && (
        <>
          {/* Progress counter — matches Today panel header style */}
          <div style={{ borderTop: `1px solid ${RULE}`, padding: '10px 16px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 4 }}>
              <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
                {essentialDone}/{essentialTotal}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 6, color: GOLD, letterSpacing: .4, lineHeight: 1 }}>
                ESSENTIAL
              </span>
              {optItems.length > 0 && (
                <span style={{ fontFamily: SERIF, fontSize: 11, color: DIM, fontStyle: 'italic', marginLeft: 3 }}>
                  · {optItems.length} optional
                </span>
              )}
              {agendaData?.sessionMinutes > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(160,130,80,0.55)', letterSpacing: .3, marginLeft: 4 }}>
                  ~{agendaData.sessionMinutes} MIN
                </span>
              )}
            </div>
            {essentialTotal > 0 && (
              <div style={{ height: 2, background: RULE_STRONG, borderRadius: 1, margin: '4px -16px 8px' }}>
                <div style={{ height: '100%', width: `${(essentialDone / essentialTotal) * 100}%`, background: 'linear-gradient(90deg, #7a4e18, #d4a830)', borderRadius: 1, transition: 'width .3s' }}/>
              </div>
            )}
          </div>

          {/* TODAY — essential tasks, grouped by plant type like the Today panel */}
          {todayItems.length > 0 && (
            <Section label="TODAY" accent={GOLD}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {groupAgendaItems(todayItems).map(entry => {
                  const tierBorder = 'rgba(200,112,32,0.28)';
                  const tierBg = 'rgba(200,112,32,0.08)';
                  if (entry.type === 'group') {
                    const { items: groupItems, label: groupLabel, emoji: groupEmoji, gk } = entry;
                    const sectionKey = `t:${gk}`;
                    const expanded = expandedGroupKey === sectionKey;
                    const accentColor = plantColor(groupItems[0].plantType);
                    return (
                      <div key={sectionKey} style={{ borderRadius: 9, border: `1.5px solid ${tierBorder}`, background: tierBg, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px 10px 0' }}>
                          <div style={{ width: 4, alignSelf: 'stretch', background: accentColor, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                          <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{groupEmoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 2 }}>{groupLabel}</div>
                            <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED }}>
                              {groupItems.length} {plantTypePlural(groupItems[0].plantType)}
                            </div>
                            <button onClick={() => setExpandedGroupKey(expanded ? null : sectionKey)} style={{ background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', fontFamily: SERIF, fontSize: 10, color: 'rgba(160,130,80,0.55)', textDecoration: 'underline' }}>
                              {expanded ? 'hide' : groupItems.map(i => i.plant.name).join(', ')}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, paddingRight: 2 }}>
                            <button onClick={e => { e.stopPropagation(); groupItems.forEach(i => onAction?.(i.actionKey, i.plant, i.task?.label)); }} style={{ padding: '6px 10px', background: 'rgba(200,112,32,0.22)', border: '1px solid rgba(200,112,32,0.45)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: 'rgba(240,180,80,0.95)', whiteSpace: 'nowrap' }}>✓ All</button>
                          </div>
                        </div>
                        {expanded && (
                          <div style={{ borderTop: `1px solid ${tierBorder}`, padding: '6px 11px 8px 15px' }}>
                            {groupItems.map(item => (
                              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor, flexShrink: 0 }}/>
                                  <span style={{ fontFamily: SERIF, fontSize: 12, color: TEXT }}>{item.plant.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={e => { e.stopPropagation(); onAction?.(item.actionKey, item.plant, item.task?.label); }} style={{ padding: '4px 8px', background: 'rgba(200,112,32,0.18)', border: '1px solid rgba(200,112,32,0.35)', borderRadius: 5, cursor: 'pointer', fontFamily: SERIF, fontSize: 11, color: 'rgba(240,180,80,0.90)' }}>✓</button>
                                  <button onClick={e => { e.stopPropagation(); onSelectPlant?.(item.plant); }} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,130,80,0.22)', borderRadius: 5, cursor: 'pointer', fontFamily: SERIF, fontSize: 11, color: MUTED }}>→</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const { plant, actionKey, task } = entry.item;
                  const def = ACTION_DEFS[actionKey] || null;
                  const pc = plantColor(plant.type);
                  const itemEmoji = task?.emoji || def?.emoji || '✨';
                  const itemLabel = task?.label || def?.label || actionKey;
                  const itemKey = `${plant.id}-${actionKey}-${task?.label || ''}`;
                  const howToOpen = howToOpenKey === itemKey;
                  return (
                    <div key={itemKey} style={{ borderRadius: 9, border: `1.5px solid ${tierBorder}`, background: tierBg, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px 10px 0' }}>
                        <div style={{ width: 4, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{itemEmoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, fontWeight: 500 }}>{plant.name}</span>
                            <span style={{ fontFamily: SERIF, fontSize: 12, color: MUTED }}>{itemLabel}</span>
                          </div>
                          {(task?.reason || entry.item.reason) && (
                            <div style={{ fontFamily: SERIF, fontSize: 11.5, fontStyle: 'italic', lineHeight: 1.45, color: 'rgba(240,220,170,0.55)' }}>
                              {task?.reason || entry.item.reason}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, paddingRight: 2 }}>
                          <button onClick={e => { e.stopPropagation(); onAction?.(actionKey, plant, task?.label); }} style={{ padding: '6px 10px', background: 'rgba(200,112,32,0.22)', border: '1px solid rgba(200,112,32,0.45)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: 'rgba(240,180,80,0.95)', whiteSpace: 'nowrap' }}>✓ Done</button>
                          <button onClick={e => { e.stopPropagation(); onSelectPlant?.(plant); }} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,130,80,0.22)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>Details →</button>
                        </div>
                      </div>
                      {task?.instructions && (
                        <div style={{ borderTop: `1px solid ${tierBorder}`, padding: '0 11px 0 19px' }}>
                          <button onClick={e => { e.stopPropagation(); setHowToOpenKey(howToOpen ? null : itemKey); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', fontFamily: SERIF, fontSize: 11, color: 'rgba(240,220,170,0.45)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{howToOpen ? '▴' : '▾'}</span><span>How to</span>
                          </button>
                          {howToOpen && (
                            <div style={{ fontSize: 12, color: 'rgba(240,228,200,0.72)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.6, paddingBottom: 9 }}>
                              {task.instructions}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* WHEN YOU HAVE TIME — optional tasks, grouped by plant type */}
          {optItems.length > 0 && (
            <Section label="WHEN YOU HAVE TIME">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {groupAgendaItems(optItems).map(entry => {
                  const optBorder = 'rgba(160,130,80,0.18)';
                  const optBg = 'rgba(160,130,80,0.06)';
                  if (entry.type === 'group') {
                    const { items: groupItems, label: groupLabel, emoji: groupEmoji, gk } = entry;
                    const sectionKey = `o:${gk}`;
                    const expanded = expandedGroupKey === sectionKey;
                    const accentColor = plantColor(groupItems[0].plantType);
                    return (
                      <div key={sectionKey} style={{ borderRadius: 9, border: `1.5px solid ${optBorder}`, background: optBg, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px 10px 0' }}>
                          <div style={{ width: 4, alignSelf: 'stretch', background: accentColor, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                          <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{groupEmoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 2 }}>{groupLabel}</div>
                            <div style={{ fontFamily: SERIF, fontSize: 11, color: 'rgba(160,130,80,0.55)' }}>
                              {groupItems.length} {plantTypePlural(groupItems[0].plantType)}
                            </div>
                            <button onClick={() => setExpandedGroupKey(expanded ? null : sectionKey)} style={{ background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', fontFamily: SERIF, fontSize: 10, color: 'rgba(160,130,80,0.45)', textDecoration: 'underline' }}>
                              {expanded ? 'hide' : groupItems.map(i => i.plant.name).join(', ')}
                            </button>
                          </div>
                          <div style={{ flexShrink: 0, paddingRight: 2 }}>
                            <button onClick={e => { e.stopPropagation(); groupItems.forEach(i => onAction?.(i.actionKey, i.plant, i.task?.label)); }} style={{ padding: '6px 10px', background: 'rgba(80,120,40,0.20)', border: '1px solid rgba(80,120,40,0.40)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: 'rgba(160,210,100,0.90)', whiteSpace: 'nowrap' }}>✓ All</button>
                          </div>
                        </div>
                        {expanded && (
                          <div style={{ borderTop: `1px solid ${optBorder}`, padding: '6px 11px 8px 15px' }}>
                            {groupItems.map(item => (
                              <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor, flexShrink: 0 }}/>
                                  <span style={{ fontFamily: SERIF, fontSize: 12, color: TEXT }}>{item.plant.name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={e => { e.stopPropagation(); onAction?.(item.actionKey, item.plant, item.task?.label); }} style={{ padding: '4px 8px', background: 'rgba(80,120,40,0.15)', border: '1px solid rgba(80,120,40,0.30)', borderRadius: 5, cursor: 'pointer', fontFamily: SERIF, fontSize: 11, color: 'rgba(160,210,100,0.85)' }}>✓</button>
                                  <button onClick={e => { e.stopPropagation(); onSelectPlant?.(item.plant); }} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,130,80,0.22)', borderRadius: 5, cursor: 'pointer', fontFamily: SERIF, fontSize: 11, color: MUTED }}>→</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const { plant, actionKey, task } = entry.item;
                  const def = ACTION_DEFS[actionKey] || null;
                  const pc = plantColor(plant.type);
                  const itemEmoji = task?.emoji || def?.emoji || '✨';
                  const itemLabel = task?.label || def?.label || actionKey;
                  const itemKey = `${plant.id}-${actionKey}-${task?.label || ''}`;
                  const howToOpen = howToOpenKey === itemKey;
                  return (
                    <div key={itemKey} style={{ borderRadius: 9, border: `1.5px solid ${optBorder}`, background: optBg, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px 10px 0' }}>
                        <div style={{ width: 4, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .9 }}/>
                        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{itemEmoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, fontWeight: 500 }}>{plant.name}</span>
                            <span style={{ fontFamily: SERIF, fontSize: 12, color: 'rgba(160,130,80,0.55)' }}>{itemLabel}</span>
                          </div>
                          {(task?.reason || entry.item.reason) && (
                            <div style={{ fontFamily: SERIF, fontSize: 11.5, fontStyle: 'italic', lineHeight: 1.45, color: 'rgba(240,220,170,0.55)' }}>
                              {task?.reason || entry.item.reason}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0, paddingRight: 2 }}>
                          <button onClick={e => { e.stopPropagation(); onAction?.(actionKey, plant, task?.label); }} style={{ padding: '6px 10px', background: 'rgba(80,120,40,0.20)', border: '1px solid rgba(80,120,40,0.40)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: 'rgba(160,210,100,0.90)', whiteSpace: 'nowrap' }}>✓ Done</button>
                          <button onClick={e => { e.stopPropagation(); onSelectPlant?.(plant); }} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,130,80,0.22)', borderRadius: 6, cursor: 'pointer', fontFamily: SERIF, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>Details →</button>
                        </div>
                      </div>
                      {task?.instructions && (
                        <div style={{ borderTop: `1px solid ${optBorder}`, padding: '0 11px 0 19px' }}>
                          <button onClick={e => { e.stopPropagation(); setHowToOpenKey(howToOpen ? null : itemKey); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', fontFamily: SERIF, fontSize: 11, color: 'rgba(240,220,170,0.45)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{howToOpen ? '▴' : '▾'}</span><span>How to</span>
                          </button>
                          {howToOpen && (
                            <div style={{ fontSize: 12, color: 'rgba(240,228,200,0.72)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.6, paddingBottom: 9 }}>
                              {task.instructions}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}

      {seasonOpen && essentialTotal === 0 && optItems.length === 0 && (
        <div style={{ padding: '14px 16px 10px', borderTop: `1px solid ${RULE}` }}>
          <div style={{ fontFamily: SERIF, fontSize: 13, color: DIM, fontStyle: 'italic' }}>
            All caught up ✓
          </div>
        </div>
      )}

      {/* ── Garden State / Today / Watch — always expanded below care ── */}
      {fullBrief && (
        <div style={{ borderTop: `1px solid ${RULE}`, padding: '12px 16px 4px' }}>
          {[
            { key: 'garden', label: 'GARDEN STATE' },
            { key: 'today',  label: 'TODAY' },
            { key: 'watch',  label: 'WATCH' },
          ].filter(s => fullBrief[s.key]).map(s => (
            <div key={s.key} style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(212,168,48,0.55)', letterSpacing: .5, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: SERIF, fontSize: 12, color: MUTED, lineHeight: 1.65 }}>{renderBriefText(fullBrief[s.key])}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Documented coverage bar ── */}
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
