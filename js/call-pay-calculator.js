/* Locum Tally call pay calculator. Mirrors the app's pay rules. Runs only in your browser; nothing you type is sent anywhere. */
(function () {
  'use strict';
  var M = window.LTMath, KEY = 'lt-tools-callpay-v1', MAX_ROWS = 62;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(iso) { var p = M.parseDate(iso); if (!p) return ''; return DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + ' ' + MONTHS[p.m - 1] + ' ' + p.d; }
  var RULE_KEYS = ['rate', 'premAfter', 'premRate', 'guarantee', 'inc', 'mode', 'weekendRate', 'holidayRate', 'callMode', 'stipend', 'byDay', 'satStipend', 'sunStipend', 'holStipend', 'callRate', 'calledInRate'];
  function sample() {
    return {
      rules: { rate: '175', premAfter: '10', premRate: '250', guarantee: '8', inc: '15', mode: 'up', weekendRate: '200', holidayRate: '262.50',
        callMode: 'stipend', stipend: '500', byDay: true, satStipend: '600', sunStipend: '600', holStipend: '750', callRate: '', calledInRate: '',
        holidays: M.DEFAULT_HOLIDAYS.slice() },
      rows: [
        { type: 'shift', date: '2026-11-23', start: '07:00', end: '17:30', brk: '30', calledIn: '', plusDays: '0' },
        { type: 'shift', date: '2026-11-24', start: '07:00', end: '19:10', brk: '15', calledIn: '', plusDays: '0' },
        { type: 'call', date: '2026-11-24', start: '19:10', end: '07:00', brk: '', calledIn: '2:15', plusDays: '0' },
        { type: 'shift', date: '2026-11-26', start: '07:00', end: '13:00', brk: '0', calledIn: '', plusDays: '0' },
        { type: 'shift', date: '2026-11-28', start: '07:00', end: '15:00', brk: '0', calledIn: '', plusDays: '0' }
      ], save: true
    };
  }
  var state = sample();
  function canStore() { try { return !!window.localStorage; } catch (e) { return false; } }
  function save() { if (!canStore()) return; try { if (state.save) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY); } catch (e) { } }
  function load() {
    if (!canStore()) return false;
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return false;
      var s = JSON.parse(raw), b = sample();
      RULE_KEYS.forEach(function (k) { if (s.rules && s.rules[k] != null) b.rules[k] = k === 'byDay' ? !!s.rules[k] : String(s.rules[k]).slice(0, 40); });
      if (s.rules && Array.isArray(s.rules.holidays)) b.rules.holidays = s.rules.holidays.filter(function (h) { return M.HOLIDAYS.some(function (x) { return x[0] === h; }); });
      if (Array.isArray(s.rows)) b.rows = s.rows.slice(0, MAX_ROWS).map(function (r) {
        return { type: r.type === 'call' ? 'call' : 'shift', date: String(r.date || '').slice(0, 10), start: String(r.start || '').slice(0, 5), end: String(r.end || '').slice(0, 5),
          brk: String(r.brk || '').slice(0, 6), calledIn: String(r.calledIn || '').slice(0, 8), plusDays: ['0', '1', '2', '3'].indexOf(String(r.plusDays)) >= 0 ? String(r.plusDays) : '0' };
      });
      b.save = s.save !== false; state = b; return true;
    } catch (e) { return false; }
  }
  function qtyMinutes(q) { return q.den === 60 ? q.num : Math.round(q.num * 60 / 100); }
  function setErr(el, msg) {
    if (!el) return;
    var box = $('#' + el.id + '-err');
    if (box) box.textContent = msg || '';
    if (msg) { el.setAttribute('aria-invalid', 'true'); if (box) el.setAttribute('aria-describedby', box.id); }
    else { el.removeAttribute('aria-invalid'); if (box) el.removeAttribute('aria-describedby'); }
  }
  function rules() {
    var R = state.rules, r = { inc: parseInt(R.inc, 10) || 1, mode: R.mode === 'nearest' ? 'nearest' : 'up', holidays: R.holidays, byDay: !!R.byDay, callMode: R.callMode }, bad = 0;
    [['rate', 'money'], ['premRate', 'money'], ['weekendRate', 'money'], ['holidayRate', 'money'], ['stipend', 'money'], ['satStipend', 'money'], ['sunStipend', 'money'],
     ['holStipend', 'money'], ['callRate', 'money'], ['calledInRate', 'money'], ['premAfter', 'hours'], ['guarantee', 'hours']].forEach(function (f) {
      var el = $('#r-' + f[0]), res;
      if (el && el.closest('[hidden]')) { r[f[0] === 'premAfter' ? 'premiumAfterMin' : f[0] === 'guarantee' ? 'guaranteeMin' : f[0]] = 0; setErr(el, ''); return; }
      if (f[1] === 'money') { res = M.parseMoney(R[f[0]], 100000); r[f[0]] = res.ok ? res.cents : 0; }
      else { res = M.parseQty(R[f[0]], 24); r[f[0] === 'premAfter' ? 'premiumAfterMin' : 'guaranteeMin'] = res.ok ? qtyMinutes(res) : 0; }
      var msg = res.ok ? '' : res.err;
      if (!msg && f[0] === 'rate' && r.rate === 0) msg = 'Enter your hourly rate.';
      setErr(el, msg); if (msg) bad++;
    });
    r.premiumRate = r.premRate;
    if (r.callMode === 'none') r.callMode = 'stipend', r.stipend = 0, r.callOff = true;
    r.bad = bad; return r;
  }
  function rowHtml(row, i) {
    var n = i + 1, call = row.type === 'call';
    var extra = call
      ? '<div class="c c-extra" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="c"><span class="lbl">Called in (h:mm)</span><input type="text" inputmode="decimal" data-f="calledIn" value="' + esc(row.calledIn) + '" placeholder="2:15" aria-label="Row ' + n + ' called-in time, hours or h:mm"></label>' +
        '<label class="c"><span class="lbl">Call ends</span><select data-f="plusDays" aria-label="Row ' + n + ' call ends"><option value="0"' + (row.plusDays === '0' ? ' selected' : '') + '>Auto</option><option value="1"' + (row.plusDays === '1' ? ' selected' : '') + '>Next day</option><option value="2"' + (row.plusDays === '2' ? ' selected' : '') + '>+2 days</option><option value="3"' + (row.plusDays === '3' ? ' selected' : '') + '>+3 days</option></select></label></div>'
      : '<label class="c c-extra"><span class="lbl">Unpaid break (min)</span><input type="text" inputmode="numeric" data-f="brk" value="' + esc(row.brk) + '" placeholder="30" aria-label="Row ' + n + ' unpaid break in minutes"></label>';
    return '<div class="row" data-i="' + i + '">' +
      '<label class="c"><span class="lbl">Type</span><select data-f="type" aria-label="Row ' + n + ' type"><option value="shift"' + (call ? '' : ' selected') + '>Shift</option><option value="call"' + (call ? ' selected' : '') + '>Call</option></select></label>' +
      '<label class="c"><span class="lbl">Date (start)</span><input type="date" data-f="date" value="' + esc(row.date) + '" aria-label="Row ' + n + ' start date"></label>' +
      '<label class="c"><span class="lbl">Start</span><input type="time" data-f="start" value="' + esc(row.start) + '" aria-label="Row ' + n + ' start time"></label>' +
      '<label class="c"><span class="lbl">End</span><input type="time" data-f="end" value="' + esc(row.end) + '" aria-label="Row ' + n + ' end time"></label>' +
      extra +
      '<div class="c"><span class="lbl">Pay</span><output class="amt" data-amt aria-label="Row ' + n + ' pay">$0.00</output></div>' +
      '<button type="button" class="icon-btn" data-rm aria-label="Remove row ' + n + '">×</button>' +
      '<p class="detail" data-detail id="row-' + i + '-detail" aria-live="off"></p></div>';
  }
  function renderRows() { $('#rows').innerHTML = state.rows.map(rowHtml).join(''); $('#add-shift').disabled = $('#add-call').disabled = state.rows.length >= MAX_ROWS; }
  function renderRules() {
    RULE_KEYS.forEach(function (k) { var el = $('#r-' + k); if (!el) return; if (el.type === 'checkbox') el.checked = !!state.rules[k]; else el.value = state.rules[k]; });
    $$('input[name="hol"]').forEach(function (el) { el.checked = state.rules.holidays.indexOf(el.value) >= 0; });
    $('#r-save').checked = state.save;
    callVisibility();
  }
  function callVisibility() {
    var m = state.rules.callMode;
    $('#call-stipend').hidden = !(m === 'stipend' || m === 'both');
    $('#call-hourly').hidden = !(m === 'hourly' || m === 'both');
    $('#call-calledin').hidden = m === 'none';
    $('#by-day').hidden = !state.rules.byDay || $('#call-stipend').hidden;
  }
  function toRow(row) {
    var brk = M.parseNum(row.brk, { max: 1440, int: true }), ci = M.parseQty(row.calledIn, 72);
    return { parsed: { type: row.type, date: row.date, start: row.start, end: row.end, breakMin: brk.ok ? brk.value : 0, calledInMin: ci.ok ? qtyMinutes(ci) : 0, plusDays: parseInt(row.plusDays, 10) || 0 },
      err: row.type === 'shift' ? (brk.ok ? '' : 'Break: ' + brk.err) : (ci.ok ? '' : 'Called in: ' + ci.err) };
  }
  function update() {
    var r = rules(), parsed = state.rows.map(toRow);
    var res = M.periodPay(parsed.map(function (p) { return p.parsed; }), r), lines = [];
    $$('#rows .row').forEach(function (el) {
      var i = +el.getAttribute('data-i'), x = res.rows[i], d = $('[data-detail]', el), pre = parsed[i].err, row = state.rows[i];
      var err = pre || x.err;
      if (row.type === 'call' && r.callOff && !err) err = 'Choose how call is paid in the facility rules above.';
      $('[data-amt]', el).textContent = err ? '—' : M.fmtCents(x.cents);
      d.className = 'detail' + (err ? ' ferr' : '');
      $$('input,select', el).forEach(function (inp) { inp.setAttribute('aria-describedby', d.id); if (err && ((pre && inp.getAttribute('data-f') === (row.type === 'shift' ? 'brk' : 'calledIn')) || (!pre && inp.getAttribute('data-f') !== 'type'))) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); });
      if (err) { d.textContent = err; return; }
      if (x.type === 'shift') {
        d.textContent = fmtDate(row.date) + ' · worked ' + M.fmtHM(x.worked) + (x.billed !== x.worked ? ' → billed ' + M.fmtHM(x.billed) : '') +
          (x.topUp ? ' · +' + M.fmtHM(x.topUp) + ' guarantee' : '') + (x.premium ? ' · ' + M.fmtHM(x.premium) + ' premium' : '') + ' · ' + (x.day.kind === 'holiday' ? x.day.label : x.day.kind === 'weekday' ? 'Mon–Fri' : x.day.label);
      } else {
        d.textContent = fmtDate(row.date) + ' · call window ' + M.fmtHM(x.window) + ' · called in ' + M.fmtHM(x.calledInMin) + ' · ' + x.day.label;
      }
      x.lines.forEach(function (l) { lines.push({ date: row.date, l: l }); });
    });
    var valid = !res.errors && !r.bad && !(r.callOff && state.rows.some(function (x) { return x.type === 'call'; })) && parsed.every(function (p) { return !p.err; });
    $('#total').textContent = valid ? M.fmtCents(res.total) : '—';
    $('#total-note').textContent = valid ? state.rows.length + (state.rows.length === 1 ? ' entry' : ' entries') : 'Fix the entries marked in red to see a total.';
    $('#s-shift').textContent = M.fmtHM(res.shiftMinutes);
    $('#s-call').textContent = M.fmtHM(res.callMinutes);
    $('#s-calledin').textContent = M.fmtHM(res.calledInMinutes);
    $('#s-stipends').textContent = M.fmtCents(res.stipends);
    $('#lines-body').innerHTML = lines.map(function (x) {
      return '<tr><td>' + esc(fmtDate(x.date)) + '</td><td>' + esc(x.l.label) + '</td><td class="num">' + (x.l.minutes == null ? '1' : M.fmtHours(x.l.minutes)) + '</td><td class="num">' + (x.l.rate == null ? '' : M.fmtCents(x.l.rate)) + '</td><td class="num">' + M.fmtCents(x.l.cents) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No pay lines yet.</td></tr>';
    $('#result').dataset.total = valid ? String(res.total) : '';
    save();
    return res;
  }
  function init() {
    var restored = load();
    renderRules(); renderRows(); update();
    if (restored) $('#cp-status').textContent = 'Restored your last entries from this browser.';
    RULE_KEYS.forEach(function (k) {
      var el = $('#r-' + k); if (!el) return;
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () { state.rules[k] = el.type === 'checkbox' ? el.checked : el.value; callVisibility(); update(); });
    });
    $$('input[name="hol"]').forEach(function (el) { el.addEventListener('change', function () { state.rules.holidays = $$('input[name="hol"]:checked').map(function (x) { return x.value; }); update(); }); });
    $('#r-save').addEventListener('change', function (e) { state.save = e.target.checked; update(); $('#cp-status').textContent = state.save ? 'Your entries will be saved in this browser only.' : 'Saving is off. Nothing is stored in this browser.'; });
    var rows = $('#rows');
    rows.addEventListener('input', onRow); rows.addEventListener('change', onRow);
    function onRow(e) {
      var el = e.target.closest('.row'), f = e.target.getAttribute('data-f'); if (!el || !f) return;
      var i = +el.getAttribute('data-i'); if (state.rows[i][f] === e.target.value) return;
      state.rows[i][f] = e.target.value;
      if (f === 'type') { renderRows(); update(); $('#rows .row[data-i="' + i + '"] [data-f="type"]').focus(); return; }
      update();
    }
    rows.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      var i = +b.closest('.row').getAttribute('data-i'); state.rows.splice(i, 1); renderRows(); update();
      var all = $$('#rows .row'), t = all[Math.min(i, all.length - 1)];
      (t ? $('[data-rm]', t) : $('#add-shift')).focus();
      $('#cp-status').textContent = 'Removed row ' + (i + 1) + '.';
    });
    function add(type) {
      if (state.rows.length >= MAX_ROWS) return;
      var last = state.rows[state.rows.length - 1], date = last ? last.date : '';
      state.rows.push(type === 'call' ? { type: 'call', date: date, start: '17:00', end: '07:00', brk: '', calledIn: '', plusDays: '0' }
        : { type: 'shift', date: date ? M.addDays(date, 1) : '', start: '07:00', end: '17:00', brk: '30', calledIn: '', plusDays: '0' });
      renderRows(); update();
      var all = $$('#rows .row'); $('[data-f="date"]', all[all.length - 1]).focus();
    }
    $('#add-shift').addEventListener('click', function () { add('shift'); });
    $('#add-call').addEventListener('click', function () { add('call'); });
    $('#cp-clear').addEventListener('click', function () {
      state.rows = []; renderRows(); update(); $('#cp-status').textContent = 'All rows removed. Your facility rules are kept.'; $('#add-shift').focus();
    });
    $('#cp-sample').addEventListener('click', function () { var keep = state.save; state = sample(); state.save = keep; renderRules(); renderRows(); update(); $('#cp-status').textContent = 'Sample week loaded.'; });
    window.LTCallPay = { update: update, getState: function () { return state; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
