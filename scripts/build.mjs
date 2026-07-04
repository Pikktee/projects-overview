import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

mkdirSync(publicDir, { recursive: true });

const data = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));
const { sections } = data;
const allProjects = sections.flatMap((s) => s.projects);

for (const file of ['styles.css', 'app.js', 'favicon.svg', 'apple-touch-icon.png']) {
  copyFileSync(join(root, 'src', file), join(publicDir, file));
}

writeFileSync(join(publicDir, 'projects.json'), JSON.stringify(data));

const headExtras = `  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#0f1114" />`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderStackPreview(stack) {
  const visible = stack.slice(0, 3);
  const rest = stack.length - visible.length;
  const tags = visible.map((t) => `<span class="tag tag--sm">${escapeHtml(t)}</span>`).join('');
  const more = rest > 0 ? `<span class="tag tag--sm tag--more">+${rest}</span>` : '';
  return `<div class="card__tags">${tags}${more}</div>`;
}

function renderCard(p, i) {
  const hasShot = existsSync(join(publicDir, 'screenshots', `${p.slug}.png`));
  const img = hasShot
    ? `<img src="/screenshots/${p.slug}.png" alt="" loading="lazy" width="640" height="400" />`
    : `<div class="card__placeholder" aria-hidden="true"><span>${escapeHtml(p.name.charAt(0))}</span></div>`;

  const stackAttr = p.stack.map((t) => t.toLowerCase()).join(',');

  return `
    <article class="card" style="--accent:${p.accent}" data-slug="${p.slug}" data-stack="${escapeHtml(stackAttr)}" data-section="${escapeHtml(p._section || '')}">
      <button type="button" class="card__btn" aria-haspopup="dialog" aria-controls="project-drawer" aria-expanded="false" data-open="${p.slug}">
        <div class="card__media">${img}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(p.name)}</h2>
          <p class="card__desc">${escapeHtml(p.description)}</p>
          ${renderStackPreview(p.stack)}
          <span class="card__cta">Details ansehen <span aria-hidden="true">→</span></span>
        </div>
      </button>
    </article>`;
}

const sectionsWithMeta = sections.map((section) => ({
  ...section,
  projects: section.projects.map((p) => ({ ...p, _section: section.title || 'Hauptprojekte' })),
}));

const sectionsHtml = sectionsWithMeta
  .map((section) => {
    const heading = section.title
      ? `<h2 class="section__heading" id="section-${section.title.toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(section.title)}</h2>`
      : '';
    const cards = section.projects.map((p, i) => renderCard(p, i)).join('\n');
    return `
  <section class="section${section.title ? ' section--labeled' : ''}" data-section="${escapeHtml(section.title || 'Hauptprojekte')}">
    ${heading}
    <div class="grid">${cards}
    </div>
  </section>`;
  })
  .join('\n');

const allStacks = [...new Set(allProjects.flatMap((p) => p.stack))].sort((a, b) => a.localeCompare(b, 'de'));

const stackCounts = Object.fromEntries(
  allStacks.map((t) => [t, allProjects.filter((p) => p.stack.includes(t)).length]),
);
const toolbarStacks = allStacks
  .filter((t) => stackCounts[t] >= 2)
  .sort((a, b) => stackCounts[b] - stackCounts[a] || a.localeCompare(b, 'de'));

const filterChips = toolbarStacks
  .map(
    (t) =>
      `<button type="button" class="filter-chip" data-filter="${escapeHtml(t.toLowerCase())}">${escapeHtml(t)}</button>`,
  )
  .join('\n');

const stackOverview = allStacks
  .map((t) => {
    const count = allProjects.filter((p) => p.stack.includes(t)).length;
    return `<button type="button" class="stack-pill" data-filter="${escapeHtml(t.toLowerCase())}" title="${count} Projekt${count !== 1 ? 'e' : ''}"><span class="stack-pill__name">${escapeHtml(t)}</span><span class="stack-pill__count">${count}</span></button>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Portfolio von Henrik Heil — Webprojekte, Tech-Stacks und Live-Demos: Patina, Velosia, hugur und mehr." />
  <title>Portfolio · Henrik Heil</title>
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
    <h1 class="hero__title">Portfolio &amp; <em>Projekte</em></h1>
    <p class="hero__lead">Web-Apps, KI-Tools und Experimente — gebaut mit Fokus auf Nutzerfreundlichkeit. Klicke ein Projekt für Details, Tech-Stack und Quellcode.</p>
  </header>

  <div class="toolbar" id="toolbar">
    <div class="toolbar__inner">
      <div class="toolbar__filters" role="group" aria-label="Nach Technologie filtern">
        <button type="button" class="filter-chip filter-chip--active" data-filter="all">Alle</button>
        ${filterChips}
      </div>
      <p class="toolbar__count" id="filter-count" aria-live="polite">${allProjects.length} Projekte</p>
    </div>
  </div>

  <main class="sections" id="projects">${sectionsHtml}
  </main>

  <section class="stack-section" aria-labelledby="stack-heading">
    <div class="stack-section__inner">
      <h2 class="stack-section__heading" id="stack-heading">Tech-Stack <em>Übersicht</em></h2>
      <p class="stack-section__lead">Alle Technologien, die in diesen Projekten zum Einsatz kommen — klicken zum Filtern.</p>
      <div class="stack-grid" role="group" aria-label="Technologie-Übersicht">
        ${stackOverview}
      </div>
    </div>
  </section>

  <footer class="footer">
    <a href="/impressum.html">Impressum</a>
    <span class="footer__sep" aria-hidden="true">·</span>
    <span>${allProjects.length} Projekte</span>
  </footer>

  <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
  <aside class="drawer" id="project-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
    <div class="drawer__header">
      <button type="button" class="drawer__close" id="drawer-close" aria-label="Schließen">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="drawer__scroll">
      <div class="drawer__media" id="drawer-media"></div>
      <div class="drawer__content">
        <h2 class="drawer__title" id="drawer-title"></h2>
        <p class="drawer__desc" id="drawer-desc"></p>
        <ul class="drawer__highlights" id="drawer-highlights"></ul>
        <div class="drawer__stack" id="drawer-stack"></div>
        <div class="drawer__actions" id="drawer-actions"></div>
      </div>
    </div>
  </aside>

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
    <a class="legal__back" href="/">← Zurück zum Portfolio</a>
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
console.log(`Built portfolio with ${allProjects.length} projects, ${allStacks.length} stack tags → public/`);
