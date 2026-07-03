#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Font Awesome
copyDir(
  path.join(root, 'node_modules/@fortawesome/fontawesome-free/css'),
  path.join(root, 'vendor/fontawesome/css')
);
copyDir(
  path.join(root, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
  path.join(root, 'vendor/fontawesome/webfonts')
);

// Google Fonts (Roboto Mono + Lora) via @fontsource
for (const pkg of ['roboto-mono', 'lora']) {
  copyDir(
    path.join(root, 'node_modules/@fontsource', pkg, 'files'),
    path.join(root, 'vendor/fonts', pkg)
  );
}

// Build local fonts.css
const fontsCss = `/* Vendored from @fontsource — no external CDN */
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url('../fonts/roboto-mono/roboto-mono-latin-300-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/roboto-mono/roboto-mono-latin-400-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('../fonts/roboto-mono/roboto-mono-latin-500-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/roboto-mono/roboto-mono-latin-700-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/lora/lora-latin-400-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Lora';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/lora/lora-latin-400-italic.woff2') format('woff2');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/lora/lora-latin-700-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Lora';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/lora/lora-latin-700-italic.woff2') format('woff2');
}
`;

fs.mkdirSync(path.join(root, 'vendor/fonts'), { recursive: true });
fs.writeFileSync(path.join(root, 'vendor/fonts/fonts.css'), fontsCss);

// Patch fontawesome all.min.css webfont paths
const faCssPath = path.join(root, 'vendor/fontawesome/css/all.min.css');
let faCss = fs.readFileSync(faCssPath, 'utf8');
faCss = faCss.replace(/\.\.\/webfonts\//g, '../webfonts/');
fs.writeFileSync(faCssPath, faCss);

console.log('Vendored assets copied to vendor/');