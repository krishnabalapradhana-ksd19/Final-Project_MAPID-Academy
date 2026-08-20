import maplibregl from 'maplibre-gl';
import { isBlank } from './attr-schema.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function propsTable(props, formatValue = (value) => value) {
  const keys = Object.keys(props || {});
  if (!keys.length) return '<div class="feature-popup-loading">Tidak ada atribut.</div>';

  const rows = keys
    .map((key) => {
      const value = props[key];
      const shown = isBlank(value) ? '-' : formatValue(value);
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

const DIRECTION_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';

export function directionButtonHtml(lat, lng) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return '';
  return `<button type="button" class="feature-popup-direction-btn" data-lat="${lat}" data-lng="${lng}">${DIRECTION_ICON}<span>Get Direction</span></button>`;
}

let directionsBound = false;

export function bindDirectionButtons() {
  if (directionsBound) return;
  directionsBound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.feature-popup-direction-btn');
    if (!btn || btn.disabled) return;

    const { lat, lng } = btn.dataset;
    const openDirections = (origin) => {
      const params = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: 'driving' });
      if (origin) params.set('origin', origin);
      window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
    };

    if (!navigator.geolocation) {
      openDirections();
      return;
    }

    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        openDirections(`${pos.coords.latitude},${pos.coords.longitude}`);
        btn.disabled = false;
      },
      () => {
        openDirections();
        btn.disabled = false;
      },
      { timeout: 5000 }
    );
  });
}

export function bindFeaturePopup(map, layers, { skip = () => false, render }) {
  bindDirectionButtons();
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
