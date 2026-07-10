import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, '..', 'src', 'fonts');
const cssUrl =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&display=swap';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

mkdirSync(fontsDir, { recursive: true });

const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => r.text());
const blocks = css.split('@font-face').slice(1);
  const faces = [];
  const seen = new Set();

  for (const block of blocks) {
    const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
    const style = block.match(/font-style:\s*(\w+)/)?.[1] || 'normal';
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1] || '400';
    const src = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!family || !src) continue;

    const key = `${family}|${style}|${weight}`;
    if (seen.has(key)) continue;
    seen.add(key);

  const slug = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}${style === 'italic' ? '-italic' : ''}`;
  const filename = `${slug}.woff2`;
  const dest = join(fontsDir, filename);

  if (!existsSync(dest)) {
    const buf = await fetch(src).then((r) => r.arrayBuffer());
    writeFileSync(dest, Buffer.from(buf));
    console.log(`  ✓ ${filename}`);
  } else {
    console.log(`  ○ ${filename} (vorhanden)`);
  }

  faces.push({ family, style, weight, filename });
}

const cssOut = faces
  .map(
    ({ family, style, weight, filename }) => `@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url('/fonts/${filename}') format('woff2');
}`,
  )
  .join('\n\n');

writeFileSync(join(fontsDir, 'fonts.css'), `${cssOut}\n`);
console.log(`\nGeschrieben: src/fonts/fonts.css (${faces.length} Schnitte)`);
