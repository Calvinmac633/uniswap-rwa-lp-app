import { createPublicClient, http, isAddress, type Address } from "viem";

const RPC_URL = process.env.ROBINHOOD_RPC_URL;
const CHAIN_ID = process.env.ROBINHOOD_CHAIN_ID;
const POSITION_MANAGER_ADDRESS = process.env.POSITION_MANAGER_ADDRESS as
  | Address
  | undefined;

if (!RPC_URL || !CHAIN_ID || !POSITION_MANAGER_ADDRESS) {
  throw new Error(
    "Missing chain config. Set ROBINHOOD_RPC_URL, ROBINHOOD_CHAIN_ID, and POSITION_MANAGER_ADDRESS in backend/.env"
  );
}

if (!isAddress(POSITION_MANAGER_ADDRESS)) {
  throw new Error("POSITION_MANAGER_ADDRESS is not a valid address");
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

// Minimal NonfungiblePositionManager ABI: enumerate a wallet's token IDs and
// read each position's liquidity to tell open positions from closed ones.
const NFPM_ABI = [
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

export async function getOpenPositionCount(walletAddress: Address): Promise<number> {
  const balance = await publicClient.readContract({
    address: POSITION_MANAGER_ADDRESS as Address,
    abi: NFPM_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });

  const total = Number(balance);
  if (total === 0) return 0;

  const tokenIds = await Promise.all(
    Array.from({ length: total }, (_, index) =>
      publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as Address,
        abi: NFPM_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [walletAddress, BigInt(index)],
      })
    )
  );

  const positions = await Promise.all(
    tokenIds.map((tokenId) =>
      publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS as Address,
        abi: NFPM_ABI,
        functionName: "positions",
        args: [tokenId],
      })
    )
  );

  // positions() returns a positional tuple; index 7 is `liquidity` per the ABI above.
  return positions.filter((position) => position[7] > 0n).length;
}
