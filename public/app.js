/* ============================================
   SIGNAL // crypto terminal — client app
   ============================================ */

const STATE = {
  moversSource: 'binance',
  moversFilter: 'gainers',
  chartSymbol: 'BTCUSDT',
  chartInterval: '1h',
  allTickers: [],
  searchTimer: null,
};

const REFRESH_INTERVAL = 30000; // 30s

/* === Utilities === */
const $ = (id) => document.getElementById(id);

function fmtPrice(p) {
  const n = Number(p);
  if (!isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPct(p) {
  const n = Number(p);
  if (!isFinite(n)) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

function fmtVol(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function setStatus(state, text) {
  const pill = $('status-pill');
  pill.classList.remove('live', 'error');
  if (state) pill.classList.add(state);
  $('status-text').textContent = text;
}

/* === Clock === */
function tickClock() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm}:${ss} UTC`;
  $('footer-time').textContent = d.toISOString().slice(0, 19).replace('T', ' ') + ' utc';
}
setInterval(tickClock, 1000);
tickClock();

/* === Movers === */
async function loadMovers() {
  const list = $('movers-list');
  try {
    const res = await fetch(`/api/movers?source=${STATE.moversSource}`);
    if (!res.ok) throw new Error('movers fetch failed');
    const data = await res.json();
    STATE.allTickers = data.tickers || [];

    let rows = [...STATE.allTickers];
    if (STATE.moversFilter === 'gainers') {
      rows.sort((a, b) => b.change - a.change);
    } else if (STATE.moversFilter === 'losers') {
      rows.sort((a, b) => a.change - b.change);
    } else if (STATE.moversFilter === 'volume') {
      rows.sort((a, b) => b.volume - a.volume);
    }

    rows = rows.slice(0, 12);
    if (rows.length === 0) {
      list.innerHTML = `<div class="empty">no data available</div>`;
      return;
    }

    list.innerHTML = rows.map((t, i) => {
      const dir = t.change >= 0 ? 'up' : 'down';
      const arrow = t.change >= 0 ? '▲' : '▼';
      return `
        <div class="mover-row fade-in" data-symbol="${t.symbol}" style="animation-delay:${i * 0.03}s">
          <div class="rank">${String(i + 1).padStart(2, '0')}</div>
          <div class="symbol-block">
            <div class="symbol">${t.display}</div>
            <div class="name">vol ${fmtVol(t.volume)}</div>
          </div>
          <div class="price-block">
            <div class="price">$${fmtPrice(t.price)}</div>
          </div>
          <div class="change ${dir}">${arrow} ${fmtPct(Math.abs(t.change))}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.mover-row').forEach((row) => {
      row.addEventListener('click', () => {
        const sym = row.getAttribute('data-symbol');
        if (sym && STATE.moversSource === 'binance') loadChart(sym);
      });
    });

    $('movers-updated').textContent = `${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
    updateTicker(STATE.allTickers);
    setStatus('live', 'live');
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="empty">feed unavailable — retrying</div>`;
    setStatus('error', 'error');
  }
}

/* === Ticker strip === */
function updateTicker(tickers) {
  const track = $('ticker-track');
  if (!tickers || tickers.length === 0) return;

  const top = [...tickers]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 18);

  // Duplicate for seamless loop
  const items = [...top, ...top].map((t) => {
    const dir = t.change >= 0 ? 'up' : 'down';
    const arrow = t.change >= 0 ? '+' : '';
    return `
      <span class="ticker-item">
        <span class="ticker-symbol">${t.display}</span>
        <span class="ticker-price">$${fmtPrice(t.price)}</span>
        <span class="ticker-change ${dir}">${arrow}${t.change.toFixed(2)}%</span>
      </span>
    `;
  }).join('');
  track.innerHTML = items;
}

/* === Chart === */
async function loadChart(symbol) {
  STATE.chartSymbol = symbol;
  $('chart-symbol').textContent = symbol;

  try {
    const res = await fetch(`/api/klines?symbol=${symbol}&interval=${STATE.chartInterval}`);
    if (!res.ok) throw new Error('chart fetch failed');
    const data = await res.json();
    renderChart(data.candles || []);

    // Stats
    if (data.stats) {
      const s = data.stats;
      $('chart-price').textContent = `$${fmtPrice(s.price)}`;
      const changeEl = $('chart-change');
      const dir = s.change >= 0 ? 'up' : 'down';
      changeEl.className = `price-change ${dir}`;
      const arrow = s.change >= 0 ? '▲' : '▼';
      changeEl.textContent = `${arrow} ${fmtPct(Math.abs(s.change))}`;
      $('chart-volume').textContent = fmtVol(s.volume);
      $('chart-high').textContent = `$${fmtPrice(s.high)}`;
      $('chart-low').textContent = `$${fmtPrice(s.low)}`;
    }
  } catch (err) {
    console.error(err);
  }
}

function renderChart(candles) {
  const svg = $('chart-svg');
  const volSvg = $('volume-svg');
  if (!candles || candles.length === 0) {
    svg.innerHTML = '';
    volSvg.innerHTML = '';
    return;
  }

  const W = 800, H = 280, PAD = 8;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const vols = candles.map(c => c.volume);

  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const range = maxP - minP || 1;

  const stepX = (W - PAD * 2) / (candles.length - 1 || 1);
  const points = candles.map((c, i) => {
    const x = PAD + i * stepX;
    const y = PAD + (1 - (c.close - minP) / range) * (H - PAD * 2);
    return [x, y];
  });

  const linePath = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${H} L ${points[0][0]} ${H} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d4ff3d" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#d4ff3d" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="price-area" d="${areaPath}"/>
    <path class="price-line" d="${linePath}"/>
  `;

  // Volume bars
  const maxV = Math.max(...vols) || 1;
  const VW = 800, VH = 60, BPAD = 2;
  const barWidth = Math.max(1, (VW - BPAD * 2) / candles.length - 1);
  const barsHtml = candles.map((c, i) => {
    const x = BPAD + i * ((VW - BPAD * 2) / candles.length);
    const h = (c.volume / maxV) * (VH - 4);
    const y = VH - h;
    const cls = c.close >= c.open ? 'up' : 'down';
    return `<rect class="bar ${cls}" x="${x}" y="${y}" width="${barWidth}" height="${h}"/>`;
  }).join('');
  volSvg.innerHTML = barsHtml;
}

/* === Trends === */
async function loadTrends() {
  const list = $('trends-list');
  try {
    const res = await fetch('/api/trends');
    if (!res.ok) throw new Error('trends fetch failed');
    const data = await res.json();
    const trends = data.trends || [];

    if (trends.length === 0) {
      list.innerHTML = `<div class="empty">no trends available</div>`;
      return;
    }

    list.innerHTML = trends.slice(0, 8).map((t, i) => {
      const sparkPath = makeSparkline(t.sparkline || []);
      return `
        <div class="trend-row fade-in" style="animation-delay:${i * 0.04}s">
          <div class="trend-rank">${String(i + 1).padStart(2, '0')}</div>
          <div class="trend-body">
            <div class="trend-tag">${escapeHtml(t.tag)}</div>
            <div class="trend-meta">
              <span>${fmtVol(t.mentions || 0)} mentions</span>
              <span class="dot"></span>
              <span>${t.sentiment || 'neutral'}</span>
              <span class="dot"></span>
              <span>${t.timeframe || '24h'}</span>
            </div>
          </div>
          <svg class="trend-spark" viewBox="0 0 60 24" preserveAspectRatio="none">
            <path d="${sparkPath}"/>
          </svg>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="empty">trends feed unavailable</div>`;
  }
}

function makeSparkline(values) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = 60 / (values.length - 1);
  return values.map((v, i) => {
    const x = i * step;
    const y = 22 - ((v - min) / range) * 20;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/* === Polymarket === */
async function loadPoly() {
  const list = $('poly-list');
  try {
    const res = await fetch('/api/polymarket');
    if (!res.ok) throw new Error('poly fetch failed');
    const data = await res.json();
    const markets = data.markets || [];

    if (markets.length === 0) {
      list.innerHTML = `<div class="empty">no markets available</div>`;
      return;
    }

    list.innerHTML = markets.slice(0, 6).map((m, i) => {
      const outcomes = (m.outcomes || []).slice(0, 2).map((o, idx) => {
        const pct = Math.round((o.probability || 0) * 100);
        const cls = idx === 0 ? '' : 'no';
        return `
          <div>
            <div class="poly-outcome">
              <span class="poly-outcome-name">${escapeHtml(o.name)}</span>
              <span class="poly-outcome-pct">${pct}%</span>
            </div>
            <div class="poly-bar"><div class="poly-bar-fill ${cls}" style="width:${pct}%"></div></div>
          </div>
        `;
      }).join('');

      return `
        <a href="${m.url || '#'}" target="_blank" rel="noopener" class="poly-card fade-in" style="animation-delay:${i * 0.05}s">
          <div class="poly-question">${escapeHtml(m.question)}</div>
          <div class="poly-outcomes">${outcomes}</div>
          <div class="poly-meta">
            <span>${fmtVol(m.volume || 0)} vol</span>
            <span>${m.endDate || ''}</span>
          </div>
        </a>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="empty">polymarket feed unavailable</div>`;
  }
}

/* === Search === */
function setupSearch() {
  const input = $('search-input');
  const results = $('search-results');
  const hint = $('search-hint');

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim().toUpperCase();
    clearTimeout(STATE.searchTimer);

    if (!q) {
      results.hidden = true;
      hint.textContent = '';
      return;
    }

    hint.textContent = '↵ open chart';

    STATE.searchTimer = setTimeout(() => {
      const matches = STATE.allTickers
        .filter((t) => t.symbol.includes(q) || t.display.includes(q))
        .slice(0, 8);

      if (matches.length === 0) {
        results.innerHTML = `<div class="search-result"><span class="sym">no matches</span></div>`;
      } else {
        results.innerHTML = matches.map((t) => {
          const dir = t.change >= 0 ? 'up' : 'down';
          return `
            <div class="search-result" data-symbol="${t.symbol}">
              <span class="sym">${t.display}</span>
              <span class="price">$${fmtPrice(t.price)} <span class="ticker-change ${dir}">${fmtPct(t.change)}</span></span>
            </div>
          `;
        }).join('');

        results.querySelectorAll('.search-result[data-symbol]').forEach((el) => {
          el.addEventListener('click', () => {
            const sym = el.getAttribute('data-symbol');
            input.value = '';
            results.hidden = true;
            hint.textContent = '';
            if (STATE.moversSource === 'binance') loadChart(sym);
            else loadChart('BTCUSDT'); // chart only supports binance pairs
          });
        });
      }
      results.hidden = false;
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = results.querySelector('.search-result[data-symbol]');
      if (first) first.click();
    }
    if (e.key === 'Escape') {
      input.value = '';
      results.hidden = true;
      hint.textContent = '';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      results.hidden = true;
    }
  });

  // Keyboard shortcut: /
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* === Tabs / filters === */
function setupTabs() {
  document.querySelectorAll('.panel-movers .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-movers .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      STATE.moversSource = tab.getAttribute('data-source');
      loadMovers();
    });
  });

  document.querySelectorAll('.filter').forEach((f) => {
    f.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach((x) => x.classList.remove('active'));
      f.classList.add('active');
      STATE.moversFilter = f.getAttribute('data-filter');
      loadMovers();
    });
  });

  document.querySelectorAll('.panel-chart .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-chart .tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      STATE.chartInterval = tab.getAttribute('data-interval');
      loadChart(STATE.chartSymbol);
    });
  });
}

/* === Boot === */
async function boot() {
  setStatus(null, 'connecting');
  setupTabs();
  setupSearch();

  await Promise.all([loadMovers(), loadTrends(), loadPoly()]);
  loadChart('BTCUSDT');

  setInterval(loadMovers, REFRESH_INTERVAL);
  setInterval(() => loadChart(STATE.chartSymbol), REFRESH_INTERVAL);
  setInterval(loadTrends, REFRESH_INTERVAL * 4);
  setInterval(loadPoly, REFRESH_INTERVAL * 4);
}

boot();
