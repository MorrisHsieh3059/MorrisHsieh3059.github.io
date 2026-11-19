/**
 * Arizona-style export: days live at the top, cities are bases, not pages.
 * One trip becomes one guide file. Europe city files are not rewritten.
 */
const fs = require('fs');
const path = require('path');

const EN = require('./guide-az-en.json');

const PLACES = [
  ['Grand Canyon', '大峡谷'],
  ['Camp Verde', '坎普弗德'],
  ['Flagstaff', '弗拉格斯塔夫'],
  ['Phoenix', '凤凰城'],
  ['Sedona', '塞多纳'],
  ['Page', '佩奇']
];

const MODES = {
  drive: { mode: 'drive', en: 'Drive', zh: '开车' },
  walk: { mode: 'walk', en: 'Walk', zh: '步行' },
  shuttle: { mode: 'bus', en: 'Shuttle', zh: '接驳车' },
  'Sky Train': { mode: 'train', en: 'Sky Train', zh: '机场列车' }
};

const TYPES = {
  attraction: 'sight',
  church: 'church',
  restaurant: 'restaurant',
  hotel: 'hotel',
  airport: 'airport',
  'car rental': 'rental'
};

function isRoadTrip(data) {
  if (!data || !Array.isArray(data.days)) return false;
  const nested = (data.cities || []).some(function (city) {
    return (city.days || []).some(function (day) {
      return (day.timeline || []).length;
    });
  });
  return !nested && data.days.some(function (day) {
    return Array.isArray(day.timeline);
  });
}

function publicText(raw, opts) {
  let s = String(raw == null ? '' : raw);
  if (/门码|door code/i.test(s) && /4\s*(?::00\s*)?PM|4:00/.test(s)) {
    s = '下午 4:00 自助入住';
  }
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/\p{Extended_Pictographic}|\uFE0F/gu, function (ch) {
    return opts && opts.keepWarn && ch === '\u26A0' ? ch : '';
  });
  s = s.replace(/[\uD800-\uDFFF]/g, '');
  s = s.replace(/\$\s?\d[\d.,]*(?:\s*[–—/-]\s*\$?\d[\d.,]*)?(?:\s*\/\s*[\u4e00-\u9fffA-Za-z]+)?/g, '');
  s = s.replace(/\+\s*\$\s?\d[\d.,]*/g, '');
  s = s.replace(/\$+/g, '');
  s = s.replace(/\b(?:AA|OS|UA|VL|WN|DL)\s*-?\d{2,4}\b/gi, '');
  s = s.replace(/同行朋友[^，。；）)]*/g, '');
  s = s.replace(/公司\s*AWD[^，。；）)]*/g, '');
  s = s.replace(/折扣码[^，。；）)]*/g, '');
  s = s.replace(/自助门码入住（[^）]*）/g, '自助入住（4 PM 后，不用去前台）');
  s = s.replace(/凭门码/g, '');
  s = s.replace(/\d+\s*位门码/g, '');
  s = s.replace(/门码/g, '');
  s = s.replace(/已付清/g, '');
  s = s.replace(/（\s*\d+\s*人[^）]*）/g, '');
  s = s.replace(/(\d+)\s*人/g, function (all, n) {
    return n === '25' ? all : '';
  });
  s = s.replace(/\bparty of \d+\b/gi, '');
  s = s.replace(/\bparty_size\b/gi, '');
  s = s.replace(/需电话订/g, '');
  s = s.replace(/电话订/g, '');
  s = s.replace(/[，,]\s*[，,]/g, '，');
  s = s.replace(/（[^）]*，\s*）/g, '');
  s = s.replace(/（\s*）/g, '');
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([，。；])/g, '$1');
  s = s.replace(/^[，。；\s]+|[，。；\s]+$/g, '');
  return s.trim();
}

function english(zh) {
  if (!zh || !EN) return '';
  if (typeof EN[zh] === 'string') return EN[zh];
  const buckets = ['act', 'see', 'hours', 'note', 'title', 'dish'];
  for (let i = 0; i < buckets.length; i++) {
    const table = EN[buckets[i]];
    if (table && table[zh]) return table[zh];
  }
  return '';
}

function pair(raw, bucket) {
  const zh = publicText(raw, bucket === 'hours' || bucket === 'note' ? { keepWarn: true } : null);
  if (!zh) return null;
  const en = english(raw, bucket) || english(zh, bucket) || zh;
  return { en: en, zh: zh };
}

function menuUrls(raw) {
  const found = String(raw || '').match(/https?:\/\/[^\s·,，]+/g) || [];
  return found.map(function (url) {
    return url.replace(/[).,，]+$/g, '');
  }).filter(function (url, i, all) {
    return all.indexOf(url) === i;
  });
}

function sectionZh(area) {
  let s = String(area || '');
  PLACES.forEach(function (pair) {
    s = s.split(pair[0]).join(pair[1]);
  });
  return s;
}

function normDuration(raw) {
  let s = String(raw || '').replace(/\s*\+\s*排队/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\d+)h\s+0*(\d+)\s*min/i, function (_m, h, min) {
    return h + 'h ' + String(parseInt(min, 10)) + ' min';
  });
  return s;
}

function durationZh(raw) {
  return normDuration(raw)
    .replace(/^~\s*/, '约')
    .replace(/(\d+)\s*h\s*(\d+)\s*min/i, '$1 小时 $2 分钟')
    .replace(/(\d+)\s*h\b/i, '$1 小时')
    .replace(/(\d+)\s*[–—-]\s*(\d+)\s*min/i, '$1–$2 分钟')
    .replace(/(\d+)\s*min/i, '$1 分钟')
    .trim();
}

function legSegment(leg) {
  const def = MODES[leg.mode] || { mode: 'drive', en: leg.mode || 'Drive', zh: leg.mode || '开车' };
  const duration = normDuration(leg.duration || '');
  const seg = {
    mode: def.mode,
    label: { en: def.en, zh: def.zh },
    duration: duration || null,
    from: leg.from || '',
    to: leg.to || ''
  };
  if (duration) seg.durationZh = durationZh(duration);
  if (typeof leg.distance_km === 'number' && leg.distance_km > 0) {
    seg.distanceM = Math.round(leg.distance_km * 1000);
  }
  const how = publicText(leg.how_to_zh || '');
  const parkRaw = String(leg.parking_zh || '');
  const park = /\$|€|付费/.test(parkRaw) ? '' : publicText(parkRaw);
  const zhBits = [how, park].filter(Boolean);
  if (zhBits.length) seg.note = { en: '', zh: zhBits.join('；') };
  return seg;
}

function dishText(raw) {
  const zh = publicText(raw);
  if (!zh) return null;
  const head = String(raw).split(/（|\(/)[0].trim();
  const en = english(raw, 'dish') || english(zh, 'dish') || ((/^[\x00-\x7F].{2,}/.test(head)) ? head : zh);
  return { text: { en: en, zh: zh } };
}

function listText(items, bucket) {
  const out = [];
  (items || []).forEach(function (raw) {
    const text = pair(raw, bucket);
    if (text) out.push({ text: text });
  });
  return out;
}

function isBooked(raw) {
  const s = String(raw || '').replace(/[✅☑️⚠️❌⏳]/g, '').trim();
  if (/not booked|unbooked|no booking|to-book|walk-in/i.test(s)) return false;
  return /^booked\b/i.test(s);
}

function backupOf(raw) {
  if (!raw || !raw.name_local) return null;
  const item = { name: raw.name_local, nameEn: raw.name_local };
  if (raw.place_id) item.placeId = String(raw.place_id);
  const site = raw.website && /^https?:\/\//i.test(raw.website) ? raw.website : '';
  if (site) item.website = site;
  const order = (Array.isArray(raw.must_order_zh) ? raw.must_order_zh : []).map(dishText).filter(Boolean);
  if (order.length) item.mustOrder = order;
  const year = String(raw.founded || '').match(/^\d{4}$/);
  if (year) item.founded = year[0];
  if (raw.cuisine_rule === 'historic-local') {
    item.cuisine = { en: 'Historic local', zh: '老字号本地菜' };
  }
  const sources = menuUrls(raw.menu_source);
  if (sources.length) item.menuSource = sources;
  return item;
}

function buildStop(item, meals) {
  const stop = {
    type: TYPES[item.type] || 'other',
    status: item.status || 'confirmed',
    name: {
      en: item.name_local || item.name_zh || '',
      zh: item.name_zh || item.name_local || ''
    },
    lat: typeof item.lat === 'number' ? item.lat : null,
    lng: typeof item.lng === 'number' ? item.lng : null,
    arrive: item.arrive || null,
    leave: item.depart || null,
    website: item.website && /^https?:\/\//i.test(item.website) ? item.website : null
  };
  if (item.place_id) stop.placeId = String(item.place_id);
  const notes = pair(item.activity_zh, 'act');
  if (notes) stop.notes = notes;
  const hours = pair(item.hours_check_zh, 'hours');
  if (hours) stop.hours = hours;
  const see = listText(item.must_see_zh, 'see');
  if (see.length) stop.mustSee = see;
  if (isBooked(item.booking)) stop.booked = true;
  if (/可以跳过/.test(String(item.activity_zh || ''))) stop.optional = true;
  const meal = item.place_id && meals[item.place_id];
  if (meal && meal.top) {
    const order = (Array.isArray(meal.top.must_order_zh) ? meal.top.must_order_zh : []).map(dishText).filter(Boolean);
    if (order.length) stop.mustOrder = order;
    const note = pair(meal.top.note_zh, 'note');
    if (note) stop.mustOrderNote = note;
    const year = String(meal.top.founded || '').match(/^\d{4}$/);
    if (year) stop.founded = year[0];
    if (meal.top.cuisine_rule === 'historic-local') {
      stop.cuisine = { en: 'Historic local', zh: '老字号本地菜' };
    }
    const backups = (meal.backups || []).map(backupOf).filter(Boolean);
    if (backups.length) stop.backups = backups;
    const sources = menuUrls(meal.top.menu_source);
    if (sources.length) stop.menuSource = sources;
  }
  return stop;
}

function dishLabel(raw) {
  const full = publicText(raw);
  if (!full) return null;
  const head = publicText(String(raw).split(/（|\(/)[0]);
  const en = english(raw) || english(full) || ((head && /^[\x00-\x7F]+$/.test(head)) ? head : full);
  return { en: en, zh: full };
}

function buildMenuCheck(data) {
  return (data.menu_verification || []).map(function (row) {
    const dishes = (row.dishes || []).map(function (dish) {
      return dishLabel(Array.isArray(dish) ? dish[0] : dish);
    }).filter(Boolean);
    return {
      place: publicText(row.place),
      dishes: dishes,
      sources: menuUrls(row.source),
      hours: pair(row.open_zh, 'hours'),
      note: pair(row.changed, 'note')
    };
  }).filter(function (row) { return row.place; });
}

function buildDay(day, meals) {
  const timeline = day.timeline || [];
  const built = {
    date: day.date,
    weekday: String(day.weekday || '').slice(0, 3),
    title: pair(day.title_zh, 'title') || { en: day.area || '', zh: day.title_zh || '' },
    stops: []
  };
  if (day.area) {
    built.section = { en: day.area, zh: sectionZh(day.area) };
  }
  const notes = (day.notes || []).map(function (line) {
    return pair(line, 'note');
  }).filter(Boolean);
  if (notes.length) built.notes = notes;

  let i = 0;
  if (timeline[0] && timeline[0].item_type === 'leg') {
    built.inbound = { segments: [legSegment(timeline[0])] };
    i = 1;
  }
  while (i < timeline.length) {
    const item = timeline[i];
    if (item.item_type !== 'stop') { i += 1; continue; }
    const segments = [];
    let j = i + 1;
    while (j < timeline.length && timeline[j].item_type === 'leg') {
      segments.push(legSegment(timeline[j]));
      j += 1;
    }
    const stop = buildStop(item, meals);
    if (segments.length) stop.transit = { segments: segments };
    built.stops.push(stop);
    i = j;
  }
  return built;
}

function mealIndex(data) {
  const byId = {};
  (data.meals || []).forEach(function (slot) {
    if (slot.top && slot.top.place_id && !byId[slot.top.place_id]) byId[slot.top.place_id] = slot;
  });
  return byId;
}

function buildCity(data) {
  const meals = mealIndex(data);
  const range = data.date_range || {};
  return {
    id: 'arizona',
    version: data.version || 'v1.1',
    draft: true,
    country: { en: 'United States', zh: '美国' },
    flag: 'img/travel/flags/az.svg',
    cover: 'img/travel/flags/az.svg',
    coverFit: 'contain',
    name: { en: 'Arizona', zh: '亚利桑那' },
    dates: { start: range.start, end: range.end },
    gettingAround: {
      en: 'A driving trip. Times are local. Keep bags in the trunk at trailheads.',
      zh: '这是一趟自驾。时间都是当地时间。停在步道口时，行李放进行李箱。'
    },
    days: (data.days || []).map(function (day) { return buildDay(day, meals); }),
    menuCheck: buildMenuCheck(data)
  };
}

function writeRoadTrip(data, ctx) {
  const city = buildCity(data);
  const privateKeys = [];
  function scanKeys(node, where) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function (key) {
      if (/party_size|cost_est|cost_note|order_for_|email|phone|pin|confirmation|guest/i.test(key)) {
        privateKeys.push(where + '.' + key);
      }
      scanKeys(node[key], where + '.' + key);
    });
  }
  scanKeys(city, 'arizona');
  const leaked = [];
  function scanStrings(node) {
    if (typeof node === 'string') {
      if (/party_size|\$|\bprice\b|\bcost\b|\bcode\b|@|门码|door code/i.test(node)) leaked.push(node.slice(0, 140));
      return;
    }
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function (key) { scanStrings(node[key]); });
  }
  scanStrings(city);
  if (privateKeys.length || leaked.length) {
    console.error('Refusing to write private fields:');
    privateKeys.slice(0, 20).forEach(function (p) { console.error('  ' + p); });
    leaked.slice(0, 20).forEach(function (p) { console.error('  ' + p); });
    process.exit(1);
  }
  const problems = ctx.assertPublic([{ name: 'arizona.json', json: city }]);
  if (problems.length) {
    console.error('Refusing to write the Arizona guide with private data:');
    problems.slice(0, 40).forEach(function (p) { console.error('  ' + p); });
    process.exit(1);
  }
  fs.mkdirSync(ctx.outDir, { recursive: true });
  fs.writeFileSync(path.join(ctx.outDir, 'arizona.json'), JSON.stringify(city, null, 2) + '\n');

  const indexPath = path.join(ctx.outDir, 'index.json');
  const prev = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { version: 'v4.0.5', draft: true, cities: [] };
  if (!Array.isArray(prev.trips) || !prev.trips.length) {
    prev.trips = [{
      id: 'europe',
      name: { en: 'Europe', zh: '欧洲' },
      cities: (prev.cities || []).filter(function (id) { return id !== 'arizona'; })
    }];
  }
  prev.trips = prev.trips.filter(function (trip) { return trip.id !== 'arizona'; });
  const northAmerica = {
    id: 'north-america',
    name: { en: 'North America', zh: '北美' },
    cities: ['arizona']
  };
  const at = prev.trips.findIndex(function (trip) { return trip.id === 'north-america'; });
  if (at === -1) prev.trips.push(northAmerica);
  else prev.trips[at] = northAmerica;
  const cities = [];
  prev.trips.forEach(function (trip) {
    (trip.cities || []).forEach(function (id) {
      if (cities.indexOf(id) === -1) cities.push(id);
    });
  });
  prev.cities = cities;
  if (!prev.version) prev.version = 'v4.0.5';
  fs.writeFileSync(indexPath, JSON.stringify(prev, null, 2) + '\n');

  let stops = 0;
  let legs = 0;
  let segments = 0;
  city.days.forEach(function (day) {
    stops += day.stops.length;
    if (day.inbound) { legs += 1; segments += day.inbound.segments.length; }
    day.stops.forEach(function (stop) {
      if (!stop.transit) return;
      legs += 1;
      segments += stop.transit.segments.length;
    });
  });
  const meals = (data.meals || []).length;
  let places = 0;
  (data.meals || []).forEach(function (slot) {
    places += 1 + ((slot.backups || []).length);
  });
  console.log('Imported Arizona, ' + city.days.length + ' days, ' + stops + ' stops, ' + legs + ' legs, ' + segments + ' segments, ' + meals + ' meal slots, ' + places + ' meal places');
  const missing = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.en && node.zh && node.en === node.zh && /[\u4e00-\u9fff]/.test(node.zh)) missing.push(node.zh);
    Object.keys(node).forEach(function (k) { walk(node[k]); });
  }
  walk(city);
  if (missing.length) {
    const uniq = Array.from(new Set(missing));
    console.warn('Arizona English fallback is still Chinese for ' + uniq.length + ' strings:');
    uniq.slice(0, 80).forEach(function (line) { console.warn('  ' + line); });
  }
}

module.exports = { isRoadTrip: isRoadTrip, writeRoadTrip: writeRoadTrip };
