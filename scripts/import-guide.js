#!/usr/bin/env node
/**
 * Turn a guide export (itinerary_vN.json) into per-city files the site reads.
 *
 *   npm run import-guide -- path/to/itinerary_v1.json
 *
 * Writes components/travel/data/guide/<city>.json and index.json.
 * Re-running on a later export in the same shape replaces those files.
 *
 * Public page: strips personal names, flight and train numbers, emails,
 * phone numbers, prices, confirmation codes, and "reserve now" notes.
 * Chinese copy comes from scripts/guide-zh.json (Simplified, keyed by the
 * sanitized English). Place and dish names stay in the original language.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'components', 'travel', 'data', 'guide');
const zhPath = path.join(__dirname, 'guide-zh.json');

const FLAGS = {
  Germany: 'de',
  Austria: 'at',
  Slovakia: 'sk',
  Belgium: 'be',
  'Czech Republic': 'cz',
  Czechia: 'cz'
};

const COUNTRY_ZH = {
  Germany: '德国',
  Austria: '奥地利',
  Slovakia: '斯洛伐克',
  Belgium: '比利时',
  'Czech Republic': '捷克',
  Czechia: '捷克'
};

const PLACE_ZH = {
  'New York': '纽约',
  Charlotte: '夏洛特',
  Munich: '慕尼黑',
  Berlin: '柏林',
  Vienna: '维也纳',
  Bratislava: '布拉迪斯拉发',
  Brussels: '布鲁塞尔',
  Newark: '纽瓦克',
  Frankfurt: '法兰克福'
};

function loadZh() {
  if (!fs.existsSync(zhPath)) {
    return { activity: {}, title: {}, note: {}, must: {}, gloss: {}, leg: {}, duration: {} };
  }
  return JSON.parse(fs.readFileSync(zhPath, 'utf8'));
}

const ZH = loadZh();
const missing = new Set();

function remember(bucket, en) {
  if (!en) return '';
  const table = ZH[bucket] || {};
  if (table[en]) return table[en];
  missing.add(bucket + '\t' + en);
  return '';
}

function bilingual(en, bucket) {
  const clean = (en || '').trim();
  if (!clean) return null;
  const zh = remember(bucket, clean);
  return { en: clean, zh: zh || clean };
}

function sanitize(input) {
  if (input == null) return '';
  let s = String(input);
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '');
  s = s.replace(/\+\d[\d\s()./-]{6,}\d/g, '');
  s = s.replace(/[€$]\s?\d[\d.,]*(?:\s*[–—-]\s*\d[\d.,]*)?/g, '');
  s = s.replace(/\b\d[\d.,]*\s?(?:USD|EUR)\b/gi, '');
  s = s.replace(/\bAustrian\s+OS\s?-?\d{2,4}\s*→\s*/gi, '');
  s = s.replace(/\b(?:AA|OS|UA|VL|DE|LH|SN|LX)\s?-?\d{2,4}\b/gi, '');
  s = s.replace(/\/\d{3,4}\b/g, '');
  s = s.replace(/\bAustrian\s+(?=\d)/gi, '');
  s = s.replace(/\bCondor\b/gi, '');
  s = s.replace(/\b(?:cheapest|best value)\b,?\s*/gi, '');
  s = s.replace(/\bABC ticket\b/gi, '');
  s = s.replace(/\bBolt\b/g, 'taxi');
  s = s.replace(/\b[\w.-]+\.(?:at|de|com|be|sk|eu|cz)\b/gi, '');
  s = s.replace(/\bNotion(?: page)?\b/gi, '');
  s = s.replace(/\bvisitbratislava\b/gi, '');
  s = s.replace(/\(\s*;[^)]*\)/g, '');
  s = s.replace(/\b(?:REX|ICE|RJ|NJ)\s?-?\d{1,5}\b/gi, '');
  s = s.replace(/\bRE\d+\s*\/\s*FEX\b/g, 'train');
  s = s.replace(/\bFEX\b/g, 'airport express');
  s = s.replace(/\bRE\d+\b/g, 'train');
  s = s.replace(/\bwith Tony\b/gi, '');
  s = s.replace(/\(with Tony\)/gi, '');
  s = s.replace(/;\s*Tony departs in the morning/gi, '');
  s = s.replace(/\bTony\b/g, '');
  s = s.replace(/awaiting Morris's OK/gi, 'awaiting a decision');
  s = s.replace(/awaiting OK/gi, 'awaiting a decision');
  s = s.replace(/Morris to book/gi, 'not booked yet');
  s = s.replace(/\bMorris\b/g, '');
  s = s.replace(/founded by Rev\. Stephen Tong\s*唐崇荣;?\s*/g, '');
  s = s.replace(/\bSecretary\b/g, '');
  s = s.replace(/reserve now/gi, '');
  s = s.replace(/\bcheaper\b/gi, '');
  s = s.replace(/\bprepay(?:ment)?\b/gi, '');
  s = s.replace(/[✅☑️⚠️❌]/g, '');
  s = s.replace(/\bvia FRA\b/g, 'via Frankfurt');
  s = s.replace(/,\s*,/g, ',');
  s = s.replace(/\(\s*,\s*/g, '(');
  s = s.replace(/,\s*\)/g, ')');
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/~\s*[–—-]\s*/g, '');
  s = s.replace(/~\s*(?=[,.)]|$)/g, '');
  s = s.replace(/\(\s*ABC\s*\)/gi, '');
  s = s.replace(/Taxi\s*~\s*or\b/gi, 'Taxi, or');
  s = s.replace(/\s+\)/g, ')');
  s = s.replace(/\s+,/g, ',');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([,.;])/g, '$1');
  s = s.replace(/\s*→\s*(?:→\s*)+/g, ' → ');
  s = s.replace(/^[\s,;·–—-]+|[\s,;·–—-]+$/g, '');
  s = s.replace(/\s+—\s*$/g, '');
  return s.trim();
}

function polishActivity(original, sanitized) {
  let s = sanitized;
  if (/^Connect to$/i.test(s)) s = 'Connect to the overnight flight';
  if (/REX\s?-?\d/i.test(original || '') && /back to Vienna/i.test(s)) s = 'Train back to Vienna';
  else if (/REX\s?-?\d/i.test(original || '') && /Bratislava/i.test(s)) s = 'Train to Bratislava';
  s = s.replace(/^ALTERNATIVE NYE:\s*/i, '');
  s = s.replace(/^ALTERNATIVE(?:\s+to\s+[^:]*)?:\s*/i, '');
  return s.replace(/\s{2,}/g, ' ').trim();
}

function polishNote(original) {
  let s = sanitize(original);
  if (/Leave home for JFK/i.test(original || '')) s = 'Leave for the airport at 9:30 AM';
  if (/time not on page/i.test(s)) return '';
  if (/^(phone|email)\b/i.test(s)) return '';
  s = s.split(/\s*[;·]\s*/).filter(function (part) {
    return part && !/\b(reservation|reservations|book|booking|bookings)\b/i.test(part);
  }).join(' · ');
  return s.trim();
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function namesOf(item) {
  const en = sanitize(item.name_en || item.name_local || '') || (item.name_en || '');
  let zh = item.name_zh ? String(item.name_zh).trim() : '';
  zh = zh.replace(/（一日游）/g, '').replace(/\(一日游\)/g, '');
  zh = zh.replace(/唐崇荣/g, '').replace(/Stephen Tong/g, '');
  zh = zh.replace(/（\s+/g, '（').replace(/\s+）/g, '）').replace(/（\s*）/g, '').trim();
  if (!zh) zh = en;
  const local = (item.name_local || '').trim();
  let nativeName = '';
  if (local && local !== en && local !== zh) nativeName = local;
  return { name: { en, zh }, nativeName };
}

function cityDisplay(city) {
  const enRaw = city.name_en || city.id;
  const zhRaw = city.name_zh || enRaw;
  const m = enRaw.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) {
    const zhBase = String(zhRaw).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
    return {
      name: { en: m[1].trim(), zh: zhBase || m[1].trim() },
      subtitle: bilingual(sanitize(m[2]), 'title')
    };
  }
  return { name: { en: enRaw, zh: zhRaw }, subtitle: null };
}

function iconMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m.includes('flight')) return 'flight';
  if (m.includes('tram')) return 'tram';
  if (m.includes('metro') || m.includes('u-bahn')) return 'metro';
  if (m.includes('bus') || m.includes('cat')) return 'bus';
  if (m.includes('taxi')) return 'taxi';
  if (m.includes('train') || m.includes('s-bahn')) return 'train';
  return 'walk';
}

function modeLabel(mode) {
  let en = String(mode || 'walk')
    .replace(/taxi \(Bolt\)/gi, 'taxi')
    .replace(/\s+/g, ' ')
    .trim();
  let zh = en
    .replace(/CAT bus/gi, '机场大巴')
    .replace(/flight/gi, '飞机')
    .replace(/walk/gi, '步行')
    .replace(/taxi/gi, '出租车')
    .replace(/metro/gi, '地铁')
    .replace(/tram/gi, '有轨电车')
    .replace(/train/gi, '火车')
    .replace(/bus/gi, '巴士')
    .replace(/lift/gi, '电梯')
    .replace(/\s+or\s+/gi, '或')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\+\s*/g, ' + ');
  return { en, zh };
}

function shortPlace(name) {
  const n = name || '';
  if (/JFK|Kennedy|New York/i.test(n)) return 'New York';
  if (/CLT|Charlotte/i.test(n)) return 'Charlotte';
  if (/Munich|München|\bMUC\b/i.test(n)) return 'Munich';
  if (/Berlin|\bBER\b/i.test(n)) return 'Berlin';
  if (/Vienna|\bWien\b|\bVIE\b/i.test(n)) return 'Vienna';
  if (/Bratislava/i.test(n)) return 'Bratislava';
  if (/Brussels|Bruxelles|\bBRU\b/i.test(n)) return 'Brussels';
  if (/Newark|\bEWR\b/i.test(n)) return 'Newark';
  if (/Frankfurt|\bFRA\b/i.test(n)) return 'Frankfurt';
  return '';
}

function hopDetail(fromName, toName) {
  const from = shortPlace(fromName);
  const to = shortPlace(toName);
  if (!from || !to) return null;
  return {
    en: from + ' to ' + to,
    zh: (PLACE_ZH[from] || from) + '到' + (PLACE_ZH[to] || to)
  };
}

function durationOf(raw) {
  const clean = sanitize(raw);
  if (!clean) return null;
  return clean;
}

function mustList(items, kind) {
  const out = [];
  (items || []).forEach(function (raw) {
    if (raw == null) return;
    const original = typeof raw === 'string' ? raw : (raw.name_en || raw.name || '');
    const en = polishActivity(original, sanitize(original));
    if (!en) return;
    const gloss = (ZH.gloss || {})[en] || (ZH.gloss || {})[original];
    if (gloss) {
      out.push({
        name: gloss.name || en,
        gloss: {
          en: gloss.en || '',
          zh: gloss.zh || ''
        }
      });
      return;
    }
    if (kind === 'order') {
      const split = en.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (split && /^[\x00-\x7F]+$/.test(split[2])) {
        const zh = remember('must', en);
        out.push({
          name: split[1].trim(),
          gloss: { en: split[2].trim(), zh: zh || split[2].trim() }
        });
        return;
      }
      out.push({ name: en });
      return;
    }
    const foreign = /[^\u0000-\u007F]/.test(en);
    const table = (ZH.must || {})[en];
    if (table) {
      out.push({ text: { en: en, zh: table } });
      return;
    }
    if (foreign && en.length < 80) {
      out.push({ name: en });
      return;
    }
    if (!foreign && en.split(/\s+/).length <= 4) {
      out.push({ name: en });
      return;
    }
    remember('must', en);
    out.push({ text: { en: en, zh: en } });
  });
  return out;
}

function publicAlt(item) {
  const named = namesOf(item);
  const raw = item.activity || '';
  const noteEn = polishActivity(raw, sanitize(raw));
  const note = noteEn ? bilingual(noteEn, 'activity') : null;
  const alt = {
    name: named.name,
    lat: num(item.lat),
    lng: num(item.lng),
    website: safeUrl(item.website)
  };
  if (named.nativeName) alt.nativeName = named.nativeName;
  if (note && note.en) alt.note = note;
  return alt;
}

function hotelAlts(city) {
  const list = (city.hotel && city.hotel.candidates) || [];
  return list.map(function (c) {
    let noteEn = polishNote(c.note || '');
    noteEn = noteEn.replace(/^Best value,?\s*/i, '').replace(/^Best fit:\s*/i, '').trim();
    const named = namesOf(c);
    const alt = {
      name: named.name,
      lat: num(c.lat),
      lng: num(c.lng),
      website: safeUrl(c.website)
    };
    if (named.nativeName) alt.nativeName = named.nativeName;
    if (noteEn) alt.note = bilingual(noteEn, 'note');
    return alt;
  });
}

function backupOf(raw) {
  if (!raw) return null;
  const name = sanitize(typeof raw === 'string' ? raw : (raw.name || ''));
  if (!name || /^breakfast on the plane$/i.test(name)) return null;
  const noteEn = polishNote(raw.note || '');
  const item = { name: name };
  if (noteEn) item.note = bilingual(noteEn, 'note');
  return item;
}

function buildTransit(leg, fromStop, toStop) {
  if (!leg) return null;
  const mode = leg.mode || 'walk';
  const label = modeLabel(mode);
  const transit = {
    mode: iconMode(mode),
    label: label,
    duration: durationOf(leg.duration)
  };
  if (mode === 'flight' || mode === 'train') {
    const detail = hopDetail(
      (fromStop && (fromStop.name_en || fromStop.name_local)) || leg.from,
      (toStop && (toStop.name_en || toStop.name_local)) || leg.to
    );
    if (detail) transit.detail = detail;
  }
  const noteEn = [leg.note, leg.buffer]
    .map(polishNote)
    .filter(Boolean)
    .filter(function (s) { return !/not booked|details unknown|time not on page/i.test(s); })
    .join(' · ');
  if (noteEn && mode !== 'flight') {
    const note = bilingual(noteEn, 'leg');
    if (note) transit.note = note;
  }
  if (mode === 'flight' && leg.duration && /overnight/i.test(String(leg.duration))) {
    const prose = durationOf(leg.duration);
    if (prose) {
      const zh = remember('duration', prose);
      if (zh) transit.durationZh = zh;
    }
  }
  return transit;
}

function buildStop(item, transit, alts) {
  const named = namesOf(item);
  const activityEn = polishActivity(item.activity || '', sanitize(item.activity || ''));
  const stop = {
    type: item.type || 'other',
    status: item.status || 'tentative',
    name: named.name,
    lat: num(item.lat),
    lng: num(item.lng),
    arrive: item.arrive || null,
    leave: item.depart || null,
    website: safeUrl(item.website)
  };
  if (named.nativeName) stop.nativeName = named.nativeName;
  if (item.optional) stop.optional = true;
  if (item.hours) {
    const hours = sanitize(item.hours);
    if (hours) stop.hours = bilingual(hours, 'hours');
  }
  if (activityEn) stop.notes = bilingual(activityEn, 'activity');
  const see = mustList(item.must_see, 'see');
  function itemKey(entry) {
    const raw = entry.name || (entry.text && entry.text.en) || '';
    return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  function alreadyListed(entry) {
    const key = itemKey(entry);
    if (!key) return true;
    return see.some(function (other) {
      const have = itemKey(other);
      if (!have) return false;
      if (have === key) return true;
      if (key.length >= 8 && (have.indexOf(key) !== -1 || key.indexOf(have) !== -1)) return true;
      return false;
    });
  }
  (item.also_here || []).forEach(function (extra) {
    const en = extra.name_en || '';
    const local = extra.name_local || '';
    const zh = (ZH.must && ZH.must[en]) || '';
    let entry;
    if (local && local !== en) entry = { name: local, gloss: { en: en, zh: zh } };
    else if (zh) entry = { text: { en: en, zh: zh } };
    else if (en) entry = { name: en };
    if (entry && !alreadyListed(entry)) see.push(entry);
  });
  see.forEach(function (entry) {
    if (entry.gloss && !entry.gloss.en && !entry.gloss.zh) delete entry.gloss;
  });
  if (see.length) stop.mustSee = see;
  const order = mustList(item.must_order, 'order');
  (item.extras || []).forEach(function (extra) {
    const en = sanitize(extra);
    if (en) order.push({ name: en });
  });
  if (order.length) stop.mustOrder = order;
  const backups = (item.backups || []).map(backupOf).filter(Boolean);
  if (backups.length) stop.backups = backups;
  if (item.swap_option) {
    const swap = polishNote(item.swap_option);
    if (swap) {
      const text = bilingual(swap, 'note');
      alts = alts.concat([{ name: { en: text.en, zh: text.zh } }]);
    }
  }
  if (alts && alts.length) stop.alternatives = alts;
  if (transit) stop.transit = transit;
  return stop;
}

function attachDayAlts(stops, day) {
  const alts = day.alternatives || [];
  alts.forEach(function (alt) {
    const name = alt.name_en || '';
    let target = stops.find(function (s) {
      return s._decision && name && s._decision.indexOf(name) !== -1;
    });
    if (!target) {
      target = stops.find(function (s) {
        return s.status === 'needs-decision' && s.type === alt.type;
      });
    }
    if (!target) {
      target = stops.find(function (s) { return s.status === 'needs-decision'; });
    }
    if (!target) return;
    target.alternatives = target.alternatives || [];
    target.alternatives.push(publicAlt(alt));
  });
  stops.forEach(function (s) { delete s._decision; });
}

function buildCity(city, version) {
  const display = cityDisplay(city);
  const flag = FLAGS[city.country] ? 'img/travel/flags/' + FLAGS[city.country] + '.svg' : '';
  const hotelOptions = hotelAlts(city);
  const out = {
    id: city.id,
    version: version || 'v1',
    draft: true,
    country: {
      en: city.country || '',
      zh: COUNTRY_ZH[city.country] || city.country || ''
    },
    flag: flag,
    cover: flag,
    coverFit: 'contain',
    name: display.name,
    dates: {
      start: city.date_start,
      end: city.date_end
    },
    days: []
  };
  if (display.subtitle && display.subtitle.en) out.subtitle = display.subtitle;

  (city.days || []).forEach(function (day) {
    const titleEn = polishActivity(day.title || '', sanitize(day.title || ''));
    const built = {
      date: day.date,
      weekday: day.weekday || '',
      title: bilingual(titleEn, 'title'),
      stops: []
    };
    const notes = (day.notes || []).map(function (n) {
      return bilingual(polishNote(n), 'note');
    }).filter(function (n) { return n && n.en; });
    if (notes.length) built.notes = notes;

    const timeline = day.timeline || [];
    const stopItems = [];
    timeline.forEach(function (item, index) {
      if (item.item_type !== 'stop') return;
      let transit = null;
      const next = timeline[index + 1];
      const after = timeline[index + 2];
      if (next && next.item_type === 'leg') {
        transit = buildTransit(next, item, after && after.item_type === 'stop' ? after : null);
      }
      let alts = [];
      if (item.candidates_ref && hotelOptions.length) alts = hotelOptions.slice();
      const stop = buildStop(item, transit, alts);
      if (item.decision) stop._decision = item.decision;
      stopItems.push(stop);
    });
    attachDayAlts(stopItems, day);
    built.stops = stopItems;
    out.days.push(built);
  });
  return out;
}

function flightAlts(data, cities) {
  (data.flights_trains || []).forEach(function (flight) {
    if (flight.status !== 'needs-decision' || !flight.alternatives) return;
    const options = flight.alternatives.map(function (line) {
      const en = polishActivity(line, sanitize(line));
      return bilingual(en, 'note');
    }).filter(function (x) { return x && x.en; });
    if (!options.length) return;
    cities.forEach(function (city) {
      city.days.forEach(function (day) {
        if (day.date !== flight.date) return;
        day.stops.forEach(function (stop) {
          if (stop.type !== 'airport' || stop.status !== 'needs-decision') return;
          if (!/bag drop|security|fly /i.test((stop.notes && stop.notes.en) || '')) return;
          stop.alternatives = (stop.alternatives || []).concat(options.map(function (o) {
            return { name: { en: o.en, zh: o.zh }, note: null };
          }));
        });
      });
    });
  });
}

function walkStrings(node, fn) {
  if (typeof node === 'string') fn(node);
  else if (Array.isArray(node)) node.forEach(function (n) { walkStrings(n, fn); });
  else if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) { walkStrings(node[k], fn); });
  }
}

function assertPublic(files) {
  const banned = [
    { re: /\bTony\b/, why: 'personal name' },
    { re: /\bMorris\b/, why: 'personal name' },
    { re: /Secretary/, why: 'personal name' },
    { re: /Stephen Tong|唐崇荣/, why: 'personal name' },
    { re: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, why: 'email' },
    { re: /\+\d[\d\s()./-]{6,}\d/, why: 'phone' },
    { re: /€|\$\s?\d/, why: 'price' },
    { re: /\b(?:AA|OS|UA|VL|DE|LH|SN)\s?-?\d{2,4}\b/i, why: 'flight number' },
    { re: /\bREX\s?-?\d+\b/i, why: 'train number' },
    { re: /reserve now/i, why: 'booking note' },
    { re: /confirmation code|record locator|\bPNR\b|seat\s?\d/i, why: 'booking secret' }
  ];
  const problems = [];
  files.forEach(function (file) {
    walkStrings(file.json, function (s) {
      banned.forEach(function (b) {
        if (b.re.test(s)) problems.push(file.name + ': ' + b.why + ' in “' + s.slice(0, 140) + '”');
      });
    });
  });
  return problems;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run import-guide -- path/to/itinerary.json');
    process.exit(1);
  }
  const abs = path.resolve(input);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!Array.isArray(data.cities)) {
    console.error('import-guide: export has no cities array');
    process.exit(1);
  }

  const cities = data.cities.map(function (city) { return buildCity(city, data.version); });
  flightAlts(data, cities);
  const index = {
    version: data.version || 'v1',
    draft: true,
    cities: cities.map(function (c) { return c.id; })
  };

  const problems = assertPublic([{ name: 'index.json', json: index }].concat(cities.map(function (city) {
    return { name: city.id + '.json', json: city };
  })));
  if (problems.length) {
    console.error('Refusing to write guide files with private data:');
    problems.slice(0, 40).forEach(function (p) { console.error('  ' + p); });
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  cities.forEach(function (city) {
    fs.writeFileSync(path.join(outDir, city.id + '.json'), JSON.stringify(city, null, 2) + '\n');
  });

  let stops = 0;
  let days = 0;
  cities.forEach(function (c) {
    days += c.days.length;
    c.days.forEach(function (d) { stops += d.stops.length; });
  });
  console.log('Imported ' + cities.length + ' cities, ' + days + ' days, ' + stops + ' stops → ' + path.relative(root, outDir));

  if (missing.size) {
    const lines = Array.from(missing).sort();
    console.warn('Missing Simplified Chinese for ' + lines.length + ' strings (English is used until scripts/guide-zh.json has them):');
    lines.forEach(function (line) { console.warn('  ' + line); });
  }
}

main();
