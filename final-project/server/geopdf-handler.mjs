import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const GEOPDF_ROUTE = '/api/geopdf';

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const GDAL_TIMEOUT_MS = 120000;
const EXE = process.platform === 'win32' ? '.exe' : '';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------- gdal */

function qgisCandidates() {
  if (process.platform !== 'win32') return [];
  const roots = ['C:\\OSGeo4W', 'C:\\Program Files', 'C:\\Program Files (x86)'];
  const found = [];

  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (existsSync(path.join(root, 'bin', `gdal_translate${EXE}`))) {
      found.push({ bin: path.join(root, 'bin'), home: root });
    }
    for (const entry of readdirSync(root)) {
      if (!/^QGIS/i.test(entry)) continue;
      const home = path.join(root, entry);
      if (existsSync(path.join(home, 'bin', `gdal_translate${EXE}`))) {
        found.push({ bin: path.join(home, 'bin'), home });
      }
    }
  }
  // Versi terbaru lebih dulu, supaya tidak nyangkut di instalasi lama.
  return found.reverse();
}

function envForGdalHome(home) {
  const env = {};
  const gdalData = [
    path.join(home, 'apps', 'gdal', 'share', 'gdal'),
    path.join(home, 'share', 'gdal')
  ].find(existsSync);
  const projLib = [
    path.join(home, 'share', 'proj'),
    path.join(home, 'apps', 'proj', 'share', 'proj')
  ].find(existsSync);

  if (gdalData) env.GDAL_DATA = gdalData;
  if (projLib) env.PROJ_LIB = projLib;
  return env;
}

let gdalPromise = null;

/**
 * Mencari gdal_translate: hormati GDAL_BIN kalau diset, lalu PATH, lalu
 * instalasi QGIS/OSGeo4W bawaan Windows (yang sudah memaketkan GDAL).
 */
function resolveGdal() {
  gdalPromise ||= (async () => {
    const candidates = [];

    if (process.env.GDAL_BIN) {
      candidates.push({ bin: process.env.GDAL_BIN, home: path.dirname(process.env.GDAL_BIN) });
    }
    candidates.push({ bin: null, home: null });
    candidates.push(...qgisCandidates());

    for (const candidate of candidates) {
      const translate = candidate.bin
        ? path.join(candidate.bin, `gdal_translate${EXE}`)
        : `gdal_translate${EXE}`;
      const env = candidate.home ? { ...process.env, ...envForGdalHome(candidate.home) } : process.env;
      try {
        const { stdout } = await run(translate, ['--version'], { env, timeout: 15000 });
        return { translate, env, version: stdout.trim() };
      } catch {
        // Coba kandidat berikutnya.
      }
    }

    throw new HttpError(
      503,
      'GDAL tidak ditemukan di server. Pasang GDAL (paket gdal-bin / OSGeo4W / QGIS) ' +
        'atau set variabel lingkungan GDAL_BIN ke folder yang berisi gdal_translate.'
    );
  })();
  return gdalPromise;
}

export async function gdalVersion() {
  const { version } = await resolveGdal();
  return version;
}

/* ---------------------------------------------------------------- request */

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) throw new HttpError(413, 'Gambar peta melebihi batas 64 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requireNumber(params, key) {
  const value = Number(params.get(key));
  if (!Number.isFinite(value)) throw new HttpError(400, `Parameter "${key}" tidak valid.`);
  return value;
}

const cleanMeta = (value) => (value || '').replace(/[\r\n]+/g, ' ').slice(0, 200);

/**
 * Halaman yang dikirim berisi layout penuh, tetapi hanya muka peta yang punya
 * koordinat. Georeferensi karena itu dihitung dari kotak muka peta lalu
 * dibentangkan ke seluruh halaman, dan batas sahihnya ditandai dengan neatline
 * — pola yang sama dipakai GeoPDF topografi USGS, dan dikenali Avenza Maps.
 */
function pageGeoreference(bbox, page) {
  const pixelSizeX = (bbox.east - bbox.west) / page.mapW;
  const pixelSizeY = (bbox.north - bbox.south) / page.mapH;

  const ulx = bbox.west - page.mapX * pixelSizeX;
  const uly = bbox.north + page.mapY * pixelSizeY;

  return {
    ulx,
    uly,
    lrx: ulx + page.pageW * pixelSizeX,
    lry: uly - page.pageH * pixelSizeY
  };
}

const neatlineWkt = ({ west, south, east, north }) =>
  `POLYGON ((${west} ${north},${west} ${south},${east} ${south},${east} ${north},${west} ${north}))`;

async function buildGeoPdf(pngBuffer, params) {
  const bbox = {
    west: requireNumber(params, 'west'),
    south: requireNumber(params, 'south'),
    east: requireNumber(params, 'east'),
    north: requireNumber(params, 'north')
  };
  const epsg = Math.trunc(requireNumber(params, 'epsg'));
  const dpi = Math.min(1200, Math.max(72, Math.trunc(Number(params.get('dpi')) || 300)));

  if (bbox.west === bbox.east || bbox.south === bbox.north) {
    throw new HttpError(400, 'Bounding box peta kosong.');
  }

  const page = {
    pageW: requireNumber(params, 'pageW'),
    pageH: requireNumber(params, 'pageH'),
    mapX: requireNumber(params, 'mapX'),
    mapY: requireNumber(params, 'mapY'),
    mapW: requireNumber(params, 'mapW'),
    mapH: requireNumber(params, 'mapH')
  };

  if (!(page.mapW > 0) || !(page.mapH > 0)) {
    throw new HttpError(400, 'Ukuran muka peta tidak valid.');
  }
  if (page.mapX < 0 || page.mapY < 0 ||
      page.mapX + page.mapW > page.pageW || page.mapY + page.mapH > page.pageH) {
    throw new HttpError(400, 'Kotak muka peta berada di luar halaman.');
  }

  const { ulx, uly, lrx, lry } = pageGeoreference(bbox, page);
  const { translate, env } = await resolveGdal();
  const workDir = await mkdtemp(path.join(tmpdir(), 'geopdf-'));

  try {
    const pngPath = path.join(workDir, 'map.png');
    const tifPath = path.join(workDir, 'map.tif');
    const pdfPath = path.join(workDir, 'map.pdf');
    await writeFile(pngPath, pngBuffer);

    // 1) Tanamkan georeferensi seluruh halaman ke GeoTIFF antara. Kanal alpha
    //    dari kanvas dibuang: halaman sudah beralas putih, dan JPEG di langkah
    //    berikutnya tidak menerima 4 kanal.
    await run(
      translate,
      [
        '-q', '-of', 'GTiff',
        '-b', '1', '-b', '2', '-b', '3',
        '-a_srs', `EPSG:${epsg}`,
        '-a_ullr', String(ulx), String(uly), String(lrx), String(lry),
        pngPath, tifPath
      ],
      { env, timeout: GDAL_TIMEOUT_MS }
    );

    // 2) Konversi ke Geospatial PDF. GDAL >= 3.10 menghapus GEO_ENCODING=OGC_BP,
    //    jadi dipakai ISO32000 — format georeferensi PDF yang juga dibaca Avenza Maps.
    //    Kompresi dibiarkan DEFLATE (bawaan): diukur 4x lebih kecil daripada
    //    JPEG untuk halaman seperti ini — collar putih yang luas tertekan nyaris
    //    habis — sekaligus lossless, jadi teks legenda dan garis grid tetap tajam.
    const creationOptions = [
      '-co', 'GEO_ENCODING=ISO32000',
      '-co', `DPI=${dpi}`,
      '-co', `NEATLINE=${neatlineWkt(bbox)}`
    ];
    const title = cleanMeta(params.get('title'));
    const author = cleanMeta(params.get('author'));
    if (title) creationOptions.push('-co', `TITLE=${title}`);
    if (author) creationOptions.push('-co', `AUTHOR=${author}`);

    await run(translate, ['-q', '-of', 'PDF', ...creationOptions, tifPath, pdfPath], {
      env,
      timeout: GDAL_TIMEOUT_MS
    });

    return await readFile(pdfPath);
  } finally {
    // Berkas sementara selalu dibuang, termasuk saat GDAL gagal di tengah jalan.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Handler bergaya connect (req, res, next) supaya bisa dipasang apa adanya di
 * middleware Vite saat pengembangan maupun di server Node mandiri.
 */
export function geoPdfHandler(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== GEOPDF_ROUTE) return next();

  const fail = (status, message) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(message);
  };

  if (req.method !== 'POST') return fail(405, 'Gunakan POST dengan body berisi PNG peta.');

  (async () => {
    const pngBuffer = await readBody(req);
    if (!pngBuffer.length) throw new HttpError(400, 'Body kosong — gambar peta tidak terkirim.');

    const pdf = await buildGeoPdf(pngBuffer, url.searchParams);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', 'attachment; filename="peta-avenza.pdf"');
    res.end(pdf);
  })().catch((err) => {
    if (err instanceof HttpError) return fail(err.status, err.message);
    console.error('[geopdf]', err);
    fail(500, `Gagal membuat GeoPDF: ${err.stderr || err.message}`);
  });
}
