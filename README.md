# Career Compass — 職涯羅盤

![data updated](https://img.shields.io/endpoint?url=https://poleaxe0224.github.io/14to17/data-freshness.json)

A bilingual (English / Traditional Chinese) career exploration tool for teens (14-17). Progressive disclosure from **Discover → Plan → Evaluate → Decide**, culminating in a three-layer ROI analysis powered by real US federal data.

**Live**: [poleaxe0224.github.io/14to17](https://poleaxe0224.github.io/14to17/)

> For development details, architecture decisions, and contribution guidelines, see [CLAUDE.md](./CLAUDE.md).

## Features

- **327 careers across 21 occupation categories** (tech, healthcare, business, engineering, education, trades, legal, creative, community, science, protective, transportation, management, media, food service, maintenance, personal service, sales, office, agriculture, production)
- **4 interest groups** — build / help / analyze / create — drive home-page exploration and the onboarding quiz; each career is multi-tagged
- **4-Level Progressive Disclosure** — Discover → Plan → Evaluate → Decide, lazy-loaded per level
- **Onboarding Quiz** — 4-question interest routing for first-time visitors
- **Three-Layer ROI Model** — basic → risk-adjusted (dropout probability) → competition-adjusted (market saturation)
- **ROI Calculator** — 9-field inputs, NPV / IRR / breakeven chart with cost vs. earnings crossover
- **Career Comparison** — side-by-side 2-3 careers, mobile scroll-snap cards, best-value markers
- **Exploration Report** — localStorage tracker, export as Markdown / PDF / JSON, shareable base64 link
- **O*NET Integration** — skills bars, knowledge tags, education requirements, certifications
- **Bilingual** — full English ↔ Traditional Chinese with instant toggle and glossary tooltips
- **Dark Mode** — toggle + auto-detect + localStorage persistence
- **PWA Offline** — service worker pre-caches 340+ assets, works without network

## Data Sources

| Source | Data | Limit |
|--------|------|-------|
| [BLS OES API v2](https://www.bls.gov/developers/) | Wage percentiles by SOC code | 500 req/day |
| [BLS CPS](https://www.bls.gov/cps/) | Weekly earnings by education level (dropout model) | 500 req/day |
| [College Scorecard API](https://collegescorecard.ed.gov/data/) | Tuition, net price, earnings by CIP code | 1000 req/hr |
| [NCES IPEDS](https://nces.ed.gov/ipeds/) | Graduation rates, retention rates, completions | Static |
| [O*NET Database 30.2](https://www.onetcenter.org/database.html) | Skills, knowledge, education requirements | Static (CC BY 4.0) |

## Tech Stack

Vanilla JS (ES modules), Vite 6, Pico CSS 2, Chart.js 4 (CDN lazy-load), html2pdf.js (CDN lazy-load), self-built i18n, PWA manifest + service worker.

## Development

```bash
npm install
npm run dev           # Start dev server
npm test              # Run unit tests (vitest)
npm run build         # Production build -> dist/
npm run preview       # Preview production build
npm run refresh-data  # Re-fetch all 5 data sources (needs API keys)
```

## API Keys

Development uses `DEMO_KEY` by default. For production, create a `.env` file:

```
VITE_BLS_API_KEY=your_key_here
VITE_SCORECARD_API_KEY=your_key_here
```

- BLS key: https://data.bls.gov/registrationEngine/
- Scorecard key: https://api.data.gov/signup/

## Deploy

Push to `main` branch triggers GitHub Actions → GitHub Pages deployment.

## License

MIT
