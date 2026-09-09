#!/usr/bin/env node
/**
 * Restore gitignored plaintext from components/gated/*.enc so Morris
 * (or an agent who has the tab passphrases) can edit the data.
 *
 * Usage:
 *   GATE_DEVOTION_PASSWORD=... GATE_HOTELS_PASSWORD=... npm run gate-decrypt
 *
 * Either env var can be omitted to restore only that tab.
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

function keyForTab(meta, passwords, tabId) {
  const tab = meta.tabs && meta.tabs[tabId];
  if (!tab) throw new Error('gate.json has no ' + tabId + ' tab');
  return crypto.deriveKey(passwords[tabId], crypto.saltFromMeta(tab));
}

function assertCanary(fileName, key) {
  const ok = crypto.decryptBuffer(fs.readFileSync(path.join(gated, fileName)), key).toString('utf8');
  if (ok !== 'ok') throw new Error(fileName + ' did not decrypt to the expected marker');
}

function main() {
  crypto.loadDotEnv(root);
  const wanted = crypto.tabIds().filter((id) => process.env[crypto.envNameForTab(id)]);
  const passwords = crypto.requireTabPasswords(root, wanted.length ? wanted : crypto.tabIds());
  const meta = crypto.readMeta(path.join(gated, 'gate.json'));

  if (passwords.devotion) {
    const key = keyForTab(meta, passwords, 'devotion');
    assertCanary(meta.tabs.devotion.ok || 'devotion-ok.enc', key);
    const devotions = JSON.parse(
      crypto.decryptBuffer(fs.readFileSync(path.join(gated, 'devotions.enc')), key).toString('utf8')
    );
    writeJson(path.join(root, 'components', 'faith', 'data', 'devotions.json'), devotions);
    console.log('restored plaintext devotion files (gitignored)');
  }

  if (passwords.hotels) {
    const key = keyForTab(meta, passwords, 'hotels');
    assertCanary(meta.tabs.hotels.ok || 'hotels-ok.enc', key);
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
    console.log('restored plaintext hotel collection files (gitignored)');
  }
}

main();
