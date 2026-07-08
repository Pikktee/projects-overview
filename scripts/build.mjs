import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { accessibleButtonBg, accessibleCtaColor } from './a11y-colors.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const metricsPath = join(root, 'data/metrics.json');

mkdirSync(publicDir, { recursive: true });

const data = JSON.parse(readFileSync(join(root, 'data/projects.json'), 'utf8'));
const site = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
const metrics = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : {};
const copyPath = join(root, 'data/project-copy.json');
const copyEnPath = join(root, 'data/project-copy.en.json');
const copyDe = existsSync(copyPath) ? JSON.parse(readFileSync(copyPath, 'utf8')) : {};
const copyEn = existsSync(copyEnPath) ? JSON.parse(readFileSync(copyEnPath, 'utf8')) : {};
const tDe = site.translations.de;

function projectCopyBlock(slug, lang) {
  const source = lang === 'en' ? copyEn : copyDe;
  const c = source[slug] || {};
  return {
    tagline: c.tagline || '',
    summary: c.summary || '',
    overview: c.overview || '',
    uxNarrative: c.uxNarrative || '',
    highlights: c.highlights || [],
  };
}

function mergeProject(p) {
  const m = metrics[p.slug] || {};
  const de = projectCopyBlock(p.slug, 'de');
  const en = projectCopyBlock(p.slug, 'en');
  const copy = { de, en };
  return {
    ...p,
    accentCta: accessibleCtaColor(p.accent),
    accentBtn: accessibleButtonBg(p.accent),
    facets: p.facets || [],
    github: m.github || p.github || null,
    copy,
    description: de.summary || de.tagline || m.description || p.name,
    descriptionEn: en.summary || en.tagline || site.projectSummaries?.en?.[p.slug] || '',
    overview: de.overview || '',
    uxNarrative: de.uxNarrative || '',
    highlights: de.highlights.length ? de.highlights : m.highlights || [],
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
writeFileSync(join(publicDir, 'site.json'), JSON.stringify(site));

// Cache-Busting: kurzer Hash über app.js + styles.css + projects.json. Ändert
// sich der Inhalt, ändert sich die URL — der Browser lädt garantiert frisch.
const assetVersion = createHash('sha1')
  .update(readFileSync(join(root, 'src/app.js')))
  .update(readFileSync(join(root, 'src/styles.css')))
  .update(readFileSync(join(root, 'data/site.json')))
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

const heroLinkIcons = {
  email: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  github: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`,
  linkedin: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.42v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>`,
  external: `<svg class="hero__link-external" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.5 3.5H12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 12.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

function renderCard(p) {
  const hasShot = existsSync(join(publicDir, 'screenshots', `${p.slug}.png`));
  const img = hasShot
    ? `<img src="/screenshots/${p.slug}.png" alt="" aria-hidden="true" loading="lazy" width="640" height="400" />`
    : `<div class="card__placeholder" aria-hidden="true"><span>${escapeHtml(p.name.charAt(0))}</span></div>`;

  const facetAttr = (p.facets || []).join(',');

  return `
    <article class="card" style="--accent:${p.accent};--accent-cta:${p.accentCta};--accent-btn:${p.accentBtn}" data-slug="${p.slug}" data-facets="${escapeHtml(facetAttr)}">
      <button type="button" class="card__btn" data-open="${p.slug}" aria-haspopup="dialog" aria-controls="project-drawer" aria-expanded="false" aria-label="${escapeHtml(`${p.name}: ${p.description}`)}" data-default-aria="${escapeHtml(`${p.name}: ${p.description}`)}"${p.descriptionEn ? ` data-en-aria="${escapeHtml(`${p.name}: ${p.descriptionEn}`)}"` : ''}>
        <div class="card__media">${img}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(p.name)}</h2>
          <p class="card__desc" data-slug="${escapeHtml(p.slug)}" data-default-desc="${escapeHtml(p.description)}">${escapeHtml(p.description)}</p>
          <span class="card__cta" style="color:${p.accentCta}"><span class="card__cta-label" data-i18n-template="card.details" data-name="${escapeHtml(p.name)}">${escapeHtml(tDe.card.details.replace('{name}', p.name))}</span><span class="card__cta-arrow" aria-hidden="true">→</span></span>
        </div>
      </button>
    </article>`;
}

const sectionsHtml = sections
  .map((section, index) => {
    const sectionKey = section.sectionKey || null;
    const sectionLabel = sectionKey ? tDe.sections[sectionKey] : section.title;
    const heading = sectionLabel
      ? `<h2 class="section__heading" id="section-${sectionKey || section.title.toLowerCase().replace(/\s+/g, '-')}"${sectionKey ? ` data-i18n-section="${sectionKey}"` : ''}>${escapeHtml(sectionLabel)}</h2>`
      : '';
    const cards = section.projects.map(renderCard).join('\n');
    const labeled = sectionLabel && index > 0;
    return `
  <section class="section${labeled ? ' section--labeled' : ''}">
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
    icon: '<path d="M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3 8 1.5Z"/>',
  },
  {
    key: 'extension',
    icon: '<path d="M8 1.5a3 3 0 0 0-2.83 2H2.5v3.17a3 3 0 0 1 0 5.66V14.5h3.34a3 3 0 0 1 5.32 0H14.5v-3.34a3 3 0 0 0 0-5.32V2H10.83A3 3 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  },
  {
    key: 'android',
    icon: '<path d="M4 6.5h8V12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5Zm-2 .5a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm12 0a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1ZM5.5 13.5h2v1.5a1 1 0 1 1-2 0v-1.5Zm3 0h2V15a1 1 0 1 1-2 0v-1.5ZM5 3l-.8-1.3M11 3l.8-1.3M4.2 5.5C4.5 4 6.1 3 8 3s3.5 1 3.8 2.5H4.2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    key: 'macos',
    icon: '<path d="M2.5 4.5h11a1 1 0 0 1 1 1v6.5H1.5V5.5a1 1 0 0 1 1-1Zm-1 9h13v1.5H1.5V13.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  },
  {
    key: '3d',
    icon: '<path d="M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 5l6 3.5L14 5M8 8.5V14.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  },
];

const facetOverview = FACETS.map((f) => {
  const count = allProjects.filter((p) => (p.facets || []).includes(f.key)).length;
  if (count === 0) return '';
  return `<button type="button" class="facet-chip" data-filter="${escapeHtml(f.key)}" data-i18n-facet="${escapeHtml(f.key)}">
          <svg class="facet-chip__icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${f.icon}</svg>
          <span class="facet-chip__label">${escapeHtml(tDe.facets[f.key])}</span>
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
  <meta name="description" content="${escapeHtml(tDe.meta.description)}" />
  <title>${escapeHtml(tDe.meta.title)}</title>
  <link rel="alternate" hreflang="de" href="https://www.henrikheil.net/" />
  <link rel="alternate" hreflang="en" href="https://www.henrikheil.net/?lang=en" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
${headExtras}
</head>
<body>
  <a class="skip-link" href="#projects" data-i18n="a11y.skipLink">${escapeHtml(tDe.a11y.skipLink)}</a>
  <div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="grain" aria-hidden="true"></div>

  <header class="hero" id="profil">
    <div class="hero__bar">
      <p class="hero__eyebrow">Portfolio</p>
      <div class="lang-switch" role="group" aria-label="${escapeHtml(tDe.a11y.langSwitch)}" data-i18n-aria="a11y.langSwitch">
        ${site.locales
          .map(
            (code) =>
              `<button type="button" class="lang-switch__btn${code === site.defaultLocale ? ' is-active' : ''}" data-lang="${code}" aria-pressed="${code === site.defaultLocale ? 'true' : 'false'}">${code.toUpperCase()}</button>`,
          )
          .join('\n        ')}
      </div>
    </div>
    <h1 class="hero__name">${escapeHtml(site.profile.name)}</h1>
    <p class="hero__role" data-i18n="profile.role">${escapeHtml(tDe.profile.role)}</p>
    <p class="hero__bio" data-i18n="profile.bio">${escapeHtml(tDe.profile.bio)}</p>
    <nav class="hero__contact" id="kontakt" data-i18n-aria="a11y.contactAria" aria-label="${escapeHtml(tDe.a11y.contactAria)}">
      <ul class="hero__contact-list">
        <li>
          <a class="hero__link" href="mailto:${escapeHtml(site.profile.email)}">
            ${heroLinkIcons.email}
            <span data-i18n="links.email">${escapeHtml(tDe.links.email)}</span>
          </a>
        </li>
        <li>
          <a class="hero__link hero__link--external" href="${escapeHtml(site.profile.github)}" target="_blank" rel="noopener noreferrer">
            ${heroLinkIcons.github}
            <span data-i18n="links.github">${escapeHtml(tDe.links.github)}</span>
            ${heroLinkIcons.external}
            <span class="sr-only" data-i18n="a11y.externalHint">${escapeHtml(tDe.a11y.externalHint)}</span>
          </a>
        </li>
        <li>
          <a class="hero__link hero__link--external" href="${escapeHtml(site.profile.linkedin)}" target="_blank" rel="noopener noreferrer">
            ${heroLinkIcons.linkedin}
            <span data-i18n="links.linkedin">${escapeHtml(tDe.links.linkedin)}</span>
            ${heroLinkIcons.external}
            <span class="sr-only" data-i18n="a11y.externalHint">${escapeHtml(tDe.a11y.externalHint)}</span>
          </a>
        </li>
      </ul>
    </nav>
  </header>

  <main class="work" id="projects">
    <h2 class="visually-hidden" data-i18n="sections.projects.heading">${escapeHtml(tDe.sections.projects.heading)}</h2>
    <div class="work__catalog">
    <div class="facet-bar" role="group" data-i18n-aria="facets.filterAria" aria-label="${escapeHtml(tDe.facets.filterAria)}">
      <button type="button" class="facet-chip facet-chip--all is-active" data-filter="all" data-i18n-facet="all" aria-pressed="true">
        <span class="facet-chip__label">${escapeHtml(tDe.facets.all)}</span>
        <span class="facet-chip__count">${allProjects.length}</span>
      </button>
      ${facetOverview}
    </div>
    <p class="filter-status" id="filter-status" aria-live="polite" hidden>
      <span id="filter-count"></span>
      <button type="button" class="stack-reset" id="filter-reset" data-i18n="filter.reset">${escapeHtml(tDe.filter.reset)}</button>
    </p>
    <div class="sections">${sectionsHtml}
    </div>
    </div>
  </main>

  <section class="about" aria-labelledby="about-heading">
    <h2 class="section__heading" id="about-heading" data-i18n="about.title">${escapeHtml(tDe.about.title)}</h2>
    <div class="about__grid">
      <div class="about__col">
        <h3 class="about__label" data-i18n="skills.heading">${escapeHtml(tDe.skills.heading)}</h3>
        <dl class="skill-list" id="profile-skills"></dl>
      </div>
      <div class="about__col">
        <h3 class="about__label" data-i18n="background.heading">${escapeHtml(tDe.background.heading)}</h3>
        <ul class="about__timeline" id="profile-background"></ul>
      </div>
    </div>
  </section>

  <footer class="footer">
    <a href="/impressum.html" data-i18n="footer.impressum">${escapeHtml(tDe.footer.impressum)}</a>
  </footer>

  <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
  <aside class="drawer" id="project-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
    <div class="drawer__scroll">
      <div class="drawer__hero">
        <div class="drawer__media" id="drawer-media"></div>
        <div class="drawer__hero-scrim" aria-hidden="true"></div>
        <div class="drawer__hero-overlay" id="drawer-hero-overlay"></div>
        <button type="button" class="drawer__close" id="drawer-close" data-i18n-aria="drawer.close" aria-label="${escapeHtml(tDe.drawer.close)}">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="drawer__body">
        <div class="drawer__intro">
          <div class="drawer__head">
            <h2 class="drawer__title" id="drawer-title">${escapeHtml(tDe.drawer.defaultTitle)}</h2>
            <div class="drawer__intro-actions" id="drawer-intro-actions"></div>
          </div>
          <div class="drawer__stats" id="drawer-stats"></div>
        </div>
        <div class="drawer__tabs" role="tablist" data-i18n-aria="drawer.tabsAria" aria-label="${escapeHtml(tDe.drawer.tabsAria)}">
          <button type="button" class="drawer__tab drawer__tab--active" role="tab" id="tab-overview" aria-selected="true" aria-controls="panel-overview" data-tab="overview" data-i18n="drawer.overview">${escapeHtml(tDe.drawer.overview)}</button>
          <button type="button" class="drawer__tab" role="tab" id="tab-ux" aria-selected="false" aria-controls="panel-ux" data-tab="ux" data-i18n="drawer.ux">${escapeHtml(tDe.drawer.ux)}</button>
          <button type="button" class="drawer__tab" role="tab" id="tab-tech" aria-selected="false" aria-controls="panel-tech" data-tab="tech" data-i18n="drawer.tech">${escapeHtml(tDe.drawer.tech)}</button>
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
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
${headExtras}
</head>
<body class="page-legal">
  <div class="grain" aria-hidden="true"></div>
  <main class="legal">
    <div class="legal__top">
      <a class="legal__back" href="/" data-i18n="legal.back">${escapeHtml(tDe.legal.back)}</a>
      <nav class="lang-switch" aria-label="${escapeHtml(tDe.a11y.langSwitch)}" data-i18n-aria="a11y.langSwitch">
        ${site.locales
          .map(
            (code) =>
              `<button type="button" class="lang-switch__btn${code === site.defaultLocale ? ' is-active' : ''}" data-lang="${code}" aria-pressed="${code === site.defaultLocale ? 'true' : 'false'}">${code.toUpperCase()}</button>`,
          )
          .join('\n        ')}
      </nav>
    </div>
    <h1 data-i18n="legal.heading">${escapeHtml(tDe.legal.heading)}</h1>
    <section>
      <h2 data-i18n="legal.providerHeading">${escapeHtml(tDe.legal.providerHeading)}</h2>
      <p>
        Henrik Heil<br />
        Westendstraße 100<br />
        60325 Frankfurt am Main
      </p>
    </section>
    <section>
      <h2 data-i18n="legal.contactHeading">${escapeHtml(tDe.legal.contactHeading)}</h2>
      <p data-i18n-html="legal.contactLine">${tDe.legal.contactLine}</p>
    </section>
    <section>
      <h2 data-i18n="legal.liabilityContentHeading">${escapeHtml(tDe.legal.liabilityContentHeading)}</h2>
      <p data-i18n="legal.liabilityContentBody">${escapeHtml(tDe.legal.liabilityContentBody)}</p>
    </section>
    <section>
      <h2 data-i18n="legal.liabilityLinksHeading">${escapeHtml(tDe.legal.liabilityLinksHeading)}</h2>
      <p data-i18n="legal.liabilityLinksBody">${escapeHtml(tDe.legal.liabilityLinksBody)}</p>
    </section>
  </main>
  <script>window.__ASSET_V = "${assetVersion}";</script>
  <script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>`;

writeFileSync(join(publicDir, 'index.html'), html);
writeFileSync(join(publicDir, 'impressum.html'), impressum);
console.log(
  `Built portfolio: ${allProjects.length} projects, ${FACETS.filter((f) => allProjects.some((p) => (p.facets || []).includes(f.key))).length} facets, metrics for ${Object.keys(metrics).length} slugs → public/`,
);
