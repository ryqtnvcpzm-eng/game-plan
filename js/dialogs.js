/* Shared bits for pop-ups: closing any dialog with motion, and the snackbar
   (the little message bar at the bottom, with optional Undo). */

import { $ } from './util.js';
import { S } from './state.js';
import { anim, EMPH_ACC } from './motion.js';

/* bottom sheets slide down; centered dialogs shrink */
export function closeDialog(d) {
  if (!d.open) return Promise.resolve();
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
