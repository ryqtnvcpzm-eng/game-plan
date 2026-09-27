/* PLAN PAGE: connects calendars, suggests times you're both free,
   and books a private event in the calendar you choose.

   Each phone shares only its person's busy times into the board, so the
   suggestions combine both people's calendars without showing event details. */

import { CAL } from './calendar-config.js';
import { $, qa, esc, uid, plural, store } from './util.js';
import { S, find, cat, otherOf, sortOpen } from './state.js';
import * as cal from './calendar.js';
import { closeDialog, showSnack } from './dialogs.js';
import { commit, goPage } from './actions.js';
import { slideIn } from './motion.js';

const P = { forId: '', dur: CAL.defaultDuration, syncing: false, error: '' };
let book = null;          // the open booking sheet: { start, end, planId, itemId }
const MIN = 60e3, HOUR = 3600e3;

/* ---------- time formatting (phone's local time) */
const tFmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function dayName(ms) {
  const d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
const rangeText = (s, e) => tFmt(s) + ' – ' + tFmt(e);
function ago(ms) {
  const m = Math.round((Date.now() - ms) / MIN);
  if (m < 2) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 24 ? plural(h, 'hour') + ' ago' : plural(Math.round(h / 24), 'day') + ' ago';
}
const durLabel = (m) => (m % 60 ? (Math.floor(m / 60) ? Math.floor(m / 60) + '½' : '½') : m / 60) + ' h';

/* ---------- suggestion engine */
function at(day, hhmm) { const [h, m] = hhmm.split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d.getTime(); }
function freeInside(ws, we, busy) {
  const out = []; let cur = ws;
  busy.forEach(([s, e]) => { if (e <= cur || s >= we) return; if (s > cur) out.push([cur, Math.min(s, we)]); cur = Math.max(cur, e); });
  if (cur < we) out.push([cur, we]);
  return out;
}
export function suggestions(durMin) {
  const people = [0, 1].map((i) => S.data.busy[i]).filter(Boolean);
  const busy = cal.mergeBlocks([].concat(
    ...people.map((b) => b.blocks || []),
    (S.data.plans || []).map((p) => [p.start, p.end]),
  ));
  const now = Date.now(), from = now + CAL.leadMinutes * MIN, step = CAL.stepMinutes * MIN, dur = durMin * MIN;
  const horizon = people.length ? Math.min(...people.map((b) => b.until || 0)) : now + CAL.lookaheadDays * 864e5;
  const out = [];
  for (let d = 0; d < CAL.lookaheadDays && out.length < CAL.maxSuggestions; d++) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + d);
    const wk = day.getDay() === 0 || day.getDay() === 6;
    let today = 0;
    (wk ? CAL.weekendHours : CAL.weekdayHours).forEach(([a, b]) => {
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

/* ---------- keeping this phone's busy times up to date in the board */
export async function syncMine(interactive) {
  if (S.me === null || P.syncing || !cal.connectedList().length) return;
  P.syncing = true; P.error = ''; renderPlan();
  const from = Date.now(), to = from + CAL.lookaheadDays * 864e5;
  try {
    const r = await cal.fetchMyBusy(from, to, interactive);
    if (r.sources.length) {
      S.data.busy[S.me] = { at: Date.now(), until: to, blocks: r.blocks, src: r.sources };
      commit();
    }
    if (r.errors.length) {
      const e = r.errors[0];
      if (e.code !== 'auth' || interactive) P.error = e.message === 'cancelled' ? '' : e.message;
    }
  } catch (e) { P.error = e.message === 'cancelled' ? '' : e.message; }
  P.syncing = false; renderPlan();
}
function mineIsStale() { const b = S.data.busy[S.me]; return !b || Date.now() - b.at > 30 * MIN; }
/* called when the Plan page opens: refresh quietly if we can do it without a popup */
export function onOpenPlan() { cal.preloadGoogle(); if (S.me !== null && mineIsStale()) syncMine(false); }

/* ---------- drawing the page */
function calCard() {
  const me = S.me, names = S.data.people;
  if (me === null) return '<p class="cal-hint">First, tell the app who’s on this phone.</p><button type="button" class="btn tonal rp" id="planWho"><span class="ms" aria-hidden="true">person</span>Choose</button>';
  const avail = Object.keys(cal.PROVIDERS).filter(cal.configured);
  if (!avail.length) return '<p class="cal-hint">Calendar keys aren’t set up yet. See the README section “Calendars”, then add them to <b>js/calendar-config.js</b>.</p>';
  const chips = avail.map((p) => cal.connected(p)
    ? '<span class="cal-chip on"><span class="ms fill" aria-hidden="true">check_circle</span>' + cal.PROVIDERS[p].short + '<button type="button" class="x rp" data-disc="' + p + '" aria-label="Disconnect ' + cal.PROVIDERS[p].name + '"><span class="ms" aria-hidden="true">close</span></button></span>'
    : '<button type="button" class="cal-chip rp" data-conn="' + p + '"><span class="ms" aria-hidden="true">add</span>Connect ' + cal.PROVIDERS[p].short + '</button>').join('');
  const row = (i) => {
    const b = S.data.busy[i], stale = b && Date.now() - b.at > CAL.staleHours * HOUR;
    const txt = !b ? (i === me ? 'Not connected yet' : 'Hasn’t connected a calendar yet') : 'Updated ' + ago(b.at) + (stale ? (i === me ? ', tap refresh' : ', ask ' + names[i] + ' to open the app') : '');
    return '<li class="' + (b ? (stale ? 'stale' : 'ok') : 'none') + '"><span class="av">' + esc(names[i].charAt(0).toUpperCase()) + '</span><span><b>' + esc(names[i]) + (i === me ? ' (you)' : '') + '</b><span>' + txt + '</span></span></li>';
  };
  return '<p class="sub">Your calendars on this phone</p><div class="cal-chips">' + chips + '</div>'
    + '<ul class="cal-people">' + row(me) + row(otherOf(me)) + '</ul>'
    + (P.error ? '<p class="cal-err" role="alert">' + esc(P.error) + '</p>' : '');
}
function planRow(p) {
  const me = S.me, names = S.data.people, added = p.added || [];
  const inCal = [0, 1].filter((i) => added[i]).map((i) => names[i]);
  const mine = me !== null && added[me];
  return '<li class="plan-row" data-plan="' + esc(p.id) + '"><span class="pic"><span class="ms" aria-hidden="true">event</span></span>'
    + '<span class="pbody"><b>' + esc(p.title) + '</b><span>' + dayName(p.start) + ', ' + rangeText(p.start, p.end) + '</span>'
    + '<span class="pin-cal">' + (inCal.length ? 'In ' + inCal.join(' and ') + '’s calendar' : 'Not in a calendar yet') + '</span></span>'
    + (me !== null && !mine ? '<button type="button" class="btn tonal sm rp" data-addmine="1">Add to mine</button>' : '')
    + '<button type="button" class="icon-btn rp" data-delplan="1" aria-label="Remove this plan"><span class="ms" aria-hidden="true">close</span></button></li>';
}
export function renderPlan() {
  if (!S.data || !$('pgPlan')) return;
  $('calCard').innerHTML = calCard();
  const now = Date.now();
  const plans = (S.data.plans || []).filter((p) => p.end > now - 12 * HOUR).sort((a, b) => a.start - b.start);
  $('plansList').innerHTML = plans.length ? plans.map(planRow).join('')
    : '<li class="empty"><span class="ms" aria-hidden="true">event_available</span>Nothing booked yet. Pick a time below.</li>';
  $('plansCount').textContent = plans.length ? plural(plans.length, 'plan') : '';

  /* what for */
  const open = S.data.items.filter((i) => !i.doneAt).sort(sortOpen).slice(0, 10);
  if (P.forId && find(P.forId) < 0) P.forId = '';
  if (P.forId && !open.some((i) => i.id === P.forId)) open.unshift(S.data.items[find(P.forId)]);
  $('planFor').innerHTML = '<button type="button" class="fchip rp" data-for="" aria-pressed="' + (!P.forId) + '"><span class="ms ck" aria-hidden="true">check</span>Just us</button>'
    + open.map((i) => { const c = cat(i.list); return '<button type="button" class="fchip rp" data-for="' + esc(i.id) + '" aria-pressed="' + (P.forId === i.id) + '"><span class="ms ck" aria-hidden="true">check</span>' + (c ? '<span class="ms li" aria-hidden="true">' + esc(c.icon) + '</span>' : '') + esc(i.title) + '</button>'; }).join('');

  /* how long */
  const durs = CAL.durations.indexOf(P.dur) < 0 ? CAL.durations.concat(P.dur).sort((a, b) => a - b) : CAL.durations;
  $('planDur').innerHTML = durs.map((m) => '<button type="button" role="radio" data-dur="' + m + '" aria-checked="' + (m === P.dur) + '"><span class="ms" aria-hidden="true">check</span>' + durLabel(m) + '</button>').join('');

  /* suggestions */
  const have = [0, 1].filter((i) => S.data.busy[i]);
  let note = '';
  if (!have.length) note = 'Connect a calendar to see when you’re both free. Until then these are just your usual date hours.';
  else if (have.length === 1) note = 'Only ' + S.data.people[have[0]] + '’s calendar is connected, so these only check ' + (have[0] === S.me ? 'yours' : 'theirs') + '.';
  $('planNote').textContent = note; $('planNote').hidden = !note;
  $('planSync').disabled = P.syncing || S.me === null || !cal.connectedList().length;
  $('planSync').classList.toggle('spinning', P.syncing);
  const list = suggestions(P.dur);
  if (!list.length) { $('slots').innerHTML = '<p class="empty"><span class="ms" aria-hidden="true">event_busy</span>No shared free time in the next ' + CAL.lookaheadDays + ' days for that length. Try a shorter one.</p>'; return; }
  let html = '', lastDay = '';
  list.forEach((s) => {
    const dn = dayName(s.start);
    if (dn !== lastDay) { if (lastDay) html += '</div>'; html += '<div class="day-group"><h3>' + dn + '</h3>'; lastDay = dn; }
    html += '<div class="slot"><span class="sbody"><b>' + rangeText(s.start, s.end) + '</b><span>' + (s.freeUntil - s.end >= 30 * MIN ? 'Free until ' + tFmt(s.freeUntil) : 'Just fits') + '</span></span>'
      + '<button type="button" class="btn tonal sm rp" data-book="' + s.start + ',' + s.end + '">Book</button></div>';
  });
  $('slots').innerHTML = html + '</div>';
}

/* ---------- entry points from elsewhere */
export function findTimeFor(itemId) {
  const i = find(itemId); if (i < 0) return;
  P.forId = itemId;
  P.dur = CAL.listDurations[S.data.items[i].list] || CAL.defaultDuration;
  if (S.page === 'plan') { renderPlan(); return; }
  goPage('plan');
}

/* ---------- booking sheet */
function openBook(b) {
  if (S.me === null) { import('./people.js').then((m) => m.openWho()); return; }
  book = b;
  $('bookWhen').textContent = dayName(b.start) + ', ' + rangeText(b.start, b.end);
  $('bTitle').value = b.title;
  const opts = Object.keys(cal.PROVIDERS).filter(cal.configured);
  const conn = opts.filter(cal.connected);
  book.provider = conn[0] || null;
  $('bCal').innerHTML = opts.map((p) => cal.connected(p)
    ? '<button type="button" class="fchip rp" role="radio" data-p="' + p + '" aria-pressed="' + (p === book.provider) + '"><span class="ms ck" aria-hidden="true">check</span>My ' + cal.PROVIDERS[p].name + '</button>'
    : '<button type="button" class="fchip rp" data-connect="' + p + '"><span class="ms" aria-hidden="true">add</span>Connect ' + cal.PROVIDERS[p].short + '</button>').join('')
    || '<p class="cal-hint">No calendar keys set up yet (see README).</p>';
  $('bookSave').disabled = !book.provider;
  $('bookNote').textContent = 'Added as a private event, so others only see that you’re busy.' + (b.planId ? '' : ' ' + S.data.people[otherOf(S.me)] + ' sees it on the Plan tab and can add it to their own calendar with one tap.');
  if (!$('bookSheet').open) $('bookSheet').showModal();
}
async function doBook(e) {
  if (e) e.preventDefault();
  if (!book || !book.provider) return;
  const b = book, title = ($('bTitle').value || '').trim() || CAL.defaultEventTitle;
  $('bookSave').disabled = true; $('bookSave').textContent = 'Adding…';
  store.set('gp-pending-book', Object.assign({}, b, { title }));   // survives the Outlook sign-in round trip
  try {
    await cal.createEvent(b.provider, { title, note: 'Planned in ' + document.title, start: b.start, end: b.end });
    store.set('gp-pending-book', null);
    afterBooked(b, title);
    book = null; closeDialog($('bookSheet'));
  } catch (err) {
    store.set('gp-pending-book', null);
    $('bookSave').disabled = false; $('bookSave').textContent = 'Add to calendar';
    if (err.message !== 'cancelled') showSnack(err.code === 'auth' ? 'Please reconnect ' + cal.PROVIDERS[b.provider].name + ' and try again.' : err.message);
  }
}
function afterBooked(b, title) {
  const me = S.me;
  if (b.planId) {
    const p = S.data.plans.find((x) => x.id === b.planId);
    if (p) { p.added = (p.added || [null, null]).slice(); p.added[me] = b.provider; }
  } else {
    const added = [null, null]; added[me] = b.provider;
    S.data.plans.push({ id: 'p' + uid(), title, itemId: b.itemId || null, start: b.start, end: b.end, by: me, added });
  }
  const mine = S.data.busy[me];
  if (mine) mine.blocks = cal.mergeBlocks((mine.blocks || []).concat([[b.start, b.end]]));
  commit();
  showSnack('Added to your ' + cal.PROVIDERS[b.provider].name + ' as a private event');
}
/* finish a booking that was waiting on the Outlook sign-in */
export async function resumePendingBook() {
  const b = store.get('gp-pending-book'); if (!b || S.me === null) return;
  store.set('gp-pending-book', null);
  try { await cal.createEvent(b.provider, { title: b.title, note: 'Planned in ' + document.title, start: b.start, end: b.end }); afterBooked(b, b.title); }
  catch (err) { showSnack('Couldn’t add it to ' + cal.PROVIDERS[b.provider].name + ': ' + err.message); }
}

/* ---------- taps */
export function initPlanner() {
  $('pgPlan').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'planWho') { import('./people.js').then((m) => m.openWho()); return; }
    if (t.id === 'planSync') { syncMine(true); return; }
    if (t.hasAttribute('data-conn')) {
      const p = t.getAttribute('data-conn');
      try { await cal.connect(p); await syncMine(true); showSnack(cal.PROVIDERS[p].name + ' connected'); }
      catch (err) { if (err.message !== 'cancelled') { P.error = err.message; renderPlan(); } }
      return;
    }
    if (t.hasAttribute('data-disc')) {
      const p = t.getAttribute('data-disc'); cal.disconnect(p);
      if (!cal.connectedList().length && S.me !== null) { S.data.busy[S.me] = null; commit(); } else syncMine(false);
      showSnack(cal.PROVIDERS[p].name + ' disconnected from this phone');
      renderPlan(); return;
    }
    if (t.hasAttribute('data-for')) {
      P.forId = t.getAttribute('data-for');
      const it = P.forId ? S.data.items[find(P.forId)] : null;
      P.dur = it ? (CAL.listDurations[it.list] || CAL.defaultDuration) : P.dur;
      renderPlan(); return;
    }
    if (t.hasAttribute('data-dur')) { P.dur = +t.getAttribute('data-dur'); renderPlan(); slideIn($('slots'), 16); return; }
    if (t.hasAttribute('data-book')) {
      const [s, en] = t.getAttribute('data-book').split(',').map(Number);
      const it = P.forId ? S.data.items[find(P.forId)] : null;
      openBook({ start: s, end: en, itemId: P.forId || null, title: it ? it.title : CAL.defaultEventTitle });
      return;
    }
    const row = t.closest('[data-plan]');
    if (row) {
      const id = row.getAttribute('data-plan'), p = S.data.plans.find((x) => x.id === id); if (!p) return;
      if (t.hasAttribute('data-addmine')) openBook({ start: p.start, end: p.end, planId: p.id, itemId: p.itemId, title: p.title });
      else if (t.hasAttribute('data-delplan')) {
        const idx = S.data.plans.indexOf(p);
        S.data.plans.splice(idx, 1); commit();
        showSnack('Removed from the app. It stays in your calendars.', () => { S.data.plans.splice(idx, 0, p); });
      }
    }
  });

  $('bCal').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !book) return;
    if (b.hasAttribute('data-connect')) {
      const p = b.getAttribute('data-connect');
      store.set('gp-pending-open', book);
      try { await cal.connect(p); store.set('gp-pending-open', null); openBook(book); syncMine(false); }
      catch (err) { store.set('gp-pending-open', null); if (err.message !== 'cancelled') showSnack(err.message); }
      return;
    }
    book.provider = b.getAttribute('data-p');
    qa('#bCal [data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('bookSave').disabled = false;
  });
  $('bookForm').addEventListener('submit', doBook);
  $('bookCancel').addEventListener('click', () => { book = null; closeDialog($('bookSheet')); });
  $('bookSheet').addEventListener('click', (e) => { if (e.target === $('bookSheet')) { book = null; closeDialog($('bookSheet')); } });
  $('bookSheet').addEventListener('close', () => { $('bookSave').textContent = 'Add to calendar'; });
}
/* after coming back from an Outlook sign-in that started inside the booking sheet */
export function resumePendingOpen() {
  const b = store.get('gp-pending-open'); if (!b) return;
  store.set('gp-pending-open', null);
  if (cal.connectedList().length) setTimeout(() => openBook(b), 400);
}
