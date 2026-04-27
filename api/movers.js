// /api/movers — top movers from Binance or Hyperliquid

export default async function handler(req, res) {
  const source = (req.query.source || 'binance').toLowerCase();

  // CDN cache 30s, allow 60s stale
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    if (source === 'hyperliquid') {
      return res.status(200).json(await fetchHyperliquid());
    }
    return res.status(200).json(await fetchBinance());
  } catch (err) {
    console.error('movers error:', err);
    return res.status(500).json({ error: 'feed_unavailable', message: String(err.message || err) });
  }
}

async function fetchBinance() {
  const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
    headers: { 'User-Agent': 'signal-terminal/1.0' },
  });
  if (!r.ok) throw new Error(`binance ${r.status}`);
  const data = await r.json();

  const tickers = data
    .filter((t) => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN') && !t.symbol.includes('BULL') && !t.symbol.includes('BEAR'))
    .map((t) => ({
      symbol: t.symbol,
      display: t.symbol.replace('USDT', '/USDT'),
      price: Number(t.lastPrice),
      change: Number(t.priceChangePercent),
      volume: Number(t.quoteVolume), // USD volume
      high: Number(t.highPrice),
      low: Number(t.lowPrice),
    }))
    .filter((t) => t.volume > 1_000_000); // only liquid pairs

  return { source: 'binance', updatedAt: Date.now(), tickers };
}

async function fetchHyperliquid() {
  // Hyperliquid info endpoint — meta + asset contexts in one call
  const r = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'signal-terminal/1.0' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!r.ok) throw new Error(`hyperliquid ${r.status}`);
  const data = await r.json();

  const meta = data[0];
  const ctxs = data[1];
  if (!meta?.universe || !Array.isArray(ctxs)) {
    throw new Error('hyperliquid: malformed response');
  }

  const tickers = meta.universe
    .map((asset, i) => {
      const ctx = ctxs[i];
      if (!ctx) return null;
      const price = Number(ctx.markPx);
      const prev = Number(ctx.prevDayPx);
      const change = prev ? ((price - prev) / prev) * 100 : 0;
      const volume = Number(ctx.dayNtlVlm) || 0;
      return {
        symbol: asset.name + '-PERP',
        display: asset.name + '-PERP',
        price,
        change,
        volume,
        high: 0,
        low: 0,
      };
    })
    .filter((t) => t && isFinite(t.price) && t.volume > 100_000);

  return { source: 'hyperliquid', updatedAt: Date.now(), tickers };
}
