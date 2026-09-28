/* RENDER: the bars (top bar, tab bar, sync status, badge, avatar) and the
   current page. Only the page you're on is drawn, which keeps things quick. */

import { $, qa, esc, initial } from './util.js';
import { S, cat, waiting, isSmart, SMART } from './state.js';
import { applyPalette } from './palette.js';
import { renderHome } from './view-home.js';
import { renderLists } from './view-lists.js';
import { renderList } from './view-list.js';
import { renderPlan } from './planner.js';
import { renderMemories } from './view-memories.js';
import { renderSettings } from './view-settings.js';

const TITLES = { home: '', lists: 'Lists', plan: 'Plan', memories: 'Memories', settings: 'Settings' };

export function syncState() {
  if (S.mode === 'local') return { icon: 'smartphone', text: 'This device only', warn: false };
  if (S.error) return { icon: 'error', text: 'Not saved', warn: true };
  if (S.offline) return { icon: 'cloud_off', text: 'Offline', warn: true };
  if (S.pending) return { icon: 'sync', text: 'Saving', warn: false };
  if (S.mode === 'cloud') return { icon: 'cloud_done', text: 'Synced', warn: false };
  return { icon: '', text: '', warn: false };
}
export function renderSync() {
  const s = syncState(), el = $('sync');
  el.className = 'sync' + (s.warn ? ' warn' : '');
  el.innerHTML = s.text ? '<span class="ms" aria-hidden="true">' + s.icon + '</span><span class="sync-text">' + s.text + '</span>' : '';
  el.title = s.text;
}

export function renderChrome() {
  const r = S.route, body = document.body;
  if (S.data.palette && document.documentElement.getAttribute('data-palette') !== S.data.palette) applyPalette(S.data.palette);
  body.className = body.className.replace(/\broute-\S+/g, '').trim() + ' route-' + r.name;
  qa('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (r.name === 'list' ? 'lists' : r.name)));
  const w = waiting().length, b = $('tabBadge'); b.hidden = !w; b.textContent = w;

  const onList = r.name === 'list';
  $('backBtn').hidden = !onList;
  $('moreBtn').hidden = !onList || isSmart(r.id) || !cat(r.id);
  $('subbar').hidden = !onList;
  body.classList.toggle('has-sub', onList);
  const c = onList ? (isSmart(r.id) ? SMART[r.id] : cat(r.id)) : null;
  $('tbTitle').textContent = onList ? (c ? c.name : '') : TITLES[r.name] || '';
  $('fab').hidden = ['home', 'lists', 'list'].indexOf(r.name) < 0;

  const av = $('meAv');
  if (S.me !== null) { av.className = 'avatar'; av.textContent = initial(S.data.people[S.me]); }
  else { av.className = 'avatar none'; av.innerHTML = '<span class="ms" aria-hidden="true">person</span>'; }
  $('meBtn').setAttribute('aria-label', 'Settings' + (S.me !== null ? ', using this device as ' + S.data.people[S.me] : ''));
  renderSync();
}

export function renderView() {
  switch (S.route.name) {
    case 'lists': renderLists(); break;
    case 'list': renderList(); break;
    case 'plan': renderPlan(); break;
    case 'memories': renderMemories(); break;
    case 'settings': renderSettings(); break;
    default: renderHome();
  }
}
export function render() { if (!S.data) return; renderChrome(); renderView(); }
export { esc };
