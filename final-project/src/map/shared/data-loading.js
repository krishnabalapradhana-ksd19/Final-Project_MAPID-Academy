export async function fetchJsonWithTimeout(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Waktu tunggu habis (timeout)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function loadGeojsonViaWorker(url, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./geojson-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.data);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Worker gagal memuat data'));
    };
    worker.postMessage({ url, timeoutMs });
  });
}
