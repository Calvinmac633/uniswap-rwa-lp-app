import {
  createPublicClient,
  http,
  isAddress,
  isAddressEqual,
  parseAbiItem,
  encodeAbiParameters,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { currentDisplayPrice, tickDisplayPrice, getAmountsForLiquidity } from "./uniswapMath.js";
import { log } from "./logger.js";

const RPC_URL = process.env.ROBINHOOD_RPC_URL;
const CHAIN_ID = process.env.ROBINHOOD_CHAIN_ID;
const POSITION_MANAGER_ADDRESS = process.env.POSITION_MANAGER_ADDRESS as Address | undefined;
const V4_POSITION_MANAGER_ADDRESS = process.env.V4_POSITION_MANAGER_ADDRESS as Address | undefined;
const V3_FACTORY_ADDRESS = process.env.V3_FACTORY_ADDRESS as Address | undefined;
const V4_STATE_VIEW_ADDRESS = process.env.V4_STATE_VIEW_ADDRESS as Address | undefined;

const REQUIRED_ADDRESSES = {
  POSITION_MANAGER_ADDRESS,
  V4_POSITION_MANAGER_ADDRESS,
  V3_FACTORY_ADDRESS,
  V4_STATE_VIEW_ADDRESS,
};

if (!RPC_URL || !CHAIN_ID || Object.values(REQUIRED_ADDRESSES).some((v) => !v)) {
  throw new Error(
    "Missing chain config. Set ROBINHOOD_RPC_URL, ROBINHOOD_CHAIN_ID, POSITION_MANAGER_ADDRESS, " +
      "V4_POSITION_MANAGER_ADDRESS, V3_FACTORY_ADDRESS, and V4_STATE_VIEW_ADDRESS in backend/.env"
  );
}

for (const [name, value] of Object.entries(REQUIRED_ADDRESSES)) {
  if (!isAddress(value as string)) {
    throw new Error(`${name} is not a valid address`);
  }
}

export const CHAIN_ID_NUMBER = Number(CHAIN_ID);

const robinhoodChain = {
  id: CHAIN_ID_NUMBER,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
});

// Minimal v3 NonfungiblePositionManager ABI: enumerate a wallet's token IDs and
// read each position's liquidity to tell open positions from closed ones.
const V3_NFPM_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

// v4 PositionManager ABI. Unlike v3, this is plain ERC721 (no tokenOfOwnerByIndex),
// so owned token IDs are found via Transfer event logs, then confirmed with ownerOf.
const V4_POSM_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getPositionLiquidity",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
  {
    type: "function",
    name: "getPoolAndPositionInfo",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "info", type: "uint256" },
    ],
  },
] as const;

const V4_TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

const V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

const V3_POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const V4_STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type OpenPosition = {
  tokenId: string;
  protocol: "v3" | "v4";
  token0: Address;
  token1: Address;
  symbol0: string;
  symbol1: string;
  fee: number;
  liquidity: string;
  amount0: number;
  amount1: number;
  currentPrice: number; // token1 per token0, decimal-adjusted
  priceLower: number; // token1 per token0, decimal-adjusted
  priceUpper: number; // token1 per token0, decimal-adjusted
  inRange: boolean;
};

type TokenMeta = { symbol: string; decimals: number };

// Token metadata never changes, so cache it across positions and requests.
const tokenMetaCache = new Map<string, Promise<TokenMeta>>();

async function getTokenMeta(tokenAddress: Address): Promise<TokenMeta> {
  if (isAddressEqual(tokenAddress, zeroAddress)) {
    return { symbol: "ETH", decimals: 18 };
  }

  const key = tokenAddress.toLowerCase();
  let cached = tokenMetaCache.get(key);
  if (!cached) {
    cached = (async () => {
      try {
        const [symbol, decimals] = await Promise.all([
          publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" }),
          publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
        ]);
        return { symbol, decimals };
      } catch {
        return { symbol: tokenAddress.slice(0, 6) + "…", decimals: 18 };
      }
    })();
    tokenMetaCache.set(key, cached);
  }
  return cached;
}

function toInt24(packed: bigint): number {
  const v = Number(packed & 0xffffffn);
  return v >= 0x800000 ? v - 0x1000000 : v;
}

// v4's PositionInfo is a packed uint256: [200 bits poolId | 24 bits tickUpper | 24 bits tickLower | 8 bits flag]
function decodeV4PositionInfo(info: bigint): { tickLower: number; tickUpper: number } {
  return {
    tickLower: toInt24(info >> 8n),
    tickUpper: toInt24(info >> 32n),
  };
}

function computeV4PoolId(poolKey: {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint24" },
      { type: "int24" },
      { type: "address" },
    ],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  return keccak256(encoded);
}

type PricedPosition = {
  amount0: number;
  amount1: number;
  currentPrice: number;
  priceLower: number;
  priceUpper: number;
  inRange: boolean;
};

function priceV3Or4Position(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): PricedPosition {
  const { amount0, amount1 } = getAmountsForLiquidity({
    liquidity,
    sqrtPriceX96,
    currentTick,
    tickLower,
    tickUpper,
    decimals0,
    decimals1,
  });

  return {
    amount0,
    amount1,
    currentPrice: currentDisplayPrice(sqrtPriceX96, decimals0, decimals1),
    priceLower: tickDisplayPrice(tickLower, decimals0, decimals1),
    priceUpper: tickDisplayPrice(tickUpper, decimals0, decimals1),
    inRange: currentTick >= tickLower && currentTick < tickUpper,
  };
}

async function getOpenV3Positions(walletAddress: Address): Promise<OpenPosition[]> {
  const balance = await publicClient.readContract({
    address: POSITION_MANAGER_ADDRESS as Address,
    abi: V3_NFPM_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });

  const total = Number(balance);
  log("chain:v3", `${walletAddress} holds ${total} v3 position NFT(s)`);
  if (total === 0) return [];

  const tokenIds = await Promise.all(
    Array.from({ length: total }, (_, index) =>
      publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as Address,
        abi: V3_NFPM_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [walletAddress, BigInt(index)],
      })
    )
  );

  const positions = await Promise.all(
    tokenIds.map((tokenId) =>
      publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as Address,
        abi: V3_NFPM_ABI,
        functionName: "positions",
        args: [tokenId],
      })
    )
  );

  // positions() returns a positional tuple: [nonce, operator, token0, token1, fee,
  // tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128,
  // tokensOwed0, tokensOwed1]
  const open = tokenIds
    .map((tokenId, i) => ({ tokenId, position: positions[i] }))
    .filter(({ position }) => position[7] > 0n);
  log("chain:v3", `${open.length}/${total} have nonzero liquidity (open)`);

  const poolAddresses = await Promise.all(
    open.map(({ position }) =>
      publicClient.readContract({
        address: V3_FACTORY_ADDRESS as Address,
        abi: V3_FACTORY_ABI,
        functionName: "getPool",
        args: [position[2], position[3], position[4]],
      })
    )
  );

  const slot0s = await Promise.all(
    poolAddresses.map((poolAddress) =>
      publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "slot0" })
    )
  );

  return Promise.all(
    open.map(async ({ tokenId, position }, i) => {
      const [meta0, meta1] = await Promise.all([getTokenMeta(position[2]), getTokenMeta(position[3])]);
      const [sqrtPriceX96, currentTick] = slot0s[i];
      const priced = priceV3Or4Position(
        position[7],
        sqrtPriceX96,
        currentTick,
        position[5],
        position[6],
        meta0.decimals,
        meta1.decimals
      );

      return {
        tokenId: tokenId.toString(),
        protocol: "v3" as const,
        token0: position[2],
        token1: position[3],
        symbol0: meta0.symbol,
        symbol1: meta1.symbol,
        fee: position[4],
        liquidity: position[7].toString(),
        ...priced,
      };
    })
  );
}

async function getOpenV4Positions(walletAddress: Address): Promise<OpenPosition[]> {
  // v4's PositionManager has no tokenOfOwnerByIndex, so find candidate token IDs from
  // Transfer logs (to = wallet), then confirm current ownership with ownerOf — the
  // wallet may have since transferred some of those tokens away.
  const incomingTransfers = await publicClient.getLogs({
    address: V4_POSITION_MANAGER_ADDRESS as Address,
    event: V4_TRANSFER_EVENT,
    args: { to: walletAddress },
    fromBlock: 0n,
    toBlock: "latest",
  });

  const candidateTokenIds = [...new Set(incomingTransfers.map((entry) => entry.args.tokenId!))];
  log(
    "chain:v4",
    `${walletAddress}: ${incomingTransfers.length} incoming transfer(s), ${candidateTokenIds.length} distinct token ID(s)`
  );
  if (candidateTokenIds.length === 0) return [];

  const owners = await Promise.all(
    candidateTokenIds.map((tokenId) =>
      publicClient.readContract({
        address: V4_POSITION_MANAGER_ADDRESS as Address,
        abi: V4_POSM_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      })
    )
  );

  const ownedTokenIds = candidateTokenIds.filter((_, i) => isAddressEqual(owners[i], walletAddress));
  log("chain:v4", `${ownedTokenIds.length}/${candidateTokenIds.length} still currently owned`);
  if (ownedTokenIds.length === 0) return [];

  const [liquidities, poolInfos] = await Promise.all([
    Promise.all(
      ownedTokenIds.map((tokenId) =>
        publicClient.readContract({
          address: V4_POSITION_MANAGER_ADDRESS as Address,
          abi: V4_POSM_ABI,
          functionName: "getPositionLiquidity",
          args: [tokenId],
        })
      )
    ),
    Promise.all(
      ownedTokenIds.map((tokenId) =>
        publicClient.readContract({
          address: V4_POSITION_MANAGER_ADDRESS as Address,
          abi: V4_POSM_ABI,
          functionName: "getPoolAndPositionInfo",
          args: [tokenId],
        })
      )
    ),
  ]);

  const open = ownedTokenIds
    .map((tokenId, i) => ({
      tokenId,
      liquidity: liquidities[i],
      poolKey: poolInfos[i][0],
      ...decodeV4PositionInfo(poolInfos[i][1]),
    }))
    .filter(({ liquidity }) => liquidity > 0n);
  log("chain:v4", `${open.length}/${ownedTokenIds.length} have nonzero liquidity (open)`);

  const poolIds = open.map(({ poolKey }) => computeV4PoolId(poolKey));

  const slot0s = await Promise.all(
    poolIds.map((poolId) =>
      publicClient.readContract({
        address: V4_STATE_VIEW_ADDRESS as Address,
        abi: V4_STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId],
      })
    )
  );

  return Promise.all(
    open.map(async ({ tokenId, liquidity, poolKey, tickLower, tickUpper }, i) => {
      const [meta0, meta1] = await Promise.all([
        getTokenMeta(poolKey.currency0),
        getTokenMeta(poolKey.currency1),
      ]);
      const [sqrtPriceX96, currentTick] = slot0s[i];
      const priced = priceV3Or4Position(
        liquidity,
        sqrtPriceX96,
        currentTick,
        tickLower,
        tickUpper,
        meta0.decimals,
        meta1.decimals
      );

      return {
        tokenId: tokenId.toString(),
        protocol: "v4" as const,
        token0: poolKey.currency0,
        token1: poolKey.currency1,
        symbol0: meta0.symbol,
        symbol1: meta1.symbol,
        fee: poolKey.fee,
        liquidity: liquidity.toString(),
        ...priced,
      };
    })
  );
}

export async function getOpenPositions(walletAddress: Address): Promise<OpenPosition[]> {
  const [v3, v4] = await Promise.all([
    getOpenV3Positions(walletAddress),
    getOpenV4Positions(walletAddress),
  ]);

  return [...v3, ...v4];
}
