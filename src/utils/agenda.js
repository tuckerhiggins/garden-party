// src/utils/agenda.js
// Shared agenda computation — single source of truth for both Maps page and Mobile Today tab.
// Both views call computeAgenda with the same inputs so they always show identical tasks.

import { ACTION_DEFS } from '../data/plants';

export const AGENDA_SKIP_ACTIONS = new Set(['photo', 'visit', 'note', 'plant']);
export const AGENDA_URGENT_HEALTH = new Set(['struggling', 'thirsty', 'overlooked']);
export const AGENDA_TIER = { urgent: 0, recommended: 1, routine: 2, optional: 3 };
export const AGENDA_HEALTH_SEV = { struggling: 0, thirsty: 1, overlooked: 2 };

export function actionStatus(plant, key, careLog, seasonOpen) {
  if (!seasonOpen) return { available: false, reason: 'Not yet open' };
  const def = ACTION_DEFS[key]; if (!def) return { available: false, reason: '?' };
  // Water is suppressed for 1 day after any watering OR rain event.
  // Must check BEFORE alwaysAvailable since water has alwaysAvailable:true.
  if (key === 'water') {
    const recentLog = (careLog[plant.id] || []).filter(e => e.action === 'water' || e.action === 'rain');
    if (recentLog.length > 0) {
      const last = new Date(recentLog[recentLog.length - 1].date);
      const days = (Date.now() - last.getTime()) / 86400000;
      if (days < 1) return { available: false, reason: 'Recently watered' };
    }
  }
  if (def.alwaysAvailable) return { available: true };
  const entries = (careLog[plant.id] || []).filter(e => e.action === key);
  if (def.seasonMax !== null && entries.length >= def.seasonMax)
    return { available: false, reason: 'Done for season' };
  if (def.cooldownDays > 0 && entries.length > 0) {
    const last = new Date(entries[entries.length - 1].date);
    const days = (Date.now() - last.getTime()) / 86400000;
    if (days < def.cooldownDays)
      return { available: false, reason: `${Math.ceil(def.cooldownDays - days)}d` };
  }
  return { available: true };
}

// Detects "On the morning of [Month Day]" in task instructions and returns
// the date string if it's in the future — used to push frost-check / post-event
// tasks out of the TODAY tier until they're actually actionable.
export function extractFutureActionDate(instructions) {
  if (!instructions) return null;
  const m = instructions.match(/\bOn the morning of ([A-Za-z]+ \d{1,2})\b/i);
  if (!m) return null;
  const parsed = new Date(m[1] + ', ' + new Date().getFullYear());
  if (isNaN(parsed.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return parsed > today ? m[1] : null;
}

/**
 * Compute today's care agenda from plant data and briefings.
 * Returns { items, isWeekend } where items is sorted by priority.
 * Items have format:
 *   { key, plant, plantId, plantName, plantType, plantHealth,
 *     actionKey, task, priority, reason, section }
 */
export function computeAgenda({ plants, frontPlants, careLog, briefings, weather, seasonOpen, allPhotos = {} }) {
  if (!seasonOpen) return { items: [], isWeekend: false };
  const isWeekend = [0, 6].includes(new Date().getDay());
  const emmaPlantsSet = new Set(frontPlants.map(p => p.id));
  const rainedToday = (weather?.forecast?.[0]?.precip > 1) || (weather?.forecast?.[0]?.precipChance >= 70);
  const hasRainSoon = rainedToday || weather?.forecast?.slice(0, 2).some(d => d.precipChance >= 60);
  const hasFrostSoon = weather?.forecast?.slice(0, 2).some(d => d.low <= 35);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const items = [];

  for (const plant of [...plants, ...frontPlants]) {
    if (plant.type === 'empty-pot' || plant.health === 'memorial') continue;
    const brief = briefings[plant.id];
    const briefTasks = Array.isArray(brief?.tasks) ? brief.tasks : [];
    const briefTaskKeys = new Set(briefTasks.map(t => t.key));
    const isUrgent = AGENDA_URGENT_HEALTH.has(plant.health);
    const section = emmaPlantsSet.has(plant.id) ? 'emma' : 'terrace';

    // AI-recommended tasks (may include novel/custom tasks not in plant.actions)
    for (const task of briefTasks) {
      if (AGENDA_SKIP_ACTIONS.has(task.key)) continue;
      if (task.key !== 'tend' && !actionStatus(plant, task.key, careLog, seasonOpen).available) continue;
      if (task.key === 'water' && hasRainSoon && !isUrgent) continue;
      if (task.key === 'neem' && hasRainSoon) continue;

      const isTaskOptional = task.optional === true;
      const priority = isTaskOptional ? 'optional' : isUrgent ? 'urgent' : hasFrostSoon ? 'urgent' : 'recommended';
      if (!isWeekend && priority === 'routine') continue;

      items.push({
        key: task.key === 'tend' ? `${plant.id}:tend:${task.label || ''}` : `${plant.id}:${task.key}`,
        plant, plantId: plant.id, plantName: plant.name,
        plantType: plant.type, plantHealth: plant.health,
        actionKey: task.key, task,
        priority,
        reason: task.reason || brief?.note || null,
        section,
      });
    }

    // Urgency-driven items from plant.actions not already covered by AI tasks
    if (isUrgent) {
      for (const actionKey of (plant.actions || [])) {
        if (AGENDA_SKIP_ACTIONS.has(actionKey)) continue;
        if (briefTaskKeys.has(actionKey)) continue;
        if (!actionStatus(plant, actionKey, careLog, seasonOpen).available) continue;
        if (actionKey === 'water' && hasRainSoon) continue;
        if (actionKey === 'neem' && hasRainSoon) continue;

        items.push({
          key: `${plant.id}:${actionKey}`,
          plant, plantId: plant.id, plantName: plant.name,
          plantType: plant.type, plantHealth: plant.health,
          actionKey, task: null,
          priority: 'urgent',
          reason: brief?.note || null,
          section,
        });
      }
    }

    // When briefing hasn't loaded yet, fall back to plant.actions for routine items
    if (!brief) {
      for (const actionKey of (plant.actions || [])) {
        if (AGENDA_SKIP_ACTIONS.has(actionKey)) continue;
        if (!actionStatus(plant, actionKey, careLog, seasonOpen).available) continue;
        if (actionKey === 'water' && hasRainSoon && !isUrgent) continue;
        if (actionKey === 'neem' && hasRainSoon) continue;

        const priority = isUrgent ? 'urgent' : hasFrostSoon ? 'recommended' : 'routine';
        if (!isWeekend && priority === 'routine') continue;

        items.push({
          key: `${plant.id}:${actionKey}`,
          plant, plantId: plant.id, plantName: plant.name,
          plantType: plant.type, plantHealth: plant.health,
          actionKey, task: null,
          priority,
          reason: null,
          section,
        });
      }
    }

    // Photo-due check: 7+ days without a photo → prompt as care action
    const alreadyPhotoedToday = (careLog[plant.id] || []).some(
      e => e.action === 'photo' && e.date?.slice(0, 10) === todayStr
    );
    if (!alreadyPhotoedToday) {
      const plantPhotos = allPhotos[plant.id] || [];
      const lastPhotoMs = plantPhotos.length
        ? Math.max(...plantPhotos.map(ph => new Date(ph.date).getTime()))
        : 0;
      const daysSincePhoto = lastPhotoMs ? (nowMs - lastPhotoMs) / 86400000 : Infinity;
      if (daysSincePhoto >= 7) {
        const photoKey = `${plant.id}:photo`;
        if (!items.some(i => i.key === photoKey)) {
          items.push({
            key: photoKey,
            plant, plantId: plant.id, plantName: plant.name,
            plantType: plant.type, plantHealth: plant.health,
            actionKey: 'photo',
            task: {
              key: 'photo', label: 'Document', emoji: '📷',
              instructions: 'Photograph the plant to track its progress.',
            },
            priority: 'recommended',
            reason: daysSincePhoto === Infinity
              ? 'No photos yet — document how it looks now.'
              : `${Math.floor(daysSincePhoto)} days since last photo.`,
            section,
          });
        }
      }
    }
  }

  items.sort((a, b) => {
    const td = AGENDA_TIER[a.priority] - AGENDA_TIER[b.priority];
    if (td !== 0) return td;
    return (AGENDA_HEALTH_SEV[a.plantHealth] ?? 3) - (AGENDA_HEALTH_SEV[b.plantHealth] ?? 3);
  });

  return { items, isWeekend };
}
