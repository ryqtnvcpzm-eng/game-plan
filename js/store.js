/* SYNC: saves the board and listens for the other phone's changes.

   The board is one Firestore document at boards/<board key>:
     meta   { startedAt, people, pins, pinSalt, seq }
     cats   { <listId>: { name, icon, order } }
     items  { <itemId>: { ...item } }
     busy   { 0: {at, until, blocks, src}, 1: {...} }   each person's busy times (no event details)
     plans  { <planId>: { title, itemId, start, end, by, added } }   booked date times
   Only the parts that changed are sent, so two people editing different
   things at the same time never overwrite each other.

   With no Firebase keys in config.js, everything is kept on this phone. */

import { CONFIG } from './config.js';
import { store } from './util.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const LOCAL_KEY = 'gp-local-board';

let fb = null;          // { m: firestore module, db }
let ref = null;         // the board document
let lastSent = {};      // flat copy of what the server has
let timer = null, pendingData = null, handlers = {};

export function isConfigured() { const f = CONFIG.firebase || {}; return !!(f.apiKey && f.projectId); }

/* ---------- flat form: "items.abc" -> item, so we can compare piece by piece */
function cleanItem(i) {
  return { id: i.id, list: i.list, title: i.title, note: i.note || '', pr: i.pr || 0, addedAt: i.addedAt,
    doneAt: i.doneAt || null, seq: i.seq || 0, rating: (i.rating || [0, 0]).slice(0, 2) };
}
export function flatten(d) {
  const o = {
    'meta.startedAt': d.startedAt, 'meta.people': d.people.slice(0, 2),
    'meta.pins': (d.pins || [null, null]).slice(0, 2), 'meta.pinSalt': d.pinSalt || null, 'meta.seq': d.seq || 0,
    'meta.palette': d.palette || null,
  };
  d.cats.forEach((c, i) => { o['cats.' + c.id] = { name: c.name, icon: c.icon, order: i }; });
  d.items.forEach((it) => { o['items.' + it.id] = cleanItem(it); });
  (d.busy || []).forEach((b, i) => { if (b) o['busy.' + i] = { at: b.at || 0, until: b.until || 0, blocks: [].concat.apply([], b.blocks || []), src: (b.src || []).slice() }; });
  (d.plans || []).forEach((p) => { o['plans.' + p.id] = { title: p.title, itemId: p.itemId || null, catId: p.catId || null, start: p.start, end: p.end, by: p.by, added: (p.added || [null, null]).slice(0, 2) }; });
  return o;
}
export function unflatten(o) {
  const d = { cats: [], items: [], busy: [null, null], plans: [] };
  Object.keys(o).forEach((k) => {
    const dot = k.indexOf('.'), group = k.slice(0, dot), key = k.slice(dot + 1), v = o[k];
    if (group === 'meta') d[key] = v;
    else if (group === 'cats') d.cats.push({ id: key, name: v.name, icon: v.icon, order: v.order || 0 });
    else if (group === 'items') d.items.push(Object.assign({}, v, { id: key }));
    else if (group === 'busy') {            // stored flat [s1, e1, s2, e2...]; used as pairs
      const f = v.blocks || [], pairs = [];
      for (let i = 0; i + 1 < f.length; i += 2) pairs.push([f[i], f[i + 1]]);
      d.busy[+key] = Object.assign({}, v, { blocks: pairs });
    }
    else if (group === 'plans') d.plans.push(Object.assign({}, v, { id: key }));
  });
  d.cats.sort((a, b) => a.order - b.order).forEach((c) => delete c.order);
  return d;
}
function nest(o) {
  const doc = { meta: {}, cats: {}, items: {}, busy: {}, plans: {} };
  Object.keys(o).forEach((k) => { const dot = k.indexOf('.'); doc[k.slice(0, dot)][k.slice(dot + 1)] = o[k]; });
  return doc;
}
function flatFromDoc(doc) {
  const o = {};
  ['meta', 'cats', 'items', 'busy', 'plans'].forEach((g) => { const part = doc[g] || {}; Object.keys(part).forEach((k) => { o[g + '.' + k] = part[k]; }); });
  return o;
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Apply what changed on the server to our copy, keeping our own unsent edits. */
export function mergeRemote(localData, remoteFlat) {
  const cur = localData ? flatten(localData) : {};
  const keys = new Set(Object.keys(remoteFlat).concat(Object.keys(lastSent), Object.keys(cur)));
  let changed = !localData;
  keys.forEach((k) => {
    const r = remoteFlat[k];
    if (!same(r, lastSent[k])) {
      if (r === undefined) delete cur[k]; else cur[k] = r;
      changed = true;
    }
  });
  lastSent = JSON.parse(JSON.stringify(remoteFlat));
  return changed ? unflatten(localData ? cur : remoteFlat) : null;
}

/* ---------- Firebase */
async function load() {
  if (fb) return;
  const [app, m] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js')]);
  const a = app.initializeApp(CONFIG.firebase);
  let db;
  try { db = m.initializeFirestore(a, { localCache: m.persistentLocalCache({ tabManager: m.persistentMultipleTabManager() }) }); }
  catch (e) { db = m.getFirestore(a); }
  fb = { m, db };
}

export async function createBoard(key, data) {
  await load();
  const flat = flatten(data);
  await fb.m.setDoc(fb.m.doc(fb.db, 'boards', key), nest(flat));
}

/* h = { onRemote(flat), onMissing(), onStatus({pending, fromCache}), onError(err) } */
export async function connect(key, h) {
  handlers = h;
  await load();
  ref = fb.m.doc(fb.db, 'boards', key);
  fb.m.onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    h.onStatus({ pending: snap.metadata.hasPendingWrites || !!timer, fromCache: snap.metadata.fromCache });
    if (!snap.exists()) { if (!snap.metadata.fromCache) h.onMissing(); return; }
    if (snap.metadata.hasPendingWrites) return;       // our own write echoing back
    h.onRemote(flatFromDoc(snap.data()));
  }, (err) => h.onError(err));
}

/* Called after every change. Waits a moment, then sends only what changed. */
export function save(data) {
  if (!isConfigured()) { store.set(LOCAL_KEY, data); return; }
  if (!ref) return;
  pendingData = data;
  clearTimeout(timer);
  timer = setTimeout(flush, CONFIG.saveDelayMs);
  handlers.onStatus && handlers.onStatus({ pending: true });
}
export function flush() {
  if (!timer && !pendingData) return;
  clearTimeout(timer); timer = null;
  if (!pendingData || !ref) return;
  const cur = flatten(pendingData); pendingData = null;
  const upd = {};
  new Set(Object.keys(cur).concat(Object.keys(lastSent))).forEach((k) => {
    if (!same(cur[k], lastSent[k])) upd[k] = cur[k] === undefined ? fb.m.deleteField() : cur[k];
  });
  if (!Object.keys(upd).length) { handlers.onStatus({ pending: false }); return; }
  lastSent = JSON.parse(JSON.stringify(cur));
  fb.m.updateDoc(ref, upd).catch((err) => handlers.onError(err));
}

export function loadLocal() { return store.get(LOCAL_KEY); }
