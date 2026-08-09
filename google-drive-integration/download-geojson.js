const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Dipakai oleh GitHub Actions saat build: mengambil geojson besar dari
// Google Drive (via Service Account) dan menaruhnya di public/data/ pada
// final-project, karena file itu terlalu besar untuk disimpan di git.
const FILE_ID = process.env.GDRIVE_FILE_ID || '1WU1ZCKk6Ua1PUKv5Snmb-i6oSMS50iPn';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'final-project',
  'public',
  'data',
  'LBS_DIY_66871HA.geojson'
);

// Baca & validasi credentials.json secara eksplisit (bukan lewat keyFile)
// supaya kalau secret GDRIVE_CREDENTIALS_JSON kosong/rusak, errornya jelas
// di sini alih-alih muncul sebagai "missing a valid API key" yang membingungkan
// dari Google Drive API saat auth diam-diam gagal ter-resolve.
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`credentials.json tidak ditemukan di ${CREDENTIALS_PATH}`);
  }
  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8').trim();
  if (!raw) {
    throw new Error(
      'credentials.json kosong. Cek secret GDRIVE_CREDENTIALS_JSON di GitHub ' +
        '(Settings > Secrets and variables > Actions) — pastikan isinya seluruh ' +
        'JSON service account, bukan string kosong.'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`credentials.json bukan JSON valid: ${err.message}`);
  }
  const requiredFields = ['client_email', 'private_key', 'type'];
  const missing = requiredFields.filter((f) => !parsed[f]);
  if (missing.length) {
    throw new Error(`credentials.json kehilangan field wajib: ${missing.join(', ')}`);
  }
  if (parsed.type !== 'service_account') {
    throw new Error(`credentials.json harus bertipe "service_account", didapat "${parsed.type}"`);
  }
  return parsed;
}

async function downloadGeojson() {
  const credentials = loadCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const res = await drive.files.get(
    { fileId: FILE_ID, alt: 'media' },
    { responseType: 'stream' }
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(OUTPUT_PATH);
    res.data
      .on('end', resolve)
      .on('error', reject)
      .pipe(dest);
  });

  console.log(`Geojson berhasil diunduh ke ${OUTPUT_PATH}`);
}

downloadGeojson().catch((err) => {
  console.error('Gagal mengunduh geojson dari Drive:', err);
  process.exit(1);
});
