// Utilidades de DOM: todo el texto entra como texto (nunca como HTML), así que los datos no pueden inyectar marcado.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // solo para los iconos SVG del proyecto
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...nodes) => { clear(el); el.append(...nodes.flat(Infinity).filter(Boolean)); return el; };

const nf = new Intl.NumberFormat('es-CO');
export const int = (v) => nf.format(v);
export const pct = (v, d = 1) => new Intl.NumberFormat('es-CO', { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const day = (iso) => (iso ? String(iso).slice(0, 10) : '—');
export const stamp = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : '—');
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

// Hace cuánto: "hace 3 h", "hace 12 días"
export function ago(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${int(days)} días`;
}

export function download(bytes, filename, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
