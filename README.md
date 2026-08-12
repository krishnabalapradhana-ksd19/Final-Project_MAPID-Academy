# Peta Kerja Lahan Baku Sawah — Provinsi D.I. Yogyakarta

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Vite](https://img.shields.io/badge/build-Vite-646CFF.svg)
![MapLibre GL](https://img.shields.io/badge/map-MapLibre%20GL-396CB2.svg)

Tugas akhir **MAPID Academy Bootcamp WebGIS** — aplikasi WebGIS statis untuk visualisasi dan eksplorasi data **Lahan Baku Sawah (LBS)** di 5 kabupaten/kota Provinsi Daerah Istimewa Yogyakarta (Sleman, Bantul, Kulon Progo, Gunungkidul, dan Kota Yogyakarta).

Dibangun oleh **Alvito Krishna Balapradhana**.

> Ditujukan untuk pengambil kebijakan/analis tata ruang maupun masyarakat umum yang ingin melihat sebaran, luas, dan detail atribut bidang lahan baku sawah per kapanewon/kecamatan secara interaktif di peta.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Struktur Folder Project](#struktur-folder-project)
- [Alur & Kontrak Data](#alur--kontrak-data)
- [Roadmap / Rencana Pengembangan](#roadmap--rencana-pengembangan)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Cara Menjalankan](#cara-menjalankan)
- [Panduan Step-by-Step](#panduan-step-by-step)
- [Deployment (CI/CD)](#deployment-cicd)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)
- [Kontak / Author](#kontak--author)

---

## Fitur Utama

- **Landing page peta wilayah DIY** — peta SVG interaktif 5 kabupaten/kota; hover menampilkan ringkasan luas & jumlah bidang LBS (dibaca dari berkas statistik pra-hitung, bukan dari geojson mentah), klik membuka halaman peta kerja kabupaten terkait (`src/landing-pages.js`).
- **Peta kerja per kabupaten/kota** (5 halaman terpisah, satu untuk tiap kabupaten/kota) berbasis MapLibre GL, masing-masing menyediakan:
  - Render poligon bidang LBS dengan pewarnaan otomatis per kapanewon/kecamatan.
  - **Filter wilayah** by kapanewon/kecamatan (chip filter) yang men-zoom peta ke bounding box wilayah terpilih.
  - **Panel statistik**: total luas (Ha), jumlah bidang, rata-rata luas per bidang, dan persentase terhadap total kabupaten — pra-dihitung saat build, bukan dihitung di browser.
  - **Grafik batang distribusi luas** per kapanewon/kecamatan.
  - **Popup detail bidang** menampilkan seluruh kolom atribut asli saat sebuah poligon diklik (dimuat lazy, terpisah dari geometri).
  - **Pencarian kapanewon/kecamatan atau koordinat** (`lat, lon`) lewat kotak cari di topbar.
  - **Widget layer**: toggle isi poligon & garis batas bidang, plus pengatur opasitas.
  - **Widget ukur**: menandai titik (koordinat), mengukur jarak, dan menghitung luas — semua direproyeksikan ke UTM 49S.
  - **Upload data (pratinjau)**: GeoJSON/KML/SHP (ZIP) ditampilkan sementara di peta; tidak diunggah maupun disimpan ke server.
  - **Print peta**: ekspor layout kartografis 300 DPI ke PNG/JPG atau **GeoPDF** (muka peta berkoordinat, terbaca di Avenza Maps & QGIS).
  - **Switch basemap**: Google Satellite, OpenStreetMap, Esri Imagery, Esri Topografi.
  - **Toggle proyeksi peta** 2D (Mercator) / Globe (bawaan MapLibre GL).
  - Kontrol peta tambahan: skala bar + skala angka (representative fraction), fullscreen, geolocate ("Lokasi Saya").
  - Status pemuatan (loading pill) dengan retry manual bila gagal memuat poligon/statistik.
- **Pemuatan data non-blocking**: poligon GeoJSON besar diparse di **Web Worker** (`geojson-worker.js`) agar UI tidak freeze; statistik dan poligon dimuat paralel, bukan berantai.
- **Data pipeline build-time**: geojson mentah (~301 MB, seluruh DIY) dipecah jadi file kecil per kabupaten + file statistik pra-hitung, sehingga browser pengunjung tidak pernah mengunduh/parse file mentah.

---

## Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| Build tool | **Vite 8** | Multi-page build (1 halaman landing + 5 halaman peta kerja) |
| Peta client | **MapLibre GL JS 5** | Rendering vector/raster, kontrol kustom (basemap, layer, ukur, upload, print, skala angka) |
| Bahasa | **JavaScript (ES Modules)**, vanilla — tanpa framework UI (React/Vue/dll) | Seluruh manipulasi DOM ditulis manual |
| Proyeksi geospasial | **proj4** | Reprojeksi WGS84 → UTM 49S (EPSG:32749) untuk menghitung luas bidang & grid UTM pada layout cetak |
| Ekspor peta | **pdf-lib** | Layout cetak 300 DPI + georeferensi GeoPDF (ISO 32000) pada muka peta |
| Parsing berkas unggahan | **@tmcw/togeojson**, **shpjs** | KML & Shapefile (ZIP) → GeoJSON, di-`import()` dinamis agar tidak membebani bundel awal |
| Concurrency | **Web Worker** (native) | Parsing GeoJSON besar di luar main thread |
| Integrasi data | **googleapis** (Node) | Mengunduh geojson mentah dari Google Drive via Service Account saat build CI |
| CI/CD | **GitHub Actions** | Build otomatis + deploy ke GitHub Pages saat push ke `main` |
| Styling | CSS murni (custom, per halaman) | Tidak memakai framework CSS |

---

## Struktur Folder Project

```
Final-Project_MAPID-Academy/
├── .github/workflows/
│   └── deploy.yml              # CI: unduh data dari Drive → build Vite → deploy ke GitHub Pages
│
├── google-drive-integration/   # Skrip Node terpisah (bukan bagian bundle frontend)
│   ├── download-geojson.js     # Unduh geojson mentah dari Google Drive (dipakai CI)
│   └── package.json
│
├── final-project/              # Aplikasi WebGIS (root Vite)
│   ├── index.html              # Entry landing page
│   ├── vite.config.js          # Multi-page build (entry HTML dikumpulkan otomatis dari src/map)
│   ├── scripts/
│   │   └── build-data.mjs      # Pipeline: pecah geojson mentah → per kabupaten + statistik
│   ├── data-raw/                # (gitignored) Geojson mentah hasil unduh dari Google Drive
│   │   └── LBS_DIY_66871HA.geojson
│   ├── public/data/generated/   # (gitignored, hasil build) Data siap-konsumsi per kabupaten
│   │   ├── lbs-<slug>.geojson       # Poligon (properti minimal: WADMKC, _fid)
│   │   ├── stats-lbs-<slug>.json    # Statistik pra-hitung per kabupaten/kecamatan
│   │   └── attrs-lbs-<slug>.json    # Atribut lengkap per bidang, diindeks oleh _fid
│   └── src/
│       ├── landing-pages.js / .css  # Halaman peta wilayah DIY (5 region SVG)
│       ├── shared/                  # Dipakai bersama browser & Node
│       │   ├── regions.js           # Satu sumber data 5 kabupaten/kota (slug, id SVG, WADMKK, nama, link, center, zoom)
│       │   ├── geo.js               # Proyeksi, skala, konversi Web Mercator/UTM
│       │   ├── format.js            # Format angka/tanggal locale id-ID
│       │   └── fetch-json.js        # Fetch JSON dengan timeout (main thread & worker)
│       ├── assets/                  # Logo kabupaten/kota
│       ├── mapid-assets/            # Logo MAPID
│       ├── prov-diy-assets/         # Logo DIY, peta SVG wilayah (diy-wilayah.svg)
│       └── map/
│           ├── shared/
│           │   ├── lbs-page.js      # Factory halaman peta kerja — dipakai oleh kelima kabupaten/kota
│           │   ├── lbs-page.css     # Tema & layout halaman peta kerja — satu file dipakai bersama
│           │   ├── map-control.js   # Basis kontrol peta: tombol + dropdown (dipakai semua widget)
│           │   ├── feature-popup.js # Popup atribut fitur (escaping + tabel) — dipakai layer LBS & unggahan
│           │   ├── basemaps.js      # Konfigurasi basemap (Google/OSM/Esri)
│           │   ├── measure-tool.js  # Widget ukur titik/jarak/luas
│           │   ├── upload-tool.js   # Widget upload GeoJSON/KML/SHP (pratinjau)
│           │   ├── print-tool.js    # Dialog print + pemicu ekspor
│           │   ├── print-layout.js  # Render layout kartografis ke canvas 300 DPI
│           │   ├── print-export.js  # Ekspor canvas → PNG/JPG/PDF
│           │   ├── geopdf.js        # Georeferensi ISO 32000 untuk halaman PDF
│           │   ├── data-loading.js  # Loader GeoJSON via Web Worker
│           │   ├── geojson-worker.js
│           │   └── loading.css
│           ├── kab-bantul/
│           ├── kab_gunung-kidul/
│           ├── kab_kulon-progo/
│           ├── kab_sleman/
│           └── kota_yogyakarta/     # Masing-masing hanya: .html + .js pemanggil `createLbsPage('<slug>')`
│
├── LICENSE                      # MIT
└── README.md
```

> Setiap folder `src/map/<kabupaten>/` hanya berisi `.html` + satu baris pemanggilan `createLbsPage('<slug>')` — seluruh logika, konfigurasi, dan tampilan peta kerja dipusatkan di `src/map/shared/` agar tidak terjadi duplikasi di 5 halaman. Metadata wilayah (nama, WADMKK, link, center, zoom) dipusatkan di `src/shared/regions.js`, dipakai bersama oleh landing page, kelima halaman peta kerja (browser), dan `scripts/build-data.mjs` (Node) supaya tidak ditulis ulang di banyak tempat dengan risiko id yang tidak konsisten.

---

## Alur & Kontrak Data

```
Google Drive (geojson mentah, ~301 MB)
        │  download-geojson.js (Service Account)
        ▼
final-project/data-raw/LBS_DIY_66871HA.geojson   (lokal only, gitignored)
        │  scripts/build-data.mjs (npm run build:data)
        ▼
final-project/public/data/generated/
        ├── lbs-<slug>.geojson        → dikonsumsi peta (geometri + WADMKC + _fid)
        ├── stats-lbs-<slug>.json     → dikonsumsi panel statistik & grafik
        └── attrs-lbs-<slug>.json     → dikonsumsi popup detail bidang (lazy-load)
```

`build-data.mjs` juga menghitung ulang luas tiap bidang dari geometri (bukan dari field `Shape_Area` sumber) dengan mereproyeksikan koordinat ke **EPSG:32749 (UTM 49S)** terlebih dahulu, agar hasil luas akurat secara metrik meskipun peta tetap disajikan dalam EPSG:4326.

Slug kabupaten yang dipakai di penamaan file: `bantul`, `gunungkidul`, `kulon-progo`, `sleman`, `yogyakarta`.

---

## Roadmap / Rencana Pengembangan

Versi saat ini adalah **static site read-only** — belum ada backend maupun database. Widget layer, ukur, upload, dan print sudah **selesai diimplementasikan** (lihat [Fitur Utama](#fitur-utama)). Sisa rencana pengembangan:

| Fitur | Deskripsi | Kebutuhan Teknis |
|---|---|---|
| **Edit Atribut Fitur** | Popup detail bidang saat ini bersifat **read-only** (lihat `setupFeaturePopup` di `src/map/shared/lbs-page.js`). Rencana pengembangan memungkinkan pengguna mengubah nilai kolom atribut langsung dari popup. | **Membutuhkan backend + database** agar perubahan tersimpan permanen — satu-satunya item roadmap yang keluar dari arsitektur static site saat ini |

> Item di atas **belum diimplementasikan** di kode saat ini.

---

## Prasyarat

- **Node.js** ≥ 18 (CI memakai Node 20)
- **npm** (terpasang bersama Node.js)
- Untuk build data lokal: berkas geojson mentah `final-project/data-raw/LBS_DIY_66871HA.geojson`, **atau** kredensial Google Drive Service Account untuk mengunduhnya lewat `google-drive-integration/download-geojson.js` (lihat [Konfigurasi](#konfigurasi)).

---

## Instalasi

```bash
# 1. Clone repository
git clone https://github.com/<username>/Final-Project_MAPID-Academy.git
cd Final-Project_MAPID-Academy

# 2. Install dependency aplikasi utama
cd final-project
npm install
```

Jika Anda juga perlu mengunduh ulang data mentah dari Google Drive secara lokal:

```bash
cd ../google-drive-integration
npm install
```

---

## Konfigurasi

Aplikasi frontend (`final-project/`) **tidak memerlukan environment variable** untuk dijalankan — seluruh path data bersifat statis relatif terhadap `import.meta.env.BASE_URL`.

Konfigurasi hanya diperlukan untuk **pipeline pengambilan data mentah** (`google-drive-integration/`), baik secara lokal maupun di CI:

| Variabel / Berkas | Digunakan di | Keterangan |
|---|---|---|
| `google-drive-integration/credentials.json` | `download-geojson.js` | Kredensial Service Account Google (field wajib: `client_email`, `private_key`, `type: "service_account"`). **Jangan pernah di-commit** — sudah masuk `.gitignore`. |
| `GDRIVE_CREDENTIALS_JSON` (GitHub Secret) | `.github/workflows/deploy.yml` | Isi penuh `credentials.json`, ditulis ke file saat CI berjalan lalu dihapus setelah dipakai. |
| `GDRIVE_FILE_ID` (opsional, GitHub Secret / env) | `download-geojson.js` | ID file geojson di Google Drive. Punya default hardcoded di kode bila tidak di-set. |

> Placeholder — belum bisa dipastikan dari kode: cara memperoleh/membuat Service Account dan file `LBS_DIY_66871HA.geojson` sumber (di luar cakupan repo ini, kemungkinan dikelola manual oleh pemilik proyek di Google Drive).

Jika berkas mentah **tidak tersedia** (baik `data-raw/` maupun kredensial Drive), `npm run build:data` tidak akan gagal — ia hanya mencetak pesan peringatan dan melewati proses generate, sehingga `npm run dev`/`npm run build` tetap bisa berjalan (halaman peta kerja hanya tidak akan memiliki data poligon).

---

## Cara Menjalankan

Seluruh perintah dijalankan dari dalam folder `final-project/`.

```bash
# Development server (hot reload)
npm run dev
```

```bash
# Build produksi (output ke final-project/dist/)
npm run build
```

```bash
# Preview hasil build produksi secara lokal
npm run preview
```

Setiap perintah `dev`/`build` otomatis menjalankan `npm run build:data` lebih dulu (lewat hook `predev`/`prebuild`) untuk memastikan `public/data/generated/` selalu up-to-date terhadap `data-raw/` sebelum server/bundel dijalankan.

Halaman yang tersedia setelah server berjalan:

| Halaman | URL |
|---|---|
| Landing / peta wilayah DIY | `/` |
| Peta kerja Kabupaten Sleman | `/src/map/kab_sleman/peta-kerja-sleman.html` |
| Peta kerja Kabupaten Bantul | `/src/map/kab-bantul/peta-kerja-bantul.html` |
| Peta kerja Kabupaten Kulon Progo | `/src/map/kab_kulon-progo/peta-kerja-kulon-progo.html` |
| Peta kerja Kabupaten Gunungkidul | `/src/map/kab_gunung-kidul/peta-kerja-gunung-kidul.html` |
| Peta kerja Kota Yogyakarta | `/src/map/kota_yogyakarta/peta-kerja-yogyakarta.html` |

> Path di atas identik antara dev server dan hasil build statis — cukup klik salah satu wilayah di landing page untuk membukanya.

### Testing

Belum ada automated test suite (unit/integration/e2e) di repository ini saat ini.

---

## Panduan Step-by-Step

Checklist konkret dari clone sampai peta tampil di browser. Centang tiap item sebagai progress tracker.

### A. Setup awal

- [ ] Clone repository: `git clone https://github.com/<username>/Final-Project_MAPID-Academy.git`
- [ ] Masuk ke folder aplikasi: `cd Final-Project_MAPID-Academy/final-project`
- [ ] Install dependency: `npm install`
- [ ] Pastikan versi Node.js ≥ 18: `node -v`

### B. Menyiapkan data mentah

Pipeline peta butuh berkas `final-project/data-raw/LBS_DIY_66871HA.geojson` (tidak ikut di-commit karena ukurannya ~301 MB). Pilih salah satu jalur berikut:

- [ ] **Jalur A — sudah punya berkas geojson mentah**: salin manual ke `final-project/data-raw/LBS_DIY_66871HA.geojson`.
- [ ] **Jalur B — unduh dari Google Drive**:
  - [ ] `cd ../google-drive-integration && npm install`
  - [ ] Taruh kredensial Service Account di `google-drive-integration/credentials.json` (lihat [Konfigurasi](#konfigurasi))
  - [ ] (Opsional) set `GDRIVE_FILE_ID` bila berbeda dari default di kode
  - [ ] Jalankan `node download-geojson.js` — hasil otomatis tersimpan ke `final-project/data-raw/LBS_DIY_66871HA.geojson`
- [ ] **Jalur C — tanpa data mentah**: lewati langkah ini. `npm run build:data` akan mencetak peringatan dan dilewati, aplikasi tetap bisa dijalankan tapi peta kabupaten tidak akan memiliki poligon.

### C. Menjalankan aplikasi

- [ ] Kembali ke folder `final-project/`
- [ ] (Opsional, manual) Generate data per kabupaten: `npm run build:data` — otomatis dijalankan juga oleh langkah berikutnya
- [ ] Jalankan dev server: `npm run dev`
- [ ] Buka `http://localhost:5173/` di browser, pastikan landing page peta wilayah DIY tampil
- [ ] Klik salah satu wilayah (mis. Sleman) dan pastikan halaman peta kerja terbuka dengan poligon, statistik, dan grafik tampil (jika data mentah tersedia di langkah B)
- [ ] **Checkpoint**: coba filter kapanewon/kecamatan, klik salah satu bidang untuk memastikan popup detail atribut muncul, dan uji switch basemap

### D. Build & preview produksi

- [ ] Jalankan `npm run build` — otomatis menjalankan `build:data` lebih dulu, output ke `final-project/dist/`
- [ ] Jalankan `npm run preview` untuk menguji hasil build secara lokal
- [ ] **Checkpoint**: pastikan seluruh 5 halaman peta kerja dan landing page berfungsi sama seperti saat `npm run dev`

### E. Deploy

- [ ] Pastikan GitHub Secrets `GDRIVE_CREDENTIALS_JSON` dan `GDRIVE_FILE_ID` sudah diset di repository (Settings → Secrets and variables → Actions)
- [ ] Push perubahan ke branch `main` (atau jalankan workflow manual via tab Actions → "Deploy final-project to GitHub Pages" → Run workflow)
- [ ] Pantau job `build` di GitHub Actions hingga selesai tanpa error
- [ ] **Checkpoint akhir**: buka URL GitHub Pages hasil deploy, pastikan landing page dan kelima halaman peta kerja dapat diakses

---

## Deployment (CI/CD)

Deploy berjalan otomatis lewat **GitHub Actions** (`.github/workflows/deploy.yml`) setiap kali ada push ke branch `main` yang menyentuh `final-project/**`, `google-drive-integration/**`, atau workflow itu sendiri (bisa juga dipicu manual via `workflow_dispatch`):

1. Install dependency `google-drive-integration`.
2. Tulis kredensial Service Account dari secret `GDRIVE_CREDENTIALS_JSON`.
3. Unduh geojson mentah dari Google Drive (`download-geojson.js`).
4. Hapus kredensial dari runner.
5. Install dependency `final-project` lalu `npm run build` (otomatis menjalankan `build:data`).
6. Upload `final-project/dist` sebagai Pages artifact dan deploy ke **GitHub Pages**.

> Placeholder — belum bisa dipastikan dari kode: URL GitHub Pages hasil deploy (tergantung nama repo/organisasi saat workflow dijalankan).

---

## Kontribusi

Proyek ini merupakan tugas akhir individu untuk MAPID Academy Bootcamp WebGIS. Kontribusi eksternal tidak secara aktif diharapkan, namun bila Anda ingin mengajukan perbaikan:

1. Fork repository ini.
2. Buat branch baru (`git checkout -b perbaikan/nama-perubahan`).
3. Commit perubahan dengan pesan yang jelas.
4. Ajukan Pull Request dengan deskripsi perubahan dan alasannya.

---

## Lisensi

Didistribusikan di bawah [Lisensi MIT](LICENSE). Lihat berkas `LICENSE` untuk teks lengkap.

---

## Kontak / Author

**Alvito Krishna Balapradhana**
Tugas Akhir — MAPID Academy Bootcamp WebGIS
