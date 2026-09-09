/**
 * AES-256-GCM helpers for the private Daily Devotion + Hotel Collection
 * payloads. The passphrase never belongs in git — callers read it from
 * GATE_PASSWORD (env or a gitignored .env).
 *
 * On-disk envelope (binary):
 *   GATE1 (5) | iv (12) | ciphertext || 16-byte GCM tag
 *
 * KDF parameters live in the public gate.json (salt is not secret).
 * One salt is shared across every gated file so the browser derives
 * the key once per unlock.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAGIC = Buffer.from('GATE1');
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SALT_LEN = 16;
const ITERATIONS = 210000;
const HASH = 'sha256';

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LEN, HASH);
}

function encryptBuffer(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, body, tag]);
}

function decryptBuffer(envelope, key) {
  if (!Buffer.isBuffer(envelope) || envelope.length < MAGIC.length + IV_LEN + TAG_LEN) {
    throw new Error('gated file is truncated');
  }
  if (!envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('gated file is not a GATE1 envelope');
  }
  const iv = envelope.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tail = envelope.subarray(MAGIC.length + IV_LEN);
  const tag = tail.subarray(tail.length - TAG_LEN);
  const body = tail.subarray(0, tail.length - TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

function publicMeta(salt) {
  return {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iter: ITERATIONS,
    salt: Buffer.from(salt).toString('base64')
  };
}

function readMeta(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saltFromMeta(meta) {
  const salt = Buffer.from(meta.salt, 'base64');
  if (salt.length !== SALT_LEN) {
    throw new Error('gate.json salt must be 16 bytes');
  }
  if (meta.kdf !== 'PBKDF2' || meta.hash !== 'SHA-256' || meta.iter !== ITERATIONS) {
    throw new Error('gate.json KDF parameters do not match this encoder');
  }
  return salt;
}

function loadExistingSalt(gateJsonPath) {
  if (!fs.existsSync(gateJsonPath)) return crypto.randomBytes(SALT_LEN);
  return saltFromMeta(readMeta(gateJsonPath));
}

const ARCHIVE_MAGIC = Buffer.from('GAR1');

function packArchive(files) {
  const names = Object.keys(files).sort();
  const chunks = [ARCHIVE_MAGIC, Buffer.alloc(4)];
  chunks[1].writeUInt32BE(names.length);
  names.forEach((name) => {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(files[name]);
    const header = Buffer.alloc(6);
    header.writeUInt16BE(nameBuf.length, 0);
    header.writeUInt32BE(data.length, 2);
    chunks.push(header, nameBuf, data);
  });
  return Buffer.concat(chunks);
}

function unpackArchive(buf) {
  if (!buf.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) {
    throw new Error('not a GAR1 archive');
  }
  let offset = ARCHIVE_MAGIC.length;
  const count = buf.readUInt32BE(offset);
  offset += 4;
  const files = {};
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16BE(offset);
    const dataLen = buf.readUInt32BE(offset + 2);
    offset += 6;
    const name = buf.subarray(offset, offset + nameLen).toString('utf8');
    offset += nameLen;
    files[name] = buf.subarray(offset, offset + dataLen);
    offset += dataLen;
  }
  return files;
}

function loadDotEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  });
}

function requirePassword(rootDir) {
  loadDotEnv(rootDir);
  const password = process.env.GATE_PASSWORD;
  if (!password) {
    throw new Error('Set GATE_PASSWORD in the environment (or a gitignored .env). Do not commit it.');
  }
  return password;
}

module.exports = {
  MAGIC,
  ARCHIVE_MAGIC,
  IV_LEN,
  TAG_LEN,
  SALT_LEN,
  ITERATIONS,
  HASH,
  deriveKey,
  encryptBuffer,
  decryptBuffer,
  publicMeta,
  readMeta,
  saltFromMeta,
  loadExistingSalt,
  packArchive,
  unpackArchive,
  loadDotEnv,
  requirePassword
};
