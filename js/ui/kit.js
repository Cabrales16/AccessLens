// Piezas de interfaz compartidas: iconos, pills, avisos y diálogos.
import { h } from './dom.js';
import { svgIcon } from './icons.js';
import { STATUS_LABELS } from '../domain.js';

export const ic = (name, size = 16) => h('span', { class: 'ic', html: svgIcon(name, size) });

export const SEV = { 'crítica': ['sev-critica', 'Crítica'], alta: ['sev-alta', 'Alta'], media: ['sev-media', 'Media'], baja: ['sev-baja', 'Baja'] };
export const sevPill = (s) => h('span', { class: `pill ${SEV[s][0]}` }, SEV[s][1]);
export const stateEl = (st) => h('span', { class: `state ${st}` }, STATUS_LABELS[st]);
export const SYS_SHORT = { erp: 'ERP', helpdesk: 'Ayuda', vpn: 'VPN' };

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

let uid = 0;
export function field(label, input, hint) {
  if (!input.id) input.id = `f${++uid}`;
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint && h('span', { class: 'hint' }, hint));
}

// Diálogo con formulario. `run` valida y ejecuta; si lanza un error, se muestra y el diálogo sigue abierto.
export function modal({ title, intro, fields = [], ok = 'Guardar', run }) {
  return new Promise((resolve) => {
    const msg = h('div', { class: 'msg', role: 'alert' });
    const okBtn = h('button', { class: 'btn primary', type: 'submit' }, ok);
    const dlg = h('dialog');
    const form = h('form', { class: 'dlg', method: 'dialog' }, h('h2', {}, title), intro && h('p', {}, intro), ...fields, msg,
      h('footer', {}, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancelar'), okBtn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = ''; okBtn.disabled = true;
      try { if (run) await run(); dlg.close('ok'); } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; okBtn.disabled = false; }
    });
    dlg.addEventListener('close', () => { const done = dlg.returnValue === 'ok'; dlg.remove(); resolve(done); });
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    const first = dlg.querySelector('input, select, textarea');
    if (first) first.focus();
  });
}

export const emptyState = (title, text, action) =>
  h('div', { class: 'panel', style: 'display:grid;gap:12px;justify-items:start;padding:32px' }, h('h2', {}, title), h('p', { class: 'dim' }, text), action);
