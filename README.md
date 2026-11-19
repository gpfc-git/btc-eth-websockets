# Crypto WebSocket Dashboard

A React dashboard for tracking Bitcoin and Ethereum prices in USD. It uses a local delta WebSocket relay backed by Binance market data.

## Run locally

```bash
npm install
npm run delta-server
```

In another terminal:

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

## Features

- Switch between BTC and ETH.
- Live delta updates with reconnect handling.
- NOW view with a rolling 300-point, one-second history.
- Time ranges from 1 hour to 1 year.
- Gain/loss calculated for the selected range.
- Hover chart points for their timestamp and USD value.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the React development server |
| `npm run delta-server` | Start the Binance-backed WebSocket relay |
| `npm run build` | Create a production build |
| `npm run lint` | Run Oxlint |

The relay listens on `ws://127.0.0.1:8001` and connects to Binance public WebSocket streams. No API key is required.
