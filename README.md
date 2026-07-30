# Uniswap RWA LP App

Enter a wallet address, see its open Uniswap concentrated liquidity (v3 + v4) positions in tokenized-stock/ETF pools on Robinhood Chain.

## Structure

- `frontend/` — React + TypeScript (Vite)
- `backend/` — Node + Express + TypeScript, reads the chain via [viem](https://viem.sh)

## Setup

1. Backend config: copy `backend/.env.example` to `backend/.env` and fill in:
   - `ROBINHOOD_RPC_URL`
   - `ROBINHOOD_CHAIN_ID`
   - `POSITION_MANAGER_ADDRESS` (Uniswap v3 NonfungiblePositionManager on Robinhood Chain)
   - `V4_POSITION_MANAGER_ADDRESS` (Uniswap v4 PositionManager on Robinhood Chain)

2. Install dependencies:

   ```
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Run both (separate terminals):

   ```
   cd backend && npm run dev    # http://localhost:3001
   cd frontend && npm run dev   # http://localhost:5173
   ```

The frontend calls `GET /api/positions/:address` on the backend, which:
1. Reads the wallet's v3 position NFTs (`NonfungiblePositionManager`) and v4 positions (`PositionManager`, found via `Transfer` event logs since v4 isn't enumerable) on Robinhood Chain.
2. Keeps only positions with nonzero liquidity (open, not closed/withdrawn).
3. Keeps only positions involving a token from Robinhood's official tokenized-stock/ETF registry (`GET https://api.robinhood.com/rhj/assets`, cached 10 min) — see `backend/src/stockTokens.ts`.

### Reference: tokenized stock/USDG pools seen on Robinhood Chain (as of 2026-07-30)

Superseded by the live registry above, but kept here as a point-in-time reference:

```
AAPL/USDG   — v3·0.3% · v4·0.3% · v4·1%
AMD/USDG    — v4·1%
AMZN/USDG   — v3·0.3% · v4·0.3%
COST/USDG   — v3·0.3%
DELL/USDG   — v3·1%
GME/USDG    — v3·0.05% · v3·0.3% · v3·1% · v4·1%
GOOGL/USDG  — v4·0.3%
INTC/USDG   — v3·0.3% · v4·1% · v4·1.099%
META/USDG   — v4·0.3%
MSFT/USDG   — v3·0.3% · v4·0.3%
MU/USDG     — v4·1%
NFLX/USDG   — v3·1% · v4·1%
NVDA/USDG   — v3·0.05% · v3·0.3% · v4·0.3% · v4·1%
PLTR/USDG   — v4·1%
QQQ/USDG    — v3·0.3%
RDDT/USDG   — v3·1%
SLV/USDG    — v3·1%
SNDK/USDG   — v4·1%
SPCX/USDG   — v3·0.05% · v3·0.3% · v4·0.3% · v4·1%
SPY/USDG    — v3·0.3% · v4·0.3%
TSLA/USDG   — v3·0.3% · v4·0.3%
USO/USDG    — v3·1%
```

*Initially created: July 29, 2026*