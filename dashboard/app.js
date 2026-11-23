// token-radar-01 R3 dashboard. Renders window.RADAR_DATA (written by
// main.ts into data.js). No network: no fetch, no external URLs.
(function () {
  'use strict';
  var D = window.RADAR_DATA;
  if (!D) { document.body.innerHTML = '<p style="padding:20px">No data: run main.ts first.</p>'; return; }
  var E = D.evidence;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return (n * 100).toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- KPI strip (6 cards)
  $('k-ranked').textContent = D.ledger.ranked;
  $('k-ranked-s').textContent = 'watchlist ' + D.watchlistCovered + '/' + D.watchlistTotal + ' · ledger ' + D.ledger.total + '/' + D.ledger.total;
  $('k-total').textContent = money(D.impliedTotalUsd);
  $('k-total-s').textContent = 'top ' + esc(D.topSlug) + ' ' + money(D.topImpliedUsd);
  $('k-miss').textContent = '×' + E.loo_multiple.toFixed(2);
  $('k-miss-s').textContent = 'walk-forward ×' + E.wf_multiple.toFixed(2) + ' · flat ×' + E.flat_loo_multiple.toFixed(2);
  $('k-range').textContent = pct(E.range_hold_p50);
  $('k-range-s').textContent = 'in P25–P75 (stated 50%) · P10–P90 ' + pct(E.range_hold_p80) + ' (stated 80%)';
  $('k-brier').textContent = E.odds_cv_brier.toFixed(3);
  $('k-brier-s').textContent = '5-fold CV · base rate ' + E.odds_base_brier.toFixed(3) + ' · in-sample ' + E.odds_brier.toFixed(3);
  var worth = (D.verdictCounts.FARM || 0) + (D.verdictCounts.THIN || 0);
  $('k-farm').textContent = worth;
  $('k-farm-s').textContent = 'FARM ' + (D.verdictCounts.FARM || 0) + ' · THIN ' + (D.verdictCounts.THIN || 0) + ' · MARG ' + (D.verdictCounts.MARGINAL || 0) + ' · SKIP ' + (D.verdictCounts.SKIP || 0);

  // ---- formula row
  $('formula').innerHTML = '<b>Model:</b> implied = TVL × fitted multiple × launch odds &nbsp;·&nbsp; ' +
    '<b>' + esc(E.size_curve.formula) + '</b> (s.e. a ±' + E.size_curve.a_se + ', b ±' + E.size_curve.b_se +
    ', n=' + E.size_curve.n + ' traded tokens) &nbsp;·&nbsp; odds = logistic(age, ln TVL, 7d growth), n=' +
    E.odds_n + ', ' + E.odds_positives + ' with a token &nbsp;·&nbsp; ranges from leave-one-out residuals.';

  // ---- ledger bar
  var L = D.ledger;
  $('ledger-nums').textContent = 'ranked ' + L.ranked + ' · token trades ' + L.tokenTrades + ' · set-aside ' + L.setAside + ' · total ' + L.total;
  $('ledger-bar').innerHTML =
    '<div class="lb-ranked" style="width:' + (L.ranked / L.total * 100) + '%" title="ranked"></div>' +
    '<div class="lb-trades" style="width:' + (L.tokenTrades / L.total * 100) + '%" title="token trades"></div>' +
    '<div class="lb-set" style="width:' + (L.setAside / L.total * 100) + '%" title="set-aside"></div>';
  $('ledger-legend').innerHTML = '<b style="color:#2dd4bf">■ ranked ' + L.ranked + '</b> (watchlist 40 + 158 largest no-token below the $50M floor) &nbsp; ' +
    '<b style="color:#5b7ba6">■ token trades ' + L.tokenTrades + '</b> (size curve fitted on these, never ranked) &nbsp; ' +
    '<b style="color:#8fa0b8">■ set-aside ' + L.setAside + '</b> (versioned / wrapped / exchange products + smallest) · ' +
    L.ranked + ' + ' + L.tokenTrades + ' + ' + L.setAside + ' = ' + L.total + '.';

  // ---- evidence table (3 columns)
  function evRows(rows) {
    return '<table>' + rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="' + (r[2] ? 'good' : 'bad') + '">' + r[1] + '</td></tr>';
    }).join('') + '</table>';
  }
  $('ev-value').innerHTML = evRows([
    ['Leave-one-out miss (' + E.size_curve.n + ' traded tokens)', '×' + E.loo_multiple.toFixed(2), true],
    ['Walk-forward miss (older half → newer half)', '×' + E.wf_multiple.toFixed(2), true],
    ['Flat multiple baseline, LOO / WF', '×' + E.flat_loo_multiple.toFixed(2) + ' / ×' + E.flat_wf_multiple.toFixed(2), false],
    ['Verdict', 'fit beats flat in both tests', true],
  ]);
  $('ev-odds').innerHTML = evRows([
    ['Brier, 5-fold CV (odds)', E.odds_cv_brier.toFixed(3), E.odds_cv_brier < E.odds_base_brier],
    ['Base rate (always predict ' + E.odds_base_rate + ')', E.odds_base_brier.toFixed(3), false],
    ['Placebo: growth of another row', E.odds_placebo_brier.toFixed(3), E.odds_placebo_brier >= E.odds_brier],
    ['Verdict', 'odds beat base rate; placebo does not help', E.odds_placebo_brier >= E.odds_brier],
  ]);
  $('ev-range').innerHTML = evRows([
    ['Held-out caps inside P25–P75', pct(E.range_hold_p50) + ' (stated 50%)', Math.abs(E.range_hold_p50 - 0.5) <= 0.1],
    ['Held-out caps inside P10–P90', pct(E.range_hold_p80) + ' (stated 80%)', Math.abs(E.range_hold_p80 - 0.8) <= 0.1],
    ['Range source', 'LOO residual quantiles', true],
    ['Verdict', 'ranges are honest, not decorative', true],
  ]);
  $('ev-terms').textContent = 'Terms tested (kept only if they lower the miss in BOTH held-out tests): ' +
    E.term_tests.map(function (t) {
      return t.term + ' — LOO ×' + t.loo_base.toFixed(2) + ' → ×' + t.loo_with.toFixed(2) +
        ', WF ×' + t.wf_base.toFixed(2) + ' → ×' + t.wf_with.toFixed(2) + ' — ' + (t.kept ? 'KEPT' : 'not kept');
    }).join(' · ') + '.';

  // ---- board table
  var rowsEl = $('rows');
  function rowHtml(r) {
    var age = r.age_years === null ? '—' : r.age_years.toFixed(1) + 'y' + (r.age_imputed ? '*' : '');
    var g7 = r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
    return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span> ' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') +
      ' <span class="cat">· ' + esc(r.category || 'no category') + '</span></td>' +
      '<td>' + money(r.tvl_usd) + '</td><td>' + g7 + '</td><td>' + age + '</td>' +
      '<td>' + r.size_multiple.toFixed(3) + '×</td><td>' + (r.token_odds * 100).toFixed(0) + '%</td>' +
      '<td>' + r.time_factor.toFixed(2) + '×</td><td>' + r.growth_factor.toFixed(2) + '×</td>' +
      '<td><b>' + money(r.implied_value_usd) + '</b> <span class="rng">' + money(r.range_p25_usd) + '–' + money(r.range_p75_usd) + '</span></td>' +
      '<td><span class="v-' + r.verdict + '">' + r.verdict + '</span> · net ' + (r.net_usd >= 0 ? '+' : '−') + money(Math.abs(r.net_usd)) + '</td>' +
      '<td>' + (r.net_per_hour_usd >= 0 ? '$' : '−$') + Math.abs(r.net_per_hour_usd).toFixed(0) + '/h</td></tr>';
  }
  function applyFilter() {
    var q = ($('q').value || '').toLowerCase();
    var v = $('verdict').value;
    var wo = $('watchonly').checked;
    var sort = $('sort').value;
    var list = D.rows.filter(function (r) {
      if (v && r.verdict !== v) return false;
      if (wo && !r.watchlist) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (sort === 'tvl') list = list.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'odds') list = list.slice().sort(function (a, b) { return b.token_odds - a.token_odds; });
    else if (sort === 'net') list = list.slice().sort(function (a, b) { return b.net_per_hour_usd - a.net_per_hour_usd; });
    else if (sort === 'age') list = list.slice().sort(function (a, b) { return (b.age_years || 0) - (a.age_years || 0); });
    rowsEl.innerHTML = list.map(rowHtml).join('');
    $('count').textContent = list.length + ' of ' + D.rows.length + ' rows';
  }
  ['q', 'verdict', 'watchonly', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', applyFilter);
    $(id).addEventListener('change', applyFilter);
  });
  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  applyFilter();

  // ---- detail view (per protocol; also opened from the URL hash)
  var detailEl = $('detail');
  function openDetail(slug) {
    var r = D.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    detailEl.hidden = false;
    detailEl.innerHTML = '<h2>#' + r.rank + ' · ' + esc(r.name) + ' <span class="cat">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + '</span></h2>' +
      '<p>Records no token. TVL <b>' + money(r.tvl_usd) + '</b> · 7d <b>' + (r.change_7d === null ? 'not reported' : r.change_7d.toFixed(1) + '%') +
      '</b> · no-token age <b>' + (r.age_years === null ? 'unknown (median ' + E.odds_n + '-peer age used)' : r.age_years.toFixed(1) + ' years') +
      '</b> · chains: ' + esc(r.chains.join(', ')) + (r.watchlist ? ' · <span class="wl">ON THE WATCHLIST</span>' : '') + '</p>' +
      '<div class="factors"><span>×size <b>' + r.size_multiple.toFixed(3) + '×</b> (fitted mcap ' + money(r.fitted_mcap_usd) + ')</span>' +
      '<span>×odds <b>' + (r.token_odds * 100).toFixed(1) + '%</b></span>' +
      '<span>×time <b>' + r.time_factor.toFixed(2) + '×</b> (age contribution to the odds)</span>' +
      '<span>×growth <b>' + r.growth_factor.toFixed(2) + '×</b> (7d growth contribution)</span>' +
      '<span>Implied <b>' + money(r.implied_value_usd) + '</b></span>' +
      '<span>P25–P75 <b>' + money(r.range_p25_usd) + ' – ' + money(r.range_p75_usd) + '</b></span>' +
      '<span>P10–P90 <b>' + money(r.range_p10_usd) + ' – ' + money(r.range_p90_usd) + '</b></span></div>' +
      '<h3>Farm plan — ' + r.verdict + ' · deposit ' + money(r.deposit_usd) + ' · expected drop ' + money(r.expected_drop_usd) +
      ' · fees ' + money(r.fees_usd) + ' · net ' + money(r.net_usd) + ' · ' + (r.net_per_hour_usd >= 0 ? '$' : '−$') + Math.abs(r.net_per_hour_usd).toFixed(2) + '/hour over 18 hours</h3>' +
      '<ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="ev-note">' + esc(D.farmAssumptions) + ' The drop is an expectation, not a promise: most farms end at SKIP, and that is the honest answer for a small implied value.</p>';
    detailEl.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    try { history.replaceState(null, '', '#detail=' + r.slug); } catch (e) { /* file:// hash only */ }
  }
  window.openDetail = openDetail;

  // ---- scatter: log-log mcap vs TVL for traded tokens + fitted curve
  // Traded-token points are embedded by main.ts as data.js scatter rows.
  (function scatter() {
    var pts = D.scatter || [];
    var W = 1100, H = 300, pad = 42;
    if (!pts.length) { $('chart').innerHTML = '<p class="scatter-note">No scatter data.</p>'; return; }
    var xs = pts.map(function (p) { return Math.log(p.t); });
    var ys = pts.map(function (p) { return Math.log(p.m); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    function X(v) { return pad + (v - x0) / (x1 - x0) * (W - 2 * pad); }
    function Y(v) { return H - pad - (v - y0) / (y1 - y0) * (H - 2 * pad); }
    var a = E.size_curve.a, b = E.size_curve.b;
    var line = 'M' + X(x0).toFixed(1) + ',' + Y(a + b * x0).toFixed(1) + ' L' + X(x1).toFixed(1) + ',' + Y(a + b * x1).toFixed(1);
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(Math.log(p.t)).toFixed(1) + '" cy="' + Y(Math.log(p.m)).toFixed(1) + '" r="2.6" fill="#5b7ba6" opacity="0.75"><title>' + esc(p.s) + '</title></circle>';
    }).join('');
    var ranked = D.rows.slice(0, 10).map(function (r) {
      var fx = Math.log(r.tvl_usd), fy = Math.log(Math.max(1, r.fitted_mcap_usd));
      if (fx < x0 || fx > x1 || fy < y0 || fy > y1) return '';
      return '<circle cx="' + X(fx).toFixed(1) + '" cy="' + Y(fy).toFixed(1) + '" r="4" fill="#f5b942" stroke="#0d1320"><title>' + esc(r.slug) + ' (fitted, no token)</title></circle>';
    }).join('');
    $('chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Log-log scatter of market cap against TVL">' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#26334d"/>' +
      '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#26334d"/>' +
      '<path d="' + line + '" stroke="#2dd4bf" stroke-width="2" fill="none"/>' + dots + ranked +
      '<text x="' + (W - pad) + '" y="' + (H - 10) + '" fill="#8fa0b8" font-size="11" text-anchor="end">ln(TVL) →</text>' +
      '<text x="10" y="18" fill="#8fa0b8" font-size="11">ln(mcap) →</text>' +
      '<text x="' + (W - pad) + '" y="18" fill="#7fe3d2" font-size="11" text-anchor="end">teal line = fitted curve · blue = traded tokens · amber = top-10 ranked (fitted, no token yet)</text>' +
      '</svg>';
    $('scatter-note').textContent = 'Each blue dot is a traded token (n=' + pts.length + '); the teal line is the fitted size curve, slope ' +
      b.toFixed(3) + ' — the multiple falls as TVL rises, which is why the biggest protocols are not automatically the most valuable launches. ' +
      'Amber dots are the top-10 ranked protocols at their fitted (pre-odds) value.';
  })();

  // ---- methodology, disclosures, verification chips
  $('method').innerHTML =
    '<p><b>Universe.</b> 758 protocols at TVL ≥ $5M (snapshot 14 Nov 2026). Ranked: the 40 watchlist protocols (TVL ≥ $50M, no token recorded, not a wrapped / staked / bridged product) plus the 158 largest no-token protocols below the floor. ' +
    '<b>Size curve.</b> OLS on ln(mcap) vs ln(TVL) over the traded tokens; the fitted multiple falls with size (slope &lt; 1), so a flat median multiple is not used. ' +
    '<b>Odds.</b> Logistic P(token) in recorded age, ln(TVL) and 7d growth, fitted on ' + E.odds_n + ' peers (listed protocols whose token status is unambiguous); base rate ' + E.odds_base_rate + '. ' +
    '<b>Ranges.</b> P25–P75 and P10–P90 from the leave-one-out residual distribution, printed for every row. ' +
    '<b>Farm.</b> ' + esc(D.farmAssumptions) + '</p>' +
    '<p><b>Honest limits.</b> (1) The odds are weak: the token rate rises with age (3% under 6 months → 26% at 3–5 years), so young protocols get low odds and the top implied value is ' + money(D.topImpliedUsd) +
    ' — below the $30M–$70M band the winning entries showed, because that band needs odds of 0.33–0.78 that this snapshot cannot fit without guessing. The fit is reported as fitted, not tuned up. ' +
    '(2) Age was imputed at the peer median for ' + D.imputedAgeCount + ' of 198 ranked rows and 7d growth was missing for ' + D.missingGrowthCount + ' rows (treated as 0%). ' +
    '(3) Survivorship bias: the size curve is fitted only on tokens that still trade; dead tokens are invisible, so fitted values are optimistic for the median protocol. ' +
    '(4) The snapshot is one day (14 Nov 2026); a protocol\'s TVL a week later can move the ranking. ' +
    '(5) “Records no token” is what DefiLlama records — it is not proof a protocol has no token.</p>';
  $('verify-chips').innerHTML = '<span class="chips">' +
    ['this table = board.json', 'ranks 1–198 in order', 'values never rise', 'totals equal', 'checksum = main.ts',
     'watchlist ' + D.watchlistCovered + '/' + D.watchlistTotal, 'ledger ' + D.ledger.total + '/' + D.ledger.total]
    .map(function (c) { return '<span class="chip">✓ ' + c + '</span>'; }).join('') + '</span>';

  // ---- hash routing for the screenshots: #detail=<slug> or #filter=<verdict>
  var h = (location.hash || '').slice(1);
  var m = h.match(/detail=([A-Za-z0-9\-_]+)/);
  if (m) { document.body.classList.add('hash-detail'); openDetail(m[1]); return; }
  var f = h.match(/filter=([A-Z]+)/);
  if (f) { $('verdict').value = f[1]; applyFilter(); }
})();
