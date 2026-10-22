/* ================================================================
   data.json → მორიგეობის კალენდარი (index.html)
   ----------------------------------------------------------------
   კითხულობს data.json-ს (Google Sheets → Make.com → GitHub),
   data-loader.js-ით ამუშავებს და ამ გვერდის DATA-ს ანახლებს.
   თუ data.json ვერ ჩაიტვირთა, გვერდი ბოლო ცნობილ მონაცემებს აჩვენებს.
   ================================================================ */
(function () {
  /* ▼▼▼ data.json-ის მისამართი. თუ data.json იმავე რეპოზიტორიაშია, დატოვე 'data.json' ▼▼▼ */
  var DATA_URL = 'data.json';
  var REFRESH_MIN = 5;                       // რამდენ წუთში ერთხელ შეამოწმოს განახლება

  if (!window.UGData || typeof DATA === 'undefined') return;
  var lastSig = '';

  // სტატუსის პატარა ნიშანი ქვედა მარჯვენა კუთხეში
  var badge = document.createElement('div');
  badge.id = 'data-status';
  badge.setAttribute('role', 'status');
  badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;font:12px/1.4 system-ui,sans-serif;padding:6px 10px;border-radius:8px;background:rgba(20,28,40,.85);color:#fff;max-width:calc(100% - 24px);pointer-events:none';
  badge.textContent = 'მონაცემები იტვირთება…';
  document.body.appendChild(badge);
  function status(msg, bad) { badge.textContent = msg; badge.style.background = bad ? 'rgba(180,35,24,.92)' : 'rgba(20,28,40,.85)'; }

  function toMin(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hourOf(t) { var p = t.split(':'); return (+p[0]) + (+p[1]) / 60; }
  function pd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function shortNames(names, old) {
    var oldMap = {}; (old.names || []).forEach(function (n, i) { oldMap[n] = old.short[i]; });
    var first = names.map(function (n) { return n.split(' ')[0]; });
    return names.map(function (n, i) {
      if (oldMap[n]) return oldMap[n];
      var dup = first.filter(function (f) { return f === first[i]; }).length > 1;
      var parts = n.split(' ');
      return dup && parts[1] ? parts[0] + ' ' + parts[1].charAt(0) + '.' : parts[0];
    });
  }

  function convert(d) {
    var old = { names: DATA.names.slice(), short: DATA.short.slice(), shift: DATA.shift, kav: DATA.kav, brk: DATA.brk };
    var names = d.staff.slice(), NP = names.length;
    var idx = function (n) { return names.indexOf(n); };
    var oIdx = function (n) { return old.names.indexOf(n); };

    // ცვლები: საათი, როდის იწყება (9 / 10 / 11)
    var shift = [0, 1, 2, 3, 4].map(function (wd) {
      return names.map(function (n) { var s = d.shifts[n] && d.shifts[n][wd]; return s ? hourOf(s[0]) : 10; });
    });
    // ქავთარაძე: [09:00-ის თანამშრომელი, 10:00-ის თანამშრომელი]
    var kavSh = [9, 10];
    var kav = [0, 1, 2, 3, 4].map(function (wd) {
      var list = d.kav[wd] || [];
      if (list.length) kavSh = list.map(function (k) { return hourOf(k.slot[0]); });
      return list.map(function (k) { return idx(k.name); });
    });
    // ლექციები წუთებში
    var lect = names.map(function (n) {
      return [0, 1, 2, 3, 4, 5].map(function (wd) {
        return ((d.lectures[n] || {})[wd] || []).map(function (r) { return [toMin(r[0]), toMin(r[1])]; });
      });
    });
    // შესვენებები სახელების მიხედვით: ცვლა თუ არ შეცვლილა, ძველი რჩება; ახალს უფასო სლოტი ენიჭება
    function assign(mode) {
      return [0, 1, 2, 3, 4].map(function (wd) {
        var load = {}, out = new Array(NP);
        var locOf = function (p) { if (mode !== 'post') return { k: false, sh: shift[wd][p] }; var j = kav[wd].indexOf(p); return j >= 0 ? { k: true, sh: kavSh[j] } : { k: false, sh: shift[wd][p] }; };
        var oldLoc = function (op) { if (mode !== 'post') return { k: false, sh: old.shift[wd][op] }; var j = (old.kav[wd] || []).indexOf(op); return j >= 0 ? { k: true, sh: [9, 10][j] } : { k: false, sh: old.shift[wd][op] }; };
        var pending = [];
        for (var p = 0; p < NP; p++) {
          var L = locOf(p), op = oIdx(names[p]);
          if (op >= 0 && old.brk && old.brk[mode] && old.brk[mode][wd]) {
            var OL = oldLoc(op);
            if (OL.k === L.k && OL.sh === L.sh) { out[p] = old.brk[mode][wd][op]; var key0 = (L.k ? 'k' : 'm') + out[p]; load[key0] = (load[key0] || 0) + 1; continue; }
          }
          pending.push(p);
        }
        pending.forEach(function (p) {
          var L = locOf(p), table = L.k ? d.breaksKav : d.breaksMain;
          var opts = (table || []).filter(function (b) { return hourOf(b.shift[0]) === L.sh; });
          if (!opts.length) { out[p] = L.sh + 3; return; }
          opts.sort(function (a, b) {
            var la = (load[(L.k ? 'k' : 'm') + hourOf(a.time)] || 0) / a.ops, lb = (load[(L.k ? 'k' : 'm') + hourOf(b.time)] || 0) / b.ops;
            return la - lb || hourOf(a.time) - hourOf(b.time);
          });
          out[p] = hourOf(opts[0].time);
          var key = (L.k ? 'k' : 'm') + out[p]; load[key] = (load[key] || 0) + 1;
        });
        return out;
      });
    }
    // შაბათის QR: კვირიდან კვირამდე, პირველი შაბათიდან
    var qr = d.qr.filter(function (q) { return idx(q.am) >= 0 && idx(q.pm) >= 0; });
    var sat0 = qr.length ? pd(qr[0].date) : SAT0;
    var sat = [];
    qr.forEach(function (q) { var i = Math.round((pd(q.date) - sat0) / (7 * 864e5)); if (i >= 0) sat[i] = [idx(q.am), idx(q.pm)]; });
    for (var i = 0; i < sat.length; i++) if (!sat[i]) sat[i] = null;
    var satSlots = d.qrSlots.map(function (r) { return [toMin(r[0]), toMin(r[1])]; });
    // საქმეები
    var tasks = d.tasks.map(function (w) { return names.map(function (n) { return w.by[n] || ''; }); });
    var weeks = d.tasks.map(function (w) { return [w.start, w.end]; });

    return {
      names: names, short: shortNames(names, old), shift: shift, kav: kav, kavSh: kavSh, lect: lect,
      brk: { pre: assign('pre'), post: assign('post') },
      sat: sat, sat0: sat0, satSlots: satSlots, tasks: tasks, weeks: weeks,
      tw0: weeks.length ? pd(weeks[0][0]) : TW0,
      end: [weeks.length ? pd(weeks[weeks.length - 1][1]) : END, qr.length ? pd(qr[qr.length - 1].date) : END].reduce(function (a, b) { return a > b ? a : b; })
    };
  }

  function apply(nd) {
    var prevName = st.person !== null ? DATA.names[st.person] : null;
    // names/short — იგივე მასივები (გვერდი მათ პირდაპირ იყენებს)
    DATA.names.splice.apply(DATA.names, [0, DATA.names.length].concat(nd.names));
    DATA.short.splice.apply(DATA.short, [0, DATA.short.length].concat(nd.short));
    ['shift', 'kav', 'kavSh', 'lect', 'brk', 'sat', 'satSlots', 'tasks', 'weeks'].forEach(function (k) { DATA[k] = nd[k]; });
    TW0 = nd.tw0; SAT0 = nd.sat0; if (nd.end > END) END = nd.end;
    // მდგომარეობის აღდგენა
    var pi = prevName ? DATA.names.indexOf(prevName) : -1;
    st.person = pi >= 0 ? pi : null;
    st.date = clamp(st.date || today);
    st.month = st.date.getMonth();
    st.week = wkOf(st.date);
    renderAll();
  }

  function refresh() {
    UGData.load(DATA_URL).then(function (res) {
      var sig = JSON.stringify(res.raw);
      if (sig !== lastSig) { lastSig = sig; apply(convert(res.data)); }
      var t = new Date();
      status('Google Sheets · განახლდა ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + (res.warn.length ? ' · ' + res.warn.length + ' გაფრთხილება (F12)' : ''));
      if (res.warn.length) console.warn('data.json:', res.warn);
    }).catch(function (e) {
      console.error(e);
      status('data.json ვერ ჩაიტვირთა — ნაჩვენებია ბოლო ცნობილი მონაცემები', true);
    });
  }
  refresh();
  setInterval(refresh, REFRESH_MIN * 60 * 1000);
})();
