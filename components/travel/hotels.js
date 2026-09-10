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

	function photoPath(visit, filename, variant) {
		var name = filename;
		if (variant === 'thumb') {
			name = filename.replace(/(\.[^.]+)$/, '.thumb$1');
		}
		return 'img/travel/visits/' + visit.id + '/' + name;
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	function popupPhotoAttrs(visit, hotel) {
		return ' data-photo-base="' + escapeAttr('img/travel/visits/' + visit.id) + '"' +
			' data-photos="' + escapeAttr((visit.pictures || []).join(',')) + '"' +
			' data-photo-alt="' + escapeAttr(hotel ? hotel.name : '') + '"';
	}

	function fillPopupSlider($content) {
		var $slider = $content.find('.popup-slider');
		if ($slider.children().length) return $slider;
		var root = $content.closest('.popup')[0] || $content[0];
		var base = (root.getAttribute('data-photo-base') || '').replace(/\/$/, '');
		var photos = (root.getAttribute('data-photos') || '').split(',').filter(Boolean);
		var alt = root.getAttribute('data-photo-alt') || '';
		var html;
		if (!photos.length) {
			html = '<div class="item"><div class="hotel-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		} else {
			html = photos.map(function (filename) {
				return '<div class="item"><figure><img src="' + base + '/' + filename + '" alt="' + escapeAttr(alt) + '" decoding="async"></figure></div>';
			}).join('');
		}
		$slider.html(html);
		return $slider;
	}

	var POPUP_NAV = ['<i class="fas fa-chevron-left"></i>', '<i class="fas fa-chevron-right"></i>'];
	// Dots stay readable on a phone up to about this many; beyond that use a counter.
	var POPUP_DOTS_MAX = 12;

	function ensurePhotoCounter($slider, total) {
		var $counter = $slider.find('> .hotel-popup-photo-count');
		if (!$counter.length) {
			$counter = $('<div class="hotel-popup-photo-count" aria-live="polite"></div>');
			$slider.append($counter);
		}
		function syncFromEvent(e) {
			var index = 0;
			if (e && e.relatedTarget && typeof e.relatedTarget.relative === 'function') {
				index = e.relatedTarget.relative(e.item.index);
			} else if (e && e.item && typeof e.item.index === 'number') {
				index = ((e.item.index % total) + total) % total;
			}
			$counter.text((index + 1) + ' / ' + total);
		}
		$slider.off('changed.owl.carousel.hotelCount').on('changed.owl.carousel.hotelCount', syncFromEvent);
		$counter.text('1 / ' + total);
		return $counter;
	}

	function visitPopupSettings() {
		return {
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in michelin-popup hotel-popup',
			callbacks: {
				open: function () {
					var visitId = this.currItem && this.currItem.el
						? this.currItem.el.attr('data-visit-id')
						: '';
					if (visitId) focusVisit(visitId);
					var $slider = fillPopupSlider(this.content);
					var count = $slider.find('.item').length;
					var useDots = count > 1 && count <= POPUP_DOTS_MAX;
					$slider.owlCarousel({
						items: 1,
						loop: count > 1,
						nav: count > 1,
						dots: useDots,
						autoplay: false,
						navText: POPUP_NAV
					});
					if (count > 1) ensurePhotoCounter($slider, count);
				},
				close: function () {
					var $slider = this.content.find('.popup-slider');
					$slider.off('changed.owl.carousel.hotelCount');
					this.content.find('.hotel-popup-photo-count').remove();
					if ($slider.data('owl.carousel')) {
						$slider.trigger('destroy.owl.carousel');
					}
				}
			}
		};
	}

	function bindVisitPopups($cards) {
		$cards.magnificPopup(visitPopupSettings());
	}

	function openVisitLightbox(visitId) {
		var $src = $('#popup-hotel-' + visitId);
		if (!$src.length) return;
		$.magnificPopup.open($.extend({}, visitPopupSettings(), {
			items: { src: $src, type: 'inline' }
		}));
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

		// Visit-count desc; stable BRANDS order on ties. Mobile CSS keeps top 4 only.
		var ranked = BRANDS.slice().sort(function (a, b) {
			var diff = counts[b.name] - counts[a.name];
			if (diff) return diff;
			return BRANDS.indexOf(a) - BRANDS.indexOf(b);
		});

		var parts = [];
		ranked.forEach(function (b, i) {
			var stayed = brandHasStay(b.name);
			var hide = i >= 4 ? ' hotel-totals-mobile-hide' : '';
			parts.push(
				'<span class="hotel-totals-group' + (stayed ? ' hotel-totals-group-stay' : '') + hide + '">' +
					'<img class="hotel-totals-icon" src="' + brandIconPath(b.slug, stayed ? 'stay' : '') + '" alt="">' +
					'<span>' + b.name + '</span> ' +
					'<strong>' + counts[b.name] + '</strong>' +
				'</span>'
			);
		});
		// Leading "|" via CSS ::before + overflow clip — same as dining stats banners.
		$('#hotel-stats').html('<span class="hotel-totals-inner">' + parts.join('') + '</span>');
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

	function visitCardBodyHtml(visit, hotel) {
		var nights = stayNightsLabel(visit);
		return (
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

	function visitPopupHtml(visit, hotel) {
		var nights = stayNightsLabel(visit);
		return (
			'<div id="popup-hotel-' + visit.id + '" class="popup mfp-hide"' + popupPhotoAttrs(visit, hotel) + '>' +
				'<div class="popup-inner">' +
					'<div class="hotel-visit-popup-header">' +
						'<div class="hotel-card-top">' +
							'<h4>' + hotel.name + '</h4>' +
							'<span class="hotel-card-type hotel-card-type-' + visitType(visit) + '">' + visitTypeLabel(visit) + '</span>' +
						'</div>' +
						'<div class="hotel-card-brand">' + hotel.brand + '</div>' +
						'<div class="hotel-card-family">' + hotel.family + '</div>' +
						'<div class="hotel-card-meta"><i class="fas fa-map-marker-alt"></i> ' + locationText(hotel) + '</div>' +
						'<div class="hotel-card-meta"><i class="fas fa-calendar-alt"></i> ' + formatStayDates(visit) +
							(nights ? ' · ' + nights : '') + '</div>' +
					'</div>' +
					'<div class="popup-slider owl-carousel"></div>' +
				'</div>' +
			'</div>'
		);
	}

	function renderCards() {
		var $track = $('#hotel-cards');
		var $popups = $('#hotel-visit-popups');
		$track.empty();
		$popups.empty();

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
		var popupParts = [];
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
				var $card = $('<a href="#popup-hotel-' + visit.id + '" class="hotel-card" data-visit-id="' + visit.id + '"></a>');
				$card.append(coverHtml(visit));
				$card.append('<div class="hotel-card-body">' + visitCardBodyHtml(visit, hotel) + '</div>');
				$station.append($card);
				$stations.append($station);
				popupParts.push(visitPopupHtml(visit, hotel));
			});
			$month.append($stations);
			$track.append($month);
		});
		$popups.html(popupParts.join(''));
		bindVisitPopups($track.find('.hotel-card'));
		applyFilters();
	}

	function mapPopupCard(visit, hotel) {
		var nights = stayNightsLabel(visit);
		var pictures = visit.pictures || [];
		var hint = pictures.length
			? '<div class="hotel-map-popup-hint"><i class="fas fa-images"></i> View photos</div>'
			: '';
		var $card = $(
			'<a href="#popup-hotel-' + visit.id + '" class="hotel-map-popup-card" data-visit-id="' + visit.id + '">' +
				'<strong>' + hotel.name + '</strong>' +
				'<div class="hotel-popup-brand">' + hotel.brand + '</div>' +
				'<div class="hotel-popup-family">' + hotel.family + '</div>' +
				'<div>' + locationText(hotel) + '</div>' +
				'<div>' + visitTypeLabel(visit) + ' · ' + formatStayDates(visit) + (nights ? ' · ' + nights : '') + '</div>' +
				hint +
			'</a>'
		);
		$card.on('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			openVisitLightbox(visit.id);
		});
		return $card[0];
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

		marker.bindPopup(mapPopupCard(visit, hotel), { closeButton: false, maxWidth: 240 });
		marker.on('click', function () {
			focusVisit(visit.id);
		});

		markers.push({ marker: marker, el: marker.getElement(), visit: visit, hotel: hotel });
	}

	function hotelVisitCountries() {
		var names = {};
		visits.forEach(function (visit) {
			var hotel = visitHotel(visit);
			if (hotel && hotel.country) names[hotel.country] = true;
		});
		return Object.keys(names);
	}

	function paintVisitedCountries(travelCountries) {
		var names = {};
		if (!map || !window.TravelMaps) return;
		hotelVisitCountries().concat(travelCountries || []).forEach(function (name) {
			if (name) names[name] = true;
		});
		TravelMaps.addVisitedCountries(map, Object.keys(names));
	}

	function initMap() {
		if (typeof L === 'undefined' || !window.TravelMaps || map) return;

		map = TravelMaps.createMap('hotel-map', {
			zoomSnap: 0.25
		}).setView(ATLANTIC, ATLANTIC_ZOOM);

		visits.forEach(function (visit) {
			var hotel = visitHotel(visit);
			if (hotel && hotel.lat != null && hotel.lng != null) {
				addPin(visit, hotel);
			}
		});

		paintVisitedCountries([]);
		$.getJSON('data/travel.json').done(function (data) {
			paintVisitedCountries(TravelMaps.countriesFromTravel(data));
		});
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
