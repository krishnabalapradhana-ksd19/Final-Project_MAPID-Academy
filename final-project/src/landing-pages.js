import './landing-pages.css';
import MAPID_LOGO from './mapid-assets/logo_mapid_hires.png';
import DIY_LOGO from './prov-diy-assets/diy-logo.svg';
import WILAYAH_SVG_URL from './prov-diy-assets/diy-wilayah.svg';
import { REGIONS } from './shared/regions.js';

const GEOJSON_URL = `${import.meta.env.BASE_URL}data/LBS_DIY_66871HA.geojson`;

const REGION_BY_SVG_ID = Object.fromEntries(REGIONS.map((r) => [r.svgId, r]));

const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

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

        <section class="map-col">
          <div class="readout" id="readout" role="status" aria-live="polite">
            <b id="ro-name">Pilih wilayah</b>
            <span id="ro-stat">5 kabupaten / kota</span>
            <small id="ro-note">arahkan kursor atau ketuk peta</small>
            <button type="button" id="ro-open" class="ro-open" hidden>Buka Peta Kerja →</button>
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
const roOpen  = document.getElementById('ro-open');
const metaSel = document.getElementById('meta-sel');

const fmtHa = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
const fmtInt = (n) => n.toLocaleString('id-ID');

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

function setActiveLabel(labels, el) {
  labels.forEach(l => l.classList.toggle('is-active', l.dataset.region === el.id));
}

function activate(el, group, regions, labels) {
  group.classList.add('dimmed');
  regions.forEach(r => r.classList.toggle('is-active', r === el));
  setActiveLabel(labels, el);
  roName.textContent = el.dataset.name;
  roStat.textContent = el.dataset.luas || 'Memuat data…';
  roNote.textContent = el.dataset.stat || '';
  readout.classList.add('show');
  metaSel.textContent = el.dataset.name;

  if (isTouchDevice) {
    roOpen.hidden = false;
    roOpen.onclick = () => openRegion(el);
  }
}

function clear(group, regions, labels) {
  group.classList.remove('dimmed');
  regions.forEach(r => r.classList.remove('is-active'));
  labels.forEach(l => l.classList.remove('is-active'));
  readout.classList.remove('show');
  roName.textContent = 'Pilih wilayah';
  roStat.textContent = '5 kabupaten / kota';
  roNote.textContent = 'arahkan kursor atau ketuk peta';
  metaSel.textContent = 'Pilih wilayah';
  roOpen.hidden = true;
  roOpen.onclick = null;
}

function openRegion(el) {
  const region = REGION_BY_SVG_ID[el.id];
  if (region) window.location.href = `${import.meta.env.BASE_URL}${region.htmlPath}`;
}

fetch(WILAYAH_SVG_URL)
  .then(res => res.text())
  .then(svgMarkup => {
    mapHolder.innerHTML = svgMarkup;

    const svg     = mapHolder.querySelector('svg.map');
    const group   = mapHolder.querySelector('#regions');
    const regions = mapHolder.querySelectorAll('.region');

    const svgNS = 'http://www.w3.org/2000/svg';
    const labelsGroup = document.createElementNS(svgNS, 'g');
    labelsGroup.setAttribute('id', 'region-labels');
    labelsGroup.setAttribute('aria-hidden', 'true');
    svg.appendChild(labelsGroup);

    regions.forEach(el => {
      const bbox = el.getBBox();
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', bbox.x + bbox.width / 2);
      text.setAttribute('y', bbox.y + bbox.height / 2);
      text.setAttribute('class', 'region-label');
      text.dataset.region = el.id;
      text.textContent = REGION_BY_SVG_ID[el.id]?.shortName || el.dataset.name;
      labelsGroup.appendChild(text);
    });
    const labels = labelsGroup.querySelectorAll('.region-label');

    regions.forEach(el => {
      el.addEventListener('mouseenter', () => activate(el, group, regions, labels));
      el.addEventListener('focus',      () => activate(el, group, regions, labels));
      el.addEventListener('blur',       () => clear(group, regions, labels));
      el.addEventListener('click', (e) => {
        if (isTouchDevice && !el.classList.contains('is-active')) {
          e.preventDefault();
          activate(el, group, regions, labels);
          return;
        }
        openRegion(el);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRegion(el); }
      });
    });

    svg.addEventListener('mouseleave', () => clear(group, regions, labels));

    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(geojson => {
        const byWadmkk = aggregateByWadmkk(geojson.features);
        regions.forEach(el => {
          const stat = byWadmkk[REGION_BY_SVG_ID[el.id]?.wadmkk];
          if (stat) {
            el.dataset.luas = `${fmtHa(stat.luas)} Ha LBS`;
            el.dataset.stat = `${stat.kecamatan.size} kapanewon · ${fmtInt(stat.count)} bidang`;
          }
        });
      })
      .catch(err => console.error('Gagal memuat data LBS untuk statistik wilayah:', err));
  })
  .catch(err => {
    console.error('Gagal memuat peta wilayah:', err);
    mapHolder.innerHTML = '<p style="color:#f88">Gagal memuat peta wilayah.</p>';
  });
