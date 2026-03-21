// usePhotos — photo state synced to Supabase Storage
// Initializes from localStorage instantly, then merges cloud photos on login.
// addPhoto writes locally first, uploads to Supabase in the background.
// On login: any photos taken as a guest (dataUrl only, no storagePath) are uploaded retroactively.

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

async function uploadPhoto(supabase, plantId, dataUrl, date) {
  const storagePath = `${plantId}/${Date.now()}.jpg`;
  const blob = dataUrlToBlob(dataUrl);
  await supabase.storage.from('plant-photos').upload(storagePath, blob, { contentType: 'image/jpeg' });
  await supabase.from('plant_photos').insert({ plant_id: plantId, storage_path: storagePath, taken_at: date });
  const { data: urlData } = supabase.storage.from('plant-photos').getPublicUrl(storagePath);
  return { storagePath, publicUrl: urlData?.publicUrl };
}

export function usePhotos({ user }) {
  const [allPhotos, setAllPhotos] = useState(loadAllFromLS);

  // On user change: upload pending guest photos, then merge cloud photos
  useEffect(() => {
    if (!supabase) return;

    async function sync() {
      // Step 1: If just logged in, retroactively upload any guest photos (dataUrl only, not yet in cloud)
      if (user) {
        const local = loadAllFromLS();
        for (const [plantId, photos] of Object.entries(local)) {
          for (const photo of photos) {
            if (photo.dataUrl && !photo.storagePath && !photo.url) {
              try {
                const { storagePath, publicUrl } = await uploadPhoto(supabase, plantId, photo.dataUrl, photo.date);
                if (publicUrl) {
                  setAllPhotos(prev => {
                    const updated = (prev[plantId] || []).map(p =>
                      p.dataUrl === photo.dataUrl ? { url: publicUrl, date: photo.date, storagePath } : p
                    );
                    saveToLS(plantId, updated);
                    return { ...prev, [plantId]: updated };
                  });
                }
              } catch {} // best-effort — keep local copy if upload fails
            }
          }
        }
      }

      // Step 2: Fetch all cloud photos and merge anything not already present locally
      const { data } = await supabase.from('plant_photos').select('*').order('taken_at');
      if (!data || data.length === 0) return;

      setAllPhotos(prev => {
        const next = { ...prev };
        const byPlant = {};
        data.forEach(row => { (byPlant[row.plant_id] = byPlant[row.plant_id] || []).push(row); });

        Object.entries(byPlant).forEach(([plantId, rows]) => {
          let merged = [...(next[plantId] || [])];
          rows.forEach(row => {
            const alreadyHave = merged.some(p =>
              p.storagePath === row.storage_path ||
              (p.date && Math.abs(new Date(p.date) - new Date(row.taken_at)) < 10000)
            );
            if (!alreadyHave) {
              const { data: { publicUrl } } = supabase.storage.from('plant-photos').getPublicUrl(row.storage_path);
              merged.push({ url: publicUrl, date: row.taken_at, storagePath: row.storage_path });
            }
          });
          merged = merged.sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-5);
          next[plantId] = merged;
          saveToLS(plantId, merged);
        });
        return next;
      });
    }

    sync().catch(() => {});
  }, [user]);

  const addPhoto = useCallback(async (plantId, dataUrl, date) => {
    // Immediate local update
    setAllPhotos(prev => {
      const updated = [...(prev[plantId] || []), { dataUrl, date }].slice(-5);
      saveToLS(plantId, updated);
      return { ...prev, [plantId]: updated };
    });

    // Upload to Supabase Storage in the background (only if logged in)
    if (supabase && user) {
      try {
        const { storagePath, publicUrl } = await uploadPhoto(supabase, plantId, dataUrl, date);
        // Swap dataUrl for public URL — keeps localStorage lean on iOS
        if (publicUrl) {
          setAllPhotos(prev => {
            const updated = (prev[plantId] || []).map(p =>
              p.dataUrl === dataUrl ? { url: publicUrl, date, storagePath } : p
            );
            saveToLS(plantId, updated);
            return { ...prev, [plantId]: updated };
          });
        }
      } catch (e) {
        console.warn('Photo upload failed:', e);
        // Keep local dataUrl copy — will retry on next login via guest upload queue
      }
    }
    // If not logged in: photo stays as dataUrl in localStorage and will upload when user signs in
  }, [user]);

  return { allPhotos, addPhoto };
}
