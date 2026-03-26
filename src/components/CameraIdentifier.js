// CameraIdentifier — landscape-tilt-activated plant identification
// Trigger: rotate phone to landscape (|gamma| > 65°) for 600ms — like holding a camera
// Also triggered directly via registerOpen callback (used by Map header button)
import React, { useState, useRef, useEffect } from 'react';
import { PlantPortrait } from '../PlantPortraits';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';
const C = {
  uiBg: '#120c06', uiBorder: '#5a3c18',
  uiText: '#f0e4cc', uiMuted: '#a89070', uiGold: '#d4a830',
};
function hColor(h) {
  return { thriving:'#58c030', content:'#88c838', thirsty:'#c8a820',
    overlooked:'#c87020', struggling:'#c83020', resting:'#7898a8',
    recovering:'#98a828' }[h] || '#909080';
}
const CONF_LABEL = { high:'✓ Strong match', medium:'~ Possible match', low:'? Uncertain' };
const CONF_COLOR = { high:'#58c030', medium:'#c8a820', low:'#a89070' };

export function CameraIdentifier({ plants = [], frontPlants = [], portraits = {}, onAddPhoto, onGoToPlant, registerOpen }) {
  const [phase, setPhase]       = useState('idle'); // idle|camera|identifying|confirming
  const [stream, setStream]     = useState(null);   // MediaStream — drives video attachment via effect
  const [captured, setCaptured] = useState(null);   // { dataUrl, base64 }
  const [matches, setMatches]   = useState([]);
  const [permState, setPermState] = useState(() =>
    typeof DeviceOrientationEvent?.requestPermission === 'function' ? 'needs-request' : 'granted'
  );

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  // Ref-wrapped startCamera so registerOpen can expose a stable reference
  const startCameraRef = useRef(null);

  const allPlants = [...plants, ...frontPlants]
    .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');

  // ── Expose startCamera to parent (Map header button) ──────────────────
  useEffect(() => {
    registerOpen?.(() => startCameraRef.current?.());
    return () => registerOpen?.(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup stream on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  // ── Tilt detection (landscape rotation: |gamma| > 65°) ────────────────
  useEffect(() => {
    if (permState !== 'granted') return;

    const timerRef   = { current: null };
    const tiltingRef = { current: false };

    function onOrientation(e) {
      if (phase !== 'idle') return;
      const gamma = e.gamma;
      if (gamma === null) return;

      // Landscape hold: phone rotated sideways like a camera
      const isLandscape = Math.abs(gamma) > 65;

      if (isLandscape && !tiltingRef.current) {
        tiltingRef.current = true;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          startCameraRef.current?.();
        }, 600);
      } else if (!isLandscape && tiltingRef.current) {
        tiltingRef.current = false;
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      clearTimeout(timerRef.current);
    };
  }, [permState, phase]);

  // ── Permission (iOS 13+) ──────────────────────────────────────────────
  async function requestPermission() {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      setPermState(result === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermState('denied');
    }
  }

  // ── Camera ────────────────────────────────────────────────────────────
  async function startCamera() {
    if (phase !== 'idle') return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
      setPhase('camera');
      // Wait one frame for React to render the <video> element, then attach
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      console.warn('Camera error:', err);
    }
  }
  // Keep ref in sync so the landscape listener and registerOpen always call latest
  startCameraRef.current = startCamera;

  function close() {
    setStream(null); // cleanup effect fires
    setPhase('idle');
    setCaptured(null);
    setMatches([]);
  }

  function capture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const scale = Math.min(1, 800 / (video.videoWidth || 800));
    canvas.width  = Math.round((video.videoWidth  || 800) * scale);
    canvas.height = Math.round((video.videoHeight || 600) * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    setStream(null); // stop stream

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCaptured({ dataUrl, base64: dataUrl.split(',')[1] });
    setPhase('identifying');
    identify(dataUrl.split(',')[1]);
  }

  // ── Identification ────────────────────────────────────────────────────
  async function identify(base64) {
    try {
      const plantData = allPlants.map(p => ({
        id: p.id, name: p.name, type: p.type, health: p.health,
        subtitle: p.subtitle || null, gardenSection: p.gardenSection || null,
      }));
      const res = await fetch('/api/identify-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg', plants: plantData }),
      });
      const { matches: m } = await res.json();
      setMatches(m || []);
    } catch {
      setMatches([]);
    }
    setPhase('confirming');
  }

  // ── Confirm ───────────────────────────────────────────────────────────
  function confirm(match) {
    if (captured) onAddPhoto?.(match.plantId, captured.dataUrl, new Date().toISOString());
    close();
    onGoToPlant?.(match.plantId);
  }

  // ── Render ────────────────────────────────────────────────────────────

  // iOS needs one tap to unlock orientation events
  if (phase === 'idle' && permState === 'needs-request') {
    return (
      <button onClick={requestPermission} style={{
        position: 'fixed', bottom: 84, right: 14, zIndex: 90,
        background: 'rgba(18,12,6,0.90)', border: `1px solid rgba(212,168,48,0.30)`,
        borderRadius: 22, padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(0,0,0,0.40)',
      }}>
        <span style={{ fontSize: 14 }}>📷</span>
        <span style={{ fontFamily: MONO, fontSize: 5, color: C.uiGold, letterSpacing: .3 }}>
          ENABLE TILT SCAN
        </span>
      </button>
    );
  }

  if (phase === 'idle') return null;

  // ── Camera view ───────────────────────────────────────────────────────
  if (phase === 'camera') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#000',
        display: 'flex', flexDirection: 'column',
      }}>
        <video ref={videoRef} playsInline muted
          style={{ flex: 1, objectFit: 'cover', width: '100%' }}/>
        <canvas ref={canvasRef} style={{ display: 'none' }}/>

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: 'max(16px, env(safe-area-inset-top)) 16px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(rgba(0,0,0,0.55), transparent)',
        }}>
          <button onClick={close} style={{
            background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: 18,
            color: '#fff', fontSize: 20, width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
          <span style={{ fontFamily: SERIF, fontSize: 13, fontStyle: 'italic',
            color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 6px rgba(0,0,0,0.80)' }}>
            Point at a plant
          </span>
          <div style={{ width: 36 }}/>
        </div>

        {/* Capture button */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px 0 max(36px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
          display: 'flex', justifyContent: 'center',
        }}>
          <button onClick={capture} style={{
            width: 72, height: 72, borderRadius: 36,
            background: 'rgba(255,255,255,0.95)',
            border: '4px solid rgba(255,255,255,0.35)',
            cursor: 'pointer', boxShadow: '0 2px 20px rgba(0,0,0,0.50)',
          }}/>
        </div>
      </div>
    );
  }

  // ── Identifying view ──────────────────────────────────────────────────
  if (phase === 'identifying') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {captured && (
          <img src={captured.dataUrl} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: 0.28,
          }}/>
        )}
        <div style={{ position: 'relative', textAlign: 'center', padding: '0 32px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontStyle: 'italic',
            color: 'rgba(240,220,180,0.92)', textShadow: '0 2px 10px rgba(0,0,0,0.80)', marginBottom: 6 }}>
            Looking it up…
          </div>
          <div style={{ fontFamily: MONO, fontSize: 6, color: 'rgba(212,168,48,0.55)',
            letterSpacing: 1, textShadow: '0 1px 4px rgba(0,0,0,0.80)' }}>
            IDENTIFYING PLANT
          </div>
        </div>
      </div>
    );
  }

  // ── Confirmation view ─────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: C.uiBg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: 'max(16px, env(safe-area-inset-top)) 16px 12px',
        borderBottom: `1px solid ${C.uiBorder}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={close} style={{
          background: 'none', border: 'none', color: C.uiMuted,
          fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
        }}>×</button>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 7, color: C.uiGold }}>
            {matches.length ? 'IS THIS YOUR PLANT?' : 'NO MATCH FOUND'}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 12, fontStyle: 'italic',
            color: 'rgba(240,220,180,0.50)', marginTop: 2 }}>
            {matches.length
              ? 'Confirm and the photo gets logged'
              : 'Try again with better lighting or a closer shot'}
          </div>
        </div>
      </div>

      {/* Captured thumbnail */}
      {captured && (
        <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
          <img src={captured.dataUrl} alt="" style={{
            width: '100%', maxHeight: 120, objectFit: 'cover',
            borderRadius: 8, border: `1px solid ${C.uiBorder}`, opacity: 0.80,
          }}/>
        </div>
      )}

      {/* Match list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 32px' }}>
        {matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0',
            fontFamily: SERIF, fontSize: 14, fontStyle: 'italic',
            color: 'rgba(240,220,180,0.35)' }}>
            Couldn't identify the plant.
          </div>
        )}

        {matches.map((m, i) => {
          const plantObj  = allPlants.find(p => p.id === m.plantId);
          const portrait  = portraits[m.plantId] || {};
          const isTopPick = i === 0;
          return (
            <div key={m.plantId} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0',
              borderTop: i > 0 ? `1px solid rgba(90,60,24,0.22)` : 'none',
            }}>
              <div style={{
                width: 52, height: 40, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                border: `1px solid rgba(160,130,80,0.22)`,
              }}>
                {plantObj && <PlantPortrait plant={plantObj} aiSvg={portrait.svg || null}/>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600,
                  color: C.uiText, lineHeight: 1.2 }}>{m.name}</div>
                {m.subtitle && (
                  <div style={{ fontFamily: SERIF, fontSize: 11, color: C.uiMuted, marginTop: 1 }}>
                    {m.subtitle}
                  </div>
                )}
                <div style={{ fontFamily: SERIF, fontSize: 11, fontStyle: 'italic',
                  color: 'rgba(240,220,180,0.48)', marginTop: 3, lineHeight: 1.4 }}>
                  {m.reason}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 5, marginTop: 4,
                  color: CONF_COLOR[m.confidence] || C.uiMuted }}>
                  {CONF_LABEL[m.confidence] || m.confidence}
                </div>
              </div>

              <button onClick={() => confirm(m)} style={{
                background: isTopPick ? C.uiGold : 'rgba(212,168,48,0.10)',
                border: `1px solid ${isTopPick ? C.uiGold : C.uiBorder}`,
                borderRadius: 8, padding: '10px 12px',
                color: isTopPick ? '#120c06' : C.uiGold,
                fontFamily: MONO, fontSize: 6, cursor: 'pointer',
                flexShrink: 0, letterSpacing: .3,
              }}>
                {isTopPick ? "THAT'S IT" : 'THIS ONE'}
              </button>
            </div>
          );
        })}

        {matches.length > 0 && (
          <button onClick={close} style={{
            width: '100%', marginTop: 4, padding: '13px',
            background: 'none', border: `1px solid rgba(90,60,24,0.35)`,
            borderRadius: 8, color: C.uiMuted, fontFamily: SERIF,
            fontSize: 13, fontStyle: 'italic', cursor: 'pointer',
          }}>
            None of these
          </button>
        )}
      </div>
    </div>
  );
}
