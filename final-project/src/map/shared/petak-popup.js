import { escapeHtml, directionButtonHtml } from './feature-popup.js';
import {
  blankEditableKeys,
  displayValue,
  fieldDef,
  getActiveYear,
  IDENTITAS_KEYS,
  seasonKeys
} from './attr-schema.js';

const fmtDateShort = (date) =>
  [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, i) => (i < 2 ? String(part).padStart(2, '0') : part))
    .join('/');

const EMPTY_MARK =
  '<span class="petak-popup-blank" title="Data belum diisi">' +
  '<span class="petak-popup-warn" aria-hidden="true">!</span>Belum diisi</span>';

const valueHtml = (props, key) => {
  const shown = displayValue(key, props[key]);
  return shown === null ? EMPTY_MARK : escapeHtml(shown);
};

const EDIT_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

function identityRow(label, value) {
  return `
    <div class="petak-popup-row">
      <span class="petak-popup-label">${escapeHtml(label)}</span>
      <span class="petak-popup-value">${value}</span>
    </div>
  `;
}

function fieldRow(props, key) {
  return identityRow(fieldDef(key)?.label || key, valueHtml(props, key));
}

function buildHeader(props) {
  return `
    <div class="petak-popup-title">${valueHtml(props, 'ID_PETAK')}</div>
    <div class="petak-popup-subtitle">Pemanfaatan hari ini: <strong>${valueHtml(props, 'KOND_SKRNG')}</strong></div>
  `;
}

function buildIdentitas(props) {
  const rows = IDENTITAS_KEYS.filter((key) => key in props)
    .map((key) => fieldRow(props, key))
    .join('');

  return `
    <div class="popup-section-title">IDENTITAS PETAK</div>
    <div class="petak-popup-grid">${rows}</div>
  `;
}

function seasonDetail(props, season, yy) {
  const keys = seasonKeys(props, season, yy);
  const hasData = keys.some((key) => displayValue(key, props[key]) !== null);
  if (!hasData) return `<span class="petak-popup-empty">${EMPTY_MARK}</span>`;

  return keys.map((key) => fieldRow(props, key)).join('');
}

function buildMusimTanam(props, activeYear) {
  const yy = activeYear.slice(-2);
  const seasons = [1, 2, 3]
    .map(
      (season) => `
        <div class="petak-popup-season">
          <div class="petak-popup-season-label">MT${season}</div>
          <div class="petak-popup-grid">${seasonDetail(props, season, yy)}</div>
        </div>
      `
    )
    .join('');

  return `
    <div class="popup-section-title">MUSIM TANAM ${activeYear}</div>
    ${seasons}
  `;
}

function buildRingkasan(props, activeYear) {
  const yy = activeYear.slice(-2);
  const rows = [`MT_${activeYear}_IP`, `MT${yy}_POLA`, 'KETERANGAN']
    .filter((key) => key in props)
    .map((key) => fieldRow(props, key))
    .join('');

  return `
    <div class="popup-section-title">RINGKASAN TAHUN</div>
    <div class="petak-popup-grid">${rows}</div>
  `;
}

function buildEditButton(props, fid) {
  const blanks = blankEditableKeys(props);
  if (!blanks.length || fid === undefined || fid === null) return '';
  return `
    <button type="button" class="attr-edit-btn" data-fid="${escapeHtml(fid)}">
      ${EDIT_ICON}<span>Lengkapi Data (${blanks.length} field kosong)</span>
    </button>
  `;
}

function buildFooter(props, lngLat, fid) {
  const direction = lngLat ? directionButtonHtml(lngLat.lat, lngLat.lng) : '';
  return `
    <div class="petak-popup-footer">Kondisi per ${fmtDateShort(new Date())}</div>
    ${buildEditButton(props, fid)}
    ${direction}
  `;
}

export function buildPopupHTML(props, lngLat, { fid } = {}) {
  const properties = props || {};
  const activeYear = getActiveYear(properties);

  return `
    <div class="petak-popup">
      ${buildHeader(properties)}
      ${buildIdentitas(properties)}
      ${buildMusimTanam(properties, activeYear)}
      ${buildRingkasan(properties, activeYear)}
      ${buildFooter(properties, lngLat, fid)}
    </div>
  `;
}
