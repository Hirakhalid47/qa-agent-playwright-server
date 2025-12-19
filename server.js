const express = require('express');
const { chromium } = require('playwright');
const ngrok = require('ngrok');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static files (e.g., screenshots)
app.use('/screenshots', express.static('screenshots'));

// Ensure screenshots folder exists
const fs = require('fs');
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

app.post('/run', async (req, res) => {
  const { url, actions } = req.body;
  
  if (!url || !actions || !Array.isArray(actions)) {
    return res.status(400).json({ error: 'Missing url or actions array' });
  }

  console.log(`🧪 Starting test on: ${url}`);
  console.log(`📝 Actions:`, actions);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Step 1: Go to URL
    await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });

    // Step 2: Perform actions
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i].trim().toLowerCase();
      
      if (action.startsWith('type ')) {
        const [_, selector, value] = action.match(/type\s+(.+?)\s+(.+)/) || [];
        if (selector && value) {
          const realValue = value === 'email' ? `test+${Date.now()}@example.com` : 
                           value === 'name' ? 'Test User' :
                           value === 'password' ? 'Pass123!' : value;
          await page.fill(selector, realValue);
          console.log(`✅ Typed into ${selector}: ${realValue}`);
        }
      } 
      else if (action.startsWith('click ')) {
        const selector = action.replace('click ', '').trim();
        await page.click(selector);
        console.log(`✅ Clicked ${selector}`);
      }
      else if (action.startsWith('wait for ')) {
        const selector = action.replace('wait for ', '').trim();
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`✅ Waited for ${selector}`);
      }
      else if (action === 'screenshot') {
        const timestamp = Date.now();
        const filename = `screenshot-${timestamp}.png`;
        const filepath = path.join('screenshots', filename);
        await page.screenshot({ path: filepath });
        console.log(`📸 Screenshot saved: ${filename}`);
      }
    }

    // Final screenshot + HTML snippet
    const finalScreenshot = `screenshot-final-${Date.now()}.png`;
    const finalPath = path.join('screenshots', finalScreenshot);
    await page.screenshot({ path: finalPath });

    const htmlSnippet = await page.evaluate(() => document.body.innerText.substring(0, 500));

    await browser.close();

    const publicUrl = process.env.NGROK_URL || 'http://localhost:3000';
    res.json({
      status: 'success',
      screenshotUrl: `${publicUrl}/screenshots/${finalScreenshot}`,
      htmlSnippet,
      performedActions: actions
    });

  } catch (e) {
    await browser.close();
    console.error('❌ Error:', e.message);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  // Expose via ngrok
  try {
    const url = await ngrok.connect(PORT);
    console.log(`🔗 ngrok URL: ${url}`);
    process.env.NGROK_URL = url;
  } catch (e) {
    console.log('⚠️ ngrok not available — running locally only.');
  }
});
