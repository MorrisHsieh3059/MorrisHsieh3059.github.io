(function ($) {
	'use strict';

	var PIN_SIZE = 22;

	var BRANDS = [
		{ name: 'Waldorf Astoria', slug: 'waldorf-astoria', family: 'Hilton Honors' },
		{ name: 'The Ritz-Carlton', slug: 'ritz-carlton', family: 'Marriott Bonvoy' },
		{ name: 'Four Seasons', slug: 'four-seasons', family: 'Four Seasons' },
		{ name: 'Fairmont', slug: 'fairmont', family: 'ALL Accor' }
	];

	var FAMILIES = ['Hilton Honors', 'Marriott Bonvoy', 'Four Seasons', 'ALL Accor'];

	var hotels = [];
	var hotelById = {};
	var visits = [];
	var map = null;
	var markers = [];
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

	function brandIconPath(slug) {
		return 'img/travel/brands/' + slug + '.svg';
	}

	function visitBrand(visit) {
		var hotel = visitHotel(visit);
		return hotel ? hotel.brand : '';
	}

	function renderStats() {
		var counts = {};
		BRANDS.forEach(function (b) { counts[b.name] = 0; });
		visits.forEach(function (v) {
			var brand = visitBrand(v);
			if (brand && counts[brand] != null) counts[brand]++;
		});

		var groups = BRANDS.map(function (b) {
			return (
				'<span class="hotel-totals-group">' +
					'<img class="hotel-totals-icon" src="' + brandIconPath(b.slug) + '" alt="">' +
					'<span>' + b.name + '</span> ' +
					'<strong>' + counts[b.name] + '</strong>' +
				'</span>'
			);
		});
		$('#hotel-stats').html(groups.join('<span class="hotel-totals-sep">|</span>'));
	}

	function sizeSelectToContent($container) {
		var $btn = $container.find('.hotel-select-btn');
		var $measure = $('<span></span>').css({
			position: 'absolute',
			visibility: 'hidden',
			whiteSpace: 'nowrap',
			fontFamily: $btn.css('font-family'),
			fontSize: $btn.css('font-size'),
			fontWeight: $btn.css('font-weight'),
			letterSpacing: $btn.css('letter-spacing')
		}).appendTo('body');

		var maxTextWidth = 0;
		$container.find('.hotel-select-list li').each(function () {
			$measure.text($(this).text());
			maxTextWidth = Math.max(maxTextWidth, $measure.outerWidth());
		});
		$measure.remove();

		var btnPaddingLeft = parseFloat($btn.css('padding-left')) || 0;
		var btnPaddingRight = parseFloat($btn.css('padding-right')) || 0;
		var width = Math.ceil(maxTextWidth + btnPaddingLeft + btnPaddingRight + 4);

		$btn.css('width', width + 'px');
		$container.find('.hotel-select-list').css('width', width + 'px');
	}

	function populateSelect($container, values, allLabel) {
		var $list = $container.find('.hotel-select-list');
		$list.empty();
		$list.append($('<li></li>').attr('data-value', 'all').addClass('active').text(allLabel));
		values.forEach(function (v) {
			$list.append($('<li></li>').attr('data-value', v).text(v));
		});
		$container.attr('data-value', 'all');
		$container.find('.hotel-select-btn').text(allLabel);
		sizeSelectToContent($container);
	}

	function populateFilters() {
		populateSelect($('#hotel-filter-brand'), BRANDS.map(function (b) { return b.name; }), 'All Brands');
		populateSelect($('#hotel-filter-family'), FAMILIES, 'All Families');
	}

	function selectedBrand() {
		return $('#hotel-filter-brand').attr('data-value') || 'all';
	}

	function selectedFamily() {
		return $('#hotel-filter-family').attr('data-value') || 'all';
	}

	function matchesHotel(hotel) {
		if (!hotel) return false;
		var brand = selectedBrand();
		var family = selectedFamily();
		return (brand === 'all' || hotel.brand === brand) &&
			(family === 'all' || hotel.family === family);
	}

	function filtersAreAll() {
		return selectedBrand() === 'all' && selectedFamily() === 'all';
	}

	function applyFilters() {
		var visible = 0;

		$('.hotel-card').each(function () {
			var match = (selectedBrand() === 'all' || $(this).attr('data-brand') === selectedBrand()) &&
				(selectedFamily() === 'all' || $(this).attr('data-family') === selectedFamily());
			$(this).toggleClass('hotel-card-hidden', !match);
			if (match) visible++;
		});

		markers.forEach(function (m) {
			var match = matchesHotel(m.hotel);
			if (!map) return;
			if (match) {
				if (!map.hasLayer(m.marker)) m.marker.addTo(map);
			} else {
				m.marker.closePopup();
				if (map.hasLayer(m.marker)) map.removeLayer(m.marker);
			}
			var el = markerEl(m);
			if (el) el.classList.toggle('highlight', false);
		});
		$('.hotel-card').removeClass('active');

		var noVisits = !visits.length;
		$('.hotel-empty-none').toggle(noVisits && filtersAreAll());
		$('#hotel-filter-empty').toggle((noVisits && !filtersAreAll()) || (!noVisits && visible === 0));
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
			$grid.append('<p class="hotel-empty hotel-empty-none">No hotel visits yet. Stays will show as pins on the map.</p>');
			applyFilters();
			return;
		}

		visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		}).forEach(function (visit) {
			var hotel = visitHotel(visit);
			if (!hotel) return;
			var $card = $('<article class="hotel-card" data-visit-id="' + visit.id + '" data-brand="' + hotel.brand + '" data-family="' + hotel.family + '" tabindex="0"></article>');
			$card.append(coverHtml(visit));
			$card.append(
				'<div class="hotel-card-body">' +
					'<h4>' + hotel.name + '</h4>' +
					'<div class="hotel-card-brand">' + hotel.brand + '</div>' +
					'<div class="hotel-card-family">' + hotel.family + '</div>' +
					'<div class="hotel-card-meta"><i class="fas fa-map-marker-alt"></i> ' + locationText(hotel) + '</div>' +
					'<div class="hotel-card-meta"><i class="fas fa-calendar-alt"></i> ' + formatVisitDate(visit.date) + '</div>' +
				'</div>'
			);
			$card.on('click', function () {
				focusVisit(visit.id);
			});
			$card.on('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					focusVisit(visit.id);
				}
			});
			$grid.append($card);
		});
		applyFilters();
	}

	function popupHtml(visit, hotel) {
		return '<strong>' + hotel.name + '</strong>' +
			'<div class="hotel-popup-brand">' + hotel.brand + '</div>' +
			'<div class="hotel-popup-family">' + hotel.family + '</div>' +
			'<div>' + locationText(hotel) + '</div>' +
			'<div>' + formatVisitDate(visit.date) + '</div>';
	}

	function markerEl(m) {
		if (!m.el) m.el = m.marker.getElement();
		return m.el;
	}

	function focusVisit(visitId) {
		var found = null;
		markers.forEach(function (m) {
			var on = m.visit.id === visitId;
			var el = markerEl(m);
			if (el) el.classList.toggle('highlight', on);
			if (on) found = m;
			else m.marker.closePopup();
		});
		$('.hotel-card').removeClass('active');
		$('.hotel-card[data-visit-id="' + visitId + '"]').addClass('active');
		if (!found || !map) return;
		map.setView(found.marker.getLatLng(), Math.max(map.getZoom(), 6), { animate: true });
		found.marker.openPopup();
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

		marker.bindPopup(popupHtml(visit, hotel), { closeButton: false, maxWidth: 240 });
		marker.on('click', function () {
			focusVisit(visit.id);
		});

		markers.push({ marker: marker, el: marker.getElement(), visit: visit, hotel: hotel });
	}

	function initMap() {
		if (typeof L === 'undefined' || map) return;

		map = L.map('hotel-map', {
			scrollWheelZoom: true,
			zoomControl: true,
			zoomSnap: 0.25
		}).setView([20, 10], 2);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 19
		}).addTo(map);

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
			populateFilters();
			renderStats();
			renderCards();
			initMap();
			applyFilters();
			if (map) map.invalidateSize();
		}).fail(function () {
			$('#hotel-cards').html('<p class="hotel-empty">Could not load hotel data.</p>');
		});
	}

	$(document).on('click', '.hotel-select-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		var $container = $(this).closest('.hotel-select');
		var wasOpen = $container.hasClass('open');
		$('.hotel-select').removeClass('open');
		if (!wasOpen) $container.addClass('open');
	});

	$(document).on('click', '.hotel-select-list li', function () {
		var $li = $(this);
		var $container = $li.closest('.hotel-select');
		$container.attr('data-value', $li.attr('data-value'));
		$container.find('.hotel-select-btn').text($li.text());
		$container.find('.hotel-select-list li').removeClass('active');
		$li.addClass('active');
		$container.removeClass('open');
		applyFilters();
	});

	$(document).on('click', function (e) {
		if (!$(e.target).closest('.hotel-select').length) {
			$('.hotel-select').removeClass('open');
		}
	});

	window.HotelCollection = {
		show: function () {
			loadHotels();
			setTimeout(function () {
				if (map) map.invalidateSize();
			}, 50);
		}
	};

}(jQuery));
