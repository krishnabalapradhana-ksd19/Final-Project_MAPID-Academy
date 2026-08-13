import { escapeHtml, directionButtonHtml } from './feature-popup.js';
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
  const prefix = `M${season}_${yy}_`;
  const rows = [
    ['Komoditas', 'KOMO'],
    ['Tanggal Tanam', 'TNM'],
    ['Tanggal Panen', 'PNN'],
    ['Status', 'STAT'],
    ['Pupuk Urea', 'UREA'],
    ['Pupuk NPK', 'NPK'],
    ['Pupuk SP36', 'SP36'],
    ['Pupuk ZA', 'ZA'],
    ['Pupuk Organik', 'ORGN'],
    ['Hama/Penyakit', 'HPTK'],
    ['Produksi (volume)', 'PRDV'],
    ['Produksi (kg)', 'PRDK']
  ]
    .filter(([, suffix]) => prefix + suffix in props)
    .map(([label, suffix]) => [label, props[prefix + suffix]]);

  const hasData = rows.some(([, value]) => value !== null && value !== undefined && value !== 0);
  if (!hasData) return '<span class="petak-popup-empty">belum ada data</span>';

  return rows.map(([label, value]) => identityRow(label, safe(value))).join('');
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

function buildFooter(lngLat) {
  const direction = lngLat ? directionButtonHtml(lngLat.lat, lngLat.lng) : '';
  return `<div class="petak-popup-footer">Kondisi per ${fmtDateShort(new Date())}</div>${direction}`;
}

export function buildPopupHTML(props, lngLat) {
  const properties = props || {};
  const activeYear = getActiveYear(properties);

  return `
    <div class="petak-popup">
      ${buildHeader(properties)}
      ${buildIdentitas(properties)}
      ${buildMusimTanam(properties, activeYear)}
      ${buildRingkasan(properties, activeYear)}
      ${buildFooter(lngLat)}
    </div>
  `;
}
