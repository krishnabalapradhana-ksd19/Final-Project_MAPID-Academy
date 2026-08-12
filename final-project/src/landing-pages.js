import './landing-pages.css';
import MAPID_LOGO from './mapid-assets/logo_mapid_hires.png';
import DIY_LOGO from './prov-diy-assets/diy-logo.svg';
import WILAYAH_SVG_URL from './prov-diy-assets/diy-wilayah.svg';
import { REGIONS, regionBy } from './shared/regions.js';
import { fetchJsonWithTimeout } from './shared/fetch-json.js';
import { fmtHa, fmtInt } from './shared/format.js';

const BASE = import.meta.env.BASE_URL;
const SVG_NS = 'http://www.w3.org/2000/svg';

const REGION_BY_SVG_ID = regionBy('svgId');
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

document.getElementById('app').innerHTML = `
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
        <em>MAPID Academy Bootcamp WebGIS - Final Project</em></p>
    </footer>
  </div>
`;

const mapHolder = document.getElementById('map-holder');
const readout = document.getElementById('readout');
const roName = document.getElementById('ro-name');
const roStat = document.getElementById('ro-stat');
const roNote = document.getElementById('ro-note');
const roOpen = document.getElementById('ro-open');
const metaSel = document.getElementById('meta-sel');

function openRegion(el) {
  const region = REGION_BY_SVG_ID[el.id];
  if (region) window.location.href = `${BASE}${region.htmlPath}`;
}

function addRegionLabels(svg, regions) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', 'region-labels');
  group.setAttribute('aria-hidden', 'true');
  svg.appendChild(group);

  regions.forEach((el) => {
    const bbox = el.getBBox();
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', bbox.x + bbox.width / 2);
    text.setAttribute('y', bbox.y + bbox.height / 2);
    text.setAttribute('class', 'region-label');
    text.dataset.region = el.id;
    text.textContent = REGION_BY_SVG_ID[el.id]?.kabName || el.dataset.name;
    group.appendChild(text);
  });

  return group.querySelectorAll('.region-label');
}

function setupInteractions(svg, group, regions, labels) {
  const activate = (el) => {
    group.classList.add('dimmed');
    regions.forEach((r) => r.classList.toggle('is-active', r === el));
    labels.forEach((l) => l.classList.toggle('is-active', l.dataset.region === el.id));
    roName.textContent = el.dataset.name;
    roStat.textContent = el.dataset.luas || 'Memuat data…';
    roNote.textContent = el.dataset.stat || '';
    readout.classList.add('show');
    metaSel.textContent = el.dataset.name;

    if (isTouchDevice) {
      roOpen.hidden = false;
      roOpen.onclick = () => openRegion(el);
    }
  };

  const clear = () => {
    group.classList.remove('dimmed');
    regions.forEach((r) => r.classList.remove('is-active'));
    labels.forEach((l) => l.classList.remove('is-active'));
    readout.classList.remove('show');
    roName.textContent = 'Pilih wilayah';
    roStat.textContent = '5 kabupaten / kota';
    roNote.textContent = 'arahkan kursor atau ketuk peta';
    metaSel.textContent = 'Pilih wilayah';
    roOpen.hidden = true;
    roOpen.onclick = null;
  };

  regions.forEach((el) => {
    el.addEventListener('mouseenter', () => activate(el));
    el.addEventListener('focus', () => activate(el));
    el.addEventListener('blur', clear);
    el.addEventListener('click', (e) => {
      if (isTouchDevice && !el.classList.contains('is-active')) {
        e.preventDefault();
        activate(el);
        return;
      }
      openRegion(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRegion(el);
      }
    });
  });

  svg.addEventListener('mouseleave', clear);
}

function loadRegionStats(regions) {
  const bySvgId = {};

  return Promise.all(
    REGIONS.map((region) =>
      fetchJsonWithTimeout(`${BASE}data/generated/stats-lbs-${region.slug}.json`)
        .then((stats) => {
          bySvgId[region.svgId] = stats;
        })
        .catch((err) => console.error(`Gagal memuat statistik ${region.kabLabel}:`, err.message))
    )
  ).then(() => {
    regions.forEach((el) => {
      const stats = bySvgId[el.id];
      if (!stats) return;
      el.dataset.luas = `${fmtHa(stats.totalLuasHa)} Ha LBS`;
      el.dataset.stat = `${stats.kecamatan.length} kapanewon · ${fmtInt(stats.jumlahBidang)} bidang`;
    });
  });
}

fetch(WILAYAH_SVG_URL)
  .then((res) => res.text())
  .then((svgMarkup) => {
    mapHolder.innerHTML = svgMarkup;

    const svg = mapHolder.querySelector('svg.map');
    const group = mapHolder.querySelector('#regions');
    const regions = mapHolder.querySelectorAll('.region');

    setupInteractions(svg, group, regions, addRegionLabels(svg, regions));
    loadRegionStats(regions);
  })
  .catch((err) => {
    console.error('Gagal memuat peta wilayah:', err);
    mapHolder.innerHTML = '<p style="color:#f88">Gagal memuat peta wilayah.</p>';
  });
