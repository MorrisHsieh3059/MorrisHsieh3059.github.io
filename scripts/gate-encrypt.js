#!/usr/bin/env node
/**
 * Encrypt Daily Devotion + Hotel Collection plaintext into
 * components/gated/*.enc for commit and deploy. The passphrase stays
 * in GATE_PASSWORD — never write it into this repo.
 *
 * Usage: GATE_PASSWORD=... npm run gate-encrypt
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('./lib/gate-crypto');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'components', 'gated');

const DEVOTIONS = path.join(root, 'components', 'faith', 'data', 'devotions.json');
const HOTELS = path.join(root, 'components', 'travel', 'data', 'hotels.json');
const VISITS = path.join(root, 'components', 'travel', 'data', 'hotel-visits.json');
const VISIT_IMG = path.join(root, 'components', 'travel', 'img', 'visits');

function mustRead(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('missing plaintext ' + path.relative(root, filePath) + ' — decrypt first or add the file');
  }
  return fs.readFileSync(filePath);
}

function collectVisitPhotos() {
  const files = {};
  if (!fs.existsSync(VISIT_IMG)) return files;
  const visits = fs.readdirSync(VISIT_IMG, { withFileTypes: true });
  visits.forEach((dir) => {
    if (!dir.isDirectory()) return;
    const folder = path.join(VISIT_IMG, dir.name);
    fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile()) return;
      if (entry.name.startsWith('.')) return;
      files[dir.name + '/' + entry.name] = fs.readFileSync(path.join(folder, entry.name));
    });
  });
  return files;
}

function main() {
  const password = crypto.requirePassword(root);
  fs.mkdirSync(outDir, { recursive: true });

  const gateJsonPath = path.join(outDir, 'gate.json');
  const salt = crypto.loadExistingSalt(gateJsonPath);
  const key = crypto.deriveKey(password, salt);

  const collection = {
    hotels: JSON.parse(mustRead(HOTELS).toString('utf8')),
    visits: JSON.parse(mustRead(VISITS).toString('utf8'))
  };

  const writes = [
    ['gate.json', Buffer.from(JSON.stringify(crypto.publicMeta(salt)) + '\n', 'utf8')],
    ['gate-ok.enc', crypto.encryptBuffer(Buffer.from('ok', 'utf8'), key)],
    ['devotions.enc', crypto.encryptBuffer(mustRead(DEVOTIONS), key)],
    ['hotel-collection.enc', crypto.encryptBuffer(Buffer.from(JSON.stringify(collection), 'utf8'), key)],
    ['hotel-media.enc', crypto.encryptBuffer(crypto.packArchive(collectVisitPhotos()), key)]
  ];

  writes.forEach(([name, buf]) => {
    if (name === 'gate.json') {
      fs.writeFileSync(path.join(outDir, name), buf);
    } else {
      fs.writeFileSync(path.join(outDir, name), buf);
    }
    console.log('wrote components/gated/' + name + ' (' + buf.length + ' bytes)');
  });
}

main();
