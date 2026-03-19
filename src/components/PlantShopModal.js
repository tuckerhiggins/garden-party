// PlantShopModal — 3-step flow: identify → advise → add to garden
// Works at the farmer's market: take photo → oracle advises → confirm details → drag to map

import React, { useState, useRef } from 'react';

const SERIF = '"Crimson Pro", Georgia, serif';
const MONO  = '"Press Start 2P", monospace';

const C = {
  bg: '#faf6ee', cardBg: '#faf6ee',
  border: 'rgba(160,130,80,0.20)',
  gold: '#d4a830', goldDark: '#a07820',
  text: '#2a1808', muted: '#907050', dim: '#a08060',
  appBg: '#f2ece0',
};

const PLANT_TYPES = [
  'annual','bulb','climbing-rose','evergreen','fern','grass',
  'herb','hydrangea','lavender','maple','other','rose',
  'serviceberry','shrub','succulent','tree','vine','wisteria',
];

const TYPE_EMOJIS = {
  'annual':'🌸','bulb':'🌷','climbing-rose':'🌹','evergreen':'🌲',
  'fern':'🌿','grass':'🌾','herb':'🌱','hydrangea':'💐',
  'lavender':'💜','maple':'🍁','other':'🌿','rose':'🌹',
  'serviceberry':'🌳','shrub':'🌳','succulent':'🪴','tree':'🌳',
  'vine':'🪢','wisteria':'🌸',
};

async function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.src = url;
  });
}

export function PlantShopModal({ onClose, onAdd, availableContainers = [], existingPlants = [], weather }) {
  const [step, setStep] = useState('capture'); // 'capture' | 'advising' | 'identified' | 'adding'
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [identification, setIdentification] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  // Add-form state (pre-filled from identification)
  const [name, setName]           = useState('');
  const [species, setSpecies]     = useState('');
  const [type, setType]           = useState('other');
  const [containerId, setContainerId] = useState('');
  const [newPotDesc, setNewPotDesc]   = useState('');
  const [special, setSpecial]     = useState('');

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    setPhotoDataUrl(dataUrl);
    setStep('advising');
    setError(null);
    e.target.value = '';

    try {
      const res = await fetch('/api/advise-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          gardenContext: {
            existingPlants: existingPlants.map(p => ({ name: p.name, type: p.type })),
            availableContainers,
            weather,
            season: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ', Zone 7b Brooklyn rooftop',
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const id = data.identification || {};
      setIdentification(id);
      setAdvice(data.advice || '');
      // Pre-fill form from oracle identification
      setName(id.name || '');
      setSpecies(id.species || '');
      setType(id.type || 'other');
      setStep('identified');
    } catch (err) {
      setError(err.message || 'Could not analyze photo. Check connection.');
      setStep('capture');
    }
  }

  function handleAdd() {
    if (!name || !containerId) return;
    const existingContainer = availableContainers.find(c => c.id === containerId);
    const containerDesc = containerId === 'new'
      ? (newPotDesc || 'New container')
      : existingContainer?.container || 'Container';

    const plant = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      species: species.trim() || undefined,
      type,
      color: identification?.color || '#6a9040',
      health: 'content',
      moveable: true,
      container: containerDesc,
      containerId: containerId !== 'new' ? containerId : null,
      pos: { x: 0.5, y: 0.5 },
      wall: 1,
      growth: 0,
      actions: ['water', 'photo', 'visit', 'fertilize', 'prune'],
      addedDate: new Date().toISOString(),
      advisoryNote: advice || '',
      special: special || null,
      lore: `Added ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.${advice ? ' ' + advice : ''}`,
    };
    onAdd(plant);
  }

  const stepLabel = {
    capture: 'NEW PLANT',
    advising: 'READING...',
    identified: 'ORACLE SAYS',
    adding: 'ADD TO GARDEN',
  }[step];

  const canAdd = name.trim() && containerId;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:300,padding:16}}>
      <div style={{width:'100%',maxWidth:460,background:C.bg,borderRadius:14,overflow:'hidden',
        boxShadow:'0 16px 60px rgba(0,0,0,0.4)',border:`1px solid ${C.border}`,
        maxHeight:'90vh',display:'flex',flexDirection:'column'}}>

        {/* Header */}
        <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,
          display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,
          background:C.appBg}}>
          <span style={{fontFamily:MONO,fontSize:8,color:C.gold,letterSpacing:.5}}>{stepLabel}</span>
          <button onClick={onClose}
            style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:0}}>
            ×
          </button>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>

          {/* ── CAPTURE / ADVISING ── */}
          {(step === 'capture' || step === 'advising') && (
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:16,alignItems:'center'}}>
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Plant"
                  style={{width:'100%',maxHeight:220,objectFit:'cover',borderRadius:8,
                    border:`1px solid ${C.border}`}}/>
              ) : (
                <div style={{width:'100%',height:200,background:'rgba(160,130,80,0.06)',
                  border:`2px dashed rgba(160,130,80,0.22)`,borderRadius:10,
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  gap:8,cursor:'pointer'}}
                  onClick={() => fileRef.current?.click()}>
                  <span style={{fontSize:40}}>📸</span>
                  <span style={{fontSize:14,color:C.muted,fontFamily:SERIF,fontStyle:'italic'}}>
                    Take a photo of the plant
                  </span>
                  <span style={{fontSize:12,color:'rgba(160,130,80,0.55)',fontFamily:SERIF}}>
                    At the market, nursery, or a friend's garden
                  </span>
                </div>
              )}

              {step === 'advising' && (
                <div style={{display:'flex',alignItems:'center',gap:10,color:C.muted,fontFamily:SERIF,fontSize:13}}>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  <div style={{width:14,height:14,borderRadius:'50%',border:`2px solid ${C.gold}`,
                    borderTopColor:'transparent',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
                  The oracle is reading the plant…
                </div>
              )}

              {error && (
                <div style={{fontSize:12,color:'#c07050',fontFamily:SERIF,textAlign:'center',maxWidth:320}}>
                  {error}
                </div>
              )}

              {step === 'capture' && (
                <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                  {photoDataUrl && (
                    <button onClick={() => { setPhotoDataUrl(null); }}
                      style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,
                        padding:'8px 18px',color:C.muted,fontFamily:SERIF,fontSize:13,cursor:'pointer'}}>
                      Retake
                    </button>
                  )}
                  <button onClick={() => fileRef.current?.click()}
                    style={{background:C.gold,border:'none',borderRadius:6,padding:'10px 24px',
                      color:'#1c1008',fontFamily:MONO,fontSize:8,cursor:'pointer',letterSpacing:.5}}>
                    {photoDataUrl ? 'NEW PHOTO' : '📷  TAKE PHOTO'}
                  </button>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                style={{display:'none'}} onChange={handleFile}/>
            </div>
          )}

          {/* ── ORACLE ADVISORY ── */}
          {step === 'identified' && (
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>
              {photoDataUrl && (
                <img src={photoDataUrl} alt="Plant"
                  style={{width:'100%',maxHeight:160,objectFit:'cover',borderRadius:8,
                    border:`1px solid ${C.border}`}}/>
              )}

              {/* Advisory card */}
              <div style={{background:'rgba(18,12,6,0.04)',borderRadius:9,padding:16,
                border:`1px solid rgba(160,130,80,0.15)`}}>
                <div style={{fontFamily:MONO,fontSize:7,color:C.gold,letterSpacing:.5,marginBottom:10}}>
                  {TYPE_EMOJIS[identification?.type] || '🌿'}&nbsp;
                  {(identification?.name || 'UNKNOWN PLANT').toUpperCase()}
                  {identification?.species && (
                    <span style={{color:C.dim,fontWeight:'normal',textTransform:'none',
                      fontFamily:SERIF,fontSize:10,marginLeft:6,fontStyle:'italic'}}>
                      {identification.species}
                    </span>
                  )}
                </div>
                <div style={{fontFamily:SERIF,fontSize:13.5,color:C.text,lineHeight:1.75}}>
                  {advice}
                </div>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={onClose}
                  style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,
                    padding:'9px 20px',color:C.muted,fontFamily:SERIF,fontSize:13,cursor:'pointer'}}>
                  Skip it
                </button>
                <button onClick={() => setStep('adding')}
                  style={{background:C.gold,border:'none',borderRadius:6,padding:'9px 22px',
                    color:'#1c1008',fontFamily:MONO,fontSize:8,cursor:'pointer',letterSpacing:.5}}>
                  I BOUGHT IT →
                </button>
              </div>
            </div>
          )}

          {/* ── ADD FORM ── */}
          {step === 'adding' && (
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>

              <FormField label="NAME" value={name} onChange={setName} placeholder="What are you calling it?" />
              <FormField label="SPECIES (OPTIONAL)" value={species} onChange={setSpecies}
                placeholder="e.g. Pelargonium × hortorum" />

              {/* Type */}
              <div>
                <div style={{fontFamily:MONO,fontSize:7,color:C.dim,letterSpacing:.5,marginBottom:6}}>TYPE</div>
                <select value={type} onChange={e => setType(e.target.value)}
                  style={selectStyle}>
                  {PLANT_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_EMOJIS[t] || '🌿'} {t.replace(/-/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Container */}
              <div>
                <div style={{fontFamily:MONO,fontSize:7,color:C.dim,letterSpacing:.5,marginBottom:6}}>CONTAINER</div>
                <select value={containerId} onChange={e => setContainerId(e.target.value)}
                  style={selectStyle}>
                  <option value="">— choose a container —</option>
                  {availableContainers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} · {c.container}</option>
                  ))}
                  <option value="new">+ New container (I bought one)</option>
                </select>
              </div>

              {containerId === 'new' && (
                <FormField label="DESCRIBE THE NEW CONTAINER" value={newPotDesc} onChange={setNewPotDesc}
                  placeholder="e.g. Large terracotta, blue glazed ceramic…" />
              )}

              {/* Special */}
              <div>
                <div style={{fontFamily:MONO,fontSize:7,color:C.dim,letterSpacing:.5,marginBottom:6}}>SPECIAL?</div>
                <select value={special} onChange={e => setSpecial(e.target.value)}
                  style={selectStyle}>
                  <option value="">None</option>
                  <option value="wedding">♥ Wedding gift for Emma</option>
                  <option value="gift">★ Gift from a friend</option>
                </select>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:4}}>
                <button onClick={() => setStep('identified')}
                  style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,
                    padding:'9px 20px',color:C.muted,fontFamily:SERIF,fontSize:13,cursor:'pointer'}}>
                  Back
                </button>
                <button onClick={handleAdd} disabled={!canAdd}
                  style={{background:canAdd ? C.gold : 'rgba(160,130,80,0.25)',border:'none',
                    borderRadius:6,padding:'10px 22px',
                    color:canAdd ? '#1c1008' : C.muted,
                    fontFamily:MONO,fontSize:8,
                    cursor:canAdd ? 'pointer' : 'default',letterSpacing:.5,
                    transition:'all .12s'}}>
                  ADD TO GARDEN →
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div style={{fontFamily:MONO,fontSize:7,color:'#907050',letterSpacing:.5,marginBottom:6}}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:'#fff',border:'1px solid rgba(160,130,80,0.20)',
          borderRadius:5,padding:'8px 10px',color:'#2a1808',fontSize:13,outline:'none',
          boxSizing:'border-box',fontFamily:SERIF}}/>
    </div>
  );
}

const selectStyle = {
  width:'100%',background:'#fff',border:'1px solid rgba(160,130,80,0.20)',borderRadius:5,
  padding:'8px 10px',color:'#2a1808',fontSize:13,fontFamily:SERIF,outline:'none',
  boxSizing:'border-box',
};
