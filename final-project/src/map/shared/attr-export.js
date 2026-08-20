/**
 * Export GeoJSON hasil pengisian atribut.
 *
 * Data peta sengaja dipecah dua: geometri (lbs-<slug>.geojson, properti minimal
 * WADMKC + _fid) dan atribut lengkap (attrs-lbs-<slug>.json, array ber-indeks _fid).
 * Fungsi di sini menyatukan keduanya lagi + patch hasil edit, sehingga berkas unduhan
 * berisi geometri dengan atribut penuh dan bisa dipakai menggantikan berkas sumber.
 */
import { fmtFileStamp } from '../../shared/format.js';
import { downloadBlob } from '../../shared/download.js';
import { mergeProps } from './attr-store.js';

/** FeatureCollection dengan atribut lengkap (asli + hasil edit). */
export function buildMergedFeatureCollection(geojson, attrs, edits) {
  return {
    type: 'FeatureCollection',
    features: geojson.features.map((feature) => {
      const fid = feature.properties._fid;
      return {
        type: 'Feature',
        properties: mergeProps(attrs[fid] || {}, edits[fid]),
        geometry: feature.geometry
      };
    })
  };
}

export function exportGeojson({ slug, geojson, attrs, edits }) {
  const merged = buildMergedFeatureCollection(geojson, attrs, edits);
  const blob = new Blob([JSON.stringify(merged)], { type: 'application/geo+json' });
  downloadBlob(blob, `lbs-${slug}-update-${fmtFileStamp()}.geojson`);
  return merged.features.length;
}
