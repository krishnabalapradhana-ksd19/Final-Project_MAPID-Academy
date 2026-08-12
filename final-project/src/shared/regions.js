export const REGIONS = [
  {
    slug: 'sleman',
    svgId: 'sleman',
    wadmkk: 'Sleman',
    kabName: 'Sleman',
    kabLabel: 'Kabupaten Sleman',
    htmlPath: 'src/map/kab_sleman/peta-kerja-sleman.html',
    center: [110.375, -7.68],
    zoom: 11
  },
  {
    slug: 'bantul',
    svgId: 'bantul',
    wadmkk: 'Bantul',
    kabName: 'Bantul',
    kabLabel: 'Kabupaten Bantul',
    htmlPath: 'src/map/kab-bantul/peta-kerja-bantul.html',
    center: [110.3669, -7.8984],
    zoom: 11
  },
  {
    slug: 'gunungkidul',
    svgId: 'gunungkidul',
    wadmkk: 'Gunungkidul',
    kabName: 'Gunungkidul',
    kabLabel: 'Kabupaten Gunungkidul',
    htmlPath: 'src/map/kab_gunung-kidul/peta-kerja-gunung-kidul.html',
    center: [110.5848, -7.9931],
    zoom: 10
  },
  {
    slug: 'kulon-progo',
    svgId: 'kulonprogo',
    wadmkk: 'Kulon Progo',
    kabName: 'Kulon Progo',
    kabLabel: 'Kabupaten Kulon Progo',
    htmlPath: 'src/map/kab_kulon-progo/peta-kerja-kulon-progo.html',
    center: [110.1476, -7.8144],
    zoom: 11
  },
  {
    slug: 'yogyakarta',
    svgId: 'kotayogya',
    wadmkk: 'Kota Yogyakarta',
    kabName: 'Kota Yogyakarta',
    kabLabel: 'Kota Yogyakarta',
    htmlPath: 'src/map/kota_yogyakarta/peta-kerja-yogyakarta.html',
    center: [110.3761, -7.8079],
    zoom: 12
  }
];

export const regionBy = (key) => Object.fromEntries(REGIONS.map((r) => [r[key], r]));
