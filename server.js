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
    // Shared-secret check (draft). Requires a NEW env var RUN_TOKEN on Render + Script Property on the
    // Apps Script side; do not enable until CASEY finishes the env-var work.
    if (process.env.RUN_TOKEN && req.get("X-Run-Token") !== process.env.RUN_TOKEN) {
      return res.status(401).json({ status: "error", message: "unauthorized" });
    }
    const job = req.body || {};
    console.log("📥 Received job row", job.row, "jobId", job.jobId || "(none)");
    if (!enqueue) {
      // Previously this returned 200 "queued" and silently dropped the job -> row stuck in PROCESSING.
      return res.status(503).json({ status: "error", message: "queue not loaded" });
    }
    const r = enqueue(job);
    if (!r.accepted) return res.status(r.reason === "invalid" ? 400 : 409).json({ status: "rejected", reason: r.reason });
    res.status(202).json({ status: "queued", jobId: job.jobId || null, position: r.position });
  } catch (err) {
    console.error("❌ Route error:", err.message);
    res.status(500).json({ status: "error", message: "Server failed to process job" });
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