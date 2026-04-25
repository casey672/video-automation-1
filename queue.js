const fetch = require("node-fetch");
const { google } = require("googleapis");
const fs = require("fs");

let queue = [];
let processing = false;

// =========================
// YOUTUBE AUTH
// =========================
function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
  });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

// =========================
// YOUTUBE UPLOAD
// =========================
async function uploadToYouTube(videoPath, title) {
  console.log("📺 Uploading to YouTube:", title);
  const youtube = getYouTubeClient();
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: title,
        description: "Auto-generated estate planning video by My Texas Estate Plan",
        tags: ["estate planning", "texas", "wills", "trusts"],
        categoryId: "27"
      },
      status: {
        privacyStatus: "public"
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });
  const videoUrl = `https://www.youtube.com/watch?v=${res.data.id}`;
  console.log("✅ Uploaded to YouTube:", videoUrl);
  return videoUrl;
}

// =========================
// VIDEO GENERATION (placeholder)
// =========================
async function generateVideo(job) {
  console.log("🎬 Generating video for:", job.topic);
  await new Promise(r => setTimeout(r, 5000));
  return "output.mp4";
}

// =========================
// SHEET UPDATE
// =========================
async function updateSheet(rowIndex, updates) {
  if (!process.env.SHEET_WEBHOOK) {
    console.log("❌ SHEET_WEBHOOK is missing — aborting");
    return;
  }
  console.log("📤 Sending to Sheets:", { rowIndex, updates });
  try {
    const res = await fetch(process.env.SHEET_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIndex, updates })
    });
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

      await updateSheet(job.row, { status: "PROCESSING" });
      const videoPath = await generateVideo(job);
      const videoUrl = await uploadToYouTube(videoPath, job.topic);
      await updateSheet(job.row, {
        status: "DONE",
        youtubeUrl: videoUrl
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