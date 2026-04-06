import { addRoute, setNotFound, initRouter, refresh } from './router/router.js';
import { initI18n, toggleLocale, getLocale } from './i18n/i18n.js';

import * as homeView from './views/home.js';
import * as searchView from './views/search.js';
import * as profileView from './views/profile.js';
import * as detailView from './views/detail.js';
import * as calculatorView from './views/calculator.js';
import * as compareView from './views/compare.js';
import * as reportView from './views/report.js';

/**
 * One-time migration: move legacy localStorage keys (career-compass-*, eduroi-*)
 * to the current 14to17-* namespace, then clean up.
 */
function migrateStorage() {
  const FLAG = '14to17-migrated';
  if (localStorage.getItem(FLAG)) return;

  const LEGACY_PREFIXES = ['career-compass-', 'eduroi-'];
  const KEY_MAP = {
    locale: '14to17-locale',
    tracker: '14to17-tracker',
  };

  for (const prefix of LEGACY_PREFIXES) {
    for (const [suffix, newKey] of Object.entries(KEY_MAP)) {
      const oldKey = prefix + suffix;
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldVal);
      }
      localStorage.removeItem(oldKey);
    }
  }

  localStorage.setItem(FLAG, '1');
}

function notFound() {
  return `
    <section class="placeholder-view">
      <h1>404</h1>
      <p>Page not found.</p>
      <a href="#/" role="button" class="outline">Home</a>
    </section>
  `;
}

function setupLangToggle() {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;

  function updateLabel() {
    // Show the OTHER language as the toggle label
    btn.textContent = getLocale() === 'en' ? '中文' : 'EN';
  }

  btn.addEventListener('click', async () => {
    await toggleLocale();
    updateLabel();
  });

  document.addEventListener('locale-changed', updateLabel);
  updateLabel();
}

export async function initApp() {
  // Migrate legacy localStorage keys before anything reads storage
  migrateStorage();

  // Register routes (views with afterRender pass the module; others pass render fn)
  addRoute('/', homeView.render);
  addRoute('/search', searchView);
  addRoute('/profile/:soc', profileView);
  addRoute('/detail/:soc', detailView);
  addRoute('/calculator', calculatorView);
  addRoute('/compare', compareView);
  addRoute('/report', reportView);
  setNotFound(notFound);

  // Init i18n (loads translations, applies to static DOM)
  await initI18n();

  // Init router (renders first view, applies i18n to dynamic DOM)
  initRouter('app');

  // Wire up language toggle button
  setupLangToggle();

  // Force re-render when clicking a nav link for the current route
  document.querySelectorAll('header nav a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = link.getAttribute('href').replace('#', '') || '/';
      const current = (window.location.hash.replace('#', '') || '/').split('?')[0];
      if (target === current) {
        e.preventDefault();
        refresh();
      }
    });
  });
}
