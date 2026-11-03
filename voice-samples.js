// Renders one short sample per candidate voice so Casey (owner) can pick one.
// Run once from a machine with the same .env as Render:  node voice-samples.js
// Output: ./voice-samples/<voice>.mp3. Nothing is uploaded or published.
// Cost: about 400 characters per voice, inside Google's monthly free tier.
// To use the chosen voice, set TTS_VOICE in Render (e.g. en-US-Chirp3-HD-Charon).
require("dotenv").config();
const fs = require("fs");
const fetch = require("node-fetch");
const { google } = require("googleapis");

const VOICES = [
  "en-US-Chirp3-HD-Charon",
  "en-US-Chirp3-HD-Orus",
  "en-US-Chirp3-HD-Iapetus",
  "en-US-Chirp3-HD-Algieba",
  "en-US-Neural2-D" // current voice, for comparison
];

const SAMPLE =
  "A lot of families in East Texas put off making a will because it feels like something for later. " +
  "Here's how it works in Texas. If someone passes away without a will, state law decides who inherits, " +
  "and that may not match what they would have wanted. A simple next step is to write down what you own " +
  "and who you'd want to receive it. This is general information, not legal advice.";

async function main() {
  const auth = new google.auth.OAuth2(
    (process.env.GOOGLE_CLIENT_ID || "").trim(),
    (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    "http://localhost:3000/oauth2callback"
  );
  auth.setCredentials({ refresh_token: (process.env.GOOGLE_REFRESH_TOKEN || "").trim() });
  const { token } = await auth.getAccessToken();

  fs.mkdirSync("voice-samples", { recursive: true });
  for (const name of VOICES) {
    const isChirp = /Chirp3-HD/i.test(name);
    const audioConfig = isChirp
      ? { audioEncoding: "MP3" }
      : { audioEncoding: "MP3", speakingRate: 0.95, pitch: -1.0 };
    const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: { text: SAMPLE }, voice: { languageCode: "en-US", name }, audioConfig })
    });
    const data = await res.json();
    if (!data.audioContent) {
      console.log(`❌ ${name}: ${JSON.stringify(data.error || data).slice(0, 200)}`);
      continue;
    }
    fs.writeFileSync(`voice-samples/${name}.mp3`, Buffer.from(data.audioContent, "base64"));
    console.log(`✅ voice-samples/${name}.mp3`);
  }
}

main().catch(err => { console.error("Sample run failed:", err.message); process.exit(1); });
