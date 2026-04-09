/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the i18n module before importing glossary
vi.mock('../src/i18n/i18n.js', () => {
  let locale = 'en';
  const translations = {
    en: { glossary: { roi: 'Return on Investment' }, common: { degree_bachelors: "Bachelor's" } },
    'zh-TW': { glossary: { roi: '投資報酬率' }, common: { degree_bachelors: '學士' } },
  };

  function resolve(key, loc) {
    const parts = key.split('.');
    let val = translations[loc];
    for (const p of parts) {
      if (val == null) return key;
      val = val[p];
    }
    return val ?? key;
  }

  return {
    t: (key) => resolve(key, locale),
    getLocale: () => locale,
    _setLocale: (l) => { locale = l; },
  };
});

import { tooltip, bilingualTip, degreeLabel } from '../src/utils/glossary.js';
import { _setLocale } from '../src/i18n/i18n.js';

describe('glossary tooltip', () => {
  beforeEach(() => _setLocale('en'));

  it('wraps label with glossary tooltip', () => {
    const html = tooltip('ROI', 'roi');
    expect(html).toContain('data-tooltip="Return on Investment"');
    expect(html).toContain('ROI');
  });

  it('returns plain label when glossary key not found', () => {
    const html = tooltip('Unknown', 'nonexistent');
    expect(html).toBe('Unknown');
  });
});

describe('bilingualTip', () => {
  it('wraps label with other-language tooltip', () => {
    const html = bilingualTip('學士', "Bachelor's");
    expect(html).toContain("data-tooltip=\"Bachelor's\"");
    expect(html).toContain('學士');
  });

  it('returns plain label when otherLang matches label', () => {
    expect(bilingualTip('Test', 'Test')).toBe('Test');
  });

  it('returns plain label when otherLang is empty', () => {
    expect(bilingualTip('Test', '')).toBe('Test');
    expect(bilingualTip('Test', undefined)).toBe('Test');
  });
});

describe('degreeLabel', () => {
  it('returns English label with Chinese tooltip in en mode', () => {
    _setLocale('en');
    const html = degreeLabel('bachelors');
    expect(html).toContain("Bachelor's");
    expect(html).toContain('data-tooltip="學士"');
  });

  it('returns Chinese label with English tooltip in zh-TW mode', () => {
    _setLocale('zh-TW');
    const html = degreeLabel('bachelors');
    expect(html).toContain('學士');
    expect(html).toContain("data-tooltip=\"Bachelor's\"");
  });

  it('handles unknown degree key gracefully', () => {
    _setLocale('en');
    const html = degreeLabel('unknownDegree');
    // Should not throw, returns key as-is
    expect(html).toContain('unknownDegree');
  });
});
