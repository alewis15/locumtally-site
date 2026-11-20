/* Locum Tally free invoice generator. Everything happens in this browser tab; nothing you type is sent anywhere. */
(function () {
  'use strict';
  var M = window.LTMath, P = window.LTPdf, KEY = 'lt-tools-invoice-v1';
  var MAX_ROWS = 100;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(iso) { var p = M.parseDate(iso); return p ? MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y : ''; }
  function blankLine(date) { return { date: date || '', desc: '', qty: '', rate: '' }; }
  function blank() {
    return { biz: { name: '', address: '', email: '', phone: '' }, bill: { facility: '', attn: '', address: '', email: '' },
      inv: { number: 'INV-0001', date: today(), terms: '30', customDays: '', po: '', period: '' },
      lines: [blankLine()], expenses: [], payment: '', notes: '', save: true };
  }
  var SAMPLE = {
    biz: { name: 'Jordan Rivera, CRNA PLLC', address: '100 Main St, Suite 2\nSpringfield, IL 62701', email: 'billing@example.com', phone: '(555) 010-0199' },
    bill: { facility: 'Lakeside Surgery Center', attn: 'Accounts Payable', address: '200 Lake Ave\nSpringfield, IL 62704', email: 'ap@example.com' },
    inv: { number: 'LT-0012', date: '2026-11-09', terms: '30', customDays: '', po: 'PO-4471', period: 'Nov 2–8, 2026' },
    lines: [
      { date: '2026-11-02', desc: 'Regular hours, 7:00 AM–5:30 PM, 30 min unpaid break', qty: '10', rate: '175' },
      { date: '2026-11-03', desc: 'Regular hours, 7:00 AM–7:15 PM, 15 min unpaid break', qty: '10', rate: '175' },
      { date: '2026-11-03', desc: 'Premium hours (after 10 h)', qty: '2', rate: '250' },
      { date: '2026-11-04', desc: 'Call stipend, weekday', qty: '1', rate: '500' },
      { date: '2026-11-04', desc: 'Called in, 11:40 PM–1:55 AM', qty: '2:15', rate: '175' }
    ],
    expenses: [{ date: '2026-11-04', desc: 'Parking (receipt attached)', amount: '36' }],
    payment: 'ACH: Example Bank, routing 000000000, account ending 0000. Or check payable to Jordan Rivera, CRNA PLLC.',
    notes: 'Thank you! Please include the invoice number with your payment.', save: true
  };
  var state = blank();

  /* ---------- storage ---------- */
  function canStore() { try { return !!window.localStorage; } catch (e) { return false; } }
  function save() {
    if (!canStore()) return;
    try { if (state.save) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY); } catch (e) { /* storage full or blocked */ }
  }
  function load() {
    if (!canStore()) return false;
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return false;
      var s = JSON.parse(raw), b = blank();
      ['biz', 'bill', 'inv'].forEach(function (k) { Object.keys(b[k]).forEach(function (f) { if (s[k] && typeof s[k][f] === 'string') b[k][f] = s[k][f]; }); });
      if (Array.isArray(s.lines)) b.lines = s.lines.slice(0, MAX_ROWS).map(function (l) { return { date: str(l.date), desc: str(l.desc), qty: str(l.qty), rate: str(l.rate) }; });
      if (Array.isArray(s.expenses)) b.expenses = s.expenses.slice(0, MAX_ROWS).map(function (l) { return { date: str(l.date), desc: str(l.desc), amount: str(l.amount) }; });
      b.payment = str(s.payment); b.notes = str(s.notes); b.save = s.save !== false;
      state = b; return true;
    } catch (e) { return false; }
  }
  function str(v) { return typeof v === 'string' ? v.slice(0, 2000) : ''; }

  /* ---------- compute ---------- */
  function termsDays() {
    if (state.inv.terms === 'custom') { var n = M.parseNum(state.inv.customDays, { max: 365, int: true }); return n.ok && !n.blank ? n.value : null; }
    return parseInt(state.inv.terms, 10);
  }
  function termsLabel(days) {
    if (days === 0) return 'Due on receipt';
    return 'Net ' + days;
  }
  function isBlankLine(l) { return !String(l.date + l.desc + l.qty + l.rate).trim(); }
  function compute() {
    var errs = {}, lines = [], expenses = [];
    state.lines.forEach(function (l, i) {
      var q = M.parseQty(l.qty, 10000), r = M.parseMoney(l.rate, 100000), blankRow = isBlankLine(l);
      if (!q.ok) errs['l' + i + 'qty'] = q.err;
      if (!r.ok) errs['l' + i + 'rate'] = r.err;
      if (!blankRow) {
        if (q.ok && q.blank) errs['l' + i + 'qty'] = 'Enter hours or a quantity.';
        if (r.ok && r.blank) errs['l' + i + 'rate'] = 'Enter a rate.';
        if (l.date && !M.parseDate(l.date)) errs['l' + i + 'date'] = 'Enter a valid date.';
      }
      var amt = q.ok && r.ok ? M.lineAmount(q, r.cents) : 0;
      lines.push({ i: i, blank: blankRow, date: l.date, desc: l.desc.trim(), qty: q, rateCents: r.ok ? r.cents : 0, cents: amt });
    });
    state.expenses.forEach(function (x, i) {
      var a = M.parseMoney(x.amount, 1000000), blankRow = !String(x.date + x.desc + x.amount).trim();
      if (!a.ok) errs['x' + i + 'amount'] = a.err;
      else if (!blankRow && a.blank) errs['x' + i + 'amount'] = 'Enter an amount.';
      if (!blankRow && x.date && !M.parseDate(x.date)) errs['x' + i + 'date'] = 'Enter a valid date.';
      expenses.push({ i: i, blank: blankRow, date: x.date, desc: x.desc.trim(), cents: a.ok ? a.cents : 0 });
    });
    var used = lines.filter(function (l) { return !l.blank; }), usedX = expenses.filter(function (x) { return !x.blank; });
    var t = M.invoiceTotals(used.map(function (l) { return { qty: l.qty, rateCents: l.rateCents }; }), usedX);
    var days = termsDays();
    if (days == null) errs.customDays = 'Enter 0 to 365 days.';
    var due = days == null ? '' : M.addDays(state.inv.date, days);
    if (!t.ok) errs.total = 'The total is too large for this tool.';
    return { lines: lines, expenses: expenses, used: used, usedX: usedX, totals: t, days: days, due: due, errs: errs };
  }
  function requiredErrors(m) {
    var e = {};
    if (!state.biz.name.trim()) e['biz.name'] = 'Add your name or business name.';
    if (!state.bill.facility.trim()) e['bill.facility'] = 'Add who you’re billing.';
    if (!state.inv.number.trim()) e['inv.number'] = 'Add an invoice number.';
    if (!M.parseDate(state.inv.date)) e['inv.date'] = 'Choose the invoice date.';
    if (!m.used.length) e['l0qty'] = 'Add at least one line item.';
    return e;
  }

  /* ---------- render ---------- */
  function lineRow(l, i) {
    var n = i + 1;
    return '<div class="row" data-i="' + i + '">' +
      '<label class="c c-date"><span class="lbl">Date</span><input type="date" data-f="date" value="' + esc(l.date) + '" aria-label="Line ' + n + ' date"><span class="ferr" data-e="l' + i + 'date"></span></label>' +
      '<label class="c c-desc"><span class="lbl">Description</span><input type="text" data-f="desc" maxlength="200" value="' + esc(l.desc) + '" placeholder="Regular hours, 7:00 AM–5:30 PM" aria-label="Line ' + n + ' description"></label>' +
      '<label class="c"><span class="lbl">Hours / qty</span><input type="text" inputmode="decimal" data-f="qty" value="' + esc(l.qty) + '" placeholder="10.5" aria-label="Line ' + n + ' hours or quantity" aria-describedby="qtyhint"><span class="ferr" data-e="l' + i + 'qty"></span></label>' +
      '<label class="c"><span class="lbl">Rate ($)</span><input type="text" inputmode="decimal" data-f="rate" value="' + esc(l.rate) + '" placeholder="175.00" aria-label="Line ' + n + ' rate in dollars"><span class="ferr" data-e="l' + i + 'rate"></span></label>' +
      '<div class="c"><span class="lbl">Amount</span><output class="amt" data-amt aria-label="Line ' + n + ' amount">$0.00</output></div>' +
      '<button type="button" class="icon-btn" data-rm aria-label="Remove line ' + n + '">×</button></div>';
  }
  function expRow(x, i) {
    var n = i + 1;
    return '<div class="row" data-i="' + i + '">' +
      '<label class="c c-date"><span class="lbl">Date</span><input type="date" data-f="date" value="' + esc(x.date) + '" aria-label="Expense ' + n + ' date"><span class="ferr" data-e="x' + i + 'date"></span></label>' +
      '<label class="c c-desc"><span class="lbl">Description</span><input type="text" data-f="desc" maxlength="200" value="' + esc(x.desc) + '" placeholder="Parking (receipt attached)" aria-label="Expense ' + n + ' description"></label>' +
      '<label class="c"><span class="lbl">Amount ($)</span><input type="text" inputmode="decimal" data-f="amount" value="' + esc(x.amount) + '" placeholder="36.00" aria-label="Expense ' + n + ' amount in dollars"><span class="ferr" data-e="x' + i + 'amount"></span></label>' +
      '<button type="button" class="icon-btn" data-rm aria-label="Remove expense ' + n + '">×</button></div>';
  }
  function renderRows() {
    $('#lines').innerHTML = state.lines.map(lineRow).join('');
    $('#expenses').innerHTML = state.expenses.map(expRow).join('');
    $('#exp-head').hidden = !state.expenses.length;
    $('#exp-empty').hidden = !!state.expenses.length;
  }
  function renderFields() {
    $$('[data-k]').forEach(function (el) {
      var path = el.getAttribute('data-k').split('.'), v = path.length === 2 ? state[path[0]][path[1]] : state[path[0]];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    $('#custom-days-wrap').hidden = state.inv.terms !== 'custom';
  }
  function setErr(key, msg, input) {
    var box = $('[data-e="' + key + '"]');
    if (box) box.textContent = msg || '';
    if (!input) return;
    var base = input.getAttribute('data-desc');
    if (base == null) { base = input.getAttribute('aria-describedby') || ''; input.setAttribute('data-desc', base); }
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (box) { box.id = 'e-' + key.replace(/\./g, '-'); input.setAttribute('aria-describedby', (box.id + ' ' + base).trim()); }
    } else {
      input.removeAttribute('aria-invalid');
      if (base) input.setAttribute('aria-describedby', base); else input.removeAttribute('aria-describedby');
    }
  }
  var shownRequired = {};
  function update() {
    var m = compute(), errs = m.errs;
    Object.keys(shownRequired).forEach(function (k) { if (!errs[k]) { var r = requiredErrors(m); if (r[k]) errs[k] = r[k]; } });
    $$('#lines .row').forEach(function (row) {
      var i = +row.getAttribute('data-i'), l = m.lines[i];
      $('[data-amt]', row).textContent = M.fmtCents(l.cents);
      ['date', 'qty', 'rate'].forEach(function (f) { setErr('l' + i + f, errs['l' + i + f], $('[data-f="' + f + '"]', row)); });
    });
    $$('#expenses .row').forEach(function (row) {
      var i = +row.getAttribute('data-i');
      ['date', 'amount'].forEach(function (f) { setErr('x' + i + f, errs['x' + i + f], $('[data-f="' + f + '"]', row)); });
    });
    ['biz.name', 'bill.facility', 'inv.number', 'inv.date'].forEach(function (k) { setErr(k, errs[k], $('[data-k="' + k + '"]')); });
    setErr('customDays', errs.customDays, $('[data-k="inv.customDays"]'));
    $('#t-services').textContent = M.fmtCents(m.totals.services);
    $('#t-expenses').textContent = M.fmtCents(m.totals.expenses);
    $('#t-total').textContent = M.fmtCents(m.totals.total);
    $('#due-out').textContent = m.due ? fmtDate(m.due) : '—';
    $('#add-line').disabled = state.lines.length >= MAX_ROWS;
    $('#add-exp').disabled = state.expenses.length >= MAX_ROWS;
    save();
    return m;
  }
  function status(msg, bad) { var s = $('#inv-status'); s.textContent = msg; s.className = 'status' + (bad ? ' bad' : ''); }

  /* ---------- PDF ---------- */
  function buildPdf(m) {
    var d = P.create({ title: 'Invoice ' + state.inv.number }), L = 50, R = 562, y = 0, INK = [20, 22, 24], MUTED = [95, 99, 104], LINE = [205, 208, 212];
    var X = { date: L, desc: L + 74, qty: 428, rate: 492, amt: R };
    function page() { d.addPage(); y = 54; }
    function need(h) { if (y + h > 724) { page(); return true; } return false; }
    function block(x, label, lines, w) {
      var yy = y; d.text(x, yy, label, { size: 8, bold: true, color: MUTED }); yy += 14;
      lines.forEach(function (t, k) { d.wrap(t, 10, k === 0, w).forEach(function (ln) { d.text(x, yy, ln, { size: 10, bold: k === 0, color: INK }); yy += 13; }); });
      return yy;
    }
    function splitLines(s) { return String(s || '').split(/\n/).map(function (t) { return t.trim(); }).filter(Boolean); }
    page();
    d.text(L, y + 16, 'INVOICE', { size: 26, bold: true, color: INK });
    var meta = [['Invoice no.', state.inv.number.trim()], ['Invoice date', fmtDate(state.inv.date)], ['Due date', fmtDate(m.due)], ['Terms', termsLabel(m.days)]];
    if (state.inv.po.trim()) meta.push(['PO / contract no.', state.inv.po.trim()]);
    if (state.inv.period.trim()) meta.push(['Service period', state.inv.period.trim()]);
    var my = y;
    meta.forEach(function (r) { d.text(R - 210, my, r[0], { size: 9, color: MUTED }); d.text(R, my, r[1].slice(0, 40), { size: 10, bold: true, color: INK, align: 'right' }); my += 15; });
    y = Math.max(y + 40, my + 10);
    var from = [state.biz.name.trim()].concat(splitLines(state.biz.address), [state.biz.email.trim(), state.biz.phone.trim()].filter(Boolean));
    var to = [state.bill.facility.trim()].concat(state.bill.attn.trim() ? ['Attn: ' + state.bill.attn.trim()] : [], splitLines(state.bill.address), state.bill.email.trim() ? [state.bill.email.trim()] : []);
    var y1 = block(L, 'FROM', from, 230), y2 = block(312, 'BILL TO', to, 250);
    y = Math.max(y1, y2) + 18;
    function head(cols) {
      d.rect(L, y, R - L, 20, { fill: [236, 239, 230] });
      cols.forEach(function (c) { d.text(c[1], y + 14, c[0], { size: 8.5, bold: true, color: INK, align: c[2] }); });
      y += 34;
    }
    var SVC = [['DATE', X.date], ['DESCRIPTION', X.desc], ['HOURS / QTY', X.qty, 'right'], ['RATE', X.rate, 'right'], ['AMOUNT', X.amt, 'right']];
    d.text(L, y, 'SERVICES', { size: 9, bold: true, color: MUTED }); y += 8;
    head(SVC);
    m.used.forEach(function (l) {
      var desc = d.wrap(l.desc || '—', 9.5, false, X.qty - X.desc - 62), h = desc.length * 12 + 4;
      if (need(h + 6)) head(SVC);
      d.text(X.date, y, l.date ? fmtDate(l.date) : '', { size: 9.5, color: INK });
      desc.forEach(function (t, k) { d.text(X.desc, y + k * 12, t, { size: 9.5, color: INK }); });
      d.text(X.qty, y, M.fmtQty(l.qty), { size: 9.5, color: INK, align: 'right' });
      d.text(X.rate, y, M.fmtCents(l.rateCents), { size: 9.5, color: INK, align: 'right' });
      d.text(X.amt, y, M.fmtCents(l.cents), { size: 9.5, color: INK, align: 'right' });
      y += h; d.line(L, y - 6, R, y - 6, { color: LINE }); y += 6;
    });
    need(20); d.text(X.rate, y + 2, 'Services subtotal', { size: 9.5, color: MUTED, align: 'right' }); d.text(X.amt, y + 2, M.fmtCents(m.totals.services), { size: 10, bold: true, color: INK, align: 'right' }); y += 26;
    if (m.usedX.length) {
      var EXP = [['DATE', X.date], ['DESCRIPTION', X.desc], ['AMOUNT', X.amt, 'right']];
      need(60); d.text(L, y, 'EXPENSES', { size: 9, bold: true, color: MUTED }); y += 8; head(EXP);
      m.usedX.forEach(function (x) {
        var desc = d.wrap(x.desc || '—', 9.5, false, X.amt - X.desc - 90), h = desc.length * 12 + 4;
        if (need(h + 6)) head(EXP);
        d.text(X.date, y, x.date ? fmtDate(x.date) : '', { size: 9.5, color: INK });
        desc.forEach(function (t, k) { d.text(X.desc, y + k * 12, t, { size: 9.5, color: INK }); });
        d.text(X.amt, y, M.fmtCents(x.cents), { size: 9.5, color: INK, align: 'right' });
        y += h; d.line(L, y - 6, R, y - 6, { color: LINE }); y += 6;
      });
      need(20); d.text(X.rate, y + 2, 'Expenses subtotal', { size: 9.5, color: MUTED, align: 'right' }); d.text(X.amt, y + 2, M.fmtCents(m.totals.expenses), { size: 10, bold: true, color: INK, align: 'right' }); y += 26;
    }
    need(40);
    d.rect(330, y - 4, R - 330, 30, { fill: [191, 243, 95] });
    d.text(342, y + 15, 'TOTAL DUE', { size: 12, bold: true, color: INK });
    d.text(R - 12, y + 15, M.fmtCents(m.totals.total), { size: 14, bold: true, color: INK, align: 'right' });
    y += 50;
    [['PAYMENT', state.payment], ['NOTES', state.notes]].forEach(function (b) {
      var txt = String(b[1] || '').trim(); if (!txt) return;
      need(34); d.text(L, y, b[0], { size: 8, bold: true, color: MUTED }); y += 14;
      txt.split(/\n/).forEach(function (para) { d.wrap(para, 10, false, R - L).forEach(function (ln) { need(14); d.text(L, y, ln, { size: 10, color: INK }); y += 13; }); });
      y += 10;
    });
    var count = d.pageCount();
    for (var i = 0; i < count; i++) {
      d.setPage(i);
      d.line(L, 752, R, 752, { color: LINE });
      d.text(L, 766, state.inv.number.trim() + ' · ' + state.biz.name.trim().slice(0, 60), { size: 8, color: MUTED });
      d.text(R, 766, 'Page ' + (i + 1) + ' of ' + count, { size: 8, color: MUTED, align: 'right' });
    }
    return d.output();
  }
  function download() {
    var m = compute(), req = requiredErrors(m), all = {}, k;
    for (k in m.errs) all[k] = m.errs[k];
    for (k in req) { all[k] = req[k]; shownRequired[k] = true; }
    update();
    Object.keys(req).forEach(function (key) {
      var el = key === 'l0qty' ? $('#lines .row [data-f="qty"]') : $('[data-k="' + key + '"]');
      setErr(key, req[key], el);
    });
    var keys = Object.keys(all);
    if (keys.length) {
      status('Fix ' + keys.length + (keys.length === 1 ? ' field' : ' fields') + ' marked in red, then download again.', true);
      var first = $('[aria-invalid="true"]'); if (first) first.focus();
      return null;
    }
    var bytes = buildPdf(m);
    var name = 'Invoice-' + (state.inv.number.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'draft') + '.pdf';
    var blob = new Blob([bytes], { type: 'application/pdf' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    status('Downloaded ' + name + ' (total ' + M.fmtCents(m.totals.total) + ').', false);
    return name;
  }

  /* ---------- events ---------- */
  function rowsEvents(container, list, makeBlank, kind) {
    container.addEventListener('input', function (e) {
      var row = e.target.closest('.row'), f = e.target.getAttribute('data-f'); if (!row || !f) return;
      state[list][+row.getAttribute('data-i')][f] = e.target.value; update();
    });
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      var i = +b.closest('.row').getAttribute('data-i');
      state[list].splice(i, 1);
      if (list === 'lines' && !state.lines.length) state.lines.push(blankLine());
      renderRows(); update();
      var rows = $$('.row', container), target = rows[Math.min(i, rows.length - 1)];
      (target ? $('[data-rm]', target) : $(kind === 'exp' ? '#add-exp' : '#add-line')).focus();
      status('Removed ' + (kind === 'exp' ? 'expense ' : 'line ') + (i + 1) + '.', false);
    });
  }
  function addLine(desc, qty) {
    if (state.lines.length >= MAX_ROWS) return;
    var last = state.lines[state.lines.length - 1];
    if (last && isBlankLine(last) && state.lines.length === 1 && desc == null) { $('#lines .row input').focus(); return; }
    var l = blankLine(last ? last.date : '');
    if (desc) l.desc = desc;
    if (qty) l.qty = qty;
    if (last && isBlankLine(last)) state.lines[state.lines.length - 1] = l; else state.lines.push(l);
    renderRows(); update();
    var rows = $$('#lines .row'), row = rows[rows.length - 1];
    $(desc ? (qty ? '[data-f="rate"]' : '[data-f="qty"]') : '[data-f="date"]', row).focus();
  }
  function init() {
    var restored = load();
    renderFields(); renderRows(); update();
    if (restored) status('Restored your last invoice from this browser. Use “Clear form” to start over.', false);
    $$('[data-k]').forEach(function (el) {
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () {
        var path = el.getAttribute('data-k').split('.'), v = el.type === 'checkbox' ? el.checked : el.value;
        if (path.length === 2) state[path[0]][path[1]] = v; else state[path[0]] = v;
        if (el.getAttribute('data-k') === 'inv.terms') $('#custom-days-wrap').hidden = v !== 'custom';
        update();
        if (el.getAttribute('data-k') === 'save') status(v ? 'This invoice will be saved in this browser only.' : 'Saving is off. Nothing is stored in this browser.', false);
      });
    });
    rowsEvents($('#lines'), 'lines', blankLine, 'line');
    rowsEvents($('#expenses'), 'expenses', null, 'exp');
    $('#add-line').addEventListener('click', function () { addLine(); });
    $('#add-premium').addEventListener('click', function () { addLine('Premium hours (after 10 h)'); });
    $('#add-stipend').addEventListener('click', function () { addLine('Call stipend', '1'); });
    $('#add-calledin').addEventListener('click', function () { addLine('Called in'); });
    $('#add-exp').addEventListener('click', function () {
      if (state.expenses.length >= MAX_ROWS) return;
      state.expenses.push({ date: '', desc: '', amount: '' }); renderRows(); update();
      var rows = $$('#expenses .row'); $('[data-f="date"]', rows[rows.length - 1]).focus();
    });
    $('#sample').addEventListener('click', function () {
      state = JSON.parse(JSON.stringify(SAMPLE)); shownRequired = {};
      renderFields(); renderRows(); update(); status('Sample invoice loaded. Replace it with your own details.', false);
    });
    $('#clear').addEventListener('click', function () {
      if (!window.confirm('Clear the whole form? This also removes the copy saved in this browser.')) return;
      var keep = state.save; state = blank(); state.save = keep; shownRequired = {};
      try { localStorage.removeItem(KEY); } catch (e) { }
      renderFields(); renderRows(); update(); status('Form cleared.', false);
      $('[data-k="biz.name"]').focus();
    });
    $('#download').addEventListener('click', download);
    window.LTInvoice = { compute: compute, buildPdf: buildPdf, getState: function () { return state; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
