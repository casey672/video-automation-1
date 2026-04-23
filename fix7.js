const fs = require('fs');
const file = 'C:/Users/Casey/OneDrive/Desktop/video-automation/generate.js';
let src = fs.readFileSync(file, 'utf8');

// When COMPLETED, fetch response_url for actual output instead of returning status response
src = src.replace(
  "      if (d.status === 'COMPLETED') return d;",
  "      if (d.status === 'COMPLETED') {\n" +
  "        console.log('Fetching result from:', sub.response_url);\n" +
  "        const rr = await fetch(sub.response_url, { headers: auth });\n" +
  "        const result = await rr.json();\n" +
  "        console.log('Result keys:', Object.keys(result).join(', '));\n" +
  "        return result;\n" +
  "      }"
);

fs.writeFileSync(file, src, 'utf8');
console.log('fix7 applied — fetches response_url on COMPLETED for actual output');
