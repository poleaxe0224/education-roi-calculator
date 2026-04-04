/**
 * O*NET data service — skills, knowledge, and education requirements.
 *
 * Primary: static JSON (src/data/onet-data.json, CI-generated, gitignored)
 * Fallback: live API (requires VITE_ONET_API_KEY, may fail due to CORS)
 *
 * Data shape per SOC:
 *   skills: [{ name, id, score }]      — sorted by score desc
 *   knowledge: [{ name, id, score }]   — sorted by score desc
 *   education: { education: [{ name, percentage }], training: [...], experience: [...] }
 */

const API_BASE = 'https://services.onetcenter.org/ws';
const API_KEY = import.meta.env?.VITE_ONET_API_KEY || '';

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
 * Fetch a section from the live O*NET API (dev fallback).
 * Will fail in production due to CORS — that's expected.
 */
async function fetchLiveSection(soc, section) {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${API_BASE}/online/occupations/${soc}.00/summary/${section}`, {
      headers: {
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function normalizeList(raw) {
  if (!raw?.element) return [];
  return raw.element
    .map((el) => ({ name: el.name, id: el.id, score: el.score?.value ?? null }))
    .filter((el) => el.score != null)
    .sort((a, b) => b.score - a.score);
}

function normalizeEducation(raw) {
  const result = {};
  if (raw?.education_usually_needed) {
    result.education = raw.education_usually_needed.category?.map((c) => ({
      name: c.name, percentage: c.percentage ?? null,
    })) ?? [];
  }
  if (raw?.on_the_job_training) {
    result.training = raw.on_the_job_training.category?.map((c) => ({
      name: c.name, percentage: c.percentage ?? null,
    })) ?? [];
  }
  if (raw?.related_experience) {
    result.experience = raw.related_experience.category?.map((c) => ({
      name: c.name, percentage: c.percentage ?? null,
    })) ?? [];
  }
  return result;
}

/**
 * Get O*NET data for a SOC code (skills, knowledge, education).
 * @param {string} socCode — e.g. '15-1252'
 * @returns {Promise<{ skills: Array, knowledge: Array, education: object } | null>}
 */
export async function getOnetData(socCode) {
  if (cache[socCode]) return cache[socCode];

  // Try static data first
  const data = await getStaticData();
  const entry = data.careers?.[socCode];
  if (entry?.skills?.length > 0) {
    cache[socCode] = entry;
    return entry;
  }

  // Fallback: live API (dev mode only, will fail with CORS in production)
  const [skillsRaw, knowledgeRaw, educationRaw] = await Promise.all([
    fetchLiveSection(socCode, 'skills'),
    fetchLiveSection(socCode, 'knowledge'),
    fetchLiveSection(socCode, 'education'),
  ]);

  if (!skillsRaw && !knowledgeRaw && !educationRaw) {
    cache[socCode] = null;
    return null;
  }

  const result = {
    skills: normalizeList(skillsRaw),
    knowledge: normalizeList(knowledgeRaw),
    education: normalizeEducation(educationRaw),
  };

  cache[socCode] = result;
  return result;
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
