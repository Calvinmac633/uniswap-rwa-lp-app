// Concentrated-liquidity math for *display* purposes only (not for executing trades).
// Uses floating point rather than porting Uniswap's exact fixed-point TickMath —
// plenty precise for showing dollar amounts, not precise enough to move funds with.

const Q96 = 2 ** 96;

function tickToRawPrice(tick: number): number {
  // price = 1.0001^tick, in raw (un-decimal-adjusted) token1-per-token0 units.
  return Math.pow(1.0001, tick);
}

function sqrtPriceX96ToRawPrice(sqrtPriceX96: bigint): number {
  const ratio = Number(sqrtPriceX96) / Q96;
  return ratio * ratio;
}

function decimalsAdjustment(decimals0: number, decimals1: number): number {
  return Math.pow(10, decimals0 - decimals1);
}

export function displayPrice(rawPrice: number, decimals0: number, decimals1: number): number {
  return rawPrice * decimalsAdjustment(decimals0, decimals1);
}

export function currentDisplayPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  return displayPrice(sqrtPriceX96ToRawPrice(sqrtPriceX96), decimals0, decimals1);
}

export function tickDisplayPrice(tick: number, decimals0: number, decimals1: number): number {
  return displayPrice(tickToRawPrice(tick), decimals0, decimals1);
}

export type LiquidityAmountsParams = {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  decimals0: number;
  decimals1: number;
};

// Standard Uniswap v3/v4 "amounts from liquidity" formulas (whitepaper §2.2 / periphery
// LiquidityAmounts.sol), evaluated in raw token-unit space then scaled by decimals.
export function getAmountsForLiquidity(params: LiquidityAmountsParams): {
  amount0: number;
  amount1: number;
} {
  const { liquidity, sqrtPriceX96, currentTick, tickLower, tickUpper, decimals0, decimals1 } = params;

  const L = Number(liquidity);
  const sqrtP = Math.sqrt(sqrtPriceX96ToRawPrice(sqrtPriceX96));
  const sqrtPa = Math.sqrt(tickToRawPrice(tickLower));
  const sqrtPb = Math.sqrt(tickToRawPrice(tickUpper));

  let amount0Raw: number;
  let amount1Raw: number;

  if (currentTick < tickLower) {
    amount0Raw = L * (1 / sqrtPa - 1 / sqrtPb);
    amount1Raw = 0;
  } else if (currentTick >= tickUpper) {
    amount0Raw = 0;
    amount1Raw = L * (sqrtPb - sqrtPa);
  } else {
    amount0Raw = L * (1 / sqrtP - 1 / sqrtPb);
    amount1Raw = L * (sqrtP - sqrtPa);
  }

  return {
    amount0: amount0Raw / Math.pow(10, decimals0),
    amount1: amount1Raw / Math.pow(10, decimals1),
  };
}
