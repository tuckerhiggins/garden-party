// usePhotos — photo state synced to Supabase Storage
// Initializes from localStorage instantly, then merges cloud photos on login.
// addPhoto writes locally first, uploads to Supabase in the background.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

function loadAllFromLS() {
  const result = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('gp_photos_')) {
        const plantId = key.slice(10);
        try { result[plantId] = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
      }
    }
  } catch {}
  return result;
}

function saveToLS(plantId, photos) {
  try { localStorage.setItem('gp_photos_' + plantId, JSON.stringify(photos)); } catch {}
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function usePhotos({ user }) {
  const [allPhotos, setAllPhotos] = useState(loadAllFromLS);

  // On login: fetch cloud photos and merge anything not already present locally
  useEffect(() => {
    if (!supabase) return;
    supabase.from('plant_photos').select('*').order('taken_at')
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setAllPhotos(prev => {
          const next = { ...prev };
          // Group cloud rows by plantId
          const byPlant = {};
          data.forEach(row => {
            (byPlant[row.plant_id] = byPlant[row.plant_id] || []).push(row);
          });
          Object.entries(byPlant).forEach(([plantId, rows]) => {
            let merged = [...(next[plantId] || [])];
            rows.forEach(row => {
              const alreadyHave = merged.some(p =>
                p.storagePath === row.storage_path ||
                (p.date && Math.abs(new Date(p.date) - new Date(row.taken_at)) < 10000)
              );
              if (!alreadyHave) {
                const { data: { publicUrl } } = supabase.storage
                  .from('plant-photos')
                  .getPublicUrl(row.storage_path);
                merged.push({ url: publicUrl, date: row.taken_at, storagePath: row.storage_path });
              }
            });
            merged = merged.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-5);
            next[plantId] = merged;
            saveToLS(plantId, merged);
          });
          return next;
        });
      })
      .catch(() => {});
  }, [user]);

  const addPhoto = useCallback(async (plantId, dataUrl, date) => {
    // Immediate local update
    setAllPhotos(prev => {
      const updated = [...(prev[plantId] || []), { dataUrl, date }].slice(-5);
      saveToLS(plantId, updated);
      return { ...prev, [plantId]: updated };
    });

    // Upload to Supabase Storage in the background
    if (supabase && user) {
      try {
        const storagePath = `${plantId}/${Date.now()}.jpg`;
        const blob = dataUrlToBlob(dataUrl);
        await supabase.storage.from('plant-photos').upload(storagePath, blob, {
          contentType: 'image/jpeg',
        });
        await supabase.from('plant_photos').insert({
          plant_id: plantId, storage_path: storagePath, taken_at: date,
        });
        // Swap dataUrl for the public URL — frees up localStorage space on iOS
        const { data: urlData } = supabase.storage.from('plant-photos').getPublicUrl(storagePath);
        if (urlData?.publicUrl) {
          setAllPhotos(prev => {
            const updated = (prev[plantId] || []).map(p =>
              p.dataUrl === dataUrl ? { url: urlData.publicUrl, date, storagePath } : p
            );
            saveToLS(plantId, updated);
            return { ...prev, [plantId]: updated };
          });
        }
      } catch (e) {
        console.warn('Photo upload failed:', e);
      }
    }
  }, [user]);

  return { allPhotos, addPhoto };
}
