import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname, extname, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const devRoot = join(root, '..');
const pathsFile = join(root, 'data/project-paths.json');
const outFile = join(root, 'data/metrics.json');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.next-build',
  'dist',
  'build',
  'coverage',
  '.pytest_cache',
  '__pycache__',
  '.turbo',
  '.vercel',
  'vendor',
  '.venv',
  'venv',
  'screenshots',
  'logs',
]);

const SOURCE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.css',
  '.scss',
  '.html',
  '.vue',
  '.svelte',
  '.kt',
  '.java',
  '.go',
  '.rs',
  '.sql',
]);

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.py$/,
  /test_.*\.py$/,
];

const DEP_CATEGORIES = {
  ui: [
    'react',
    'react-dom',
    'next',
    '@radix-ui',
    '@mantine',
    'tailwindcss',
    '@tailwindcss',
    'shadcn',
    'class-variance-authority',
    'clsx',
    'tailwind-merge',
    'lucide-react',
    '@headlessui',
    'framer-motion',
    'motion',
    'gsap',
    'three',
    '@react-three',
    'leaflet',
    'react-leaflet',
    'deck.gl',
    'maplibre',
    'mapbox',
    '@tiptap',
    'recharts',
    '@hookform',
    'react-hook-form',
    'sonner',
    'vaul',
    'cmdk',
  ],
  data: [
    'drizzle',
    'prisma',
    '@prisma',
    'sqlalchemy',
    'sqlmodel',
    'better-sqlite3',
    'postgres',
    'pg',
    '@supabase',
    'firebase',
    'firestore',
    '@libsql',
    'turso',
    '@tanstack/react-query',
    'zod',
    'drizzle-orm',
  ],
  ai: [
    'openai',
    'openrouter',
    '@openrouter',
    'replicate',
    '@google/generative-ai',
    '@google-cloud',
    'langfuse',
    'langchain',
    '@anthropic-ai',
    'fal',
    '@fal-ai',
    'elevenlabs',
    'gemini',
  ],
  infra: [
    'express',
    'fastapi',
    'uvicorn',
    'docker',
    'railway',
    'vite',
    '@vitejs',
    'webpack',
    'nodemon',
    'tsx',
    'typescript',
    'eslint',
    'prettier',
    'playwright',
    'puppeteer',
  ],
  testing: [
    'vitest',
    'jest',
    '@testing-library',
    'pytest',
    'playwright',
    'cypress',
    '@playwright',
    'msw',
    'supertest',
    'happy-dom',
    'jsdom',
    'axe-core',
    '@axe-core',
    'eslint-plugin-jsx-a11y',
    'pa11y',
  ],
};

const STACK_DETECTORS = [
  { name: 'Next.js', test: (deps) => deps.has('next') },
  { name: 'React', test: (deps) => deps.has('react') },
  { name: 'Vite', test: (deps) => deps.has('vite') },
  { name: 'TypeScript', test: (deps, files) => files.some((f) => f.endsWith('tsconfig.json')) },
  { name: 'Python', test: (deps, files) => files.some((f) => f.endsWith('pyproject.toml') || f.endsWith('requirements.txt')) },
  { name: 'FastAPI', test: (deps) => deps.has('fastapi') },
  { name: 'Express', test: (deps) => deps.has('express') },
  { name: 'Tailwind CSS', test: (deps) => deps.has('tailwindcss') || [...deps].some((d) => d.startsWith('@tailwindcss')) },
  { name: 'SQLite', test: (deps, files, all) => all.some((d) => /sqlite|better-sqlite3/i.test(d)) },
  { name: 'PostgreSQL', test: (deps, files, all) => all.some((d) => /postgres|^pg$|prisma|supabase/i.test(d)) },
  { name: 'Drizzle ORM', test: (deps, files, all) => all.some((d) => d.includes('drizzle')) },
  { name: 'Prisma', test: (deps) => deps.has('@prisma/client') || deps.has('prisma') },
  { name: 'Supabase', test: (deps, files, all) => all.some((d) => d.includes('supabase')) },
  { name: 'Firebase', test: (deps, files, all) => all.some((d) => d.includes('firebase')) },
  { name: 'Three.js', test: (deps) => deps.has('three') },
  { name: 'Docker', test: (deps, files) => files.some((f) => basename(f) === 'Dockerfile') },
  { name: 'Chrome Extension', test: (deps, files) => files.some((f) => f.includes('manifest.json') && f.includes('extension')) },
  { name: 'Android', test: (deps, files) => files.some((f) => f.includes('android/app')) },
  { name: 'Vitest', test: (deps) => deps.has('vitest') },
  { name: 'Playwright', test: (deps) => deps.has('playwright') || deps.has('@playwright/test') },
  { name: 'Mantine', test: (deps, files, all) => all.some((d) => d.startsWith('@mantine')) },
  { name: 'Radix UI', test: (deps, files, all) => all.some((d) => d.startsWith('@radix-ui')) },
  { name: 'OpenRouter', test: (deps, files, all) => all.some((d) => d.includes('openrouter')) },
  { name: 'Railway', test: (deps, files) => files.some((f) => basename(f) === 'railway.toml' || basename(f) === 'railway.json') },
  { name: 'Vercel', test: (deps, files) => files.some((f) => basename(f) === 'vercel.json') },
  { name: 'GSAP', test: (deps) => deps.has('gsap') },
  { name: 'Leaflet', test: (deps) => deps.has('leaflet') },
  { name: 'TipTap', test: (deps, files, all) => all.some((d) => d.startsWith('@tiptap')) },
  { name: 'Turso', test: (deps, files, all) => all.some((d) => d.includes('turso') || d.includes('@libsql')) },
];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const SKIP_PATH_PARTS = ['node_modules', 'concept', 'specs', 'brainstorming', '.pytest_cache'];

function shouldSkipPath(filePath) {
  const parts = filePath.split(/[/\\]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  return parts.some((p) => SKIP_PATH_PARTS.includes(p));
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(dir, full);
    if (entry.isDirectory()) {
      if (!SKIP_PATH_PARTS.includes(entry.name)) walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function categorizeDep(name) {
  const lower = name.toLowerCase();
  for (const [cat, patterns] of Object.entries(DEP_CATEGORIES)) {
    if (patterns.some((p) => lower === p || lower.startsWith(p + '/') || lower.startsWith(p + '@') || lower.includes(p))) {
      return cat;
    }
  }
  return 'other';
}

function collectDependencies(projectDir) {
  const allFiles = walk(projectDir);
  const packageFiles = allFiles.filter((f) => basename(f) === 'package.json' && !f.includes('node_modules'));
  const depMap = new Map();

  for (const pkgPath of packageFiles) {
    const pkg = readJson(pkgPath);
    if (!pkg) continue;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const block = pkg[section] || {};
      for (const [name, version] of Object.entries(block)) {
        if (!depMap.has(name)) depMap.set(name, { name, version: String(version), sections: new Set() });
        depMap.get(name).sections.add(section);
      }
    }
  }

  const pyproject = allFiles.find((f) => basename(f) === 'pyproject.toml');
  if (pyproject) {
    const content = readFileSync(pyproject, 'utf8');
    const depSection = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depSection) {
      const names = depSection[1].match(/"([^"]+)"/g) || [];
      for (const raw of names) {
        const name = raw.replace(/"/g, '').split(/[<>=!]/)[0].trim();
        if (name && !depMap.has(name)) depMap.set(name, { name, version: 'py', sections: new Set(['dependencies']) });
      }
    }
  }

  const reqFile = allFiles.find((f) => basename(f) === 'requirements.txt' && !f.includes('node_modules'));
  if (reqFile) {
    const lines = readFileSync(reqFile, 'utf8').split('\n');
    for (const line of lines) {
      const name = line.trim().split(/[=<>!#\[]/)[0].trim();
      if (name && !name.startsWith('#') && !depMap.has(name)) {
        depMap.set(name, { name, version: 'pip', sections: new Set(['dependencies']) });
      }
    }
  }

  const grouped = { ui: [], data: [], ai: [], infra: [], testing: [], other: [] };
  for (const dep of depMap.values()) {
    const cat = categorizeDep(dep.name);
    grouped[cat].push(dep.name);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.localeCompare(b, 'en'));
  }

  return { grouped, all: [...depMap.keys()], depSet: new Set(depMap.keys()) };
}

function countLoc(projectDir) {
  const files = walk(projectDir);
  const byExt = {};
  let total = 0;
  let code = 0;
  let blank = 0;
  let comment = 0;

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SOURCE_EXTS.has(ext)) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    let fileCode = 0;
    let fileBlank = 0;
    let fileComment = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        fileBlank++;
        continue;
      }
      const isComment =
        (ext === '.py' && trimmed.startsWith('#')) ||
        ((ext === '.js' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') &&
          (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))) ||
        (ext === '.css' && trimmed.startsWith('/*'));
      if (isComment) fileComment++;
      else fileCode++;
    }

    const lang =
      ext === '.py'
        ? 'Python'
        : ext === '.tsx' || ext === '.ts'
          ? 'TypeScript'
          : ext === '.jsx' || ext === '.js'
            ? 'JavaScript'
            : ext === '.css' || ext === '.scss'
              ? 'CSS'
              : ext.replace('.', '').toUpperCase();

    byExt[lang] = (byExt[lang] || 0) + fileCode;
    total += lines.length;
    code += fileCode;
    blank += fileBlank;
    comment += fileComment;
  }

  return { total, code, blank, comment, byLanguage: byExt };
}

function countFiles(projectDir) {
  const files = walk(projectDir);
  const rel = files.map((f) => relative(projectDir, f));
  const components = rel.filter((f) => f.includes('/components/') && (f.endsWith('.tsx') || f.endsWith('.jsx'))).length;
  const tsx = rel.filter((f) => f.endsWith('.tsx')).length;
  const tests = rel.filter((f) => TEST_PATTERNS.some((p) => p.test(f))).length;
  const source = rel.filter((f) => SOURCE_EXTS.has(extname(f))).length;
  return { source, components, tsx, tests };
}

function findCoverage(projectDir) {
  const files = walk(projectDir);
  const summaryPath = files.find((f) => f.endsWith('coverage-summary.json'));
  if (!summaryPath) return null;
  const data = readJson(summaryPath);
  if (!data?.total) return null;
  const t = data.total;
  return {
    lines: pct(t.lines),
    statements: pct(t.statements),
    branches: pct(t.branches),
    functions: pct(t.functions),
  };
}

function pct(metric) {
  if (!metric || !metric.total) return null;
  return Math.round((metric.covered / metric.total) * 100);
}

function gitInfo(projectDir) {
  let dir = projectDir;
  if (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (existsSync(join(parent, '.git'))) dir = parent;
    else return null;
  }
  try {
    const commits = Number(execSync('git rev-list --count HEAD', { cwd: dir, encoding: 'utf8' }).trim());
    const lastCommit = execSync('git log -1 --format=%ci', { cwd: dir, encoding: 'utf8' }).trim();
    const firstCommit = execSync('git log --reverse --format=%ci | head -1', {
      cwd: dir,
      encoding: 'utf8',
      shell: '/bin/bash',
    }).trim();
    return { commits, firstCommit, lastCommit };
  } catch {
    return null;
  }
}

function gitRemote(projectDir) {
  let dir = projectDir;
  if (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir);
    if (existsSync(join(parent, '.git'))) dir = parent;
    else return null;
  }
  try {
    let url = execSync('git remote get-url origin', { cwd: dir, encoding: 'utf8' }).trim();
    url = url.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');
    return url;
  } catch {
    return null;
  }
}

function findReadme(projectDir) {
  const names = ['README.md', 'AGENTS.md', 'KONZEPT.md', 'CLAUDE.md'];
  const dirs = [projectDir, join(projectDir, 'app'), join(projectDir, 'web'), join(projectDir, 'frontend')];
  const candidates = [];

  for (const dir of dirs) {
    for (const name of names) {
      const path = join(dir, name);
      if (existsSync(path)) candidates.push(path);
    }
  }

    const VITE_BOILERPLATE = /minimal setup to get React working in Vite/i;

  let best = '';
  let bestScore = 0;

  for (const path of candidates) {
    const content = readFileSync(path, 'utf8');
    if (VITE_BOILERPLATE.test(content)) continue;
    const parsed = parseReadme(content);
    const score = (parsed.longDescription?.length || 0) + (parsed.highlights.length || 0) * 40;
    if (score > bestScore) {
      bestScore = score;
      best = content;
    }
  }

  if (best) return best;

  const files = walk(projectDir);
  const readme = files.find((f) => basename(f) === 'README.md');
  return readme ? readFileSync(readme, 'utf8') : '';
}

function parseReadme(content) {
  if (!content) return { description: '', longDescription: '', highlights: [] };

  const stripped = content
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  const stopSection = /^##\s*(setup|installation|voraussetzungen|entwicklung|getting started|scripts|skripte|endpunkte|deployment|architektur|api|lokal|starten)/i;

  const lines = stripped.split('\n');
  let start = 0;
  if (lines[0]?.startsWith('#')) start = 1;

  const paragraphs = [];
  const highlights = [];
  let current = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '---') break;
    if (line.startsWith('##') && stopSection.test(line)) break;

    if (line.startsWith('#')) {
      if (current.length) paragraphs.push(current.join(' ').trim());
      current = [];
      const heading = line.replace(/^#+\s*/, '').toLowerCase();
      if (/feature|highlight|funktion|überblick|was|about|v2|projekt/i.test(heading)) {
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (l.startsWith('#') || l === '---') break;
          const bullet = l.match(/^[-*•]\s+(.+)/) || l.match(/^\d+\.\s+(.+)/);
          if (bullet) highlights.push(bullet[1].replace(/`/g, '').replace(/\*\*/g, '').trim());
          if (highlights.length >= 6) break;
        }
      }
      continue;
    }

    if (!line.trim()) {
      if (current.length) {
        paragraphs.push(current.join(' ').trim());
        current = [];
      }
      if (paragraphs.length >= 2 && highlights.length >= 4) break;
      continue;
    }

    if (line.trim().startsWith('```') || line.trim().startsWith('|')) continue;

    const bullet = line.trim().match(/^[-*•]\s+(.+)/);
    if (bullet && paragraphs.length === 0 && !line.includes('**')) {
      highlights.push(bullet[1].replace(/`/g, '').replace(/\*\*/g, '').trim());
    } else if (!line.trim().startsWith('>')) {
      current.push(line.trim());
    }

    if (paragraphs.length >= 2 && highlights.length >= 4) break;
  }
  if (current.length) paragraphs.push(current.join(' ').trim());

  const clean = (s) =>
    s
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

  const skip = (p) =>
    p.length < 40 ||
    p.startsWith('![') ||
    /OPENROUTER_API_KEY|gitignored|npm run|localhost:\d/i.test(p) ||
    /^Hinweise fuer Agents/i.test(p) ||
    /^This file provides guidance to Claude/i.test(p) ||
    /^Diese Datei (richtet|gibt)/i.test(p);

  const usable = paragraphs.map(clean).filter((p) => !skip(p));
  const description = (usable[0] || '').slice(0, 220);
  const longDescription = usable.slice(0, 2).join(' ') || description;

  return {
    description,
    longDescription,
    highlights: [...new Set(highlights)].filter((h) => h.length > 8 && h.length < 160).slice(0, 6),
  };
}

function detectUx(depSet, allDeps, files, fileCounts) {
  const uiFrameworks = [];
  if ([...depSet].some((d) => d.startsWith('@radix-ui'))) uiFrameworks.push('Radix UI');
  if ([...depSet].some((d) => d.startsWith('@mantine'))) uiFrameworks.push('Mantine');
  if (depSet.has('tailwindcss') || [...depSet].some((d) => d.startsWith('@tailwindcss'))) uiFrameworks.push('Tailwind CSS');
  if (depSet.has('next')) uiFrameworks.push('Next.js App Router');
  if (depSet.has('class-variance-authority')) uiFrameworks.push('shadcn/ui Pattern');
  if (depSet.has('framer-motion') || depSet.has('motion')) uiFrameworks.push('Motion');
  if (depSet.has('gsap')) uiFrameworks.push('GSAP');
  if (depSet.has('three')) uiFrameworks.push('Three.js');

  const a11yTools = [];
  if (depSet.has('eslint-plugin-jsx-a11y')) a11yTools.push('eslint-plugin-jsx-a11y');
  if ([...depSet].some((d) => d.includes('axe-core'))) a11yTools.push('axe-core');
  if (depSet.has('pa11y')) a11yTools.push('Pa11y');
  if (depSet.has('@testing-library/react')) a11yTools.push('Testing Library');

  const e2eTools = [];
  if (depSet.has('playwright') || depSet.has('@playwright/test')) e2eTools.push('Playwright');
  if (depSet.has('cypress')) e2eTools.push('Cypress');

  const unitTools = [];
  if (depSet.has('vitest')) unitTools.push('Vitest');
  if (depSet.has('jest')) unitTools.push('Jest');
  if (allDeps.some((d) => d === 'pytest')) unitTools.push('pytest');

  const hasResponsiveCss = files.some((f) => f.endsWith('.css') || f.endsWith('.tsx'));
  const hasManifestExtension = files.some((f) => f.includes('manifest.json') && f.includes('extension'));

  return {
    uiFrameworks,
    a11yTools,
    e2eTools,
    unitTools,
    componentCount: fileCounts.components,
    tsxFiles: fileCounts.tsx,
    testFiles: fileCounts.tests,
    hasResponsiveCss,
    hasManifestExtension,
  };
}

function detectStack(depSet, allFiles, allDepNames) {
  const relFiles = allFiles;
  const found = [];
  for (const detector of STACK_DETECTORS) {
    if (detector.test(depSet, relFiles, allDepNames)) found.push(detector.name);
  }
  return found;
}

function formatLoc(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

function analyzeProject(slug, relPath) {
  const projectDir = join(devRoot, relPath);
  if (!existsSync(projectDir)) {
    console.warn(`  ✗ Pfad nicht gefunden: ${projectDir}`);
    return null;
  }

  console.log(`  Analysiere ${slug}…`);
  const allFiles = walk(projectDir).map((f) => relative(projectDir, f));
  const { grouped, all: allDeps, depSet } = collectDependencies(projectDir);
  const loc = countLoc(projectDir);
  const files = countFiles(projectDir);
  const coverage = findCoverage(projectDir);
  const git = gitInfo(projectDir);
  const github = gitRemote(projectDir);
  const readme = parseReadme(findReadme(projectDir));
  const ux = detectUx(depSet, allDeps, allFiles, files);
  const stack = detectStack(depSet, allFiles, allDeps);

  return {
    slug,
    localPath: relPath,
    github,
    description: readme.description,
    longDescription: readme.longDescription,
    highlights: readme.highlights,
    stack,
    dependencies: grouped,
    dependencyCount: allDeps.length,
    loc,
    locFormatted: formatLoc(loc.code),
    files,
    coverage,
    git,
    ux,
    analyzedAt: new Date().toISOString(),
  };
}

const pathMap = readJson(pathsFile);
if (!pathMap) {
  console.error('data/project-paths.json fehlt');
  process.exit(1);
}

const existing = existsSync(outFile) ? readJson(outFile) : {};
const result = { ...existing };

console.log('Sammle Projekt-Metriken…');
let analyzed = 0;

for (const [slug, relPath] of Object.entries(pathMap)) {
  const data = analyzeProject(slug, relPath);
  if (data) {
    result[slug] = data;
    analyzed++;
  }
}

if (analyzed === 0 && Object.keys(result).length === 0) {
  console.warn('Keine Projekte analysiert und keine bestehenden Metriken — CI ohne lokale Pfade?');
  process.exit(0);
}

writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`\nFertig: ${analyzed}/${Object.keys(pathMap).length} Projekte → data/metrics.json`);
