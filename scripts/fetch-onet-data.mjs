/**
 * Fetch O*NET skills, knowledge, and education data for all 25 mapped careers.
 * Run from project root: node scripts/fetch-onet-data.mjs
 *
 * Output: src/data/onet-data.json
 * O*NET API: https://services.onetcenter.org/ws/
 * Auth: X-API-Key header (register free at https://services.onetcenter.org/developers/)
 *
 * Env: ONET_API_KEY (required)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data');
const OUT_FILE = join(OUT_DIR, 'onet-data.json');

const BASE_URL = 'https://services.onetcenter.org/ws';
const API_KEY = process.env.ONET_API_KEY || '';

if (!API_KEY) {
  console.error('Error: ONET_API_KEY environment variable is required.');
  console.error('Register free at https://services.onetcenter.org/developers/');
  process.exit(1);
}

const SOC_CODES = [
  '15-1252', '15-1211', '15-1212', '15-2051',  // Computer & IT
  '29-1141', '29-1071', '29-1021', '29-1051',  // Healthcare
  '13-2011', '13-2051', '11-2021', '11-3031',  // Business & Finance
  '17-2051', '17-2071', '17-2141',              // Engineering
  '25-2021', '25-2031',                          // Education
  '49-9021', '47-2111', '29-2061', '15-1231',  // Trades
  '23-1011', '23-2011',                          // Legal
  '27-1024', '27-3023',                          // Creative & Media
];

/** Sections to fetch per occupation */
const SECTIONS = ['knowledge', 'skills', 'education'];

async function fetchSection(soc, section) {
  const onetSoc = `${soc}.00`;
  const url = `${BASE_URL}/online/occupations/${onetSoc}/summary/${section}`;
  const res = await fetch(url, {
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited — wait and retry once
      console.warn(`    Rate limited on ${section}, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      return fetchSection(soc, section);
    }
    console.warn(`    ${section}: HTTP ${res.status}`);
    return null;
  }

  return res.json();
}

/**
 * Normalize raw O*NET response into a compact, app-friendly shape.
 */
function normalizeKnowledge(raw) {
  if (!raw?.element) return [];
  return raw.element
    .map((el) => ({
      name: el.name,
      id: el.id,
      score: el.score?.value ?? null,
    }))
    .filter((el) => el.score != null)
    .sort((a, b) => b.score - a.score);
}

function normalizeSkills(raw) {
  if (!raw?.element) return [];
  return raw.element
    .map((el) => ({
      name: el.name,
      id: el.id,
      score: el.score?.value ?? null,
    }))
    .filter((el) => el.score != null)
    .sort((a, b) => b.score - a.score);
}

function normalizeEducation(raw) {
  // Education section may contain education_usually_needed, experience, training
  const result = {};

  if (raw?.education_usually_needed) {
    result.education = raw.education_usually_needed.category?.map((c) => ({
      name: c.name,
      percentage: c.percentage ?? null,
    })) ?? [];
  }

  if (raw?.on_the_job_training) {
    result.training = raw.on_the_job_training.category?.map((c) => ({
      name: c.name,
      percentage: c.percentage ?? null,
    })) ?? [];
  }

  if (raw?.related_experience) {
    result.experience = raw.related_experience.category?.map((c) => ({
      name: c.name,
      percentage: c.percentage ?? null,
    })) ?? [];
  }

  return result;
}

async function main() {
  console.log(`Fetching O*NET data for ${SOC_CODES.length} careers...`);
  console.log(`Sections: ${SECTIONS.join(', ')}\n`);

  const data = {};

  for (const soc of SOC_CODES) {
    console.log(`  ${soc}...`);
    const entry = {};

    for (const section of SECTIONS) {
      const raw = await fetchSection(soc, section);

      if (section === 'knowledge') entry.knowledge = normalizeKnowledge(raw);
      else if (section === 'skills') entry.skills = normalizeSkills(raw);
      else if (section === 'education') entry.education = normalizeEducation(raw);

      // 200ms delay between requests
      await new Promise((r) => setTimeout(r, 200));
    }

    data[soc] = entry;
  }

  // Summary
  const count = Object.keys(data).length;
  const withSkills = Object.values(data).filter((d) => d.skills?.length > 0).length;
  const withKnowledge = Object.values(data).filter((d) => d.knowledge?.length > 0).length;
  console.log(`\nFetched: ${count} careers, ${withSkills} with skills, ${withKnowledge} with knowledge`);

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });
  const output = {
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: 'O*NET Web Services (services.onetcenter.org)',
      sections: SECTIONS,
    },
    careers: data,
  };
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Written to: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
