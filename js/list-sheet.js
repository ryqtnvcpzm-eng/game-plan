/* LISTS: create, rename, change icon, delete.
   Deleting an empty list happens straight away; a list with anything in it
   asks first and shows what's inside. */

import { CONFIG } from './config.js';
import { $, qa, esc, clean, uid, plural } from './util.js';
import { S, cat, catIndex, avgOf, sortOpen, sortDone } from './state.js';
import { anim, EMPH_ACC, EMPH_DEC } from './motion.js';
import { closeDialog, showSnack } from './dialogs.js';
import { commit } from './actions.js';
import { revealTab } from './render.js';

let edit = null;          // { mode, id, icon }
let pendingDelete = null;
const dlg = () => $('catSheet');
const confirmDlg = () => $('confirmDlg');

function setIcon(ic) { edit.icon = ic; qa('#cIcons button').forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-i') === ic))); }

export function openListSheet(m, id) {
  const c = id ? cat(id) : null;
  if (m === 'edit' && !c) return;
  const icons = CONFIG.listIcons;
  edit = { mode: m, id: id || null, icon: c ? c.icon : icons[(S.data.cats.length + 2) % icons.length] };
  $('catTitle').textContent = m === 'add' ? 'New list' : 'Edit list';
  $('cName').value = c ? c.name : '';
  $('cIcons').innerHTML = icons.map((ic) => '<button type="button" role="radio" class="rp" data-i="' + ic + '" aria-label="' + ic.replace(/_/g, ' ') + '"><span class="ms" aria-hidden="true">' + ic + '</span></button>').join('');
  setIcon(edit.icon);
  $('catSave').textContent = m === 'add' ? 'Create' : 'Save';
  $('catDel').hidden = m !== 'edit';
  $('catSave').disabled = !clean($('cName').value);
  if (!dlg().open) dlg().showModal();
  if (m === 'add') $('cName').focus();
}

function submit(e) {
  e.preventDefault();
  if (!edit) return;
  const name = clean($('cName').value), ce = edit;
  if (!name) return;
  edit = null; closeDialog(dlg());
  if (ce.mode === 'add') {
    const c = { id: 'c' + uid(), name, icon: ce.icon };
    S.data.cats.push(c);
    S.tab = c.id; S.filter = 'all'; S.page = 'lists';
    commit(); window.scrollTo(0, 0); revealTab(true);
    showSnack('Created ' + name);
  } else {
    const k = cat(ce.id); if (!k) return;
    if (k.name === name && k.icon === ce.icon) return;
    k.name = name; k.icon = ce.icon; commit();
  }
}

/* ---------- deleting */
export function requestDeleteList(id) {
  const c = cat(id); if (!c) return;
  if (S.data.cats.length < 2) { showSnack('You need at least one list, so ' + c.name + ' stays.'); return; }
  const mine = S.data.items.filter((i) => i.list === id);
  if (!mine.length) { deleteList(id); return; }
  const o = mine.filter((i) => !i.doneAt).sort(sortOpen), d = mine.filter((i) => i.doneAt).sort(sortDone);
  const parts = [];
  if (o.length) parts.push(plural(o.length, 'item') + ' still to do');
  if (d.length) parts.push(d.length + ' crossed off' + (d.some((i) => avgOf(i)) ? ' with ratings' : ''));
  $('confirmTitle').textContent = 'Delete ' + c.name + '?';
  $('confirmText').textContent = 'This list isn’t empty. It has ' + parts.join(' and ') + '. Deleting the list deletes ' + (mine.length === 1 ? 'that item' : 'all of them') + ' too.';
  $('confirmPeek').innerHTML = o.concat(d).slice(0, 3).map((i) => '<li><span class="ms" aria-hidden="true">' + (i.doneAt ? 'check_box' : 'check_box_outline_blank') + '</span>' + esc(i.title) + '</li>').join('')
    + (mine.length > 3 ? '<li class="more"><span class="ms" aria-hidden="true">more_horiz</span>and ' + (mine.length - 3) + ' more</li>' : '');
  $('confirmOk').textContent = mine.length === 1 ? 'Delete anyway' : 'Delete all ' + mine.length;
  pendingDelete = id;
  confirmDlg().showModal();
  $('confirmCancel').focus();
}

function deleteList(id) {
  const ci = catIndex(id); if (ci < 0 || S.data.cats.length < 2) return;
  const c = S.data.cats[ci], gone = S.data.items.filter((i) => i.list === id);
  const go = () => {
    const k = catIndex(id); if (k < 0) return;
    S.data.cats.splice(k, 1);
    S.data.items = S.data.items.filter((i) => i.list !== id);
    if (S.tab === id) S.tab = S.data.cats[Math.max(0, k - 1)].id;
    commit();
    if (S.page === 'lists') { revealTab(true); anim($('listArea'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EMPH_DEC }); }
    showSnack('Deleted ' + c.name + (gone.length ? ' and its ' + plural(gone.length, 'item') : ''), () => {
      S.data.cats.splice(Math.min(k, S.data.cats.length), 0, c);
      S.data.items = S.data.items.concat(gone);
      S.tab = c.id;
    });
  };
  const target = S.page === 'lists' ? (S.tab === id ? $('listArea') : null) : document.querySelector('#cats [data-cat="' + id + '"]');
  const a = target ? anim(target, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 220, easing: EMPH_ACC }) : null;
  if (a) a.finished.then(go, go); else go();
}

export function initListSheet() {
  $('cIcons').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && edit) setIcon(b.getAttribute('data-i')); });
  $('cName').addEventListener('input', () => { $('catSave').disabled = !clean($('cName').value); });
  $('catCancel').addEventListener('click', () => { edit = null; closeDialog(dlg()); });
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) { edit = null; closeDialog(dlg()); } });
  dlg().addEventListener('close', () => { edit = null; });
  $('catForm').addEventListener('submit', submit);
  $('catDel').addEventListener('click', () => {
    if (!edit) return;
    const id = edit.id; edit = null;
    closeDialog(dlg()).then(() => requestDeleteList(id));
  });
  $('editCat').addEventListener('click', () => openListSheet('edit', S.tab));
  $('delCat').addEventListener('click', () => requestDeleteList(S.tab));
  $('confirmCancel').addEventListener('click', () => { pendingDelete = null; closeDialog(confirmDlg()); });
  $('confirmOk').addEventListener('click', () => { const id = pendingDelete; pendingDelete = null; closeDialog(confirmDlg()).then(() => { if (id) deleteList(id); }); });
  confirmDlg().addEventListener('click', (e) => { if (e.target === confirmDlg()) { pendingDelete = null; closeDialog(confirmDlg()); } });
}
