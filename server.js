require("dotenv").config();
const express = require("express");

// 🔥 GLOBAL ERROR HANDLERS (put here)
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
});

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
  try {
    const job = req.body;

    console.log("📥 Received job:", job);

    if (enqueue) {
      enqueue(job);
    } else {
      console.log("⚠️ Queue not available — job skipped");
    }

    res.json({
      status: "queued",
      message: "Job received"
    });

  } catch (err) {
    console.error("❌ Route error:", err.message);

    res.status(500).json({
      status: "error",
      message: "Server failed to process job"
    });
  }
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