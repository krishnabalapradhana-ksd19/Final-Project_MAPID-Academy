import { fetchJsonWithTimeout } from '../../shared/fetch-json.js';

self.onmessage = async ({ data: { url, timeoutMs } }) => {
  try {
    self.postMessage({ ok: true, data: await fetchJsonWithTimeout(url, { timeoutMs }) });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || 'Gagal memuat data' });
  }
};
