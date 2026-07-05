(function ($) {
	'use strict';

	var map = null;
	var walkLayer = null;
	var nycData = null;
	var initialized = false;
	var GRID_M = 20;

	var MAP_FLY_OPTS = { duration: 0.55 };
	var MAP_PAD = [28, 28];

	var BOROUGH_BOUNDS = {
		manhattan: [[40.70, -74.02], [40.88, -73.93]],
		brooklyn: [[40.57, -74.04], [40.74, -73.83]],
		queens: [[40.54, -73.96], [40.80, -73.70]],
		city: [[40.4774, -74.2591], [40.9176, -73.7004]]
	};

	function formatStat(n) {
		return Number(n).toLocaleString('en-US');
	}

	function renderStats(meta) {
		if (!meta) return;
		var km = meta.totalKm;
		var cells = meta.uniqueCells;
		var since = meta.since || '2022-08-02';
		var sinceDate = new Date(since + 'T00:00:00');
		var sinceLabel = sinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

		$('#nyc-stats').html(
			formatStat(Math.round(km)) + ' km walked · ' +
			formatStat(cells) + ' blocks · since ' + sinceLabel
		);
	}

	function dequantizeCell(x, y, refLat) {
		var latStep = GRID_M / 111000;
		var lngStep = GRID_M / (111000 * Math.cos(refLat * Math.PI / 180));
		return [x * latStep, y * lngStep];
	}

	function lineStyleForCount(count) {
		var opacity = Math.min(0.55, 0.03 + Math.log(count + 1) * 0.06);
		var weight = count > 8 ? 2.5 : count > 3 ? 2 : 1.5;
		return {
			color: '#FFC72C',
			weight: weight,
			opacity: opacity,
			lineCap: 'round',
			lineJoin: 'round'
		};
	}

	function initMap() {
		if (map || !$('#nyc-map').length) return;

		map = L.map('nyc-map', {
			preferCanvas: true,
			zoomControl: true,
			scrollWheelZoom: true
		});

		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
			subdomains: 'abcd',
			maxZoom: 19
		}).addTo(map);

		var bounds = L.latLngBounds(
			[BOROUGH_BOUNDS.city[0][0], BOROUGH_BOUNDS.city[0][1]],
			[BOROUGH_BOUNDS.city[1][0], BOROUGH_BOUNDS.city[1][1]]
		);
		map.fitBounds(bounds, { padding: MAP_PAD });

		if (nycData && nycData.features) {
			drawWalks();
		}
	}

	function drawWalks() {
		if (!map || !nycData) return;

		if (walkLayer) {
			map.removeLayer(walkLayer);
			walkLayer = null;
		}

		walkLayer = L.layerGroup().addTo(map);
		var segments = nycData.segments || [];
		var bounds = L.latLngBounds();
		var refLat = 40.75;

		segments.forEach(function (seg) {
			var count = seg[4] || 1;
			var c1 = dequantizeCell(seg[0], seg[1], refLat);
			var c2 = dequantizeCell(seg[2], seg[3], refLat);
			var latlngs = [L.latLng(c1[0], c1[1]), L.latLng(c2[0], c2[1])];
			L.polyline(latlngs, lineStyleForCount(count)).addTo(walkLayer);
			bounds.extend(latlngs[0]);
			bounds.extend(latlngs[1]);
		});

		if (bounds.isValid()) {
			map.fitBounds(bounds, { padding: MAP_PAD });
		}
	}

	function flyToBorough(key) {
		if (!map) return;
		var b = BOROUGH_BOUNDS[key] || BOROUGH_BOUNDS.city;
		var bounds = L.latLngBounds(
			L.latLng(b[0][0], b[0][1]),
			L.latLng(b[1][0], b[1][1])
		);
		map.flyToBounds(bounds, $.extend({}, MAP_FLY_OPTS, {
			padding: MAP_PAD,
			maxZoom: key === 'city' ? 11 : 13
		}));
	}

	function bindStoryCards() {
		$('#nyc-stories .journal-card').each(function () {
			var $card = $(this);
			var borough = $card.data('borough');
			if (!borough) return;

			$card.on('mouseenter', function () {
				$card.addClass('nyc-card-highlight');
				flyToBorough(borough);
			});
			$card.on('mouseleave', function () {
				$card.removeClass('nyc-card-highlight');
			});
		});
	}

	function loadNyc() {
		$.getJSON('data/nyc-walks.json').done(function (data) {
			nycData = data;
			if (data.meta && data.meta.gridM) {
				GRID_M = data.meta.gridM;
			}
			renderStats(data.meta);
			if (map) {
				drawWalks();
			}
		}).fail(function () {
			$('#nyc-stats').html('Walk data unavailable.');
		});
	}

	function ensureInit() {
		if (initialized) {
			if (map) map.invalidateSize();
			return;
		}
		initialized = true;
		initMap();
		loadNyc();
		bindStoryCards();
	}

	$(document).on('click', '.section-toggle[data-section="nyc"]', function () {
		setTimeout(function () {
			ensureInit();
		}, 1300);
	});

	$(window).on('load', function () {
		if ($('#nyc').hasClass('active')) {
			ensureInit();
		}
	});

}(jQuery));