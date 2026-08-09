import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const mapDir = path.join(rootDir, 'src/map');

// Kumpulkan semua halaman peta-kerja-*.html di src/map/**, supaya bisa
// diakses lewat URL pendek di root (mis. /peta-kerja-sleman.html) baik
// saat dev maupun setelah build, tanpa perlu mengetik path folder kabupatennya.
function collectPages(dir) {
  const pages = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.html')) {
        pages.set(entry, full);
      }
    }
  };
  walk(dir);
  return pages;
}

// Plugin dev-server: rewrite request "/peta-kerja-sleman.html" (root)
// ke file aslinya di "src/map/kab_sleman/peta-kerja-sleman.html".
function pageAliasPlugin(pages) {
  return {
    name: 'page-alias',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];
        const target = pages.get(url.slice(1));
        if (url.startsWith('/') && !url.slice(1).includes('/') && target) {
          req.url = '/' + path.relative(rootDir, target).replace(/\\/g, '/');
        }
        next();
      });
    }
  };
}

const pages = collectPages(mapDir);
const pageInputs = Object.fromEntries(
  [...pages.entries()].map(([file, full]) => [path.basename(file, '.html'), full])
);

export default defineConfig({
  // Situs di-deploy ke GitHub Pages di bawah subpath repo
  // (https://<user>.github.io/Final-Project_MAPID-Academy/), bukan di root domain.
  base: '/Final-Project_MAPID-Academy/',
  plugins: [pageAliasPlugin(pages)],
  build: {
    rollupOptions: {
      input: {
        main: path.join(rootDir, 'index.html'),
        ...pageInputs
      }
    }
  }
});
