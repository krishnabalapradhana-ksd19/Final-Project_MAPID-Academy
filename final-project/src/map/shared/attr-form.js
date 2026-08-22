import { escapeHtml } from './feature-popup.js';
import { fieldDef } from './attr-schema.js';
import { closeActiveControl } from './map-control.js';

let overlay = null;
let activeForm = null;

function inputHtml(key, def, placeholder) {
  const id = `attr-input-${key}`;
  const common = `id="${id}" data-key="${escapeHtml(key)}"`;
  const hint = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';

  if (def.type === 'select') {
    const options = def.options
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join('');
    const empty = escapeHtml(placeholder || '— pilih —');
    return `<select ${common}><option value="">${empty}</option>${options}</select>`;
  }
  if (def.type === 'textarea') {
    return `<textarea ${common}${hint} rows="2"></textarea>`;
  }
  if (def.type === 'number') {
    const step = def.decimals ? (0.1 ** def.decimals).toFixed(def.decimals) : '1';
    const min = def.min === undefined ? '' : ` min="${def.min}"`;
    const max = def.max === undefined ? '' : ` max="${def.max}"`;
    return `<input type="number" inputmode="decimal" step="${step}"${min}${max}${hint} ${common} />`;
  }
  return `<input type="${def.type === 'date' ? 'date' : 'text'}"${hint} ${common} />`;
}

function fieldsHtml(keys, placeholders) {
  let lastGroup = null;

  return keys
    .map((key) => {
      const def = fieldDef(key);
      const heading =
        def.group && def.group !== lastGroup ? `<div class="attr-form-group">${escapeHtml(def.group)}</div>` : '';
      lastGroup = def.group || lastGroup;

      const unit = def.unit ? ` <em>(${escapeHtml(def.unit)})</em>` : '';
      const hint = def.hint ? `<small class="attr-field-hint">${escapeHtml(def.hint)}</small>` : '';

      return `
        ${heading}
        <label class="attr-field" data-field="${escapeHtml(key)}">
          <span>${escapeHtml(def.label)}${unit}</span>
          ${inputHtml(key, def, placeholders[key])}
          ${hint}
          <small class="attr-field-error" hidden></small>
        </label>
      `;
    })
    .join('');
}

function readField(key, input) {
  const def = fieldDef(key);
  const raw = String(input.value).trim();
  if (raw === '') return { empty: true };

  if (def.type === 'number') {
    const num = Number(raw);
    if (!Number.isFinite(num)) return { error: 'Harus berupa angka.' };
    if (def.min !== undefined && num < def.min) return { error: `Minimal ${def.min}.` };
    if (def.max !== undefined && num > def.max) return { error: `Maksimal ${def.max}.` };
    return { value: def.decimals ? Number(num.toFixed(def.decimals)) : num };
  }

  const invalid = def.validate?.(raw);
  if (invalid) return { error: invalid };
  return { value: raw };
}

function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'print-overlay attr-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="print-dialog attr-dialog" role="dialog" aria-modal="true" aria-labelledby="attr-dialog-title">
      <div class="print-dialog-head">
        <div>
          <h2 id="attr-dialog-title">Lengkapi Data</h2>
          <p class="attr-dialog-sub"></p>
        </div>
        <button type="button" class="print-close" aria-label="Tutup">&times;</button>
      </div>
      <form class="print-dialog-body attr-form"></form>
      <div class="print-status attr-form-status" hidden></div>
      <div class="print-dialog-actions">
        <button type="button" class="print-action attr-cancel">Batal</button>
        <button type="button" class="print-action print-primary attr-submit">Simpan</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.print-close').addEventListener('click', closeAttrForm);
  overlay.querySelector('.attr-cancel').addEventListener('click', closeAttrForm);
  overlay.querySelector('.attr-submit').addEventListener('click', submit);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAttrForm();
  });
  overlay.querySelector('.attr-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeAttrForm();
  });

  return overlay;
}

function setStatus(message, isError = true) {
  const status = overlay.querySelector('.attr-form-status');
  status.hidden = !message;
  status.classList.toggle('is-error', isError);
  status.textContent = message || '';
}

function submit() {
  if (!activeForm) return;

  const patch = {};
  let firstInvalid = null;

  overlay.querySelectorAll('.attr-field').forEach((label) => {
    const key = label.dataset.field;
    const errorEl = label.querySelector('.attr-field-error');
    const result = readField(key, label.querySelector('[data-key]'));

    label.classList.toggle('is-invalid', Boolean(result.error));
    errorEl.hidden = !result.error;
    errorEl.textContent = result.error || '';

    if (result.error && !firstInvalid) firstInvalid = label;
    if (!result.error && !result.empty) patch[key] = result.value;
  });

  if (firstInvalid) {
    setStatus('Periksa kembali isian yang ditandai merah.');
    firstInvalid.querySelector('[data-key]').focus();
    return;
  }
  if (!Object.keys(patch).length) {
    setStatus('Belum ada field yang diisi. Isi minimal satu field sebelum menyimpan.');
    return;
  }

  try {
    activeForm.onSave(patch);
    closeAttrForm();
  } catch (err) {
    setStatus(err.message);
  }
}

export function closeAttrForm() {
  if (!overlay) return;
  overlay.hidden = true;
  activeForm = null;
}

export function openAttrForm({
  title = 'Lengkapi Data',
  subtitle,
  keys,
  placeholders = {},
  submitLabel = 'Simpan',
  onSave
}) {
  ensureOverlay();
  closeActiveControl();
  activeForm = { onSave };

  overlay.querySelector('#attr-dialog-title').textContent = title;
  overlay.querySelector('.attr-dialog-sub').textContent = subtitle;
  overlay.querySelector('.attr-submit').textContent = submitLabel;
  overlay.querySelector('.attr-form').innerHTML = fieldsHtml(keys, placeholders);
  setStatus('');
  overlay.hidden = false;
  overlay.querySelector('[data-key]')?.focus();
}
