/* LISTS: smart lists (All, Flagged, Crossed off) and a photo card per list. */

import { $, esc } from './util.js';
import { S, openItems, doneItems } from './state.js';
import { imgTag, photoForIcon } from './images.js';
import { put } from './rows.js';

export function listCardHTML(c) {
  const mine = S.data.items.filter((i) => i.list === c.id), o = mine.filter((i) => !i.doneAt).length, d = mine.length - o;
  const pct = mine.length ? Math.round(d / mine.length * 100) : 0;
  return '<a class="lcard" href="#/list/' + encodeURIComponent(c.id) + '">' + imgTag(photoForIcon(c.icon), 700) + '<span class="shade"></span>'
    + '<span class="lc-ic"><span class="ms" aria-hidden="true">' + esc(c.icon) + '</span></span>'
    + '<span class="lc-name">' + esc(c.name) + '</span>'
    + '<span class="lc-count">' + (mine.length ? o + ' to do' + (d ? ', ' + d + ' done' : '') : 'Empty so far') + '</span>'
    + '<span class="lc-bar"><i style="width:' + pct + '%"></i></span></a>';
}
export function newListCardHTML() {
  return '<button type="button" class="lcard new" data-newlist><span class="ms" aria-hidden="true">add_circle</span><span class="lc-name">New list</span></button>';
}

export function renderLists() {
  const open = openItems(), flagged = open.filter((i) => i.pr > 0).length, done = doneItems().length;
  const smart = [
    { href: '#/list/_all', icon: 'inbox', bg: 'var(--text-2)', n: open.length, name: 'All' },
    { href: '#/list/_flagged', icon: 'flag', bg: 'var(--orange)', n: flagged, name: 'Flagged' },
    { href: '#/memories', icon: 'check', bg: 'var(--green)', n: done, name: 'Crossed off' },
  ];
  put($('smartLists'), smart.map((s) => '<a class="scard" href="' + s.href + '"><span class="sc-top"><span class="sc-ic" style="background:' + s.bg + '"><span class="ms fill" aria-hidden="true">' + s.icon + '</span></span><span class="sc-n">' + s.n + '</span></span><span class="sc-name">' + s.name + '</span></a>').join(''));
  put($('allLists'), S.data.cats.map(listCardHTML).join('') + newListCardHTML());
}
