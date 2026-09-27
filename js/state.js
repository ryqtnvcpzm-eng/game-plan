/* The app's memory: the shared board data (S.data) plus this phone's own
   view settings. Also the small "rules" for reading the data
   (averages, whose turn it is, sorting). */

import { CONFIG } from './config.js';
import { store, todayISO } from './util.js';

const UI_KEY = 'gp-ui';
const ME_KEY = 'gp-me';
const ui = store.get(UI_KEY) || {};
const storedMe = store.get(ME_KEY);

export const S = {
  data: null,                                   // the shared board (lists, items, names, PINs)
  page: ['lists', 'plan'].indexOf(ui.page) > -1 ? ui.page : 'summary',
  tab: ui.tab || null,                          // which list is open on the Lists page
  filter: ui.filter in CONFIG.filterNames ? String(ui.filter) : 'all',
  sumTab: ['up', 'rated', 'recent'].indexOf(ui.sumTab) > -1 ? ui.sumTab : 'up',
  doneOpen: !!ui.doneOpen,
  me: storedMe === 0 || storedMe === 1 ? storedMe : null,   // who is on this phone
  mode: 'loading',                              // 'cloud', 'local' or 'loading'
  pending: false, offline: false, error: false,
  newId: null, popId: null, busy: {}, undo: null,
};

export function saveUI() {
  store.set(UI_KEY, { page: S.page, tab: S.tab, filter: S.filter, sumTab: S.sumTab, doneOpen: S.doneOpen });
}
export function setMe(i) { S.me = i; store.set(ME_KEY, i); }

/* Makes any saved data safe to use (fills in anything missing). */
export function normalize(d) {
  d = d || {};
  if (!d.startedAt) d.startedAt = todayISO();
  if (!Array.isArray(d.items)) d.items = [];
  if (!Array.isArray(d.cats) || !d.cats.length) d.cats = CONFIG.defaultLists.map((c) => Object.assign({}, c));
  if (!Array.isArray(d.people) || d.people.length < 2) d.people = CONFIG.people.slice(0, 2);
  if (!Array.isArray(d.pins)) d.pins = [null, null];
  if (!d.pinSalt) d.pinSalt = null;
  if (!d.seq) d.seq = d.items.length;
  if (!Array.isArray(d.busy)) d.busy = [null, null];
  while (d.busy.length < 2) d.busy.push(null);
  if (!Array.isArray(d.plans)) d.plans = [];
  const ids = d.cats.map((c) => c.id);
  d.items.forEach((i) => {
    if (ids.indexOf(i.list) < 0) i.list = ids[0];
    if (!Array.isArray(i.rating)) i.rating = [0, 0];
    if (!i.note) i.note = '';
    if (!i.pr) i.pr = 0;
    if (i.doneAt === undefined) i.doneAt = null;
  });
  return d;
}

/* lookups */
export function cat(id) { return S.data.cats.find((c) => c.id === id) || null; }
export function catIndex(id) { return S.data.cats.findIndex((c) => c.id === id); }
export function find(id) { return S.data.items.findIndex((i) => i.id === id); }

/* ratings */
export function avgOf(it) {
  const r = (it.rating || []).filter((v) => v > 0);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}
export function fmtAvg(v) { return v ? (Math.round(v * 10) / 10).toFixed(Math.round(v * 10) % 10 ? 1 : 0) : '–'; }
export const otherOf = (p) => (p === 0 ? 1 : 0);
export function isMyTurn(it) {
  const r = it.rating || [];
  return S.me !== null && !!it.doneAt && !r[S.me] && !!r[otherOf(S.me)];
}
export function needsOne(it) { const r = it.rating || []; return !!it.doneAt && (!r[0] !== !r[1]); }
export function waiting() { return S.data.items.filter(S.me === null ? needsOne : isMyTurn); }

/* the next booked time for an item, if any */
export function planFor(itemId) {
  const now = Date.now();
  return (S.data.plans || []).filter((p) => p.itemId === itemId && p.end > now).sort((a, b) => a.start - b.start)[0] || null;
}

/* sorting: open items by priority then oldest first; done items newest first */
export function sortOpen(a, b) { return b.pr - a.pr || (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) || a.seq - b.seq; }
export function sortDone(a, b) { return a.doneAt < b.doneAt ? 1 : a.doneAt > b.doneAt ? -1 : b.seq - a.seq; }
