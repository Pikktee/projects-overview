(() => {
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

  const totalProjects = cards.length;

  const projectsReady = loadProjects();

  function ensureDrawerClosed() {
    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    drawer.hidden = true;
    backdrop.hidden = true;
    drawer.inert = true;
  }

  ensureDrawerClosed();

  document.querySelectorAll('.card').forEach((card, i) => {
    card.style.setProperty('--i', i);
  });

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

  async function loadProjects() {
    const v = window.__ASSET_V ? `?v=${window.__ASSET_V}` : '';
    const res = await fetch(`/projects.json${v}`);
    const data = await res.json();
    for (const section of data.sections) {
      for (const p of section.projects) {
        projects[p.slug] = p;
      }
    }
    handleHash();
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
        filterCount.textContent = `${visible} von ${totalProjects} Projekten · ${filterLabel}`;
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
      return new Date(iso).toLocaleDateString('de-DE', { year: 'numeric', month: 'short' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  function renderStatLine(project) {
    const parts = [];
    if (project.locFormatted && project.locFormatted !== '—') {
      parts.push(`<span class="stat-inline__item"><strong>${esc(project.locFormatted)}</strong> Zeilen Code</span>`);
    }
    if (project.git?.commits) {
      parts.push(`<span class="stat-inline__item"><strong>${project.git.commits}</strong> Commits</span>`);
    }
    const tests = project.ux?.testFiles ?? project.files?.tests;
    if (tests > 0) {
      parts.push(`<span class="stat-inline__item"><strong>${tests}</strong> Tests</span>`);
    }
    if (!parts.length) return '';
    return `<p class="stat-inline" aria-label="Projekt-Kennzahlen">${parts.join('<span class="stat-inline__sep" aria-hidden="true">·</span>')}</p>`;
  }

  function renderCoverage(coverage) {
    if (!coverage) return '';
    const items = [
      ['Zeilen', coverage.lines],
      ['Statements', coverage.statements],
      ['Branches', coverage.branches],
      ['Functions', coverage.functions],
    ].filter(([, v]) => v != null);
    if (!items.length) return '';
    return `
      <div class="metric-block">
        <h3 class="metric-block__title">Testabdeckung</h3>
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

  function renderProse(text) {
    if (!text) return '';
    return `<div class="drawer__prose">${text
      .split(/\n\n+/)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join('')}</div>`;
  }

  function renderOverview(project) {
    const highlights =
      project.highlights?.length > 0
        ? `<ul class="drawer__highlights">${project.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
        : '';

    return `
      ${renderProse(project.overview)}
      ${highlights}
      ${project.stack?.length ? renderTagList('Tech-Stack', project.stack) : ''}`;
  }

  function renderUx(project) {
    const ux = project.ux || {};
    const narrative = renderProse(project.uxNarrative);
    const blocks = [];

    if (ux.uiFrameworks?.length) blocks.push(renderTagList('UI-Frameworks', ux.uiFrameworks));
    if (ux.a11yTools?.length) blocks.push(renderTagList('Barrierefreiheit', ux.a11yTools));

    const testing = [...(ux.unitTools || []), ...(ux.e2eTools || [])];
    if (testing.length) blocks.push(renderTagList('Testing', testing));

    const fileStats = [
      ['React-Komponenten (.tsx)', ux.tsxFiles],
      ['Komponenten-Ordner', ux.componentCount],
      ['Test-Dateien', ux.testFiles],
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
      return `<p class="drawer__empty">Für dieses Projekt liegt noch keine UX-Beschreibung vor.</p>`;
    }

    return narrative + signalsHtml;
  }

  function renderTech(project) {
    const deps = project.dependencies || {};
    const loc = project.loc;

    const langHtml = loc?.byLanguage
      ? `<div class="metric-block">
          <h3 class="metric-block__title">Code nach Sprache</h3>
          <dl class="kv-list">${Object.entries(loc.byLanguage)
            .sort((a, b) => b[1] - a[1])
            .map(([lang, n]) => `<div class="kv-row"><dt>${esc(lang)}</dt><dd>${n.toLocaleString('de-DE')} Zeilen</dd></div>`)
            .join('')}</dl>
        </div>`
      : '';

    const gitHtml = project.git
      ? `<div class="metric-block">
          <h3 class="metric-block__title">Git</h3>
          <dl class="kv-list">
            <div class="kv-row"><dt>Commits</dt><dd>${project.git.commits}</dd></div>
            <div class="kv-row"><dt>Erster Commit</dt><dd>${formatDate(project.git.firstCommit)}</dd></div>
            <div class="kv-row"><dt>Letzter Commit</dt><dd>${formatDate(project.git.lastCommit)}</dd></div>
          </dl>
        </div>`
      : '';

    const depHtml = `
      <div class="metric-block">
        <h3 class="metric-block__title">Bibliotheken (${project.dependencyCount || 0})</h3>
        ${renderDepGroup('UI & Frontend', deps.ui)}
        ${renderDepGroup('Daten & Backend', deps.data)}
        ${renderDepGroup('KI & APIs', deps.ai)}
        ${renderDepGroup('Infrastruktur', deps.infra)}
        ${renderDepGroup('Testing', deps.testing)}
        ${renderDepGroup('Sonstige', deps.other)}
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
    media.innerHTML = `<img src="${shot}" alt="Screenshot von ${esc(project.name)}" onerror="this.parentElement.classList.add('drawer__media--fallback');this.remove()" />`;
    media.classList.remove('drawer__media--fallback');

    const introActions = document.getElementById('drawer-intro-actions');
    introActions.innerHTML = `
      <a class="drawer__visit" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">
        <span>Live ansehen</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5.5 3.5H12.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3.5 12.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </a>`;

    const actions = document.getElementById('drawer-actions');
    actions.innerHTML = project.github
      ? `<a class="btn btn--ghost" href="${esc(project.github)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </a>`
      : '';

    drawer.style.setProperty('--accent', project.accent);
  }

  // Scrollleiste ist über `scrollbar-gutter: stable` (CSS) dauerhaft reserviert,
  // daher genügt overflow:hidden ohne Padding-Kompensation — kein Layout-Shift.
  function lockBodyScroll() {
    document.documentElement.classList.add('drawer-open');
    document.body.classList.add('drawer-open');
  }

  function unlockBodyScroll() {
    document.documentElement.classList.remove('drawer-open');
    document.body.classList.remove('drawer-open');
  }

  // Verbirgt den Drawer erst nach der Schließen-Animation. Bricht ab, falls
  // inzwischen wieder ein Projekt geöffnet wurde (verhindert das „reinfahren
  // und sofort verschwinden" bei schnellem Wechsel zwischen Karten).
  function hideDrawerElements() {
    if (activeSlug) return;
    drawer.hidden = true;
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
  }

  function onCloseTransitionEnd(event) {
    if (event.target !== drawer || event.propertyName !== 'transform') return;
    hideDrawerElements();
  }

  function cancelPendingClose() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawer.removeEventListener('transitionend', onCloseTransitionEnd);
  }

  function openDrawer(slug) {
    return projectsReady.then(() => {
      const project = projects[slug];
      if (!project) return;

      cancelPendingClose();

      if (!activeSlug) {
        lastFocus = document.activeElement;
      }
      activeSlug = slug;
      renderDrawer(project);

      const scrollArea = drawer.querySelector('.drawer__scroll');
      if (scrollArea) scrollArea.scrollTop = 0;
      drawer.scrollTop = 0;

      drawer.inert = false;
      drawer.hidden = false;
      backdrop.hidden = false;
      void drawer.offsetWidth;
      drawer.classList.add('drawer--open');
      backdrop.classList.add('drawer-backdrop--visible');

      lockBodyScroll();
      openButtons.forEach((btn) => {
        btn.setAttribute('aria-expanded', btn.dataset.open === slug ? 'true' : 'false');
      });

      history.replaceState(null, '', `#${slug}`);
      closeBtn.focus({ preventScroll: true });
    });
  }

  function closeDrawer() {
    if (!activeSlug) return;

    cancelPendingClose();

    drawer.classList.remove('drawer--open');
    backdrop.classList.remove('drawer-backdrop--visible');
    backdrop.hidden = true;
    drawer.inert = true;

    activeSlug = null;

    drawer.addEventListener('transitionend', onCloseTransitionEnd);
    closeTimer = window.setTimeout(hideDrawerElements, 500);

    unlockBodyScroll();
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

  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSlug) closeDrawer();
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  window.addEventListener('hashchange', handleHash);
})();
