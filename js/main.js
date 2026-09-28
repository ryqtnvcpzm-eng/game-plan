/* START-UP
   - No Firebase keys in config.js        -> runs on this device only.
   - Keys, but no board on this device    -> welcome screen (start a board or join one).
   - Board in the address or saved        -> connects and shows the app, live.
   The board key lives in the address (?b=…) so a home-screen copy of the app
   opens the right board even though it has its own storage. */

import { CONFIG } from './config.js';
import { $, store, randomKey } from './util.js';
import { S, normalize, setMe } from './state.js';
import * as sync from './store.js';
import { render, renderSync } from './render.js';
import { M, enterView, countUp } from './motion.js';
import { initDialogs, initToast, toast } from './dialogs.js';
import { initActions, commit, redraw } from './actions.js';
import { initItemSheet } from './item-sheet.js';
import { initListSheet, deleteList, openListSheet } from './list-sheet.js';
import { initRating } from './rating.js';
import { initPeople, greet } from './people.js';
import { initPalette } from './palette.js';
import { initPlanner, onOpenPlan, resumePendingBook } from './planner.js';
import { initList } from './view-list.js';
import { initMemories } from './view-memories.js';
import { initSettings } from './view-settings.js';
import { handleOutlookReturn, handleGoogleReturn, preloadGoogle, PROVIDERS } from './calendar.js';
import { startRouter, go, routeNow } from './router.js';
import { setPhoto } from './images.js';
import { actionSheet } from './dialogs.js';

const BOARD_KEY = 'gp-board';
let shown = false, justCreated = false, calReturn = null;

/* ---------- board link */
function keyFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/[?#&](?:b|k)=([A-Za-z0-9_-]{16,})/) || t.match(/^([A-Za-z0-9_-]{16,})$/);
  return m ? m[1] : null;
}
function boardFromURL() {
  const k = keyFrom(location.search) || (/^#k=/.test(location.hash) ? keyFrom(location.hash) : null);
  if (k) store.set(BOARD_KEY, k);
  if (/^#k=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  return store.get(BOARD_KEY);
}
function keepKeyInURL() {
  const k = store.get(BOARD_KEY);
  const hash = /^#\//.test(location.hash) ? location.hash : '';
  const want = location.pathname + (k ? '?b=' + k : '') + hash;
  if (location.pathname + location.search + location.hash !== want) history.replaceState(null, '', want);
}
export function shareLink() { return location.origin + location.pathname + '?b=' + store.get(BOARD_KEY); }
export function switchBoard() {
  const t = window.prompt('Paste the board link to open on this device:');
  if (t === null) return;
  const k = keyFrom(t);
  if (!k) { toast('That doesn’t look like a board link.'); return; }
  if (k === store.get(BOARD_KEY)) { toast('This device is already on that board.'); return; }
  store.set(BOARD_KEY, k);
  location.replace(location.pathname + '?b=' + k);
}
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

/* ---------- always run the newest version (home-screen apps hold on to old copies) */
let lastCheck = 0;
async function checkForUpdate() {
  if (Date.now() - lastCheck < 10e3) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(location.pathname + '?vcheck=' + Date.now(), { cache: 'no-store' });
    const m = (await r.text()).match(/var VERSION = '([^']+)'/);
    if (!m || !window.VERSION || m[1] === window.VERSION) return;
    if (sessionStorage.getItem('gp-updated-to') === m[1]) return;
    if ([].some.call(document.querySelectorAll('dialog'), (d) => d.open)) return;
    sessionStorage.setItem('gp-updated-to', m[1]);
    sync.flush();
    const k = store.get(BOARD_KEY);
    const hash = /^#\//.test(location.hash) ? location.hash : '';
    setTimeout(() => location.replace(location.pathname + '?' + (k ? 'b=' + k + '&' : '') + 'v=' + encodeURIComponent(m[1]) + hash), 300);
  } catch (e) { /* offline: try again later */ }
}

async function loadSeed() {
  try { const r = await fetch('data/seed.json', { cache: 'no-store' }); if (r.ok) return normalize(await r.json()); } catch (e) {}
  return normalize({});
}

/* ---------- welcome screen */
function busy(on, text) { $('wChoices').hidden = on; $('wBusy').hidden = !on; if (text) $('wBusyText').textContent = text; }
function showWelcome(err) {
  $('app').hidden = true; $('welcome').hidden = false; busy(false);
  setPhoto($('wArt'), 'welcome', 1600);
  $('wErr').hidden = !err; $('wErr').textContent = err || '';
  const app = isStandalone();   // in the home-screen app, joining is almost always what's wanted
  $('wStartBox').hidden = app; $('wNew').hidden = !app;
  $('wText').textContent = app ? 'Paste your board link to open your shared board here.' : 'Start your shared board, or open the link your partner sent you.';
}
function errorText(err) {
  const c = (err && err.code) || '';
  if (c.indexOf('permission') > -1) return 'Firebase refused access. Check the Firestore rules (see the README).';
  return 'Couldn’t reach the database. Check your connection and the keys in js/config.js.';
}

/* ---------- pages */
function showRoute(r, prev, scrollY) {
  S.route = r;
  if (!S.data) return;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== r.name; });
  render();
  window.scrollTo(0, scrollY || 0);
  onScroll();
  if (prev && prev.name + prev.id !== r.name + r.id) enterView($('v-' + r.name));
  if (r.name === 'plan' || r.name === 'settings') onOpenPlan();
}

function showApp() {
  $('welcome').hidden = true; $('app').hidden = false;
  if (S.mode === 'cloud') keepKeyInURL();
  shown = true;
  startRouter(showRoute);
  M.painted = true;
  let first = true;
  try { first = !sessionStorage.getItem('gp-seen'); sessionStorage.setItem('gp-seen', '1'); } catch (e) {}
  if (first && routeNow().name === 'home') ['homeDay', 'statTodo', 'statDone'].forEach((k) => countUp($(k), +$(k).textContent, 900));
  if (justCreated) { justCreated = false; setTimeout(() => toast('Your board is ready. Share the link from Settings.'), 700); }
  else if (calReturn) {
    const r = calReturn; calReturn = null;
    toast(r.error ? r.error : PROVIDERS[r.provider].name + ' connected');
    if (!r.error) resumePendingBook();
    const back = store.get('gp-return'); store.set('gp-return', null);
    go(back || '#/settings', true);
  } else greet(first ? 1000 : 400);
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
    onMissing() { store.set(BOARD_KEY, null); shown = false; S.data = null; showWelcome('That link doesn’t match a board. Check it and try again.'); },
    onStatus(st) {
      if ('pending' in st) S.pending = st.pending;
      if ('fromCache' in st) S.offline = st.fromCache && !navigator.onLine;
      S.error = false;
      if (shown) renderSync();
    },
    onError(err) { console.error(err); S.error = true; if (shown) renderSync(); else showWelcome(errorText(err)); },
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
    try { const t = await navigator.clipboard.readText(); $('wLink').value = t; if (keyFrom(t)) $('wJoin').click(); else showWelcome('That doesn’t look like a board link.'); }
    catch (e) { $('wLink').focus(); showWelcome('Couldn’t read the clipboard. Long-press the box and choose Paste.'); }
  });
  $('wJoin').addEventListener('click', () => {
    const key = keyFrom($('wLink').value);
    if (!key) { showWelcome('That doesn’t look like a board link. Copy the whole link and paste it here.'); return; }
    store.set(BOARD_KEY, key); connectBoard(key);
  });
  $('wLink').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('wJoin').click(); });
}

/* ---------- little things on the bars */
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; document.body.classList.toggle('scrolled', window.scrollY > 40); });
}
function initBars() {
  window.addEventListener('scroll', onScroll, { passive: true });
  $('brand').addEventListener('click', (e) => { if (routeNow().name === 'home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  const listMenu = () => {
    const id = S.route.id;
    actionSheet([{ label: 'Edit list', run: () => openListSheet('edit', id) }, { label: 'Delete list', danger: true, run: () => deleteList(id) }]);
  };
  $('moreBtn').addEventListener('click', listMenu);
  $('listEdit').addEventListener('click', () => openListSheet('edit', S.route.id));
  $('listDelete').addEventListener('click', () => deleteList(S.route.id));
}

/* ---------- go */
async function boot() {
  document.title = CONFIG.appName || 'The Game Plan';
  $('appName').textContent = CONFIG.appName || 'The Game Plan';
  $('wTitle').textContent = CONFIG.appName || 'The Game Plan';
  initPalette(); initDialogs(); initToast(commit);
  initActions(); initItemSheet(); initListSheet(); initRating(); initPeople();
  initPlanner(); initList(); initMemories(); initSettings();
  initWelcome(); initBars();
  calReturn = handleGoogleReturn() || await handleOutlookReturn();   // back from a calendar sign-in?
  preloadGoogle();
  window.addEventListener('online', () => { S.offline = false; if (shown) renderSync(); });
  window.addEventListener('offline', () => { S.offline = true; if (shown) renderSync(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync.flush();
    else { if (shown) render(); checkForUpdate(); }
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
export { setMe };
