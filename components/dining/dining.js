(function ($) {
	'use strict';

	var initialized = false;
	var awardInitialized = false;
	var timelineRendered = false;
	var timelineBound = false;
	var michelinData = null;
	var awardData = null;

	/*=========================================================================
		Award / Michelin tab switching — driven by both the in-section
		tabs and the sidebar submenu links (both share the same
		[data-dining-tab] attribute + .dining-tab-toggle class).
	=========================================================================*/
	function showDiningTab(tab) {
		if (tab !== 'award' && tab !== 'michelin' && tab !== 'gourmand' && tab !== 'timeline') return;

		$('.dining-tab-toggle').removeClass('active');
		$('.dining-tab-toggle[data-dining-tab="' + tab + '"]').addClass('active');

		$('.dining-panel').removeClass('active');
		$('.dining-panel[data-dining-panel="' + tab + '"]').addClass('active');

		if (tab === 'timeline') {
			ensureInit();
			ensureInitAward();
			tryRenderTimeline();
			if (isTimelineVertical()) {
				var diningEl = document.getElementById('dining');
				if (diningEl) diningEl.scrollTop = 0;
			}
		} else if (tab === 'michelin' || tab === 'gourmand') {
			ensureInit();
		} else if (tab === 'award') {
			ensureInitAward();
		}
	}

	function applyDiningRoute(route, meta) {
		if (!route || route.section !== 'dining') return;
		var tab = route.diningTab || 'timeline';
		var delay = meta && meta.animated ? (meta.swapMs || 500) : 0;
		setTimeout(function () { showDiningTab(tab); }, delay);
	}

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

	// Visit photos live in components/dining/img/visits/<id>/ — one folder
	// per visit, shared by the Award and Michelin tabs when a meal appears
	// on both. build.js copies this to dist/img/dining/visits/.
	//
	// 0.jpeg       lightbox (web-sized, see scripts/compress-dining-photos.py)
	// 0.thumb.jpeg card cover
	function photoPath(visit, filename, variant) {
		var name = filename;
		if (variant === 'thumb') {
			name = filename.replace(/(\.[^.]+)$/, '.thumb$1');
		}
		return 'img/dining/visits/' + visit.id + '/' + name;
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	function coverHtml(visit, countClass) {
		var pictures = visit.pictures || [];
		if (!pictures.length) {
			return '<div class="michelin-card-photo"><div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i></div></div>';
		}
		var count = pictures.length > 1
			? '<span class="' + countClass + '">' + pictures.length + ' photos</span>'
			: '';
		return '<div class="michelin-card-photo">' +
			'<img data-src="' + photoPath(visit, pictures[0], 'thumb') + '" alt="" decoding="async">' +
			count + '</div>';
	}

	function hydrateCovers(root) {
		var scope = root && root.querySelectorAll ? root : document;
		var imgs = scope.querySelectorAll('.michelin-card-photo img[data-src], .award-card-photo img[data-src]');
		if (!imgs.length) return;

		function reveal(img) {
			if (!img.dataset.src) return;
			img.src = img.dataset.src;
			img.removeAttribute('data-src');
		}

		if (!('IntersectionObserver' in window)) {
			for (var i = 0; i < imgs.length; i++) reveal(imgs[i]);
			return;
		}

		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				reveal(entry.target);
				io.unobserve(entry.target);
			});
		}, { rootMargin: '160px' });

		for (var j = 0; j < imgs.length; j++) io.observe(imgs[j]);
	}

	function popupPhotoAttrs(visit) {
		return ' data-photo-base="' + escapeAttr('img/dining/visits/' + visit.id) + '"' +
			' data-photos="' + escapeAttr((visit.pictures || []).join(',')) + '"' +
			' data-photo-alt="' + escapeAttr(visit.name) + '"';
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
			html = '<div class="item"><div class="michelin-card-photo-placeholder"><i class="fas fa-camera"></i> No photos yet</div></div>';
		} else {
			html = photos.map(function (filename) {
				return '<div class="item"><figure><img src="' + base + '/' + filename + '" alt="' + escapeAttr(alt) + '" decoding="async"></figure></div>';
			}).join('');
		}
		$slider.html(html);
		return $slider;
	}

	var POPUP_NAV = ['<i class="fas fa-chevron-left"></i>', '<i class="fas fa-chevron-right"></i>'];

	function bindVisitPopups($cards, extraClass) {
		$cards.magnificPopup({
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in michelin-popup' + (extraClass ? ' ' + extraClass : ''),
			callbacks: {
				open: function () {
					var $slider = fillPopupSlider(this.content);
					$slider.owlCarousel({
						items: 1,
						loop: $slider.find('.item').length > 1,
						nav: true,
						dots: true,
						autoplay: false,
						navText: POPUP_NAV
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

	function visitPopupNs(popupNs, fallback) {
		return typeof popupNs === 'string' && popupNs ? popupNs : fallback;
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

		Michelin / Timeline title is the kitchen that holds the Michelin
		distinction (The Modern). sub.name is the room actually visited
		(The Bar Room at the Modern). Award-tab title is separate: if the
		sister room itself holds the accolade, award.json uses that name.

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

	function cardHtml(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'michelin');
		return (
			'<a href="#popup-' + popupNs + '-' + visit.id + '" class="michelin-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-menu="' + (visit.menu || '') + '">' +
				coverHtml(visit, 'michelin-card-photo-count') +
				'<div class="michelin-card-body">' +
					'<h4 class="michelin-card-title">' + titleHtml(visit) + '</h4>' +
					sharedKitchenHtml(visit) +
					metaHtml(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtml(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'michelin');
		return (
			'<div id="popup-' + popupNs + '-' + visit.id + '" class="popup mfp-hide"' + popupPhotoAttrs(visit) + '>' +
				'<div class="popup-inner">' +
					'<div class="michelin-popup-header">' +
						'<h4>' + titleHtml(visit) + '</h4>' +
						sharedKitchenHtml(visit) +
						metaHtml(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel"></div>' +
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
		same img/dining/visits/<id>/ photo folders) since a Gourmand
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

	// 'gourmand' (Bib Gourmand) shows its badge icon next to the name, same
	// as a starred visit. 'selected' is a quieter distinction — no icon by
	// the name, just a "Former" label when it applies (the stats banner
	// still gets its icon either way, see rankTotalsHtml).
	function rankHtml(visit) {
		var meta = RANK_META[visit.rank];
		if (!meta) return '';
		var isFormer = visit.status === 'former';
		if (visit.rank === 'selected') {
			return isFormer
				? '<span class="michelin-stars"><span class="mich-former-label">Former</span></span>'
				: '';
		}
		var rankClass = 'mich-bib-icon' + (isFormer ? ' mich-bib-icon-former' : '');
		return '<span class="michelin-stars">' +
			'<img class="' + rankClass + '" src="' + iconPath(meta.icon) + '" alt="' + meta.label + '">' +
			(isFormer ? '<span class="mich-former-label">Former</span>' : '') +
			'</span>';
	}

	function titleHtmlGourmand(visit) {
		var rank = rankHtml(visit);
		return (
			'<span class="michelin-card-title-name">' + visit.name + '</span>' +
			(rank ? '<span class="michelin-card-title-sep">|</span>' + rank : '')
		);
	}

	function cardHtmlGourmand(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'gourmand');
		return (
			'<a href="#popup-' + popupNs + '-' + visit.id + '" class="michelin-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-menu="' + (visit.menu || '') + '">' +
				coverHtml(visit, 'michelin-card-photo-count') +
				'<div class="michelin-card-body">' +
					'<h4 class="michelin-card-title">' + titleHtmlGourmand(visit) + '</h4>' +
					sharedKitchenHtml(visit) +
					metaHtml(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtmlGourmand(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'gourmand');
		return (
			'<div id="popup-' + popupNs + '-' + visit.id + '" class="popup mfp-hide"' + popupPhotoAttrs(visit) + '>' +
				'<div class="popup-inner">' +
					'<div class="michelin-popup-header">' +
						'<h4>' + titleHtmlGourmand(visit) + '</h4>' +
						sharedKitchenHtml(visit) +
						metaHtml(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel"></div>' +
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
		hydrateCovers($grid[0]);
		bindVisitPopups($grid.find('.michelin-card'));
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

	function cardHtmlAward(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'award');
		var accoladeSlugs = accoladesList(visit).map(function (a) { return a.list; }).filter(Boolean);

		return (
			'<a href="#popup-' + popupNs + '-' + visit.id + '" class="award-card" data-cuisine="' + cuisineList(visit).join(',') + '" data-accolades="' + accoladeSlugs.join(',') + '">' +
				coverHtml(visit, 'award-card-photo-count') +
				'<div class="award-card-body">' +
					'<h4 class="award-card-title">' + titleHtmlAward(visit) + '</h4>' +
					accoladesHtml(visit) +
					metaHtmlAward(visit) +
				'</div>' +
			'</a>'
		);
	}

	function popupHtmlAward(visit, popupNs) {
		popupNs = visitPopupNs(popupNs, 'award');
		return (
			'<div id="popup-' + popupNs + '-' + visit.id + '" class="popup mfp-hide' + (popupNs === 'award' ? '' : ' award-popup') + '"' + popupPhotoAttrs(visit) + '>' +
				'<div class="popup-inner">' +
					'<div class="award-popup-header">' +
						'<h4>' + titleHtmlAward(visit) + '</h4>' +
						accoladesHtml(visit) +
						metaHtmlAward(visit) +
					'</div>' +
					'<div class="popup-slider owl-carousel"></div>' +
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
		hydrateCovers($grid[0]);
		bindVisitPopups($grid.find('.award-card'), 'award-popup');
	}

	function loadAwardData() {
		$.getJSON('data/award.json').done(function (data) {
			awardData = data;
			renderAward(data);
			tryRenderTimeline();
		}).fail(function () {
			$('#award-grid').html('<p class="award-empty">Favorites data unavailable.</p>');
			if (!awardData) awardData = [];
			tryRenderTimeline();
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
		hydrateCovers($grid[0]);
		bindVisitPopups($grid.find('.michelin-card'));
	}

	// One JSON file backs both the Michelin (star) and Gourmand tabs, split
	// client-side by visit.rank — so a single fetch renders both grids
	// regardless of which tab the user opened first.
	function loadData() {
		$.getJSON('data/michelin.json').done(function (data) {
			michelinData = data;
			render(data.filter(function (v) { return !isGourmandVisit(v); }));
			renderGourmand(data.filter(isGourmandVisit));
			tryRenderTimeline();
		}).fail(function () {
			$('#michelin-grid').html('<p class="michelin-empty">Michelin visit data unavailable.</p>');
			$('#gourmand-grid').html('<p class="michelin-empty">Michelin visit data unavailable.</p>');
			if (!michelinData) michelinData = [];
			tryRenderTimeline();
		});
	}

	function ensureInit() {
		if (initialized) return;
		initialized = true;
		loadData();
	}

	/*=========================================================================
		Timeline tab — a horizontal filmstrip of every unique visit
		(Michelin Stars, Guide, and Award merged, newest on the left).
		Packed by visit, grouped by month; no empty calendar gaps.
		The three grid tabs are unchanged; this panel is additive.
	=========================================================================*/
	function mergeTimelineVisits(michelin, award) {
		var awardById = {};
		(award || []).forEach(function (v) {
			if (v && v.id) awardById[v.id] = v;
		});

		var byId = {};
		(michelin || []).forEach(function (v) {
			if (!v || !v.id) return;
			var kind = v.stars ? 'star' : (isGourmandVisit(v) ? 'gourmand' : null);
			if (!kind) return;
			var a = awardById[v.id];
			var visit = v;
			if (a && accoladesList(a).length) {
				visit = {};
				Object.keys(v).forEach(function (k) { visit[k] = v[k]; });
				visit.accolades = a.accolades;
			}
			byId[v.id] = { visit: visit, kind: kind };
		});
		(award || []).forEach(function (v) {
			if (!v || !v.id || byId[v.id]) return;
			byId[v.id] = { visit: v, kind: 'award' };
		});
		return Object.keys(byId).map(function (id) {
			return byId[id];
		}).sort(function (a, b) {
			return (b.visit.date || '').localeCompare(a.visit.date || '');
		});
	}

	function timelineMichelinMarks(visit) {
		var isFormer = visit.status === 'former';
		var parts = [];
		var count = parseInt(visit.stars, 10);
		var i;

		if (count >= 1) {
			var starClass = 'mich-star' + (isFormer ? ' mich-star-former' : '');
			var stars = '';
			for (i = 0; i < count; i++) {
				stars += '<span class="' + starClass + '"></span>';
			}
			parts.push(stars);
		}

		if (isGourmandVisit(visit)) {
			var meta = RANK_META[visit.rank];
			if (meta && meta.icon) {
				parts.push(
					'<img class="mich-bib-icon' + (isFormer ? ' mich-bib-icon-former' : '') + '" src="' + iconPath(meta.icon) + '" alt="">'
				);
			}
		}

		if (!parts.length) return '';
		return '<span class="dining-timeline-card-icon dining-timeline-card-icon-mich">' + parts.join('') + '</span>';
	}

	function timelineAwardMarks(visit) {
		var parts = [];
		var seenIcons = {};
		accoladesList(visit).forEach(function (a) {
			var listMeta = accoladeListMeta(a.list);
			if (!listMeta.icon || seenIcons[listMeta.icon]) return;
			seenIcons[listMeta.icon] = true;
			parts.push('<img class="dining-timeline-award-mark" src="' + iconPath(listMeta.icon) + '" alt="">');
		});
		if (!parts.length) return '';
		return '<span class="dining-timeline-card-icon dining-timeline-card-icon-award">' + parts.join('') + '</span>';
	}

	function timelineCardHtml(entry) {
		var visit = entry.visit;
		var cardClass = entry.kind === 'award' ? 'award-card' : 'michelin-card';
		var city = visit.city || '';

		return (
			'<a href="#popup-timeline-' + visit.id + '" class="' + cardClass + ' dining-timeline-card">' +
				coverHtml(visit, 'michelin-card-photo-count') +
				'<div class="dining-timeline-card-body">' +
					'<div class="dining-timeline-card-line1">' +
						timelineMichelinMarks(visit) +
						'<span class="dining-timeline-card-name">' + visit.name + '</span>' +
						timelineAwardMarks(visit) +
					'</div>' +
					sharedKitchenHtml(visit) +
					'<div class="dining-timeline-card-line2">' +
						'<span>' + formatVisitDate(visit.date) + '</span>' +
						(city ? '<span class="dining-timeline-card-dot"> · </span><span>' + city + '</span>' : '') +
					'</div>' +
				'</div>' +
			'</a>'
		);
	}

	function timelinePopupHtml(entry) {
		var v = entry.visit;
		if (entry.kind === 'star') return popupHtml(v, 'timeline');
		if (entry.kind === 'gourmand') return popupHtmlGourmand(v, 'timeline');
		return popupHtmlAward(v, 'timeline');
	}

	function timelineMonthParts(key) {
		var d = new Date(key + '-01T00:00:00');
		if (isNaN(d.getTime())) return { month: key, year: '' };
		return {
			month: d.toLocaleDateString('en-US', { month: 'short' }),
			year: String(d.getFullYear())
		};
	}

	function timelineStationHtml(entry) {
		return (
			'<article class="dining-timeline-station" data-kind="' + entry.kind + '" data-date="' + (entry.visit.date || '') + '">' +
				'<div class="dining-timeline-card-slot">' + timelineCardHtml(entry) + '</div>' +
				'<span class="dining-timeline-node" aria-hidden="true"></span>' +
			'</article>'
		);
	}

	function renderTimeline(entries) {
		var $track = $('#dining-timeline-track');
		var $popups = $('#dining-timeline-popups');

		if (!entries || !entries.length) {
			$track.html('<p class="michelin-empty">No visits logged yet — check back soon!</p>');
			$popups.empty();
			return;
		}

		var groups = [];
		var current = null;
		entries.forEach(function (entry) {
			var key = (entry.visit.date || '').slice(0, 7);
			if (!current || current.key !== key) {
				current = { key: key, entries: [] };
				groups.push(current);
			}
			current.entries.push(entry);
		});

		var html = '<div class="dining-timeline-rail" aria-hidden="true"></div>';
		groups.forEach(function (group) {
			var parts = timelineMonthParts(group.key);
			html += '<section class="dining-timeline-month" data-month="' + group.key + '">' +
				'<header class="dining-timeline-month-label">' +
					'<div class="dining-timeline-month-label-inner">' +
						'<div class="dining-timeline-month-label-copy">' +
							'<span class="dining-timeline-month-name">' + parts.month + '</span>' +
							'<span class="dining-timeline-month-year">' + parts.year + '</span>' +
						'</div>' +
					'</div>' +
				'</header>' +
				'<div class="dining-timeline-stations">' +
					group.entries.map(timelineStationHtml).join('') +
				'</div>' +
			'</section>';
		});

		$track.html(html);
		$popups.html(entries.map(timelinePopupHtml).join(''));
		hydrateCovers($track[0]);
		bindVisitPopups($track.find('.michelin-card'));
		bindVisitPopups($track.find('.award-card'), 'award-popup');

		bindTimeline();
		requestAnimationFrame(function () {
			requestAnimationFrame(layoutTimeline);
		});
	}

	function prefersReducedMotion() {
		return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function clamp01(x) {
		return x < 0 ? 0 : x > 1 ? 1 : x;
	}

	var timelineTicking = false;
	var timelineScrollIdle = null;

	function isTimelineVertical() {
		return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
	}

	function edgeAlpha(x, viewStart, viewEnd, fade) {
		if (x < viewStart || x > viewEnd) return 0;
		return Math.min(clamp01((x - viewStart) / fade), clamp01((viewEnd - x) / fade));
	}

	function uniqueSorted(values) {
		values.sort(function (a, b) { return a - b; });
		var out = [];
		var i;
		for (i = 0; i < values.length; i++) {
			if (!out.length || values[i] - out[out.length - 1] > 0.35) out.push(values[i]);
		}
		return out;
	}

	function viewportFadeMask(x0, x1, v0, v1, fade, vertical) {
		var size = x1 - x0;
		if (size <= 0) return '';
		var raw = [x0, x1, v0, v0 + fade, v1 - fade, v1];
		var points = [];
		var i;
		for (i = 0; i < raw.length; i++) {
			if (raw[i] >= x0 - 0.5 && raw[i] <= x1 + 0.5) points.push(raw[i]);
		}
		points = uniqueSorted(points);
		var stops = [];
		var allOpaque = true;
		for (i = 0; i < points.length; i++) {
			var x = Math.max(x0, Math.min(x1, points[i]));
			var a = edgeAlpha(x, v0, v1, fade);
			if (a < 0.995) allOpaque = false;
			var pct = ((x - x0) / size) * 100;
			stops.push('rgba(0,0,0,' + a.toFixed(3) + ') ' + pct.toFixed(2) + '%');
		}
		if (allOpaque || stops.length < 2) return '';
		var dir = vertical ? 'to bottom' : 'to right';
		return 'linear-gradient(' + dir + ', ' + stops.join(', ') + ')';
	}

	function clearSlotMask(slot) {
		slot.style.maskImage = '';
		slot.style.webkitMaskImage = '';
		slot.style.maskSize = '';
		slot.style.webkitMaskSize = '';
		slot.style.maskRepeat = '';
		slot.style.webkitMaskRepeat = '';
	}

	function morphStation(station, view, fade, vertical) {
		var slot = station.querySelector('.dining-timeline-card-slot');
		if (!slot) return;
		var rect = slot.getBoundingClientRect();
		var x0 = vertical ? rect.top : rect.left;
		var x1 = vertical ? rect.bottom : rect.right;
		var v0 = vertical ? view.top : view.left;
		var v1 = vertical ? view.bottom : view.right;
		var size = vertical ? rect.height : rect.width;
		var overlap = Math.min(x1, v1) - Math.max(x0, v0);
		var node = station.querySelector('.dining-timeline-node');

		if (overlap <= 0 || size <= 0) {
			slot.style.opacity = '0';
			slot.style.pointerEvents = 'none';
			clearSlotMask(slot);
			if (node) node.style.opacity = '0';
			return;
		}

		slot.style.opacity = '1';
		slot.style.pointerEvents = overlap / size < 0.28 ? 'none' : '';

		var mask = viewportFadeMask(x0, x1, v0, v1, fade, vertical);
		if (!mask) {
			clearSlotMask(slot);
		} else {
			slot.style.maskImage = mask;
			slot.style.webkitMaskImage = mask;
			slot.style.maskSize = '100% 100%';
			slot.style.webkitMaskSize = '100% 100%';
			slot.style.maskRepeat = 'no-repeat';
			slot.style.webkitMaskRepeat = 'no-repeat';
		}

		if (node) {
			var nRect = node.getBoundingClientRect();
			var nx = vertical ? (nRect.top + nRect.bottom) / 2 : (nRect.left + nRect.right) / 2;
			var na = edgeAlpha(nx, v0, v1, fade);
			node.style.opacity = na >= 0.995 ? '' : na.toFixed(3);
		}
	}

	function resetTimelineMorph() {
		var slots = document.querySelectorAll('#dining-timeline-track .dining-timeline-card-slot');
		var i;
		for (i = 0; i < slots.length; i++) {
			slots[i].style.opacity = '';
			slots[i].style.pointerEvents = '';
			clearSlotMask(slots[i]);
		}
		var nodes = document.querySelectorAll('#dining-timeline-track .dining-timeline-node');
		for (i = 0; i < nodes.length; i++) {
			nodes[i].style.opacity = '';
		}
	}

	function updateTimelineNav(scroller) {
		var prev = document.getElementById('dining-timeline-prev');
		var next = document.getElementById('dining-timeline-next');
		if (!prev || !next) return;
		if (isTimelineVertical()) {
			prev.hidden = true;
			next.hidden = true;
			return;
		}
		var max = scroller.scrollWidth - scroller.clientWidth;
		var overflow = max > 4;
		prev.hidden = !overflow;
		next.hidden = !overflow;
		prev.disabled = scroller.scrollLeft <= 2;
		next.disabled = scroller.scrollLeft >= max - 2;
	}

	function layoutTimeline() {
		var scroller = document.getElementById('dining-timeline-scroller');
		if (!scroller) return;
		if (!$('#dining').hasClass('active')) return;
		if (!$('.dining-panel[data-dining-panel="timeline"]').hasClass('active')) return;

		var vertical = isTimelineVertical();
		updateTimelineNav(scroller);

		var viewEl = vertical ? document.getElementById('dining') : scroller;
		if (!viewEl) return;
		var view = viewEl.getBoundingClientRect();
		var fade;
		if (vertical) {
			if (view.height < 8) return;
			fade = Math.max(48, Math.min(72, view.height * 0.08));
		} else if (view.width < 8) {
			return;
		} else {
			fade = Math.max(40, Math.min(56, view.width * 0.04));
		}

		if (!vertical) {
			var fadeHost = scroller.parentElement;
			if (fadeHost && fadeHost.classList.contains('dining-timeline-fade')) {
				fadeHost.style.setProperty('--tl-fade', fade + 'px');
			}
		}

		if (prefersReducedMotion()) {
			resetTimelineMorph();
			return;
		}

		if (vertical) {
			var stations = scroller.querySelectorAll('.dining-timeline-station');
			var i;
			for (i = 0; i < stations.length; i++) morphStation(stations[i], view, fade, vertical);
		}
	}

	function scheduleTimelineLayout() {
		if (timelineTicking) return;
		timelineTicking = true;
		requestAnimationFrame(function () {
			timelineTicking = false;
			layoutTimeline();
		});
	}

	function timelineStride(scroller) {
		var el = scroller.querySelector('.dining-timeline-station');
		if (!el) return 300;
		var parent = el.parentNode;
		var gap = 20;
		if (parent) {
			var cs = window.getComputedStyle(parent);
			gap = parseFloat(cs.columnGap || cs.gap) || 20;
		}
		return el.getBoundingClientRect().width + gap;
	}

	function scrollTimelineBy(dir) {
		var scroller = document.getElementById('dining-timeline-scroller');
		if (!scroller) return;
		var dx = timelineStride(scroller) * dir;
		var reduce = prefersReducedMotion();
		if (scroller.scrollTo) {
			scroller.scrollTo({ left: scroller.scrollLeft + dx, behavior: reduce ? 'auto' : 'smooth' });
		} else {
			scroller.scrollLeft += dx;
		}
	}

	function onTimelineScrollSurface(scroller) {
		if (scroller) {
			scroller.classList.add('is-scrolling');
			if (timelineScrollIdle) clearTimeout(timelineScrollIdle);
			timelineScrollIdle = setTimeout(function () {
				scroller.classList.remove('is-scrolling');
			}, 180);
		}
		scheduleTimelineLayout();
	}

	function bindTimeline() {
		if (timelineBound) return;
		timelineBound = true;
		var scroller = document.getElementById('dining-timeline-scroller');
		if (!scroller) return;

		scroller.addEventListener('scroll', function () {
			onTimelineScrollSurface(scroller);
		}, { passive: true });

		var diningSection = document.getElementById('dining');
		if (diningSection) {
			diningSection.addEventListener('scroll', function () {
				if (!isTimelineVertical()) return;
				onTimelineScrollSurface(scroller);
			}, { passive: true });
		}

		if (window.matchMedia) {
			var mq = window.matchMedia('(max-width: 767px)');
			var onBreak = function () {
				resetTimelineMorph();
				scheduleTimelineLayout();
			};
			if (mq.addEventListener) mq.addEventListener('change', onBreak);
			else if (mq.addListener) mq.addListener(onBreak);
		}

		scroller.addEventListener('wheel', function (e) {
			if (isTimelineVertical()) return;
			if (!$('.dining-panel[data-dining-panel="timeline"]').hasClass('active')) return;
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
			var max = scroller.scrollWidth - scroller.clientWidth;
			if (max <= 0) return;
			var next = scroller.scrollLeft + e.deltaY;
			if (next <= 0 && scroller.scrollLeft <= 0 && e.deltaY < 0) return;
			if (next >= max && scroller.scrollLeft >= max - 1 && e.deltaY > 0) return;
			e.preventDefault();
			scroller.scrollLeft += e.deltaY;
		}, { passive: false });

		$('#dining-timeline-prev').on('click', function () { scrollTimelineBy(-1); });
		$('#dining-timeline-next').on('click', function () { scrollTimelineBy(1); });

		$(document).on('keydown.diningTimeline', function (e) {
			if (!$('#dining').hasClass('active')) return;
			if (!$('.dining-panel[data-dining-panel="timeline"]').hasClass('active')) return;
			if (isTimelineVertical()) return;
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
			if ($(e.target).is('input, textarea, select')) return;
			if ($(e.target).closest('.mfp-wrap').length) return;
			e.preventDefault();
			scrollTimelineBy(e.key === 'ArrowRight' ? 1 : -1);
		});

		$(window).on('resize.diningTimeline', scheduleTimelineLayout);
	}

	function tryRenderTimeline() {
		if (!michelinData || !awardData) return;
		if (!timelineRendered) {
			timelineRendered = true;
			renderTimeline(mergeTimelineVisits(michelinData, awardData));
			return;
		}
		requestAnimationFrame(function () {
			requestAnimationFrame(layoutTimeline);
		});
	}

	/*=========================================================================
		Router-driven init — SiteRouter loads this file, then fires
		site:route. Tab clicks and deep links (/dining/michelin/) share
		the same path.
	=========================================================================*/
	$(document).on('site:route', function (e, route, meta) {
		applyDiningRoute(route, meta);
	});
	if (window.SiteRouter && $('#dining').hasClass('active')) {
		applyDiningRoute(window.SiteRouter.current(), { animated: false });
	}

}(jQuery));
