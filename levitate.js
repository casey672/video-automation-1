const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function postBlogToLevitate(title, content, imageUrl) {
  console.log('🌐 Starting Levitate blog post...');

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    // Step 1 — Login
    console.log('🔐 Navigating to Levitate login...');
    await page.goto('https://secure.levitate.ai/#/login', { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take screenshot to debug
    console.log('📸 Page loaded, looking for login form...');
    
    // Try multiple selectors for email
    const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]', 'input[placeholder*="Email" i]'];
    let emailField = null;
    for (const sel of emailSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        emailField = sel;
        break;
      } catch (e) {}
    }

    if (!emailField) {
      // Get page HTML to debug
      const html = await page.content();
      console.log('Page HTML snippet:', html.substring(0, 500));
      throw new Error('Could not find email input field');
    }

    console.log('✅ Found email field:', emailField);
    await page.click(emailField);
    await page.type(emailField, process.env.LEVITATE_EMAIL, { delay: 50 });

    // Try multiple selectors for password
    const passSelectors = ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="password" i]'];
    let passField = null;
    for (const sel of passSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        passField = sel;
        break;
      } catch (e) {}
    }

    if (!passField) throw new Error('Could not find password field');
    
    await page.click(passField);
    await page.type(passField, process.env.LEVITATE_PASSWORD, { delay: 50 });

    // Submit - try multiple approaches
    try {
      await page.keyboard.press('Enter');
    } catch (e) {
      const btnSelectors = ['button[type="submit"]', 'button:contains("Log in")', 'button:contains("Sign in")', '.login-btn', '[data-test="login"]'];
      for (const sel of btnSelectors) {
        try {
          await page.click(sel);
          break;
        } catch (e2) {}
      }
    }

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 });
    console.log('✅ Logged in, current URL:', page.url());

    // Step 2 — Navigate to blog creation
    console.log('📝 Navigating to blog creation...');
    await page.goto('https://secure.levitate.ai/#/campaigns/blogs', { waitUntil: 'networkidle0' });
    await page.waitForTimeout(3000);

    // Click Create New Blog Post
    const createSelectors = ['button:contains("Create New Blog Post")', '.create-blog', '[data-test="create-blog"]'];
    let clicked = false;
    for (const sel of createSelectors) {
      try {
        await page.click(sel);
        clicked = true;
        break;
      } catch (e) {}
    }

    if (!clicked) {
      // Try finding by text
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Create New Blog Post')) {
          await btn.click();
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) throw new Error('Could not find Create New Blog Post button');
    await page.waitForTimeout(2000);

    // Step 3 — Fill title
    console.log('✍️ Filling title...');
    const titleSelectors = ['input[placeholder*="Title"]', 'input[name="title"]', '.title-input input', 'input.title'];
    for (const sel of titleSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await page.type(sel, title, { delay: 30 });
        break;
      } catch (e) {}
    }

    // Step 4 — Fill content
    console.log('📄 Filling content...');
    const contentSelectors = ['.ql-editor', '[contenteditable="true"]', 'textarea[name="content"]'];
    for (const sel of contentSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel);
        await page.keyboard.type(content, { delay: 10 });
        break;
      } catch (e) {}
    }

    await page.waitForTimeout(1000);

    // Step 5 — Save
    console.log('💾 Saving blog post...');
    const saveButtons = await page.$$('button');
    for (const btn of saveButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Save Blog Post')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(2000);

    console.log('✅ Blog post saved in Levitate!');
    return true;

  } catch (err) {
    console.error('❌ Levitate error:', err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { postBlogToLevitate };