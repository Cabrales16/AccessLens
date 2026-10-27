// Iconos de contorno (1.5 px), un solo juego. Cada uno es el contenido de un <svg viewBox="0 0 24 24">.
const P = {
  panel: '<rect x="3.5" y="3.5" width="7" height="8" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.5"/>',
  audit: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 12h8"/>',
  findings: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L6.8 5M3.5 12l1.2 1.2L6.8 11M3.5 18l1.2 1.2L6.8 17"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V8H7"/><path d="M12 8v4.5l3 1.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19c.4-3.2 2.7-5 6-5s5.6 1.8 6 5"/><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.3c2 .5 3.2 2 3.5 4.7"/>',
  account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.5-3.6 3.2-5.5 7-5.5s6.5 1.9 7 5.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8v.1"/>',
  logout: '<path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M10 12h10M17 8.5 20.5 12 17 15.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  back: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  more: '<circle cx="12" cy="5.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="12" cy="18.5" r="1.1"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

export const ICON_NAMES = Object.keys(P);
export const svgIcon = (name, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// Marca del producto: una lente (anillo y mango) con un punto, dibujada con el acento.
export const BRAND_MARK = '<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="8.2" stroke="var(--accent)" stroke-width="2.2"/><circle cx="14" cy="14" r="2.4" fill="var(--text)"/><path d="m20.2 20.2 6 6" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/></svg>';
