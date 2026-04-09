/**
 * Lazy-load Chart.js from CDN on first use.
 * Avoids blocking initial page load — only loads when calculator or compare views need it.
 * Includes timeout fallback for offline/slow connections.
 * Applies dark/light theme defaults automatically.
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4';
const LOAD_TIMEOUT_MS = 10_000;

const THEME_COLORS = {
  light: { color: '#666', borderColor: 'rgba(0,0,0,0.1)' },
  dark:  { color: '#d1d5db', borderColor: '#374151' },
};

let loading = null;
let themeListenerBound = false;

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Set Chart.js global defaults for the active theme.
 * Safe to call before any chart exists — affects all future renders.
 */
export function applyChartTheme(Chart) {
  const colors = THEME_COLORS[currentTheme()];
  Chart.defaults.color = colors.color;
  Chart.defaults.borderColor = colors.borderColor;
}

function bindThemeListener() {
  if (themeListenerBound) return;
  themeListenerBound = true;

  document.addEventListener('theme-changed', () => {
    if (!window.Chart) return;
    applyChartTheme(window.Chart);
    // Live-update every active chart instance
    Object.values(window.Chart.instances).forEach((chart) => chart.update());
  });
}

/**
 * Returns the Chart constructor, loading from CDN if needed.
 * Rejects after 10s timeout for offline/slow connections.
 * @returns {Promise<typeof import('chart.js').Chart>}
 */
export function loadChart() {
  if (window.Chart) {
    applyChartTheme(window.Chart);
    bindThemeListener();
    return Promise.resolve(window.Chart);
  }

  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN_URL;
      s.async = true;

      const timer = setTimeout(() => {
        loading = null;
        s.remove();
        reject(new Error('Chart.js load timeout — check your internet connection'));
      }, LOAD_TIMEOUT_MS);

      s.onload = () => {
        clearTimeout(timer);
        applyChartTheme(window.Chart);
        bindThemeListener();
        resolve(window.Chart);
      };
      s.onerror = () => {
        clearTimeout(timer);
        loading = null;
        reject(new Error('Failed to load Chart.js — charts unavailable offline'));
      };

      document.head.appendChild(s);
    });
  }

  return loading;
}
