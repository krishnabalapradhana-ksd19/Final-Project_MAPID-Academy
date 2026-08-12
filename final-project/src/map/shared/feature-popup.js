import maplibregl from 'maplibre-gl';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function propsTable(props, formatValue = (value) => value) {
  const keys = Object.keys(props || {});
  if (!keys.length) return '<div class="feature-popup-loading">Tidak ada atribut.</div>';

  const rows = keys
    .map((key) => {
      const value = props[key];
      const shown = value === null || value === undefined || value === '' ? '-' : formatValue(value);
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(shown)}</td></tr>`;
    })
    .join('');
  return `<table class="feature-popup-table">${rows}</table>`;
}

export function popupHtml(title, body) {
  return `
    <div class="feature-popup">
      <div class="feature-popup-title">${title}</div>
      <div class="feature-popup-scroll">${body}</div>
    </div>
  `;
}

export function bindFeaturePopup(map, layers, { skip = () => false, render }) {
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' });
  const setCursor = (value) => {
    map.getCanvas().style.cursor = value;
  };

  layers.forEach((layerId) => {
    map.on('click', layerId, (e) => {
      if (!skip(e)) render(e, popup);
    });
    map.on('mouseenter', layerId, (e) => {
      if (!skip(e)) setCursor('pointer');
    });
    map.on('mouseleave', layerId, (e) => {
      if (!skip(e)) setCursor('');
    });
  });

  return popup;
}
