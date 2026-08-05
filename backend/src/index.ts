import "dotenv/config";
import cors from "cors";
import express from "express";
import { isAddress, type Address } from "viem";
import { getOpenPositions } from "./chain.js";
import { getStockTokenAddresses } from "./stockTokens.js";
import { getPositionValue } from "./pricing.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/api/positions/:address", async (req, res) => {
  const { address } = req.params;

  if (!isAddress(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  try {
    const [positions, stockTokenAddresses] = await Promise.all([
      getOpenPositions(address as Address),
      getStockTokenAddresses(),
    ]);

    const stockPositions = positions
      .filter(
        (p) =>
          stockTokenAddresses.has(p.token0.toLowerCase()) ||
          stockTokenAddresses.has(p.token1.toLowerCase())
      )
      .map((p) => ({ ...p, ...getPositionValue(p) }));

    res.json({ address, count: stockPositions.length, positions: stockPositions });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to read positions from chain" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
