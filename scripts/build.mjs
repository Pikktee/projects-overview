import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

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
    facets: p.facets || [],
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

const projectsJsonStr = JSON.stringify(portfolio);
writeFileSync(join(publicDir, 'projects.json'), projectsJsonStr);

// Cache-Busting: kurzer Hash über app.js + styles.css + projects.json. Ändert
// sich der Inhalt, ändert sich die URL — der Browser lädt garantiert frisch.
const assetVersion = createHash('sha1')
  .update(readFileSync(join(root, 'src/app.js')))
  .update(readFileSync(join(root, 'src/styles.css')))
  .update(projectsJsonStr)
  .digest('hex')
  .slice(0, 8);

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

  const facetAttr = (p.facets || []).join(',');

  return `
    <article class="card" style="--accent:${p.accent}" data-slug="${p.slug}" data-facets="${escapeHtml(facetAttr)}">
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

// Kuratierte Merkmale (Reihenfolge = Anzeigereihenfolge). Icons sind schlichte
// Inline-SVGs, damit die Leiste ohne Icon-Font auskommt.
const FACETS = [
  {
    key: 'ai',
    label: 'KI-gestützt',
    icon: '<path d="M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3 8 1.5Z"/>',
  },
  {
    key: 'extension',
    label: 'Chrome-Erweiterung',
    icon: '<path d="M8 1.5a3 3 0 0 0-2.83 2H2.5v3.17a3 3 0 0 1 0 5.66V14.5h3.34a3 3 0 0 1 5.32 0H14.5v-3.34a3 3 0 0 0 0-5.32V2H10.83A3 3 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  },
  {
    key: 'android',
    label: 'Android-App',
    icon: '<path d="M4 6.5h8V12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5Zm-2 .5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm12 0a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM5.5 13.5h2v1.5a1 1 0 1 1-2 0v-1.5Zm3 0h2V15a1 1 0 1 1-2 0v-1.5ZM5 3l-.8-1.3M11 3l.8-1.3M4.2 5.5C4.5 4 6.1 3 8 3s3.5 1 3.8 2.5H4.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    key: '3d',
    label: '3D & Visualisierung',
    icon: '<path d="M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 5l6 3.5L14 5M8 8.5V14.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  },
];

const facetOverview = FACETS.map((f) => {
  const count = allProjects.filter((p) => (p.facets || []).includes(f.key)).length;
  if (count === 0) return '';
  return `<button type="button" class="facet-chip" data-filter="${escapeHtml(f.key)}">
          <svg class="facet-chip__icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${f.icon}</svg>
          <span class="facet-chip__label">${escapeHtml(f.label)}</span>
          <span class="facet-chip__count">${count}</span>
        </button>`;
})
  .filter(Boolean)
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
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
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

  <section class="facet-section" aria-labelledby="facet-heading">
    <div class="facet-section__inner">
      <h2 class="facet-section__heading" id="facet-heading">Nach <em>Merkmal</em> filtern</h2>
      <div class="facet-bar" role="group" aria-label="Projekte nach Merkmal filtern">
        <button type="button" class="facet-chip facet-chip--all is-active" data-filter="all" aria-pressed="true">
          <span class="facet-chip__label">Alle</span>
          <span class="facet-chip__count">${allProjects.length}</span>
        </button>
        ${facetOverview}
      </div>
      <p class="facet-section__status" id="filter-status" aria-live="polite" hidden>
        <span id="filter-count"></span>
        <button type="button" class="stack-reset" id="filter-reset">Alle anzeigen</button>
      </p>
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

  <script>window.__ASSET_V = "${assetVersion}";</script>
  <script src="/app.js?v=${assetVersion}" defer></script>
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
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
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
  `Built portfolio: ${allProjects.length} projects, ${FACETS.filter((f) => allProjects.some((p) => (p.facets || []).includes(f.key))).length} facets, metrics for ${Object.keys(metrics).length} slugs → public/`,
);
