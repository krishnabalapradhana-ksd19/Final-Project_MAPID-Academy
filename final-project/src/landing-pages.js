import './landing-pages.css';

const MAPID_LOGO = '/src/mapid-assets/logo_mapid_hires.png';
const DIY_LOGO = '/src/prov-diy-assets/diy-logo.svg';
const WILAYAH_SVG_URL = '/src/prov-diy-assets/diy-wilayah.svg';
const GEOJSON_URL = '/src/prov-diy-assets/diy-lbs25/LBS_DIY_66871HA.geojson';

// Peta kerja per kabupaten/kota (dibuat di src/map/**), dipetakan dari id region pada SVG.
const REGION_LINKS = {
  sleman: '/peta-kerja-sleman.html',
  kulonprogo: '/peta-kerja-kulon-progo.html',
  bantul: '/peta-kerja-bantul.html',
  gunungkidul: '/peta-kerja-gunung-kidul.html',
  kotayogya: '/peta-kerja-yogyakarta.html'
};

// Id region pada SVG dipetakan ke nilai WADMKK di GeoJSON LBS, untuk agregasi luas & jumlah bidang.
const REGION_WADMKK = {
  sleman: 'Sleman',
  kulonprogo: 'Kulon Progo',
  bantul: 'Bantul',
  gunungkidul: 'Gunungkidul',
  kotayogya: 'Kota Yogyakarta'
};

function buildLayout() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="bg-kawung"></div>
    <div class="bg-parang"></div>

    <div class="frame" aria-hidden="true">
      <span class="tl">7°32'28"S · 110°00'14"E</span>
      <span class="tr">7°32'28"S · 110°50'20"E</span>
      <span class="bl">8°12'22"S · 110°00'14"E</span>
      <span class="br">8°12'22"S · 110°50'20"E</span>
    </div>

    <div class="page">
      <div class="stage">

        <!-- ============ kiri: identitas ============ -->
        <section class="brand">
          <div class="crest">
            <div class="slot"><img src="${MAPID_LOGO}" alt="Logo MAPID"></div>
            <div class="sep"></div>
            <div class="slot"><img src="${DIY_LOGO}" alt="Lambang Daerah Istimewa Yogyakarta"></div>
          </div>

          <p class="eyebrow">Peta Kerja Petak Lahan Sawah</p>
          <h1>Provinsi<span>Daerah Istimewa<br>Yogyakarta</span></h1>
          <div class="rule"></div>
          <p class="credit">supported by<strong>Alvito Krishna Balapradhana</strong></p>

          <p class="meta"><b>5</b> Kabupaten / Kota <span aria-hidden="true">·</span> <span id="meta-sel">Pilih wilayah</span></p>
        </section>

        <!-- ============ kanan: peta ============ -->
        <section class="map-col">
          <div class="readout" id="readout" role="status" aria-live="polite">
            <b id="ro-name">Pilih wilayah</b>
            <span id="ro-stat">5 kabupaten / kota</span>
            <small id="ro-note">arahkan kursor atau ketuk peta</small>
          </div>

          <div id="map-holder"></div>

          <p class="hint">Sumangga Bapak-Ibu dipun-klik kabupaten/kitha kangge mbikak peta kerja</p>
        </section>
      </div>

      <footer class="footer">
        <p class="org">Alvito Krishna Balapradhana<br>
          <em>Mapid Acamy Bootcamp WebGIS - Final Project</em></p>
      </footer>
    </div>
  `;
}
buildLayout();

const mapHolder = document.getElementById('map-holder');
const readout = document.getElementById('readout');
const roName  = document.getElementById('ro-name');
const roStat  = document.getElementById('ro-stat');
const roNote  = document.getElementById('ro-note');
const metaSel = document.getElementById('meta-sel');

const fmtHa = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
const fmtInt = (n) => n.toLocaleString('id-ID');

// Kolom LUAS di sumber data tidak konsisten satuannya; Shape_Area (m²) terisi valid,
// jadi luas hektar dihitung dari situ (1 ha = 10.000 m²) — sama seperti di setiap peta kerja kabupaten.
function aggregateByWadmkk(features) {
  const byWadmkk = {};
  features.forEach((f) => {
    const wadmkk = f.properties.WADMKK;
    if (!byWadmkk[wadmkk]) byWadmkk[wadmkk] = { luas: 0, count: 0, kecamatan: new Set() };
    byWadmkk[wadmkk].luas += (f.properties.Shape_Area || 0) / 10000;
    byWadmkk[wadmkk].count += 1;
    byWadmkk[wadmkk].kecamatan.add(f.properties.WADMKC);
  });
  return byWadmkk;
}

function activate(el, group, regions) {
  group.classList.add('dimmed');
  regions.forEach(r => r.classList.toggle('is-active', r === el));
  roName.textContent = el.dataset.name;
  roStat.textContent = el.dataset.luas;
  roNote.textContent = el.dataset.stat;
  readout.classList.add('show');
  metaSel.textContent = el.dataset.name;
}

function clear(group, regions) {
  group.classList.remove('dimmed');
  regions.forEach(r => r.classList.remove('is-active'));
  readout.classList.remove('show');
  roName.textContent = 'Pilih wilayah';
  roStat.textContent = '5 kabupaten / kota';
  roNote.textContent = 'arahkan kursor atau ketuk peta';
  metaSel.textContent = 'Pilih wilayah';
}

function openRegion(el) {
  const url = REGION_LINKS[el.id];
  if (url) window.location.href = url;
}

Promise.all([
  fetch(WILAYAH_SVG_URL).then(res => res.text()),
  fetch(GEOJSON_URL).then(res => res.json())
]).then(([svgMarkup, geojson]) => {
  mapHolder.innerHTML = svgMarkup;

  const svg     = mapHolder.querySelector('svg.map');
  const group   = mapHolder.querySelector('#regions');
  const regions = mapHolder.querySelectorAll('.region');

  const byWadmkk = aggregateByWadmkk(geojson.features);

  regions.forEach(el => {
    const stat = byWadmkk[REGION_WADMKK[el.id]];
    if (stat) {
      el.dataset.luas = `${fmtHa(stat.luas)} Ha LBS`;
      el.dataset.stat = `${stat.kecamatan.size} kapanewon · ${fmtInt(stat.count)} bidang`;
    }

    el.addEventListener('mouseenter', () => activate(el, group, regions));
    el.addEventListener('focus',      () => activate(el, group, regions));
    el.addEventListener('blur',       () => clear(group, regions));
    el.addEventListener('click',      () => openRegion(el));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRegion(el); }
    });
  });

  svg.addEventListener('mouseleave', () => clear(group, regions));
});
