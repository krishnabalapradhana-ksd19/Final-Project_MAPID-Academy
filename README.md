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
