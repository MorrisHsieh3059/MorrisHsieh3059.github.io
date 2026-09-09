#!/usr/bin/env node
/**
 * Restore gitignored plaintext from components/gated/*.enc so Morris
 * (or an agent who has GATE_PASSWORD) can edit devotion / hotel data.
 *
 * Usage: GATE_PASSWORD=... npm run gate-decrypt
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('./lib/gate-crypto');

const root = path.join(__dirname, '..');
const gated = path.join(root, 'components', 'gated');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function main() {
  const password = crypto.requirePassword(root);
  const meta = crypto.readMeta(path.join(gated, 'gate.json'));
  const key = crypto.deriveKey(password, crypto.saltFromMeta(meta));

  const ok = crypto.decryptBuffer(fs.readFileSync(path.join(gated, 'gate-ok.enc')), key).toString('utf8');
  if (ok !== 'ok') throw new Error('gate-ok.enc did not decrypt to the expected marker');

  const devotions = JSON.parse(
    crypto.decryptBuffer(fs.readFileSync(path.join(gated, 'devotions.enc')), key).toString('utf8')
  );
  writeJson(path.join(root, 'components', 'faith', 'data', 'devotions.json'), devotions);

  const collection = JSON.parse(
    crypto.decryptBuffer(fs.readFileSync(path.join(gated, 'hotel-collection.enc')), key).toString('utf8')
  );
  writeJson(path.join(root, 'components', 'travel', 'data', 'hotels.json'), collection.hotels);
  writeJson(path.join(root, 'components', 'travel', 'data', 'hotel-visits.json'), collection.visits);

  const media = crypto.unpackArchive(
    crypto.decryptBuffer(fs.readFileSync(path.join(gated, 'hotel-media.enc')), key)
  );
  const visitsRoot = path.join(root, 'components', 'travel', 'img', 'visits');
  Object.keys(media).forEach((rel) => {
    const dest = path.join(visitsRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, media[rel]);
  });

  console.log('restored plaintext devotion + hotel collection files (gitignored)');
}

main();
