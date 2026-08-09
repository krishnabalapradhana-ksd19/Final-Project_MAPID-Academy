const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

async function listFiles() {
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    });
    const files = res.data.files;
    if (files.length === 0) {
      console.log('Tidak ada file ditemukan.');
      return;
    }
    console.log('Daftar File:');
    files.map((file) => console.log(`${file.name} (${file.id})`));
  } catch (err) {
    console.error('Terjadi kesalahan API:', err);
  }
}

listFiles();
