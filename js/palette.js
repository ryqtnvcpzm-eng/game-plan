/* COLORS: the accent color, shared by both of you (saved in the board).
   The list of palettes comes from config.js; the colors are in css/theme.css.
   A copy is kept on the device so the right color shows the moment it opens. */

import { CONFIG } from './config.js';
import { store } from './util.js';
import { S } from './state.js';

const KEY = 'gp-palette';
const SWATCH = { midnight: ['#3d52d5', '#9b4de0'], berry: ['#c2185b', '#ff7a59'], matcha: ['#1f8a3b', '#0fa3a0'], sunset: ['#d14a00', '#e8175d'] };
export const PALETTES = (CONFIG.palettes || [{ id: 'midnight', name: 'Midnight' }]).map((p) => ({ id: p.id, name: p.name, swatch: SWATCH[p.id] || p.swatch || ['#888', '#aaa'] }));
const DEFAULT = CONFIG.defaultPalette || 'midnight';

export function currentPalette() { return document.documentElement.getAttribute('data-palette') || DEFAULT; }
export function applyPalette(p) {
  if (!PALETTES.some((x) => x.id === p)) p = DEFAULT;
  document.documentElement.setAttribute('data-palette', p);
  store.set(KEY, p);
}
/* pick a color for both of you; call commit() afterwards to save it */
export function choosePalette(p, commit) {
  const set = () => applyPalette(p);
  if (document.startViewTransition && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) document.startViewTransition(set); else set();
  if (S.data && S.data.palette !== p) { S.data.palette = p; commit(); }
}
export function initPalette() { applyPalette(store.get(KEY) || DEFAULT); }
