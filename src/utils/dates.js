// src/utils/dates.js
// Date helpers that respect the user's local timezone.
// ISO timestamps stored in care entries are UTC — we must convert to local
// time when asking "what day did this happen?" to avoid actions logged in
// the evening showing up in the wrong journal day or bypassing deduplication.

// Returns "YYYY-MM-DD" in local timezone for any Date or ISO string.
export function localDate(dateOrIso = new Date()) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  return (
    d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0')
  );
}

// Natural language date parser — "yesterday", "3 days ago", "last monday", "march 15", etc.
// Returns ISO string or null.
export function parsePastDate(text) {
  const t = (text || '').toLowerCase().trim();
  if (!t) return null;
  const now = new Date();
  if (t === 'today') return now.toISOString();
  if (t === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); }
  const daysAgoM = t.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoM) { const d = new Date(); d.setDate(d.getDate() - parseInt(daysAgoM[1])); return d.toISOString(); }
  const weeksAgoM = t.match(/^(\d+)\s+weeks?\s+ago$/);
  if (weeksAgoM) { const d = new Date(); d.setDate(d.getDate() - parseInt(weeksAgoM[1]) * 7); return d.toISOString(); }
  const DAYS = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };
  const weekdayM = t.match(/^(?:last\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayM) {
    const target = DAYS[weekdayM[1]];
    const d = new Date(); let back = (d.getDay() - target + 7) % 7; if (back === 0) back = 7;
    d.setDate(d.getDate() - back); return d.toISOString();
  }
  const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };
  const monthDayM = t.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayM) {
    const d = new Date(now.getFullYear(), MONTHS[monthDayM[1]], parseInt(monthDayM[2]));
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  }
  const native = new Date(text);
  if (!isNaN(native.getTime())) return native.toISOString();
  return null;
}
