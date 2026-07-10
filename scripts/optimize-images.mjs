import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const screenshotsDir = join(publicDir, 'screenshots');

const CARD_WIDTHS = [480, 768];
const DRAWER_WIDTHS = [768, 1280];
const ALL_WIDTHS = [...new Set([...CARD_WIDTHS, ...DRAWER_WIDTHS])].sort((a, b) => a - b);

function listPngSources() {
  const bySlug = new Map();

  if (!existsSync(screenshotsDir)) return bySlug;

  for (const entry of readdirSync(screenshotsDir)) {
    const full = join(screenshotsDir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      const shots = readdirSync(full)
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({
          slug: entry,
          id: basename(f, '.png'),
          path: join(full, f),
        }));
      if (shots.length) bySlug.set(entry, shots);
      continue;
    }

    if (entry.endsWith('.png') && !entry.includes('-kampagne')) {
      const slug = basename(entry, '.png');
      if (!bySlug.has(slug)) {
        bySlug.set(slug, [{ slug, id: 'landing', path: full }]);
      }
    }
  }

  return bySlug;
}

async function encodeVariants(inputPath, outDir, id, widths) {
  const image = sharp(inputPath);
  const meta = await image.metadata();
  const srcW = meta.width || 1280;
  const srcH = meta.height || 800;
  const formats = { webp: {}, avif: {} };

  mkdirSync(outDir, { recursive: true });

  for (const w of widths) {
    const targetW = Math.min(w, srcW);
    const base = join(outDir, `${id}-${targetW}`);

    await sharp(inputPath)
      .resize({ width: targetW, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toFile(`${base}.webp`);

    await sharp(inputPath)
      .resize({ width: targetW, withoutEnlargement: true })
      .avif({ quality: 62, effort: 4 })
      .toFile(`${base}.avif`);

    formats.webp[targetW] = `/screenshots/${basename(outDir)}/${id}-${targetW}.webp`;
    formats.avif[targetW] = `/screenshots/${basename(outDir)}/${id}-${targetW}.avif`;
  }

  const heightAt1280 = Math.round(srcH * (Math.min(1280, srcW) / srcW));
  return {
    id,
    width: Math.min(1280, srcW),
    height: heightAt1280,
    formats,
  };
}

function buildSrcset(formats, type) {
  return Object.entries(formats[type])
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([w, url]) => `${url} ${w}w`)
    .join(', ');
}

export async function optimizeImages() {
  const manifest = {};
  const sources = listPngSources();
  const targetsPath = join(root, 'data/screenshot-targets.json');
  const targets = existsSync(targetsPath) ? JSON.parse(readFileSync(targetsPath, 'utf8')) : {};

  function labelFor(slug, id) {
    const cfg = targets[slug] || targets.default || {};
    const shot = (cfg.shots || []).find((s) => s.id === id);
    if (shot?.label) return shot.label;
    if (id === 'landing') return { de: 'Startseite', en: 'Landing page' };
    return { de: id, en: id };
  }

  for (const [slug, shots] of sources) {
    const outDir = join(screenshotsDir, slug);
    mkdirSync(outDir, { recursive: true });

    const manifestShots = [];
    for (const shot of shots) {
      const encoded = await encodeVariants(shot.path, outDir, shot.id, ALL_WIDTHS);
      manifestShots.push({
        ...encoded,
        label: labelFor(slug, shot.id),
        srcset: {
          webp: buildSrcset(encoded.formats, 'webp'),
          avif: buildSrcset(encoded.formats, 'avif'),
        },
        src: encoded.formats.webp[encoded.width] || Object.values(encoded.formats.webp)[0],
      });
      console.log(`  ✓ ${slug}/${shot.id}`);
    }

    const coverShot =
      manifestShots.find((s) => s.id === 'landing') ||
      manifestShots.find((s) => !/^(login|anmelden|register|signin|sign-in|signup)$/i.test(s.id)) ||
      manifestShots[0];

    manifest[slug] = {
      cover: coverShot?.id || 'landing',
      shots: manifestShots,
    };
  }

  // Legacy flat symlink-style cover for tooling: copy first webp name as slug.webp reference in manifest only
  const meSrc = join(root, 'src', 'me.jpg');
  if (existsSync(meSrc)) {
    await sharp(meSrc).resize(224, 224, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(publicDir, 'me-thumb.jpg'));
    console.log('  ✓ me-thumb.jpg (224px)');
  }

  writeFileSync(join(screenshotsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Optimiere Screenshots…');
  const manifest = await optimizeImages();
  const count = Object.values(manifest).reduce((n, p) => n + p.shots.length, 0);
  console.log(`Fertig: ${count} Screenshots → public/screenshots/manifest.json`);
}
