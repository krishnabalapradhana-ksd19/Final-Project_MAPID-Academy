const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Dipakai oleh GitHub Actions saat build: mengambil geojson besar dari
// Google Drive (via Service Account) dan menaruhnya di public/data/ pada
// final-project, karena file itu terlalu besar untuk disimpan di git.
const FILE_ID = process.env.GDRIVE_FILE_ID || '1WU1ZCKk6Ua1PUKv5Snmb-i6oSMS50iPn';
const OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'final-project',
  'public',
  'data',
  'LBS_DIY_66871HA.geojson'
);

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

async function downloadGeojson() {
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
