/*!
 * UG სერვისები — შესვლის კოდი
 * ---------------------------------------------------------------
 * „შესვლა“ / „გახსნა“ ღილაკზე დაჭერისას ითხოვს საერთო კოდს.
 * მუშაობს duty.html-ზე (#spGo) და index.html-ზე (#enter).
 * კოდი ფაილში ღია ტექსტად არ წერია — მხოლოდ მისი SHA-256 ანაბეჭდი.
 *
 * კოდის შესაცვლელად: ახალი კოდის SHA-256 ჩაწერე CODE_HASH-ში
 * (მაგ. https://emn178.github.io/online-tools/sha256.html).
 */
(function () {
  'use strict';
  var CODE_HASH = '2ce2278a88b5c6fa79ccb632e064b85c2ca9915dd58fa293c813af9c426df5c6';
  var REMEMBER = 'session';          // 'session' = ბრაუზერის დახურვამდე; 'device' = ამ მოწყობილობაზე 30 დღე
  var KEY = 'ug-gate-ok';
  var BUTTONS = '#spGo, #enter';     // მისალმების გვერდის ღილაკები
 
  /* ---------- დამახსოვრება ---------- */
  function store() { try { return REMEMBER === 'device' ? localStorage : sessionStorage; } catch (e) { return null; } }
  function isOk() {
    try {
      var s = store(); if (!s) return false;
      var v = s.getItem(KEY); if (!v) return false;
      var o = JSON.parse(v);
      return o.h === CODE_HASH.slice(0, 16) && (REMEMBER !== 'device' || Date.now() - o.t < 30 * 864e5);
    } catch (e) { return false; }
  }
  function remember() { try { var s = store(); if (s) s.setItem(KEY, JSON.stringify({ h: CODE_HASH.slice(0, 16), t: Date.now() })); } catch (e) {} }
 
  /* ---------- SHA-256 (ბრაუზერის crypto ან სარეზერვო) ---------- */
  function sha256Fallback(str) {
    var ascii = unescape(encodeURIComponent(str));
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), i, j, result = '', words = [], bitLen = ascii.length * 8;
    var hash = [], k = [], pc = 0, comp = {};
    for (var cand = 2; pc < 64; cand++) {
      if (!comp[cand]) {
        for (i = 0; i < 313; i += cand) comp[i] = cand;
        hash[pc] = (Math.pow(cand, .5) * maxWord) | 0;
        k[pc++] = (Math.pow(cand, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? '0' : '') + b.toString(16); }
    return result;
  }
  function sha256(str) {
    try {
      if (window.crypto && crypto.subtle && window.TextEncoder) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        }).catch(function () { return sha256Fallback(str); });
      }
    } catch (e) {}
    return Promise.resolve(sha256Fallback(str));
  }
 
  /* ---------- კოდის ფანჯარა ---------- */
  var gate = null, pending = null, fails = 0, lockUntil = 0;
  function build() {
    gate = document.createElement('div');
    gate.id = 'ug-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'ug-gate-t');
    gate.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,22,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:"Noto Sans Georgian",system-ui,sans-serif';
    gate.innerHTML =
      '<form id="ug-gate-f" autocomplete="off" style="width:100%;max-width:360px;background:#fff;color:#17202B;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px">' +
        '<div id="ug-gate-t" style="font-size:19px;font-weight:700;line-height:1.3">შეიყვანეთ შესვლის კოდი</div>' +
        '<div style="font-size:13.5px;color:#5E6B7B;line-height:1.5;margin-top:-4px">კოდი საუნივერსიტეტო სერვისების სამსახურის თანამშრომლებისთვისაა.</div>' +
        '<label for="ug-gate-i" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">კოდი</label>' +
        '<input id="ug-gate-i" type="password" inputmode="text" autocomplete="off" placeholder="კოდი" style="height:46px;border:1px solid #DEE3EA;border-radius:10px;padding:0 14px;font:inherit;font-size:16px;color:#17202B;background:#F8F9FB;outline:none">' +
        '<div id="ug-gate-e" role="alert" style="min-height:1.2em;font-size:13.5px;color:#B42318"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button type="button" id="ug-gate-c" style="flex:none;height:46px;padding:0 16px;border:1px solid #DEE3EA;border-radius:10px;background:#fff;color:#17202B;font:inherit;font-weight:600;cursor:pointer">გაუქმება</button>' +
          '<button type="submit" style="flex:1;height:46px;border:0;border-radius:10px;background:#E3342A;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer">შესვლა</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(gate);
    var input = gate.querySelector('#ug-gate-i'), err = gate.querySelector('#ug-gate-e');
    input.addEventListener('focus', function () { input.style.borderColor = '#23408E'; });
    input.addEventListener('blur', function () { input.style.borderColor = '#DEE3EA'; });
    gate.querySelector('#ug-gate-c').addEventListener('click', close);
    gate.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    gate.querySelector('#ug-gate-f').addEventListener('submit', function (e) {
      e.preventDefault();
      if (Date.now() < lockUntil) { err.textContent = 'ძალიან ბევრი მცდელობა. სცადეთ ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' წამში.'; return; }
      var v = input.value.trim(); if (!v) { err.textContent = 'ჩაწერეთ კოდი.'; return; }
      sha256(v).then(function (h) {
        if (h === CODE_HASH) {
          remember(); fails = 0;
          var b = pending; close();
          if (b) b.click();                       // ახლა ღილაკი ჩვეულებრივად იმუშავებს
        } else {
          fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
          err.textContent = 'კოდი არასწორია.'; input.value = ''; input.focus();
        }
      });
    });
  }
  function open(btn) {
    pending = btn;
    if (!gate) build();
    gate.hidden = false; gate.style.display = 'flex';
    gate.querySelector('#ug-gate-e').textContent = '';
    var i = gate.querySelector('#ug-gate-i'); i.value = '';
    setTimeout(function () { try { i.focus(); } catch (e) {} }, 30);
  }
  function close() {
    if (!gate) return;
    gate.style.display = 'none'; gate.hidden = true;
    var b = pending; pending = null;
    if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
  }
  function gateOpen() { return gate && gate.style.display !== 'none'; }
 
  /* ---------- „შესვლის“ დაჭერის დაჭერა ---------- */
  document.addEventListener('click', function (e) {
    if (isOk()) return;
    if (gate && gate.contains(e.target)) return;
    var b = e.target.closest && e.target.closest(BUTTONS);
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    open(b);
  }, true);
  // duty.html: მისალმების გვერდზე Enter / Escape-ით შესვლაც კოდს ითხოვს
  document.addEventListener('keydown', function (e) {
    if (isOk() || gateOpen()) return;
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    var sp = document.getElementById('splash');
    if (sp && !sp.hidden && !sp.classList.contains('out')) {
      e.preventDefault(); e.stopImmediatePropagation();
      open(document.getElementById('spGo'));
    }
  }, true);
})();
 
