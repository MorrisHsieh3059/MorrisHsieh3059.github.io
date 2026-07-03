(function ($) {
	'use strict';

	var map = null;
	var markers = {};
	var travelData = null;
	var $hoverCard = null;

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
			'<div class="meta"><i class="fas fa-map-marker-alt"></i> ' +
			city.visits + ' visit' + (city.visits === 1 ? '' : 's') +
			' · ' + city.firstVisit + ' – ' + city.lastVisit + '</div>' +
			(tripList ? '<p>Trips:</p><ul style="margin:0;padding-left:1.1rem;font-size:0.82rem;">' + tripList + '</ul>' : '');
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
		return '<h5>' + trip.title + '</h5>' +
			'<div class="meta"><i class="fas fa-plane"></i> ' +
			formatDateRange(trip.startDate, trip.endDate) + '</div>' +
			'<p>' + trip.description + '</p>';
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
			var $card = $('<div class="trip-card" data-trip-id="' + trip.id + '"></div>');
			$card.append('<h4>' + trip.title + '</h4>');
			$card.append(
				'<div class="meta"><i class="fas fa-plane"></i> ' +
				formatDateRange(trip.startDate, trip.endDate) + '</div>'
			);
			$card.append('<p>' + trip.description + '</p>');
			if (trip.cities && trip.cities.length) {
				$card.append('<div class="cities">' + trip.cities.join(' · ') + '</div>');
			}
			$card.on('mouseenter', function () {
				highlightTrip(trip.id);
				showHoverCard(tripCardHtml(trip), false);
			});
			$card.on('mouseleave', function () {
				clearHighlights();
				hideHoverCard();
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

	function highlightTrip(tripId) {
		clearHighlights();
		$('.trip-card[data-trip-id="' + tripId + '"]').addClass('active');
		Object.keys(markers).forEach(function (id) {
			var m = markers[id];
			if (m.tripIds && m.tripIds.indexOf(tripId) >= 0) {
				m.el.classList.add('highlight');
			}
		});
	}

	function clearHighlights() {
		$('.trip-card').removeClass('active');
		Object.keys(markers).forEach(function (id) {
			markers[id].el.classList.remove('highlight');
		});
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

		// Home base pins
		(travelData.homeBases || []).forEach(function (home) {
			addMarker(home.id, home.lat, home.lng, true, home, null);
		});

		// Travel city pins
		(travelData.cities || []).forEach(function (city) {
			var trips = (travelData.trips || []).filter(function (t) {
				return t.cityIds && t.cityIds.indexOf(city.id) >= 0;
			});
			addMarker(city.id, city.lat, city.lng, false, city, trips);
		});

		// Fit bounds if we have markers
		var latlngs = [];
		Object.keys(markers).forEach(function (id) {
			latlngs.push(markers[id].marker.getLatLng());
		});
		if (latlngs.length > 1) {
			map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 5 });
		} else if (latlngs.length === 1) {
			map.setView(latlngs[0], 4);
		}
	}

	function addMarker(id, lat, lng, isHome, data, trips) {
		var icon = L.divIcon({
			className: 'travel-city-marker' + (isHome ? ' home' : ''),
			html: '<div class="dot"></div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		var marker = L.marker([lat, lng], { icon: icon }).addTo(map);
		var el = marker.getElement();

		marker.on('mouseover', function () {
			if (isHome) {
				showHoverCard(homeCardHtml(data), true);
			} else {
				showHoverCard(cityCardHtml(data, trips), false);
			}
			el.classList.add('highlight');
		});
		marker.on('mouseout', function () {
			hideHoverCard();
			el.classList.remove('highlight');
		});

		markers[id] = {
			marker: marker,
			el: el,
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

	// Re-fit map when travel section becomes active
	$(document).on('click', '.section-toggle[data-section="travel"]', function () {
		setTimeout(function () {
			if (map) map.invalidateSize();
		}, 1300);
	});

}(jQuery));