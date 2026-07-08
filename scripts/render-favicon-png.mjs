import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const variants = [
  { svg: 'favicon.svg', png: 'apple-touch-icon.png' },
  { svg: 'favicon-arrow.svg', png: 'apple-touch-icon-arrow.png' },
  { svg: 'favicon-h.svg', png: 'apple-touch-icon-h.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
await page.emulateMedia({ colorScheme: 'dark' });

for (const { svg: svgName, png: pngName } of variants) {
  const svg = readFileSync(join(root, 'src', svgName), 'utf8');
  const encoded = encodeURIComponent(svg);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0f1114}img{display:block}</style></head><body><img src="data:image/svg+xml,${encoded}" width="180" height="180" alt=""></body></html>`;
  await page.setContent(html);
  const png = await page.locator('img').screenshot({ type: 'png' });
  writeFileSync(join(root, 'src', pngName), png);
  writeFileSync(join(root, 'public', pngName), png);
  console.log(`${pngName} (180×180) ← ${svgName}`);
}

await browser.close();
