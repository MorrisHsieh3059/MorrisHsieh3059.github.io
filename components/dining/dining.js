(function ($) {
	'use strict';

	var initialized = false;
	var michelinData = null;

	/*=========================================================================
		General / Michelin tab switching — driven by both the in-section
		tabs and the sidebar submenu links (both share the same
		[data-dining-tab] attribute + .dining-tab-toggle class).
	=========================================================================*/
	function showDiningTab(tab) {
		if (tab !== 'general' && tab !== 'michelin') return;

		$('.dining-tab-toggle').removeClass('active');
		$('.dining-tab-toggle[data-dining-tab="' + tab + '"]').addClass('active');

		$('.dining-panel').removeClass('active');
		$('.dining-panel[data-dining-panel="' + tab + '"]').addClass('active');

		if (tab === 'michelin') {
			ensureInit();
		}
	}

	$(document).on('click', '.dining-tab-toggle', function (e) {
		e.preventDefault();
		showDiningTab($(this).data('dining-tab'));
	});

	/*=========================================================================
		Star rating badge — an original design (small red star shapes),
		not the MICHELIN Guide's trademarked rosette/star artwork.
	=========================================================================*/
	function starsHtml(rating) {
		var m = /^(ex-)?([1-3])-star$/.exec(rating || '');
		if (!m) return '';

		var isFormer = !!m[1];
		var count = parseInt(m[2], 10);
		var starClass = 'mich-star' + (isFormer ? ' mich-star-former' : '');
		var stars = '';
		for (var i = 0; i < count; i++) {
			stars += '<span class="' + starClass + '"></span>';
		}

		return '<span class="michelin-stars">' + stars +
			(isFormer ? '<span class="mich-former-label">Former</span>' : '') +
			'</span>';
	}

	function formatVisitDate(dateStr) {
		if (!dateStr) return '';
		var d = new Date(dateStr + 'T00:00:00');
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function photoPath(visit, filename) {
		return 'img/dining/michelin/' + visit.id + '/' + filename;
	}

	/*=========================================================================
		Card + popup markup for a single visit
	=========================================================================*/
	function cardHtml(visit) {
		var pictures = visit.pictures || [];
		var coverStyle = pictures.length
			? ' style="background-image:url(\'' + photoPath(visit, pictures[0]) + '\')"'
			: '';
		var photoInner = pictures.length
			? (pictures.length > 1
				? '<span class="michelin-card-photo-count">' + pictures.length + ' photos</span>'
				: '')
			: '<div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i></div>';

		return (
			'<a href="#popup-michelin-' + visit.id + '" class="michelin-card">' +
				'<div class="michelin-card-photo"' + coverStyle + '>' + photoInner + '</div>' +
				'<div class="michelin-card-body">' +
					'<h4 class="michelin-card-title">' +
						'<span>' + visit.name + '</span>' +
						'<span class="michelin-card-title-sep">|</span>' +
						starsHtml(visit.rating) +
					'</h4>' +
					'<div class="michelin-meta">' +
						'<span><i class="fas fa-calendar-alt"></i>' + formatVisitDate(visit.date) + '</span>' +
						'<span><i class="fas fa-map-marker-alt"></i>' + (visit.city || '') + '</span>' +
						'<span><i class="fas fa-utensils"></i>' + (visit.cuisine || '') + '</span>' +
						'<span><i class="fas fa-clipboard-list"></i>' + (visit.menu || '') + '</span>' +
					'</div>' +
				'</div>' +
			'</a>'
		);
	}

	function popupHtml(visit) {
		var pictures = visit.pictures || [];
		var slides = pictures.map(function (filename) {
			return '<div class="item"><figure><img src="' + photoPath(visit, filename) + '" alt="' + visit.name + '" loading="lazy"></figure></div>';
		}).join('');

		if (!slides) {
			slides = '<div class="item"><div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		}

		return (
			'<div id="popup-michelin-' + visit.id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="michelin-popup-header">' +
						'<h4><span>' + visit.name + '</span> <span class="michelin-card-title-sep">|</span> ' + starsHtml(visit.rating) + '</h4>' +
						'<div class="michelin-meta">' +
							'<span><i class="fas fa-calendar-alt"></i>' + formatVisitDate(visit.date) + '</span>' +
							'<span><i class="fas fa-map-marker-alt"></i>' + (visit.city || '') + '</span>' +
							'<span><i class="fas fa-utensils"></i>' + (visit.cuisine || '') + '</span>' +
							'<span><i class="fas fa-clipboard-list"></i>' + (visit.menu || '') + '</span>' +
						'</div>' +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	/*=========================================================================
		Render the grid + wire up popups
	=========================================================================*/
	function render(visits) {
		var $grid = $('#michelin-grid');

		if (!visits || !visits.length) {
			$grid.html('<p class="michelin-empty">No MICHELIN visits logged yet — check back soon!</p>');
			return;
		}

		// Sort newest visit first.
		visits = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = visits.map(cardHtml).join('');
		var popupsHtml = visits.map(popupHtml).join('');
		$grid.html(cardsHtml + popupsHtml);

		$grid.find('.michelin-card').magnificPopup({
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in michelin-popup',
			callbacks: {
				open: function () {
					this.content.find('.popup-slider').owlCarousel({
						items: 1,
						loop: this.content.find('.popup-slider .item').length > 1,
						nav: true,
						dots: true,
						autoplay: false,
						navText: ['<i class="fas fa-chevron-left"></i>', '<i class="fas fa-chevron-right"></i>']
					});
				},
				close: function () {
					var $slider = this.content.find('.popup-slider');
					if ($slider.data('owl.carousel')) {
						$slider.trigger('destroy.owl.carousel');
					}
				}
			}
		});
	}

	function loadData() {
		$.getJSON('data/michelin.json').done(function (data) {
			michelinData = data;
			render(data);
		}).fail(function () {
			$('#michelin-grid').html('<p class="michelin-empty">Michelin visit data unavailable.</p>');
		});
	}

	function ensureInit() {
		if (initialized) return;
		initialized = true;
		loadData();
	}

	/*=========================================================================
		Lazy-init once the Dining section is actually visited (matches the
		pattern used by nyc.js / travel.js), and honor a sidebar submenu
		click that requested the Michelin tab specifically.
	=========================================================================*/
	$(document).on('click', '.section-toggle[data-section="dining"]', function () {
		var tab = $(this).data('dining-tab');
		if (tab) {
			setTimeout(function () { showDiningTab(tab); }, 1300);
		} else if ($('.dining-panel[data-dining-panel="michelin"]').hasClass('active')) {
			setTimeout(ensureInit, 1300);
		}
	});

	$(window).on('load', function () {
		if ($('#dining').hasClass('active') && $('.dining-panel[data-dining-panel="michelin"]').hasClass('active')) {
			ensureInit();
		}
	});

}(jQuery));
