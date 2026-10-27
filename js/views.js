// Vistas de la aplicación. Cada una recibe el contexto S (store, datos, sesión) y devuelve un nodo.
import { h, int, pct, day, stamp, plural, ago, download } from './ui/dom.js';
import { ic, sevPill, stateEl, SYS_SHORT, SEV, field, modal, toast, emptyState } from './ui/kit.js';
import { RULES, SEVERITY_ORDER, findingKey } from './rules.js';
import { SYSTEMS, SYSTEM_KEYS } from './connectors.js';
import { exposure, headline, reviewCounts, diffRuns, personDetail, filterFindings, reviewStatus, STATUS_LABELS } from './domain.js';
import { ROLES, ROLE_LABELS, DEMO_PASSWORD, DEMO_USERS, CORPORATE_DOMAIN, DORMANT_DAYS } from './config.js';
import { buildReport } from './report.js';

const PAGE = 50;
const link = (href, ...c) => h('a', { href }, ...c);
const titleRow = (title, sub, actions, crumb) => h('div', {},
  crumb, h('div', { class: 'title-row' }, h('div', {}, h('h1', {}, title), sub && h('p', { class: 'sub' }, sub)), actions && h('div', { class: 'actions' }, actions)));
const crumbTo = (href, label) => h('div', { class: 'crumb' }, ic('back', 14), link(href, label));

function downloadExcel(S, cur) {
  const bytes = buildReport({ findings: cur.result.findings, accounts: cur.result.accounts.filter((a) => a.clean && a.active), summary: cur.result.summary,
    generatedBy: S.user.username, reviews: S.store.getReviews() });
  download(bytes, `accesslens-auditoria-${cur.run.id}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  S.store.logEvent('reporte_descargado', `Excel de la auditoría #${cur.run.id}`, S.user.username, S.user.id);
  toast('Excel generado.');
}

const noRun = (S) => emptyState('Todavía no hay auditorías', 'Ejecuta la primera para ver las cuentas que requieren atención.',
  S.can('run') ? h('a', { class: 'btn primary', href: '#/auditoria' }, ic('play', 14), 'Ejecutar auditoría') : null);

function expRow(r, max, link_ = true) {
  const body = [
    h('div', { class: 'exp-who' }, h('b', {}, h('span', { class: 't' }, r.full_name), r.admin && h('span', { class: 'pill sev-alta' }, 'Admin')),
      h('small', {}, `${r.department} · ${r.job_title} · salió el ${day(r.termination_date)}`)),
    h('div', { class: 'sys-tags', 'aria-label': 'Sistemas con cuenta activa' }, SYSTEM_KEYS.map((k) => h('span', { class: `sys-tag${r.systems[k] ? ' on' : ''}` }, SYS_SHORT[k]))),
    h('div', { class: 'days' }, h('div', { class: 'track' }, h('i', { style: `--w:${Math.max(4, Math.round((r.days / max) * 100))}%` })),
      h('span', { class: 'v' }, int(r.days), h('small', {}, ' d'))),
    ic('chevron', 14),
  ];
  return link_ ? h('a', { class: 'exp-row', href: `#/persona/${r.employee_id}` }, ...body) : h('div', { class: 'exp-row' }, ...body);
}
export { expRow };

// ---------------------------------------------------------------- panel
function panel(S) {
  const cur = S.current();
  if (!cur) return noRun(S);
  const { run, result } = cur;
  const s = result.summary;
  const exp = exposure(result, S.roster, S.today);
  const rc = reviewCounts(result.findings, S.store.getReviews());
  const reviewed = rc.revisado + rc.riesgo;
  const maxDays = Math.max(1, ...exp.map((r) => r.days));
  const prev = run.prev_run_id ? S.store.runFindings(run.prev_run_id) : null;
  const diff = prev ? diffRuns(result.findings, prev) : null;

  const kpi = (label, value, extra) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value num' }, ...value), extra && h('div', { class: 'delta' }, extra));
  const kpis = h('div', { class: 'kpis' },
    kpi('Cuentas activas', [int(s.accounts_active), h('small', {}, ` de ${int(s.accounts_total)}`)], `${plural(SYSTEM_KEYS.length, 'sistema', 'sistemas')} auditados`),
    kpi('Hallazgos', [int(s.findings_total)], diff ? h('span', {}, `${int(diff.added.length)} nuevos · ${int(diff.resolved.length)} resueltos`) : 'Primera auditoría'),
    kpi('Críticos', [h('span', { style: s['sev_crítica'] ? 'color:var(--negative)' : '' }, int(s['sev_crítica']))], 'Retirados con acceso'),
    kpi('Cuentas sin hallazgos', [pct(s.accounts_active ? s.accounts_clean / s.accounts_active : 0, 0)], `${int(s.accounts_clean)} de ${int(s.accounts_active)} activas`),
    kpi('Revisados', [int(reviewed), h('small', {}, ` de ${int(s.findings_total)}`)], `${int(rc.riesgo)} con riesgo aceptado`));

  const ruleMax = Math.max(1, ...Object.values(s.by_rule));
  const rules = h('div', { class: 'bars-list' }, Object.keys(RULES).map((id) => {
    const n = s.by_rule[id] || 0;
    return h('a', { class: `bar-row${id === 'R01' ? ' lead' : ''}`, href: `#/hallazgos?rule=${id}` },
      h('span', { class: 'name' }, h('span', { class: 'dim num' }, `${id}  `), RULES[id][0]), h('span', { class: 'v num' }, int(n)),
      h('div', { class: 'track' }, h('i', { style: `--w:${Math.round((n / ruleMax) * 100)}%` })));
  }));

  const sevColor = { 'crítica': 'var(--negative)', alta: 'var(--warning)', media: 'var(--chart-2)', baja: 'var(--chart-muted)' };
  const total = Math.max(1, s.findings_total);
  const split = h('div', { class: 'split', role: 'img', 'aria-label': 'Hallazgos por severidad' }, SEVERITY_ORDER.map((k) => h('i', { style: `--c:${sevColor[k]};--w:${(s[`sev_${k}`] / total) * 100}%` })));
  const legend = h('div', { class: 'legend' }, SEVERITY_ORDER.map((k) => h('div', {}, h('b', { style: `--c:${sevColor[k]}` }), h('span', {}, SEV[k][1]), h('span', { class: 'v num' }, int(s[`sev_${k}`])))));
  const bySys = h('div', { class: 'legend', style: 'margin-top:18px;padding-top:16px;border-top:1px solid var(--rule)' }, SYSTEM_KEYS.map((k) =>
    h('div', {}, h('b', { style: '--c:var(--faint)' }), h('span', {}, SYSTEMS[k].label), h('span', { class: 'v num' }, int((s.by_system || {})[k] || 0)))));

  const changeRow = (f, sign) => h('a', { class: 'row', href: f.employee_id ? `#/persona/${f.employee_id}` : `#/hallazgos?q=${encodeURIComponent(f.login)}`, style: 'color:inherit' },
    h('span', { class: 'num', style: `width:14px;color:${sign === '+' ? 'var(--negative)' : 'var(--positive)'}` }, sign === '+' ? '+' : '−'),
    sevPill(f.severity), h('span', { class: 'truncate', style: 'flex:1' }, h('b', { style: 'font-weight:500' }, f.login), h('span', { class: 'dim' }, `  ${f.rule_id} · ${SYS_SHORT[f.system]}`)));
  const changes = !diff ? h('p', { class: 'dim' }, 'Es la primera auditoría. Las siguientes mostrarán qué cuentas aparecieron o se resolvieron.')
    : (diff.added.length + diff.resolved.length === 0)
      ? h('p', { class: 'dim' }, 'Sin cambios frente a la auditoría anterior. Prueba con otro umbral de inactividad para ver cómo se mueven los resultados.')
      : h('div', {}, diff.added.slice(0, 4).map((f) => changeRow(f, '+')), diff.resolved.slice(0, 4).map((f) => changeRow(f, '-')),
        (diff.added.length > 4 || diff.resolved.length > 4) && h('p', { class: 'stack-note' }, `Y ${int(Math.max(0, diff.added.length - 4) + Math.max(0, diff.resolved.length - 4))} cambios más.`));

  return h('div', {},
    titleRow('Panel', h('span', {}, h('strong', {}, headline(exp)), ` Auditoría n.º ${S.runNo(run)}, ${ago(new Date(run.at))}, por ${run.username}.`),
      [S.can('run') && h('a', { class: 'btn', href: '#/auditoria' }, ic('play', 14), 'Nueva auditoría'),
        h('button', { class: 'btn primary', onclick: () => downloadExcel(S, cur) }, ic('download', 14), 'Descargar Excel')]),
    kpis,
    h('div', { class: 'grid' },
      h('section', { class: 's-8 panel' }, h('header', {}, h('h2', {}, 'Personas retiradas con acceso activo'), h('span', { class: 'meta' }, plural(exp.length, 'persona', 'personas'))),
        exp.length ? h('div', { class: 'exp' }, h('div', { class: 'exp-head' }, h('span', {}, 'Persona'), h('span', {}, 'Sistemas abiertos'), h('span', {}, 'Días desde su salida'), h('span')),
          exp.slice(0, 7).map((r) => expRow(r, maxDays))) : h('p', { class: 'dim' }, 'Nadie que ya salió conserva cuentas activas.'),
        exp.length > 7 && h('p', { class: 'stack-note' }, link('#/hallazgos?rule=R01', `Ver las ${int(exp.length)} personas en la lista de hallazgos`))),
      h('section', { class: 's-4 panel' }, h('header', {}, h('h2', {}, 'Hallazgos por regla')), rules),
      h('section', { class: 's-5 panel' }, h('header', {}, h('h2', {}, 'Severidad y sistemas')), split, legend, bySys),
      h('section', { class: 's-7 panel' }, h('header', {}, h('h2', {}, 'Qué cambió desde la auditoría anterior'), h('span', { class: 'meta' }, run.prev_run_id ? `frente a la anterior` : '')), changes)));
}

// ---------------------------------------------------------------- auditoría
function auditoria(S) {
  const checks = SYSTEM_KEYS.map((k) => h('input', { type: 'checkbox', class: 'switch', id: `sys-${k}`, checked: true, 'aria-label': SYSTEMS[k].label }));
  const days = h('select', { class: 'input', id: 'dormant' }, [60, 90, 120, 180].map((n) => h('option', { value: n, selected: n === DORMANT_DAYS }, `${n} días`)));
  const stepsBox = h('div', { class: 'steps', 'aria-live': 'polite' });
  const run = h('button', { class: 'btn primary', disabled: !S.can('run') }, ic('play', 14), 'Ejecutar auditoría');
  const msg = h('div', { class: 'msg' });
  const can = S.can('run');

  run.addEventListener('click', async () => {
    const keys = SYSTEM_KEYS.filter((k, i) => checks[i].checked);
    if (!keys.length) { msg.className = 'msg err'; msg.textContent = 'Elige al menos un sistema.'; return; }
    msg.textContent = ''; run.disabled = true; stepsBox.replaceChildren();
    const names = ['Conectando con las fuentes', 'Extrayendo cuentas', 'Normalizando esquemas', 'Cruzando con la nómina', 'Aplicando las 8 reglas'];
    const rows = names.map((n) => h('div', { class: 'step' }, ic('check', 14), h('span', {}, n), h('span', { class: 'dim num' }, '')));
    rows.forEach((r) => { r.style.opacity = '.4'; stepsBox.append(r); });
    try {
      const id = await S.runAudit(keys, { dormant_days: Number(days.value) }, async (i) => {
        rows[i].style.opacity = '1'; rows[i].classList.add('run');
        await new Promise((res) => setTimeout(res, S.reduced ? 0 : 420));
        rows[i].classList.remove('run');
      });
      toast(`Auditoría n.º ${S.runNo(S.store.getRun(id))} lista.`);
      S.go('#/panel');
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; run.disabled = false; }
  });

  const sources = h('div', { class: 'src-list' }, SYSTEM_KEYS.map((k, i) => h('div', { class: 'src' },
    h('div', {}, h('b', {}, SYSTEMS[k].label), h('small', {}, SYSTEMS[k].engine)),
    h('span', { class: 'dot' }, `${int(S.sources[k].length)} registros`), checks[i])));

  return h('div', {},
    titleRow('Auditoría', 'Extrae las cuentas de cada sistema, las normaliza a un mismo esquema y las cruza con la nómina de Talento Humano.'),
    h('div', { class: 'grid top' },
      h('section', { class: 's-7 panel' }, h('header', {}, h('h2', {}, 'Fuentes'), h('span', { class: 'meta' }, `Nómina: ${int(S.roster.length)} personas`)), sources,
        h('div', { class: 'stack-note' }, 'Los tres sistemas tienen columnas, fechas y niveles de permiso distintos; los conectores los llevan a un esquema común.')),
      h('section', { class: 's-5 panel' }, h('header', {}, h('h2', {}, 'Parámetros')),
        h('div', { class: 'form-grid' }, field('Se considera inactiva una cuenta sin uso en', days, 'Regla R06. Cambiar el umbral mueve los resultados y alimenta “qué cambió”.'),
          !can && h('p', { class: 'hint' }, `Tu rol (${ROLE_LABELS[S.user.role]}) solo consulta; ejecutar auditorías requiere rol Auditor o Administrador.`),
          h('div', {}, run), msg), stepsBox),
      h('section', { class: 's-12 panel' }, h('header', {}, h('h2', {}, 'Reglas que se aplican')),
        h('div', { class: 'rules2' }, Object.entries(RULES).map(([id, [name, sev]]) =>
          h('div', { class: 'rule-row', style: 'break-inside:avoid' }, h('span', { class: 'id' }, id), h('span', {}, name), sevPill(sev)))))));
}

// ---------------------------------------------------------------- hallazgos
function hallazgos(S, q) {
  const cur = S.current();
  if (!cur) return noRun(S);
  const f = { sev: q.get('sev') || '', sys: q.get('sys') || '', rule: q.get('rule') || '', state: q.get('state') || '', q: q.get('q') || '' };
  let shown = PAGE;
  const reviews = () => S.store.getReviews();
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const countEl = h('span', { class: 'count' });
  const tbody = h('tbody');
  const more = h('div', { class: 'more-row' });
  const wrap = h('div', { class: 'table-wrap' });
  const sync = () => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    history.replaceState(null, '', `#/hallazgos${p.toString() ? `?${p}` : ''}`);
  };
  const setReview = (x, st) => { S.store.setReview(x, st, S.user.username); toast(`${x.login}: ${STATUS_LABELS[st].toLowerCase()}.`); draw(); };

  const draw = () => {
    const base = filterFindings(cur.result.findings, reviews(), { ...f, sev: '' });
    const list = f.sev ? base.filter((x) => x.severity === f.sev) : base;
    tabsEl.replaceChildren(...[['', 'Todos', base.length], ...SEVERITY_ORDER.map((k) => [k, SEV[k][1], base.filter((x) => x.severity === k).length])].map(([k, label, n]) =>
      h('a', { role: 'tab', tabindex: '0', 'aria-selected': String(f.sev === k), onclick: () => { f.sev = k; shown = PAGE; sync(); draw(); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.click(); } }, label, h('span', { class: 'n' }, int(n)))));
    countEl.textContent = plural(list.length, 'hallazgo', 'hallazgos');
    tbody.replaceChildren(...list.slice(0, shown).map((x) => {
      const st = reviewStatus(x, reviews());
      const acts = !S.can('review') ? [] : st === 'pendiente'
        ? [h('button', { class: 'link-btn', onclick: () => setReview(x, 'revisado') }, 'Revisar'), h('button', { class: 'link-btn', onclick: () => setReview(x, 'riesgo') }, 'Aceptar riesgo')]
        : [h('button', { class: 'link-btn', onclick: () => setReview(x, 'pendiente') }, 'Reabrir')];
      return h('tr', {},
        h('td', { 'data-l': 'Severidad' }, sevPill(x.severity)),
        h('td', {}, x.employee_id ? h('a', { class: 'name', href: `#/persona/${x.employee_id}` }, x.login) : h('span', { class: 'name' }, x.login), h('div', { class: 'sub dim' }, x.full_name)),
        h('td', { 'data-l': 'Sistema' }, SYS_SHORT[x.system]),
        h('td', {}, h('span', { class: 'dim num' }, `${x.rule_id}  `), x.rule, h('div', { class: 'sub dim' }, x.detail)),
        h('td', { 'data-l': 'Estado' }, stateEl(st)),
        h('td', { class: 'act' }, ...acts));
    }));
    more.replaceChildren(list.length > shown ? h('button', { class: 'btn', onclick: () => { shown += PAGE; draw(); } }, `Mostrar ${Math.min(PAGE, list.length - shown)} más`) : '');
    wrap.classList.toggle('hidden', !list.length);
    empty.hidden = !!list.length;
  };

  const sel = (key, label, opts) => {
    const el = h('select', { class: 'input', 'aria-label': label }, h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
    el.addEventListener('change', () => { f[key] = el.value; shown = PAGE; sync(); draw(); });
    return el;
  };
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar usuario, nombre o correo', value: f.q, 'aria-label': 'Buscar' });
  search.addEventListener('input', () => { f.q = search.value; shown = PAGE; sync(); draw(); });
  const empty = h('div', { class: 'empty' }, 'Ningún hallazgo coincide con estos filtros.');

  wrap.append(h('table', { class: 'cards' }, h('thead', {}, h('tr', {}, ['Severidad', 'Cuenta', 'Sistema', 'Regla', 'Estado', ''].map((t) => h('th', {}, t)))), tbody));
  const view = h('div', {},
    titleRow('Hallazgos', 'Cada cuenta que incumple una regla, con el motivo. Marca lo que ya revisaste o el riesgo que decides aceptar.',
      h('button', { class: 'btn', onclick: () => downloadExcel(S, cur) }, ic('download', 14), 'Descargar Excel')),
    tabsEl,
    h('div', { class: 'filters row', style: 'flex-wrap:wrap;padding:0;min-height:0' },
      h('div', { class: 'search' }, ic('search', 14), search),
      sel('sys', 'Todos los sistemas', SYSTEM_KEYS.map((k) => [k, SYSTEMS[k].label])),
      sel('rule', 'Todas las reglas', Object.entries(RULES).map(([id, [n]]) => [id, `${id} · ${n}`])),
      sel('state', 'Todos los estados', Object.entries(STATUS_LABELS)), countEl),
    h('section', { class: 'panel', style: 'padding-top:6px' }, wrap, empty, more));
  draw();
  return view;
}

// ---------------------------------------------------------------- persona
function persona(S, _q, id) {
  const cur = S.current();
  if (!cur) return noRun(S);
  const d = personDetail(id, cur.result, S.roster, S.today);
  if (!d) return h('div', {}, crumbTo('#/panel', 'Panel'), emptyState('No encontramos a esa persona', 'El identificador no figura en la nómina.'));
  const { emp } = d;
  const retired = emp.status === 'terminated';
  const kpi = (l, v, x) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, l), h('div', { class: 'kpi-value num' }, ...[].concat(v)), x && h('div', { class: 'delta' }, x));
  const reviews = S.store.getReviews();
  return h('div', {},
    titleRow([emp.full_name, h('span', { class: `pill ${retired ? 'neg' : 'pos'}` }, retired ? 'Retirado' : 'Activo')], `${emp.department} · ${emp.job_title} · ${emp.email}`, null, crumbTo('#/panel', 'Panel')),
    h('div', { class: 'kpis' },
      kpi('Estado en nómina', retired ? 'Retirado' : 'Activo', `Ingreso ${day(emp.hire_date)}`),
      kpi('Salida', retired ? day(emp.termination_date) : '—', retired ? `hace ${int(d.since)} días` : 'Sigue en la empresa'),
      kpi('Cuentas abiertas', int(d.open), `de ${plural(d.accounts.length, 'cuenta', 'cuentas')} halladas`),
      kpi('Hallazgos', int(d.findings.length), `${int(d.findings.filter((f) => reviewStatus(f, reviews) !== 'pendiente').length)} revisados`)),
    h('div', { class: 'grid', style: 'margin-top:var(--gap)' },
      h('section', { class: 's-12 panel' }, h('header', {}, h('h2', {}, 'Cuentas')),
        d.accounts.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'cards' }, h('thead', {}, h('tr', {}, ['Sistema', 'Usuario', 'Rol', 'Estado', 'Último acceso'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.accounts.map((a) => h('tr', {}, h('td', { 'data-l': 'Sistema' }, SYS_SHORT[a.system]), h('td', {}, h('span', { class: 'name' }, a.login)), h('td', { 'data-l': 'Rol' }, a.role),
            h('td', { 'data-l': 'Estado' }, h('span', { class: `pill ${a.active ? (retired ? 'neg' : 'pos') : ''}` }, a.active ? 'Activa' : 'Inactiva')),
            h('td', { class: 'dim', 'data-l': 'Último acceso' }, a.last_login ? day(a.last_login.toISOString()) : 'Nunca')))))) : h('p', { class: 'dim' }, 'No se encontraron cuentas de esta persona.')),
      h('section', { class: 's-12 panel' }, h('header', {}, h('h2', {}, 'Hallazgos de esta persona')),
        d.findings.length ? h('div', {}, d.findings.map((x) => h('div', { class: 'row', style: 'flex-wrap:wrap' }, sevPill(x.severity), h('span', { style: 'flex:1;min-width:200px' }, h('b', { style: 'font-weight:500' }, x.rule),
          h('div', { class: 'sub dim' }, `${SYS_SHORT[x.system]} · ${x.login} · ${x.detail}`)), stateEl(reviewStatus(x, reviews))))) : h('p', { class: 'dim' }, 'Sin hallazgos: sus cuentas cumplen las reglas.'))));
}

// ---------------------------------------------------------------- historial
function historial(S, q) {
  const tabs = [['auditorias', 'Auditorías'], ['actividad', 'Actividad'], ['avisos', 'Avisos'], ...(S.user.role === 'admin' ? [['correos', 'Correos simulados']] : [])];
  const tab = tabs.some(([k]) => k === q.get('tab')) ? q.get('tab') : 'auditorias';
  const table = (heads, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'cards' }, h('thead', {}, h('tr', {}, heads.map((t) => h('th', {}, t)))), h('tbody', {}, rows)));
  let body;
  if (tab === 'auditorias') {
    const runs = S.store.runHistory();
    body = runs.length ? table(['#', 'Fecha', 'Por', 'Cuentas', 'Hallazgos', 'Críticos', 'Nuevos', 'Resueltos'], runs.map((r) => h('tr', {},
      h('td', { class: 'num' }, `n.º ${S.runNo(r)}`), h('td', { class: 'num', 'data-l': 'Fecha' }, stamp(r.at)), h('td', { 'data-l': 'Por' }, r.username), h('td', { class: 'num', 'data-l': 'Cuentas activas' }, int(r.accounts_active)),
      h('td', { class: 'num', 'data-l': 'Hallazgos' }, int(r.findings_total)), h('td', { class: 'num', 'data-l': 'Críticos' }, int(r.sev['crítica'])),
      h('td', { class: 'num', 'data-l': 'Nuevos' }, r.new_findings == null ? '—' : int(r.new_findings)), h('td', { class: 'num', 'data-l': 'Resueltos' }, r.resolved_findings == null ? '—' : int(r.resolved_findings)))))
      : h('div', { class: 'empty' }, 'Aún no hay auditorías.');
  } else if (tab === 'actividad') {
    const ev = S.store.listEvents(200);
    body = ev.length ? table(['Fecha', 'Usuario', 'Evento', 'Detalle'], ev.map((e) => h('tr', {}, h('td', { class: 'num dim', 'data-l': 'Fecha' }, stamp(e.at)), h('td', { 'data-l': 'Usuario' }, e.username), h('td', {}, e.type.replace(/_/g, ' ')), h('td', { class: 'dim' }, e.description)))) : h('div', { class: 'empty' }, 'Sin actividad.');
  } else if (tab === 'avisos') {
    const n = S.store.listNotifications();
    body = h('div', {}, n.length ? n.map((x) => h('div', { class: 'row' }, h('span', { class: `pill ${x.kind === 'alerta' ? 'neg' : ''}` }, x.kind === 'alerta' ? 'Alerta' : 'Info'), h('span', { style: 'flex:1' }, x.message), h('span', { class: 'dim num' }, stamp(x.at))))
      : h('div', { class: 'empty' }, 'Sin avisos.'), n.some((x) => !x.read) && h('p', { class: 'stack-note' }, h('button', { class: 'link-btn', onclick: () => { S.store.markAllRead(); S.rerender(); } }, 'Marcar todos como leídos')));
  } else {
    const o = S.store.listOutbox();
    body = o.length ? h('div', {}, h('p', { class: 'hint', style: 'margin-bottom:8px' }, 'Nada se envía de verdad: son los correos que recibirían los administradores.'), o.map((m) => h('div', { class: 'row', style: 'align-items:flex-start' },
      h('span', { style: 'flex:1' }, h('b', { style: 'font-weight:500' }, m.subject), h('div', { class: 'sub dim' }, `Para: ${m.to || '—'}`), h('div', { class: 'sub' }, m.body)), h('span', { class: 'dim num' }, stamp(m.at))))) : h('div', { class: 'empty' }, 'Sin correos.');
  }
  return h('div', {}, titleRow('Historial', 'Auditorías ejecutadas, actividad de los usuarios, avisos y los correos que generaría el sistema.'),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('a', { role: 'tab', tabindex: '0', href: `#/historial?tab=${k}`, 'aria-selected': String(tab === k) }, l))),
    h('section', { class: 'panel' }, body));
}

// ---------------------------------------------------------------- usuarios
function usuarios(S) {
  if (!S.can('users')) return emptyState('Solo para administradores', 'Tu rol no permite gestionar usuarios.');
  const users = S.store.listUsers();
  const attempt = async (fn, ok) => { try { await fn(); toast(ok); S.rerender(); } catch (e) { toast(e.message); S.rerender(); } };
  const newUser = () => {
    const u = h('input', { class: 'input', autocomplete: 'off' }), n = h('input', { class: 'input' }), e = h('input', { class: 'input', type: 'email' });
    const p = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const r = h('select', { class: 'input' }, ROLES.map((x) => h('option', { value: x }, ROLE_LABELS[x])));
    modal({ title: 'Nuevo usuario', fields: [field('Usuario', u, 'Minúsculas, números, punto, guion o guion bajo.'), field('Nombre', n), field('Correo', e), field('Contraseña', p, 'Mínimo 8 caracteres.'), field('Rol', r)], ok: 'Crear',
      run: () => S.store.createUser(u.value, p.value, n.value, r.value, e.value) }).then((done) => { if (done) { toast('Usuario creado.'); S.rerender(); } });
  };
  const reset = (u) => {
    const p = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    modal({ title: `Restablecer contraseña de ${u.username}`, fields: [field('Contraseña nueva', p, 'Mínimo 8 caracteres.')], ok: 'Restablecer', run: () => S.store.resetPassword(u.id, p.value) })
      .then((done) => done && toast('Contraseña restablecida.'));
  };
  return h('div', {}, titleRow('Usuarios', 'Quién puede entrar a AccessLens y con qué permisos. Las contraseñas se guardan con PBKDF2-SHA256 y sal aleatoria.',
    h('button', { class: 'btn primary', onclick: newUser }, 'Nuevo usuario')),
    h('section', { class: 'panel' }, h('div', { class: 'table-wrap' }, h('table', { class: 'cards' }, h('thead', {}, h('tr', {}, ['Usuario', 'Rol', 'Estado', 'Último ingreso', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, users.map((u) => {
        const role = h('select', { class: 'input', 'aria-label': `Rol de ${u.username}`, style: 'height:28px;font-size:12px' }, ROLES.map((x) => h('option', { value: x, selected: u.role === x }, ROLE_LABELS[x])));
        role.addEventListener('change', () => attempt(async () => S.store.updateUser(u.id, { role: role.value }), "Rol actualizado."));
        return h('tr', {}, h('td', {}, h('span', { class: 'name' }, u.username), h('div', { class: 'sub dim' }, u.full_name || u.email)), h('td', { 'data-l': 'Rol' }, role),
          h('td', { 'data-l': 'Estado' }, h('span', { class: `pill ${u.active ? 'pos' : ''}` }, u.active ? 'Activo' : 'Desactivado')), h('td', { class: 'num dim', 'data-l': 'Último ingreso' }, stamp(u.last_login)),
          h('td', { class: 'act' }, h('button', { class: 'link-btn', onclick: () => reset(u) }, 'Restablecer contraseña'),
            h('button', { class: `link-btn${u.active ? ' danger' : ''}`, onclick: () => attempt(async () => S.store.updateUser(u.id, { active: !u.active }), u.active ? 'Usuario desactivado.' : 'Usuario activado.') }, u.active ? 'Desactivar' : 'Activar')));
      }))))));
}

// ---------------------------------------------------------------- mi cuenta
function cuenta(S) {
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' }), nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const msg = h('div', { class: 'msg', role: 'status' });
  const form = h('form', { class: 'form-grid' }, field('Contraseña actual', cur), field('Contraseña nueva', nw, 'Mínimo 8 caracteres.'), msg, h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'Cambiar contraseña')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await S.store.changePassword(S.user.id, cur.value, nw.value); msg.className = 'msg ok'; msg.textContent = 'Contraseña actualizada.'; cur.value = nw.value = ''; }
    catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
  });
  const kv = (k, v) => h('div', { class: 'rule-row', style: 'grid-template-columns:120px 1fr' }, h('span', { class: 'dim' }, k), h('span', {}, v));
  return h('div', {}, titleRow('Mi cuenta', 'Tus datos y tu contraseña.'),
    h('div', { class: 'grid top' },
      h('section', { class: 's-5 panel' }, h('header', {}, h('h2', {}, 'Perfil')), kv('Usuario', S.user.username), kv('Nombre', S.user.full_name || '—'), kv('Correo', S.user.email || '—'), kv('Rol', ROLE_LABELS[S.user.role]), kv('Último ingreso', stamp(S.user.last_login))),
      h('section', { class: 's-7 panel' }, h('header', {}, h('h2', {}, 'Cambiar contraseña')), form)));
}

// ---------------------------------------------------------------- información
function info(S) {
  const reset = () => modal({ title: 'Restablecer datos de demostración', intro: 'Se borran usuarios creados, auditorías, revisiones y avisos de este navegador. Los tres usuarios de demostración se vuelven a crear.', ok: 'Restablecer',
    run: async () => { S.store.reset(); sessionStorage.clear(); } }).then((d) => d && location.reload());
  return h('div', {}, titleRow('Información', 'Qué es AccessLens y cómo está hecho.'),
    h('div', { class: 'grid top' },
      h('section', { class: 's-7 panel' }, h('header', {}, h('h2', {}, 'Qué hace')),
        h('p', {}, 'AccessLens cruza las cuentas de tres sistemas internos con la nómina de Talento Humano y señala las que no deberían existir: personas que ya salieron, cuentas sin dueño, privilegios fuera de Tecnología, duplicados, correos compartidos o inválidos y cuentas sin uso.'),
        h('p', { style: 'margin-top:12px' }, 'Todo corre en tu navegador, sin servidor. Las personas, los correos y los sistemas son inventados, y los datos se generan de forma determinista a partir de una semilla fija. Nada sale de tu equipo.')),
      h('section', { class: 's-5 panel' }, h('header', {}, h('h2', {}, 'Hecho con')),
        ['HTML, CSS y JavaScript modular, sin dependencias ni paso de compilación', 'WebCrypto (PBKDF2-SHA256) para las contraseñas', 'localStorage como base de datos', 'Generador de .xlsx propio', 'Public Sans autoalojada', 'Pruebas con node:test']
          .map((t) => h('div', { class: 'row' }, ic('check', 14), h('span', {}, t)))),
      h('section', { class: 's-7 panel' }, h('header', {}, h('h2', {}, 'Cuentas de demostración'), h('span', { class: 'meta' }, `Contraseña: ${DEMO_PASSWORD}`)),
        DEMO_USERS.map(([u, n, r]) => h('div', { class: 'rule-row', style: 'grid-template-columns:110px 1fr auto' }, h('b', { style: 'font-weight:500' }, u), h('span', { class: 'dim' }, n), h('span', { class: 'pill' }, ROLE_LABELS[r])))),
      h('section', { class: 's-5 panel' }, h('header', {}, h('h2', {}, 'Transparencia')),
        h('p', { class: 'dim' }, `Dominio de ejemplo: ${CORPORATE_DOMAIN}. Proyecto de portafolio desarrollado con asistencia de IA (Claude); el diseño de las reglas, la revisión y las decisiones son del autor.`),
        S.user.role === 'admin' && h('p', { style: 'margin-top:16px' }, h('button', { class: 'btn', onclick: reset }, 'Restablecer datos de demostración')))));
}

export const views = { panel, auditoria, hallazgos, persona, historial, usuarios, cuenta, info };
export const TITLES = { panel: 'Panel', auditoria: 'Auditoría', hallazgos: 'Hallazgos', persona: 'Persona', historial: 'Historial', usuarios: 'Usuarios', cuenta: 'Mi cuenta', info: 'Información' };
