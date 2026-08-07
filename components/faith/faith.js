(function ($) {
	'use strict';

	var initialized = false;
	var devotionData = null;

	/*=========================================================================
		Daily Devotion / Other tab switching — driven by both the in-section
		tabs and the sidebar submenu links (both share the same
		[data-faith-tab] attribute + .faith-tab-toggle class), mirroring
		Dining's Michelin/Award tab pattern.
	=========================================================================*/
	function showFaithTab(tab) {
		if (tab !== 'devotion' && tab !== 'other') return;

		$('.faith-tab-toggle').removeClass('active');
		$('.faith-tab-toggle[data-faith-tab="' + tab + '"]').addClass('active');

		$('.faith-panel').removeClass('active');
		$('.faith-panel[data-faith-panel="' + tab + '"]').addClass('active');

		if (tab === 'devotion') {
			ensureInit();
		}
	}

	$(document).on('click', '.faith-tab-toggle', function (e) {
		e.preventDefault();
		showFaithTab($(this).data('faith-tab'));
	});

	// Title-case a string, preserving all-caps acronyms as-is (e.g. "OT"),
	// splitting on spaces AND hyphens so slugs like "bible-recap-2026"
	// read as "Bible Recap 2026".
	function titleCaseWord(w) {
		if (!w) return w;
		if (w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
		return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
	}

	function titleCase(str) {
		return (str || '').split(/[\s-]+/).filter(Boolean).map(titleCaseWord).join(' ');
	}

	function booksList(devotion) {
		var b = devotion.books;
		if (Array.isArray(b)) return b.filter(Boolean);
		if (b) return [b];
		return [];
	}

	// The JSON schema has no id field, so derive a DOM-safe id from the
	// (unique-per-day) date string instead.
	function devotionId(devotion) {
		return 'devotion-' + (devotion.date || '').replace(/[^0-9a-zA-Z-]/g, '');
	}

	function formatDevotionDate(dateStr) {
		if (!dateStr) return '';
		var d = new Date(dateStr + 'T00:00:00');
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function yearOf(dateStr) {
		var m = /^(\d{4})-\d{2}-\d{2}$/.exec(dateStr || '');
		return m ? m[1] : '';
	}

	function monthOf(dateStr) {
		var m = /^\d{4}-(\d{2})-\d{2}$/.exec(dateStr || '');
		return m ? m[1] : '';
	}

	var MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	function monthLabel(mm) {
		var idx = parseInt(mm, 10) - 1;
		return MONTH_NAMES[idx] || mm;
	}

	/*=========================================================================
		Card + popup markup for a single devotion

		Line 1: title (passage) — or just the passage if there's no title
		Line 2: date
		Line 3: plan, books, testament
	=========================================================================*/
	function titleLineHtml(devotion) {
		var passage = devotion.passage || '';
		if (devotion.title) {
			return (
				'<span class="devotion-card-title-name">' + devotion.title + '</span>' +
				(passage ? ' <span class="devotion-card-title-passage">(' + passage + ')</span>' : '')
			);
		}
		return '<span class="devotion-card-title-name">' + passage + '</span>';
	}

	// Plain-text, attribute-safe version of titleLineHtml — used as the
	// card title's native tooltip (title="...") so the full text is still
	// reachable on hover once the header clips a long line with an ellipsis.
	function titleLineText(devotion) {
		var passage = devotion.passage || '';
		var text = devotion.title ? (devotion.title + (passage ? ' (' + passage + ')' : '')) : passage;
		var div = document.createElement('div');
		div.textContent = text;
		// innerHTML escapes &, <, > but not quotes — escape those too since
		// this is inlined straight into a double-quoted HTML attribute.
		return div.innerHTML.replace(/"/g, '&quot;');
	}

	function metaLineHtml(devotion) {
		var parts = [];
		if (devotion.plan) parts.push(titleCase(devotion.plan));
		var books = booksList(devotion);
		if (books.length) parts.push(books.join(', '));
		if (devotion.testament) parts.push(devotion.testament);
		return parts.join(' · ');
	}

	function cardHtml(devotion) {
		var id = devotionId(devotion);
		var books = booksList(devotion);

		// title="" carries the full, untruncated line-1 text as a native
		// tooltip, since the header clips overflowing titles with an
		// ellipsis (see .devotion-card-title in faith.css) instead of
		// wrapping them onto a second line.
		return (
			'<a href="#popup-' + id + '" class="devotion-card" data-year="' + yearOf(devotion.date) + '" data-month="' + monthOf(devotion.date) + '" data-plan="' + (devotion.plan || '') + '" data-books="' + books.join(',') + '">' +
				'<div class="devotion-card-header">' +
					'<h4 class="devotion-card-title" title="' + titleLineText(devotion) + '">' + titleLineHtml(devotion) + '</h4>' +
				'</div>' +
				'<div class="devotion-card-body">' +
					'<div class="devotion-meta devotion-meta-date"><i class="fas fa-calendar-alt"></i>' + formatDevotionDate(devotion.date) + '</div>' +
					'<div class="devotion-meta devotion-meta-tags">' + metaLineHtml(devotion) + '</div>' +
				'</div>' +
			'</a>'
		);
	}

	// Renders devotion.content as Markdown via the CDN-loaded `marked`
	// library (see build/template.html). Falls back to escaped plain text
	// with line breaks preserved if the library failed to load, so a
	// network hiccup degrades gracefully instead of breaking the popup.
	function renderMarkdown(text) {
		if (window.marked && typeof window.marked.parse === 'function') {
			return window.marked.parse(text || '');
		}
		var div = document.createElement('div');
		div.textContent = text || '';
		return '<p>' + div.innerHTML.replace(/\n/g, '<br>') + '</p>';
	}

	function popupHtml(devotion) {
		var id = devotionId(devotion);

		return (
			'<div id="popup-' + id + '" class="popup mfp-hide">' +
				'<div class="popup-inner">' +
					'<div class="devotion-popup-header">' +
						'<h4>' + titleLineHtml(devotion) + '</h4>' +
						'<div class="devotion-meta devotion-meta-date"><i class="fas fa-calendar-alt"></i>' + formatDevotionDate(devotion.date) + '</div>' +
						'<div class="devotion-meta devotion-meta-tags">' + metaLineHtml(devotion) + '</div>' +
					'</div>' +
					'<div class="devotion-popup-content">' + renderMarkdown(devotion.content) + '</div>' +
				'</div>' +
			'</div>'
		);
	}

	/*=========================================================================
		Year / Month / Plan / Book filters — same custom dropdown widget
		approach as Dining's Cuisine/Menu filters (see dining.js), duplicated
		here under .devotion-select so this component stays self-contained.
	=========================================================================*/
	function populateDevotionSelect($container, values, allLabel, labelFn) {
		var unique = [];
		values.forEach(function (v) {
			if (v && unique.indexOf(v) === -1) unique.push(v);
		});
		unique.sort(function (a, b) { return String(a).localeCompare(String(b)); });

		var $list = $container.find('.devotion-select-list');
		$list.empty();
		$list.append($('<li></li>').attr('data-value', 'all').addClass('active').text(allLabel));
		unique.forEach(function (v) {
			$list.append($('<li></li>').attr('data-value', v).text(labelFn ? labelFn(v) : v));
		});
		$container.attr('data-value', 'all');
		$container.find('.devotion-select-btn').text(allLabel);
		sizeSelectToContent($container);
	}

	// Fix the button + list width to fit the longest option so the control
	// never truncates/wraps and doesn't resize as the user picks options.
	function sizeSelectToContent($container) {
		var $btn = $container.find('.devotion-select-btn');
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
		$container.find('.devotion-select-list li').each(function () {
			$measure.text($(this).text());
			maxTextWidth = Math.max(maxTextWidth, $measure.outerWidth());
		});
		$measure.remove();

		var btnPaddingLeft = parseFloat($btn.css('padding-left')) || 0;
		var btnPaddingRight = parseFloat($btn.css('padding-right')) || 0;
		var width = Math.ceil(maxTextWidth + btnPaddingLeft + btnPaddingRight + 4);

		$btn.css('width', width + 'px');
		$container.find('.devotion-select-list').css('width', width + 'px');
	}

	function populateFilters(devotions) {
		var years = [], months = [], plans = [], books = [];
		devotions.forEach(function (d) {
			var y = yearOf(d.date);
			if (y) years.push(y);
			var m = monthOf(d.date);
			if (m) months.push(m);
			if (d.plan) plans.push(d.plan);
			booksList(d).forEach(function (b) { books.push(b); });
		});
		populateDevotionSelect($('#devotion-filter-year'), years, 'All Years');
		populateDevotionSelect($('#devotion-filter-month'), months, 'All Months', monthLabel);
		populateDevotionSelect($('#devotion-filter-plan'), plans, 'All Plans', titleCase);
		populateDevotionSelect($('#devotion-filter-book'), books, 'All Books');
	}

	function applyFilters() {
		var year = $('#devotion-filter-year').attr('data-value') || 'all';
		var month = $('#devotion-filter-month').attr('data-value') || 'all';
		var plan = $('#devotion-filter-plan').attr('data-value') || 'all';
		var book = $('#devotion-filter-book').attr('data-value') || 'all';
		var visibleCount = 0;

		$('#devotion-grid .devotion-card').each(function () {
			var $card = $(this);
			var cardBooks = ($card.attr('data-books') || '').split(',').filter(Boolean);
			var matches =
				(year === 'all' || $card.attr('data-year') === year) &&
				(month === 'all' || $card.attr('data-month') === month) &&
				(plan === 'all' || $card.attr('data-plan') === plan) &&
				(book === 'all' || cardBooks.indexOf(book) !== -1);

			$card.toggleClass('devotion-card-hidden', !matches);
			if (matches) visibleCount++;
		});

		$('#devotion-filter-empty').toggle(visibleCount === 0);
	}

	$(document).on('click', '.devotion-select-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		var $container = $(this).closest('.devotion-select');
		var wasOpen = $container.hasClass('open');
		$('.devotion-select').removeClass('open');
		if (!wasOpen) $container.addClass('open');
	});

	$(document).on('click', '.devotion-select-list li', function () {
		var $li = $(this);
		var $container = $li.closest('.devotion-select');
		$container.attr('data-value', $li.data('value'));
		$container.find('.devotion-select-btn').text($li.text());
		$container.find('.devotion-select-list li').removeClass('active');
		$li.addClass('active');
		$container.removeClass('open');
		applyFilters();
	});

	$(document).on('click', function (e) {
		if (!$(e.target).closest('.devotion-select').length) {
			$('.devotion-select').removeClass('open');
		}
	});

	/*=========================================================================
		Render the grid + wire up popups
	=========================================================================*/
	function render(devotions) {
		var $grid = $('#devotion-grid');

		if (!devotions || !devotions.length) {
			$('#devotion-filters').hide();
			$grid.html('<p class="devotion-empty">No devotions logged yet — check back soon!</p>');
			return;
		}

		populateFilters(devotions);

		// Sort newest devotion first.
		devotions = devotions.slice().sort(function (a, b) {
			return (b.date || '').localeCompare(a.date || '');
		});

		var cardsHtml = devotions.map(cardHtml).join('');
		var popupsHtml = devotions.map(popupHtml).join('');
		$grid.html(cardsHtml + popupsHtml);
		applyFilters();

		$grid.find('.devotion-card').magnificPopup({
			type: 'inline',
			fixedContentPos: false,
			fixedBgPos: true,
			overflowY: 'auto',
			closeBtnInside: true,
			preloader: false,
			midClick: true,
			removalDelay: 300,
			mainClass: 'my-mfp-zoom-in devotion-popup'
		});
	}

	function loadData() {
		$.getJSON('data/devotions.json').done(function (data) {
			devotionData = data;
			render(data);
		}).fail(function () {
			$('#devotion-grid').html('<p class="devotion-empty">Devotion data unavailable.</p>');
		});
	}

	function ensureInit() {
		if (initialized) return;
		initialized = true;
		loadData();
	}

	/*=========================================================================
		Lazy-init once the Faith section is actually visited (matches the
		pattern used by dining.js/travel.js/nyc.js), and honor a sidebar
		submenu click that requested a specific tab.
	=========================================================================*/
	$(document).on('click', '.section-toggle[data-section="faith"]', function () {
		var tab = $(this).data('faith-tab');
		if (tab) {
			setTimeout(function () { showFaithTab(tab); }, 1300);
		} else if ($('.faith-panel[data-faith-panel="devotion"]').hasClass('active')) {
			setTimeout(ensureInit, 1300);
		}
	});

	$(window).on('load', function () {
		if (!$('#faith').hasClass('active')) return;
		if ($('.faith-panel[data-faith-panel="devotion"]').hasClass('active')) {
			ensureInit();
		}
	});

}(jQuery));
