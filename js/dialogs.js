/* DIALOGS: one consistent way to open and close every sheet and pop-up.
   Close by: Cancel, tapping outside, Esc, or (phones) swiping a sheet down.
   Also: the toast at the bottom (with Undo), confirm pop-ups, action sheets. */

import { $, qa, esc } from './util.js';
import { anim, reduce, EASE_OUT } from './motion.js';

const dismissers = new WeakMap();     // dialog -> what "dismiss" means for it

export function openDialog(d, focusEl) {
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  if (focusEl && window.innerWidth >= 700) setTimeout(() => focusEl.focus({ preventScroll: true }), 60);
}
export function closeDialog(d) {
  if (!d.open) return Promise.resolve();
  if (d._swiped) { d._swiped = false; d.close(); d.getAnimations && d.getAnimations().forEach((a) => a.cancel()); return Promise.resolve(); }
  const sheet = d.classList.contains('sheet') && window.innerWidth < 700;
  const a = reduce ? null : anim(d, sheet ? [{ transform: 'none' }, { transform: 'translateY(100%)' }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: sheet ? 240 : 150, easing: EASE_OUT, fill: 'forwards' });
  const done = () => { if (d.open) d.close(); if (a) a.cancel(); };
  if (!a) { done(); return Promise.resolve(); }
  return a.finished.then(done, done);
}
/* what happens when the person backs out of this dialog (default: just close it) */
export function onDismiss(d, fn) { dismissers.set(d, fn); }
export function dismiss(d) { const fn = dismissers.get(d); if (fn) fn(); else closeDialog(d); }

export function initDialogs() {
  qa('dialog').forEach((d) => {
    d.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(d); });              // Esc
    d.addEventListener('click', (e) => {
      if (e.target === d) { dismiss(d); return; }                                          // tap outside
      if (e.target.closest('[data-close]')) { e.preventDefault(); dismiss(d); }
    });
    if (d.classList.contains('sheet')) swipeToClose(d);
  });
}

/* phones: drag a sheet down from its top area to close it */
function swipeToClose(d) {
  let y0 = null, dy = 0, t0 = 0;
  d.addEventListener('touchstart', (e) => {
    if (window.innerWidth >= 700 || e.touches.length !== 1 || d.scrollTop > 0) return;
    const y = e.touches[0].clientY, top = d.getBoundingClientRect().top;
    if (y - top > 64 || e.target.closest('input, textarea, button')) return;
    y0 = y; dy = 0; t0 = performance.now();
  }, { passive: true });
  d.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 2) e.preventDefault();
    d.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    if (dy > 100 || (dy > 24 && v > 0.45)) {
      const a = anim(d, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(100%)' }], { duration: 200, easing: EASE_OUT, fill: 'forwards' });
      d.style.transform = '';
      const finish = () => { d._swiped = true; dismiss(d); d._swiped = false; if (d.open) { d.close(); } };
      if (a) a.finished.then(finish, finish); else finish();
    } else {
      anim(d, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
      d.style.transform = '';
    }
  };
  d.addEventListener('touchend', end); d.addEventListener('touchcancel', end);
}

/* ---------- toast */
let toastTimer = null, undoFn = null, afterUndo = null;
export function toast(msg, onUndo) {
  undoFn = onUndo || null;
  $('toastText').textContent = msg;
  $('toastUndo').hidden = !onUndo;
  const t = $('toast'); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); undoFn = null; }, onUndo ? 5000 : 3000);
}
export function initToast(after) {
  afterUndo = after;
  $('toastUndo').addEventListener('click', () => {
    if (!undoFn) return;
    const f = undoFn; undoFn = null;
    $('toast').classList.remove('show');
    f(); if (afterUndo) afterUndo();
  });
}

/* ---------- confirm pop-up. Resolves true if confirmed. */
export function confirmBox({ title, text, items, ok }) {
  const d = $('confirmDialog');
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text || '';
  $('confirmPeek').innerHTML = (items || []).map((t) => '<li><span class="ms" aria-hidden="true">' + (t.done ? 'check_circle' : 'radio_button_unchecked') + '</span>' + esc(t.title) + '</li>').join('');
  $('confirmPeek').hidden = !(items && items.length);
  $('confirmOk').textContent = ok || 'Delete';
  return new Promise((resolve) => {
    const finish = (v) => { onDismiss(d, null); $('confirmOk').onclick = $('confirmCancel').onclick = null; closeDialog(d).then(() => resolve(v)); };
    onDismiss(d, () => finish(false));
    $('confirmOk').onclick = () => finish(true);
    $('confirmCancel').onclick = () => finish(false);
    openDialog(d);
    $('confirmCancel').focus({ preventScroll: true });
  });
}

/* ---------- action sheet: [{label, danger, run}] */
export function actionSheet(actions) {
  const d = $('actionSheet');
  $('actionList').innerHTML = actions.map((a, i) => '<button type="button" data-i="' + i + '" class="' + (a.danger ? 'danger' : '') + '">' + esc(a.label) + '</button>').join('');
  $('actionList').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = actions[+b.dataset.i];
    closeDialog(d).then(() => a.run());
  };
  openDialog(d);
}
