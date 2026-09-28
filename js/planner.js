/* PLAN: pick what kind of plan (one card per list), which one, and how long.
   Suggested times are when you're BOTH free, from both calendars.
   Booking adds a private event to the calendar you choose.

   Each device shares only its person's busy times into the board, never
   event names or details. */

import { CAL as CAL_FILE } from './calendar-config.js';
import { $, esc, uid, plural, store, initial } from './util.js';
import { S, cat, item, otherOf, sortOpen, upcomingPlans } from './state.js';
import * as cal from './calendar.js';
import { openDialog, closeDialog, onDismiss, toast, actionSheet } from './dialogs.js';
import { commit } from './actions.js';
import { render } from './render.js';
import { go } from './router.js';
import { rowHTML, put } from './rows.js';
import { imgTag, photoForIcon, PHOTOS } from './images.js';
import { anim, EASE } from './motion.js';

/* settings, with safe defaults if calendar-config.js is older than this code */
const CAL = Object.assign({
  weekdayHours: [['18:00', '22:30']], weekendHours: [['10:00', '22:30']],
  durations: [60, 120, 150, 180, 240], defaultDuration: 120, listDurations: { movie: 150 },
  lookaheadDays: 21, leadMinutes: 120, stepMinutes: 30, perDay: 2, maxSuggestions: 12, staleHours: 24,
}, CAL_FILE);
const LIST_HOURS = CAL.listHours || { movie: { weekday: [['18:30', '23:30']], weekend: [['13:00', '23:30']] } };
const DEFAULT_TITLE = !CAL.defaultEventTitle || CAL.defaultEventTitle === 'Date night' ? 'Plans' : CAL.defaultEventTitle;
const MIN = 60e3, HOUR = 3600e3;

const P = { catId: '', forId: '', dur: CAL.defaultDuration, syncing: false, error: '' };
let book = null;

/* ---------- time words */
const tFmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function dayName(ms) {
  const d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
const rangeText = (s, e) => tFmt(s) + ' – ' + tFmt(e);
export function ago(ms) {
  const m = Math.round((Date.now() - ms) / MIN);
  if (m < 2) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 24 ? plural(h, 'hour') + ' ago' : plural(Math.round(h / 24), 'day') + ' ago';
}
const durLabel = (m) => { const h = Math.floor(m / 60), r = m % 60; return (h ? h : '') + (r === 30 ? '½' : r ? ':' + r : '') + ' h'; };

/* ---------- suggestion engine */
function at(day, hhmm) { const [h, m] = hhmm.split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d.getTime(); }
function freeInside(ws, we, busy) {
  const out = []; let cur = ws;
  busy.forEach(([s, e]) => { if (e <= cur || s >= we) return; if (s > cur) out.push([cur, Math.min(s, we)]); cur = Math.max(cur, e); });
  if (cur < we) out.push([cur, we]);
  return out;
}
function hoursFor(catId, weekend) {
  const own = catId && LIST_HOURS[catId];
  if (own && own[weekend ? 'weekend' : 'weekday']) return own[weekend ? 'weekend' : 'weekday'];
  return weekend ? CAL.weekendHours : CAL.weekdayHours;
}
export function suggestions(durMin, catId) {
  const people = [0, 1].map((i) => S.data.busy[i]).filter(Boolean);
  const busy = cal.mergeBlocks([].concat(...people.map((b) => b.blocks || []), (S.data.plans || []).map((p) => [p.start, p.end])));
  const now = Date.now(), from = now + CAL.leadMinutes * MIN, step = CAL.stepMinutes * MIN, dur = durMin * MIN;
  const horizon = people.length ? Math.min(...people.map((b) => b.until || 0)) : now + CAL.lookaheadDays * 864e5;
  const out = [];
  for (let d = 0; d < CAL.lookaheadDays && out.length < CAL.maxSuggestions; d++) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + d);
    const wk = day.getDay() === 0 || day.getDay() === 6;
    let today = 0;
    hoursFor(catId, wk).forEach(([a, b]) => {
      const ws = at(day, a), we = b === '24:00' ? at(day, '23:59') + MIN : at(day, b);
      freeInside(ws, we, busy).forEach(([fs, fe]) => {
        if (today >= CAL.perDay || out.length >= CAL.maxSuggestions) return;
        const start = Math.ceil(Math.max(fs, from) / step) * step;
        if (start + dur <= fe && start + dur <= horizon) { out.push({ start, end: start + dur, freeUntil: fe }); today++; }
      });
    });
  }
  return out;
}
function eventTitle() {
  const it = P.forId ? item(P.forId) : null;
  if (it) return it.title;
  const other = S.me !== null ? S.data.people[otherOf(S.me)] : '';
  const c = P.catId ? cat(P.catId) : null;
  const base = c ? c.name : DEFAULT_TITLE;
  return other ? base + ' with ' + other : base;
}

/* ---------- this device's busy times, shared into the board */
export async function syncMine(interactive) {
  if (S.me === null || P.syncing || !cal.connectedList().length) return;
  P.syncing = true; P.error = ''; render();
  const from = Date.now(), to = from + CAL.lookaheadDays * 864e5;
  try {
    const r = await cal.fetchMyBusy(from, to, interactive);
    if (r.sources.length) { S.data.busy[S.me] = { at: Date.now(), until: to, blocks: r.blocks, src: r.sources }; commit(); }
    if (r.errors.length) { const e = r.errors[0]; if (e.code !== 'auth' || interactive) P.error = e.message === 'cancelled' ? '' : e.message; }
  } catch (e) { P.error = e.message === 'cancelled' ? '' : e.message; }
  P.syncing = false; render();
}
const mineIsStale = () => { const b = S.data.busy[S.me]; return !b || Date.now() - b.at > 30 * MIN; };
export function onOpenPlan() { cal.preloadGoogle(); if (S.me !== null && mineIsStale()) syncMine(false); }
export const planError = () => P.error;
export const isSyncing = () => P.syncing;

/* ---------- drawing */
function calStrip() {
  const names = S.data.people, b = S.data.busy;
  const people = '<span class="people">' + [0, 1].map((i) => '<span class="avatar' + (b[i] ? '' : ' off') + '">' + esc(initial(names[i])) + '</span>').join('') + '</span>';
  let text;
  const have = [0, 1].filter((i) => b[i]);
  if (!Object.keys(cal.PROVIDERS).some(cal.configured)) text = 'Calendars aren’t set up yet, so these are just your usual hours.';
  else if (have.length === 2) text = '<b>Both calendars</b> connected · updated ' + ago(Math.min(b[0].at, b[1].at));
  else if (have.length === 1) text = '<b>' + esc(names[have[0]]) + '’s calendar</b> only. ' + esc(names[otherOf(have[0])]) + ' can connect in Settings.';
  else text = 'Connect your calendars in <b>Settings</b> to see when you’re both free.';
  const err = P.error ? '<br><span style="color:var(--red)">' + esc(P.error) + '</span>' : '';
  return people + '<span class="cs-text">' + text + err + '</span>' + (Object.keys(cal.PROVIDERS).some(cal.configured) && S.me !== null && !b[S.me] ? '<a class="btn tinted small" href="#/settings">Connect</a>' : '');
}
function kindCard(id, name, icon, n, photo) {
  return '<button type="button" class="kind' + (photo ? '' : ' plain') + '" data-kind="' + esc(id) + '" aria-pressed="' + (P.catId === id) + '">'
    + (photo ? imgTag(photo, 500) + '<span class="shade"></span>' : '')
    + '<span class="ms k-ic" aria-hidden="true">' + esc(icon) + '</span><span class="k-check"><span class="ms" aria-hidden="true">check</span></span>'
    + '<span class="k-name">' + esc(name) + '</span>' + (n !== null ? '<span class="k-n">' + n + ' to do</span>' : '<span class="k-n">Any list</span>') + '</button>';
}
function planRow(p) {
  const pc = p.catId ? cat(p.catId) : (p.itemId && item(p.itemId) ? cat(item(p.itemId).list) : null);
  const added = p.added || [], who = [0, 1].filter((i) => added[i]).map((i) => S.data.people[i]);
  const mine = S.me !== null && added[S.me];
  return '<li class="row" data-plan="' + esc(p.id) + '"><span class="row-ic"><span><span class="ms" aria-hidden="true">' + (pc ? esc(pc.icon) : 'event') + '</span></span></span>'
    + '<div class="row-main"><button type="button" class="row-text" data-plan-menu><span class="row-title">' + esc(p.title) + '</span>'
    + '<span class="row-note">' + dayName(p.start) + ', ' + rangeText(p.start, p.end) + '</span>'
    + '<span class="row-meta">' + (who.length ? 'In ' + who.join(' and ') + '’s calendar' : 'Not in a calendar yet') + '</span></button>'
    + (S.me !== null && !mine ? '<span class="row-tail"><button type="button" class="btn tinted small" data-addmine>Add to mine</button></span>' : '')
    + '</div></li>';
}

export function renderPlan() {
  $('calStrip').innerHTML = calStrip();

  /* kinds */
  if (P.catId && !cat(P.catId)) { P.catId = ''; P.forId = ''; }
  if (P.forId && !item(P.forId)) P.forId = '';
  const openAll = S.data.items.filter((i) => !i.doneAt);
  put($('planKinds'), kindCard('', 'Anything', 'auto_awesome', null, null) + S.data.cats.map((c) => kindCard(c.id, c.name, c.icon, openAll.filter((i) => i.list === c.id).length, photoForIcon(c.icon))).join(''));

  /* which one */
  const c = P.catId ? cat(P.catId) : null;
  $('planWhichBlock').hidden = !c;
  if (c) {
    const open = openAll.filter((i) => i.list === c.id).sort(sortOpen).slice(0, 16);
    put($('planWhich'), '<button type="button" class="chip" data-for="" aria-pressed="' + (!P.forId) + '">Not sure yet</button>'
      + open.map((i) => '<button type="button" class="chip" data-for="' + esc(i.id) + '" aria-pressed="' + (P.forId === i.id) + '">' + (i.pr ? '<span class="dot p' + i.pr + '"></span>' : '') + esc(i.title) + '</button>').join(''));
  }

  /* how long */
  const durs = CAL.durations.indexOf(P.dur) < 0 ? CAL.durations.concat(P.dur).sort((a, b) => a - b) : CAL.durations;
  put($('planLength'), durs.map((m) => '<button type="button" role="radio" data-dur="' + m + '" aria-checked="' + (m === P.dur) + '">' + durLabel(m) + '</button>').join(''));

  /* booked */
  const plans = upcomingPlans();
  $('bookedBlock').hidden = !plans.length;
  $('bookedCount').textContent = plans.length ? plural(plans.length, 'plan') : '';
  put($('bookedRows'), plans.map(planRow).join(''));

  /* suggestions */
  $('planRefresh').disabled = P.syncing || S.me === null || !cal.connectedList().length;
  $('planRefresh').classList.toggle('spin', P.syncing);
  $('planNote').hidden = true;   // the calendar strip above already explains what the times are based on
  const list = suggestions(P.dur, P.catId);
  if (!list.length) { put($('slots'), '<ul class="rows card-rows"><li class="row-empty"><span class="ms" aria-hidden="true">event_busy</span><span>No shared free time in the next ' + CAL.lookaheadDays + ' days for that length. Try a shorter one.</span></li></ul>'); return; }
  const groups = [];
  list.forEach((s) => { const dn = dayName(s.start); if (!groups.length || groups[groups.length - 1].dn !== dn) groups.push({ dn, slots: [] }); groups[groups.length - 1].slots.push(s); });
  put($('slots'), groups.map((g) => '<div class="day"><p class="day-head">' + g.dn + '</p><ul class="rows card-rows">'
    + g.slots.map((s) => '<li class="row"><div class="row-main" style="padding-left:16px"><span class="row-text"><span class="slot-time">' + rangeText(s.start, s.end) + '</span><span class="slot-free">' + (s.freeUntil - s.end >= 30 * MIN ? 'Free until ' + tFmt(s.freeUntil) : 'Just fits') + '</span></span>'
      + '<span class="row-tail"><button type="button" class="btn tinted small" data-book="' + s.start + ',' + s.end + '">Book</button></span></div></li>').join('')
    + '</ul></div>').join(''));
}

/* jump here from an item's "Find a time" */
export function findTimeFor(itemId) {
  const it = item(itemId); if (!it) return;
  P.forId = itemId; P.catId = it.list;
  P.dur = (CAL.listDurations && CAL.listDurations[it.list]) || CAL.defaultDuration;
  if (S.route.name === 'plan') renderPlan(); else go('#/plan');
}

/* ---------- booking */
function openBook(b) {
  if (S.me === null) { import('./people.js').then((m) => m.openWho()); return; }
  book = b;
  $('bookWhen').textContent = dayName(b.start) + ', ' + rangeText(b.start, b.end);
  $('bName').value = b.title;
  const opts = Object.keys(cal.PROVIDERS).filter(cal.configured), conn = opts.filter(cal.connected);
  book.provider = conn[0] || null;
  $('bCal').innerHTML = opts.length ? opts.map((p) => cal.connected(p)
    ? '<button type="button" class="chip" role="radio" data-p="' + p + '" aria-checked="' + (p === book.provider) + '"><span class="ms" aria-hidden="true">event</span>' + cal.PROVIDERS[p].name + '</button>'
    : '<button type="button" class="chip" data-connect="' + p + '"><span class="ms" aria-hidden="true">add</span>Connect ' + cal.PROVIDERS[p].short + '</button>').join('')
    : '<span class="sheet-meta">Calendars aren’t set up yet (see the README).</span>';
  $('bookSave').disabled = !book.provider;
  $('bookNote').textContent = 'Added as a private event, so others only see that you’re busy.' + (b.planId ? '' : ' ' + S.data.people[otherOf(S.me)] + ' can add it to their calendar from Plan.');
  openDialog($('bookSheet'));
}
async function doBook(e) {
  e.preventDefault();
  if (!book || !book.provider) return;
  const b = book, title = ($('bName').value || '').trim() || DEFAULT_TITLE;
  $('bookSave').disabled = true; $('bookSave').textContent = 'Adding…';
  store.set('gp-pending-book', Object.assign({}, b, { title }));   // survives an Outlook sign-in round trip
  try {
    await cal.createEvent(b.provider, { title, note: 'Planned in ' + document.title, start: b.start, end: b.end });
    store.set('gp-pending-book', null);
    book = null; closeDialog($('bookSheet'));
    afterBooked(b, title);
  } catch (err) {
    store.set('gp-pending-book', null);
    $('bookSave').disabled = false;
    if (err.message !== 'cancelled') toast(err.code === 'auth' ? 'Please reconnect ' + cal.PROVIDERS[b.provider].name + ' and try again.' : err.message);
  }
  $('bookSave').textContent = 'Add';
}
function afterBooked(b, title) {
  const me = S.me;
  if (b.planId) {
    const p = S.data.plans.find((x) => x.id === b.planId);
    if (p) { p.added = (p.added || [null, null]).slice(); p.added[me] = b.provider; }
  } else {
    const added = [null, null]; added[me] = b.provider;
    S.data.plans.push({ id: 'p' + uid(), title, itemId: b.itemId || null, catId: b.catId || null, start: b.start, end: b.end, by: me, added });
  }
  const mine = S.data.busy[me];
  if (mine) mine.blocks = cal.mergeBlocks((mine.blocks || []).concat([[b.start, b.end]]));
  commit();
  toast('Added to your ' + cal.PROVIDERS[b.provider].name);
}
export async function resumePendingBook() {
  const b = store.get('gp-pending-book'); if (!b || S.me === null) return;
  store.set('gp-pending-book', null);
  try { await cal.createEvent(b.provider, { title: b.title, note: 'Planned in ' + document.title, start: b.start, end: b.end }); afterBooked(b, b.title); }
  catch (err) { toast('Couldn’t add it: ' + err.message); }
}

export function initPlanner() {
  $('v-plan').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'planRefresh') { syncMine(true); return; }
    if (t.hasAttribute('data-kind')) {
      const k = t.dataset.kind; if (k === P.catId) return;
      P.catId = k; P.forId = '';
      P.dur = (k && CAL.listDurations && CAL.listDurations[k]) || CAL.defaultDuration;
      renderPlan();
      anim($('slots'), [{ opacity: 0.3 }, { opacity: 1 }], { duration: 240, easing: EASE });
      return;
    }
    if (t.hasAttribute('data-for')) { P.forId = t.dataset.for; renderPlan(); return; }
    if (t.hasAttribute('data-dur')) { P.dur = +t.dataset.dur; renderPlan(); anim($('slots'), [{ opacity: 0.3 }, { opacity: 1 }], { duration: 240, easing: EASE }); return; }
    if (t.hasAttribute('data-book')) {
      const [s, en] = t.dataset.book.split(',').map(Number);
      openBook({ start: s, end: en, itemId: P.forId || null, catId: P.catId || null, title: eventTitle() });
      return;
    }
    const row = t.closest('[data-plan]');
    if (row) {
      const p = S.data.plans.find((x) => x.id === row.dataset.plan); if (!p) return;
      const addMine = () => openBook({ start: p.start, end: p.end, planId: p.id, itemId: p.itemId, catId: p.catId, title: p.title });
      const remove = () => { const idx = S.data.plans.indexOf(p); S.data.plans.splice(idx, 1); commit(); toast('Removed. It stays in your calendars.', () => { S.data.plans.splice(idx, 0, p); }); };
      if (t.hasAttribute('data-addmine')) addMine();
      else actionSheet([].concat(S.me !== null && !(p.added || [])[S.me] ? [{ label: 'Add to my calendar', run: addMine }] : [], [{ label: 'Remove from the app', danger: true, run: remove }]));
    }
  });
  $('bCal').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !book) return;
    if (b.hasAttribute('data-connect')) {
      const p = b.dataset.connect;
      store.set('gp-return', '#/plan');
      try { await cal.connect(p); openBook(book); syncMine(false); }
      catch (err) { if (err.message !== 'cancelled') toast(err.message); }
      return;
    }
    book.provider = b.dataset.p;
    [].forEach.call($('bCal').querySelectorAll('[data-p]'), (x) => x.setAttribute('aria-checked', String(x === b)));
    $('bookSave').disabled = false;
  });
  $('bookForm').addEventListener('submit', doBook);
  onDismiss($('bookSheet'), () => { book = null; closeDialog($('bookSheet')); });
}
export { rowHTML, PHOTOS };
