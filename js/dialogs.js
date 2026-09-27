/* Shared bits for pop-ups: closing any dialog with motion, and the snackbar
   (the little message bar at the bottom, with optional Undo). */

import { $ } from './util.js';
import { S } from './state.js';
import { anim, EMPH_ACC } from './motion.js';

/* bottom sheets slide down; centered dialogs shrink */
export function closeDialog(d) {
  if (!d.open) return Promise.resolve();
  if (d._dragged) {                                   // already slid away by a swipe
    d._dragged = false; d.close();
    if (d.getAnimations) d.getAnimations().forEach((a) => a.cancel());
    return Promise.resolve();
  }
  const sheet = d.classList.contains('sheet');
  const a = anim(d, sheet
    ? [{ transform: 'none', opacity: 1 }, { transform: 'translateY(56px)', opacity: 0 }]
    : [{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }],
  { duration: sheet ? 200 : 160, easing: EMPH_ACC });
  const done = () => { if (d.open) d.close(); };
  if (!a) { done(); return Promise.resolve(); }
  return a.finished.then(done, done);
}
export const anyDialogOpen = () => [].some.call(document.querySelectorAll('dialog'), (d) => d.open);

/* phones: swipe a bottom sheet down to close it, like iOS */
export function initSheetDrag() {
  [].forEach.call(document.querySelectorAll('dialog.sheet'), (d) => {
    let y0 = null, dy = 0, t0 = 0;
    d.addEventListener('touchstart', (e) => {
      if (window.innerWidth >= 768 || e.touches.length !== 1 || d.scrollTop > 0) return;
      const top = d.getBoundingClientRect().top, y = e.touches[0].clientY;
      if (y - top > 84 || e.target.closest('input, textarea')) return;   // grab near the top edge
      y0 = y; dy = 0; t0 = performance.now(); d.classList.add('dragging');
    }, { passive: true });
    d.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 4) e.preventDefault();
      d.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });
    const end = () => {
      if (y0 === null) return;
      const v = dy / Math.max(1, performance.now() - t0);
      y0 = null; d.classList.remove('dragging');
      if (dy > 110 || (dy > 30 && v > 0.5)) {
        const a = anim(d, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' });
        d.style.transform = '';
        const finish = () => {
          d._dragged = true;
          const ev = new Event('cancel', { cancelable: true });
          d.dispatchEvent(ev);
          if (!ev.defaultPrevented) closeDialog(d);
          d._dragged = false;
        };
        if (a) a.finished.then(finish, finish); else finish();
      } else {
        anim(d, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
        d.style.transform = '';
      }
    };
    d.addEventListener('touchend', end); d.addEventListener('touchcancel', end);
  });
}

let snackTimer = null, onUndo = null;
export function showSnack(msg, undoFn) {
  onUndo = undoFn || null;
  $('snackMsg').textContent = msg;
  $('snackUndo').hidden = !undoFn;
  const s = $('snack'); s.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { s.classList.remove('show'); onUndo = null; }, 5000);
}
export function initSnack(afterUndo) {
  $('snackUndo').addEventListener('click', () => {
    if (!onUndo) return;
    const f = onUndo; onUndo = null;
    $('snack').classList.remove('show');
    f(); afterUndo();
  });
}
