# Garden Party — Improvements Plan
*Expert panel audit 2026-04-01. Work through phases in order. Each item has a checkbox — check it off when done.*

---

## How to use this
Say **"what's next?"** to implement the next unchecked item. Items within a phase can sometimes be batched.

---

## Phase 1 — Quick Bug Fixes
*Mostly 1–5 line changes. Do these first.*

- [x] **B3 · Rain threshold too low** — `App.js` line ~2342. `if (today.precip <= 1)` should be `<= 5` (Open-Meteo returns mm; 1mm is a sprinkle, not meaningful rain). Also update the auto-rain label calculation.
- [x] **B1 · Emma's actions not attributed** — `App.js` ~line 2407. `const isWithEmma = false` is hardcoded. Should be `const isWithEmma = role === 'emma'`. Emma's care actions then get warmth bonus + journal attribution.
- [x] **B6 · MobileMapProtos wrong `computeWaterLevel` args** — `src/components/MobileMapProtos.js` line ~51. `portrait?.waterDays ? portrait : null` drops portrait data when `waterDays` is falsy. Fix to `portrait || null`. Also pass `weather` as the 4th arg so temperature-adjusted drain rates apply in the mobile map water display.
- [x] **B5 · `parsePastDate` duplicated** — Lives verbatim in both `App.js` (~line 1251) and `MobileView.js` (~line 131). Extract to `src/utils/dates.js`, import in both places.
- [x] **AI3 · `fetchPlantBriefing` task cap not enforced** — `src/claude.js` ~line 351. After parsing `tasks` from Claude's JSON, add `.slice(0, 2)` to match the "0–2 tasks max" in the prompt. Prevents task count inflation.
- [x] **AI1 · Oracle re-fires after every completed task** — `App.js` ~line 2133. The oracle `useEffect` dep array includes `rawAgendaKeys`, which changes every time a task is completed. Remove it — oracle should be frozen daily. The cache key already handles dedup.
- [x] **Design4 · Day-of-week "ideal conditions" rotation is random** — `MapInfoPanel.js` lines ~101–104. The `notes` array cycling on `dow` shows "prune window" on Mondays regardless of whether pruning is due. Replace with a static "Good conditions — see care plan" or remove the note entirely.
- [x] **Design1 · Counter language misleads after task completion** — Mobile `TodayAgenda` header shows "N essential" (frozen total) even after all N are done. Change to "N done / M total" format so it reads as progress, not a fixed count.

---

## Phase 2 — Medium Fixes
*Slightly more involved — architectural or multi-file.*

- [x] **B2 · Auto-rain fires before Supabase settles** — `App.js` lines ~2337–2349. The auto-rain `useEffect` has no `!dbLoading` guard (unlike the backfill effect). Add `if (!weather || dbLoading) return;` to prevent double-logging on load.
- [x] **AI6 · Morning brief cache key uses unstable labels** — `src/claude.js` ~line 444. The `taskToken` includes `t.label || t.actionKey` — Claude's labels are non-deterministic and bust the daily cache. Change to `t.actionKey` only for stable cache keys.
- [x] **AI7 · Journal log re-fetches on every map remount** — `MapInfoPanel.js` `PanelJournalLog`. The `entries` local state resets to `{}` on every unmount. Cache entries in `sessionStorage` keyed by `date + versionKey` so navigating away and back doesn't re-fire Claude calls.
- [x] **Gardening4 · Neem temperature warning missing** — `src/data/plants.js` `ACTION_HOWTO.neem.default`. Add: "Do not apply when temperatures exceed 90°F — causes leaf burn." Also add "Taper off in July–August heat."
- [x] **Gardening7 · No loggable frost-protection action** — Add a `shelter` action to `ACTION_DEFS` in `src/data/plants.js` (emoji: 🧊, label: "Cover & Shelter", cooldown: 0.5 days). Add it to the `actions` array of frost-sensitive plants (climbing roses, rose, serviceberry). This gives the care log memory of frost events.

---

## Phase 3 — Features & Larger Improvements
*Bigger scope. Plan before implementing.*

- [x] **Watering cooldown should use drain rate** — `src/utils/agenda.js`. Replace the hard 1-day water cooldown with `max(0.5, drainDays / 2)` using `smartWaterDays()` from `health.js`. Prevents plants from showing "overlooked" when they genuinely need water but the cooldown gate blocks it.
- [x] **Hydrangea pruning phenological guard** — Limelight hydrangeas must be pruned before bud break (≈Feb 20 – March 25 in Zone 7b). `actionStatus` now blocks prune for hydrangeas outside this window with reason "Past prune window" or "Too early".
- [x] **Portrait analysis failure feedback** — When `/api/analyze-plant` fails or returns null SVG, show a "tap to retry" badge instead of silently reverting to the generic portrait. Touch point: `PhotoSection` in `App.js` now shows "Analysis failed — tap to retry ↺" on error.
- [x] **Agenda freeze should wait for AI data** — `App.js` freeze `useEffect`. Add `if (!agendaData) return;` so the freeze doesn't capture the heuristic fallback list before Claude's enriched ordering arrives.
- [x] **Overlooked threshold differentiation** — `src/utils/health.js`. Plants that are drought-tolerant / established (lavender, evergreen, wisteria, maple) should have a 28–35 day overlooked threshold. Only containerized roses and climbers keep the 21-day rule.
- [x] **B4 · Dead `seasonBlocking` branches** — `MapInfoPanel.js` lines ~315–317 reference `rain-today` and `rain-tomorrow` blocking states that `App.js` never assigns. Remove the dead branches.
- [x] **Emma warmth multiplier — UI acknowledgment** — Flash confirmation now shows "with Emma ♥" when care is logged while Emma is the active role.

---

## Phase 4 — Nice to Have
*Lower priority. Revisit when the above is done.*

- [ ] **Seasonal training cooldown for wisteria** — Modulate the 7-day training cooldown to 14-day after June 21 (summer solstice). Low stakes, minor quality of life.
- [ ] **Tilt-to-camera tooltip on first use** — Show a one-time hint ("tilt phone sideways to identify a plant") after first app load. Dismiss on tap. Store dismissal in localStorage.
- [ ] **Stage arc labels respect high-contrast mode** — Past/future stage name labels use hardcoded `rgba(160,130,80,0.40)` color. When `useCC()` is in high-contrast mode, use `CC.dim` instead so they're readable outdoors.
- [ ] **Rain threshold advisory for neem** — When upcoming rain is forecast and neem is due, surface: "Apply neem before Wednesday's rain — rain after application reduces efficacy."
