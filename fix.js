const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

const newWait = 'async function waitForVideo(id) {\n' +
  "  const base = 'https://queue.fal.run/fal-ai/kling-video/v1.6/pro';\n" +
  "  const auth = { 'Authorization': 'Key ' + process.env.FAL_KEY };\n" +
  '  for (let i = 0; i < 30; i++) {\n' +
  '    await new Promise(r => setTimeout(r, 10000));\n' +
  '    try {\n' +
  "      const sr = await fetch(base + '/requests/' + id + '/status', { headers: auth });\n" +
  "      console.log('Poll ' + (i+1) + ': HTTP ' + sr.status);\n" +
  '      const txt = await sr.text();\n' +
  "      if (!txt || !txt.trim()) { console.log('  empty body, retry'); continue; }\n" +
  '      const d = JSON.parse(txt);\n' +
  "      console.log('  status: ' + d.status);\n" +
  "      if (d.status === 'COMPLETED') {\n" +
  "        const rr = await fetch(base + '/requests/' + id, { headers: auth });\n" +
  '        return await rr.json();\n' +
  '      }\n' +
  "      if (d.status === 'FAILED') throw new Error('Video generation failed: ' + JSON.stringify(d.error || d));\n" +
  '    } catch(e) {\n' +
  "      if (e.message.startsWith('Video generation failed')) throw e;\n" +
  "      console.log('  poll error: ' + e.message + ', retry');\n" +
  '    }\n' +
  '  }\n' +
  "  throw new Error('Timeout waiting for video');\n" +
  '}';

const waitStart = src.indexOf('async function waitForVideo(id)');
if (waitStart === -1) { console.error('waitForVideo not found!'); process.exit(1); }

let depth = 0, waitEnd = waitStart, started = false;
for (let i = waitStart; i < src.length; i++) {
  if (src[i] === '{') { depth++; started = true; }
  if (src[i] === '}') depth--;
  if (started && depth === 0) { waitEnd = i + 1; break; }
}

src = src.slice(0, waitStart) + newWait + src.slice(waitEnd);
fs.writeFileSync(file, src, 'utf8');
console.log('Fix applied!');
