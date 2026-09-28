/* ACTIONS: commit() saves and redraws; tapping rows (check, flag, stars, edit);
   the New buttons. */

import { $, qa } from './util.js';
import { S, find, item, PRIORITY, FILTER_NAME, filterFor, isSmart } from './state.js';
import { render } from './render.js';
import { save } from './store.js';
import { anim, snap, flip, collapse, burst, pop, reduce, EASE } from './motion.js';
import { toast } from './dialogs.js';
import { openItemSheet } from './item-sheet.js';
import { openRate } from './rating.js';
import { openListSheet } from './list-sheet.js';

/* Call after changing S.data: redraws (rows glide to their new spots) and saves. */
export function commit() {
  const root = $('main'), before = snap(root);
  render();
  flip(before, root);
  S.flashId = null;
  save(S.data);
}
/* redraw only (e.g. the other person changed something) */
export function redraw() {
  const root = $('main'), before = snap(root);
  render();
  flip(before, root);
}

function rowEl(id) { return qa('.row[data-id="' + CSS.escape(id) + '"]').find((li) => li.offsetHeight) || null; }

/* ---------- tapping a row */
function onRowTap(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const li = btn.closest('.row[data-id]'); if (!li) return;
  const id = li.dataset.id, it = item(id); if (!it) return;
  const act = btn.dataset.act;

  if (act === 'toggle') {
    if (S.busy[id]) return;
    S.busy[id] = 1;
    const willDone = !it.doneAt;
    li.classList.toggle('done', willDone);
    btn.setAttribute('aria-checked', String(willDone));
    if (willDone) { anim(btn.querySelector('.box'), [{ transform: 'scale(1)' }, { transform: 'scale(.8)', offset: 0.35 }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'none' }], { duration: 380, easing: EASE }); burst(btn); }
    setTimeout(() => {
      delete S.busy[id];
      const x = item(id); if (!x) return;
      if (willDone) { openRate(id, 'cross'); return; }        // crossing off asks how it was
      x.doneAt = null; commit();
    }, reduce ? 0 : 300);

  } else if (act === 'pr') {
    if (S.busy[id]) return;
    const np = (it.pr + 1) % 4;
    const listId = S.route.name === 'list' ? S.route.id : null;
    const f = listId ? filterFor(listId) : 'all';
    const leaves = li.parentNode.id === 'listRows' && ((f !== 'all' && np !== +f) || (listId === '_flagged' && np === 0));
    if (leaves) {
      S.busy[id] = 1;
      collapse(li, () => { delete S.busy[id]; const x = item(id); if (!x) return; x.pr = np; commit(); toast('Moved to ' + FILTER_NAME[np]); });
    } else {
      it.pr = np; commit();
      const nb = rowEl(id); if (nb) pop(nb.querySelector('[data-act=pr]'));
    }

  } else if (act === 'rate') openRate(id, 'edit');
  else if (act === 'edit') openItemSheet('edit', id);
}

/* what list "New" adds to, given where you are */
export function defaultListForNew() {
  if (S.route.name === 'list' && S.route.id && !isSmart(S.route.id)) return S.route.id;
  return S.data.cats[0].id;
}

export function initActions() {
  $('main').addEventListener('click', (e) => {
    if (e.target.closest('.row[data-id] [data-act]')) { onRowTap(e); return; }
    if (e.target.closest('[data-newlist]')) { openListSheet('add'); return; }
    if (e.target.closest('[data-add]')) { openItemSheet('add', null, defaultListForNew()); }
  });
  qa('[data-add]', $('topbar')).forEach((b) => b.addEventListener('click', () => openItemSheet('add', null, defaultListForNew())));
  $('fab').addEventListener('click', () => openItemSheet('add', null, defaultListForNew()));
}
export { PRIORITY };
