/**
 * Penyimpanan hasil pengisian atribut bidang LBS.
 *
 * TAHAP PROTOTIPE: belum ada backend, jadi perubahan disimpan di localStorage
 * browser dengan bentuk { "<_fid>": { NAMA_FIELD: nilai, ... } } per kabupaten.
 * Yang disimpan hanya field yang diubah (patch), bukan seluruh atribut bidang —
 * data asli tetap berasal dari attrs-lbs-<slug>.json dan di-merge saat dibaca.
 *
 * TITIK GANTI KE BACKEND:
 *   loadEdits(slug)          -> GET  /api/lbs/{slug}/edits
 *   saveEdit(slug, fid, ...) -> PUT  /api/lbs/{slug}/features/{fid}
 * Ubah ketiga fungsi di bawah menjadi pemanggilan API (async) dan sesuaikan
 * pemanggilnya di lbs-page.js; struktur data patch tidak perlu berubah.
 */

const STORAGE_PREFIX = 'lbs-attr-edits:';

/** Cache per-slug agar localStorage tidak di-parse ulang tiap popup dibuka. */
const cache = new Map();

const storageKey = (slug) => `${STORAGE_PREFIX}${slug}`;

/** Seluruh patch tersimpan untuk satu kabupaten: { fid: { FIELD: nilai } }. */
export function loadEdits(slug) {
  if (cache.has(slug)) return cache.get(slug);

  let edits = {};
  try {
    const raw = localStorage.getItem(storageKey(slug));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') edits = parsed;
  } catch (err) {
    console.warn(`[attr-store] Gagal membaca data tersimpan untuk ${slug}:`, err.message);
  }

  cache.set(slug, edits);
  return edits;
}

/** Patch untuk satu bidang; objek kosong bila belum pernah diedit. */
export function getEdit(slug, fid) {
  return loadEdits(slug)[fid] || {};
}

/** Gabungkan atribut asli dengan patch hasil edit. */
export function mergeProps(base, patch) {
  return patch && Object.keys(patch).length ? { ...base, ...patch } : base;
}

/** Simpan patch (di-merge dengan patch sebelumnya) dan kembalikan atribut hasil gabungan. */
export function saveEdit(slug, fid, patch) {
  const edits = loadEdits(slug);
  edits[fid] = { ...(edits[fid] || {}), ...patch };

  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(edits));
  } catch (err) {
    throw new Error(`Gagal menyimpan ke penyimpanan browser: ${err.message}`);
  }

  return edits[fid];
}
