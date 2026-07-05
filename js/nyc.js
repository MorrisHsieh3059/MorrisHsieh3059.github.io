(function ($) {
	'use strict';

	var map = null;
	var streetLayer = null;
	var placeMarkers = {};
	var streetsData = null;
	var placesData = null;
	var $hoverCard = null;
	var hideCardTimer = null;
	var activePlaceId = null;
	var initialized = false;
	var carouselInstance = null;

	var MAP_FLY_OPTS = { duration: 0.55 };
	var MAP_PAD = [28, 28];

	var CATEGORIES = {
		restaurants: {
			label: 'Restaurants',
			color: '#DC143C',
			listId: '#nyc-restaurants-list'
		},
		go_to_spots: {
			label: 'Go-to spots',
			color: '#2E7D32',
			listId: '#nyc-goto-list'
		}
	};

	function formatStat(n) {
		return Number(n).toLocaleString('en-US');
	}

	function renderStats(meta) {
		if (!meta) return;
		var km = meta.totalKm || 0;
		var streets = meta.streetCount || 0;
		var since = meta.since || '2022-08-02';
		var sinceDate = new Date(since + 'T00:00:00');
		var sinceLabel = sinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

		$('#nyc-stats').html(
			formatStat(Math.round(km)) + ' km walked · ' +
			formatStat(streets) + ' streets · since ' + sinceLabel
		);
	}

	function streetStyle(count) {
		var opacity = Math.min(0.85, 0.25 + Math.log((count || 1) + 1) * 0.12);
		var weight = (count || 1) > 12 ? 7 : (count || 1) > 5 ? 6 : 5;
		return {
			color: '#FFC72C',
			weight: weight,
			opacity: opacity,
			lineCap: 'butt',
			lineJoin: 'round'
		};
	}

	function destroyCarousel() {
		if (carouselInstance) {
			carouselInstance.trigger('destroy.owl.carousel');
			carouselInstance = null;
		}
	}

	function initCarousel($root) {
		destroyCarousel();
		var $slider = $root.find('.nyc-place-carousel');
		if (!$slider.length || !$slider.find('.item').length) return;
		carouselInstance = $slider.owlCarousel({
			items: 1,
			loop: $slider.find('.item').length > 1,
			nav: true,
			dots: true,
			autoplay: false,
			navText: ['<i class="fas fa-chevron-left"></i>', '<i class="fas fa-chevron-right"></i>']
		});
	}

	function placeCardHtml(place, category) {
		var cat = CATEGORIES[category];
		var imagesHtml = '';
		if (place.images && place.images.length) {
			imagesHtml = '<div class="nyc-place-carousel owl-carousel">' +
				place.images.map(function (src) {
					return '<div class="item"><figure><img src="' + src + '" alt="' + place.name + '"></figure></div>';
				}).join('') +
				'</div>';
		} else {
			imagesHtml = '<div class="nyc-photo-placeholder"><i class="fas fa-camera"></i> Photos coming soon</div>';
		}

		return '<h5>' + place.name + '</h5>' +
			'<div class="nyc-place-meta">' + cat.label + '</div>' +
			'<p class="nyc-place-address"><a href="' + place.mapsUrl + '" target="_blank" rel="noopener noreferrer">' +
			'<i class="fas fa-map-marker-alt"></i> ' + place.address + '</a></p>' +
			'<div class="nyc-place-rating"><span class="nyc-rating-badge">' + (place.rating || 8) + ' / 10</span></div>' +
			'<p class="nyc-place-review">' + (place.review || 'TBD') + '</p>' +
			imagesHtml;
	}

	function showPlaceCard(place, category) {
		if (!$hoverCard || !place) return;
		clearTimeout(hideCardTimer);
		destroyCarousel();
		$hoverCard.html(placeCardHtml(place, category));
		$hoverCard.removeClass('restaurant goto').addClass(category === 'restaurants' ? 'restaurant' : 'goto');
		$hoverCard.addClass('visible interactive');
		initCarousel($hoverCard);
	}

	function hidePlaceCard() {
		clearTimeout(hideCardTimer);
		destroyCarousel();
		if ($hoverCard) {
			$hoverCard.removeClass('visible interactive restaurant goto');
		}
		activePlaceId = null;
	}

	function scheduleHidePlaceCard() {
		clearTimeout(hideCardTimer);
		hideCardTimer = setTimeout(function () {
			if ($hoverCard && !$hoverCard.is(':hover')) {
				hidePlaceCard();
				$('.nyc-place-item').removeClass('active');
				Object.keys(placeMarkers).forEach(function (id) {
					if (placeMarkers[id].el) {
						placeMarkers[id].el.classList.remove('highlight');
					}
				});
			}
		}, 150);
	}

	function highlightPlace(placeId) {
		activePlaceId = placeId;
		$('.nyc-place-item').removeClass('active');
		$('.nyc-place-item[data-place-id="' + placeId + '"]').addClass('active');
		Object.keys(placeMarkers).forEach(function (id) {
			if (placeMarkers[id].el) {
				placeMarkers[id].el.classList.toggle('highlight', id === placeId);
			}
		});
	}

	function flyToPlace(place) {
		if (!map || !place) return;
		map.flyTo([place.lat, place.lng], 15, MAP_FLY_OPTS);
	}

	function makePlaceIcon(color) {
		return L.divIcon({
			className: 'nyc-place-marker',
			html: '<div class="place-dot" style="--place-color:' + color + ';"><span class="place-glow"></span><span class="place-core"></span></div>',
			iconSize: [18, 18],
			iconAnchor: [9, 9]
		});
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

		$hoverCard = $('#nyc-hover-card');
		$hoverCard.on('mouseenter', function () {
			clearTimeout(hideCardTimer);
		}).on('mouseleave', function () {
			scheduleHidePlaceCard();
		});

		map.fitBounds([[40.4774, -74.2591], [40.9176, -73.7004]], { padding: MAP_PAD });

		if (streetsData) drawStreets();
		if (placesData) drawPlaces();
	}

	function drawStreets() {
		if (!map || !streetsData) return;

		if (streetLayer) {
			map.removeLayer(streetLayer);
			streetLayer = null;
		}

		streetLayer = L.layerGroup().addTo(map);
		var bounds = L.latLngBounds();
		(streetsData.streets || []).forEach(function (street) {
			var latlngs = (street.coords || []).map(function (c) {
				return L.latLng(c[1], c[0]);
			});
			if (latlngs.length < 2) return;
			L.polyline(latlngs, streetStyle(street.count)).addTo(streetLayer);
			latlngs.forEach(function (ll) { bounds.extend(ll); });
		});

		if (bounds.isValid()) {
			map.fitBounds(bounds, { padding: MAP_PAD });
		}
	}

	function bindPlaceMarker(place, category) {
		var cat = CATEGORIES[category];
		var marker = L.marker([place.lat, place.lng], {
			icon: makePlaceIcon(cat.color),
			zIndexOffset: 500
		}).addTo(map);

		var el = marker.getElement();
		var placeId = category + ':' + place.id;

		marker.on('mouseover', function () {
			highlightPlace(placeId);
			showPlaceCard(place, category);
		});
		marker.on('mouseout', function () {
			scheduleHidePlaceCard();
		});

		placeMarkers[placeId] = { marker: marker, el: el, place: place, category: category };
	}

	function drawPlaces() {
		if (!map || !placesData) return;

		Object.keys(placeMarkers).forEach(function (id) {
			map.removeLayer(placeMarkers[id].marker);
		});
		placeMarkers = {};

		Object.keys(CATEGORIES).forEach(function (category) {
			(placesData[category] || []).forEach(function (place) {
				bindPlaceMarker(place, category);
			});
		});
	}

	function renderPlaceLists() {
		Object.keys(CATEGORIES).forEach(function (category) {
			var cat = CATEGORIES[category];
			var $list = $(cat.listId);
			var places = (placesData && placesData[category]) || [];
			if (!$list.length) return;

			if (!places.length) {
				$list.html('<p class="nyc-list-empty">No places yet.</p>');
				return;
			}

			$list.html(places.map(function (place) {
				var placeId = category + ':' + place.id;
				return '<button type="button" class="nyc-place-item" data-place-id="' + placeId + '" data-category="' + category + '">' +
					'<span class="nyc-place-dot" style="background:' + cat.color + ';"></span>' +
					'<span class="nyc-place-name">' + place.name + '</span>' +
					'<span class="nyc-place-rating-mini">' + (place.rating || 8) + '/10</span>' +
					'</button>';
			}).join(''));
		});

		$('.nyc-place-item').on('mouseenter', function () {
			var $item = $(this);
			var placeId = $item.data('place-id');
			var entry = placeMarkers[placeId];
			if (!entry) return;
			highlightPlace(placeId);
			showPlaceCard(entry.place, entry.category);
			flyToPlace(entry.place);
		}).on('mouseleave', function () {
			scheduleHidePlaceCard();
		});
	}

	function loadData() {
		var streetsReq = $.getJSON('data/nyc-streets.json');
		var placesReq = $.getJSON('data/nyc-places.json');

		$.when(streetsReq, placesReq).done(function (streetsRes, placesRes) {
			streetsData = streetsRes[0];
			placesData = placesRes[0];
			renderStats(streetsData.meta);
			renderPlaceLists();
			if (map) {
				drawStreets();
				drawPlaces();
			}
		}).fail(function () {
			$('#nyc-stats').text('NYC map data unavailable.');
		});
	}

	function ensureInit() {
		if (initialized) {
			if (map) map.invalidateSize();
			return;
		}
		initialized = true;
		initMap();
		loadData();
	}

	$(document).on('click', '.section-toggle[data-section="nyc"]', function () {
		setTimeout(ensureInit, 1300);
	});

	$(window).on('load', function () {
		if ($('#nyc').hasClass('active')) {
			ensureInit();
		}
	});

}(jQuery));