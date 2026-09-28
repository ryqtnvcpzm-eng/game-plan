/* ONE LIST: photo banner with the name, a priority filter that stays frozen
   at the top on phones (and sits in the sidebar on desktop), the items,
   and what's been crossed off. Also the smart lists All and Flagged. */

import { $, esc, plural } from './util.js';
import { S, cat, isSmart, SMART, sortOpen, sortDone, filterFor, setFilter, FILTER_NAME, saveUI } from './state.js';
import { rowHTML, emptyRow, put } from './rows.js';
import { setPhoto, photoForIcon } from './images.js';
import { go } from './router.js';
import { anim, EASE } from './motion.js';

const LEVELS = ['all', '3', '2', '1', '0'];

function itemsOf(id) {
  if (isSmart(id)) return S.data.items.filter(SMART[id].test);
  return S.data.items.filter((i) => i.list === id);
}

function filterChips(open, f, cls) {
  return LEVELS.map((k) => {
    const n = k === 'all' ? open.length : open.filter((i) => i.pr === +k).length;
    const name = k === 'all' ? 'All' : FILTER_NAME[k];
    return '<button type="button" class="' + cls + (n ? '' : ' zero') + (cls === 'side-item' && f === k ? ' on' : '') + '" data-f="' + k + '" aria-pressed="' + (f === k) + '">'
      + (k === 'all' ? (cls === 'side-item' ? '<span class="dot pall"></span>' : '') : '<span class="dot p' + k + '"></span>') + name + '<span class="n">' + n + '</span></button>';
  }).join('');
}

export function renderList() {
  const id = S.route.id, smart = isSmart(id), c = smart ? SMART[id] : cat(id);
  if (!c) { go('#/lists', true); return; }
  const mine = itemsOf(id);
  const open = mine.filter((i) => !i.doneAt).sort(sortOpen);
  const done = mine.filter((i) => i.doneAt).sort(sortDone);
  const f = filterFor(id);
  const shown = f === 'all' ? open : open.filter((i) => i.pr === +f);

  /* banner */
  setPhoto($('listBannerImg'), smart ? (id === '_flagged' ? 'plan' : 'home') : photoForIcon(c.icon), 1600);
  $('listTitle').textContent = c.name;
  $('listSub').textContent = !open.length ? (done.length ? 'All crossed off' : 'Nothing here yet')
    : f === 'all' ? plural(open.length, 'thing') + ' to do' : shown.length + ' of ' + open.length + ' marked ' + FILTER_NAME[f];
  $('listEdit').hidden = $('listDelete').hidden = smart;

  /* filters: frozen bar (phones) and sidebar (desktop) */
  put($('subFilters'), filterChips(open, f, 'chip'));
  put($('sideFilters'), filterChips(open, f, 'side-item'));

  /* sidebar lists */
  const openAll = S.data.items.filter((i) => !i.doneAt);
  put($('sideSmart'), Object.keys(SMART).map((k) => {
    const n = openAll.filter(SMART[k].test).length;
    return '<a class="side-item' + (k === id ? ' on' : '') + '" href="#/list/' + k + '"><span class="si-ic" style="background:' + SMART[k].color + '"><span class="ms fill" aria-hidden="true">' + SMART[k].icon + '</span></span>' + SMART[k].name + '<span class="n">' + n + '</span></a>';
  }).join(''));
  put($('sideLists'), S.data.cats.map((k) => {
    const n = openAll.filter((i) => i.list === k.id).length;
    return '<a class="side-item' + (k.id === id ? ' on' : '') + '" href="#/list/' + encodeURIComponent(k.id) + '"><span class="si-ic"><span class="ms" aria-hidden="true">' + esc(k.icon) + '</span></span>' + esc(k.name) + '<span class="n">' + n + '</span></a>';
  }).join('') + '<button type="button" class="side-item add" data-newlist><span class="si-ic"><span class="ms" aria-hidden="true">add</span></span>New list</button>');

  /* rows */
  let empty;
  if (!open.length) empty = done.length ? emptyRow('celebration', 'Everything here is crossed off. Add what’s next.') : emptyRow(c.icon, smart ? 'Nothing here right now.' : 'Nothing here yet. Tap + to add the first one.');
  else if (!shown.length) empty = emptyRow('flag', f === '0' ? 'Everything here has a priority.' : 'Nothing marked ' + FILTER_NAME[f] + ' yet. Tap a flag to set one.');
  put($('listRows'), shown.length ? shown.map((i) => rowHTML(i, { showList: smart })).join('') : empty);

  const showDone = done.length && id !== '_flagged';
  $('doneBox').hidden = !showDone;
  $('doneBox').open = S.doneOpen;
  $('doneCount').textContent = done.length;
  put($('doneRows'), showDone ? done.map((i) => rowHTML(i, { showList: smart })).join('') : '');
}

export function initList() {
  const onFilter = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const id = S.route.id; let f = b.dataset.f;
    if (f === filterFor(id) && f !== 'all') f = 'all';
    setFilter(id, f);
    renderList();
    anim($('listRows'), [{ opacity: 0.4 }, { opacity: 1 }], { duration: 220, easing: EASE });
  };
  $('subFilters').addEventListener('click', onFilter);
  $('sideFilters').addEventListener('click', onFilter);
  $('doneBox').addEventListener('toggle', () => { S.doneOpen = $('doneBox').open; saveUI(); });
}
