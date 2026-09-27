/* RATING: the "How was it?" sheet. Opens when something is crossed off
   (mode 'cross') or when you tap a star chip (mode 'edit').
   Each person has their own row of stars; the average is shown live. */

import { CONFIG } from './config.js';
import { $, qa, clean, plural, todayISO } from './util.js';
import { S, find, avgOf, fmtAvg, otherOf } from './state.js';
import { anim, STD, EMPH_DEC } from './motion.js';
import { closeDialog, showSnack } from './dialogs.js';
import { commit } from './actions.js';

let rs = null;   // { id, mode, r: [a, b] }
const dlg = () => $('rateSheet');

function paint(bounce) {
  qa('#rateSheet .stars').forEach((box) => {
    const p = +box.getAttribute('data-p'), v = rs.r[p] || 0;
    qa('button', box).forEach((b, i) => {
      const on = i < v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(i + 1 === v));
      if (p === bounce && on) anim(b, [{ transform: 'scale(.6)' }, { transform: 'scale(1.22)', offset: 0.55 }, { transform: 'none' }], { duration: 380, delay: i * 35, easing: STD });
    });
  });
  const r = rs.r.filter((v) => v > 0), avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  const nb = $('avgNum'), txt = fmtAvg(avg);
  if (nb.textContent !== txt) { nb.textContent = txt; anim(nb, [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EMPH_DEC }); }
  $('avgLbl').textContent = r.length === 2 ? 'Together' : r.length === 1 ? 'So far' : 'No ratings yet';
  $('rateSave').disabled = rs.mode === 'cross' && !r.length;
}

export function openRate(id, mode) {
  const j = find(id); if (j < 0) return;
  const it = S.data.items[j];
  rs = { id, mode, r: (it.rating || [0, 0]).slice(0, 2) };
  while (rs.r.length < 2) rs.r.push(0);
  $('rateTitle').textContent = 'How was ' + it.title + '?';
  $('n0').value = S.data.people[0]; $('n1').value = S.data.people[1];
  $('you0').hidden = S.me !== 0; $('you1').hidden = S.me !== 1;
  const stars = [];
  for (let v = 1; v <= CONFIG.maxStars; v++) stars.push('<button type="button" role="radio" data-v="' + v + '" aria-label="' + plural(v, 'star') + '"><span class="ms" aria-hidden="true">star</span></button>');
  qa('#rateSheet .stars').forEach((box) => { box.innerHTML = stars.join(''); });
  $('rateSkip').textContent = mode === 'cross' ? 'Skip' : 'Cancel';
  $('rateSave').textContent = mode === 'cross' ? 'Save rating' : 'Save';
  $('avgNum').textContent = '';
  paint();
  if (!dlg().open) dlg().showModal();
}

function saveNames() {
  let changed = false;
  [0, 1].forEach((i) => { const v = clean($('n' + i).value); if (v && v !== S.data.people[i]) { S.data.people[i] = v; changed = true; } });
  return changed;
}

function finish(save) {
  const cur = rs; if (!cur) return;
  rs = null;
  const names = saveNames();
  closeDialog(dlg());
  const j = find(cur.id);
  if (j < 0) { if (names) commit(); return; }
  const x = S.data.items[j];
  if (cur.mode === 'cross') {
    x.doneAt = todayISO();
    if (save) x.rating = cur.r.slice();
    commit();
    const oneSided = save && (!x.rating[0] !== !x.rating[1]);
    showSnack('Crossed off “' + x.title + '”' + (save && avgOf(x) ? ', rated ' + fmtAvg(avgOf(x)) : '')
      + (oneSided ? '. ' + S.data.people[x.rating[0] ? 1 : 0] + ' will be asked next.' : ''),
    () => { const k = find(x.id); if (k > -1) S.data.items[k].doneAt = null; });
  } else if (save) {
    const before = (x.rating || []).filter((v) => v > 0).length;
    x.rating = cur.r.slice(); commit();
    const now = x.rating.filter((v) => v > 0).length;
    if (now === 2 && before < 2) showSnack('Rated together: ' + fmtAvg(avgOf(x)) + ' for “' + x.title + '”');
    else if (now === 1 && before === 0 && S.me !== null && x.rating[S.me]) showSnack('Saved. ' + S.data.people[otherOf(S.me)] + ' will see it’s their turn.');
  } else if (names) commit();
}

export function initRating() {
  dlg().addEventListener('click', (e) => {
    if (e.target === dlg()) { finish(false); return; }
    const b = e.target.closest('.stars button'); if (!b || !rs) return;
    const p = +b.parentNode.getAttribute('data-p'), v = +b.getAttribute('data-v');
    rs.r[p] = rs.r[p] === v ? 0 : v;       // tapping the same star again clears it
    paint(p);
  });
  $('rateForm').addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
  $('rateSkip').addEventListener('click', () => finish(false));
  dlg().addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
  ['n0', 'n1'].forEach((k) => $(k).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $(k).blur(); } }));
}
