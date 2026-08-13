import { escapeHtml } from './feature-popup.js';
import { fmtNumber } from '../../shared/format.js';

const fmtDateShort = (date) =>
  [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, i) => (i < 2 ? String(part).padStart(2, '0') : part))
    .join('/');

const safe = (val) => (val === null || val === undefined || val === '' ? '-' : escapeHtml(val));

const getActiveYear = (props) => {
  const ipKey = Object.keys(props || {}).find((key) => /^MT_\d{4}_IP$/.test(key));
  return ipKey ? ipKey.match(/^MT_(\d{4})_IP$/)[1] : String(new Date().getFullYear());
};

function identityRow(label, value) {
  return `
    <div class="petak-popup-row">
      <span class="petak-popup-label">${escapeHtml(label)}</span>
      <span class="petak-popup-value">${value}</span>
    </div>
  `;
}

function buildHeader(props) {
  return `
    <div class="petak-popup-title">${safe(props.ID_PETAK)}</div>
    <div class="petak-popup-subtitle">Pemanfaatan hari ini: <strong>${safe(props.KOND_SKRNG)}</strong></div>
  `;
}

function buildIdentitas(props) {
  const luas = props.LUAS === null || props.LUAS === undefined ? '-' : `${fmtNumber(props.LUAS, 2)} ha`;
  const rows = [
    ['Kecamatan', safe(props.WADMKC)],
    ['Desa', safe(props.WADMKD)],
    ['Poktan', safe(props.POKTAN)],
    ['Luas', luas],
    ['Jenis Lahan', safe(props.JNS_LAHAN)],
    ['Jenis Sawah', safe(props.JNS_SAWAH)],
    ['Penggarap', safe(props.PENGGARAP)],
    ['Pemilik', safe(props.PEMILIK)],
    ['Penyuluh', safe(props.PENYULUH)]
  ];

  return `
    <div class="popup-section-title">IDENTITAS PETAK</div>
    <div class="petak-popup-grid">${rows.map(([label, value]) => identityRow(label, value)).join('')}</div>
  `;
}

function seasonDetail(props, season, yy) {
  const komo = props[`M${season}_${yy}_KOMO`];
  const tnm = props[`M${season}_${yy}_TNM`];
  const pnn = props[`M${season}_${yy}_PNN`];
  const stat = props[`M${season}_${yy}_STAT`];

  const hasData = [komo, tnm, stat].some((val) => val !== null && val !== undefined);
  if (!hasData) return '<span class="petak-popup-empty">belum ada data</span>';

  return [
    ['Komoditas', safe(komo)],
    ['Tanggal Tanam', safe(tnm)],
    ['Tanggal Panen', safe(pnn)],
    ['Status', safe(stat)]
  ]
    .map(([label, value]) => identityRow(label, value))
    .join('');
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
  const rows = [
    [`IP ${activeYear}`, safe(props[`MT_${activeYear}_IP`])],
    ['Pola Tanam', safe(props[`MT${yy}_POLA`])],
    ['Keterangan', safe(props.KETERANGAN)]
  ];

  return `
    <div class="popup-section-title">RINGKASAN TAHUN</div>
    <div class="petak-popup-grid">${rows.map(([label, value]) => identityRow(label, value)).join('')}</div>
  `;
}

function buildFooter() {
  return `<div class="petak-popup-footer">Kondisi per ${fmtDateShort(new Date())}</div>`;
}

export function buildPopupHTML(props) {
  const properties = props || {};
  const activeYear = getActiveYear(properties);

  return `
    <div class="petak-popup">
      ${buildHeader(properties)}
      ${buildIdentitas(properties)}
      ${buildMusimTanam(properties, activeYear)}
      ${buildRingkasan(properties, activeYear)}
      ${buildFooter()}
    </div>
  `;
}
