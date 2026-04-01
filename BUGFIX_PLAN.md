# Garden Party Bug Fix Plan
*Written 2026-03-31. Execute this in one session after compaction.*

---

## Bug 1 — "Done All" double-marks one wisteria, skips the other

**Root cause:** The "✓ All" button in MapInfoPanel.js (MapCarePanel) uses `forEach` to call `onAction` for each plant in the group. `forEach` does not await async calls — all calls fire simultaneously. If `logAction` reads state from a closure (stale capture) rather than a function updater, two parallel writes to different plants can interfere. Additionally: check whether `logAction` uses `setCareLog(prev => ...)` (function updater, safe) or `setCareLog({...careLog, ...})` (stale capture, broken for parallel calls).

**Files to fix:**
- `src/components/MapInfoPanel.js` — the "✓ All" button (~line 1138): change `groupItems.forEach(i => onAction?.(i.actionKey, i.plant, i.task?.label))` to a sequential async handler:
  ```js
  onClick={async e => {
    e.stopPropagation();
    for (const i of groupItems) {
      await onAction?.(i.actionKey, i.plant, i.task?.label);
    }
  }}
  ```
- `src/components/MobileView.js` — the equivalent "✓ All" button in TodayAgenda (same pattern, same fix).
- Also check `src/hooks/useCareLog.js` (or wherever `logAction` / `setCareLog` lives) — verify state update uses function updater: `setCareLog(prev => { const next = {...prev}; ...; return next; })` not `setCareLog({...careLog, [id]: ...})`.

---

## Bug 2 — Magnolia portrait not refreshing on new photos

**Root cause candidates:**
a) The `onPortraitUpdate` prop passed to the magnolia's PhotoSection isn't wiring correctly to App.js's `updatePortrait`
b) The photo upload calls `onAnalyze` (in DetailPanel's PhotoSection) which calls a different function path than the mobile flow
c) There's a name/ID mismatch — the magnolia might have a plant ID like `'magnolia'` in one place and `'magnolia-1'` in another, so `portraits['magnolia']` doesn't match

**Files to check:**
- `src/App.js` — find where DetailPanel passes `onAnalyze`. Should be `onAnalyze={updatePortrait}`. Verify the call site.
- `src/App.js` — `updatePortrait` function. Verify it's using function updater for `setPortraits`.
- `src/data/plants.js` — check the magnolia's `id` field matches what's used as portrait key.
- `src/App.js` — in `PhotoSection`, check if `onAnalyze(plant.id, data)` is called with the plant's actual ID.

**Likely fix:** In `src/App.js` DetailPanel call site, confirm `onAnalyze={updatePortrait}` is passed (not missing). In `PhotoSection` component, confirm the analysis result is written as `onAnalyze(plant.id, analysisResult)` where `plant.id` matches the portrait store key.

---

## Bug 3 — Counter always 0/X, completing tasks adds new tasks instead of marking done

**Root cause:** `agendaSections` is derived from `pendingAgendaItems` which re-computes from `sharedAgendaItems` on every `careLog` change. When you water a plant, `actionStatus` returns `available: false` for water (cooldown triggered), so that item drops out of `sharedAgendaItems`. Result: the total shrinks, the completed item disappears from the list, and the AI briefing may add new tasks to fill the gap. The counter never goes above 0 because completed items are immediately removed from the source list.

**Fix — freeze the daily agenda:**

### Step 1: Add frozen agenda to App.js state

```js
// In App.js, near other useState declarations:
const [frozenAgendaDate, setFrozenAgendaDate] = useState(null);
const [frozenEssential, setFrozenEssential] = useState([]); // frozen today-items (essential)
const [frozenOptional, setFrozenOptional] = useState([]);   // frozen opt-items
```

### Step 2: Load frozen agenda from localStorage on mount

```js
// In App.js, in the main useEffect or a dedicated useEffect:
useEffect(() => {
  const todayStr = localDate();
  try {
    const saved = JSON.parse(localStorage.getItem('gp_frozen_agenda_v1') || 'null');
    if (saved && saved.date === todayStr) {
      setFrozenAgendaDate(todayStr);
      setFrozenEssential(saved.essential || []);
      setFrozenOptional(saved.optional || []);
    }
  } catch {}
}, []);
```

### Step 3: Freeze the agenda once per day when pendingAgendaItems first loads

```js
// In App.js, in a useEffect watching pendingAgendaItems:
useEffect(() => {
  const todayStr = localDate();
  if (frozenAgendaDate === todayStr) return; // already frozen today
  if (!pendingAgendaItems.length) return; // not loaded yet
  if (!seasonOpen) return;

  const essential = pendingAgendaItems
    .filter(i => (i.priority === 'urgent' || i.priority === 'recommended') && !extractFutureActionDate(i.task?.instructions))
    .slice(0, 6);
  const optional = pendingAgendaItems
    .filter(i => i.priority === 'optional')
    .slice(0, 5);

  setFrozenEssential(essential);
  setFrozenOptional(optional);
  setFrozenAgendaDate(todayStr);
  try {
    localStorage.setItem('gp_frozen_agenda_v1', JSON.stringify({
      date: todayStr,
      essential,
      optional,
    }));
  } catch {}
}, [pendingAgendaItems, frozenAgendaDate, seasonOpen]);
```

### Step 4: Change agendaSections to use frozen list

```js
const agendaSections = useMemo(() => {
  const todayStr = localDate();
  function isDoneToday(item) {
    const entries = careLog[item.plantId] || [];
    if (item.actionKey === 'tend') return entries.some(e => e.action === 'tend' && e.label === (item.task?.label || '') && e.date && localDate(e.date) === todayStr);
    return entries.some(e => e.action === item.actionKey && e.date && localDate(e.date) === todayStr);
  }
  // Use frozen lists — these never change until next morning or manual refresh
  const essentialItems = frozenEssential; // already capped at 6
  const optItems = frozenOptional;        // already capped at 5
  const essentialTotal = essentialItems.length;
  const essentialDone = essentialItems.filter(i => isDoneToday(i)).length;
  // todayItems: ALL essential items (done + not-done), for display with strikethrough
  // optItems: ALL optional items (done + not-done)
  return { essentialTotal, essentialDone, todayItems: essentialItems, optItems };
}, [frozenEssential, frozenOptional, careLog]);
```

### Step 5: Show completed tasks struck-through in MapCarePanel + MobileView

In `MapInfoPanel.js` MapCarePanel, when rendering individual task items and group cards, add completion check:
```js
const isDone = isDoneToday(item); // function must be available in render scope
```

For individual items:
```jsx
<div style={{ opacity: isDone ? 0.5 : 1, textDecoration: isDone ? 'line-through' : 'none' }}>
  {/* existing item card content */}
  {isDone && <span style={{ color: '#58c030' }}>✓</span>}
</div>
```

For group cards: show "X/N done" instead of hiding done plants.

Pass `isDoneToday` helper into MapCarePanel from App.js (or recompute it inside).

Apply same pattern in MobileView.js TodayAgenda.

### Step 6: Manual refresh clears frozen agenda

The existing "refresh briefings" button in App.js should also clear the frozen agenda:
```js
// In the refresh handler:
setFrozenAgendaDate(null);
setFrozenEssential([]);
setFrozenOptional([]);
localStorage.removeItem('gp_frozen_agenda_v1');
```

### Step 7: Auto-refresh at 6:30 AM (optional but nice)

```js
useEffect(() => {
  const checkTime = () => {
    const now = new Date();
    if (now.getHours() === 6 && now.getMinutes() >= 30) {
      const todayStr = localDate();
      if (frozenAgendaDate !== todayStr) return; // already on today
      // Trigger refresh at 6:30
      setFrozenAgendaDate(null);
    }
  };
  const interval = setInterval(checkTime, 60000);
  return () => clearInterval(interval);
}, [frozenAgendaDate]);
```

---

## Bug 4 — Neem task for one climbing rose but not both

**No code change needed.** Each plant gets its own AI briefing independently. One rose may have a slightly different health/observation state (different portrait notes, different last neem date) that justifies different recommendations. Tucker acknowledged this and said not to overcorrect.

---

## Bug 5 — Mobile: replace tilt-to-photo button with camera → plant ID flow

**Find the tilt button:** In `src/components/MobileView.js`, search for "DeviceOrientation", "tilt", "gyro", or the button label. It's probably in the main Today or Garden view as a floating action button.

**Replace with:** A camera button that:
1. Opens the camera (`fileRef.current.click()` with `capture="environment"`)
2. Feeds into the existing plant identification flow (likely `handleFiles` + analysis)

**Specific change in MobileView.js:**

Find the tilt button (likely something like):
```jsx
<button onClick={() => { /* request DeviceOrientationEvent */ }}>
  📐 Tilt to photo
</button>
```

Replace with:
```jsx
<button onClick={() => {
  cameraRef.current.click();
}}>
  📷 Identify Plant
</button>
<input
  ref={cameraRef}
  type="file"
  accept="image/*"
  capture="environment"
  style={{ display: 'none' }}
  onChange={handleCameraIdentify}
/>
```

The `handleCameraIdentify` function should:
1. Compress the photo (reuse `compressImage`)
2. Post to `/api/analyze-plant` with a flag that this is an "identify" request (no existing plant context)
3. Show the result in the plant ID modal/flow (already exists)

OR: just wire it to trigger the existing photo + identification modal with a blank plant context.

**Check existing plant ID flow:** Search MobileView.js for "identify" or "PlantId" to find the existing UI. The new camera button should trigger the same modal/flow that the existing plant identification entry point uses.

---

## Execution Order

1. Bug 3 (frozen agenda) — biggest architectural change, do first
2. Bug 1 ("Done All" sequential) — small but important fix
3. Bug 5 (mobile camera button) — UI change
4. Bug 2 (magnolia portrait) — requires investigation first, then targeted fix
5. Test all together, push

## Key files

- `src/App.js` — agendaSections, frozenAgenda state, updatePortrait wiring
- `src/components/MapInfoPanel.js` — "✓ All" button, task display with strikethrough
- `src/components/MobileView.js` — "✓ All" button, tilt button replacement, TodayAgenda display
- `src/hooks/useCareLog.js` — logAction function updater check
- `src/utils/agenda.js` — computeAgenda (read-only reference)
