/* PEOPLE: "Who's on this phone?" and each person's PIN.
   The phone remembers who you are after the right PIN.
   PINs are stored as a salted SHA-256 hash, never as the digits. */

import { CONFIG } from './config.js';
import { $, qa, esc, initial, plural, uid, store } from './util.js';
import { S, setMe, waiting } from './state.js';
import { anim, STD, EMPH_DEC } from './motion.js';
import { closeDialog, showSnack } from './dialogs.js';
import { commit, redraw } from './actions.js';

const whoDlg = () => $('whoDlg');
const pinDlg = () => $('pinDlg');
const LEN = CONFIG.pinLength;

/* ---------- who's on this phone */
export function openWho() {
  const pins = S.data.pins || [];
  $('whoOpts').innerHTML = S.data.people.map((n, i) => '<button type="button" class="who-opt rp" role="radio" data-me="' + i + '" aria-checked="' + (S.me === i) + '"><span class="av">' + esc(initial(n)) + '</span>' + esc(n)
    + (pins[i] ? '<span class="ms lk" aria-label="PIN set">lock</span>' : '') + '<span class="ms ck" aria-hidden="true">check_circle</span></button>').join('');
  $('changePin').hidden = !(S.me !== null && pins[S.me]);
  if (!whoDlg().open) whoDlg().showModal();
}
function closeWho() { store.set('gp-who-asked', 1); closeDialog(whoDlg()); }

function selectMe(i) {
  setMe(i);
  qa('.who-opt', $('whoOpts')).forEach((x) => x.setAttribute('aria-checked', String(+x.getAttribute('data-me') === i)));
  redraw();
  anim($('meAv'), [{ transform: 'scale(.5)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'none' }], { duration: 420, easing: STD });
  setTimeout(closeWho, 260);
  const w = waiting().length;
  showSnack('Hi ' + S.data.people[i] + (w ? '. ' + plural(w, 'thing') + ' ' + (w === 1 ? 'is' : 'are') + ' waiting for your rating.' : '.'));
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
  $('pinTitle').textContent = flow.step === 'verify' ? (flow.purpose === 'change' ? 'Current PIN' : 'Enter ' + n + '’s PIN')
    : flow.step === 'create' ? (flow.purpose === 'changed' ? 'New PIN' : 'Create a PIN for ' + n) : 'Type it again';
  $('pinSub').textContent = flow.step === 'verify' ? (flow.purpose === 'change' ? 'Enter your current PIN first.' : 'This phone will remember ' + n + ' after that.')
    : flow.step === 'create' ? (flow.nudge || LEN + ' digits. You’ll need it to pick ' + n + ' on any phone.') : 'Just to make sure.';
  $('pinErr').textContent = '';
}
const paintDots = () => qa('#pinDots i').forEach((d, k) => d.classList.toggle('on', k < buf.length));
const shake = () => anim($('pinDots'), [{ transform: 'none' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 380, easing: STD });

export function openPin(f) {
  flow = f; buf = ''; paintDots(); setText();
  if (!pinDlg().open) pinDlg().showModal();
}
function finishPin(ok) { const f = flow; flow = null; closeDialog(pinDlg()); if (f && f.done) f.done(ok); }
function nextStep(step) { flow.step = step; buf = ''; paintDots(); setText(); anim($('pinDots'), [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EMPH_DEC }); }

function submitPin() {
  const f = flow; if (!f || f.busy) return;
  const entered = buf;
  if (f.step === 'create') { f.first = entered; nextStep('confirm'); return; }
  f.busy = true;
  if (f.step === 'confirm') {
    if (entered !== f.first) { f.busy = false; f.first = ''; nextStep('create'); $('pinErr').textContent = 'Those didn’t match. Try again.'; shake(); return; }
    pinHash(f.person, entered).then((h) => {
      if (!Array.isArray(S.data.pins)) S.data.pins = [null, null];
      S.data.pins[f.person] = h; f.busy = false;
      commit();
      if (f.purpose === 'changed') showSnack('PIN updated');
      finishPin(true);
    });
    return;
  }
  pinHash(f.person, entered).then((h) => {
    f.busy = false;
    if (S.data.pins && S.data.pins[f.person] === h) {
      if (f.purpose === 'change') { f.purpose = 'changed'; nextStep('create'); return; }
      finishPin(true);
    } else { buf = ''; paintDots(); $('pinErr').textContent = 'That PIN didn’t match.'; shake(); }
  });
}
function key(k) {
  if (!flow || flow.busy) return;
  if (k === 'bk') { buf = buf.slice(0, -1); paintDots(); return; }
  if (buf.length >= LEN) return;
  buf += k; paintDots(); $('pinErr').textContent = '';
  anim(qa('#pinDots i')[buf.length - 1], [{ transform: 'scale(.6)' }, { transform: 'scale(1.25)', offset: 0.6 }, { transform: 'scale(1.12)' }], { duration: 220, easing: STD });
  if (buf.length === LEN) setTimeout(submitPin, 140);
}

/* on open: ask who's here once, or nudge you to set a PIN */
export function greet(firstVisit) {
  const delay = firstVisit ? 1200 : 400;
  if (S.me !== null && !(S.data.pins && S.data.pins[S.me]) && !sessionStorage.getItem('gp-pin-nudged')) {
    try { sessionStorage.setItem('gp-pin-nudged', '1'); } catch (e) {}
    setTimeout(() => openPin({ person: S.me, step: 'create', nudge: 'Set a PIN for ' + S.data.people[S.me] + ' so nobody else can pick you on another phone.', done: (ok) => { if (ok) showSnack('PIN set for ' + S.data.people[S.me]); } }), delay);
  } else if (S.me === null && !store.get('gp-who-asked')) setTimeout(openWho, delay);
}

export function initPeople() {
  $('pinDots').innerHTML = new Array(LEN + 1).join('<i></i>');
  $('whoOpts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-me]'); if (!b) return;
    const i = +b.getAttribute('data-me');
    if (i === S.me) { closeWho(); return; }
    const pins = S.data.pins || [];
    openPin({ person: i, step: pins[i] ? 'verify' : 'create', done: (ok) => { if (ok) selectMe(i); } });
  });
  $('whoLater').addEventListener('click', closeWho);
  whoDlg().addEventListener('click', (e) => { if (e.target === whoDlg()) closeWho(); });
  whoDlg().addEventListener('cancel', (e) => { e.preventDefault(); closeWho(); });
  $('meBtn').addEventListener('click', openWho);
  $('turnCard').addEventListener('click', (e) => { if (e.target.closest('#setMe')) openWho(); });
  $('changePin').addEventListener('click', () => { if (S.me !== null) openPin({ person: S.me, step: 'verify', purpose: 'change' }); });

  $('keypad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.getAttribute('data-k')); });
  document.addEventListener('keydown', (e) => {
    if (!pinDlg().open) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); key('bk'); }
  });
  $('pinCancel').addEventListener('click', () => finishPin(false));
  pinDlg().addEventListener('cancel', (e) => { e.preventDefault(); finishPin(false); });
  pinDlg().addEventListener('click', (e) => { if (e.target === pinDlg()) finishPin(false); });
}
