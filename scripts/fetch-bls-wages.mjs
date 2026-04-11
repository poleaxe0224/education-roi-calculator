/**
 * Fetch BLS OES wage data for all mapped careers.
 * Dynamically reads SOC codes from occupation-profiles.json.
 * Run from project root: node scripts/fetch-bls-wages.mjs
 *
 * Output: src/data/wages.json
 * BLS API: https://api.bls.gov/publicAPI/v2/timeseries/data/
 */

import { writeFileSync, readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data');
const OUT_FILE = join(OUT_DIR, 'wages.json');
const FALLBACK_FILE = join(__dirname, 'fallback', 'wages.json');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const API_KEY = process.env.BLS_API_KEY || '';

// Dynamically load SOC codes from occupation-profiles.json
const profilesPath = join(OUT_DIR, 'occupation-profiles.json');
const profiles = JSON.parse(readFileSync(profilesPath, 'utf-8'));
const CAREERS = Object.keys(profiles.profiles);

const DATA_TYPES = {
  annual10:     '11',
  annual25:     '12',
  annualMedian: '13',
  annual75:     '14',
  annual90:     '15',
  annualMean:   '04',
  employment:   '01',
};

function buildSeriesId(soc, typeCode) {
  return `OEUN0000000000000${soc.replace('-', '')}${typeCode}`;
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
      return res;
    } catch (err) {
      console.warn(`  Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}

async function fetchBatch(seriesIds, year) {
  const payload = {
    seriesid: seriesIds,
    startyear: String(year),
    endyear: String(year),
  };
  if (API_KEY) payload.registrationkey = API_KEY;

  const res = await fetchWithRetry(BLS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS: ${json.message?.join('; ')}`);
  }
  return json.Results.series;
}

async function main() {
  const year = new Date().getFullYear() - 2; // OES data has ~2yr lag
  console.log(`Fetching BLS OES data for ${CAREERS.length} careers, year ${year}...`);

  const wages = {};
  const fields = Object.keys(DATA_TYPES);

  // BLS allows max 50 series per request (free tier: 25)
  // 25 careers × 7 fields = 175 series → need multiple batches
  const BATCH_SIZE = API_KEY ? 50 : 25;

  // Build all series IDs with metadata
  const allSeries = [];
  for (const soc of CAREERS) {
    for (const [field, code] of Object.entries(DATA_TYPES)) {
      allSeries.push({ soc, field, seriesId: buildSeriesId(soc, code) });
    }
  }

  // Batch fetch
  for (let i = 0; i < allSeries.length; i += BATCH_SIZE) {
    const batch = allSeries.slice(i, i + BATCH_SIZE);
    const ids = batch.map((s) => s.seriesId);

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${ids.length} series...`);

    try {
      const results = await fetchBatch(ids, year);

      // Map results by series ID (don't rely on positional order)
      const idToMeta = new Map(batch.map((b) => [b.seriesId, b]));
      for (const series of results) {
        const sid = series.seriesID;
        const meta = idToMeta.get(sid);
        if (!meta) continue;

        const { soc, field } = meta;
        const latest = series.data?.[0];
        if (!wages[soc]) wages[soc] = { year };
        if (latest) {
          const val = parseFloat(latest.value);
          if (!Number.isNaN(val)) wages[soc][field] = val;
        }
      }
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
    }

    // Rate limit: wait 1s between batches (free tier: 10 req/sec)
    if (i + BATCH_SIZE < allSeries.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Add tot_emp alias (BLS TOT_EMP) from employment field
  // Handles BLS "**" confidentiality marker → null
  for (const soc of Object.keys(wages)) {
    const emp = wages[soc].employment;
    wages[soc].tot_emp = (emp != null && !Number.isNaN(emp)) ? emp : null;
  }

  // Summary
  const count = Object.keys(wages).length;
  const complete = Object.values(wages).filter((w) => w.annualMedian != null).length;
  const withEmp = Object.values(wages).filter((w) => w.tot_emp != null).length;
  console.log(`\nFetched: ${count} careers, ${complete} with median salary, ${withEmp} with employment data`);

  // Guard: abort if BLS returned no usable data (API outage)
  if (complete === 0) {
    throw new Error(`BLS API returned no wage data — API may be down. Aborting build.`);
  }

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });
  const output = {
    _meta: {
      fetchedAt: new Date().toISOString(),
      year,
      source: 'BLS OES National, All Industries',
    },
    careers: wages,
  };
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Written to: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`BLS OES fetch failed: ${err.message}`);
  if (existsSync(FALLBACK_FILE)) {
    console.warn('Using static fallback: scripts/fallback/wages.json');
    mkdirSync(OUT_DIR, { recursive: true });
    copyFileSync(FALLBACK_FILE, OUT_FILE);
    console.log(`Fallback copied to: ${OUT_FILE}`);
  } else {
    console.error('No fallback available. Aborting.');
    process.exit(1);
  }
});
