import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const OUT = '/data02/virt137413/clawd/mockups';

// Convert screenshot to base64 for embedding
const landingB64 = readFileSync(`${OUT}/landing.png`).toString('base64');
const mobileB64 = readFileSync(`${OUT}/landing-mobile.png`).toString('base64');

// Laptop mockup
const laptopHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 60px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .laptop {
    position: relative;
    max-width: 1000px;
    width: 100%;
  }
  .laptop-screen {
    background: #1a1a2e;
    border-radius: 12px 12px 0 0;
    padding: 12px 12px 0;
    box-shadow: 0 -4px 60px rgba(59, 130, 246, 0.15);
  }
  .laptop-topbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #2a2a3e;
    border-radius: 8px 8px 0 0;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot-red { background: #ef4444; }
  .dot-yellow { background: #eab308; }
  .dot-green { background: #22c55e; }
  .url-bar {
    flex: 1;
    background: #1a1a2e;
    border-radius: 4px;
    padding: 4px 12px;
    color: #94a3b8;
    font-size: 12px;
    margin-left: 12px;
  }
  .laptop-content img {
    width: 100%;
    display: block;
    border-radius: 0 0 4px 4px;
  }
  .laptop-base {
    background: linear-gradient(to bottom, #2a2a3e, #1f1f32);
    height: 18px;
    border-radius: 0 0 12px 12px;
    position: relative;
  }
  .laptop-base::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 30%;
    height: 6px;
    background: #2a2a3e;
    border-radius: 0 0 8px 8px;
  }
  .badge {
    position: absolute;
    top: -20px;
    right: -20px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
  }
</style>
</head>
<body>
  <div class="laptop">
    <div class="badge">AI Sales Automation</div>
    <div class="laptop-screen">
      <div class="laptop-topbar">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
        <div class="url-bar">anivia.vercel.app</div>
      </div>
      <div class="laptop-content">
        <img src="data:image/png;base64,${landingB64}" />
      </div>
    </div>
    <div class="laptop-base"></div>
  </div>
</body>
</html>`;

// Phone mockup
const phoneHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 60px;
  }
  .phone {
    background: #1a1a2e;
    border-radius: 40px;
    padding: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(59, 130, 246, 0.1);
    width: 320px;
  }
  .phone-notch {
    width: 120px;
    height: 28px;
    background: #1a1a2e;
    border-radius: 0 0 16px 16px;
    margin: 0 auto;
    position: relative;
    top: -14px;
    margin-bottom: -14px;
    z-index: 2;
  }
  .phone-screen {
    border-radius: 28px;
    overflow: hidden;
    background: #000;
  }
  .phone-screen img {
    width: 100%;
    display: block;
  }
  .phone-bar {
    width: 100px;
    height: 4px;
    background: #4a4a5e;
    border-radius: 2px;
    margin: 12px auto 4px;
  }
</style>
</head>
<body>
  <div class="phone">
    <div class="phone-notch"></div>
    <div class="phone-screen">
      <img src="data:image/png;base64,${mobileB64}" />
    </div>
    <div class="phone-bar"></div>
  </div>
</body>
</html>`;

// Combined hero mockup - laptop + phone
const heroHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 80px;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 30% 40%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
                radial-gradient(circle at 70% 60%, rgba(139, 92, 246, 0.06) 0%, transparent 50%);
  }
  .scene {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 40px;
    z-index: 1;
  }
  .laptop {
    max-width: 800px;
    width: 100%;
  }
  .laptop-screen {
    background: #1a1a2e;
    border-radius: 12px 12px 0 0;
    padding: 10px 10px 0;
    box-shadow: 0 -4px 60px rgba(59, 130, 246, 0.15);
  }
  .laptop-topbar {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    background: #2a2a3e;
    border-radius: 8px 8px 0 0;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot-red { background: #ef4444; }
  .dot-yellow { background: #eab308; }
  .dot-green { background: #22c55e; }
  .url-bar {
    flex: 1;
    background: #1a1a2e;
    border-radius: 4px;
    padding: 3px 10px;
    color: #94a3b8;
    font-size: 11px;
    margin-left: 10px;
  }
  .laptop-content img { width: 100%; display: block; }
  .laptop-base {
    background: linear-gradient(to bottom, #2a2a3e, #1f1f32);
    height: 14px;
    border-radius: 0 0 10px 10px;
  }
  .laptop-base::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 25%;
    height: 5px;
    background: #2a2a3e;
    border-radius: 0 0 6px 6px;
  }
  .phone {
    background: #1a1a2e;
    border-radius: 32px;
    padding: 10px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    width: 200px;
    flex-shrink: 0;
    margin-bottom: 20px;
  }
  .phone-screen {
    border-radius: 24px;
    overflow: hidden;
    background: #000;
  }
  .phone-screen img { width: 100%; display: block; }
  .phone-bar {
    width: 60px;
    height: 3px;
    background: #4a4a5e;
    border-radius: 2px;
    margin: 8px auto 2px;
  }
</style>
</head>
<body>
  <div class="scene">
    <div class="laptop">
      <div class="laptop-screen">
        <div class="laptop-topbar">
          <div class="dot dot-red"></div>
          <div class="dot dot-yellow"></div>
          <div class="dot dot-green"></div>
          <div class="url-bar">anivia.vercel.app</div>
        </div>
        <div class="laptop-content">
          <img src="data:image/png;base64,${landingB64}" />
        </div>
      </div>
      <div class="laptop-base"></div>
    </div>
    <div class="phone">
      <div class="phone-screen">
        <img src="data:image/png;base64,${mobileB64}" />
      </div>
      <div class="phone-bar"></div>
    </div>
  </div>
</body>
</html>`;

// Render all mockups
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const mockups = [
  { name: 'mockup-laptop', html: laptopHTML, width: 1200, height: 850 },
  { name: 'mockup-phone', html: phoneHTML, width: 500, height: 900 },
  { name: 'mockup-hero', html: heroHTML, width: 1400, height: 850 },
];

for (const m of mockups) {
  console.log(`rendering ${m.name}...`);
  const page = await browser.newPage();
  await page.setViewport({ width: m.width, height: m.height, deviceScaleFactor: 2 });
  await page.setContent(m.html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `${OUT}/${m.name}.png`, fullPage: false });
  await page.close();
  console.log(`  saved ${m.name}.png`);
}

await browser.close();
console.log('\nall mockups done!');
