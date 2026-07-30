import { createPublicClient, http, isAddress, isAddressEqual, parseAbiItem, zeroAddress, type Address } from "viem";

const RPC_URL = process.env.ROBINHOOD_RPC_URL;
const CHAIN_ID = process.env.ROBINHOOD_CHAIN_ID;
const POSITION_MANAGER_ADDRESS = process.env.POSITION_MANAGER_ADDRESS as
  | Address
  | undefined;
const V4_POSITION_MANAGER_ADDRESS = process.env.V4_POSITION_MANAGER_ADDRESS as
  | Address
  | undefined;

if (!RPC_URL || !CHAIN_ID || !POSITION_MANAGER_ADDRESS || !V4_POSITION_MANAGER_ADDRESS) {
  throw new Error(
    "Missing chain config. Set ROBINHOOD_RPC_URL, ROBINHOOD_CHAIN_ID, POSITION_MANAGER_ADDRESS, and V4_POSITION_MANAGER_ADDRESS in backend/.env"
  );
}

if (!isAddress(POSITION_MANAGER_ADDRESS) || !isAddress(V4_POSITION_MANAGER_ADDRESS)) {
  throw new Error("POSITION_MANAGER_ADDRESS / V4_POSITION_MANAGER_ADDRESS is not a valid address");
}

const robinhoodChain = {
  id: Number(CHAIN_ID),
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

const ERC20_SYMBOL_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
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
};

async function getTokenSymbol(tokenAddress: Address): Promise<string> {
  if (isAddressEqual(tokenAddress, zeroAddress)) return "ETH";

  try {
    return await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_SYMBOL_ABI,
      functionName: "symbol",
    });
  } catch {
    return tokenAddress.slice(0, 6) + "…";
  }
}

async function getOpenV3Positions(walletAddress: Address): Promise<OpenPosition[]> {
  const balance = await publicClient.readContract({
    address: POSITION_MANAGER_ADDRESS as Address,
    abi: V3_NFPM_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });

  const total = Number(balance);
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

  return Promise.all(
    open.map(async ({ tokenId, position }) => {
      const [symbol0, symbol1] = await Promise.all([
        getTokenSymbol(position[2]),
        getTokenSymbol(position[3]),
      ]);

      return {
        tokenId: tokenId.toString(),
        protocol: "v3" as const,
        token0: position[2],
        token1: position[3],
        symbol0,
        symbol1,
        fee: position[4],
        liquidity: position[7].toString(),
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

  const candidateTokenIds = [...new Set(incomingTransfers.map((log) => log.args.tokenId!))];
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

  const ownedTokenIds = candidateTokenIds.filter((_, i) =>
    isAddressEqual(owners[i], walletAddress)
  );
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
    .map((tokenId, i) => ({ tokenId, liquidity: liquidities[i], poolKey: poolInfos[i][0] }))
    .filter(({ liquidity }) => liquidity > 0n);

  return Promise.all(
    open.map(async ({ tokenId, liquidity, poolKey }) => {
      const [symbol0, symbol1] = await Promise.all([
        getTokenSymbol(poolKey.currency0),
        getTokenSymbol(poolKey.currency1),
      ]);

      return {
        tokenId: tokenId.toString(),
        protocol: "v4" as const,
        token0: poolKey.currency0,
        token1: poolKey.currency1,
        symbol0,
        symbol1,
        fee: poolKey.fee,
        liquidity: liquidity.toString(),
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
