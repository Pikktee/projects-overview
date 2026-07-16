import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { accessibleAccentInk, accessibleButtonBg, accessibleCtaColor, accessibleCtaColorLight } from './a11y-colors.mjs';
import { optimizeImages } from './optimize-images.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const metricsPath = join(root, 'data/metrics.json');

mkdirSync(publicDir, { recursive: true });

console.log('Optimiere Bilder…');
await optimizeImages();

const screenshotManifestPath = join(publicDir, 'screenshots', 'manifest.json');
const screenshotManifest = existsSync(screenshotManifestPath)
  ? JSON.parse(readFileSync(screenshotManifestPath, 'utf8'))
  : {};

const fontsSrc = join(root, 'src', 'fonts');
const fontsDest = join(publicDir, 'fonts');
if (existsSync(fontsSrc)) cpSync(fontsSrc, fontsDest, { recursive: true });

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
    accentCtaLight: accessibleCtaColorLight(p.accent),
    accentInk: accessibleAccentInk(p.accent),
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
    screenshots: screenshotManifest[p.slug]?.shots || [],
    screenshotCover: screenshotManifest[p.slug]?.cover || 'landing',
  };
}

const sections = data.sections.map((section) => ({
  ...section,
  projects: section.projects.map(mergeProject),
}));

const portfolio = { sections };
const allProjects = sections.flatMap((s) => s.projects);

for (const file of [
  'styles.css',
  'app.js',
  'snake.js',
  'favicon.svg',
  'favicon-arrow.svg',
  'favicon-h.svg',
  'apple-touch-icon.png',
  'apple-touch-icon-arrow.png',
  'apple-touch-icon-h.png',
  'me.jpg',
  'me-thumb.jpg',
]) {
  copyFileSync(join(root, 'src', file), join(publicDir, file));
}

const snakeAudioDir = join(publicDir, 'snake-audio');
mkdirSync(snakeAudioDir, { recursive: true });
for (const file of ['bgm.mp3', 'eat.mp3', 'crash.mp3']) {
  const src = join(publicDir, 'snake-audio', file);
  if (!existsSync(src)) {
    console.warn(`Warnung: snake-audio/${file} fehlt — bitte „node scripts/generate-snake-audio.mjs“ ausführen.`);
  }
}

const projectsJsonStr = JSON.stringify(portfolio);
writeFileSync(join(publicDir, 'projects.json'), projectsJsonStr);
writeFileSync(join(publicDir, 'site.json'), JSON.stringify(site));

// Cache-Busting: kurzer Hash über app.js + styles.css + projects.json. Ändert
// sich der Inhalt, ändert sich die URL — der Browser lädt garantiert frisch.
const assetVersion = createHash('sha1')
  .update(readFileSync(join(root, 'src/app.js')))
  .update(readFileSync(join(root, 'src/snake.js')))
  .update(readFileSync(join(root, 'src/styles.css')))
  .update(readFileSync(join(root, 'data/site.json')))
  .update(projectsJsonStr)
  .update(existsSync(screenshotManifestPath) ? readFileSync(screenshotManifestPath) : '')
  .digest('hex')
  .slice(0, 8);

const headExtras = `  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="theme-color" content="#0f1114" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f4f1e9" media="(prefers-color-scheme: light)" />`;

// Läuft vor dem Stylesheet, damit das gewählte Theme ohne Aufblitzen (FOUC)
// steht: gespeicherte Wahl → sonst Systempräferenz → sonst dunkel.
const themeInitScript = `<script>(function(){var t=null;try{t=localStorage.getItem("portfolio-theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)})();</script>`;

const fontsHref = `/fonts/fonts.css?v=${assetVersion}`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSkillItems(items) {
  const list = items || [];
  if (list.length === 0) return '';
  return list
    .map(escapeHtml)
    .join('<span class="skill-list__sep" aria-hidden="true"> · </span>');
}

const heroLinkIcons = {
  email: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  github: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`,
  linkedin: `<svg class="hero__link-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.42v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>`,
  external: `<svg class="hero__link-external" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.5 3.5H12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 12.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

function renderResponsiveImage(shot, { sizes, alt = '', decorative = false, loading = 'lazy' } = {}) {
  if (!shot?.src) return '';
  const altAttr = decorative ? 'alt="" aria-hidden="true"' : `alt="${escapeHtml(alt)}"`;
  const avif = shot.srcset?.avif;
  const webp = shot.srcset?.webp;
  const w = shot.width || 1280;
  const h = shot.height || 800;
  return `<picture>
            ${avif ? `<source type="image/avif" srcset="${avif}" sizes="${sizes}" />` : ''}
            ${webp ? `<source type="image/webp" srcset="${webp}" sizes="${sizes}" />` : ''}
            <img src="${shot.src}" ${altAttr} loading="${loading}" width="${w}" height="${h}" />
          </picture>`;
}

function coverShot(p) {
  if (!p.screenshots?.length) return null;
  return p.screenshots.find((s) => s.id === p.screenshotCover) || p.screenshots[0];
}

function renderCard(p) {
  const shot = coverShot(p);
  const hasShot = shot || existsSync(join(publicDir, 'screenshots', `${p.slug}.png`));
  const img = shot
    ? renderResponsiveImage(shot, {
        sizes: '(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 360px',
        decorative: true,
      })
    : hasShot
      ? `<img src="/screenshots/${p.slug}.png" alt="" aria-hidden="true" loading="lazy" width="640" height="400" />`
      : `<div class="card__placeholder" aria-hidden="true"><span>${escapeHtml(p.name.charAt(0))}</span></div>`;

  const facetAttr = (p.facets || []).join(',');

  return `
    <article class="card" style="--accent:${p.accent};--accent-cta:${p.accentCta};--accent-cta-light:${p.accentCtaLight};--accent-ink:${p.accentInk};--accent-btn:${p.accentBtn}" data-slug="${p.slug}" data-facets="${escapeHtml(facetAttr)}">
      <button type="button" class="card__btn" data-open="${p.slug}" aria-haspopup="dialog" aria-controls="project-drawer" aria-expanded="false" aria-label="${escapeHtml(`${p.name}: ${p.description}`)}" data-default-aria="${escapeHtml(`${p.name}: ${p.description}`)}"${p.descriptionEn ? ` data-en-aria="${escapeHtml(`${p.name}: ${p.descriptionEn}`)}"` : ''}>
        <div class="card__media">${img}</div>
        <div class="card__body">
          <h2 class="card__title">${escapeHtml(p.name)}</h2>
          <p class="card__desc" data-slug="${escapeHtml(p.slug)}" data-default-desc="${escapeHtml(p.description)}">${escapeHtml(p.description)}</p>
          <span class="card__cta"><span class="card__cta-label" data-i18n-template="card.details" data-name="${escapeHtml(p.name)}">${escapeHtml(tDe.card.details.replace('{name}', p.name))}</span><span class="card__cta-arrow" aria-hidden="true">→</span></span>
        </div>
      </button>
    </article>`;
}

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
  return `<button type="button" class="facet-chip" data-filter="${escapeHtml(f.key)}" data-i18n-facet="${escapeHtml(f.key)}" aria-pressed="false">
          <svg class="facet-chip__icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${f.icon}</svg>
          <span class="facet-chip__label">${escapeHtml(tDe.facets[f.key])}</span>
          <span class="facet-chip__count">${count}</span>
        </button>`;
})
  .filter(Boolean)
  .join('\n');

const facetBarChipsHtml = `<button type="button" class="facet-chip facet-chip--all is-active" data-filter="all" data-i18n-facet="all" aria-pressed="true">
          <span class="facet-chip__label">${escapeHtml(tDe.facets.all)}</span>
          <span class="facet-chip__count">${allProjects.length}</span>
        </button>
        ${facetOverview}`;

const renderFacetBar = (variant) => `
      <div class="facet-bar facet-bar--${variant}" role="group" data-i18n-aria="facets.filterAria" aria-label="${escapeHtml(tDe.facets.filterAria)}">
        ${facetBarChipsHtml}
      </div>`;

const catalogToolbarHtml = `
    <div class="catalog-toolbar">
      <div class="catalog-toolbar__mobile">
        <button type="button" class="facet-trigger" id="facet-open" aria-haspopup="dialog" aria-controls="facet-sheet" aria-expanded="false" data-i18n-aria="facets.openAria" aria-label="${escapeHtml(tDe.facets.openAria)}">
          <span class="facet-trigger__label" data-i18n="facets.open">${escapeHtml(tDe.facets.open)}</span>
          <svg class="facet-trigger__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="facet-active-chip" id="facet-active-chip" hidden aria-label="${escapeHtml(tDe.facets.clearFilterIdle)}" data-i18n-aria="facets.clearFilterIdle">
          <span class="facet-active-chip__icon" id="facet-active-chip-icon" aria-hidden="true"></span>
          <span class="facet-active-chip__label" id="facet-active-chip-label"></span>
          <span class="facet-active-chip__count" id="facet-active-chip-count" aria-hidden="true"></span>
          <svg class="facet-active-chip__clear" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4 4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
      ${renderFacetBar('inline')}
    </div>`;

const facetSheetHtml = `
  <div class="facet-sheet" id="facet-sheet" role="dialog" aria-modal="true" aria-labelledby="facet-sheet-title" hidden inert>
    <button type="button" class="facet-sheet__backdrop" id="facet-sheet-backdrop" tabindex="-1" aria-hidden="true"></button>
    <div class="facet-sheet__panel">
      <button type="button" class="facet-sheet__handle" id="facet-sheet-close" data-i18n-aria="facets.close" aria-label="${escapeHtml(tDe.facets.close)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 10l6 6 6-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="facet-sheet__body">
        <h3 class="facet-sheet__title" id="facet-sheet-title" data-i18n="facets.heading">${escapeHtml(tDe.facets.heading)}</h3>
        ${renderFacetBar('sheet')}
      </div>
    </div>
  </div>`;

const sectionsHtml = sections
  .map((section) => {
    const sectionKey = section.sectionKey || null;
    const sectionLabel = sectionKey ? tDe.sections[sectionKey] : section.title;
    const isAppendix = sectionKey === 'experiments';
    const isCatalog = sectionKey === 'current';
    const sectionId = `section-${sectionKey || section.title.toLowerCase().replace(/\s+/g, '-')}`;
    const i18nAttr = sectionKey ? ` data-i18n-section="${sectionKey}"` : '';
    let heading = '';
    if (sectionLabel) {
      heading = isAppendix
        ? `<h3 class="section__subheading" id="${sectionId}"${i18nAttr}>${escapeHtml(sectionLabel)}</h3>`
        : `<h2 class="section__heading" id="${sectionId}"${i18nAttr}>${escapeHtml(sectionLabel)}</h2>`;
    }
    const cards = section.projects.map(renderCard).join('\n');
    return `
  <section class="section${isCatalog ? ' section--catalog' : ''}${isAppendix ? ' section--appendix' : ''}">
    ${heading}
    ${isCatalog ? catalogToolbarHtml : ''}
    <div class="grid">${cards}
    </div>
  </section>`;
  })
  .join('\n');

// Icons für den Theme-Toggle: das Icon zeigt jeweils das Ziel des Klicks.
const themeToggleHtml = `<button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="true" aria-label="${escapeHtml(tDe.a11y.themeToggle)}" data-i18n-aria="a11y.themeToggle">
        <svg class="theme-toggle__icon theme-toggle__icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7L17 17M7 7 5.3 5.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <svg class="theme-toggle__icon theme-toggle__icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.6 13.6A8.4 8.4 0 0 1 10.4 3.4a8.4 8.4 0 1 0 10.2 10.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      </button>`;

const langSwitchHtml = (tag = 'div') => `<${tag} class="lang-switch" role="group" aria-label="${escapeHtml(tDe.a11y.langSwitch)}" data-i18n-aria="a11y.langSwitch">
        ${site.locales
          .map(
            (code) =>
              `<button type="button" class="lang-switch__btn${code === site.defaultLocale ? ' is-active' : ''}" data-lang="${code}" aria-pressed="${code === site.defaultLocale ? 'true' : 'false'}">${code.toUpperCase()}</button>`,
          )
          .join('\n        ')}
      </${tag}>`;

// Skizzierter Pfeil (Signatur-Element, nur Desktop): startet über dem Namensende,
// schwingt nach oben und fällt dann zum Foto ab. Schaft und Spitze getrennt,
// damit keine Lücke an der Spitze entsteht. Auf Mobilgeräten per CSS ausgeblendet.
// preserveAspectRatio="none" + non-scaling-stroke: Form folgt dem CSS-Kasten,
// Linienstärke bleibt konstant.
const heroAnnotationHtml = `<a class="hero__me" href="#ueber-mich">
        <span class="hero__me-main">
          <svg class="hero__arrow" viewBox="0 0 220 100" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
            <path class="hero__arrow-line" pathLength="1" d="M -26 44 C -16 50, 2 46, 10 34 C 22 14, 42 4, 68 14 S 128 62, 158 76 C 174 83, 190 87, 202 88" vector-effect="non-scaling-stroke" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path class="hero__arrow-head" pathLength="1" d="M 186 70 C 192 77, 197 83, 202 88 C 195 91, 187 95, 180 99" vector-effect="non-scaling-stroke" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="hero__me-frame">
            <svg class="hero__me-ring" viewBox="0 0 116 116" fill="none" aria-hidden="true">
              <path class="hero__me-ring-path" pathLength="1" d="M58 9 C 90 7, 108 30, 109 58 C 110 86, 86 109, 58 110 C 30 109, 7 86, 9 58 C 11 30, 30 11, 58 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
            <img class="hero__me-photo" src="/me-thumb.jpg?v=${assetVersion}" alt="" width="106" height="106" />
          </span>
        </span>
        <span class="hero__me-note" data-i18n="hero.meNote">${escapeHtml(tDe.hero.meNote)}</span>
        <span class="sr-only" data-i18n="hero.meHint">${escapeHtml(tDe.hero.meHint)}</span>
      </a>`;

// Interessen-Icons: schlichte Stroke-SVGs im Stil der Facet-Icons.
const INTEREST_ICONS = {
  piano:
    '<rect x="1.6" y="4.6" width="12.8" height="7" rx="0.8" stroke="currentColor" stroke-width="1.2"/><path d="M5.9 7.9v3.7M10.1 7.9v3.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M5.9 4.6v3.3M10.1 4.6v3.3M8 4.6v3.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  filming:
    '<rect x="1.6" y="5" width="8.8" height="6.4" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 7.2 14.4 5.2v5.6l-4-2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  travel:
    '<circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.2"/><ellipse cx="8" cy="8" rx="2.3" ry="5.6" stroke="currentColor" stroke-width="1.2"/><path d="M2.4 8h11.2M3.7 5.5h8.6M3.7 10.5h8.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  games:
    '<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5.55" cy="5.55" r="1.05" fill="currentColor"/><circle cx="8" cy="8" r="1.05" fill="currentColor"/><circle cx="10.45" cy="10.45" r="1.05" fill="currentColor"/>',
};

function interestIcon(key) {
  const inner = INTEREST_ICONS[key];
  if (!inner) return '';
  return `<svg class="about__interest-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">${inner}</svg>`;
}

// Über-mich-Inhalte serverseitig (DE) rendern: lesbar ohne JS und für Crawler.
// app.js ersetzt beim Sprachwechsel nur die Texte über die data-Attribute —
// Icons und Struktur bleiben im DOM (eine einzige Markup-Quelle).
const skillsHtml = site.skillGroups
  .map(
    (group) => `
            <div class="skill-list__row">
              <dt class="skill-list__term" data-skill-term="${escapeHtml(group.key)}">${escapeHtml(tDe.skills.groups[group.key])}</dt>
              <dd class="skill-list__items" data-skill-items="${escapeHtml(group.key)}">${renderSkillItems(group.items?.de)}</dd>
            </div>`,
  )
  .join('');

const timelineLineSvg = `<svg class="about__timeline-line" aria-hidden="true" viewBox="0 0 6 100" preserveAspectRatio="none">
            <path d="M3 0 C 3.7 11, 2.3 22, 3.1 33 S 2.5 48, 3.3 58 S 2.7 73, 3.2 84 S 2.9 93, 3 100" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          </svg>`;

const timelineDotHollow = `<svg class="about__timeline-dot" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle class="about__timeline-dot-mask" cx="6" cy="6" r="4.2"/>
              <path d="M6 1.4 C 8.8 1, 10.8 3.2, 10.6 6.1 C 10.4 9, 8 10.9, 5.2 10.6 C 2.4 10.3, 1 7.8, 1.3 5 C 1.5 2.8, 3.5 1.4, 6 1.4" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
            </svg>`;

const timelineDotFilled = `<svg class="about__timeline-dot about__timeline-dot--filled" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.4 C 8.7 1, 10.7 3.2, 10.5 6.1 C 10.3 9.1, 7.9 11.1, 5.1 10.7 C 2.4 10.3, 0.9 7.9, 1.2 5.1 C 1.4 2.9, 3.4 1.5, 6 1.4" fill="currentColor"/>
            </svg>`;

const backgroundHtml = (site.background || [])
  .map((item, index) => {
    const dot = item.current ? timelineDotFilled : timelineDotHollow;
    return `<li class="about__timeline-item${item.current ? ' about__timeline-item--current' : ''}" data-bg-index="${index}">
            <span class="about__timeline-rail" aria-hidden="true">${dot}</span>
            <span class="about__timeline-period">${escapeHtml(item.period?.de || '')}</span><span class="about__timeline-text">${escapeHtml(item.text?.de || '')}</span></li>`;
  })
  .join('\n          ');

const interestsHtml = (site.personalInterests || [])
  .map((item) => {
    if (item.youtubeId) {
      return `<li>${interestIcon(item.key)}<button type="button" class="about__interest-video"><span class="about__interest-label" data-interest-key="${escapeHtml(item.key)}">${escapeHtml(item.de)}</span><span class="sr-only" data-i18n="videoModal.opens"> ${escapeHtml(tDe.videoModal.opens)}</span></button></li>`;
    }
    const label = `${interestIcon(item.key)}<span class="about__interest-label" data-interest-key="${escapeHtml(item.key)}">${escapeHtml(item.de)}</span>`;
    if (item.url) {
      const videoLabel = escapeHtml(item.videoLabel?.de || 'Video');
      return `<li>${label} <a href="${escapeHtml(item.url)}" rel="noopener noreferrer">(<span data-interest-video-label="${escapeHtml(item.key)}">${videoLabel}</span>)</a></li>`;
    }
    if (item.easterEgg) {
      return `<li>${interestIcon(item.key)}<button type="button" class="about__interest-egg" id="egg-snake"><span class="about__interest-label" data-interest-key="${escapeHtml(item.key)}">${escapeHtml(item.de)}</span><span class="sr-only" data-i18n="snake.eggHint"> ${escapeHtml(tDe.snake.eggHint)}</span></button></li>`;
    }
    return `<li>${label}</li>`;
  })
  .join('\n          ');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="description" content="${escapeHtml(tDe.meta.description)}" />
  <title>${escapeHtml(tDe.meta.title)}</title>
  <link rel="alternate" hreflang="de" href="https://www.henrikheil.net/" />
  <link rel="alternate" hreflang="en" href="https://www.henrikheil.net/?lang=en" />
  ${themeInitScript}
  <link href="${fontsHref}" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
${headExtras}
</head>
<body>
  <a class="skip-link" href="#projects" data-i18n="a11y.skipLink">${escapeHtml(tDe.a11y.skipLink)}</a>
  <div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="grain" aria-hidden="true"></div>

  <header class="hero" id="profil">
    <div class="hero__bar">
      <div class="hero__controls">
      ${themeToggleHtml}
      ${langSwitchHtml('div')}
      </div>
    </div>
    <div class="hero__title-row">
      <h1 class="hero__name">${escapeHtml(site.profile.name)}</h1>
      ${heroAnnotationHtml}
    </div>
    <p class="hero__role" data-i18n="profile.role">${escapeHtml(tDe.profile.role)}</p>
    <p class="hero__bio">
      <span data-i18n="profile.bioLead">${escapeHtml(tDe.profile.bioLead)}</span>
      <span class="hero__bio-detail" data-i18n="profile.bioDetail">${escapeHtml(tDe.profile.bioDetail)}</span>
    </p>
    <nav class="hero__contact" id="kontakt" data-i18n-aria="a11y.contactAria" aria-label="${escapeHtml(tDe.a11y.contactAria)}">
      <ul class="hero__contact-list">
        <li>
          <a class="hero__link" href="mailto:${escapeHtml(site.profile.email)}">
            ${heroLinkIcons.email}
            <span data-i18n="links.email">${escapeHtml(tDe.links.email)}</span>
          </a>
        </li>
        <li>
          <a class="hero__link hero__link--external" href="${escapeHtml(site.profile.github)}">
            ${heroLinkIcons.github}
            <span data-i18n="links.github">${escapeHtml(tDe.links.github)}</span>
            ${heroLinkIcons.external}
          </a>
        </li>
        <li>
          <a class="hero__link hero__link--external" href="${escapeHtml(site.profile.linkedin)}">
            ${heroLinkIcons.linkedin}
            <span data-i18n="links.linkedin">${escapeHtml(tDe.links.linkedin)}</span>
            ${heroLinkIcons.external}
          </a>
        </li>
      </ul>
    </nav>
  </header>

  <main class="work" id="projects">
    <div class="work__catalog">
    <div class="sections">${sectionsHtml}
    </div>
    </div>
  </main>

  <section class="about" id="ueber-mich" aria-labelledby="about-heading" tabindex="-1">
    <h2 class="section__heading" id="about-heading" data-i18n="about.title">${escapeHtml(tDe.about.title)}</h2>
    <div class="about__stack">
    <div class="about__personal">
      <figure class="about__photo" id="about-photo-pinned">
        <div class="about__photo-pin-mount" aria-hidden="true">
          <svg class="about__photo-pin" viewBox="0 0 48 64" width="36" height="48" fill="none" focusable="false">
            <defs>
              <radialGradient id="about-pin-head" cx="36%" cy="30%" r="70%">
                <stop offset="0%" stop-color="#fff6e0"/>
                <stop offset="28%" stop-color="#f0d48a"/>
                <stop offset="62%" stop-color="#c9963a"/>
                <stop offset="100%" stop-color="#654a1e"/>
              </radialGradient>
              <linearGradient id="about-pin-shaft" x1="24" y1="32" x2="24" y2="58" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#b8a890"/>
                <stop offset="45%" stop-color="#8a7a68"/>
                <stop offset="100%" stop-color="#4a4038"/>
              </linearGradient>
              <linearGradient id="about-pin-rim" x1="12" y1="14" x2="36" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#fff" stop-opacity="0.55"/>
                <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
              </linearGradient>
              <filter id="about-pin-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity="0.35"/>
              </filter>
            </defs>
            <g filter="url(#about-pin-glow)">
              <ellipse class="about__photo-pin-shadow" cx="24" cy="60.5" rx="12" ry="2.8" fill="#000" opacity="0.2"/>
              <path d="M24 33v22.5" stroke="url(#about-pin-shaft)" stroke-width="1.7" stroke-linecap="round"/>
              <path d="M24 55.5 20.6 61.2 24 58.8 27.4 61.2Z" fill="#3a322a"/>
              <ellipse cx="24" cy="32.5" rx="6.2" ry="2.1" fill="#4a3a22"/>
              <ellipse cx="24" cy="31.8" rx="13" ry="3.8" fill="#7d6538"/>
              <ellipse cx="24" cy="23" rx="15.5" ry="10.2" fill="url(#about-pin-head)"/>
              <path d="M10.5 24c1.2-5.8 5.8-10 13.5-10s12.3 4.2 13.5 10" stroke="url(#about-pin-rim)" stroke-width="1.4" fill="none"/>
              <ellipse cx="24" cy="31.5" rx="10.5" ry="2.3" fill="#000" opacity="0.14"/>
              <ellipse cx="17.2" cy="17.5" rx="5.2" ry="3.4" fill="#fff" opacity="0.48"/>
              <ellipse cx="18.4" cy="16.2" rx="2.1" ry="1.35" fill="#fff" opacity="0.82"/>
              <path d="M13 27.5c2.6-1.4 6-1.9 11-1.9s8.4.5 11 1.9" stroke="#000" opacity="0.07" stroke-width="0.9" fill="none"/>
            </g>
          </svg>
        </div>
        <div class="about__photo-swing">
          <div class="about__photo-card">
            <img src="/me.jpg?v=${assetVersion}" alt="${escapeHtml(tDe.about.photoAlt)}" data-i18n-alt="about.photoAlt" width="800" height="800" loading="lazy" />
            <figcaption>${escapeHtml(site.profile.name)}</figcaption>
          </div>
        </div>
      </figure>
      <div class="about__personal-body">
        <p class="about__intro" data-i18n="about.intro">${escapeHtml(tDe.about.intro)}</p>
      </div>
    </div>
    <div class="about__grid">
      <div class="about__col">
        <h3 class="about__label" data-i18n="skills.heading">${escapeHtml(tDe.skills.heading)}</h3>
        <dl class="skill-list" id="profile-skills">${skillsHtml}
        </dl>
      </div>
      <div class="about__col">
        <h3 class="about__label" data-i18n="background.heading">${escapeHtml(tDe.background.heading)}</h3>
        <div class="about__timeline-wrap">
          ${timelineLineSvg}
          <ul class="about__timeline" id="profile-background">
            ${backgroundHtml}
          </ul>
        </div>
      </div>
    </div>
    <div class="about__interests-section">
        <h3 class="about__label" data-i18n="about.interestsHeading">${escapeHtml(tDe.about.interestsHeading)}</h3>
        <ul class="about__interests" id="profile-interests">
          ${interestsHtml}
        </ul>
    </div>
    </div>
  </section>

  <section class="invite" id="zusammenarbeit" aria-labelledby="invite-heading">
    <p class="invite__status" data-i18n="invite.status">${escapeHtml(tDe.invite.status)}</p>
    <h2 class="invite__heading" id="invite-heading" data-i18n="invite.heading">${escapeHtml(tDe.invite.heading)}</h2>
    <p class="invite__lead" data-i18n="invite.lead">${escapeHtml(tDe.invite.lead)}</p>
    <a class="invite__cta" href="mailto:contact@henrikheil.net">
      <svg class="invite__cta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span data-i18n="invite.cta">${escapeHtml(tDe.invite.cta)}</span>
    </a>
  </section>

  <footer class="footer">
    <a href="/impressum.html" data-i18n="footer.impressum">${escapeHtml(tDe.footer.impressum)}</a>
    <span class="footer__sep" aria-hidden="true">·</span>
    <a href="/datenschutz.html" data-i18n="footer.privacy">${escapeHtml(tDe.footer.privacy)}</a>
  </footer>

  ${facetSheetHtml}

  <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
  <aside class="drawer" id="project-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
    <button type="button" class="drawer__handle" id="drawer-close" data-i18n-aria="drawer.close" aria-label="${escapeHtml(tDe.drawer.close)}">
      <svg class="drawer__handle-icon drawer__handle-icon--side" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <svg class="drawer__handle-icon drawer__handle-icon--sheet" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 10l6 6 6-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="drawer__scroll">
      <div class="drawer__hero">
        <div class="drawer__media" id="drawer-media"></div>
        <div class="drawer__hero-scrim" aria-hidden="true"></div>
        <div class="drawer__hero-overlay" id="drawer-hero-overlay"></div>
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

  <div class="video-modal" id="video-modal" hidden>
    <div class="video-modal__backdrop" id="video-modal-backdrop"></div>
    <div class="video-modal__stage">
      <div class="video-modal__wrap">
        <div class="video-modal__top-zone" id="video-modal-top-zone" aria-hidden="true">
          <p class="video-modal__hint" id="video-modal-hint" aria-hidden="true" data-i18n="videoModal.escHint">↓ ESC schließt die Ansicht</p>
        </div>
        <div class="video-modal__dialog" id="video-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="video-modal-title" tabindex="-1">
          <h2 class="sr-only" id="video-modal-title" data-i18n="videoModal.defaultTitle">${escapeHtml(tDe.videoModal.defaultTitle)}</h2>
          <div class="video-modal__frame">
            <iframe id="video-modal-iframe" title="${escapeHtml(tDe.videoModal.defaultTitle)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="shot-lightbox" id="shot-lightbox" hidden>
    <div class="shot-lightbox__backdrop" id="shot-lightbox-backdrop"></div>
    <div class="shot-lightbox__layout">
      <div class="shot-lightbox__side-zone shot-lightbox__side-zone--left" id="shot-lightbox-side-left" aria-hidden="true"></div>
      <div class="shot-lightbox__stage">
        <div class="shot-lightbox__wrap">
          <div class="shot-lightbox__top-zone" id="shot-lightbox-top-zone" aria-hidden="true">
            <p class="shot-lightbox__hint" id="shot-lightbox-hint" aria-hidden="true" data-i18n="videoModal.escHint">↓ ESC schließt die Ansicht</p>
          </div>
          <div class="shot-lightbox__viewer">
            <button type="button" class="shot-lightbox__nav shot-lightbox__nav--prev" id="shot-lightbox-prev" data-i18n-aria="drawer.prevScreenshot" aria-label="${escapeHtml(tDe.drawer.prevScreenshot)}" hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 6l-6 6 6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="shot-lightbox__dialog" id="shot-lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="shot-lightbox-caption" tabindex="-1">
              <figure class="shot-lightbox__frame">
                <div class="shot-lightbox__media" id="shot-lightbox-media"></div>
                <figcaption class="shot-lightbox__bar">
                  <div class="shot-lightbox__meta">
                    <p class="shot-lightbox__caption" id="shot-lightbox-caption"></p>
                    <p class="shot-lightbox__counter" id="shot-lightbox-counter" hidden></p>
                  </div>
                  <button type="button" class="shot-lightbox__close" id="shot-lightbox-close" data-i18n-aria="drawer.closeLightbox" aria-label="${escapeHtml(tDe.drawer.closeLightbox)}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
                  </button>
                </figcaption>
              </figure>
            </div>
            <button type="button" class="shot-lightbox__nav shot-lightbox__nav--next" id="shot-lightbox-next" data-i18n-aria="drawer.nextScreenshot" aria-label="${escapeHtml(tDe.drawer.nextScreenshot)}" hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 6l6 6-6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="shot-lightbox__side-zone shot-lightbox__side-zone--right" id="shot-lightbox-side-right" aria-hidden="true"></div>
    </div>
  </div>

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
  ${themeInitScript}
  <link href="${fontsHref}" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
${headExtras}
</head>
<body class="page-legal" data-page="impressum">
  <div class="grain" aria-hidden="true"></div>
  <div class="hero__bar">
    <div class="hero__controls">
      ${themeToggleHtml}
      ${langSwitchHtml('nav')}
    </div>
  </div>
  <main class="legal">
    <a class="legal__back" href="/" data-i18n="legal.back">${escapeHtml(tDe.legal.back)}</a>
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

const datenschutz = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Datenschutz · Henrik Heil</title>
  <meta name="description" content="${escapeHtml(tDe.privacy.generalBody)}" />
  ${themeInitScript}
  <link href="${fontsHref}" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}" />
${headExtras}
</head>
<body class="page-legal" data-page="privacy">
  <div class="grain" aria-hidden="true"></div>
  <div class="hero__bar">
    <div class="hero__controls">
      ${themeToggleHtml}
      ${langSwitchHtml('nav')}
    </div>
  </div>
  <main class="legal">
    <a class="legal__back" href="/" data-i18n="legal.back">${escapeHtml(tDe.legal.back)}</a>
    <h1 data-i18n="privacy.heading">${escapeHtml(tDe.privacy.heading)}</h1>
    <section>
      <h2 data-i18n="privacy.controllerHeading">${escapeHtml(tDe.privacy.controllerHeading)}</h2>
      <p data-i18n-html="privacy.controllerBody">${tDe.privacy.controllerBody}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.generalHeading">${escapeHtml(tDe.privacy.generalHeading)}</h2>
      <p data-i18n="privacy.generalBody">${escapeHtml(tDe.privacy.generalBody)}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.storageHeading">${escapeHtml(tDe.privacy.storageHeading)}</h2>
      <p data-i18n="privacy.storageBody">${escapeHtml(tDe.privacy.storageBody)}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.youtubeHeading">${escapeHtml(tDe.privacy.youtubeHeading)}</h2>
      <p data-i18n-html="privacy.youtubeBody">${tDe.privacy.youtubeBody}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.linksHeading">${escapeHtml(tDe.privacy.linksHeading)}</h2>
      <p data-i18n="privacy.linksBody">${escapeHtml(tDe.privacy.linksBody)}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.rightsHeading">${escapeHtml(tDe.privacy.rightsHeading)}</h2>
      <p data-i18n="privacy.rightsBody">${escapeHtml(tDe.privacy.rightsBody)}</p>
    </section>
    <section>
      <h2 data-i18n="privacy.contactHeading">${escapeHtml(tDe.privacy.contactHeading)}</h2>
      <p data-i18n-html="privacy.contactBody">${tDe.privacy.contactBody}</p>
    </section>
  </main>
  <script>window.__ASSET_V = "${assetVersion}";</script>
  <script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>`;

writeFileSync(join(publicDir, 'index.html'), html);
writeFileSync(join(publicDir, 'impressum.html'), impressum);
writeFileSync(join(publicDir, 'datenschutz.html'), datenschutz);
console.log(
  `Built portfolio: ${allProjects.length} projects, ${FACETS.filter((f) => allProjects.some((p) => (p.facets || []).includes(f.key))).length} facets, metrics for ${Object.keys(metrics).length} slugs → public/`,
);
