self.onmessage = async (e) => {
  const { url, timeoutMs } = e.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    self.postMessage({ ok: true, data });
  } catch (err) {
    const message = err.name === 'AbortError' ? 'timeout' : err.message || 'Gagal memuat data';
    self.postMessage({ ok: false, error: message });
  } finally {
    clearTimeout(timer);
  }
};
