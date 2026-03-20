import React, { useState, useRef, useEffect, useCallback } from 'react';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO = '"Press Start 2P", monospace';

function fmtForecastDay(day, index) {
  const date = new Date(day.date + 'T12:00:00');
  const label = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' :
    date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const rain = day.precipChance > 20 ? ` · ${day.precipChance}% rain` : '';
  return `${label}: ${day.high}°F high, ${day.low}°F low, ${day.label}${rain}`;
}

// Builds a lean garden context object for the system prompt
function buildGardenContext({ plants, careLog, warmth, weather, seasonOpen, seasonBlocking, portraits = {} }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const contextPlants = plants
    .filter(p => p.health !== 'memorial')
    .map(p => {
      const entries = careLog[p.id] || [];
      const waterEntries = entries.filter(e => e.action === 'water');
      const lastWatered = waterEntries.length
        ? new Date(waterEntries[waterEntries.length - 1].date)
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : null;
      const port = portraits[p.id];
      const visualNote = port?.visualNote && !port?.analyzing ? port.visualNote : null;
      const lastAnalyzed = visualNote && port?.date
        ? new Date(port.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : null;
      return {
        name: p.name, type: p.type, health: p.health,
        container: p.container, growth: p.growth,
        lastWatered, poem: p.poem, visualNote, lastAnalyzed,
      };
    });

  const forecast = weather?.forecast
    ? weather.forecast.slice(0, 10).map(fmtForecastDay).join('\n')
    : null;

  // Find upcoming rain windows (useful for watering/neem timing)
  const rainDays = weather?.forecast
    ?.slice(1, 7)
    .filter(d => d.precipChance > 40)
    .map(d => {
      const date = new Date(d.date + 'T12:00:00');
      return date.toLocaleDateString('en-US', { weekday: 'short' }) + ` (${d.precipChance}%)`;
    }) ?? [];

  return {
    today,
    weather: weather ? `${Math.round(weather.temp)}°F, ${weather.poem}` : null,
    forecast,
    rainDays: rainDays.length ? rainDays.join(', ') : 'none in the next 6 days',
    warmth,
    seasonOpen: seasonOpen ?? true,
    seasonBlocking: seasonBlocking ?? null,
    plants: contextPlants,
  };
}

export function OracleChat({ plants, careLog, warmth, weather, seasonOpen, seasonBlocking, portraits = {}, style }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text) => {
    if (!text.trim() || streaming) return;
    setInput('');

    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const gardenContext = buildGardenContext({ plants, careLog, warmth, weather, seasonOpen, seasonBlocking, portraits });

      const res = await fetch('/api/oracle-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          gardenContext,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const { text, error } = JSON.parse(payload);
            if (error) throw new Error(error);
            if (text) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: (updated[updated.length - 1].content || '') + text,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Something went wrong. Try again.',
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, plants, careLog, warmth, weather, streaming, portraits]);

  const STARTERS = [
    "What's actually happening out here right now?",
    'What do I need to know for this week?',
    'What are the roots doing underground right now?',
    'What should I actually do today?',
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(4,2,1,0.96)',
      ...style,
    }}>

      {/* Header */}
      <div style={{
        padding: '14px 18px 10px',
        borderBottom: '1px solid rgba(160,130,80,0.15)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 8, color: '#d4a830', letterSpacing: .5 }}>
          ORACLE
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 12, color: 'rgba(240,228,200,0.50)', marginTop: 3 }}>
          Ask anything about the terrace
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.length === 0 && (
          <div>
            <div style={{
              fontFamily: SERIF, fontSize: 14, color: 'rgba(240,228,200,0.45)',
              fontStyle: 'italic', marginBottom: 20, lineHeight: 1.7,
            }}>
              I know every plant on the terrace. Ask me anything.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{
                    background: 'rgba(212,168,48,0.08)',
                    border: '1px solid rgba(212,168,48,0.20)',
                    borderRadius: 8, padding: '9px 14px',
                    color: 'rgba(212,168,48,0.80)',
                    fontFamily: SERIF, fontSize: 13, cursor: 'pointer',
                    textAlign: 'left', transition: 'all .12s',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12,
          }}>
            <div style={{
              maxWidth: '82%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user'
                ? 'rgba(42,24,8,0.90)'
                : 'rgba(242,236,224,0.08)',
              border: msg.role === 'user'
                ? '1px solid rgba(160,130,80,0.25)'
                : '1px solid rgba(212,168,48,0.15)',
              fontFamily: SERIF,
              fontSize: 14,
              lineHeight: 1.65,
              color: msg.role === 'user' ? 'rgba(240,228,200,0.90)' : 'rgba(240,228,200,0.88)',
              fontStyle: msg.role === 'assistant' ? 'italic' : 'normal',
            }}>
              {msg.content || (
                <span style={{ opacity: 0.4, animation: 'pulse 1s infinite' }}>···</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(160,130,80,0.15)',
        display: 'flex', gap: 8, flexShrink: 0,
        background: 'rgba(4,2,1,0.98)',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Ask the oracle…"
          disabled={streaming}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(160,130,80,0.25)',
            borderRadius: 8, padding: '10px 14px',
            color: 'rgba(240,228,200,0.90)', fontFamily: SERIF, fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          style={{
            background: streaming ? 'rgba(212,168,48,0.20)' : '#d4a830',
            border: 'none', borderRadius: 8, padding: '10px 16px',
            color: streaming ? 'rgba(212,168,48,0.50)' : '#120c06',
            fontFamily: MONO, fontSize: 8, cursor: streaming ? 'default' : 'pointer',
            transition: 'all .12s', flexShrink: 0,
          }}>
          {streaming ? '···' : '→'}
        </button>
      </div>
    </div>
  );
}
