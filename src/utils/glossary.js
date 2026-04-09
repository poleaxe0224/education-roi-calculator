/**
 * Glossary tooltip utility — wraps technical terms with data-tooltip attributes.
 *
 * Usage: tooltip('ROI', 'roi') → <span data-tooltip="...">ROI</span>
 *        bilingualTip('degree_bachelors') → "學士" with tooltip "Bachelor's" (zh-TW only)
 */

import { t, getLocale } from '../i18n/i18n.js';

/**
 * Wrap a term with a glossary tooltip.
 * @param {string} label — visible text
 * @param {string} glossaryKey — key in glossary.* i18n namespace
 * @returns {string} HTML string with data-tooltip
 */
export function tooltip(label, glossaryKey) {
  const tip = t('glossary.' + glossaryKey);
  if (!tip || tip.startsWith('glossary.')) return label;
  return `<span data-tooltip="${tip.replace(/"/g, '&quot;')}" tabindex="0">${label}</span>`;
}

/**
 * Bilingual tooltip for proper nouns (degree names, classification terms).
 * Shows the translated label with the other-language original as tooltip.
 * @param {string} label — visible text (already translated)
 * @param {string} otherLang — the other-language text to show as tooltip
 * @returns {string} HTML string — plain text or tooltip-wrapped
 */
export function bilingualTip(label, otherLang) {
  if (!otherLang || otherLang === label) return label;
  return `<span data-tooltip="${otherLang.replace(/"/g, '&quot;')}" tabindex="0">${label}</span>`;
}

/** English degree names for bilingual tooltips in zh-TW mode */
const DEGREE_EN = {
  certificate: 'Certificate',
  associates: "Associate's",
  bachelors: "Bachelor's",
  masters: "Master's",
  doctoral: 'Doctoral',
  firstProfessional: 'Professional',
};

/** Chinese degree names for bilingual tooltips in en mode */
const DEGREE_ZH = {
  certificate: '證照',
  associates: '副學士',
  bachelors: '學士',
  masters: '碩士',
  doctoral: '博士',
  firstProfessional: '專業學位',
};

/**
 * Degree label with bilingual tooltip.
 * zh-TW: shows 學士 with tooltip "Bachelor's"
 * en: shows Bachelor's with tooltip "學士"
 * @param {string} key — degree key (e.g. 'bachelors')
 * @returns {string} HTML string
 */
export function degreeLabel(key) {
  const label = t('common.degree_' + key) || key;
  const isZh = getLocale() === 'zh-TW';
  const otherLang = isZh ? DEGREE_EN[key] : DEGREE_ZH[key];
  return bilingualTip(label, otherLang || key);
}
