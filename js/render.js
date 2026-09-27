/* RENDER: turns the data into what's on screen.
   renderSummary() = Summary page, renderLists() = Lists page, itemHTML() = one row. */

import { CONFIG } from './config.js';
import { $, qa, esc, plural, initial, todayISO, daysBetween, fmt, weekday } from './util.js';
import { S, cat, avgOf, fmtAvg, isMyTurn, waiting, otherOf, sortOpen, sortDone } from './state.js';
import { setNum, reduce } from './motion.js';

const RING_C = 263.9;
const PR = CONFIG.priorities, FNAME = CONFIG.filterNames;

/* ---------- one row */
function meta(it, today) {
  if (it.doneAt) {
    const took = daysBetween(it.addedAt, it.doneAt);
    return 'Crossed off ' + fmt(it.doneAt) + (took <= 0 ? ', same day we added it' : ', after ' + plural(took, 'day'));
  }
  const d = daysBetween(it.addedAt, today);
  if (d <= 0) return 'Added today';
  if (d === 1) return 'Added yesterday';
  return 'Added ' + fmt(it.addedAt) + ', waiting ' + plural(d, 'day');
}
function ratingWords(it) {
  const r = it.rating || [], out = [];
  S.data.people.forEach((n, i) => { if (r[i]) out.push(esc(n) + ' ' + r[i]); });
  return out.join(' and ');
}

/* opts: { withCat, rated, metaOverride } */
export function itemHTML(it, today, opts) {
  opts = opts || {};
  const done = !!it.doneAt, t = esc(it.title);
  let m = esc(meta(it, today)), trail = '';
  const c = cat(it.list);
  if (opts.withCat && c) m = esc(c.name) + ', ' + m.charAt(0).toLowerCase() + m.slice(1);
  if (opts.rated) m = (c ? esc(c.name) + ', ' : '') + ratingWords(it);
  if (opts.metaOverride) m = opts.metaOverride;
  if (!done) {
    trail = it.pr
      ? '<button type="button" class="chip p-' + it.pr + ' rp" data-act="pr" aria-label="Priority: ' + PR[it.pr] + '. Tap to change"><span class="ms fill" aria-hidden="true">flag</span>' + PR[it.pr] + '</button>'
      : '<button type="button" class="prio-icon rp" data-act="pr" aria-label="Set priority"><span class="ms" aria-hidden="true">flag</span></button>';
  } else if (isMyTurn(it)) {
    trail = '<button type="button" class="rchip turn rp" data-act="rate" aria-label="Your turn to rate"><span class="ms fill" aria-hidden="true">star</span>Your turn</button>';
  } else {
    const av = avgOf(it);
    trail = av
      ? '<button type="button" class="rchip rp" data-act="rate" aria-label="Rated ' + fmtAvg(av) + ' out of ' + CONFIG.maxStars + '. Tap to change"><span class="ms fill" aria-hidden="true">star</span>' + fmtAvg(av) + '</button>'
      : '<button type="button" class="rchip none rp" data-act="rate" aria-label="Rate this"><span class="ms" aria-hidden="true">star</span>Rate</button>';
  }
  return '<li class="item' + (done ? ' is-done' : '') + (it.id === S.newId ? ' is-new' : '') + '" data-id="' + esc(it.id) + '">'
    + '<button type="button" class="cb rp" role="checkbox" aria-checked="' + done + '" data-act="toggle" aria-label="Cross off ' + t + '"><span class="box"><span class="ms" aria-hidden="true">check</span></span></button>'
    + '<button type="button" class="content rp" data-act="edit" aria-label="Edit ' + t + '"><span class="headline"><span class="t">' + t + '</span></span>'
    + (it.note ? '<span class="support">' + esc(it.note) + '</span>' : '')
    + '<span class="meta">' + m + '</span></button>'
    + trail + '</li>';
}
const emptyHTML = (icon, msg) => '<li class="empty"><span class="ms" aria-hidden="true">' + icon + '</span>' + msg + '</li>';

/* ---------- status chip (top right of Summary) */
export function setStatus() {
  let icon = '', text = '';
  if (S.mode === 'local') { icon = 'smartphone'; text = 'On this phone'; }
  else if (S.error) { icon = 'error'; text = 'Not saved'; }
  else if (S.offline) { icon = 'cloud_off'; text = 'Offline'; }
  else if (S.pending) { icon = 'sync'; text = 'Saving'; }
  else if (S.mode === 'cloud') { icon = 'cloud_done'; text = 'Synced'; }
  $('status').innerHTML = text ? '<span class="ms" aria-hidden="true">' + icon + '</span>' + text : '';
}

/* ---------- Summary page */
function renderSummary(today) {
  const items = S.data.items, open = items.filter((i) => !i.doneAt), done = items.length - open.length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;
  setNum($('dayNum'), Math.max(1, daysBetween(S.data.startedAt, today) + 1));
  $('since').textContent = 'Since ' + weekday(S.data.startedAt) + ', ' + fmt(S.data.startedAt, true);
  $('ringVal').style.strokeDashoffset = (RING_C * (1 - pct / 100)).toFixed(1);
  $('ringPct').textContent = pct + '%';
  $('ring').setAttribute('aria-label', pct + ' percent crossed off');
  setNum($('toGo'), open.length); setNum($('doneAll'), done);
  const ratedAll = items.filter((i) => i.doneAt && avgOf(i));
  setNum($('avgR'), ratedAll.length ? fmtAvg(ratedAll.reduce((a, i) => a + avgOf(i), 0) / ratedAll.length) : '–');
  $('localBanner').hidden = S.mode !== 'local';

  /* whose turn to rate */
  const wait = waiting().sort(sortDone), tc = $('turnCard');
  tc.hidden = !wait.length;
  if (wait.length) {
    if (S.me !== null) {
      $('turnTitle').textContent = 'Your turn to rate, ' + S.data.people[S.me];
      $('turnSub').textContent = S.data.people[otherOf(S.me)] + ' already rated ' + (wait.length === 1 ? 'this one' : 'these ' + wait.length) + '. Add your stars to finish the average.';
    } else {
      $('turnTitle').textContent = 'Waiting for a second rating';
      $('turnSub').innerHTML = 'One of you has rated ' + (wait.length === 1 ? 'this' : 'these') + ', the other hasn’t yet. <button type="button" class="who-link" id="setMe">Tell us who’s on this phone</button> to see only your turn.';
    }
    $('turnList').innerHTML = wait.slice(0, 5).map((i) => {
      const c = cat(i.list), r = i.rating || [], by = r[0] ? 0 : 1;
      return itemHTML(i, today, { metaOverride: (c ? esc(c.name) + ', ' : '') + esc(S.data.people[by]) + ' gave it ' + r[by] });
    }).join('') + (wait.length > 5 ? emptyHTML('more_horiz', (wait.length - 5) + ' more in your lists') : '');
  }
  const nb = $('navBadge'); nb.hidden = !wait.length; nb.textContent = wait.length;
  const av = $('meAv');
  if (S.me !== null) { av.className = 'av'; av.textContent = initial(S.data.people[S.me]); $('meBtn').setAttribute('aria-label', 'On this phone: ' + S.data.people[S.me] + '. Tap to change'); }
  else { av.className = 'av none'; av.innerHTML = '<span class="ms" aria-hidden="true" style="font-size:18px">person</span>'; $('meBtn').setAttribute('aria-label', 'Who is on this phone'); }
  $('shareBtn').hidden = S.mode !== 'cloud';

  /* list cards */
  $('catCount').textContent = plural(S.data.cats.length, 'list');
  $('cats').innerHTML = S.data.cats.map((c) => {
    const mine = items.filter((i) => i.list === c.id), o = mine.filter((i) => !i.doneAt).length, d = mine.length - o;
    const p = mine.length ? Math.round(d / mine.length * 100) : 0;
    return '<button type="button" class="cat rp" data-cat="' + esc(c.id) + '"><span class="ic"><span class="ms" aria-hidden="true">' + esc(c.icon) + '</span></span>'
      + '<span class="nm">' + esc(c.name) + '</span><span class="ct">' + (mine.length ? o + ' to go, ' + d + ' done' : 'Empty so far') + '</span>'
      + '<span class="pb"><span style="width:' + p + '%"></span></span></button>';
  }).join('') + '<button type="button" class="cat new rp" data-newcat="1"><span class="ic"><span class="ms" aria-hidden="true">add</span></span><span class="nm">New list</span><span class="ct">Games, trips, anything</span></button>';

  /* priorities bar */
  const counts = [0, 0, 0, 0]; open.forEach((i) => { counts[i.pr]++; });
  const segs = qa('#pbar span'), lg = qa('#legend b');
  [3, 2, 1, 0].forEach((lv, k) => { segs[k].style.flexGrow = counts[lv]; segs[k].hidden = !counts[lv]; lg[k].textContent = counts[lv]; });
  $('pbar').hidden = !open.length;
  const flagged = counts[1] + counts[2] + counts[3];
  $('prCount').textContent = open.length ? flagged + ' of ' + open.length + ' flagged' : '';

  /* highlights tabs */
  const up = open.filter((i) => i.pr > 0).sort(sortOpen).slice(0, CONFIG.upNextCount);
  $('upNext').innerHTML = up.length ? up.map((i) => itemHTML(i, today, { withCat: true })).join('')
    : emptyHTML('flag', 'Flag anything as Soon, Next up or Top and it shows up here.');
  const top = ratedAll.slice().sort((a, b) => avgOf(b) - avgOf(a) || sortDone(a, b)).slice(0, CONFIG.topRatedCount);
  $('topRated').innerHTML = top.length ? top.map((i) => itemHTML(i, today, { rated: true })).join('')
    : emptyHTML('star', 'Cross something off and rate it. The best ones end up here.');
  const recent = items.filter((i) => i.doneAt).sort(sortDone).slice(0, CONFIG.recentCount);
  $('recentDone').innerHTML = recent.length ? recent.map((i) => itemHTML(i, today, { withCat: true })).join('')
    : emptyHTML('celebration', 'Nothing crossed off yet. The first one lands here.');
  qa('#sumSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-s') === S.sumTab)));
  $('upNext').hidden = S.sumTab !== 'up'; $('topRated').hidden = S.sumTab !== 'rated'; $('recentDone').hidden = S.sumTab !== 'recent';
  $('hlCount').textContent = S.sumTab === 'up' ? (flagged > CONFIG.upNextCount ? 'Top ' + CONFIG.upNextCount + ' of ' + flagged : '')
    : S.sumTab === 'rated' ? (ratedAll.length ? ratedAll.length + ' rated' : '') : '';
}

/* ---------- Lists page */
function renderLists(today) {
  const items = S.data.items, c = cat(S.tab);
  $('tabs').innerHTML = S.data.cats.map((k) => {
    const n = items.filter((i) => i.list === k.id && !i.doneAt).length;
    return '<button type="button" class="tab rp" role="tab" data-cat="' + esc(k.id) + '" aria-selected="' + (k.id === S.tab) + '"><span class="ms" aria-hidden="true">' + esc(k.icon) + '</span>' + esc(k.name) + '<span class="n">' + n + '</span></button>';
  }).join('') + '<button type="button" class="tab add rp" data-newcat="1"><span class="ms" aria-hidden="true">add</span>New list</button>';
  const mine = items.filter((i) => i.list === S.tab);
  const o = mine.filter((i) => !i.doneAt).sort(sortOpen), d = mine.filter((i) => i.doneAt).sort(sortDone);
  const fo = S.filter === 'all' ? o : o.filter((i) => i.pr === +S.filter);
  qa('#filters .fchip').forEach((ch) => {
    const f = ch.getAttribute('data-f'), n = f === 'all' ? o.length : o.filter((i) => i.pr === +f).length;
    ch.setAttribute('aria-pressed', String(f === S.filter));
    ch.classList.toggle('zero', !n);
    ch.querySelector('.fc').textContent = n;
  });
  $('listTitle').textContent = c.name;
  $('delCat').hidden = S.data.cats.length < 2;
  $('listCount').textContent = !o.length ? (d.length ? 'All crossed off' : 'Nothing here yet')
    : S.filter === 'all' ? o.length + ' to go' : fo.length + ' of ' + o.length + ' marked ' + FNAME[S.filter];
  let msg, icon;
  if (!o.length) { icon = d.length ? 'celebration' : c.icon; msg = d.length ? 'Everything here is crossed off. Add what’s next.' : 'Nothing here yet. Tap Add to start this list.'; }
  else if (!fo.length) { icon = 'flag'; msg = S.filter === '0' ? 'Everything here has a priority.' : 'Nothing marked ' + FNAME[S.filter] + ' yet. Tap a flag to set one.'; }
  $('openList').innerHTML = fo.length ? fo.map((i) => itemHTML(i, today)).join('') : emptyHTML(icon, msg);
  $('doneList').innerHTML = d.map((i) => itemHTML(i, today)).join('');
  setNum($('doneN'), d.length);
  $('doneBox').hidden = !d.length;
}

/* the sliding underline under the active list tab */
export function positionInd() {
  const a = document.querySelector('#tabs .tab[aria-selected="true"]'), ind = $('tabInd');
  if (!a || !a.offsetWidth) return;
  const fresh = !parseFloat(ind.style.width);
  if (fresh) ind.style.transition = 'none';
  ind.style.width = Math.max(24, a.offsetWidth - 24) + 'px';
  ind.style.transform = 'translateX(' + (a.offsetLeft + 12) + 'px)';
  if (fresh) { ind.getBoundingClientRect(); ind.style.transition = ''; }
}
export function revealTab(smooth) {
  const a = document.querySelector('#tabs .tab[aria-selected="true"]'), sc = $('tabsScroll');
  if (!a) return;
  const l = a.offsetLeft, r = l + a.offsetWidth, vl = sc.scrollLeft, vr = vl + sc.clientWidth;
  if (l < vl + 16 || r > vr - 16) {
    const to = Math.max(0, l - (sc.clientWidth - a.offsetWidth) / 2);
    if (sc.scrollTo) sc.scrollTo({ left: to, behavior: smooth && !reduce ? 'smooth' : 'auto' }); else sc.scrollLeft = to;
  }
}

/* ---------- everything */
export function render() {
  const today = todayISO();
  if (!cat(S.tab)) S.tab = S.data.cats[0].id;
  qa('.nav button').forEach((b) => { if (b.getAttribute('data-page') === S.page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('pgSummary').hidden = S.page !== 'summary'; $('pgLists').hidden = S.page !== 'lists';
  renderSummary(today); renderLists(today);
  S.newId = null;
  if (S.page === 'lists') positionInd();
  setStatus();
}
