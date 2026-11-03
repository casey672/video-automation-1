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
// SCRIPT PROMPT (MARKETING-approved wording, 2026-11-03)
// =========================
function buildVideoScriptPrompt(topic, hook) {
  return "Write a 45-60 second YouTube Short script for My Texas Estate Plan, a Tyler, Texas estate planning and probate law firm led by attorney Casey Cook. Topic: " + topic + ".\nVoice: a calm, friendly East Texas attorney explaining something to a neighbor. Plain English, short sentences, no legal jargon without a one-line explanation.\nStructure: (1) a one-sentence hook that names a real situation families face; (2) two or three clear points about how this works under Texas law; (3) one practical next step the viewer can take; (4) close with: \"This is general information, not legal advice. Every family's situation is different. If you'd like to talk through yours, call My Texas Estate Plan in Tyler.\"\nRules: no jokes, sarcasm or irony about death, illness, grief or family conflict. No guarantees or promises of outcomes. No specific dollar amounts, percentages or timelines unless they are fixed by Texas statute. No words like \"best,\" \"expert,\" \"specialist,\" \"always\" or \"never.\" No fear words like destroy, nightmare, disaster or ruin. Don't invent cases, clients or testimonials. Don't mention past results. Describe courts, judges and Texas law accurately and plainly. Don't say the state or court 'takes over,' 'runs the show' or 'takes your property.' Say state law decides who inherits, and a probate court oversees the process.\nReturn ONLY the script text. No labels, no formatting.";
}

// =========================
// STEP 1 — GENERATE SCRIPT
// =========================
async function generateScript(topic, hook) {
  console.log("✍️ Generating script for:", topic);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": (process.env.ANTHROPIC_API_KEY || "").trim(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: buildVideoScriptPrompt(topic, hook)
      }]
    })
  });

  const data = await response.json();
  return data.content[0].text.trim();
}

// =========================
// STEP 2 — GOOGLE TTS
// =========================
// Voice is set by the TTS_VOICE env var so Casey (owner) can pick from the samples
// (voice-samples.js) without a code change. Default: a Chirp 3 HD voice.
// Pricing (Google, Nov 2026): Chirp 3 HD $30 / 1M chars, Neural2 $16 / 1M chars,
// first 1M chars free each month. ~2 videos/day ≈ 60k chars/month, inside the free tier.
const DEFAULT_TTS_VOICE = "en-US-Chirp3-HD-Charon";

function buildTtsRequest(text, voiceName) {
  const name = (voiceName || process.env.TTS_VOICE || DEFAULT_TTS_VOICE).trim();
  const isChirp = /Chirp3-HD/i.test(name);
  const audioConfig = { audioEncoding: "MP3" };
  // Chirp 3 HD voices don't take pitch; keep the old tuning only for older voices.
  if (!isChirp) {
    audioConfig.speakingRate = 0.95;
    audioConfig.pitch = -1.0;
  }
  return {
    input: { text },
    voice: { languageCode: name.split("-").slice(0, 2).join("-"), name },
    audioConfig
  };
}

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
      body: JSON.stringify(buildTtsRequest(cleanText))
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
// The Faceless Short template has 6 clip slots (Clip-1..Clip-6). Clips come from the
// topic first, then MARKETING's safe B-roll searches. Anything whose Pexels page slug
// mentions a blocked subject is skipped.
const CLIP_SLOTS = 6;
const SAFE_BROLL_SEARCHES = [
  "signing documents",
  "family at kitchen table",
  "courthouse exterior",
  "texas countryside",
  "couple reviewing papers",
  "grandparents with grandchildren",
  "house front porch",
  "office desk notebook"
];
const BLOCKED_CLIP_WORDS = /\b(funeral|coffin|casket|cemetery|grave|graveyard|tombstone|mourning|crying|tears|sad|hospital|patient|ambulance|death|dying|die|dies|died|dead|deceased|passed|gavel|judge|money|cash|dollar|dollars|bills|banknote|banknotes|coins|currency|credit|loan|debt|finance|financial|bank|banking|wallet|payment|invest|investment|stock|stocks|savings|tax|taxes|wealth|rich|price|cost)\b/i;

// "What Happens If You Die Without A Will In Texas" -> "will texas", not "What Happens If".
const TOPIC_STOPWORDS = new Set("a an and are can do does for from how if in is it its of on or the to what when who why with without you your yours happens need explained".split(" "));
function topicKeywords(topic) {
  const words = String(topic || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !TOPIC_STOPWORDS.has(w) && !BLOCKED_CLIP_WORDS.test(w));
  return words.slice(0, 3).join(" ") || "family home";
}

function pickPortraitFile(video) {
  const files = (video.video_files || [])
    .filter(f => (f.quality === "hd" || f.quality === "sd") && f.height >= f.width)
    .sort((a, b) => b.height - a.height);
  return files.length ? files[0].link : null;
}

async function searchPexels(query, perPage) {
  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`,
    { headers: { Authorization: (process.env.PEXELS_API_KEY || "").trim() } }
  );
  if (!response.ok) throw new Error("Pexels HTTP " + response.status);
  const result = await response.json();
  return result.videos || [];
}

async function fetchPexelsClips(topic, count = CLIP_SLOTS) {
  console.log(`🎬 Fetching ${count} Pexels clips...`);
  const clips = [];
  const seen = new Set();
  const queries = [topicKeywords(topic), ...SAFE_BROLL_SEARCHES];

  for (let qi = 0; qi < queries.length && clips.length < count; qi++) {
    const q = queries[qi];
    const perQueryCap = qi === 0 ? 3 : 2; // up to 3 topic clips, then 2 per safe search for variety
    let taken = 0;
    let videos = [];
    try { videos = await searchPexels(q, 10); } catch (e) { console.log("⚠️ Pexels search failed:", q, e.message); continue; }
    for (const v of videos) {
      if (clips.length >= count || taken >= perQueryCap) break;
      if (seen.has(v.id) || BLOCKED_CLIP_WORDS.test(v.url || "")) continue;
      const link = pickPortraitFile(v);
      if (!link) continue;
      seen.add(v.id);
      clips.push(link);
      taken++;
    }
  }

  if (clips.length === 0) {
    console.log("⚠️ No Pexels clips found; template defaults will be used.");
    return [];
  }
  // Fill every slot, reusing clips if fewer than 6 were found.
  while (clips.length < count) clips.push(clips[clips.length % Math.max(1, clips.length)]);
  console.log(`✅ ${clips.length} clips ready`);
  return clips;
}

// Legacy single-clip fetch, kept so the old template can still be used via CREATOMATE_TEMPLATE_ID.
async function fetchPexelsVideo(topic) {
  console.log("🎬 Fetching Pexels background...");
  const keywords = topic.split(" ").slice(0, 3).join(" ");
  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(keywords)}&per_page=5&orientation=portrait`,
    { headers: { Authorization: (process.env.PEXELS_API_KEY || "").trim() } }
  );

  const result = await response.json();

  if (result.videos && result.videos.length > 0) {
    // Use the longest clip of the results so the background covers the voiceover (looped in Creatomate as a backstop).
    const longest = result.videos.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
    console.log("🎬 Pexels clip duration:", longest.duration, "s");
    const files = longest.video_files
      .filter(f => f.quality === "hd" || f.quality === "sd")
      .sort((a, b) => b.width - a.width);
    if (files.length > 0) return files[0].link;
  }

  // Fallback: search for generic background when topic returns no results
  console.log("🎬 No Pexels results for topic, trying fallback...");
  const fallbackTerms = ["office desk", "family home", "texas", "law office"];
  for (const term of fallbackTerms) {
    const fallback = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(term)}&per_page=5&orientation=portrait`,
      { headers: { Authorization: (process.env.PEXELS_API_KEY || "").trim() } }
    );
    const fallbackResult = await fallback.json();
    if (fallbackResult.videos && fallbackResult.videos.length > 0) {
      const fbLongest = fallbackResult.videos.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
      const files = fbLongest.video_files
        .filter(f => f.quality === "hd" || f.quality === "sd")
        .sort((a, b) => b.width - a.width);
      if (files.length > 0) {
        console.log("✅ Fallback Pexels video found:", term);
        return files[0].link;
      }
    }
  }

  console.log("⚠️ No Pexels video found, using no background.");
  return null;
}

// =========================
// STEP 5 — CREATOMATE
// =========================
// Faceless Short template (project "First Animated"), built Nov 3, 2026.
// Dynamic layers: Voiceover, Clip-1..Clip-6, Hook, Logo, Handle. Subtitles are
// transcribed from the voiceover by Creatomate while rendering (no captions field).
// Brand set in the template: Hook-Wash navy #121E55, Hook-Rule red #E5222A,
// Handle default (903) 561-8644. Roll back by setting CREATOMATE_TEMPLATE_ID to the
// old 2890bb76-8448-4d37-be98-76b1f25ecd56 (that path uses the legacy single background).
const FACELESS_TEMPLATE_ID = "daaa9d59-37c5-4c8a-8e08-2a545e38af85";
const LEGACY_TEMPLATE_ID = "2890bb76-8448-4d37-be98-76b1f25ecd56";
const FIRM_LOGO_URL = "https://irp.cdn-website.com/9b712ed2/dms3rep/multi/logo.webp";
const FIRM_PHONE = "(903) 561-8644";

function buildHook(topic) {
  const t = String(topic || "").trim();
  return t.length <= 60 ? t : t.slice(0, 57).replace(/\s+\S*$/, "") + "…";
}

function buildFacelessModifications(audioUrl, clips, topic) {
  const mods = {
    "Voiceover.source": audioUrl,
    "Hook.text": buildHook(topic),
    "Logo.source": FIRM_LOGO_URL,
    "Handle.text": FIRM_PHONE
  };
  clips.slice(0, CLIP_SLOTS).forEach((url, i) => { mods[`Clip-${i + 1}.source`] = url; });
  return mods;
}

async function renderWithCreatomate(script, audioUrl, bgUrl, topic, clips) {
  console.log("🎨 Rendering with Creatomate...");
  const templateId = (process.env.CREATOMATE_TEMPLATE_ID || FACELESS_TEMPLATE_ID).trim();

  let modifications;
  if (templateId === LEGACY_TEMPLATE_ID) {
    modifications = { voiceover: audioUrl, captions: script };
    if (bgUrl && bgUrl.startsWith("http")) {
      modifications.background_video = bgUrl;
      modifications["background_video.loop"] = true;
    }
  } else {
    modifications = buildFacelessModifications(audioUrl, clips || [], topic);
  }

  const response = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(process.env.CREATOMATE_API_KEY || "").trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      template_id: templateId,
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
  const usingLegacy = (process.env.CREATOMATE_TEMPLATE_ID || "").trim() === LEGACY_TEMPLATE_ID;
  const bgUrl = usingLegacy ? await fetchPexelsVideo(job.topic) : null;
  const clips = usingLegacy ? [] : await fetchPexelsClips(job.topic);
  const videoUrl = await renderWithCreatomate(script, audioUrl, bgUrl, job.topic, clips);
  console.log("✅ Video ready:", videoUrl);
  return videoUrl;
}

// =========================
// YOUTUBE UPLOAD
// =========================
async function uploadToYouTube(videoUrl, title, jobId) {
  console.log("📺 Uploading to YouTube:", title);

  const cleanTitle = title
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error("Rendered video download failed: HTTP " + videoResponse.status);
  const videoBuffer = await videoResponse.buffer();
  const tmpPath = `/tmp/${Date.now()}.mp4`;
  fs.writeFileSync(tmpPath, videoBuffer);

  const youtube = getYouTubeClient();
  let res;
  try {
  res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: cleanTitle,
        description: "Auto-generated estate planning video by My Texas Estate Plan. Call (903) 561-8644.\n\n" + JOB_TAG_PREFIX + (jobId || ""),
        tags: ["estate planning", "texas", "wills", "trusts", "tyler texas"],
        categoryId: "27"
      },
      // YT_PRIVACY env: "public" (default), "unlisted" or "private". Use unlisted for test videos.
      status: { privacyStatus: ["public", "unlisted", "private"].includes((process.env.YT_PRIVACY || "").trim()) ? process.env.YT_PRIVACY.trim() : "public" }
    },
    media: { body: fs.createReadStream(tmpPath) }
  });

  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }
  if (!res || !res.data || !res.data.id) throw new Error("YouTube insert returned no video id");
  const ytUrl = `https://www.youtube.com/watch?v=${res.data.id}`;
  console.log("✅ Uploaded:", ytUrl);
  return ytUrl;
}

// =========================
// BLOG GENERATION
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

// Required closing for every blog draft. Appended in code, so it is present even if the model omits it.
const BLOG_DISCLAIMER =
  "This article is general information, not legal advice, and reading it does not create an attorney-client relationship. " +
  "Every family's situation is different. If you'd like to talk through yours, call My Texas Estate Plan in Tyler at (903) 561-8644 " +
  "or visit mytxestateplan.com. Attorney responsible for this content: Casey Cook, My Texas Estate Plan, PLLC.";

// Automatic compliance gate (same rules MARKETING signed off for the video prompt).
// Any match puts the draft on HOLD for human review instead of marking it ready.
const BLOG_HOLD_RULES = [
  { label: "dollar amount", re: /\$\s?\d/ },
  { label: "percentage", re: /\d+(\.\d+)?\s?(%|percent\b)/i },
  { label: "specific timeline", re: /\b\d+\s*(-|to)?\s*\d*\s*(days?|weeks?|months?|years?)\b/i },
  { label: "guarantee/outcome promise", re: /\b(guarantee[ds]?|promise[ds]?|ensure[sd]? that|will (win|avoid probate|save you))\b/i },
  // "best interest(s)" is a legal standard in guardianship and trust law, so it is allowed.
  { label: "superlative or specialist claim", re: /\b(best(?! interests?\b)|top-rated|leading|expert|experts|specialist|specializ(e|es|ing)|#1|number one)\b/i },
  { label: "absolute word", re: /\b(always|never)\b/i },
  { label: "fear word", re: /\b(destroy\w*|nightmare|disaster\w*|ruin\w*|sabotag\w*|devastat\w*|catastroph\w*|dangerous)\b/i },
  { label: "testimonial or past result", re: /\b(our clients? (said|says|told)|we (won|recovered|saved)|in a recent case|a client of ours)\b/i },
  { label: "joke or irony marker", re: /\b(joke|kidding|lol|ha ha|dad joke|ironically)\b/i },
  { label: "statute or case citation", re: /(§|\bsec(tion)?\.?\s*\d|\bv\.\s[A-Z])/ }
];

function checkBlogCompliance(text) {
  const reasons = [];
  for (const rule of BLOG_HOLD_RULES) {
    const m = text.match(rule.re);
    if (m) reasons.push(`${rule.label}: "${m[0]}"`);
  }
  return reasons;
}

// Generates a blog DRAFT only. Nothing is published or emailed from here.
// Returns { status: "HOLD" | "READY_FOR_REVIEW", reasons, content, imageUrl }.
// Even READY_FOR_REVIEW drafts need Casey (owner) to review before anything is posted.
async function generateAndPostBlog(topic) {
  console.log("📝 Generating blog draft for:", topic);

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
        content: `Write an educational blog post of about 800 words for My Texas Estate Plan, a Tyler, Texas estate planning and probate law firm led by attorney Casey Cook.

TOPIC: ${topic}

VOICE: a calm, friendly East Texas attorney explaining something to a neighbor. Plain English, short sentences, no legal jargon without a one-line explanation.

STRUCTURE:
- A clear title on the first line (no "#" symbols)
- Introduction (2-3 sentences) naming a real situation families face
- 3-4 sections with plain-text headings, each explaining how this generally works under Texas law
- A short FAQ section (3 questions)
- One practical next step the reader can take

SEO: use the phrase "estate planning attorney in Tyler, Texas" once, naturally. Mention Tyler or East Texas where it fits, without stuffing.

RULES (follow every one):
- No jokes, sarcasm or irony about death, illness, grief or family conflict.
- No guarantees or promises of outcomes. Say "can," "may" or "often," not "will."
- No specific dollar amounts, percentages or timelines.
- Do not cite statute section numbers, case names or court rules.
- Do not use the words "best," "expert," "specialist," "specialize," "leading," "always" or "never."
- No fear words such as destroy, nightmare, disaster, ruin, sabotage or dangerous.
- Do not invent cases, clients, testimonials or quotes. Do not mention past results.
- Do not write a disclaimer or sign-off; one is added automatically.
- Return plain text only.`
      }]
    })
  });

  const data = await response.json();
  if (!response.ok || !data.content || !data.content[0]) {
    throw new Error("Blog generation failed: " + JSON.stringify(data.error || data).substring(0, 300));
  }
  const body = data.content[0].text.trim();
  const blogContent = body + "\n\n" + BLOG_DISCLAIMER;

  const reasons = checkBlogCompliance(body);
  const status = reasons.length ? "HOLD" : "READY_FOR_REVIEW";
  if (reasons.length) {
    console.log(`⛔ Blog draft on HOLD (${topic}): ${reasons.join("; ")}`);
  } else {
    console.log(`✅ Blog draft passed automatic checks (${topic}); still needs owner review before posting.`);
  }

  const imageUrl = await fetchPexelsImage(topic).catch(() => null);
  // Publishing stays disabled. Do not wire this to Levitate or any site without owner approval.
  return { status, reasons, content: blogContent, imageUrl };
}

// =========================
// RELIABILITY HELPERS (hardening draft)
// =========================
const MAX_ATTEMPTS = 3;
const JOB_TAG_PREFIX = "mtep-job-"; // written into the YouTube description for idempotency
const seenJobs = new Map(); // jobId -> {state, ytUrl}; in-memory only, the Sheet is the source of truth

function isPermanentError(err) {
  if (err && err.permanentSheet) return true;
  const m = String((err && err.message) || err);
  // invalid_grant / 401 / 403 / quota errors will not fix themselves with a retry
  return /invalid_grant|unauthorized_client|invalid_client|\b401\b|\b403\b|quotaExceeded|uploadLimitExceeded|Creatomate failed/i.test(m);
}

async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const permanent = isPermanentError(err);
      console.log(`⚠️ ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed${permanent ? " (permanent)" : ""}: ${err.message}`);
      if (permanent || attempt === MAX_ATTEMPTS) break;
      await new Promise(r => setTimeout(r, 5000 * Math.pow(3, attempt - 1))); // 5s, 15s
    }
  }
  throw new Error(`${label}: ${lastErr && lastErr.message}`);
}

function stageError(stage, err) {
  // Never include tokens or keys; err.message from googleapis/fetch does not contain them,
  // but trim it so a huge JSON body cannot land in the Sheet.
  return `${stage}: ${String(err.message || err).slice(0, 300)}`;
}

// Looks for an already-uploaded video for this job in the channel's uploads playlist (1 quota unit per page)
async function findExistingUpload(jobId) {
  const youtube = getYouTubeClient();
  const ch = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const uploads = ch.data.items && ch.data.items[0] && ch.data.items[0].contentDetails.relatedPlaylists.uploads;
  if (!uploads) return null;
  const res = await youtube.playlistItems.list({ part: ["snippet"], playlistId: uploads, maxResults: 50 });
  const tag = JOB_TAG_PREFIX + jobId;
  const hit = (res.data.items || []).find(i => (i.snippet.description || "").includes(tag));
  return hit ? `https://www.youtube.com/watch?v=${hit.snippet.resourceId.videoId}` : null;
}

// =========================
// SHEET UPDATE (now checked + retried; returns true only on confirmed write)
// =========================
async function updateSheet(job, updates) {
  if (!process.env.SHEET_WEBHOOK) {
    console.log("❌ SHEET_WEBHOOK missing; row will be caught by the Apps Script health check as stale PROCESSING");
    return false;
  }
  // Must match doPost.gs: token in body (web apps cannot read headers), row located by jobId.
  const payload = { token: (process.env.RUN_TOKEN || "").trim(), jobId: job.jobId || "", rowIndex: job.row, topic: job.topic || "", updates };
  try {
    return await withRetry("sheet update", async () => {
      const res = await fetch(process.env.SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let body = {};
      try { body = JSON.parse(text); } catch (e) { /* older doPost returns plain text */ }
      if (body.ok === false) {
        const e = new Error("doPost rejected: " + (body.error || "unknown"));
        if (body.error !== "busy") e.permanentSheet = true; // unauthorized / job id not found etc. won't fix on retry
        throw e;
      }
      console.log("📥 Sheet updated:", JSON.stringify(updates).slice(0, 200));
      return true;
    });
  } catch (err) {
    console.log("❌ Sheet update failed after retries:", err.message);
    return false;
  }
}

// =========================
// PROCESS QUEUE (idempotent: one upload per jobId)
// =========================
async function processJob(job) {
  job.jobId = job.jobId || `r${job.row}-${crypto.createHash("sha1").update(String(job.topic)).digest("hex").slice(0, 10)}`;
  const prior = seenJobs.get(job.jobId);
  if (prior && (prior.state === "running" || prior.state === "done")) {
    console.log(`↩️ Duplicate job ${job.jobId} ignored (${prior.state})`);
    return;
  }
  seenJobs.set(job.jobId, { state: "running" });
  await updateSheet(job, { status: "PROCESSING", jobId: job.jobId, note: "worker started " + new Date().toISOString() });

  let stage = "pre-check";
  try {
    // 1) Idempotency: if a previous (crashed) run already uploaded this job, just record it.
    const existing = await withRetry("youtube lookup", () => findExistingUpload(job.jobId)).catch(() => null);
    if (existing) {
      seenJobs.set(job.jobId, { state: "done", ytUrl: existing });
      await updateSheet(job, { status: "DONE", youtubeUrl: existing, note: "recovered existing upload" });
      return;
    }

    stage = "script";
    const script = await withRetry("script", () => generateScript(job.topic, job.hook));
    stage = "voiceover";
    const audioBase64 = await withRetry("voiceover", () => generateVoiceover(script));
    stage = "cloudinary";
    const audioUrl = await withRetry("cloudinary", () => uploadToCloudinary(audioBase64));
    stage = "pexels";
    const usingLegacy = (process.env.CREATOMATE_TEMPLATE_ID || "").trim() === LEGACY_TEMPLATE_ID;
    const bgUrl = usingLegacy
      ? await withRetry("pexels", () => fetchPexelsVideo(job.topic)).catch(() => null)
      : null;
    const clips = usingLegacy
      ? []
      : await withRetry("pexels", () => fetchPexelsClips(job.topic)).catch(() => []);
    stage = "render";
    const videoUrl = await withRetry("render", () => renderWithCreatomate(script, audioUrl, bgUrl, job.topic, clips));
    await updateSheet(job, { status: "PROCESSING", note: "rendered " + videoUrl });

    // 2) Upload is NOT retried blindly: a timeout after YouTube accepted the file would duplicate it.
    stage = "youtube upload";
    let ytUrl;
    try {
      ytUrl = await uploadToYouTube(videoUrl, job.topic, job.jobId);
    } catch (err) {
      const recovered = await findExistingUpload(job.jobId).catch(() => null);
      if (!recovered) throw err;
      ytUrl = recovered;
    }
    seenJobs.set(job.jobId, { state: "done", ytUrl });
    const ok = await updateSheet(job, { status: "DONE", youtubeUrl: ytUrl });
    if (!ok) console.log(`🚨 UPLOADED BUT SHEET NOT UPDATED: ${job.jobId} ${ytUrl}`); // health check reconciles via description tag

    try {
      // Draft only: nothing is published. HOLD drafts are logged with the reasons.
      const blog = await generateAndPostBlog(job.topic);
      console.log(`📝 Blog draft status for ${job.jobId}: ${blog.status}`);
    } catch (blogErr) {
      console.log("⚠️ Blog generation failed:", blogErr.message);
    }
  } catch (err) {
    seenJobs.set(job.jobId, { state: "error" });
    console.log("❌ Job failed:", stageError(stage, err));
    // Apps Script doPost (draft VideoWebhook_draft.gs) sends the failure alert email on status Error.
    await updateSheet(job, { status: "Error", note: stageError(stage, err) });
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;
  console.log("🔥 QUEUE STARTED");
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      try {
        await processJob(job);
      } catch (err) {
        console.log("❌ Unexpected job crash:", err.message);
      }
    }
  } finally {
    processing = false;
  }
}

// =========================
// ENQUEUE
// =========================
function enqueue(job) {
  if (!job || !job.row || !job.topic) {
    console.log("⚠️ Invalid job (needs row + topic)");
    return { accepted: false, reason: "invalid" };
  }
  if (job.jobId && queue.some(j => j.jobId === job.jobId)) {
    return { accepted: false, reason: "already queued" };
  }
  queue.push(job);
  processQueue();
  return { accepted: true, position: queue.length };
}

module.exports = { enqueue };
