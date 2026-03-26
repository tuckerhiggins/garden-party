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
