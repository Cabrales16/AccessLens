// Conectores: extraen las cuentas de cada sistema y las normalizan a un mismo esquema.
// Cada sistema tiene nombres de columnas, formatos de fecha y niveles de permiso distintos.
export const SYSTEMS = {
  erp: { key: 'erp', label: 'ERP Comercial', engine: 'Tabla usr · fechas ISO · roles por código' },
  helpdesk: { key: 'helpdesk', label: 'Mesa de ayuda', engine: 'Tabla agents · fechas epoch · nivel 1-5' },
  vpn: { key: 'vpn', label: 'Acceso VPN', engine: 'Tabla vpn_accounts · grupos de acceso' },
};
export const SYSTEM_KEYS = Object.keys(SYSTEMS);

const utc = (s) => (s ? new Date(s.replace(' ', 'T') + (s.length <= 16 ? ':00Z' : 'Z')) : null);

const NORMALIZERS = {
  erp: (r) => ({
    system: 'erp', account_id: String(r.usr_id), login: r.login, full_name: r.display_name, email: r.mail,
    role: { ADM: 'admin', FIN: 'standard', OPS: 'standard', VIEW: 'readonly' }[r.role_code] || 'standard',
    active: r.is_active === 'Y', last_login: utc(r.last_login),
  }),
  helpdesk: (r) => ({
    system: 'helpdesk', account_id: String(r.id), login: r.username, full_name: r.full_name, email: r.email,
    role: r.permission_level >= 5 ? 'admin' : r.permission_level <= 2 ? 'readonly' : 'standard',
    active: Number(r.enabled) === 1, last_login: r.last_seen == null ? null : new Date(r.last_seen * 1000),
  }),
  vpn: (r) => ({
    system: 'vpn', account_id: r.account, login: r.account, full_name: r.owner_name, email: r.owner_email,
    role: { admins: 'admin', staff: 'standard', contractors: 'readonly' }[r.group_name] || 'standard',
    active: r.status === 'active', last_login: utc(r.last_connection),
  }),
};

export function checkReachability(key, sources) {
  return Array.isArray(sources && sources[key]);
}

export function extract(key, sources) {
  if (!SYSTEMS[key]) throw new Error(`Sistema desconocido: ${key}`);
  if (!checkReachability(key, sources)) throw new Error(`No se pudo conectar con ${SYSTEMS[key].label}`);
  return sources[key].map(NORMALIZERS[key]);
}

export function extractAll(keys, sources) {
  return (keys || SYSTEM_KEYS).flatMap((k) => extract(k, sources));
}
