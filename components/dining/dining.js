(function ($) {
	'use strict';

	var initialized = false;
	var generalInitialized = false;
	var michelinData = null;
	var generalData = null;

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
		} else if (tab === 'general') {
			ensureInitGeneral();
		}
	}

	$(document).on('click', '.dining-tab-toggle', function (e) {
		e.preventDefault();
		showDiningTab($(this).data('dining-tab'));
	});

	/*=========================================================================
		Star rating badge — an original design (small red star shapes),
		not the MICHELIN Guide's trademarked rosette/star artwork.

		visit.stars: 1-3 (number of stars at time of visit)
		visit.status: "current" | "former" (still starred today, or not)
	=========================================================================*/
	function starsHtml(visit) {
		var count = parseInt(visit.stars, 10);
		if (!count || count < 1) return '';

		var isFormer = visit.status === 'former';
		var starClass = 'mich-star' + (isFormer ? ' mich-star-former' : '');
		var stars = '';
		for (var i = 0; i < count; i++) {
			stars += '<span class="' + starClass + '"></span>';
		}

		return '<span class="michelin-stars">' + stars +
			(isFormer ? '<span class="mich-former-label">Former</span>' : '') +
			'</span>';
	}

	/*=========================================================================
		Totals banner — sum of current vs. former MICHELIN stars, counted
		once per distinct restaurant (not once per visit) so a restaurant
		you've dined at multiple times only contributes its star count a
		single time. When a restaurant has more than one visit logged, the
		most recent visit's stars/status is used, since that reflects its
		current standing.
	=========================================================================*/
	function totalsHtml(visits) {
		var latestByName = {};
		visits.forEach(function (v) {
			var key = (v.name || '').trim().toLowerCase();
			if (!key) return;
			var existing = latestByName[key];
			if (!existing || new Date(v.date) > new Date(existing.date)) {
				latestByName[key] = v;
			}
		});

		var current = 0, former = 0;
		Object.keys(latestByName).forEach(function (key) {
			var v = latestByName[key];
			var count = parseInt(v.stars, 10) || 0;
			if (v.status === 'former') {
				former += count;
			} else {
				current += count;
			}
		});

		return (
			'<span class="michelin-totals-group">' +
				'<span class="mich-star"></span>' +
				'<strong>' + current + '</strong> Current' +
			'</span>' +
			'<span class="michelin-totals-sep">|</span>' +
			'<span class="michelin-totals-group">' +
				'<span class="mich-star mich-star-former"></span>' +
				'<strong>' + former + '</strong> Former' +
			'</span>'
		);
	}

	function formatVisitDate(dateStr) {
		if (!dateStr) return '';
		var d = new Date(dateStr + 'T00:00:00');
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function photoPath(section, visit, filename) {
		return 'img/dining/' + section + '/' + visit.id + '/' + filename;
	}

	// Accolade-list logos live in components/dining/img/icons/ (copied by
	// build.js to dist/img/dining/icons/, same as photoPath's convention).
	function iconPath(filename) {
		return 'img/dining/icons/' + filename;
	}

	// Title-case a string, preserving all-caps acronyms as-is (e.g. "OAD").
	function titleCaseWord(w) {
		if (!w) return w;
		if (w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
		return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
	}

	function titleCase(str) {
		return (str || '').split(' ').map(titleCaseWord).join(' ');
	}

	/*=========================================================================
		Card + popup markup for a single visit

		Line 1: restaurant name | stars
		Line 2: cuisine, city, date
		Line 3: menu

		visit.cuisines is an array of tags (e.g. ["French", "Contemporary"])
		rather than one opaque string, so a visit can be filtered by any
		of its tags individually.
	=========================================================================*/
	function cuisineList(visit) {
		var c = visit.cuisines;
		if (Array.isArray(c)) return c.filter(Boolean);
		if (c) return [c];
		return [];
	}

	function cuisineText(visit) {
		return cuisineList(visit).join(' · ');
	}

	function titleHtml(visit) {
		return (
			'<span class="michelin-card-title-name">' + visit.name + '</span>' +
			'<span class="michelin-card-title-sep">|</span>' +
			starsHtml(visit)
		);
	}

	function metaHtml(visit) {
		return (
			'<div class="michelin-meta">' +
				'<span><i class="fas fa-utensils"></i>' + cuisineText(visit) + '</span>' +
				'<span><i class="fas fa-map-marker-alt"></i>' + (visit.city || '') + '</span>' +
				'<span><i class="fas fa-calendar-alt"></i>' + formatVisitDate(visit.date) + '</span>' +
			'</div>' +
			'<div class="michelin-meta michelin-meta-menu">' +
				'<span><i class="fas fa-clipboard-list"></i>' + (visit.menu || '') + '</span>' +
			'</div>'
		);
	}

	function cardHtml(visit) {
		var pictures = visit.pictures || [];
		var coverStyle = pictures.length
			? ' style="background-image:url(\'' + photoPath('michelin', visit, pictures[0]) + '\')"'
			: '';
		var photoInner = pictures.length
			? (pictures.length > 1
				? '<span class="michelin-card-photo-count">' + pictures.length + ' photos</span>'
				: '')
			: '<div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i></div>';

		return (
			'<a href="#popup-michelin-' + visit.id + '" class="michelin-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-menu="' + (visit.menu || '') + '">' +
				'<div class="michelin-card-photo"' + coverStyle + '>' + photoInner + '</div>' +
				'<div class="michelin-card-body">' +
					'<h4 class="michelin-card-title">' + titleHtml(visit) + '</h4>' +
					metaHtml(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtml(visit) {
		var pictures = visit.pictures || [];
		var slides = pictures.map(function (filename) {
			return '<div class="item"><figure><img src="' + photoPath('michelin', visit, filename) + '" alt="' + visit.name + '" loading="lazy"></figure></div>';
		}).join('');

		if (!slides) {
			slides = '<div class="item"><div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		}

		return (
			'<div id="popup-michelin-' + visit.id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="michelin-popup-header">' +
						'<h4>' + titleHtml(visit) + '</h4>' +
						metaHtml(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	/*=========================================================================
		Cuisine / menu filters — a custom-styled dropdown (not a native
		<select>) populated from whatever values actually appear in the
		data, filtering the grid by exact match (cards stay in the DOM,
		just hidden, so popups keep working). Custom-built specifically
		so the option text can be centered/styled — native <select>
		popups ignore that CSS in most browsers.
	=========================================================================*/
	function populateCustomSelect($container, values, allLabel) {
		var unique = [];
		values.forEach(function (v) {
			if (v && unique.indexOf(v) === -1) unique.push(v);
		});
		unique.sort(function (a, b) { return a.localeCompare(b); });

		var $list = $container.find('.michelin-select-list');
		$list.empty();
		$list.append($('<li></li>').attr('data-value', 'all').addClass('active').text(allLabel));
		unique.forEach(function (v) {
			$list.append($('<li></li>').attr('data-value', v).text(v));
		});
		$container.attr('data-value', 'all');
		$container.find('.michelin-select-btn').text(allLabel);
		sizeSelectToContent($container);
	}

	// Fix the button + list width to fit the longest option (including the
	// "All ..." label) so the control never truncates or wraps its text and
	// never needs to scroll horizontally, and doesn't resize/jump as the
	// user picks different-length options.
	function sizeSelectToContent($container) {
		var $btn = $container.find('.michelin-select-btn');
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
		$container.find('.michelin-select-list li').each(function () {
			$measure.text($(this).text());
			maxTextWidth = Math.max(maxTextWidth, $measure.outerWidth());
		});
		$measure.remove();

		// button padding is 1rem left + 1.8rem right (arrow allowance); add a
		// little slack so the text never sits flush against either edge.
		var btnPaddingLeft = parseFloat($btn.css('padding-left')) || 0;
		var btnPaddingRight = parseFloat($btn.css('padding-right')) || 0;
		var width = Math.ceil(maxTextWidth + btnPaddingLeft + btnPaddingRight + 4);

		$btn.css('width', width + 'px');
		$container.find('.michelin-select-list').css('width', width + 'px');
	}

	function populateFilters(visits) {
		var cuisineValues = [];
		visits.forEach(function (v) {
			cuisineList(v).forEach(function (tag) { cuisineValues.push(tag); });
		});
		populateCustomSelect($('#michelin-filter-cuisine'), cuisineValues, 'All Cuisines');
		populateCustomSelect($('#michelin-filter-menu'), visits.map(function (v) { return v.menu; }), 'All Menus');
	}

	function applyFilters() {
		var cuisine = $('#michelin-filter-cuisine').attr('data-value') || 'all';
		var menu = $('#michelin-filter-menu').attr('data-value') || 'all';
		var visibleCount = 0;

		$('#michelin-grid .michelin-card').each(function () {
			var $card = $(this);
			var cardCuisines = ($card.attr('data-cuisine') || '').split(',').filter(Boolean);
			var matches =
				(cuisine === 'all' || cardCuisines.indexOf(cuisine) !== -1) &&
				(menu === 'all' || $card.data('menu') === menu);

			$card.toggleClass('michelin-card-hidden', !matches);
			if (matches) visibleCount++;
		});

		$('#michelin-filter-empty').toggle(visibleCount === 0);
	}

	$(document).on('click', '.michelin-select-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		var $container = $(this).closest('.michelin-select');
		var wasOpen = $container.hasClass('open');
		$('.michelin-select').removeClass('open');
		if (!wasOpen) $container.addClass('open');
	});

	$(document).on('click', '.michelin-select-list li', function () {
		var $li = $(this);
		var $container = $li.closest('.michelin-select');
		$container.attr('data-value', $li.data('value'));
		$container.find('.michelin-select-btn').text($li.text());
		$container.find('.michelin-select-list li').removeClass('active');
		$li.addClass('active');
		$container.removeClass('open');
		applyFilters();
	});

	$(document).on('click', function (e) {
		if (!$(e.target).closest('.michelin-select').length) {
			$('.michelin-select').removeClass('open');
		}
	});

	/*=========================================================================
		General tab — same JSON-driven card/popup approach as Michelin, but
		for restaurants tracked by award lists + world rankings rather than
		MICHELIN stars.

		A restaurant can hold several simultaneous accolades (e.g. #5 on
		World's 50 Best Restaurants AND #10 on the NYT 100 Best NYC list,
		in the same year), so each is stored as its own self-contained
		entry in visit.accolades — { list, region, year, rank } — rather
		than splitting "award" and "ranking" into separate parallel
		fields, which can't represent more than one award at a time.
		region/year/rank are all optional; unranked lists just omit rank.

		visit.accolades[].list is a slug drawn from the finite ACCOLADE_LISTS
		set below (not freeform text) — this is a closed set by design, not
		an open one, so every entry gets its real award-list logo instead
		of however the raw name was typed. To retire/add a list, edit this
		table — nothing else needs to change. A slug that isn't in the
		table still renders (title-cased text, no logo) rather than
		breaking, but that should only ever happen for a typo, since the
		set itself is meant to be exhaustive.

		icon filenames are resolved via iconPath() to
		img/dining/icons/<file> (component source: components/dining/img/icons/).

		Card + popup layout:
			Line 1: restaurant name
			Line 2+: one line per accolade (logo + list · region · year — #rank)
			Next: cuisines
			Next: city, date
			Next: menu
	=========================================================================*/
	var ACCOLADE_LISTS = {
		'50-best-restaurants': { label: 'World\'s 50 Best Restaurants', icon: '50-best.svg' },
		'50-best-bars': { label: 'World\'s 50 Best Bars', icon: '50-best.svg' },
		'101-best-steakhouse': { label: '101 Best Steakhouses', icon: '101-best-steakhouses.png' },
		'101-best-burgers': { label: '101 Best Burgers', icon: '101-best-burgers.png' },
		'50-best-pizza': { label: '50 Top Pizza', icon: '50-top-pizza.svg' },
		'oad-top-restaurants': { label: 'OAD — Top Restaurants', icon: 'oad.svg' },
		'oad-casual': { label: 'OAD — Casual', icon: 'oad.svg' },
		'oad-cheap-eats': { label: 'OAD — Cheap Eats', icon: 'oad.svg' }
	};

	function accoladeListMeta(slug) {
		return ACCOLADE_LISTS[slug] || {
			label: titleCase((slug || '').replace(/-/g, ' ')),
			icon: null
		};
	}

	function accoladesList(visit) {
		var a = visit.accolades;
		return Array.isArray(a) ? a.filter(function (x) { return x && x.list; }) : [];
	}

	function accoladeLine(a) {
		var meta = accoladeListMeta(a.list);
		var parts = [meta.label];
		if (a.region) parts.push(a.region);
		if (a.year) parts.push(String(a.year));
		var text = parts.join(' · ');
		if (a.rank !== undefined && a.rank !== null && a.rank !== '') {
			text += ' — #' + a.rank;
		}
		return { text: text, icon: meta.icon };
	}

	function accoladesHtml(visit) {
		var accolades = accoladesList(visit);
		if (!accolades.length) return '';
		var lines = accolades.map(function (a) {
			var line = accoladeLine(a);
			var iconHtml = line.icon
				? '<img class="general-accolade-icon" src="' + iconPath(line.icon) + '" alt="">'
				: '';
			return '<div class="general-accolade">' + iconHtml + '<span>' + line.text + '</span></div>';
		}).join('');
		return '<div class="general-accolades">' + lines + '</div>';
	}

	function titleHtmlGeneral(visit) {
		return '<span class="general-card-title-name">' + visit.name + '</span>';
	}

	function metaHtmlGeneral(visit) {
		var cuisines = cuisineText(visit);

		return (
			(cuisines ? '<div class="general-meta"><span><i class="fas fa-utensils"></i>' + cuisines + '</span></div>' : '') +
			'<div class="general-meta">' +
				'<span><i class="fas fa-map-marker-alt"></i>' + (visit.city || '') + '</span>' +
				'<span><i class="fas fa-calendar-alt"></i>' + formatVisitDate(visit.date) + '</span>' +
			'</div>' +
			'<div class="general-meta general-meta-menu">' +
				'<span><i class="fas fa-clipboard-list"></i>' + titleCase(visit.menu) + '</span>' +
			'</div>'
		);
	}

	function cardHtmlGeneral(visit) {
		var pictures = visit.pictures || [];
		var coverStyle = pictures.length
			? ' style="background-image:url(\'' + photoPath('general', visit, pictures[0]) + '\')"'
			: '';
		var photoInner = pictures.length
			? (pictures.length > 1
				? '<span class="general-card-photo-count">' + pictures.length + ' photos</span>'
				: '')
			: '<div class="general-card-photo-placeholder"><i class="fas fa-camera"></i></div>';

		return (
			'<a href="#popup-general-' + visit.id + '" class="general-card">' +
				'<div class="general-card-photo"' + coverStyle + '>' + photoInner + '</div>' +
				'<div class="general-card-body">' +
					'<h4 class="general-card-title">' + titleHtmlGeneral(visit) + '</h4>' +
					accoladesHtml(visit) +
					metaHtmlGeneral(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtmlGeneral(visit) {
		var pictures = visit.pictures || [];
		var slides = pictures.map(function (filename) {
			return '<div class="item"><figure><img src="' + photoPath('general', visit, filename) + '" alt="' + visit.name + '" loading="lazy"></figure></div>';
		}).join('');

		if (!slides) {
			slides = '<div class="item"><div class="general-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		}

		return (
			'<div id="popup-general-' + visit.id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="general-popup-header">' +
						'<h4>' + titleHtmlGeneral(visit) + '</h4>' +
						accoladesHtml(visit) +
						metaHtmlGeneral(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	function renderGeneral(visits) {
		var $grid = $('#general-grid');

		if (!visits || !visits.length) {
			$grid.html('<p class="general-empty">No favorites logged yet — check back soon!</p>');
			return;
		}

		visits = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = visits.map(cardHtmlGeneral).join('');
		var popupsHtml = visits.map(popupHtmlGeneral).join('');
		$grid.html(cardsHtml + popupsHtml);

		$grid.find('.general-card').magnificPopup({
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in michelin-popup general-popup',
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

	function loadGeneralData() {
		$.getJSON('data/general.json').done(function (data) {
			generalData = data;
			renderGeneral(data);
		}).fail(function () {
			$('#general-grid').html('<p class="general-empty">Favorites data unavailable.</p>');
		});
	}

	function ensureInitGeneral() {
		if (generalInitialized) return;
		generalInitialized = true;
		loadGeneralData();
	}

	/*=========================================================================
		Render the grid + wire up popups
	=========================================================================*/
	function render(visits) {
		var $grid = $('#michelin-grid');
		var $totals = $('#michelin-totals');

		if (!visits || !visits.length) {
			$totals.empty();
			$('#michelin-filters').hide();
			$grid.html('<p class="michelin-empty">No MICHELIN visits logged yet — check back soon!</p>');
			return;
		}

		$totals.html(totalsHtml(visits));
		populateFilters(visits);

		// Sort newest visit first.
		visits = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = visits.map(cardHtml).join('');
		var popupsHtml = visits.map(popupHtml).join('');
		$grid.html(cardsHtml + popupsHtml);
		applyFilters();

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
		click that requested a specific tab.
	=========================================================================*/
	$(document).on('click', '.section-toggle[data-section="dining"]', function () {
		var tab = $(this).data('dining-tab');
		if (tab) {
			setTimeout(function () { showDiningTab(tab); }, 1300);
		} else if ($('.dining-panel[data-dining-panel="michelin"]').hasClass('active')) {
			setTimeout(ensureInit, 1300);
		} else if ($('.dining-panel[data-dining-panel="general"]').hasClass('active')) {
			setTimeout(ensureInitGeneral, 1300);
		}
	});

	$(window).on('load', function () {
		if (!$('#dining').hasClass('active')) return;
		if ($('.dining-panel[data-dining-panel="michelin"]').hasClass('active')) {
			ensureInit();
		} else if ($('.dining-panel[data-dining-panel="general"]').hasClass('active')) {
			ensureInitGeneral();
		}
	});

}(jQuery));
