/* MOTION: every animation lives here (Material easing curves).
   Turned off automatically when the phone has "reduce motion" on. */

import { $, qa } from './util.js';

export const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const EMPH_DEC = 'cubic-bezier(.05,.7,.1,1)';   // things arriving
export const EMPH_ACC = 'cubic-bezier(.3,0,.8,.15)';   // things leaving
export const STD = 'cubic-bezier(.2,0,0,1)';
export const M = { painted: false };                   // true after the first render

export function anim(el, k, o) {
  if (reduce || !el || !el.animate) return null;
  try { return el.animate(k, o); } catch (e) { return null; }
}

/* numbers that change roll up into place */
export function setNum(el, v) {
  const s = String(v); el._cu = null;
  if (el.textContent === s) return;
  el.textContent = s;
  if (M.painted && el.offsetParent) anim(el, [{ transform: 'translateY(45%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: EMPH_DEC });
}
export function countUp(el, to, dur) {
  if (reduce || !to) return;
  const tok = {}, t0 = performance.now(); el._cu = tok; el.textContent = '0';
  (function f(t) {
    if (el._cu !== tok) return;
    const q = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - q, 3);
    el.textContent = Math.round(to * e);
    if (q < 1) requestAnimationFrame(f); else el._cu = null;
  })(t0);
}

/* FLIP: remember where rows were, then slide them to where they are now */
export function snap() {
  const m = {};
  qa('.item[data-id]').forEach((li) => { const r = li.getBoundingClientRect(); if (r.height) m[li.getAttribute('data-id')] = r.top; });
  return m;
}
export function flip(before) {
  if (reduce) return;
  qa('.item[data-id]').forEach((li) => {
    const id = li.getAttribute('data-id'), r = li.getBoundingClientRect();
    if (!r.height) return;
    if (id in before) {
      const dy = before[id] - r.top;
      if (Math.abs(dy) > 1) anim(li, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 520, easing: EMPH_DEC });
    } else anim(li, [{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EMPH_DEC });
  });
}

/* a row folding away, then cb() */
export function collapse(li, dx, cb) {
  const h = li ? li.offsetHeight : 0;
  const a = h ? anim(li, [{ height: h + 'px', minHeight: h + 'px', opacity: 1, transform: 'none' },
    { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, transform: dx ? 'translateX(' + dx + 'px)' : 'scale(.94)' }],
    { duration: 300, easing: EMPH_ACC, fill: 'forwards' }) : null;
  if (a) { li.style.overflow = 'hidden'; a.finished.then(cb, cb); } else cb();
}

/* little burst of dots when something is crossed off */
export function burst(li, btn) {
  if (reduce) return;
  const lr = li.getBoundingClientRect(), cr = btn.getBoundingClientRect();
  const cx = cr.left - lr.left + cr.width / 2, cy = cr.top - lr.top + cr.height / 2;
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('span'); d.className = 'spark' + (i % 2 ? ' alt' : '');
    d.style.left = (cx - 3) + 'px'; d.style.top = (cy - 3) + 'px';
    li.appendChild(d);
    const a = i / 10 * Math.PI * 2 + 0.3, r = i % 2 ? 20 : 28;
    const an = anim(d, [{ transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + (Math.cos(a) * r).toFixed(1) + 'px,' + (Math.sin(a) * r).toFixed(1) + 'px) scale(0)', opacity: 0 }],
      { duration: 560, easing: EMPH_DEC, fill: 'forwards' });
    if (an) an.onfinish = () => d.remove(); else d.remove();
  }
}

export function pop(el) { anim(el, [{ transform: 'scale(.7)', opacity: 0.3 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: STD }); }
export function slideIn(el, dx) { anim(el, [{ opacity: 0, transform: 'translateX(' + dx + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EMPH_DEC }); }
export function fadeThrough(el) { anim(el, [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EMPH_DEC }); }

/* Material ripple on anything with class "rp" */
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.rp'); if (!t || reduce) return;
    const r = t.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const sp = document.createElement('span'); sp.className = 'ripple';
    sp.style.width = sp.style.height = s + 'px';
    sp.style.left = (e.clientX - r.left - s / 2) + 'px'; sp.style.top = (e.clientY - r.top - s / 2) + 'px';
    t.appendChild(sp);
    sp.addEventListener('animationend', () => sp.remove());
  });
}

/* first open of the session: things rise in one after another */
export function entrance(page) {
  if (reduce) return;
  const pg = $(page === 'summary' ? 'pgSummary' : page === 'lists' ? 'pgLists' : 'pgPlan');
  let els = qa(':scope > *', pg).slice(0, 7);
  els = els.concat(page === 'lists' ? qa('#openList > li').slice(0, 8) : qa('#cats > *'));
  els.forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: i * 45, easing: EMPH_DEC, fill: 'backwards' }));
  anim($('fab'), [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 380, easing: EMPH_DEC, fill: 'backwards' });
  anim(document.querySelector('.nav'), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 550, easing: EMPH_DEC });
  if (page === 'summary') {
    ['dayNum', 'toGo', 'doneAll'].forEach((k) => { const el = $(k); countUp(el, +el.textContent, 1000); });
    const rv = $('ringVal'), off = rv.style.strokeDashoffset;
    rv.style.strokeDashoffset = 263.9; rv.getBoundingClientRect();
    setTimeout(() => { rv.style.strokeDashoffset = off; }, 250);
  }
}
