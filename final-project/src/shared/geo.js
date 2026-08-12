export const utmProj4 = (zone, south) =>
  `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;

export const UTM_49S_PROJ4 = utmProj4(49, true);

const EARTH_RADIUS_M = 6378137;
const METERS_PER_PIXEL_Z0 = (2 * Math.PI * EARTH_RADIUS_M) / 256;
const SCREEN_DPI = 96;
const METERS_PER_INCH = 0.0254;

export function metersPerPixel(lat, zoom) {
  return (METERS_PER_PIXEL_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function screenScaleDenominator(lat, zoom, dpi = SCREEN_DPI) {
  return (metersPerPixel(lat, zoom) * dpi) / METERS_PER_INCH;
}

export function printScaleDenominator(groundWidthM, paperWidthMm) {
  return (groundWidthM * 1000) / paperWidthMm;
}

export function zoomForGroundWidth(lat, groundWidthM, widthPx) {
  return Math.log2((METERS_PER_PIXEL_Z0 * Math.cos((lat * Math.PI) / 180) * widthPx) / groundWidthM);
}

export function utmZoneInfo(lng, lat) {
  return {
    zone: Math.floor((lng + 180) / 6) + 1,
    hemisphere: lat < 0 ? 'S' : 'N'
  };
}

export function lngLatToWebMercator(lng, lat) {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  return [
    (lng * Math.PI * EARTH_RADIUS_M) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))
  ];
}

export function niceRoundNumber(value) {
  if (!(value > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(value));
  const frac = value / pow;
  return (frac >= 5 ? 5 : frac >= 2 ? 2 : 1) * pow;
}
