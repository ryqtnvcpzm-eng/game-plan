/* CALENDARS: connecting Google Calendar and Outlook on this phone,
   reading busy times, and creating private events.

   Only busy/free times ever leave the phone (into the shared board).
   Event names and details are never read or shared.

   Google uses Google's sign-in popup in a browser tab, or Google's sign-in page
   when opened from the home screen (pop-ups don't work well there).
   Outlook always uses Microsoft's sign-in page (the app leaves and comes back).
   Sign-in tokens stay on this phone only. */

import { CAL } from './calendar-config.js';
import { store } from './util.js';

const TK = 'gp-cal-tokens';
const tokens = () => store.get(TK) || {};
const saveTokens = (t) => store.set(TK, t);

export const PROVIDERS = {
  google: { name: 'Google Calendar', short: 'Google' },
  outlook: { name: 'Outlook', short: 'Outlook' },
};
export const configured = (p) => !!(p === 'google' ? CAL.googleClientId : CAL.outlookClientId);
export const connected = (p) => !!(tokens()[p] && tokens()[p].connected);
export const connectedList = () => Object.keys(PROVIDERS).filter((p) => configured(p) && connected(p));

function authError(p, msg) { const e = new Error(msg || 'Please reconnect ' + PROVIDERS[p].name); e.code = 'auth'; e.provider = p; return e; }
function expire(p) { const t = tokens(); if (t[p]) { if (p === 'google') t.google.exp = 0; else t.outlook.exp = 0; saveTokens(t); } }
export function disconnect(p) { const t = tokens(); delete t[p]; saveTokens(t); }

const redirectUri = () => location.origin + location.pathname;
const b64url = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

/* ============================ Google ============================ */
const G_SCOPES = ['https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/calendar.events'];
let gisPromise = null;
export function preloadGoogle() {
  if (!configured('google') || gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisPromise = null; rej(new Error('Couldn’t load Google sign-in. Check your connection.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}
function googleReady() { return window.google && google.accounts && google.accounts.oauth2; }

function requestGoogle(firstTime) {
  return new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CAL.googleClientId,
      scope: G_SCOPES.join(' '),
      callback: (r) => {
        if (r.error) { rej(new Error(r.error_description || r.error)); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, G_SCOPES[0], G_SCOPES[1])) { rej(new Error('Calendar access wasn’t allowed. Tick both boxes when Google asks.')); return; }
        const t = tokens();
        t.google = { connected: true, token: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
        saveTokens(t); res(r.access_token);
      },
      error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'cancelled' : e && e.type === 'popup_failed_to_open' ? 'Your browser blocked the Google pop-up. Allow pop-ups and try again.' : 'Google sign-in failed')),
    });
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '' });
  });
}
/* the no-popup way: leave for Google's sign-in page, handleGoogleReturn() finishes */
function googleRedirect() {
  const state = rand(16);
  store.set('gp-g-state', state);
  const p = new URLSearchParams({ client_id: CAL.googleClientId, redirect_uri: redirectUri(), response_type: 'token',
    scope: G_SCOPES.join(' '), include_granted_scopes: 'true', state });
  if (!connected('google')) p.set('prompt', 'consent');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  return new Promise(() => {});
}
export function handleGoogleReturn() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('access_token') && !(h.has('error') && h.has('state'))) return null;
  const st = store.get('gp-g-state');
  history.replaceState(null, '', location.pathname + location.search);
  if (h.get('error')) return { provider: 'google', error: h.get('error') === 'access_denied' ? 'Google Calendar access wasn’t allowed.' : 'Google sign-in failed' };
  if (!st || st !== h.get('state')) return { provider: 'google', error: 'That Google sign-in expired. Try again.' };
  store.set('gp-g-state', null);
  const granted = (h.get('scope') || '').split(' ');
  if (!G_SCOPES.every((s) => granted.indexOf(s) > -1)) return { provider: 'google', error: 'Calendar access wasn’t allowed. Tick both boxes when Google asks.' };
  const t = tokens();
  t.google = { connected: true, token: h.get('access_token'), exp: Date.now() + (Number(h.get('expires_in')) - 60) * 1000 };
  saveTokens(t);
  return { provider: 'google', ok: true };
}
/* interactive = called from a tap, so signing in is allowed */
async function googleToken(interactive) {
  const g = tokens().google;
  if (g && g.token && g.exp > Date.now()) return g.token;
  if (!interactive) return null;
  if (isStandalone()) return googleRedirect();
  if (!googleReady()) await preloadGoogle();     // usually already loaded, so the popup isn't blocked
  try { return await requestGoogle(!(g && g.connected)); }
  catch (e) { if (/blocked/.test(e.message)) return googleRedirect(); throw e; }
}
async function gfetch(url, opts, interactive) {
  const tok = await googleToken(interactive);
  if (!tok) throw authError('google');
  const r = await fetch(url, Object.assign({}, opts, { headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } }));
  if (r.status === 401) { expire('google'); throw authError('google'); }
  if (!r.ok) throw new Error('Google Calendar said no (' + r.status + '). ' + (await r.text()).slice(0, 140));
  return r.json();
}
async function googleBusy(from, to, interactive) {
  const j = await gfetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST',
    body: JSON.stringify({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), items: [{ id: 'primary' }] }) }, interactive);
  const b = (j.calendars && j.calendars.primary && j.calendars.primary.busy) || [];
  return b.map((x) => [Date.parse(x.start), Date.parse(x.end)]);
}
function googleCreate(ev, interactive) {
  return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST',
    body: JSON.stringify({ summary: ev.title, description: ev.note || '', start: { dateTime: new Date(ev.start).toISOString() }, end: { dateTime: new Date(ev.end).toISOString() },
      visibility: 'private', transparency: 'opaque', reminders: { useDefault: true } }) }, interactive);
}

/* ============================ Outlook ============================ */
const MS = 'https://login.microsoftonline.com/common/oauth2/v2.0/';
const MS_SCOPES = 'openid offline_access https://graph.microsoft.com/Calendars.ReadWrite';

/* leaves the app for Microsoft's sign-in page; handleOutlookReturn() finishes when it comes back */
export async function outlookSignIn() {
  const verifier = rand(48), state = rand(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  store.set('gp-ms-pkce', { verifier, state });
  const known = connected('outlook');
  const p = new URLSearchParams({ client_id: CAL.outlookClientId, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query',
    scope: MS_SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state });
  if (!known) p.set('prompt', 'select_account');
  location.assign(MS + 'authorize?' + p.toString());
  return new Promise(() => {});    // the page is leaving
}
function saveMs(j, keepRexp) {
  const t = tokens(), old = t.outlook || {};
  t.outlook = { connected: true, access: j.access_token, exp: Date.now() + (Number(j.expires_in) - 60) * 1000,
    refresh: j.refresh_token || old.refresh, rexp: keepRexp && old.rexp ? old.rexp : Date.now() + 23 * 3600e3 };
  saveTokens(t);
}
async function msTokenCall(params) {
  const r = await fetch(MS + 'token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: CAL.outlookClientId, scope: MS_SCOPES }, params)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description ? j.error_description.split('\r\n')[0] : 'Outlook sign-in failed');
  return j;
}
/* call at start-up: finishes an Outlook sign-in if we just came back from Microsoft */
export async function handleOutlookReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const r = await finishOutlook(q);
  r.provider = 'outlook';
  return r;
}
async function finishOutlook(q) {
  const saved = store.get('gp-ms-pkce');
  history.replaceState(null, '', location.pathname + location.hash);
  if (q.get('error')) return { error: q.get('error') === 'access_denied' ? 'Outlook access wasn’t allowed.' : (q.get('error_description') || 'Outlook sign-in failed') };
  if (!saved || saved.state !== q.get('state')) return { error: 'That Outlook sign-in expired. Try again.' };
  store.set('gp-ms-pkce', null);
  try {
    saveMs(await msTokenCall({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: saved.verifier }), false);
    return { ok: true };
  } catch (e) { return { error: e.message }; }
}
async function outlookToken(interactive) {
  const o = tokens().outlook;
  if (o && o.access && o.exp > Date.now()) return o.access;
  if (o && o.refresh && o.rexp > Date.now()) {
    try { saveMs(await msTokenCall({ grant_type: 'refresh_token', refresh_token: o.refresh }), true); return tokens().outlook.access; }
    catch (e) { /* fall through to sign-in */ }
  }
  if (interactive) return outlookSignIn();
  return null;
}
async function mfetch(url, opts, interactive) {
  const tok = await outlookToken(interactive);
  if (!tok) throw authError('outlook');
  const r = await fetch(url, Object.assign({}, opts, { headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'outlook.timezone="UTC"' } }));
  if (r.status === 401) { expire('outlook'); throw authError('outlook'); }
  if (!r.ok) throw new Error('Outlook said no (' + r.status + '). ' + (await r.text()).slice(0, 140));
  return r.status === 204 ? null : r.json();
}
const utc = (s) => Date.parse(String(s).slice(0, 19) + 'Z');
async function outlookBusy(from, to, interactive) {
  let url = 'https://graph.microsoft.com/v1.0/me/calendarView?' + new URLSearchParams({
    startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(),
    $select: 'start,end,showAs,isCancelled', $top: '250' }).toString();
  const out = [];
  for (let guard = 0; url && guard < 10; guard++) {
    const j = await mfetch(url, {}, interactive);
    (j.value || []).forEach((e) => { if (!e.isCancelled && e.showAs !== 'free' && e.showAs !== 'workingElsewhere') out.push([utc(e.start.dateTime), utc(e.end.dateTime)]); });
    url = j['@odata.nextLink'];
  }
  return out;
}
function outlookCreate(ev, interactive) {
  const t = (ms) => new Date(ms).toISOString().slice(0, 19);
  return mfetch('https://graph.microsoft.com/v1.0/me/events', { method: 'POST',
    body: JSON.stringify({ subject: ev.title, body: { contentType: 'text', content: ev.note || '' },
      start: { dateTime: t(ev.start), timeZone: 'UTC' }, end: { dateTime: t(ev.end), timeZone: 'UTC' },
      sensitivity: 'private', showAs: 'busy', isReminderOn: true }) }, interactive);
}

/* ============================ shared ============================ */
export function mergeBlocks(list) {
  const s = list.filter((b) => b[1] > b[0]).sort((a, b) => a[0] - b[0]), out = [];
  s.forEach((b) => { const last = out[out.length - 1]; if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]); else out.push([b[0], b[1]]); });
  return out;
}

/* connect from a tap. Google: popup. Outlook: leaves to Microsoft and comes back. */
export async function connect(p) {
  if (p === 'google') return googleToken(true);
  return outlookSignIn();
}

/* busy times from every calendar connected on this phone */
export async function fetchMyBusy(from, to, interactive) {
  const blocks = [], sources = [], errors = [];
  for (const p of connectedList()) {
    try { blocks.push(...(p === 'google' ? await googleBusy(from, to, interactive) : await outlookBusy(from, to, interactive))); sources.push(p); }
    catch (e) { errors.push(e); }
  }
  return { blocks: mergeBlocks(blocks), sources, errors };
}

/* private event in one of this phone's calendars */
export function createEvent(p, ev) {
  return p === 'google' ? googleCreate(ev, true) : outlookCreate(ev, true);
}
