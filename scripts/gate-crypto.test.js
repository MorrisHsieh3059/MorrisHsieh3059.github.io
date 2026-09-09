#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('./lib/gate-crypto');

const password = 'test-passphrase-not-used-in-production';
const salt = Buffer.alloc(crypto.SALT_LEN, 7);
const key = crypto.deriveKey(password, salt);
const wrong = crypto.deriveKey('nope', salt);

const message = Buffer.from('hello gated world', 'utf8');
const envelope = crypto.encryptBuffer(message, key);
assert.notStrictEqual(envelope.toString('utf8'), message.toString('utf8'));
assert.strictEqual(crypto.decryptBuffer(envelope, key).toString('utf8'), 'hello gated world');
assert.throws(() => crypto.decryptBuffer(envelope, wrong));

const packed = crypto.packArchive({
  'a/one.txt': Buffer.from('one'),
  'b/two.bin': Buffer.from([1, 2, 3])
});
const files = crypto.unpackArchive(packed);
assert.strictEqual(files['a/one.txt'].toString('utf8'), 'one');
assert.deepStrictEqual(Array.from(files['b/two.bin']), [1, 2, 3]);

const saltB = Buffer.alloc(crypto.SALT_LEN, 9);
const meta = crypto.publicMeta({ devotion: salt, hotels: saltB });
assert.strictEqual(meta.v, 2);
assert.strictEqual(meta.tabs.devotion.kdf, 'PBKDF2');
assert.strictEqual(crypto.saltFromMeta(meta.tabs.devotion).equals(salt), true);
assert.strictEqual(crypto.saltFromMeta(meta.tabs.hotels).equals(saltB), true);

console.log('gate-crypto: ok');
