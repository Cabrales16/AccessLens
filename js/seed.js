// Datos sintéticos: nómina de RR. HH. y tres sistemas con esquemas distintos, con anomalías conocidas inyectadas.
// Ninguna persona, correo ni sistema es real.
import { createRng } from './prng.js';
import * as cfg from './config.js';

export const FIRST = [
  'Valentina', 'Santiago', 'Mariana', 'Julián', 'Daniela', 'Sebastián', 'Natalia', 'Andrés', 'Camila', 'Felipe',
  'Laura', 'Mateo', 'Paula', 'Nicolás', 'Isabella', 'Esteban', 'Carolina', 'David', 'Juliana', 'Tomás',
  'Gabriela', 'Sergio', 'Manuela', 'Ricardo', 'Luisa', 'Alejandro', 'Sofía', 'Diego', 'Verónica', 'Iván',
  'Lucía', 'Emilio', 'Adriana', 'Héctor', 'Marcela', 'Óscar', 'Patricia', 'Rodrigo', 'Elena', 'Gustavo',
];
export const LAST = [
  'Rodríguez', 'Gómez', 'Martínez', 'López', 'Herrera', 'Castillo', 'Ortega', 'Morales', 'Salazar', 'Navarro',
  'Vargas', 'Rojas', 'Duarte', 'Quintero', 'Mejía', 'Cárdenas', 'Beltrán', 'Arias', 'Peña', 'León',
  'Ríos', 'Toro', 'Giraldo', 'Uribe', 'Mora', 'Ibáñez', 'Ospina', 'Correa', 'Nieto', 'Lara',
  'Bravo', 'Cruz', 'Molina', 'Suárez', 'Pardo', 'Acosta', 'Franco', 'Soto', 'Cano', 'Valencia',
];
// Nombres de contratistas externos: listas aparte, para que no se confundan con la nómina
const EXT_FIRST = ['Brandon', 'Kevin', 'Yeison', 'Wilmer', 'Dayana', 'Leidy', 'Jhon', 'Cristian'];
const EXT_LAST = ['Zapata', 'Piedrahíta', 'Echeverri', 'Tamayo', 'Bedoya', 'Agudelo', 'Henao', 'Londoño'];
// departamento -> [peso, cargos]
export const DEPARTMENTS = {
  'Tecnología': [14, ['Analista de soporte', 'Administrador de sistemas', 'Desarrollador', 'Jefe de TI']],
  'Finanzas': [16, ['Contador', 'Analista financiero', 'Tesorero', 'Auxiliar contable']],
  'Operaciones': [22, ['Coordinador de operaciones', 'Analista de inventario', 'Supervisor de bodega']],
  'Comercial': [20, ['Ejecutivo comercial', 'Asesor de cuentas', 'Gerente de zona']],
  'Talento Humano': [8, ['Analista de selección', 'Coordinador de nómina']],
  'Jurídico': [6, ['Abogado', 'Asistente jurídico']],
  'Logística': [14, ['Despachador', 'Coordinador logístico', 'Auxiliar de transporte']],
};

const DAY = 86400000;
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
export const utcToday = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const isoDay = (d) => d.toISOString().slice(0, 10);

function makeRoster(rng, today, n = 120) {
  const depts = Object.keys(DEPARTMENTS);
  const weights = depts.map((d) => DEPARTMENTS[d][0]);
  const rows = [];
  const names = new Set();
  const emails = new Set();
  while (rows.length < n) {
    const fn = rng.pick(FIRST), l1 = rng.pick(LAST), l2 = rng.pick(LAST);
    const full = `${fn} ${l1} ${l2}`;
    const email = `${slug(fn)}.${slug(l1)}@${cfg.CORPORATE_DOMAIN}`;
    if (names.has(full) || emails.has(email)) continue;
    names.add(full);
    emails.add(email);
    const dept = rng.weighted(depts, weights);
    rows.push({
      employee_id: `E${String(rows.length + 1).padStart(4, '0')}`,
      full_name: full, email, department: dept, job_title: rng.pick(DEPARTMENTS[dept][1]),
      status: 'active', hire_date: isoDay(new Date(today.getTime() - rng.int(120, 3000) * DAY)), termination_date: '',
    });
  }
  // Personas que ya no están en la empresa
  for (const i of rng.sample([...Array(n).keys()], 18)) {
    rows[i].status = 'terminated';
    rows[i].termination_date = isoDay(new Date(today.getTime() - rng.int(10, 200) * DAY));
  }
  return rows;
}

export function buildSources(seed = cfg.SEED, today = utcToday()) {
  const rng = createRng(seed);
  const now = new Date(today.getTime() + 9 * 3600000);
  const roster = makeRoster(rng, today);
  const active = roster.filter((e) => e.status === 'active');
  const terminated = roster.filter((e) => e.status === 'terminated');
  const erp = [], helpdesk = [], vpn = [];
  const tErp = new Set(), tHd = new Set(), tVpn = new Set();
  const dom = cfg.CORPORATE_DOMAIN;

  const recent = (maxDays = 45) => new Date(now.getTime() - (rng.int(0, maxDays) * 86400 + rng.int(0, 20) * 3600 + rng.int(0, 59) * 60) * 1000);
  const fmtErp = (d) => d.toISOString().slice(0, 19);
  const fmtVpn = (d) => d.toISOString().slice(0, 16).replace('T', ' ');
  const epoch = (d) => Math.floor(d.getTime() / 1000);
  const login = (emp, taken) => {
    const parts = emp.full_name.split(' ');
    const base = slug(parts[0])[0] + slug(parts[1]);
    let l = base, i = 1;
    while (taken.has(l)) { i++; l = `${base}${i}`; }
    taken.add(l);
    return l;
  };
  const lastOf = (o) => (o.last === false ? null : o.last || recent());

  const addErp = (emp, o = {}) => {
    const dept = emp ? emp.department : 'Comercial';
    const role = o.role || ({ 'Tecnología': 'ADM', 'Finanzas': 'FIN', 'Operaciones': 'OPS' }[dept] || 'VIEW');
    const last = lastOf(o);
    erp.push({ usr_id: erp.length + 1, login: o.login || login(emp, tErp), display_name: o.name || emp.full_name,
      mail: o.email || emp.email, role_code: role, is_active: 'Y', last_login: last ? fmtErp(last) : null });
  };
  const addHd = (emp, o = {}) => {
    const level = o.level ?? (emp.department === 'Tecnología' ? 4 : rng.pick([1, 2, 3]));
    const last = lastOf(o);
    helpdesk.push({ id: 1000 + helpdesk.length, username: o.username || login(emp, tHd), full_name: o.name || emp.full_name,
      email: o.email || emp.email, permission_level: level, enabled: 1, last_seen: last ? epoch(last) : null });
  };
  const addVpn = (emp, o = {}) => {
    const last = lastOf(o);
    vpn.push({ account: o.account || login(emp, tVpn) + '.vpn', owner_name: o.name || emp.full_name,
      owner_email: o.email || emp.email, group_name: o.group || 'staff', status: 'active', last_connection: last ? fmtVpn(last) : null });
  };

  // Cuentas normales
  for (const e of active) {
    if (rng.chance(0.8)) addErp(e);
    if (['Tecnología', 'Operaciones', 'Logística'].includes(e.department) && rng.chance(0.7)) addHd(e);
    if (rng.chance(0.7)) addVpn(e, { group: e.department === 'Tecnología' && rng.chance(0.5) ? 'admins' : 'staff' });
  }

  // 1) Personas retiradas que conservan cuentas activas
  for (const e of rng.sample(terminated, 12)) {
    const before = new Date(Date.parse(`${e.termination_date}T09:00:00Z`) - rng.int(1, 30) * DAY);
    if (rng.chance(0.8)) addErp(e, { last: before });
    if (rng.chance(0.6)) addVpn(e, { last: before });
    if (rng.chance(0.4)) addHd(e, { level: 2, last: before });
  }

  // 2) Cuentas sin registro en nómina (contratistas, pruebas)
  for (let i = 0; i < 6; i++) {
    const fake = `${rng.pick(EXT_FIRST)} ${rng.pick(EXT_LAST)} ${rng.pick(EXT_LAST)}`;
    const p = fake.split(' ');
    const s = slug(p[0])[0] + slug(p[1]);
    addVpn(null, { account: `ext_${s}.vpn`, name: fake, email: `${s}@proveedor-${i + 1}.example`, group: 'contractors' });
  }
  addErp(null, { login: 'prueba01', name: 'Usuario de Prueba', email: `prueba01@${dom}`, role: 'VIEW' });
  addErp(null, { login: 'temporal', name: 'Cuenta Temporal', email: `temporal@${dom}`, role: 'OPS' });

  // Cuentas de servicio legítimas (no deben marcarse como huérfanas)
  addErp(null, { login: 'svc_reportes', name: 'Servicio de reportes', email: `svc_reportes@${dom}`, role: 'VIEW' });
  addHd(null, { username: 'svc_monitor', name: 'Servicio de monitoreo', email: `svc_monitor@${dom}`, level: 2 });

  // 3) Identidades duplicadas en el ERP
  for (const e of rng.sample(active.filter((x) => ['Comercial', 'Finanzas', 'Operaciones'].includes(x.department)), 5)) addErp(e);

  // 4) Correos compartidos
  for (const e of rng.sample(active.filter((x) => x.department === 'Tecnología'), 3)) {
    addHd(e, { username: login(e, tHd) + '_s', email: `soporte@${dom}`, level: 3 });
  }
  for (const e of rng.sample(active.filter((x) => x.department === 'Comercial'), 2)) {
    addErp(e, { login: login(e, tErp) + '_v', email: `ventas@${dom}`, role: 'VIEW' });
  }

  // 5) Cuentas inactivas hace mucho
  const old = () => new Date(now.getTime() - rng.int(130, 400) * DAY);
  for (const r of rng.sample(erp, 7)) r.last_login = fmtErp(old());
  for (const r of rng.sample(vpn, 7)) r.last_connection = fmtVpn(old());
  for (const r of rng.sample(helpdesk, 7)) r.last_seen = epoch(old());
  for (const r of rng.sample(vpn, 2)) r.last_connection = null;

  // 6) Privilegios altos fuera de TI (se elevan cuentas existentes)
  const deptByMail = Object.fromEntries(active.map((e) => [e.email, e.department]));
  const erpNonIt = erp.filter((r) => ['Finanzas', 'Comercial', 'Logística'].includes(deptByMail[r.mail]) && r.role_code !== 'ADM');
  for (const r of rng.sample(erpNonIt, 5)) r.role_code = 'ADM';
  const hdNonIt = helpdesk.filter((r) => ['Operaciones', 'Logística'].includes(deptByMail[r.email]));
  for (const r of rng.sample(hdNonIt, 2)) r.permission_level = 5;

  // 7) Correos con formato inválido o fuera del dominio corporativo
  const bad = [(a) => `${a}@@${dom}`, (a) => `${a}@gmail.com`, (a) => `${a}.${dom}`, (a) => `${a}@${dom}.`];
  rng.sample(erp, 4).forEach((r, i) => { r.mail = bad[i](r.login); });

  // 8) Nombres con errores de digitación
  for (const r of rng.sample(erp.filter((x) => x.login !== 'prueba01'), 4)) {
    const n = r.display_name;
    if (n.length > 4) r.display_name = n.slice(0, -2) + n.slice(-1) + n.slice(-2, -1);
  }
  for (const r of rng.sample(vpn.slice(0, 25), 2)) r.owner_name = r.owner_name.replace('a', 'e');

  return { roster, erp, helpdesk, vpn };
}
