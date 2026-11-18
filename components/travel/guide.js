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
		mustSee: { en: 'Must see', zh: '必看' },
		mustEat: { en: 'Must eat', zh: '必吃' },
		mustOrder: { en: 'Must eat', zh: '必吃' },
		booked: { en: 'Booked', zh: '已预订' },
		tickets: { en: 'Tickets', zh: '票务' },
		bookLink: { en: 'Book', zh: '购票' },
		hours: { en: 'Hours', zh: '时间' },
		backup: { en: 'Backups', zh: '备选' },
		daytrip: { en: 'Day trip', zh: '一日游' },
		openDay: { en: 'Open this day', zh: '打开这一天' },
		option: { en: 'Other option', zh: '另一个选择' },
		options: { en: 'Options', zh: '可选项' },
		optional: { en: 'Optional', zh: '可选' },
		notes: { en: 'Note', zh: '备注' },
		confirmed: { en: 'Confirmed', zh: '已确认' },
		tentative: { en: 'Tentative', zh: '暂定' },
		'needs-decision': { en: 'TBD', zh: '待定' },
		dayAlt: { en: 'Alternative', zh: '备选方案' },
		sight: { en: 'Sight', zh: '景点' },
		restaurant: { en: 'Restaurant', zh: '餐厅' },
		hotel: { en: 'Hotel', zh: '酒店' },
		airport: { en: 'Airport', zh: '机场' },
		station: { en: 'Station', zh: '车站' },
		church: { en: 'Church', zh: '教会' },
		bar: { en: 'Bar', zh: '酒吧' },
		rental: { en: 'Car', zh: '租车' },
		returnOpts: { en: 'Return options', zh: '返程选项' },
		other: { en: 'Stop', zh: '停留' },
		directions: { en: 'Directions to {name}', zh: '去{name}的路线' },
		website: { en: '{name} official website', zh: '{name}官网' },
		langGroup: { en: 'Language', zh: '语言' }
	};

	var ICONS = {
		walk: 'fa-walking',
		flight: 'fa-plane',
		train: 'fa-train',
		metro: 'fa-subway',
		tram: 'fa-tram',
		bus: 'fa-bus',
		taxi: 'fa-taxi',
		drive: 'fa-car',
		lift: 'fa-arrow-down'
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
		if (!e) e = s;
		if (state.lang === 'zh') {
			if (s.y === e.y && s.m === e.m && s.d === e.d) return s.y + '年' + s.m + '月' + s.d + '日';
			if (s.y === e.y && s.m === e.m) return s.y + '年' + s.m + '月' + s.d + '–' + e.d + '日';
			if (s.y === e.y) return s.y + '年' + s.m + '月' + s.d + '日 – ' + e.m + '月' + e.d + '日';
			return s.y + '年' + s.m + '月' + s.d + '日–' + e.y + '年' + e.m + '月' + e.d + '日';
		}
		var sm = MONTHS[s.m - 1];
		var em = MONTHS[e.m - 1];
		if (s.y === e.y && s.m === e.m && s.d === e.d) return sm + ' ' + s.d + ', ' + s.y;
		if (s.y === e.y && s.m === e.m) return sm + ' ' + s.d + ' – ' + e.d + ', ' + s.y;
		if (s.y === e.y) return sm + ' ' + s.d + ' – ' + em + ' ' + e.d + ', ' + s.y;
		return sm + ' ' + s.d + ', ' + s.y + ' – ' + em + ' ' + e.d + ', ' + e.y;
	}

	function dayLabel(i) {
		var n = i + 1;
		return state.lang === 'zh' ? '第 ' + n + ' 天' : 'Day ' + n;
	}

	var TIME_PHRASES = [
		[/after midnight/gi, '午夜后'],
		[/before midnight/gi, '午夜前'],
		[/early morning/gi, '清晨'],
		[/late morning/gi, '临近中午'],
		[/late night/gi, '深夜'],
		[/midnight/gi, '午夜'],
		[/morning/gi, '上午'],
		[/afternoon/gi, '下午'],
		[/evening/gi, '晚上'],
		[/night/gi, '晚上'],
		[/noon|midday/gi, '中午'],
		[/^flexible$/i, '时间灵活'],
		[/\bflexible\b/gi, '灵活'],
		[/\bTBD\b/gi, '待定']
	];
	var TIME_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

	function timeSource(value) {
		if (value == null || value === '') return '';
		if (typeof value === 'object') return value.en || value.zh || '';
		return String(value);
	}

	function applyTimePhrases(text) {
		var s = String(text);
		TIME_PHRASES.forEach(function (pair) { s = s.replace(pair[0], pair[1]); });
		return s;
	}

	function zhTimeParen(inner) {
		var t = String(inner).trim();
		var mon = t.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i);
		if (mon) return TIME_MONTHS[mon[1].toLowerCase()] + '月' + mon[2] + '日';
		t = t.replace(/depends on (?:the )?flight/gi, '视航班而定');
		return applyTimePhrases(t);
	}

	function zhTimeLabel(raw) {
		var s = String(raw).trim();
		if (!s) return '';
		s = s.replace(/\btable\b/gi, '入座');
		s = s.replace(/\bslot\b/gi, '时段');
		s = s.replace(/\bentry\b/gi, '入场');
		s = s.replace(/\bdoors\b/gi, '开门');
		s = s.replace(/\bcurtain\b/gi, '开演');
		s = s.replace(/\(([^)]+)\)/g, function (_m, inner) { return '（' + zhTimeParen(inner) + '）'; });
		s = s.replace(/~?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi, function (all, h, min, ap) {
			var hour = parseInt(h, 10);
			var mm = min || '00';
			var mer = String(ap).toUpperCase();
			if (mer === 'PM' && hour < 12) hour += 12;
			if (mer === 'AM' && hour === 12) hour = 0;
			return (/^~/.test(all.trim()) ? '约' : '') + hour + ':' + mm;
		});
		s = applyTimePhrases(s);
		s = s.replace(/^\s*~\s*/, '约');
		s = s.replace(/\s+（/g, '（');
		s = s.replace(/service/gi, '礼拜 ');
		s = s.replace(/([^\u0000-\u007F])(\d{1,2}:\d{2})/g, '$1 $2');
		return s.replace(/\s{2,}/g, ' ').trim();
	}

	function formatTimeLabel(value) {
		if (value == null || value === '') return '';
		var raw = typeof value === 'object' ? tx(value) : String(value);
		if (state.lang !== 'zh') return raw;
		return zhTimeLabel(raw);
	}

	function parseClock(value) {
		value = timeSource(value);
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

	function mustBlock(labelKey, items, note) {
		if (!items || !items.length) return '';
		var lis = items.map(function (item) {
			return '<li>' + mustHtml(item) + '</li>';
		}).join('');
		var noteHtml = note && tx(note) ? '<p class="guide-must-note">' + esc(tx(note)) + '</p>' : '';
		return '<div class="guide-must"><span class="guide-kicker">' + esc(ui(labelKey)) + '</span><ul>' + lis + '</ul>' + noteHtml + '</div>';
	}

	function mealMeta(item) {
		if (!item) return '';
		var bits = [];
		if (item.founded) bits.push((state.lang === 'zh' ? '创立于 ' : 'Founded ') + item.founded);
		if (item.cuisine && tx(item.cuisine)) bits.push(tx(item.cuisine));
		var note = item.foundedNote && tx(item.foundedNote) ? '<span class="guide-founded-note">' + esc(tx(item.foundedNote)) + '</span>' : '';
		if (!bits.length && !note) return '';
		var line = bits.length ? esc(bits.join(' · ')) : '';
		return '<p class="guide-meal-meta">' + line + (line && note ? ' ' : '') + note + '</p>';
	}

	function ticketBlock(stop) {
		if (!stop || (!stop.ticket && !stop.bookingUrl)) return '';
		var text = stop.ticket && tx(stop.ticket) ? '<p class="guide-ticket-text">' + esc(tx(stop.ticket)) + '</p>' : '';
		var link = stop.bookingUrl
			? '<a class="guide-ticket-link" href="' + esc(stop.bookingUrl) + '" target="_blank" rel="noopener">' + esc(ui('bookLink')) + '</a>'
			: '';
		return '<div class="guide-ticket"><span class="guide-kicker">' + esc(ui('tickets')) + '</span>' + text + link + '</div>';
	}

	function displayStatus(stop) {
		var status = stop && stop.status;
		if (stop && stop.type === 'church' && status === 'needs-decision') return 'tentative';
		return status;
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
		var pts = coreAndOutliers(located).core.map(function (p) { return [p.lat, p.lng]; });
		if (pts.length === 1) state.map.setView(pts[0], 16, { animate: false });
		else state.map.fitBounds(pts, { padding: [36, 36], maxZoom: 16, animate: false });
		spreadMarkers();
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

	function drawMap(stops) {
		destroyMap();
		var node = document.getElementById('guide-map');
		if (!node || typeof L === 'undefined') return;
		state.map = L.map(node, {
			scrollWheelZoom: true,
			zoomControl: true,
			attributionControl: true
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 19
		}).addTo(state.map);
		state.map.on('zoomend moveend', spreadMarkers);

		var line = [];
		stops.forEach(function (stop, i) {
			if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return;
			var ll = [stop.lat, stop.lng];
			line.push(ll);
			var shownStatus = displayStatus(stop);
			var marker = L.marker(ll, {
				icon: markerIcon(i + 1, shownStatus, state.active === i, 0, 0),
				keyboard: true,
				title: placeName(stop),
				zIndexOffset: state.active === i ? 900 : 0
			});
			marker.on('click', function () { setActive(i, false); });
			marker.addTo(state.map);
			state.markers.push({
				index: i,
				number: i + 1,
				status: shownStatus,
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

	function cardHtml(city) {
		var fit = city.coverFit === 'contain' ? ' fit-contain' : ' fit-cover';
		return '<a class="guide-card" href="/travel/guide/' + esc(city.id) + '/" data-city="' + esc(city.id) + '">' +
			'<span class="guide-card-cover' + fit + '"><img src="' + esc(city.cover || city.flag || '') + '" alt="' + esc(tx(city.name)) + '"></span>' +
			'<span class="guide-card-body">' +
				'<span class="guide-card-name">' + esc(tx(city.name)) + '</span>' +
				'<span class="guide-card-dates">' + esc(formatRange(city.dates && city.dates.start, city.dates && city.dates.end)) + '</span>' +
			'</span></a>';
	}

	function renderLanding() {
		destroyMap();
		var groups = state.trips && state.trips.length ? state.trips : [{ name: null, cities: state.cities }];
		var body = groups.map(function (trip) {
			var cards = (trip.cities || []).map(cardHtml).join('');
			var heading = trip.name ? '<h2 class="guide-trip-name">' + esc(tx(trip.name)) + '</h2>' : '';
			return '<section class="guide-trip">' + heading + '<div class="guide-cards">' + cards + '</div></section>';
		}).join('');
		var html = '<div class="guide-toolbar">' + langSwitch() + '</div>' +
			'<div class="guide-scroll">' + body + '</div>';
		$('#guide-root').attr('lang', state.lang === 'zh' ? 'zh-Hans' : 'en').html(html);
		syncTabs();
	}

	function timeCol(stop) {
		var html = '<div class="guide-tl-times">';
		if (stop && stop.arrive) html += '<span>' + esc(formatTimeLabel(stop.arrive)) + '</span>';
		if (stop && stop.leave) html += '<span class="is-leave">' + esc(formatTimeLabel(stop.leave)) + '</span>';
		html += '</div>';
		return html;
	}

	function segDuration(seg) {
		var raw = seg && seg.duration;
		if (raw == null || raw === '') return '—';
		if (state.lang === 'zh') {
			if (seg.durationZh) return seg.durationZh;
			return String(raw)
				.replace(/(\d+)\s*h(?:\s*(\d+)\s*m\b)?/gi, function (_m, h, min) {
					return h + ' 小时' + (min ? ' ' + min + ' 分钟' : '');
				})
				.replace(/(\d+)\s*[–—-]\s*(\d+)\s*min\b/gi, '$1–$2 分钟')
				.replace(/(\d+)\s*min\b/gi, '$1 分钟');
		}
		return String(raw);
	}

	function legSegments(transit) {
		if (!transit) return [];
		if (transit.segments && transit.segments.length) return transit.segments;
		return [transit];
	}

	function shortLine(line) {
		return String(line || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
	}

	function shortDirection(dir) {
		var s = shortLine(dir);
		if (s.indexOf('/') !== -1) s = s.split('/')[0].trim();
		return s;
	}

	function segHeadline(seg) {
		var dur = segDuration(seg);
		var line = shortLine(seg && seg.line);
		var dir = shortDirection(seg && seg.direction);
		var head = line
			? line + (dir ? (state.lang === 'zh' ? ' 往 ' : ' → ') + dir : '')
			: modeLabel(seg);
		return head + ' · ' + dur;
	}

	function freqText(freq) {
		if (!freq) return '';
		if (state.lang !== 'zh') return freq;
		return String(freq)
			.replace(/every\s*~\s*/gi, '约每 ')
			.replace(/\bevery\b/gi, '每')
			.replace(/(\d)\s*min\b/gi, '$1 分钟')
			.replace(/\bmin\b/gi, '分钟')
			.replace(/Saturday timetable/gi, '周六时刻表')
			.replace(/Sunday timetable/gi, '周日时刻表')
			.replace(/holiday timetable/gi, '假日时刻表');
	}

	function segDetail(seg) {
		if (!seg) return '';
		var bits = [];
		if (seg.from && seg.to) bits.push(seg.from + ' → ' + seg.to);
		else if (seg.from) bits.push(seg.from);
		else if (seg.to) bits.push(seg.to);
		if (seg.stops) bits.push(state.lang === 'zh' ? seg.stops + ' 站' : seg.stops + (seg.stops === 1 ? ' stop' : ' stops'));
		if (seg.distanceM) {
			bits.push(seg.distanceM >= 1000
				? (seg.distanceM / 1000).toFixed(1).replace(/\.0$/, '') + (state.lang === 'zh' ? ' 公里' : ' km')
				: seg.distanceM + (state.lang === 'zh' ? ' 米' : ' m'));
		}
		if (seg.frequency) bits.push(freqText(seg.frequency));
		if (seg.note) {
			var noteText = typeof seg.note === 'object' ? (seg.note[state.lang] || '') : seg.note;
			if (noteText) bits.push(noteText);
		}
		return bits.join(' · ');
	}

	function fold(label, body) {
		if (!body) return '';
		return '<details class="guide-tl-fold"><summary>' + esc(label) + '</summary><p>' + esc(body) + '</p></details>';
	}

	function durationMinutes(seg) {
		var raw = String(seg && seg.duration || '').trim();
		if (!raw || /[–—-]/.test(raw)) return null;
		var hm = raw.match(/^~?\s*(\d+)\s*h(?:\s*(\d+)\s*m)?$/i);
		if (hm) return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
		var one = raw.match(/^~?\s*(\d+)\s*min$/i);
		if (one) return parseInt(one[1], 10);
		return null;
	}

	function clockLabel(mins) {
		if (mins == null || isNaN(mins)) return '';
		mins = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
		var h24 = Math.floor(mins / 60);
		var m = mins % 60;
		var ap = h24 >= 12 ? 'PM' : 'AM';
		var h12 = h24 % 12;
		if (!h12) h12 = 12;
		return formatTimeLabel(h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap);
	}

	function legRows(transit, nextStop, departMins) {
		var segments = legSegments(transit);
		if (!segments.length) return '';
		var cursor = departMins;
		return segments.map(function (seg, i) {
			var time = cursor != null ? clockLabel(cursor) : '';
			var add = durationMinutes(seg);
			if (cursor != null && add != null) cursor += add;
			else cursor = null;
			var icon = ICONS[seg.mode] || 'fa-arrow-down';
			var sub = '';
			if (segments.length === 1 && nextStop) {
				var dest = placeName(nextStop);
				if (dest) sub = '<p class="guide-leg-sub">' + esc((state.lang === 'zh' ? '到 ' : 'to ') + dest) + '</p>';
			}
			var detail = segDetail(seg);
			var more = detail ? fold(state.lang === 'zh' ? '详情' : 'Details', detail) : '';
			var extra = '';
			if (i === segments.length - 1) {
				if (transit.ticket && tx(transit.ticket)) extra += fold(state.lang === 'zh' ? '车票' : 'Tickets', tx(transit.ticket));
				if (transit.alternative && transit.alternative.length) {
					var alt = transit.alternative.map(function (altSeg) {
						var line = segHeadline(altSeg);
						var altDetail = segDetail(altSeg);
						return altDetail ? line + ' — ' + altDetail : line;
					}).join('\n');
					extra += '<details class="guide-tl-fold"><summary>' + esc(state.lang === 'zh' ? '另一条路线' : 'Alternative') + '</summary><p>' +
						esc(alt).replace(/\n/g, '<br>') + '</p></details>';
				}
			}
			return '<div class="guide-tl-leg">' +
				'<div class="guide-tl-times">' + (time ? '<span>' + esc(time) + '</span>' : '') + '</div>' +
				'<div class="guide-tl-axis"><span class="guide-tl-mode"><i class="fas ' + icon + '" aria-hidden="true"></i></span></div>' +
				'<div class="guide-tl-body"><h3 class="guide-leg-title">' + esc(segHeadline(seg)) + '</h3>' + sub + more + extra + '</div></div>';
		}).join('');
	}

	function stopHtml(stop, index) {
		var active = state.active === index ? ' is-active' : '';
		var native = stop.nativeName && stop.nativeName !== placeName(stop)
			? '<p class="guide-native">' + esc(stop.nativeName) + '</p>' : '';
		var shown = displayStatus(stop);
		var chips = '<span class="guide-status ' + statusClass(shown) + '">' + esc(ui(shown) || shown) + '</span>';
		if (stop.booked) chips += '<span class="guide-status is-booked">' + esc(ui('booked')) + '</span>';
		if (stop.optional) chips += '<span class="guide-status is-optional">' + esc(ui('optional')) + '</span>';
		var notes = stop.notes && tx(stop.notes) ? '<p class="guide-notes">' + esc(tx(stop.notes)) + '</p>' : '';
		var hours = stop.hours ? '<p class="guide-hours">' + esc(tx(stop.hours)) + '</p>' : '';
		if (stop.daytripCity) {
			notes = '<p class="guide-notes"><a class="guide-daytrip" data-city="' + esc(stop.daytripCity) + '" href="/travel/guide/' + esc(stop.daytripCity) + '/">' + esc(ui('openDay')) + '</a></p>';
			hours = '';
		}
		var alts = '';
		if (stop.alternatives && stop.alternatives.length) {
			var altBody = stop.alternatives.map(function (alt) {
				var note = alt.note && tx(alt.note) ? ' · ' + tx(alt.note) : '';
				return placeName(alt) + note;
			}).join('\n');
			alts = '<details class="guide-tl-fold"><summary>' + esc(ui('dayAlt')) + '</summary><p>' +
				esc(altBody).replace(/\n/g, '<br>') + '</p></details>';
		}
		var backups = backupsHtml(stop);
		var gap = stop.transit ? '' : ' is-gap';
		var inner = timeCol(stop) +
			'<div class="guide-tl-axis"><span class="guide-tl-dot ' + statusClass(shown) + '">' + (index + 1) + '</span></div>' +
			'<div class="guide-tl-body">' +
				'<div class="guide-tl-head">' +
					'<div class="guide-stop-titles"><h3>' + esc(placeName(stop)) + '</h3>' + native +
						'<p class="guide-chips">' + chips + '</p></div>' +
					'<div class="guide-stop-actions">' + iconButtons(stop, true) + '</div>' +
				'</div>' +
				notes + hours +
				mealMeta(stop) +
				mustBlock('mustSee', stop.mustSee) +
				mustBlock('mustEat', stop.mustOrder, stop.mustOrderNote) +
				ticketBlock(stop) +
				backups +
				alts +
			'</div>';
		var attrs = ' data-stop="' + index + '" role="button" tabindex="0"';
		if (stop.daytripCity) attrs += ' data-city="' + esc(stop.daytripCity) + '"';
		return '<div class="guide-stop guide-tl-stop' + active + gap + (stop.daytripCity ? ' guide-daytrip' : '') + '"' + attrs + '>' +
			inner + '</div>';
	}

	function backupsHtml(stop) {
		if (!stop.backups || !stop.backups.length) return '';
		var rows = stop.backups.map(function (item) {
			var name = state.lang === 'zh' ? (item.name || item.nameEn || '') : (item.nameEn || item.name || '');
			var area = state.lang === 'zh' ? (item.areaZh || item.area || '') : (item.area || '');
			var bits = [];
			if (area) bits.push(area);
			if (state.lang === 'zh' && item.distanceZh) bits.push(item.distanceZh);
			if (item.hoursZh) bits.push(item.hoursZh);
			var linkItem = {
				name: { en: item.nameEn || item.name || '', zh: item.name || item.nameEn || '' },
				lat: item.lat,
				lng: item.lng,
				website: item.website
			};
			var buttons = iconButtons(linkItem, true);
			var meta = bits.length ? '<p class="guide-backup-meta">' + esc(bits.join(' · ')) + '</p>' : '';
			return '<div class="guide-backup"><div class="guide-backup-head"><span class="guide-backup-name">' + esc(name) + '</span><span class="guide-stop-actions">' + buttons + '</span></div>' + meta + mealMeta(item) + mustBlock('mustEat', item.mustOrder, item.mustOrderNote) + '</div>';
		}).join('');
		if (!rows) return '';
		return '<details class="guide-tl-fold guide-backups"><summary>' + esc(ui('backup')) + '</summary>' + rows + '</details>';
	}

	function returnOptionsHtml(day) {
		if (!day.returnOptions || !day.returnOptions.length) return '';
		var lines = day.returnOptions.map(function (opt) {
			var depart = formatTimeLabel(opt.depart);
			var arrive = formatTimeLabel(opt.arrive);
			var bits = [String(opt.rank), opt.line, (opt.from || '') + ' → ' + (opt.to || '')];
			if (depart || arrive) bits.push((depart || '—') + '–' + (arrive || '—'));
			if (opt.note && tx(opt.note)) bits.push(tx(opt.note));
			if (opt.ticket && tx(opt.ticket)) bits.push(tx(opt.ticket));
			return bits.filter(Boolean).join(' · ');
		}).join('\n');
		return '<details class="guide-return"><summary>' + esc(ui('returnOpts')) + '</summary><p>' +
			esc(lines).replace(/\n/g, '<br>') + '</p></details>';
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
			var p = parseISO(d.date);
			var dateText = '';
			var weekText = '';
			if (p) {
				if (state.lang === 'zh') {
					dateText = p.m + '月' + p.d + '日';
					weekText = WEEK_ZH[d.weekday] ? ' ' + WEEK_ZH[d.weekday] : '';
				} else {
					dateText = MONTHS[p.m - 1] + ' ' + p.d;
					weekText = d.weekday ? d.weekday + ', ' : '';
				}
			}
			var week = weekText ? '<span class="guide-day-weekday">' + esc(weekText) + '</span>' : '';
			var dateHtml = state.lang === 'zh' ? esc(dateText) + week : week + esc(dateText);
			return '<button type="button" class="guide-day' + (on ? ' is-active' : '') + '" role="tab" data-day="' + i + '" aria-selected="' + on + '">' +
				'<span class="guide-day-kicker">' + esc(dayLabel(i)) + '</span>' +
				'<span class="guide-day-date">' + dateHtml + '</span></button>';
		}).join('');
		var section = day.section && tx(day.section)
			? '<p class="guide-day-section">' + esc(tx(day.section)) + '</p>' : '';
		var pieces = [];
		if (day.inbound) pieces.push(legRows(day.inbound, day.stops[0] || null, null));
		day.stops.forEach(function (stop, i) {
			pieces.push(stopHtml(stop, i));
			if (stop.transit) pieces.push(legRows(stop.transit, day.stops[i + 1] || null, parseClock(stop.leave)));
		});
		var stops = pieces.join('');
		var notes = (day.notes || []).map(function (n) {
			return '<li>' + esc(tx(n)) + '</li>';
		}).join('');
		var noteBlock = notes ? '<ul class="guide-day-notes">' + notes + '</ul>' : '';
		var returns = returnOptionsHtml(day);
		var around = '';
		if (city.gettingAround && tx(city.gettingAround)) {
			var aroundLabel = state.lang === 'zh' ? '市内交通' : 'Getting around';
			around = '<details class="guide-around"><summary>' + esc(aroundLabel) + '</summary><p>' + esc(tx(city.gettingAround)) + '</p></details>';
		}
		var html = '<div class="guide-toolbar">' +
				'<div class="guide-heading"><p class="guide-city-name">' + esc(tx(city.name)) + ' ' + draftBadge() + '</p>' +
					'<p class="guide-city-dates">' + esc(formatRange(city.dates.start, city.dates.end)) + '</p></div>' +
				langSwitch() +
			'</div>' +
			'<div class="guide-days" role="tablist">' + tabs + '</div>' +
			'<div class="guide-split">' +
				'<div class="guide-map-panel"><div id="guide-map" class="guide-map" role="application" aria-label="' + esc(tx(city.name)) + '"></div></div>' +
				'<div class="guide-timeline" id="guide-timeline">' + section + '<div class="guide-tl">' + stops + '</div>' + noteBlock + returns + around + '</div>' +
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
			var tripDefs = (index && index.trips) || [];
			var ids = [];
			if (tripDefs.length) {
				tripDefs.forEach(function (trip) {
					(trip.cities || []).forEach(function (id) {
						if (ids.indexOf(id) === -1) ids.push(id);
					});
				});
			} else {
				ids = (index && index.cities) || [];
			}
			if (!ids.length) { d.resolve({ cities: [] }); return; }
			var left = ids.length;
			var byId = {};
			ids.forEach(function (id) {
				loadCity(id).done(function (city) { byId[id] = city; }).always(function () {
					left -= 1;
					if (left) return;
					if (!tripDefs.length) {
						d.resolve({ cities: ids.map(function (cid) { return byId[cid]; }).filter(Boolean) });
						return;
					}
					d.resolve({
						trips: tripDefs.map(function (trip) {
							return {
								name: trip.name,
								cities: (trip.cities || []).map(function (cid) { return byId[cid]; }).filter(Boolean)
							};
						})
					});
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
			loadLanding().done(function (payload) {
				req.resolve(payload || { cities: [] });
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
			if (result.trips) {
				state.trips = result.trips;
				state.cities = [];
				result.trips.forEach(function (trip) {
					(trip.cities || []).forEach(function (city) { state.cities.push(city); });
				});
			}
			if (result.cities) {
				state.cities = result.cities;
				state.trips = null;
			}
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
		$(document).on('click', 'a.guide-card, a.guide-back, a.guide-daytrip', function (e) {
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
		$(document).on('click', '.guide-stop', function (e) {
			if ($(e.target).closest('a, details').length) return;
			var city = $(this).attr('data-city');
			if (city && window.SiteRouter) {
				window.SiteRouter.go({ section: 'travel', travelTab: 'guide', guideCity: city });
				return;
			}
			setActive(parseInt($(this).attr('data-stop'), 10), true);
		});
		$(document).on('keydown', '.guide-stop', function (e) {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ($(e.target).closest('a, details').length) return;
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
