import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const mapDir = path.join(rootDir, 'src/map');

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
