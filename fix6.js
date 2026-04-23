const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

// Increase poll limit from 30 to 60 (10 minutes max wait)
src = src.replace('for (let i = 0; i < 30; i++)', 'for (let i = 0; i < 60; i++)');

// Change video duration from 10s to 5s for faster generation
src = src.replace('duration: 10,', 'duration: 5,');

fs.writeFileSync(file, src, 'utf8');
console.log('fix6 applied — poll limit 60 (10 min), video duration 5s');
