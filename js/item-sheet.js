/* ITEM SHEET: add or edit something (title, details, list, priority),
   plus Find a time and Delete. */

import { $, qa, esc, clean, uid, fmt, todayISO } from './util.js';
import { S, cat, item, find, PRIORITY, isSmart, filterFor, setFilter } from './state.js';
import { collapse } from './motion.js';
import { openDialog, closeDialog, onDismiss, toast } from './dialogs.js';
import { commit } from './actions.js';
import { findTimeFor } from './planner.js';

let sh = null;   // { mode, id, list, pr }
const dlg = () => $('itemSheet');

function setPr(pr) { sh.pr = pr; qa('#fPriority button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.pr === pr))); }
function setList(id) { sh.list = id; qa('#fList .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.l === id))); }
function syncSave() { $('itemSave').disabled = !clean($('fTitle').value); }

export function openItemSheet(mode, id, listId) {
  const it = id ? item(id) : null;
  if (mode === 'edit' && !it) return;
  const list = it ? it.list : (listId && cat(listId) ? listId : S.data.cats[0].id);
  sh = { mode, id: id || null, list, pr: 0 };
  $('itemTitle').textContent = mode === 'add' ? 'New item' : 'Details';
  $('itemSave').textContent = mode === 'add' ? 'Add' : 'Done';
  $('fList').innerHTML = S.data.cats.map((c) => '<button type="button" class="chip" role="radio" data-l="' + esc(c.id) + '"><span class="ms" aria-hidden="true">' + esc(c.icon) + '</span>' + esc(c.name) + '</button>').join('');
  setList(list);
  $('fTitle').value = it ? it.title : '';
  $('fNote').value = it ? it.note : '';
  setPr(it ? it.pr : (S.route.name === 'list' && filterFor(S.route.id) !== 'all' ? +filterFor(S.route.id) : 0));
  $('itemMeta').textContent = it ? 'Added ' + fmt(it.addedAt, true) + (it.doneAt ? ' · Crossed off ' + fmt(it.doneAt, true) : '') : '';
  $('itemMeta').hidden = !it;
  $('itemActions').hidden = !it;
  $('itemFindTime').hidden = !it || !!it.doneAt;
  syncSave();
  openDialog(dlg(), $('fTitle'));
  if (mode === 'add' && window.innerWidth < 700) setTimeout(() => $('fTitle').focus(), 350);
}
function close() { sh = null; return closeDialog(dlg()); }

function submit(e) {
  e.preventDefault();
  if (!sh) return;
  const title = clean($('fTitle').value), note = clean($('fNote').value), s = sh;
  if (!title) { $('fTitle').focus(); return; }
  if (s.mode === 'add') {
    S.data.seq = (S.data.seq || S.data.items.length) + 1;
    const it = { id: uid(), list: s.list, title, note, pr: s.pr, addedAt: todayISO(), doneAt: null, seq: S.data.seq, rating: [0, 0] };
    S.data.items.push(it);
    S.flashId = it.id;
    /* make sure the new item is visible where you are */
    if (S.route.name === 'list') { const f = filterFor(S.route.id); if (f !== 'all' && +f !== it.pr) setFilter(S.route.id, 'all'); }
    close(); commit();
    const here = S.route.name === 'list' && (S.route.id === s.list || isSmart(S.route.id));
    toast(here ? 'Added' : 'Added to ' + cat(s.list).name);
  } else {
    const x = item(s.id); close();
    if (!x) return;
    if (x.title === title && x.note === note && x.pr === s.pr && x.list === s.list) return;
    const moved = x.list !== s.list;
    Object.assign(x, { title, note, pr: s.pr, list: s.list }); commit();
    if (moved) toast('Moved to ' + cat(s.list).name);
  }
}

function remove() {
  if (!sh) return;
  const id = sh.id;
  close().then(() => {
    const li = [].find.call(document.querySelectorAll('.row[data-id]'), (el) => el.dataset.id === id && el.offsetHeight);
    collapse(li, () => {
      const j = find(id); if (j < 0) return;
      const it = S.data.items[j];
      S.data.items.splice(j, 1);
      commit();
      toast('Deleted', () => { S.data.items.splice(Math.min(j, S.data.items.length), 0, it); });
    });
  });
}

export function initItemSheet() {
  $('fPriority').innerHTML = PRIORITY.map((p, i) => '<button type="button" role="radio" data-pr="' + i + '">' + esc(p) + '</button>').join('');
  $('fPriority').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && sh) setPr(+b.dataset.pr); });
  $('fList').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b && sh) setList(b.dataset.l); });
  $('fTitle').addEventListener('input', syncSave);
  $('fTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('fNote').focus(); } });
  $('fNote').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('itemForm').requestSubmit(); } });
  $('itemForm').addEventListener('submit', submit);
  $('itemDelete').addEventListener('click', remove);
  $('itemFindTime').addEventListener('click', () => { if (!sh) return; const id = sh.id; close(); findTimeFor(id); });
  onDismiss(dlg(), close);
}
