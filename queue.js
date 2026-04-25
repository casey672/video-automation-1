const fetch = require("node-fetch");

let queue = [];
let processing = false;

// =========================
// SAFE SHEET UPDATE
// =========================
async function updateSheet(rowIndex, updates) {
  if (!process.env.SHEET_WEBHOOK) {
    console.log("⚠️ SHEET_WEBHOOK missing — skipping update");
    return;
  }

  try {
    await fetch(process.env.SHEET_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIndex, updates })
    });
  } catch (err) {
    console.log("⚠️ Sheet update failed:", err.message);
  }
}

// =========================
// PROCESS QUEUE
// =========================
async function processQueue() {
  if (processing) return;
  processing = true;

  console.log("🔥 PROCESS QUEUE STARTED");

  try {
    while (queue.length > 0) {
      const job = queue.shift();

      console.log("⚙️ Processing job:", job);

      await updateSheet(job.row, {
        status: "PROCESSING"
      });

      // simulate work
      await new Promise((r) => setTimeout(r, 2000));

      await updateSheet(job.row, {
        status: "DONE"
      });
    }
  } catch (err) {
    console.log("❌ Queue crashed:", err.message);
  }

  processing = false;
}

// =========================
// ENQUEUE
// =========================
function enqueue(job) {
  console.log("📦 Adding job to queue");

  if (!job || !job.row) {
    console.log("⚠️ Invalid job format:", job);
    return;
  }

  queue.push(job);
  processQueue();
}

module.exports = { enqueue };