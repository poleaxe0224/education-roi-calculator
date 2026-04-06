/**
 * Glossary tooltip utility — wraps technical terms with data-tooltip attributes.
 *
 * Usage: tooltip('ROI', 'roi') → <span data-tooltip="...">ROI</span>
 */

import { t } from '../i18n/i18n.js';

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
