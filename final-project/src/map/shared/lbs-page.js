import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './lbs-page.css';
import { BASEMAPS, BASEMAP_ORDER, DEFAULT_BASEMAP, toRasterSource } from './basemaps.js';
import { fetchJsonWithTimeout, loadGeojsonViaWorker } from './data-loading.js';

export function createLbsPage(config) {
  const {
    slug,
    kabName,
    kabLabel,
    logo,
    logoAlt,
    center,
    zoom
  } = config;

  const BASE = import.meta.env.BASE_URL;
  const GEOJSON_URL = `${BASE}data/generated/lbs-${slug}.geojson`;
  const STATS_URL = `${BASE}data/generated/stats-lbs-${slug}.json`;
  const ATTRS_URL = `${BASE}data/generated/attrs-lbs-${slug}.json`;

  const SOURCE_ID = `lbs-${slug}`;
  const FILL_LAYER = `lbs-${slug}-fill`;
  const OUTLINE_LAYER = `lbs-${slug}-outline`;

  let KEC_ORDER = [];
  let KEC_COLORS = {};
  const setKecamatan = (list) => {
    KEC_ORDER = list;
    KEC_COLORS = Object.fromEntries(
      KEC_ORDER.map((kec, i) => [kec, `hsl(${Math.round((i * 137.508) % 360)}, 65%, 45%)`])
    );
  };

  function buildLayout() {
    const app = document.getElementById('app');
    app.innerHTML = `
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
            <img class="brand-logo" src="${logo}" alt="${logoAlt}" />
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
  }
  buildLayout();

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: { basemap: toRasterSource(DEFAULT_BASEMAP) },
      layers: [{ id: 'basemap-layer', type: 'raster', source: 'basemap' }]
    },
    center,
    zoom
  });

  function setBasemap(key) {
    if (!BASEMAPS[key]) return;
    if (map.getLayer('basemap-layer')) map.removeLayer('basemap-layer');
    if (map.getSource('basemap')) map.removeSource('basemap');
    map.addSource('basemap', toRasterSource(key));
    const beforeId = map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined;
    map.addLayer({ id: 'basemap-layer', type: 'raster', source: 'basemap' }, beforeId);
  }

  class BasemapControl {
    onAdd(mapInstance) {
      this._map = mapInstance;
      this._container = document.createElement('div');
      this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group basemap-control';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'maplibregl-ctrl-icon basemap-toggle';
      toggle.title = 'Ganti basemap';
      toggle.setAttribute('aria-label', 'Ganti basemap');
      toggle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      `;

      const menu = document.createElement('div');
      menu.className = 'basemap-menu';
      menu.innerHTML = `<div class="basemap-menu-label">Basemap</div>`;
      BASEMAP_ORDER.forEach((key) => {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'basemap-option' + (key === DEFAULT_BASEMAP ? ' active' : '');
        opt.dataset.basemap = key;
        opt.textContent = BASEMAPS[key].label;
        opt.addEventListener('click', () => {
          setBasemap(key);
          menu.querySelectorAll('.basemap-option').forEach((b) => b.classList.toggle('active', b === opt));
          this._container.classList.remove('open');
        });
        menu.appendChild(opt);
      });

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this._container.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!this._container.contains(e.target)) this._container.classList.remove('open');
      });

      this._container.appendChild(toggle);
      this._container.appendChild(menu);
      return this._container;
    }

    onRemove() {
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new BasemapControl(), 'bottom-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }),
    'bottom-right'
  );

  class NumericScaleControl {
    onAdd(mapInstance) {
      this._map = mapInstance;
      this._container = document.createElement('div');
      this._container.className = 'maplibregl-ctrl numeric-scale-control';
      this._update = this._update.bind(this);
      mapInstance.on('move', this._update);
      this._update();
      return this._container;
    }

    onRemove() {
      this._map.off('move', this._update);
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }

    _update() {
      const { lat } = this._map.getCenter();
      const zoomNow = this._map.getZoom();
      const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoomNow);
      const screenDpi = 96;
      const scaleDenominator = Math.round((metersPerPixel * screenDpi) / 0.0254);
      this._container.textContent = `1 : ${scaleDenominator.toLocaleString('id-ID')}`;
    }
  }

  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.addControl(new NumericScaleControl(), 'bottom-left');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');

  const fmtHa = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  const fmtInt = (n) => n.toLocaleString('id-ID');

  const statusEl = document.getElementById('map-status');
  const statusText = document.getElementById('map-status-text');
  const statusRetry = document.getElementById('map-status-retry');

  function showStatus(text, { error = false, retry = null } = {}) {
    statusEl.hidden = false;
    statusEl.classList.toggle('is-error', error);
    statusText.textContent = text;
    document.getElementById('map-status-spinner').hidden = error;
    if (retry) {
      statusRetry.hidden = false;
      statusRetry.onclick = retry;
    } else {
      statusRetry.hidden = true;
      statusRetry.onclick = null;
    }
  }
  function hideStatus() {
    statusEl.hidden = true;
  }

  const panelError = document.getElementById('panel-error');
  const panelErrorText = document.getElementById('panel-error-text');
  const panelErrorRetry = document.getElementById('panel-error-retry');

  function setStatSkeleton(on) {
    ['stat-total', 'stat-count', 'stat-avg', 'stat-pct'].forEach((id) => {
      document.getElementById(id).classList.toggle('skeleton-text', on);
    });
  }

  function renderBarChart(stats, activeKec) {
    const el = document.getElementById('bar-chart');
    const maxLuas = Math.max(...KEC_ORDER.map((k) => stats.byKecamatan[k].luasHa));
    el.innerHTML = '';

    KEC_ORDER.forEach((kec) => {
      const entry = stats.byKecamatan[kec];
      const widthPct = maxLuas ? (entry.luasHa / maxLuas) * 100 : 0;
      const isDim = activeKec && activeKec !== kec;

      const row = document.createElement('div');
      row.className = 'bar-row' + (isDim ? ' dim' : '');
      row.dataset.kec = kec;
      row.innerHTML = `
        <div class="bar-row-top">
          <span class="bar-row-name">
            <span class="bar-row-swatch" style="background:${KEC_COLORS[kec]}"></span>
            ${kec}
          </span>
          <span class="bar-row-value">${fmtHa(entry.luasHa)} Ha &middot; ${entry.persenDariKabupaten.toFixed(1)}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${widthPct}%; background:${KEC_COLORS[kec]}"></div>
        </div>
      `;
      row.addEventListener('click', () => setActiveKec(kec));
      el.appendChild(row);
    });
  }

  function updateStatCards(stats, activeKec) {
    const scope = activeKec
      ? stats.byKecamatan[activeKec]
      : { luasHa: stats.totalLuasHa, jumlahBidang: stats.jumlahBidang, rataRataHa: stats.rataRataHa, persenDariKabupaten: 100 };

    document.getElementById('stat-total').textContent = fmtHa(scope.luasHa);
    document.getElementById('stat-count').textContent = fmtInt(scope.jumlahBidang);
    document.getElementById('stat-avg').textContent = fmtHa(scope.rataRataHa);
    document.getElementById('stat-pct').textContent = `${scope.persenDariKabupaten.toFixed(1)}%`;
    document.getElementById('panel-title').textContent = activeKec || kabLabel;
  }

  let stats = null;
  let attrsPromise = null;
  let activeKec = '';

  function setActiveKec(kec) {
    activeKec = kec;

    document.querySelectorAll('#kec-filter .chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.kec === kec);
    });

    if (map.getLayer(FILL_LAYER)) {
      map.setFilter(FILL_LAYER, kec ? ['==', ['get', 'WADMKC'], kec] : null);
      map.setFilter(OUTLINE_LAYER, kec ? ['==', ['get', 'WADMKC'], kec] : null);
    }

    if (stats) {
      const bbox = kec ? stats.byKecamatan[kec]?.bbox : stats.bbox;
      if (bbox) map.fitBounds(bbox, { padding: 40, duration: 600 });
      updateStatCards(stats, kec);
      renderBarChart(stats, kec);
    }
  }

  function buildKecChips() {
    const row = document.getElementById('kec-filter');
    row.querySelectorAll('.chip[data-kec]:not([data-kec=""])').forEach((btn) => btn.remove());
    KEC_ORDER.forEach((kec) => {
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
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      const match = KEC_ORDER.find((k) => k.toLowerCase().includes(q));
      setActiveKec(match || '');
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
        setKecamatan(data.kecamatan);
        setStatSkeleton(false);
        buildKecChips();
        updateStatCards(stats, activeKec);
        renderBarChart(stats, activeKec);
      })
      .catch((err) => {
        panelError.hidden = false;
        panelErrorText.textContent = `Gagal memuat statistik: ${err.message}`;
      });
  }
  panelErrorRetry.addEventListener('click', loadStats);

  function loadPolygons() {
    showStatus('Memuat poligon LBS…');
    loadGeojsonViaWorker(GEOJSON_URL, { timeoutMs: 25000 })
      .then((geojson) => {
        hideStatus();

        if (map.getSource(SOURCE_ID)) {
          map.getSource(SOURCE_ID).setData(geojson);
        } else {
          map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });

          const order = KEC_ORDER.length
            ? KEC_ORDER
            : [...new Set(geojson.features.map((f) => f.properties.WADMKC))].sort();
          const colorMatch = ['match', ['get', 'WADMKC']];
          order.forEach((kec, i) => {
            colorMatch.push(kec, KEC_COLORS[kec] || `hsl(${Math.round((i * 137.508) % 360)}, 65%, 45%)`);
          });
          colorMatch.push('#9a9a9a');

          map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: SOURCE_ID,
            paint: { 'fill-color': colorMatch, 'fill-opacity': 0.45 }
          });
          map.addLayer({
            id: OUTLINE_LAYER,
            type: 'line',
            source: SOURCE_ID,
            paint: { 'line-color': colorMatch, 'line-width': 1 }
          });

          setupFeaturePopup();
        }

        if (stats?.bbox) map.fitBounds(stats.bbox, { padding: 40 });
        loadAttrs();
      })
      .catch((err) => {
        showStatus(`Gagal memuat poligon: ${err.message}`, { error: true, retry: loadPolygons });
      });
  }

  function loadAttrs() {
    attrsPromise = fetchJsonWithTimeout(ATTRS_URL, { timeoutMs: 30000 }).catch((err) => {
      console.warn(`[lbs-${slug}] Gagal memuat atribut detail:`, err.message);
      return null;
    });
  }

  function setupFeaturePopup() {
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '320px' });

    function renderProps(props) {
      return Object.keys(props)
        .map((key) => {
          let value = props[key];
          if (value === null || value === undefined || value === '') value = '-';
          else if (typeof value === 'number') value = value.toLocaleString('id-ID', { maximumFractionDigits: 3 });
          return `<tr><th>${key}</th><td>${value}</td></tr>`;
        })
        .join('');
    }

    map.on('click', FILL_LAYER, async (e) => {
      const feature = e.features[0];
      const fid = feature.properties._fid;

      popup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="feature-popup">
            <div class="feature-popup-title">Detail Bidang</div>
            <div class="feature-popup-loading">Memuat atribut…</div>
          </div>
        `)
        .addTo(map);

      const attrs = await (attrsPromise || Promise.resolve(null));
      const props = attrs ? attrs[fid] : null;

      popup.setHTML(`
        <div class="feature-popup">
          <div class="feature-popup-title">Detail Bidang</div>
          <div class="feature-popup-scroll">
            ${
              props
                ? `<table class="feature-popup-table">${renderProps(props)}</table>`
                : '<div class="feature-popup-loading">Atribut lengkap gagal dimuat. Kecamatan: ' +
                  (feature.properties.WADMKC || '-') +
                  '</div>'
            }
          </div>
        </div>
      `);
    });

    map.on('mouseenter', FILL_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', FILL_LAYER, () => { map.getCanvas().style.cursor = ''; });
  }

  map.on('load', () => {
    setupViewToggle();
    setupSearch();
    document.querySelector('#kec-filter .chip[data-kec=""]').addEventListener('click', () => setActiveKec(''));

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
