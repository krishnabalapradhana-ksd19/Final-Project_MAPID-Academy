export function onceLoaded(map, fn) {
  if (map.loaded()) fn();
  else map.once('load', fn);
}

export function controlButton({ icon, title, ariaLabel, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'maplibregl-ctrl-icon dropdown-toggle';
  button.title = title;
  button.setAttribute('aria-label', ariaLabel || title);
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>`;
  button.addEventListener('click', onClick);
  return button;
}

let activeControl = null;

export function closeActiveControl() {
  if (activeControl) activeControl.close();
}

export class DropdownControl {
  constructor({ icon, title, ariaLabel, label, placement = 'right' }) {
    this._config = { icon, title, ariaLabel, label, placement };
  }

  onAdd(map) {
    this._map = map;
    const { icon, title, ariaLabel, label, placement } = this._config;

    this._container = document.createElement('div');
    this._container.className = `maplibregl-ctrl maplibregl-ctrl-group map-dropdown place-${placement}`;

    const toggle = controlButton({
      icon,
      title,
      ariaLabel,
      onClick: (e) => {
        e.stopPropagation();
        this.toggle();
      }
    });

    this._menu = document.createElement('div');
    this._menu.className = 'dropdown-menu';
    if (label) this._menu.innerHTML = `<div class="dropdown-label">${label}</div>`;

    this._onDocumentClick = (e) => {
      if (this.keepOpen()) return;
      if (!this._container.contains(e.target)) this.close();
    };
    document.addEventListener('click', this._onDocumentClick);

    this._container.append(toggle, this._menu);
    this.buildMenu(this._menu, map);
    return this._container;
  }

  onRemove() {
    document.removeEventListener('click', this._onDocumentClick);
    this.close();
    this._container.remove();
    this._map = undefined;
  }

  isOpen() {
    return this._container.classList.contains('open');
  }

  open() {
    if (this.isOpen()) return;
    if (activeControl && activeControl !== this) activeControl.close();
    activeControl = this;
    this._container.classList.add('open');
    this.onOpen();
  }

  close() {
    if (!this.isOpen()) return;
    this._container.classList.remove('open');
    if (activeControl === this) activeControl = null;
    this.onClose();
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  keepOpen() {
    return false;
  }

  buildMenu() {}

  onOpen() {}

  onClose() {}
}
