/* PALETTE: the color menu (palette icon on the Summary page).
   The list of palettes comes from config.js; the colors are in css/theme.css.
   The choice is saved per phone. */

import { CONFIG } from './config.js';
import { $, qa, esc, store } from './util.js';
import { anim, reduce, EMPH_DEC } from './motion.js';

const KEY = 'gp-palette';
/* swatch colors for the menu (the real colors are in css/theme.css) */
const SWATCH = { midnight: ['#3d52d5', '#9b4de0'], berry: ['#c2185b', '#ff7a59'], matcha: ['#1f8a3b', '#0fa3a0'], sunset: ['#d14a00', '#e8175d'] };
const sw = (p) => SWATCH[p.id] || p.swatch;

export function applyPalette(p) {
  if (!CONFIG.palettes.some((x) => x.id === p)) p = CONFIG.defaultPalette;
  document.documentElement.setAttribute('data-palette', p);
  qa('[data-pal]', $('palMenu')).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-pal') === p)));
}
function toggle(show) {
  const m = $('palMenu');
  m.hidden = !show; $('palBtn').setAttribute('aria-expanded', String(show));
  if (show) anim(m, [{ opacity: 0, transform: 'scale(.9) translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EMPH_DEC });
}

export function initPalette() {
  $('palOpts').innerHTML = CONFIG.palettes.map((p) => '<button type="button" role="menuitemradio" data-pal="' + esc(p.id) + '" class="rp"><span class="sw" style="background:linear-gradient(135deg,' + sw(p)[0] + ',' + sw(p)[1] + ')"></span>' + esc(p.name) + '<span class="ms" aria-hidden="true">check</span></button>').join('');
  applyPalette(store.get(KEY));
  $('palBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle($('palMenu').hidden); });
  $('palMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pal]'); if (!b) return;
    const p = b.getAttribute('data-pal'); toggle(false);
    const set = () => { applyPalette(p); store.set(KEY, p); };
    if (document.startViewTransition && !reduce) document.startViewTransition(set); else set();   // smooth crossfade
  });
  document.addEventListener('click', (e) => { if (!$('palMenu').hidden && !e.target.closest('.bar-actions')) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('palMenu').hidden) { toggle(false); $('palBtn').focus(); } });
}
