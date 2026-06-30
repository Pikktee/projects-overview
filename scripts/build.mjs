import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

mkdirSync(publicDir, { recursive: true });

const { sections } = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));
const allProjects = sections.flatMap((s) => s.projects);

for (const file of ['styles.css', 'app.js', 'favicon.svg', 'apple-touch-icon.png']) {
  copyFileSync(join(root, 'src', file), join(publicDir, file));
}

const headExtras = `  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#0f1114" />`;

function renderCard(p) {
  const hasShot = existsSync(join(publicDir, 'screenshots', `${p.slug}.png`));
  const img = hasShot
    ? `<img src="/screenshots/${p.slug}.png" alt="Screenshot von ${p.name}" loading="lazy" width="640" height="400" />`
    : `<div class="card__placeholder" style="--accent:${p.accent}" aria-hidden="true"><span>${p.name.charAt(0)}</span></div>`;

  return `
    <article class="card" style="--accent:${p.accent}">
      <a class="card__link" href="${p.url}" target="_blank" rel="noopener noreferrer">
        <div class="card__media">${img}</div>
        <div class="card__body">
          <h2 class="card__title">${p.name}</h2>
          <p class="card__desc">${p.description}</p>
          <span class="card__cta">Öffnen <span aria-hidden="true">↗</span></span>
        </div>
      </a>
    </article>`;
}

const sectionsHtml = sections
  .map((section) => {
    const heading = section.title
      ? `<h2 class="section__heading">${section.title}</h2>`
      : '';
    const cards = section.projects.map(renderCard).join('\n');
    return `
  <section class="section${section.title ? ' section--labeled' : ''}">
    ${heading}
    <div class="grid">${cards}
    </div>
  </section>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Übersicht über aktuelle Webprojekte von Henrik Heil — Patina, Velosia, hugur und mehr." />
  <title>Projekte · Henrik Heil</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
${headExtras}
</head>
<body>
  <div class="grain" aria-hidden="true"></div>
  <header class="hero">
    <p class="hero__eyebrow">Henrik Heil</p>
    <h1 class="hero__title">Aktuelle <em>Projekte</em></h1>
  </header>
  <main class="sections" id="projects">${sectionsHtml}
  </main>
  <footer class="footer">
    <a href="/impressum.html">Impressum</a>
    <span class="footer__sep" aria-hidden="true">·</span>
    <span>${allProjects.length} Projekte</span>
  </footer>
  <script src="/app.js" defer></script>
</body>
</html>`;

const impressum = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Impressum · Henrik Heil</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
${headExtras}
</head>
<body class="page-legal">
  <div class="grain" aria-hidden="true"></div>
  <main class="legal">
    <a class="legal__back" href="/">← Zurück zur Übersicht</a>
    <h1>Impressum</h1>
    <section>
      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        Henrik Heil<br />
        Westendstraße 100<br />
        60325 Frankfurt am Main
      </p>
    </section>
    <section>
      <h2>Kontakt</h2>
      <p>E-Mail: <a href="mailto:contact@henrikheil.net">contact@henrikheil.net</a></p>
    </section>
    <section>
      <h2>Haftung für Inhalte</h2>
      <p>Als Diensteanbieter bin ich gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG bin ich als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
    </section>
    <section>
      <h2>Haftung für Links</h2>
      <p>Diese Seite enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich.</p>
    </section>
  </main>
</body>
</html>`;

writeFileSync(join(publicDir, 'index.html'), html);
writeFileSync(join(publicDir, 'impressum.html'), impressum);
console.log(`Built ${allProjects.length} project cards in ${sections.length} sections → public/`);
