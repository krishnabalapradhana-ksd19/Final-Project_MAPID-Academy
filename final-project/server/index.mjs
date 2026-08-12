import { createServer } from 'node:http';
import { gdalVersion, geoPdfHandler, GEOPDF_ROUTE } from './geopdf-handler.mjs';

const PORT = Number(process.env.PORT) || 5174;
const ORIGIN = process.env.CORS_ORIGIN || '*';

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  geoPdfHandler(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Tidak ditemukan. Endpoint yang tersedia: POST ${GEOPDF_ROUTE}`);
  });
});

server.listen(PORT, async () => {
  console.log(`Layanan GeoPDF berjalan di http://localhost:${PORT}${GEOPDF_ROUTE}`);
  try {
    console.log(`GDAL terdeteksi: ${await gdalVersion()}`);
  } catch (err) {
    console.warn(`Peringatan: ${err.message}`);
  }
});
