(function (window, $) {
	'use strict';

	var FILL = '#3D5AFE';
	var TILEJSON = 'https://tiles.openfreemap.org/planet';
	var WATER_MAX_Z = 14;
	var WATER_MIN_Z = 6;

	var cache = null;
	var loading = null;
	var tileUrl = null;
	var tileUrlLoading = null;
	var waterCache = {};

	function loadCountries() {
		if (cache) return $.Deferred().resolve(cache).promise();
		if (loading) return loading;
		loading = $.getJSON('data/countries.geojson').done(function (data) {
			cache = data;
		}).fail(function () {
			loading = null;
		});
		return loading;
	}

	function loadTileUrl() {
		if (tileUrl) return $.Deferred().resolve(tileUrl).promise();
		if (tileUrlLoading) return tileUrlLoading;
		tileUrlLoading = $.getJSON(TILEJSON).then(function (json) {
			tileUrl = json && json.tiles && json.tiles[0];
			if (!tileUrl) throw new Error('no vector tiles');
			return tileUrl;
		}).fail(function () {
			tileUrlLoading = null;
		});
		return tileUrlLoading;
	}

	function nameSet(names) {
		var set = {};
		(names || []).forEach(function (name) {
			if (name) set[name] = true;
		});
		return set;
	}

	function ensurePane(map) {
		if (!map.getPane('visitedCountries')) {
			map.createPane('visitedCountries');
		}
		var pane = map.getPane('visitedCountries');
		pane.style.zIndex = 350;
		pane.style.pointerEvents = 'none';
		return pane;
	}

	function readVarint(u8, cur) {
		var n = 0, shift = 0, b;
		do {
			b = u8[cur.o++];
			n += (b & 0x7f) * Math.pow(2, shift);
			shift += 7;
		} while (b & 0x80);
		return n;
	}

	function zigzag(n) {
		return (n >>> 1) ^ -(n & 1);
	}

	function parseWater(buffer) {
		var u8 = new Uint8Array(buffer);
		var cur = { o: 0 };
		var rings = [];
		while (cur.o < u8.length) {
			var tag = readVarint(u8, cur);
			var field = tag >>> 3, type = tag & 7;
			if (field === 3 && type === 2) {
				var len = readVarint(u8, cur);
				parseLayer(u8, cur.o, cur.o + len, rings);
				cur.o += len;
			} else if (type === 0) {
				readVarint(u8, cur);
			} else if (type === 1) {
				cur.o += 8;
			} else if (type === 2) {
				cur.o += readVarint(u8, cur);
			} else if (type === 5) {
				cur.o += 4;
			} else {
				break;
			}
		}
		return rings;
	}

	function parseLayer(u8, start, end, rings) {
		var cur = { o: start };
		var name = '';
		var features = [];
		var extent = 4096;
		while (cur.o < end) {
			var tag = readVarint(u8, cur);
			var field = tag >>> 3, type = tag & 7;
			if (type === 0) {
				var v = readVarint(u8, cur);
				if (field === 5) extent = v;
			} else if (type === 2) {
				var len = readVarint(u8, cur);
				var sliceStart = cur.o;
				cur.o += len;
				if (field === 1) {
					name = utf8(u8, sliceStart, len);
				} else if (field === 2) {
					features.push([sliceStart, len]);
				}
			} else if (type === 1) {
				cur.o += 8;
			} else if (type === 5) {
				cur.o += 4;
			} else {
				break;
			}
		}
		if (name !== 'water') return;
		features.forEach(function (pair) {
			parseFeature(u8, pair[0], pair[0] + pair[1], extent, rings);
		});
	}

	function utf8(u8, start, len) {
		var s = '';
		for (var i = 0; i < len; i++) s += String.fromCharCode(u8[start + i]);
		try {
			return decodeURIComponent(escape(s));
		} catch (e) {
			return s;
		}
	}

	function parseFeature(u8, start, end, extent, rings) {
		var cur = { o: start };
		var geomType = 0;
		var geom = null;
		while (cur.o < end) {
			var tag = readVarint(u8, cur);
			var field = tag >>> 3, type = tag & 7;
			if (type === 0) {
				var v = readVarint(u8, cur);
				if (field === 3) geomType = v;
			} else if (type === 2) {
				var len = readVarint(u8, cur);
				if (field === 4) {
					geom = packedVarints(u8, cur.o, cur.o + len);
				}
				cur.o += len;
			} else if (type === 1) {
				cur.o += 8;
			} else if (type === 5) {
				cur.o += 4;
			} else {
				break;
			}
		}
		if (geomType !== 3 || !geom) return;
		decodeParticleRings(geom, extent, rings);
	}

	function packedVarints(u8, start, end) {
		var cur = { o: start };
		var out = [];
		while (cur.o < end) out.push(readVarint(u8, cur));
		return out;
	}

	function decodeParticleRings(params, extent, rings) {
		var i = 0, x = 0, y = 0, ring = [];
		while (i < params.length) {
			var cmdInt = params[i++];
			var cmd = cmdInt & 7;
			var count = cmdInt >>> 3;
			if (cmd === 1 || cmd === 2) {
				for (var c = 0; c < count; c++) {
					x += zigzag(params[i++]);
					y += zigzag(params[i++]);
					if (cmd === 1) {
						if (ring.length) rings.push({ extent: extent, ring: ring });
						ring = [];
					}
					ring.push([x, y]);
				}
			} else if (cmd === 7) {
				if (ring.length) {
					rings.push({ extent: extent, ring: ring });
					ring = [];
				}
			} else {
				break;
			}
		}
		if (ring.length) rings.push({ extent: extent, ring: ring });
	}

	function fetchWater(z, x, y) {
		var key = z + '/' + x + '/' + y;
		if (waterCache[key]) return waterCache[key];
		waterCache[key] = new Promise(function (resolve) {
			loadTileUrl().done(function (template) {
				var url = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
				fetch(url).then(function (res) {
					if (!res.ok) return [];
					return res.arrayBuffer();
				}).then(function (buf) {
					if (!buf || !buf.byteLength) return [];
					return parseWater(buf);
				}).then(resolve, function () {
					delete waterCache[key];
					resolve([]);
				});
			}).fail(function () {
				delete waterCache[key];
				resolve([]);
			});
		});
		return waterCache[key];
	}

	function currentWorld(map, zoom) {
		var wrap = Math.pow(2, zoom);
		var worldPx = 256 * wrap;
		var centerX = map.project(map.getCenter(), zoom).x;
		return Math.floor(centerX / worldPx);
	}

	function visibleTiles(map, zoom) {
		var wrap = Math.pow(2, zoom);
		var worldIndex = currentWorld(map, zoom);
		var origin = worldIndex * wrap;
		var nw = map.project(map.getBounds().getNorthWest(), zoom);
		var se = map.project(map.getBounds().getSouthEast(), zoom);
		var minX = Math.max(Math.floor(nw.x / 256), origin);
		var maxX = Math.min(Math.floor(se.x / 256), origin + wrap - 1);
		var minY = Math.max(Math.floor(nw.y / 256), 0);
		var maxY = Math.min(Math.floor(se.y / 256), wrap - 1);
		var tiles = [];
		var seen = {};
		var x, y, tx, key;
		for (x = minX; x <= maxX; x++) {
			tx = x - origin;
			for (y = minY; y <= maxY; y++) {
				key = tx + '/' + y;
				if (seen[key]) continue;
				seen[key] = true;
				tiles.push({ x: tx, y: y, worldX: x });
			}
		}
		return tiles;
	}

	function withLayerCanvas(renderer, fn) {
		var ctx = renderer._ctx;
		var bounds = renderer._bounds;
		if (!ctx || !bounds) return;
		var retina = L.Browser.retina ? 2 : 1;
		ctx.save();
		ctx.setTransform(retina, 0, 0, retina, -bounds.min.x * retina, -bounds.min.y * retina);
		fn(ctx);
		ctx.restore();
	}

	function clipToCurrentWorld(renderer) {
		var map = renderer._map;
		if (!map) return;
		var zoom = map.getZoom();
		var worldPx = 256 * Math.pow(2, zoom);
		var worldIndex = currentWorld(map, zoom);
		var minAbs = worldIndex * worldPx;
		var top = map.latLngToLayerPoint(map.unproject(L.point(minAbs, 0), zoom));
		var bot = map.latLngToLayerPoint(map.unproject(L.point(minAbs + worldPx, worldPx), zoom));
		withLayerCanvas(renderer, function (ctx) {
			ctx.globalCompositeOperation = 'destination-in';
			ctx.beginPath();
			ctx.rect(top.x, top.y, bot.x - top.x, bot.y - top.y);
			ctx.fill();
		});
	}

	function punchRenderer(renderer, ringsByTile) {
		var map = renderer._map;
		if (!map) return;
		var zoom = Math.floor(map.getZoom());
		withLayerCanvas(renderer, function (ctx) {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.beginPath();
			Object.keys(ringsByTile).forEach(function (key) {
				var parts = key.split('/');
				var worldX = Number(parts[1]);
				var worldY = Number(parts[2]);
				ringsByTile[key].forEach(function (item) {
					var ring = item.ring;
					if (!ring.length) return;
					var scale = 256 / item.extent;
					for (var i = 0; i < ring.length; i++) {
						var world = L.point(worldX * 256 + ring[i][0] * scale, worldY * 256 + ring[i][1] * scale);
						var pt = map.latLngToLayerPoint(map.unproject(world, zoom));
						if (i === 0) ctx.moveTo(pt.x, pt.y);
						else ctx.lineTo(pt.x, pt.y);
					}
					ctx.closePath();
				});
			});
			ctx.fill('evenodd');
		});
	}

	function attachWaterClip(renderer) {
		var orig = renderer._updatePaths;
		var gen = 0;
		renderer._updatePaths = function () {
			orig.call(this);
			clipToCurrentWorld(this);
			var map = this._map;
			if (!map || map.getZoom() < WATER_MIN_Z) return;
			var zoom = Math.min(Math.floor(map.getZoom()), WATER_MAX_Z);
			var tiles = visibleTiles(map, zoom);
			var token = ++gen;
			var self = this;
			var pending = tiles.map(function (tile) {
				return fetchWater(zoom, tile.x, tile.y).then(function (rings) {
					return { key: zoom + '/' + tile.worldX + '/' + tile.y, rings: rings };
				});
			});
			Promise.all(pending).then(function (items) {
				if (token !== gen || !self._map) return;
				var ringsByTile = {};
				items.forEach(function (item) {
					if (item && item.rings && item.rings.length) {
						ringsByTile[item.key] = item.rings;
					}
				});
				punchRenderer(self, ringsByTile);
			});
		};
	}

	function addTo(map, countryNames) {
		if (!map || typeof L === 'undefined') return;

		window.TravelCountryLayer._map = map;
		ensurePane(map);
		if (map._visitedCountryLayer) {
			map.removeLayer(map._visitedCountryLayer);
			map._visitedCountryLayer = null;
		}

		var visited = nameSet(countryNames);
		if (!Object.keys(visited).length) return;

		loadTileUrl();
		loadCountries().done(function (data) {
			if (map._visitedCountryLayer) {
				map.removeLayer(map._visitedCountryLayer);
			}
			var renderer = L.canvas({ padding: 0.1, pane: 'visitedCountries' });
			attachWaterClip(renderer);
			map._visitedCountryLayer = L.geoJSON(data, {
				pane: 'visitedCountries',
				renderer: renderer,
				interactive: false,
				filter: function (feature) {
					return feature.properties && visited[feature.properties.name];
				},
				style: {
					stroke: false,
					fill: true,
					fillColor: FILL,
					fillOpacity: 0.4,
					smoothFactor: 0,
					noClip: true
				}
			}).addTo(map);
		});
	}

	window.TravelCountryLayer = {
		addTo: addTo
	};

}(window, jQuery));
