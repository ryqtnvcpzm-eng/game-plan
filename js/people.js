/* PEOPLE: "Who's using this device?" and each person's PIN.
   The device remembers who you are after the right PIN.
   PINs are stored as a salted SHA-256 hash, never as the digits
   (same format as before, so existing PINs keep working). */

import { CONFIG } from './config.js';
import { $, qa, esc, initial, plural, uid, store } from './util.js';
import { S, setMe, waiting } from './state.js';
import { anim, EASE } from './motion.js';
import { openDialog, closeDialog, onDismiss, toast } from './dialogs.js';
import { commit, redraw } from './actions.js';

const LEN = CONFIG.pinLength || 4;

/* ---------- who's using this device */
export function openWho() {
  const pins = S.data.pins || [];
  $('whoList').innerHTML = S.data.people.map((n, i) => '<button type="button" class="who-opt' + (S.me === i ? ' on' : '') + '" data-me="' + i + '"><span class="avatar">' + esc(initial(n)) + '</span>' + esc(n)
    + '<span class="ms end" aria-hidden="true">' + (S.me === i ? 'check_circle' : pins[i] ? 'lock' : 'chevron_right') + '</span></button>').join('');
  openDialog($('whoDialog'));
}
function closeWho() { store.set('gp-who-asked', 1); closeDialog($('whoDialog')); }
function selectMe(i) {
  setMe(i);
  closeWho();
  redraw();
  anim($('meAv'), [{ transform: 'scale(.5)' }, { transform: 'scale(1.12)', offset: 0.6 }, { transform: 'none' }], { duration: 420, easing: EASE });
  const w = waiting().length;
  toast('Hi ' + S.data.people[i] + (w ? '. ' + plural(w, 'thing') + ' ' + (w === 1 ? 'is' : 'are') + ' waiting for your rating.' : '.'));
}

/* ---------- PIN pad */
let flow = null, buf = '';
function sha(str) {
  if (window.crypto && crypto.subtle && window.TextEncoder) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then((b) => [].map.call(new Uint8Array(b), (x) => ('0' + x.toString(16)).slice(-2)).join(''));
  }
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
  return Promise.resolve('f' + h.toString(16));
}
function pinHash(i, pin) { if (!S.data.pinSalt) S.data.pinSalt = uid() + uid(); return sha(S.data.pinSalt + ':' + i + ':' + pin); }

function setText() {
  const n = S.data.people[flow.person];
  $('pinTitle').textContent = flow.step === 'verify' ? (flow.purpose === 'change' ? 'Enter your current PIN' : 'Enter ' + n + '’s PIN')
    : flow.step === 'create' ? (flow.purpose === 'changed' ? 'Choose a new PIN' : 'Create a PIN for ' + n) : 'Enter it again';
  $('pinText').textContent = flow.step === 'verify' ? (flow.purpose === 'change' ? '' : 'This device will remember you after this.')
    : flow.step === 'create' ? (flow.nudge || LEN + ' digits. You’ll use it to choose ' + n + ' on a new device.') : 'Just to be sure.';
  $('pinError').textContent = '';
}
const paintDots = () => qa('#pinDots i').forEach((d, k) => d.classList.toggle('on', k < buf.length));
const shake = () => anim($('pinDots'), [{ transform: 'none' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 400, easing: 'ease-out' });

export function openPin(f) { flow = f; buf = ''; paintDots(); setText(); openDialog($('pinDialog')); }
function finishPin(ok) { const f = flow; flow = null; closeDialog($('pinDialog')); if (f && f.done) f.done(ok); }
function nextStep(step) { flow.step = step; buf = ''; paintDots(); setText(); anim($('pinDots'), [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE }); }

function submitPin() {
  const f = flow; if (!f || f.busy) return;
  const entered = buf;
  if (f.step === 'create') { f.first = entered; nextStep('confirm'); return; }
  f.busy = true;
  if (f.step === 'confirm') {
    if (entered !== f.first) { f.busy = false; f.first = ''; nextStep('create'); $('pinError').textContent = 'Those didn’t match. Try again.'; shake(); return; }
    pinHash(f.person, entered).then((h) => {
      if (!Array.isArray(S.data.pins)) S.data.pins = [null, null];
      S.data.pins[f.person] = h; f.busy = false;
      commit();
      if (f.purpose === 'changed') toast('PIN changed');
      finishPin(true);
    });
    return;
  }
  pinHash(f.person, entered).then((h) => {
    f.busy = false;
    if (S.data.pins && S.data.pins[f.person] === h) {
      if (f.purpose === 'change') { f.purpose = 'changed'; nextStep('create'); return; }
      finishPin(true);
    } else { buf = ''; paintDots(); $('pinError').textContent = 'Wrong PIN. Try again.'; shake(); }
  });
}
function key(k) {
  if (!flow || flow.busy) return;
  if (k === 'bk') { buf = buf.slice(0, -1); paintDots(); return; }
  if (buf.length >= LEN) return;
  buf += k; paintDots(); $('pinError').textContent = '';
  if (buf.length === LEN) setTimeout(submitPin, 120);
}

/* choosing a person always goes through their PIN (or creating one) */
export function choosePerson(i) {
  if (i === S.me) { closeWho(); return; }
  const pins = S.data.pins || [];
  openPin({ person: i, step: pins[i] ? 'verify' : 'create', done: (ok) => { if (ok) selectMe(i); } });
}
export function changePin() {
  if (S.me === null) return;
  const has = S.data.pins && S.data.pins[S.me];
  openPin(has ? { person: S.me, step: 'verify', purpose: 'change' } : { person: S.me, step: 'create', done: (ok) => { if (ok) toast('PIN set'); } });
}

/* on open: ask who's here once, or nudge you to set a PIN */
export function greet(delay) {
  if (S.me !== null && !(S.data.pins && S.data.pins[S.me])) {
    if (sessionStorage.getItem('gp-pin-nudged')) return;
    try { sessionStorage.setItem('gp-pin-nudged', '1'); } catch (e) {}
    setTimeout(() => openPin({ person: S.me, step: 'create', nudge: 'Set a PIN for ' + S.data.people[S.me] + ' so nobody else can choose you on another device.', done: (ok) => { if (ok) toast('PIN set for ' + S.data.people[S.me]); } }), delay);
  } else if (S.me === null && !store.get('gp-who-asked')) setTimeout(openWho, delay);
}

export function initPeople() {
  $('pinDots').innerHTML = new Array(LEN + 1).join('<i></i>');
  $('keypad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'bk'].map((k) => k === '' ? '<span class="blank"></span>'
    : k === 'bk' ? '<button type="button" class="ghost" data-k="bk" aria-label="Delete"><span class="ms" aria-hidden="true">backspace</span></button>'
      : '<button type="button" data-k="' + k + '">' + k + '</button>').join('');
  $('whoList').addEventListener('click', (e) => { const b = e.target.closest('[data-me]'); if (b) choosePerson(+b.dataset.me); });
  $('whoLater').addEventListener('click', closeWho);
  onDismiss($('whoDialog'), closeWho);
  $('keypad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
  document.addEventListener('keydown', (e) => {
    if (!$('pinDialog').open) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); key('bk'); }
  });
  $('pinCancel').addEventListener('click', () => finishPin(false));
  onDismiss($('pinDialog'), () => finishPin(false));
}
