import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const metricsPath = join(root, 'data/metrics.json');

mkdirSync(publicDir, { recursive: true });

const data = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));
const metrics = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : {};
const copyPath = join(root, 'data/project-copy.json');
const copy = existsSync(copyPath) ? JSON.parse(readFileSync(copyPath, 'utf8')) : {};

function mergeProject(p) {
  const m = metrics[p.slug] || {};
  const c = copy[p.slug] || {};
  return {
    ...p,
    github: m.github || p.github || null,
    description: c.summary || c.tagline || m.description || p.name,
    overview: c.overview || '',
    uxNarrative: c.uxNarrative || '',
    highlights: c.highlights || m.highlights || [],
    stack: m.stack || [],
    dependencies: m.dependencies || { ui: [], data: [], ai: [], infra: [], testing: [], other: [] },
    dependencyCount: m.dependencyCount || 0,
    loc: m.loc || null,
    locFormatted: m.locFormatted || '—',
    files: m.files || null,
    coverage: m.coverage || null,
    git: m.git || null,
    ux: m.ux || null,
    analyzedAt: m.analyzedAt || null,
  };
}

const sections = data.sections.map((section) => ({
  ...section,
  projects: section.projects.map(mergeProject),
}));

const portfolio = { sections };
const allProjects = sections.flatMap((s) => s.projects);

for (const file of ['styles.css', 'app.js', 'favicon.svg', 'apple-touch-icon.png']) {
  copyFileSync(join(root, 'src', file), join(publicDir, file));
}

writeFileSync(join(publicDir, 'projects.json'), JSON.stringify(portfolio));

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

function renderCard(p) {
  const hasShot = existsSync(join(publicDir, 'screenshots', `${p.slug}.png`));
  const img = hasShot
    ? `<img src="/screenshots/${p.slug}.png" alt="" loading="lazy" width="640" height="400" />`
    : `<div class="card__placeholder" aria-hidden="true"><span>${escapeHtml(p.name.charAt(0))}</span></div>`;

  const stackAttr = (p.stack || []).map((t) => t.toLowerCase()).join(',');

  return `
    <article class="card" style="--accent:${p.accent}" data-slug="${p.slug}" data-stack="${escapeHtml(stackAttr)}">
      <button type="button" class="card__btn" data-open="${p.slug}" aria-haspopup="dialog" aria-controls="project-drawer" aria-expanded="false">
        <div class="card__media">${img}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(p.name)}</h2>
          <p class="card__desc">${escapeHtml(p.description)}</p>
          <span class="card__cta">Details ansehen <span aria-hidden="true">→</span></span>
        </div>
      </button>
    </article>`;
}

const sectionsHtml = sections
  .map((section) => {
    const heading = section.title
      ? `<h2 class="section__heading" id="section-${section.title.toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(section.title)}</h2>`
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

const allStacks = [...new Set(allProjects.flatMap((p) => p.stack || []))].sort((a, b) =>
  a.localeCompare(b, 'de'),
);

const stackOverview = allStacks
  .map((t) => {
    const count = allProjects.filter((p) => p.stack?.includes(t)).length;
    return `<button type="button" class="stack-pill" data-filter="${escapeHtml(t.toLowerCase())}" title="${count} Projekt${count !== 1 ? 'e' : ''}"><span class="stack-pill__name">${escapeHtml(t)}</span><span class="stack-pill__count">${count}</span></button>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
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
    <p class="hero__lead">Aktuelle Web-Apps, KI-Tools und Experimente</p>
  </header>

  <main class="sections" id="projects">${sectionsHtml}
  </main>

  <section class="stack-section" aria-labelledby="stack-heading">
    <div class="stack-section__inner">
      <h2 class="stack-section__heading" id="stack-heading">Tech-Stack <em>Übersicht</em></h2>
      <p class="stack-section__status" id="filter-status" aria-live="polite" hidden>
        <span id="filter-count"></span>
        <button type="button" class="stack-reset" id="filter-reset">Alle anzeigen</button>
      </p>
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
    <div class="drawer__scroll">
      <div class="drawer__hero">
        <div class="drawer__media" id="drawer-media"></div>
        <div class="drawer__hero-scrim" aria-hidden="true"></div>
        <button type="button" class="drawer__close" id="drawer-close" aria-label="Schließen">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="drawer__body">
        <div class="drawer__intro">
          <div class="drawer__head">
            <h2 class="drawer__title" id="drawer-title"></h2>
            <div class="drawer__intro-actions" id="drawer-intro-actions"></div>
          </div>
          <div class="drawer__stats" id="drawer-stats"></div>
        </div>
        <div class="drawer__tabs" role="tablist" aria-label="Projekt-Details">
          <button type="button" class="drawer__tab drawer__tab--active" role="tab" id="tab-overview" aria-selected="true" aria-controls="panel-overview" data-tab="overview">Überblick</button>
          <button type="button" class="drawer__tab" role="tab" id="tab-ux" aria-selected="false" aria-controls="panel-ux" data-tab="ux">UX</button>
          <button type="button" class="drawer__tab" role="tab" id="tab-tech" aria-selected="false" aria-controls="panel-tech" data-tab="tech">Technik</button>
        </div>
        <div class="drawer__panels">
          <div class="drawer__panel drawer__panel--active" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview"></div>
          <div class="drawer__panel" role="tabpanel" id="panel-ux" aria-labelledby="tab-ux" hidden></div>
          <div class="drawer__panel" role="tabpanel" id="panel-tech" aria-labelledby="tab-tech" hidden></div>
        </div>
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
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
console.log(
  `Built portfolio: ${allProjects.length} projects, ${allStacks.length} stack tags, metrics for ${Object.keys(metrics).length} slugs → public/`,
);
