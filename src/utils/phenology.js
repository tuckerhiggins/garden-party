// src/utils/phenology.js
// Zone 7b Brooklyn rooftop phenological calendar — date-based stage fallback.
// Returns a short stage string for display when no AI portrait stage is available.
//
// Dates are calibrated for an elevated, south-facing Brooklyn rooftop — roughly
// 10–14 days ahead of ground-level Zone 7b timing due to heat retention and
// direct sun exposure. These are the real-world dates you'd observe on the terrace.

// Each entry: [month (1-based), day-of-month-start, stage label]
// Ranges are inclusive on the start, exclusive on next entry's start.
const CALENDARS = {
  // Ground-level Zone 7b Brooklyn timing (not rooftop-accelerated)
  magnolia: [
    [1,1,'dormant'],
    [2,1,'bud swell'],
    [3,10,'pre-bloom'],
    [3,19,'blooming'],
    [4,8,'post-bloom'],
    [4,22,'leafing out'],
    [5,20,'summer foliage'],
    [10,15,'late season'],
    [11,15,'going dormant'],
  ],
  wisteria: [
    [1,1,'dormant'],
    [2,17,'bud swell'],
    [3,13,'leafing out'],
    [4,3,'pre-bloom'],
    [4,19,'blooming'],
    [5,20,'post-bloom, leafing'],
    [9,3,'late season'],
    [10,20,'going dormant'],
    [11,19,'dormant'],
  ],
  'climbing-rose': [
    [1,1,'dormant'],
    [2,17,'bud break'],
    [3,20,'leafing out'],
    [4,19,'budding'],
    [5,8,'first flush'],
    [6,19,'between flushes'],
    [7,20,'second flush'],
    [9,19,'late season'],
    [11,3,'going dormant'],
    [12,3,'dormant'],
  ],
  rose: [
    [1,1,'dormant'],
    [2,17,'bud break'],
    [3,20,'leafing out'],
    [4,19,'budding'],
    [5,8,'first flush'],
    [6,19,'between flushes'],
    [7,20,'second flush'],
    [9,19,'late season'],
    [11,3,'going dormant'],
    [12,3,'dormant'],
  ],
  hydrangea: [
    [1,1,'dormant'],
    [2,17,'prune old blooms'],   // cut dried heads before bud break
    [3,3,'bud swell'],
    [4,3,'leafing out'],
    [5,20,'budding'],
    [6,19,'early bloom'],
    [7,20,'peak bloom'],
    [9,3,'fading, drying'],
    [10,20,'going dormant'],
    [11,19,'dormant'],
  ],
  serviceberry: [
    [1,1,'dormant'],
    [3,3,'early bud'],
    [3,20,'blooming'],
    [4,8,'leafing out'],
    [5,20,'berry development'],
    [6,19,'ripe berries'],
    [7,20,'post-fruit, leafy'],
    [9,19,'fall color'],
    [11,3,'going dormant'],
    [12,3,'dormant'],
  ],
  maple: [
    [1,1,'dormant'],
    [3,3,'bud break'],
    [3,20,'leafing out'],
    [4,19,'full leaf'],
    [9,3,'early fall color'],
    [10,3,'peak color'],
    [11,3,'going dormant'],
    [12,3,'dormant'],
  ],
  evergreen: [
    [1,1,'winter rest'],
    [2,17,'new growth emerging'],
    [4,19,'active growth'],
    [8,20,'hardening off'],
    [10,20,'winter rest'],
  ],
  'evergreen-xmas': [
    [1,1,'winter rest'],
    [2,17,'new growth emerging'],
    [4,19,'active growth'],
    [8,20,'hardening off'],
    [10,20,'winter rest'],
  ],
  herb: [
    [1,1,'dormant'],
    [3,3,'waking up'],
    [4,3,'leafing out'],
    [4,19,'growing season'],
    [9,19,'slowing down'],
    [11,3,'dormant'],
  ],
};

const DEFAULT_CALENDAR = [
  [1,1,'dormant'],
  [3,3,'emerging'],
  [4,19,'growing'],
  [9,3,'late season'],
  [11,3,'dormant'],
];

/**
 * Returns the current phenological stage string for a given plant type.
 * Used as fallback when no AI portrait stage is available.
 * Dates are calibrated for the Brooklyn rooftop terrace.
 * @param {string} type - plant type (e.g. 'wisteria', 'climbing-rose')
 * @param {Date} [date] - defaults to today
 * @returns {string} stage label
 */
export function getPhenologicalStage(type, date = new Date()) {
  const cal = CALENDARS[type] || DEFAULT_CALENDAR;
  const m = date.getMonth() + 1; // 1-based
  const d = date.getDate();

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
