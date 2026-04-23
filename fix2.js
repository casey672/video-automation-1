const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');
src = src.replace(
  "const base = 'https://queue.fal.run/fal-ai/kling-video/v1.6/pro';",
  "const base = 'https://queue.fal.run/fal-ai/kling-video/v1.6/pro/text-to-video';"
);
fs.writeFileSync(file, src, 'utf8');
console.log('Base URL fixed!');
