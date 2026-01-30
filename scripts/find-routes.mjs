import puppeteer from 'puppeteer';

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

console.log('logged in, URL:', page.url());

// Find all links on the dashboard
const links = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a')).map(a => ({
    href: a.href,
    text: a.textContent.trim().substring(0, 50)
  }));
});

console.log('\nall links on dashboard:');
for (const l of links) {
  console.log(`  ${l.text} → ${l.href}`);
}

await browser.close();
