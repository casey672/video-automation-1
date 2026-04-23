const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

// Show generateVideo content for diagnosis
const genStart = src.indexOf('async function generateVideo(');
const genEnd = src.indexOf('\nasync function ', genStart + 1);
console.log('--- generateVideo ---');
console.log(src.slice(genStart, genEnd > 0 ? genEnd : genStart + 500));
console.log('---');

// Fix: return full data object instead of just request_id
if (src.includes('return data.request_id;')) {
  src = src.replace('return data.request_id;', 'return data;');
  fs.writeFileSync(file, src, 'utf8');
  console.log('fix5 OK — generateVideo returns full FAL queue response');
} else {
  // fallback: show all return data lines
  console.log('Pattern not found. All "return data" lines:');
  src.split('\n').forEach((line, i) => { if (line.includes('return data')) console.log((i+1) + ': ' + line); });
}
