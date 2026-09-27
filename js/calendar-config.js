/* ==========================================================================
   CALENDAR SETTINGS: everything about connecting calendars and suggesting times.
   (Kept separate from config.js so your Firebase keys are never touched.)
   ========================================================================== */

export const CAL = {

  /* 1. Keys from setup (README, "Calendars"). Leave one empty to hide that option. */
  googleClientId: '',     // looks like 1234-abcd.apps.googleusercontent.com
  outlookClientId: '',    // looks like 1a2b3c4d-....  (Application (client) ID)

  /* 2. When dates can happen, in your phone's local time. Several ranges per day are fine. */
  weekdayHours: [['18:00', '22:30']],
  weekendHours: [['10:00', '22:30']],

  /* 3. Length choices shown on the Plan page, in minutes */
  durations: [60, 120, 150, 180, 240],
  defaultDuration: 120,
  listDurations: { movie: 150 },   // default length by list id, e.g. movies take 2.5 h

  /* 4. How suggestions are picked */
  lookaheadDays: 21,     // how far ahead to look
  leadMinutes: 120,      // don't suggest anything starting sooner than this
  stepMinutes: 30,       // start times land on :00 or :30
  perDay: 2,             // at most this many suggestions per day
  maxSuggestions: 12,

  /* 5. After this many hours, a calendar counts as out of date */
  staleHours: 24,

  /* 6. What new calendar events are called when no item is picked */
  defaultEventTitle: 'Date night',
};
