/**
 * Dark mode support.
 *
 * - Reads saved preference from localStorage
 * - Falls back to prefers-color-scheme media query
 * - Applies data-theme attribute to <html>
 * - Dispatches 'theme-changed' event
 */

const STORAGE_KEY = '14to17-theme';

/**
 * Resolve the effective theme: saved > OS preference > 'light'.
 */
export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Apply theme to DOM.
 */
function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#1a1a2e' : '#2563eb';
  }
}

/**
 * Toggle between light and dark. Returns the new theme.
 */
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
  document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next } }));
  return next;
}

/**
 * Initialize theme — call once at app startup.
 * Listens for OS preference changes (only when no saved preference).
 */
export function initTheme() {
  const theme = getTheme();
  apply(theme);

  // Listen for OS dark mode changes (auto-follow when no saved preference)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const osTheme = e.matches ? 'dark' : 'light';
      apply(osTheme);
      document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: osTheme } }));
    }
  });
}
