import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/prng.js';
import { buildSources } from '../js/seed.js';
import { extract, extractAll, SYSTEM_KEYS } from '../js/connectors.js';
import { audit, normName, similarity, SEVERITY_ORDER } from '../js/rules.js';
import { TODAY, sample } from './helpers.mjs';

test('el generador pseudoaleatorio es determinista', () => {
  const a = createRng(7), b = createRng(7);
  assert.deepEqual([a.next(), a.int(1, 9), a.pick([1, 2, 3])], [b.next(), b.int(1, 9), b.pick([1, 2, 3])]);
  assert.notEqual(createRng(7).next(), createRng(8).next());
});

test('la semilla es determinista y trae la nómina esperada', () => {
  const x = buildSources(7, TODAY), y = buildSources(7, TODAY);
  assert.deepEqual(x, y);
  const { sources } = sample();
  assert.equal(sources.roster.length, 120);
  assert.equal(sources.roster.filter((e) => e.status === 'terminated').length, 18);
});

test('cada sistema tiene un esquema distinto y se normaliza al mismo formato', () => {
  const { sources, accounts } = sample();
  assert.ok('usr_id' in sources.erp[0] && 'permission_level' in sources.helpdesk[0] && 'group_name' in sources.vpn[0]);
  assert.deepEqual([...new Set(accounts.map((a) => a.system))].sort(), [...SYSTEM_KEYS].sort());
  for (const a of accounts) {
    assert.deepEqual(Object.keys(a), ['system', 'account_id', 'login', 'full_name', 'email', 'role', 'active', 'last_login']);
    assert.ok(['admin', 'standard', 'readonly'].includes(a.role));
    assert.ok(a.last_login === null || a.last_login instanceof Date);
  }
});

test('un sistema inalcanzable falla con un mensaje claro', () => {
  assert.throws(() => extract('erp', {}), /No se pudo conectar con ERP Comercial/);
  assert.throws(() => extract('nope', {}), /Sistema desconocido/);
});

test('cada regla encuentra lo sembrado', () => {
  const r = sample().result.summary.by_rule;
  assert.ok(r.R01 >= 15, `R01 ${r.R01}`);
  assert.equal(r.R02, 8);
  assert.ok(r.R03 >= 5, `R03 ${r.R03}`);
  assert.ok(r.R04 >= 8, `R04 ${r.R04}`);
  assert.equal(r.R05, 5);
  assert.ok(r.R06 >= 10, `R06 ${r.R06}`);
  assert.ok(r.R07 >= 4, `R07 ${r.R07}`);
  assert.ok(r.R08 >= 4, `R08 ${r.R08}`);
});

test('las cuentas de servicio no se marcan como huérfanas ni de correo inválido', () => {
  const { findings } = sample().result;
  assert.ok(!findings.some((f) => ['R02', 'R07'].includes(f.rule_id) && f.login.startsWith('svc_')));
});

test('los hallazgos salen ordenados de mayor a menor severidad', () => {
  const idx = sample().result.findings.map((f) => SEVERITY_ORDER.indexOf(f.severity));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('el resumen es coherente con los hallazgos y las cuentas', () => {
  const { accounts, result } = sample();
  const s = result.summary;
  assert.equal(s.accounts_total, accounts.length);
  assert.equal(s.findings_total, SEVERITY_ORDER.reduce((n, k) => n + s[`sev_${k}`], 0));
  assert.ok(s.accounts_clean > 0 && s.accounts_clean < s.accounts_active);
});

test('el umbral de inactividad cambia el resultado', () => {
  const { accounts, roster } = sample();
  const r = (d) => audit(accounts, roster, { dormant_days: d }, TODAY).summary.by_rule.R06 || 0;
  assert.ok(r(30) > r(90) && r(90) > r(300));
});

test('la comparación de nombres ignora tildes, mayúsculas y orden', () => {
  assert.equal(normName('José  Álvarez Peña'), normName('pena alvarez JOSE'));
  assert.ok(similarity('ana lopez', 'ana lopes') > 0.85);
  assert.ok(similarity('ana lopez', 'carlos ruiz') < 0.5);
});

test('extractAll respeta la lista de sistemas pedida', () => {
  const { sources } = sample();
  assert.deepEqual([...new Set(extractAll(['vpn'], sources).map((a) => a.system))], ['vpn']);
});
