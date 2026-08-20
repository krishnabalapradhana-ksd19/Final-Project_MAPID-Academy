/**
 * Export GeoJSON hasil pengisian atribut.
 *
 * Data peta sengaja dipecah dua: geometri (lbs-<slug>.geojson, properti minimal
 * WADMKC + _fid) dan atribut lengkap (attrs-lbs-<slug>.json, array ber-indeks _fid).
 * Fungsi di sini menyatukan keduanya lagi + patch hasil edit, sehingga berkas unduhan
 * berisi geometri dengan atribut penuh dan bisa dipakai menggantikan berkas sumber.
 */
import { downloadBlob } from '../../shared/download.js';
import { mergeProps } from './attr-store.js';

/**
 * FeatureCollection dengan atribut lengkap (asli + hasil edit).
 * `fids` membatasi petak yang ikut diekspor (mis. hasil seleksi atau filter
 * kecamatan); bila tidak diisi, seluruh petak disertakan.
 */
export function buildMergedFeatureCollection(geojson, attrs, edits, fids) {
  const wanted = fids ? new Set(fids) : null;

  return {
    type: 'FeatureCollection',
    features: geojson.features
      .filter((feature) => !wanted || wanted.has(feature.properties._fid))
      .map((feature) => {
        const fid = feature.properties._fid;
        return {
          type: 'Feature',
          properties: mergeProps(attrs[fid] || {}, edits[fid]),
          geometry: feature.geometry
        };
      })
  };
}

export function exportGeojson({ geojson, attrs, edits, fids, fileBase }) {
  const merged = buildMergedFeatureCollection(geojson, attrs, edits, fids);
  const blob = new Blob([JSON.stringify(merged)], { type: 'application/geo+json' });
  downloadBlob(blob, `${fileBase}.geojson`);
  return merged.features.length;
}
