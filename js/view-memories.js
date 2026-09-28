/* MEMORIES: everything you've crossed off, with ratings.
   Tabs: Your turn (only when something is waiting for you), Top rated, Everything. */

import { $, qa, plural } from './util.js';
import { S, doneItems, avgOf, fmtAvg, waiting, sortDone, saveUI } from './state.js';
import { rowHTML, emptyRow, put } from './rows.js';
import { setPhoto } from './images.js';
import { anim, EASE } from './motion.js';

export function renderMemories() {
  setPhoto($('memHeroImg'), 'memories', 1600);
  const done = doneItems(), rated = done.filter((i) => avgOf(i)), wait = waiting();
  const avg = rated.length ? fmtAvg(rated.reduce((a, i) => a + avgOf(i), 0) / rated.length) : null;
  $('memSub').textContent = done.length ? plural(done.length, 'thing') + ' crossed off' + (avg ? ', averaging ' + avg + ' stars' : '') : 'What you’ve done together will live here.';

  if (S.memTab === 'turn' && !wait.length) S.memTab = 'top';
  qa('#memTabs button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.m === S.memTab));
    if (b.dataset.m === 'turn') { b.hidden = !wait.length; b.textContent = 'Your turn (' + wait.length + ')'; }
  });

  let list, empty;
  if (S.memTab === 'turn') { list = wait.slice().sort(sortDone); empty = emptyRow('check_circle', 'You’re all caught up.'); }
  else if (S.memTab === 'top') { list = rated.slice().sort((a, b) => avgOf(b) - avgOf(a) || sortDone(a, b)); empty = emptyRow('star', 'Cross something off and rate it. The best ones rise to the top.'); }
  else { list = done.slice().sort(sortDone); empty = emptyRow('auto_awesome', 'Nothing crossed off yet.'); }
  put($('memRows'), list.length ? list.map((i) => rowHTML(i, { rated: S.memTab !== 'all' && avgOf(i) > 0, showList: true })).join('') : empty);
}

export function initMemories() {
  $('memTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === S.memTab) return;
    S.memTab = b.dataset.m; saveUI();
    renderMemories();
    anim($('memRows'), [{ opacity: 0.3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
  });
}
