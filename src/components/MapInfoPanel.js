// MapInfoPanel — right-side dashboard for the terrace map view
// Shows season status, warmth, weather forecast, needs-care, recent log, coverage

import React, { useState } from 'react';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

const GOLD   = '#d4a830';
const DIM    = 'rgba(240,228,200,0.32)';
const TEXT   = 'rgba(240,228,200,0.90)';
const MUTED  = 'rgba(240,228,200,0.50)';
const RULE   = 'rgba(160,130,80,0.14)';
const AMBER  = 'rgba(212,168,48,0.08)';
const AMBER_BORDER = 'rgba(212,168,48,0.20)';

function Section({ label, children, accent }) {
  return (
    <div style={{ borderTop: `1px solid ${RULE}`, padding: '13px 16px 12px' }}>
      <div style={{
        fontFamily: MONO, fontSize: 6, letterSpacing: .7, marginBottom: 10, opacity: .85,
        color: accent || GOLD,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function wmoEmoji(code) {
  if (!code && code !== 0) return '—';
  if (code === 0) return '☀️';
  if (code <= 2)  return '🌤';
  if (code <= 3)  return '☁️';
  if (code <= 48) return '🌫';
  if (code <= 57) return '🌦';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦';
  return '⛈';
}

function dayAbbr(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRelative(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function healthColor(h) {
  return {
    thriving: '#58c030', content: '#88c838', thirsty: '#c8a820',
    overlooked: '#c87020', struggling: '#c83020', resting: '#7898a8',
    recovering: '#98a828',
  }[h] || '#909080';
}

function plantColor(type) {
  return {
    wisteria: '#9860c8', 'climbing-rose': '#e84070', rose: '#e84070',
    lavender: '#b890e0', hydrangea: '#9ab8d0', serviceberry: '#d06030',
    maple: '#d85828', evergreen: '#4a7828', 'evergreen-xmas': '#888040',
  }[type] || '#a09070';
}

export function MapInfoPanel({
  plants = [],
  careLog = {},
  weather = null,
  seasonOpen = false,
  seasonBlocking = null,
  photoCount = 0,
  activePlantCount = 0,
  attentionItems = [],
  recentCare = [],
  warmth = 0,
  morningBrief = null,
  fullBrief = null,
  onSelectPlant,
}) {
  const [briefExpanded, setBriefExpanded] = useState(false);
  const forecast = weather?.forecast?.slice(0, 6) ?? [];
  const warmthPct = Math.min(warmth / 10, 100);
  const atCeremony = warmth >= 1000;

  return (
    <div style={{
      width: 294, flexShrink: 0,
      background: 'rgba(8,4,1,0.95)',
      borderLeft: '1px solid rgba(160,130,80,0.18)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      position: 'relative', zIndex: 2,
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${RULE}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontFamily: MONO, fontSize: 7.5, color: GOLD, letterSpacing: .6 }}>GARDEN PARTY</span>
          <div style={{
            background: seasonOpen ? 'rgba(88,192,48,0.15)' : 'rgba(96,144,160,0.15)',
            border: `1px solid ${seasonOpen ? 'rgba(88,192,48,0.40)' : 'rgba(96,144,160,0.35)'}`,
            borderRadius: 20, padding: '2px 9px',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 6, color: seasonOpen ? '#88c840' : '#6090a0', letterSpacing: .3 }}>
              {seasonOpen ? 'S2 · OPEN' : 'S2 · LOCKED'}
            </span>
          </div>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {!seasonOpen && seasonBlocking && (
          <div style={{ fontSize: 11, color: 'rgba(96,144,180,0.80)', fontFamily: SERIF, fontStyle: 'italic', lineHeight: 1.5, marginTop: 4 }}>
            {seasonBlocking === 'readiness'    ? `${photoCount}/${activePlantCount} plants photographed` :
             seasonBlocking === 'calendar'     ? 'Too early in the season' :
             seasonBlocking === 'rain-today'   ? 'Raining today' :
             seasonBlocking === 'rain-tomorrow'? 'Rain forecast tomorrow' : ''}
          </div>
        )}
      </div>

      {/* ── Warmth ── */}
      <div style={{
        margin: '12px 16px 0',
        background: atCeremony ? 'rgba(240,140,20,0.12)' : AMBER,
        border: `1px solid ${atCeremony ? 'rgba(240,140,20,0.35)' : AMBER_BORDER}`,
        borderRadius: 9, padding: '11px 13px 10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span style={{ fontFamily: MONO, fontSize: 6, color: atCeremony ? '#f0a030' : GOLD, letterSpacing: .6 }}>
            WARMTH
          </span>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: atCeremony ? '#f0c060' : TEXT }}>
            {warmth} <span style={{ fontSize: 12, fontWeight: 400, color: MUTED }}>/ 1000</span>
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: atCeremony ? '#f0a030' : 'linear-gradient(90deg, #a06820, #d4a830)',
            width: `${warmthPct}%`, transition: 'width .4s',
          }}/>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 11, color: atCeremony ? 'rgba(240,160,40,0.75)' : 'rgba(212,168,48,0.45)', marginTop: 5, fontStyle: 'italic' }}>
          {atCeremony ? '🔥 Fire pit tonight ♥' : 'with Emma = 2× warmth'}
        </div>
      </div>

      {/* ── Morning brief ── */}
      {morningBrief && (
        <div
          onClick={() => fullBrief && setBriefExpanded(e => !e)}
          style={{
            margin: '10px 16px 0',
            background: briefExpanded ? 'rgba(212,168,48,0.10)' : AMBER,
            border: `1px solid ${briefExpanded ? 'rgba(212,168,48,0.28)' : AMBER_BORDER}`,
            borderRadius: 9, padding: '11px 13px',
            cursor: fullBrief ? 'pointer' : 'default',
            transition: 'background .15s, border-color .15s',
          }}
        >
          <div style={{ fontFamily: SERIF, fontSize: 13, color: 'rgba(240,220,170,0.88)', fontStyle: 'italic', lineHeight: 1.6 }}>
            {morningBrief}
          </div>
          {!briefExpanded && fullBrief && (
            <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(160,130,80,0.50)', marginTop: 6, letterSpacing: .4 }}>
              DAILY BRIEF ▾
            </div>
          )}
          {briefExpanded && fullBrief && (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${RULE}` }}>
              {[
                { key: 'weather', label: 'WEATHER' },
                { key: 'garden',  label: 'GARDEN STATE' },
                { key: 'today',   label: 'TODAY' },
                { key: 'watch',   label: 'WATCH' },
              ].filter(s => fullBrief[s.key]).map(s => (
                <div key={s.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 6, color: GOLD, letterSpacing: .5, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: TEXT, lineHeight: 1.65 }}>{fullBrief[s.key]}</div>
                </div>
              ))}
              <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(160,130,80,0.50)', marginTop: 4, letterSpacing: .4 }}>▴ CLOSE</div>
            </div>
          )}
        </div>
      )}
      {!morningBrief && (
        <div style={{ margin: '10px 16px 0', padding: '10px 13px', borderRadius: 9, border: `1px solid ${RULE}` }}>
          <div style={{ fontFamily: SERIF, fontSize: 12, color: DIM, fontStyle: 'italic' }}>Reading the garden…</div>
        </div>
      )}

      {/* ── Weather ── */}
      {weather && (
        <Section label="WEATHER">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{wmoEmoji(weather.code)}</span>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>
                {Math.round(weather.temp)}°F
              </div>
              {weather.poem && (
                <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic', lineHeight: 1.4 }}>
                  {weather.poem.replace(/^\d+°F[,.]?\s*/, '')}
                </div>
              )}
            </div>
          </div>

          {forecast.length > 0 && (
            <div style={{ display: 'flex', gap: 3 }}>
              {forecast.map((day, i) => (
                <div key={day.date} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, padding: '6px 2px',
                  background: i === 0 ? 'rgba(212,168,48,0.10)' : 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  border: `1px solid ${i === 0 ? 'rgba(212,168,48,0.24)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 5.5, color: i === 0 ? GOLD : DIM, letterSpacing: .3 }}>
                    {i === 0 ? 'TODAY' : dayAbbr(day.date).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{wmoEmoji(day.code)}</span>
                  <span style={{ fontFamily: SERIF, fontSize: 11, color: TEXT }}>{day.high}°</span>
                  {day.precipChance >= 25 && (
                    <span style={{ fontFamily: MONO, fontSize: 5, color: '#6090c0', letterSpacing: .2 }}>
                      {day.precipChance}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Needs care ── */}
      {seasonOpen && attentionItems.length > 0 && (
        <Section label={`NEEDS CARE · ${attentionItems.length}`} accent="#c87020">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {attentionItems.map(({ plant, action, def }) => {
              const hc = healthColor(plant.health);
              const pc = plantColor(plant.type);
              return (
                <div key={`${plant.id}-${action}`}
                  onClick={() => onSelectPlant?.(plant)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 10px 8px 0',
                    background: 'rgba(200,112,32,0.07)',
                    border: '1px solid rgba(200,112,32,0.18)',
                    borderRadius: 7, cursor: 'pointer',
                    transition: 'background .12s',
                    overflow: 'hidden', position: 'relative',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,112,32,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(200,112,32,0.07)'}
                >
                  {/* color accent bar */}
                  <div style={{ width: 3, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .85 }}/>
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{def.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, lineHeight: 1.2 }}>
                      {plant.name}
                      {plant.subtitle && <span style={{ fontSize: 10, color: MUTED }}> · {plant.subtitle}</span>}
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, marginTop: 1 }}>{def.label}</div>
                  </div>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: hc, flexShrink: 0, marginRight: 4,
                  }}/>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Recent care ── */}
      {recentCare.length > 0 && (
        <Section label="RECENT">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentCare.map((e, i) => {
              const pc = plantColor(e.plant.type);
              return (
                <div key={i}
                  onClick={() => onSelectPlant?.(e.plant)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '7px 10px 7px 0',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${RULE}`,
                    borderRadius: 7, cursor: 'pointer',
                    transition: 'background .12s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                >
                  {/* color accent bar */}
                  <div style={{ width: 3, alignSelf: 'stretch', background: pc, flexShrink: 0, borderRadius: '0 2px 2px 0', opacity: .65 }}/>
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{e.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.plant.name}
                      {e.plant.subtitle && <span style={{ color: MUTED, fontSize: 10 }}> · {e.plant.subtitle}</span>}
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, marginTop: 1 }}>{e.label}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingRight: 2 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 10, color: DIM }}>{fmtRelative(e.date)}</div>
                    {e.withEmma && <div style={{ fontSize: 9, color: 'rgba(212,168,48,0.65)', marginTop: 1 }}>♥ Emma</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Coverage ── */}
      <Section label="COVERAGE">
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: TEXT }}>
              {photoCount} <span style={{ color: MUTED, fontSize: 12 }}>of {activePlantCount} documented</span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 7, color: photoCount >= activePlantCount ? '#88c840' : GOLD }}>
              {activePlantCount > 0 ? Math.round(photoCount / activePlantCount * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${activePlantCount > 0 ? (photoCount / activePlantCount * 100) : 0}%`,
              height: '100%',
              background: photoCount >= activePlantCount ? '#88c840' : 'linear-gradient(90deg,#a06820,#d4a830)',
              borderRadius: 2, transition: 'width .4s',
            }}/>
          </div>
        </div>

        {/* Per-plant health indicators */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {plants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot').map(p => (
            <div key={p.id}
              onClick={() => onSelectPlant?.(p)}
              title={`${p.name}${p.subtitle ? ' · ' + p.subtitle : ''} · ${p.health}`}
              style={{
                width: 10, height: 10, borderRadius: '50%', cursor: 'pointer',
                background: healthColor(p.health),
                opacity: .82, flexShrink: 0,
                transition: 'transform .12s, opacity .12s',
              }}
              onMouseEnter={e => { e.target.style.transform = 'scale(1.8)'; e.target.style.opacity = '1'; }}
              onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.opacity = '.82'; }}
            />
          ))}
        </div>
      </Section>

      <div style={{ flex: 1, minHeight: 16 }}/>
    </div>
  );
}
