export const BASEMAPS = {
  google: {
    label: 'Google Maps',
    tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '© Google'
  },
  osm: {
    label: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '© OpenStreetMap contributors'
  },
  esri: {
    label: 'Esri Basemaps',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Esri, Maxar, Earthstar Geographics'
  },
  'esri-topo': {
    label: 'Esri Topografi',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Esri, HERE, Garmin, FAO, NOAA, USGS'
  }
};
export const BASEMAP_ORDER = ['google', 'osm', 'esri', 'esri-topo'];
export const DEFAULT_BASEMAP = 'google';

export const toRasterSource = (key) => {
  const { label, ...source } = BASEMAPS[key];
  return { type: 'raster', ...source };
};
