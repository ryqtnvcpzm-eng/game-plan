/* ROWS: how one item looks, everywhere it appears.
   opts: { showList: true } adds the list name, { rated: true } shows who gave what,
         { meta: '...' } replaces the small grey line. */

import { esc, plural, daysBetween, fmt, todayISO } from './util.js';
import { S, cat, avgOf, fmtAvg, isMyTurn, planFor, PRIORITY } from './state.js';

const dayTime = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function metaFor(it, today) {
  if (it.doneAt) {
    const took = daysBetween(it.addedAt, it.doneAt);
    return 'Crossed off ' + fmt(it.doneAt) + (took <= 0 ? ', same day' : ', after ' + plural(took, 'day'));
  }
  const p = planFor(it.id);
  if (p) return 'Planned for ' + dayTime(p.start);
  const d = daysBetween(it.addedAt, today || todayISO());
  if (d <= 0) return 'Added today';
  if (d === 1) return 'Added yesterday';
  return 'Added ' + fmt(it.addedAt) + ', ' + plural(d, 'day') + ' ago';
}
function whoRated(it) {
  const r = it.rating || [], out = [];
  S.data.people.forEach((n, i) => { if (r[i]) out.push(esc(n) + ' ' + r[i]); });
  return out.join(', ');
}

export function rowHTML(it, opts) {
  opts = opts || {};
  const done = !!it.doneAt, t = esc(it.title), c = cat(it.list);
  let meta = esc(metaFor(it));
  if (opts.showList && c) meta = esc(c.name) + ' · ' + meta;
  if (opts.rated) meta = (c ? esc(c.name) + ' · ' : '') + whoRated(it);
  if (opts.meta) meta = opts.meta;

  let tail;
  if (!done) {
    tail = it.pr
      ? '<button type="button" class="pr-chip p' + it.pr + '" data-act="pr" aria-label="Priority ' + PRIORITY[it.pr] + ', tap to change"><span class="ms fill" aria-hidden="true">flag</span>' + PRIORITY[it.pr] + '</button>'
      : '<button type="button" class="pr-add" data-act="pr" aria-label="Set a priority"><span class="ms" aria-hidden="true">flag</span></button>';
  } else if (isMyTurn(it)) {
    tail = '<button type="button" class="star-chip turn" data-act="rate" aria-label="Your turn to rate"><span class="ms fill" aria-hidden="true">star</span>Rate</button>';
  } else {
    const av = avgOf(it);
    tail = av
      ? '<button type="button" class="star-chip" data-act="rate" aria-label="Rated ' + fmtAvg(av) + ', tap to change"><span class="ms fill" aria-hidden="true">star</span>' + fmtAvg(av) + '</button>'
      : '<button type="button" class="star-chip none" data-act="rate" aria-label="Rate it"><span class="ms" aria-hidden="true">star</span>Rate</button>';
  }
  return '<li class="row' + (done ? ' done' : '') + (it.id === S.flashId ? ' flash' : '') + '" data-id="' + esc(it.id) + '">'
    + '<button type="button" class="row-check" data-act="toggle" role="checkbox" aria-checked="' + done + '" aria-label="' + (done ? 'Mark not done: ' : 'Cross off: ') + t + '"><span class="box"><span class="ms" aria-hidden="true">check</span></span></button>'
    + '<div class="row-main">'
    + '<button type="button" class="row-text" data-act="edit"><span class="row-title"><span class="t">' + t + '</span></span>'
    + (it.note ? '<span class="row-note">' + esc(it.note) + '</span>' : '')
    + '<span class="row-meta">' + meta + '</span></button>'
    + '<span class="row-tail">' + tail + '</span>'
    + '</div></li>';
}
/* only touch the page when something actually changed (keeps redraws calm) */
export function put(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }
export const emptyRow = (icon, text) => '<li class="row-empty"><span class="ms" aria-hidden="true">' + icon + '</span><span>' + text + '</span></li>';
