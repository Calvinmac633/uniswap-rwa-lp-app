import { useState, type FormEvent } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const LAST_ADDRESS_KEY = "lastWalletAddress";

type Status = "idle" | "loading" | "success" | "error";

type Position = {
  tokenId: string;
  protocol: "v3" | "v4";
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  fee: number;
  liquidity: string;
  amount0: number;
  amount1: number;
  currentPrice: number;
  priceLower: number;
  priceUpper: number;
  inRange: boolean;
  valueUSD: number | null;
  stockSymbol: string | null;
  stockPriceUSD: number | null;
  priceRangeLowUSD: number | null;
  priceRangeHighUSD: number | null;
};

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatUSD(value: number | null): string {
  return value === null ? "—" : usdFormatter.format(value);
}

function formatPrice(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function App() {
  const [address, setAddress] = useState(
    () => localStorage.getItem(LAST_ADDRESS_KEY) ?? ""
  );
  const [status, setStatus] = useState<Status>("idle");
  const [count, setCount] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    setCount(null);
    setPositions([]);
    localStorage.setItem(LAST_ADDRESS_KEY, address.trim());

    console.log(`[positions] fetching for ${address.trim()}`);

    try {
      const res = await fetch(`${API_BASE}/api/positions/${address.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        console.error("[positions] request failed:", data);
        throw new Error(data.error ?? "Something went wrong");
      }

      console.log(`[positions] ${data.count} position(s) received:`, data.positions);
      setCount(data.count);
      setPositions(data.positions ?? []);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  const totalValueUSD = positions.reduce((sum, p) => sum + (p.valueUSD ?? 0), 0);

  return (
    <main className="page">
      <h1>Uniswap LP Position Lookup</h1>
      <p className="subtitle">
        Enter a wallet address to see its open Uniswap concentrated liquidity
        positions in tokenized-stock pools on Robinhood Chain.
      </p>

      <form onSubmit={handleSubmit} className="lookup-form">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="0x..."
          spellCheck={false}
        />
        <button type="submit" disabled={!address.trim() || status === "loading"}>
          {status === "loading" ? "Checking..." : "Check positions"}
        </button>
      </form>

      <div className="result">
        {status === "error" && <p className="error">{error}</p>}
        {status === "success" && count !== null && (
          <>
            <p className="count">
              {count} position{count === 1 ? "" : "s"}
              {positions.length > 0 && (
                <span className="total-value"> · {formatUSD(totalValueUSD)}</span>
              )}
            </p>
            {positions.length > 0 && (
              <ul className="position-list">
                {positions.map((p) => (
                  <li key={`${p.protocol}-${p.tokenId}`} className="position-row">
                    <div className="position-row-top">
                      <span className="pair">
                        <span className="protocol-badge">{p.protocol}</span>
                        <span
                          className={`range-dot ${p.inRange ? "in-range" : "out-of-range"}`}
                          title={p.inRange ? "In range" : "Out of range"}
                        />
                        {p.symbol0} / {p.symbol1}
                      </span>
                      <span className="value">{formatUSD(p.valueUSD)}</span>
                    </div>
                    <div className="position-row-bottom">
                      <span className="detail">
                        {p.stockSymbol
                          ? `${p.stockSymbol} @ ${formatUSD(p.stockPriceUSD)}`
                          : `${formatPrice(p.currentPrice)}`}
                        {" · Range "}
                        {formatPrice(p.priceRangeLowUSD ?? p.priceLower)}
                        {" – "}
                        {formatPrice(p.priceRangeHighUSD ?? p.priceUpper)}
                      </span>
                      <span className="detail">
                        {(p.fee / 10000).toString()}% · #{p.tokenId}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default App;
