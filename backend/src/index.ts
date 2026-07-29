import "dotenv/config";
import cors from "cors";
import express from "express";
import { isAddress, type Address } from "viem";
import { getOpenPositionCount } from "./chain.js";

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
    const count = await getOpenPositionCount(address as Address);
    res.json({ address, count });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to read position count from chain" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
