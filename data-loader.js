/*!
 * UG სერვისები — data.json წამკითხველი
 * ---------------------------------------------------------------
 * კითხულობს GitHub-ზე არსებულ data.json-ს (Google Sheets → Make.com → GitHub)
 * და აბრუნებს ერთ მოწესრიგებულ ობიექტს, რომელსაც საიტი პირდაპირ იყენებს.
 *
 * გამოყენება:
 *   const { data, warn } = await UGData.load('https://raw.githubusercontent.com/USER/REPO/main/data.json');
 *
 * data-ს სტრუქტურა:
 *   staff      ['ნათია ბერიძე', ...]                         — თანამშრომლები (გრაფიკის 1-ლი სტრიქონი)
 *   shifts     { 'ნათია ბერიძე': { 0:['10:00','19:00'], ... } } — 0=ორშაბათი … 4=პარასკევი
 *   breaks     [ { key:'main'|'kostava'|'kav', title, rows:[{shift:['10:00','19:00'], time:'13:00', ops:2}] } ]
 *   breaksMain / breaksKav                                   — იგივე, მოკლე ფორმით
 *   kav        { 0:[{slot:['09:00','18:00'], name:'...'}, ...], ... } — ქავთარაძის მორიგეობა დღეების მიხედვით
 *   qr, qrSlots  [{date:'2026-09-26', am:'...', pm:'...'}], [['09:00','14:30'],['14:30','20:00']]
 *   tasks      [{start:'2026-09-21', end:'2026-09-27', label, by:{ 'ნათია ბერიძე':'მეილები', ... }}]
 *   lectures   { 'ნათია ბერიძე': { 0:[['09:00','11:10'], ...], ... } } — 0=ორშაბათი … 5=შაბათი
 *   friends    [{manager:'...', students:[{l:'გვარი', f:'სახელი', p:'პროგრამა'}]}]
 *              (პირადი ნომერი განზრახ არ იკითხება)
 */
(function (root) {
  'use strict';

  var DAYN = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'];
  // ერთი და იგივე ადამიანი სხვადასხვა ფურცელზე სხვა სახელით თუ წერია — აქ დაამატე
  var ALIAS = {
    'დათუნა თვალაბეიშვილი': 'დავით თვალაბეიშვილი',
    'ლიზა გოგოლაძე': 'ლიზი გოგოლაძე',
    'მარიამი ჯოჯუა': 'მარიამ ჯოჯუა'
  };
  // ფურცლების სახელები (თუ Google Sheets-ში გადაარქმევ, აქაც შეცვალე)
  var SHEETS = {
    schedule: ['გრაფიკი'],
    tasks: ['საქმის გადანაწილება', 'საქმეები'],
    friends: ['MY UG მეგობარი', 'MY UG მეგობრები'],
    lectures: ['სალექციო ცხრილი', 'ლექციები']
  };
  var MONK = { 'იანვ': 0, 'თებერ': 1, 'მარტ': 2, 'აპრილ': 3, 'მაის': 4, 'ივნის': 5, 'ივლის': 6, 'აგვისტ': 7, 'სექტემბ': 8, 'ოქტომბ': 9, 'ნოემბ': 10, 'დეკემბ': 11 };

  /* ---------- დამხმარე ფუნქციები ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function nm(v) { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return ALIAS[v] || v; }
  function fracToTime(x) { var m = Math.round(x * 1440); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  // უჯრის მნიშვნელობა → ტექსტი (Make ზოგჯერ დროს რიცხვად აგზავნის: 0.5 = 12:00)
  function cellText(v) {
    if (v == null) return '';
    if (typeof v === 'number') return (v > 0 && v < 1) ? fracToTime(v) : String(v);
    if (typeof v === 'object') v = v.formattedValue != null ? v.formattedValue : (v.value != null ? v.value : '');
    v = String(v).trim();
    if (/^0?\.\d+$/.test(v)) return fracToTime(parseFloat(v));
    return v;
  }
  function S2R(x) {
    var m = String(x || '').trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*[-–—]\s*(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    return m ? [pad(m[1]) + ':' + m[2], pad(m[3]) + ':' + m[4]] : null;
  }
  function T(x) { var m = String(x || '').match(/(\d{1,2}):(\d{2})/); return m ? pad(m[1]) + ':' + m[2] : String(x || '').slice(0, 5); }
  function monOf(w) { w = String(w || ''); for (var k in MONK) if (w.indexOf(k) === 0) return MONK[k]; return -1; }
  function acYear(now) { now = now || new Date(); return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; }
  function mkDate(day, mon) { return new Date(mon >= 7 ? acYear() : acYear() + 1, mon, day); }
  function letterIdx(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
  // თარიღი: „26 სექტემბერი“, „2026-09-26“, „26.09.2026“ ან Google/Excel-ის რიცხვი (46291)
  function parseDate(v) {
    var s = cellText(v), m;
    if (/^\d{5}(\.\d+)?$/.test(s)) { var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    var p = s.split(/\s+/), mo = monOf(p[1]);
    if (+p[0] && mo >= 0) return iso(mkDate(+p[0], mo));
    return null;
  }

  /* ---------- 1. ნორმალიზება: ნებისმიერი ფორმატი → { ფურცელი: [[სტრიქონი], ...] } ---------- */
  function toGrid(v) {
    if (typeof v === 'string') { try { return toGrid(JSON.parse(v)); } catch (e) { return []; } }
    if (v && !Array.isArray(v) && typeof v === 'object') {
      if (Array.isArray(v.values)) return toGrid(v.values);          // Sheets API: { values:[[...]] }
      if (Array.isArray(v.rows)) return toGrid(v.rows);
      if (Array.isArray(v.data)) return toGrid(v.data);
      return [];
    }
    if (!Array.isArray(v) || !v.length) return [];
    if (Array.isArray(v[0]) || v.every(function (r) { return Array.isArray(r); })) {
      return v.map(function (r) { return (r || []).map(cellText); });   // [[...],[...]] — რეკომენდებული
    }
    if (typeof v[0] === 'object') {
      var keys = Object.keys(v[0]).filter(function (k) { return k.indexOf('__') !== 0; });
      var colOf = function (k) { return /^\d+$/.test(k) ? +k : (/^[A-Z]{1,2}$/.test(k) ? letterIdx(k) : null); };
      if (keys.length && keys.every(function (k) { return colOf(k) !== null; })) {
        // Make „Search Rows“: { "0":"…", "1":"…", "__ROW_NUMBER__":2 } ან { "A":"…", "B":"…" }
        return v.map(function (o) { var r = []; Object.keys(o).forEach(function (k) { var i = colOf(k); if (i !== null) r[i] = cellText(o[k]); }); for (var i = 0; i < r.length; i++) if (r[i] == null) r[i] = ''; return r; });
      }
      // სათაურებიანი ობიექტები: { "გრაფიკი":"ორშაბათი", "ნათია ბერიძე":"10:00-19:00" }
      var hdr = [];
      v.forEach(function (o) { Object.keys(o).forEach(function (k) { if (k.indexOf('__') !== 0 && hdr.indexOf(k) < 0) hdr.push(k); }); });
      return [hdr].concat(v.map(function (o) { return hdr.map(function (h) { return cellText(o[h]); }); }));
    }
    return [];
  }
  function normalize(j) {
    if (typeof j === 'string') j = JSON.parse(j);
    var src = j && (j.sheets || j.data || j);
    if (j && Array.isArray(j.valueRanges)) {                          // Sheets API batchGet
      src = {};
      j.valueRanges.forEach(function (r) { var n = String(r.range || '').split('!')[0].replace(/^'|'$/g, ''); src[n] = r.values || []; });
    }
    if (Array.isArray(src)) {                                         // [{ name:"გრაფიკი", values:[...] }]
      var o = {};
      src.forEach(function (s) { var n = s && (s.name || s.title || s.sheet || s.sheetName); if (n) o[n] = s.values || s.rows || s.data || []; });
      src = o;
    }
    var out = {};
    Object.keys(src || {}).forEach(function (k) {
      if (/^(updated|updatedAt|lastUpdated|meta|version)$/i.test(k)) return;
      var g = toGrid(src[k]);
      if (g.length) out[String(k).trim()] = g;
    });
    return out;
  }

  /* ---------- 2. ფურცლების დამუშავება ---------- */
  function parseGrids(sheets) {
    var warn = [], names = Object.keys(sheets);
    function sh(key) {
      var want = SHEETS[key].map(norm);
      var k = names.filter(function (n) { return want.indexOf(norm(n)) >= 0; })[0] ||
              names.filter(function (n) { return want.some(function (w) { return norm(n).indexOf(w) >= 0; }); })[0];
      if (!k) throw new Error('ფურცელი „' + SHEETS[key][0] + '“ ვერ მოიძებნა. data.json-ში არის: ' + names.join(', '));
      return sheets[k];
    }
    function cell(g, r, c) { return cellText((g[r] || [])[c]); }
    function width(g) { return g.reduce(function (m, r) { return Math.max(m, (r || []).length); }, 0); }
    function findAll(g, pred) { var out = []; for (var r = 0; r < g.length; r++) for (var c = 0; c < (g[r] || []).length; c++) { var v = cell(g, r, c); if (v && pred(v, r, c)) out.push({ r: r, c: c, v: v }); } return out; }
    function dayOf(v) { return DAYN.indexOf(String(v || '').trim()); }

    /* --- შიტი #1: გრაფიკი --- */
    var g = sh('schedule'), W = width(g);
    var staff = [];
    for (var c = 1; c < W; c++) { var v = cell(g, 0, c); if (!v) break; staff.push(nm(v)); }
    if (!staff.length) throw new Error('„გრაფიკის“ 1-ელ სტრიქონში თანამშრომლების სახელები ვერ ვიპოვე');
    var shifts = {}; staff.forEach(function (n) { shifts[n] = {}; });
    for (var r = 1; r < Math.min(g.length, 14); r++) {
      var d = dayOf(cell(g, r, 0)); if (d < 0 || d > 4) continue;
      staff.forEach(function (n, i) { var x = S2R(cell(g, r, i + 1)); if (x) shifts[n][d] = x; else warn.push(n + ', ' + DAYN[d] + ': ცვლა ვერ წავიკითხე („' + cell(g, r, i + 1) + '“)'); });
    }
    // შესვენებები — ყველა ბლოკი, რომლის სათაურშიც წერია „შესვენებ“
    function bKey(t) { return /ქავთარაძ/.test(t) ? 'kav' : (/კოსტავ/.test(t) ? 'kostava' : 'main'); }
    var breaks = [];
    findAll(g, function (v, r, c) { return /შესვენებ/.test(v) && !!S2R(cell(g, r + 1, c)); }).forEach(function (p) {
      var rows = [];
      for (var rr = p.r + 1; rr < p.r + 25; rr++) { var x = S2R(cell(g, rr, p.c)); if (!x) break; rows.push({ shift: x, time: T(cell(g, rr, p.c + 1)), ops: parseInt(cell(g, rr, p.c + 2), 10) || 1 }); }
      var key = bKey(p.v);
      breaks.push({ key: key, title: key === 'kav' ? 'ქავთარაძის კორპუსი' : key === 'kostava' ? 'კოსტავას კორპუსი' : 'მთავარი კორპუსი', header: p.v, rows: rows });
    });
    if (!breaks.length) warn.push('შესვენებების ბლოკი ვერ ვიპოვე');
    var mainB = breaks.filter(function (b) { return b.key === 'main'; })[0] || breaks.filter(function (b) { return b.key === 'kostava'; })[0];
    var kavB = breaks.filter(function (b) { return b.key === 'kav'; })[0];
    // ქავთარაძის მორიგეობა: სათაურში „ქავთარაძ“, ქვემოთ — ცვლების სათაურები და დღეები
    var kav = {};
    var kp = findAll(g, function (v, r, c) { return /ქავთარაძ/.test(v) && !/შესვენებ/.test(v) && !!S2R(cell(g, r + 1, c + 1)); })[0];
    if (kp) {
      var slots = []; for (var cc = kp.c + 1; cc < kp.c + 6; cc++) { var s = S2R(cell(g, kp.r + 1, cc)); if (!s) break; slots.push(s); }
      for (var r2 = kp.r + 2; r2 < kp.r + 12; r2++) {
        var dd = dayOf(cell(g, r2, kp.c)); if (dd < 0) break;
        kav[dd] = [];
        slots.forEach(function (sl, i) { var who = cell(g, r2, kp.c + 1 + i); if (who) kav[dd].push({ slot: sl, name: nm(who) }); });
      }
    } else warn.push('ქავთარაძის კორპუსის მორიგეობის ბლოკი ვერ ვიპოვე');
    // შაბათის QR მორიგეობა
    var qr = [], qrSlots = [['09:00', '14:30'], ['14:30', '20:00']];
    var qp = findAll(g, function (v) { return /QR/i.test(v); })[0];
    if (qp) {
      var a = S2R(cell(g, qp.r + 1, qp.c + 1)), b = S2R(cell(g, qp.r + 1, qp.c + 2));
      if (a && b) qrSlots = [a, b];
      for (var r3 = qp.r + 2; r3 < qp.r + 120; r3++) {
        var dv = cell(g, r3, qp.c); if (!dv) break;
        var dt = parseDate(dv); if (!dt) { warn.push('QR: თარიღი „' + dv + '“ ვერ წავიკითხე'); continue; }
        qr.push({ date: dt, am: nm(cell(g, r3, qp.c + 1)), pm: nm(cell(g, r3, qp.c + 2)) });
      }
      qr.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    } else warn.push('შაბათის QR მორიგეობის ბლოკი ვერ ვიპოვე');

    /* --- შიტი #3: საქმის გადანაწილება --- */
    var t = sh('tasks'), tcols = [];
    for (var c2 = 1; c2 < width(t); c2++) { var v2 = cell(t, 0, c2); if (!v2) break; tcols.push(nm(v2)); }
    var tasks = [];
    for (var r4 = 1; r4 < t.length; r4++) {
      var lab = cell(t, r4, 0); if (!lab) continue;
      var st = null, en = null, mm;
      if ((mm = lab.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\s*[-–—]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?/))) {   // 21.09 – 27.09
        st = mkDate(+mm[1], +mm[2] - 1); en = mkDate(+mm[4], +mm[5] - 1);
      } else {                                                                                                          // 21 სექტემბრიდან 27 სექტემბრის ჩათვლით
        var p = lab.split(/\s+/), d1 = +p[0], d2 = +p[2], m2 = monOf(p[3]);
        if (d1 && d2 && m2 >= 0) { en = mkDate(d2, m2); st = mkDate(d1, d1 <= d2 ? m2 : (m2 + 11) % 12); }
      }
      if (!st) { warn.push('საქმეები: პერიოდი „' + lab + '“ ვერ წავიკითხე'); continue; }
      var by = {};
      tcols.forEach(function (n, i) { by[n] = cell(t, r4, i + 1).replace(/\s+/g, ' '); });
      staff.forEach(function (n) { if (!(n in by)) by[n] = ''; });
      tasks.push({ start: iso(st), end: iso(en), label: lab, by: by });
    }
    tcols.filter(function (n) { return staff.indexOf(n) < 0; }).forEach(function (n) { warn.push('საქმეებში „' + n + '“ გრაფიკში არ არის'); });

    /* --- შიტი #2: სალექციო ცხრილი --- */
    var L = sh('lectures'), lnames = [];
    for (var c3 = 1; c3 < width(L); c3++) { var v3 = cell(L, 0, c3); if (!v3) break; lnames.push(nm(v3)); }
    var lectures = {}; staff.forEach(function (n) { lectures[n] = {}; });
    var cur = -1;
    for (var r5 = 1; r5 < L.length; r5++) {
      var dl = dayOf(cell(L, r5, 0)); if (dl >= 0) cur = dl; if (cur < 0) continue;
      lnames.forEach(function (n, i) {
        var lv = cell(L, r5, i + 1); if (!lv) return;
        lv.split(/[,;\n]+/).forEach(function (part) {
          part = part.trim(); if (!part) return;
          var x = S2R(part); if (!x) { warn.push('ლექცია, ' + n + ': „' + part + '“ ვერ წავიკითხე'); return; }
          lectures[n] = lectures[n] || {}; (lectures[n][cur] = lectures[n][cur] || []).push(x);
        });
      });
    }
    Object.keys(lectures).forEach(function (n) { Object.keys(lectures[n]).forEach(function (d) { lectures[n][d].sort(); }); });

    /* --- შიტი #4: MY UG მეგობარი (პირადი ნომერი არ იკითხება) --- */
    var F = sh('friends'), friends = [];
    for (var c4 = 0; c4 < width(F); c4++) {
      var hv = cell(F, 0, c4); if (hv.indexOf('მენეჯერი') !== 0) continue;
      var mgr = nm(hv.split(':').slice(1).join(':'));
      var hr = -1;
      for (var r6 = 1; r6 < 10 && hr < 0; r6++) for (var c5 = c4; c5 < c4 + 5; c5++) if (cell(F, r6, c5) === 'გვარი') { hr = r6; break; }
      if (hr < 0) { warn.push(mgr + ': სიის სათაურები (გვარი, სახელი...) ვერ ვიპოვე'); continue; }
      var col = {};
      for (var c6 = c4; c6 < c4 + 6; c6++) { var h = cell(F, hr, c6); if (!h) break; if (!(h in col)) col[h] = c6; }
      var pc = col['ფაკულტეტი/პროგრამა']; if (pc == null) Object.keys(col).forEach(function (k) { if (/პროგრამ|ფაკულტეტ/.test(k)) pc = col[k]; });
      var students = [];
      for (var r7 = hr + 1; r7 < F.length; r7++) {
        var l = cell(F, r7, col['გვარი']); if (!l) continue;
        students.push({ l: l, f: cell(F, r7, col['სახელი']), p: pc != null ? cell(F, r7, pc) : '' });
      }
      if (staff.indexOf(mgr) < 0) warn.push('MY UG მენეჯერი „' + mgr + '“ გრაფიკში არ არის');
      friends.push({ manager: mgr, declared: String(students.length), students: students });
    }
    if (!friends.length) warn.push('MY UG მეგობრის სიები ვერ ვიპოვე');

    return {
      data: {
        updated: iso(new Date()), staff: staff, shifts: shifts,
        breaks: breaks, breaksMain: mainB ? mainB.rows : [], breaksKav: kavB ? kavB.rows : [],
        kav: kav, qr: qr, qrSlots: qrSlots, tasks: tasks, lectures: lectures, friends: friends
      },
      warn: warn
    };
  }

  /* ---------- 3. ჩატვირთვა ---------- */
  function load(url) {
    var u = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();   // ქეშის გვერდის ავლა
    return fetch(u, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('data.json ვერ ჩაიტვირთა (HTTP ' + res.status + ')');
      return res.text();
    }).then(function (txt) {
      var j; try { j = JSON.parse(txt); } catch (e) { throw new Error('data.json სწორი JSON არ არის: ' + e.message); }
      var out = parseGrids(normalize(j));
      out.data.updated = (j && (j.updated || j.updatedAt || j.lastUpdated)) || new Date().toISOString();
      out.raw = j;
      return out;
    });
  }

  root.UGData = { load: load, normalize: normalize, parseGrids: parseGrids, toGrid: toGrid, S2R: S2R, DAYN: DAYN, ALIAS: ALIAS, SHEETS: SHEETS };
})(typeof window !== 'undefined' ? window : globalThis);
