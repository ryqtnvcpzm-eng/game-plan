/* STATE: the shared board (S.data) plus this device's own settings,
   and the small rules for reading the data (averages, whose turn, sorting). */

import { CONFIG } from './config.js';
import { store, todayISO } from './util.js';

const UI_KEY = 'gp-ui2';
const ME_KEY = 'gp-me';
const ui = store.get(UI_KEY) || {};
const storedMe = store.get(ME_KEY);

/* labels, with safe fallbacks in case config.js is older than this code */
export const PRIORITY = (CONFIG.priorities && CONFIG.priorities.length === 4) ? CONFIG.priorities : ['None', 'Soon', 'Next up', 'Top'];
export const FILTER_NAME = CONFIG.filterNames || { 3: 'Top', 2: 'Next up', 1: 'Soon', 0: 'No rush' };

export const S = {
  data: null,                         // the shared board: lists, items, names, PINs, plans
  route: { name: 'home', id: null },  // which page is showing
  filters: ui.filters || {},          // priority filter per list, on this device
  memTab: ui.memTab || 'top',
  doneOpen: !!ui.doneOpen,
  me: storedMe === 0 || storedMe === 1 ? storedMe : null,   // who is using this device
  mode: 'loading',                    // 'cloud', 'local' or 'loading'
  pending: false, offline: false, error: false,
  flashId: null, busy: {},
};

export function saveUI() { store.set(UI_KEY, { filters: S.filters, memTab: S.memTab, doneOpen: S.doneOpen }); }
export function setMe(i) { S.me = i; store.set(ME_KEY, i); }
export function filterFor(listId) { const f = S.filters[listId]; return f === undefined || !(f in FILTER_NAME) ? 'all' : String(f); }
export function setFilter(listId, f) { if (f === 'all') delete S.filters[listId]; else S.filters[listId] = f; saveUI(); }

/* Makes any saved data safe to use (fills in anything missing). */
export function normalize(d) {
  d = d || {};
  if (!d.startedAt) d.startedAt = todayISO();
  if (!Array.isArray(d.items)) d.items = [];
  if (!Array.isArray(d.cats) || !d.cats.length) d.cats = (CONFIG.defaultLists || [{ id: 'do', name: 'Plans', icon: 'explore' }]).map((c) => Object.assign({}, c));
  if (!Array.isArray(d.people) || d.people.length < 2) d.people = (CONFIG.people || ['Me', 'You']).slice(0, 2);
  if (!Array.isArray(d.pins)) d.pins = [null, null];
  if (!d.pinSalt) d.pinSalt = null;
  if (!d.palette) d.palette = null;
  if (!Array.isArray(d.busy)) d.busy = [null, null];
  while (d.busy.length < 2) d.busy.push(null);
  if (!Array.isArray(d.plans)) d.plans = [];
  if (!d.seq) d.seq = d.items.length;
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
export const cat = (id) => (S.data.cats.find((c) => c.id === id) || null);
export const catIndex = (id) => S.data.cats.findIndex((c) => c.id === id);
export const find = (id) => S.data.items.findIndex((i) => i.id === id);
export const item = (id) => { const i = find(id); return i < 0 ? null : S.data.items[i]; };
export const openItems = () => S.data.items.filter((i) => !i.doneAt);
export const doneItems = () => S.data.items.filter((i) => i.doneAt);

/* ratings */
export function avgOf(it) {
  const r = (it.rating || []).filter((v) => v > 0);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}
export function fmtAvg(v) { return v ? (Math.round(v * 10) / 10).toFixed(Math.round(v * 10) % 10 ? 1 : 0) : '–'; }
export const otherOf = (p) => (p === 0 ? 1 : 0);
export function isMyTurn(it) { const r = it.rating || []; return S.me !== null && !!it.doneAt && !r[S.me] && !!r[otherOf(S.me)]; }
export function needsOne(it) { const r = it.rating || []; return !!it.doneAt && (!r[0] !== !r[1]); }
export function waiting() { return S.data.items.filter(S.me === null ? needsOne : isMyTurn); }

/* plans */
export function planFor(itemId) {
  const now = Date.now();
  return (S.data.plans || []).filter((p) => p.itemId === itemId && p.end > now).sort((a, b) => a.start - b.start)[0] || null;
}
export function upcomingPlans() { const now = Date.now(); return (S.data.plans || []).filter((p) => p.end > now - 3 * 3600e3).sort((a, b) => a.start - b.start); }

/* sorting: open items by priority then oldest first; done items newest first */
export function sortOpen(a, b) { return b.pr - a.pr || (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) || a.seq - b.seq; }
export function sortDone(a, b) { return a.doneAt < b.doneAt ? 1 : a.doneAt > b.doneAt ? -1 : b.seq - a.seq; }

/* smart lists (not real lists, just views across all of them) */
export const SMART = {
  _all: { name: 'All', icon: 'inbox', color: 'var(--text-2)', test: () => true },
  _flagged: { name: 'Flagged', icon: 'flag', color: 'var(--orange)', test: (i) => i.pr > 0 },
};
export const isSmart = (id) => Object.prototype.hasOwnProperty.call(SMART, id);
