/* LISTS SHEET: create a list, rename it, change its icon, or delete it.
   Deleting an empty list happens straight away; one with items asks first. */

import { CONFIG } from './config.js';
import { $, qa, esc, clean, uid, plural } from './util.js';
import { S, cat, catIndex, avgOf, sortOpen, sortDone } from './state.js';
import { openDialog, closeDialog, onDismiss, toast, confirmBox } from './dialogs.js';
import { commit } from './actions.js';
import { go } from './router.js';
import { setPhoto, photoForIcon } from './images.js';

const ICONS = CONFIG.listIcons || ['explore', 'movie', 'restaurant', 'local_cafe', 'park', 'sports_esports', 'music_note', 'flight', 'museum', 'favorite', 'celebration', 'home'];
let ed = null;   // { mode, id, icon }
const dlg = () => $('listSheet');

function setIcon(ic) {
  ed.icon = ic;
  qa('#lIcons button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.i === ic)));
  $('listPreviewIcon').textContent = ic;
  setPhoto($('listPreviewImg'), photoForIcon(ic), 900);
}
function syncSave() { $('listSave').disabled = !clean($('lName').value); }

export function openListSheet(mode, id) {
  const c = id ? cat(id) : null;
  if (mode === 'edit' && !c) return;
  ed = { mode, id: id || null, icon: c ? c.icon : ICONS[(S.data.cats.length + 2) % ICONS.length] };
  $('listSheetTitle').textContent = mode === 'add' ? 'New list' : 'Edit list';
  $('listSave').textContent = mode === 'add' ? 'Create' : 'Done';
  $('lName').value = c ? c.name : '';
  $('lIcons').innerHTML = ICONS.map((ic) => '<button type="button" role="radio" data-i="' + ic + '" aria-label="' + ic.replace(/_/g, ' ') + '"><span class="ms" aria-hidden="true">' + ic + '</span></button>').join('');
  setIcon(ed.icon);
  $('listDangerZone').hidden = mode !== 'edit';
  syncSave();
  openDialog(dlg(), $('lName'));
}
function close() { ed = null; return closeDialog(dlg()); }

function submit(e) {
  e.preventDefault();
  if (!ed) return;
  const name = clean($('lName').value), cur = ed;
  if (!name) return;
  close();
  if (cur.mode === 'add') {
    const c = { id: 'c' + uid(), name, icon: cur.icon };
    S.data.cats.push(c);
    commit();
    go('#/list/' + encodeURIComponent(c.id));
    toast('Created ' + name);
  } else {
    const k = cat(cur.id); if (!k || (k.name === name && k.icon === cur.icon)) return;
    k.name = name; k.icon = cur.icon; commit();
  }
}

/* delete: straight away if empty, otherwise show what's inside and ask */
export async function deleteList(id) {
  const c = cat(id); if (!c) return;
  if (S.data.cats.length < 2) { toast('You need at least one list.'); return; }
  const mine = S.data.items.filter((i) => i.list === id);
  if (mine.length) {
    const o = mine.filter((i) => !i.doneAt).sort(sortOpen), d = mine.filter((i) => i.doneAt).sort(sortDone);
    const parts = [];
    if (o.length) parts.push(plural(o.length, 'thing') + ' to do');
    if (d.length) parts.push(d.length + ' crossed off' + (d.some((i) => avgOf(i)) ? ' with ratings' : ''));
    const ok = await confirmBox({
      title: 'Delete “' + c.name + '”?',
      text: 'It still has ' + parts.join(' and ') + '. They’ll be deleted too.',
      items: o.concat(d).slice(0, 3).map((i) => ({ title: i.title, done: !!i.doneAt })).concat(mine.length > 3 ? [{ title: 'and ' + (mine.length - 3) + ' more' }] : []),
      ok: mine.length === 1 ? 'Delete list and item' : 'Delete list and ' + mine.length + ' items',
    });
    if (!ok) return;
  }
  const k = catIndex(id); if (k < 0) return;
  const gone = S.data.items.filter((i) => i.list === id);
  S.data.cats.splice(k, 1);
  S.data.items = S.data.items.filter((i) => i.list !== id);
  if (S.route.name === 'list' && S.route.id === id) go('#/lists', true);
  commit();
  toast('Deleted ' + c.name, () => { S.data.cats.splice(Math.min(k, S.data.cats.length), 0, c); S.data.items = S.data.items.concat(gone); });
}

export function initListSheet() {
  $('lIcons').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b && ed) setIcon(b.dataset.i); });
  $('lName').addEventListener('input', syncSave);
  $('listForm').addEventListener('submit', submit);
  $('listSheetDelete').addEventListener('click', () => { if (!ed) return; const id = ed.id; close().then(() => deleteList(id)); });
  onDismiss(dlg(), close);
}
