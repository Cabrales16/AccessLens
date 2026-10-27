import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { buildReport } from '../js/report.js';
import { audit } from '../js/rules.js';
import { memoryStorage, sample, TODAY } from './helpers.mjs';

const fresh = () => createStore(memoryStorage());

test('crear usuario y autenticar', async () => {
  const s = fresh();
  await s.createUser('ana.perez', 'Clave1234', 'Ana Pérez', 'auditor');
  assert.equal((await s.authenticate('ANA.perez', 'Clave1234')).role, 'auditor');
  assert.equal(await s.authenticate('ana.perez', 'otra'), null);
  assert.equal(await s.authenticate('nadie', 'Clave1234'), null);
});

test('la contraseña no se guarda en claro', async () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  await s.createUser('ana.perez', 'Clave1234');
  const raw = storage.getItem('accesslens-v2');
  assert.ok(!raw.includes('Clave1234') && raw.includes('pbkdf2$'));
});

test('validaciones de usuario', async () => {
  const s = fresh();
  await assert.rejects(s.createUser('A', 'Clave1234'), /3 a 32/);
  await assert.rejects(s.createUser('ana perez', 'Clave1234'), /3 a 32/);
  await assert.rejects(s.createUser('ana.perez', 'corta'), /8 caracteres/);
  await assert.rejects(s.createUser('ana.perez', 'Clave1234', '', 'jefe'), /Rol no válido/);
  await s.createUser('ana.perez', 'Clave1234');
  await assert.rejects(s.createUser('ana.perez', 'Clave1234'), /ya existe/);
});

test('siempre queda un administrador activo', async () => {
  const s = fresh();
  const a = await s.createUser('admin', 'Clave1234', '', 'admin');
  assert.throws(() => s.updateUser(a.id, { role: 'viewer' }), /al menos un administrador/);
  assert.throws(() => s.updateUser(a.id, { active: false }), /al menos un administrador/);
  await s.createUser('otro.admin', 'Clave1234', '', 'admin');
  assert.equal(s.updateUser(a.id, { active: false }).active, false);
});

test('un usuario inactivo no inicia sesión', async () => {
  const s = fresh();
  await s.createUser('admin', 'Clave1234', '', 'admin');
  const u = await s.createUser('ana.perez', 'Clave1234');
  s.updateUser(u.id, { active: false });
  assert.equal(await s.authenticate('ana.perez', 'Clave1234'), null);
});

test('cambiar y restablecer la contraseña', async () => {
  const s = fresh();
  const u = await s.createUser('ana.perez', 'Clave1234');
  await assert.rejects(s.changePassword(u.id, 'mala', 'NuevaClave1'), /no es correcta/);
  await s.changePassword(u.id, 'Clave1234', 'NuevaClave1');
  assert.ok(await s.authenticate('ana.perez', 'NuevaClave1'));
  await s.resetPassword(u.id, 'TercerClave1');
  assert.ok(await s.authenticate('ana.perez', 'TercerClave1'));
});

test('una auditoría guarda hallazgos, notifica, simula el correo y compara con la anterior', async () => {
  const s = fresh();
  await s.createUser('admin', 'Clave1234', '', 'admin', 'admin@lumen.example');
  const { accounts, roster, result } = sample();
  const id1 = s.registerRun(null, 'sistema', ['erp', 'helpdesk', 'vpn'], {}, result);
  assert.equal(s.runFindings(id1).length, result.summary.findings_total);
  assert.equal(s.lastRun().new_findings, null);
  assert.equal(s.listNotifications()[0].kind, 'alerta');
  assert.equal(s.listOutbox().length, 1);
  // segunda auditoría con un umbral distinto: cambia el conjunto de hallazgos
  const result2 = audit(accounts, roster, { dormant_days: 30 }, TODAY);
  const id2 = s.registerRun(1, 'admin', ['erp', 'helpdesk', 'vpn'], {}, result2);
  const run = s.getRun(id2);
  assert.equal(run.prev_run_id, id1);
  assert.equal(run.new_findings, result2.summary.findings_total - result.summary.findings_total);
  assert.equal(run.resolved_findings, 0);
  s.markAllRead();
  assert.equal(s.listNotifications(true).length, 0);
  assert.ok(s.listEvents().some((e) => e.type === 'auditoria_ejecutada'));
});

test('las revisiones de hallazgos se guardan y se pueden deshacer', () => {
  const s = fresh();
  const f = sample().result.findings[0];
  s.setReview(f, 'revisado', 'auditor');
  assert.equal(Object.values(s.getReviews())[0].status, 'revisado');
  s.setReview(f, 'pendiente', 'auditor');
  assert.equal(Object.keys(s.getReviews()).length, 0);
});

test('los datos persisten entre sesiones', async () => {
  const storage = memoryStorage();
  await createStore(storage).createUser('ana.perez', 'Clave1234');
  assert.equal(createStore(storage).listUsers().length, 1);
});

test('el Excel tiene las tres hojas, estilos y los hallazgos', () => {
  const { result } = sample();
  const bytes = buildReport({ ...result, generatedBy: 'admin', now: TODAY });
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const text = new TextDecoder('latin1').decode(bytes);
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(text.includes('sheet name="Hallazgos"') && text.includes('autoFilter') && text.includes('state="frozen"'));
  assert.equal((text.match(/<row r=/g) || []).length > result.findings.length, true);
});
