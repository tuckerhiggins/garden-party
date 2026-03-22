// src/utils/phenology.js
// Zone 7b Brooklyn rooftop phenological calendar — date-based stage fallback.
// Returns a short stage string for display when no AI portrait stage is available.
//
// ROOFTOP OFFSET: The terrace is elevated and south-facing, creating a heat-island
// effect that accelerates spring emergence and bloom by ~12 days vs. ground level.
// All callers default to this offset; pass offsetDays=0 to get ground-level timing.

// Rooftop advance vs. ground-level Zone 7b calendar
export const ROOFTOP_PHENOLOGY_OFFSET_DAYS = 12;

// Each entry: [month (1-based), day-of-month-start, stage label]
// Ranges are inclusive on the start, exclusive on next entry's start.
const CALENDARS = {
  wisteria: [
    [1,1,'dormant'],
    [3,1,'bud swell'],
    [3,25,'leafing out'],
    [4,15,'pre-bloom'],
    [5,1,'blooming'],
    [6,1,'post-bloom, leafing'],
    [9,15,'late season'],
    [11,1,'going dormant'],
    [12,1,'dormant'],
  ],
  'climbing-rose': [
    [1,1,'dormant'],
    [3,1,'bud break'],
    [4,1,'leafing out'],
    [5,1,'budding'],
    [5,20,'first flush'],
    [7,1,'between flushes'],
    [8,1,'second flush'],
    [10,1,'late season'],
    [11,15,'going dormant'],
    [12,15,'dormant'],
  ],
  rose: [
    [1,1,'dormant'],
    [3,1,'bud break'],
    [4,1,'leafing out'],
    [5,1,'budding'],
    [5,20,'first flush'],
    [7,1,'between flushes'],
    [8,1,'second flush'],
    [10,1,'late season'],
    [11,15,'going dormant'],
    [12,15,'dormant'],
  ],
  hydrangea: [
    [1,1,'dormant'],
    [3,1,'prune old blooms'],   // cut dried heads before bud break
    [3,15,'bud swell'],
    [4,15,'leafing out'],
    [6,1,'budding'],
    [7,1,'early bloom'],
    [8,1,'peak bloom'],
    [9,15,'fading, drying'],
    [11,1,'going dormant'],
    [12,1,'dormant'],
  ],
  serviceberry: [
    [1,1,'dormant'],
    [3,15,'early bud'],
    [4,1,'blooming'],
    [4,20,'leafing out'],
    [6,1,'berry development'],
    [7,1,'ripe berries'],
    [8,1,'post-fruit, leafy'],
    [10,1,'fall color'],
    [11,15,'going dormant'],
    [12,15,'dormant'],
  ],
  maple: [
    [1,1,'dormant'],
    [3,15,'bud break'],
    [4,1,'leafing out'],
    [5,1,'full leaf'],
    [9,15,'early fall color'],
    [10,15,'peak color'],
    [11,15,'going dormant'],
    [12,15,'dormant'],
  ],
  evergreen: [
    [1,1,'winter rest'],
    [3,1,'new growth emerging'],
    [5,1,'active growth'],
    [9,1,'hardening off'],
    [11,1,'winter rest'],
  ],
  'evergreen-xmas': [
    [1,1,'winter rest'],
    [3,1,'new growth emerging'],
    [5,1,'active growth'],
    [9,1,'hardening off'],
    [11,1,'winter rest'],
  ],
  herb: [
    [1,1,'dormant'],
    [3,15,'waking up'],
    [4,15,'leafing out'],
    [5,1,'growing season'],
    [10,1,'slowing down'],
    [11,15,'dormant'],
  ],
};

const DEFAULT_CALENDAR = [
  [1,1,'dormant'],
  [3,15,'emerging'],
  [5,1,'growing'],
  [9,15,'late season'],
  [11,15,'dormant'],
];

/**
 * Returns the current phenological stage string for a given plant type.
 * Used as fallback when no AI portrait stage is available.
 * @param {string} type - plant type (e.g. 'wisteria', 'climbing-rose')
 * @param {Date} [date] - defaults to today
 * @param {number} [offsetDays] - days to advance (rooftop default = 12; pass 0 for ground level)
 * @returns {string} stage label
 */
export function getPhenologicalStage(type, date = new Date(), offsetDays = ROOFTOP_PHENOLOGY_OFFSET_DAYS) {
  const cal = CALENDARS[type] || DEFAULT_CALENDAR;
  // Advance the date to simulate rooftop heat-island acceleration
  const adjusted = offsetDays ? new Date(date.getTime() + offsetDays * 86400000) : date;
  const m = adjusted.getMonth() + 1; // 1-based
  const d = adjusted.getDate();

  let stage = cal[0][2];
  for (const [em, ed, label] of cal) {
    if (m > em || (m === em && d >= ed)) {
      stage = label;
    } else {
      break;
    }
  }
  return stage;
}
