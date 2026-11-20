/* Locum Tally 1099 rate calculator. Runs only in your browser; nothing you type is sent anywhere. */
(function () {
  'use strict';
  var M = window.LTMath;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var FIELDS = {
    salary: { max: 10000000 }, rate1099: { max: 10000 }, hoursPerWeek: { max: 168 }, weeksOff: { max: 51.99 },
    health: { max: 1000000 }, retirementPct: { max: 100 }, disability: { max: 1000000 },
    malpractice: { max: 1000000 }, cme: { max: 1000000 }, otherBiz: { max: 1000000 }
  };
  function money(x) { return M.fmtDollars(x, 0); }
  function setErr(el, msg) {
    var box = $('#' + el.id + '-err');
    box.textContent = msg || '';
    if (msg) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', el.id + '-err' + (el.dataset.desc ? ' ' + el.dataset.desc : '')); }
    else { el.removeAttribute('aria-invalid'); if (el.dataset.desc) el.setAttribute('aria-describedby', el.dataset.desc); else el.removeAttribute('aria-describedby'); }
  }
  function read() {
    var v = {}, bad = 0;
    Object.keys(FIELDS).forEach(function (k) {
      var el = $('#' + k), r = M.parseNum(el.value, FIELDS[k]);
      if (el.dataset.desc == null) el.dataset.desc = el.getAttribute('aria-describedby') || '';
      setErr(el, r.ok ? '' : r.err); if (!r.ok) bad++;
      v[k] = r.value;
    });
    return { v: v, bad: bad };
  }
  function row(label, value, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }
  function update() {
    var mode = $('input[name="mode"]:checked').value, r = read(), v = r.v;
    $('#salary-wrap').hidden = mode !== 'w2';
    $('#rate-wrap').hidden = mode !== '1099';
    var out = $('#result'), big = $('#big'), sub = $('#big-sub'), dl = $('#breakdown');
    if (r.bad) { big.textContent = '—'; sub.textContent = 'Fix the fields marked in red.'; dl.innerHTML = ''; return; }
    if (mode === 'w2') {
      var a = M.w2To1099(v);
      $('#big-label').textContent = 'Equivalent 1099 hourly rate';
      if (a.err) { big.textContent = '—'; sub.textContent = a.err; dl.innerHTML = ''; return; }
      big.textContent = M.fmtDollars(a.hourly) + '/hr';
      sub.textContent = 'To match a ' + money(v.salary) + ' W-2 job, working ' + M.fmtDollars(a.hours, 0).slice(1) + ' billable hours a year.';
      dl.innerHTML = row('W-2 salary', money(v.salary)) +
        row('Your employee Social Security + Medicare', '−' + money(a.fica)) +
        row('Benefits to replace (health, disability, ' + v.retirementPct + '% retirement)', '+' + money(v.health + v.disability + a.retirement)) +
        row('Take-home value to match (before income tax)', money(a.w2Value)) +
        row('Self-employment tax on 1099 profit', '+' + money(a.se)) +
        row('Business costs (malpractice, CME, other)', '+' + money(a.biz)) +
        row('1099 gross you need per year', money(a.gross)) +
        row('Your W-2 pay per hour worked', M.fmtDollars(a.w2Hourly) + '/hr');
      out.dataset.value = a.hourly.toFixed(2);
    } else {
      var b = M.t1099ToW2(v, v.rate1099);
      $('#big-label').textContent = 'Equivalent W-2 salary';
      if (b.err) { big.textContent = '—'; sub.textContent = b.err; dl.innerHTML = ''; return; }
      big.textContent = money(b.salary);
      sub.textContent = b.short ? 'At this rate the 1099 income doesn’t cover the costs and benefits you entered.'
        : 'A W-2 job paying this, with your ' + v.retirementPct + '% match and benefits, leaves about the same take-home as ' + M.fmtDollars(v.rate1099) + '/hr on 1099.';
      dl.innerHTML = row('1099 gross (' + M.fmtDollars(b.hours, 0).slice(1) + ' h × ' + M.fmtDollars(v.rate1099) + ')', money(b.gross)) +
        row('Business costs (malpractice, CME, other)', '−' + money(b.biz)) +
        row('Self-employment tax', '−' + money(b.se)) +
        row('Health and disability you pay yourself', '−' + money(v.health + v.disability)) +
        row('Left to match (before income tax)', money(b.available)) +
        row('W-2 employee Social Security + Medicare', money(b.fica)) +
        row('Employer retirement match (' + v.retirementPct + '%)', money(b.retirement));
      out.dataset.value = b.salary.toFixed(2);
    }
  }
  function init() {
    $$('#rate-form input').forEach(function (el) { el.addEventListener('input', update); el.addEventListener('change', update); });
    $('#rate-form').addEventListener('submit', function (e) { e.preventDefault(); update(); });
    $('#rate-form').addEventListener('reset', function () { setTimeout(function () { update(); $('#salary').focus(); }, 0); });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
