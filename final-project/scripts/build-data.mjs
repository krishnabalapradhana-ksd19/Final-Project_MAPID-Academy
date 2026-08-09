// Build-time data pipeline: memecah geojson mentah (301 MB, seluruh DIY) jadi
// satu file kecil per kabupaten + satu file statistik pra-hitung per kabupaten.
// Dijalankan otomatis lewat npm "pre" hooks (lihat package.json) sebelum
// `vite dev` / `vite build`, supaya frontend tidak pernah lagi mengunduh &
// mem-parse file mentah di browser.
//
// Kenapa di Node, bukan di browser: 301 MB hanya perlu diproses SEKALI saat
// build, hasilnya (kecil) yang dikonsumsi berkali-kali oleh pengunjung.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// Sumber mentah TIDAK diletakkan di public/ (supaya tidak ikut ter-deploy
// 301 MB-nya) — hanya dipakai saat build untuk menghasilkan file kecil di
// public/data/generated/. Berkas mentah ini adalah cadangan; jangan dihapus.
const RAW_PATH = path.join(ROOT, 'data-raw', 'LBS_DIY_66871HA.geojson');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'generated');

// WGS84 geografis -> UTM 49S (EPSG:32749), satu-satunya proyeksi metrik yang
// dipakai untuk MENGHITUNG LUAS. Penyajian peta tetap EPSG:4326 (tidak berubah).
const toUtm49S = proj4('EPSG:4326', '+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs');

const KABUPATEN = [
  { name: 'Bantul', slug: 'bantul' },
  { name: 'Gunungkidul', slug: 'gunungkidul' },
  { name: 'Kulon Progo', slug: 'kulon-progo' },
  { name: 'Sleman', slug: 'sleman' },
  { name: 'Kota Yogyakarta', slug: 'yogyakarta' }
];

const COORD_PRECISION = 6; // ~0.11 m di ekuator, cukup untuk batas persil

function roundCoord(n) {
  return Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION;
}

// Buang dimensi Z (sisa export sumber data, tidak dipakai render 2D) dan
// pangkas presisi. Bekerja rekursif untuk Polygon/MultiPolygon.
function cleanCoords(coords) {
  if (typeof coords[0] === 'number') {
    return [roundCoord(coords[0]), roundCoord(coords[1])];
  }
  return coords.map(cleanCoords);
}

// Luas ring poligon (shoelace) dalam meter persegi, pada koordinat yang SUDAH diproyeksikan.
function ringAreaMeters(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function polygonAreaMeters(rings) {
  // ring pertama = outer, sisanya = lubang (dikurangi)
  return rings.reduce((acc, ring, i) => {
    const projected = ring.map(([lon, lat]) => toUtm49S.forward([lon, lat]));
    const area = ringAreaMeters(projected);
    return i === 0 ? acc + area : acc - area;
  }, 0);
}

// Luas feature (m²) dihitung dari geometri asli yang diproyeksikan ke UTM 49S —
// BUKAN dari field Shape_Area sumber, dan bukan dari koordinat derajat mentah.
function featureAreaMeters(geometry) {
  if (geometry.type === 'Polygon') {
    return polygonAreaMeters(geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((acc, poly) => acc + polygonAreaMeters(poly), 0);
  }
  return 0;
}

function bboxOfFeatures(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      coords.forEach(walk);
    }
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return [[minX, minY], [maxX, maxY]];
}

function isUpToDate() {
  if (!existsSync(OUT_DIR)) return false;
  const rawTime = statSync(RAW_PATH).mtimeMs;
  return KABUPATEN.every(({ slug }) => {
    const geoPath = path.join(OUT_DIR, `lbs-${slug}.geojson`);
    const statsPath = path.join(OUT_DIR, `stats-lbs-${slug}.json`);
    return (
      existsSync(geoPath) &&
      existsSync(statsPath) &&
      statSync(geoPath).mtimeMs >= rawTime &&
      statSync(statsPath).mtimeMs >= rawTime
    );
  });
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function main() {
  if (!existsSync(RAW_PATH)) {
    console.error(
      `[build-data] Berkas sumber tidak ditemukan: ${RAW_PATH}\n` +
        '[build-data] Lewati generasi data — pastikan LBS_DIY_66871HA.geojson sudah diunduh ' +
        '(lihat google-drive-integration/download-geojson.js) sebelum build.'
    );
    process.exitCode = 0; // jangan gagalkan dev/build lokal kalau file mentah belum ada
    return;
  }

  if (process.argv.includes('--force') === false && isUpToDate()) {
    console.log('[build-data] Data hasil generate sudah up-to-date, lewati (pakai --force untuk paksa ulang).');
    return;
  }

  console.log(`[build-data] Membaca ${RAW_PATH} (${formatMB(statSync(RAW_PATH).size)} MB)...`);
  const t0 = Date.now();
  const raw = JSON.parse(readFileSync(RAW_PATH, 'utf-8'));
  console.log(`[build-data] Parse selesai dalam ${Date.now() - t0} ms, ${raw.features.length} feature total.`);

  mkdirSync(OUT_DIR, { recursive: true });

  const report = [];

  for (const { name, slug } of KABUPATEN) {
    // Popup detail bidang menampilkan SELURUH kolom atribut (fitur yang sudah
    // ada, dipertahankan) — tapi 51 kolom itu (banyak berisi teks
    // musim-tanam M1_26_*/M2_26_*/M3_26_* yang panjang) ternyata JUSTRU lebih
    // berat (~30 MB) daripada geometrinya sendiri (~20 MB) untuk kabupaten
    // besar. Jadi keduanya dipisah: file utama hanya bawa properti yang
    // dipakai render peta (WADMKC untuk warna/filter) + kunci `_fid` untuk
    // menghubungkan ke atribut lengkap, yang dimuat terpisah & tidak
    // memblokir tampilnya poligon.
    const rawFeatures = raw.features.filter((f) => f.properties.WADMKK === name);
    const features = rawFeatures.map((f, idx) => ({
      type: 'Feature',
      properties: { WADMKC: f.properties.WADMKC, _fid: idx },
      geometry: {
        type: f.geometry.type,
        coordinates: cleanCoords(f.geometry.coordinates)
      }
    }));

    const kecOrder = [...new Set(features.map((f) => f.properties.WADMKC))].sort();
    const byKec = {};
    kecOrder.forEach((kec) => {
      byKec[kec] = { luasHa: 0, jumlahBidang: 0, bbox: null };
    });

    let totalLuasHa = 0;
    const kecFeatureIndexes = {};
    kecOrder.forEach((k) => (kecFeatureIndexes[k] = []));

    // Atribut lengkap (semua kolom asli) dipisah dari geometri, diindeks
    // lewat `_fid` (posisi array) — dipakai popup detail bidang, dimuat lazy.
    const attrs = new Array(features.length);
    const luasM2ByFeature = new Array(features.length);

    features.forEach((f, idx) => {
      const luasM2 = featureAreaMeters(f.geometry);
      const luasHa = luasM2 / 10000;
      luasM2ByFeature[idx] = luasM2;
      attrs[idx] = { ...rawFeatures[idx].properties, LUAS_M2_UTM49S: Math.round(luasM2 * 100) / 100 };
      totalLuasHa += luasHa;
      const kec = f.properties.WADMKC;
      if (byKec[kec]) {
        byKec[kec].luasHa += luasHa;
        byKec[kec].jumlahBidang += 1;
        kecFeatureIndexes[kec].push(idx);
      }
    });

    kecOrder.forEach((kec) => {
      const idxs = kecFeatureIndexes[kec];
      byKec[kec].bbox = idxs.length ? bboxOfFeatures(idxs.map((i) => features[i])) : null;
      byKec[kec].luasHa = Math.round(byKec[kec].luasHa * 100) / 100;
      byKec[kec].persenDariKabupaten = totalLuasHa ? Math.round((byKec[kec].luasHa / totalLuasHa) * 1000) / 10 : 0;
      byKec[kec].rataRataHa = byKec[kec].jumlahBidang
        ? Math.round((byKec[kec].luasHa / byKec[kec].jumlahBidang) * 100) / 100
        : 0;
    });

    const stats = {
      generatedAt: new Date().toISOString(),
      kabupaten: name,
      proyeksiLuas: 'EPSG:32749 (UTM 49S)',
      totalLuasHa: Math.round(totalLuasHa * 100) / 100,
      jumlahBidang: features.length,
      rataRataHa: features.length ? Math.round((totalLuasHa / features.length) * 100) / 100 : 0,
      bbox: features.length ? bboxOfFeatures(features) : null,
      kecamatan: kecOrder,
      byKecamatan: byKec
    };

    const geojson = { type: 'FeatureCollection', features };
    const geoOut = path.join(OUT_DIR, `lbs-${slug}.geojson`);
    const statsOut = path.join(OUT_DIR, `stats-lbs-${slug}.json`);
    const attrsOut = path.join(OUT_DIR, `attrs-lbs-${slug}.json`);

    writeFileSync(geoOut, JSON.stringify(geojson));
    writeFileSync(statsOut, JSON.stringify(stats));
    writeFileSync(attrsOut, JSON.stringify(attrs));

    report.push({
      kabupaten: name,
      slug,
      feature: features.length,
      geoMB: formatMB(statSync(geoOut).size),
      attrsMB: formatMB(statSync(attrsOut).size),
      statsKB: (statSync(statsOut).size / 1024).toFixed(1)
    });
  }

  console.log('\n[build-data] Ringkasan hasil generate:');
  console.table(
    report.map((r) => ({
      Kabupaten: r.kabupaten,
      Feature: r.feature,
      'GeoJSON poligon (MB)': r.geoMB,
      'Atribut lazy (MB)': r.attrsMB,
      'Stats (KB)': r.statsKB
    }))
  );
}

main();
