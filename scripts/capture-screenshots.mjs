import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const projects = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));

const outDir = join(root, 'public/screenshots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const meta = {};

for (const project of projects) {
  const { slug, url } = project;
  console.log(`Capturing ${slug} (${url})…`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: join(outDir, `${slug}.png`),
      type: 'png',
      fullPage: false,
    });
    const title = await page.title();
    const description = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute('content'))
      .catch(() => null);
    meta[slug] = { title, description };
    console.log(`  ✓ ${title}`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

await browser.close();
writeFileSync(join(root, 'data/scraped-meta.json'), JSON.stringify(meta, null, 2));
console.log('\nFertig. Führe danach `npm run build` aus.');
