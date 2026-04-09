/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTheme, toggleTheme, initTheme } from '../src/theme.js';

describe('theme module', () => {
  let darkQuery;
  let changeListeners;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Remove any existing data-theme
    document.documentElement.removeAttribute('data-theme');

    // Mock matchMedia
    changeListeners = [];
    darkQuery = { matches: false, addEventListener: (_, cb) => changeListeners.push(cb) };
    vi.stubGlobal('matchMedia', (q) => {
      if (q === '(prefers-color-scheme: dark)') return darkQuery;
      return { matches: false, addEventListener: () => {} };
    });

    // Add meta theme-color tag
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#2563eb';
      document.head.appendChild(meta);
    }
  });

  describe('getTheme', () => {
    it('returns "light" by default when no saved preference and OS is light', () => {
      expect(getTheme()).toBe('light');
    });

    it('returns "dark" when OS prefers dark', () => {
      darkQuery.matches = true;
      expect(getTheme()).toBe('dark');
    });

    it('returns saved preference over OS preference', () => {
      darkQuery.matches = true;
      localStorage.setItem('14to17-theme', 'light');
      expect(getTheme()).toBe('light');
    });

    it('returns saved "dark" preference', () => {
      localStorage.setItem('14to17-theme', 'dark');
      expect(getTheme()).toBe('dark');
    });

    it('ignores invalid saved values', () => {
      localStorage.setItem('14to17-theme', 'invalid');
      expect(getTheme()).toBe('light');
    });
  });

  describe('toggleTheme', () => {
    it('toggles from light to dark', () => {
      const result = toggleTheme();
      expect(result).toBe('dark');
      expect(localStorage.getItem('14to17-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('toggles from dark to light', () => {
      localStorage.setItem('14to17-theme', 'dark');
      const result = toggleTheme();
      expect(result).toBe('light');
      expect(localStorage.getItem('14to17-theme')).toBe('light');
    });

    it('dispatches theme-changed event', () => {
      const handler = vi.fn();
      document.addEventListener('theme-changed', handler);
      toggleTheme();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail.theme).toBe('dark');
      document.removeEventListener('theme-changed', handler);
    });
  });

  describe('initTheme', () => {
    it('applies saved theme on init', () => {
      localStorage.setItem('14to17-theme', 'dark');
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('applies OS preference when no saved theme', () => {
      darkQuery.matches = true;
      initTheme();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('listens for OS preference changes', () => {
      initTheme();
      expect(changeListeners.length).toBe(1);

      // Simulate OS switch to dark
      changeListeners[0]({ matches: true });
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('ignores OS changes when user has saved preference', () => {
      localStorage.setItem('14to17-theme', 'light');
      initTheme();

      // Simulate OS switch to dark — should be ignored
      changeListeners[0]({ matches: true });
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });
});
