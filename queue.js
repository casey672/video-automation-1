const fetch = require("node-fetch");

let queue = [];
let processing = false;

// =========================
// SAFE SHEET UPDATE
// =========================
async function updateSheet(rowIndex, updates) {
if (!process.env.SHEET_WEBHOOK) {
  console.log("❌ SHEET_WEBHOOK is missing — aborting request");
  return;
}
console.log("🧪 SHEET_WEBHOOK =", process.env.SHEET_WEBHOOK);  
console.log("📤 Sending to Sheets:", {
    rowIndex,
    updates,
    url: process.env.SHEET_WEBHOOK
  });

  try {
const res = await fetch(process.env.SHEET_WEBHOOK, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rowIndex, updates })
});

console.log("📥 Sheet response status:", res.status);

const text = await res.text();
console.log("📥 Sheet response:", text);

  } catch (err) {
    console.log("❌ Sheet update failed:", err.message);
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