/**
 * Fetch College Scorecard tuition data for all 50 mapped CIP codes.
 * Run from project root: node scripts/fetch-scorecard-tuition.mjs
 *
 * Output: src/data/tuition.json
 * Scorecard API: https://api.data.gov/ed/collegescorecard/v1/schools.json
 */

import { writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data');
const OUT_FILE = join(OUT_DIR, 'tuition.json');
const FALLBACK_FILE = join(__dirname, 'fallback', 'tuition.json');

const BASE_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools.json';
const API_KEY = process.env.SCORECARD_API_KEY || 'DEMO_KEY';

/**
 * CIP proxy mapping: when Scorecard returns 0 schools for a CIP,
 * use the proxy CIP's tuition data instead (same department/school pool).
 * Key = original CIP, value = { cip, title } of the proxy source.
 */
const CIP_PROXIES = {
  '0902': { cip: '0904', title: 'Journalism (CIP 09.04)' },
};

/**
 * Dynamically build CIP_CAREERS from cip-soc-crosswalk.json.
 * Deduplicate by CIP code (multiple SOCs may share one CIP).
 */
const crosswalkPath = join(OUT_DIR, 'cip-soc-crosswalk.json');
const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf-8'));
const cipSet = new Set();
const CIP_CAREERS = [];
for (const entry of crosswalk.mappings) {
  const cip = entry.cip_code;
  if (!cipSet.has(cip)) {
    cipSet.add(cip);
    CIP_CAREERS.push({ cip, career: entry.cip_title });
  }
}
// Also add undergrad CIPs used as prerequisites
const UNDERGRAD_CIPS = ['2601', '4002', '4501', '2701', '1107', '4201', '5138', '5101'];
for (const cip of UNDERGRAD_CIPS) {
  if (!cipSet.has(cip)) {
    cipSet.add(cip);
    CIP_CAREERS.push({ cip, career: `Undergrad prerequisite (CIP ${cip})` });
  }
}

const FIELDS = [
  'id',
  'school.name',
  'school.ownership',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.cost.avg_net_price.overall',
];

const SAMPLE_SIZE = 100;

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function fetchTuitionForCip(cipCode) {
  // Fetch without sort bias — take a larger sample and compute median
  const params = new URLSearchParams({
    api_key: API_KEY,
    'latest.programs.cip_4_digit.code': cipCode,
    fields: FIELDS.join(','),
    per_page: String(SAMPLE_SIZE),
  });

  const url = `${BASE_URL}?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for CIP ${cipCode}`);
  }

  const json = await res.json();
  const schools = json.results || [];

  const inStateVals = [];
  const outOfStateVals = [];
  const netPriceVals = [];

  for (const s of schools) {
    const inState = s['latest.cost.tuition.in_state'];
    const outOfState = s['latest.cost.tuition.out_of_state'];
    const netPrice = s['latest.cost.avg_net_price.overall'];

    if (inState != null) inStateVals.push(inState);
    if (outOfState != null) outOfStateVals.push(outOfState);
    if (netPrice != null) netPriceVals.push(netPrice);
  }

  return {
    inState: median(inStateVals),
    outOfState: median(outOfStateVals),
    netPrice: median(netPriceVals),
    sampleCount: schools.length,
  };
}

async function main() {
  // Load existing data for incremental fetching
  let existing = {};
  try {
    const { readFileSync } = await import('fs');
    const prev = JSON.parse(readFileSync(OUT_FILE, 'utf-8'));
    existing = prev.programs || {};
    console.log(`Loaded ${Object.keys(existing).length} existing CIP entries`);
  } catch { /* first run, no file */ }

  // Force re-fetch all (ignore cache) when --force flag is passed
  const forceRefetch = process.argv.includes('--force');
  if (forceRefetch) {
    existing = {};
    console.log('Force re-fetch: ignoring cached data');
  }
  const toFetch = CIP_CAREERS.filter((c) => !existing[c.cip]);
  console.log(`Fetching Scorecard tuition for ${toFetch.length} CIP codes (${CIP_CAREERS.length - toFetch.length} cached)...`);

  const tuition = { ...existing };

  for (let i = 0; i < toFetch.length; i++) {
    const { cip, career } = toFetch[i];
    process.stdout.write(`  [${i + 1}/${toFetch.length}] CIP ${cip} (${career})...`);

    try {
      tuition[cip] = await fetchTuitionForCip(cip);
      console.log(` ${tuition[cip].sampleCount} schools, net $${tuition[cip].netPrice}`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }

    // DEMO_KEY: ~1 req/sec limit, use 4s to be safe
    if (i < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // Apply proxy data for CIP codes with no Scorecard results
  for (const [origCip, proxy] of Object.entries(CIP_PROXIES)) {
    const orig = tuition[origCip];
    const source = tuition[proxy.cip];
    if (orig && orig.sampleCount === 0 && source && source.netPrice != null) {
      tuition[origCip] = {
        ...source,
        proxyCip: proxy.cip,
        proxyTitle: proxy.title,
      };
      console.log(`  Proxy: CIP ${origCip} ← CIP ${proxy.cip} (${proxy.title})`);
    }
  }

  // Summary
  const count = Object.keys(tuition).length;
  const withNet = Object.values(tuition).filter((t) => t.netPrice != null).length;
  console.log(`\nFetched: ${count} CIP codes, ${withNet} with net price data`);

  // Guard: if API returned no usable data, use fallback
  if (withNet === 0) {
    throw new Error('Scorecard API returned no tuition data — API may be rate-limited or down.');
  }

  // Write output
  mkdirSync(OUT_DIR, { recursive: true });
  const output = {
    _meta: {
      fetchedAt: new Date().toISOString(),
      source: 'College Scorecard API (api.data.gov)',
      sampleSize: SAMPLE_SIZE,
    },
    programs: tuition,
  };
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Written to: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`Scorecard fetch failed: ${err.message}`);
  if (existsSync(FALLBACK_FILE)) {
    console.warn('Using static fallback: scripts/fallback/tuition.json');
    mkdirSync(OUT_DIR, { recursive: true });
    copyFileSync(FALLBACK_FILE, OUT_FILE);
    console.log(`Fallback copied to: ${OUT_FILE}`);
  } else {
    console.error('No fallback available. Aborting.');
    process.exit(1);
  }
});
