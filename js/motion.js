/* MOTION: small, purposeful animations. Everything is skipped when the
   device has "reduce motion" on. Nothing here runs while you scroll. */

import { $, qa } from './util.js';

export const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const EASE = 'cubic-bezier(.32,.72,0,1)';      // Apple-like settle
export const EASE_OUT = 'cubic-bezier(.3,0,.8,.15)';  // things leaving
export const M = { painted: false };

export function anim(el, k, o) {
  if (reduce || !el || !el.animate) return null;
  try { return el.animate(k, o); } catch (e) { return null; }
}

/* numbers that change roll into place */
export function setNum(el, v) {
  if (!el) return;
  const s = String(v); el._cu = null;
  if (el.textContent === s) return;
  el.textContent = s;
  if (M.painted && el.offsetParent) anim(el, [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EASE });
}
export function countUp(el, to, dur) {
  if (reduce || !el || !to || isNaN(to)) return;
  const tok = {}, t0 = performance.now(); el._cu = tok; el.textContent = '0';
  (function f(t) {
    if (el._cu !== tok) return;
    const q = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - q, 3);
    el.textContent = Math.round(to * e);
    if (q < 1) requestAnimationFrame(f); else el._cu = null;
  })(t0);
}

/* rows glide to their new place after a change (only rows on screen, only a few) */
export function snap(root) {
  const m = {};
  if (reduce) return m;
  qa('.row[data-id]', root).slice(0, 60).forEach((li) => { const r = li.getBoundingClientRect(); if (r.height && r.bottom > 0 && r.top < innerHeight) m[li.dataset.id] = r.top; });
  return m;
}
export function flip(before, root) {
  if (reduce) return;
  qa('.row[data-id]', root).slice(0, 60).forEach((li) => {
    const id = li.dataset.id, r = li.getBoundingClientRect();
    if (!r.height || r.bottom < 0 || r.top > innerHeight) return;
    if (id in before) {
      const dy = before[id] - r.top;
      if (Math.abs(dy) > 1) anim(li, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: EASE });
    } else anim(li, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
  });
}

/* a row folds away, then cb() */
export function collapse(li, cb) {
  if (!li || reduce || !li.animate) { cb(); return; }
  const h = li.offsetHeight;
  li.style.overflow = 'hidden';
  const a = anim(li, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: EASE_OUT, fill: 'forwards' });
  if (a) a.finished.then(cb, cb); else cb();
}

/* a little burst of dots from the checkbox, drawn in a separate layer */
export function burst(fromEl) {
  if (reduce || !fromEl) return;
  const fx = $('fx'), r = fromEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('span');
    d.className = 'spark' + (i % 2 ? ' alt' : '');
    d.style.left = cx + 'px'; d.style.top = cy + 'px';
    fx.appendChild(d);
    const a = i / 10 * Math.PI * 2 + 0.3, dist = i % 2 ? 20 : 28;
    const an = anim(d, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + (Math.cos(a) * dist).toFixed(1) + 'px,' + (Math.sin(a) * dist).toFixed(1) + 'px) scale(0)', opacity: 0 }], { duration: 520, easing: EASE, fill: 'forwards' });
    if (an) an.onfinish = () => d.remove(); else d.remove();
  }
}

export function pop(el) { anim(el, [{ transform: 'scale(.75)' }, { transform: 'scale(1.08)', offset: 0.6 }, { transform: 'none' }], { duration: 360, easing: EASE }); }

/* a page arriving */
export function enterView(el) {
  if (reduce || !el) return;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  setTimeout(() => el.classList.remove('enter'), 400);
}
