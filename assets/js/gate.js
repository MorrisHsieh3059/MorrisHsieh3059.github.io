(function ($) {
	'use strict';

	var MAGIC = [0x47, 0x41, 0x54, 0x45, 0x31]; // GATE1
	var ARCHIVE_MAGIC = [0x47, 0x41, 0x52, 0x31]; // GAR1
	var IV_LEN = 12;
	var TAG_LEN = 16;
	var KEY_LEN = 256;
	var CANARY = 'ok';

	var meta = null;
	var cryptoKey = null;
	var unlocking = null;
	var failCount = 0;

	function bytesEqual(view, expected) {
		if (view.length !== expected.length) return false;
		for (var i = 0; i < expected.length; i++) {
			if (view[i] !== expected[i]) return false;
		}
		return true;
	}

	function hasWebCrypto() {
		return !!(window.crypto && window.crypto.subtle);
	}

	function loadMeta() {
		if (meta) return Promise.resolve(meta);
		return fetch('data/gate.json', { credentials: 'same-origin', cache: 'no-store' })
			.then(function (res) {
				if (!res.ok) throw new Error('gate metadata missing');
				return res.json();
			})
			.then(function (json) {
				meta = json;
				return meta;
			});
	}

	function deriveKey(password, params) {
		var enc = new TextEncoder();
		var salt = Uint8Array.from(atob(params.salt), function (c) { return c.charCodeAt(0); });
		return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
			.then(function (base) {
				return crypto.subtle.deriveKey(
					{
						name: 'PBKDF2',
						salt: salt,
						iterations: params.iter,
						hash: params.hash || 'SHA-256'
					},
					base,
					{ name: 'AES-GCM', length: KEY_LEN },
					false,
					['decrypt']
				);
			});
	}

	function decryptEnvelope(buffer, key) {
		var bytes = new Uint8Array(buffer);
		if (bytes.length < MAGIC.length + IV_LEN + TAG_LEN || !bytesEqual(bytes.subarray(0, MAGIC.length), MAGIC)) {
			return Promise.reject(new Error('not a gated file'));
		}
		var iv = bytes.subarray(MAGIC.length, MAGIC.length + IV_LEN);
		var data = bytes.subarray(MAGIC.length + IV_LEN);
		return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
	}

	function fetchAndDecrypt(url, key) {
		return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
			.then(function (res) {
				if (!res.ok) throw new Error('gated file missing');
				return res.arrayBuffer();
			})
			.then(function (buf) {
				return decryptEnvelope(buf, key);
			});
	}

	function readU16(view, offset) {
		return (view[offset] << 8) | view[offset + 1];
	}

	function readU32(view, offset) {
		return ((view[offset] << 24) | (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3]) >>> 0;
	}

	function unpackArchive(buffer) {
		var bytes = new Uint8Array(buffer);
		if (!bytesEqual(bytes.subarray(0, ARCHIVE_MAGIC.length), ARCHIVE_MAGIC)) {
			throw new Error('not a gated archive');
		}
		var offset = ARCHIVE_MAGIC.length;
		var count = readU32(bytes, offset);
		offset += 4;
		var files = {};
		var decoder = new TextDecoder();
		for (var i = 0; i < count; i++) {
			var nameLen = readU16(bytes, offset);
			var dataLen = readU32(bytes, offset + 2);
			offset += 6;
			var name = decoder.decode(bytes.subarray(offset, offset + nameLen));
			offset += nameLen;
			files[name] = bytes.slice(offset, offset + dataLen);
			offset += dataLen;
		}
		return files;
	}

	function verifyKey(key) {
		return fetchAndDecrypt('data/gate-ok.enc', key).then(function (plain) {
			if (new TextDecoder().decode(plain) !== CANARY) {
				throw new Error('bad canary');
			}
			return key;
		});
	}

	function unlockWithPassword(password) {
		if (cryptoKey) return Promise.resolve(cryptoKey);
		if (!hasWebCrypto()) {
			return Promise.reject(new Error('browser'));
		}
		if (unlocking) return unlocking;
		unlocking = loadMeta()
			.then(function (params) {
				return deriveKey(password, params);
			})
			.then(verifyKey)
			.then(function (key) {
				cryptoKey = key;
				failCount = 0;
				return key;
			})
			.catch(function (err) {
				failCount += 1;
				throw err;
			})
			.finally(function () {
				unlocking = null;
			});
		return unlocking;
	}

	function decodeJson(buffer) {
		return JSON.parse(new TextDecoder().decode(buffer));
	}

	function delayForFailures() {
		if (failCount < 4) return Promise.resolve();
		var wait = Math.min(8000, 400 * Math.pow(2, failCount - 4));
		return new Promise(function (resolve) { setTimeout(resolve, wait); });
	}

	function formHtml(title) {
		return (
			'<div class="site-gate-card">' +
				'<p class="site-gate-kicker">Private</p>' +
				'<h3 class="site-gate-title">' + title + '</h3>' +
				'<p class="site-gate-copy">This tab is locked. Enter the password to open it.</p>' +
				'<form class="site-gate-form" autocomplete="off">' +
					'<label class="site-gate-sr" for="site-gate-password">Password</label>' +
					'<input id="site-gate-password" class="site-gate-input" type="password" name="gate-password" autocomplete="off" spellcheck="false" required>' +
					'<button type="submit" class="site-gate-submit">Unlock</button>' +
				'</form>' +
				'<p class="site-gate-error" hidden></p>' +
			'</div>'
		);
	}

	function setError($root, message) {
		var $err = $root.find('.site-gate-error');
		if (!message) {
			$err.attr('hidden', 'hidden').text('');
			return;
		}
		$err.removeAttr('hidden').text(message);
	}

	function reveal($panel) {
		$panel.find('.site-gate').attr('hidden', 'hidden');
		$panel.find('.site-gate-content').removeAttr('hidden');
	}

	function mountForm($panel, title, onUnlock) {
		var $host = $panel.find('.site-gate');
		if (!$host.length) {
			onUnlock();
			return;
		}
		if (cryptoKey) {
			reveal($panel);
			onUnlock();
			return;
		}
		if ($host.find('.site-gate-form').length) return;
		$host.removeAttr('hidden').html(formHtml(title));
		$panel.find('.site-gate-content').attr('hidden', 'hidden');

		$host.find('.site-gate-form').on('submit', function (e) {
			e.preventDefault();
			var $btn = $host.find('.site-gate-submit');
			var password = String($host.find('.site-gate-input').val() || '');
			if (!password) return;
			$btn.prop('disabled', true);
			setError($host, '');
			delayForFailures()
				.then(function () {
					return unlockWithPassword(password);
				})
				.then(function () {
					$host.find('.site-gate-input').val('');
					reveal($panel);
					onUnlock();
				})
				.catch(function (err) {
					var message = err && err.message === 'browser'
						? 'This tab needs a current browser to unlock.'
						: 'That password does not unlock this tab.';
					setError($host, message);
					$host.find('.site-gate-input').trigger('focus').trigger('select');
				})
				.then(function () {
					$btn.prop('disabled', false);
				});
		});

		setTimeout(function () {
			$host.find('.site-gate-input').trigger('focus');
		}, 0);
	}

	function requireUnlock(panelSelector, title, onUnlock) {
		var $panel = $(panelSelector);
		if (cryptoKey) {
			reveal($panel);
			onUnlock();
			return;
		}
		mountForm($panel, title, onUnlock);
	}

	window.SiteGate = {
		isUnlocked: function () {
			return !!cryptoKey;
		},
		require: requireUnlock,
		decryptJson: function (url) {
			if (!cryptoKey) return Promise.reject(new Error('locked'));
			return fetchAndDecrypt(url, cryptoKey).then(decodeJson);
		},
		decryptArchive: function (url) {
			if (!cryptoKey) return Promise.reject(new Error('locked'));
			return fetchAndDecrypt(url, cryptoKey).then(unpackArchive);
		}
	};

}(jQuery));
