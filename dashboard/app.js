// Token Radar's dashboard (model radar-4). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the live comps the multiples are calibrated from, the
// screened-out records with their reasons, and a per-protocol detail drawer. No network: every
// byte it shows is in data.js.
//
// How a farm plan is built (lib/model.ts farmSteps, the strings in data.js are its output, the
// same strings board.json carries): seven steps per protocol. Step 1 sets up the wallet its first
// chain needs. Step 2 is the category's own action (supply and borrow for lending, liquidity for a
// DEX, a vault deposit for a curator, a bridge crossing for a bridge, stake-and-hold for staking),
// sized by the protocol's TVL tier ($250 at $5B+, $150 at $1B+, $100 at $100M+, else $50), with the
// chain's ordinary gas range. Step 3 repeats smaller on a second chain or splits the deposit.
// Step 4 is the category's weekly habit. Step 5 holds 30 to 60 days by the protocol's age. Steps 6
// and 7 are the announcements check and the claim-and-log exit. Every step states its cost and time,
// and the plan's totals (capital, gas across its six transactions, setup, upkeep, hold) are computed
// from the same inputs in lib/model.ts planTotals and shown as chips above the plan table.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var params = new URLSearchParams(location.search);
  var state = {
    view: params.get('view') || 'board',
    q: '',
    stage: params.get('stage') || 'all',
    category: params.get('category') || 'all',
    chain: 'all',
    conf: 'all',
    sort: 'rank',
    dir: 1,
    selected: null,
  };
  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
  var maxAbsChange = 30;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsdFull(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : usd.format(Math.round(n)); }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(3) + 'x'; }
  function fmtPct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 2 : digits) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtGas(n) {
    if (!isFinite(n)) return 'n/a';
    return n < 1 ? '$' + n.toFixed(2) : '$' + Math.round(n);
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The multiple is the row's own shrunk multiple from data.js; growth and the log maturity curve are
  // recomputed here from the row's figures, exactly as lib/model.ts does it.
  function factorsOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_used_days === null || row.age_used_days === undefined ? DATA.median_age_days : row.age_used_days;
    var maturity = model.maturity_floor + (Math.log1p(Math.min(Math.max(age, 0), model.maturity_days * 4)) / Math.log1p(model.maturity_days)) * model.maturity_range;
    return { growth: growth, growthMult: growthMult, ageUsed: age, maturity: maturity };
  }
  function impliedOf(row, model) {
    var f = factorsOf(row, model);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * f.growthMult * f.maturity));
  }
  // A farm step string is "action Cost: c. Time: t." — split it back for the drawer's layout.
  function parseStep(s) {
    var ci = s.indexOf(' Cost: ');
    if (ci < 0) return { text: s, cost: '', time: '' };
    var rest = s.slice(ci + 7);
    var ti = rest.indexOf('. Time: ');
    if (ti < 0) return { text: s.slice(0, ci), cost: rest.replace(/\.$/, ''), time: '' };
    return { text: s.slice(0, ci), cost: rest.slice(0, ti), time: rest.slice(ti + 8).replace(/\.$/, '') };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function $(id) { return document.getElementById(id); }

  /* ---------- header, KPIs, model strip, worked example, alerts ---------- */
  function renderTop() {
    $('ver').textContent = 'model ' + DATA.model_version;
    $('top-meta').innerHTML = 'snapshot <b>' + DATA.as_of + '</b> &nbsp;·&nbsp; ' + DATA.stats.protocols_total +
      ' protocols &nbsp;·&nbsp; sealed, no network';
    var s = DATA.stats;
    var kpis = [
      { label: 'Pre-token ranked', value: String(s.pre_token_total - s.screened_total), sub: 'of ' + s.pre_token_total + ' that record no token', hot: true },
      { label: 'Watchlist covered', value: s.watchlist_covered + ' / ' + s.watchlist_total, sub: 'the floor, fully covered', hot: true },
      { label: 'Aggregate implied', value: fmtUsd(s.aggregate_implied_usd), sub: 'on ' + fmtUsd(s.aggregate_tvl_usd) + ' of TVL' },
      { label: 'Live comps', value: String(s.live_total), sub: 'protocols already trade' },
      { label: 'Median multiple', value: fmtMult(s.median_multiple), sub: 'mcap / TVL, all live comps' },
      { label: 'Screened out', value: String(s.screened_total), sub: 'listed with reasons, not ranked' },
    ];
    $('kpis').replaceChildren.apply($('kpis'), kpis.map(function (k) {
      return el('div', { 'class': 'kpi' + (k.hot ? ' hot' : '') },
        el('div', { 'class': 'k-label', text: k.label }),
        el('div', { 'class': 'k-value', text: k.value }),
        el('div', { 'class': 'k-sub', text: k.sub }));
    }));
    var m = DATA.model;
    $('modelstrip').replaceChildren(
      el('div', { 'class': 'formula', html: 'implied = TVL &times; <b>shrunk multiple</b> &times; growth &times; maturity' }),
      el('div', {
        'class': 'explain',
        text: 'The multiple is the median market cap / TVL of the live-token protocols in the same category, shrunk toward the overall median by sample size (weight ' + m.shrink_k +
          '; a category with under ' + m.min_comps + ' live comps falls back to the overall median and is badged low confidence), bounded only to ' +
          m.multiple_floor + 'x–' + m.multiple_cap.toFixed(2) + 'x. Growth is the seven-day TVL change, clamped ' + m.growth_floor + '% to +' + m.growth_cap + '%, weighted ' + m.growth_weight +
          '. Maturity is a log curve over the tokenless age (' + m.maturity_floor + ' to ' + (m.maturity_floor + m.maturity_range) +
          ' over ' + (m.maturity_days / 365) + ' years; age unknown uses the board median of ' + DATA.median_age_days + ' days). No name is special-cased.',
      }));
    var top = DATA.rows[0];
    if (top) {
      var f = factorsOf(top, m);
      $('worked').replaceChildren(
        el('span', { 'class': 'w-label', text: 'Worked example — rank 1, ' + top.name + ':' }),
        el('span', {
          'class': 'w-math',
          html: fmtUsdFull(top.tvl_usd) + ' TVL &times; ' + top.category_multiple.toFixed(3) + 'x multiple &times; ' +
            f.growthMult.toFixed(3) + ' growth &times; ' + f.maturity.toFixed(3) + ' maturity = <b>' + fmtUsdFull(top.implied_value_usd) + '</b>',
        }),
        el('span', { 'class': 'w-note', text: 'Every row shows the same arithmetic in its detail view, and this page recomputes it from the figures above.' }));
    }
    $('audit-note').textContent = 'Of the snapshot\'s ' + s.protocols_total + ' protocols: ' + s.live_total +
      ' already trade and calibrate the multiples; ' + s.pre_token_total + ' record no token; the board ranks ' +
      (s.pre_token_total - s.screened_total) + ' of them and screens ' + s.screened_total + ' out.';
    $('coverage-note').textContent = 'Coverage is checked, not claimed: main.ts refuses to write a board unless all ' +
      s.watchlist_total + ' watchlist slugs are present, ranks run 1 to ' + (s.pre_token_total - s.screened_total) +
      ' with implied values never rising, and every row carries 3 to 12 farm steps. ' + s.shrunk_categories +
      ' categories price off their own shrunk median; ' + s.fallback_rows + ' rows fall back to the overall median.';
  }

  function alertList(title, items, fmt) {
    return el('div', { 'class': 'alert' },
      el('h3', { text: title }),
      el('ul', null, items.map(function (a) {
        return el('li', null,
          el('button', { text: a.name, onclick: function () { var r = bySlug[a.slug]; if (r) openDetail(r); } }),
          el('span', { 'class': 'a-val', html: fmt(a) }));
      })));
  }
  function renderAlerts() {
    var a = DATA.alerts;
    $('alerts').replaceChildren(
      alertList('Momentum — 7d TVL growth, $25M+ TVL', a.movers.slice(0, 4), function (x) {
        return '<span class="' + (x.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(x.change_7d, 1) + '</span>';
      }),
      alertList('Highest implied x TVL, $25M+ TVL', a.upside.slice(0, 4), function (x) {
        return fmtMult(x.effective_multiple);
      }),
      alertList('Newest on the radar', a.newest.slice(0, 4), function (x) {
        return fmtAge(x.age_days) + ' old';
      }));
  }

  /* ---------- controls ---------- */
  function fillSelect(sel, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }
  function renderControls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Unknown'; }))).sort();
    fillSelect($('category'), cats);
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains; }))).sort();
    fillSelect($('chain'), chains);
    if (state.category !== 'all') $('category').value = state.category;
    if (state.stage !== 'all') $('stage').value = state.stage;
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === state.view ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.view = b.getAttribute('data-view');
        document.querySelectorAll('.tabs button').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        renderTable();
      });
    });
    $('q').addEventListener('input', function () { state.q = $('q').value.trim().toLowerCase(); renderTable(); });
    $('stage').addEventListener('change', function () { state.stage = $('stage').value; renderTable(); });
    $('category').addEventListener('change', function () { state.category = $('category').value; renderTable(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; renderTable(); });
    $('conf').addEventListener('change', function () { state.conf = $('conf').value; renderTable(); });
    $('clear').addEventListener('click', function () {
      state.q = ''; state.stage = 'all'; state.category = 'all'; state.chain = 'all'; state.conf = 'all';
      $('q').value = ''; $('stage').value = 'all'; $('category').value = 'all'; $('chain').value = 'all'; $('conf').value = 'all';
      renderTable();
    });
  }

  /* ---------- tables ---------- */
  function matchesBoard(r) {
    if (state.stage !== 'all' && r.stage !== state.stage) return false;
    if (state.category !== 'all' && (r.category || 'Unknown') !== state.category) return false;
    if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
    if (state.conf !== 'all' && r.confidence !== state.conf) return false;
    if (state.q && r.name.toLowerCase().indexOf(state.q) < 0 && r.slug.indexOf(state.q) < 0) return false;
    return true;
  }
  function matchesText(name, slug) {
    return !state.q || name.toLowerCase().indexOf(state.q) >= 0 || slug.indexOf(state.q) >= 0;
  }
  var CONF_ORDER = { high: 3, medium: 2, low: 1 };
  var BOARD_COLS = [
    { key: 'rank', label: '#', num: true },
    { key: 'name', label: 'Protocol' },
    { key: 'stage', label: 'Stage' },
    { key: 'tvl_usd', label: 'TVL', num: true },
    { key: 'change_7d', label: '7d', num: true },
    { key: 'age_days', label: 'Age', num: true },
    { key: 'category_multiple', label: 'Multiple', num: true },
    { key: 'implied_value_usd', label: 'Implied value', num: true },
    { key: 'effective_multiple', label: 'x TVL', num: true },
    { key: 'signal', label: 'Signal', num: true },
    { key: 'confidence', label: 'Conf.' },
  ];
  function sortRows(rows) {
    var k = state.sort, d = state.dir;
    return rows.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (k === 'confidence') { x = CONF_ORDER[x]; y = CONF_ORDER[y]; }
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * d;
      return (x - y) * d;
    });
  }
  function headCell(col, sortable) {
    var th = el('th', {
      'class': (col.num ? 'num ' : '') + (sortable ? 'sortable' : ''),
      text: col.label,
    });
    if (sortable) {
      th.addEventListener('click', function () {
        if (state.sort === col.key) state.dir = -state.dir;
        else { state.sort = col.key; state.dir = col.key === 'name' || col.key === 'stage' ? 1 : -1; }
        renderTable();
      });
      if (state.sort === col.key) th.appendChild(el('span', { 'class': 'arrow', text: state.dir === 1 ? ' ▲' : ' ▼' }));
    }
    return th;
  }
  function bar(pct, cls) {
    var b = el('span', { 'class': cls || 'bar' });
    var i = document.createElement('i');
    i.style.width = Math.max(1.5, Math.min(100, pct)) + '%';
    b.appendChild(i);
    return b;
  }
  function renderBoard(rows) {
    $('head-row').replaceChildren.apply($('head-row'), BOARD_COLS.map(function (c) { return headCell(c, true); }));
    var body = rows.map(function (r) {
      var change = el('td', { 'class': 'num' });
      if (r.change_7d === null) change.textContent = 'n/a';
      else {
        change.appendChild(el('span', { 'class': r.change_7d >= 0 ? 'up' : 'down', text: fmtPct(r.change_7d) }));
        var mb = el('span', { 'class': 'mbar' });
        var mi = document.createElement('i');
        mi.className = r.change_7d >= 0 ? 'pos' : 'neg';
        var w = Math.min(100, Math.abs(r.change_7d) / maxAbsChange * 100);
        mi.style.width = Math.max(3, w) + '%';
        if (r.change_7d < 0) { mi.style.right = 'auto'; }
        mb.appendChild(mi);
        change.appendChild(mb);
      }
      var sig = el('td', { 'class': 'sig' });
      var sb = el('span', { 'class': 'sbar' });
      var si = document.createElement('i');
      si.style.width = r.signal + '%';
      sb.appendChild(si);
      sig.appendChild(sb);
      sig.appendChild(document.createTextNode(String(r.signal)));
      var tr = el('tr', {
        'class': 'clickable' + (state.selected === r.slug ? ' selected' : ''),
        onclick: function () { openDetail(r); },
      },
        el('td', { 'class': 'rank', text: String(r.rank) }),
        el('td', null,
          el('div', { 'class': 'pname', text: r.name }),
          el('div', { 'class': 'psub', text: (r.category || 'Unknown') + (r.chains.length ? ' on ' + r.chains.slice(0, 3).join(', ') : '') })),
        el('td', null, el('span', { 'class': 'badge ' + (r.stage === 'watchlist' ? 'watch' : 'early'), text: r.stage })),
        el('td', { 'class': 'num money', text: fmtUsd(r.tvl_usd) }),
        change,
        el('td', { 'class': 'num', text: fmtAge(r.age_days) }),
        el('td', { 'class': 'num money', text: fmtMult(r.category_multiple) }),
        el('td', { 'class': 'num money' }, bar(r.implied_value_usd / maxImplied * 100), document.createTextNode(fmtUsd(r.implied_value_usd))),
        el('td', { 'class': 'num money', text: fmtMult(r.effective_multiple) }),
        sig,
        el('td', null, el('span', { 'class': 'badge conf-' + r.confidence, text: r.confidence })));
      return tr;
    });
    $('rows').replaceChildren.apply($('rows'), body);
    $('count').textContent = rows.length + ' of ' + DATA.rows.length + ' ranked';
  }
  function renderLive() {
    var cols = [
      { key: 'name', label: 'Live protocol' }, { key: 'category', label: 'Category' },
      { key: 'tvl', label: 'TVL', num: true }, { key: 'mcap', label: 'Market cap', num: true },
      { key: 'mult', label: 'mcap / TVL', num: true }, { key: 'chg', label: '7d', num: true },
    ];
    $('head-row').replaceChildren.apply($('head-row'), cols.map(function (c) { return headCell(c, false); }));
    var rows = DATA.live.filter(function (r) { return matchesText(r.name, r.slug); });
    $('rows').replaceChildren.apply($('rows'), rows.map(function (r) {
      return el('tr', null,
        el('td', null, el('div', { 'class': 'pname', text: r.name }), el('div', { 'class': 'psub', text: r.slug })),
        el('td', { text: r.category || 'Unknown' }),
        el('td', { 'class': 'num money', text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': 'num money', text: fmtUsd(r.mcap_usd) }),
        el('td', { 'class': 'num money', text: fmtMult(r.multiple) }),
        el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }));
    }));
    $('count').textContent = rows.length + ' live comps shown (of ' + DATA.stats.live_total + ')';
  }
  function renderScreened() {
    var cols = [
      { key: 'name', label: 'Screened-out record' }, { key: 'category', label: 'Category' },
      { key: 'tvl', label: 'TVL', num: true }, { key: 'reason', label: 'Why it is not ranked' },
    ];
    $('head-row').replaceChildren.apply($('head-row'), cols.map(function (c) { return headCell(c, false); }));
    var rows = DATA.screened.filter(function (r) { return matchesText(r.name, r.slug); });
    $('rows').replaceChildren.apply($('rows'), rows.map(function (r) {
      return el('tr', null,
        el('td', null, el('div', { 'class': 'pname', text: r.name }), el('div', { 'class': 'psub', text: r.slug })),
        el('td', { text: r.category || 'Unknown' }),
        el('td', { 'class': 'num money', text: fmtUsd(r.tvl_usd) }),
        el('td', { text: r.reason, style: 'white-space:normal;min-width:280px' }));
    }));
    $('count').textContent = rows.length + ' screened out (of ' + DATA.stats.screened_total + ')';
  }
  function renderTable() {
    if (state.view === 'live') { renderLive(); $('empty').hidden = true; return; }
    if (state.view === 'screened') { renderScreened(); $('empty').hidden = true; return; }
    var rows = sortRows(DATA.rows.filter(matchesBoard));
    renderBoard(rows);
    $('empty').hidden = rows.length > 0;
  }

  /* ---------- comps table ---------- */
  function renderComps() {
    $('comps-rows').replaceChildren.apply($('comps-rows'), DATA.comps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { 'class': 'num', text: String(c.n) }),
        el('td', { 'class': 'num money', text: fmtMult(c.raw_median_multiple) }),
        el('td', { 'class': 'num money', html: '<b>' + fmtMult(c.used_multiple) + '</b>' }),
        el('td', { 'class': 'num money', text: fmtMult(c.q1_multiple) + ' – ' + fmtMult(c.q3_multiple) }),
        el('td', { 'class': 'num', text: String(c.pre_token_n) }),
        el('td', { text: c.used ? 'category median' : 'fallback' }));
    }));
  }

  /* ---------- detail drawer ---------- */
  function wRow(k, v, total) {
    return el('div', { 'class': 'w-row' + (total ? ' total' : '') },
      el('span', { 'class': 'w-k', text: k }), el('span', { 'class': 'w-v', text: v }));
  }
  function openDetail(r) {
    state.selected = r.slug;
    renderTable();
    var m = DATA.model;
    var f = factorsOf(r, m);
    var recomputed = impliedOf(r, m);
    var steps = r.farm_steps.map(parseStep);
    var peers = (DATA.comps_peers[r.category || 'Unknown'] || []);
    var plan = r.plan;
    var workedLine = fmtUsdFull(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(3) + 'x × ' + f.growthMult.toFixed(3) +
      ' × ' + f.maturity.toFixed(3) + ' = ' + fmtUsdFull(r.implied_value_usd);
    var d = $('detail');
    d.replaceChildren(
      el('div', { 'class': 'd-top' },
        el('div', null,
          el('div', { 'class': 'd-rank', text: 'RANK ' + r.rank + ' OF ' + DATA.rows.length + ' · ' + r.stage.toUpperCase() }),
          el('h2', { text: r.name }),
          el('div', { 'class': 'd-sub', text: (r.category || 'Unknown') + (r.chains.length ? ' · ' + r.chains.join(', ') : '') + (r.listed_at ? ' · tracked since ' + r.listed_at : '') })),
        el('button', { 'class': 'close', text: 'Close', onclick: closeDetail })),
      el('div', { 'class': 'badges' },
        el('span', { 'class': 'badge ' + (r.stage === 'watchlist' ? 'watch' : 'early'), text: r.stage }),
        el('span', { 'class': 'badge conf-' + r.confidence, text: r.confidence + ' confidence' }),
        el('span', { 'class': 'badge early', text: 'records no token' })),
      el('h3', { text: 'Implied value' }),
      el('div', { 'class': 'big', text: fmtUsd(r.implied_value_usd) }),
      el('div', { 'class': 'big-sub', text: workedLine }),
      el('div', {
        'class': 'big-sub',
        text: r.comps_basis === 'category'
          ? 'Sensitivity at the category\'s comp quartiles: ' + fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) + '. Signal ' + r.signal + '/100 (growth, size and maturity percentiles — the rank is by implied value, never by signal).'
          : 'Priced on the overall median of ' + r.comps_n + ' live protocols — this category has too few live comps of its own, so treat the figure as low confidence. Signal ' + r.signal + '/100.',
      }),
      el('h3', { text: 'How the number is built' }),
      el('div', { 'class': 'waterfall' },
        wRow('TVL (snapshot)', fmtUsd(r.tvl_usd)),
        wRow('Multiple — ' + (r.comps_basis === 'category'
          ? (r.category || 'Unknown') + ' raw median ' + fmtMult(r.raw_category_multiple) + ' shrunk with ' + r.comps_n + ' live comps'
          : 'overall fallback, ' + r.comps_n + ' live comps'), fmtMult(r.category_multiple)),
        wRow('Growth — 7d ' + fmtPct(r.change_7d) + ', clamped and weighted', 'x ' + f.growthMult.toFixed(3)),
        wRow('Maturity — ' + fmtAge(r.age_days) + (r.age_days === null ? ' (board median ' + DATA.median_age_days + 'd used)' : '') + ' with no token', 'x ' + f.maturity.toFixed(3)),
        wRow('Implied value', fmtUsd(r.implied_value_usd), true)),
      el('div', {
        'class': 'check',
        text: recomputed === r.implied_value_usd
          ? '✓ this page recomputes ' + fmtUsd(recomputed) + ' from the figures above — the same number board.json carries'
          : 'page recomputes ' + fmtUsd(recomputed) + '; board.json carries ' + fmtUsd(r.implied_value_usd),
      }),
      el('h3', { text: 'Why this confidence' }),
      el('ul', { 'class': 'reasons' }, r.confidence_reasons.map(function (x) { return el('li', { text: x }); })),
      el('h3', { text: 'In its category' }),
      el('div', { 'class': 'waterfall' },
        wRow('TVL percentile among pre-token ' + (r.category || 'Unknown'), r.tvl_pct_category + 'th'),
        wRow('7d growth vs the category median', r.growth_delta_category === null ? 'n/a' : fmtPct(r.growth_delta_category)),
        wRow('Effective multiple (implied / TVL)', fmtMult(r.effective_multiple))),
      peers.length ? el('h3', { text: 'Live comps — ' + (r.category || 'Unknown') }) : null,
      peers.length ? el('table', { 'class': 'mini' },
        el('thead', null, el('tr', null,
          el('th', { text: 'Protocol' }), el('th', { 'class': 'num', text: 'Market cap' }),
          el('th', { 'class': 'num', text: 'TVL' }), el('th', { 'class': 'num', text: 'mcap/TVL' }))),
        el('tbody', null, peers.map(function (p) {
          return el('tr', null,
            el('td', { text: p.name }),
            el('td', { 'class': 'num money', text: fmtUsd(p.mcap_usd) }),
            el('td', { 'class': 'num money', text: fmtUsd(p.tvl_usd) }),
            el('td', { 'class': 'num money', text: fmtMult(p.multiple) }));
        }))) : null,
      el('h3', { text: 'Farm plan — ' + steps.length + ' steps' }),
      el('div', { 'class': 'plan-summary' },
        el('span', { 'class': 'chip', html: 'capital <b>$' + plan.capital_usd + '</b>' }),
        el('span', { 'class': 'chip', html: 'gas total <b>' + fmtGas(plan.gas_low_usd) + '–' + fmtGas(plan.gas_high_usd) + '</b>' }),
        el('span', { 'class': 'chip', html: 'setup <b>~' + plan.setup_min + ' min</b>' }),
        el('span', { 'class': 'chip', html: 'upkeep <b>~' + plan.upkeep_min_week + ' min/wk</b>' }),
        el('span', { 'class': 'chip', html: 'hold <b>' + plan.hold_days + ' days</b>' })),
      el('table', { 'class': 'plan-table' },
        el('thead', null, el('tr', null,
          el('th', { text: '#' }), el('th', { text: 'Step' }),
          el('th', { 'class': 'num', text: 'Cost' }), el('th', { 'class': 'num', text: 'Time' }))),
        el('tbody', null, steps.map(function (s, i) {
          return el('tr', null,
            el('td', { 'class': 'num', text: String(i + 1) }),
            el('td', { 'class': 'p-text', text: s.text }),
            el('td', { 'class': 'num p-meta', text: s.cost }),
            el('td', { 'class': 'num p-meta', text: s.time }));
        }))));
    d.hidden = false;
    $('scrim').hidden = false;
    d.scrollTop = 0;
    if (params.get('focus') === 'plan') {
      var heads = d.querySelectorAll('h3');
      for (var hi = 0; hi < heads.length; hi++) {
        if (heads[hi].textContent.indexOf('Farm plan') === 0) { d.scrollTop = Math.max(0, heads[hi].offsetTop - 12); break; }
      }
    }
  }
  function closeDetail() {
    state.selected = null;
    $('detail').hidden = true;
    $('scrim').hidden = true;
    renderTable();
  }
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  /* ---------- go ---------- */
  renderTop();
  renderAlerts();
  renderControls();
  renderComps();
  renderTable();
  var open = params.get('open');
  if (open && bySlug[open]) openDetail(bySlug[open]);
})();
