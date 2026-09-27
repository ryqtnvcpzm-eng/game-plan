/* ACTIONS: what happens when you tap things on the pages
   (check off, priority flag, switching pages/lists/filters), plus commit(),
   which redraws with animation and saves. */

import { CONFIG } from './config.js';
import { $, qa } from './util.js';
import { S, saveUI, find, catIndex } from './state.js';
import { render, revealTab, positionInd } from './render.js';
import { save } from './store.js';
import { anim, snap, flip, collapse, burst, pop, slideIn, fadeThrough, reduce, STD, EMPH_DEC } from './motion.js';
import { showSnack } from './dialogs.js';
import { openItemSheet } from './item-sheet.js';
import { openRate } from './rating.js';
import { openListSheet } from './list-sheet.js';
import { onOpenPlan } from './planner.js';

/* Call after changing S.data: redraws (rows slide to new spots) and saves. */
export function commit() {
  const before = snap();
  render();
  flip(before);
  if (S.popId) {
    const li = visibleItem(S.popId);
    if (li) pop(li.querySelector('[data-act=pr]'));
    S.popId = null;
  }
  save(S.data);
}
/* redraw only (e.g. after the other phone changed something) */
export function redraw() { const before = snap(); render(); flip(before); }

export function visibleItem(id) {
  return qa('.item[data-id="' + id + '"]').find((li) => li.offsetHeight) || null;
}

/* ---------- rows: checkbox, flag, star chip, tap to edit */
function onRowClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const li = btn.closest('.item'); if (!li) return;
  const id = li.getAttribute('data-id'), idx = find(id); if (idx < 0) return;
  const it = S.data.items[idx], act = btn.getAttribute('data-act');

  if (act === 'toggle') {
    if (S.busy[id]) return;
    S.busy[id] = 1;
    const willDone = !it.doneAt;
    li.classList.toggle('is-done', willDone);
    btn.setAttribute('aria-checked', String(willDone));
    if (willDone) {
      anim(btn.querySelector('.box'), [{ transform: 'scale(1)' }, { transform: 'scale(.78)', offset: 0.3 }, { transform: 'scale(1.15)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 440, easing: STD });
      burst(li, btn);
    }
    setTimeout(() => {
      delete S.busy[id];
      const j = find(id); if (j < 0) return;
      if (willDone) { openRate(id, 'cross'); return; }   // crossing off asks for a rating
      S.data.items[j].doneAt = null;
      commit();
    }, reduce ? 0 : 340);

  } else if (act === 'pr') {
    if (S.busy[id]) return;
    const np = (it.pr + 1) % CONFIG.priorities.length;
    const leaving = li.parentNode.id === 'openList' && S.filter !== 'all' && np !== +S.filter;
    if (leaving) {                                          // it no longer fits the filter: slide it out
      S.busy[id] = 1;
      collapse(li, 24, () => {
        delete S.busy[id];
        const j = find(id); if (j < 0) return;
        S.data.items[j].pr = np; commit();
        showSnack('Moved “' + S.data.items[j].title + '” to ' + CONFIG.filterNames[np]);
      });
    } else { it.pr = np; S.popId = id; commit(); }

  } else if (act === 'rate') openRate(id, 'edit');
  else if (act === 'edit') openItemSheet('edit', id);
}

/* ---------- pages and list tabs */
export function goPage(p) {
  if (p === S.page) return;
  S.page = p; render(); window.scrollTo(0, 0); saveUI();
  fadeThrough($(p === 'summary' ? 'pgSummary' : p === 'lists' ? 'pgLists' : 'pgPlan'));
  if (p === 'lists') revealTab(false);
  if (p === 'plan') onOpenPlan();
}
export function openList(id) {
  S.tab = id; S.filter = 'all'; S.page = 'lists';
  render(); window.scrollTo(0, 0); saveUI(); revealTab(false);
  fadeThrough($('pgLists'));
}
function switchTab(id) {
  if (id === S.tab) return;
  const dir = catIndex(id) > catIndex(S.tab) ? 1 : -1;
  S.tab = id; render(); saveUI(); revealTab(true);
  const top = $('sticky').getBoundingClientRect().top + window.scrollY;
  if (window.scrollY > top) window.scrollTo(0, top);
  slideIn($('listArea'), dir * 32);
}

/* ---------- scrolling: shrink the New button while scrolling down.
   Kept deliberately light (one class toggle per frame) so scrolling stays smooth. */
let lastY = 0, ticking = false;
export function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY, f = $('fab');
    if (y > lastY + 8 && y > 120) { if (!f.classList.contains('shrunk')) f.classList.add('shrunk'); }
    else if (y < lastY - 8 || y < 60) { if (f.classList.contains('shrunk')) f.classList.remove('shrunk'); }
    lastY = y;
  });
}
/* the frozen list bar gets a hairline once it's pinned (watched, not polled) */
function watchSticky() {
  const st = $('sticky'); if (!st || !window.IntersectionObserver) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'height:1px;margin-bottom:-1px;pointer-events:none';
  st.parentNode.insertBefore(probe, st);
  new IntersectionObserver(([e]) => st.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 80), { rootMargin: '-60px 0px 0px 0px' }).observe(probe);
}

export function initActions() {
  ['openList', 'doneList', 'upNext', 'topRated', 'recentDone', 'turnList'].forEach((k) => $(k).addEventListener('click', onRowClick));
  qa('.nav button').forEach((b) => b.addEventListener('click', () => goPage(b.getAttribute('data-page'))));
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-newcat')) openListSheet('add'); else switchTab(b.getAttribute('data-cat'));
  });
  $('cats').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-newcat')) openListSheet('add'); else openList(b.getAttribute('data-cat'));
  });
  $('filters').addEventListener('click', (e) => {
    const ch = e.target.closest('.fchip'); if (!ch) return;
    let f = ch.getAttribute('data-f');
    if (f === S.filter && f !== 'all') f = 'all';
    if (f === S.filter) return;
    S.filter = f; render(); saveUI();
    anim($('openList'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: EMPH_DEC });
  });
  $('sumSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const s = b.getAttribute('data-s'); if (s === S.sumTab) return;
    const order = ['up', 'rated', 'recent'], dir = order.indexOf(s) > order.indexOf(S.sumTab) ? 1 : -1;
    S.sumTab = s; render(); saveUI();
    slideIn($('hlArea'), dir * 28);
  });
  $('fab').addEventListener('click', () => openItemSheet('add'));
  qa('[data-add]').forEach((b) => b.addEventListener('click', () => openItemSheet('add')));
  $('doneBox').open = S.doneOpen;
  $('doneBox').addEventListener('toggle', () => { S.doneOpen = $('doneBox').open; saveUI(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  watchSticky();
  window.addEventListener('resize', () => { if (S.page === 'lists') positionInd(); });
}
