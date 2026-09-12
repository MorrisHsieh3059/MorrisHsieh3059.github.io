(function (window, $) {
	'use strict';

	var FILL = '#3D5AFE';
	var STROKE = '#303F9F';
	var cache = null;
	var loading = null;

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

	function addTo(map, countryNames) {
		if (!map || typeof L === 'undefined') return;

		ensurePane(map);
		if (map._visitedCountryLayer) {
			map.removeLayer(map._visitedCountryLayer);
			map._visitedCountryLayer = null;
		}

		var visited = nameSet(countryNames);
		if (!Object.keys(visited).length) return;

		loadCountries().done(function (data) {
			if (map._visitedCountryLayer) {
				map.removeLayer(map._visitedCountryLayer);
			}
			map._visitedCountryLayer = L.geoJSON(data, {
				pane: 'visitedCountries',
				renderer: L.svg({ padding: 0.5, pane: 'visitedCountries' }),
				smoothFactor: 0,
				interactive: false,
				filter: function (feature) {
					return feature.properties && visited[feature.properties.name];
				},
				style: {
					stroke: true,
					color: STROKE,
					weight: 1.25,
					opacity: 0.95,
					fillColor: FILL,
					fillOpacity: 0.4,
					lineJoin: 'round',
					lineCap: 'round'
				}
			}).addTo(map);
		});
	}

	window.TravelCountryLayer = {
		addTo: addTo
	};

}(window, jQuery));
