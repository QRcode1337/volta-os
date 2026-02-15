# ErisMorn Dashboard 🍎

Personal workspace dashboard fully integrated with ErisMorn/OpenClaw.

## Quick Start

```bash
./start.sh
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Features

- Live Cron Job Status (SENTINEL, SCOUT, CURATOR, etc.)
- BTC Price Ticker
- Portfolio Margin Status
- Critical Alerts & Opportunities
- Action Log from memory files
- Send messages to ErisMorn main session

## API Endpoints

- GET /api/cron-jobs - Fetch cron jobs
- GET /api/heartbeat-state - Current state
- GET /api/btc-price - BTC price
- POST /api/send-message - Message ErisMorn

🍎 All hail Discordia
