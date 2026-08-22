import { DropdownControl } from './map-control.js';

const SOURCE_ID = 'select-tool-src';
const FILL_LAYER = 'select-tool-fill';
const LINE_LAYER = 'select-tool-line';
const LAYERS = [FILL_LAYER, LINE_LAYER];

const COLOR = '#2563eb';
const EMPTY = { type: 'FeatureCollection', features: [] };

const LASSO_MIN_STEP_PX = 4;

const ICON = `
  <path d="M3 12a9 4 0 1 0 18 0 9 4 0 1 0-18 0" />
  <path d="M12 16v3" />
  <path d="M10 21h4" />
`;

const MODE_HINTS = {
  lasso: 'Tahan tombol kiri mouse lalu gambar bebas mengelilingi petak.',
  rect: 'Tahan tombol kiri mouse lalu tarik membentuk kotak.'
};

function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function flattenCoords(coords, out = []) {
  if (typeof coords[0] === 'number') out.push(coords);
  else coords.forEach((child) => flattenCoords(child, out));
  return out;
}

const boundsOf = (points) => [
  [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
  [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]
];

export class SelectControl extends DropdownControl {
  constructor({ layerId, onChange, onEdit }) {
    super({ icon: ICON, title: 'Pilih Petak', ariaLabel: 'Pilih petak dengan lasso atau kotak', label: 'Pilih Petak' });
    this._layerId = layerId;
    this._onChange = onChange;
    this._onEdit = onEdit;
    this._mode = null;
    this._points = [];
    this._drawing = false;
  }

  isActive() {
    return this._mode !== null;
  }

  keepOpen() {
    return this.isActive();
  }

  buildMenu(menu) {
    menu.insertAdjacentHTML(
      'beforeend',
      `
        <div class="measure-mode-row">
          <button type="button" data-mode="lasso">Lasso</button>
          <button type="button" data-mode="rect">Kotak</button>
        </div>
        <div class="dropdown-hint select-hint" hidden></div>
        <div class="dropdown-note select-summary" hidden></div>
        <div class="dropdown-actions">
          <button type="button" class="select-edit" hidden>Isi Atribut</button>
          <button type="button" class="select-clear">Bersihkan Seleksi</button>
        </div>
      `
    );

    this._modeButtons = [...menu.querySelectorAll('button[data-mode]')];
    this._hintEl = menu.querySelector('.select-hint');
    this._summaryEl = menu.querySelector('.select-summary');
    this._editBtn = menu.querySelector('.select-edit');

    this._modeButtons.forEach((btn) => btn.addEventListener('click', () => this._setMode(btn.dataset.mode)));
    menu.querySelector('.select-clear').addEventListener('click', () => this.clearSelection());
    this._editBtn.addEventListener('click', () => this._onEdit());

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeydown = (e) => {
      if (e.key === 'Escape') this.deactivate();
    };
    document.addEventListener('keydown', this._onKeydown);
  }

  onRemove() {
    document.removeEventListener('keydown', this._onKeydown);
    this._stopListening();
    LAYERS.forEach((id) => {
      if (this._map.getLayer(id)) this._map.removeLayer(id);
    });
    if (this._map.getSource(SOURCE_ID)) this._map.removeSource(SOURCE_ID);
    super.onRemove();
  }

  onClose() {
    this._exitMode();
  }

  setSelectionInfo({ count, text }) {
    if (!this._summaryEl) return;
    this._summaryEl.hidden = !text;
    this._summaryEl.textContent = text || '';
    this._editBtn.hidden = !count;
    this._editBtn.textContent = `Isi Atribut (${count})`;
  }

  clearSelection() {
    this._clearShape();
    this._onChange([]);
  }

  deactivate() {
    this.clearSelection();
    this.close();
  }

  _setMode(mode) {
    if (this._mode === mode) {
      this._exitMode();
      return;
    }

    this._mode = mode;
    this._clearShape();

    this._modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    this._hintEl.hidden = false;
    this._hintEl.textContent = MODE_HINTS[mode];

    this._ensureLayers();

    this._map.dragPan.disable();
    this._map.boxZoom.disable();
    this._map.getCanvas().style.cursor = 'crosshair';
    this._stopListening();
    this._map.on('mousedown', this._onMouseDown);
  }

  _exitMode() {
    if (!this._mode) return;
    this._mode = null;
    this._drawing = false;
    this._modeButtons.forEach((btn) => btn.classList.remove('active'));
    this._hintEl.hidden = true;
    this._stopListening();
    this._map.dragPan.enable();
    this._map.boxZoom.enable();
    this._map.getCanvas().style.cursor = '';
    this._clearShape();
  }

  _stopListening() {
    this._map.off('mousedown', this._onMouseDown);
    this._map.off('mousemove', this._onMouseMove);
    this._map.off('mouseup', this._onMouseUp);
  }

  _ensureLayers() {
    const map = this._map;
    if (map.getLayer(FILL_LAYER)) {
      LAYERS.forEach((id) => map.moveLayer(id));
      return;
    }

    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': COLOR, 'fill-opacity': 0.12 }
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': COLOR, 'line-width': 1.5, 'line-dasharray': [2, 1] }
    });
  }

  _onMouseDown(e) {
    if (!this.isActive()) return;
    e.preventDefault();
    this._drawing = true;
    this._points = [[e.point.x, e.point.y]];
    this._map.on('mousemove', this._onMouseMove);
    this._map.on('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    if (!this._drawing) return;
    const point = [e.point.x, e.point.y];

    if (this._mode === 'rect') {
      this._points[1] = point;
    } else {
      const last = this._points[this._points.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < LASSO_MIN_STEP_PX) return;
      this._points.push(point);
    }

    this._updateShape();
  }

  _onMouseUp() {
    if (!this._drawing) return;
    this._drawing = false;
    this._map.off('mousemove', this._onMouseMove);
    this._map.off('mouseup', this._onMouseUp);

    this._onChange(this._queryFids());
  }

  _shapePoints() {
    if (this._mode !== 'rect') return this._points;
    if (this._points.length < 2) return [];
    const [[x1, y1], [x2, y2]] = this._points;
    return [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2]
    ];
  }

  _clearShape() {
    this._points = [];
    this._map.getSource(SOURCE_ID)?.setData(EMPTY);
  }

  _updateShape() {
    const source = this._map.getSource(SOURCE_ID);
    if (!source) return;

    const points = this._shapePoints();
    if (points.length < 3) {
      source.setData(EMPTY);
      return;
    }

    const ring = points.map(([x, y]) => {
      const { lng, lat } = this._map.unproject([x, y]);
      return [lng, lat];
    });
    source.setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }
      ]
    });
  }

  _queryFids() {
    const points = this._shapePoints();
    if (points.length < 3 || !this._map.getLayer(this._layerId)) return [];

    const candidates = this._map.queryRenderedFeatures(boundsOf(points), { layers: [this._layerId] });
    const fids = new Set();

    candidates.forEach((feature) => {
      const fid = feature.properties?._fid;
      if (fid === undefined || fids.has(fid)) return;
      if (this._mode === 'rect' || this._hitsLasso(feature, points)) fids.add(fid);
    });

    return [...fids];
  }

  _hitsLasso(feature, ring) {
    const coords = flattenCoords(feature.geometry.coordinates);
    let sumX = 0;
    let sumY = 0;

    for (const lngLat of coords) {
      const { x, y } = this._map.project(lngLat);
      if (pointInPolygon([x, y], ring)) return true;
      sumX += x;
      sumY += y;
    }

    return coords.length > 0 && pointInPolygon([sumX / coords.length, sumY / coords.length], ring);
  }
}
