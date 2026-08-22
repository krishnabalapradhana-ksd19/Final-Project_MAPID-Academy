import { fmtNumber } from '../../shared/format.js';

const READ_ONLY = { readOnly: true };

const JENIS_LAHAN = ['Sawah', 'Tegalan', 'Ladang', 'Kebun', 'Lainnya'];
const JENIS_SAWAH = [
  'Irigasi Teknis',
  'Irigasi Setengah Teknis',
  'Irigasi Sederhana',
  'Tadah Hujan',
  'Pasang Surut',
  'Lebak',
  'Rawa'
];
const KONDISI_SEKARANG = [
  'Ditanami Padi',
  'Ditanami Palawija',
  'Ditanami Hortikultura',
  'Bera / Kosong',
  'Alih Fungsi'
];
const KOMODITAS = [
  'Padi',
  'Jagung',
  'Kedelai',
  'Kacang Tanah',
  'Ubi Kayu',
  'Cabai',
  'Bawang Merah',
  'Tebu',
  'Sayuran Lain',
  'Lainnya'
];
const STATUS_TANAM = ['Belum Tanam', 'Vegetatif', 'Generatif', 'Siap Panen', 'Panen', 'Puso', 'Bera'];

const NIK_PATTERN = /^\d{16}$/;
const nikField = (label) => ({
  label,
  type: 'text',
  group: 'IDENTITAS PETAK',
  validate: (value) => (NIK_PATTERN.test(value) ? null : 'NIK harus 16 digit angka.')
});

const pupukField = (label) => ({ label, type: 'number', unit: 'kg', min: 0, zeroIsBlank: true });

const STATIC_FIELDS = {
  ID_PETAK: { label: 'ID Petak', type: 'text', group: 'IDENTITAS PETAK', perFeature: true },
  KODE_PETAK: { label: 'Kode Petak', type: 'text', group: 'IDENTITAS PETAK', perFeature: true },
  WADMPR: { label: 'Provinsi', type: 'text', group: 'IDENTITAS PETAK', ...READ_ONLY },
  WADMKK: { label: 'Kabupaten/Kota', type: 'text', group: 'IDENTITAS PETAK', ...READ_ONLY },
  WADMKC: { label: 'Kecamatan', type: 'text', group: 'IDENTITAS PETAK', ...READ_ONLY },
  WADMKD: { label: 'Desa', type: 'text', group: 'IDENTITAS PETAK', ...READ_ONLY },
  KOORDINAT: { label: 'Koordinat', type: 'text', group: 'IDENTITAS PETAK', ...READ_ONLY },
  POKTAN: { label: 'Poktan', type: 'text', group: 'IDENTITAS PETAK' },
  LUAS: { label: 'Luas', type: 'number', unit: 'ha', decimals: 2, min: 0, group: 'IDENTITAS PETAK', perFeature: true },
  JNS_LAHAN: { label: 'Jenis Lahan', type: 'select', options: JENIS_LAHAN, group: 'IDENTITAS PETAK' },
  JNS_SAWAH: { label: 'Jenis Sawah', type: 'select', options: JENIS_SAWAH, group: 'IDENTITAS PETAK' },
  PENGGARAP: { label: 'Penggarap', type: 'text', group: 'IDENTITAS PETAK' },
  NIK_GARAP: nikField('NIK Penggarap'),
  PEMILIK: { label: 'Pemilik', type: 'text', group: 'IDENTITAS PETAK' },
  NIK_MILIK: nikField('NIK Pemilik'),
  PENYULUH: { label: 'Penyuluh', type: 'text', group: 'IDENTITAS PETAK' },
  KOND_SKRNG: {
    label: 'Pemanfaatan Saat Ini',
    type: 'select',
    options: KONDISI_SEKARANG,
    group: 'IDENTITAS PETAK'
  },
  KETERANGAN: { label: 'Keterangan', type: 'textarea', group: 'RINGKASAN TAHUN' }
};

const SEASON_FIELDS = {
  KOMO: { label: 'Komoditas', type: 'select', options: KOMODITAS },
  TNM: { label: 'Tanggal Tanam', type: 'date' },
  PNN: { label: 'Tanggal Panen', type: 'date' },
  STAT: { label: 'Status', type: 'select', options: STATUS_TANAM },
  UREA: pupukField('Pupuk Urea'),
  NPK: pupukField('Pupuk NPK'),
  SP36: pupukField('Pupuk SP36'),
  ZA: pupukField('Pupuk ZA'),
  ORGN: pupukField('Pupuk Organik'),
  HPTK: { label: 'Hama/Penyakit', type: 'text' },
  PRDV: { label: 'Produksi (volume)', type: 'number', unit: 'ton', decimals: 2, min: 0, zeroIsBlank: true },
  PRDK: { label: 'Produksi (kg)', type: 'number', unit: 'kg', min: 0, zeroIsBlank: true }
};

export const SEASON_ORDER = Object.keys(SEASON_FIELDS);

const SEASON_KEY = /^M([123])_(\d{2})_(\w+)$/;
const IP_KEY = /^MT_(\d{4})_IP$/;
const POLA_KEY = /^MT(\d{2})_POLA$/;

export function fieldDef(key) {
  if (STATIC_FIELDS[key]) return STATIC_FIELDS[key];

  const season = key.match(SEASON_KEY);
  if (season && SEASON_FIELDS[season[3]]) {
    return { ...SEASON_FIELDS[season[3]], group: `MUSIM TANAM ${season[1]}` };
  }

  const ip = key.match(IP_KEY);
  if (ip) {
    return { label: `IP ${ip[1]}`, type: 'number', min: 0, max: 300, zeroIsBlank: true, group: 'RINGKASAN TAHUN' };
  }

  if (POLA_KEY.test(key)) {
    return { label: 'Pola Tanam', type: 'text', group: 'RINGKASAN TAHUN', hint: 'Contoh: Padi - Padi - Palawija' };
  }

  return null;
}

export function isBlank(value, def) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' || trimmed === '-';
  }
  if (def?.zeroIsBlank && Number(value) === 0) return true;
  return false;
}

export function displayValue(key, value) {
  const def = fieldDef(key);
  if (isBlank(value, def)) return null;
  if (def?.type === 'number' && Number.isFinite(Number(value))) {
    return `${fmtNumber(value, def.decimals ?? 0)}${def.unit ? ` ${def.unit}` : ''}`;
  }
  return String(value);
}

export function getActiveYear(props) {
  const ipKey = Object.keys(props || {}).find((key) => IP_KEY.test(key));
  return ipKey ? ipKey.match(IP_KEY)[1] : String(new Date().getFullYear());
}

export const IDENTITAS_KEYS = [
  'KODE_PETAK',
  'WADMKC',
  'WADMKD',
  'POKTAN',
  'LUAS',
  'JNS_LAHAN',
  'JNS_SAWAH',
  'PENGGARAP',
  'NIK_GARAP',
  'PEMILIK',
  'NIK_MILIK',
  'PENYULUH'
];

export function seasonKeys(props, season, yy) {
  return SEASON_ORDER.map((suffix) => `M${season}_${yy}_${suffix}`).filter((key) => key in props);
}

export function petakKeys(props) {
  const year = getActiveYear(props);
  const yy = year.slice(-2);
  const keys = [
    'ID_PETAK',
    'KOND_SKRNG',
    ...IDENTITAS_KEYS,
    ...[1, 2, 3].flatMap((season) => seasonKeys(props, season, yy)),
    `MT_${year}_IP`,
    `MT${yy}_POLA`,
    'KETERANGAN'
  ];
  return keys.filter((key, i) => key in props && keys.indexOf(key) === i);
}

export function blankEditableKeys(props) {
  return petakKeys(props).filter((key) => {
    const def = fieldDef(key);
    return def && !def.readOnly && isBlank(props[key], def);
  });
}

export function bulkEditableKeys(propsList) {
  const keys = new Set();
  propsList.forEach((props) => {
    petakKeys(props).forEach((key) => {
      const def = fieldDef(key);
      if (def && !def.readOnly && !def.perFeature) keys.add(key);
    });
  });
  return [...keys];
}

export function bulkPlaceholder(key, propsList) {
  const def = fieldDef(key);
  const values = new Set();

  for (const props of propsList) {
    const value = props[key];
    values.add(isBlank(value, def) ? '' : String(value));
    if (values.size > 1) return '(Different values)';
  }

  return values.values().next().value || '';
}
