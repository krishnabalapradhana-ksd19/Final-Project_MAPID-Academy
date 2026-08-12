import maplibregl from 'maplibre-gl';
import { bindFeaturePopup, popupHtml, propsTable } from './feature-popup.js';
import { DropdownControl, onceLoaded } from './map-control.js';

const SOURCE_ID = 'upload-preview-src';
const FILL_LAYER = 'upload-preview-fill';
const LINE_LAYER = 'upload-preview-line';
const POINT_LAYER = 'upload-preview-point';
const LAYERS = [FILL_LAYER, LINE_LAYER, POINT_LAYER];

const COLOR = '#8b5cf6';
const ACCEPT = '.geojson,.json,.kml,.zip';
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const POLYGON_TYPES = ['Polygon', 'MultiPolygon'];
const LINE_TYPES = ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'];
const POINT_TYPES = ['Point', 'MultiPoint'];

const EMPTY = { type: 'FeatureCollection', features: [] };

const ICON = `
  <path d="M12 16V4" />
  <path d="m7 9 5-5 5 5" />
  <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
`;

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function normalizeToFeatureCollection(geojson) {
  if (!geojson || !geojson.type) throw new Error('Format GeoJSON tidak dikenali.');
  if (geojson.type === 'FeatureCollection') return geojson;
  if (geojson.type === 'Feature') return { type: 'FeatureCollection', features: [geojson] };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geojson, properties: {} }] };
}

async function parseFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: ukuran berkas melebihi 30 MB.`);

  const ext = extOf(file.name);

  if (ext === 'geojson' || ext === 'json') {
    try {
      return normalizeToFeatureCollection(JSON.parse(await file.text()));
    } catch {
      throw new Error(`${file.name}: JSON tidak valid.`);
    }
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
    const features = (Array.isArray(result) ? result : [result]).flatMap((fc) => fc.features || []);
    if (!features.length) throw new Error(`${file.name}: tidak ada fitur pada berkas SHP.`);
    return { type: 'FeatureCollection', features };
  }

  throw new Error(`${file.name}: format tidak didukung. Gunakan GeoJSON, KML, atau SHP (ZIP).`);
}

const stringifyValue = (value) => (typeof value === 'object' ? JSON.stringify(value) : value);

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

export class UploadControl extends DropdownControl {
  constructor() {
    super({
      icon: ICON,
      title: 'Unggah Data (Pratinjau)',
      ariaLabel: 'Unggah data untuk pratinjau',
      label: 'Unggah Data (Pratinjau)'
    });
    this._lastData = null;
  }

  buildMenu(menu, map) {
    menu.insertAdjacentHTML(
      'beforeend',
      `
        <div class="dropdown-hint">
          GeoJSON, KML, atau SHP (ZIP). Hanya pratinjau di peta — tidak diunggah atau disimpan ke server.
        </div>
        <label class="upload-pick">
          Pilih Berkas…
          <input type="file" accept="${ACCEPT}" multiple hidden />
        </label>
        <div class="dropdown-note upload-status" hidden></div>
        <div class="dropdown-actions" hidden>
          <button type="button" class="upload-fit">Perbesar ke Data</button>
          <button type="button" class="upload-clear">Hapus</button>
        </div>
      `
    );

    this._input = menu.querySelector('input[type=file]');
    this._statusEl = menu.querySelector('.upload-status');
    this._actionsEl = menu.querySelector('.dropdown-actions');

    this._input.addEventListener('change', () => this._handleFiles(this._input.files));
    menu.querySelector('.upload-fit').addEventListener('click', () => this._fitToData());
    menu.querySelector('.upload-clear').addEventListener('click', () => this._clear());

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

  hasFeatureAt(point) {
    if (!this._map?.getLayer(POINT_LAYER)) return false;
    return this._map.queryRenderedFeatures(point, { layers: LAYERS }).length > 0;
  }

  _setupLayers() {
    const map = this._map;
    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', POLYGON_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Area' },
      paint: { 'fill-color': COLOR, 'fill-opacity': 0.25 }
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', LINE_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Garis' },
      paint: { 'line-color': COLOR, 'line-width': 2 }
    });
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['in', ['geometry-type'], ['literal', POINT_TYPES]],
      metadata: { legendLabel: 'Data Unggahan — Titik' },
      paint: { 'circle-color': COLOR, 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
    });

    bindFeaturePopup(map, LAYERS, {
      render: (e, popup) => {
        popup
          .setLngLat(e.lngLat)
          .setHTML(popupHtml('Pratinjau Unggahan', propsTable(e.features[0].properties, stringifyValue)))
          .addTo(map);
      }
    });

    if (this._lastData) map.getSource(SOURCE_ID).setData(this._lastData);
  }

  async _handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    this._setStatus('Memuat berkas…', 'is-loading');
    try {
      const collections = await Promise.all(files.map(parseFile));
      const features = collections.flatMap((fc) => fc.features);
      if (!features.length) throw new Error('Tidak ada fitur yang dapat ditampilkan.');

      this._lastData = { type: 'FeatureCollection', features };
      this._map.getSource(SOURCE_ID)?.setData(this._lastData);

      this._setStatus(`${files.map((f) => f.name).join(', ')} — ${features.length} fitur dimuat (pratinjau).`);
      this._actionsEl.hidden = false;
      this._fitToData();
    } catch (err) {
      this._setStatus(err.message || 'Gagal memuat berkas.', 'is-error');
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
    this._map.getSource(SOURCE_ID)?.setData(EMPTY);
    this._statusEl.hidden = true;
    this._actionsEl.hidden = true;
  }

  _setStatus(text, kind = '') {
    this._statusEl.hidden = false;
    this._statusEl.textContent = text;
    this._statusEl.className = `dropdown-note upload-status ${kind}`.trim();
  }
}
