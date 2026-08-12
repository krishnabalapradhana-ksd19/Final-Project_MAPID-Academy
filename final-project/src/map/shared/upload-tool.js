import maplibregl from 'maplibre-gl';

const SOURCE_ID = 'upload-preview-src';
const FILL_LAYER = 'upload-preview-fill';
const LINE_LAYER = 'upload-preview-line';
const POINT_LAYER = 'upload-preview-point';

const UPLOAD_COLOR = '#8b5cf6';
const ACCEPT = '.geojson,.json,.kml,.zip';
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const POLYGON_TYPES = ['Polygon', 'MultiPolygon'];
const LINE_TYPES = ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'];
const POINT_TYPES = ['Point', 'MultiPoint'];

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normalizeToFeatureCollection(geojson) {
  if (!geojson || !geojson.type) throw new Error('Format GeoJSON tidak dikenali.');
  if (geojson.type === 'FeatureCollection') return geojson;
  if (geojson.type === 'Feature') return { type: 'FeatureCollection', features: [geojson] };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geojson, properties: {} }] };
}

async function parseFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name}: ukuran berkas melebihi 30 MB.`);
  }

  const ext = extOf(file.name);

  if (ext === 'geojson' || ext === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(`${file.name}: JSON tidak valid.`);
    }
    return normalizeToFeatureCollection(parsed);
  }

  if (ext === 'kml') {
    const { kml: kmlToGeojson } = await import('@tmcw/togeojson');
    const xml = new DOMParser().parseFromString(await file.text(), 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error(`${file.name}: KML tidak valid.`);
    return normalizeToFeatureCollection(kmlToGeojson(xml));
  }

  if (ext === 'zip') {
    const { default: shp } = await import('shpjs');
    let result;
    try {
      result = await shp(await file.arrayBuffer());
    } catch (err) {
      throw new Error(`${file.name}: gagal membaca SHP (${err.message}).`);
    }
    const collections = Array.isArray(result) ? result : [result];
    const features = collections.flatMap((fc) => fc.features || []);
    if (!features.length) throw new Error(`${file.name}: tidak ada fitur pada berkas SHP.`);
    return { type: 'FeatureCollection', features };
  }

  throw new Error(`${file.name}: format tidak didukung. Gunakan GeoJSON, KML, atau SHP (ZIP).`);
}

function extendBounds(bounds, geometry) {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((g) => extendBounds(bounds, g));
    return;
  }
  const walk = (coords) => {
    if (typeof coords[0] === 'number') bounds.extend(coords);
    else coords.forEach(walk);
  };
  if (geometry.coordinates) walk(geometry.coordinates);
}

function renderProps(props) {
  const keys = Object.keys(props || {});
  if (!keys.length) return '<div class="feature-popup-loading">Tidak ada atribut.</div>';
  const rows = keys
    .map((key) => {
      let value = props[key];
      if (value === null || value === undefined || value === '') value = '-';
      else if (typeof value === 'object') value = JSON.stringify(value);
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`;
    })
    .join('');
  return `<table class="feature-popup-table">${rows}</table>`;
}

export class UploadControl {
  constructor() {
    this._lastData = null;
  }

  onAdd(mapInstance) {
    this._map = mapInstance;

    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group upload-control';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'maplibregl-ctrl-icon upload-toggle';
    toggle.title = 'Unggah Data (Pratinjau)';
    toggle.setAttribute('aria-label', 'Unggah data untuk pratinjau');
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
    `;

    const menu = document.createElement('div');
    menu.className = 'upload-menu';
    menu.innerHTML = `
      <div class="upload-menu-label">Unggah Data (Pratinjau)</div>
      <div class="upload-hint">GeoJSON, KML, atau SHP (ZIP). Hanya pratinjau di peta — tidak diunggah atau disimpan ke server.</div>
      <label class="upload-pick">
        Pilih Berkas…
        <input type="file" accept="${ACCEPT}" multiple hidden />
      </label>
      <div class="upload-status" hidden></div>
      <div class="upload-actions" hidden>
        <button type="button" class="upload-fit">Perbesar ke Data</button>
        <button type="button" class="upload-clear">Hapus</button>
      </div>
    `;

    this._input = menu.querySelector('input[type=file]');
    this._statusEl = menu.querySelector('.upload-status');
    this._actionsEl = menu.querySelector('.upload-actions');

    this._input.addEventListener('change', () => this._handleFiles(this._input.files));
    menu.querySelector('.upload-fit').addEventListener('click', () => this._fitToData());
    menu.querySelector('.upload-clear').addEventListener('click', () => this._clear());

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this._container.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target)) this._container.classList.remove('open');
    });

    this._menu = menu;
    this._container.appendChild(toggle);
    this._container.appendChild(menu);

    if (mapInstance.loaded()) this._setupLayers();
    else mapInstance.once('load', () => this._setupLayers());

    return this._container;
  }

  onRemove() {
    this._removeLayers();
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }

  hasFeatureAt(point) {
    if (!this._map || !this._map.getLayer(POINT_LAYER)) return false;
    return this._map.queryRenderedFeatures(point, { layers: [FILL_LAYER, LINE_LAYER, POINT_LAYER] }).length > 0;
  }

  _setupLayers() {
    const map = this._map;
    map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', POLYGON_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Area' },
      paint: { 'fill-color': UPLOAD_COLOR, 'fill-opacity': 0.25 }
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', LINE_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Garis' },
      paint: { 'line-color': UPLOAD_COLOR, 'line-width': 2 }
    });
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', POINT_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Titik' },
      paint: { 'circle-color': UPLOAD_COLOR, 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
    });

    this._setupPopup();

    if (this._lastData) map.getSource(SOURCE_ID).setData(this._lastData);
  }

  _removeLayers() {
    const map = this._map;
    if (!map) return;
    [FILL_LAYER, LINE_LAYER, POINT_LAYER].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }

  _setupPopup() {
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' });
    [FILL_LAYER, LINE_LAYER, POINT_LAYER].forEach((layerId) => {
      this._map.on('click', layerId, (e) => {
        popup
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="feature-popup">
              <div class="feature-popup-title">Pratinjau Unggahan</div>
              <div class="feature-popup-scroll">${renderProps(e.features[0].properties)}</div>
            </div>
          `)
          .addTo(this._map);
      });
      this._map.on('mouseenter', layerId, () => {
        this._map.getCanvas().style.cursor = 'pointer';
      });
      this._map.on('mouseleave', layerId, () => {
        this._map.getCanvas().style.cursor = '';
      });
    });
  }

  async _handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    this._setStatus('Memuat berkas…', 'loading');
    try {
      const collections = await Promise.all(files.map(parseFile));
      const features = collections.flatMap((fc) => fc.features);
      if (!features.length) throw new Error('Tidak ada fitur yang dapat ditampilkan.');

      const merged = { type: 'FeatureCollection', features };
      this._lastData = merged;

      const source = this._map.getSource(SOURCE_ID);
      if (source) source.setData(merged);

      this._setStatus(`${files.map((f) => f.name).join(', ')} — ${features.length} fitur dimuat (pratinjau).`, 'ok');
      this._actionsEl.hidden = false;
      this._fitToData();
    } catch (err) {
      this._setStatus(err.message || 'Gagal memuat berkas.', 'error');
    } finally {
      this._input.value = '';
    }
  }

  _fitToData() {
    if (!this._lastData) return;
    const bounds = new maplibregl.LngLatBounds();
    this._lastData.features.forEach((f) => extendBounds(bounds, f.geometry));
    if (!bounds.isEmpty()) this._map.fitBounds(bounds, { padding: 40, duration: 600 });
  }

  _clear() {
    this._lastData = null;
    const source = this._map.getSource(SOURCE_ID);
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
    this._statusEl.hidden = true;
    this._actionsEl.hidden = true;
  }

  _setStatus(text, kind) {
    this._statusEl.hidden = false;
    this._statusEl.textContent = text;
    this._statusEl.classList.toggle('is-error', kind === 'error');
    this._statusEl.classList.toggle('is-loading', kind === 'loading');
    this._statusEl.classList.toggle('is-ok', kind === 'ok');
  }
}
