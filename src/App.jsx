import { useEffect, useRef, useState } from 'react'
import './App.css'

const ASSETS = [
  { key: 'ETH', name: 'Ethereum', binanceSymbol: 'ETHUSDT' },
  { key: 'BTC', name: 'Bitcoin', binanceSymbol: 'BTCUSDT' },
]
const INITIAL_HISTORY = [2942, 2958, 2951, 2978, 2966, 2989, 2974, 3002, 2991, 3018, 3008, 3034, 3026, 3048, 3039, 3057, 3044, 3068, 3059, 3076, 3061, 3082, 3071, 3089]
const PERIODS = [
  { label: 'NOW', interval: '1m', limit: 5, points: 300 },
  { label: '1H', interval: '1m', limit: 60, points: 300 },
  { label: '24H', interval: '5m', limit: 288, points: 288 },
  { label: '7D', interval: '1h', limit: 168, points: 288 },
  { label: '1M', interval: '1h', limit: 720, points: 300 },
  { label: '1Y', interval: '1d', limit: 365, points: 300 },
]

function resample(values, targetLength) {
  if (!values.length || targetLength <= 0) return []
  if (values.length === targetLength) return values
  return Array.from({ length: targetLength }, (_, index) => {
    const position = (index / (targetLength - 1)) * (values.length - 1)
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.ceil(position)
    if (lowerIndex === upperIndex) return values[lowerIndex]
    const fraction = position - lowerIndex
    return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * fraction
  })
}

function formatPrice(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCompact(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`
  if (number >= 1_000) return `${(number / 1_000).toFixed(2)}K`
  return number.toFixed(2)
}

function EthereumIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="eth-icon">
      <path d="M16 3 7.7 16.2 16 20.8l8.3-4.6L16 3Z" fill="currentColor" opacity=".95" />
      <path d="m16 22.2-8.3-4.6L16 29l8.3-11.4-8.3 4.6Z" fill="currentColor" opacity=".68" />
      <path d="m16 3v17.8l8.3-4.6L16 3Z" fill="#fff" opacity=".22" />
    </svg>
  )
}

function BitcoinIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="eth-icon">
      <path d="M20.8 14.2c2.1-.8 3-2.2 3-4.1 0-3.2-2.6-4.8-6.8-5V2h-2.2v3h-1.8V2h-2.2v3.1H7v2.4h2.1c1 0 1.5.5 1.5 1.4v14c0 .7-.4 1.1-1.1 1.1H7v2.6h3.8V30H13v-3.3h1.8V30H17v-3.4c4.7-.3 7.8-2.1 7.8-6.1 0-3.1-1.5-5.1-4-6.3Zm-7.7-6.6h3.4c2.2 0 3.5.7 3.5 2.4 0 1.6-1.3 2.5-3.6 2.5h-3.3V7.6Zm4.1 15.4h-4.1v-5.8h4.1c2.5 0 3.9.9 3.9 2.9 0 2-1.4 2.9-3.9 2.9Z" fill="currentColor" />
    </svg>
  )
}

function TrendIcon({ down = false }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={down ? 'trend-icon down' : 'trend-icon'}>
      <path d={down ? 'M3 4h10l-5 8-5-8Z' : 'M3 12h10L8 4l-5 8Z'} fill="currentColor" />
    </svg>
  )
}

function applyDeltaFrame(current, message) {
  if (!message || typeof message !== 'object' || typeof message.sequence !== 'number') {
    return { ticker: current, accepted: false }
  }

  if (message.kind === 'delta') {
    if (typeof current.sequence !== 'number' || message.sequence !== current.sequence + 1) {
      return { ticker: current, accepted: false }
    }
    if (message.patch != null && (typeof message.patch !== 'object' || Array.isArray(message.patch))) {
      return { ticker: current, accepted: false }
    }
    return {
      ticker: { ...current, ...(message.patch ?? {}), sequence: message.sequence },
      accepted: true,
    }
  }

  if (message.kind === 'snapshot' && message.ticker && typeof message.ticker === 'object') {
    return {
      ticker: { ...message.ticker, sequence: message.sequence },
      accepted: true,
    }
  }

  return { ticker: current, accepted: false }
}

function formatPointTime(timestamp, period) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (period === 'NOW') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function Chart({ history, historyTimes, positive, period }) {
  const width = 760
  const height = 230
  const padding = 8
  const [hoverIndex, setHoverIndex] = useState(null)
  const [tooltipX, setTooltipX] = useState(0)
  const values = history
  if (values.length === 0) {
    return (
      <div className="chart-tooltip-shell">
        <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Ethereum price history">
          {[45, 90, 135, 180].map((y) => (
            <line key={y} x1="0" y1={y} x2={width} y2={y} className="chart-grid" />
          ))}
        </svg>
      </div>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = values.length === 1
      ? padding
      : padding + (index / (values.length - 1)) * (width - padding * 2)
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return [x, y]
  })
  const area = `M ${points[0][0]} ${height} L ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} L ${points.at(-1)[0]} ${height} Z`
  const last = points.at(-1)

  return (
    <div className="chart-tooltip-shell">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Ethereum price history"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
          setHoverIndex(Math.round(ratio * (values.length - 1)))
          setTooltipX(Math.max(70, Math.min(rect.width - 70, event.clientX - rect.left)))
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={positive ? '#2dd4bf' : '#fb7185'} stopOpacity=".25" />
            <stop offset="100%" stopColor={positive ? '#2dd4bf' : '#fb7185'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[45, 90, 135, 180].map((y) => (
          <line key={y} x1="0" y1={y} x2={width} y2={y} className="chart-grid" />
        ))}
        <path d={area} fill="url(#chartArea)" />
        {points.slice(1).map((point, index) => {
          const previous = points[index]
          const rising = values[index + 1] >= values[index]
          return (
            <line
              key={index}
              x1={previous[0]}
              y1={previous[1]}
              x2={point[0]}
              y2={point[1]}
              stroke={rising ? '#35d3bd' : '#fb7185'}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        })}
        {hoverIndex !== null && (
          <>
            <line x1={points[hoverIndex][0]} y1="0" x2={points[hoverIndex][0]} y2={height} className="chart-crosshair" />
            <circle cx={points[hoverIndex][0]} cy={points[hoverIndex][1]} r="5" fill={positive ? '#35d3bd' : '#fb7185'} stroke="#101827" strokeWidth="3" />
          </>
        )}
        <circle cx={last[0]} cy={last[1]} r="5" fill={positive ? '#35d3bd' : '#fb7185'} stroke="#101827" strokeWidth="3" />
      </svg>
      {hoverIndex !== null && (
        <div className="chart-tooltip" style={{ left: tooltipX }}>
          <span>{formatPointTime(historyTimes[hoverIndex], period)}</span>
          <strong>${formatPrice(values[hoverIndex])} USD</strong>
        </div>
      )}
    </div>
  )
}

function App() {
  const [asset, setAsset] = useState('ETH')
  const [ticker, setTicker] = useState({
    price: 3072.48,
    change: 2.84,
    open: 2987.62,
    high: 3098.21,
    low: 2974.12,
    volume: 184200,
    quoteVolume: 568420000,
    sequence: null,
  })
  const [history, setHistory] = useState(INITIAL_HISTORY)
  const [historyTimes, setHistoryTimes] = useState([])
  const [period, setPeriod] = useState('24H')
  const [connection, setConnection] = useState('connecting')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [stale, setStale] = useState(false)
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const latestPriceRef = useRef(3072.48)
  const periodRef = useRef('24H')

  useEffect(() => {
    shouldReconnectRef.current = true
    const socketUrl = `ws://127.0.0.1:8001/v1/markets/${asset.toLowerCase()}/delta`

    const connect = () => {
      if (!shouldReconnectRef.current) return
      setConnection('connecting')
      const socket = new WebSocket(socketUrl)
      socketRef.current = socket

      socket.onopen = () => setConnection('live')
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          setTicker((current) => {
            const result = applyDeltaFrame(current, message)
            if (!result.accepted) return current
            latestPriceRef.current = Number(result.ticker.price)
            if (Array.isArray(message.history) && periodRef.current === 'NOW') {
              const sampledHistory = message.history.slice(-300)
              setHistory(sampledHistory)
              const now = Date.now()
              setHistoryTimes(Array.from({ length: sampledHistory.length }, (_, index) =>
                now - (sampledHistory.length - index - 1) * 1000,
              ))
            }
            return result.ticker
          })
          setLastUpdate(Date.now())
          setStale(false)
        } catch {
          // Ignore malformed frames; the previous telemetry frame remains visible.
        }
      }
      socket.onerror = () => setConnection('reconnecting')
      socket.onclose = () => {
        setConnection('reconnecting')
        reconnectRef.current = window.setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      shouldReconnectRef.current = false
      window.clearTimeout(reconnectRef.current)
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
      }
    }
  }, [asset])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate > 15000) setStale(true)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [lastUpdate])

  useEffect(() => {
    periodRef.current = period
  }, [period])

  useEffect(() => {
    const selected = PERIODS.find((item) => item.label === period) ?? PERIODS[2]
    const symbol = ASSETS.find((item) => item.key === asset)?.binanceSymbol ?? 'ETHUSDT'
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${selected.interval}&limit=${selected.limit}`

    if (period === 'NOW') {
      const liveTimer = window.setInterval(() => {
        const price = latestPriceRef.current
        setHistory((current) => {
          if (current.length < 300) return [...current, price]
          return [...current.slice(1), price]
        })
        setHistoryTimes((current) => {
          const next = [...current, Date.now()]
          return current.length >= 300 ? next.slice(1) : next
        })
      }, 1000)
      return () => window.clearInterval(liveTimer)
    }

    const refreshCandles = () => {
      fetch(url)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          if (!Array.isArray(data)) return
          const prices = data
            .map((candle) => Number(candle[4]))
            .filter((price) => Number.isFinite(price))
          if (prices.length) {
            setHistory(resample(prices, selected.points))
            const times = data
              .map((candle) => Number(candle[0]))
              .filter((timestamp) => Number.isFinite(timestamp))
            setHistoryTimes(resample(times, selected.points))
          }
        })
        .catch(() => {})
    }

    refreshCandles()
    const refreshInterval = 30000
    const refreshTimer = window.setInterval(refreshCandles, refreshInterval)

    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [period, asset])

  const timeframeChange = history.length > 1
    ? ((history.at(-1) - history[0]) / history[0]) * 100
    : ticker.change
  const positive = timeframeChange >= 0
  const status = stale ? 'stale' : connection

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">{asset === 'ETH' ? <EthereumIcon /> : <BitcoinIcon />}</div>
          <span>{ASSETS.find((item) => item.key === asset)?.name}</span>
        </div>
        <div className="asset-switch" role="group" aria-label="Select cryptocurrency">
          {ASSETS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={asset === item.key}
              onClick={() => {
                setAsset(item.key)
              }}
            >
              {item.key}
            </button>
          ))}
        </div>
        <div className={`status status-${status}`} role="status" aria-live="polite">
          <span className="status-dot" />
          {status === 'live' ? 'Live' : status === 'stale' ? 'Stale data' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
        </div>
      </header>

      <section className="content">
        <div className="market-heading">
          <div>
            <h1>
              ${formatPrice(ticker.price)}
              <span className="currency">USD</span>
            </h1>
            <div className="change" aria-label={`${timeframeChange.toFixed(2)}% change for ${period}`}>
              <TrendIcon down={!positive} />
              <span>{positive ? '+' : ''}{timeframeChange.toFixed(2)}%</span>
              <span className="change-period">{period.toLowerCase()}</span>
            </div>
          </div>
        </div>

        <section className="chart-card" aria-label="Ethereum price chart">
          <div className="chart-top">
            <div className="chart-tabs" role="tablist" aria-label="Chart period">
              {PERIODS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={period === item.label}
                  onClick={() => {
                    setPeriod(item.label)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-wrap">
            <Chart history={history} historyTimes={historyTimes} positive={positive} period={period} />
          </div>
        </section>

        <section className="metrics" aria-label="24 hour market statistics">
          <div className="metric">
            <p>24h High</p>
            <strong>${formatPrice(ticker.high)} USD</strong>
          </div>
          <div className="metric">
            <p>24h Low</p>
            <strong>${formatPrice(ticker.low)} USD</strong>
          </div>
          <div className="metric">
            <p>24h Volume</p>
            <strong>{formatCompact(ticker.volume)} {asset}</strong>
          </div>
          <div className="metric">
            <p>24h Quote Volume</p>
            <strong>${formatCompact(ticker.quoteVolume)} USD</strong>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
