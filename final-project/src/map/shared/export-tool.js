import { DropdownControl } from './map-control.js';
import { EXPORT_FORMATS } from './export-formats.js';

const DISABLED_TITLE = 'Segera hadir';

const ICON = `
  <path d="M12 3v12" />
  <path d="m7 10 5 5 5-5" />
  <path d="M5 21h14" />
`;

export class ExportControl extends DropdownControl {
  constructor({ loadRows, fileBaseName, notify }) {
    super({ icon: ICON, title: 'Export Data', ariaLabel: 'Export data petak', label: 'Export Data' });
    this._loadRows = loadRows;
    this._fileBaseName = fileBaseName;
    this._notify = notify;
    this._busy = false;
  }

  keepOpen() {
    return this._busy;
  }

  buildMenu(menu) {
    this._sourceEl = document.createElement('div');
    this._sourceEl.className = 'dropdown-hint export-source';
    menu.appendChild(this._sourceEl);

    const list = document.createElement('div');
    list.className = 'dropdown-options';

    EXPORT_FORMATS.forEach((format) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dropdown-option export-option' + (format.enabled ? '' : ' is-disabled');
      button.textContent = format.label;

      if (format.enabled) {
        button.addEventListener('click', () => this._run(format));
      } else {
        button.title = DISABLED_TITLE;
        button.setAttribute('aria-disabled', 'true');
      }

      list.appendChild(button);
    });

    menu.appendChild(list);
  }

  setSourceLabel(text) {
    if (this._sourceEl) this._sourceEl.textContent = text;
  }

  async _run(format) {
    if (this._busy) return;
    this._busy = true;
    const label = this._sourceEl.textContent;
    this.setSourceLabel('Menyiapkan berkas…');
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const rows = await this._loadRows();
      if (!rows.length) throw new Error('Tidak ada petak yang bisa diekspor.');
      format.run(rows, this._fileBaseName());
      this._notify(`${rows.length.toLocaleString('id-ID')} petak diekspor ke ${format.key.toUpperCase()}`);
      this.close();
    } catch (err) {
      this._notify(`Gagal export: ${err.message}`, { error: true });
    } finally {
      this._busy = false;
      this.setSourceLabel(label);
    }
  }
}
