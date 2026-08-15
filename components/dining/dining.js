(function ($) {
	'use strict';

	var initialized = false;
	var awardInitialized = false;
	var michelinData = null;
	var awardData = null;

	/*=========================================================================
		Award / Michelin tab switching — driven by both the in-section
		tabs and the sidebar submenu links (both share the same
		[data-dining-tab] attribute + .dining-tab-toggle class).
	=========================================================================*/
	function showDiningTab(tab) {
		if (tab !== 'award' && tab !== 'michelin' && tab !== 'gourmand') return;

		$('.dining-tab-toggle').removeClass('active');
		$('.dining-tab-toggle[data-dining-tab="' + tab + '"]').addClass('active');

		$('.dining-panel').removeClass('active');
		$('.dining-panel[data-dining-panel="' + tab + '"]').addClass('active');

		if (tab === 'michelin' || tab === 'gourmand') {
			ensureInit();
		} else if (tab === 'award') {
			ensureInitAward();
		}
	}

	$(document).on('click', '.dining-tab-toggle', function (e) {
		e.preventDefault();
		showDiningTab($(this).data('dining-tab'));
	});

	/*=========================================================================
		Star rating badge — an original design (small red star shapes),
		not the MICHELIN Guide's trademarked rosette/star artwork. This tab
		is stars only now — Bib Gourmand / Recommended listings live on the
		separate Gourmand tab (see rankHtml below).

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

	/*=========================================================================
		Shared-kitchen tag — some MICHELIN listings are one of several
		concepts operating out of the same physical kitchen/space (e.g. a
		bar program and a restaurant sharing one kitchen). visit.sub is
		optional; only isSharedKitchen: true renders anything.

		visit.sub: { isSharedKitchen: true|false, name: "" }
	=========================================================================*/
	function sharedKitchenHtml(visit) {
		var sub = visit.sub;
		if (!sub || !sub.isSharedKitchen) return '';
		var name = sub.name || '';
		return '<div class="michelin-shared-kitchen">' +
			'<i class="fas fa-share-alt"></i>' +
			(name ? '' + name : '') +
			'</div>';
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
					sharedKitchenHtml(visit) +
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
						sharedKitchenHtml(visit) +
						metaHtml(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	/*=========================================================================
		Gourmand tab — MICHELIN Guide distinctions below full star status:
		Bib Gourmand and Selected. Kept in the same michelin.json file as
		the starred visits (one restaurant list, one source of truth) but
		rendered on its own tab/grid, split out by visit.rank.

		visit.rank: 'gourmand' | 'selected' (mutually exclusive with
		visit.stars — a visit is either a starred entry or a Gourmand-tab
		entry, never both)
		visit.status: "current" | "former" (still holds the distinction
		today, or not)

		Card/popup markup, filters and photoPath all reuse the michelin
		tab's plumbing (same .michelin-card/.michelin-popup-header markup,
		same img/dining/michelin/<id>/ photo folders) since a Gourmand
		listing is structurally identical to a starred one apart from the
		badge — only the title line (rank icon instead of stars) differs.
	=========================================================================*/
	var RANK_META = {
		gourmand: { label: 'Gourmand', icon: 'bib.png' },
		selected: { label: 'Selected', icon: 'selected.png' }
	};

	function isGourmandVisit(visit) {
		return visit.rank === 'gourmand' || visit.rank === 'selected';
	}

	function rankHtml(visit) {
		var meta = RANK_META[visit.rank];
		if (!meta) return '';
		var isFormer = visit.status === 'former';
		var rankClass = 'mich-bib-icon' + (isFormer ? ' mich-bib-icon-former' : '');
		return '<span class="michelin-stars">' +
			'<img class="' + rankClass + '" src="' + iconPath(meta.icon) + '" alt="' + meta.label + '">' +
			(isFormer ? '<span class="mich-former-label">Former</span>' : '') +
			'</span>';
	}

	function titleHtmlGourmand(visit) {
		return (
			'<span class="michelin-card-title-name">' + visit.name + '</span>' +
			'<span class="michelin-card-title-sep">|</span>' +
			rankHtml(visit)
		);
	}

	function cardHtmlGourmand(visit) {
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
			'<a href="#popup-gourmand-' + visit.id + '" class="michelin-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-menu="' + (visit.menu || '') + '">' +
				'<div class="michelin-card-photo"' + coverStyle + '>' + photoInner + '</div>' +
				'<div class="michelin-card-body">' +
					'<h4 class="michelin-card-title">' + titleHtmlGourmand(visit) + '</h4>' +
					sharedKitchenHtml(visit) +
					metaHtml(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtmlGourmand(visit) {
		var pictures = visit.pictures || [];
		var slides = pictures.map(function (filename) {
			return '<div class="item"><figure><img src="' + photoPath('michelin', visit, filename) + '" alt="' + visit.name + '" loading="lazy"></figure></div>';
		}).join('');

		if (!slides) {
			slides = '<div class="item"><div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		}

		return (
			'<div id="popup-gourmand-' + visit.id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="michelin-popup-header">' +
						'<h4>' + titleHtmlGourmand(visit) + '</h4>' +
						sharedKitchenHtml(visit) +
						metaHtml(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	// Current/former count per rank, same dedup-by-restaurant-name approach
	// as the star tab's totalsHtml.
	function rankTotalsHtml(visits) {
		var latestByName = {};
		visits.forEach(function (v) {
			var key = (v.name || '').trim().toLowerCase();
			if (!key) return;
			var existing = latestByName[key];
			if (!existing || new Date(v.date) > new Date(existing.date)) {
				latestByName[key] = v;
			}
		});

		var groups = ['gourmand', 'selected'].map(function (rank) {
			var current = 0, former = 0;
			Object.keys(latestByName).forEach(function (key) {
				var v = latestByName[key];
				if (v.rank !== rank) return;
				if (v.status === 'former') { former++; } else { current++; }
			});
			var meta = RANK_META[rank];
			return (
				'<span class="michelin-totals-group">' +
					'<img class="mich-bib-icon" src="' + iconPath(meta.icon) + '" alt="' + meta.label + '">' +
					'<strong>' + current + '</strong> Current' +
				'</span>' +
				'<span class="michelin-totals-sep">|</span>' +
				'<span class="michelin-totals-group">' +
					'<img class="mich-bib-icon mich-bib-icon-former" src="' + iconPath(meta.icon) + '" alt="' + meta.label + '">' +
					'<strong>' + former + '</strong> Former' +
				'</span>'
			);
		});
		return groups.join('<span class="michelin-totals-sep">|</span>');
	}

	function populateFiltersGourmand(visits) {
		var cuisineValues = [];
		visits.forEach(function (v) {
			cuisineList(v).forEach(function (tag) { cuisineValues.push(tag); });
		});
		populateCustomSelect($('#gourmand-filter-cuisine'), cuisineValues, 'All Cuisines');
		populateCustomSelect($('#gourmand-filter-menu'), visits.map(function (v) { return v.menu; }), 'All Menus');
	}

	function applyFiltersGourmand() {
		var cuisine = $('#gourmand-filter-cuisine').attr('data-value') || 'all';
		var menu = $('#gourmand-filter-menu').attr('data-value') || 'all';
		var visibleCount = 0;

		$('#gourmand-grid .michelin-card').each(function () {
			var $card = $(this);
			var cardCuisines = ($card.attr('data-cuisine') || '').split(',').filter(Boolean);
			var matches =
				(cuisine === 'all' || cardCuisines.indexOf(cuisine) !== -1) &&
				(menu === 'all' || $card.data('menu') === menu);

			$card.toggleClass('michelin-card-hidden', !matches);
			if (matches) visibleCount++;
		});

		$('#gourmand-filter-empty').toggle(visibleCount === 0);
	}

	function renderGourmand(visits) {
		var $grid = $('#gourmand-grid');
		var $totals = $('#gourmand-totals');

		if (!visits || !visits.length) {
			$totals.empty();
			$('#gourmand-filters').hide();
			$grid.html('<p class="michelin-empty">No Gourmand/Recommended visits logged yet — check back soon!</p>');
			return;
		}

		$totals.html(rankTotalsHtml(visits));
		populateFiltersGourmand(visits);

		visits = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = visits.map(cardHtmlGourmand).join('');
		var popupsHtml = visits.map(popupHtmlGourmand).join('');
		$grid.html(cardsHtml + popupsHtml);
		applyFiltersGourmand();

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

		// The dropdown widget (.michelin-select) is shared styling/behavior
		// across tabs — which grid it actually filters depends on which
		// tab's panel it lives in.
		var panel = $container.closest('.dining-panel').data('dining-panel');
		if (panel === 'award') {
			applyAwardFilters();
		} else if (panel === 'gourmand') {
			applyFiltersGourmand();
		} else {
			applyFilters();
		}
	});

	$(document).on('click', function (e) {
		if (!$(e.target).closest('.michelin-select').length) {
			$('.michelin-select').removeClass('open');
		}
	});

	/*=========================================================================
		Award tab — same JSON-driven card/popup approach as Michelin, but
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
		'nyt-100-best-restaurants': { label: 'NYT\'s 100 Best Restaurants', icon: 'nyt-100-best-restaurants.png' },
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
				? '<img class="award-accolade-icon" src="' + iconPath(line.icon) + '" alt="">'
				: '';
			return '<div class="award-accolade">' + iconHtml + '<span>' + line.text + '</span></div>';
		}).join('');
		return '<div class="award-accolades">' + lines + '</div>';
	}

	function titleHtmlAward(visit) {
		return '<span class="award-card-title-name">' + visit.name + '</span>';
	}

	function metaHtmlAward(visit) {
		var cuisines = cuisineText(visit);

		return (
			(cuisines ? '<div class="award-meta"><span><i class="fas fa-utensils"></i>' + cuisines + '</span></div>' : '') +
			'<div class="award-meta">' +
				'<span><i class="fas fa-map-marker-alt"></i>' + (visit.city || '') + '</span>' +
				'<span><i class="fas fa-calendar-alt"></i>' + formatVisitDate(visit.date) + '</span>' +
			'</div>' +
			'<div class="award-meta award-meta-menu">' +
				'<span><i class="fas fa-clipboard-list"></i>' + titleCase(visit.menu) + '</span>' +
			'</div>'
		);
	}

	function cardHtmlAward(visit) {
		var pictures = visit.pictures || [];
		var coverStyle = pictures.length
			? ' style="background-image:url(\'' + photoPath('award', visit, pictures[0]) + '\')"'
			: '';
		var photoInner = pictures.length
			? (pictures.length > 1
				? '<span class="award-card-photo-count">' + pictures.length + ' photos</span>'
				: '')
			: '<div class="award-card-photo-placeholder"><i class="fas fa-camera"></i></div>';
		var accoladeSlugs = accoladesList(visit).map(function (a) { return a.list; }).filter(Boolean);

		return (
			'<a href="#popup-award-' + visit.id + '" class="award-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-accolades="' + accoladeSlugs.join(',') + '">' +
				'<div class="award-card-photo"' + coverStyle + '>' + photoInner + '</div>' +
				'<div class="award-card-body">' +
					'<h4 class="award-card-title">' + titleHtmlAward(visit) + '</h4>' +
					accoladesHtml(visit) +
					metaHtmlAward(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtmlAward(visit) {
		var pictures = visit.pictures || [];
		var slides = pictures.map(function (filename) {
			return '<div class="item"><figure><img src="' + photoPath('award', visit, filename) + '" alt="' + visit.name + '" loading="lazy"></figure></div>';
		}).join('');

		if (!slides) {
			slides = '<div class="item"><div class="award-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		}

		return (
			'<div id="popup-award-' + visit.id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="award-popup-header">' +
						'<h4>' + titleHtmlAward(visit) + '</h4>' +
						accoladesHtml(visit) +
						metaHtmlAward(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel">' + slides + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	/*=========================================================================
		Stats banner — distinct-restaurant count per named accolade group
		(not per accolade entry: a restaurant with two "50 Best Restaurants"
		rankings in the same year, e.g. a regional + a global rank, still
		only counts once, same dedup-by-name principle as the MICHELIN
		star totals above). Only these six groups get a tile, by design —
		OAD's three tiers aren't shown here.
	=========================================================================*/
	var AWARD_STAT_GROUPS = [
		{ list: '50-best-restaurants', label: 'Top 50 Restaurant' },
		{ list: '50-best-bars', label: 'Top 50 Bars' },
		{ list: '101-best-steakhouse', label: '101 Best Steakhouse' },
		{ list: '101-best-burgers', label: '101 Best Burgers' },
		{ list: '50-best-pizza', label: 'Top 50 Pizza' },
		{ list: 'nyt-100-best-restaurants', label: 'NYT 100 Best' }
	];

	function awardTotalsHtml(visits) {
		var groupsHtml = AWARD_STAT_GROUPS.map(function (group) {
			var names = {};
			visits.forEach(function (v) {
				var key = (v.name || '').trim().toLowerCase();
				if (!key) return;
				var hasThisList = accoladesList(v).some(function (a) { return a.list === group.list; });
				if (hasThisList) names[key] = true;
			});
			var count = Object.keys(names).length;
			var icon = accoladeListMeta(group.list).icon;
			var iconHtml = icon
				? '<img class="award-totals-icon" src="' + iconPath(icon) + '" alt="">'
				: '';
			return (
				'<span class="award-totals-group">' +
					iconHtml +
					'<span>' + group.label + '</span> ' +
					'<strong>' + count + '</strong>' +
				'</span>'
			);
		});
		return groupsHtml.join('<span class="award-totals-sep">|</span>');
	}

	/*=========================================================================
		Cuisine + accolade-list filters — same custom dropdown widget as the
		MICHELIN tab's Cuisine/Menu filters (shared .michelin-select markup
		and click handlers), just pointed at the Award grid/cards instead.
	=========================================================================*/
	function populateAccoladeSelect($container, slugs, allLabel) {
		var unique = [];
		slugs.forEach(function (v) {
			if (v && unique.indexOf(v) === -1) unique.push(v);
		});
		unique.sort(function (a, b) {
			return accoladeListMeta(a).label.localeCompare(accoladeListMeta(b).label);
		});

		var $list = $container.find('.michelin-select-list');
		$list.empty();
		$list.append($('<li></li>').attr('data-value', 'all').addClass('active').text(allLabel));
		unique.forEach(function (v) {
			$list.append($('<li></li>').attr('data-value', v).text(accoladeListMeta(v).label));
		});
		$container.attr('data-value', 'all');
		$container.find('.michelin-select-btn').text(allLabel);
		sizeSelectToContent($container);
	}

	function populateAwardFilters(visits) {
		var cuisineValues = [];
		var accoladeValues = [];
		visits.forEach(function (v) {
			cuisineList(v).forEach(function (tag) { cuisineValues.push(tag); });
			accoladesList(v).forEach(function (a) { if (a.list) accoladeValues.push(a.list); });
		});
		populateCustomSelect($('#award-filter-cuisine'), cuisineValues, 'All Cuisines');
		populateAccoladeSelect($('#award-filter-accolade'), accoladeValues, 'All Lists');
	}

	function applyAwardFilters() {
		var cuisine = $('#award-filter-cuisine').attr('data-value') || 'all';
		var accolade = $('#award-filter-accolade').attr('data-value') || 'all';
		var visibleCount = 0;

		$('#award-grid .award-card').each(function () {
			var $card = $(this);
			var cardCuisines = ($card.attr('data-cuisine') || '').split(',').filter(Boolean);
			var cardAccolades = ($card.attr('data-accolades') || '').split(',').filter(Boolean);
			var matches =
				(cuisine === 'all' || cardCuisines.indexOf(cuisine) !== -1) &&
				(accolade === 'all' || cardAccolades.indexOf(accolade) !== -1);

			$card.toggleClass('award-card-hidden', !matches);
			if (matches) visibleCount++;
		});

		$('#award-filter-empty').toggle(visibleCount === 0);
	}

	function renderAward(visits) {
		var $grid = $('#award-grid');
		var $totals = $('#award-totals');

		if (!visits || !visits.length) {
			$totals.empty();
			$('#award-filters').hide();
			$grid.html('<p class="award-empty">No favorites logged yet — check back soon!</p>');
			return;
		}

		$totals.html(awardTotalsHtml(visits));
		populateAwardFilters(visits);

		visits = visits.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = visits.map(cardHtmlAward).join('');
		var popupsHtml = visits.map(popupHtmlAward).join('');
		$grid.html(cardsHtml + popupsHtml);
		applyAwardFilters();

		$grid.find('.award-card').magnificPopup({
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in michelin-popup award-popup',
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

	function loadAwardData() {
		$.getJSON('data/award.json').done(function (data) {
			awardData = data;
			renderAward(data);
		}).fail(function () {
			$('#award-grid').html('<p class="award-empty">Favorites data unavailable.</p>');
		});
	}

	function ensureInitAward() {
		if (awardInitialized) return;
		awardInitialized = true;
		loadAwardData();
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

	// One JSON file backs both the Michelin (star) and Gourmand tabs, split
	// client-side by visit.rank — so a single fetch renders both grids
	// regardless of which tab the user opened first.
	function loadData() {
		$.getJSON('data/michelin.json').done(function (data) {
			michelinData = data;
			render(data.filter(function (v) { return !isGourmandVisit(v); }));
			renderGourmand(data.filter(isGourmandVisit));
		}).fail(function () {
			$('#michelin-grid').html('<p class="michelin-empty">Michelin visit data unavailable.</p>');
			$('#gourmand-grid').html('<p class="michelin-empty">Michelin visit data unavailable.</p>');
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
		} else if ($('.dining-panel[data-dining-panel="award"]').hasClass('active')) {
			setTimeout(ensureInitAward, 1300);
		} else {
			setTimeout(ensureInit, 1300);
		}
	});

	$(window).on('load', function () {
		if (!$('#dining').hasClass('active')) return;
		if ($('.dining-panel[data-dining-panel="award"]').hasClass('active')) {
			ensureInitAward();
		} else {
			ensureInit();
		}
	});

}(jQuery));
