const STORAGE_PREFIX = 'lbs-attr-edits:';

const cache = new Map();

const storageKey = (slug) => `${STORAGE_PREFIX}${slug}`;

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

export function getEdit(slug, fid) {
  return loadEdits(slug)[fid] || {};
}

export function mergeProps(base, patch) {
  return patch && Object.keys(patch).length ? { ...base, ...patch } : base;
}

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
