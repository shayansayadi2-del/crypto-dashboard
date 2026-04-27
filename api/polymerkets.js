// /api/polymarket — active crypto-related prediction markets

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  try {
    // Polymarket Gamma API — public, no auth required.
    // Filter for crypto-related markets, active, ordered by 24h volume.
    const url = 'https://gamma-api.polymarket.com/markets?' + new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: '50',
      order: 'volume24hr',
      ascending: 'false',
      tag_id: '21', // "Crypto" tag on Polymarket
    });

    const r = await fetch(url, { headers: { 'User-Agent': 'signal-terminal/1.0' } });
    if (!r.ok) throw new Error(`polymarket ${r.status}`);
    const data = await r.json();

    const arr = Array.isArray(data) ? data : (data.markets || data.data || []);

    const markets = arr
      .filter((m) => m && (m.question || m.title))
      .map((m) => {
        // Outcome prices come as a JSON-encoded string array, e.g. '["0.62","0.38"]'
        let outcomes = [];
        try {
          const names = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No']);
          const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
          outcomes = names.map((name, i) => ({
            name: String(name),
            probability: Number(prices[i]) || 0,
          }));
        } catch (e) {
          outcomes = [{ name: 'Yes', probability: 0.5 }, { name: 'No', probability: 0.5 }];
        }

        return {
          id: m.id || m.conditionId,
          question: m.question || m.title,
          slug: m.slug,
          url: m.slug ? `https://polymarket.com/event/${m.slug}` : 'https://polymarket.com',
          volume: Number(m.volume24hr || m.volumeNum || m.volume || 0),
          endDate: m.endDate ? formatDate(m.endDate) : '',
          outcomes,
        };
      })
      .filter((m) => m.outcomes.length > 0)
      .slice(0, 12);

    return res.status(200).json({ source: 'polymarket', updatedAt: Date.now(), markets });
  } catch (err) {
    console.error('polymarket error:', err);
    return res.status(500).json({ error: 'feed_unavailable', message: String(err.message || err), markets: [] });
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '';
  }
}
