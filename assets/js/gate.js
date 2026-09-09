(function ($) {
	'use strict';

	var MAGIC = [0x47, 0x41, 0x54, 0x45, 0x31]; // GATE1
	var ARCHIVE_MAGIC = [0x47, 0x41, 0x52, 0x31]; // GAR1
	var IV_LEN = 12;
	var TAG_LEN = 16;
	var KEY_LEN = 256;
	var CANARY = 'ok';

	var meta = null;
	var keys = {};
	var unlocking = {};
	var failCount = {};

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

	function tabParams(params, gateId) {
		if (!params || !params.tabs || !params.tabs[gateId]) {
			throw new Error('unknown gate');
		}
		return params.tabs[gateId];
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

	function verifyKey(gateId, tab, key) {
		var canary = 'data/' + (tab.ok || (gateId + '-ok.enc'));
		return fetchAndDecrypt(canary, key).then(function (plain) {
			if (new TextDecoder().decode(plain) !== CANARY) {
				throw new Error('bad canary');
			}
			return key;
		});
	}

	function unlockWithPassword(gateId, password) {
		if (keys[gateId]) return Promise.resolve(keys[gateId]);
		if (!hasWebCrypto()) {
			return Promise.reject(new Error('browser'));
		}
		if (unlocking[gateId]) return unlocking[gateId];
		unlocking[gateId] = loadMeta()
			.then(function (params) {
				var tab = tabParams(params, gateId);
				return deriveKey(password, tab).then(function (key) {
					return verifyKey(gateId, tab, key);
				});
			})
			.then(function (key) {
				keys[gateId] = key;
				failCount[gateId] = 0;
				return key;
			})
			.catch(function (err) {
				failCount[gateId] = (failCount[gateId] || 0) + 1;
				throw err;
			})
			.finally(function () {
				unlocking[gateId] = null;
			});
		return unlocking[gateId];
	}

	function decodeJson(buffer) {
		return JSON.parse(new TextDecoder().decode(buffer));
	}

	function delayForFailures(gateId) {
		var n = failCount[gateId] || 0;
		if (n < 4) return Promise.resolve();
		var wait = Math.min(8000, 400 * Math.pow(2, n - 4));
		return new Promise(function (resolve) { setTimeout(resolve, wait); });
	}

	function formHtml(gateId) {
		var inputId = 'site-gate-password-' + gateId;
		return (
			'<div class="site-gate-card">' +
				'<p class="site-gate-copy">contact Morris for password!</p>' +
				'<form class="site-gate-form" autocomplete="off">' +
					'<label class="site-gate-sr" for="' + inputId + '">Password</label>' +
					'<input id="' + inputId + '" class="site-gate-input" type="password" name="gate-password" autocomplete="off" spellcheck="false" required>' +
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

	function mountForm($panel, gateId, onUnlock) {
		var $host = $panel.find('.site-gate');
		if (!$host.length) {
			onUnlock();
			return;
		}
		if (keys[gateId]) {
			reveal($panel);
			onUnlock();
			return;
		}
		if ($host.find('.site-gate-form').length) return;
		$host.removeAttr('hidden').html(formHtml(gateId));
		$panel.find('.site-gate-content').attr('hidden', 'hidden');

		$host.find('.site-gate-form').on('submit', function (e) {
			e.preventDefault();
			var $btn = $host.find('.site-gate-submit');
			var password = String($host.find('.site-gate-input').val() || '');
			if (!password) return;
			$btn.prop('disabled', true);
			setError($host, '');
			delayForFailures(gateId)
				.then(function () {
					return unlockWithPassword(gateId, password);
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

	function requireUnlock(panelSelector, gateId, onUnlock) {
		var $panel = $(panelSelector);
		if (keys[gateId]) {
			reveal($panel);
			onUnlock();
			return;
		}
		mountForm($panel, gateId, onUnlock);
	}

	function keyOrReject(gateId) {
		if (!keys[gateId]) return Promise.reject(new Error('locked'));
		return Promise.resolve(keys[gateId]);
	}

	window.SiteGate = {
		isUnlocked: function (gateId) {
			return !!keys[gateId];
		},
		require: requireUnlock,
		decryptJson: function (gateId, url) {
			return keyOrReject(gateId).then(function (key) {
				return fetchAndDecrypt(url, key).then(decodeJson);
			});
		},
		decryptArchive: function (gateId, url) {
			return keyOrReject(gateId).then(function (key) {
				return fetchAndDecrypt(url, key).then(unpackArchive);
			});
		}
	};

}(jQuery));
