$(function(){
	"use strict";

	/*=========================================================================
		Path router — GitHub Pages serves about/index.html etc., so refresh
		works. In-app clicks use history.pushState so the address bar stays
		hash-free ( /dining/michelin/ not #dining ).
	=========================================================================*/
	var HASH_REDIRECTS = {
		'#intro': '/',
		'#about': '/about/',
		'#resume': '/resume/',
		'#travel': '/travel/',
		'#dining': '/dining/',
		'#faith': '/faith/',
		'#contact': '/contact/',
		'#portfolio': '/'
	};

	var SECTION_TITLES = {
		intro: 'Morris Hsieh',
		about: 'About — Morris Hsieh',
		resume: 'Resume — Morris Hsieh',
		travel: 'Travel — Morris Hsieh',
		dining: 'Dining — Morris Hsieh',
		faith: 'Faith — Morris Hsieh',
		contact: 'Contact — Morris Hsieh'
	};

	var loadedAssets = {};

	function normalizePath(pathname) {
		var path = (pathname || '/').replace(/\/index\.html$/i, '');
		if (path.length > 1) path = path.replace(/\/+$/, '');
		return path || '/';
	}

	function parsePath(pathname) {
		var parts = normalizePath(pathname).replace(/^\//, '').split('/').filter(Boolean);
		var head = parts[0] || '';
		var sub = parts[1] || '';

		if (!head) return { section: 'intro' };
		if (head === 'dining') {
			var diningTab = sub || 'timeline';
			if (diningTab !== 'timeline' && diningTab !== 'michelin' && diningTab !== 'gourmand' && diningTab !== 'award') {
				diningTab = 'timeline';
			}
			return { section: 'dining', diningTab: diningTab };
		}
		if (head === 'faith') {
			var faithTab = sub || 'devotion';
			if (faithTab !== 'devotion' && faithTab !== 'other') faithTab = 'devotion';
			return { section: 'faith', faithTab: faithTab };
		}
		if (head === 'about' || head === 'resume' || head === 'travel' || head === 'contact') {
			return { section: head };
		}
		return { section: 'intro' };
	}

	function pathFor(route) {
		if (!route || route.section === 'intro') return '/';
		if (route.section === 'dining') {
			var diningTab = route.diningTab || 'timeline';
			return diningTab === 'timeline' ? '/dining/' : '/dining/' + diningTab + '/';
		}
		if (route.section === 'faith') {
			var faithTab = route.faithTab || 'devotion';
			return faithTab === 'devotion' ? '/faith/' : '/faith/' + faithTab + '/';
		}
		return '/' + route.section + '/';
	}

	function routeFromLink($el) {
		return {
			section: $el.data('section') || 'intro',
			diningTab: $el.data('dining-tab'),
			faithTab: $el.data('faith-tab')
		};
	}

	function sameSection(a, b) {
		return a && b && a.section === b.section;
	}

	function setDocumentTitle(route) {
		document.title = SECTION_TITLES[route.section] || 'Morris Hsieh';
	}

	function setActiveSection(route) {
		var $sect = $('#' + route.section);
		if (!$sect.length) return;
		$('.section.active').removeClass('active');
		$sect.addClass('active');
		if ($sect.hasClass('border-d')) {
			$('body').addClass('border-dark');
		} else {
			$('body').removeClass('border-dark');
		}
	}

	function loadScript(src) {
		if (loadedAssets[src]) return loadedAssets[src];
		loadedAssets[src] = new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = src;
			s.onload = resolve;
			s.onerror = reject;
			document.body.appendChild(s);
		});
		return loadedAssets[src];
	}

	function loadStylesheet(href) {
		if (loadedAssets[href]) return loadedAssets[href];
		loadedAssets[href] = new Promise(function (resolve, reject) {
			if (document.querySelector('link[href="' + href + '"]')) {
				resolve();
				return;
			}
			var l = document.createElement('link');
			l.rel = 'stylesheet';
			l.href = href;
			l.crossOrigin = '';
			l.onload = resolve;
			l.onerror = reject;
			document.head.appendChild(l);
		});
		return loadedAssets[href];
	}

	function loadPopupLibs() {
		return Promise.all([
			loadStylesheet('css/magnific-popup.css'),
			loadScript('js/jquery.magnific-popup.min.js')
		]);
	}

	function loadSectionAssets(route) {
		if (route.section === 'travel') {
			return Promise.all([
				loadStylesheet('css/travel.css'),
				loadStylesheet('vendor/leaflet/leaflet.css')
			]).then(function () {
				return loadScript('vendor/leaflet/leaflet.js');
			}).then(function () {
				return loadScript('js/travel.js');
			});
		}
		if (route.section === 'dining') {
			return Promise.all([
				loadStylesheet('css/dining.css'),
				loadStylesheet('css/owl.carousel.css'),
				loadPopupLibs()
			]).then(function () {
				return loadScript('js/owl.carousel.min.js');
			}).then(function () {
				return loadScript('js/dining.js');
			});
		}
		if (route.section === 'faith') {
			return Promise.all([
				loadStylesheet('css/faith.css'),
				loadPopupLibs()
			]).then(function () {
				return loadScript('vendor/marked/marked.min.js');
			}).then(function () {
				return loadScript('js/faith.js');
			});
		}
		return Promise.resolve();
	}

	function switchSection(route) {
		var $sect = $('#' + route.section);
		var $current = $('.section.active');
		if ($sect.length !== 1) return;
		if ($sect.hasClass('active') || $('body').hasClass('section-switching')) return;

		closeMenu();
		$('body').addClass('section-switching');
		if ($sect.index() < $current.index()) {
			$('body').addClass('up');
		} else {
			$('body').addClass('down');
		}
		setTimeout(function () {
			$('body').removeClass('section-switching up down');
		}, 2500);
		setTimeout(function () {
			setActiveSection(route);
		}, 1250);
	}

	var currentRoute = { section: 'intro' };

	function applyRoute(route, options) {
		options = options || {};
		var $sect = $('#' + route.section);
		if (!$sect.length) route = { section: 'intro' };

		var animated = !!options.animate && !sameSection(currentRoute, route) && !$sect.hasClass('active');
		currentRoute = route;
		setDocumentTitle(route);

		if (animated) {
			switchSection(route);
		} else if (!$sect.hasClass('active')) {
			setActiveSection(route);
		}
		closeMenu();

		loadSectionAssets(route).then(function () {
			$(document).trigger('site:route', [route, { animated: animated }]);
		});
	}

	function go(route, options) {
		options = options || {};
		var next = pathFor(route);
		if (options.replace) {
			history.replaceState(route, '', next);
		} else if (normalizePath(location.pathname) !== normalizePath(next)) {
			history.pushState(route, '', next);
		}
		applyRoute(route, options);
	}

	window.SiteRouter = {
		go: go,
		pathFor: pathFor,
		current: function () { return currentRoute; },
		parsePath: parsePath
	};

	if (location.hash && HASH_REDIRECTS[location.hash]) {
		history.replaceState(null, '', HASH_REDIRECTS[location.hash]);
	}

	currentRoute = parsePath(location.pathname);
	setActiveSection(currentRoute);
	setDocumentTitle(currentRoute);
	history.replaceState(currentRoute, '', pathFor(currentRoute));
	loadSectionAssets(currentRoute).then(function () {
		$(document).trigger('site:route', [currentRoute, { animated: false }]);
	});

	$(window).on('popstate', function () {
		applyRoute(parsePath(location.pathname), { animate: true });
	});

	function markLoaded() {
		document.body.classList.add('loaded');
	}
	if (document.readyState === 'complete') {
		markLoaded();
	} else {
		$(window).on('load', markLoaded);
	}
	setTimeout(markLoaded, 600);

	/*=========================================================================
		Menu items with a submenu (e.g. Dining) — clicking the parent
		expands its sub-links instead of navigating.
	=========================================================================*/
	function closeMenu() {
		$('body').removeClass('menu-open').addClass('menu-dismissed');
	}

	function allowMenuOpen() {
		$('body').removeClass('menu-dismissed');
	}

	$('.menu-parent-toggle').on('click', function(e){
		e.preventDefault();
		var $item = $(this).closest('.menu-item-has-children');
		var wasExpanded = $item.hasClass('expanded');
		$('.menu-item-has-children').removeClass('expanded');
		if( !wasExpanded ){
			$item.addClass('expanded');
		}
	});

	$('.menu-btn').on('click', function(e){
		e.preventDefault();
		e.stopPropagation();
		allowMenuOpen();
		$('body').toggleClass('menu-open');
	});

	$('.menu-btn').on('mouseenter', allowMenuOpen);

	$('.menu').on('click', function(e){
		e.stopPropagation();
	});

	$(document).on('click', function(){
		closeMenu();
	});

	/*=========================================================================
		Navigation — path URLs, keep the existing section wipe animation
	=========================================================================*/
	$('.section-toggle').on('click', function(e){
		e.preventDefault();
		go(routeFromLink($(this)), { animate: true });
	});

	$(document).on('click', '.dining-tab-toggle', function (e) {
		e.preventDefault();
		go({ section: 'dining', diningTab: $(this).data('dining-tab') });
	});

	$(document).on('click', '.faith-tab-toggle', function (e) {
		e.preventDefault();
		go({ section: 'faith', faithTab: $(this).data('faith-tab') });
	});

});
