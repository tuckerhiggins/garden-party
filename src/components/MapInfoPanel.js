// MapInfoPanel — right-side dashboard for the terrace map view
// Shows season status, weather forecast, warmth, needs-care, recent log, coverage

import React from 'react';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

const GOLD   = '#d4a830';
const DIM    = 'rgba(240,228,200,0.38)';
const TEXT   = 'rgba(240,228,200,0.88)';
const MUTED  = 'rgba(240,228,200,0.52)';
const RULE   = 'rgba(160,130,80,0.16)';

function Section({ label, children }) {
  return (
    <div style={{borderTop:`1px solid ${RULE}`,padding:'11px 16px 10px'}}>
      <div style={{fontFamily:MONO,fontSize:6,color:GOLD,letterSpacing:.6,marginBottom:8,opacity:.9}}>
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

function healthColor(h) {
  return {
    thriving:'#58c030', content:'#88c838', thirsty:'#c8a820',
    overlooked:'#c87020', struggling:'#c83020', resting:'#7898a8',
    recovering:'#98a828',
  }[h] || '#909080';
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
  onSelectPlant,
}) {
  const forecast = weather?.forecast?.slice(0, 6) ?? [];

  return (
    <div style={{
      width: 294, flexShrink: 0,
      background: 'rgba(8,4,1,0.93)',
      borderLeft: '1px solid rgba(160,130,80,0.20)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
      position: 'relative', zIndex: 2,
    }}>

      {/* ── Header ── */}
      <div style={{padding:'12px 16px 11px',borderBottom:`1px solid ${RULE}`,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <span style={{fontFamily:MONO,fontSize:7.5,color:GOLD,letterSpacing:.6}}>GARDEN PARTY</span>
          <div style={{
            background: seasonOpen ? 'rgba(88,192,48,0.18)' : 'rgba(96,144,160,0.18)',
            border: `1px solid ${seasonOpen ? 'rgba(88,192,48,0.45)' : 'rgba(96,144,160,0.40)'}`,
            borderRadius: 20, padding: '2px 8px',
          }}>
            <span style={{fontFamily:MONO,fontSize:6,
              color: seasonOpen ? '#88c840' : '#6090a0', letterSpacing:.3}}>
              {seasonOpen ? 'S2 · OPEN' : 'S2 · LOCKED'}
            </span>
          </div>
        </div>
        {!seasonOpen && seasonBlocking && (
          <div style={{fontSize:10.5,color:'rgba(96,144,180,0.80)',fontFamily:SERIF,fontStyle:'italic',
            lineHeight:1.4}}>
            {seasonBlocking === 'readiness'   ? `${photoCount}/${activePlantCount} plants photographed` :
             seasonBlocking === 'calendar'    ? 'Too early in the season' :
             seasonBlocking === 'rain-today'  ? 'Raining today' :
             seasonBlocking === 'rain-tomorrow' ? 'Rain forecast tomorrow' : ''}
          </div>
        )}
      </div>

      {/* ── Weather ── */}
      {weather && (
        <Section label="WEATHER">
          <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:10}}>
            <span style={{fontSize:22,lineHeight:1}}>{wmoEmoji(weather.code)}</span>
            <span style={{fontFamily:SERIF,fontSize:16,color:TEXT,fontWeight:600}}>
              {Math.round(weather.temp)}°F
            </span>
            <span style={{fontFamily:SERIF,fontSize:12,color:MUTED,fontStyle:'italic'}}>
              {weather.poem?.replace(/^\d+°F[,.]?\s*/,'') || ''}
            </span>
          </div>

          {/* Forecast strip */}
          {forecast.length > 0 && (
            <div style={{display:'flex',gap:3}}>
              {forecast.map((day, i) => (
                <div key={day.date} style={{
                  flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                  gap:2, padding:'6px 0',
                  background: i === 0 ? 'rgba(212,168,48,0.09)' : 'rgba(255,255,255,0.03)',
                  borderRadius:5,
                  border: `1px solid ${i === 0 ? 'rgba(212,168,48,0.22)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <span style={{fontFamily:MONO,fontSize:5.5,color:i===0?GOLD:DIM,letterSpacing:.3}}>
                    {i === 0 ? 'TODAY' : dayAbbr(day.date).toUpperCase()}
                  </span>
                  <span style={{fontSize:13,lineHeight:1}}>{wmoEmoji(day.code)}</span>
                  <span style={{fontFamily:SERIF,fontSize:10.5,color:TEXT}}>
                    {day.high}°
                  </span>
                  {day.precipChance >= 25 && (
                    <span style={{fontFamily:MONO,fontSize:5,color:'#6090c0',letterSpacing:.2}}>
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
        <Section label={`NEEDS CARE · ${attentionItems.length}`}>
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            {attentionItems.map(({ plant, action, def }, i) => (
              <div key={`${plant.id}-${action}`}
                onClick={() => onSelectPlant?.(plant)}
                style={{
                  display:'flex',alignItems:'center',gap:8,
                  padding:'5px 0',
                  borderBottom: i < attentionItems.length - 1 ? `1px solid ${RULE}` : 'none',
                  cursor:'pointer', borderRadius:4,
                  transition:'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >
                <span style={{fontSize:13,flexShrink:0,lineHeight:1}}>{def.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontFamily:SERIF,fontSize:12,color:TEXT}}>
                    {plant.name}
                  </span>
                  {plant.subtitle && (
                    <span style={{fontFamily:SERIF,fontSize:10,color:MUTED}}> · {plant.subtitle}</span>
                  )}
                </div>
                <span style={{fontSize:10,color:MUTED,fontFamily:SERIF,flexShrink:0}}>
                  {def.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recent care ── */}
      {recentCare.length > 0 && (
        <Section label="RECENT">
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            {recentCare.map((e, i) => (
              <div key={i}
                onClick={() => onSelectPlant?.(e.plant)}
                style={{
                  display:'flex',alignItems:'center',gap:8,
                  padding:'5px 0',
                  borderBottom: i < recentCare.length - 1 ? `1px solid ${RULE}` : 'none',
                  cursor:'pointer',
                }}
                onMouseEnter={ev => ev.currentTarget.style.background='rgba(255,255,255,0.04)'}
                onMouseLeave={ev => ev.currentTarget.style.background='transparent'}
              >
                <span style={{fontSize:13,flexShrink:0,lineHeight:1}}>{e.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:SERIF,fontSize:11.5,color:TEXT,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {e.plant.name}
                    {e.plant.subtitle && (
                      <span style={{color:MUTED,fontSize:10}}> · {e.plant.subtitle}</span>
                    )}
                  </div>
                  <div style={{fontFamily:SERIF,fontSize:10,color:MUTED,marginTop:1}}>{e.label}</div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontFamily:SERIF,fontSize:10,color:DIM}}>{fmtDate(e.date)}</div>
                  {e.withEmma && <div style={{fontSize:9,color:'rgba(212,168,48,0.6)'}}>♥ Emma</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Photo coverage ── */}
      <Section label="COVERAGE">
        <div style={{marginBottom:6}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontFamily:SERIF,fontSize:12,color:TEXT}}>
              {photoCount} of {activePlantCount} plants documented
            </span>
            <span style={{fontFamily:MONO,fontSize:7,color:photoCount>=activePlantCount?'#88c840':GOLD}}>
              {activePlantCount > 0 ? Math.round(photoCount/activePlantCount*100) : 0}%
            </span>
          </div>
          <div style={{height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden',
            border:'1px solid rgba(160,130,80,0.14)'}}>
            <div style={{
              width:`${activePlantCount > 0 ? (photoCount/activePlantCount*100) : 0}%`,
              height:'100%',
              background: photoCount >= activePlantCount ? '#88c840' : GOLD,
              borderRadius:3, transition:'width .4s',
            }}/>
          </div>
        </div>

        {/* Per-plant health dots */}
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
          {plants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot').map(p => (
            <div key={p.id}
              onClick={() => onSelectPlant?.(p)}
              title={`${p.name}${p.subtitle ? ' · ' + p.subtitle : ''} · ${p.health}`}
              style={{
                width:8,height:8,borderRadius:'50%',cursor:'pointer',
                background: healthColor(p.health),
                opacity:.80,
                transition:'transform .1s, opacity .1s',
              }}
              onMouseEnter={e => { e.target.style.transform='scale(1.7)'; e.target.style.opacity='1'; }}
              onMouseLeave={e => { e.target.style.transform='scale(1)'; e.target.style.opacity='.80'; }}
            />
          ))}
        </div>
      </Section>

      {/* ── Footer spacer ── */}
      <div style={{flex:1,minHeight:12}}/>
    </div>
  );
}
