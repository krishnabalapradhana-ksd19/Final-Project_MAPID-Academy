import proj4 from 'proj4';
import { DropdownControl, onceLoaded } from './map-control.js';
import { UTM_49S_PROJ4 } from '../../shared/geo.js';
import { fmtArea, fmtDistance } from '../../shared/format.js';

const WGS84 = 'EPSG:4326';
const COLOR = '#e11d48';

const SOURCE_ID = 'measure-tool-src';
const FILL_LAYER = 'measure-tool-fill';
const LINE_LAYER = 'measure-tool-line';
const PREVIEW_LAYER = 'measure-tool-preview';
const VERTEX_LAYER = 'measure-tool-vertex';
const LAYERS = [FILL_LAYER, LINE_LAYER, PREVIEW_LAYER, VERTEX_LAYER];

const ICON = `
  <path d="M3 17 17 3l4 4L7 21z" />
  <path d="m14 6 4 4" />
  <path d="m11 9 2 2" />
  <path d="m8 12 2 2" />
  <path d="m5 15 2 2" />
`;

const EMPTY = { type: 'FeatureCollection', features: [] };

const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });

const toUtm = ([lng, lat]) => proj4(WGS84, UTM_49S_PROJ4, [lng, lat]);

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

export class MeasureControl extends DropdownControl {
  constructor() {
    super({ icon: ICON, title: 'Alat Ukur', ariaLabel: 'Alat ukur jarak & luas', label: 'Alat Ukur' });
    this._mode = null;
    this._coords = [];
    this._previewCoord = null;
  }

  isActive() {
    return this._mode !== null;
  }

  keepOpen() {
    return this.isActive();
  }

  buildMenu(menu, map) {
    menu.insertAdjacentHTML(
      'beforeend',
      `
        <div class="measure-mode-row">
          <button type="button" data-mode="point">Titik</button>
          <button type="button" data-mode="line">Jarak</button>
          <button type="button" data-mode="polygon">Luas</button>
        </div>
        <div class="dropdown-note measure-result" hidden></div>
        <div class="dropdown-hint" hidden>Klik peta untuk menambah titik.</div>
        <div class="dropdown-actions" hidden>
          <button type="button" class="measure-finish">Selesai</button>
          <button type="button" class="measure-clear">Hapus</button>
        </div>
      `
    );

    this._modeButtons = [...menu.querySelectorAll('button[data-mode]')];
    this._finishBtn = menu.querySelector('.measure-finish');
    this._resultEl = menu.querySelector('.measure-result');
    this._hintEl = menu.querySelector('.dropdown-hint');
    this._actionsEl = menu.querySelector('.dropdown-actions');

    this._modeButtons.forEach((btn) => btn.addEventListener('click', () => this._setMode(btn.dataset.mode)));
    this._finishBtn.addEventListener('click', () => this._finish());
    menu.querySelector('.measure-clear').addEventListener('click', () => this._clear());

    this._onMapClick = this._onMapClick.bind(this);
    this._onMapMouseMove = this._onMapMouseMove.bind(this);
    onceLoaded(map, () => this._setupLayers());
  }

  onRemove() {
    const map = this._map;
    LAYERS.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    super.onRemove();
  }

  _setupLayers() {
    const map = this._map;
    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      metadata: { legendLabel: 'Hasil Ukur — Luas' },
      paint: { 'fill-color': COLOR, 'fill-opacity': 0.18 }
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['all', ['!=', ['geometry-type'], 'Point'], ['!=', ['get', 'preview'], true]],
      metadata: { legendLabel: 'Hasil Ukur — Jarak' },
      paint: { 'line-color': COLOR, 'line-width': 2 }
    });
    map.addLayer({
      id: PREVIEW_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'preview'], true],
      paint: { 'line-color': COLOR, 'line-width': 2, 'line-dasharray': [2, 1], 'line-opacity': 0.75 }
    });
    map.addLayer({
      id: VERTEX_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      metadata: { legendLabel: 'Hasil Ukur — Titik' },
      paint: { 'circle-color': COLOR, 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
    });
  }

  _setMode(mode) {
    this._mode = mode;
    this._coords = [];
    this._previewCoord = null;

    this._modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    this._actionsEl.hidden = false;
    this._finishBtn.hidden = mode === 'point';
    this._hintEl.hidden = false;
    this._hintEl.textContent =
      mode === 'point' ? 'Klik peta untuk menandai titik.' : 'Klik peta untuk menambah titik, lalu tekan Selesai.';
    this._resultEl.hidden = true;

    this._startListening();
    this._updateGeometry();
  }

  _startListening() {
    this._map.getCanvas().style.cursor = 'crosshair';
    this._stopListening();
    this._map.on('click', this._onMapClick);
    if (this._mode !== 'point') this._map.on('mousemove', this._onMapMouseMove);
  }

  _stopListening() {
    this._map.off('click', this._onMapClick);
    this._map.off('mousemove', this._onMapMouseMove);
  }

  _onMapClick(e) {
    const point = [e.lngLat.lng, e.lngLat.lat];
    if (this._mode === 'point') this._coords = [point];
    else this._coords.push(point);

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
    this._stopListening();
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
    const source = this._map.getSource(SOURCE_ID);
    if (!source) return;

    const features = [];
    if (this._mode === 'polygon' && this._coords.length >= 3) {
      features.push(feature({ type: 'Polygon', coordinates: [[...this._coords, this._coords[0]]] }));
    } else if (this._coords.length >= 2 && this._mode !== 'point') {
      features.push(feature({ type: 'LineString', coordinates: this._coords }));
    }

    if (this._previewCoord && this._coords.length) {
      const last = this._coords[this._coords.length - 1];
      features.push(feature({ type: 'LineString', coordinates: [last, this._previewCoord] }, { preview: true }));
    }

    this._coords.forEach((c) => features.push(feature({ type: 'Point', coordinates: c })));
    source.setData({ type: 'FeatureCollection', features });
  }

  _updateResult() {
    this._resultEl.hidden = false;
    if (this._mode === 'point') {
      const [lng, lat] = this._coords[0];
      this._resultEl.innerHTML = `<b>Koordinat:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } else if (this._mode === 'line') {
      this._resultEl.innerHTML = `<b>Jarak:</b> ${fmtDistance(
        this._coords.length >= 2 ? lineDistanceMeters(this._coords) : 0
      )}`;
    } else {
      this._resultEl.innerHTML = `<b>Luas:</b> ${fmtArea(
        this._coords.length >= 3 ? polygonAreaSqm(this._coords) : 0
      )}`;
    }
  }
}
