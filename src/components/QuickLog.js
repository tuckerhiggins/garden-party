// QuickLog — natural-language care logging from the front page
// Type "neemed all the downstairs roses" → structured care actions applied.
import React, { useState, useRef, useEffect } from 'react';
import { ACTION_DEFS } from '../data/plants';
import { localDate } from '../utils/dates';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';
const GOLD  = '#d4a830';
const TEXT  = 'rgba(240,228,200,0.92)';
const MUTED = 'rgba(240,228,200,0.52)';
const BG    = 'rgba(8,4,1,0.97)';
const BORDER = 'rgba(160,130,80,0.22)';

function plantColor(type) {
  return {
    wisteria: '#9860c8', 'climbing-rose': '#e84070', rose: '#e84070',
    lavender: '#b890e0', hydrangea: '#9ab8d0', serviceberry: '#d06030',
    maple: '#d85828', evergreen: '#4a7828', magnolia: '#e8a0c0',
  }[type] || '#a09070';
}

// One parsed action row in the preview
function ActionRow({ action, plant }) {
  const def = ACTION_DEFS[action.actionKey] || {};
  const color = plantColor(plant?.type);
  const dateLabel = action.isoDate && action.isoDate !== localDate(new Date().toISOString())
    ? ` · ${action.isoDate}` : '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 14,
        background: `${color}22`, border: `1px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0,
      }}>
        {def.emoji || '✨'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {plant?.name || action.plantId}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 6, color: MUTED, letterSpacing: .3, marginTop: 2 }}>
          {(action.customLabel || def.label || action.actionKey).toUpperCase()}{dateLabel}
        </div>
      </div>
      {plant?.subtitle && (
        <div style={{ fontFamily: SERIF, fontSize: 10, color: MUTED, fontStyle: 'italic', flexShrink: 0, maxWidth: 90, textAlign: 'right', lineHeight: 1.2 }}>
          {plant.subtitle}
        </div>
      )}
    </div>
  );
}

export function QuickLog({ plants = [], onApply, onClose, isMobile = false }) {
  const [phase, setPhase] = useState('input'); // input | loading | preview | clarify | applying | done
  const [inputText, setInputText] = useState('');
  const [parsedActions, setParsedActions] = useState([]);
  const [clarifyQuestion, setClarifyQuestion] = useState('');
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const textRef = useRef(null);
  const clarifyRef = useRef(null);

  useEffect(() => { textRef.current?.focus(); }, []);
  useEffect(() => { if (phase === 'clarify') clarifyRef.current?.focus(); }, [phase]);

  const plantMap = React.useMemo(() => new Map(plants.map(p => [p.id, p])), [plants]);

  const submit = async (text, hist = []) => {
    if (!text.trim()) return;
    setPhase('loading');
    setError(null);
    try {
      const resp = await fetch('/api/quicklog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          plants: plants.map(p => ({
            id: p.id, name: p.name, subtitle: p.subtitle || null,
            type: p.type, gardenSection: p.gardenSection || null,
            actions: p.actions || [],
          })),
          history: hist,
        }),
      });
      const data = await resp.json();

      if (data.clarifications?.length) {
        setClarifyQuestion(data.clarifications[0].question);
        setHistory([...hist, { role: 'user', content: text }]);
        setPhase('clarify');
        return;
      }

      if (data.actions?.length) {
        setParsedActions(data.actions);
        setPhase('preview');
        return;
      }

      setError('Nothing could be parsed. Try being more specific.');
      setPhase('input');
    } catch (e) {
      setError('Something went wrong. Check your connection.');
      setPhase('input');
    }
  };

  const handleClarifySubmit = () => {
    if (!clarifyAnswer.trim()) return;
    const nextHistory = [
      ...history,
      { role: 'assistant', content: clarifyQuestion },
      { role: 'user', content: clarifyAnswer },
    ];
    setHistory(nextHistory);
    submit(inputText, nextHistory);
    setClarifyAnswer('');
  };

  const applyAll = async () => {
    setPhase('applying');
    for (const action of parsedActions) {
      const plant = plantMap.get(action.plantId);
      if (!plant) continue;
      const customDate = action.isoDate ? `${action.isoDate}T12:00:00` : null;
      await onApply(action.actionKey, plant, action.customLabel || null, customDate);
    }
    setPhase('done');
    setTimeout(onClose, 900);
  };

  const W = isMobile ? '100%' : 360;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{
        width: W, maxWidth: '100vw',
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: isMobile ? '16px 16px 0 0' : 10,
        padding: '18px 18px 22px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        maxHeight: isMobile ? '85vh' : 'auto',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span style={{ fontFamily: MONO, fontSize: 7, color: GOLD, letterSpacing: .6 }}>QUICKLOG</span>
            <div style={{ fontFamily: SERIF, fontSize: 11, color: MUTED, fontStyle: 'italic', marginTop: 2 }}>
              Describe what you did — the oracle will file it.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: MUTED, cursor: 'pointer',
            fontSize: 18, padding: '0 0 0 12px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Input phase */}
        {(phase === 'input' || phase === 'loading') && (
          <>
            <textarea
              ref={textRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(inputText, history);
              }}
              placeholder={'e.g. "neemed all the downstairs roses"\nor "watered the hydrangeas and maple yesterday"'}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${BORDER}`,
                borderRadius: 6, padding: '10px 12px',
                color: TEXT, fontFamily: SERIF, fontSize: 14, lineHeight: 1.5,
                resize: 'none', outline: 'none',
              }}
            />
            {error && (
              <div style={{ fontFamily: SERIF, fontSize: 12, color: '#e06040', marginTop: 6, fontStyle: 'italic' }}>
                {error}
              </div>
            )}
            <button
              onClick={() => submit(inputText, history)}
              disabled={!inputText.trim() || phase === 'loading'}
              style={{
                marginTop: 10, width: '100%',
                background: inputText.trim() && phase !== 'loading' ? GOLD : 'rgba(212,168,48,0.25)',
                border: 'none', borderRadius: 6, padding: '9px 0',
                color: '#1a0e00', fontFamily: MONO, fontSize: 7, letterSpacing: .4,
                cursor: inputText.trim() && phase !== 'loading' ? 'pointer' : 'default',
                transition: 'background .15s',
              }}
            >
              {phase === 'loading' ? 'PARSING...' : 'PARSE & PREVIEW'}
            </button>
          </>
        )}

        {/* Clarify phase */}
        {phase === 'clarify' && (
          <>
            <div style={{
              background: 'rgba(212,168,48,0.08)',
              border: `1px solid rgba(212,168,48,0.22)`,
              borderRadius: 6, padding: '10px 12px', marginBottom: 12,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 6, color: GOLD, letterSpacing: .4, marginBottom: 5 }}>ONE QUESTION</div>
              <div style={{ fontFamily: SERIF, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{clarifyQuestion}</div>
            </div>
            <textarea
              ref={clarifyRef}
              value={clarifyAnswer}
              onChange={e => setClarifyAnswer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleClarifySubmit();
              }}
              placeholder="Your answer..."
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${BORDER}`,
                borderRadius: 6, padding: '10px 12px',
                color: TEXT, fontFamily: SERIF, fontSize: 14, lineHeight: 1.5,
                resize: 'none', outline: 'none',
              }}
            />
            <button
              onClick={handleClarifySubmit}
              disabled={!clarifyAnswer.trim()}
              style={{
                marginTop: 10, width: '100%',
                background: clarifyAnswer.trim() ? GOLD : 'rgba(212,168,48,0.25)',
                border: 'none', borderRadius: 6, padding: '9px 0',
                color: '#1a0e00', fontFamily: MONO, fontSize: 7, letterSpacing: .4,
                cursor: clarifyAnswer.trim() ? 'pointer' : 'default',
              }}
            >
              CONTINUE
            </button>
          </>
        )}

        {/* Preview phase */}
        {phase === 'preview' && (
          <>
            <div style={{ fontFamily: MONO, fontSize: 6, color: MUTED, letterSpacing: .4, marginBottom: 8 }}>
              {parsedActions.length} ACTION{parsedActions.length !== 1 ? 'S' : ''} TO LOG
            </div>
            <div style={{ marginBottom: 14 }}>
              {parsedActions.map((action, i) => (
                <ActionRow key={i} action={action} plant={plantMap.get(action.plantId)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setPhase('input'); setHistory([]); }}
                style={{
                  flex: 1,
                  background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 0',
                  color: MUTED, fontFamily: MONO, fontSize: 6, letterSpacing: .4,
                  cursor: 'pointer',
                }}
              >
                EDIT
              </button>
              <button
                onClick={applyAll}
                style={{
                  flex: 2,
                  background: GOLD, border: 'none', borderRadius: 6, padding: '8px 0',
                  color: '#1a0e00', fontFamily: MONO, fontSize: 7, letterSpacing: .4,
                  cursor: 'pointer',
                }}
              >
                APPLY ALL
              </button>
            </div>
          </>
        )}

        {/* Applying / done */}
        {(phase === 'applying' || phase === 'done') && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{phase === 'done' ? '✓' : '⏳'}</div>
            <div style={{ fontFamily: SERIF, fontSize: 14, color: TEXT, fontStyle: 'italic' }}>
              {phase === 'done' ? `${parsedActions.length} action${parsedActions.length !== 1 ? 's' : ''} logged.` : 'Logging...'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
