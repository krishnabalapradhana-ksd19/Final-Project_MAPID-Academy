import proj4 from 'proj4';
import {
  lngLatToWebMercator,
  metersPerPixel,
  niceRoundNumber,
  printScaleDenominator,
  utmProj4,
  utmZoneInfo,
  zoomForGroundWidth
} from '../../shared/geo.js';
import { fmtDateId, fmtScale } from '../../shared/format.js';

const WGS84 = 'EPSG:4326';

export const PAPER_SIZES = {
  A4: { label: 'A4', width: 210, height: 297 },
  A3: { label: 'A3', width: 297, height: 420 }
};

const PRINT_DPI = 300;

const MM_PER_INCH = 25.4;
const INSET_ZOOM_OUT_FACTOR = 8;
const INSET_ASPECT = 0.62;
const PANEL_INSET_MM = 3;
const IDLE_TIMEOUT_MS = 30000;

const INK = '#14140f';
const MUTED = '#52514e';

const pxPerMm = (dpi = PRINT_DPI) => dpi / MM_PER_INCH;

export function paperSizeMm(paper, orientation) {
  const { width, height } = PAPER_SIZES[paper] || PAPER_SIZES.A4;
  return orientation === 'landscape' ? { width: height, height: width } : { width, height };
}

const MARGIN_MM = 5;
const PAD_MM = 1.4;
const CONTENT_INSET_MM = 1.6;
const GAP_MM = 2.5;
const GRID_BAND_MM = 5;
const PANEL_MAX_MM = 62;
const PANEL_RATIO = 0.24;

function pageGeometry(paper, orientation) {
  const page = paperSizeMm(paper, orientation);
  const origin = MARGIN_MM + PAD_MM + CONTENT_INSET_MM;
  const content = {
    x: origin,
    y: origin,
    w: page.width - origin * 2,
    h: page.height - origin * 2
  };
  const panelW = Math.min(PANEL_MAX_MM, content.w * PANEL_RATIO);
  const mapBox = { x: content.x, y: content.y, w: content.w - panelW - GAP_MM, h: content.h };
  const inner = {
    x: mapBox.x + GRID_BAND_MM,
    y: mapBox.y + GRID_BAND_MM,
    w: mapBox.w - GRID_BAND_MM * 2,
    h: mapBox.h - GRID_BAND_MM * 2
  };
  const panel = { x: content.x + mapBox.w + GAP_MM, y: content.y, w: panelW, h: content.h };
  return { page, content, mapBox, inner, panel, band: GRID_BAND_MM };
}
function waitForIdle(map) {
  return new Promise((resolve) => {
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      map.off('idle', finish);
      resolve();
    };
    timer = setTimeout(finish, IDLE_TIMEOUT_MS);
    map.on('idle', finish);
  });
}
async function captureMapImage(map, { widthPx, heightPx, groundWidthM }) {
  const container = map.getContainer();
  const savedStyle = container.getAttribute('style') || '';
  const savedCamera = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch()
  };
  const savedProjection = map.getProjection?.();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = widthPx / dpr;
  const cssHeight = heightPx / dpr;
  const { lat } = savedCamera.center;
  try {
    container.style.cssText =
      `${savedStyle};position:fixed;left:0;top:0;right:auto;bottom:auto;` +
      `width:${cssWidth}px;height:${cssHeight}px;z-index:0;`;
    map.setProjection({ type: 'mercator' });
    map.resize();
    map.jumpTo({
      center: savedCamera.center,
      zoom: zoomForGroundWidth(lat, groundWidthM, cssWidth),
      bearing: 0,
      pitch: 0
    });
    await waitForIdle(map);
    const canvas = map.getCanvas();
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      throw new Error(
        'Kanvas peta tidak dapat dibaca karena ubin basemap tidak mengizinkan CORS. ' +
          'Coba ganti basemap ke OpenStreetMap atau Esri lalu ekspor ulang.'
      );
    }
    return { image: await loadImage(dataUrl), bounds: map.getBounds() };
  } finally {
    container.setAttribute('style', savedStyle);
    if (savedProjection) map.setProjection(savedProjection);
    map.resize();
    map.jumpTo(savedCamera);
  }
}
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src.slice(0, 64)}`));
    img.src = src;
  });
}
function groundWidthOf(map) {
  return metersPerPixel(map.getCenter().lat, map.getZoom()) * map.getContainer().clientWidth;
}

const SWATCH_PAINT = {
  fill: 'fill-color',
  line: 'line-color',
  circle: 'circle-color'
};
function filteredClassOf(filter) {
  if (!Array.isArray(filter) || filter[0] !== '==') return null;
  const [, lhs, value] = filter;
  const isPropertyLookup = Array.isArray(lhs) && lhs[0] === 'get';
  return isPropertyLookup && typeof value === 'string' ? value : null;
}

function swatchesFromPaint(value, filteredClass, collapse) {
  if (typeof value === 'string') return [{ label: null, color: value }];
  if (Array.isArray(value) && value[0] === 'match') {

    if (collapse) return [{ label: null, color: value[3] ?? value[value.length - 1] }];
    const entries = [];
    for (let i = 2; i < value.length - 1; i += 2) {
      const keys = Array.isArray(value[i]) ? value[i] : [value[i]];
      keys.forEach((key) => entries.push({ label: String(key), color: value[i + 1] }));
    }
    if (filteredClass) {
      const matched = entries.filter((entry) => entry.label === filteredClass);
      if (matched.length) return matched;
    }
    return entries;
  }
  return [{ label: null, color: '#9a9a9a' }];
}
function buildLegendModel(map) {
  const blocks = [];
  for (const id of map.getLayersOrder()) {
    const layer = map.getLayer(id);
    const label = layer?.metadata?.legendLabel;
    if (!label) continue;
    if (map.getLayoutProperty(id, 'visibility') === 'none') continue;
    if (layer.type === 'raster') {
      blocks.push({ label, items: [{ label: null, swatch: { type: 'raster' } }] });
      continue;
    }

    const paintKey = SWATCH_PAINT[layer.type];
    if (!paintKey) continue;

    try {
      if (map.queryRenderedFeatures({ layers: [id] }).length === 0) continue;
    } catch {
    }

    const opacity = map.getPaintProperty(id, `${layer.type}-opacity`);
    const swatches = swatchesFromPaint(
      map.getPaintProperty(id, paintKey),
      filteredClassOf(map.getFilter(id)),
      layer.metadata?.legendCollapse
    );
    blocks.push({
      label,
      items: swatches.map((swatch) => ({
        label: swatch.label,
        swatch: {
          type: layer.type,
          color: swatch.color,
          opacity: typeof opacity === 'number' ? opacity : 1
        }
      }))
    });
  }
  return blocks;
}
function rect(ctx, x, y, w, h, { fill, stroke, lineWidth = 0.3 } = {}) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, w, h);
  }
}
function setFont(ctx, sizeMm, weight = 400) {
  ctx.font = `${weight} ${sizeMm}px "Segoe UI", system-ui, sans-serif`;
}
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(ctx, text, x, y, { size = 3, weight = 400, color = INK, align = 'left', maxWidth = Infinity, lineHeight = 1.3, measureOnly = false } = {}) {
  setFont(ctx, size, weight);
  const lines = maxWidth === Infinity ? [String(text)] : wrapLines(ctx, text, maxWidth);
  if (!measureOnly) {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * size * lineHeight));
  }
  return lines.length * size * lineHeight;
}
function drawNorthArrow(ctx, cx, cy, size) {
  const h = size;
  const w = size * 0.42;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.lineTo(cx, cy + h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx, cy + h * 0.22);
  ctx.closePath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.25;
  ctx.stroke();
  drawText(ctx, 'U', cx, cy - h / 2 - size * 0.52, { size: size * 0.42, weight: 700, align: 'center' });
}
function drawScaleBar(ctx, x, y, maxWidth, metersPerMm) {
  const segments = 4;
  const total = niceRoundNumber(metersPerMm * maxWidth);
  const barWidth = total / metersPerMm;
  const segWidth = barWidth / segments;
  const barHeight = 2.2;
  const useKm = total >= 1000;
  const unit = useKm ? 'km' : 'm';
  const toUnit = (m) => (useKm ? m / 1000 : m);

  for (let i = 0; i < segments; i++) {
    rect(ctx, x + i * segWidth, y, segWidth, barHeight, {
      fill: i % 2 === 0 ? INK : '#ffffff',
      stroke: INK,
      lineWidth: 0.2
    });
  }
  for (let i = 0; i <= segments; i++) {
    const label = `${Number(toUnit((total / segments) * i).toFixed(2))}`;
    drawText(ctx, i === segments ? `${label} ${unit}` : label, x + i * segWidth, y + barHeight + 0.8, {
      size: 2.1,
      color: MUTED,
      align: i === segments ? 'right' : i === 0 ? 'left' : 'center'
    });
  }
}
function drawUtmGrid(ctx, box, inner, band, bounds, utm) {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const projection = utmProj4(utm.zone, utm.hemisphere === 'S');
  const toUtm = (lng, lat) => proj4(WGS84, projection, [lng, lat]);
  const toLngLat = (x, y) => proj4(projection, WGS84, [x, y]);
  const [, yNorth] = lngLatToWebMercator(west, north);
  const [, ySouth] = lngLatToWebMercator(west, south);
  const latToY = (lat) => {
    const [, y] = lngLatToWebMercator(west, lat);
    return inner.y + ((yNorth - y) / (yNorth - ySouth)) * inner.h;
  };
  const lngToX = (lng) => inner.x + ((lng - west) / (east - west)) * inner.w;
  rect(ctx, box.x, box.y, box.w, box.h, { fill: '#ffffff' });
  const corners = [toUtm(west, south), toUtm(east, south), toUtm(west, north), toUtm(east, north)];
  const eastings = corners.map((c) => c[0]);
  const northings = corners.map((c) => c[1]);
  const midEasting = (Math.min(...eastings) + Math.max(...eastings)) / 2;
  const midNorthing = (Math.min(...northings) + Math.max(...northings)) / 2;
  const stepE = niceRoundNumber((Math.max(...eastings) - Math.min(...eastings)) / 4);
  const stepN = niceRoundNumber((Math.max(...northings) - Math.min(...northings)) / 4);
  const tick = band * 0.3;
  const labelSize = 1.7;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.25;
  if (!(stepE > 0) || !(stepN > 0)) return;

  for (let e = Math.ceil(Math.min(...eastings) / stepE) * stepE; e <= Math.max(...eastings); e += stepE) {
    const x = lngToX(toLngLat(e, midNorthing)[0]);
    if (x < inner.x + 3 || x > inner.x + inner.w - 3) continue;

    ctx.beginPath();
    ctx.moveTo(x, inner.y);
    ctx.lineTo(x, inner.y - tick);
    ctx.moveTo(x, inner.y + inner.h);
    ctx.lineTo(x, inner.y + inner.h + tick);
    ctx.stroke();
    const label = String(Math.round(e));
    drawText(ctx, label, x, box.y + band - tick - labelSize * 1.3 - 0.3, {
      size: labelSize, align: 'center', color: MUTED
    });
    drawText(ctx, label, x, box.y + box.h - band + tick + 0.3, {
      size: labelSize, align: 'center', color: MUTED
    });
  }

  for (let n = Math.ceil(Math.min(...northings) / stepN) * stepN; n <= Math.max(...northings); n += stepN) {
    const y = latToY(toLngLat(midEasting, n)[1]);
    if (y < inner.y + 3 || y > inner.y + inner.h - 3) continue;
    ctx.beginPath();
    ctx.moveTo(inner.x, y);
    ctx.lineTo(inner.x - tick, y);
    ctx.moveTo(inner.x + inner.w, y);
    ctx.lineTo(inner.x + inner.w + tick, y);
    ctx.stroke();
    const label = String(Math.round(n));
    for (const anchorX of [box.x + band - tick - labelSize - 0.3, box.x + box.w - band + tick + 0.3]) {
      ctx.save();
      ctx.translate(anchorX, y);
      ctx.rotate(-Math.PI / 2);
      drawText(ctx, label, 0, 0, { size: labelSize, align: 'center', color: MUTED });
      ctx.restore();
    }
  }
}
function drawSwatch(ctx, x, y, size, swatch) {
  if (swatch.type === 'raster') {
    rect(ctx, x, y, size, size, { fill: '#dcdcd6', stroke: INK, lineWidth: 0.2 });
    return;
  }
  if (swatch.type === 'line') {
    ctx.strokeStyle = swatch.color;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y + size / 2);
    ctx.lineTo(x + size, y + size / 2);
    ctx.stroke();
    return;
  }
  if (swatch.type === 'circle') {
    ctx.fillStyle = swatch.color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.25;
    ctx.stroke();
    return;
  }
  ctx.globalAlpha = swatch.opacity ?? 1;
  rect(ctx, x, y, size, size, { fill: swatch.color });
  ctx.globalAlpha = 1;
  rect(ctx, x, y, size, size, { stroke: INK, lineWidth: 0.2 });
}
const SWATCH_MM = 3;
const LEGEND_HEADER_SIZE = 2.3;
const LEGEND_ITEM_SIZE = 2.2;
const LEGEND_COL_GAP_MM = 2;
const LEGEND_ROW_GAP_MM = 1;
const LEGEND_MAX_COLUMNS = 3;
const legendLabelX = (x) => x + SWATCH_MM + 2.5;
function measureLegendRows(ctx, blocks, width) {
  const rows = [];
  for (const block of blocks) {
    rows.push({
      type: 'header',
      label: block.label,
      height:
        drawText(ctx, block.label, 0, 0, {
          size: LEGEND_HEADER_SIZE, weight: 700, maxWidth: width, measureOnly: true
        }) + 0.6
    });
    for (const item of block.items) {
      const labelHeight = item.label
        ? drawText(ctx, item.label, 0, 0, {
            size: LEGEND_ITEM_SIZE, maxWidth: width - SWATCH_MM - 3, measureOnly: true
          })
        : 0;
      rows.push({ type: 'item', ...item, height: Math.max(SWATCH_MM, labelHeight) + LEGEND_ROW_GAP_MM });
    }
    rows.push({ type: 'gap', height: 1.2 });
  }
  return rows;
}
function fitsInColumns(rows, available, columns) {
  let column = 0;
  let y = 0;
  for (const row of rows) {
    if (y + row.height > available) {
      column += 1;
      if (column >= columns) return false;
      y = 0;
    }
    y += row.height;
  }
  return true;
}

function drawLegend(ctx, box, blocks) {
  drawText(ctx, 'KETERANGAN :', box.x, box.y, { size: 2.1, weight: 700 });
  const top = box.y + 4.4;
  const bottom = box.y + box.h;
  const available = bottom - top;
  let columns = 1;
  let columnWidth = box.w;
  let rows = measureLegendRows(ctx, blocks, columnWidth);
  for (let candidate = 1; candidate <= LEGEND_MAX_COLUMNS; candidate++) {
    columns = candidate;
    columnWidth = (box.w - (candidate - 1) * LEGEND_COL_GAP_MM) / candidate;
    rows = measureLegendRows(ctx, blocks, columnWidth);
    if (fitsInColumns(rows, available, candidate)) break;
  }
  let column = 0;
  let x = box.x;
  let y = top;
  for (const row of rows) {
    if (y + row.height > bottom) {
      if (column + 1 >= columns) {
        drawText(ctx, '…', x, Math.min(y, bottom - 3), { size: LEGEND_ITEM_SIZE, color: MUTED });
        return;
      }
      column += 1;
      x = box.x + column * (columnWidth + LEGEND_COL_GAP_MM);
      y = top;
    }
    if (row.type === 'header') {
      drawText(ctx, row.label, x, y, { size: LEGEND_HEADER_SIZE, weight: 700, maxWidth: columnWidth });
    } else if (row.type === 'item') {
      drawSwatch(ctx, x + 1, y, SWATCH_MM, row.swatch);
      if (row.label) {
        drawText(ctx, row.label, legendLabelX(x), y + 0.4, {
          size: LEGEND_ITEM_SIZE,
          color: MUTED,
          maxWidth: columnWidth - SWATCH_MM - 3
        });
      }
    }
    y += row.height;
  }
}

function drawKeyValueRows(ctx, box, rows, { measureOnly = false, size = 2 } = {}) {
  let y = box.y;
  const labelWidth = box.w * 0.42;

  for (const [label, value] of rows) {
    const labelHeight = drawText(ctx, label, box.x, y, {
      size, weight: 600, color: INK, maxWidth: labelWidth, measureOnly
    });
    const valueHeight = drawText(ctx, `: ${value || '-'}`, box.x + labelWidth, y, {
      size, color: MUTED, maxWidth: box.w - labelWidth, measureOnly
    });
    y += Math.max(labelHeight, valueHeight) + 0.5;
  }
  return y - box.y;
}
export function renderPrintLayout(options) {
  const {
    mapImage,
    insetImage,
    bounds,
    legend,
    paper = 'A4',
    orientation = 'landscape',
    title,
    subtitle,
    source,
    author,
    agency,
    logo,
    groundWidthM,
    dpi = PRINT_DPI
  } = options;
  const { page, content, mapBox, inner, panel, band } = pageGeometry(paper, orientation);
  const k = pxPerMm(dpi);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * k);
  canvas.height = Math.round(page.height * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  rect(ctx, 0, 0, page.width, page.height, { fill: '#ffffff' });
  rect(ctx, MARGIN_MM, MARGIN_MM, page.width - MARGIN_MM * 2, page.height - MARGIN_MM * 2, {
    stroke: INK,
    lineWidth: 0.7
  });
  const pad = MARGIN_MM + PAD_MM;
  rect(ctx, pad, pad, page.width - pad * 2, page.height - pad * 2, { stroke: INK, lineWidth: 0.25 });
  const utm = utmZoneInfo(bounds.getCenter().lng, bounds.getCenter().lat);
  drawUtmGrid(ctx, mapBox, inner, band, bounds, utm);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  ctx.drawImage(mapImage, inner.x, inner.y, inner.w, inner.h);
  ctx.restore();
  rect(ctx, inner.x, inner.y, inner.w, inner.h, { stroke: INK, lineWidth: 0.4 });
  rect(ctx, mapBox.x, mapBox.y, mapBox.w, mapBox.h, { stroke: INK, lineWidth: 0.3 });
  const denominator = printScaleDenominator(groundWidthM, inner.w);
  const col = { x: panel.x + PANEL_INSET_MM, w: panel.w - PANEL_INSET_MM * 2 };
  const inPad = 1.6;
  const boxed = (y, h) => rect(ctx, panel.x, y, panel.w, h, { fill: '#ffffff', stroke: INK, lineWidth: 0.25 });
  let y = panel.y;

  const kopH = 12;
  boxed(y, kopH);
  if (logo) {
    const logoH = kopH - inPad * 2;
    const ratio = logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 1;
    ctx.drawImage(logo, col.x, y + inPad, logoH * ratio, logoH);
    drawText(ctx, agency, col.x + logoH * ratio + 2, y + inPad + 0.6, {
      size: 2.3, weight: 700, maxWidth: col.w - logoH * ratio - 2
    });
  } else {
    drawText(ctx, agency, panel.x + panel.w / 2, y + inPad + 1.5, {
      size: 2.4, weight: 700, align: 'center', maxWidth: col.w
    });
  }
  y += kopH + GAP_MM;

  const titleH = 15;
  boxed(y, titleH);
  let titleSize = 3.2;
  for (const candidate of [4.6, 4.1, 3.6, 3.2]) {
    titleSize = candidate;
    setFont(ctx, candidate, 700);
    if (wrapLines(ctx, title, col.w).length * candidate * 1.3 <= titleH - (subtitle ? 5 : 2.5)) break;
  }
  const titleUsed = drawText(ctx, title, panel.x + panel.w / 2, y + inPad, {
    size: titleSize, weight: 700, align: 'center', maxWidth: col.w
  });
  if (subtitle) {
    drawText(ctx, subtitle, panel.x + panel.w / 2, y + inPad + titleUsed + 0.6, {
      size: 2.1, color: MUTED, align: 'center', maxWidth: col.w
    });
  }
  y += titleH + GAP_MM;

  const scaleH = 17;
  boxed(y, scaleH);
  drawText(ctx, `SKALA : ${fmtScale(denominator)}`, panel.x + panel.w / 2, y + inPad, {
    size: 2.6, weight: 700, align: 'center'
  });
  const arrowSize = 7;
  drawNorthArrow(ctx, col.x + arrowSize * 0.5, y + scaleH - inPad - arrowSize * 0.62, arrowSize);
  drawScaleBar(ctx, col.x + arrowSize + 3, y + inPad + 6, col.w - arrowSize - 3, groundWidthM / inner.w);
  y += scaleH + GAP_MM;
  const projectionRows = [
    ['Proyeksi', 'Universal Transverse Mercator'],
    ['Sistem Grid', `Grid UTM Zona ${utm.zone}${utm.hemisphere}`],
    ['Datum Horizontal', 'Datum WGS 1984'],
    ['Sistem Koordinat', 'Geografis WGS 1984 (EPSG:4326)']
  ];
  const projectionH =
    drawKeyValueRows(ctx, { x: col.x, y: 0, w: col.w }, projectionRows, { measureOnly: true }) + inPad * 2;
  boxed(y, projectionH);
  drawKeyValueRows(ctx, { x: col.x, y: y + inPad, w: col.w }, projectionRows);
  y += projectionH + GAP_MM;
  if (insetImage) {
    const insetH = col.w * INSET_ASPECT;
    const blockH = insetH + 4.6 + inPad * 2;
    boxed(y, blockH);
    drawText(ctx, 'DIAGRAM LOKASI', panel.x + panel.w / 2, y + inPad, {
      size: 2.2, weight: 700, align: 'center'
    });
    const imgY = y + inPad + 4.6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(col.x, imgY, col.w, insetH);
    ctx.clip();
    ctx.drawImage(insetImage, col.x, imgY, col.w, insetH);
    ctx.restore();
    const boxW = col.w / INSET_ZOOM_OUT_FACTOR;
    const boxH = boxW * (inner.h / inner.w);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(col.x + (col.w - boxW) / 2, imgY + (insetH - boxH) / 2, boxW, boxH);
    rect(ctx, col.x, imgY, col.w, insetH, { stroke: INK, lineWidth: 0.25 });
    y += blockH + GAP_MM;
  }
  let bottom = panel.y + panel.h;
  const makerH = 14;
  bottom -= makerH;
  boxed(bottom, makerH);
  drawText(ctx, 'Dibuat oleh,', panel.x + panel.w / 2, bottom + inPad, {
    size: 2, color: MUTED, align: 'center'
  });
  drawText(ctx, author || '-', panel.x + panel.w / 2, bottom + inPad + 3.2, {
    size: 2.3, weight: 700, align: 'center', maxWidth: col.w
  });
  drawText(ctx, fmtDateId(), panel.x + panel.w / 2, bottom + makerH - inPad - 2.6, {
    size: 2, color: MUTED, align: 'center'
  });
  bottom -= GAP_MM;
  const noteText = 'Peta ini bukan referensi resmi mengenai garis batas administrasi.';
  const sourceTextH = drawText(ctx, `1. ${source || '-'}`, col.x, 0, {
    size: 2, maxWidth: col.w, measureOnly: true
  });
  const noteH = drawText(ctx, `Catatan: ${noteText}`, col.x, 0, { size: 1.8, maxWidth: col.w, measureOnly: true });
  const sourceBlockH = 4.4 + sourceTextH + 1.2 + noteH + inPad * 2;
  bottom -= sourceBlockH;
  boxed(bottom, sourceBlockH);
  drawText(ctx, 'SUMBER DATA :', col.x, bottom + inPad, { size: 2.1, weight: 700 });
  drawText(ctx, `1. ${source || '-'}`, col.x, bottom + inPad + 4.4, { size: 2, color: MUTED, maxWidth: col.w });
  drawText(ctx, `Catatan: ${noteText}`, col.x, bottom + inPad + 4.4 + sourceTextH + 1.2, {
    size: 1.8, color: MUTED, maxWidth: col.w
  });
  bottom -= GAP_MM;
  const legendH = bottom - y;
  if (legendH > 10) {
    boxed(y, legendH);
    drawLegend(ctx, { x: col.x, y: y + inPad, w: col.w, h: legendH - inPad * 2 }, legend);
  }
  return {
    canvas,
    page,
    mapFaceMm: { x: inner.x, y: inner.y, w: inner.w, h: inner.h }
  };
}
export async function prepareMapArtifacts(map, { paper, orientation, dpi = PRINT_DPI }) {
  const { inner, panel } = pageGeometry(paper, orientation);
  const k = pxPerMm(dpi);
  const groundWidthM = groundWidthOf(map);
  const legend = buildLegendModel(map);

  const main = await captureMapImage(map, {
    widthPx: Math.round(inner.w * k),
    heightPx: Math.round(inner.h * k),
    groundWidthM
  });
  const insetWidthMm = panel.w - PANEL_INSET_MM * 2;
  const inset = await captureMapImage(map, {
    widthPx: Math.round(insetWidthMm * k),
    heightPx: Math.round(insetWidthMm * INSET_ASPECT * k),
    groundWidthM: groundWidthM * INSET_ZOOM_OUT_FACTOR
  });
  return {
    mapImage: main.image,
    insetImage: inset.image,
    bounds: main.bounds,
    groundWidthM,
    legend
  };
}
