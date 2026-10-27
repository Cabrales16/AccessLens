// Reporte en Excel: resumen, hallazgos y cuentas correctas.
import { makeXlsx, STYLE } from './xlsx.js';
import { RULES, SEVERITY_ORDER, findingKey } from './rules.js';
import { SYSTEMS } from './connectors.js';

const SEV_STYLE = { 'crítica': STYLE.critical, alta: STYLE.high, media: STYLE.medium, baja: STYLE.low };
const widthOf = (rows, i, min = 12, max = 60) => Math.min(max, Math.max(min, ...rows.slice(0, 200).map((r) => String(r[i] && r[i].v !== undefined ? r[i].v : r[i] ?? '').length + 2)));

export function buildReport({ findings, accounts = [], summary, generatedBy = 'sistema', reviews = {}, now = new Date() }) {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const resumen = [
    [{ v: 'Indicador', s: STYLE.header }, { v: 'Valor', s: STYLE.header }],
    ['Generado', stamp], ['Generado por', generatedBy],
    ['Cuentas totales', summary.accounts_total], ['Cuentas activas', summary.accounts_active],
    ['Cuentas activas sin hallazgos', summary.accounts_clean], ['Hallazgos', summary.findings_total],
    ...SEVERITY_ORDER.map((s) => [`Severidad ${s}`, summary[`sev_${s}`] ?? 0]),
    [],
    [{ v: 'Regla', s: STYLE.header }, { v: 'Descripción', s: STYLE.header }, { v: 'Severidad', s: STYLE.header }, { v: 'Hallazgos', s: STYLE.header }],
    ...Object.entries(summary.by_rule || {}).sort().map(([id, n]) => [id, RULES[id][0], { v: RULES[id][1], s: SEV_STYLE[RULES[id][1]] }, n]),
  ];
  const head = ['Regla', 'Descripción', 'Severidad', 'Sistema', 'Cuenta', 'Nombre', 'Correo', 'Empleado', 'Área', 'Detalle', 'Estado de revisión']
    .map((v) => ({ v, s: STYLE.header }));
  const rows = findings.map((f) => [f.rule_id, f.rule, { v: f.severity, s: SEV_STYLE[f.severity] }, SYSTEMS[f.system]?.label || f.system,
    f.login, f.full_name, f.email, f.employee_id || '', f.department || '', f.detail, reviews[findingKey(f)]?.status || 'pendiente']);
  const hallazgos = [head, ...rows];
  const okHead = ['Sistema', 'Cuenta', 'Nombre', 'Correo', 'Rol', 'Área', 'Último acceso'].map((v) => ({ v, s: STYLE.header }));
  const okRows = accounts.filter((a) => a.active && a.clean).map((a) => [SYSTEMS[a.system]?.label || a.system, a.login, a.full_name, a.email,
    a.role, a.department || '', a.last_login ? a.last_login.toISOString().slice(0, 16).replace('T', ' ') : '']);
  const correctas = [okHead, ...okRows];
  return makeXlsx([
    { name: 'Resumen', rows: resumen, widths: [34, 38, 12, 12] },
    { name: 'Hallazgos', rows: hallazgos, freeze: true, filter: true, widths: [8, 38, 11, 16, 16, 28, 34, 11, 16, 54, 16] },
    { name: 'Cuentas correctas', rows: correctas, freeze: true, filter: true, widths: [16, 16, 28, 34, 10, 16, 18].map((w, i) => Math.max(w, widthOf(correctas, i, 10, 40))) },
  ]);
}
