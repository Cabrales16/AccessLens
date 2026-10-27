// Motor de reglas: cruza las cuentas de todos los sistemas con la nómina y produce hallazgos.
import * as cfg from './config.js';
import { utcToday } from './seed.js';

export const SEVERITY_ORDER = ['crítica', 'alta', 'media', 'baja'];
export const RULES = {
  R01: ['Cuenta activa de persona retirada', 'crítica'],
  R02: ['Cuenta activa sin registro en nómina', 'alta'],
  R03: ['Privilegios altos fuera de Tecnología', 'alta'],
  R04: ['Identidad duplicada en un sistema', 'media'],
  R05: ['Correo compartido entre cuentas', 'media'],
  R06: ['Cuenta activa sin uso reciente', 'baja'],
  R07: ['Correo inválido o fuera del dominio', 'baja'],
  R08: ['Nombre distinto al de nómina', 'baja'],
};
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const DAY = 86400000;

export const defaultParams = () => ({
  dormant_days: cfg.DORMANT_DAYS,
  name_similarity_min: cfg.NAME_SIMILARITY_MIN,
  corporate_domain: cfg.CORPORATE_DOMAIN,
  service_prefixes: cfg.SERVICE_PREFIXES,
  it_department: cfg.IT_DEPARTMENT,
});

export function normName(value) {
  const t = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return t.replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

// Similitud 0..1 basada en la distancia de Levenshtein
export function similarity(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

const isService = (login, p) => p.service_prefixes.some((x) => String(login).toLowerCase().startsWith(x));

function matchEmployees(accounts, roster, p) {
  const byEmail = new Map(roster.map((e, i) => [e.email.toLowerCase(), i]));
  const byName = new Map(roster.map((e, i) => [normName(e.full_name), i]));
  const names = [...byName.keys()];
  return accounts.map((acc) => {
    let idx = byEmail.get(String(acc.email).toLowerCase());
    let how = idx !== undefined ? 'email' : '';
    if (idx === undefined) {
      const key = normName(acc.full_name);
      idx = byName.get(key);
      how = idx !== undefined ? 'nombre' : '';
      if (idx === undefined && key) {
        let best = '', bestScore = 0;
        for (const n of names) {
          const s = similarity(key, n);
          if (s > bestScore) { bestScore = s; best = n; }
        }
        if (bestScore >= p.name_similarity_min) { idx = byName.get(best); how = 'nombre aprox.'; }
      }
    }
    const emp = idx !== undefined ? roster[idx] : null;
    return { ...acc, match: how, employee_id: emp ? emp.employee_id : null, department: emp ? emp.department : null,
      hr_status: emp ? emp.status : null, hr_name: emp ? emp.full_name : null };
  });
}

export function audit(accounts, roster, params = {}, today = utcToday()) {
  const p = { ...defaultParams(), ...params };
  const acc = matchEmployees(accounts, roster, p);
  const active = acc.filter((a) => a.active);
  const rows = [];
  const add = (ruleId, list, detail) => {
    for (const r of list) {
      rows.push({ rule_id: ruleId, rule: RULES[ruleId][0], severity: RULES[ruleId][1], system: r.system, account_id: r.account_id,
        login: r.login, email: r.email, full_name: r.full_name, employee_id: r.employee_id, department: r.department,
        detail: typeof detail === 'function' ? detail(r) : detail });
    }
  };
  const notService = active.filter((a) => !isService(a.login, p));

  add('R01', active.filter((a) => a.hr_status === 'terminated'), () => 'La persona figura como retirada en nómina');
  add('R02', notService.filter((a) => !a.employee_id), () => 'No se encontró a la persona en la nómina');
  add('R03', active.filter((a) => a.role === 'admin' && a.employee_id && a.department !== p.it_department),
    (r) => `Rol administrador en el área de ${r.department}`);

  const groups = (list, keyFn) => { const m = new Map(); for (const r of list) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m.values()]; };
  add('R04', groups(active.filter((a) => a.employee_id), (a) => `${a.system}|${a.employee_id}`).filter((g) => g.length > 1).flat(),
    () => 'La misma persona tiene más de una cuenta activa en este sistema');
  const shared = groups(active, (a) => String(a.email).toLowerCase()).filter((g) => {
    if (new Set(g.map((x) => x.login)).size < 2) return false;
    return !(g[0].employee_id && g.every((x) => x.employee_id === g[0].employee_id));
  }).flat();
  add('R05', shared, () => 'El mismo correo aparece en varias cuentas de personas distintas');

  const now = today.getTime();
  const cutoff = now - p.dormant_days * DAY;
  add('R06', active.filter((a) => !a.last_login || a.last_login.getTime() < cutoff),
    (r) => (r.last_login ? `Último acceso hace ${Math.floor((now - r.last_login.getTime()) / DAY)} días` : 'Nunca ha iniciado sesión'));

  const domain = p.corporate_domain.toLowerCase();
  add('R07', notService.filter((a) => !(EMAIL_RE.test(String(a.email)) && String(a.email).toLowerCase().endsWith('@' + domain))),
    (r) => `Correo '${r.email}' no cumple el formato corporativo`);

  add('R08', active.filter((a) => ['email', 'nombre aprox.'].includes(a.match) && a.hr_name && normName(a.full_name) !== normName(a.hr_name)),
    (r) => `En el sistema: '${r.full_name}'; en nómina: '${r.hr_name}'`);

  const order = (s) => SEVERITY_ORDER.indexOf(s);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  rows.sort((a, b) => order(a.severity) - order(b.severity) || cmp(a.rule_id, b.rule_id) || cmp(a.system, b.system) || cmp(a.login, b.login));

  const flagged = new Set(rows.map((r) => `${r.system}|${r.account_id}`));
  for (const a of acc) a.clean = !flagged.has(`${a.system}|${a.account_id}`);
  const count = (key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
  const summary = {
    accounts_total: acc.length, accounts_active: active.length, accounts_clean: active.filter((a) => a.clean).length,
    findings_total: rows.length,
    ...Object.fromEntries(SEVERITY_ORDER.map((s) => [`sev_${s}`, rows.filter((r) => r.severity === s).length])),
    by_rule: count('rule_id'), by_system: count('system'),
  };
  return { accounts: acc, findings: rows, summary, params: p };
}

export const findingKey = (f) => `${f.rule_id}|${f.system}|${f.account_id}`;
