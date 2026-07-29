# Uniswap RWA LP App

Enter a wallet address, see how many Uniswap concentrated liquidity (v3/v4) position NFTs it holds on Robinhood Chain.

## Structure

- `frontend/` — React + TypeScript (Vite)
- `backend/` — Node + Express + TypeScript, reads the chain via [viem](https://viem.sh)

## Setup

1. Backend config: copy `backend/.env.example` to `backend/.env` and fill in:
   - `ROBINHOOD_RPC_URL`
   - `ROBINHOOD_CHAIN_ID`
   - `POSITION_MANAGER_ADDRESS` (Uniswap NonfungiblePositionManager on Robinhood Chain)

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

The frontend calls `GET /api/positions/:address` on the backend, which calls `balanceOf` on the NonfungiblePositionManager contract and returns the raw NFT count. Note: this count includes closed/zero-liquidity positions — filtering for open positions is a later step.

*Initially created: July 29, 2026*