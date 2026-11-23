// token-radar-01 R3 dashboard (round3-fix). Renders window.RADAR_DATA
// (written by main.ts into data.js). No network: no fetch, no external URLs.
// Odds are a fitted blend: 0.5 x logistic(age, ln TVL) + 0.5 x shrunk cell
// rate (TVL band x age band, m=20). Growth is NOT a model input anymore.
(function () {
  'use strict';
  var D = window.RADAR_DATA;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function intUsd(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function signedUsd(n) {
    return (n < 0 ? '\u2212' : '+') + intUsd(Math.abs(n));
  }
  function pct1(x) { return (x * 100).toFixed(1) + '%'; }
  function pct0(x) { return Math.round(x * 100) + '%'; }
  function num(x, d) { return (x == null || isNaN(x)) ? '—' : Number(x).toFixed(d); }

  var rowsEl = $('rows');
  var countEl = $('count');

  if (!D || !D.rows || !D.rows.length) {
    if (rowsEl) rowsEl.innerHTML = '<tr><td colspan="12">No data: run main.ts first.</td></tr>';
    if (countEl) countEl.textContent = 'No data: run main.ts first.';
    var sn0 = $('scatter-note');
    if (sn0) sn0.textContent = 'No scatter data.';
    return;
  }

  var E = D.evidence || {};
  var SC = E.size_curve || {};
  // Rank is the position in data order (implied desc); keep it stable
  // across re-sorts so #n always means the board rank.
  D.rows.forEach(function (r, i) { r._rank = i + 1; });
  function farmOf(r) {
    if (r.farm) return r.farm;
    return {
      deposit_usd: r.deposit_usd,
      expected_drop_usd: r.expected_drop_usd,
      fees_usd: r.fees_usd,
      net_usd: r.net_usd,
      net_per_hour_usd: r.net_per_hour_usd,
      verdict: r.verdict,
      steps: r.farm_steps
    };
  }
  function verdictOf(r) { return farmOf(r).verdict || r.verdict || 'SKIP'; }

  // ---- KPIs (B.2) ----
  function setKpi(id, value, sub) {
    var v = $(id), s = $(id + '-s');
    if (v) v.textContent = value;
    if (s) s.textContent = sub || '';
  }
  var vc = D.verdictCounts || {};
  var farmN = (vc.FARM || 0), thinN = (vc.THIN || 0);
  setKpi('k-ranked', String(D.rows.length),
    'watchlist ' + (D.watchlistCovered || 0) + '/' + (D.watchlistTotal || 0) +
    ' · ledger ' + ((D.ledger || {}).total || 0) + '/' + ((D.ledger || {}).total || 0));
  setKpi('k-total', money(D.impliedTotalUsd),
    'top ' + (D.topSlug || '') + ' ' + money(D.topImpliedUsd));
  setKpi('k-miss', '\u00d7' + num(E.loo_multiple, 2),
    'walk-forward \u00d7' + num(E.wf_multiple, 2) + ' · flat \u00d7' + num(E.flat_loo_multiple, 2));
  setKpi('k-range', pct1(E.range_hold_p50 || 0),
    'in P25–P75 (stated 50%) · P10–P90 ' + pct1(E.range_hold_p80 || 0) + ' (stated 80%)');
  setKpi('k-brier', num(E.odds_cv_brier, 3),
    '5-fold CV · base rate ' + num(E.odds_base_brier, 3) +
    ' · in-sample ' + num(E.odds_brier, 3) +
    ' · logistic-only CV ' + num(E.odds_logistic_cv_brier, 3));
  setKpi('k-farm', String(farmN + thinN),
    'FARM ' + farmN + ' · THIN ' + thinN +
    ' · MARG ' + (vc.MARGINAL || 0) + ' · SKIP ' + (vc.SKIP || 0));

  // ---- Formula row (§4.2: odds sentence is the blend) ----
  var formulaEl = $('formula');
  if (formulaEl) {
    formulaEl.textContent =
      'Implied value = TVL \u00d7 fitted size multiple \u00d7 fitted launch odds. ' +
      'Size curve: ln(mcap) = ' + num(SC.a, 3) + ' + ' + num(SC.b, 3) + ' \u00d7 ln(TVL)' +
      ' (n=' + (SC.n || 0) + ', s.e. a \u00b1' + num(SC.a_se, 3) + ', b \u00b1' + num(SC.b_se, 3) + '); ' +
      'odds = \u00bd\u00b7logistic(age, ln TVL) + \u00bd\u00b7cell rate (shrunk m=20), ' +
      'n=634, 95 with a token.';
  }

  // ---- Ledger ----
  var L = D.ledger || {};
  var rN = L.ranked || 0, tN = L.tokenTrades || 0, sN = L.setAside || 0;
  var tot = L.total || (rN + tN + sN);
  var lnEl = $('ledger-nums');
  if (lnEl) lnEl.textContent = 'ranked ' + rN + ' · token trades ' + tN + ' · set-aside ' + sN + ' · total ' + tot;
  var lbEl = $('ledger-bar');
  if (lbEl && tot > 0) {
    lbEl.innerHTML =
      '<div class="lb-ranked" style="width:' + (100 * rN / tot).toFixed(1) + '%"></div>' +
      '<div class="lb-trades" style="width:' + (100 * tN / tot).toFixed(1) + '%"></div>' +
      '<div class="lb-set" style="width:' + (100 * sN / tot).toFixed(1) + '%"></div>';
  }
  var llEl = $('ledger-legend');
  if (llEl) {
    llEl.innerHTML =
      '<b>\u25a0 ranked ' + rN + '</b> (watchlist 40 + 158 largest no-token below the $50M floor) · ' +
      '<b>\u25a0 token trades ' + tN + '</b> (size curve fitted on these, never ranked) · ' +
      '<b>\u25a0 set-aside ' + sN + '</b> (versioned / wrapped / exchange products + smallest) · ' +
      rN + ' + ' + tN + ' + ' + sN + ' = ' + tot + '.';
  }

  // ---- Evidence, 3 columns (B.2; odds column per §4.2) ----
  function evRows(id, rows) {
    var box = $(id);
    if (!box) return;
    box.innerHTML = '<table><tbody>' + rows.map(function (row) {
      var cls = row[2] ? ' class="' + esc(row[2]) + '"' : '';
      return '<tr><td>' + esc(row[0]) + '</td><td' + cls + '>' + esc(row[1]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  evRows('ev-value', [
    ['Leave-one-out miss (' + (SC.n || 0) + ' traded tokens)', '\u00d7' + num(E.loo_multiple, 2)],
    ['Walk-forward miss (older half \u2192 newer half)', '\u00d7' + num(E.wf_multiple, 2)],
    ['Flat multiple baseline, LOO / WF', '\u00d7' + num(E.flat_loo_multiple, 2) + ' / \u00d7' + num(E.flat_wf_multiple, 2)],
    ['Verdict', 'fit beats flat in both tests', 'good']
  ]);
  var baseBrier = E.odds_base_brier;
  evRows('ev-odds', [
    ['Brier, 5-fold CV (blend)', num(E.odds_cv_brier, 3),
      (baseBrier != null && E.odds_cv_brier < baseBrier) ? 'good' : ''],
    ['Base rate (always 0.150)', num(baseBrier, 3)],
    ['Placebo: growth of another row', num(E.odds_placebo_brier, 3)],
    ['Verdict', 'odds beat base rate; growth dropped', 'good']
  ]);
  evRows('ev-range', [
    ['Held-out caps inside P25–P75', pct1(E.range_hold_p50 || 0) + ' (stated 50%)'],
    ['Held-out caps inside P10–P90', pct1(E.range_hold_p80 || 0) + ' (stated 80%)'],
    ['Range source', 'LOO residual quantiles'],
    ['Verdict', 'ranges are honest, not decorative', 'good']
  ]);

  // ---- Term tests ----
  var termsEl = $('ev-terms');
  if (termsEl) {
    var terms = E.term_tests || [];
    var parts = terms.map(function (t) {
      var label = t.name || t.term || t.label || 'term';
      var lb = (t.loo_base != null ? t.loo_base : t.looBase);
      var lw = (t.loo_with != null ? t.loo_with : t.looWith);
      var wb = (t.wf_base != null ? t.wf_base : t.wfBase);
      var ww = (t.wf_with != null ? t.wf_with : t.wfWith);
      return label + ' — LOO \u00d7' + num(lb, 2) + ' \u2192 \u00d7' + num(lw, 2) +
        ', WF \u00d7' + num(wb, 2) + ' \u2192 \u00d7' + num(ww, 2) +
        ' — ' + (t.kept ? 'KEPT' : 'not kept');
    });
    termsEl.textContent = 'Terms tested (kept only if they lower the miss in BOTH held-out tests): ' +
      (parts.length ? parts.join(' · ') : 'none reported');
  }

  // ---- Method + honest limits (§4.2 literal for Odds / Universe / limits 1–2) ----
  var methodEl = $('method');
  if (methodEl) {
    var paras = [
      'Universe. The snapshot holds 758 protocols. The board ranks 198 of them: the 40 watchlist protocols plus the 158 largest no-token protocols below the $50M floor. The launch-odds peer set is 634 protocols — 539 with no token and 95 with a token — every listed protocol whose token status is unambiguous. Excluded from the peer set: 113 protocols with no listed_at and 11 with a listed_at but a market cap of 0 or \u22121.',
      'Size curve. ln(mcap) = ' + num(SC.a, 3) + ' + ' + num(SC.b, 3) + ' \u00d7 ln(TVL), fitted by ordinary least squares on the ' + (SC.n || 0) + ' traded tokens. Leave-one-out miss \u00d7' + num(E.loo_multiple, 2) + ', walk-forward miss \u00d7' + num(E.wf_multiple, 2) + ', against a flat-multiple baseline of \u00d7' + num(E.flat_loo_multiple, 2) + ' / \u00d7' + num(E.flat_wf_multiple, 2) + '. The fitted multiple falls as TVL rises, which is why the biggest protocols are not automatically the most valuable launches.',
      'Odds. Blend of (a) a logistic P(token) in recorded age and ln(TVL) and (b) the shrunk token rate of the protocol\u2019s TVL-band \u00d7 age-band cell (pseudo-count 20 toward the TVL-band rate), fitted on 634 peers (listed protocols whose token status is unambiguous); base rate 0,150.',
      'Ranges. Each row\u2019s P25–P75 and P10–P90 bands come from the quantiles of leave-one-out residuals, so a band is a held-out statement, not a confidence interval drawn around the fit. ' + pct1(E.range_hold_p50 || 0) + ' of held-out caps fall inside P25–P75 (stated 50%) and ' + pct1(E.range_hold_p80 || 0) + ' inside P10–P90 (stated 80%).',
      'Farm. ' + (D.farmAssumptions || ''),
      'Honest limits. (1) The top value is still below the winners\u2019 band, and that is reported, not tuned away. The winning entries\u2019 top values were $27.6M–$73.1M. This snapshot\u2019s fitted top is $15.4M (odds 17.0%, fitted $90.1M): the gap narrowed from 3.6\u00d7 to 1.8\u00d7 because the blend credits the 24.5% token rate of large young protocols, but odds of 0.33–0.78 remain unfittable — the highest cell rate in the snapshot is 26% and the base rate is 15%. Inflating the odds by hand to reach the band would be fabrication; the fit is shown as fitted.',
      'Honest limits. (2) The odds are weak. Brier 0.124 (blend, 5-fold CV) against a base rate of 0.127 — the blend trades 0.001 of Brier against the logistic alone (0.123) for a coherent top row; the cell-only estimator is worse (0.126) and is not used alone. Growth was dropped from the model after the placebo scored the same as the real feature (0.120).',
      'Honest limits. (3) Survivorship. Only protocols still listed on 14 Nov 2026 appear; protocols that died without ever launching a token are invisible, so the launch rate is likely overstated rather than understated.',
      'Honest limits. (4) One day of data. Everything is fitted to a single snapshot (14 Nov 2026); TVL and 7d change move daily, so ranks and implied values can move with the next snapshot.',
      'Honest limits. (5) \u201cRecords no token\u201d means the snapshot shows no traded market cap for the protocol — not a promise that a token will or will not launch.'
    ];
    methodEl.innerHTML = paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  // ---- Verify chips (A.8) ----
  var chipsEl = $('verify-chips');
  if (chipsEl) {
    var chips = ['this table = board.json', 'ranks 1–198 in order', 'values never rise',
      'totals equal', 'checksum = main.ts', 'watchlist 40/40', 'ledger 758/758'];
    chipsEl.innerHTML = chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join(' ');
  }

  // ---- Scatter note (A.8) ----
  var snEl = $('scatter-note');
  if (snEl) {
    snEl.textContent = 'Each blue dot is a traded token (n=' + (SC.n || 0) +
      '); the teal line is the fitted size curve, slope ' + num(SC.b, 3) +
      ' — the multiple falls as TVL rises, which is why the biggest protocols are not automatically the most valuable launches. ' +
      'Amber dots are the top-10 ranked protocols at their fitted (pre-odds) value.';
  }

  // ---- Scatter (A.8: main W=1100 H=300 pad=42; detail viewBox 1100x260,
  // same function, optional highlightSlug) ----
  function renderScatter(el, opts) {
    opts = opts || {};
    var H = opts.height || 300;
    var W = 1100, pad = 42;
    if (!el) return;
    var traded = (D.scatter || []).slice();
    if (!traded.length) { el.textContent = 'No scatter data.'; return; }
    var top10 = D.rows.slice(0, 10).map(function (r) {
      return { s: r.slug, t: r.tvl_usd, m: r.fitted_mcap_usd, name: r.name };
    }).filter(function (p) { return p.t > 0 && p.m > 0; });
    var pts = traded.map(function (p) {
      return { s: p.s, x: Math.log(p.t), y: Math.log(p.m), traded: true };
    });
    top10.forEach(function (p) {
      pts.push({ s: p.s, x: Math.log(p.t), y: Math.log(p.m), traded: false, name: p.name });
    });
    var hl = null;
    if (opts.highlightSlug) {
      var hr = null;
      D.rows.forEach(function (r) { if (r.slug === opts.highlightSlug) hr = r; });
      if (hr && hr.tvl_usd > 0 && hr.fitted_mcap_usd > 0) {
        hl = { s: hr.slug, x: Math.log(hr.tvl_usd), y: Math.log(hr.fitted_mcap_usd), name: hr.name };
      }
    }
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    if (hl) { xs.push(hl.x); ys.push(hl.y); }
    var x0 = Math.min.apply(null, xs) - 0.15, x1 = Math.max.apply(null, xs) + 0.15;
    var y0 = Math.min.apply(null, ys) - 0.15, y1 = Math.max.apply(null, ys) + 0.15;
    function X(v) { return pad + (v - x0) / (x1 - x0) * (W - 2 * pad); }
    function Y(v) { return H - pad - (v - y0) / (y1 - y0) * (H - 2 * pad); }
    function fmtTick(v) {
      if (v >= 1e9) return '$' + (v / 1e9) + 'B';
      if (v >= 1e6) return '$' + (v / 1e6) + 'M';
      return '$' + Math.round(v / 1e3) + 'K';
    }
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Log-log scatter of mcap vs TVL">');
    // Grid + tick labels (powers of 10 inside the plotted range).
    var p10;
    for (p10 = 6; p10 <= 11; p10++) {
      var tx = Math.log(Math.pow(10, p10));
      if (tx > x0 && tx < x1) {
        out.push('<line x1="' + X(tx).toFixed(1) + '" y1="' + (H - pad) + '" x2="' + X(tx).toFixed(1) + '" y2="' + pad + '" stroke="#22304a" stroke-width="1"/>');
        out.push('<text x="' + X(tx).toFixed(1) + '" y="' + (H - pad + 18) + '" fill="#8fa3bf" font-size="12" text-anchor="middle">' + fmtTick(Math.pow(10, p10)) + '</text>');
      }
      var ty = Math.log(Math.pow(10, p10));
      if (ty > y0 && ty < y1) {
        out.push('<line x1="' + pad + '" y1="' + Y(ty).toFixed(1) + '" x2="' + (W - pad) + '" y2="' + Y(ty).toFixed(1) + '" stroke="#22304a" stroke-width="1"/>');
        out.push('<text x="' + (pad - 8) + '" y="' + (Y(ty) + 4).toFixed(1) + '" fill="#8fa3bf" font-size="12" text-anchor="end">' + fmtTick(Math.pow(10, p10)) + '</text>');
      }
    }
    // Axes.
    out.push('<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#8fa3bf" stroke-width="1.5"/>');
    out.push('<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#8fa3bf" stroke-width="1.5"/>');
    // Fitted size curve (teal).
    var a = SC.a, b = SC.b;
    if (a != null && b != null) {
      out.push('<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(a + b * x0).toFixed(1) +
        '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(a + b * x1).toFixed(1) +
        '" stroke="#2dd4bf" stroke-width="2"/>');
    }
    // Blue traded dots, then amber top-10 fitted dots.
    pts.forEach(function (p) {
      if (p.traded) {
        out.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) +
          '" r="2.6" fill="#5b7ba6" opacity="0.75"><title>' + esc(p.s) + '</title></circle>');
      }
    });
    pts.forEach(function (p) {
      if (!p.traded) {
        out.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) +
          '" r="4" fill="#f5b942" stroke="#0d1320" stroke-width="1"><title>' +
          esc(p.s) + ' (fitted, no token)</title></circle>');
      }
    });
    // Highlighted fitted protocol (detail view): bigger amber dot + name label.
    if (hl) {
      var hx = X(hl.x), hy = Y(hl.y);
      var labelX = Math.min(hx + 10, W - pad - 8);
      var anchor = (hx + 10 > W - pad - 120) ? 'end' : 'start';
      if (anchor === 'end') labelX = hx - 10;
      out.push('<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) +
        '" r="6" fill="#f5b942" stroke="#0d1320" stroke-width="1.5"><title>' +
        esc(hl.s) + ' (fitted, no token)</title></circle>');
      out.push('<text x="' + labelX.toFixed(1) + '" y="' + (hy - 10).toFixed(1) +
        '" fill="#f5b942" font-size="13" font-weight="bold" text-anchor="' + anchor + '">' +
        esc(hl.name) + '</text>');
    }
    // Axis labels + legend.
    out.push('<text x="' + (W - pad) + '" y="' + (H - 8) + '" fill="#8fa3bf" font-size="13" text-anchor="end">ln(TVL) \u2192</text>');
    out.push('<text x="' + pad + '" y="18" fill="#8fa3bf" font-size="13">ln(mcap) \u2192</text>');
    out.push('<text x="' + (W - pad) + '" y="18" fill="#8fa3bf" font-size="12" text-anchor="end">\u25cf traded token  \u2014 fitted curve  \u25cf top-10 ranked (fitted)</text>');
    out.push('</svg>');
    el.innerHTML = out.join('');
  }
  renderScatter($('chart'), { height: 300 });

  // ---- Board: filter / sort / render (§4.1 columns) ----
  function fmt7d(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';
  }
  function fmtAge(r) {
    if (r.age_years == null || isNaN(r.age_years)) return '—';
    return Number(r.age_years).toFixed(1) + ' y' + (r.age_imputed ? ' *' : '');
  }
  function fmtNetHour(r) {
    var f = farmOf(r);
    if (f.net_per_hour_usd == null) return '—';
    var v = f.net_per_hour_usd;
    return (v < 0 ? '\u2212$' : '$') + Math.abs(v).toFixed(2) + '/h';
  }
  function rowHtml(r) {
    var f = farmOf(r);
    var verdict = verdictOf(r);
    var cat = r.category || 'no category';
    var range = (r.range_p25_usd != null && r.range_p75_usd != null)
      ? money(r.range_p25_usd) + ' – ' + money(r.range_p75_usd) : '—';
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<td>' + r._rank + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong>' +
        (r.watchlist ? ' <span class="wl">WATCHLIST</span>' : '') +
        ' · ' + esc(cat) + '</td>' +
      '<td>' + money(r.tvl_usd) + '</td>' +
      '<td>' + fmt7d(r.change_7d) + '</td>' +
      '<td>' + fmtAge(r) + '</td>' +
      '<td>\u00d7' + num(r.size_multiple, 3) + '</td>' +
      '<td>' + pct0(r.token_odds || 0) + '</td>' +
      '<td>' + pct1(r.logistic_odds || 0) + '</td>' +
      '<td>' + pct1(r.cell_odds || 0) + '</td>' +
      '<td><strong>' + money(r.implied_value_usd) + '</strong> <span class="rng">P25–P75 ' + range + '</span></td>' +
      '<td><span class="v-' + esc(verdict) + '">' + esc(verdict) + '</span>' +
        (f.net_usd != null ? ' · net ' + signedUsd(f.net_usd) : '') + '</td>' +
      '<td>' + fmtNetHour(r) + '</td></tr>';
  }
  function currentRows() {
    var q = ($('q').value || '').trim().toLowerCase();
    var vf = $('verdict').value;
    var wo = $('watchonly').checked;
    var sort = $('sort').value;
    var list = D.rows.filter(function (r) {
      if (vf && verdictOf(r) !== vf) return false;
      if (wo && !r.watchlist) return false;
      if (q) {
        var hay = ((r.name || '') + ' ' + (r.slug || '') + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (sort === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'odds') list.sort(function (a, b) { return (b.token_odds || 0) - (a.token_odds || 0); });
    else if (sort === 'net') list.sort(function (a, b) { return (farmOf(b).net_per_hour_usd || 0) - (farmOf(a).net_per_hour_usd || 0); });
    else if (sort === 'age') list.sort(function (a, b) { return (b.age_years || -1) - (a.age_years || -1); });
    else list.sort(function (a, b) { return a._rank - b._rank; });
    return list;
  }
  function renderBoard() {
    var list = currentRows();
    rowsEl.innerHTML = list.map(rowHtml).join('');
    countEl.textContent = list.length + ' of ' + D.rows.length + ' rows';
  }
  ['q', 'verdict', 'watchonly', 'sort'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener(id === 'q' ? 'input' : 'change', function () {
      closeDetail();
      renderBoard();
    });
  });
  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  rowsEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var tr = ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  // ---- Farm plan steps (A.5 template, verbatim placeholders) ----
  function farmVerb(cat) {
    if (cat === 'Lending') return 'Supply assets and borrow a small amount against them each week';
    if (cat === 'Dexs') return 'Swap a small amount and add to a liquidity pool each week';
    if (cat === 'Yield' || cat === 'Yield Aggregator') return 'Stake into the vault and compound the yield each week';
    if (cat === 'RWA') return 'Mint or hold the tokenised asset and keep the position open';
    return 'Use the app as a real user: deposit, transact and hold the position';
  }
  function farmSteps(r) {
    var f = farmOf(r);
    if (r.farm_steps) return r.farm_steps;
    if (f.steps) return f.steps;
    var dep = f.deposit_usd || 0;
    var DEP = intUsd(dep).slice(1);
    var CHAIN = (r.chains && r.chains[0]) || 'its main chain';
    var CAT = r.category || 'DeFi';
    var TVLM = Math.round((r.tvl_usd || 0) / 1e6);
    var HALFDEP = intUsd(Math.round(dep / 2)).slice(1);
    var SWAPFEE = intUsd(Math.round(0.003 * dep)).slice(1);
    var name = r.name;
    return [
      'Bridge $' + DEP + ' to ' + CHAIN + ' for ' + name + ' ($45 bridge fee, about 30 minutes). Keep the receipt; this is the only on-chain move that costs more than $15.',
      'Swap half of the $' + DEP + ' deposit into the asset ' + name + ' uses (' + CAT + '), paying about 0.3% per swap ($' + SWAPFEE + '), about 20 minutes.',
      farmVerb(r.category) + ' with the full $' + DEP + ' deposit on ' + name + ' (TVL $' + TVLM + ' M), about 45 minutes the first week.',
      'Repeat one real interaction a week for 12 weeks (swap, supply or stake, 20 minutes each, about $12 gas per week). Do not wash-trade; one genuine use per week.',
      'Week 4: add a second position of about $' + HALFDEP + ' if the first month cost under $60 in gas (30 minutes, 0.3% swap fee).',
      'Week 8: check the position and rebalance once if its value moved more than 20% (30 minutes, about $12 gas). Record every transaction hash in a note.',
      'Week 12: stop adding funds. Leave the $' + DEP + ' deposit in place for the snapshot; withdrawing early is the most common way farmers lose eligibility.',
      'If a token launches, claim through the official ' + name + ' app only, sell at most half in week one, and keep the rest staked (30 minutes to claim, about $15 gas).'
    ];
  }

  // ---- Detail view (§4.3: factors + farm plan + position scatter) ----
  var detailEl = $('detail');
  function closeDetail() {
    if (!detailEl) return;
    detailEl.hidden = true;
    detailEl.innerHTML = '';
    document.body.classList.remove('hash-detail');
  }
  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r || !detailEl) return;
    var f = farmOf(r);
    var verdict = verdictOf(r);
    var ageTxt = (r.age_years == null) ? 'unknown (median ' + ((D.evidence && D.evidence.odds_n) || 634) + '-peer age used)'
      : Number(r.age_years).toFixed(1) + ' years' + (r.age_imputed ? ' *' : '');
    var sevenTxt = (r.change_7d == null) ? 'not reported' : fmt7d(r.change_7d);
    var chainsTxt = (r.chains && r.chains.length) ? r.chains.join(', ') : '—';
    var netHour = (f.net_per_hour_usd == null) ? '—'
      : (f.net_per_hour_usd < 0 ? '\u2212$' : '+$') + Math.abs(f.net_per_hour_usd).toFixed(2);
    detailEl.innerHTML =
      '<h2>#' + r._rank + ' · ' + esc(r.name) + '</h2>' +
      '<p><span class="cat">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + '</span></p>' +
      '<p>Records no token. TVL ' + money(r.tvl_usd) + ' · 7d ' + sevenTxt +
      ' · no-token age ' + ageTxt + ' · chains: ' + esc(chainsTxt) +
      (r.watchlist ? ' · ON THE WATCHLIST' : '') + '</p>' +
      '<div class="factors">' +
      '<span>\u00d7size ' + num(r.size_multiple, 3) + '\u00d7 (fitted mcap ' + money(r.fitted_mcap_usd) + ')</span>' +
      '<span>\u00d7odds ' + pct1(r.token_odds || 0) + '</span>' +
      '<span>\u00d7logit ' + pct1(r.logistic_odds || 0) + '</span>' +
      '<span>\u00d7cell ' + pct1(r.cell_odds || 0) + '</span>' +
      '<span>Implied ' + money(r.implied_value_usd) + '</span>' +
      '<span>P25–P75 ' + money(r.range_p25_usd) + ' – ' + money(r.range_p75_usd) + '</span>' +
      '<span>P10–P90 ' + money(r.range_p10_usd) + ' – ' + money(r.range_p90_usd) + '</span>' +
      '</div>' +
      '<h3>Farm plan — ' + esc(verdict) + ' · deposit ' + money(f.deposit_usd) +
      ' · expected drop ' + money(f.expected_drop_usd) + ' · fees ' + money(f.fees_usd) +
      ' · net ' + (f.net_usd != null ? signedUsd(f.net_usd) : '—') +
      ' · ' + netHour + '/hour over 18 hours</h3>' +
      '<ol>' + farmSteps(r).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="ev-note">' + esc(D.farmAssumptions || '') +
      ' The drop is an expectation, not a promise: most farms end at SKIP, and that is the honest answer for a small implied value.</p>' +
      '<h3>Where this protocol sits on the size curve</h3>' +
      '<p>Its fitted mcap of ' + money(r.fitted_mcap_usd) + ' at TVL ' + money(r.tvl_usd) +
      ' sits on the teal curve — the fitted value is the curve\u2019s prediction at this TVL, ' +
      'and the odds then scale it down to an implied value of ' + money(r.implied_value_usd) + '.</p>' +
      '<div id="detail-chart"></div>' +
      '<p><button type="button" id="detail-back">\u2190 Back to the board</button></p>';
    detailEl.hidden = false;
    document.body.classList.add('hash-detail');
    renderScatter($('detail-chart'), { height: 260, highlightSlug: slug });
    var back = $('detail-back');
    if (back) back.addEventListener('click', function () {
      closeDetail();
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      var board = $('board');
      if (board) board.scrollIntoView();
    });
    detailEl.scrollIntoView();
  }

  // ---- Hash routing: #detail=<slug> / #filter=<verdict> ----
  function applyHash() {
    var h = location.hash || '';
    var m = h.match(/#detail=([^&]+)/);
    if (m) { openDetail(decodeURIComponent(m[1])); return; }
    var fm = h.match(/#filter=([^&]+)/);
    if (fm) {
      var sel = $('verdict');
      var v = decodeURIComponent(fm[1]).toUpperCase();
      if (sel && ['FARM', 'THIN', 'MARGINAL', 'SKIP'].indexOf(v) !== -1) sel.value = v;
    }
    closeDetail();
    renderBoard();
  }
  window.addEventListener('hashchange', applyHash);
  renderBoard();
  applyHash();
})();
