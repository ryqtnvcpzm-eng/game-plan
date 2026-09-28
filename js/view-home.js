/* HOME: greeting and day count over a photo, quick stats, your next plan,
   "your turn to rate", what's up next, your lists and what you did lately. */

import { $, esc, plural, daysBetween, fmt, weekday, todayISO } from './util.js';
import { S, cat, openItems, doneItems, avgOf, fmtAvg, waiting, sortOpen, sortDone, upcomingPlans, otherOf } from './state.js';
import { rowHTML, emptyRow, put } from './rows.js';
import { setNum } from './motion.js';
import { setPhoto } from './images.js';
import { listCardHTML, newListCardHTML } from './view-lists.js';

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return part + (S.me !== null ? ', ' + S.data.people[S.me] : '');
}
const when = (ms) => { const d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0); const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  return day + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

export function renderHome() {
  const today = todayISO(), items = S.data.items, open = openItems(), done = doneItems();
  const pct = items.length ? Math.round(done.length / items.length * 100) : 0;

  /* hero */
  setPhoto($('homeHeroImg'), 'home', 1600);
  $('homeHello').textContent = greeting();
  setNum($('homeDay'), Math.max(1, daysBetween(S.data.startedAt, today) + 1));
  $('homeSince').textContent = 'of your game plan, since ' + weekday(S.data.startedAt) + ', ' + fmt(S.data.startedAt, true);
  $('homeRingVal').style.strokeDashoffset = String(100 - pct);
  $('homeRingPct').textContent = pct + '%';
  $('homeRing').setAttribute('aria-label', pct + ' percent crossed off');

  /* stats */
  setNum($('statTodo'), open.length);
  setNum($('statDone'), done.length);
  const rated = done.filter((i) => avgOf(i));
  setNum($('statAvg'), rated.length ? fmtAvg(rated.reduce((a, i) => a + avgOf(i), 0) / rated.length) : '–');

  /* next plan */
  const next = upcomingPlans()[0];
  put($('homeNext'), next
    ? '<span class="np-ic"><span class="ms" aria-hidden="true">event</span></span><span class="np-body"><span class="np-label">Next plan</span><span class="np-title">' + esc(next.title) + '</span><span class="np-when">' + when(next.start) + '</span></span><span class="ms chev" aria-hidden="true">chevron_right</span>'
    : '<span class="np-ic"><span class="ms" aria-hidden="true">calendar_add_on</span></span><span class="np-body"><span class="np-label">Nothing booked yet</span><span class="np-title">Find a time you’re both free</span></span><span class="ms chev" aria-hidden="true">chevron_right</span>');

  /* your turn to rate */
  const wait = waiting().sort(sortDone);
  $('homeTurn').hidden = !wait.length;
  if (wait.length) {
    if (S.me !== null) {
      $('homeTurnTitle').textContent = 'Your turn to rate';
      $('homeTurnText').textContent = S.data.people[otherOf(S.me)] + ' rated ' + (wait.length === 1 ? 'this' : 'these') + ' already. Add your stars to finish the average.';
    } else {
      $('homeTurnTitle').textContent = 'Waiting for a second rating';
      $('homeTurnText').textContent = 'One of you has rated ' + (wait.length === 1 ? 'this' : 'these') + '. Choose who you are in Settings to see only your turn.';
    }
    put($('homeTurnRows'), wait.slice(0, 4).map((i) => { const r = i.rating || [], by = r[0] ? 0 : 1, c = cat(i.list);
      return rowHTML(i, { meta: (c ? esc(c.name) + ' · ' : '') + esc(S.data.people[by]) + ' gave it ' + r[by] }); }).join(''));
  }

  /* up next: flagged first; if nothing is flagged, the ones waiting longest */
  const flagged = open.filter((i) => i.pr > 0).sort(sortOpen);
  const up = (flagged.length ? flagged : open.slice().sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1))).slice(0, 5);
  put($('homeUpNext'), up.length ? up.map((i) => rowHTML(i, { showList: true })).join('')
    : emptyRow('celebration', 'Everything’s crossed off. Add what’s next.'));

  /* lists */
  put($('homeLists'), S.data.cats.map(listCardHTML).join('') + newListCardHTML());

  /* recent */
  const recent = done.slice().sort(sortDone).slice(0, 3);
  put($('homeRecent'), recent.length ? recent.map((i) => rowHTML(i, { showList: true })).join('')
    : emptyRow('auto_awesome', 'Nothing crossed off yet. The first one will show up here.'));
}
export { plural };
