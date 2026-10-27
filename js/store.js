// Base de datos de la app en el navegador (localStorage): usuarios, auditorías, hallazgos, revisiones,
// notificaciones, bitácora y correos simulados. Las contraseñas se guardan con PBKDF2-SHA256 y sal aleatoria.
import * as cfg from './config.js';
import { SEVERITY_ORDER, findingKey } from './rules.js';

const KEY = 'accesslens-v2';
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const ITER = 120000;
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt))}`;
}
async function checkPassword(password, stored) {
  const [, iter, salt, hash] = String(stored).split('$');
  if (!iter) return false;
  const got = b64(await derive(password, unb64(salt), Number(iter)));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function createStore(storage, { now = () => new Date() } = {}) {
  const empty = () => ({ seq: 1, users: [], runs: [], findings: {}, reviews: {}, notifications: [], events: [], outbox: [] });
  let db;
  try { db = JSON.parse(storage.getItem(KEY)) || empty(); } catch { db = empty(); }
  const save = () => storage.setItem(KEY, JSON.stringify(db));
  const nextId = () => db.seq++;
  const stamp = () => now().toISOString();
  const pub = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, email: u.email, role: u.role, active: u.active, created_at: u.created_at, last_login: u.last_login });

  const api = {
    reset() { db = empty(); save(); },

    // ---------- bitácora, notificaciones y correos simulados ----------
    logEvent(type, description = '', username = 'sistema', userId = null) {
      db.events.unshift({ id: nextId(), at: stamp(), user_id: userId, username, type, description });
      db.events = db.events.slice(0, 500);
      save();
    },
    listEvents: (limit = 300) => db.events.slice(0, limit),
    notify(message, kind = 'info', emailAdmins = false) {
      db.notifications.unshift({ id: nextId(), at: stamp(), kind, message, read: false });
      if (emailAdmins) {
        const to = db.users.filter((u) => u.role === 'admin' && u.active && u.email).map((u) => u.email).join(', ');
        db.outbox.unshift({ id: nextId(), at: stamp(), to, subject: `[AccessLens] ${message.slice(0, 80)}`, body: message });
      }
      save();
    },
    listNotifications: (onlyUnread = false) => db.notifications.filter((n) => !onlyUnread || !n.read),
    markAllRead() { db.notifications.forEach((n) => { n.read = true; }); save(); },
    listOutbox: () => db.outbox,

    // ---------- usuarios ----------
    async createUser(username, password, fullName = '', role = 'viewer', email = '') {
      username = String(username).trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new Error('El usuario debe tener de 3 a 32 caracteres: minúsculas, números, punto, guion o guion bajo.');
      if (String(password).length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      if (!cfg.ROLES.includes(role)) throw new Error('Rol no válido.');
      if (db.users.some((u) => u.username === username)) throw new Error('Ese nombre de usuario ya existe.');
      const u = { id: nextId(), username, password_hash: await hashPassword(password), full_name: fullName.trim(), email: email.trim(),
        role, active: true, created_at: stamp(), last_login: null };
      db.users.push(u);
      save();
      api.logEvent('usuario_creado', `Se creó el usuario '${username}' con rol ${role}`);
      return pub(u);
    },
    async ensureDemoUsers() {
      for (const [username, name, role] of cfg.DEMO_USERS) {
        if (!db.users.some((u) => u.username === username)) await api.createUser(username, cfg.DEMO_PASSWORD, name, role, `${username}@${cfg.CORPORATE_DOMAIN}`);
      }
    },
    async authenticate(username, password) {
      const name = String(username).trim().toLowerCase();
      const u = db.users.find((x) => x.username === name);
      const ok = !!(u && u.active && await checkPassword(password, u.password_hash));
      if (ok) { u.last_login = stamp(); save(); }
      api.logEvent(ok ? 'login_ok' : 'login_fallido', `Inicio de sesión de '${name}'`, name, u ? u.id : null);
      return ok ? pub(u) : null;
    },
    getUser: (id) => { const u = db.users.find((x) => x.id === id); return u && u.active ? pub(u) : null; },
    listUsers: () => db.users.map(pub).sort((a, b) => a.username.localeCompare(b.username)),
    updateUser(id, { role, active, full_name, email } = {}) {
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new Error('Usuario no encontrado.');
      const otherAdmins = db.users.filter((x) => x.id !== id && x.role === 'admin' && x.active).length;
      if (u.role === 'admin' && u.active && ((role && role !== 'admin') || active === false) && otherAdmins === 0) throw new Error('Debe quedar al menos un administrador activo.');
      if (role) { if (!cfg.ROLES.includes(role)) throw new Error('Rol no válido.'); u.role = role; }
      if (active !== undefined) u.active = active;
      if (full_name !== undefined) u.full_name = full_name.trim();
      if (email !== undefined) u.email = email.trim();
      save();
      api.logEvent('usuario_actualizado', `Se actualizó a '${u.username}' (rol ${u.role}, activo=${u.active})`);
      return pub(u);
    },
    async changePassword(id, current, next) {
      const u = db.users.find((x) => x.id === id);
      if (String(next).length < 8) throw new Error('La contraseña nueva debe tener al menos 8 caracteres.');
      if (!u || !(await checkPassword(current, u.password_hash))) throw new Error('La contraseña actual no es correcta.');
      u.password_hash = await hashPassword(next);
      save();
      api.logEvent('password_cambiada', 'El usuario cambió su contraseña', u.username, u.id);
    },
    async resetPassword(id, next) {
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new Error('Usuario no encontrado.');
      if (String(next).length < 8) throw new Error('La contraseña nueva debe tener al menos 8 caracteres.');
      u.password_hash = await hashPassword(next);
      save();
      api.logEvent('password_restablecida', `Se restableció la contraseña de '${u.username}'`);
    },

    // ---------- revisiones de hallazgos ----------
    getReviews: () => db.reviews,
    setReview(finding, status, username) {
      const key = findingKey(finding);
      if (status === 'pendiente') delete db.reviews[key]; else db.reviews[key] = { status, by: username, at: stamp() };
      save();
      api.logEvent('hallazgo_revisado', `${finding.login} (${finding.system}) · ${finding.rule_id} → ${status}`, username);
    },

    // ---------- auditorías ----------
    registerRun(userId, username, systems, params, result) {
      const s = result.summary;
      const prev = db.runs[0];
      const prevKeys = new Set(prev ? (db.findings[prev.id] || []).map(findingKey) : []);
      const keys = new Set(result.findings.map(findingKey));
      const run = { id: nextId(), at: stamp(), user_id: userId, username, systems, params,
        accounts_total: s.accounts_total, accounts_active: s.accounts_active, accounts_clean: s.accounts_clean, findings_total: s.findings_total,
        sev: Object.fromEntries(SEVERITY_ORDER.map((k) => [k, s[`sev_${k}`]])),
        new_findings: prev ? [...keys].filter((k) => !prevKeys.has(k)).length : null,
        resolved_findings: prev ? [...prevKeys].filter((k) => !keys.has(k)).length : null,
        prev_run_id: prev ? prev.id : null };
      db.runs.unshift(run);
      db.findings[run.id] = result.findings.map((f) => ({ ...f }));
      for (const id of Object.keys(db.findings)) if (!db.runs.some((r) => String(r.id) === id)) delete db.findings[id];
      if (db.runs.length > 20) { const drop = db.runs.splice(20); drop.forEach((r) => delete db.findings[r.id]); }
      save();
      api.logEvent('auditoria_ejecutada', `Auditoría: ${run.findings_total} hallazgos en ${systems.length} sistemas`, username, userId);
      const crit = run.sev['crítica'];
      api.notify(`Auditoría terminada: ${run.findings_total} hallazgos${crit ? `, ${crit} críticos.` : '.'}`, crit ? 'alerta' : 'info', crit > 0);
      return run.id;
    },
    lastRun: () => db.runs[0] || null,
    getRun: (id) => db.runs.find((r) => r.id === id) || null,
    runHistory: () => db.runs,
    runFindings: (id) => db.findings[id] || [],
  };
  return api;
}
