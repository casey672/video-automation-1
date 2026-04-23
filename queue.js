const { runAutomation } = require("./automation");

const queue = [];
let isProcessing = false;

function enqueue(job) {
  queue.push(job);
}

async function updateSheet(rowIndex, updates) {
<<<<<<< HEAD
  const SHEET_WEBHOOK =
    "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

  await fetch(SHEET_WEBHOOK, {
=======
  await fetch(process.env.SHEET_WEBHOOK, {
>>>>>>> 28344a79736b7b97d3b32cb232f7c4b232320145
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowIndex, updates })
  });
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;

  const job = queue.shift();
  isProcessing = true;

  const { rowIndex, topic } = job;

  try {
    await updateSheet(rowIndex, { status: "PROCESSING" });

    const result = await runAutomation(job);

    await updateSheet(rowIndex, {
      status: "DONE",
      yt_script: result.script,
      yt_url: result.videoUrl || "",
      social_caption: result.caption,
      linkedin_status: "READY",
      facebook_status: "READY",
      gbp_status: "READY"
    });

  } catch (err) {
    await updateSheet(rowIndex, {
      status: "ERROR",
      last_error: err.message
    });
  }

  isProcessing = false;
}

setInterval(processQueue, 3000);

module.exports = { enqueue };