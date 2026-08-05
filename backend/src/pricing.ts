import type { OpenPosition } from "./chain.js";

const USD_SYMBOL = "USDG";

export type PositionValue = {
  valueUSD: number | null;
  stockSymbol: string | null;
  stockPriceUSD: number | null;
  priceRangeLowUSD: number | null;
  priceRangeHighUSD: number | null;
};

// Nearly every pool here pairs a stock token against USDG (a $1-pegged stablecoin),
// so we can read the stock's USD price straight off the pool itself. This is specific
// to how this app's pools are structured, which is why it's kept separate from the
// protocol-generic reads in chain.ts.
export function getPositionValue(position: OpenPosition): PositionValue {
  const empty: PositionValue = {
    valueUSD: null,
    stockSymbol: null,
    stockPriceUSD: null,
    priceRangeLowUSD: null,
    priceRangeHighUSD: null,
  };

  if (position.symbol1 === USD_SYMBOL) {
    const stockPriceUSD = position.currentPrice; // token1(USDG) per token0(stock)
    return {
      valueUSD: position.amount1 + position.amount0 * stockPriceUSD,
      stockSymbol: position.symbol0,
      stockPriceUSD,
      priceRangeLowUSD: position.priceLower,
      priceRangeHighUSD: position.priceUpper,
    };
  }

  if (position.symbol0 === USD_SYMBOL) {
    const stockPriceUSD = 1 / position.currentPrice; // invert: token0(stock) per token1(USDG) -> USDG per stock
    return {
      valueUSD: position.amount0 + position.amount1 * stockPriceUSD,
      stockSymbol: position.symbol1,
      stockPriceUSD,
      priceRangeLowUSD: 1 / position.priceUpper,
      priceRangeHighUSD: 1 / position.priceLower,
    };
  }

  return empty;
}
