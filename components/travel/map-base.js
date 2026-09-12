(function ($) {
	'use strict';

	// Shared Leaflet setup for Journey + Hotel Collection:
	// one world (no wrap copies), grayscale tiles. Country fill is TravelCountryLayer.
	var WORLD_SW = [-85, -180];
	var WORLD_NE = [85, 180];
	var VISITED_FILL = '#9ec9e8';
	var VISITED_STROKE = '#6fa8c9';
	var countriesCache = null;
	var countriesRequest = null;

	var ALIASES = {
		'united states': ['united states of america', 'usa'],
		'united states of america': ['united states'],
		'czech republic': ['czechia'],
		'czechia': ['czech republic'],
		'south korea': ['republic of korea'],
		'republic of korea': ['south korea'],
		'russia': ['russian federation'],
		'russian federation': ['russia'],
		'united kingdom': ['great britain', 'uk']
	};

	function worldBounds() {
		return L.latLngBounds(WORLD_SW, WORLD_NE);
	}

	function normalizeName(name) {
		return String(name || '')
			.toLowerCase()
			.replace(/&/g, ' and ')
			.replace(/[^a-z0-9]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function nameKeys(name) {
		var key = normalizeName(name);
		var keys = [];
		if (!key) return keys;
		keys.push(key);
		(ALIASES[key] || []).forEach(function (alias) {
			var a = normalizeName(alias);
			if (a) keys.push(a);
		});
		return keys;
	}

	function visitedKeySet(names) {
		var set = {};
		(names || []).forEach(function (name) {
			nameKeys(name).forEach(function (k) {
				set[k] = true;
			});
		});
		return set;
	}

	function featureVisited(feature, keySet) {
		var props = (feature && feature.properties) || {};
		var labels = [props.ADMIN, props.NAME, props.NAME_LONG];
		var i;
		var j;
		var keys;
		for (i = 0; i < labels.length; i++) {
			keys = nameKeys(labels[i]);
			for (j = 0; j < keys.length; j++) {
				if (keySet[keys[j]]) return true;
			}
		}
		return false;
	}

	function loadCountries() {
		if (countriesCache) {
			return $.Deferred().resolve(countriesCache).promise();
		}
		if (countriesRequest) return countriesRequest;
		countriesRequest = $.getJSON('data/countries.geojson').done(function (geo) {
			countriesCache = geo;
		}).always(function () {
			countriesRequest = null;
		});
		return countriesRequest;
	}

	function lockToSingleWorld(map) {
		var width = map.getSize().x;
		var minZ;
		if (!width) return;
		minZ = Math.log(width / 256) / Math.LN2;
		if (!isFinite(minZ)) return;
		minZ = Math.max(0, minZ);
		map.setMinZoom(minZ);
		if (map.getZoom() < minZ) {
			map.setZoom(minZ);
		}
	}

	function createMap(elementId, extraOptions) {
		var bounds = worldBounds();
		var opts = $.extend({
			scrollWheelZoom: true,
			zoomControl: true,
			worldCopyJump: false,
			maxBounds: bounds,
			maxBoundsViscosity: 1,
			minZoom: 1
		}, extraOptions || {});

		var map = L.map(elementId, opts);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 19,
			noWrap: true,
			bounds: bounds
		}).addTo(map);

		map.whenReady(function () {
			lockToSingleWorld(map);
		});
		map.on('resize', function () {
			lockToSingleWorld(map);
		});

		return map;
	}

	function countriesFromTravel(data) {
		var names = {};
		function add(item) {
			if (item && item.country) names[item.country] = true;
		}
		((data && data.homeBases) || []).forEach(add);
		((data && data.cities) || []).forEach(add);
		return Object.keys(names);
	}

	function addVisitedCountries(map, countryNames) {
		var keySet;
		if (!map || typeof L === 'undefined') return;
		keySet = visitedKeySet(countryNames);
		if (!Object.keys(keySet).length) return;

		if (map._visitedCountriesLayer) {
			map.removeLayer(map._visitedCountriesLayer);
			map._visitedCountriesLayer = null;
		}

		if (!map.getPane('visited-countries')) {
			map.createPane('visited-countries');
			map.getPane('visited-countries').style.zIndex = 250;
		}

		loadCountries().done(function (geo) {
			map._visitedCountriesLayer = L.geoJSON(geo, {
				pane: 'visited-countries',
				interactive: false,
				filter: function (feature) {
					return featureVisited(feature, keySet);
				},
				style: {
					fillColor: VISITED_FILL,
					fillOpacity: 0.55,
					color: VISITED_STROKE,
					weight: 0.8,
					opacity: 0.85
				}
			}).addTo(map);
		});
	}

	window.TravelMaps = {
		createMap: createMap,
		addVisitedCountries: addVisitedCountries,
		countriesFromTravel: countriesFromTravel
	};
}(jQuery));
