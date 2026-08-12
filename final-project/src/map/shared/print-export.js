import { jsPDF } from 'jspdf';
import { lngLatToWebMercator } from '../../shared/geo.js';
import { fmtFileStamp, slugify } from '../../shared/format.js';
import { PRINT_DPI, paperSizeMm, prepareMapArtifacts, renderPrintLayout } from './print-layout.js';

const GEOPDF_ENDPOINT = import.meta.env.VITE_GEOPDF_API || '/api/geopdf';
const JPEG_QUALITY = 0.92;

// GeoPDF dibuat dari citra Web Mercator apa adanya, jadi georeferensinya
// dititipkan pada EPSG:3857 — tepat, tanpa perlu resampling di sisi server.
const GEOPDF_EPSG = 3857;

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal mengubah kanvas menjadi berkas.'))),
      type,
      quality
    );
  });
}

function fileNameFor(title, extension) {
  return `${slugify(title)}-${fmtFileStamp()}.${extension}`;
}

async function exportImage(canvas, { title, imageFormat }) {
  const isJpeg = imageFormat === 'jpeg';
  const blob = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? JPEG_QUALITY : undefined);
  downloadBlob(blob, fileNameFor(title, isJpeg ? 'jpg' : 'png'));
}

async function exportPdf(canvas, { title, author, paper, orientation }) {
  const page = paperSizeMm(paper, orientation);
  const pdf = new jsPDF({ orientation, unit: 'mm', format: paper.toLowerCase(), compress: true });

  pdf.setProperties({ title, author: author || '', creator: 'WebGIS LBS DIY' });
  pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, page.width, page.height, undefined, 'FAST');
  downloadBlob(pdf.output('blob'), fileNameFor(title, 'pdf'));
}

async function exportGeoPdf(canvas, mapFace, bounds, { title, author }) {
  const imageBlob = await canvasToBlob(canvas, 'image/png');

  const [west, south] = lngLatToWebMercator(bounds.getWest(), bounds.getSouth());
  const [east, north] = lngLatToWebMercator(bounds.getEast(), bounds.getNorth());

  // Halaman utuh dikirim, disertai kotak muka peta dalam piksel. Server memakai
  // itu untuk memasang neatline: koordinat hanya berlaku di dalam muka peta,
  // sementara kop dan legenda tetap ikut tercetak sebagai collar.
  const query = new URLSearchParams({
    west, south, east, north,
    epsg: GEOPDF_EPSG,
    dpi: PRINT_DPI,
    pageW: canvas.width,
    pageH: canvas.height,
    mapX: mapFace.x,
    mapY: mapFace.y,
    mapW: mapFace.w,
    mapH: mapFace.h,
    title,
    author: author || ''
  });

  let response;
  try {
    response = await fetch(`${GEOPDF_ENDPOINT}?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: imageBlob
    });
  } catch {
    throw new Error(
      `Tidak dapat menghubungi layanan GeoPDF di ${GEOPDF_ENDPOINT}. ` +
        'Pastikan server berjalan (npm run dev, atau npm run server).'
    );
  }

  if (!response.ok) {
    throw new Error((await response.text()) || `Layanan GeoPDF gagal (HTTP ${response.status}).`);
  }

  downloadBlob(await response.blob(), fileNameFor(`${title}-avenza`, 'pdf'));
}

/**
 * Satu pintu masuk untuk ketiga jenis ekspor. Penangkapan peta beresolusi
 * cetak dan pembuatan legenda dikerjakan sekali di sini, lalu hasilnya dipakai
 * ulang oleh masing-masing format keluaran.
 */
export async function runExport(map, settings, kind) {
  const artifacts = await prepareMapArtifacts(map, settings);
  const { canvas, mapFace } = renderPrintLayout({ ...artifacts, ...settings });

  if (kind === 'geopdf') return exportGeoPdf(canvas, mapFace, artifacts.bounds, settings);
  return kind === 'pdf' ? exportPdf(canvas, settings) : exportImage(canvas, settings);
}
