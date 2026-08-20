const VISIBLE_MS = 2600;

let container = null;

/** Notifikasi singkat di pojok bawah peta. */
export function showToast(message, { error = false } = {}) {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast' + (error ? ' is-error' : '');
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 250);
  }, VISIBLE_MS);
}
