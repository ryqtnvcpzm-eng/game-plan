/* RATING: "How was it?" Opens when something is crossed off (mode 'cross')
   or when you tap a star chip (mode 'edit'). Each person has their own stars.
   Backing out of a 'cross' sheet still crosses it off, just without a rating. */

import { $, qa, esc, plural, todayISO } from './util.js';
import { S, item, avgOf, fmtAvg, otherOf } from './state.js';
import { anim, EASE } from './motion.js';
import { openDialog, closeDialog, onDismiss, toast } from './dialogs.js';
import { commit } from './actions.js';

const STARS = 5;
let rs = null;   // { id, mode, r: [a, b] }

function paint(bounceRow) {
  qa('#rateRows .stars').forEach((box) => {
    const p = +box.dataset.p, v = rs.r[p] || 0;
    qa('button', box).forEach((b, i) => {
      const on = i < v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(i + 1 === v));
      if (p === bounceRow && on) anim(b.firstChild, [{ transform: 'scale(.6)' }, { transform: 'scale(1.2)', offset: 0.55 }, { transform: 'none' }], { duration: 340, delay: i * 30, easing: EASE });
    });
  });
  const r = rs.r.filter((v) => v > 0), avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  const nb = $('rateAvg'), txt = avg ? fmtAvg(avg) : '';
  if (nb.textContent !== txt) { nb.textContent = txt; anim(nb, [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE }); }
  $('rateAvgLabel').textContent = r.length === 2 ? 'together' : r.length === 1 ? 'so far' : 'No stars yet';
  $('rateSave').disabled = rs.mode === 'cross' && !r.length;
}

export function openRate(id, mode) {
  const it = item(id); if (!it) return;
  rs = { id, mode, r: (it.rating || [0, 0]).slice(0, 2) };
  while (rs.r.length < 2) rs.r.push(0);
  $('rateHeading').textContent = mode === 'cross' ? 'Crossed off' : 'Rating';
  $('rateTitle').textContent = 'How was ' + it.title + '?';
  $('rateRows').innerHTML = S.data.people.map((n, p) => '<div class="rate-row"><div class="rate-who"><span class="rate-name">' + esc(n) + '</span>' + (S.me === p ? '<span class="you">You</span>' : '') + '</div>'
    + '<div class="stars" data-p="' + p + '" role="radiogroup" aria-label="' + esc(n) + '’s rating">'
    + Array.from({ length: STARS }, (_, i) => '<button type="button" role="radio" data-v="' + (i + 1) + '" aria-label="' + plural(i + 1, 'star') + '"><span class="ms" aria-hidden="true">star</span></button>').join('')
    + '</div></div>').join('');
  $('rateSkip').textContent = mode === 'cross' ? 'Skip' : 'Cancel';
  $('rateSave').textContent = 'Save';
  $('rateAvg').textContent = '';
  paint();
  openDialog($('rateSheet'));
}

function finish(save) {
  const cur = rs; if (!cur) return;
  rs = null;
  closeDialog($('rateSheet'));
  const x = item(cur.id); if (!x) return;
  if (cur.mode === 'cross') {
    x.doneAt = todayISO();
    if (save) x.rating = cur.r.slice();
    S.flashId = x.id;
    commit();
    const one = save && (!x.rating[0] !== !x.rating[1]);
    toast('Crossed off' + (save && avgOf(x) ? ', ' + fmtAvg(avgOf(x)) + '★' : '') + (one ? '. ' + S.data.people[x.rating[0] ? 1 : 0] + ' will be asked.' : ''),
      () => { const y = item(cur.id); if (y) y.doneAt = null; });
  } else if (save) {
    const before = (x.rating || []).filter((v) => v > 0).length;
    x.rating = cur.r.slice(); commit();
    const now = x.rating.filter((v) => v > 0).length;
    if (now === 2 && before < 2) toast('Rated together: ' + fmtAvg(avgOf(x)) + '★');
    else if (now === 1 && before === 0 && S.me !== null && x.rating[S.me]) toast('Saved. ' + S.data.people[otherOf(S.me)] + ' will be asked.');
  }
}

export function initRating() {
  $('rateRows').addEventListener('click', (e) => {
    const b = e.target.closest('.stars button'); if (!b || !rs) return;
    const p = +b.parentNode.dataset.p, v = +b.dataset.v;
    rs.r[p] = rs.r[p] === v ? 0 : v;       // tap the same star again to clear
    paint(p);
  });
  $('rateForm').addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
  $('rateSkip').addEventListener('click', () => finish(false));
  onDismiss($('rateSheet'), () => finish(false));
}
