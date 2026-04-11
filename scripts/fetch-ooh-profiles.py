"""
Batch-fetch BLS OOH pages to extract SOC codes and profile data.
Maps each OOH page to its SOC code(s), employment projections, and profile text.
"""

import json
import re
import time
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from curl_cffi import requests
except ImportError:
    print("ERROR: curl_cffi required. Install with: pip install curl_cffi")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "src" / "data"

# Rate limiting
REQUEST_DELAY = 0.3  # seconds between requests
MAX_WORKERS = 3      # concurrent requests


def load_existing():
    """Load existing occupation profiles."""
    with open(DATA_DIR / "occupation-profiles.json", "r", encoding="utf-8") as f:
        return json.load(f)


def load_projections():
    """Load BLS Employment Projections data."""
    with open(SCRIPT_DIR / "bls_all_occupations.json", "r", encoding="utf-8") as f:
        return json.load(f)


def load_missing_pages():
    """Load list of missing OOH pages."""
    with open(SCRIPT_DIR / "ooh_missing_pages.json", "r", encoding="utf-8") as f:
        return json.load(f)


def extract_soc_from_page(html):
    """Extract SOC code(s) from an OOH page HTML."""
    soc_codes = []

    # Pattern 1: "SOC code" section or text
    # Common pattern: "15-1252" in various contexts
    patterns = [
        # Quick Facts table often has SOC code
        r'SOC\s*[Cc]ode[:\s]*(\d{2}-\d{4})',
        # Sometimes in the URL of state wage data link
        r'/oes/current/oes(\d{6})\.htm',
        # In data attribute or hidden field
        r'data-soc["\s=:]+["\']?(\d{2}-\d{4})',
        # In the similar occupations link
        r'onet\.org/link/summary/(\d{2}-\d{4})',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html)
        for m in matches:
            if len(m) == 6:  # OES format without dash
                soc = f"{m[:2]}-{m[2:]}"
            else:
                soc = m
            if soc not in soc_codes:
                soc_codes.append(soc)

    return soc_codes


def extract_quick_facts(html):
    """Extract Quick Facts data from OOH page."""
    facts = {}

    # Median pay
    pay_match = re.search(r'Median Pay.*?\$([\d,]+)', html, re.DOTALL)
    if pay_match:
        facts['median_pay'] = pay_match.group(1).replace(',', '')

    # Entry-level education
    edu_match = re.search(r'Entry-Level Education.*?<td[^>]*>(.*?)</td>', html, re.DOTALL | re.IGNORECASE)
    if edu_match:
        facts['education'] = re.sub(r'<[^>]+>', '', edu_match.group(1)).strip()

    # Number of jobs
    jobs_match = re.search(r'Number of Jobs.*?([\d,]+)', html, re.DOTALL)
    if jobs_match:
        facts['num_jobs'] = jobs_match.group(1).replace(',', '')

    # Job outlook / growth
    outlook_match = re.search(r'Job Outlook.*?(\-?\d+)%', html, re.DOTALL)
    if outlook_match:
        facts['growth_pct'] = int(outlook_match.group(1))

    return facts


def extract_profile_text(html):
    """Extract profile text sections from OOH page."""
    profile = {
        'what_they_do': '',
        'work_environment': '',
        'how_to_become': {
            'education': '',
            'experience': '',
            'training': ''
        }
    }

    # What They Do - first paragraph after the heading
    wtd_match = re.search(
        r'What\s+\w+\s+Do.*?<p[^>]*>(.*?)</p>',
        html, re.DOTALL | re.IGNORECASE
    )
    if wtd_match:
        text = re.sub(r'<[^>]+>', '', wtd_match.group(1)).strip()
        profile['what_they_do'] = text[:500]  # Cap at 500 chars

    # Work Environment
    we_match = re.search(
        r'Work Environment.*?<p[^>]*>(.*?)</p>',
        html, re.DOTALL | re.IGNORECASE
    )
    if we_match:
        text = re.sub(r'<[^>]+>', '', we_match.group(1)).strip()
        profile['work_environment'] = text[:500]

    # How to Become One - education
    htb_match = re.search(
        r'How to Become.*?(?:Education|Training).*?<p[^>]*>(.*?)</p>',
        html, re.DOTALL | re.IGNORECASE
    )
    if htb_match:
        text = re.sub(r'<[^>]+>', '', htb_match.group(1)).strip()
        profile['how_to_become']['education'] = text[:500]

    return profile


def fetch_ooh_page(session, page_info):
    """Fetch a single OOH page and extract data."""
    url = page_info['url']
    try:
        resp = session.get(url, timeout=15)
        if resp.status_code == 200:
            html = resp.text
            soc_codes = extract_soc_from_page(html)
            quick_facts = extract_quick_facts(html)
            profile_text = extract_profile_text(html)

            return {
                'category': page_info['category'],
                'slug': page_info['slug'],
                'url': url,
                'soc_codes': soc_codes,
                'quick_facts': quick_facts,
                'profile_text': profile_text,
                'status': 'ok'
            }
        else:
            return {
                'category': page_info['category'],
                'slug': page_info['slug'],
                'url': url,
                'soc_codes': [],
                'quick_facts': {},
                'profile_text': {},
                'status': f'http_{resp.status_code}'
            }
    except Exception as e:
        return {
            'category': page_info['category'],
            'slug': page_info['slug'],
            'url': url,
            'soc_codes': [],
            'quick_facts': {},
            'profile_text': {},
            'status': f'error: {str(e)}'
        }


def main():
    missing_pages = load_missing_pages()
    projections = load_projections()

    # Build title→SOC lookup from projections
    title_to_proj = {}
    soc_to_proj = {}
    for p in projections:
        title_to_proj[p['title'].lower()] = p
        soc_to_proj[p['soc']] = p

    print(f"Fetching {len(missing_pages)} OOH pages...")

    session = requests.Session(impersonate="chrome")
    results = []

    for i, page in enumerate(missing_pages):
        result = fetch_ooh_page(session, page)
        results.append(result)

        soc_str = ', '.join(result['soc_codes']) if result['soc_codes'] else '???'
        status = result['status']
        print(f"  [{i+1}/{len(missing_pages)}] {page['slug']}: SOC={soc_str} ({status})")

        time.sleep(REQUEST_DELAY)

    # Post-process: match unresolved SOCs using projections title matching
    resolved = 0
    unresolved = 0
    for r in results:
        if not r['soc_codes']:
            # Try fuzzy matching by slug
            slug_words = r['slug'].replace('-', ' ')
            for title, proj in title_to_proj.items():
                if slug_words in title or title in slug_words:
                    r['soc_codes'] = [proj['soc']]
                    r['matched_by'] = 'title_fuzzy'
                    break

        if r['soc_codes']:
            resolved += 1
            # Enrich with projections data
            primary_soc = r['soc_codes'][0]
            if primary_soc in soc_to_proj:
                r['projections'] = soc_to_proj[primary_soc]
        else:
            unresolved += 1

    print(f"\nResults: {resolved} resolved, {unresolved} unresolved")

    # Save results
    output_path = SCRIPT_DIR / "ooh_scraped_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Saved to {output_path}")

    # Report unresolved
    if unresolved > 0:
        print("\nUnresolved pages:")
        for r in results:
            if not r['soc_codes']:
                print(f"  {r['slug']} ({r['category']})")


if __name__ == "__main__":
    main()
