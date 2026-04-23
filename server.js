require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

// =========================
// HEALTH CHECK (Render)
// =========================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// =========================
// QUEUE PLACEHOLDER (safe)
// =========================
// If queue.js exists, this will load it.
// If not, it won’t crash your server.
let enqueue = null;

try {
  const queue = require("./queue");
  enqueue = queue.enqueue;
} catch (err) {
  console.log("Queue not loaded yet — running in basic mode");
}

// =========================
// MAIN WEBHOOK (Google Sheets)
// =========================
app.post("/runAutomation", (req, res) => {
  const job = req.body;

  console.log("📥 Received job:", job);

  if (enqueue) {
    enqueue(job);
  }

  res.json({
    status: "queued",
    message: "Job received"
  });
});

// =========================
// PORT CONFIG (RENDER SAFE)
// =========================
const PORT = process.env.PORT || 3000;

// =========================
// START SERVER (ONLY ONCE)
// =========================
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});