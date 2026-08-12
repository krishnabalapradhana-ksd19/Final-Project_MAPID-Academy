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
