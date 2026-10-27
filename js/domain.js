// Datos derivados que muestra la interfaz (sin DOM, así se pueden probar).
import { findingKey } from './rules.js';
import { SYSTEM_KEYS } from './connectors.js';

export const DAY = 86400000;

export const reviewStatus = (finding, reviews) => (reviews[findingKey(finding)] || {}).status || 'pendiente';
export const STATUS_LABELS = { pendiente: 'Pendiente', revisado: 'Revisado', riesgo: 'Riesgo aceptado' };

// Personas retiradas que conservan cuentas activas: la señal que contesta la pregunta principal del panel.
export function exposure(result, roster, today) {
  const byId = new Map(roster.map((e) => [e.employee_id, e]));
  const rows = new Map();
  for (const a of result.accounts) {
    if (!a.active || a.hr_status !== 'terminated') continue;
    const emp = byId.get(a.employee_id);
    if (!rows.has(emp.employee_id)) {
      rows.set(emp.employee_id, { employee_id: emp.employee_id, full_name: emp.full_name, department: emp.department,
        job_title: emp.job_title, termination_date: emp.termination_date,
        days: Math.max(0, Math.round((today - Date.parse(`${emp.termination_date}T00:00:00Z`)) / DAY)),
        systems: Object.fromEntries(SYSTEM_KEYS.map((k) => [k, 0])), accounts: 0, admin: false });
    }
    const r = rows.get(emp.employee_id);
    r.systems[a.system] += 1;
    r.accounts += 1;
    if (a.role === 'admin') r.admin = true;
  }
  return [...rows.values()].sort((x, y) => y.days - x.days || y.accounts - x.accounts);
}

export function headline(exp) {
  const accounts = exp.reduce((n, r) => n + r.accounts, 0);
  if (!exp.length) return 'Ninguna persona retirada conserva cuentas activas.';
  const oldest = exp[0].days;
  return `${accounts} cuentas activas siguen abiertas de ${exp.length} personas que ya salieron; la salida más antigua fue ${oldest === 0 ? 'hoy' : `hace ${oldest} días`}.`;
}

export function reviewCounts(findings, reviews) {
  const c = { pendiente: 0, revisado: 0, riesgo: 0 };
  for (const f of findings) c[reviewStatus(f, reviews)] += 1;
  return c;
}

// Qué cambió respecto a la auditoría anterior
export function diffRuns(current, previous) {
  const prevKeys = new Set(previous.map(findingKey));
  const keys = new Set(current.map(findingKey));
  return { added: current.filter((f) => !prevKeys.has(findingKey(f))), resolved: previous.filter((f) => !keys.has(findingKey(f))) };
}

export function personDetail(employeeId, result, roster, today) {
  const emp = roster.find((e) => e.employee_id === employeeId);
  if (!emp) return null;
  const accounts = result.accounts.filter((a) => a.employee_id === employeeId);
  const findings = result.findings.filter((f) => f.employee_id === employeeId);
  const since = emp.termination_date ? Math.max(0, Math.round((today - Date.parse(`${emp.termination_date}T00:00:00Z`)) / DAY)) : null;
  return { emp, accounts, findings, since, open: accounts.filter((a) => a.active).length };
}

export function filterFindings(findings, reviews, { sev = '', sys = '', rule = '', state = '', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return findings.filter((f) => (!sev || f.severity === sev) && (!sys || f.system === sys) && (!rule || f.rule_id === rule)
    && (!state || reviewStatus(f, reviews) === state)
    && (!needle || [f.login, f.full_name, f.email].some((v) => String(v || '').toLowerCase().includes(needle))));
}
