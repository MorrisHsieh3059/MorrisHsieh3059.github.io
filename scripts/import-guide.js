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
 * phone numbers, prices, confirmation codes, PINs, party size, "reserve now"
 * notes, guest counts, reservation holds, and seating times that depend on a
 * flight delay. Published hours and kitchen-close times stay.
 * A booking that is already made becomes a Booked chip only. The reference,
 * code, and checklist stay off the page.
 * Later exports can add changes_*, field_additions_*, archive_*, lists_*,
 * walk_audit_*, walk_in_*, google_lists_*, and bookings_* keys. Those are
 * not rendered. Re-run this script to re-sync.
 * Chinese copy comes from scripts/guide-zh.json (Simplified, keyed by the
 * sanitized English). Place and dish names stay in the original language.
 */
const fs = require('fs');
const path = require('path');
const roadTrip = require('./import-road-trip');

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

function sanitize(input, keepDomains) {
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
  if (!keepDomains) s = s.replace(/\b[\w.-]+\.(?:at|de|com|be|sk|eu|cz)\b/gi, '');
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
  s = s.replace(/Morris to book/gi, '');
  s = s.replace(/\bMorris\b/g, '');
  s = s.replace(/founded by Rev\.?\s*Stephen Tong\s*唐崇荣;?\s*/gi, '');
  s = s.replace(/\bStephen Tong\b/gi, '');
  s = s.replace(/唐崇荣/g, '');
  s = s.replace(/\bSecretary\b/g, '');
  s = s.replace(/reserve now/gi, '');
  s = s.replace(/\bcheaper\b/gi, '');
  s = s.replace(/\bprepay(?:ment)?\b/gi, '');
  s = s.replace(/[✅☑️⚠️❌]/g, '');
  s = s.replace(/\bvia FRA\b/g, 'via Frankfurt');
  s = stripBookingDetails(s);
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
  s = s.replace(/\s*,\s*(?=[;·])/g, '');
  s = s.replace(/(?:[;·]\s*){2,}/g, ' · ');
  s = s.replace(/\s*→\s*(?:→\s*)+/g, ' → ');
  s = s.replace(/^[\s,;·–—-]+|[\s,;·–—-]+$/g, '');
  s = s.replace(/\s+—\s*$/g, '');
  s = s.trim();
  s = s.replace(/^\((.*)\)$/, '$1').trim();
  return s;
}

// Drop reservation logistics. Keep published hours and kitchen-close times.
function stripBookingDetails(s) {
  s = s.replace(/\breservations?\s+held\s+for\s+\d+\s+guests?\b[^()]*/gi, '');
  s = s.replace(/\bheld\s+for\s+\d+\s+guests?\b[^()]*/gi, '');
  s = s.replace(/\b(?:party|table)\s+(?:of|for)\s+\d+\b/gi, '');
  s = s.replace(/\bfor\s+\d+\s*(?:people|persons|guests?)\b/gi, '');
  s = s.replace(/\b\d+\s+guests?\b/gi, '');
  s = s.replace(/\s*[;,]?\s*latest seating\b[^.;)]*?\bif flight delayed\b/gi, '');
  s = s.replace(/\s*[;,]?\s*if (?:the )?flight (?:is |was )?delayed\b[^.;)]*/gi, '');
  s = s.replace(/\bflight delays?\b/gi, '');
  s = s.replace(/\s*[–—-]\s*not booked\b/gi, '');
  s = s.replace(/\bnot booked yet\b/gi, '');
  s = s.replace(/\b(?:hotel|flight)\s+not booked\b/gi, '');
  s = s.replace(/\bnot booked\b/gi, '');
  s = s.replace(/\bunbooked\b/gi, '');
  s = s.replace(/\bno reservations?\b/gi, '');
  s = s.replace(/\breservations?\s+(?:needed|held|required)\b/gi, '');
  s = s.replace(/\breservations?\b/gi, '');
  s = s.replace(/\bconfirm when booking\b/gi, '');
  s = s.replace(/\bbook once\b[^.;)]*/gi, '');
  s = s.replace(/\bofficial booking page:\s*/gi, '');
  s = s.replace(/\bconfirmation\s+(?:code|number|in the)\b[^.;)]*/gi, '');
  s = s.replace(/\bmailbox\b/gi, '');
  s = s.replace(/\bPIN\b/g, '');
  s = s.replace(/\bparty of \d+\b/gi, '');
  s = s.replace(/\bemail[_\s-]?verified\b/gi, '');
  s = s.replace(/\s*\([^)]*\b(?:not yet booked|unbooked|booked)\b[^)]*\)/gi, '');
  s = s.replace(/\bnot yet booked\b/gi, '');
  s = s.replace(/\bunbooked\b/gi, '');
  s = s.replace(/\b(?:is\s+|was\s+)?booked\b/gi, '');
  s = s.replace(/\s*@[\w.]+/g, '');
  s = s.replace(/\s+for \d+\b(?!\s*(?:min|minutes|h\b|hours?|AM|PM|:))/gi, '');
  return s;
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
  if (local && local !== en && local !== zh) {
    const bare = local.replace(/\s*[(（]\s*(?:TBD|flexible|to be decided|待定)\s*[)）]\s*/gi, '').trim();
    if (bare && bare !== en && bare !== zh) nativeName = local;
  }
  return { name: { en, zh }, nativeName };
}

const TIME_PHRASES = [
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
const TIME_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function applyTimePhrases(text) {
  let s = String(text);
  TIME_PHRASES.forEach(function (pair) { s = s.replace(pair[0], pair[1]); });
  return s;
}

function zhTimeParen(inner) {
  let t = String(inner).trim();
  const mon = t.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i);
  if (mon) return TIME_MONTHS[mon[1].toLowerCase()] + '月' + mon[2] + '日';
  t = t.replace(/depends on (?:the )?flight/gi, '视航班而定');
  return applyTimePhrases(t);
}

function zhTimeLabel(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/\btable\b/gi, '入座');
  s = s.replace(/\bslot\b/gi, '时段');
  s = s.replace(/\bentry\b/gi, '入场');
  s = s.replace(/\bdoors\b/gi, '开门');
  s = s.replace(/\bcurtain\b/gi, '开演');
  s = s.replace(/\(([^)]+)\)/g, function (_m, inner) { return '（' + zhTimeParen(inner) + '）'; });
  s = s.replace(/~?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi, function (all, h, min, ap) {
    let hour = parseInt(h, 10);
    const mm = min || '00';
    const mer = String(ap).toUpperCase();
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

function timeField(value) {
  if (!value) return null;
  const en = String(value).trim();
  if (!en) return null;
  if (/^~?\s*\d{1,2}(?::\d{2})?\s*(AM|PM)$/i.test(en)) return en;
  const zh = zhTimeLabel(en);
  if (!zh || zh === en) return en;
  return { en: en, zh: zh };
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

// Official zh lists line up with the English lists. A missing line falls back to English.
function pairedText(enList, zhList) {
  const out = [];
  (enList || []).forEach(function (raw, i) {
    if (raw == null) return;
    const original = typeof raw === 'string' ? raw : (raw.name_en || raw.name || '');
    const en = polishActivity(original, sanitize(original));
    if (!en) return;
    const zhRaw = zhList && zhList[i] != null ? zhList[i] : '';
    let zh = zhRaw ? sanitize(zhRaw) : '';
    if (!zh) zh = (ZH.must || {})[en] || en;
    out.push({ text: { en: en, zh: zh } });
  });
  return out;
}

function pairedNote(enRaw, zhRaw, keepDomains) {
  const en = sanitize(enRaw || '', keepDomains);
  let zh = zhRaw ? sanitize(zhRaw, keepDomains) : '';
  if (!en && !zh) return null;
  if (!zh) zh = (ZH.note || {})[en] || en;
  if (!en) return { en: zh, zh: zh };
  return { en: en, zh: zh };
}

function tidyTip(raw) {
  let s = sanitize(raw || '', true);
  s = s.replace(/^[\s,;·–—-]+/, '').replace(/[\s,;·–—-]+$/, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (/^walk in$/i.test(s)) s = 'Walk in';
  return s;
}

function ticketField(enRaw, zhRaw) {
  const en = tidyTip(enRaw);
  const zh = tidyTip(zhRaw);
  if (!en && !zh) return null;
  return { en: en || zh, zh: zh || en };
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
        const paren = split[2].trim();
        const dish = split[1].trim();
        const parenZh = (ZH.must || {})[paren] || remember('must', paren) || paren;
        const dishZh = (ZH.must || {})[dish];
        const zh = dishZh ? dishZh + ' · ' + parenZh : parenZh;
        out.push({
          name: dish,
          gloss: { en: paren, zh: zh }
        });
        return;
      }
      const dishZh = (ZH.must || {})[en] || (ZH.must || {})[original];
      if (dishZh && en.split(/\s+/).length > 4 && /^[\x00-\u007F]+$/.test(en)) {
        out.push({ text: { en: en, zh: dishZh } });
        return;
      }
      if (dishZh) {
        out.push({ name: en, gloss: { en: '', zh: dishZh } });
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

function cleanMark(value) {
  if (!value) return '';
  return String(value).replace(/[✅☑️⚠️❌]/g, '').replace(/\s{2,}/g, ' ').trim();
}

const CUISINE_LABEL = {
  'historic-local': { en: 'Historic local', zh: '老字号本地菜' },
  'local cuisine, modern-founded (flagged)': { en: 'Local, newer house', zh: '本地菜，开业较晚' },
  'local cuisine, world-ranked (flagged for decision)': { en: 'Local, on a ranking', zh: '本地菜，上过榜' },
  'Berlin street-food icon (Döner/Gemüse Kebap) – local, iconic': { en: 'Berlin street food', zh: '柏林街头小吃' }
};

function foundedYear(raw) {
  const match = String(raw == null ? '' : raw).match(/\b(\d{3,4})\b/);
  return match ? match[1] : '';
}

function cuisineLabel(raw) {
  if (!raw) return null;
  const known = CUISINE_LABEL[String(raw).trim()];
  if (known) return { en: known.en, zh: known.zh };
  const short = sanitize(String(raw).replace(/\s*\([^)]*\)/g, ''));
  if (!short) return null;
  return bilingual(short, 'note');
}

// "booked", "booked – …", and "flight booked" are a chip. The rest of the
// sentence (codes, party size, mailbox) is never stored.
function isBooked(raw) {
  if (raw == null || raw === '') return false;
  const s = String(raw).replace(/[✅☑️⚠️❌⏳]/g, '').replace(/\s+/g, ' ').trim();
  if (/\b(?:not booked|unbooked|no booking|not bought)\b/i.test(s)) return false;
  return /^(?:flight\s+)?booked\b/i.test(s);
}

function placeFacts(target, raw) {
  if (!raw || !target) return;
  if (!target.founded) {
    const year = foundedYear(raw.founded);
    if (year) target.founded = year;
  }
  if (!target.cuisine) {
    const label = cuisineLabel(raw.cuisine_rule || raw.cuisine);
    if (label) target.cuisine = label;
  }
  if ((!target.mustOrder || !target.mustOrder.length) && Array.isArray(raw.must_order) && raw.must_order.length) {
    const order = pairedText(raw.must_order, raw.must_order_zh);
    if (order.length) target.mustOrder = order;
  }
  if (!target.mustOrderNote && (raw.must_order_note || raw.must_order_note_zh)) {
    const note = pairedNote(raw.must_order_note, raw.must_order_note_zh, true);
    if (note) target.mustOrderNote = note;
  }
  if (!target.foundedNote && raw.founded_note) {
    const note = pairedNote(raw.founded_note, raw.founded_note_zh, true);
    if (note) target.foundedNote = note;
  }
}

function backupOf(raw) {
  if (!raw) return null;
  const name = sanitize(typeof raw === 'string' ? raw : (raw.name || ''));
  if (!name || /^breakfast on the plane$/i.test(name)) return null;
  const item = { name: name };
  const nameEn = raw && raw.name_en ? (sanitize(raw.name_en) || String(raw.name_en).trim()) : '';
  if (nameEn) item.nameEn = nameEn;
  const area = raw && raw.area ? publicText(raw.area) : '';
  const areaZh = raw && raw.area_zh ? cleanMark(raw.area_zh) : '';
  if (area) item.area = area;
  if (areaZh) item.areaZh = areaZh;
  const hoursZh = raw && raw.hours_check_zh ? cleanMark(raw.hours_check_zh) : '';
  const distanceZh = raw && raw.distance_from_top_zh ? cleanMark(raw.distance_from_top_zh) : '';
  if (hoursZh) item.hoursZh = hoursZh;
  if (distanceZh) item.distanceZh = distanceZh;
  if (raw && typeof raw.lat === 'number') item.lat = raw.lat;
  if (raw && typeof raw.lng === 'number') item.lng = raw.lng;
  const site = raw && safeUrl(raw.website);
  const maps = raw && safeUrl(raw.google_maps_url);
  if (site) item.website = site;
  if (maps) item.googleMaps = maps;
  if (raw && raw.place_id) item.placeId = String(raw.place_id);
  const noteEn = polishNote((raw && raw.note) || '');
  if (noteEn) item.note = bilingual(noteEn, 'note');
  placeFacts(item, raw);
  return item;
}

const MODE_WORDS = [
  ['s-bahn', 'train', 'Train', '火车'],
  ['u-bahn', 'metro', 'Metro', '地铁'],
  ['metro', 'metro', 'Metro', '地铁'],
  ['tram', 'tram', 'Tram', '电车'],
  ['taxi', 'taxi', 'Taxi', '出租车'],
  ['cat bus', 'bus', 'Bus', '公交'],
  ['bus', 'bus', 'Bus', '公交'],
  ['flight', 'flight', 'Flight', '飞机'],
  ['lift', 'lift', 'Lift', '电梯'],
  ['train', 'train', 'Train', '火车'],
  ['walk', 'walk', 'Walk', '步行']
];

function matchMode(text) {
  const lower = String(text || '').toLowerCase();
  for (let i = 0; i < MODE_WORDS.length; i++) {
    if (lower.indexOf(MODE_WORDS[i][0]) !== -1) {
      return { mode: MODE_WORDS[i][1], en: MODE_WORDS[i][2], zh: MODE_WORDS[i][3] };
    }
  }
  return null;
}

function timePhrase(text) {
  const src = String(text || '');
  const range = src.match(/~?\s*(\d+)\s*[–—-]\s*(\d+)\s*(?:min|minutes)\b/i);
  if (range) return range[1] + '–' + range[2] + ' min';
  const one = src.match(/~?\s*(\d+)\s*(?:min|minutes)\b/i);
  if (one) return one[1] + ' min';
  const hm = src.match(/(\d+)\s*h(?:\s*(\d+)\s*m\b)?/i);
  if (hm) return hm[2] ? hm[1] + 'h ' + hm[2] + 'm' : hm[1] + 'h';
  if (/overnight/i.test(src)) return src.trim();
  return null;
}

function segmentFrom(def, duration) {
  const seg = {
    mode: def.mode,
    label: { en: def.en, zh: def.zh },
    duration: duration || null
  };
  if (duration && /overnight/i.test(duration)) {
    const zh = remember('duration', duration);
    if (zh) seg.durationZh = zh;
  }
  return seg;
}

function orderedModes(mode) {
  return String(mode || 'walk').split(/\s*\+\s*/).map(function (chunk) {
    const bits = chunk.split(/\s*\/\s*|\s+or\s+/i).map(function (s) { return s.trim(); }).filter(Boolean);
    const defs = bits.map(matchMode).filter(Boolean);
    if (!defs.length) return { mode: 'walk', en: 'Walk', zh: '步行' };
    if (defs.length === 1) return defs[0];
    return {
      mode: defs[0].mode,
      en: defs.map(function (d) { return d.en; }).join(' / '),
      zh: defs.map(function (d) { return d.zh; }).join(' / ')
    };
  });
}

// A combined export leg ("train + walk", "~35 min ... + 2 min walk") becomes
// one segment per mode. A part with no time of its own gets a null duration.
function splitSegments(mode, rawDuration) {
  const text = sanitize(rawDuration || '');
  const modes = orderedModes(mode);
  const orSplit = text.match(/(\d+\s*[–—-]\s*\d+|\d+)\s*min\s+([a-z][a-z -]*?)\s+or\s+(\d+\s*[–—-]\s*\d+|\d+)\s*min\s+([a-z][a-z -]*)/i);
  if (orSplit) {
    const a = matchMode(orSplit[2]);
    const b = matchMode(orSplit[4]);
    if (a && b) {
      return [
        segmentFrom(a, timePhrase(orSplit[1] + ' min')),
        segmentFrom(b, timePhrase(orSplit[3] + ' min'))
      ];
    }
  }

  const clauses = [];
  function pushClause(chunk) {
    const piece = String(chunk || '').trim();
    if (!piece) return;
    const def = matchMode(piece);
    const time = timePhrase(piece);
    if (!def && !time) return;
    clauses.push({ def: def, time: time });
  }

  const paren = text.match(/\(([^)]*)\)/);
  const inner = paren ? paren[1] : '';
  const innerHasMode = /walk|bahn|metro|train|bus|taxi|tram|lift|flight/i.test(inner);
  const innerHasTime = /\d+\s*min/i.test(inner);
  if (innerHasMode) {
    inner.split(/\s*(?:,|\+|·|;)\s*/).forEach(pushClause);
    text.replace(/\([^)]*\)/g, ' ').split(/\s*\+\s*/).forEach(function (part) {
      if (/walk|bahn|metro|train|bus|taxi|tram|lift|flight/i.test(part)) pushClause(part);
    });
    if (!innerHasTime) {
      const mentions = inner.match(/walk|s-bahn|u-bahn|metro|train|bus|taxi|tram|lift|flight/ig) || [];
      const lead = text.match(/^~?\s*((?:\d+\s*[–—-]\s*\d+|\d+)\s*min)\s*\(/);
      if (lead && mentions.length === 1) {
        const hit = clauses.find(function (c) { return c.def; });
        if (hit && !hit.time) hit.time = timePhrase(lead[1]);
      }
    }
  } else {
    text.split(/\s*\+\s*/).forEach(pushClause);
  }

  const timed = clauses.filter(function (c) { return c.def; });
  if (!timed.length) {
    const only = timePhrase(text);
    if (modes.length === 1) return [segmentFrom(modes[0], only)];
    return modes.map(function (m) { return segmentFrom(m, null); });
  }

  let cursor = 0;
  return modes.map(function (m) {
    while (cursor < clauses.length && !clauses[cursor].def && !clauses[cursor].time) cursor += 1;
    if (cursor < clauses.length && clauses[cursor].def && clauses[cursor].def.mode === m.mode) {
      const time = clauses[cursor].time;
      cursor += 1;
      return segmentFrom(m, time);
    }
    if (cursor < clauses.length && !clauses[cursor].def && clauses[cursor].time) {
      const time = clauses[cursor].time;
      cursor += 1;
      return segmentFrom(m, time);
    }
    return segmentFrom(m, null);
  });
}

function modeDef(mode) {
  const m = String(mode || '').toLowerCase();
  if (/walk/.test(m)) return { mode: 'walk', en: 'Walk', zh: '步行' };
  if (/flight|plane/.test(m)) return { mode: 'flight', en: 'Flight', zh: '飞机' };
  if (/taxi|uber|bolt/.test(m)) return { mode: 'taxi', en: 'Taxi', zh: '出租车' };
  if (/tram/.test(m)) return { mode: 'tram', en: 'Tram', zh: '电车' };
  if (/subway|u-bahn|metro/.test(m)) return { mode: 'metro', en: 'Metro', zh: '地铁' };
  if (/bus|\bcat\b/.test(m)) return { mode: 'bus', en: 'Bus', zh: '公交' };
  if (/lift|elevator/.test(m)) return { mode: 'lift', en: 'Lift', zh: '电梯' };
  return { mode: 'train', en: 'Train', zh: '火车' };
}

function publicText(value) {
  if (value == null) return null;
  let s = String(value);
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '');
  s = s.replace(/\+\d[\d\s()./-]{6,}\d/g, '');
  s = s.replace(/[€$]\s?\d[\d.,]*/g, '');
  s = s.replace(/\b\d[\d.,]*\s?(?:USD|EUR)\b/gi, '');
  s = s.replace(/\b(?:AA|OS|UA|VL|DE|LH|SN|LX)\s?-?\d{2,4}\b/gi, '');
  s = s.replace(/\bTony\b|\bMorris\b|Secretary|Stephen Tong|唐崇荣/g, '');
  s = s.replace(/\bBolt\b/g, 'taxi');
  s = s.replace(/\bbooked\b|\breservations?\b|\breserve now\b/gi, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || null;
}

function cleanDuration(raw) {
  const s = publicText(raw);
  if (!s) return null;
  const ranged = s.match(/~?\s*\d+\s*[–—-]\s*\d+\s*min/i);
  if (ranged) return ranged[0].replace(/\s+/g, ' ').replace(/^~\s*/, '');
  const hm = s.match(/\d+\s*h(?:\s*\d+\s*m\b)?/i);
  if (hm) return hm[0].replace(/\s+/g, ' ');
  const one = s.match(/\d+\s*min/i);
  if (one) return one[0].replace(/\s+/g, ' ');
  if (/overnight/i.test(s)) return s;
  return s;
}

function segmentPublic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const def = modeDef(raw.mode);
  const seg = {
    mode: def.mode,
    label: { en: def.en, zh: def.zh },
    duration: cleanDuration(raw.duration)
  };
  const line = publicText(raw.line);
  const direction = publicText(raw.direction);
  const from = publicText(raw.from_stop);
  const to = publicText(raw.to_stop);
  const frequency = publicText(raw.frequency);
  const note = publicText(raw.note);
  if (line) seg.line = line;
  if (direction) seg.direction = direction;
  if (from) seg.from = from;
  if (to) seg.to = to;
  if (typeof raw.stops === 'number' && raw.stops > 0) seg.stops = raw.stops;
  if (typeof raw.distance_m === 'number' && raw.distance_m > 0) seg.distanceM = raw.distance_m;
  if (frequency) seg.frequency = frequency;
  if (note) seg.note = note;
  if (seg.duration && /overnight/i.test(seg.duration)) {
    const zh = remember('duration', seg.duration);
    if (zh) seg.durationZh = zh;
  }
  return seg;
}

function shortTicket(text) {
  const s = publicText(text) || '';
  if (!s) return null;
  if (/ABC/i.test(s)) {
    return {
      en: 'Berlin ABC ticket. The airport is zone C. BVG app, DB Navigator, or a station machine.',
      zh: '柏林 ABC 票，机场在 C 区。BVG、DB Navigator 或站内机器。'
    };
  }
  if (/Berlin AB|\bAB\b/i.test(s)) {
    return {
      en: 'Berlin AB ticket. BVG app, DB Navigator, or a station machine. Stamp a paper ticket.',
      zh: '柏林 AB 票。BVG、DB Navigator 或站内机器。纸票要盖章。'
    };
  }
  if (/WienMobil|24 Stunden|Wiener Linien/i.test(s)) {
    return {
      en: 'Vienna core-zone ticket: single ride (80 min) or 24 Stunden WIEN, in the WienMobil app.',
      zh: '维也纳市区票：单程 80 分钟，或 24 小时票。用 WienMobil。'
    };
  }
  if (/Bratislava-Ticket|ÖBB/i.test(s)) {
    return {
      en: 'ÖBB Bratislava-Ticket: the return train, plus city trams and buses that day.',
      zh: 'ÖBB Bratislava-Ticket：当天往返火车，以及市内电车和公交。'
    };
  }
  if (/SNCB/i.test(s)) {
    return {
      en: 'SNCB train ticket. It does not cover the metro.',
      zh: '比利时国铁车票，不含地铁。'
    };
  }
  if (/STIB|contactless/i.test(s)) {
    return {
      en: 'Tap a contactless card. Transfers are free for 60 minutes.',
      zh: '刷银行卡。60 分钟内换乘不再扣费。'
    };
  }
  if (/\bCAT\b/i.test(s)) {
    return { en: 'CAT airport bus ticket.', zh: 'CAT 机场大巴票。' };
  }
  if (/taxi|uber/i.test(s)) {
    return { en: 'Taxi. Pay in the app or by card.', zh: '出租车，用 App 或刷卡。' };
  }
  if (/OMNY|AirTrain/i.test(s)) {
    return { en: 'Subway tap, then AirTrain from Jamaica.', zh: '地铁刷卡，到 Jamaica 换乘 AirTrain。' };
  }
  return null;
}

function legTicket(parts) {
  let found = null;
  (parts || []).some(function (raw) {
    found = shortTicket(raw && raw.ticket);
    return !!found;
  });
  return found;
}

function buildTransit(leg) {
  if (!leg) return null;
  const detailed = Array.isArray(leg.segments) && leg.segments.length;
  const segments = detailed
    ? leg.segments.map(segmentPublic).filter(Boolean)
    : splitSegments(leg.mode || 'walk', leg.duration);
  if (!segments.length) return null;
  const transit = { segments: segments };
  if (detailed) {
    const ticket = legTicket(leg.segments);
    if (ticket) transit.ticket = ticket;
    const alts = (leg.alternative_route || []).map(segmentPublic).filter(Boolean);
    if (alts.length) transit.alternative = alts;
  }
  return transit;
}

const GETTING_AROUND = {
  berlin: {
    en: 'Berlin AB covers the city. BER airport is zone C, so Dec 24 and Dec 27 need an ABC ticket. A single ticket lasts 2 hours in one direction. Buy it in the BVG app, DB Navigator, or a station machine, and stamp a paper ticket. Dec 24 follows the Saturday timetable; Dec 25–26 follow Sunday. The U-Bahn, except U4, runs all night from Dec 23/24 through Dec 27/28.',
    zh: '柏林市区用 AB 票。机场在 C 区，12 月 24 日和 27 日要买 ABC。单程票 2 小时内、一个方向有效。在 BVG、DB Navigator 或站内机器买，纸票要盖章。24 日按周六时刻表，25 日至 26 日按周日。除 U4 外，地铁从 23/24 日通宵到 27/28 日。'
  },
  vienna: {
    en: 'One core-zone fare: a single ticket (80 minutes, one direction) or 24 Stunden WIEN. The 48-hour and 72-hour tickets ended on Jan 1 2026. Buy it in the WienMobil app. The airport rail line through Wien Mitte is closed until Oct 2027. Use the CAT bus at Marxergasse 1B, or a regional train via Wien Hbf.',
    zh: '维也纳市区一种票价：单程 80 分钟，或 24 小时票。48 小时和 72 小时票已在 2026 年 1 月 1 日停售。用 WienMobil 买。经 Wien Mitte 的机场铁路关闭到 2027 年 10 月。改乘 CAT 大巴（Marxergasse 1B），或经 Wien Hbf 的区间车。'
  },
  bratislava: {
    en: 'The ÖBB Bratislava-Ticket covers the return train between Wien Hbf and Bratislava and, on the first day, DPB trams and buses. Buy it at a Wien Hbf machine or in the ÖBB app. Without it, tap a contactless card on the DPB validators.',
    zh: 'ÖBB Bratislava-Ticket 含 Wien Hbf 和布拉迪斯拉发之间的往返火车，以及第一天的市内电车和公交。在 Wien Hbf 的机器或 ÖBB App 买。没有这张票，就在 DPB 的刷卡机上贴银行卡。'
  },
  brussels: {
    en: 'On STIB metro, tram, and bus, tap a contactless card. Transfers are free for 60 minutes. On New Year\'s Eve the network is free from midnight, and metro 6 toward Heysel is reinforced from 8 PM. The airport train is a separate SNCB ticket and does not cover STIB. Bus 12 has its own airport fare.',
    zh: '布鲁塞尔地铁、电车、公交刷银行卡，60 分钟内换乘不再扣费。跨年夜从午夜起免费，6 号线从晚上 8 点加密开往 Heysel。机场火车是国铁的票，不含市内。12 路公交是单独的机场票。'
  }
};

function buildStop(item, transit, alts) {
  const named = namesOf(item);
  const activityEn = polishActivity(item.activity || '', sanitize(item.activity || ''));
  const stop = {
    type: item.type || 'other',
    status: item.status || 'tentative',
    name: named.name,
    lat: num(item.lat),
    lng: num(item.lng),
    arrive: timeField(item.arrive),
    leave: timeField(item.depart),
    website: safeUrl(item.website)
  };
  if (named.nativeName) stop.nativeName = named.nativeName;
  if (item.optional) stop.optional = true;
  if (item.type === 'daytrip' && item.daytrip_city) stop.daytripCity = String(item.daytrip_city);
  if (item.place_id) stop.placeId = String(item.place_id);
  if (item.hours) {
    const hours = sanitize(item.hours);
    if (hours) stop.hours = bilingual(hours, 'hours');
  }
  if (activityEn) stop.notes = bilingual(activityEn, 'activity');
  const see = Array.isArray(item.must_see)
    ? pairedText(item.must_see, item.must_see_zh)
    : mustList(item.must_see, 'see');
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
  const order = Array.isArray(item.must_order)
    ? pairedText(item.must_order, item.must_order_zh)
    : mustList(item.must_order, 'order');
  (item.extras || []).forEach(function (extra) {
    const en = sanitize(extra);
    if (en) order.push({ name: en });
  });
  if (order.length) stop.mustOrder = order;
  placeFacts(stop, item);
  const ticket = ticketField(item.ticket_tip, item.ticket_tip_zh);
  if (ticket) stop.ticket = ticket;
  if (isBooked(item.booking)) stop.booked = true;
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
  if (GETTING_AROUND[city.id]) out.gettingAround = GETTING_AROUND[city.id];

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
    const returns = (day.return_options || []).map(returnOption).filter(Boolean);
    if (returns.length) built.returnOptions = returns;

    const timeline = day.timeline || [];
    if (timeline[0] && timeline[0].item_type === 'leg') {
      const inbound = buildTransit(timeline[0]);
      if (inbound) built.inbound = inbound;
    }
    const stopItems = [];
    timeline.forEach(function (item, index) {
      if (item.item_type !== 'stop') return;
      let transit = null;
      const next = timeline[index + 1];
      // A day can place two stops in a row. Only the next item, when it is a leg, is the ride to the following stop.
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

function returnOption(raw) {
  if (!raw) return null;
  const noteEn = raw.note ? polishNote(raw.note) : '';
  let ticket = shortTicket(raw.ticket) || null;
  if (!ticket && /slovak lines/i.test(raw.ticket || '')) {
    ticket = { en: 'Separate Slovak Lines ticket.', zh: '另买 Slovak Lines 车票。' };
  }
  const option = {
    rank: raw.rank,
    mode: modeDef(raw.mode).mode,
    line: publicText(raw.line),
    from: publicText(raw.from_stop),
    to: publicText(raw.to_stop),
    depart: publicText(raw.depart),
    arrive: publicText(raw.arrive)
  };
  if (ticket) option.ticket = ticket;
  if (noteEn) option.note = bilingual(noteEn, 'note');
  return option;
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
    { re: /\bREX\d{2,}\b/i, why: 'train number' },
    { re: /reserve now/i, why: 'booking note' },
    { re: /confirmation code|record locator|\bPNR\b|seat\s?\d/i, why: 'booking secret' },
    { re: /guest/i, why: 'guest count' },
    { re: /reservation/i, why: 'reservation' },
    { re: /booked/i, why: 'booked' },
    { re: /held for/i, why: 'held for' },
    { re: /预订号|预约号/, why: 'reservation wording' },
    { re: /\bPIN\b/, why: 'pin' },
    { re: /email[_\s-]?verified/i, why: 'email flag' },
    { re: /party of \d|party_size/i, why: 'party size' }
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

// The to-book list stays off the page. An official https link is the stop's booking link.
function attachBookingLinks(data, cities) {
  const byId = new Map();
  (data.bookings_v3_4 || []).forEach(function (row) {
    if (!row) return;
    const url = safeUrl(row.link);
    if (!url) return;
    if (row.place_id && !byId.has(String(row.place_id))) byId.set(String(row.place_id), url);
    if (!row.place_id && /staatsoper|standing room/i.test(row.item || '')) {
      if (!byId.has('STEHPLATZ_BUY')) byId.set('STEHPLATZ_BUY', url);
      if (!byId.has('STAATSOPER')) byId.set('STAATSOPER', url);
    }
  });
  cities.forEach(function (city) {
    (city.days || []).forEach(function (day) {
      (day.stops || []).forEach(function (stop) {
        if (stop.placeId && byId.has(stop.placeId)) stop.bookingUrl = byId.get(stop.placeId);
      });
    });
  });
}

function enrichFromMeals(data, cities) {
  const byId = new Map();
  (data.meals || []).forEach(function (slot) {
    [slot.top].concat(slot.backups || []).forEach(function (place) {
      if (place && place.place_id && !byId.has(String(place.place_id))) {
        byId.set(String(place.place_id), place);
      }
    });
  });
  cities.forEach(function (city) {
    (city.days || []).forEach(function (day) {
      (day.stops || []).forEach(function (stop) {
        if (stop.placeId) placeFacts(stop, byId.get(stop.placeId));
        (stop.backups || []).forEach(function (backup) {
          if (backup.placeId) placeFacts(backup, byId.get(backup.placeId));
        });
      });
    });
  });
}

function readGuideIndex() {
  const indexPath = path.join(outDir, 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
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

  if (roadTrip.isRoadTrip(data)) {
    roadTrip.writeRoadTrip(data, {
      outDir: outDir,
      assertPublic: assertPublic
    });
    return;
  }

  // between_cities (NYC→Berlin and Brussels→Newark) is not a city day. It stays out of the city pages.
  // changes_*, field_additions_*, archive_*, lists_consulted_*, walk_audit_*, walk_in_*,
  // google_lists_*, and the advance-booking checklist are not rendered.
  // A to-book row's official link is attached to that stop. A later file re-syncs with this same command.
  const cities = data.cities.map(function (city) { return buildCity(city, data.version); });
  flightAlts(data, cities);
  enrichFromMeals(data, cities);
  attachBookingLinks(data, cities);
  const owned = cities.map(function (c) { return c.id; });
  const prev = readGuideIndex();
  let trips = prev && Array.isArray(prev.trips) ? prev.trips.map(function (trip) {
    return { id: trip.id, name: trip.name, cities: (trip.cities || []).slice() };
  }) : [];
  if (owned.indexOf('berlin') !== -1) {
    const europe = { id: 'europe', name: { en: 'Europe', zh: '欧洲' }, cities: owned };
    const at = trips.findIndex(function (trip) { return trip.id === 'europe'; });
    if (at === -1) trips.unshift(europe);
    else trips[at] = europe;
  }
  if (!trips.length) trips = [{ id: 'europe', name: { en: 'Europe', zh: '欧洲' }, cities: owned }];
  const cityIds = [];
  trips.forEach(function (trip) {
    (trip.cities || []).forEach(function (id) {
      if (cityIds.indexOf(id) === -1) cityIds.push(id);
    });
  });
  const index = {
    version: data.version || (prev && prev.version) || 'v1',
    draft: true,
    trips: trips,
    cities: cityIds
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
  let legs = 0;
  let segments = 0;
  cities.forEach(function (c) {
    days += c.days.length;
    c.days.forEach(function (d) {
      stops += d.stops.length;
      if (d.inbound && d.inbound.segments) {
        legs += 1;
        segments += d.inbound.segments.length;
      }
      d.stops.forEach(function (s) {
        if (!s.transit || !s.transit.segments) return;
        legs += 1;
        segments += s.transit.segments.length;
      });
    });
  });
  let sourceLegs = 0;
  let sourceSegments = 0;
  let sourceDetailed = 0;
  data.cities.forEach(function (city) {
    (city.days || []).forEach(function (day) {
      (day.timeline || []).forEach(function (item) {
        if (item.item_type !== 'leg') return;
        sourceLegs += 1;
        const n = Array.isArray(item.segments) ? item.segments.length : 0;
        sourceSegments += n;
        if (n) sourceDetailed += 1;
      });
    });
  });
  console.log('Imported ' + cities.length + ' cities, ' + days + ' days, ' + stops + ' stops, ' + legs + ' legs, ' + segments + ' segments → ' + path.relative(root, outDir));
  console.log('Source legs ' + sourceLegs + ' (' + sourceDetailed + ' with segments), source segments ' + sourceSegments);

  if (missing.size) {
    const lines = Array.from(missing).sort();
    console.warn('Missing Simplified Chinese for ' + lines.length + ' strings (English is used until scripts/guide-zh.json has them):');
    lines.forEach(function (line) { console.warn('  ' + line); });
  }
}

main();
