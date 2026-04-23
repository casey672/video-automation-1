require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent'
});

console.log('\nVisit this URL in your browser:\n');
console.log(url);
console.log('\nWaiting for auth...\n');

const server = http.createServer(async (req, res) => {
  if (req.url.includes('/oauth2callback')) {
    const code = new URL(req.url, 'http://localhost:3000').searchParams.get('code');
    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log('\nYOUR REFRESH TOKEN:\n');
      console.log(tokens.refresh_token);
      console.log('\nCopy that into your .env as YOUTUBE_REFRESH_TOKEN=\n');
      res.end('Done! Copy your refresh token from the terminal and close this tab.');
    } catch (e) {
      console.error('Error:', e.message);
      res.end('Error: ' + e.message);
    }
    server.close();
  }
});

server.listen(3000, () => console.log('Server ready on port 3000'));