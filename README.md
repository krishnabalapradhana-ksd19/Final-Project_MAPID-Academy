# Final-Project_MAPID-Academy

Tugas Akhir Dari MAPID Academy — **WebGIS LBS (Location Based Service) Platform**

Dokumen ini merupakan blueprint teknis dan alur kerja (workflow) pengembangan untuk membangun aplikasi WebGIS yang berfokus pada visualisasi dan manajemen data LBS, mencakup manajemen geometri, analisis spasial, data real-time, serta impor/ekspor multi-format.

---

## 1. Ringkasan Kebutuhan Fitur

| Kategori | Fitur |
|---|---|
| Manajemen Geometri | Add geometry (draw), edit geometry langsung di peta |
| Peta & Interaksi | Layer control, basemap Google Satellite, pop-up informasi interaktif dari attribute table |
| Analisis & Pencarian | Pengukuran jarak & luasan, search bar (geocoding/attribute search) |
| Data & LBS | Live tracking real-time, manajemen data spasial statis, upload & export (GeoJSON, SHP, KML) |
| Output | Print/cetak peta |

---

## 2. Rekomendasi Tech Stack (Open-Source)

| Layer | Teknologi | Alasan |
|---|---|---|
| Database | **PostgreSQL + PostGIS** | Standar de-facto spatial DB, mendukung spatial index (GiST), operasi ST_* untuk analisis geometri |
| Map Server / OGC Service | **GeoServer** (atau pg_tileserv/Martin untuk vector tile ringan) | Serving WMS/WFS/WMTS, mendukung SLD styling, terintegrasi native dengan PostGIS |
| Backend Framework | **Node.js (NestJS/Express)** atau **Python (FastAPI/Django + GeoDjango)** | REST/GeoJSON API, mudah integrasi WebSocket untuk real-time |
| Realtime Messaging | **WebSocket (Socket.IO / native ws)** + **MQTT (Mosquitto)** untuk device IoT/GPS tracker | Live tracking rendah-latensi, MQTT cocok untuk perangkat LBS terbatas daya/bandwidth |
| Caching / Pub-Sub | **Redis** (Pub/Sub + Geo commands) | Broadcast posisi real-time ke banyak client, cache hasil query berat |
| Frontend Framework | **React (Vite) + TypeScript** | Ekosistem luas, kemudahan state management untuk peta interaktif |
| Peta Client | **OpenLayers** | Mendukung native basemap XYZ (Google Satellite), drawing/editing (`ol/interaction/Draw`, `Modify`, `Snap`), measurement, print |
| State Management | **Zustand / Redux Toolkit** | Sinkronisasi state layer, geometri aktif, hasil pencarian |
| Styling/UI | **Tailwind CSS + shadcn/ui** | Percepatan UI komponen (panel layer, popup, toolbar) |
| Autentikasi | **JWT + Role-Based Access Control (RBAC)** | Kontrol akses per layer/data LBS |
| Container & Orkestrasi | **Docker Compose** (dev), **Kubernetes** (opsional produksi) | Konsistensi environment PostGIS/GeoServer/Backend/Frontend |

---

## 3. Fase 1 — Arsitektur Sistem & Database

### 3.1 Desain Arsitektur

```
[Perangkat LBS/GPS] --MQTT/HTTP--> [Ingestion Service] --> [Redis Pub/Sub] --> [WebSocket Gateway] --> [Frontend (OpenLayers)]
                                          |
                                          v
                                   [PostgreSQL/PostGIS] <--WFS/WMS-- [GeoServer]
                                          ^
                                          |
                              [Backend REST API (Upload/Export/CRUD)]
```

- **Data plane real-time**: perangkat mengirim posisi (lat/lon, timestamp, device_id) via MQTT/HTTP → disimpan ke tabel `tracking_history` (PostGIS `geometry(Point,4326)`) → dipublish ke Redis channel → diteruskan ke client via WebSocket.
- **Data plane statis**: fitur/geometri (polygon, line, point) dikelola CRUD lewat REST API, disimpan di tabel spasial dengan kolom `geom geometry(Geometry,4326)`.

### 3.2 Skema Database (PostGIS)

```sql
-- Data spasial statis (feature layer)
CREATE TABLE spatial_features (
    id SERIAL PRIMARY KEY,
    layer_id INT REFERENCES layers(id),
    name VARCHAR(255),
    attributes JSONB,                 -- attribute table dinamis untuk popup
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_spatial_features_geom ON spatial_features USING GIST (geom);

-- Device LBS real-time
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(64) UNIQUE,
    last_position GEOMETRY(Point, 4326),
    last_seen TIMESTAMPTZ
);

CREATE TABLE tracking_history (
    id BIGSERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    position GEOMETRY(Point, 4326) NOT NULL,
    speed FLOAT,
    recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tracking_position ON tracking_history USING GIST (position);
CREATE INDEX idx_tracking_device_time ON tracking_history (device_id, recorded_at DESC);

-- Manajemen layer
CREATE TABLE layers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    geometry_type VARCHAR(50),        -- Point / LineString / Polygon
    style JSONB,
    is_active BOOLEAN DEFAULT true
);
```

**Catatan desain**: gunakan `attributes JSONB` agar attribute table fleksibel per layer tanpa migrasi skema, sekaligus tetap bisa di-index dengan GIN jika perlu query by attribute.

### 3.3 Deliverable Fase 1
- ERD & skema PostGIS final
- Docker Compose: `postgres+postgis`, `geoserver`, `redis`, `mosquitto`
- Workspace & datastore GeoServer terhubung ke PostGIS

---

## 4. Fase 2 — Pengembangan Backend

### 4.1 REST API (CRUD & Query Spasial)

| Endpoint | Fungsi | Implementasi Spasial |
|---|---|---|
| `GET /layers/:id/features` | Ambil fitur sebagai GeoJSON FeatureCollection | `ST_AsGeoJSON`, bbox filter via `ST_Intersects` |
| `POST /layers/:id/features` | Simpan geometri baru (hasil drawing) | Validasi `ST_IsValid`, simpan `ST_GeomFromGeoJSON` |
| `PUT /features/:id` | Update geometri hasil editing | `ST_GeomFromGeoJSON` + update `updated_at` |
| `GET /search?q=` | Pencarian atribut/lokasi | `ILIKE` pada JSONB attributes + geocoding eksternal (Nominatim) |
| `POST /features/upload` | Upload SHP/KML/GeoJSON | Parsing server-side (lihat 4.2) |
| `GET /layers/:id/export?format=` | Export GeoJSON/SHP/KML | Konversi via GDAL/OGR |

### 4.2 Upload & Export Multi-Format

- **Parsing Upload**:
  - GeoJSON → parse native (JSON.parse + validasi schema GeoJSON).
  - Shapefile (.shp/.dbf/.shx/.prj, biasanya dalam .zip) → gunakan **GDAL/OGR** (`ogr2ogr`) di backend atau library **shpjs** untuk parsing ringan; simpan hasil sebagai GeoJSON sebelum insert ke PostGIS.
  - KML → parsing via **GDAL/OGR** (`ogr2ogr -f GeoJSON`) atau library `@tmcw/togeojson`.
  - Reprojection otomatis ke `EPSG:4326` menggunakan `ST_Transform` bila file sumber memakai CRS lain (dibaca dari `.prj`).
- **Export**: gunakan **GDAL/OGR** (`ogr2ogr`) sebagai satu titik konversi universal — PostGIS → GeoJSON/SHP/KML — dijalankan sebagai child-process terkontrol di backend, hasil dikirim sebagai file download (SHP di-zip otomatis karena multi-file).

> Alasan memilih GDAL/OGR: satu tool tervalidasi industri untuk seluruh matriks format spasial, menghindari maintenance banyak parser custom.

### 4.3 Real-time LBS Service

- **Ingestion**: endpoint MQTT topic `devices/{device_id}/position` (untuk perangkat GPS/tracker) dan/atau REST `POST /tracking/ping` (untuk klien mobile/web).
- **Processing**: setiap posisi masuk → update `devices.last_position` → insert `tracking_history` → publish ke **Redis Pub/Sub** channel `tracking:{device_id}`.
- **Delivery**: **WebSocket Gateway** (Socket.IO) subscribe Redis channel, broadcast ke client yang sedang membuka peta dengan layer tracking aktif. Gunakan **room per device/area** agar tidak broadcast global (efisiensi bandwidth).
- **Geofencing (opsional lanjutan)**: `ST_Contains`/`ST_DWithin` untuk trigger alert saat device masuk/keluar area tertentu.

### 4.4 Deliverable Fase 2
- REST API terdokumentasi (OpenAPI/Swagger)
- WebSocket gateway + Redis Pub/Sub berjalan
- Modul upload/export teruji untuk GeoJSON, SHP, KML

---

## 5. Fase 3 — Pengembangan Frontend

### 5.1 Peta Dasar & Layer Control

- **OpenLayers** `Map` + `View` sebagai kanvas utama.
- Basemap **Google Satellite**: tambahkan sebagai `TileLayer` dengan `XYZ` source, URL pola `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` (perhatikan ToS Google — untuk produksi disarankan pakai Google Maps Platform API resmi bila skala besar).
- **Layer Control**: komponen React custom (checkbox list + opacity slider) yang toggle `layer.setVisible()` — bukan plugin bawaan OL, dibangun di atas `ol/layer/Group` agar mudah dikelola per kategori (basemap vs data layer).

### 5.2 Manajemen Geometri (Draw & Edit)

- Modul `ol/interaction/Draw` untuk menggambar Point/LineString/Polygon baru → hasil geometry dikirim ke `POST /features`.
- Modul `ol/interaction/Modify` + `ol/interaction/Snap` untuk editing vertex geometri existing, dengan `ol/interaction/Select` untuk memilih fitur target.
- Layer sumber menggunakan `ol/source/Vector` yang di-sync dengan state React (Zustand) agar toolbar (Save/Cancel/Delete) reaktif terhadap perubahan geometri.

### 5.3 Pop-up Informasi Interaktif

- Event `map.on('click', ...)` → `map.forEachFeatureAtPixel()` untuk deteksi fitur yang diklik.
- Render popup menggunakan `ol/Overlay` yang di-attach ke DOM element React (portal), sehingga isi popup (attribute table) dapat memakai komponen React biasa — mudah dibuat responsif dengan Tailwind.
- Data attribute diambil dari properti `feature.getProperties()` (hasil parsing kolom `attributes JSONB`), ditampilkan sebagai tabel key-value dinamis.

### 5.4 Alat Analisis & Pencarian

- **Pengukuran**: `ol/interaction/Draw` dengan mode `LineString`/`Polygon` + listener `geometrychange` yang menghitung `getLength()`/`getArea()` dari `ol/sphere` (formula geodesic agar akurat untuk EPSG:4326).
- **Search Bar**: debounced input → query ke `GET /search` (attribute search internal) sekaligus opsional integrasi **Nominatim (OpenStreetMap)** untuk pencarian lokasi/alamat umum → hasil di-highlight & `view.animate()` ke lokasi terpilih.

### 5.5 Print Map

- Library **`ol-ext`** (fitur `print` control) atau kombinasi `map.once('rendercomplete')` + `html2canvas`/`jsPDF` untuk export tampilan peta (termasuk legend & scale bar) ke PDF/PNG sesuai layout kertas (A4 landscape/portrait).

### 5.6 Deliverable Fase 3
- SPA React + OpenLayers dengan seluruh interaksi peta berfungsi
- UI upload/export file (drag-drop) terhubung ke backend
- Panel layer control, popup, toolbar ukur, search bar, tombol print

---

## 6. Fase 4 — Integrasi LBS (Real-Time Tracking)

### 6.1 Arsitektur Jaringan Real-Time

```
Device/GPS Tracker --(MQTT publish)--> Mosquitto Broker
                                              |
                                    Backend MQTT Subscriber
                                              |
                                    PostGIS (tracking_history) + Redis Pub/Sub
                                              |
                                    WebSocket Gateway (Socket.IO)
                                              |
                                    Frontend: ol/source/Vector (live update)
```

### 6.2 Implementasi Frontend Live Tracking

- Client subscribe WebSocket channel per device/area saat layer "Live Tracking" diaktifkan.
- Setiap event posisi baru → update `Feature` pada `ol/source/Vector` secara in-place (`feature.getGeometry().setCoordinates()`) — **hindari re-render seluruh layer** demi performa saat banyak device aktif.
- Opsional: animasi interpolasi posisi antar update (linear tween) agar pergerakan marker terlihat halus, bukan "meloncat".
- Riwayat pergerakan (trail) dapat direkonstruksi dari `tracking_history` via `ST_MakeLine` untuk ditampilkan sebagai polyline.

### 6.3 Skalabilitas & Keandalan

- Redis Pub/Sub memungkinkan horizontal scaling backend (multi-instance WebSocket gateway tetap sinkron).
- MQTT QoS 1 untuk menjamin data posisi tidak hilang saat koneksi perangkat tidak stabil.
- Terapkan **throttling** pengiriman posisi (mis. maks 1 update/detik per device) untuk menjaga beban DB & bandwidth.

### 6.4 Deliverable Fase 4
- Simulator device (script pengirim posisi dummy via MQTT) untuk testing
- Live tracking berjalan end-to-end di peta dengan latensi rendah
- Riwayat trail tracking dapat di-query dan ditampilkan

---

## 7. Ringkasan Alur Kerja Pengembangan (Timeline Acuan)

1. **Fase 1 — Arsitektur & Database**: setup Docker environment, desain skema PostGIS, konfigurasi GeoServer.
2. **Fase 2 — Backend**: REST API CRUD spasial, modul upload/export (GDAL/OGR), WebSocket + MQTT untuk real-time.
3. **Fase 3 — Frontend**: peta OpenLayers, layer control, draw/edit geometry, popup, ukur, search, print.
4. **Fase 4 — Integrasi LBS**: hubungkan pipeline real-time end-to-end, uji skala & latensi, finalisasi trail history.

Setiap fase disarankan diakhiri dengan checkpoint pengujian (unit test backend, integration test API, manual test UI) sebelum lanjut ke fase berikutnya.

---

## 8. Step-by-Step Implementasi

Checklist eksekusi konkret, urut, dan dapat langsung dikerjakan. Centang tiap item sebagai progress tracker.

### 8.1 Fase 1 — Arsitektur Sistem & Database

- [ ] Inisialisasi repo: pisahkan folder `backend/`, `frontend/`, `infra/` (docker-compose, init-sql).
- [ ] Tulis `infra/docker-compose.yml` dengan service: `postgis` (image `postgis/postgis`), `geoserver` (image `kartoza/geoserver`), `redis`, `mosquitto`.
- [ ] Jalankan `docker compose up -d` dan pastikan tiap service healthy (`docker compose ps`).
- [ ] Buat database & aktifkan extension: `CREATE EXTENSION postgis;`
- [ ] Buat migration file (mis. pakai Prisma/TypeORM/Alembic) untuk tabel `layers`, `spatial_features`, `devices`, `tracking_history` sesuai skema di bagian 3.2.
- [ ] Jalankan migration, verifikasi index `GIST` terbentuk (`\d spatial_features` di psql).
- [ ] Login GeoServer admin, buat **Workspace** baru (mis. `lbs_ws`).
- [ ] Buat **Store** PostGIS di GeoServer yang connect ke database `postgis` container.
- [ ] Publish 1 layer uji dari tabel `spatial_features` untuk memastikan koneksi PostGIS ↔ GeoServer berhasil (cek preview WMS di GeoServer).
- [ ] Seed data dummy (beberapa baris `spatial_features` + 1 `device`) untuk keperluan testing fase berikutnya.
- [ ] **Checkpoint**: query `ST_AsGeoJSON` langsung di psql mengembalikan GeoJSON valid.

### 8.2 Fase 2 — Pengembangan Backend

- [ ] Inisialisasi project backend (`NestJS` atau `FastAPI`), setup koneksi ke PostGIS (ORM/driver spasial: `TypeORM`+`postgis` atau `GeoAlchemy2`).
- [ ] Implementasi `GET /layers/:id/features` → return GeoJSON `FeatureCollection` (gunakan `ST_AsGeoJSON` + bbox filter opsional).
- [ ] Implementasi `POST /layers/:id/features` → terima GeoJSON geometry, validasi `ST_IsValid`, insert.
- [ ] Implementasi `PUT /features/:id` dan `DELETE /features/:id` untuk mendukung editing/hapus geometri.
- [ ] Setup validasi input (schema GeoJSON) & error handling standar (400/404/422).
- [ ] Install **GDAL/OGR** di environment backend (via Docker image `osgeo/gdal` atau binary sistem) — verifikasi `ogr2ogr --version` jalan.
- [ ] Implementasi `POST /features/upload`: terima file (multipart), deteksi ekstensi (.geojson/.zip berisi .shp/.kml), jalankan `ogr2ogr -f GeoJSON` sebagai child-process, parse hasil, insert ke `spatial_features`.
- [ ] Uji upload dengan 3 sample file: GeoJSON, SHP (zip), KML — pastikan geometri & attribute tersimpan benar dan CRS ter-reproject ke 4326.
- [ ] Implementasi `GET /layers/:id/export?format=geojson|shp|kml`: query data, jalankan `ogr2ogr` arah sebaliknya, kirim file (zip untuk SHP).
- [ ] Setup **Mosquitto** topic subscriber di backend (`devices/+/position`), tulis handler yang update `devices.last_position` + insert `tracking_history`.
- [ ] Setup **Redis Pub/Sub**: publish posisi baru ke channel `tracking:{device_id}` setelah insert berhasil.
- [ ] Setup **WebSocket Gateway** (Socket.IO): client join room per `device_id`/area, gateway subscribe Redis dan forward event ke room terkait.
- [ ] Tulis script simulator device (Node/Python) yang publish posisi dummy ke MQTT tiap 1–2 detik, untuk testing pipeline real-time tanpa hardware.
- [ ] Implementasi `GET /search?q=` (query JSONB attributes + opsional proxy ke Nominatim).
- [ ] Dokumentasikan seluruh endpoint di Swagger/OpenAPI.
- [ ] **Checkpoint**: jalankan simulator, buka WebSocket client (Postman/websocat), pastikan event posisi diterima real-time; test upload/export ketiga format via Postman.

### 8.3 Fase 3 — Pengembangan Frontend

- [ ] Inisialisasi project (`npm create vite@latest` React+TS), install `ol`, `zustand`, `tailwindcss`, `axios`/`socket.io-client`.
- [ ] Buat komponen `MapView` dasar: inisialisasi `ol/Map` + `ol/View`, tambahkan basemap Google Satellite via `XYZ` source.
- [ ] Buat komponen `LayerControlPanel`: fetch daftar layer dari backend, render checkbox + opacity slider, hubungkan ke `layer.setVisible()`/`setOpacity()`.
- [ ] Integrasikan layer data dari GeoServer (WMS/WFS `ol/source/TileWMS` atau `ol/source/Vector` + `ol/format/GeoJSON` via REST API backend).
- [ ] Implementasi toolbar **Draw**: tombol Point/Line/Polygon → aktifkan `ol/interaction/Draw`, on `drawend` kirim geometry ke `POST /features`.
- [ ] Implementasi mode **Edit**: aktifkan `ol/interaction/Select` + `Modify` + `Snap`, on `modifyend` kirim update ke `PUT /features/:id`.
- [ ] Tambahkan tombol Save/Cancel/Delete pada toolbar geometri, sinkronkan dengan state Zustand.
- [ ] Implementasi **popup**: buat `ol/Overlay`, handler `map.on('click')` + `forEachFeatureAtPixel`, render komponen React `FeaturePopup` menampilkan `attributes` sebagai tabel.
- [ ] Implementasi **pengukuran**: toolbar Measure Distance/Area menggunakan `Draw` + `ol/sphere getLength/getArea`, tampilkan hasil sebagai tooltip mengikuti kursor.
- [ ] Implementasi **search bar**: input dengan debounce (300ms), panggil `GET /search`, render dropdown hasil, klik hasil → `view.animate()` ke lokasi & highlight fitur.
- [ ] Implementasi **upload UI**: drag-drop/file picker (terima .geojson/.zip/.kml), progress indicator, panggil `POST /features/upload`, refresh layer setelah sukses.
- [ ] Implementasi **export UI**: dropdown pilih layer + format (GeoJSON/SHP/KML), tombol download memanggil `GET /export`.
- [ ] Implementasi **print map**: tombol Print → capture kanvas peta (`ol-ext` print control atau `html2canvas`) + legend/scale bar, generate PDF (`jsPDF`).
- [ ] Styling responsif seluruh panel (Tailwind), uji di ukuran layar desktop & tablet.
- [ ] **Checkpoint**: seluruh interaksi (draw, edit, popup, ukur, search, upload, export, print) diuji manual end-to-end di browser.

### 8.4 Fase 4 — Integrasi LBS (Real-Time Tracking)

- [ ] Buat layer khusus "Live Tracking" di `LayerControlPanel` yang saat diaktifkan melakukan koneksi WebSocket (`socket.io-client`).
- [ ] Render posisi device awal (`devices.last_position`) sebagai `Feature` di `ol/source/Vector` terpisah dari layer statis.
- [ ] Implementasi handler event WebSocket: update koordinat `Feature` in-place (bukan re-create layer) setiap ada event posisi baru.
- [ ] Tambahkan animasi interpolasi pergerakan marker (tween posisi lama → baru selama interval update).
- [ ] Implementasi layer **trail**: fetch riwayat via endpoint baru `GET /devices/:id/trail` (query `ST_MakeLine` dari `tracking_history`), render sebagai `LineString`.
- [ ] Uji dengan simulator device dari 8.2 berjalan bersamaan → pastikan marker bergerak real-time di peta tanpa lag signifikan.
- [ ] Tambahkan indikator status koneksi (connected/disconnected) & auto-reconnect WebSocket di frontend.
- [ ] Load test dasar: jalankan beberapa simulator device paralel (mis. 20–50 device), amati latensi & beban Redis/DB.
- [ ] Terapkan throttling publish MQTT (maks 1 update/detik/device) bila diperlukan setelah load test.
- [ ] **Checkpoint akhir**: demo end-to-end — buka aplikasi, aktifkan layer tracking, jalankan simulator, verifikasi posisi live + trail history tampil benar, lalu uji ulang seluruh fitur Fase 3 berjalan berdampingan dengan tracking aktif (tidak saling mengganggu performa).

### 8.5 Finalisasi

- [ ] Review keamanan: autentikasi JWT di seluruh endpoint CRUD/upload, validasi ukuran & tipe file upload untuk mencegah abuse.
- [ ] Tulis dokumentasi setup (`.env.example`, cara `docker compose up`, cara migrasi, cara menjalankan simulator).
- [ ] Deploy staging (opsional): build image Docker untuk backend & frontend, deploy via Docker Compose/Kubernetes.
- [ ] Persiapan demo/presentasi tugas akhir: siapkan skenario data + skrip demo fitur sesuai daftar di bagian 1.
