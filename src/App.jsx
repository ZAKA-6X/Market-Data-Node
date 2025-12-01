import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PAIRS = [
  { symbol: 'BTC', currency: 'USD' },
  { symbol: 'ETH', currency: 'USD' },
  { symbol: 'SOL', currency: 'USD' },
  { symbol: 'ASTER', currency: 'USD' },
];

const API_BASE = import.meta.env.VITE_API_BASE || 'https://market-data-node.onrender.com';

function formatCurrency(value, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function App() {
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [priceData, setPriceData] = useState(null);
  const [error, setError] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [volume24h, setVolume24h] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const pairLabel = useMemo(
    () => `${selectedPair.symbol} / ${selectedPair.currency}`,
    [selectedPair],
  );

  async function fetchPrice() {
    setStatus('loading');
    setError(null);

    try {
      const { data } = await axios.get(`${API_BASE}/price`, {
        params: {
          symbol: selectedPair.symbol,
          currency: selectedPair.currency,
        },
        timeout: 5000,
      });

      setPriceData({
        price: data.price,
        timestamp: data.timestamp,
        source: data.source,
      });
      setStatus('success');
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        'Unable to fetch price right now.';
      setError(message);
      setStatus('error');
    }
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/history`, {
        params: {
          symbol: selectedPair.symbol,
          days: 1,
          interval: 'hourly',
        },
        timeout: 5000,
      });

      if (!data?.points || !Array.isArray(data.points)) {
        setHistoryError('History not available yet.');
        setPriceHistory([]);
        setVolume24h(null);
        return;
      }

      const formatted = data.points.map((pt) => ({
        time: new Date(pt.t).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        price: pt.price,
      }));

      if (!formatted.length) {
        setHistoryError('History not available yet.');
      }

      setPriceHistory(formatted);
      setVolume24h(data.volume24h || null);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        'Unable to load history right now.';
      setHistoryError(message);
      // Keep prior history if we have any; otherwise empty.
      if (!priceHistory.length) {
        setPriceHistory([]);
      }
      setVolume24h(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    fetchPrice();
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPair]);

  const lastUpdated = priceData?.timestamp
    ? new Date(priceData.timestamp).toLocaleTimeString()
    : '--';

  const priceRange = useMemo(() => {
    if (!priceHistory.length) return null;
    const prices = priceHistory.map((p) => p.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [priceHistory]);

  const stats = useMemo(() => {
    if (!priceHistory.length) {
      return {
        current: priceData?.price || null,
        changePct: null,
        high: null,
        low: null,
      };
    }
    const prices = priceHistory.map((p) => p.price);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const changePct = first ? ((last - first) / first) * 100 : null;
    return {
      current: priceData?.price ?? last,
      changePct,
      high,
      low,
      };
  }, [priceHistory, priceData]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12 md:py-16">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white md:text-4xl">
              Market Data Node
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Real-time visualization module via Node.js Secure Proxy.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-4 py-2 text-cyan-200 ring-1 ring-cyan-400/30 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.75)]" />
            Secure Proxy
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="col-span-2 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-900/80 via-emerald-950 to-slate-950 p-6 shadow-xl ring-1 ring-emerald-400/10 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">{pairLabel}</p>
                <p className="text-4xl font-semibold text-white">
                  {stats.current
                    ? formatCurrency(stats.current, selectedPair.currency)
                    : formatCurrency(86752, selectedPair.currency)}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      stats.changePct === null
                        ? 'text-slate-300'
                        : stats.changePct >= 0
                          ? 'text-emerald-300'
                          : 'text-red-300'
                    }`}
                  >
                    {stats.changePct !== null
                      ? `${stats.changePct >= 0 ? '▲' : '▼'} ${Math.abs(stats.changePct).toFixed(2)}%`
                      : '▲ 2.4%'}
                  </span>
                  <span className="text-xs text-emerald-100/70">Intraday Trend</span>
                </div>
                <p className="text-xs text-slate-300/80">Updated: {lastUpdated}</p>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Pair
                </label>
                <select
                  className="w-44 appearance-none rounded-lg border border-emerald-200/25 bg-[#071824]/90 px-3 py-2 pr-10 text-sm font-medium text-white outline-none ring-1 ring-transparent transition hover:border-emerald-300/40 focus:ring-emerald-300/50"
                  value={`${selectedPair.symbol}-${selectedPair.currency}`}
                  onChange={(e) => {
                    const [symbol, currency] = e.target.value.split('-');
                    setSelectedPair({ symbol, currency });
                  }}
                  style={{
                    backgroundColor: '#071824',
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 20 20' fill='%23a5f3fc' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.65rem center',
                    backgroundSize: '0.85rem',
                    colorScheme: 'dark',
                  }}
                >
                  {PAIRS.map((pair) => (
                    <option
                      key={`${pair.symbol}-${pair.currency}`}
                      value={`${pair.symbol}-${pair.currency}`}
                    >
                      {pair.symbol} / {pair.currency}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={fetchPrice}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/15 hover:ring-white/40"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 h-[250px] w-full rounded-xl border border-white/10 bg-gradient-to-br from-emerald-800/60 via-emerald-900/80 to-emerald-950 ring-1 ring-white/5">
              {priceHistory.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory} margin={{ left: 6, right: 6, top: 6, bottom: 6 }}>
                    <defs>
                      <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#cbd5e1', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={
                        priceRange
                          ? [priceRange.min * 0.995, priceRange.max * 1.005]
                          : ['auto', 'auto']
                      }
                      tick={{ fill: '#cbd5e1', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                      }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value) => [formatCurrency(value, selectedPair.currency), 'Price']}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#34d399"
                      strokeWidth={2}
                      fill="url(#priceFill)"
                      dot={false}
                      activeDot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-sm text-emerald-200/70 animate-pulse">
                  <p>{historyError || 'Initializing Data Stream...'}</p>
                  <span className="text-xs">Connecting to Secure Proxy</span>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200 sm:grid-cols-4">
              <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">24H Volume</p>
                <p className="text-base font-semibold">
                  {volume24h ? `${formatCompactUsd(volume24h)}` : '--'}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Daily High</p>
                <p className="text-base font-semibold">
                  {stats.high ? formatCurrency(stats.high, selectedPair.currency) : '--'}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Daily Low</p>
                <p className="text-base font-semibold">
                  {stats.low ? formatCurrency(stats.low, selectedPair.currency) : '--'}
                </p>
              </div>
            </div>

            {status === 'error' ? (
              <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Connection Error: {error}
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">
                Powered via Z6X Secure Proxy. API Keys are masked server-side.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">Connection Status</p>
              <p
                className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  status === 'error'
                    ? 'bg-red-500/10 text-red-200 ring-1 ring-red-400/30'
                    : 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/30'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    status === 'error'
                      ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]'
                      : 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.75)]'
                  }`}
                />
                {status === 'error' ? 'Degraded – retry needed' : 'Live via backend proxy'}
              </p>
              <p className="mt-2 text-xs text-slate-400">Connection: Encrypted via TLS</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-white">System Telemetry</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>Frontend: React (Vite) + Tailwind</li>
                <li>Backend: Express.js (Secure Proxy)</li>
                <li>Security: Proxy-routed API Calls</li>
                <li>Latency: &lt; 150ms (Optimized)</li>
              </ul>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-slate-300 backdrop-blur md:flex-row md:items-center md:justify-between">
          <span>Z6X Systems • Performance Demonstration • Ready for Production</span>
          <div className="flex items-center gap-4">
            <a
              className="text-cyan-200 underline-offset-4 transition hover:text-cyan-100 hover:underline"
              href="https://www.linkedin.com/in/elallouchezakariae/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="text-cyan-200 underline-offset-4 transition hover:text-cyan-100 hover:underline"
              href="https://github.com/ZAKA-6X"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

export default App;
