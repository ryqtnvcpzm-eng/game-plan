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
import { initSnack, showSnack, initSheetDrag } from './dialogs.js';
import { initActions, commit, redraw, onScroll } from './actions.js';
import { initItemSheet } from './item-sheet.js';
import { initListSheet } from './list-sheet.js';
import { initRating } from './rating.js';
import { initPeople, greet } from './people.js';
import { initPalette } from './palette.js';
import { initPlanner, onOpenPlan, resumePendingBook, resumePendingOpen } from './planner.js';
import { handleOutlookReturn, handleGoogleReturn, preloadGoogle, PROVIDERS } from './calendar.js';

const BOARD_KEY = 'gp-board';
let shown = false, justCreated = false, outlookResult = null;

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

/* ---------- board link: https://you.github.io/game-plan/?b=BOARDKEY  (old #k= links still work)
   The key stays in the address bar on purpose: when you "Add to Home Screen",
   the phone saves that address, so the home-screen app opens the right board
   even though it doesn't share storage with the browser. */
function keyFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/[?#&](?:b|k)=([A-Za-z0-9_-]{16,})/) || t.match(/^([A-Za-z0-9_-]{16,})$/);
  return m ? m[1] : null;
}
function boardFromURL() {
  const k = keyFrom(location.search) || keyFrom(location.hash);
  if (k) store.set(BOARD_KEY, k);
  return store.get(BOARD_KEY);
}
function keepKeyInURL() {
  const k = store.get(BOARD_KEY);
  const want = location.pathname + (k ? '?b=' + k : '');
  if (location.pathname + location.search + location.hash !== want) history.replaceState(null, '', want);
}
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

/* ---------- always run the newest version
   Home-screen apps can keep an old copy of the page for a long time.
   On open (and whenever the app comes back to the front) we ask the server
   which VERSION is current; if it's newer, we reload into it. */
let lastCheck = 0;
async function checkForUpdate() {
  if (Date.now() - lastCheck < 10e3) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(location.pathname + '?vcheck=' + Date.now(), { cache: 'no-store' });
    const m = (await r.text()).match(/var VERSION = '([^']+)'/);
    if (!m || !window.VERSION || m[1] === window.VERSION) return;
    if (sessionStorage.getItem('gp-updated-to') === m[1]) return;          // never loop
    if ([].some.call(document.querySelectorAll('dialog'), (d) => d.open)) return;   // not mid-edit
    sessionStorage.setItem('gp-updated-to', m[1]);
    sync.flush();
    const k = store.get(BOARD_KEY);
    setTimeout(() => location.replace(location.pathname + '?' + (k ? 'b=' + k + '&' : '') + 'v=' + encodeURIComponent(m[1])), 300);
  } catch (e) { /* offline: try again later */ }
}
export function shareLink() { return location.origin + location.pathname + '?b=' + store.get(BOARD_KEY); }

async function loadSeed() {
  try { const r = await fetch('data/seed.json', { cache: 'no-store' }); if (r.ok) return normalize(await r.json()); } catch (e) {}
  return normalize({});
}

/* ---------- screens */
function busy(on, text) { $('wChoices').hidden = on; $('wBusy').hidden = !on; if (text) $('wBusyText').textContent = text; }
function showWelcome(err) {
  $('app').hidden = true; $('welcome').hidden = false; busy(false);
  $('wErr').hidden = !err; $('wErr').textContent = err || '';
  /* in the home-screen app, joining is almost always what's wanted: starting a
     new board there would create a second, separate board */
  const app = isStandalone();
  $('wStartBox').hidden = app; $('wNew').hidden = !app;
  $('wText').textContent = app ? 'Paste the board link you were sent (or the one from your browser) to open your shared board here.'
    : 'Start your shared board, or open the link your partner sent you.';
}
function showApp() {
  $('welcome').hidden = true; $('app').hidden = false;
  if (S.mode === 'cloud') keepKeyInURL();
  render(); M.painted = true;
  if (S.page === 'lists') revealTab(false);
  onScroll();
  let first = true;
  try { first = !sessionStorage.getItem('gp-seen'); sessionStorage.setItem('gp-seen', '1'); } catch (e) {}
  if (first) entrance(S.page);
  shown = true;
  if (justCreated) { justCreated = false; setTimeout(() => showSnack('Your board is ready. Tap the share icon to send the link.'), 900); }
  else if (outlookResult) {
    const r = outlookResult; outlookResult = null;
    if (r.error) showSnack(r.error);
    else { showSnack(PROVIDERS[r.provider].name + ' connected'); resumePendingBook(); resumePendingOpen(); }
    if (S.page === 'plan') onOpenPlan();
  }
  else { greet(first); if (S.page === 'plan') onOpenPlan(); }
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
  $('wNew').addEventListener('click', () => { $('wStartBox').hidden = false; $('wNew').hidden = true; });
  $('wPaste').addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); $('wLink').value = t; if (keyFrom(t)) $('wJoin').click(); else showWelcome('That doesn’t look like a board link. Copy the whole link and try again.'); }
    catch (e) { $('wLink').focus(); showWelcome('Couldn’t read the clipboard. Long-press the box and choose Paste.'); }
  });
  $('wJoin').addEventListener('click', () => {
    const key = keyFrom($('wLink').value);
    if (!key) { showWelcome('That doesn’t look like a board link. Copy the whole link and paste it here.'); return; }
    store.set(BOARD_KEY, key);
    connectBoard(key);
  });
  $('wLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('wJoin').click(); });
}

function initSwitchBoard() {
  $('switchBoard').addEventListener('click', () => {
    const t = window.prompt('Paste the board link to open on this device:');
    if (t === null) return;
    const k = keyFrom(t);
    if (!k) { showSnack('That doesn’t look like a board link.'); return; }
    if (k === store.get(BOARD_KEY)) { showSnack('This device is already on that board.'); return; }
    store.set(BOARD_KEY, k);
    location.replace(location.pathname + '?b=' + k);
  });
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
  initRipple(); initPalette(); initSnack(commit); initSheetDrag();
  initActions(); initItemSheet(); initListSheet(); initRating(); initPeople();
  initWelcome(); initShare(); initSwitchBoard(); initPlanner();
  outlookResult = handleGoogleReturn() || await handleOutlookReturn();   // back from a calendar sign-in?
  if (outlookResult) { S.page = 'plan'; }
  preloadGoogle();
  window.addEventListener('online', () => { S.offline = false; if (shown) setStatus(); });
  window.addEventListener('offline', () => { S.offline = true; if (shown) setStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync.flush();
    else { if (shown) render(); checkForUpdate(); }   // dates stay current; pick up new versions
  });

  if (!sync.isConfigured()) {
    S.mode = 'local';
    S.data = normalize(sync.loadLocal() || await loadSeed());
    showApp();
    return;
  }
  const key = boardFromURL();
  checkForUpdate();
  if (!key) { showWelcome(); return; }
  connectBoard(key);
}
boot();
