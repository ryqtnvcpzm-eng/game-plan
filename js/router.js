/* ROUTER: every page has its own address, so the back button, the home logo
   and links all work like a normal website.
     #/            Home
     #/lists       All lists
     #/list/<id>   One list (also #/list/_all and #/list/_flagged)
     #/plan        Plan
     #/memories    Memories
     #/settings    Settings
   Each page remembers where you had scrolled to. */

const NAMES = ['home', 'lists', 'list', 'plan', 'memories', 'settings'];
const scrollMemory = {};
let handler = null, current = null;

export function parse(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  if (!name) return { name: 'home', id: null };
  if (NAMES.indexOf(name) < 0) return { name: 'home', id: null };
  return { name, id: id ? decodeURIComponent(id) : null };
}
export const pathOf = (r) => '#/' + (r.name === 'home' ? '' : r.name + (r.id ? '/' + encodeURIComponent(r.id) : ''));

export function go(path, replace) {
  if (location.hash === path || (path === '#/' && (location.hash === '' || location.hash === '#'))) { fire(); return; }
  if (replace) { history.replaceState(null, '', location.pathname + location.search + path); fire(); }
  else location.hash = path;
}
export function back(fallback) {
  if (history.length > 1 && document.referrer !== undefined && current && current.name !== 'home') history.back();
  else go(fallback || '#/');
}

function fire() {
  const r = parse(location.hash);
  if (current) scrollMemory[pathOf(current)] = window.scrollY;
  const prev = current;
  current = r;
  if (handler) handler(r, prev, scrollMemory[pathOf(r)] || 0);
}
export function startRouter(fn) {
  handler = fn;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', fire);
  fire();
}
export const routeNow = () => current || parse(location.hash);
