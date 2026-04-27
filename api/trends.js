// /api/trends — trending crypto topics
//
// Twitter/X v2 API requires a paid plan and is rate-limited heavily on the free tier,
// so this endpoint uses LunarCrush (which aggregates social signal across X, Reddit,
// YouTube, and news) when LUNARCRUSH_API_KEY is set in env vars.
//
// Without a key, it falls back to deriving "trending" topics from Binance's biggest
// gainers — not real social data, but a useful proxy that works out-of-the-box.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const key = process.env.LUNARCRUSH_API_KEY;

  try {
    if (key) {
      const data = await fetchLunarCrush(key);
      return res.status(200).json(data);
    }
    const data = await fetchFallback();
    return res.status(200).json(data);
  } catch (err) {
    console.error('trends error:', err);
    // Even on error, try fallback
    try {
      const data = await fetchFallback();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'feed_unavailable', trends: [] });
    }
  }
}

async function fetchLunarCrush(apiKey) {
  // LunarCrush v4 — top coins by social activity. Each coin has galaxy_score + social_volume.
  const r = await fetch('https://lunarcrush.com/api4/public/coins/list/v1?sort=social_dominance&limit=10', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`lunarcrush ${r.status}`);
  const data = await r.json();

  const trends = (data.data || []).map((c) => ({
    tag: `$${c.symbol} — ${c.name}`,
    mentions: Math.round(c.social_volume_24h || c.interactions_24h || 0),
    sentiment: c.sentiment >= 70 ? 'bullish' : c.sentiment <= 40 ? 'bearish' : 'neutral',
    timeframe: '24h',
    sparkline: makeSparkFromValue(c.percent_change_24h),
  }));

  return { source: 'lunarcrush', updatedAt: Date.now(), trends };
}

async function fetchFallback() {
  // Derive narratives from biggest movers — labels them honestly.
  const r = await fetch('https://api.binance.com/api/v3/ticker/24hr');
  if (!r.ok) throw new Error(`binance ${r.status}`);
  const all = await r.json();

  const top = all
    .filter((t) => t.symbol.endsWith('USDT') && Number(t.quoteVolume) > 5_000_000)
    .map((t) => ({
      symbol: t.symbol.replace('USDT', ''),
      change: Number(t.priceChangePercent),
      volume: Number(t.quoteVolume),
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 8);

  const trends = top.map((t) => ({
    tag: `$${t.symbol} ${t.change >= 0 ? 'momentum' : 'pullback'}`,
    mentions: Math.round(t.volume / 1000),
    sentiment: t.change >= 5 ? 'bullish' : t.change <= -5 ? 'bearish' : 'neutral',
    timeframe: '24h',
    sparkline: makeSparkFromValue(t.change),
  }));

  return { source: 'derived', updatedAt: Date.now(), trends };
}

function makeSparkFromValue(change) {
  // Pseudo-sparkline shaped by 24h change — visual flavor only.
  const c = Number(change) || 0;
  const base = 50;
  const points = [];
  for (let i = 0; i < 12; i++) {
    const noise = (Math.sin(i * 1.3 + c) + Math.cos(i * 0.7)) * 4;
    const drift = (i / 11) * c;
    points.push(base + drift + noise);
  }
  return points;
}
