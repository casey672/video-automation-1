const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

// The result endpoint returns {video:{url:...}} not {output:{video:{url:...}}}
src = src.replace(/vid\.output\.video\.url/g, 'vid.video.url');

fs.writeFileSync(file, src, 'utf8');
console.log('fix8 applied — vid.output.video.url -> vid.video.url');
