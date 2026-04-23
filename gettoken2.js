require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload']
});

console.log('Visit this URL:', url);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\nPaste the code from the browser here: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('\nREFRESH TOKEN:', tokens.refresh_token);
  rl.close();
});