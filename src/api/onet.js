/**
 * O*NET data service — skills, knowledge, and education requirements.
 *
 * Data source: O*NET Database (pre-fetched as static JSON by scripts/fetch-onet-data.mjs).
 * No API key required — uses publicly available text files.
 *
 * Data shape per SOC:
 *   skills: [{ name, id, score }]      — sorted by score desc, LV scale 0–7
 *   knowledge: [{ name, id, score }]   — sorted by score desc, LV scale 0–7
 *   education: { education: [{ name, percentage }], training: [...], experience: [...] }
 */

let staticData = null;
const cache = {};

async function getStaticData() {
  if (staticData) return staticData;
  try {
    const mod = await import('../data/onet-data.json');
    staticData = mod.default;
  } catch {
    staticData = { careers: {} };
  }
  return staticData;
}

/**
 * Get O*NET data for a SOC code (skills, knowledge, education).
 * @param {string} socCode — e.g. '15-1252'
 * @returns {Promise<{ skills: Array, knowledge: Array, education: object } | null>}
 */
export async function getOnetData(socCode) {
  if (cache[socCode]) return cache[socCode];

  const data = await getStaticData();
  const entry = data.careers?.[socCode];
  if (entry?.skills?.length > 0) {
    cache[socCode] = entry;
    return entry;
  }

  cache[socCode] = null;
  return null;
}

/**
 * Get top N skills for a SOC code.
 * @param {string} socCode
 * @param {number} topN
 * @returns {Promise<Array<{ name: string, score: number }>>}
 */
export async function getTopSkills(socCode, topN = 5) {
  const data = await getOnetData(socCode);
  return data?.skills?.slice(0, topN) ?? [];
}

/**
 * Get top N knowledge areas for a SOC code.
 * @param {string} socCode
 * @param {number} topN
 * @returns {Promise<Array<{ name: string, score: number }>>}
 */
export async function getTopKnowledge(socCode, topN = 8) {
  const data = await getOnetData(socCode);
  return data?.knowledge?.slice(0, topN) ?? [];
}
