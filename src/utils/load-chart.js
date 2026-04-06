/**
 * Lazy-load Chart.js from CDN on first use.
 * Avoids blocking initial page load — only loads when calculator or compare views need it.
 * Includes timeout fallback for offline/slow connections.
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4';
const LOAD_TIMEOUT_MS = 10_000;

let loading = null;

/**
 * Returns the Chart constructor, loading from CDN if needed.
 * Rejects after 10s timeout for offline/slow connections.
 * @returns {Promise<typeof import('chart.js').Chart>}
 */
export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);

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
