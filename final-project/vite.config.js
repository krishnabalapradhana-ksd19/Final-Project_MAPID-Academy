import { defineConfig } from 'vite';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function collectPages(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => [path.basename(entry.name, '.html'), path.join(entry.parentPath ?? entry.path, entry.name)]);
}

export default defineConfig({
  base: '/Final-Project_MAPID-Academy/',
  build: {
    rollupOptions: {
      input: {
        main: path.join(rootDir, 'index.html'),
        ...Object.fromEntries(collectPages(path.join(rootDir, 'src/map')))
      }
    }
  }
});
