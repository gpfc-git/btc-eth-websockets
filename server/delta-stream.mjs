import { createServer } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'

const HOST = '127.0.0.1'
const PORT = 8001
const KEYFRAME_EVERY = 8
const ASSETS = {
  eth: { symbol: 'ETHUSDT', name: 'Ethereum' },
  btc: { symbol: 'BTCUSDT', name: 'Bitcoin' },
}

const streams = Object.fromEntries(
  Object.entries(ASSETS).map(([key, config]) => [
    key,
    {
      ...config,
      sequence: 0,
      ticker: { price: 0, change: 0, open: 0, high: 0, low: 0, volume: 0, quoteVolume: 0 },
      history: [],
    },
  ]),
)

async function loadInitialTicker(asset) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${asset.symbol}`)
    if (!response.ok) return
    const data = await response.json()
    asset.ticker = {
      price: Number(data.lastPrice),
      change: Number(data.priceChangePercent),
      open: Number(data.openPrice),
      high: Number(data.highPrice),
      low: Number(data.lowPrice),
      volume: Number(data.volume),
      quoteVolume: Number(data.quoteVolume),
    }
  } catch {
    // The upstream ticker stream can still provide the first state.
  }
}

const httpServer = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('ETH/BTC delta WebSocket\n')
})

const wss = new WebSocketServer({ noServer: true })

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

httpServer.on('upgrade', (request, socket, head) => {
  const assetKey = request.url?.match(/^\/v1\/markets\/(eth|btc)\/delta$/)?.[1]
  if (!assetKey) {
    socket.destroy()
    return
  }
  socket.assetKey = assetKey
  wss.handleUpgrade(request, socket, head, (webSocket) => {
    webSocket.assetKey = assetKey
    wss.emit('connection', webSocket, request)
  })
})

wss.on('connection', (socket) => {
  const asset = streams[socket.assetKey]
  send(socket, {
    kind: 'snapshot',
    sequence: asset.sequence,
    timestamp: Date.now(),
    ticker: asset.ticker,
    history: asset.history,
  })
})

function broadcast(assetKey, message) {
  for (const socket of wss.clients) {
    if (socket.assetKey === assetKey) send(socket, message)
  }
}

function connectUpstream(assetKey) {
  const asset = streams[assetKey]
  const upstream = new WebSocket(`wss://stream.binance.com:9443/ws/${asset.symbol.toLowerCase()}@ticker`)

  upstream.on('open', () => {
    process.stdout.write('Connected to Binance ticker stream\n')
  })

  upstream.on('message', (payload) => {
    try {
      const data = JSON.parse(payload.toString())
      const next = {
        price: Number(data.c),
        change: Number(data.P),
        open: Number(data.o),
        high: Number(data.h),
        low: Number(data.l),
        volume: Number(data.v),
        quoteVolume: Number(data.q),
      }
      if (!Number.isFinite(next.price)) return

      const previous = asset.ticker
      asset.ticker = next
      asset.sequence += 1
      const patch = {}
      for (const key of Object.keys(next)) {
        if (next[key] !== previous[key]) patch[key] = next[key]
      }

      broadcast(
        assetKey,
        asset.sequence % KEYFRAME_EVERY === 0
          ? {
              kind: 'snapshot',
              sequence: asset.sequence,
              timestamp: Date.now(),
              ticker: asset.ticker,
              history: asset.history,
            }
          : {
              kind: 'delta',
              sequence: asset.sequence,
              timestamp: Date.now(),
              patch,
              history: asset.history,
            },
      )
    } catch {
      // Ignore malformed upstream frames.
    }
  })

  upstream.on('close', () => {
    setTimeout(() => connectUpstream(assetKey), 3000)
  })

  upstream.on('error', () => {
    upstream.close()
  })
}

httpServer.listen(PORT, HOST, async () => {
  await Promise.all(Object.values(streams).map(loadInitialTicker))
  process.stdout.write(`ETH/BTC delta streams listening at ws://${HOST}:${PORT}\n`)
  for (const assetKey of Object.keys(streams)) connectUpstream(assetKey)
  setInterval(() => {
    for (const asset of Object.values(streams)) {
      const price = asset.ticker.price
      if (!Number.isFinite(price) || price <= 0) continue
      asset.history = [...asset.history.slice(-299), price]
    }
  }, 1000)
})
