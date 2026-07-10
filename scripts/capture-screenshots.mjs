import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { optimizeImages } from './optimize-images.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { sections } = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));
const targets = JSON.parse(readFileSync(join(root, 'data/screenshot-targets.json'), 'utf8'));
const projects = sections.flatMap((s) => s.projects);

const outDir = join(root, 'public/screenshots');
mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_EXCLUDE = ['/impressum', '/datenschutz', '/privacy', '/legal', '/agb', '/cookie'];
const AUTH_PATH_RE =
  /^\/(login|signin|sign-in|signup|sign-up|register|anmelden|registrieren|auth|oauth|forgot-password|reset-password)(\/|$)/i;
const PREFERRED_PATH_RE =
  /(editor|dashboard|app|play|module|finden|quiz|game|studio|workspace|kurs|course|planer|planner|demo)/i;

function isAuthPath(path) {
  return AUTH_PATH_RE.test(path);
}

function pathScore(path) {
  if (isAuthPath(path)) return -100;
  if (path === '/') return 0;
  if (PREFERRED_PATH_RE.test(path)) return 12;
  const depth = path.split('/').filter(Boolean).length;
  return 4 + Math.min(depth, 3);
}

function projectConfig(slug) {
  return targets[slug] || targets.default;
}

function normalizePath(href) {
  try {
    const u = new URL(href);
    if (!u.pathname || u.pathname === '') return '/';
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
}

async function discoverPaths(page, baseUrl, config) {
  const origin = new URL(baseUrl).origin;
  const exclude = new Set([...(config.discover?.exclude || []), ...DEFAULT_EXCLUDE]);
  const max = config.discover?.max ?? 2;
  const skipAuth = config.discover?.skipAuth !== false;
  const found = new Map();

  const hrefs = await page.$$eval('a[href]', (links) => links.map((a) => a.getAttribute('href')).filter(Boolean));

  for (const href of hrefs) {
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    let path;
    try {
      const u = new URL(href, baseUrl);
      if (u.origin !== origin) continue;
      path = normalizePath(u.href);
    } catch {
      continue;
    }
    if (!path || exclude.has(path) || path === '/') continue;
    if (skipAuth && isAuthPath(path)) continue;
    const score = pathScore(path);
    if (score < 0) continue;
    const prev = found.get(path) ?? -1;
    if (score > prev) found.set(path, score);
  }

  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([path]) => path);
}

function slugifyPath(path) {
  if (path === '/') return 'landing';
  return path
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'page';
}

async function captureShot(page, url, filePath) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1800);
  // SPAs: kurz scrollen und zurück — oft lädt lazy Content
  await page.evaluate(() => window.scrollTo(0, Math.min(400, document.body.scrollHeight)));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  mkdirSync(dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, type: 'png', fullPage: false });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const meta = {};

for (const project of projects) {
  const { slug, url } = project;
  const config = projectConfig(slug);
  const slugDir = join(outDir, slug);

  if (existsSync(slugDir)) rmSync(slugDir, { recursive: true, force: true });
  mkdirSync(slugDir, { recursive: true });

  console.log(`\n${slug} (${url})`);

  const planned = new Map();

  for (const shot of config.shots || []) {
    if (isAuthPath(shot.path || '/')) continue;
    planned.set(shot.id, { path: shot.path, label: shot.label, optional: shot.optional });
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);

    for (const path of await discoverPaths(page, url, config)) {
      const id = slugifyPath(path);
      if (!planned.has(id)) {
        planned.set(id, {
          path,
          label: { de: path === '/' ? 'Startseite' : path.replace(/^\//, ''), en: path === '/' ? 'Landing page' : path.replace(/^\//, '') },
          optional: true,
        });
      }
    }
  } catch (err) {
    console.error(`  ✗ Discovery: ${err.message}`);
  }

  const captured = [];
  for (const [id, shot] of planned) {
    const targetUrl = new URL(shot.path || '/', url).href;
    const filePath = join(slugDir, `${id}.png`);
    try {
      await captureShot(page, targetUrl, filePath);
      captured.push(id);
      console.log(`  ✓ ${id} → ${shot.path}`);
    } catch (err) {
      if (shot.optional) {
        console.warn(`  ○ ${id} übersprungen (${err.message})`);
      } else {
        console.error(`  ✗ ${id}: ${err.message}`);
      }
    }
  }

  // Legacy flat cover for fallback
  if (captured.length) {
    const cover = captured.includes('landing') ? 'landing' : captured[0];
    const coverSrc = join(slugDir, `${cover}.png`);
    const flatDest = join(outDir, `${slug}.png`);
    if (existsSync(coverSrc)) copyFileSync(coverSrc, flatDest);
  }

  try {
    meta[slug] = { title: await page.title(), captured };
  } catch {
    meta[slug] = { captured };
  }
}

await browser.close();
writeFileSync(join(root, 'data/scraped-meta.json'), JSON.stringify(meta, null, 2));

console.log('\nOptimiere Bilder…');
await optimizeImages();
console.log('\nFertig. Führe danach `npm run build` aus.');
