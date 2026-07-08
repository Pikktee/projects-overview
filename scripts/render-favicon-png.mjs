import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'src/favicon.svg'), 'utf8');
const encoded = encodeURIComponent(svg);
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0f1114}img{display:block}</style></head><body><img src="data:image/svg+xml,${encoded}" width="180" height="180" alt=""></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
await page.emulateMedia({ colorScheme: 'dark' });
await page.setContent(html);
const png = await page.locator('img').screenshot({ type: 'png' });
writeFileSync(join(root, 'src/apple-touch-icon.png'), png);
writeFileSync(join(root, 'public/apple-touch-icon.png'), png);
await browser.close();
console.log('apple-touch-icon.png (180×180) written to src/ and public/');
