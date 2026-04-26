require("dotenv").config();
const fetch = require("node-fetch");
const { google } = require("googleapis");
const fs = require("fs");
const crypto = require("crypto");

let queue = [];
let processing = false;

// =========================
// GOOGLE AUTH
// =========================
function getGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    (process.env.GOOGLE_CLIENT_ID || "").trim(),
    (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials({
    refresh_token: (process.env.GOOGLE_REFRESH_TOKEN || "").trim()
  });
  return oauth2Client;
}

// =========================
// YOUTUBE CLIENT
// =========================
function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    (process.env.YOUTUBE_CLIENT_ID || "").trim(),
    (process.env.YOUTUBE_CLIENT_SECRET || "").trim(),
    "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials({
    refresh_token: (process.env.YOUTUBE_REFRESH_TOKEN || "").trim()
  });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

// =========================
// STEP 1 — GENERATE SCRIPT
// =========================
async function generateScript(topic, hook) {
  console.log("✍️ Generating script for:", topic);

  const selectedHook = hook || [
    "Most families in Texas get this wrong.",
    "This mistake can cost your family thousands.",
    "Nobody tells you this about wills.",
    "If you own a home in Texas, listen.",
    "Your ex could inherit your money. Here's why.",
    "Dying without a will in Texas is expensive."
  ][Math.floor(Math.random() * 6)];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": (process.env.ANTHROPIC_API_KEY || "").trim(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Write a 7-10 second YouTube Shorts script for My Texas Estate Plan, an estate planning law firm in Tyler, Texas.

HOOK (use this EXACT line to open): ${selectedHook}
TOPIC: ${topic}
VOICE: Casey Cook, estate planning attorney. Dry, deadpan Texas humor. Self-deprecating. Never preachy.

RULES:
- Hook MUST be the FIRST line verbatim
- 2-3 sentences max after the hook
- Fast punchline or cliffhanger ending
- No hashtags, no markdown, no asterisks
- End with: Call Casey — (903) 561-8644

Return ONLY the script text.`
      }]
    })
  });

  const data = await response.json();
  return data.content[0].text.trim();
}

// =========================
// STEP 2 — GOOGLE TTS
// =========================
async function generateVoiceover(script) {
  console.log("🎙️ Generating voiceover...");
  const auth = getGoogleAuth();
  let token;
  try {
    const result = await auth.getAccessToken();
    token = result.token;
    console.log("🔑 Got access token:", token ? "YES" : "NO");
  } catch (err) {
    throw new Error("OAuth token failed: " + err.message);
  }

  const cleanText = script
    .replace(/\*/g, "")
    .replace(/#/g, "")
    .replace(/—/g, ", ");

  const response = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        input: { text: cleanText },
        voice: {
          languageCode: "en-US",
          name: "en-US-Neural2-D",
          ssmlGender: "MALE"
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 0.95,
          pitch: -1.0
        }
      })
    }
  );

  const data = await response.json();
  if (!data.audioContent) throw new Error("TTS failed: " + JSON.stringify(data));
  console.log("✅ Voiceover generated");
  return data.audioContent;
}

// =========================
// STEP 3 — CLOUDINARY
// =========================
async function uploadToCloudinary(audioBase64) {
  console.log("☁️ Uploading audio to Cloudinary...");
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureStr = `folder=mytxestateplan&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

  const formData = new URLSearchParams();
  formData.append("file", `data:audio/mp3;base64,${audioBase64}`);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", "mytxestateplan");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    { method: "POST", body: formData }
  );

  const result = await response.json();
  if (!result.secure_url) throw new Error("Cloudinary failed: " + JSON.stringify(result));
  console.log("✅ Cloudinary URL:", result.secure_url);
  return result.secure_url;
}

// =========================
// STEP 4 — PEXELS VIDEO
// =========================
async function fetchPexelsVideo(topic) {
  console.log("🎬 Fetching Pexels background...");
  const keywords = topic.split(" ").slice(0, 3).join(" ");
  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(keywords)}&per_page=5&orientation=portrait`,
    { headers: { Authorization: (process.env.PEXELS_API_KEY || "").trim() } }
  );

  const result = await response.json();
  if (!result.videos || result.videos.length === 0) return null;

  const files = result.videos[0].video_files
    .filter(f => f.quality === "hd" || f.quality === "sd")
    .sort((a, b) => b.width - a.width);

  return files.length > 0 ? files[0].link : null;
}

// =========================
// STEP 5 — CREATOMATE
// =========================
async function renderWithCreatomate(script, audioUrl, bgUrl) {
  console.log("🎨 Rendering with Creatomate...");
  const modifications = { voiceover: audioUrl, captions: script };
  if (bgUrl) modifications.background_video = bgUrl;

  const response = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(process.env.CREATOMATE_API_KEY || "").trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      template_id: "2890bb76-8448-4d37-be98-76b1f25ecd56",
      modifications
    })
  });

  const result = await response.json();
  if (!result[0] || !result[0].id) throw new Error("Creatomate failed: " + JSON.stringify(result));
  return await pollCreatomate(result[0].id);
}

async function pollCreatomate(renderId) {
  console.log("⏳ Polling Creatomate render...");
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const response = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
      headers: { Authorization: `Bearer ${(process.env.CREATOMATE_API_KEY || "").trim()}` }
    });
    const result = await response.json();
    console.log("Render status:", result.status);
    if (result.status === "succeeded") return result.url;
    if (result.status === "failed") throw new Error("Render failed: " + result.error_message);
  }
  throw new Error("Render timed out.");
}

// =========================
// FULL VIDEO PIPELINE
// =========================
async function generateVideo(job) {
  console.log("🎬 Starting full pipeline for:", job.topic);
  const script = await generateScript(job.topic, job.hook);
  console.log("📝 Script:", script);
  const audioBase64 = await generateVoiceover(script);
  const audioUrl = await uploadToCloudinary(audioBase64);
  const bgUrl = await fetchPexelsVideo(job.topic);
  const videoUrl = await renderWithCreatomate(script, audioUrl, bgUrl);
  console.log("✅ Video ready:", videoUrl);
  return videoUrl;
}

// =========================
// YOUTUBE UPLOAD
// =========================
async function uploadToYouTube(videoUrl, title) {
  console.log("📺 Uploading to YouTube:", title);

  const cleanTitle = title
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const videoResponse = await fetch(videoUrl);
  const videoBuffer = await videoResponse.buffer();
  const tmpPath = `/tmp/${Date.now()}.mp4`;
  fs.writeFileSync(tmpPath, videoBuffer);

  const youtube = getYouTubeClient();
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: cleanTitle,
        description: "Auto-generated estate planning video by My Texas Estate Plan. Call (903) 561-8644.",
        tags: ["estate planning", "texas", "wills", "trusts", "tyler texas"],
        categoryId: "27"
      },
      status: { privacyStatus: "public" }
    },
    media: { body: fs.createReadStream(tmpPath) }
  });

  fs.unlinkSync(tmpPath);
  const ytUrl = `https://www.youtube.com/watch?v=${res.data.id}`;
  console.log("✅ Uploaded:", ytUrl);
  return ytUrl;
}

// =========================
// BLOG GENERATION + LEVITATE
// =========================
async function fetchPexelsImage(topic) {
  console.log("🖼️ Fetching Pexels image for blog...");
  const keywords = topic.split(" ").slice(0, 3).join(" ");
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: (process.env.PEXELS_API_KEY || "").trim() } }
  );
  const result = await response.json();
  if (result.photos && result.photos.length > 0) {
    return result.photos[0].src.large;
  }
  return null;
}

async function generateAndPostBlog(topic) {
  console.log("📝 Generating blog for:", topic);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": (process.env.ANTHROPIC_API_KEY || "").trim(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Write an 800-word SEO blog post for My Texas Estate Plan, an estate planning law firm in Tyler, Texas.

TOPIC: ${topic}

STRUCTURE:
- H1: Keyword-optimized title
- Introduction (2-3 sentences)
- 3-4 main sections with H2 headers
- FAQ section (3 questions)
- Conclusion with CTA

RULES:
- Include "estate planning attorney Tyler Texas" naturally
- Plain English, no legal jargon
- Reference Tyler or East Texas at least 3 times
- End with: Call Casey at (903) 561-8644 or visit mytxestateplan.com
- Return plain text only`
      }]
    })
  });

  const data = await response.json();
  const blogContent = data.content[0].text.trim();
  console.log("✅ Blog generated:", blogContent.substring(0, 100));

  const imageUrl = await fetchPexelsImage(topic);
  console.log("🖼️ Blog image:", imageUrl);

  const { postBlogToLevitate } = require("./levitate");
  await postBlogToLevitate(topic, blogContent, imageUrl);
}

// =========================
// SHEET UPDATE
// =========================
async function updateSheet(rowIndex, updates) {
  if (!process.env.SHEET_WEBHOOK) {
    console.log("❌ SHEET_WEBHOOK missing");
    return;
  }
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
  console.log("🔥 QUEUE STARTED");

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      console.log("⚙️ Processing:", job);
      await updateSheet(job.row, { status: "PROCESSING" });

      try {
        const videoUrl = await generateVideo(job);
        const ytUrl = await uploadToYouTube(videoUrl, job.topic);
        await updateSheet(job.row, { status: "DONE", youtubeUrl: ytUrl });

        // Auto-post blog to Levitate
        try {
          await generateAndPostBlog(job.topic);
        } catch (blogErr) {
          console.log("⚠️ Levitate blog post failed:", blogErr.message);
        }

      } catch (err) {
        console.log("❌ Job failed:", err.message);
        await updateSheet(job.row, { status: "ERROR: " + err.message });
      }
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
    console.log("⚠️ Invalid job:", job);
    return;
  }
  queue.push(job);
  processQueue();
}

module.exports = { enqueue };