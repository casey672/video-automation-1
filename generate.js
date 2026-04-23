/**
 * generate.js - Standalone pipeline for Task Scheduler
 * Run: node generate.js [optional topic]
 * No server needed. Runs full pipeline and exits.
 */
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const { google } = require('googleapis');

ffmpeg.setFfmpegPath(ffmpegPath);

const TOPIC_BANK = [
  'why dying without a will is worse than you think',
  'what a power of attorney actually does',
  'the difference between a will and a trust',
  'why joint accounts are not an estate plan',
  'what happens to your digital assets when you die',
  'the biggest mistake people make with beneficiary designations',
  'why you still need a will even if you have a trust',
  'how to avoid probate in Texas',
  "why 'I'll do it later' is the most expensive estate plan",
  'what a Lady Bird deed is and why Texans love it',
  'the difference between executor and trustee',
  'what happens to your minor children if you die without a will',
  "why life insurance doesn't go through your will",
  'what a pour-over will does',
  'what Medicaid planning actually is'
];

const ROOT_DIR = __dirname;
const TOPIC_STATE_FILE = path.join(ROOT_DIR, 'topic-state.json');
const RESULTS_LOG_FILE = path.join(ROOT_DIR, 'results.log');
const FONT_PATHS = [
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/arial.ttf'
];
const TEMP_PREFIXES = ['voice_', 'raw_', 'final_', 'thumb_', 'caption_', 'thumbtext_'];
const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 1;
const AUDIO_BYTES_PER_SAMPLE = 2;
const MAX_DURATION_SECONDS = 65;

const SYSTEM_PROMPT = `You are a script writer for My Texas Estate Plan, an estate planning law firm in Tyler, Texas.
Write 60-second YouTube Shorts scripts on estate planning topics.

VOICE: Casey Cook, estate planning attorney. Dry, deadpan delivery.
Self-deprecating attorney humor. Occasional dad joke used only as the opening hook or sign-off.
Never preachy. Talk like a human, not a textbook.

FORMAT:
HOOK (0-5 sec): One punchy line. Surprising stat, dark irony, or a dad joke. Make it impossible to scroll past.
CORE (5-50 sec): Explain one concept clearly. Max 3 points. Plain English only.
CTA (50-60 sec): Soft call to action. End with: "- My Texas Estate Plan."

RULES: 150 words MAX. At least one moment of dry wit. No bullet points. No exclamation points.
Return ONLY the script text. No labels, no metadata.`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retry(fn, label, attempts = 3, baseDelayMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const delay = baseDelayMs * (2 ** (attempt - 1));
      console.warn(`${label} failed (attempt ${attempt}/${attempts}): ${error.message}`);
      console.warn(`Retrying ${label} in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve(stderr);
        return;
      }

      reject(new Error(`${label} failed with code ${code}: ${stderr}`));
    });
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadTopicState() {
  if (!fs.existsSync(TOPIC_STATE_FILE)) {
    return { remaining: [], cycleCount: 0, lastTopic: null };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(TOPIC_STATE_FILE, 'utf8'));
    return {
      remaining: Array.isArray(parsed.remaining) ? parsed.remaining : [],
      cycleCount: Number.isInteger(parsed.cycleCount) ? parsed.cycleCount : 0,
      lastTopic: parsed.lastTopic || null
    };
  } catch (error) {
    console.warn(`Could not read topic rotation state, resetting it: ${error.message}`);
    return { remaining: [], cycleCount: 0, lastTopic: null };
  }
}

function saveTopicState(state) {
  fs.writeFileSync(TOPIC_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function pickTopic(explicitTopic) {
  if (explicitTopic) {
    return { topic: explicitTopic, source: 'manual' };
  }

  const state = loadTopicState();
  let remaining = state.remaining.filter(topic => TOPIC_BANK.includes(topic));

  if (remaining.length === 0) {
    remaining = shuffle(TOPIC_BANK);
    state.cycleCount += 1;
  }

  const topic = remaining.shift();
  state.remaining = remaining;
  state.lastTopic = topic;
  saveTopicState(state);

  return { topic, source: 'rotation' };
}

function cleanupOldTempFiles() {
  const files = fs.readdirSync(ROOT_DIR);

  for (const file of files) {
    const shouldDelete = TEMP_PREFIXES.some(prefix => file.startsWith(prefix));
    if (!shouldDelete) continue;

    const fullPath = path.join(ROOT_DIR, file);
    let stat;

    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (!stat.isFile()) continue;

    try {
      fs.unlinkSync(fullPath);
      console.log(`Cleaned stale temp file: ${file}`);
    } catch (error) {
      console.warn(`Could not remove stale temp file ${file}: ${error.message}`);
    }
  }
}

function safeUnlink(file) {
  if (!file) return;
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (error) {
    console.warn(`Cleanup failed for ${file}: ${error.message}`);
  }
}

function getFontPath() {
  for (const candidate of FONT_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('No usable Windows font found for ffmpeg drawtext.');
}

function escapeTextForDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function escapePathForDrawtext(file) {
  return file
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function wrapText(text, wordsPerLine = 4, maxLines = 3) {
  const words = normalizeWhitespace(text).split(' ').filter(Boolean);
  const lines = [];

  for (let i = 0; i < words.length && lines.length < maxLines; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }

  if ((maxLines * wordsPerLine) < words.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}...`;
  }

  return lines.join('\n');
}

function chunkScriptForCaptions(script) {
  const pieces = script
    .split(/(?<=[.!?])\s+/)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

  const chunks = [];

  for (const piece of pieces) {
    const words = piece.split(' ');
    if (words.length <= 10) {
      chunks.push(piece);
      continue;
    }

    for (let i = 0; i < words.length; i += 8) {
      chunks.push(words.slice(i, i + 8).join(' '));
    }
  }

  return chunks.slice(0, 12);
}

function estimatePcmDurationSeconds(file) {
  const bytes = fs.statSync(file).size;
  return bytes / (AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * AUDIO_BYTES_PER_SAMPLE);
}

function buildCaptionTimeline(script, durationSeconds) {
  const chunks = chunkScriptForCaptions(script);
  const wordCounts = chunks.map(chunk => chunk.split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0) || 1;
  const minSegmentSeconds = 2.2;
  let cursor = 0.4;

  return chunks.map((chunk, index) => {
    const proportional = (wordCounts[index] / totalWords) * Math.max(durationSeconds - 1.2, 1);
    const start = cursor;
    const end = Math.min(durationSeconds - 0.2, start + Math.max(proportional, minSegmentSeconds));
    cursor = end;

    return {
      text: wrapText(chunk, 4, 3),
      start: Number(start.toFixed(2)),
      end: Number(Math.max(end, start + 1.2).toFixed(2))
    };
  });
}

function createCaptionFiles(captions, runId, tempFiles) {
  return captions.map((caption, index) => {
    const file = path.join(ROOT_DIR, `caption_${runId}_${index}.txt`);
    fs.writeFileSync(file, `${caption.text}\n`);
    tempFiles.push(file);
    return file;
  });
}

async function generateScript(topic) {
  const res = await fetch(process.env.CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.CLAUDE_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Write a 60-second YouTube Shorts script about: ${topic}` }]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;

  if (!text) {
    throw new Error('Claude API returned no script text.');
  }

  return normalizeWhitespace(text);
}

async function generateVoice(text, runId) {
  const url = "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB"; {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      output_format: 'pcm_44100'
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs API ${res.status}: ${body.slice(0, 400)}`);
  }

  const buffer = await res.arrayBuffer();
  const file = path.join(ROOT_DIR, `voice_${runId}.pcm`).replace(/\\/g, '/');
  fs.writeFileSync(file, Buffer.from(buffer));

  if (!fs.statSync(file).size) {
    throw new Error('ElevenLabs returned an empty PCM file.');
  }

  return file;
}

async function generateBackground(duration, output, script, runId, tempFiles) {
  const fontPath = getFontPath();
  const captions = buildCaptionTimeline(script, duration);
  const captionFiles = createCaptionFiles(captions, runId, tempFiles);
  const brand = 'MY TEXAS ESTATE PLAN';
  const location = 'Tyler, Texas Estate Planning';

  const filterParts = [
    'drawbox=x=0:y=0:w=iw:h=1280:color=black:t=fill',
    'drawbox=x=0:y=0:w=iw:h=10:color=white@0.85:t=fill',
    'drawbox=x=36:y=1060:w=648:h=150:color=0x111827@0.95:t=fill',
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':text='${escapeTextForDrawtext(brand)}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1078`,
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':text='${escapeTextForDrawtext(location)}':fontcolor=white@0.78:fontsize=22:x=(w-text_w)/2:y=1130`,
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':text='${escapeTextForDrawtext('Legal tips with dry wit. Actual law, not vibes.') }':fontcolor=white@0.6:fontsize=18:x=(w-text_w)/2:y=1168`
  ];

  captions.forEach((caption, index) => {
    const start = caption.start;
    const end = caption.end;
    const fadeInEnd = Number((start + 0.28).toFixed(2));
    const fadeOutStart = Number(Math.max(start + 0.7, end - 0.28).toFixed(2));
    const alpha = `if(lt(t,${start}),0,if(lt(t,${fadeInEnd}),(t-${start})/${Math.max(fadeInEnd - start, 0.01)},if(lt(t,${fadeOutStart}),1,if(lt(t,${end}),(${end}-t)/${Math.max(end - fadeOutStart, 0.01)},0))))`;

    filterParts.push(
      `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':textfile='${escapePathForDrawtext(captionFiles[index])}':reload=0:fontcolor=white:fontsize=50:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2-170:alpha='${alpha}'`
    );
  });

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=720x1280:r=24:d=${duration}`,
    '-vf', filterParts.join(','),
    '-t', String(Math.min(duration, MAX_DURATION_SECONDS)),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    output
  ];

  await runFfmpeg(args, 'Background generation');
}

async function merge(video, audio, output) {
  const args = [
    '-y',
    '-i', video,
    '-f', 's16le',
    '-ar', String(AUDIO_SAMPLE_RATE),
    '-ac', String(AUDIO_CHANNELS),
    '-i', audio,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    output
  ];

  await runFfmpeg(args, 'Merge');
}

function generateTitle(topic) {
  const base = topic
    .replace(/^why /i, '')
    .replace(/^what /i, '')
    .replace(/^how /i, '')
    .trim();

  const normalized = base.charAt(0).toUpperCase() + base.slice(1);
  const templates = [
    `Tyler Texas Estate Planning: ${normalized}`,
    `${normalized} | Estate Planning Attorney Tyler TX`,
    `Texas Will and Trust Tip: ${normalized}`,
    `Estate Planning in Tyler, Texas: ${normalized}`,
    `${normalized} - Texas Probate and Estate Planning`
  ];

  return templates[Math.floor(Math.random() * templates.length)].slice(0, 100);
}

function generateDescription(topic, script) {
  return [
    script,
    '',
    'My Texas Estate Plan, PLLC helps families with wills, trusts, probate planning, powers of attorney, and estate planning in Tyler, Texas and across East Texas.',
    'Need help with an estate plan in Tyler, TX? Visit mytxestateplan.com or call for a consultation.',
    '',
    `Topic: ${topic}`,
    'Service area: Tyler, Texas | Smith County | East Texas',
    '',
    '#EstatePlanning #TylerTexas #TexasEstatePlanning #WillsAndTrusts #Probate #PowerOfAttorney #MyTexasEstatePlan'
  ].join('\n');
}

function generateTags(topic) {
  const topicWords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const tags = new Set([
    'estate planning',
    'estate planning attorney Tyler TX',
    'estate planning Tyler Texas',
    'Tyler Texas lawyer',
    'Texas estate planning',
    'East Texas estate planning',
    'wills and trusts',
    'probate attorney Tyler TX',
    'power of attorney Texas',
    'My Texas Estate Plan',
    ...topicWords.join(' ') ? [topicWords.join(' ')] : []
  ]);

  return Array.from(tags).slice(0, 15);
}

async function generateThumbnail(title, topic, output, runId, tempFiles) {
  const fontPath = getFontPath();
  const titleTextFile = path.join(ROOT_DIR, `thumbtext_${runId}.txt`);
  const text = `${wrapText(title, 4, 3)}\n\n${wrapText(topic, 4, 2)}`;
  fs.writeFileSync(titleTextFile, `${text}\n`);
  tempFiles.push(titleTextFile);

  const filter = [
    'drawbox=x=0:y=0:w=iw:h=ih:color=0x111827:t=fill',
    'drawbox=x=0:y=0:w=iw:h=28:color=white@0.9:t=fill',
    'drawbox=x=70:y=90:w=1140:h=540:color=0x1f2937@0.92:t=fill',
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':text='${escapeTextForDrawtext('MY TEXAS ESTATE PLAN')}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=38`,
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':textfile='${escapePathForDrawtext(titleTextFile)}':reload=0:fontcolor=white:fontsize=58:line_spacing=18:x=(w-text_w)/2:y=180`,
    `drawtext=fontfile='${escapePathForDrawtext(fontPath)}':text='${escapeTextForDrawtext('Tyler, Texas Estate Planning Attorney')}':fontcolor=white@0.82:fontsize=28:x=(w-text_w)/2:y=610`
  ].join(',');

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=1280x720',
    '-frames:v', '1',
    '-vf', filter,
    output
  ];

  await runFfmpeg(args, 'Thumbnail generation');
}

async function uploadVideo(videoPath, title, script, topic) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const description = generateDescription(topic, script);
  const tags = generateTags(topic);

  const insertResponse = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title,
        description,
        categoryId: '27',
        tags
      },
      status: { privacyStatus: 'public' }
    },
    media: { body: fs.createReadStream(videoPath) }
  });

  const videoId = insertResponse.data.id;
  if (!videoId) {
    throw new Error('YouTube upload returned no video ID.');
  }

  return {
    youtube,
    id: videoId,
    url: `https://youtube.com/watch?v=${videoId}`,
    description,
    tags
  };
}

async function setThumbnail(youtube, videoId, thumbnailPath) {
  await youtube.thumbnails.set({
    videoId,
    media: { body: fs.createReadStream(thumbnailPath) }
  });
}

function getFileSizeBytes(file) {
  return file && fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function logResult(entry) {
  fs.appendFileSync(RESULTS_LOG_FILE, `${JSON.stringify(entry)}\n`);
}

// --- MAIN RUNNER ---
async function run() {
    startupCleanup();
    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Posts!A2:F100',
    });

    const rows = res.data.values;
    if (!rows) return console.log("📭 Sheet is empty.");

    let targetRow = null;
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
        const [topic, , , , script, url] = rows[i];
        if (topic && script && (!url || url === "")) {
            targetRow = { topic, script };
            rowIndex = i + 2; 
            break;
        }
    }

    if (!targetRow) return console.log("✅ All topics are already uploaded!");

    try {
        const audioPath = path.join(VIDEO_DIR, 'voice.mp3');

        // Step 1: ElevenLabs with Retry
        await withRetry(async () => {
            console.log(`🎙️ Generating voice for: ${targetRow.topic}`);
            
            const response = await axios({
                method: 'post',
                url: "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB",
                headers: {
                    'accept': 'audio/mpeg',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                data: {
                    text: targetRow.script,
                    model_id: "eleven_turbo_v2_5",
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
                },
                responseType: 'arraybuffer'
            });

            fs.writeFileSync(audioPath, response.data);
            console.log("✅ Voiceover saved to temp folder.");
        }, "ElevenLabs");

        // Step 2: FFMPEG Assets
        const { videoOutput, thumbOutput } = await generateAssets(targetRow.topic, audioPath);

        // Step 3: YouTube Upload (Placeholder - update with your YT logic when ready)
        const youtubeUrl = "https://youtu.be/pending"; 

        // Step 4: Write back to Sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `Posts!F${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[youtubeUrl]] },
        });

        const stats = fs.statSync(videoOutput);
        detailedLog(targetRow.topic, "SUCCESS", { size: `${(stats.size / 1024 / 1024).toFixed(2)}MB`, url: youtubeUrl });
        console.log(`🏁 Successfully processed: ${targetRow.topic}`);

    } catch (err) {
        detailedLog(targetRow.topic, "FAILED", { size: err.message });
        console.error("💀 Pipeline crashed:", err.message);
    }
}

run();