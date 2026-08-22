import { downloadBlob } from '../../shared/download.js';

const BOM = '﻿';
const SEPARATOR = ',';
const NEWLINE = '\r\n';

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

export const EXPORT_FORMATS = [
  { key: 'csv', label: 'Export to CSV', enabled: true, run: exportCsv },
  { key: 'json', label: 'Export to JSON', enabled: false },
  { key: 'geojson', label: 'Export to GeoJSON', enabled: false },
  { key: 'shp', label: 'Export to Shapefile', enabled: false },
  { key: 'fgdb', label: 'Export to FGDB', enabled: false },
  { key: 'kml', label: 'Export to KML', enabled: false },
  { key: 'gpkg', label: 'Export to GPKG', enabled: false }
];
