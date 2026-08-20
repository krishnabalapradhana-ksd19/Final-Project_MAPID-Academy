import { PDFDocument } from 'pdf-lib';
import { fmtFileStamp, slugify } from '../../shared/format.js';
import { downloadBlob } from '../../shared/download.js';
import { prepareMapArtifacts, renderPrintLayout } from './print-layout.js';
import { attachGeoreference, mmToPdfUnits } from './geopdf.js';

const JPEG_QUALITY = 0.92;

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

async function exportPdf(canvas, page, mapFaceMm, bounds, { title, author }) {
  const jpegBytes = await (await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)).arrayBuffer();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title || 'Peta');
  pdfDoc.setAuthor(author || '');
  pdfDoc.setCreator('WebGIS LBS DIY');
  pdfDoc.setProducer('WebGIS LBS DIY');

  const pdfPage = pdfDoc.addPage([mmToPdfUnits(page.width), mmToPdfUnits(page.height)]);
  const image = await pdfDoc.embedJpg(jpegBytes);
  pdfPage.drawImage(image, {
    x: 0,
    y: 0,
    width: mmToPdfUnits(page.width),
    height: mmToPdfUnits(page.height)
  });

  attachGeoreference(pdfDoc, pdfPage, mapFaceMm, page.height, bounds);

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), fileNameFor(title, 'pdf'));
}

export async function runExport(map, settings, kind) {
  const artifacts = await prepareMapArtifacts(map, settings);
  const { canvas, page, mapFaceMm } = renderPrintLayout({ ...artifacts, ...settings });

  if (kind !== 'pdf') return exportImage(canvas, settings);

  const b = artifacts.bounds;
  return exportPdf(canvas, page, mapFaceMm, {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth()
  }, settings);
}
