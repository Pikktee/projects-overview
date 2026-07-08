(() => {
  // Signalisiert dem CSS, dass JS läuft — erst dann werden Karten für den
  // Scroll-Reveal initial versteckt (Fallback ohne JS: alles sichtbar).
  document.documentElement.classList.add('js');

  const LANG_KEY = 'portfolio-lang';
  const THEME_KEY = 'portfolio-theme';

  // ── Theme: data-theme wurde bereits vom Inline-Script im <head> gesetzt.
  // Hier nur noch Toggle, Persistenz und Folgen der Systempräferenz,
  // solange keine explizite Wahl gespeichert ist.
  const themeToggle = document.getElementById('theme-toggle');
  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
  const THEME_COLORS = { dark: '#0f1114', light: '#f4f1e9' };

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle?.setAttribute('aria-pressed', String(theme === 'dark'));
    themeMetas.forEach((meta) => meta.setAttribute('content', THEME_COLORS[theme]));
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* private mode */
      }
    }
  }

  applyTheme(currentTheme(), false);

  themeToggle?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });

  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  darkScheme.addEventListener?.('change', (e) => {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* private mode */
    }
    if (stored !== 'light' && stored !== 'dark') applyTheme(e.matches ? 'dark' : 'light', false);
  });

  let locale = 'de';
  let site = {};
  let strings = {};

  const drawer = document.getElementById('project-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const closeBtn = document.getElementById('drawer-close');
  const filterStatus = document.getElementById('filter-status');
  const filterCount = document.getElementById('filter-count');
  const filterReset = document.getElementById('filter-reset');
  const cards = document.querySelectorAll('.card');
  const facetChips = document.querySelectorAll('.facet-chip');
  const openButtons = document.querySelectorAll('[data-open]');
  const tabs = document.querySelectorAll('.drawer__tab');
  const panels = {
    overview: document.getElementById('panel-overview'),
    ux: document.getElementById('panel-ux'),
    tech: document.getElementById('panel-tech'),
  };

  let projects = {};
  let activeSlug = null;
  let lastFocus = null;
  let activeTab = 'overview';
  let closeTimer = null;
  let activeFilter = 'all';

  function t(key, vars = {}) {
    const parts = key.split('.');
    let value = strings;
    for (const part of parts) {
      value = value?.[part];
    }
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  }

  function detectLocale() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('lang');
    if (fromUrl && site.locales?.includes(fromUrl)) return fromUrl;

    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored && site.locales?.includes(stored)) return stored;
    } catch {
      /* private mode */
    }

    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (site.locales?.includes(browser)) return browser;
    return site.defaultLocale || 'de';
  }

  function setLocale(next) {
    if (!site.locales?.includes(next) || next === locale) return;
    locale = next;
    strings = site.translations[locale] || {};
    try {
      localStorage.setItem(LANG_KEY, locale);
    } catch {
      /* private mode */
    }

    const url = new URL(location.href);
    if (next === site.defaultLocale) url.searchParams.delete('lang');
    else url.searchParams.set('lang', next);
    history.replaceState(null, '', url.pathname + url.search + url.hash);

    applyI18n();
    if (activeSlug && projects[activeSlug]) renderDrawer(projects[activeSlug]);
    if (activeFilter !== 'all') setFilter(activeFilter);
  }

  function applyI18n() {
    document.documentElement.lang = locale;
    document.title = document.body.classList.contains('page-legal')
      ? t('legal.pageTitle')
      : t('meta.title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('meta.description'));

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      el.setAttribute('alt', t(el.dataset.i18nAlt));
    });

    document.querySelectorAll('[data-i18n-facet]').forEach((el) => {
      const label = el.querySelector('.facet-chip__label');
      if (label) label.textContent = t(`facets.${el.dataset.i18nFacet}`);
    });

    document.querySelectorAll('[data-i18n-section]').forEach((el) => {
      el.textContent = t(`sections.${el.dataset.i18nSection}`);
    });

    document.querySelectorAll('.card__cta-label[data-i18n-template]').forEach((el) => {
      const name = el.dataset.name || el.closest('.card')?.querySelector('.card__title')?.textContent || '';
      el.textContent = t(el.dataset.i18nTemplate, { name });
    });

    document.querySelectorAll('.card__desc[data-slug]').forEach((el) => {
      const slug = el.dataset.slug;
      const p = projects[slug];
      const enSummary =
        p?.copy?.en?.summary || p?.copy?.en?.tagline || site.projectSummaries?.en?.[slug];
      el.textContent =
        locale === 'en' && enSummary ? enSummary : el.dataset.defaultDesc || el.textContent;
    });

    document.querySelectorAll('[data-open]').forEach((btn) => {
      const slug = btn.dataset.open;
      const p = projects[slug];
      if (!p) return;
      const desc =
        locale === 'en'
          ? p.copy?.en?.summary || p.copy?.en?.tagline || btn.dataset.enAria?.split(': ').slice(1).join(': ')
          : p.copy?.de?.summary || p.copy?.de?.tagline || btn.dataset.defaultAria?.split(': ').slice(1).join(': ');
      if (desc) btn.setAttribute('aria-label', `${p.name}: ${desc}`);
      else if (locale === 'en' && btn.dataset.enAria) btn.setAttribute('aria-label', btn.dataset.enAria);
      else if (btn.dataset.defaultAria) btn.setAttribute('aria-label', btn.dataset.defaultAria);
    });

    renderProfileSections();

    if (!activeSlug) {
      const drawerTitle = document.getElementById('drawer-title');
      if (drawerTitle) drawerTitle.textContent = t('drawer.defaultTitle');
    }

    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      const active = btn.dataset.lang === locale;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // Das Markup der Über-mich-Sektion kommt vollständig aus dem Build (inkl.
  // Icons); hier werden beim Sprachwechsel nur die Texte ausgetauscht.
  function renderProfileSections() {
    document.querySelectorAll('[data-skill-term]').forEach((el) => {
      el.textContent = t(`skills.groups.${el.dataset.skillTerm}`);
    });

    document.querySelectorAll('[data-skill-items]').forEach((el) => {
      const group = site.skillGroups?.find((g) => g.key === el.dataset.skillItems);
      if (!group) return;
      el.textContent = (group.items?.[locale] || group.items?.de || []).join(' · ');
    });

    document.querySelectorAll('[data-bg-index]').forEach((el) => {
      const item = site.background?.[Number(el.dataset.bgIndex)];
      if (!item) return;
      const periodEl = el.querySelector('.about__timeline-period');
      const textEl = el.querySelector('.about__timeline-text');
      if (periodEl) periodEl.textContent = item.period?.[locale] || item.period?.de || '';
      if (textEl) {
        textEl.textContent = (item.text?.[locale] || item.text?.de || '').replace(
          /\{count\}/g,
          String(totalProjects),
        );
      }
    });

    document.querySelectorAll('[data-interest-key]').forEach((el) => {
      const item = site.personalInterests?.find((i) => i.key === el.dataset.interestKey);
      if (item) el.textContent = item[locale] || item.de;
    });

    document.querySelectorAll('[data-interest-video-label]').forEach((el) => {
      const item = site.personalInterests?.find((i) => i.key === el.dataset.interestVideoLabel);
      if (item) el.textContent = item.videoLabel?.[locale] || item.videoLabel?.de || 'Video';
    });
  }

  async function loadSite() {
    const v = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const res = await fetch(`/site.json${v}`);
    site = await res.json();
    locale = detectLocale();
    strings = site.translations[locale] || {};
    applyI18n();

    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.addEventListener('click', () => setLocale(btn.dataset.lang));
    });
  }

  const siteReady = loadSite();

  const totalProjects = cards.length;

  const projectsReady = loadProjects();

  function ensureDrawerClosed() {
    if (!drawer) return;
    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    drawer.hidden = true;
    backdrop.hidden = true;
    drawer.inert = true;
  }

  ensureDrawerClosed();

  Promise.all([siteReady, projectsReady]).then(() => handleHash());

  // Scroll-Reveal: Karten tauchen gestaffelt auf, sobald sie in den Viewport
  // kommen. Ohne IntersectionObserver werden alle sofort sichtbar.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            entry.target.style.setProperty('--stagger', String(Math.min(i, 5)));
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    cards.forEach((card) => revealObserver.observe(card));
  } else {
    cards.forEach((card) => card.classList.add('is-visible'));
  }

  // Cursor-Licht + 3D-Kipp: gemeinsame Mausposition auf den Karten.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (finePointer) {
    document.querySelectorAll('.card__btn').forEach((btn) => {
      const resetTilt = () => {
        btn.style.setProperty('--tilt-x', '0deg');
        btn.style.setProperty('--tilt-y', '0deg');
      };

      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        btn.style.setProperty('--my', `${e.clientY - rect.top}px`);

        if (!reduceMotion) {
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          const max = 7;
          btn.style.setProperty('--tilt-x', `${(x * max * 2).toFixed(2)}deg`);
          btn.style.setProperty('--tilt-y', `${(-y * max * 2).toFixed(2)}deg`);
        }
      });

      btn.addEventListener('pointerleave', resetTilt);
    });
  }

  openButtons.forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.open));
  });

  facetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const next = chip.dataset.filter;
      setFilter(activeFilter === next && next !== 'all' ? 'all' : next);
    });
  });

  filterReset?.addEventListener('click', () => setFilter('all'));

  // Easter Egg: „Video- & Brettspiele" lädt snake.js nach und startet das
  // Spiel. Die Strings kommen aus der aktiven Sprache.
  const eggBtn = document.getElementById('egg-snake');
  eggBtn?.addEventListener('click', () => {
    const start = () =>
      window.__startSnake?.({
        trigger: eggBtn,
        strings: {
          hint: t('snake.hint'),
          start: t('snake.start'),
          score: t('snake.score'),
          gameOver: t('snake.gameOver'),
          yourScore: t('snake.yourScore'),
          highscores: t('snake.highscores'),
          namePlaceholder: t('snake.namePlaceholder'),
          nameLabel: t('snake.nameLabel'),
          save: t('snake.save'),
          playAgain: t('snake.playAgain'),
          close: t('snake.close'),
          empty: t('snake.empty'),
        },
      });
    if (window.__startSnake) {
      start();
      return;
    }
    const script = document.createElement('script');
    script.src = `/snake.js${window.__ASSET_V ? `?v=${window.__ASSET_V}` : ''}`;
    script.onload = start;
    document.head.appendChild(script);
  });

  async function loadProjects() {
    const v = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const res = await fetch(`/projects.json${v}`);
    const data = await res.json();
    for (const section of data.sections) {
      for (const p of section.projects) {
        projects[p.slug] = p;
      }
    }
  }

  function setFilter(filter) {
    let visible = 0;
    let filterLabel = '';
    activeFilter = filter;

    facetChips.forEach((chip) => {
      const isActive = chip.dataset.filter === filter;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
      if (filter !== 'all' && isActive) {
        filterLabel = chip.querySelector('.facet-chip__label')?.textContent || filter;
      }
    });

    cards.forEach((card) => {
      const facets = (card.dataset.facets || '').split(',').filter(Boolean);
      const show = filter === 'all' || facets.includes(filter);
      card.classList.toggle('card--hidden', !show);
      if (show) visible++;
    });

    document.querySelectorAll('.section').forEach((section) => {
      const sectionCards = section.querySelectorAll('.card:not(.card--hidden)');
      section.classList.toggle('section--empty', sectionCards.length === 0);
    });

    if (filterStatus && filterCount) {
      if (filter === 'all') {
        filterStatus.hidden = true;
      } else {
        filterStatus.hidden = false;
        filterCount.textContent = t('filter.status', {
          visible,
          total: totalProjects,
          label: filterLabel,
        });
      }
    }

    if (filter !== 'all') {
      document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str ?? '';
    return el.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const loc = locale === 'en' ? 'en-GB' : 'de-DE';
      return new Date(iso).toLocaleDateString(loc, { year: 'numeric', month: 'short' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  function renderStatLine(project) {
    const parts = [];
    if (project.locFormatted && project.locFormatted !== '—') {
      parts.push(`<span class="stat-inline__item"><strong>${esc(project.locFormatted)}</strong> ${esc(t('drawer.linesOfCode'))}</span>`);
    }
    if (project.git?.commits) {
      parts.push(`<span class="stat-inline__item"><strong>${project.git.commits}</strong> ${esc(t('drawer.commits'))}</span>`);
    }
    const tests = project.ux?.testFiles ?? project.files?.tests;
    if (tests > 0) {
      parts.push(`<span class="stat-inline__item"><strong>${tests}</strong> ${esc(t('drawer.tests'))}</span>`);
    }
    if (!parts.length) return '';
    return `<p class="stat-inline" aria-label="${esc(t('drawer.statsAria'))}">${parts.join('<span class="stat-inline__sep" aria-hidden="true">·</span>')}</p>`;
  }

  function renderCoverage(coverage) {
    if (!coverage) return '';
    const items = [
      [t('drawer.lines'), coverage.lines],
      ['Statements', coverage.statements],
      ['Branches', coverage.branches],
      ['Functions', coverage.functions],
    ].filter(([, v]) => v != null);
    if (!items.length) return '';
    return `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(t('drawer.coverage'))}</h3>
        ${items
          .map(
            ([label, val]) => `
          <div class="coverage-row">
            <span class="coverage-row__label">${esc(label)}</span>
            <div class="coverage-row__bar" role="presentation"><span style="width:${val}%"></span></div>
            <span class="coverage-row__val">${val}%</span>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  function renderDepGroup(title, deps) {
    if (!deps?.length) return '';
    return `
      <details class="dep-group" open>
        <summary class="dep-group__title">${esc(title)} <span class="dep-group__count">${deps.length}</span></summary>
        <div class="dep-group__list">${deps.map((d) => `<code class="dep-tag">${esc(d)}</code>`).join('')}</div>
      </details>`;
  }

  function renderTagList(title, items) {
    if (!items?.length) return '';
    return `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(title)}</h3>
        <div class="drawer__tags">${items.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>`;
  }

  function localizedCopy(project) {
    const block = project.copy?.[locale] || project.copy?.de || {};
    return {
      overview: block.overview || project.overview || '',
      uxNarrative: block.uxNarrative || project.uxNarrative || '',
      highlights: block.highlights?.length ? block.highlights : project.highlights || [],
    };
  }

  function renderAiBadge() {
    return `<span class="drawer__ai-badge" title="${esc(t('drawer.aiGenerated'))}">
      <span aria-hidden="true">${esc(t('drawer.aiBadge'))}</span>
      <span class="sr-only">${esc(t('drawer.aiGenerated'))}</span>
    </span>`;
  }

  function renderProse(text) {
    if (!text) return '';
    return `<div class="drawer__prose">${text
      .split(/\n\n+/)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join('')}</div>`;
  }

  function renderAiCopy(innerHtml) {
    if (!innerHtml) return '';
    return `<div class="drawer__copy">${renderAiBadge()}${innerHtml}</div>`;
  }

  function renderOverview(project) {
    const copy = localizedCopy(project);
    const highlights =
      copy.highlights.length > 0
        ? `<ul class="drawer__highlights">${copy.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
        : '';

    const prose = renderProse(copy.overview);
    const copyHtml = prose || highlights ? renderAiCopy(`${prose}${highlights}`) : '';

    return `
      ${copyHtml}
      ${project.stack?.length ? renderTagList(t('drawer.techStack'), project.stack) : ''}`;
  }

  function renderUx(project) {
    const ux = project.ux || {};
    const { uxNarrative } = localizedCopy(project);
    const narrative = uxNarrative ? renderAiCopy(renderProse(uxNarrative)) : '';
    const blocks = [];

    if (ux.uiFrameworks?.length) blocks.push(renderTagList(t('drawer.uiFrameworks'), ux.uiFrameworks));
    if (ux.a11yTools?.length) blocks.push(renderTagList(t('drawer.a11y'), ux.a11yTools));

    const testing = [...(ux.unitTools || []), ...(ux.e2eTools || [])];
    if (testing.length) blocks.push(renderTagList(t('drawer.testing'), testing));

    const fileStats = [
      [t('drawer.tsxFiles'), ux.tsxFiles],
      [t('drawer.componentFolders'), ux.componentCount],
      [t('drawer.testFiles'), ux.testFiles],
    ].filter(([, v]) => v > 0);

    const signalsHtml =
      blocks.length || fileStats.length
        ? `<div class="metric-block metric-block--subtle">
            ${blocks.join('')}
            ${
              fileStats.length
                ? `<dl class="kv-list">${fileStats.map(([k, v]) => `<div class="kv-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
                : ''
            }
          </div>`
        : '';

    if (!narrative && !signalsHtml) {
      return `<p class="drawer__empty">${esc(t('drawer.uxEmpty'))}</p>`;
    }

    return narrative + signalsHtml;
  }

  function renderTech(project) {
    const deps = project.dependencies || {};
    const loc = project.loc;

    const langHtml = loc?.byLanguage
      ? `<div class="metric-block">
          <h3 class="metric-block__title">${esc(t('drawer.codeByLang'))}</h3>
          <dl class="kv-list">${Object.entries(loc.byLanguage)
            .sort((a, b) => b[1] - a[1])
            .map(([lang, n]) => `<div class="kv-row"><dt>${esc(lang)}</dt><dd>${n.toLocaleString(locale === 'en' ? 'en-GB' : 'de-DE')} ${esc(t('drawer.lines'))}</dd></div>`)
            .join('')}</dl>
        </div>`
      : '';

    const gitHtml = project.git
      ? `<div class="metric-block">
          <h3 class="metric-block__title">${esc(t('drawer.git'))}</h3>
          <dl class="kv-list">
            <div class="kv-row"><dt>${esc(t('drawer.commits'))}</dt><dd>${project.git.commits}</dd></div>
            <div class="kv-row"><dt>${esc(t('drawer.firstCommit'))}</dt><dd>${formatDate(project.git.firstCommit)}</dd></div>
            <div class="kv-row"><dt>${esc(t('drawer.lastCommit'))}</dt><dd>${formatDate(project.git.lastCommit)}</dd></div>
          </dl>
        </div>`
      : '';

    const depHtml = `
      <div class="metric-block">
        <h3 class="metric-block__title">${esc(t('drawer.libraries', { count: project.dependencyCount || 0 }))}</h3>
        ${renderDepGroup(t('drawer.depUi'), deps.ui)}
        ${renderDepGroup(t('drawer.depData'), deps.data)}
        ${renderDepGroup(t('drawer.depAi'), deps.ai)}
        ${renderDepGroup(t('drawer.depInfra'), deps.infra)}
        ${renderDepGroup(t('drawer.depTesting'), deps.testing)}
        ${renderDepGroup(t('drawer.depOther'), deps.other)}
      </div>`;

    return langHtml + renderCoverage(project.coverage) + gitHtml + depHtml;
  }

  function switchTab(tabId) {
    activeTab = tabId;
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === tabId;
      tab.classList.toggle('drawer__tab--active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Object.entries(panels).forEach(([key, panel]) => {
      const active = key === tabId;
      panel.classList.toggle('drawer__panel--active', active);
      panel.hidden = !active;
    });
  }

  function renderDrawer(project) {
    document.getElementById('drawer-title').textContent = project.name;
    document.getElementById('drawer-stats').innerHTML = renderStatLine(project);
    panels.overview.innerHTML = renderOverview(project);
    panels.ux.innerHTML = renderUx(project);
    panels.tech.innerHTML = renderTech(project);
    switchTab('overview');

    const media = document.getElementById('drawer-media');
    const shot = `/screenshots/${project.slug}.png`;
    media.style.setProperty('--accent', project.accent);
    media.innerHTML = `<img src="${shot}" alt="${esc(t('drawer.screenshotAlt', { name: project.name }))}" onerror="this.parentElement.classList.add('drawer__media--fallback');this.remove()" />`;
    media.classList.remove('drawer__media--fallback');

    const heroOverlay = document.getElementById('drawer-hero-overlay');
    heroOverlay.innerHTML = project.productVideo
      ? `<a class="drawer__video" href="${esc(project.productVideo)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`${t('drawer.productVideo')} — ${t('a11y.externalHint')}`)}">
        <span class="drawer__video-play" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>
        </span>
        <span class="drawer__video-label">${esc(t('drawer.productVideo'))}</span>
      </a>`
      : '';

    const introActions = document.getElementById('drawer-intro-actions');
    introActions.innerHTML = `
      <a class="drawer__visit" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">
        <span>${esc(t('drawer.visit'))}</span>
        <span class="sr-only">${esc(t('a11y.externalHint'))}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5.5 3.5H12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3.5 12.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </a>`;

    const actionLinks = [];
    if (project.github) {
      actionLinks.push(`<a class="btn btn--ghost" href="${esc(project.github)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        ${esc(t('drawer.github'))}
        <span class="sr-only">${esc(t('a11y.externalHint'))}</span>
      </a>`);
    }
    const actions = document.getElementById('drawer-actions');
    actions.innerHTML = actionLinks.join('');

    drawer.style.setProperty('--accent', project.accent);
    drawer.style.setProperty('--accent-light', project.accentCtaLight || project.accent);
    drawer.style.setProperty('--accent-btn', project.accentBtn || project.accent);
    backdrop.style.setProperty('--accent', project.accent);
  }

  let savedScrollY = 0;

  function getScrollbarWidth() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  // Scroll sperren ohne Layout-Shift: Scrollbar-Breite per Padding ausgleichen,
  // Scroll-Position per position:fixed + top beibehalten.
  function lockBodyScroll() {
    if (document.body.classList.contains('drawer-open')) return;

    savedScrollY = window.scrollY;
    const scrollbarWidth = getScrollbarWidth();
    document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
    document.documentElement.classList.add('drawer-open');
    document.body.classList.add('drawer-open');
    document.body.style.top = `-${savedScrollY}px`;
  }

  function unlockBodyScroll() {
    if (!document.body.classList.contains('drawer-open')) return;

    const scrollY = savedScrollY;
    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;

    html.style.scrollBehavior = 'auto';
    document.body.style.top = '';
    document.body.classList.remove('drawer-open');
    html.classList.remove('drawer-open');
    html.style.removeProperty('--scrollbar-width');
    window.scrollTo(0, scrollY);
    html.style.scrollBehavior = previousScrollBehavior;
  }

  function finishDrawerClose() {
    if (activeSlug) return;
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
    hideDrawerElements();
    unlockBodyScroll();
  }

  // Verbirgt den Drawer erst nach der Schließen-Animation. Bricht ab, falls
  // inzwischen wieder ein Projekt geöffnet wurde (verhindert das „reinfahren
  // und sofort verschwinden" bei schnellem Wechsel zwischen Karten).
  function hideDrawerElements() {
    if (activeSlug) return;
    drawer.hidden = true;
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
    const drawerTitle = document.getElementById('drawer-title');
    if (drawerTitle) drawerTitle.textContent = t('drawer.defaultTitle');
  }

  function onCloseTransitionEnd(event) {
    if (event.target !== drawer || event.propertyName !== 'transform') return;
    finishDrawerClose();
  }

  function cancelPendingClose() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
  }

  function resetDrawerScroll() {
    const scrollArea = drawer.querySelector('.drawer__scroll');
    if (!scrollArea) return;
    scrollArea.scrollTo(0, 0);
    requestAnimationFrame(() => {
      scrollArea.scrollTo(0, 0);
    });
  }

  function openDrawer(slug) {
    return projectsReady.then(() => {
      const project = projects[slug];
      if (!project || !drawer) return;

      cancelPendingClose();

      if (!activeSlug) {
        lastFocus = document.activeElement;
      }
      activeSlug = slug;
      renderDrawer(project);
      resetDrawerScroll();

      drawer.inert = false;
      drawer.hidden = false;
      backdrop.hidden = false;
      void drawer.offsetWidth;
      drawer.classList.add('drawer--open');
      backdrop.classList.add('drawer-backdrop--visible');

      resetDrawerScroll();
      lockBodyScroll();
      openButtons.forEach((btn) => {
        btn.setAttribute('aria-expanded', btn.dataset.open === slug ? 'true' : 'false');
      });

      history.replaceState(null, '', `#${slug}`);
      requestAnimationFrame(() => {
        resetDrawerScroll();
        closeBtn.focus({ preventScroll: true });
      });
    });
  }

  function closeDrawer() {
    if (!activeSlug) return;

    cancelPendingClose();

    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    backdrop.hidden = true;
    drawer.inert = true;
    resetDrawerScroll();

    activeSlug = null;

    drawer.addEventListener('transitionend', onCloseTransitionEnd);
    closeTimer = window.setTimeout(finishDrawerClose, 500);

    openButtons.forEach((btn) => btn.setAttribute('aria-expanded', 'false'));

    if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    lastFocus?.focus({ preventScroll: true });
  }

  async function handleHash() {
    await projectsReady;
    const slug = location.hash.slice(1);
    if (!slug || !projects[slug] || activeSlug === slug) return;
    openDrawer(slug);
  }

  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSlug) closeDrawer();
    trapDrawerFocus(e);
  });

  function trapDrawerFocus(e) {
    if (!activeSlug || e.key !== 'Tab' || drawer.hidden) return;
    const focusable = drawer.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  window.addEventListener('hashchange', handleHash);
})();
