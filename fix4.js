const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

// Fix generateVideo to return FULL response (so we get status_url, response_url)
src = src.replace(
  "  const data = await res.json();\n  return data.request_id;",
  "  const data = await res.json();\n  console.log('Queue response keys:', Object.keys(data).join(', '));\n  console.log('status_url:', data.status_url);\n  return data;"
);

// Fix run() to handle full response object
src = src.replace('const vidId = await generateVideo(script);', 'const vidSub = await generateVideo(script);');
src = src.replace("console.log('Video rendering... request_id:', vidId);", "console.log('Video rendering... request_id:', vidSub.request_id);");
src = src.replace('const vid = await waitForVideo(vidId);', 'const vid = await waitForVideo(vidSub);');

// Replace waitForVideo to use status_url from the submit response
const waitStart = src.indexOf('async function waitForVideo(');
if (waitStart === -1) { console.error('waitForVideo not found!'); process.exit(1); }
let depth = 0, waitEnd = waitStart, started = false;
for (let i = waitStart; i < src.length; i++) {
  if (src[i] === '{') { depth++; started = true; }
  if (src[i] === '}') depth--;
  if (started && depth === 0) { waitEnd = i + 1; break; }
}

const newWait = 'async function waitForVideo(sub) {\n' +
  '  const statusUrl = sub.status_url;\n' +
  "  const auth = { 'Authorization': 'Key ' + process.env.FAL_KEY };\n" +
  "  console.log('Polling:', statusUrl);\n" +
  '  for (let i = 0; i < 30; i++) {\n' +
  '    await new Promise(r => setTimeout(r, 10000));\n' +
  '    try {\n' +
  '      const sr = await fetch(statusUrl, { headers: auth });\n' +
  "      console.log('Poll ' + (i+1) + ': HTTP ' + sr.status);\n" +
  '      const txt = await sr.text();\n' +
  "      if (!txt || !txt.trim()) { console.log('  empty body, retry'); continue; }\n" +
  '      const d = JSON.parse(txt);\n' +
  "      console.log('  FAL status: ' + d.status);\n" +
  "      if (d.status === 'COMPLETED') return d;\n" +
  "      if (d.status === 'FAILED') throw new Error('Video generation failed: ' + JSON.stringify(d.error || d));\n" +
  '    } catch(e) {\n' +
  "      if (e.message.startsWith('Video generation failed')) throw e;\n" +
  "      console.log('  error: ' + e.message + ', retry');\n" +
  '    }\n' +
  '  }\n' +
  "  throw new Error('Timeout waiting for video');\n" +
  '}';

src = src.slice(0, waitStart) + newWait + src.slice(waitEnd);
fs.writeFileSync(file, src, 'utf8');
console.log('fix4 applied — generateVideo returns full response, waitForVideo uses status_url directly');
