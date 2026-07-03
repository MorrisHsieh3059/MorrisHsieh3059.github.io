(function ($) {
	'use strict';

	var map = null;
	var markers = {};
	var travelData = null;
	var $hoverCard = null;
	var activeRouteLine = null;
	var defaultBounds = null;
	var defaultCenter = null;
	var defaultZoom = null;
	var activeTripId = null;

	var MAP_FLY_OPTS = { duration: 0.55 };

	function formatDateRange(start, end) {
		var s = new Date(start + 'T00:00:00');
		var e = new Date(end + 'T00:00:00');
		var opts = { month: 'short', day: 'numeric', year: 'numeric' };
		if (start === end) {
			return s.toLocaleDateString('en-US', opts);
		}
		return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
			' – ' + e.toLocaleDateString('en-US', opts);
	}

	function showHoverCard(html, isHome) {
		if (!$hoverCard) return;
		$hoverCard.html(html);
		$hoverCard.toggleClass('home-card', !!isHome);
		$hoverCard.addClass('visible');
	}

	function hideHoverCard() {
		if ($hoverCard) $hoverCard.removeClass('visible');
	}

	function cityCardHtml(city, trips) {
		var tripList = (trips || []).map(function (t) {
			return '<li>' + t.title + '</li>';
		}).join('');
		return '<h5>' + city.city + (city.country ? ', ' + city.country : '') + '</h5>' +
			'<div class="meta"><i class="fas fa-calendar-alt"></i> ' +
			city.firstVisit + ' – ' + city.lastVisit + '</div>' +
			(tripList ? '<p style="margin-top:0.5rem;">Part of:</p><ul style="margin:0;padding-left:1.1rem;font-size:0.82rem;">' + tripList + '</ul>' : '');
	}

	function maxCityVisits() {
		var max = 1;
		(travelData.cities || []).forEach(function (city) {
			if (city.visits > max) max = city.visits;
		});
		return max;
	}

	function visitHeatStyle(visits, maxVisits) {
		var t = maxVisits <= 1 ? 0.35 : (visits - 1) / (maxVisits - 1);
		var core = Math.round(10 + t * 14);
		var glow = Math.round(core + 10 + t * 18);
		var r = Math.round(255 - t * 64);
		var g = Math.round(224 - t * 170);
		var b = Math.round(130 - t * 118);
		var color = 'rgb(' + r + ',' + g + ',' + b + ')';
		var opacity = (0.3 + t * 0.55).toFixed(2);
		return {
			core: core,
			glow: glow,
			color: color,
			opacity: opacity,
			outer: glow + 4
		};
	}

	function homeCardHtml(home) {
		var range = '';
		if (home.from && home.to) range = home.from + ' – ' + home.to;
		else if (home.to) range = 'until ' + home.to;
		else if (home.from) range = 'since ' + home.from;
		return '<h5>' + home.city + ' 🏠</h5>' +
			'<div class="meta">' + home.label + '</div>' +
			(range ? '<p>' + range + '</p>' : '');
	}

	function tripCardHtml(trip) {
		var route = formatRouteCities(trip);
		return '<h5>' + trip.title + '</h5>' +
			'<div class="meta"><i class="fas fa-plane"></i> ' +
			formatDateRange(trip.startDate, trip.endDate) + '</div>' +
			'<p>' + trip.description + '</p>' +
			(route ? '<p style="margin-top:0.5rem;font-size:0.82rem;"><strong>Route:</strong> ' + route + '</p>' : '');
	}

	function formatRouteCities(trip) {
		var cities = trip.cities || [];
		return cities.join(' → ');
	}

	function renderTripCards() {
		var $panel = $('#travel-cards');
		$panel.empty();

		if (!travelData.trips.length) {
			$panel.append(
				'<div class="travel-notice">No trips parsed yet. Re-export Timeline from Google Maps ' +
				'(Your Timeline → Settings → Export) and run <code>npm run build-travel</code>.</div>'
			);
			return;
		}

		travelData.trips.forEach(function (trip) {
			var nCities = (trip.cities || []).length;
			var nCountries = (trip.countries || []).length;
			var $card = $('<div class="trip-card" data-trip-id="' + trip.id + '"></div>');
			$card.append('<h4>' + trip.title + '</h4>');
			$card.append(
				'<div class="meta"><i class="fas fa-plane"></i> ' +
				formatDateRange(trip.startDate, trip.endDate) + '</div>'
			);
			$card.append(
				'<div class="trip-counts">' + nCities + ' ' + (nCities === 1 ? 'city' : 'cities') +
				' · ' + nCountries + ' ' + (nCountries === 1 ? 'country' : 'countries') + '</div>'
			);
			$card.append('<p>' + trip.description + '</p>');
			if (trip.cities && trip.cities.length) {
				$card.append('<div class="cities">' + formatRouteCities(trip) + '</div>');
			}
			$card.on('mouseenter', function () {
				activeTripId = trip.id;
				highlightTrip(trip.id);
				showHoverCard(tripCardHtml(trip), false);
			});
			$card.on('mouseleave', function () {
				activeTripId = null;
				clearTripFocus();
			});
			$panel.append($card);
		});
	}

	function renderStats() {
		var s = travelData.stats || {};
		$('#travel-stats').html(
			'<div class="travel-stat"><strong>' + (s.totalTrips || 0) + '</strong><span>Trips</span></div>' +
			'<div class="travel-stat"><strong>' + (s.totalCities || 0) + '</strong><span>Cities</span></div>' +
			'<div class="travel-stat"><strong>' + (s.totalCountries || 0) + '</strong><span>Countries</span></div>'
		);
		if (travelData.sourceNote && !travelData.trips.length) {
			$('#travel-notice').text(travelData.sourceNote).show();
		} else {
			$('#travel-notice').hide();
		}
	}

	function drawTripRoute(tripId) {
		clearRouteLine();
		var trip = (travelData.trips || []).find(function (t) { return t.id === tripId; });
		if (!trip || !trip.route || trip.route.length < 2 || !map) return;

		var latlngs = trip.route.map(function (p) {
			return [p.lat, p.lng];
		});

		activeRouteLine = L.polyline(latlngs, {
			color: '#303F9F',
			weight: 2,
			opacity: 0.75,
			dashArray: '6, 8'
		}).addTo(map);
	}

	function clearRouteLine() {
		if (activeRouteLine && map) {
			map.removeLayer(activeRouteLine);
			activeRouteLine = null;
		}
	}

	function latLngsFromTrip(trip) {
		if (!trip) return [];
		if (trip.route && trip.route.length) {
			return trip.route.map(function (p) {
				return L.latLng(p.lat, p.lng);
			});
		}
		return (trip.cityIds || []).map(function (id) {
			return markers[id] ? markers[id].marker.getLatLng() : null;
		}).filter(Boolean);
	}

	function fitMapToLatLngs(latlngs, maxZoom) {
		if (!map || !latlngs.length) return;

		if (latlngs.length === 1) {
			map.flyTo(latlngs[0], maxZoom || 9, MAP_FLY_OPTS);
			return;
		}

		map.flyToBounds(L.latLngBounds(latlngs), $.extend({}, MAP_FLY_OPTS, {
			padding: [48, 48],
			maxZoom: maxZoom || 10
		}));
	}

	function resetMapView() {
		if (!map) return;
		if (defaultBounds) {
			map.flyToBounds(defaultBounds, $.extend({}, MAP_FLY_OPTS, {
				padding: [40, 40],
				maxZoom: 5
			}));
		} else if (defaultCenter) {
			map.flyTo(defaultCenter, defaultZoom, MAP_FLY_OPTS);
		}
	}

	function highlightTrip(tripId) {
		clearHighlights();
		$('.trip-card[data-trip-id="' + tripId + '"]').addClass('active');

		var trip = (travelData.trips || []).find(function (t) { return t.id === tripId; });
		var tripCityIds = trip ? (trip.cityIds || []) : [];

		Object.keys(markers).forEach(function (id) {
			var m = markers[id];
			if (m.isHome) return;
			if (tripCityIds.indexOf(id) >= 0) {
				m.el.classList.add('highlight');
				m.el.classList.remove('dimmed');
			} else {
				m.el.classList.add('dimmed');
				m.el.classList.remove('highlight');
			}
		});

		drawTripRoute(tripId);
		fitMapToLatLngs(latLngsFromTrip(trip), 10);
	}

	function clearHighlights() {
		$('.trip-card').removeClass('active');
		Object.keys(markers).forEach(function (id) {
			markers[id].el.classList.remove('highlight', 'dimmed');
		});
		clearRouteLine();
	}

	function clearTripFocus() {
		clearHighlights();
		hideHoverCard();
		resetMapView();
	}

	function initMap() {
		if (typeof L === 'undefined') return;

		map = L.map('travel-map', {
			scrollWheelZoom: false,
			zoomControl: true
		}).setView([30, 10], 2);

		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; OpenStreetMap &copy; CARTO',
			subdomains: 'abcd',
			maxZoom: 19
		}).addTo(map);

		$hoverCard = $('#travel-hover-card');

		(travelData.homeBases || []).forEach(function (home) {
			addMarker(home.id, home.lat, home.lng, true, home, null, 0, 1);
		});

		var maxVisits = maxCityVisits();

		(travelData.cities || []).forEach(function (city) {
			var trips = (travelData.trips || []).filter(function (t) {
				return t.cityIds && t.cityIds.indexOf(city.id) >= 0;
			});
			addMarker(city.id, city.lat, city.lng, false, city, trips, city.visits, maxVisits);
		});

		var latlngs = [];
		Object.keys(markers).forEach(function (id) {
			latlngs.push(markers[id].marker.getLatLng());
		});
		if (latlngs.length > 1) {
			defaultBounds = L.latLngBounds(latlngs);
			map.fitBounds(defaultBounds, { padding: [40, 40], maxZoom: 5 });
		} else if (latlngs.length === 1) {
			map.setView(latlngs[0], 4);
		}
		defaultCenter = map.getCenter();
		defaultZoom = map.getZoom();
	}

	function addMarker(id, lat, lng, isHome, data, trips, visitCount, maxVisits) {
		var html;
		var iconSize;
		var iconAnchor;

		if (isHome) {
			html = '<div class="dot"></div>';
			iconSize = [20, 20];
			iconAnchor = [10, 10];
		} else {
			var heat = visitHeatStyle(visitCount || 1, maxVisits || 1);
			html = '<div class="heat-spot" style="--heat-core:' + heat.core + 'px;--heat-glow:' +
				heat.glow + 'px;--heat-color:' + heat.color + ';--heat-opacity:' + heat.opacity + ';">' +
				'<span class="heat-glow"></span><span class="heat-core"></span></div>';
			iconSize = [heat.outer, heat.outer];
			iconAnchor = [heat.outer / 2, heat.outer / 2];
		}

		var icon = L.divIcon({
			className: 'travel-city-marker' + (isHome ? ' home' : ' heat'),
			html: html,
			iconSize: iconSize,
			iconAnchor: iconAnchor
		});

		var marker = L.marker([lat, lng], { icon: icon }).addTo(map);
		var el = marker.getElement();

		marker.on('mouseover', function () {
			if (isHome) {
				showHoverCard(homeCardHtml(data), true);
				fitMapToLatLngs([marker.getLatLng()], 10);
			} else {
				showHoverCard(cityCardHtml(data, trips), false);
				fitMapToLatLngs([marker.getLatLng()], 9);
			}
			el.classList.add('highlight');
		});
		marker.on('mouseout', function () {
			hideHoverCard();
			if (activeTripId) {
				highlightTrip(activeTripId);
				var trip = (travelData.trips || []).find(function (t) {
					return t.id === activeTripId;
				});
				showHoverCard(tripCardHtml(trip), false);
			} else {
				el.classList.remove('highlight');
				resetMapView();
			}
		});

		markers[id] = {
			marker: marker,
			el: el,
			isHome: isHome,
			tripIds: isHome ? [] : (data.tripIds || [])
		};
	}

	function loadTravel() {
		$.getJSON('data/travel.json').done(function (data) {
			travelData = data;
			renderStats();
			renderTripCards();
			initMap();
		}).fail(function () {
			$('#travel-cards').html('<div class="travel-notice">Could not load travel data.</div>');
		});
	}

	$(window).on('load', function () {
		if ($('#travel-map').length) {
			loadTravel();
		}
	});

	$(document).on('click', '.section-toggle[data-section="travel"]', function () {
		setTimeout(function () {
			if (map) map.invalidateSize();
		}, 1300);
	});

}(jQuery));