/* SETTINGS: who's using this device, PIN, both names, the shared color,
   the board link, calendars, and a little about. Grouped like iOS Settings. */

import { CONFIG } from './config.js';
import { $, esc, clean, initial, store } from './util.js';
import { S } from './state.js';
import * as cal from './calendar.js';
import { toast } from './dialogs.js';
import { commit } from './actions.js';
import { render, syncState } from './render.js';
import { PALETTES, currentPalette, choosePalette } from './palette.js';
import { openWho, changePin } from './people.js';
import { syncMine, ago, planError, isSyncing } from './planner.js';
import { shareLink, switchBoard } from './main.js';
import { put } from './rows.js';

const row = ({ ic, bg, label, sub, value, chev, act, cls, tag }) =>
  '<' + (tag || 'button') + ' type="button" class="set-row' + (cls ? ' ' + cls : '') + '"' + (act ? ' data-act="' + act + '"' : '') + '>'
  + (ic ? '<span class="set-ic" style="background:' + (bg || 'var(--accent)') + '"><span class="ms fill" aria-hidden="true">' + ic + '</span></span>' : '')
  + '<span class="set-main"><span class="set-label">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>'
  + (value ? '<span class="set-value">' + value + '</span>' : '') + (chev ? '<span class="ms chev" aria-hidden="true">chevron_right</span>' : '') + '</span></' + (tag || 'button') + '>';
const section = (title, inner, foot) => '<section class="set-section">' + (title ? '<h3>' + title + '</h3>' : '') + '<div class="set-group">' + inner + '</div>' + (foot ? '<p class="set-foot">' + foot + '</p>' : '') + '</section>';

export function renderSettings() {
  const d = S.data, me = S.me, names = d.people;
  const hasPin = me !== null && d.pins && d.pins[me];
  let html = '';

  html += section('This device',
    row({ ic: 'person', label: me !== null ? 'Using as ' + esc(names[me]) : 'Who’s using this device?', value: me !== null ? '' : 'Choose', chev: true, act: 'who' })
    + (me !== null ? row({ ic: 'lock', bg: 'var(--text-2)', label: hasPin ? 'Change PIN' : 'Set a PIN', chev: true, act: 'pin' }) : ''),
    'Each of you has a PIN, so nobody can rate as the other by accident.');

  html += section('Names',
    [0, 1].map((i) => '<label class="set-row"><span class="set-ic" style="background:var(--grad)"><span style="font-weight:700;font-size:14px">' + esc(initial(names[i])) + '</span></span><span class="set-main"><span class="set-label">' + (i === 0 ? 'First person' : 'Second person') + '</span><input class="set-input" data-name="' + i + '" maxlength="16" value="' + esc(names[i]) + '" enterkeyhint="done"></span></label>').join(''));

  html += section('Color',
    '<div class="swatches" role="radiogroup" aria-label="Color">' + PALETTES.map((p) => '<button type="button" class="swatch" role="radio" data-pal="' + esc(p.id) + '" aria-checked="' + (currentPalette() === p.id) + '" aria-label="' + esc(p.name) + '" style="background:linear-gradient(135deg,' + p.swatch[0] + ',' + p.swatch[1] + ')"><span class="ms" aria-hidden="true">check</span></button>').join('') + '</div>',
    'The color changes for both of you.');

  if (S.mode === 'cloud') {
    const st = syncState();
    html += section('Shared board',
      row({ ic: 'ios_share', bg: 'var(--green)', label: 'Share the link', sub: 'Send it to ' + esc(names[me === null ? 1 : me === 0 ? 1 : 0]) + ' to open the same board', chev: true, act: 'share' })
      + row({ ic: 'link', bg: 'var(--text-2)', label: 'Open a different board link', chev: true, act: 'switch' })
      + row({ ic: st.icon || 'cloud', bg: st.warn ? 'var(--orange)' : 'var(--accent)', label: 'Status', value: st.text, tag: 'div' }),
      'Anyone with the link can open this board, so keep it between the two of you.');
  } else {
    html += section('Shared board', row({ ic: 'cloud_off', bg: 'var(--orange)', label: 'Not connected', sub: 'Add your Firebase keys to js/config.js to sync between devices', tag: 'div' }));
  }

  const provs = Object.keys(cal.PROVIDERS).filter(cal.configured);
  if (provs.length) {
    const b = d.busy;
    html += section('Calendars',
      provs.map((p) => cal.connected(p)
        ? row({ ic: 'calendar_month', bg: 'var(--accent)', label: cal.PROVIDERS[p].name, sub: 'Connected on this device', value: 'Disconnect', act: 'disc-' + p })
        : row({ ic: 'calendar_add_on', bg: 'var(--text-2)', label: 'Connect ' + cal.PROVIDERS[p].name, chev: true, act: 'conn-' + p, cls: 'accent' })).join('')
      + (cal.connectedList().length ? row({ ic: isSyncing() ? 'sync' : 'refresh', bg: 'var(--green)', label: isSyncing() ? 'Refreshing…' : 'Refresh my free/busy times', act: 'refresh' }) : '')
      + [0, 1].map((i) => row({ ic: 'schedule', bg: b[i] ? 'var(--green)' : 'var(--fill)', label: esc(names[i]), value: b[i] ? 'Updated ' + ago(b[i].at) : 'Not connected', tag: 'div' })).join(''),
      (planError() ? '<span style="color:var(--red)">' + esc(planError()) + '</span><br>' : '') + 'Only busy and free times are shared, never what your events are.');
  }

  html += section('About',
    row({ ic: 'info', bg: 'var(--text-2)', label: esc(CONFIG.appName || 'The Game Plan'), value: 'Version ' + esc(window.VERSION || ''), tag: 'div' }),
    'Photos from Pexels.');

  put($('settingsBody'), html);
}

function saveName(input) {
  const i = +input.dataset.name, v = clean(input.value);
  if (!v) { input.value = S.data.people[i]; return; }
  if (v === S.data.people[i]) return;
  S.data.people[i] = v; commit(); toast('Name saved');
}

export function initSettings() {
  const body = $('settingsBody');
  body.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-pal]');
    if (sw) { choosePalette(sw.dataset.pal, commit); renderSettings(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'who') openWho();
    else if (act === 'pin') changePin();
    else if (act === 'share') {
      const url = shareLink();
      if (navigator.share) { try { await navigator.share({ title: CONFIG.appName, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (err) { window.prompt('Copy this link:', url); }
    }
    else if (act === 'switch') switchBoard();
    else if (act === 'refresh') syncMine(true);
    else if (act.indexOf('conn-') === 0) {
      const p = act.slice(5);
      if (S.me === null) { openWho(); return; }
      store.set('gp-return', '#/settings');
      try { await cal.connect(p); toast(cal.PROVIDERS[p].name + ' connected'); await syncMine(true); }
      catch (err) { if (err.message !== 'cancelled') toast(err.message); }
      render();
    }
    else if (act.indexOf('disc-') === 0) {
      const p = act.slice(5);
      cal.disconnect(p);
      if (!cal.connectedList().length && S.me !== null) { S.data.busy[S.me] = null; commit(); } else syncMine(false);
      toast(cal.PROVIDERS[p].name + ' disconnected');
      render();
    }
  });
  body.addEventListener('change', (e) => { if (e.target.matches('[data-name]')) saveName(e.target); });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-name]')) { e.preventDefault(); e.target.blur(); } });
}
