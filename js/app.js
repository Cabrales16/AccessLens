// Arranque: datos sintéticos, base en el navegador, sesión, enrutador por hash y estructura de la interfaz.
import { SEED, ROLE_LABELS, DEMO_USERS, DEMO_PASSWORD } from './config.js';
import { buildSources, utcToday } from './seed.js';
import { extractAll, SYSTEM_KEYS } from './connectors.js';
import { audit, defaultParams } from './rules.js';
import { createStore } from './store.js';
import { exposure } from './domain.js';
import { h, mount, int, day } from './ui/dom.js';
import { BRAND_MARK } from './ui/icons.js';
import { ic, field, toast } from './ui/kit.js';
import { views, TITLES, expRow } from './views.js';

const SESSION_KEY = 'accesslens-session';
const today = utcToday();
const sources = buildSources(SEED, today);
const store = createStore(localStorage);
const cache = new Map();

const PERMS = { run: ['admin', 'auditor'], review: ['admin', 'auditor'], users: ['admin'] };
const S = {
  store, sources, roster: sources.roster, today, user: null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  can: (a) => !!S.user && PERMS[a].includes(S.user.role),
  go: (hash) => { if (location.hash === hash) render(); else location.hash = hash; },
  rerender: () => render(),
  runNo: (run) => store.runHistory().length - store.runHistory().findIndex((r) => r.id === run.id),
  resultFor(run) {
    if (!cache.has(run.id)) cache.set(run.id, audit(extractAll(run.systems, sources), sources.roster, run.params, today));
    return cache.get(run.id);
  },
  current() { const run = store.lastRun(); return run ? { run, result: S.resultFor(run) } : null; },
  async runAudit(keys, overrides, onStep = async () => {}) {
    const params = { ...defaultParams(), ...overrides };
    await onStep(0); await onStep(1);
    const accounts = extractAll(keys, sources);
    await onStep(2); await onStep(3);
    const result = audit(accounts, sources.roster, params, today);
    await onStep(4);
    const id = store.registerRun(S.user ? S.user.id : null, S.user ? S.user.username : 'sistema', keys, params, result);
    cache.set(id, result);
    return id;
  },
};

const root = document.getElementById('root');
const NAV = [['panel', 'Panel', 'panel'], ['auditoria', 'Auditoría', 'audit'], ['hallazgos', 'Hallazgos', 'findings'], ['historial', 'Historial', 'history']];

// ---------------------------------------------------------------- inicio de sesión
function loginView() {
  document.title = 'Iniciar sesión · AccessLens';
  const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const msg = h('div', { class: 'msg', role: 'alert' });
  const form = h('form', { class: 'form-grid', style: 'max-width:none' }, field('Usuario', user), field('Contraseña', pass), msg, h('button', { class: 'btn primary', type: 'submit', style: 'height:40px' }, 'Entrar'));
  const enter = async (u, p) => {
    msg.className = 'msg'; msg.textContent = '';
    const found = await store.authenticate(u, p);
    if (!found) { msg.className = 'msg err'; msg.textContent = 'Usuario o contraseña incorrectos.'; return; }
    sessionStorage.setItem(SESSION_KEY, String(found.id));
    S.user = found;
    location.hash = '#/panel';
    boot();
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); enter(user.value, pass.value); });

  const cur = S.current();
  const exp = cur ? exposure(cur.result, S.roster, today).slice(0, 3) : [];
  const maxDays = Math.max(1, ...exp.map((r) => r.days));
  return h('div', { class: 'login' },
    h('aside', { class: 'side' },
      h('div', { class: 'brandline', html: `${BRAND_MARK}<span>AccessLens</span>` }),
      h('h2', {}, 'Quién sigue con acceso y ya no debería.'),
      h('p', {}, 'Cruza las cuentas de varios sistemas con la nómina y deja a la vista lo que requiere atención, de lo más grave a lo menos.'),
      exp.length ? h('div', { class: 'preview', 'aria-hidden': 'true' }, exp.map((r) => expRow(r, maxDays, false))) : null),
    h('main', { class: 'main' }, h('div', { class: 'card' },
      h('div', { class: 'brandline mobile-only', html: `${BRAND_MARK}<span>AccessLens</span>` }),
      h('div', {}, h('h1', {}, 'Iniciar sesión'), h('p', { class: 'hint', style: 'margin-top:6px' }, 'Proyecto de demostración con datos 100 % ficticios.')),
      form,
      h('div', { class: 'quick' }, h('span', { class: 'hint' }, `Entrada rápida (contraseña ${DEMO_PASSWORD})`),
        DEMO_USERS.map(([u, n, r]) => h('button', { type: 'button', onclick: () => enter(u, DEMO_PASSWORD) }, h('span', {}, h('b', { style: 'font-weight:500' }, n)), h('small', {}, `${u}`), h('span', { class: 'role' }, ROLE_LABELS[r])))))));
}

// ---------------------------------------------------------------- estructura con riel
function shell() {
  const view = h('main', { class: 'wrap', id: 'view', tabindex: '-1' });
  const navBtn = (key, label, icon) => h('a', { class: 'ni', href: `#/${key}`, 'data-key': key, 'data-tip': label, 'aria-label': label }, ic(icon, 20), h('span', { class: 'lbl' }, label));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Más opciones' });
  const sheetItems = [S.can('users') && ['usuarios', 'Usuarios', 'users'], ['cuenta', 'Mi cuenta', 'account'], ['info', 'Información', 'info']].filter(Boolean);
  const closeSheet = () => sheet.classList.remove('open');
  sheet.append(h('button', { class: 'link-btn', onclick: closeSheet, style: 'display:flex;align-items:center;gap:6px' }, ic('x', 16), 'Cerrar'), h('h2', {}, S.user.full_name || S.user.username),
    h('div', { class: 'list' }, sheetItems.map(([k, l, i]) => h('button', { onclick: () => { closeSheet(); S.go(`#/${k}`); } }, ic(i, 18), l)),
      h('button', { onclick: logout }, ic('logout', 18), 'Cerrar sesión')));
  const rail = h('nav', { class: 'rail', 'aria-label': 'Principal' },
    h('div', { class: 'brand', html: BRAND_MARK, title: 'AccessLens' }),
    h('nav', {}, NAV.map(([k, l, i]) => navBtn(k, l, i)),
      h('button', { class: 'ni more', 'data-tip': 'Más', 'aria-label': 'Más opciones', onclick: () => sheet.classList.add('open') }, ic('menu', 20), h('span', { class: 'lbl' }, 'Más'))),
    h('div', { class: 'group' }, S.can('users') && navBtn('usuarios', 'Usuarios', 'users'), navBtn('cuenta', 'Mi cuenta', 'account'), navBtn('info', 'Información', 'info'),
      h('button', { class: 'ni', 'data-tip': 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: logout }, ic('logout', 20))));
  return h('div', { class: 'app' }, rail, h('div', { class: 'canvas' }, view), sheet);
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  S.user = null;
  location.hash = '';
  boot();
}

function render() {
  const view = document.getElementById('view');
  if (!view) return;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  const key = views[name] ? name : 'panel';
  document.querySelectorAll('.rail .ni[data-key]').forEach((a) => {
    const on = a.dataset.key === key;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try { mount(view, views[key](S, new URLSearchParams(query), id)); }
  catch (err) { console.error(err); mount(view, h('div', { class: 'panel' }, h('h2', {}, 'Algo salió mal al mostrar esta vista'), h('p', { class: 'dim', style: 'margin-top:8px' }, err.message))); }
  document.title = `${TITLES[key]} · AccessLens`;
  window.scrollTo(0, 0);
}

async function boot() {
  await store.ensureDemoUsers();
  if (!store.lastRun()) await S.runAudit(SYSTEM_KEYS, {});
  const id = Number(sessionStorage.getItem(SESSION_KEY));
  S.user = id ? store.getUser(id) : null;
  if (!S.user) { mount(root, loginView()); return; }
  mount(root, shell());
  if (!location.hash) location.hash = '#/panel'; else render();
}

addEventListener('hashchange', () => { if (S.user) render(); });
boot();
