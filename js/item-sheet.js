/* ITEM SHEET: the bottom sheet for adding or editing something
   (title, details, which list, priority, delete). */

import { CONFIG } from './config.js';
import { $, qa, esc, clean, uid, fmt, todayISO } from './util.js';
import { S, cat, find } from './state.js';
import { collapse } from './motion.js';
import { closeDialog, showSnack } from './dialogs.js';
import { commit, visibleItem } from './actions.js';
import { findTimeFor } from './planner.js';

let sheet = null;   // { mode: 'add'|'edit', id, list, pr }
const dlg = () => $('sheet');

function setSegment(pr) { sheet.pr = pr; qa('#seg button').forEach((b) => b.setAttribute('aria-checked', String(+b.getAttribute('data-pr') === pr))); }
function setListPick(id) { sheet.list = id; qa('#fList button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === id))); }
function syncSave() { $('saveBtn').disabled = !clean($('fTitle').value); }

export function openItemSheet(m, id) {
  const it = id ? S.data.items[find(id)] : null;
  if (m === 'edit' && !it) return;
  sheet = { mode: m, id: id || null, list: it ? it.list : S.tab, pr: 0 };
  $('sheetTitle').textContent = m === 'add' ? 'Add something' : 'Edit';
  $('fList').innerHTML = S.data.cats.map((c) => '<button type="button" class="fchip rp" role="radio" data-l="' + esc(c.id) + '"><span class="ms ck" aria-hidden="true">check</span><span class="ms li" aria-hidden="true">' + esc(c.icon) + '</span>' + esc(c.name) + '</button>').join('');
  setListPick(sheet.list);
  $('fTitle').value = it ? it.title : '';
  $('fNote').value = it ? it.note : '';
  setSegment(it ? it.pr : 0);
  $('saveBtn').textContent = m === 'add' ? 'Add' : 'Save';
  $('delBtn').hidden = m !== 'edit';
  $('sheetMeta').textContent = it ? 'Added ' + fmt(it.addedAt, true) + (it.doneAt ? '. Crossed off ' + fmt(it.doneAt, true) + '.' : '.') : '';
  $('sheetMeta').hidden = !it;
  $('findTime').hidden = !it || !!it.doneAt;
  syncSave();
  if (!dlg().open) dlg().showModal();
  if (m === 'add') $('fTitle').focus();
}
function close() { sheet = null; return closeDialog(dlg()); }

function submit(e) {
  e.preventDefault();
  if (!sheet) return;
  const title = clean($('fTitle').value), note = clean($('fNote').value), s = sheet;
  if (!title) { $('fTitle').focus(); return; }
  if (s.mode === 'add') {
    S.data.seq = (S.data.seq || S.data.items.length) + 1;
    const it = { id: uid(), list: s.list, title, note, pr: s.pr, addedAt: todayISO(), doneAt: null, seq: S.data.seq, rating: [0, 0] };
    S.data.items.push(it); S.newId = it.id;
    if (S.page === 'lists') { S.tab = s.list; if (S.filter !== 'all' && +S.filter !== it.pr) S.filter = 'all'; }
    close(); commit();
    showSnack('Added “' + title + '” to ' + cat(s.list).name);
  } else {
    const idx = find(s.id); close();
    if (idx < 0) return;
    const x = S.data.items[idx];
    if (x.title === title && x.note === note && x.pr === s.pr && x.list === s.list) return;
    const moved = x.list !== s.list;
    Object.assign(x, { title, note, pr: s.pr, list: s.list }); commit();
    if (moved) showSnack('Moved “' + title + '” to ' + cat(s.list).name);
  }
}

function remove() {
  if (!sheet) return;
  const id = sheet.id;
  close().then(() => {
    if (find(id) < 0) return;
    collapse(visibleItem(id), 0, () => {
      const j = find(id); if (j < 0) return;
      const it = S.data.items[j];
      S.data.items.splice(j, 1);
      commit();
      showSnack('Deleted “' + it.title + '”', () => { S.data.items.splice(Math.min(j, S.data.items.length), 0, it); });
    });
  });
}

export function initItemSheet() {
  $('seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && sheet) setSegment(+b.getAttribute('data-pr')); });
  $('fList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && sheet) setListPick(b.getAttribute('data-l')); });
  $('fTitle').addEventListener('input', syncSave);
  $('fTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('fNote').focus(); } });
  $('cancelBtn').addEventListener('click', close);
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) close(); });
  dlg().addEventListener('close', () => { sheet = null; });
  $('sheetForm').addEventListener('submit', submit);
  $('delBtn').addEventListener('click', remove);
  $('findTime').addEventListener('click', () => { if (!sheet) return; const id = sheet.id; close(); findTimeFor(id); });
  /* priority labels come from config.js */
  qa('#seg button').forEach((b) => { const i = +b.getAttribute('data-pr'); b.lastChild.textContent = CONFIG.priorities[i]; });
}
