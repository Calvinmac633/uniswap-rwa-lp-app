import "dotenv/config";
import cors from "cors";
import express from "express";
import { isAddress, type Address } from "viem";
import { getOpenPositions } from "./chain.js";
import { getStockTokenAddresses } from "./stockTokens.js";
import { getPositionValue } from "./pricing.js";
import { log } from "./logger.js";

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

  log("api", `GET /api/positions/${address}`);

  try {
    const [positions, stockTokenAddresses] = await Promise.all([
      getOpenPositions(address as Address),
      getStockTokenAddresses(),
    ]);
    log("api", `${positions.length} open position(s) across v3+v4`);

    const stockPositions = positions
      .filter(
        (p) =>
          stockTokenAddresses.has(p.token0.toLowerCase()) ||
          stockTokenAddresses.has(p.token1.toLowerCase())
      )
      .map((p) => ({ ...p, ...getPositionValue(p) }));
    log("api", `${stockPositions.length} are tokenized-stock pools`);

    const totalValueUSD = stockPositions.reduce((sum, p) => sum + (p.valueUSD ?? 0), 0);
    log(
      "api",
      `response: ${stockPositions.length} position(s), total ~$${totalValueUSD.toFixed(2)}`,
      stockPositions.map((p) => ({
        pair: `${p.symbol0}/${p.symbol1}`,
        protocol: p.protocol,
        tokenId: p.tokenId,
        valueUSD: p.valueUSD,
        inRange: p.inRange,
      }))
    );

    res.json({ address, count: stockPositions.length, positions: stockPositions });
  } catch (err) {
    log("api", "request failed", err);
    res.status(502).json({ error: "Failed to read positions from chain" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
