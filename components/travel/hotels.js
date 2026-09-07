(function ($) {
	'use strict';

	var PIN_SIZE = 22;

	var hotels = [];
	var hotelById = {};
	var visits = [];
	var map = null;
	var markers = [];
	var $hoverCard = null;
	var loaded = false;

	function formatVisitDate(dateStr) {
		if (!dateStr) return '';
		var d = new Date(dateStr + 'T00:00:00');
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function locationText(hotel) {
		var parts = [hotel.city, hotel.country].filter(Boolean);
		return parts.join(', ');
	}

	function photoPath(visit, filename, variant) {
		var name = filename;
		if (variant === 'thumb') {
			name = filename.replace(/(\.[^.]+)$/, '.thumb$1');
		}
		return 'img/travel/visits/' + visit.id + '/' + name;
	}

	function visitHotel(visit) {
		return hotelById[visit.hotelId] || null;
	}

	function renderStats() {
		var hotelIds = {};
		visits.forEach(function (v) {
			if (v.hotelId) hotelIds[v.hotelId] = true;
		});
		$('#hotel-stats').html(
			'stays: ' + visits.length +
			' | hotels: ' + Object.keys(hotelIds).length +
			' | catalog: ' + hotels.length
		);
	}

	function coverHtml(visit) {
		var pictures = visit.pictures || [];
		if (!pictures.length) {
			return '<div class="hotel-card-photo"><div class="hotel-card-photo-placeholder"><i class="fas fa-camera"></i></div></div>';
		}
		var count = pictures.length > 1
			? '<span class="hotel-card-photo-count">' + pictures.length + ' photos</span>'
			: '';
		return '<div class="hotel-card-photo">' +
			'<img src="' + photoPath(visit, pictures[0], 'thumb') + '" alt="" decoding="async">' +
			count + '</div>';
	}

	function renderCards() {
		var $grid = $('#hotel-cards');
		$grid.empty();

		if (!visits.length) {
			$grid.append('<p class="hotel-empty">No hotel visits yet. Stays will show as pins on the map.</p>');
			return;
		}

		visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		}).forEach(function (visit) {
			var hotel = visitHotel(visit);
			if (!hotel) return;
			var $card = $('<button type="button" class="hotel-card" data-visit-id="' + visit.id + '"></button>');
			$card.append(coverHtml(visit));
			$card.append(
				'<div class="hotel-card-body">' +
					'<h4>' + hotel.name + '</h4>' +
					'<div class="hotel-card-brand">' + hotel.brand + '</div>' +
					'<div class="hotel-card-meta"><i class="fas fa-map-marker-alt"></i> ' + locationText(hotel) + '</div>' +
					'<div class="hotel-card-meta"><i class="fas fa-calendar-alt"></i> ' + formatVisitDate(visit.date) + '</div>' +
				'</div>'
			);
			$card.on('click', function () {
				focusVisit(visit.id);
			});
			$grid.append($card);
		});
	}

	function visitCardHtml(visit, hotel) {
		return '<h5>' + hotel.name + '</h5>' +
			'<div class="meta">' + hotel.brand + '</div>' +
			'<div class="meta"><i class="fas fa-map-marker-alt"></i> ' + locationText(hotel) + '</div>' +
			'<div class="meta"><i class="fas fa-calendar-alt"></i> ' + formatVisitDate(visit.date) + '</div>';
	}

	function showHoverCard(html) {
		if (!$hoverCard) return;
		$hoverCard.html(html).addClass('visible');
	}

	function hideHoverCard() {
		if ($hoverCard) $hoverCard.removeClass('visible');
	}

	function focusVisit(visitId) {
		var found = null;
		markers.forEach(function (m) {
			var on = m.visit.id === visitId;
			m.el.classList.toggle('highlight', on);
			if (on) found = m;
		});
		$('.hotel-card').removeClass('active');
		$('.hotel-card[data-visit-id="' + visitId + '"]').addClass('active');
		if (!found || !map) return;
		showHoverCard(visitCardHtml(found.visit, found.hotel));
		map.setView(found.marker.getLatLng(), Math.max(map.getZoom(), 6), { animate: true });
	}

	function addPin(visit, hotel) {
		var icon = L.divIcon({
			className: 'hotel-visit-marker',
			html: '<div class="hotel-pin"></div>',
			iconSize: [PIN_SIZE, PIN_SIZE],
			iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2]
		});
		var marker = L.marker([hotel.lat, hotel.lng], {
			icon: icon,
			keyboard: false
		}).addTo(map);
		var el = marker.getElement();

		marker.on('click', function (e) {
			L.DomEvent.stopPropagation(e);
			focusVisit(visit.id);
		});

		markers.push({ marker: marker, el: el, visit: visit, hotel: hotel });
	}

	function initMap() {
		if (typeof L === 'undefined' || map) return;

		map = L.map('hotel-map', {
			scrollWheelZoom: true,
			zoomControl: true,
			zoomSnap: 0.25
		}).setView([20, 10], 2);

		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; OpenStreetMap &copy; CARTO',
			subdomains: 'abcd',
			maxZoom: 19
		}).addTo(map);

		$hoverCard = $('#hotel-hover-card');
		map.on('click', hideHoverCard);

		visits.forEach(function (visit) {
			var hotel = visitHotel(visit);
			if (hotel && hotel.lat != null && hotel.lng != null) {
				addPin(visit, hotel);
			}
		});

		if (markers.length === 1) {
			map.setView(markers[0].marker.getLatLng(), 5);
		} else if (markers.length > 1) {
			var bounds = L.latLngBounds(markers.map(function (m) {
				return m.marker.getLatLng();
			}));
			map.fitBounds(bounds, { padding: [36, 36], maxZoom: 5 });
		}
	}

	function loadHotels() {
		if (loaded) {
			if (map) map.invalidateSize();
			return;
		}
		loaded = true;

		$.when(
			$.getJSON('data/hotels.json'),
			$.getJSON('data/hotel-visits.json')
		).done(function (hotelRes, visitRes) {
			hotels = hotelRes[0] || [];
			visits = visitRes[0] || [];
			hotelById = {};
			hotels.forEach(function (h) {
				hotelById[h.id] = h;
			});
			renderStats();
			renderCards();
			initMap();
			if (map) map.invalidateSize();
		}).fail(function () {
			$('#hotel-cards').html('<p class="hotel-empty">Could not load hotel data.</p>');
		});
	}

	window.HotelCollection = {
		show: function () {
			loadHotels();
			setTimeout(function () {
				if (map) map.invalidateSize();
			}, 50);
		}
	};

}(jQuery));
