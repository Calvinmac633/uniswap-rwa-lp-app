import { useState, type FormEvent } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const LAST_ADDRESS_KEY = "lastWalletAddress";

type Status = "idle" | "loading" | "success" | "error";

function App() {
  const [address, setAddress] = useState(
    () => localStorage.getItem(LAST_ADDRESS_KEY) ?? ""
  );
  const [status, setStatus] = useState<Status>("idle");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    setCount(null);
    localStorage.setItem(LAST_ADDRESS_KEY, address.trim());

    try {
      const res = await fetch(`${API_BASE}/api/positions/${address.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setCount(data.count);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <main className="page">
      <h1>Uniswap LP Position Lookup</h1>
      <p className="subtitle">
        Enter a wallet address to see how many Uniswap concentrated liquidity
        positions it holds on Robinhood Chain.
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
          <p className="count">
            {count} position{count === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
