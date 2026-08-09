import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './peta-kerja-bantul.css';
import kabLogo from '../../assets/logo_kabupaten_bantul.png';

const GEOJSON_URL = '/src/prov-diy-assets/diy-lbs25/LBS_DIY_66871HA.geojson';

const KAB_NAME = 'Bantul';
const KAB_LABEL = 'Kabupaten Bantul';

// Urutan tetap kecamatan di Kabupaten Bantul + warna kategorikal
// (dibuat otomatis dengan golden-angle hue supaya tiap kecamatan punya warna berbeda)
const KEC_ORDER = [
  'Bambanglipuro', 'Banguntapan', 'Bantul', 'Dlingo', 'Imogiri', 'Jetis',
  'Kasihan', 'Kretek', 'Pajangan', 'Pandak', 'Piyungan', 'Pleret',
  'Pundong', 'Sanden', 'Sedayu', 'Sewon', 'Srandakan'
];
const KEC_COLORS = Object.fromEntries(
  KEC_ORDER.map((kec, i) => [kec, `hsl(${Math.round((i * 137.508) % 360)}, 65%, 45%)`])
);

const BASEMAPS = {
  google: {
    label: 'Google Maps',
    tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '© Google'
  },
  osm: {
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '© OpenStreetMap contributors'
  },
  esri: {
    label: 'Esri Basemaps',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Esri, Maxar, Earthstar Geographics'
  },
  'esri-topo': {
    label: 'Esri Topografi',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS'
  }
};
const BASEMAP_ORDER = ['google', 'osm', 'esri', 'esri-topo'];
const DEFAULT_BASEMAP = 'google';

// Tata letak halaman dibangun di sini (bukan statis di index.html) supaya
// index.html tetap jadi shell minimal dan seluruh UI dikendalikan dari JS.
function buildLayout() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <img class="brand-logo" src="${kabLogo}" alt="Logo Kabupaten Bantul" />
        <div>
          <div class="brand-title">LBS Bantul</div>
          <div class="brand-sub">Lahan Baku Sawah</div>
        </div>
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
        <button class="side-item active" type="button" title="Lahan Sawah Dilindungi / Lahan Pertanian Pangan Berkelanjutan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12l9-9 9 9" />
            <path d="M5 10v10h14V10" />
          </svg>
          <span>Lahan Baku Sawah</span>
        </button>
      </nav>

      <main class="map-area">
        <div id="map"></div>
      </main>

      <aside class="panel" id="panel">
        <div class="panel-header">
          <h1 id="panel-title">Kabupaten Bantul</h1>
          <p class="panel-sub">Luas LBS — Tahun 2025</p>
        </div>

        <div class="panel-section">
          <div class="section-label">Filter Wilayah</div>
          <div class="chip-label">Kecamatan</div>
          <div class="chip-row" id="kec-filter">
            <button class="chip active" type="button" data-kec="">Semua Bantul</button>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Total LBS</div>
            <div class="stat-value" id="stat-total">–</div>
            <div class="stat-unit">Hektar</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Jumlah Bidang</div>
            <div class="stat-value" id="stat-count">–</div>
            <div class="stat-unit">Bidang</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Rata-rata Luas</div>
            <div class="stat-value" id="stat-avg">–</div>
            <div class="stat-unit">Ha / bidang</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">% dari Bantul</div>
            <div class="stat-value" id="stat-pct">–</div>
            <div class="stat-unit">dari total luas</div>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Distribusi Luas LBS</div>
            <div class="chart-sub">Per Kecamatan · 2025</div>
          </div>
          <div class="bar-chart" id="bar-chart"></div>
        </div>
      </aside>
    </div>
  `;
}
buildLayout();

const toRasterSource = (key) => {
  const { label, ...source } = BASEMAPS[key];
  return { type: 'raster', ...source };
};

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      basemap: toRasterSource(DEFAULT_BASEMAP)
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap'
      }
    ]
  },
  center: [110.3669, -7.8984], // sekitar Kabupaten Bantul
  zoom: 11
});

function setBasemap(key) {
  if (!BASEMAPS[key]) return;

  if (map.getLayer('basemap-layer')) map.removeLayer('basemap-layer');
  if (map.getSource('basemap')) map.removeSource('basemap');

  map.addSource('basemap', toRasterSource(key));
  const beforeId = map.getLayer('lbs-bantul-fill') ? 'lbs-bantul-fill' : undefined;
  map.addLayer({ id: 'basemap-layer', type: 'raster', source: 'basemap' }, beforeId);
}

// Kontrol MapLibre kustom: tombol basemap ditumpuk di stack bottom-right,
// tepat di bawah tombol zoom-out (NavigationControl).
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

const getBounds = (features) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      coords.forEach(walk);
    }
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return [[minX, minY], [maxX, maxY]];
};

const fmtHa = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
const fmtInt = (n) => n.toLocaleString('id-ID');

function aggregate(features) {
  const byKec = {};
  KEC_ORDER.forEach((k) => {
    byKec[k] = { luas: 0, count: 0, features: [] };
  });
  let totalLuas = 0;
  let totalCount = 0;

  features.forEach((f) => {
    const kec = f.properties.WADMKC;
    // Kolom LUAS kosong di sumber data; Shape_Area (m²) terisi valid,
    // jadi luas hektar dihitung dari situ (1 ha = 10.000 m²).
    const luas = (f.properties.Shape_Area || 0) / 10000;
    totalLuas += luas;
    totalCount += 1;
    if (byKec[kec]) {
      byKec[kec].luas += luas;
      byKec[kec].count += 1;
      byKec[kec].features.push(f);
    }
  });

  return { totalLuas, totalCount, byKec };
}

function renderBarChart(byKec, totalLuas, activeKec) {
  const el = document.getElementById('bar-chart');
  const maxLuas = Math.max(...KEC_ORDER.map((k) => byKec[k].luas));
  el.innerHTML = '';

  KEC_ORDER.forEach((kec) => {
    const luas = byKec[kec].luas;
    const pct = totalLuas ? (luas / totalLuas) * 100 : 0;
    const widthPct = maxLuas ? (luas / maxLuas) * 100 : 0;
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
        <span class="bar-row-value">${fmtHa(luas)} Ha &middot; ${pct.toFixed(1)}%</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${widthPct}%; background:${KEC_COLORS[kec]}"></div>
      </div>
    `;
    row.addEventListener('click', () => setActiveKec(kec));
    el.appendChild(row);
  });
}

function updateStats(byKec, totalLuas, totalCount, activeKec) {
  const scope = activeKec ? byKec[activeKec] : { luas: totalLuas, count: totalCount };
  const avg = scope.count ? scope.luas / scope.count : 0;
  const pct = totalLuas ? (scope.luas / totalLuas) * 100 : 0;

  document.getElementById('stat-total').textContent = fmtHa(scope.luas);
  document.getElementById('stat-count').textContent = fmtInt(scope.count);
  document.getElementById('stat-avg').textContent = fmtHa(avg);
  document.getElementById('stat-pct').textContent = `${pct.toFixed(1)}%`;
  document.getElementById('panel-title').textContent = activeKec || KAB_LABEL;
}

let state = null;
let activeKec = '';

function setActiveKec(kec) {
  activeKec = kec;

  document.querySelectorAll('#kec-filter .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.kec === kec);
  });

  if (map.getLayer('lbs-bantul-fill')) {
    map.setFilter('lbs-bantul-fill', kec ? ['==', ['get', 'WADMKC'], kec] : null);
    map.setFilter('lbs-bantul-outline', kec ? ['==', ['get', 'WADMKC'], kec] : null);
  }

  const targetFeatures = kec ? state.byKec[kec].features : state.master.features;
  if (targetFeatures.length) {
    map.fitBounds(getBounds(targetFeatures), { padding: 40, duration: 600 });
  }

  updateStats(state.byKec, state.totalLuas, state.totalCount, kec);
  renderBarChart(state.byKec, state.totalLuas, kec);
}

function buildKecChips() {
  const row = document.getElementById('kec-filter');
  KEC_ORDER.forEach((kec) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.dataset.kec = kec;
    btn.textContent = kec;
    btn.addEventListener('click', () => setActiveKec(kec));
    row.appendChild(btn);
  });
  row.querySelector('.chip[data-kec=""]').addEventListener('click', () => setActiveKec(''));
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

// Toggle 2D/Globe pakai proyeksi bawaan MapLibre GL (tanpa engine 3D terpisah).
function setupViewToggle() {
  const row = document.getElementById('view-toggle');
  row.querySelectorAll('button[data-projection]').forEach((btn) => {
    btn.addEventListener('click', () => {
      map.setProjection({ type: btn.dataset.projection });
      row.querySelectorAll('button[data-projection]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
}

map.on('load', async () => {
  buildKecChips();
  setupSearch();
  setupViewToggle();

  const geolocateBtn = document.querySelector('.maplibregl-ctrl-geolocate');
  if (geolocateBtn) {
    geolocateBtn.title = 'Lokasi Saya';
    geolocateBtn.setAttribute('aria-label', 'Lokasi Saya');
  }

  const res = await fetch(GEOJSON_URL);
  const diy = await res.json();
  const master = {
    type: 'FeatureCollection',
    features: diy.features.filter((f) => f.properties.WADMKK === KAB_NAME)
  };
  const { totalLuas, totalCount, byKec } = aggregate(master.features);
  state = { master, totalLuas, totalCount, byKec };

  map.addSource('lbs-bantul', {
    type: 'geojson',
    data: master
  });

  const colorMatch = ['match', ['get', 'WADMKC']];
  KEC_ORDER.forEach((kec) => {
    colorMatch.push(kec, KEC_COLORS[kec]);
  });
  colorMatch.push('#9a9a9a');

  map.addLayer({
    id: 'lbs-bantul-fill',
    type: 'fill',
    source: 'lbs-bantul',
    paint: {
      'fill-color': colorMatch,
      'fill-opacity': 0.45
    }
  });

  map.addLayer({
    id: 'lbs-bantul-outline',
    type: 'line',
    source: 'lbs-bantul',
    paint: {
      'line-color': colorMatch,
      'line-width': 1
    }
  });

  if (master.features.length) {
    map.fitBounds(getBounds(master.features), { padding: 40 });
  }

  updateStats(byKec, totalLuas, totalCount, '');
  renderBarChart(byKec, totalLuas, '');

  setupFeaturePopup();
});

// Popup berisi seluruh field attribute table saat sebuah bidang di-klik.
function setupFeaturePopup() {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: '320px'
  });

  map.on('click', 'lbs-bantul-fill', (e) => {
    const feature = e.features[0];
    const props = feature.properties;

    const rows = Object.keys(props)
      .map((key) => {
        let value = props[key];
        if (value === null || value === undefined || value === '') value = '-';
        else if (typeof value === 'number') value = value.toLocaleString('id-ID', { maximumFractionDigits: 3 });
        return `<tr><th>${key}</th><td>${value}</td></tr>`;
      })
      .join('');

    popup
      .setLngLat(e.lngLat)
      .setHTML(`
        <div class="feature-popup">
          <div class="feature-popup-title">Detail Bidang</div>
          <div class="feature-popup-scroll">
            <table class="feature-popup-table">${rows}</table>
          </div>
        </div>
      `)
      .addTo(map);
  });

  map.on('mouseenter', 'lbs-bantul-fill', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'lbs-bantul-fill', () => {
    map.getCanvas().style.cursor = '';
  });
}
