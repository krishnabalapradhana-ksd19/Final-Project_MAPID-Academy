import proj4 from 'proj4';
import { UTM_49S_PROJ4 } from '../../shared/geo.js';

const WGS84 = 'EPSG:4326';

const SOURCE_ID = 'measure-tool-src';
const FILL_LAYER = 'measure-tool-fill';
const LINE_LAYER = 'measure-tool-line';
const PREVIEW_LAYER = 'measure-tool-preview';
const VERTEX_LAYER = 'measure-tool-vertex';

function toUtm([lng, lat]) {
  return proj4(WGS84, UTM_49S_PROJ4, [lng, lat]);
}

function lineDistanceMeters(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = toUtm(coords[i - 1]);
    const [x2, y2] = toUtm(coords[i]);
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

function polygonAreaSqm(coords) {
  const pts = coords.map(toUtm);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function fmtDistance(m) {
  return m >= 1000
    ? `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} km`
    : `${m.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;
}

function fmtArea(sqm) {
  const ha = sqm / 10000;
  return ha >= 1
    ? `${ha.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`
    : `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m²`;
}

export class MeasureControl {
  constructor() {
    this._mode = null;
    this._coords = [];
    this._previewCoord = null;
  }

  isActive() {
    return this._mode !== null;
  }

  onAdd(mapInstance) {
    this._map = mapInstance;
    this._onMapClick = this._onMapClick.bind(this);
    this._onMapMouseMove = this._onMapMouseMove.bind(this);

    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group measure-control';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'maplibregl-ctrl-icon measure-toggle';
    toggle.title = 'Alat Ukur';
    toggle.setAttribute('aria-label', 'Alat ukur jarak & luas');
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 17 17 3l4 4L7 21z" />
        <path d="m14 6 4 4" />
        <path d="m11 9 2 2" />
        <path d="m8 12 2 2" />
        <path d="m5 15 2 2" />
      </svg>
    `;

    const menu = document.createElement('div');
    menu.className = 'measure-menu';
    menu.innerHTML = `
      <div class="measure-menu-label">Alat Ukur</div>
      <div class="measure-mode-row">
        <button type="button" data-mode="point">Titik</button>
        <button type="button" data-mode="line">Jarak</button>
        <button type="button" data-mode="polygon">Luas</button>
      </div>
      <div class="measure-result" hidden></div>
      <div class="measure-hint" hidden>Klik peta untuk menambah titik.</div>
      <div class="measure-actions" hidden>
        <button type="button" class="measure-finish">Selesai</button>
        <button type="button" class="measure-clear">Hapus</button>
      </div>
    `;

    this._resultEl = menu.querySelector('.measure-result');
    this._hintEl = menu.querySelector('.measure-hint');
    this._actionsEl = menu.querySelector('.measure-actions');

    menu.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this._setMode(btn.dataset.mode));
    });
    menu.querySelector('.measure-finish').addEventListener('click', () => this._finish());
    menu.querySelector('.measure-clear').addEventListener('click', () => this._clear());

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this._container.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (this._mode) return;
      if (!this._container.contains(e.target)) this._container.classList.remove('open');
    });

    this._menu = menu;
    this._container.appendChild(toggle);
    this._container.appendChild(menu);

    mapInstance.once('load', () => this._setupLayers());

    return this._container;
  }

  onRemove() {
    this._removeLayers();
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }

  _setupLayers() {
    const map = this._map;
    map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#e11d48', 'fill-opacity': 0.18 }
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['all', ['!=', ['geometry-type'], 'Point'], ['!=', ['get', 'preview'], true]],
      paint: { 'line-color': '#e11d48', 'line-width': 2 }
    });
    map.addLayer({
      id: PREVIEW_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'preview'], true],
      paint: { 'line-color': '#e11d48', 'line-width': 2, 'line-dasharray': [2, 1], 'line-opacity': 0.75 }
    });
    map.addLayer({
      id: VERTEX_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': '#e11d48', 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
    });
  }

  _removeLayers() {
    const map = this._map;
    if (!map) return;
    [FILL_LAYER, LINE_LAYER, PREVIEW_LAYER, VERTEX_LAYER].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }

  _setMode(mode) {
    this._mode = mode;
    this._coords = [];
    this._previewCoord = null;

    this._menu.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this._actionsEl.hidden = false;
    this._menu.querySelector('.measure-finish').hidden = mode === 'point';
    this._hintEl.hidden = false;
    this._hintEl.textContent =
      mode === 'point' ? 'Klik peta untuk menandai titik.' : 'Klik peta untuk menambah titik, lalu tekan Selesai.';
    this._resultEl.hidden = true;

    this._startListening();
    this._updateGeometry();
  }

  _startListening() {
    this._map.getCanvas().style.cursor = 'crosshair';
    this._map.off('click', this._onMapClick);
    this._map.off('mousemove', this._onMapMouseMove);
    this._map.on('click', this._onMapClick);
    if (this._mode !== 'point') this._map.on('mousemove', this._onMapMouseMove);
  }

  _onMapClick(e) {
    const point = [e.lngLat.lng, e.lngLat.lat];
    if (this._mode === 'point') {
      this._coords = [point];
    } else {
      this._coords.push(point);
    }
    this._previewCoord = null;
    this._updateGeometry();
    this._updateResult();
  }

  _onMapMouseMove(e) {
    if (!this._coords.length) return;
    this._previewCoord = [e.lngLat.lng, e.lngLat.lat];
    this._updateGeometry();
  }

  _finish() {
    this._map.off('click', this._onMapClick);
    this._map.off('mousemove', this._onMapMouseMove);
    this._map.getCanvas().style.cursor = '';
    this._hintEl.hidden = true;
    this._previewCoord = null;
    this._updateGeometry();
  }

  _clear() {
    this._coords = [];
    this._previewCoord = null;
    this._resultEl.hidden = true;
    this._updateGeometry();
    if (this._mode && this._mode !== 'point') {
      this._hintEl.hidden = false;
      this._startListening();
    }
  }

  _updateGeometry() {
    const map = this._map;
    const source = map.getSource(SOURCE_ID);
    if (!source) return;

    const vertexFeatures = this._coords.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c },
      properties: {}
    }));

    const shapeFeatures = [];
    if (this._mode === 'polygon' && this._coords.length >= 3) {
      shapeFeatures.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...this._coords, this._coords[0]]] },
        properties: {}
      });
    } else if (this._coords.length >= 2 && (this._mode === 'line' || this._mode === 'polygon')) {
      shapeFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: this._coords }, properties: {} });
    }

    const previewFeatures = [];
    if (this._previewCoord && this._coords.length >= 1) {
      const last = this._coords[this._coords.length - 1];
      previewFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [last, this._previewCoord] },
        properties: { preview: true }
      });
    }

    source.setData({ type: 'FeatureCollection', features: [...shapeFeatures, ...previewFeatures, ...vertexFeatures] });
  }

  _updateResult() {
    this._resultEl.hidden = false;
    if (this._mode === 'point') {
      const [lng, lat] = this._coords[0];
      this._resultEl.innerHTML = `<b>Koordinat:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } else if (this._mode === 'line') {
      const dist = this._coords.length >= 2 ? lineDistanceMeters(this._coords) : 0;
      this._resultEl.innerHTML = `<b>Jarak:</b> ${fmtDistance(dist)}`;
    } else if (this._mode === 'polygon') {
      const area = this._coords.length >= 3 ? polygonAreaSqm(this._coords) : 0;
      this._resultEl.innerHTML = `<b>Luas:</b> ${fmtArea(area)}`;
    }
  }
}
