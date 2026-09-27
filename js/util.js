/* Small helpers used everywhere: DOM lookup, dates, text, storage. */

export const $ = (id) => document.getElementById(id);
export const qa = (sel, root) => [].slice.call((root || document).querySelectorAll(sel));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function clean(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
export function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
export function initial(n) { return (clean(n).charAt(0) || '?').toUpperCase(); }
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function randomKey(len = 24) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += abc[buf[i] % abc.length];
  return out;
}

/* dates are stored as "YYYY-MM-DD" in the phone's local time */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const parts = (iso) => iso.split('-').map(Number);
const dayIndex = (iso) => { const p = parts(iso); return Date.UTC(p[0], p[1] - 1, p[2]) / 864e5; };

export function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function daysBetween(a, b) { return Math.round(dayIndex(b) - dayIndex(a)); }
export function fmt(iso, year) { const p = parts(iso); return MONTHS[p[1] - 1] + ' ' + p[2] + (year ? ', ' + p[0] : ''); }
export function weekday(iso) { const p = parts(iso); return DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; }

/* localStorage that never throws */
export const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
