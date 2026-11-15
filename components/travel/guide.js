(function ($) {
	'use strict';

	var LANG_KEY = 'travel-guide-lang';
	var WEEK_ZH = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' };
	var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	var UI = {
		tab: { en: 'Guide', zh: '指南' },
		draft: { en: 'Draft', zh: '草稿' },
		back: { en: 'All cities', zh: '全部城市' },
		loading: { en: 'Loading guide…', zh: '指南加载中…' },
		error: { en: 'Could not load this guide.', zh: '这份指南没加载出来。' },
		missing: { en: 'That city is not in the guide yet.', zh: '指南里还没有这座城市。' },
		day: { en: 'Day', zh: '第' },
		arrive: { en: 'Arrive', zh: '到达' },
		leave: { en: 'Leave', zh: '离开' },
		mustSee: { en: 'Must-see', zh: '必看' },
		mustOrder: { en: 'Must-order', zh: '必点' },
		hours: { en: 'Hours', zh: '时间' },
		backup: { en: 'Backup', zh: '备选' },
		option: { en: 'Other option', zh: '另一个选择' },
		options: { en: 'Options', zh: '可选项' },
		optional: { en: 'Optional', zh: '可选' },
		notes: { en: 'Note', zh: '备注' },
		confirmed: { en: 'Confirmed', zh: '已确认' },
		tentative: { en: 'Tentative', zh: '暂定' },
		'needs-decision': { en: 'TBD', zh: '待定' },
		sight: { en: 'Sight', zh: '景点' },
		restaurant: { en: 'Restaurant', zh: '餐厅' },
		hotel: { en: 'Hotel', zh: '酒店' },
		airport: { en: 'Airport', zh: '机场' },
		station: { en: 'Station', zh: '车站' },
		church: { en: 'Church', zh: '教会' },
		other: { en: 'Stop', zh: '停留' },
		directions: { en: 'Directions to {name}', zh: '去{name}的路线' },
		website: { en: '{name} official website', zh: '{name}官网' },
		offscreen: { en: 'Stop {n}, off the map', zh: '第 {n} 站在地图外面' },
		langGroup: { en: 'Language', zh: '语言' }
	};

	var ICONS = {
		walk: 'fa-walking',
		flight: 'fa-plane',
		train: 'fa-train',
		metro: 'fa-subway',
		tram: 'fa-tram',
		bus: 'fa-bus',
		taxi: 'fa-taxi'
	};

	var state = {
		lang: 'en',
		key: null,
		ready: false,
		day: 0,
		active: null,
		cities: [],
		city: null,
		map: null,
		markers: []
	};

	var indexReq = null;
	var cityReq = {};
	var bound = false;

	function readLang() {
		try {
			var v = localStorage.getItem(LANG_KEY);
			if (v === 'zh' || v === 'en') return v;
		} catch (e) { /* private mode */ }
		return 'en';
	}

	function writeLang(v) {
		try { localStorage.setItem(LANG_KEY, v); } catch (e) { /* private mode */ }
	}

	function ui(key) {
		var row = UI[key] || {};
		return row[state.lang] || row.en || '';
	}

	function tx(obj) {
		if (!obj) return '';
		if (typeof obj === 'string') return obj;
		return obj[state.lang] || obj.en || obj.zh || '';
	}

	function esc(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function parseISO(iso) {
		var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (!m) return null;
		return { y: +m[1], m: +m[2], d: +m[3] };
	}

	function formatRange(start, end) {
		var s = parseISO(start);
		var e = parseISO(end || start);
		if (!s) return '';
		if (state.lang === 'zh') {
			if (!e || (s.y === e.y && s.m === e.m && s.d === e.d)) return s.m + '月' + s.d + '日';
			if (s.y === e.y && s.m === e.m) return s.m + '月' + s.d + '–' + e.d + '日';
			if (s.y === e.y) return s.m + '月' + s.d + '日 – ' + e.m + '月' + e.d + '日';
			return s.y + '年' + s.m + '月' + s.d + '日 – ' + e.y + '年' + e.m + '月' + e.d + '日';
		}
		var sm = MONTHS[s.m - 1];
		var em = e ? MONTHS[e.m - 1] : sm;
		if (!e || (s.y === e.y && s.m === e.m && s.d === e.d)) return sm + ' ' + s.d;
		if (s.y === e.y && s.m === e.m) return sm + ' ' + s.d + ' – ' + e.d;
		if (s.y === e.y) return sm + ' ' + s.d + ' – ' + em + ' ' + e.d;
		return sm + ' ' + s.d + ', ' + s.y + ' – ' + em + ' ' + e.d + ', ' + e.y;
	}

	function formatDay(date, weekday) {
		var p = parseISO(date);
		if (!p) return '';
		if (state.lang === 'zh') {
			return p.m + '月' + p.d + '日' + (WEEK_ZH[weekday] ? ' ' + WEEK_ZH[weekday] : '');
		}
		return (weekday ? weekday + ', ' : '') + MONTHS[p.m - 1] + ' ' + p.d;
	}

	function dayLabel(i) {
		var n = i + 1;
		return state.lang === 'zh' ? '第 ' + n + ' 天' : 'Day ' + n;
	}

	function parseClock(value) {
		if (!value || value === '—' || value === '-') return null;
		var m = String(value).replace(/^~\s*/, '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
		if (!m) return null;
		var h = parseInt(m[1], 10);
		var min = m[2] ? parseInt(m[2], 10) : 0;
		var ap = (m[3] || '').toUpperCase();
		if (ap === 'PM' && h < 12) h += 12;
		if (ap === 'AM' && h === 12) h = 0;
		if (h > 24 || min > 59) return null;
		return h * 60 + min;
	}

	function visitLength(arrive, leave) {
		var a = parseClock(arrive);
		var b = parseClock(leave);
		if (a == null || b == null) return null;
		var d = b - a;
		if (d < 0) d += 24 * 60;
		if (!d) return null;
		return d;
	}

	function formatMinutes(mins) {
		if (mins == null) return '';
		var h = Math.floor(mins / 60);
		var m = mins % 60;
		if (state.lang === 'zh') {
			if (h && m) return h + ' 小时 ' + m + ' 分钟';
			if (h) return h + ' 小时';
			return m + ' 分钟';
		}
		if (h && m) return h + ' hr ' + m + ' min';
		if (h) return h + ' hr';
		return m + ' min';
	}

	function legTime(transit) {
		if (!transit || transit.duration == null || transit.duration === '') return '—';
		if (state.lang === 'zh' && transit.durationZh) return transit.durationZh;
		if (state.lang === 'zh') {
			return String(transit.duration)
				.replace(/(\d+)\s*h\b/g, '$1 小时')
				.replace(/(\d+)\s*m\b/g, '$1 分钟')
				.replace(/\bmin\b/g, '分钟');
		}
		return String(transit.duration);
	}

	function modeLabel(transit) {
		var raw = tx(transit && transit.label) || '';
		if (state.lang === 'en') {
			return raw.replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
		}
		return raw;
	}

	function placeName(item) {
		return tx(item && item.name) || '';
	}

	function directionsHref(item, allowName) {
		if (item && typeof item.lat === 'number' && typeof item.lng === 'number') {
			return 'https://www.google.com/maps/dir/?api=1&destination=' + item.lat + ',' + item.lng;
		}
		if (!allowName) return '';
		var name = (item && item.nativeName) || placeName(item);
		if (!name) return '';
		return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(name);
	}

	function iconButtons(item, allowName) {
		var name = placeName(item);
		var html = '';
		var dir = directionsHref(item, allowName);
		if (dir) {
			html += '<a class="guide-icon-btn" href="' + esc(dir) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(ui('directions').replace('{name}', name)) + '"><i class="fas fa-location-arrow" aria-hidden="true"></i></a>';
		}
		if (item && item.website) {
			html += '<a class="guide-icon-btn" href="' + esc(item.website) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(ui('website').replace('{name}', name)) + '"><i class="fas fa-globe" aria-hidden="true"></i></a>';
		}
		return html;
	}

	function mustHtml(item) {
		if (!item) return '';
		if (item.text) return esc(tx(item.text));
		var name = esc(item.name || '');
		var gloss = item.gloss ? (item.gloss[state.lang] || '') : '';
		if (!gloss) return '<span class="guide-must-name">' + name + '</span>';
		return '<span class="guide-must-name">' + name + '</span> <span class="guide-must-gloss">' + esc(gloss) + '</span>';
	}

	function mustBlock(labelKey, items) {
		if (!items || !items.length) return '';
		var lis = items.map(function (item) {
			return '<li>' + mustHtml(item) + '</li>';
		}).join('');
		return '<div class="guide-must"><span class="guide-kicker">' + esc(ui(labelKey)) + '</span><ul>' + lis + '</ul></div>';
	}

	function statusClass(status) {
		if (status === 'needs-decision') return 'is-decision';
		if (status === 'tentative') return 'is-tentative';
		return 'is-confirmed';
	}

	function syncTabs() {
		var label = ui('tab');
		$('a[data-travel-tab="guide"]').each(function () {
			if (this.children.length) return;
			if (this.textContent !== label) this.textContent = label;
		});
	}

	function destroyMap() {
		if (state.map) {
			state.map.remove();
			state.map = null;
		}
		state.markers = [];
	}

	var STREET_ZOOM = 17;

	function markerIcon(n, status, active, dx, dy) {
		dx = dx || 0;
		dy = dy || 0;
		return L.divIcon({
			className: 'guide-marker ' + statusClass(status) + (active ? ' is-active' : ''),
			html: '<span>' + n + '</span>',
			iconSize: [30, 30],
			iconAnchor: [15 - dx, 15 - dy]
		});
	}

	function distanceMeters(a, b) {
		var R = 6371000;
		var p1 = a[0] * Math.PI / 180;
		var p2 = b[0] * Math.PI / 180;
		var dphi = (b[0] - a[0]) * Math.PI / 180;
		var dl = (b[1] - a[1]) * Math.PI / 180;
		var h = Math.sin(dphi / 2) * Math.sin(dphi / 2) +
			Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
		return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
	}

	function median(values) {
		var xs = values.slice().sort(function (a, b) { return a - b; });
		var n = xs.length;
		if (!n) return 0;
		var mid = Math.floor(n / 2);
		return n % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
	}

	function locatedStops(stops) {
		var out = [];
		(stops || []).forEach(function (s, i) {
			if (typeof s.lat === 'number' && typeof s.lng === 'number') {
				out.push({ index: i, lat: s.lat, lng: s.lng });
			}
		});
		return out;
	}

	// Fit the dense group. A stop is an outlier when it sits far beyond the
	// median distance of the nearer half, so one airport or the Atomium
	// does not shrink the walking cluster.
	function coreAndOutliers(located) {
		if (located.length <= 2) return { core: located.slice(), outliers: [] };
		var center = [
			median(located.map(function (p) { return p.lat; })),
			median(located.map(function (p) { return p.lng; }))
		];
		var ranked = located.map(function (p) {
			return { p: p, d: distanceMeters(center, [p.lat, p.lng]) };
		}).sort(function (a, b) { return a.d - b.d; });
		var nearer = ranked.slice(0, Math.ceil(ranked.length / 2));
		var scale = median(nearer.map(function (r) { return r.d; }));
		var threshold = Math.max(scale * 4, 1800);
		var core = [];
		var outliers = [];
		ranked.forEach(function (r) {
			if (r.d > threshold) outliers.push(r.p);
			else core.push(r.p);
		});
		if (!core.length) core = [ranked[0].p];
		return { core: core, outliers: outliers };
	}

	function fitStops(stops) {
		if (!state.map) return;
		var located = locatedStops(stops);
		if (!located.length) return;
		var split = coreAndOutliers(located);
		state.outliers = split.outliers;
		var pts = split.core.map(function (p) { return [p.lat, p.lng]; });
		if (pts.length === 1) state.map.setView(pts[0], 16, { animate: false });
		else state.map.fitBounds(pts, { padding: [36, 36], maxZoom: 16, animate: false });
		updateMapDecor();
	}

	function scrollStopIntoView(el) {
		var scroller = document.getElementById('guide-timeline');
		if (!el || !scroller) return;
		var elRect = el.getBoundingClientRect();
		var box = scroller.getBoundingClientRect();
		if (elRect.top < box.top + 4 || elRect.bottom > box.bottom - 4) {
			scroller.scrollTop += elRect.top - box.top - 12;
		}
	}

	function refreshMarkerIcon(m) {
		var on = state.active === m.index;
		m.marker.setIcon(markerIcon(m.number, m.status, on, m.dx || 0, m.dy || 0));
		m.marker.setZIndexOffset(on ? 900 : ((m.dx || m.dy) ? 200 : 0));
	}

	function setActive(index, fly) {
		state.active = index;
		$('#guide-timeline .guide-stop').removeClass('is-active');
		var el = document.querySelector('#guide-timeline .guide-stop[data-stop="' + index + '"]');
		if (el) {
			el.classList.add('is-active');
			scrollStopIntoView(el);
		}
		state.markers.forEach(refreshMarkerIcon);
		if (fly) flyToStop(index);
	}

	function flyToStop(index) {
		var found = null;
		state.markers.forEach(function (m) {
			if (m.index === index) found = m;
		});
		if (!found || !state.map) return;
		state.map.flyTo(found.marker.getLatLng(), STREET_ZOOM, { duration: 0.55 });
	}

	function spreadMarkers() {
		if (!state.map || !state.markers.length) return;
		var items = state.markers.map(function (m) {
			var p = state.map.latLngToContainerPoint(m.marker.getLatLng());
			return { m: m, x: p.x, y: p.y, dx: 0, dy: 0 };
		});
		var minDist = 34;
		var i;
		var j;
		var iter;
		var a;
		var b;
		var vx;
		var vy;
		var dist;
		var push;
		for (iter = 0; iter < 14; iter++) {
			for (i = 0; i < items.length; i++) {
				for (j = i + 1; j < items.length; j++) {
					a = items[i];
					b = items[j];
					vx = (b.x + b.dx) - (a.x + a.dx);
					vy = (b.y + b.dy) - (a.y + a.dy);
					dist = Math.sqrt(vx * vx + vy * vy);
					if (dist >= minDist) continue;
					if (dist < 0.01) {
						vx = Math.cos(i * 2.4 + j);
						vy = Math.sin(i * 2.4 + j);
						dist = 1;
					}
					push = (minDist - Math.min(dist, minDist)) / 2;
					vx = vx / dist * push;
					vy = vy / dist * push;
					a.dx -= vx;
					a.dy -= vy;
					b.dx += vx;
					b.dy += vy;
				}
			}
		}
		var cap = 26;
		items.forEach(function (it) {
			var mag = Math.sqrt(it.dx * it.dx + it.dy * it.dy);
			if (mag > cap) {
				it.dx = it.dx / mag * cap;
				it.dy = it.dy / mag * cap;
			}
			it.dx = Math.round(it.dx);
			it.dy = Math.round(it.dy);
			if (it.m.dx === it.dx && it.m.dy === it.dy) return;
			it.m.dx = it.dx;
			it.m.dy = it.dy;
			refreshMarkerIcon(it.m);
		});
	}

	function placeOffscreenHints() {
		var box = document.getElementById('guide-offscreen');
		if (!box || !state.map) return;
		var size = state.map.getSize();
		if (!size || !size.x || !size.y) {
			box.innerHTML = '';
			return;
		}
		var padX = 22;
		var padY = 22;
		var html = [];
		(state.outliers || []).forEach(function (p) {
			var pt = state.map.latLngToContainerPoint([p.lat, p.lng]);
			if (pt.x >= 8 && pt.y >= 8 && pt.x <= size.x - 8 && pt.y <= size.y - 8) return;
			var cx = size.x / 2;
			var cy = size.y / 2;
			var ang = Math.atan2(pt.y - cy, pt.x - cx);
			var maxX = size.x / 2 - padX;
			var maxY = size.y / 2 - padY;
			var cos = Math.cos(ang);
			var sin = Math.sin(ang);
			var scale = Math.min(
				Math.abs(cos) < 0.001 ? Infinity : maxX / Math.abs(cos),
				Math.abs(sin) < 0.001 ? Infinity : maxY / Math.abs(sin)
			);
			var x = cx + cos * scale;
			var y = cy + sin * scale;
			if (x < 54 && y < 92) y = 96;
			html.push(
				'<button type="button" class="guide-edge" data-stop="' + p.index + '" style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px" aria-label="' + esc(ui('offscreen').replace('{n}', String(p.index + 1))) + '"><span>' + (p.index + 1) + '</span></button>'
			);
		});
		box.innerHTML = html.join('');
	}

	function updateMapDecor() {
		spreadMarkers();
		placeOffscreenHints();
	}

	function drawMap(stops) {
		destroyMap();
		var node = document.getElementById('guide-map');
		if (!node || typeof L === 'undefined') return;
		state.outliers = [];
		state.map = L.map(node, {
			scrollWheelZoom: true,
			zoomControl: true,
			attributionControl: true
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 19
		}).addTo(state.map);
		state.map.on('zoomend moveend', updateMapDecor);

		var line = [];
		stops.forEach(function (stop, i) {
			if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return;
			var ll = [stop.lat, stop.lng];
			line.push(ll);
			var marker = L.marker(ll, {
				icon: markerIcon(i + 1, stop.status, state.active === i, 0, 0),
				keyboard: true,
				title: placeName(stop),
				zIndexOffset: state.active === i ? 900 : 0
			});
			marker.on('click', function () { setActive(i, false); });
			marker.addTo(state.map);
			state.markers.push({
				index: i,
				number: i + 1,
				status: stop.status,
				marker: marker,
				dx: 0,
				dy: 0
			});
		});
		if (line.length > 1) {
			L.polyline(line, {
				color: '#303F9F',
				weight: 4,
				opacity: 0.8,
				lineJoin: 'round',
				lineCap: 'round'
			}).addTo(state.map);
		}
		state.map.invalidateSize();
		fitStops(stops);
	}

	function refreshMap() {
		var day = state.city && state.city.days[state.day];
		if (!day) return;
		setTimeout(function () {
			if (!state.map) drawMap(day.stops);
			else {
				state.map.invalidateSize();
				fitStops(day.stops);
			}
		}, 40);
	}

	function langSwitch() {
		return '<div class="guide-lang" role="group" aria-label="' + esc(ui('langGroup')) + '">' +
			'<button type="button" class="guide-lang-btn' + (state.lang === 'en' ? ' is-active' : '') + '" data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button>' +
			'<button type="button" class="guide-lang-btn' + (state.lang === 'zh' ? ' is-active' : '') + '" data-lang="zh" aria-pressed="' + (state.lang === 'zh') + '">中文</button>' +
			'</div>';
	}

	function draftBadge() {
		return '<span class="guide-draft">' + esc(ui('draft')) + '</span>';
	}

	function renderLoading() {
		$('#guide-root').attr('lang', state.lang === 'zh' ? 'zh-Hans' : 'en')
			.html('<p class="guide-loading">' + esc(ui('loading')) + '</p>');
	}

	function renderMessage(text, back) {
		var html = '<div class="guide-toolbar"><div class="guide-heading">' + draftBadge() + '</div>' + langSwitch() + '</div>' +
			'<div class="guide-scroll"><p class="guide-message">' + esc(text) + '</p>';
		if (back) {
			html += '<a class="guide-back" href="/travel/guide/">' + esc(ui('back')) + '</a>';
		}
		html += '</div>';
		$('#guide-root').attr('lang', state.lang === 'zh' ? 'zh-Hans' : 'en').html(html);
		syncTabs();
	}

	function renderLanding() {
		destroyMap();
		var cards = state.cities.map(function (city) {
			var fit = city.coverFit === 'contain' ? ' fit-contain' : ' fit-cover';
			return '<a class="guide-card" href="/travel/guide/' + esc(city.id) + '/" data-city="' + esc(city.id) + '">' +
				'<span class="guide-card-cover' + fit + '"><img src="' + esc(city.cover || city.flag || '') + '" alt="' + esc(tx(city.name)) + '"></span>' +
				'<span class="guide-card-body">' +
					'<span class="guide-card-name">' + esc(tx(city.name)) + '</span>' +
					'<span class="guide-card-dates">' + esc(formatRange(city.dates && city.dates.start, city.dates && city.dates.end)) + '</span>' +
				'</span></a>';
		}).join('');
		var html = '<div class="guide-toolbar"><div class="guide-heading">' + draftBadge() + '</div>' + langSwitch() + '</div>' +
			'<div class="guide-scroll"><div class="guide-cards">' + cards + '</div></div>';
		$('#guide-root').attr('lang', state.lang === 'zh' ? 'zh-Hans' : 'en').html(html);
		syncTabs();
	}

	function timeCol(stop) {
		var html = '<div class="guide-tl-times">';
		if (stop && stop.arrive) html += '<span>' + esc(stop.arrive) + '</span>';
		if (stop && stop.leave) html += '<span class="is-leave">' + esc(stop.leave) + '</span>';
		html += '</div>';
		return html;
	}

	function legHtml(stop) {
		if (!stop.transit) return '';
		var walk = stop.transit.mode === 'walk' ? ' is-walk' : '';
		var icon = ICONS[stop.transit.mode] || 'fa-arrow-down';
		var bits = [modeLabel(stop.transit)];
		if (stop.transit.detail) bits.push(tx(stop.transit.detail));
		bits.push(legTime(stop.transit));
		return '<div class="guide-tl-leg' + walk + '" aria-hidden="true">' +
			'<div class="guide-tl-times"></div>' +
			'<div class="guide-tl-axis"></div>' +
			'<p class="guide-tl-leg-label"><i class="fas ' + icon + '"></i><span>' + esc(bits.filter(Boolean).join(' · ')) + '</span></p>' +
			'</div>';
	}

	function stopHtml(stop, index) {
		var active = state.active === index ? ' is-active' : '';
		var native = stop.nativeName && stop.nativeName !== placeName(stop)
			? '<p class="guide-native">' + esc(stop.nativeName) + '</p>' : '';
		var chips = '<span class="guide-status ' + statusClass(stop.status) + '">' + esc(ui(stop.status) || stop.status) + '</span>';
		if (stop.optional) chips += '<span class="guide-status is-optional">' + esc(ui('optional')) + '</span>';
		var notes = stop.notes && tx(stop.notes) ? '<p class="guide-notes">' + esc(tx(stop.notes)) + '</p>' : '';
		var hours = stop.hours ? '<p class="guide-hours">' + esc(tx(stop.hours)) + '</p>' : '';
		var alts = '';
		if (stop.alternatives && stop.alternatives.length) {
			var label = stop.alternatives.length > 1 ? ui('options') : ui('option');
			alts = '<div class="guide-alts"><span class="guide-kicker">' + esc(label) + '</span><ul>' +
				stop.alternatives.map(function (alt) {
					var note = alt.note && tx(alt.note) ? '<span class="guide-alt-note">' + esc(tx(alt.note)) + '</span>' : '';
					return '<li><span class="guide-alt-name">' + esc(placeName(alt)) + '</span>' + note +
						'<span class="guide-stop-actions">' + iconButtons(alt, false) + '</span></li>';
				}).join('') + '</ul></div>';
		}
		return '<div class="guide-stop guide-tl-stop' + active + '" data-stop="' + index + '" role="button" tabindex="0">' +
			timeCol(stop) +
			'<div class="guide-tl-axis"><span class="guide-tl-dot ' + statusClass(stop.status) + '">' + (index + 1) + '</span></div>' +
			'<div class="guide-tl-body">' +
				'<div class="guide-tl-head">' +
					'<div class="guide-stop-titles"><h3>' + esc(placeName(stop)) + '</h3>' + native +
						'<p class="guide-chips">' + chips + '</p></div>' +
					'<div class="guide-stop-actions">' + iconButtons(stop, true) + '</div>' +
				'</div>' +
				notes + hours +
				mustBlock('mustSee', stop.mustSee) +
				mustBlock('mustOrder', stop.mustOrder) +
				alts +
			'</div></div>' + legHtml(stop);
	}

	function renderCity() {
		destroyMap();
		var city = state.city;
		if (!city) {
			renderMessage(ui('missing'), true);
			return;
		}
		if (state.day >= city.days.length) state.day = 0;
		var day = city.days[state.day];
		var tabs = city.days.map(function (d, i) {
			var on = i === state.day;
			return '<button type="button" class="guide-day' + (on ? ' is-active' : '') + '" role="tab" data-day="' + i + '" aria-selected="' + on + '">' +
				'<span class="guide-day-kicker">' + esc(dayLabel(i)) + '</span>' +
				'<span class="guide-day-date">' + esc(formatDay(d.date, d.weekday)) + '</span></button>';
		}).join('');
		var stops = day.stops.map(stopHtml).join('');
		var notes = (day.notes || []).map(function (n) {
			return '<li>' + esc(tx(n)) + '</li>';
		}).join('');
		var noteBlock = notes ? '<ul class="guide-day-notes">' + notes + '</ul>' : '';
		var html = '<div class="guide-toolbar">' +
				'<div class="guide-heading"><p class="guide-city-name">' + esc(tx(city.name)) + ' ' + draftBadge() + '</p>' +
					'<p class="guide-city-dates">' + esc(formatRange(city.dates.start, city.dates.end)) + '</p></div>' +
				langSwitch() +
			'</div>' +
			'<div class="guide-days" role="tablist">' + tabs + '</div>' +
			'<div class="guide-split">' +
				'<div class="guide-map-panel"><div id="guide-map" class="guide-map" role="application" aria-label="' + esc(tx(city.name)) + '"></div><div class="guide-offscreen" id="guide-offscreen"></div></div>' +
				'<div class="guide-timeline" id="guide-timeline"><div class="guide-tl">' + stops + '</div>' + noteBlock + '</div>' +
			'</div>';
		$('#guide-root').attr('lang', state.lang === 'zh' ? 'zh-Hans' : 'en').html(html);
		syncTabs();
		refreshMap();
	}

	function render() {
		state.ready = true;
		if (state.key) renderCity();
		else renderLanding();
	}

	function loadIndex() {
		if (!indexReq) indexReq = $.getJSON('data/guide/index.json');
		return indexReq;
	}

	function loadCity(id) {
		if (!/^[a-z0-9-]+$/.test(id)) return $.Deferred().reject().promise();
		if (!cityReq[id]) cityReq[id] = $.getJSON('data/guide/' + id + '.json');
		return cityReq[id];
	}

	function loadLanding() {
		var d = $.Deferred();
		loadIndex().done(function (index) {
			var ids = (index && index.cities) || [];
			if (!ids.length) { d.resolve([]); return; }
			var left = ids.length;
			var out = new Array(ids.length);
			ids.forEach(function (id, i) {
				loadCity(id).done(function (city) { out[i] = city; }).always(function () {
					left -= 1;
					if (!left) d.resolve(out.filter(Boolean));
				});
			});
		}).fail(function () { d.reject(); });
		return d.promise();
	}

	function show(cityId) {
		var key = cityId || '';
		if (!/^[a-z0-9-]*$/.test(key)) key = '';
		syncTabs();
		if (state.key === key && state.ready) {
			refreshMap();
			return;
		}
		state.key = key;
		state.day = 0;
		state.active = null;
		state.ready = false;
		state.city = null;
		destroyMap();
		renderLoading();
		var req = $.Deferred();
		if (key) {
			loadCity(key).done(function (city) {
				req.resolve({ city: city });
			}).fail(function () {
				req.resolve({ missing: true });
			});
		} else {
			loadLanding().done(function (cities) {
				req.resolve({ cities: cities });
			}).fail(function () {
				req.resolve({ error: true });
			});
		}
		req.done(function (result) {
			if (state.key !== key) return;
			if (result.error) {
				state.ready = true;
				renderMessage(ui('error'), false);
				return;
			}
			if (result.missing) {
				state.ready = true;
				renderMessage(ui('missing'), true);
				return;
			}
			if (result.city) state.city = result.city;
			if (result.cities) state.cities = result.cities;
			render();
		});
	}

	function setLang(lang) {
		if (lang !== 'en' && lang !== 'zh') return;
		if (lang === state.lang) return;
		state.lang = lang;
		writeLang(lang);
		syncTabs();
		if (!state.ready) return;
		render();
	}

	function bind() {
		if (bound) return;
		bound = true;
		$(document).on('click', '.guide-lang-btn', function (e) {
			e.preventDefault();
			setLang($(this).data('lang'));
		});
		$(document).on('click', '.guide-day', function () {
			var day = parseInt($(this).attr('data-day'), 10);
			if (day === state.day) return;
			state.day = day;
			state.active = null;
			renderCity();
		});
		$(document).on('click', 'a.guide-card, a.guide-back', function (e) {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.which === 2) return;
			e.preventDefault();
			var city = $(this).attr('data-city') || '';
			if (window.SiteRouter) {
				window.SiteRouter.go({
					section: 'travel',
					travelTab: 'guide',
					guideCity: city || undefined
				});
			}
		});
		$(document).on('click', '.guide-edge', function (e) {
			e.preventDefault();
			e.stopPropagation();
			setActive(parseInt($(this).attr('data-stop'), 10), true);
		});
		$(document).on('click', '.guide-stop', function (e) {
			if ($(e.target).closest('a').length) return;
			setActive(parseInt($(this).attr('data-stop'), 10), true);
		});
		$(document).on('keydown', '.guide-stop', function (e) {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ($(e.target).closest('a').length) return;
			e.preventDefault();
			setActive(parseInt($(this).attr('data-stop'), 10), true);
		});
		$(window).on('resize', function () {
			if (state.map) state.map.invalidateSize();
		});
	}

	state.lang = readLang();
	bind();
	syncTabs();

	window.TravelGuide = { show: show };
}(jQuery));
