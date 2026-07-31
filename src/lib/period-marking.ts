// Period types that never carry attendance — not markable present/absent and
// not counted toward the attendance %. lunch and meeting have always been
// here; mentoring was added per the user's choice that mentoring hours don't
// count. Kept in one place so the Calendar and Today views can't drift, and
// mirrored by the period-type bucket rules (mentoring/meeting → 'excluded',
// lunch → 'ignored') that drive the attendance engine.
//
// Deliberately NOT reused from timetable-rules' DEFAULT_NON_TEACHING_TYPES:
// that list answers a different question ("does this count toward the
// teaching-hours cap"), and coupling the two would let a change to one
// silently move the other.
export const NON_ATTENDANCE_TYPES: readonly string[] = ['lunch', 'meeting', 'mentoring']
