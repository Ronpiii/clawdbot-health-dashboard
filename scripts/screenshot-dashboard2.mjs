import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const OUT = '/data02/virt137413/clawd/mockups';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

// Login
await page.goto('https://anivia.vercel.app/login', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));
await page.type('input[type="email"], input[placeholder*="company" i]', 'Ronvi2000@gmail.com');
await page.type('input[type="password"]', 'Lammas123!');
await new Promise(r => setTimeout(r, 500));
await page.click('button[type="submit"]');
await new Promise(r => setTimeout(r, 5000));

const pages = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'leads', path: '/leads' },
  { name: 'sequences', path: '/sequences' },
  { name: 'pipeline', path: '/pipeline' },
];

for (const p of pages) {
  console.log(`capturing ${p.name}...`);
  await page.goto(`https://anivia.vercel.app${p.path}`, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${OUT}/dash-${p.name}.png`, fullPage: false });
  console.log(`  saved dash-${p.name}.png`);
}

// Mobile
console.log('capturing mobile dashboard...');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto('https://anivia.vercel.app/dashboard', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/dash-mobile.png`, fullPage: false });

await browser.close();

// Build hero mockups
const browser2 = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

for (const p of pages) {
  const desktopB64 = readFileSync(`${OUT}/dash-${p.name}.png`).toString('base64');
  const mobileB64 = readFileSync(`${OUT}/dash-mobile.png`).toString('base64');

  const html = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 80px; position: relative; overflow: hidden; }
  body::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at 30% 40%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(139,92,246,0.06) 0%, transparent 50%); }
  .scene { position: relative; display: flex; align-items: flex-end; gap: 40px; z-index: 1; }
  .laptop { max-width: 800px; width: 100%; }
  .laptop-screen { background: #1a1a2e; border-radius: 12px 12px 0 0; padding: 10px 10px 0; box-shadow: 0 -4px 60px rgba(59,130,246,0.15); }
  .laptop-topbar { display: flex; align-items: center; gap: 5px; padding: 6px 10px; background: #2a2a3e; border-radius: 8px 8px 0 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot-red { background: #ef4444; } .dot-yellow { background: #eab308; } .dot-green { background: #22c55e; }
  .url-bar { flex: 1; background: #1a1a2e; border-radius: 4px; padding: 3px 10px; color: #94a3b8; font-size: 11px; margin-left: 10px; }
  .laptop-content img { width: 100%; display: block; }
  .laptop-base { background: linear-gradient(to bottom, #2a2a3e, #1f1f32); height: 14px; border-radius: 0 0 10px 10px; position: relative; }
  .laptop-base::after { content: ''; position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); width: 25%; height: 5px; background: #2a2a3e; border-radius: 0 0 6px 6px; }
  .phone { background: #1a1a2e; border-radius: 32px; padding: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); width: 200px; flex-shrink: 0; margin-bottom: 20px; }
  .phone-screen { border-radius: 24px; overflow: hidden; background: #000; }
  .phone-screen img { width: 100%; display: block; }
  .phone-bar { width: 60px; height: 3px; background: #4a4a5e; border-radius: 2px; margin: 8px auto 2px; }
</style></head>
<body>
  <div class="scene">
    <div class="laptop">
      <div class="laptop-screen">
        <div class="laptop-topbar">
          <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
          <div class="url-bar">anivia.vercel.app${p.path}</div>
        </div>
        <div class="laptop-content"><img src="data:image/png;base64,${desktopB64}" /></div>
      </div>
      <div class="laptop-base"></div>
    </div>
    <div class="phone">
      <div class="phone-screen"><img src="data:image/png;base64,${mobileB64}" /></div>
      <div class="phone-bar"></div>
    </div>
  </div>
</body></html>`;

  const mp = await browser2.newPage();
  await mp.setViewport({ width: 1400, height: 850, deviceScaleFactor: 2 });
  await mp.setContent(html, { waitUntil: 'networkidle0' });
  await mp.screenshot({ path: `${OUT}/anivia-${p.name}-hero.png`, fullPage: false });
  await mp.close();
  console.log(`saved anivia-${p.name}-hero.png`);
}

await browser2.close();
console.log('all done!');
