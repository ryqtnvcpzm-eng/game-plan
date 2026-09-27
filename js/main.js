/* START-UP: decides what to show when the page opens.
   - No Firebase keys in config.js  -> runs on this phone only.
   - Keys, but no board on this phone -> welcome screen (start a board or join one).
   - Board link or saved board        -> connects and shows the app, live. */

import { CONFIG } from './config.js';
import { $, qa, store, randomKey } from './util.js';
import { S, normalize, otherOf } from './state.js';
import * as sync from './store.js';
import { render, setStatus, revealTab } from './render.js';
import { M, initRipple, entrance } from './motion.js';
import { initSnack, showSnack } from './dialogs.js';
import { initActions, commit, redraw, onScroll } from './actions.js';
import { initItemSheet } from './item-sheet.js';
import { initListSheet } from './list-sheet.js';
import { initRating } from './rating.js';
import { initPeople, greet } from './people.js';
import { initPalette } from './palette.js';

const BOARD_KEY = 'gp-board';
let shown = false, justCreated = false;

/* ---------- words from config.js */
function applyLabels() {
  document.title = CONFIG.appName;
  $('appName').textContent = CONFIG.appName;
  $('tagline').textContent = CONFIG.tagline;
  $('wTitle').textContent = CONFIG.appName;
  qa('#filters .fchip').forEach((ch) => { const f = ch.getAttribute('data-f'); if (f !== 'all') ch.childNodes[1].textContent = CONFIG.filterNames[f]; });
  const lg = qa('#legend div');
  [3, 2, 1, 0].forEach((lv, k) => { if (lg[k]) lg[k].childNodes[1].textContent = CONFIG.filterNames[lv]; });
}

/* ---------- board link: https://you.github.io/game-plan/#k=BOARDKEY */
function keyFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/k=([A-Za-z0-9_-]{16,})/) || t.match(/^([A-Za-z0-9_-]{16,})$/);
  return m ? m[1] : null;
}
function boardFromURL() {
  const k = keyFrom(location.hash);
  if (k) { store.set(BOARD_KEY, k); history.replaceState(null, '', location.pathname + location.search); }
  return store.get(BOARD_KEY);
}
export function shareLink() { return location.origin + location.pathname + '#k=' + store.get(BOARD_KEY); }

async function loadSeed() {
  try { const r = await fetch('data/seed.json', { cache: 'no-store' }); if (r.ok) return normalize(await r.json()); } catch (e) {}
  return normalize({});
}

/* ---------- screens */
function busy(on, text) { $('wChoices').hidden = on; $('wBusy').hidden = !on; if (text) $('wBusyText').textContent = text; }
function showWelcome(err) {
  $('app').hidden = true; $('welcome').hidden = false; busy(false);
  $('wErr').hidden = !err; $('wErr').textContent = err || '';
}
function showApp() {
  $('welcome').hidden = true; $('app').hidden = false;
  render(); M.painted = true;
  if (S.page === 'lists') revealTab(false);
  onScroll();
  let first = true;
  try { first = !sessionStorage.getItem('gp-seen'); sessionStorage.setItem('gp-seen', '1'); } catch (e) {}
  if (first) entrance(S.page);
  shown = true;
  if (justCreated) { justCreated = false; setTimeout(() => showSnack('Your board is ready. Tap the share icon to send the link.'), 900); }
  else greet(first);
}
function errorText(err) {
  const c = (err && err.code) || '';
  if (c.indexOf('permission') > -1) return 'Firebase refused access. Check the Firestore rules (README, step 3).';
  return 'Couldn’t reach the database. Check your connection and the keys in js/config.js.';
}

/* ---------- live connection */
function connectBoard(key) {
  showWelcome(); busy(true, 'Connecting…');
  S.mode = 'cloud';
  sync.connect(key, {
    onRemote(flat) {
      const merged = sync.mergeRemote(S.data, flat);
      if (!merged) return;
      S.data = normalize(merged);
      if (!shown) showApp(); else redraw();
    },
    onMissing() {
      store.set(BOARD_KEY, null); shown = false; S.data = null;
      showWelcome('That link doesn’t match a board. Check it and try again.');
    },
    onStatus(st) {
      if ('pending' in st) S.pending = st.pending;
      if ('fromCache' in st) S.offline = st.fromCache && !navigator.onLine;
      S.error = false;
      if (shown) setStatus();
    },
    onError(err) {
      console.error(err);
      S.error = true;
      if (shown) setStatus(); else showWelcome(errorText(err));
    },
  }).catch((err) => { console.error(err); showWelcome(errorText(err)); });
}

function initWelcome() {
  $('wStart').addEventListener('click', async () => {
    busy(true, 'Setting up your board…');
    try {
      const key = randomKey();
      await sync.createBoard(key, await loadSeed());
      store.set(BOARD_KEY, key);
      justCreated = true;
      connectBoard(key);
    } catch (err) { console.error(err); showWelcome(errorText(err)); }
  });
  $('wJoin').addEventListener('click', () => {
    const key = keyFrom($('wLink').value);
    if (!key) { showWelcome('That doesn’t look like a board link. Copy the whole link and paste it here.'); return; }
    store.set(BOARD_KEY, key);
    connectBoard(key);
  });
  $('wLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('wJoin').click(); });
}

function initShare() {
  $('shareBtn').addEventListener('click', async () => {
    const url = shareLink();
    const who = S.data.people[S.me === null ? 1 : otherOf(S.me)];
    if (navigator.share) { try { await navigator.share({ title: CONFIG.appName, text: 'Our game plan', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); showSnack('Link copied. Send it to ' + who + '.'); }
    catch (e) { window.prompt('Copy this link and send it to ' + who + ':', url); }
  });
}

/* ---------- go */
async function boot() {
  applyLabels();
  initRipple(); initPalette(); initSnack(commit);
  initActions(); initItemSheet(); initListSheet(); initRating(); initPeople();
  initWelcome(); initShare();
  window.addEventListener('online', () => { S.offline = false; if (shown) setStatus(); });
  window.addEventListener('offline', () => { S.offline = true; if (shown) setStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync.flush();
    else if (shown) render();   // dates and day counter stay current
  });

  if (!sync.isConfigured()) {
    S.mode = 'local';
    S.data = normalize(sync.loadLocal() || await loadSeed());
    showApp();
    return;
  }
  const key = boardFromURL();
  if (!key) { showWelcome(); return; }
  connectBoard(key);
}
boot();
