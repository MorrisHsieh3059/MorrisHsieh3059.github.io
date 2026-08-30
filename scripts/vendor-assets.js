#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Font Awesome — keep the existing tracked tree; build.js copies only
// all.min.css + the two webfonts the live site actually uses.
copyFile(
  path.join(root, 'node_modules/@fortawesome/fontawesome-free/css/all.min.css'),
  path.join(root, 'vendor/fontawesome/css/all.min.css')
);

const FONT_FILES = [
  ['roboto-mono', 'roboto-mono-latin-400-normal.woff2'],
  ['roboto-mono', 'roboto-mono-latin-500-normal.woff2'],
  ['roboto-mono', 'roboto-mono-latin-700-normal.woff2'],
  ['lora', 'lora-latin-400-normal.woff2'],
  ['lora', 'lora-latin-400-italic.woff2'],
  ['lora', 'lora-latin-700-normal.woff2'],
  ['lora', 'lora-latin-700-italic.woff2'],
];
for (const [pkg, file] of FONT_FILES) {
  copyFile(
    path.join(root, 'node_modules/@fontsource', pkg, 'files', file),
    path.join(root, 'vendor/fonts', pkg, file)
  );
}

copyFile(
  path.join(root, 'node_modules/leaflet/dist/leaflet.js'),
  path.join(root, 'vendor/leaflet/leaflet.js')
);
copyFile(
  path.join(root, 'node_modules/leaflet/dist/leaflet.css'),
  path.join(root, 'vendor/leaflet/leaflet.css')
);

copyFile(
  path.join(root, 'node_modules/marked/marked.min.js'),
  path.join(root, 'vendor/marked/marked.min.js')
);

console.log('Vendored assets copied to vendor/');
