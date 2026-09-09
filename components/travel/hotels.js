(function ($) {
	'use strict';

	var PIN_SIZE = 40;

	var BRANDS = [
		{ name: 'Waldorf Astoria', slug: 'waldorf-astoria', family: 'Hilton Honors' },
		{ name: 'Conrad', slug: 'conrad', family: 'Hilton Honors' },
		{ name: 'NoMad', slug: 'nomad', family: 'Hilton Honors' },
		{ name: 'The Ritz-Carlton', slug: 'ritz-carlton', family: 'Marriott Bonvoy' },
		{ name: 'St. Regis', slug: 'st-regis', family: 'Marriott Bonvoy' },
		{ name: 'EDITION', slug: 'edition', family: 'Marriott Bonvoy' },
		{ name: 'W Hotels', slug: 'w-hotels', family: 'Marriott Bonvoy' },
		{ name: 'JW Marriott', slug: 'jw-marriott', family: 'Marriott Bonvoy' },
		{ name: 'Four Seasons', slug: 'four-seasons', family: 'Four Seasons' },
		{ name: 'Fairmont', slug: 'fairmont', family: 'ALL Accor' }
	];

	var FAMILIES = ['Hilton Honors', 'Marriott Bonvoy', 'Four Seasons', 'ALL Accor'];

	var VISIT_TYPES = [
		{ value: 'stay', label: 'Stay' },
		{ value: 'stop-by', label: 'Stop by' }
	];

	function visitType(visit) {
		return visit.type === 'stop-by' ? 'stop-by' : 'stay';
	}

	function visitTypeLabel(visit) {
		var t = visitType(visit);
		for (var i = 0; i < VISIT_TYPES.length; i++) {
			if (VISIT_TYPES[i].value === t) return VISIT_TYPES[i].label;
		}
		return t;
	}

	var hotels = [];
	var hotelById = {};
	var visits = [];
	var mediaUrls = {};
	var map = null;
	var markers = [];
	var loaded = false;

	var ATLANTIC = [35, -40];
	var ATLANTIC_ZOOM = 3;

	function formatVisitDate(dateStr) {
		if (!dateStr) return '';
		var d = new Date(dateStr + 'T00:00:00');
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function stayNights(visit) {
		if (!visit.date || !visit.checkout) return 0;
		var a = new Date(visit.date + 'T00:00:00');
		var b = new Date(visit.checkout + 'T00:00:00');
		if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
		return Math.max(0, Math.round((b - a) / 86400000));
	}

	function formatStayDates(visit) {
		if (!visit.checkout || visit.checkout === visit.date) {
			return formatVisitDate(visit.date);
		}
		var a = new Date(visit.date + 'T00:00:00');
		var b = new Date(visit.checkout + 'T00:00:00');
		if (isNaN(a.getTime()) || isNaN(b.getTime())) return formatVisitDate(visit.date);
		if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
			return a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
				'–' + b.getDate() + ', ' + a.getFullYear();
		}
		return formatVisitDate(visit.date) + ' – ' + formatVisitDate(visit.checkout);
	}

	function stayNightsLabel(visit) {
		var nights = stayNights(visit);
		if (!nights) return '';
		return nights === 1 ? '1 night' : nights + ' nights';
	}

	function timelineMonthParts(key) {
		var d = new Date(key + '-01T00:00:00');
		if (isNaN(d.getTime())) return { month: key, year: '' };
		return {
			month: d.toLocaleDateString('en-US', { month: 'short' }),
			year: String(d.getFullYear())
		};
	}

	function locationText(hotel) {
		var parts = [hotel.city, hotel.country].filter(Boolean);
		return parts.join(', ');
	}

	function mediaKey(visit, filename, variant) {
		var name = filename;
		if (variant === 'thumb') {
			name = filename.replace(/(\.[^.]+)$/, '.thumb$1');
		}
		return visit.id + '/' + name;
	}

	function photoPath(visit, filename, variant) {
		return mediaUrls[mediaKey(visit, filename, variant)] || '';
	}

	function blobUrl(bytes, name) {
		var type = 'application/octet-stream';
		if (/\.jpe?g$/i.test(name)) type = 'image/jpeg';
		else if (/\.png$/i.test(name)) type = 'image/png';
		else if (/\.webp$/i.test(name)) type = 'image/webp';
		return URL.createObjectURL(new Blob([bytes], { type: type }));
	}

	function visitHotel(visit) {
		return hotelById[visit.hotelId] || null;
	}

	function brandIconPath(slug, variant) {
		if (variant === 'stay') {
			return 'img/travel/brands/' + slug + '-stay.png';
		}
		return 'img/travel/brands/' + slug + '.png';
	}

	function brandSlug(hotel) {
		for (var i = 0; i < BRANDS.length; i++) {
			if (BRANDS[i].name === hotel.brand) return BRANDS[i].slug;
		}
		return '';
	}

	function brandHasStay(name) {
		for (var i = 0; i < visits.length; i++) {
			if (visitBrand(visits[i]) === name && visitType(visits[i]) === 'stay') {
				return true;
			}
		}
		return false;
	}

	function pinIconPath(hotel, visit) {
		var slug = brandSlug(hotel);
		if (!slug) return '';
		if (visitType(visit) === 'stay') {
			return brandIconPath(slug, 'stay');
		}
		return brandIconPath(slug);
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
			var stayed = brandHasStay(b.name);
			return (
				'<span class="hotel-totals-group' + (stayed ? ' hotel-totals-group-stay' : '') + '">' +
					'<img class="hotel-totals-icon" src="' + brandIconPath(b.slug, stayed ? 'stay' : '') + '" alt="">' +
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

	function populateSelect($container, options, allLabel) {
		var $list = $container.find('.hotel-select-list');
		$list.empty();
		$list.append($('<li></li>').attr('data-value', 'all').addClass('active').text(allLabel));
		options.forEach(function (o) {
			var value = typeof o === 'string' ? o : o.value;
			var label = typeof o === 'string' ? o : o.label;
			$list.append($('<li></li>').attr('data-value', value).text(label));
		});
		$container.attr('data-value', 'all');
		$container.find('.hotel-select-btn').text(allLabel);
		sizeSelectToContent($container);
	}

	function populateFilters() {
		populateSelect($('#hotel-filter-brand'), BRANDS.map(function (b) { return b.name; }), 'All Brands');
		populateSelect($('#hotel-filter-family'), FAMILIES, 'All Families');
		populateSelect($('#hotel-filter-type'), VISIT_TYPES, 'All Types');
	}

	function selectedBrand() {
		return $('#hotel-filter-brand').attr('data-value') || 'all';
	}

	function selectedFamily() {
		return $('#hotel-filter-family').attr('data-value') || 'all';
	}

	function selectedType() {
		return $('#hotel-filter-type').attr('data-value') || 'all';
	}

	function matchesVisit(visit, hotel) {
		if (!hotel) return false;
		var brand = selectedBrand();
		var family = selectedFamily();
		var type = selectedType();
		return (brand === 'all' || hotel.brand === brand) &&
			(family === 'all' || hotel.family === family) &&
			(type === 'all' || visitType(visit) === type);
	}

	function filtersAreAll() {
		return selectedBrand() === 'all' && selectedFamily() === 'all' && selectedType() === 'all';
	}

	function applyFilters() {
		var visible = 0;

		$('.hotel-timeline-station').each(function () {
			var match = (selectedBrand() === 'all' || $(this).attr('data-brand') === selectedBrand()) &&
				(selectedFamily() === 'all' || $(this).attr('data-family') === selectedFamily()) &&
				(selectedType() === 'all' || $(this).attr('data-type') === selectedType());
			$(this).toggleClass('hotel-card-hidden', !match);
			if (match) visible++;
		});
		$('.hotel-timeline-month').each(function () {
			var any = $(this).find('.hotel-timeline-station').not('.hotel-card-hidden').length > 0;
			$(this).toggle(any);
		});

		markers.forEach(function (m) {
			var match = matchesVisit(m.visit, m.hotel);
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
		var src = pictures.length ? photoPath(visit, pictures[0], 'thumb') : '';
		if (!src) {
			return '<div class="hotel-card-photo"><div class="hotel-card-photo-placeholder"><i class="fas fa-camera"></i></div></div>';
		}
		var count = pictures.length > 1
			? '<span class="hotel-card-photo-count">' + pictures.length + ' photos</span>'
			: '';
		return '<div class="hotel-card-photo">' +
			'<img src="' + src + '" alt="" decoding="async">' +
			count + '</div>';
	}

	function bindVisitCard($card, visit) {
		$card.on('click', function () {
			focusVisit(visit.id);
		});
		$card.on('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				focusVisit(visit.id);
			}
		});
	}

	function visitCard($cardBody, visit, hotel) {
		var nights = stayNightsLabel(visit);
		$cardBody.append(
			'<div class="hotel-card-top">' +
				'<h4>' + hotel.name + '</h4>' +
				'<span class="hotel-card-type hotel-card-type-' + visitType(visit) + '">' + visitTypeLabel(visit) + '</span>' +
			'</div>' +
			'<div class="hotel-card-brand">' + hotel.brand + '</div>' +
			'<div class="hotel-card-family">' + hotel.family + '</div>' +
			'<div class="hotel-card-meta"><i class="fas fa-map-marker-alt"></i> ' + locationText(hotel) + '</div>' +
			'<div class="hotel-card-meta"><i class="fas fa-calendar-alt"></i> ' + formatStayDates(visit) +
				(nights ? ' · ' + nights : '') + '</div>'
		);
	}

	function renderCards() {
		var $track = $('#hotel-cards');
		$track.empty();

		if (!visits.length) {
			$track.append('<p class="hotel-empty hotel-empty-none">No hotel visits yet. Stays will show as pins on the map.</p>');
			applyFilters();
			return;
		}

		var sorted = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});
		var groups = [];
		var current = null;
		sorted.forEach(function (visit) {
			if (!visitHotel(visit)) return;
			var key = (visit.date || '').slice(0, 7);
			if (!current || current.key !== key) {
				current = { key: key, visits: [] };
				groups.push(current);
			}
			current.visits.push(visit);
		});

		$track.append('<div class="hotel-timeline-rail" aria-hidden="true"></div>');
		groups.forEach(function (group) {
			var parts = timelineMonthParts(group.key);
			var $month = $('<section class="hotel-timeline-month" data-month="' + group.key + '"></section>');
			$month.append(
				'<header class="hotel-timeline-month-label">' +
					'<span class="hotel-timeline-month-name">' + parts.month + '</span>' +
					'<span class="hotel-timeline-month-year">' + parts.year + '</span>' +
				'</header>'
			);
			var $stations = $('<div class="hotel-timeline-stations"></div>');
			group.visits.forEach(function (visit) {
				var hotel = visitHotel(visit);
				var $station = $('<article class="hotel-timeline-station" data-visit-id="' + visit.id + '" data-brand="' + hotel.brand + '" data-family="' + hotel.family + '" data-type="' + visitType(visit) + '"></article>');
				$station.append('<span class="hotel-timeline-node" aria-hidden="true"></span>');
				var $card = $('<div class="hotel-card" data-visit-id="' + visit.id + '" tabindex="0"></div>');
				$card.append(coverHtml(visit));
				var $body = $('<div class="hotel-card-body"></div>');
				visitCard($body, visit, hotel);
				$card.append($body);
				bindVisitCard($card, visit);
				$station.append($card);
				$stations.append($station);
			});
			$month.append($stations);
			$track.append($month);
		});
		applyFilters();
	}

	function popupHtml(visit, hotel) {
		var nights = stayNightsLabel(visit);
		return '<strong>' + hotel.name + '</strong>' +
			'<div class="hotel-popup-brand">' + hotel.brand + '</div>' +
			'<div class="hotel-popup-family">' + hotel.family + '</div>' +
			'<div>' + locationText(hotel) + '</div>' +
			'<div>' + visitTypeLabel(visit) + ' · ' + formatStayDates(visit) + (nights ? ' · ' + nights : '') + '</div>';
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
			m.marker.setZIndexOffset(on ? 1000 : 0);
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
		var type = visitType(visit);
		var src = pinIconPath(hotel, visit);
		var icon = L.divIcon({
			className: 'hotel-visit-marker hotel-visit-marker-' + type,
			html: '<div class="hotel-pin hotel-pin-' + type + '">' +
				(src ? '<img src="' + src + '" alt="" draggable="false">' : '') +
				'</div>',
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
		}).setView(ATLANTIC, ATLANTIC_ZOOM);

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
	}

	function hydrateCollection(collection, media) {
		hotels = (collection && collection.hotels) || [];
		visits = (collection && collection.visits) || [];
		hotelById = {};
		hotels.forEach(function (h) {
			hotelById[h.id] = h;
		});
		Object.keys(media || {}).forEach(function (rel) {
			mediaUrls[rel] = blobUrl(media[rel], rel);
		});
		populateFilters();
		renderStats();
		renderCards();
		initMap();
		applyFilters();
		if (map) map.invalidateSize();
	}

	function loadHotels() {
		if (loaded) {
			if (map) map.invalidateSize();
			return;
		}
		if (!window.SiteGate) {
			$('#hotel-cards').html('<p class="hotel-empty">Could not load hotel data.</p>');
			return;
		}

		window.SiteGate.require(
			'.travel-panel[data-travel-panel="hotels"]',
			'Hotel Collection',
			function () {
				if (loaded) {
					if (map) map.invalidateSize();
					return;
				}
				loaded = true;
				Promise.all([
					window.SiteGate.decryptJson('data/hotel-collection.enc'),
					window.SiteGate.decryptArchive('data/hotel-media.enc')
				]).then(function (results) {
					hydrateCollection(results[0], results[1]);
				}).catch(function () {
					loaded = false;
					$('#hotel-cards').html('<p class="hotel-empty">Could not load hotel data.</p>');
				});
			}
		);
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
