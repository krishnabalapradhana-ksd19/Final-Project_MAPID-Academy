import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './lbs-page.css';
import SLEMAN_LOGO from '../../assets/logo_kabupaten_sleman.png';
import BANTUL_LOGO from '../../assets/logo_kabupaten_bantul.png';
import GUNUNGKIDUL_LOGO from '../../assets/logo_kabupaten_gunung_kidul.png';
import KULON_PROGO_LOGO from '../../assets/logo_kabupaten_kulon_progo.png';
import YOGYAKARTA_LOGO from '../../assets/logo_kota_yogyakarta.png';
import { BASEMAPS, BASEMAP_ORDER, DEFAULT_BASEMAP, toRasterSource } from './basemaps.js';
import { loadGeojsonViaWorker } from './data-loading.js';
import { bindFeaturePopup, popupHtml, directionButtonHtml } from './feature-popup.js';
import { buildPopupHTML } from './petak-popup.js';
import { DropdownControl } from './map-control.js';
import { MeasureControl } from './measure-tool.js';
import { UploadControl } from './upload-tool.js';
import { PrintControl } from './print-tool.js';
import { fetchJsonWithTimeout } from '../../shared/fetch-json.js';
import { screenScaleDenominator } from '../../shared/geo.js';
import { fmtHa, fmtInt, fmtScale } from '../../shared/format.js';
import { regionBy } from '../../shared/regions.js';

const LOGOS = {
  sleman: SLEMAN_LOGO,
  bantul: BANTUL_LOGO,
  gunungkidul: GUNUNGKIDUL_LOGO,
  'kulon-progo': KULON_PROGO_LOGO,
  yogyakarta: YOGYAKARTA_LOGO
};

const REGION_BY_SLUG = regionBy('slug');
const STAT_IDS = ['stat-total', 'stat-count', 'stat-avg', 'stat-pct'];
const COORD_PATTERN = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

const categoricalColor = (i) => `hsl(${Math.round((i * 137.508) % 360)}, 65%, 45%)`;

const BASEMAP_ICON = `
  <polygon points="12 2 2 7 12 12 22 7 12 2" />
  <polyline points="2 17 12 22 22 17" />
  <polyline points="2 12 12 17 22 12" />
`;
const LAYER_ICON = `
  <rect x="3" y="4" width="18" height="4" rx="1" />
  <rect x="3" y="10" width="18" height="4" rx="1" />
  <rect x="3" y="16" width="18" height="4" rx="1" />
`;

class BasemapControl extends DropdownControl {
  constructor(onSelect) {
    super({ icon: BASEMAP_ICON, title: 'Ganti basemap', label: 'Basemap', placement: 'left' });
    this._onSelect = onSelect;
  }

  buildMenu(menu) {
    const list = document.createElement('div');
    list.className = 'dropdown-options';

    BASEMAP_ORDER.forEach((key) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'dropdown-option' + (key === DEFAULT_BASEMAP ? ' active' : '');
      option.textContent = BASEMAPS[key].label;
      option.addEventListener('click', () => {
        this._onSelect(key);
        list.querySelectorAll('.dropdown-option').forEach((b) => b.classList.toggle('active', b === option));
        this.close();
      });
      list.appendChild(option);
    });

    menu.appendChild(list);
  }
}

class LayerControl extends DropdownControl {
  constructor(items) {
    super({ icon: LAYER_ICON, title: 'Layer', ariaLabel: 'Kelola layer', label: 'Layer Data' });
    this._items = items;
  }

  buildMenu(menu) {
    this._items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'layer-option';
      row.innerHTML = `
        <label class="layer-option-header"><input type="checkbox" checked /><span>${item.label}</span></label>
      `;

      const checkbox = row.querySelector('input');
      checkbox.addEventListener('change', () => {
        row.classList.toggle('is-off', !checkbox.checked);
        item.onToggle(checkbox.checked);
      });

      if (item.opacity) {
        const pct = Math.round(item.opacity.value * 100);
        const opacityRow = document.createElement('div');
        opacityRow.className = 'layer-opacity-row';
        opacityRow.innerHTML = `
          <input type="range" min="0" max="100" value="${pct}" />
          <span class="layer-opacity-value">${pct}%</span>
        `;
        const range = opacityRow.querySelector('input');
        const valueEl = opacityRow.querySelector('.layer-opacity-value');
        range.addEventListener('input', () => {
          valueEl.textContent = `${range.value}%`;
          item.opacity.onChange(Number(range.value) / 100);
        });
        row.appendChild(opacityRow);
      }

      menu.appendChild(row);
    });
  }
}

class NumericScaleControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl numeric-scale-control';
    this._update = this._update.bind(this);
    map.on('move', this._update);
    this._update();
    return this._container;
  }

  onRemove() {
    this._map.off('move', this._update);
    this._container.remove();
    this._map = undefined;
  }

  _update() {
    const { lat } = this._map.getCenter();
    this._container.textContent = fmtScale(screenScaleDenominator(lat, this._map.getZoom()));
  }
}

export function createLbsPage(slug) {
  const region = REGION_BY_SLUG[slug];
  if (!region) throw new Error(`Wilayah tidak dikenal: ${slug}`);

  const { kabName, kabLabel, center, zoom } = region;
  const logo = LOGOS[slug];

  const BASE = import.meta.env.BASE_URL;
  const GEOJSON_URL = `${BASE}data/generated/lbs-${slug}.geojson`;
  const STATS_URL = `${BASE}data/generated/stats-lbs-${slug}.json`;
  const ATTRS_URL = `${BASE}data/generated/attrs-lbs-${slug}.json`;

  const SOURCE_ID = `lbs-${slug}`;
  const FILL_LAYER = `lbs-${slug}-fill`;
  const OUTLINE_LAYER = `lbs-${slug}-outline`;

  let kecOrder = [];
  let kecColors = {};
  let stats = null;
  let attrsPromise = null;
  let activeKec = '';

  document.getElementById('app').innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <a class="topbar-home" href="${BASE}" title="Kembali ke Beranda" aria-label="Kembali ke Beranda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Beranda</span>
        </a>
        <nav class="breadcrumb" aria-label="Lokasi saat ini">
          <span class="breadcrumb-sep" aria-hidden="true">/</span>
          <img class="brand-logo" src="${logo}" alt="Logo ${kabLabel}" />
          <div>
            <div class="brand-title">LBS ${kabName}</div>
            <div class="brand-sub">Lahan Baku Sawah</div>
          </div>
        </nav>
      </div>

      <div class="topbar-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input id="search-input" type="text" placeholder="Cari kecamatan, atau koordinat (lat, lon)" />
      </div>

      <div class="topbar-right">
        <div class="view-toggle" id="view-toggle">
          <button class="active" type="button" data-projection="mercator">2D</button>
          <button type="button" data-projection="globe">Globe</button>
        </div>
      </div>
    </header>

    <div class="body-row">
      <nav class="sidebar">
        <button class="side-item active" type="button" title="Lahan Baku Sawah" aria-label="Lahan Baku Sawah">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 20h10" />
            <path d="M10 20c0-4.4 2-6.7 4-8.4" />
            <path d="M9.5 9.4c1.1.8 1.8 2.2 2 3.6" />
            <path d="M14 10.5c1.5-1 3.5-2.5 3-5.5-3 0-5 1-6 2.5" />
            <path d="M9 9.5C9 5.5 7 4 4 4c0 3.5 1 5 5 5.5" />
          </svg>
          <span>Lahan Baku Sawah</span>
        </button>
      </nav>

      <main class="map-area">
        <div id="map"></div>
        <div class="map-status" id="map-status" hidden>
          <span class="map-status-spinner" id="map-status-spinner"></span>
          <span class="map-status-text" id="map-status-text"></span>
          <button class="map-status-retry" id="map-status-retry" type="button" hidden>Coba Lagi</button>
        </div>
      </main>

      <aside class="panel" id="panel">
        <div class="panel-header">
          <h1 id="panel-title">${kabLabel}</h1>
          <p class="panel-sub">Luas LBS — Tahun 2025</p>
        </div>

        <div class="panel-error" id="panel-error" hidden>
          <span id="panel-error-text">Gagal memuat statistik.</span>
          <button type="button" id="panel-error-retry">Coba Lagi</button>
        </div>

        <div class="panel-section">
          <div class="section-label">Filter Wilayah</div>
          <div class="chip-label">Kecamatan</div>
          <div class="chip-row" id="kec-filter">
            <button class="chip active" type="button" data-kec="">Semua ${kabName}</button>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Total LBS</div>
            <div class="stat-value skeleton-text" id="stat-total">–</div>
            <div class="stat-unit">Hektar</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Jumlah Bidang</div>
            <div class="stat-value skeleton-text" id="stat-count">–</div>
            <div class="stat-unit">Bidang</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Rata-rata Luas</div>
            <div class="stat-value skeleton-text" id="stat-avg">–</div>
            <div class="stat-unit">Ha / bidang</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">% dari ${kabName}</div>
            <div class="stat-value skeleton-text" id="stat-pct">–</div>
            <div class="stat-unit">dari total luas</div>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Distribusi Luas LBS</div>
            <div class="chart-sub">Per Kecamatan · 2025</div>
          </div>
          <div class="bar-chart" id="bar-chart">
            <div class="bar-row-skeleton"></div>
            <div class="bar-row-skeleton"></div>
            <div class="bar-row-skeleton"></div>
            <div class="bar-row-skeleton"></div>
          </div>
        </div>
      </aside>
    </div>
  `;

  const basemapLayer = (key) => ({
    id: 'basemap-layer',
    type: 'raster',
    source: 'basemap',
    metadata: { legendLabel: `Basemap — ${BASEMAPS[key].label}` }
  });

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: { basemap: toRasterSource(DEFAULT_BASEMAP) },
      layers: [basemapLayer(DEFAULT_BASEMAP)]
    },
    center,
    zoom,
    canvasContextAttributes: { preserveDrawingBuffer: true }
  });

  function setBasemap(key) {
    if (!BASEMAPS[key]) return;
    if (map.getLayer('basemap-layer')) map.removeLayer('basemap-layer');
    if (map.getSource('basemap')) map.removeSource('basemap');
    map.addSource('basemap', toRasterSource(key));
    map.addLayer(basemapLayer(key), map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined);
  }

  let fillVisible = true;
  let outlineVisible = true;
  let fillOpacity = 0.45;

  function syncLayerState() {
    if (map.getLayer(FILL_LAYER)) {
      map.setLayoutProperty(FILL_LAYER, 'visibility', fillVisible ? 'visible' : 'none');
      map.setPaintProperty(FILL_LAYER, 'fill-opacity', fillOpacity);
    }
    if (map.getLayer(OUTLINE_LAYER)) {
      map.setLayoutProperty(OUTLINE_LAYER, 'visibility', outlineVisible ? 'visible' : 'none');
    }
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new BasemapControl(setBasemap), 'bottom-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }),
    'bottom-right'
  );
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.addControl(new NumericScaleControl(), 'bottom-left');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');

  map.addControl(
    new LayerControl([
      {
        label: 'Isi Poligon LBS',
        opacity: {
          value: fillOpacity,
          onChange: (value) => {
            fillOpacity = value;
            syncLayerState();
          }
        },
        onToggle: (checked) => {
          fillVisible = checked;
          syncLayerState();
        }
      },
      {
        label: 'Garis Batas Bidang',
        onToggle: (checked) => {
          outlineVisible = checked;
          syncLayerState();
        }
      }
    ]),
    'top-left'
  );

  const measureControl = new MeasureControl();
  map.addControl(measureControl, 'top-left');
  const uploadControl = new UploadControl();
  map.addControl(uploadControl, 'top-left');

  map.addControl(
    new PrintControl({
      getDefaults: () => ({
        title: `Peta Kerja Lahan Baku Sawah ${activeKec ? `Kecamatan ${activeKec}` : kabLabel}`,
        subtitle: `${activeKec ? `${activeKec}, ` : ''}${kabLabel}, D.I. Yogyakarta — Tahun 2025`,
        source: 'Kementerian Pertanian RI — Lahan Baku Sawah (LBS) 2025',
        agency: `Pemerintah ${kabLabel}`,
        logo,
        paper: 'A4',
        orientation: 'landscape',
        imageFormat: 'png'
      })
    }),
    'top-left'
  );

  const statusEl = document.getElementById('map-status');
  const statusText = document.getElementById('map-status-text');
  const statusRetry = document.getElementById('map-status-retry');
  const panelError = document.getElementById('panel-error');
  const panelErrorText = document.getElementById('panel-error-text');

  function showStatus(text, { error = false, retry = null } = {}) {
    statusEl.hidden = false;
    statusEl.classList.toggle('is-error', error);
    statusText.textContent = text;
    document.getElementById('map-status-spinner').hidden = error;
    statusRetry.hidden = !retry;
    statusRetry.onclick = retry;
  }

  function setStatSkeleton(on) {
    STAT_IDS.forEach((id) => document.getElementById(id).classList.toggle('skeleton-text', on));
  }

  function renderBarChart() {
    const el = document.getElementById('bar-chart');
    const maxLuas = Math.max(...kecOrder.map((k) => stats.byKecamatan[k].luasHa));
    el.innerHTML = '';

    kecOrder.forEach((kec) => {
      const entry = stats.byKecamatan[kec];
      const widthPct = maxLuas ? (entry.luasHa / maxLuas) * 100 : 0;

      const row = document.createElement('div');
      row.className = 'bar-row' + (activeKec && activeKec !== kec ? ' dim' : '');
      row.innerHTML = `
        <div class="bar-row-top">
          <span class="bar-row-name">
            <span class="bar-row-swatch" style="background:${kecColors[kec]}"></span>
            ${kec}
          </span>
          <span class="bar-row-value">${fmtHa(entry.luasHa)} Ha &middot; ${entry.persenDariKabupaten.toFixed(1)}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${widthPct}%; background:${kecColors[kec]}"></div>
        </div>
      `;
      row.addEventListener('click', () => setActiveKec(kec));
      el.appendChild(row);
    });
  }

  function updateStatCards() {
    const scope = activeKec
      ? stats.byKecamatan[activeKec]
      : {
          luasHa: stats.totalLuasHa,
          jumlahBidang: stats.jumlahBidang,
          rataRataHa: stats.rataRataHa,
          persenDariKabupaten: 100
        };

    document.getElementById('stat-total').textContent = fmtHa(scope.luasHa);
    document.getElementById('stat-count').textContent = fmtInt(scope.jumlahBidang);
    document.getElementById('stat-avg').textContent = fmtHa(scope.rataRataHa);
    document.getElementById('stat-pct').textContent = `${scope.persenDariKabupaten.toFixed(1)}%`;
    document.getElementById('panel-title').textContent = activeKec || kabLabel;
  }

  function setActiveKec(kec) {
    activeKec = kec;

    document.querySelectorAll('#kec-filter .chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.kec === kec);
    });

    if (map.getLayer(FILL_LAYER)) {
      const filter = kec ? ['==', ['get', 'WADMKC'], kec] : null;
      map.setFilter(FILL_LAYER, filter);
      map.setFilter(OUTLINE_LAYER, filter);
    }

    if (!stats) return;
    const bbox = kec ? stats.byKecamatan[kec]?.bbox : stats.bbox;
    if (bbox) map.fitBounds(bbox, { padding: 40, duration: 600 });
    updateStatCards();
    renderBarChart();
  }

  function buildKecChips() {
    const row = document.getElementById('kec-filter');
    row.querySelectorAll('.chip[data-kec]:not([data-kec=""])').forEach((btn) => btn.remove());
    kecOrder.forEach((kec) => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.type = 'button';
      btn.dataset.kec = kec;
      btn.textContent = kec;
      btn.addEventListener('click', () => setActiveKec(kec));
      row.appendChild(btn);
    });
  }

  function setupSearch() {
    const input = document.getElementById('search-input');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const query = input.value.trim();
      if (!query) return;

      const coords = query.match(COORD_PATTERN);
      if (coords) {
        map.flyTo({ center: [Number(coords[2]), Number(coords[1])], zoom: 15 });
        return;
      }

      const needle = query.toLowerCase();
      setActiveKec(kecOrder.find((k) => k.toLowerCase().includes(needle)) || '');
    });
  }

  function setupViewToggle() {
    const row = document.getElementById('view-toggle');
    row.querySelectorAll('button[data-projection]').forEach((btn) => {
      btn.addEventListener('click', () => {
        map.setProjection({ type: btn.dataset.projection });
        row.querySelectorAll('button[data-projection]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }

  function loadStats() {
    panelError.hidden = true;
    setStatSkeleton(true);
    fetchJsonWithTimeout(STATS_URL, { timeoutMs: 10000 })
      .then((data) => {
        stats = data;
        kecOrder = data.kecamatan;
        kecColors = Object.fromEntries(kecOrder.map((kec, i) => [kec, categoricalColor(i)]));
        setStatSkeleton(false);
        buildKecChips();
        updateStatCards();
        renderBarChart();
      })
      .catch((err) => {
        panelError.hidden = false;
        panelErrorText.textContent = `Gagal memuat statistik: ${err.message}`;
      });
  }

  function loadPolygons() {
    showStatus('Memuat poligon LBS…');
    loadGeojsonViaWorker(GEOJSON_URL, { timeoutMs: 25000 })
      .then((geojson) => {
        statusEl.hidden = true;

        if (map.getSource(SOURCE_ID)) {
          map.getSource(SOURCE_ID).setData(geojson);
        } else {
          const order = kecOrder.length
            ? kecOrder
            : [...new Set(geojson.features.map((f) => f.properties.WADMKC))].sort();
          const colorMatch = ['match', ['get', 'WADMKC']];
          order.forEach((kec, i) => colorMatch.push(kec, kecColors[kec] || categoricalColor(i)));
          colorMatch.push('#9a9a9a');

          map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
          map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: SOURCE_ID,
            metadata: { legendLabel: 'Lahan Baku Sawah per Kecamatan' },
            paint: { 'fill-color': colorMatch, 'fill-opacity': fillOpacity }
          });
          map.addLayer({
            id: OUTLINE_LAYER,
            type: 'line',
            source: SOURCE_ID,
            metadata: { legendLabel: 'Garis Batas Bidang', legendCollapse: true },
            paint: { 'line-color': colorMatch, 'line-width': 1 }
          });

          setupFeaturePopup();
          syncLayerState();
        }

        if (stats?.bbox) map.fitBounds(stats.bbox, { padding: 40 });
        attrsPromise = fetchJsonWithTimeout(ATTRS_URL, { timeoutMs: 30000 }).catch((err) => {
          console.warn(`[lbs-${slug}] Gagal memuat atribut detail:`, err.message);
          return null;
        });
      })
      .catch((err) => {
        showStatus(`Gagal memuat poligon: ${err.message}`, { error: true, retry: loadPolygons });
      });
  }

  function setupFeaturePopup() {
    bindFeaturePopup(map, [FILL_LAYER], {
      skip: (e) => measureControl.isActive() || uploadControl.hasFeatureAt(e.point),
      render: async (e, popup) => {
        const feature = e.features[0];
        popup
          .setLngLat(e.lngLat)
          .setHTML(popupHtml('Detail Bidang', '<div class="feature-popup-loading">Memuat atribut…</div>'))
          .addTo(map);

        const attrs = await (attrsPromise || Promise.resolve(null));
        const props = attrs?.[feature.properties._fid];

        popup.setHTML(
          props
            ? buildPopupHTML(props, e.lngLat)
            : popupHtml(
                'Detail Bidang',
                `<div class="feature-popup-loading">Atribut lengkap gagal dimuat. Kecamatan: ${
                  feature.properties.WADMKC || '-'
                }</div>${directionButtonHtml(e.lngLat.lat, e.lngLat.lng)}`
              )
        );
      }
    });
  }

  map.on('load', () => {
    setupViewToggle();
    setupSearch();
    document.querySelector('#kec-filter .chip[data-kec=""]').addEventListener('click', () => setActiveKec(''));
    document.getElementById('panel-error-retry').addEventListener('click', loadStats);

    const geolocateBtn = document.querySelector('.maplibregl-ctrl-geolocate');
    if (geolocateBtn) {
      geolocateBtn.title = 'Lokasi Saya';
      geolocateBtn.setAttribute('aria-label', 'Lokasi Saya');
    }

    loadStats();
    loadPolygons();
  });

  return map;
}
