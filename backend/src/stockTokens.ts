import { CHAIN_ID_NUMBER } from "./chain.js";

const ASSETS_API_URL = "https://api.robinhood.com/rhj/assets";
const CACHE_TTL_MS = 10 * 60 * 1000;

type RobinhoodAsset = {
  tokenSymbol: string;
  status: string;
  deployments: Array<{ contractAddress: string; chainId: number }>;
};

type RobinhoodAssetsResponse = { assets: RobinhoodAsset[] };

let cache: { addresses: Set<string>; fetchedAt: number } | null = null;

async function fetchStockTokenAddresses(): Promise<Set<string>> {
  const res = await fetch(ASSETS_API_URL);
  if (!res.ok) {
    throw new Error(`Robinhood assets API returned ${res.status}`);
  }

  const data = (await res.json()) as RobinhoodAssetsResponse;
  const addresses = new Set<string>();

  for (const asset of data.assets) {
    if (asset.status !== "ASSET_STATUS_ACTIVE") continue;
    for (const deployment of asset.deployments) {
      if (deployment.chainId === CHAIN_ID_NUMBER) {
        addresses.add(deployment.contractAddress.toLowerCase());
      }
    }
  }

  return addresses;
}

// Cached with a short TTL so newly listed stock tokens show up without a restart,
// per Robinhood's documented API cache window (~15s) — 10 min is plenty fresher
// than that for a personal-use app and keeps us well under any rate limit.
export async function getStockTokenAddresses(): Promise<Set<string>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.addresses;
  }

  const addresses = await fetchStockTokenAddresses();
  cache = { addresses, fetchedAt: Date.now() };
  return addresses;
}
