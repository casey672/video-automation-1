const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function postBlogToLevitate(title, content) {
  console.log('🌐 Starting Levitate blog post...');
  
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true
  });

  try {
    const page = await browser.newPage();
    
    // Step 1 — Login
    console.log('🔐 Logging into Levitate...');
    await page.goto('https://secure.levitate.ai/#/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', process.env.LEVITATE_EMAIL);
    await page.type('input[type="password"]', process.env.LEVITATE_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('✅ Logged in');

    // Step 2 — Navigate to Blog
    console.log('📝 Navigating to blog creation...');
    await page.goto('https://secure.levitate.ai/#/campaigns/blogs', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    // Step 3 — Click Create New Blog Post
    const createBtn = await page.$x("//button[contains(text(), 'Create New Blog Post')]");
    if (createBtn.length > 0) {
      await createBtn[0].click();
    } else {
      // Try alternate selector
      await page.click('button.create-blog-btn, [data-test="create-blog"]');
    }
    await page.waitForTimeout(2000);

    // Step 4 — Fill in title
    console.log('✍️ Filling in blog title...');
    await page.click('input[placeholder*="Title"], input[name="title"]');
    await page.type('input[placeholder*="Title"], input[name="title"]', title);

    // Step 5 — Fill in content
    console.log('📄 Filling in blog content...');
    await page.click('.ql-editor, [contenteditable="true"]');
    await page.keyboard.type(content);

    // Step 6 — Click Save Blog Post
    console.log('💾 Saving blog post...');
    const saveBtn = await page.$x("//button[contains(text(), 'Save Blog Post')]");
    if (saveBtn.length > 0) {
      await saveBtn[0].click();
    }
    await page.waitForTimeout(2000);

    // Step 7 — Click Schedule
    console.log('📅 Scheduling blog post...');
    const scheduleBtn = await page.$x("//button[contains(text(), 'Schedule')]");
    if (scheduleBtn.length > 0) {
      await scheduleBtn[0].click();
    }
    await page.waitForTimeout(2000);

    console.log('✅ Blog post created and scheduled in Levitate!');
    return true;

  } catch (err) {
    console.error('❌ Levitate blog post failed:', err.message);
    return false;
  } finally {
    await browser.close();
  }
}

module.exports = { postBlogToLevitate };