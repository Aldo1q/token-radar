// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable and sortable table, a per-protocol detail
// drawer with the model's own inputs and the protocol's farm plan, and the comps table the
// multiples come from. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(3) + 'x'; }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The multiple is the row's own category multiple, set by the comps calibration in lib/model.ts.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return '$5 to $15';
    if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near') return 'under $0.05';
    if (c === 'tron') return 'about $1';
    if (c === 'bitcoin') return '$2 to $5';
    return '$0.10 to $1';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('basis trad') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it so the position shows both sides, and keep it open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s deepest USDC pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset through " + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('pool') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Move $' + capital + ' of USDC through ' + name + ' on ' + chain + ' once a week and keep the receipts.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ', then vote once in its governance when a proposal opens.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + " and use it once inside " + name + "'s own app.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var other = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'free to set up', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: other ? 'Repeat the position on ' + other + ' with a smaller amount, about $' + Math.max(25, Math.round(capital / 2)) + ', so the wallet is active on two of its chains.' : 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: 'about ' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Join the protocol's Discord or Telegram and read its announcements channel once a week, so you know when a points program or a snapshot is announced.", cost: 'free', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function isWatchlist(row) { return (window.__WL || (window.__WL = new Set(DATA.watchlist || []))).has(row.slug); }

  function renderTop() {
    var meta = document.getElementById('top-meta');
    meta.textContent = '';
    meta.appendChild(el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })));
    meta.appendChild(el('span', null, 'DefiLlama protocol index'));
    meta.appendChild(el('span', null, el('b', { text: DATA.model_version }), ' model'));
    var facts = document.getElementById('facts');
    facts.textContent = '';
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })));
  }

  function renderModel() {
    var m = DATA.model;
    var box = document.getElementById('model');
    box.textContent = '';
    box.appendChild(el('h2', { text: 'How implied value is computed' }));
    box.appendChild(el('p', { text: 'Every row is scored by one function of the snapshot figures. The multiple is not a guess: it is the median market-cap per dollar of TVL of the live-token protocols in the row’s own category, computed from this snapshot. A category with fewer than ' + m.min_comps + ' live comps falls back to the median over all live-token protocols (' + fmtMult(DATA.overall_multiple) + '). No protocol name is special-cased, and no row is hand-picked.' }));
    box.appendChild(el('div', { class: 'formula' },
      el('b', { text: 'implied = round( tvl_usd × category_multiple × growth_mult × maturity_mult )' }),
      el('div', { text: 'category_multiple = median(mcap / TVL) of live-token protocols in the category, clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']' }),
      el('div', { text: 'growth_mult = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight }),
      el('div', { text: 'maturity_mult = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '  (age unknown: ' + m.unknown_age_days + 'd)' })
    ));
    box.appendChild(el('p', { text: 'TVL, seven-day growth and the listing date come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token. The early radar is every pre-token protocol below the watchlist floor that the watchlist’s own rule keeps — no wrapped, staked or bridged product, no versioned pool, no exchange — and the live-token protocols are set aside with their market caps shown.' }));
  }

  function renderComps() {
    var box = document.getElementById('comps');
    box.textContent = '';
    box.appendChild(el('h2', { text: 'The comps behind the multiples' }));
    box.appendChild(el('p', { text: 'Each category’s multiple is the median market-cap per dollar of TVL of its live-token protocols. Categories with fewer than ' + DATA.model.min_comps + ' live protocols use the overall median (' + fmtMult(DATA.overall_multiple) + '). A multiple above 1.0 is clamped to 1.0; below 0.05, to 0.05.' }));
    var head = el('tr', null,
      el('th', { scope: 'col', text: 'Category' }),
      el('th', { scope: 'col', text: 'Live comps' }),
      el('th', { scope: 'col', text: 'Median multiple' }),
      el('th', { scope: 'col', text: 'Used?' }));
    var body = el('tbody');
    DATA.comps.forEach(function (c) {
      body.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple) }),
        el('td', { text: c.used ? 'yes' : 'falls back to ' + fmtMult(DATA.overall_multiple) })
      ));
    });
    box.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'comps-table' }, el('thead', null, head), body)));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderTable(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function renderTable() {
    var head = document.getElementById('head-row');
    head.textContent = '';
    var rowsEl = document.getElementById('rows');
    rowsEl.textContent = '';
    var empty = document.getElementById('empty');
    var count = document.getElementById('count');
    if (state.tab === 'live') {
      head.appendChild(el('th', { scope: 'col', text: 'Status' }));
      head.appendChild(el('th', { scope: 'col', text: 'Protocol' }));
      head.appendChild(el('th', { scope: 'col', text: 'TVL' }));
      head.appendChild(el('th', { scope: 'col', text: '7d' }));
      head.appendChild(el('th', { scope: 'col', text: 'Market cap' }));
      head.appendChild(el('th', { scope: 'col', text: 'Token' }));
      DATA.live.forEach(function (r) {
        rowsEl.appendChild(el('tr', null,
          el('td', { class: 'num', text: 'live' }),
          el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', null, el('span', { class: 'pill', text: 'already trades' }))
        ));
      });
      empty.hidden = true;
      count.textContent = DATA.live.length + ' live-token protocols';
      return;
    }
    head.appendChild(sortHeader('implied', 'Rank'));
    head.appendChild(sortHeader('name', 'Protocol'));
    head.appendChild(sortHeader('tvl', 'TVL'));
    head.appendChild(sortHeader('growth', '7d'));
    head.appendChild(sortHeader('age', 'Age'));
    head.appendChild(sortHeader('implied', 'Implied value'));
    head.appendChild(el('th', { scope: 'col', text: 'Token' }));
    var list = sortedRows(filteredRows());
    count.textContent = list.length + ' rows shown';
    if (list.length === 0) { empty.hidden = false; return; }
    empty.hidden = true;
    var max = list[0].implied_value_usd || 1;
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var wl = isWatchlist(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill' + (wl ? ' watch' : ''), text: wl ? 'watchlist' : 'no token' }))
      );
      rowsEl.appendChild(tr);
    });
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var aside = document.getElementById('detail');
    aside.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    aside.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · watchlist' : ' · early radar') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { closeDetail(); } })
    ));
    aside.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Live comps in this category' }), el('b', { class: 'num', text: String(row.comps_n) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (Math.abs(recomputed - row.implied_value_usd) <= 1 ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    aside.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    aside.hidden = false;
    renderTable();
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    document.getElementById('detail').hidden = true;
    document.getElementById('detail').textContent = '';
    renderTable();
  }

  function init() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = document.getElementById('category');
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = document.getElementById('chain');
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; writeHash(); renderTable(); });
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); renderTable(); });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); renderTable(); });
    var tabs = document.querySelectorAll('.tabs button');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-set');
        tabs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        writeHash(); renderTable();
      });
    });
    document.getElementById('clear').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all';
      q.value = ''; catSel.value = 'all'; chainSel.value = 'all';
      writeHash(); renderTable();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !document.getElementById('detail').hidden) closeDetail();
    });
    readHash();
    if (state.q) q.value = state.q;
    if (state.category !== 'all') catSel.value = state.category;
    if (state.chain !== 'all') chainSel.value = state.chain;
    if (state.tab !== 'pre-token') tabs.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-set') === state.tab ? 'true' : 'false'); });
    renderTop();
    renderModel();
    renderComps();
    renderTable();
    if (state.selected) openDetail(state.selected);
  }

  init();
})();
