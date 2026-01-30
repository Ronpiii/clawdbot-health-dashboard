import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';

const OUT = '/data02/virt137413/clawd/mockups';
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const pages = [
  { name: 'landing', url: 'https://anivia.vercel.app/', width: 1440, height: 900 },
  { name: 'landing-mobile', url: 'https://anivia.vercel.app/', width: 390, height: 844 },
];

for (const p of pages) {
  console.log(`capturing ${p.name} (${p.width}x${p.height})...`);
  const page = await browser.newPage();
  await page.setViewport({ width: p.width, height: p.height, deviceScaleFactor: 2 });
  await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000)); // let animations settle
  await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
  await page.close();
  console.log(`  saved ${p.name}.png`);
}

// Now try to get dashboard/app pages - need auth
// For now just get the public landing
console.log('\ncapturing full-page landing...');
const fullPage = await browser.newPage();
await fullPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await fullPage.goto('https://anivia.vercel.app/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));
await fullPage.screenshot({ path: `${OUT}/landing-full.png`, fullPage: true });
await fullPage.close();
console.log('  saved landing-full.png');

await browser.close();
console.log('\ndone! screenshots in', OUT);
