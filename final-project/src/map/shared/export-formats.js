/**
 * Daftar format export data petak + implementasinya.
 *
 * Satu-satunya sumber kebenaran untuk menu Export: UI di export-tool.js hanya
 * melakukan loop atas EXPORT_FORMATS, jadi menambah/mengaktifkan format cukup
 * disentuh di berkas ini.
 *
 * CARA MENGAKTIFKAN FORMAT BARU:
 *   1. tulis handler-nya: (rows, baseName) => void
 *   2. pasang di entri format terkait: enabled: true, run: handlerBaru
 * Tombol otomatis hidup di UI, tidak ada markup yang perlu diubah.
 */
import { downloadBlob } from '../../shared/download.js';

/** Excel di Windows butuh BOM agar UTF-8 (nama desa, dsb) tidak jadi mojibake. */
const BOM = '\uFEFF';
const SEPARATOR = ',';
const NEWLINE = '\r\n';

/** Kolom = gabungan seluruh kunci pada baris, urut sesuai kemunculan pertama. */
function collectColumns(rows) {
  const columns = [];
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      columns.push(key);
    });
  });
  return columns;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /["\r\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRow = (values) => values.map(csvCell).join(SEPARATOR);

export function toCsv(rows) {
  const columns = collectColumns(rows);
  return [csvRow(columns), ...rows.map((row) => csvRow(columns.map((key) => row[key])))].join(NEWLINE);
}

function exportCsv(rows, baseName) {
  const blob = new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${baseName}.csv`);
}

/**
 * `enabled: false` = tombol tetap tampil tapi non-aktif (belum diimplementasikan).
 * Konversi Shapefile/FGDB/KML/GPKG butuh dependency berat, jadi sengaja ditunda.
 */
export const EXPORT_FORMATS = [
  { key: 'csv', label: 'Export to CSV', enabled: true, run: exportCsv },
  { key: 'json', label: 'Export to JSON', enabled: false },
  { key: 'geojson', label: 'Export to GeoJSON', enabled: false },
  { key: 'shp', label: 'Export to Shapefile', enabled: false },
  { key: 'fgdb', label: 'Export to FGDB', enabled: false },
  { key: 'kml', label: 'Export to KML', enabled: false },
  { key: 'gpkg', label: 'Export to GPKG', enabled: false }
];
