import { runExport } from './print-export.js';
import { loadImage, PAPER_SIZES } from './print-layout.js';

const EXPORT_LABELS = {
  pdf: 'Menyusun layout PDF…',
  image: 'Menyusun gambar…',
  geopdf: 'Membuat GeoPDF via GDAL di server… (butuh beberapa detik)'
};

/**
 * @param {object} options
 * @param {() => object} options.getDefaults Dibaca ulang tiap panel dibuka,
 *   supaya judul mengikuti layer/filter yang sedang aktif.
 */
export class PrintControl {
  constructor({ getDefaults }) {
    this._getDefaults = getDefaults;
    this._logoPromise = null;
  }

  onAdd(mapInstance) {
    this._map = mapInstance;

    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group print-control';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'maplibregl-ctrl-icon print-toggle';
    toggle.title = 'Print Peta';
    toggle.setAttribute('aria-label', 'Print peta menjadi layout siap cetak');
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="7" rx="1" />
      </svg>
    `;
    toggle.addEventListener('click', () => this._open());

    this._container.appendChild(toggle);
    this._buildDialog();
    return this._container;
  }

  onRemove() {
    this._overlay?.remove();
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }

  _buildDialog() {
    const paperOptions = Object.entries(PAPER_SIZES)
      .map(([key, { label, width, height }]) => `<option value="${key}">${label} (${width}×${height} mm)</option>`)
      .join('');

    this._overlay = document.createElement('div');
    this._overlay.className = 'print-overlay';
    this._overlay.hidden = true;
    this._overlay.innerHTML = `
      <div class="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title">
        <div class="print-dialog-head">
          <h2 id="print-dialog-title">Print Peta</h2>
          <button type="button" class="print-close" aria-label="Tutup">&times;</button>
        </div>

        <div class="print-dialog-body">
          <label class="print-field">
            <span>Judul Peta</span>
            <input type="text" data-field="title" />
          </label>
          <label class="print-field">
            <span>Subjudul</span>
            <input type="text" data-field="subtitle" />
          </label>
          <label class="print-field">
            <span>Sumber Data</span>
            <input type="text" data-field="source" />
          </label>
          <label class="print-field">
            <span>Pembuat Peta</span>
            <input type="text" data-field="author" placeholder="Nama / instansi pembuat" />
          </label>

          <div class="print-field-row">
            <label class="print-field">
              <span>Ukuran Kertas</span>
              <select data-field="paper">${paperOptions}</select>
            </label>
            <label class="print-field">
              <span>Orientasi</span>
              <select data-field="orientation">
                <option value="landscape">Lanskap</option>
                <option value="portrait">Potret</option>
              </select>
            </label>
            <label class="print-field">
              <span>Format Gambar</span>
              <select data-field="imageFormat">
                <option value="png">PNG</option>
                <option value="jpeg">JPG</option>
              </select>
            </label>
          </div>

          <p class="print-note">
            Peta dirender ulang pada 300 DPI mengikuti tampilan saat ini. GeoPDF memakai layout
            yang sama lengkap dengan kop &amp; legenda; koordinat ditandai neatline pada muka
            peta sehingga tetap terbaca benar di Avenza Maps.
          </p>
        </div>

        <div class="print-status" hidden></div>

        <div class="print-dialog-actions">
          <button type="button" class="print-action print-primary" data-kind="pdf">Export PDF (Layout)</button>
          <button type="button" class="print-action" data-kind="image">Export Gambar</button>
          <button type="button" class="print-action" data-kind="geopdf">Export untuk Avenza (GeoPDF)</button>
        </div>
      </div>
    `;

    this._statusEl = this._overlay.querySelector('.print-status');
    this._actions = [...this._overlay.querySelectorAll('.print-action')];

    this._actions.forEach((btn) => btn.addEventListener('click', () => this._export(btn.dataset.kind)));
    this._overlay.querySelector('.print-close').addEventListener('click', () => this._close());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this._overlay.hidden && !this._busy) this._close();
    });

    document.body.appendChild(this._overlay);
  }

  _open() {
    const defaults = this._getDefaults();
    Object.entries(defaults).forEach(([key, value]) => {
      const field = this._overlay.querySelector(`[data-field="${key}"]`);
      if (field && value !== undefined) field.value = value;
    });
    this._setStatus(null);
    this._overlay.hidden = false;
  }

  _close() {
    this._overlay.hidden = true;
  }

  _setStatus(text, kind = 'loading') {
    this._statusEl.hidden = !text;
    this._statusEl.textContent = text || '';
    this._statusEl.classList.toggle('is-error', kind === 'error');
  }

  _readSettings() {
    return Object.fromEntries(
      [...this._overlay.querySelectorAll('[data-field]')].map((el) => [el.dataset.field, el.value.trim()])
    );
  }

  _logo() {
    const { logo } = this._getDefaults();
    if (!logo) return Promise.resolve(null);
    this._logoPromise ||= loadImage(logo).catch(() => null);
    return this._logoPromise;
  }

  async _export(kind) {
    if (this._busy) return;
    this._busy = true;
    this._actions.forEach((btn) => (btn.disabled = true));
    this._overlay.classList.add('is-busy');
    this._setStatus(EXPORT_LABELS[kind]);

    // Beri satu frame supaya indikator proses sempat tergambar sebelum
    // penangkapan peta mulai membebani thread utama.
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const { agency } = this._getDefaults();
      await runExport(this._map, { ...this._readSettings(), agency, logo: await this._logo() }, kind);
      this._setStatus(null);
      this._close();
    } catch (err) {
      this._setStatus(err.message || 'Ekspor gagal.', 'error');
    } finally {
      this._busy = false;
      this._actions.forEach((btn) => (btn.disabled = false));
      this._overlay.classList.remove('is-busy');
    }
  }
}
