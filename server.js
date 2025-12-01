import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Binance public API defaults (no key needed).
const DEFAULT_PRICE_API_BASE = 'https://api.binance.com/api/v3/ticker/price';
const DEFAULT_HISTORY_API_BASE = 'https://api.binance.com/api/v3/klines';
const PRICE_API_BASE = process.env.PRICE_API_BASE || DEFAULT_PRICE_API_BASE;
const API_KEY = process.env.API_KEY;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);
const HISTORY_API_BASE = process.env.HISTORY_API_BASE || DEFAULT_HISTORY_API_BASE;
const HISTORY_CACHE_TTL_MS = Number(process.env.HISTORY_CACHE_TTL_MS || 300_000);

function buildHeaders() {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Z6X-Market-Data-Node/1.0',
  };
  // Binance public endpoints do not require an API key; leave optional header unused.
  return headers;
}

const symbolToId = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  ASTER: 'ASTRUSDT',
};

// Simple in-memory cache to avoid hammering upstream and hitting 429s.
const priceCache = new Map();
const historyCache = new Map();

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.get('/history', async (req, res) => {
  const symbol = (req.query.symbol || 'BTC').toUpperCase();
  const days = req.query.days || 1;
  const interval = req.query.interval || 'hourly';
  const ticker = symbolToId[symbol];
  const cacheKey = `${ticker}:usd:${days}:${interval}`;
  const now = Date.now();
  if (process.env.MOCK_HISTORY === 'true') {
    const mockPoints = [
      { t: now - 4 * 60 * 60 * 1000, price: 86000 },
      { t: now - 3 * 60 * 60 * 1000, price: 86500 },
      { t: now - 2 * 60 * 60 * 1000, price: 86200 },
      { t: now - 1 * 60 * 60 * 1000, price: 87000 },
      { t: now - 30 * 60 * 1000, price: 88500 },
      { t: now, price: 88800 },
    ];
    return res.json({
      symbol,
      days,
      interval,
      points: mockPoints,
      volume24h: 2_500_000,
      source: 'mock-history',
      cached: true,
      warning: 'MOCK_HISTORY enabled; serving demo data.',
    });
  }

  if (!ticker) {
    return res.status(400).json({ error: 'Unsupported symbol' });
  }

  const url = HISTORY_API_BASE;

  const cached = historyCache.get(cacheKey);
  const isCacheFresh = cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL_MS;
  if (isCacheFresh) {
    return res.json({ ...cached.payload, cached: true });
  }

  async function requestHistory(params) {
    return axios.get(url, {
      params,
      headers: buildHeaders(),
      timeout: 5000,
    });
  }

  const binanceInterval = interval === 'hourly' ? '1h' : interval === 'daily' ? '1d' : '1h';
  const limit =
    binanceInterval === '1h'
      ? Math.min(Number(days || 1) * 24, 1000)
      : Math.min(Number(days || 1), 1000);

  try {
    let response;
    try {
      response = await requestHistory({ symbol: ticker, interval: binanceInterval, limit });
    } catch (err) {
      const status = err.response?.status || 500;
      // Retry with a lighter interval if rate limited.
      if (status === 429) {
        response = await requestHistory({ symbol: ticker, interval: '1d', limit: 30 });
      } else {
        throw err;
      }
    }

    const klines = response.data || [];
    // Kline fields: [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
    const series = klines.map((k) => ({
      t: k[0],
      price: Number(k[4]),
    }));

    if (!series.length) {
      return res.status(502).json({ error: 'History not available' });
    }

    const volume24h = klines.length
      ? klines.reduce((sum, k) => sum + Number(k[7] || 0), 0)
      : null;

    const payload = {
      symbol,
      days,
      interval,
      points: series,
      volume24h,
      source: `${url}?symbol=${ticker}&interval=${binanceInterval}&limit=${limit}`,
    };

    historyCache.set(cacheKey, { payload, timestamp: Date.now() });

    res.json(payload);
  } catch (error) {
    const status = error.response?.status || 500;

    if ((status === 429 || status === 401 || status === 403) && cached) {
      return res.json({
        ...cached.payload,
        cached: true,
        warning:
          status === 429
            ? 'Upstream rate limit hit, serving cached history.'
            : 'Upstream rejected request, serving cached history. Set API_KEY if needed.',
      });
    }

    if (status === 429 && !cached) {
      // Fall back to a flat series using the latest spot price to avoid empty charts.
      const spot = priceCache.get(`${ticker}:usd`);
      if (spot?.price) {
        const now = Date.now();
        const points = Array.from({ length: 12 }, (_, idx) => ({
          t: now - (11 - idx) * 5 * 60 * 1000, // 5-minute steps back
          price: spot.price,
        }));
        return res.json({
          symbol,
          days,
          interval,
          points,
          volume24h: null,
          source: `${url} (fallback)`,
          cached: true,
          warning: 'Upstream rate limit hit, serving flat fallback from latest spot.',
        });
      }
    }

    if (status === 401) {
      return res.status(401).json({
        error: 'Unauthorized with upstream. Provide API_KEY if required by provider.',
        details: error.response?.data || null,
      });
    }

    res.status(status).json({
      error: 'History request failed',
      details: error.response?.data || null,
    });
  }
});

app.get('/price', async (req, res) => {
  const symbol = (req.query.symbol || 'BTC').toUpperCase();
  const currency = (req.query.currency || 'USD').toUpperCase();
  const ticker = symbolToId[symbol];
  const cacheKey = `${ticker}:${currency}`;

  if (!ticker) {
    return res.status(400).json({ error: 'Unsupported symbol' });
  }
  if (currency !== 'USD') {
    return res.status(400).json({ error: 'Only USD quotes are supported in this demo.' });
  }

  const cached = priceCache.get(cacheKey);
  const isCacheFresh = cached && Date.now() - cached.timestamp < CACHE_TTL_MS;
  if (isCacheFresh) {
    return res.json({ ...cached, cached: true });
  }

  try {
    let response;
    try {
      response = await axios.get(PRICE_API_BASE, {
        params: { symbol: ticker },
        headers: buildHeaders(),
        timeout: 5000,
      });
    } catch (err) {
      // Binance may return validation errors; retry with avgPrice endpoint.
      response = await axios.get('https://api.binance.com/api/v3/avgPrice', {
        params: { symbol: ticker },
        headers: buildHeaders(),
        timeout: 5000,
      });
    }

    const price = Number(response.data?.price || response.data?.priceAvg || response.data?.avgPrice);

    if (price === undefined) {
      return res.status(502).json({ error: 'Price not available' });
    }

    const payload = {
      symbol,
      currency: currency.toUpperCase(),
      price,
      source: PRICE_API_BASE,
      timestamp: Date.now(),
    };

    priceCache.set(cacheKey, payload);

    res.json(payload);
  } catch (error) {
    const status = error.response?.status || 500;

    if (status === 429 && cached) {
      // Serve slightly stale data when upstream is rate-limiting.
      return res.status(200).json({
        ...cached,
        cached: true,
        warning: 'Upstream rate limit hit, serving cached price.',
      });
    }

    res.status(status).json({
      error: 'Upstream request failed',
      details: error.response?.data || null,
    });
  }
});

// SERVE STATIC ASSETS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));

// API routes are defined above, this is the fallback for SPA routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Secure proxy running on http://localhost:${PORT}`);
});
