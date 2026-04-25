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

  while (queue.length > 0) {
    const job = queue.shift();

    try {
      console.log("⚙️ Processing job:", job);

      // mark as processing
      if (job.row) {
        await updateSheet(job.row, { status: "PROCESSING" });
      }

      // 🔥 YOUR REAL WORK WILL GO HERE LATER
      await new Promise((res) => setTimeout(res, 2000));

      // mark done
      if (job.row) {
        await updateSheet(job.row, {
          status: "DONE",
          output: "completed"
        });
      }

    } catch (err) {
      console.log("❌ Job failed:", err.message);

      if (job.row) {
        await updateSheet(job.row, {
          status: "ERROR",
          error: err.message
        });
      }
    }
  }

  processing = false;
}

// =========================
// ENQUEUE
// =========================
function enqueue(job) {
  console.log("📦 Adding job to queue");

  // basic validation
  if (!job || !job.row) {
    console.log("⚠️ Invalid job format:", job);
    return;
  }

  queue.push(job);
  processQueue();
}

module.exports = { enqueue };