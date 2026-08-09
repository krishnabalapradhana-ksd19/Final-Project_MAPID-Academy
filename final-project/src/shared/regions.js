// Satu sumber kebenaran untuk data 5 kabupaten/kota DIY — dipakai baik oleh
// scripts/build-data.mjs (Node, build time) maupun src/landing-pages.js
// (browser). Jangan tambahkan API khusus platform (fs, DOM, dst.) di sini.
//
// `slug` dan `svgId` SENGAJA dibiarkan berbeda untuk Kulon Progo & Kota
// Yogyakarta (bukan diseragamkan) karena keduanya sudah tertanam di tempat
// yang mahal/berisiko untuk diubah:
//   - slug   -> nama file data hasil generate (lbs-<slug>.geojson, dst.)
//               dan dipakai di config 5 halaman peta-kerja-*.js
//   - svgId  -> id elemen <path id="..."> di prov-diy-assets/diy-wilayah.svg
export const REGIONS = [
  {
    slug: 'sleman',
    svgId: 'sleman',
    wadmkk: 'Sleman',
    kabName: 'Sleman',
    kabLabel: 'Kabupaten Sleman',
    shortName: 'Sleman',
    htmlPath: 'src/map/kab_sleman/peta-kerja-sleman.html'
  },
  {
    slug: 'bantul',
    svgId: 'bantul',
    wadmkk: 'Bantul',
    kabName: 'Bantul',
    kabLabel: 'Kabupaten Bantul',
    shortName: 'Bantul',
    htmlPath: 'src/map/kab-bantul/peta-kerja-bantul.html'
  },
  {
    slug: 'gunungkidul',
    svgId: 'gunungkidul',
    wadmkk: 'Gunungkidul',
    kabName: 'Gunungkidul',
    kabLabel: 'Kabupaten Gunungkidul',
    shortName: 'Gunungkidul',
    htmlPath: 'src/map/kab_gunung-kidul/peta-kerja-gunung-kidul.html'
  },
  {
    slug: 'kulon-progo',
    svgId: 'kulonprogo',
    wadmkk: 'Kulon Progo',
    kabName: 'Kulon Progo',
    kabLabel: 'Kabupaten Kulon Progo',
    shortName: 'Kulon Progo',
    htmlPath: 'src/map/kab_kulon-progo/peta-kerja-kulon-progo.html'
  },
  {
    slug: 'yogyakarta',
    svgId: 'kotayogya',
    wadmkk: 'Kota Yogyakarta',
    kabName: 'Kota Yogyakarta',
    kabLabel: 'Kota Yogyakarta',
    shortName: 'Kota Yogyakarta',
    htmlPath: 'src/map/kota_yogyakarta/peta-kerja-yogyakarta.html'
  }
];
