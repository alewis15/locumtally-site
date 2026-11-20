/* Locum Tally free tools: shared math. Runs only in your browser; nothing is sent anywhere.
   Money is integer cents. Pay rules mirror the Locum Tally iPhone app (billing rules v2). */
(function (root) {
  'use strict';
  var M = {};
  var MAX_CENTS = 10000000000; // $100,000,000 safety cap

  /* ---------- parsing ---------- */
  function clean(s) { return String(s == null ? '' : s).replace(/[\s,$]/g, ''); }
  // Dollars -> {ok, cents, blank, err}
  M.parseMoney = function (s, maxDollars) {
    var t = clean(s);
    if (t === '') return { ok: true, cents: 0, blank: true };
    if (/^-/.test(t)) return { ok: false, cents: 0, err: "Can't be negative." };
    var m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t);
    if (!m || (m[1] === '' && !m[2])) return { ok: false, cents: 0, err: 'Enter a dollar amount, like 175 or 175.50.' };
    var cents = parseInt(m[1] || '0', 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
    var max = (maxDollars == null ? 1000000 : maxDollars) * 100;
    if (cents > max) return { ok: false, cents: 0, err: 'That amount is too large (max $' + (max / 100).toLocaleString('en-US') + ').' };
    return { ok: true, cents: cents };
  };
  // Hours or quantity -> {ok, num, den, blank, err}. "10", "10.25" (den 100) or "10:30" (minutes, den 60).
  M.parseQty = function (s, maxQty) {
    var t = clean(s), max = maxQty == null ? 10000 : maxQty;
    if (t === '') return { ok: true, num: 0, den: 100, blank: true };
    if (/^-/.test(t)) return { ok: false, num: 0, den: 100, err: "Can't be negative." };
    var hm = /^(\d{1,5}):([0-5]\d)$/.exec(t);
    if (hm) {
      var mins = parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
      if (mins > max * 60) return { ok: false, num: 0, den: 60, err: 'Too large (max ' + max + ').' };
      return { ok: true, num: mins, den: 60 };
    }
    var m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t);
    if (!m || (m[1] === '' && !m[2])) return { ok: false, num: 0, den: 100, err: 'Enter a number like 10, 10.25 or 10:15.' };
    var n = parseInt(m[1] || '0', 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
    if (n > max * 100) return { ok: false, num: 0, den: 100, err: 'Too large (max ' + max + ').' };
    return { ok: true, num: n, den: 100 };
  };
  // Plain non-negative number (calculator inputs). Returns {ok, value, blank, err}
  M.parseNum = function (s, opt) {
    opt = opt || {};
    var t = clean(s).replace(/%$/, '');
    if (t === '') return { ok: true, value: 0, blank: true };
    if (/^-/.test(t)) return { ok: false, value: 0, err: "Can't be negative." };
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, value: 0, err: 'Enter a number.' };
    var v = parseFloat(t);
    if (opt.max != null && v > opt.max) return { ok: false, value: 0, err: 'Max is ' + opt.max.toLocaleString('en-US') + '.' };
    if (opt.int && Math.floor(v) !== v) return { ok: false, value: 0, err: 'Enter a whole number.' };
    return { ok: true, value: v };
  };
  // "HH:MM" -> minutes after midnight or null
  M.parseTime = function (s) {
    var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s || '').trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  M.parseDate = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  };

  /* ---------- formatting ---------- */
  M.fmtCents = function (c) {
    var neg = c < 0; c = Math.abs(Math.round(c));
    var d = Math.floor(c / 100), r = c % 100;
    return (neg ? '-' : '') + '$' + d.toLocaleString('en-US') + '.' + (r < 10 ? '0' : '') + r;
  };
  M.fmtDollars = function (x, dp) { // float dollars
    dp = dp == null ? 2 : dp;
    var neg = x < 0, v = Math.abs(x);
    return (neg ? '-' : '') + '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  M.fmtHM = function (min) { return Math.floor(min / 60) + 'h ' + (min % 60 < 10 ? '0' : '') + (min % 60) + 'm'; };
  M.fmtHours = function (min) { return (min / 60).toFixed(2); };
  M.fmtQty = function (q) { // qty object -> display hours
    if (q.den === 60) return M.fmtHM(q.num);
    return (q.num / 100).toFixed(2);
  };

  /* ---------- invoice ---------- */
  // amount = qty x rate, rounded half-up to the cent, exact integer math
  M.lineAmount = function (qty, rateCents) {
    return Math.floor((2 * qty.num * rateCents + qty.den) / (2 * qty.den));
  };
  // lines: [{qty:{num,den}, rateCents}], expenses: [{cents}]
  M.invoiceTotals = function (lines, expenses) {
    var services = 0, exp = 0, i;
    for (i = 0; i < lines.length; i++) services += M.lineAmount(lines[i].qty, lines[i].rateCents);
    for (i = 0; i < (expenses || []).length; i++) exp += expenses[i].cents;
    var total = services + exp;
    return { services: services, expenses: exp, total: total, ok: total <= MAX_CENTS };
  };
  // calendar-day due date
  M.addDays = function (iso, days) {
    var p = M.parseDate(iso); if (!p) return '';
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
    return dt.toISOString().slice(0, 10);
  };

  /* ---------- pay rules (mirror the app) ---------- */
  M.INCREMENTS = [1, 6, 15, 30];
  // Up: next multiple. Nearest: ties go up; positive time never rounds to 0.
  M.roundMinutes = function (minutes, inc, mode) {
    if (minutes <= 0) return 0;
    if (inc <= 1) return minutes;
    if (mode === 'nearest') return Math.max(inc, Math.floor((2 * minutes + inc) / (2 * inc)) * inc);
    return Math.floor((minutes + inc - 1) / inc) * inc;
  };
  M.comp = function (minutes, rateCents) { return Math.floor((minutes * rateCents + 30) / 60); };

  function weekdayOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); } // 0 = Sunday
  function nth(y, month, n, wd) { // wd 0=Sun..6=Sat ; n=-1 last
    var first = weekdayOf(y, month, 1), firstMatch = 1 + (wd - first + 7) % 7;
    if (n > 0) return firstMatch + (n - 1) * 7;
    var days = new Date(Date.UTC(y, month, 0)).getUTCDate(), d = firstMatch;
    while (d + 7 <= days) d += 7;
    return d;
  }
  M.HOLIDAYS = [
    ['newYearsDay', "New Year's Day", function () { return [1, 1]; }, true],
    ['mlkDay', 'Martin Luther King Jr. Day', function (y) { return [1, nth(y, 1, 3, 1)]; }, false],
    ['presidentsDay', 'Presidents Day', function (y) { return [2, nth(y, 2, 3, 1)]; }, false],
    ['memorialDay', 'Memorial Day', function (y) { return [5, nth(y, 5, -1, 1)]; }, true],
    ['juneteenth', 'Juneteenth', function () { return [6, 19]; }, false],
    ['independenceDay', 'Independence Day', function () { return [7, 4]; }, true],
    ['laborDay', 'Labor Day', function (y) { return [9, nth(y, 9, 1, 1)]; }, true],
    ['columbusDay', 'Columbus Day', function (y) { return [10, nth(y, 10, 2, 1)]; }, false],
    ['veteransDay', 'Veterans Day', function () { return [11, 11]; }, false],
    ['thanksgiving', 'Thanksgiving', function (y) { return [11, nth(y, 11, 4, 4)]; }, true],
    ['dayAfterThanksgiving', 'Day after Thanksgiving', function (y) { return [11, nth(y, 11, 4, 4) + 1]; }, false],
    ['christmasEve', 'Christmas Eve', function () { return [12, 24]; }, false],
    ['christmas', 'Christmas Day', function () { return [12, 25]; }, true],
    ['newYearsEve', "New Year's Eve", function () { return [12, 31]; }, false]
  ];
  M.DEFAULT_HOLIDAYS = M.HOLIDAYS.filter(function (h) { return h[3]; }).map(function (h) { return h[0]; });
  // Holiday beats Saturday/Sunday, which beat Mon-Fri. Decided by the day the shift STARTS.
  M.dayKind = function (iso, holidayKeys) {
    var p = M.parseDate(iso); if (!p) return null;
    holidayKeys = holidayKeys || M.DEFAULT_HOLIDAYS;
    for (var i = 0; i < M.HOLIDAYS.length; i++) {
      var h = M.HOLIDAYS[i];
      if (holidayKeys.indexOf(h[0]) < 0) continue;
      var md = h[2](p.y);
      if (md[0] === p.m && md[1] === p.d) { var w0 = weekdayOf(p.y, p.m, p.d); return { kind: 'holiday', label: h[1], weekend: w0 === 0 || w0 === 6 }; }
    }
    var wd = weekdayOf(p.y, p.m, p.d);
    if (wd === 6) return { kind: 'saturday', label: 'Saturday', weekend: true };
    if (wd === 0) return { kind: 'sunday', label: 'Sunday', weekend: true };
    return { kind: 'weekday', label: 'Mon–Fri', weekend: false };
  };

  /* rules: {rate, premiumRate, premiumAfterMin, guaranteeMin, inc, mode, weekendRate, holidayRate, holidays,
              callMode:'stipend'|'hourly'|'both', stipend, satStipend, sunStipend, holStipend, byDay, callRate, calledInRate}
     all money in cents; 0 = not used */
  M.windowMinutes = function (start, end, plusDays) {
    var s = M.parseTime(start), e = M.parseTime(end);
    if (s == null || e == null) return null;
    if (plusDays > 0) return e + 1440 * plusDays - s;
    var w = e - s; if (w <= 0) w += 1440; // overnight: ends the next day; same time = 24 h
    return w;
  };
  M.shiftCharge = function (sh, r) {
    var out = { type: 'shift', lines: [], cents: 0, err: null };
    var day = M.dayKind(sh.date, r.holidays);
    var elapsed = M.windowMinutes(sh.start, sh.end, 0);
    if (!day) { out.err = 'Choose a date.'; return out; }
    if (elapsed == null) { out.err = 'Enter a start and end time.'; return out; }
    var brk = sh.breakMin || 0;
    if (brk < 0 || brk >= elapsed) { out.err = 'The unpaid break must be shorter than the shift.'; return out; }
    var worked = elapsed - brk;
    var billed = M.roundMinutes(worked, r.inc, r.mode);
    var usePremium = r.premiumAfterMin > 0 && r.premiumRate > 0;
    var threshold = usePremium ? r.premiumAfterMin : 1440;
    var regular = Math.min(billed, threshold), premium = Math.max(0, billed - threshold);
    var topUp = Math.max(0, (r.guaranteeMin || 0) - billed);
    var dayRate = r.rate, dayLabel = null;
    if (day.kind === 'holiday' && r.holidayRate > 0) { dayRate = r.holidayRate; dayLabel = 'Holiday rate (' + day.label + ')'; }
    else if (day.weekend && r.weekendRate > 0) // a weekend holiday with no holiday rate still gets the weekend rate (as in the app)
      { dayRate = r.weekendRate; dayLabel = 'Weekend rate'; }
    var base = dayLabel || 'Regular hours';
    if (premium === 0) {
      var mins = regular + topUp;
      if (mins > 0) out.lines.push({ label: base + (topUp > 0 ? ' + guarantee top-up' : ''), minutes: mins, rate: dayRate, cents: M.comp(mins, dayRate) });
    } else {
      if (regular > 0) out.lines.push({ label: base, minutes: regular, rate: dayRate, cents: M.comp(regular, dayRate) });
      out.lines.push({ label: 'Premium hours', minutes: premium, rate: r.premiumRate, cents: M.comp(premium, r.premiumRate) });
      if (topUp > 0) out.lines.push({ label: 'Guarantee top-up', minutes: topUp, rate: dayRate, cents: M.comp(topUp, dayRate) });
    }
    out.cents = out.lines.reduce(function (a, l) { return a + l.cents; }, 0);
    out.elapsed = elapsed; out.worked = worked; out.billed = billed; out.regular = regular; out.premium = premium;
    out.topUp = topUp; out.dayRate = dayRate; out.day = day; out.paidMinutes = billed + topUp;
    return out;
  };
  M.stipendFor = function (r, day) {
    var base = r.stipend || 0;
    if (!r.byDay) return base;
    if (day.kind === 'saturday') return r.satStipend || base;
    if (day.kind === 'sunday') return r.sunStipend || base;
    if (day.kind === 'holiday') return r.holStipend || base;
    return base;
  };
  M.callCharge = function (c, r) {
    var out = { type: 'call', lines: [], cents: 0, err: null };
    var day = M.dayKind(c.date, r.holidays);
    var win = M.windowMinutes(c.start, c.end, c.plusDays || 0);
    if (!day) { out.err = 'Choose a date.'; return out; }
    if (win == null) { out.err = 'Enter a start and end time.'; return out; }
    if (win < 1 || win > 72 * 60) { out.err = 'Call must be from 1 minute to 72 hours and end after it starts.'; return out; }
    var calledIn = c.calledInMin || 0;
    if (calledIn < 0 || calledIn > win) { out.err = 'Called-in time can’t be longer than the call window.'; return out; }
    var hourly = r.callMode === 'hourly' || r.callMode === 'both';
    var stipendOn = r.callMode === 'stipend' || r.callMode === 'both';
    var callMin = hourly ? M.roundMinutes(Math.max(0, win - calledIn), r.inc, r.mode) : 0;
    var calledInMin = M.roundMinutes(calledIn, r.inc, r.mode);
    var stipend = stipendOn ? M.stipendFor(r, day) : 0;
    var callRate = r.callRate || 0, ciRate = r.calledInRate || r.rate;
    if (stipend > 0) out.lines.push({ label: 'Call stipend (' + day.label + ')', minutes: null, rate: null, cents: stipend });
    if (callMin > 0) out.lines.push({ label: 'Call hours', minutes: callMin, rate: callRate, cents: M.comp(callMin, callRate) });
    if (calledInMin > 0) out.lines.push({ label: 'Called in', minutes: calledInMin, rate: ciRate, cents: M.comp(calledInMin, ciRate) });
    out.cents = out.lines.reduce(function (a, l) { return a + l.cents; }, 0);
    out.window = win; out.callMin = callMin; out.calledInMin = calledInMin; out.stipend = stipend; out.day = day;
    out.paidMinutes = callMin + calledInMin;
    return out;
  };
  M.periodPay = function (rows, r) {
    var res = rows.map(function (row) { return row.type === 'call' ? M.callCharge(row, r) : M.shiftCharge(row, r); });
    var total = 0, shiftMin = 0, callMin = 0, calledIn = 0, stipends = 0, errors = 0;
    res.forEach(function (x) {
      if (x.err) { errors++; return; }
      total += x.cents;
      if (x.type === 'shift') shiftMin += x.paidMinutes; else { callMin += x.callMin; calledIn += x.calledInMin; stipends += x.stipend; }
    });
    return { rows: res, total: total, shiftMinutes: shiftMin, callMinutes: callMin, calledInMinutes: calledIn, stipends: stipends, errors: errors, ok: total <= MAX_CENTS };
  };

  /* ---------- W-2 vs 1099 (2026 figures) ---------- */
  // Sources: IRS "Self-employment tax" page (15.3% = 12.4% + 2.9%; 2026 base $184,500); SSA contribution and benefit base table.
  M.TAX2026 = { wageBase: 184500, seFactor: 0.9235, seSS: 0.124, seMed: 0.029, empSS: 0.062, empMed: 0.0145, seMin: 400 };
  M.seTax = function (profit, T) {
    T = T || M.TAX2026;
    if (!(profit > 0)) return 0;
    var base = profit * T.seFactor;
    if (base < T.seMin) return 0;
    return T.seSS * Math.min(base, T.wageBase) + T.seMed * base;
  };
  M.employeeFica = function (salary, T) {
    T = T || M.TAX2026;
    if (!(salary > 0)) return 0;
    return T.empSS * Math.min(salary, T.wageBase) + T.empMed * salary;
  };
  // Smallest profit P with P - seTax(P) >= target (closed form, piecewise linear)
  M.profitForNet = function (target, T) {
    T = T || M.TAX2026;
    if (!(target > 0)) return 0;
    if (target * T.seFactor < T.seMin) return target;
    var a = 1 - (T.seSS + T.seMed) * T.seFactor, pStar = T.wageBase / T.seFactor;
    if (target <= pStar * a) return target / a;
    return (target + T.seSS * T.wageBase) / (1 - T.seMed * T.seFactor);
  };
  /* inp: {salary, hoursPerWeek, weeksOff, health, retirementPct, disability, malpractice, cme, otherBiz} (dollars) */
  M.hoursPerYear = function (inp) { return inp.hoursPerWeek * (52 - inp.weeksOff); };
  M.w2To1099 = function (inp, T) {
    T = T || M.TAX2026;
    var hours = M.hoursPerYear(inp);
    if (!(hours > 0)) return { err: 'Enter hours per week and fewer than 52 weeks off.' };
    var retirement = inp.salary * inp.retirementPct / 100;
    var fica = M.employeeFica(inp.salary, T);
    var w2Value = inp.salary - fica + inp.health + inp.disability + retirement;
    var profit = M.profitForNet(w2Value, T);
    var se = M.seTax(profit, T);
    var biz = inp.malpractice + inp.cme + inp.otherBiz;
    var gross = profit + biz;
    return { hours: hours, retirement: retirement, fica: fica, w2Value: w2Value, profit: profit, se: se, biz: biz,
             gross: gross, hourly: gross / hours, w2Hourly: inp.salary / hours };
  };
  M.t1099ToW2 = function (inp, rate, T) {
    T = T || M.TAX2026;
    var hours = M.hoursPerYear(inp);
    if (!(hours > 0)) return { err: 'Enter hours per week and fewer than 52 weeks off.' };
    var biz = inp.malpractice + inp.cme + inp.otherBiz;
    var gross = rate * hours, profit = gross - biz, se = M.seTax(profit, T);
    var net = profit - se;
    var available = net - inp.health - inp.disability;
    var p = inp.retirementPct / 100, salary;
    if (!(available > 0)) salary = 0;
    else if (available <= T.wageBase * (1 + p - T.empSS - T.empMed)) salary = available / (1 + p - T.empSS - T.empMed);
    else salary = (available + T.empSS * T.wageBase) / (1 + p - T.empMed);
    return { hours: hours, gross: gross, biz: biz, profit: profit, se: se, net: net, available: available, salary: salary,
             fica: M.employeeFica(salary, T), retirement: salary * p, short: !(available > 0) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M; else root.LTMath = M;
})(this);
