"""
Generate all data files for the 282 new OOH occupations.
Phase 1: Re-fetch OOH pages with improved text extraction.
Phase 2: Build occupation-profiles.json, profile-text-en.json, profile-text-zh-TW.json entries.
"""

import json
import re
import time
import sys
import html as html_module
from pathlib import Path

try:
    from curl_cffi import requests
except ImportError:
    print("ERROR: curl_cffi required")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "src" / "data"
REQUEST_DELAY = 0.35


def clean_html(text):
    """Remove HTML tags and decode entities."""
    text = re.sub(r'<[^>]+>', '', text)
    text = html_module.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_tab_text(html_content, tab_id):
    """Extract first substantial paragraph from a tab section."""
    pattern = rf'id="{tab_id}"[^>]*>(.*?)(?=id="tab-\d"|<footer|$)'
    match = re.search(pattern, html_content, re.DOTALL)
    if not match:
        return ''

    tab_content = match.group(1)
    paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', tab_content, re.DOTALL)

    for p in paragraphs:
        clean = clean_html(p)
        if clean and 'javascript' not in clean.lower() and len(clean) > 30:
            return clean[:500]

    return ''


def extract_profile_from_html(html_content):
    """Extract profile text from OOH page HTML using tab structure."""
    profile = {
        'what_they_do': '',
        'work_environment': '',
        'how_to_become': {
            'education': '',
            'experience': '',
            'training': ''
        }
    }

    # Tab 1: What They Do (or Summary)
    wtd = extract_tab_text(html_content, 'tab-1')
    if not wtd:
        # Fallback: look for summary paragraph
        summary = re.search(r'class="[^"]*summary[^"]*"[^>]*>.*?<p[^>]*>(.*?)</p>',
                            html_content, re.DOTALL)
        if summary:
            wtd = clean_html(summary.group(1))[:500]
    profile['what_they_do'] = wtd

    # Tab 3: Work Environment
    we = extract_tab_text(html_content, 'tab-3')
    profile['work_environment'] = we

    # Tab 4: How to Become One
    tab4 = re.search(r'id="tab-4"[^>]*>(.*?)(?=id="tab-\d"|<footer|$)',
                     html_content, re.DOTALL)
    if tab4:
        tab_content = tab4.group(1)
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', tab_content, re.DOTALL)
        edu_texts = []
        for p in paragraphs:
            clean = clean_html(p)
            if clean and len(clean) > 20:
                edu_texts.append(clean)
        if edu_texts:
            profile['how_to_become']['education'] = edu_texts[0][:500]
            if len(edu_texts) > 1:
                profile['how_to_become']['experience'] = edu_texts[1][:300]
            if len(edu_texts) > 2:
                profile['how_to_become']['training'] = edu_texts[2][:300]

    return profile


def extract_soc_codes(html_content, valid_socs):
    """Extract valid SOC codes from page."""
    all_socs = re.findall(r'(\d{2}-\d{4})', html_content)
    seen = set()
    result = []
    for soc in all_socs:
        if soc in valid_socs and soc not in seen:
            seen.add(soc)
            result.append(soc)
    return result


def get_growth_label(pct):
    """Convert growth percentage to BLS growth label."""
    if pct is None:
        return 'average'
    pct = float(pct)
    if pct < 0:
        return 'declining'
    elif pct < 2:
        return 'little_or_no_change'
    elif pct < 4:
        return 'slower'
    elif pct < 7:
        return 'average'
    elif pct < 10:
        return 'faster'
    else:
        return 'much_faster'


def edu_to_degree(edu_string):
    """Map BLS education string to our degree level."""
    edu = edu_string.lower() if edu_string else ''
    if 'doctoral' in edu or 'professional' in edu:
        return 'firstProfessional'
    elif "master" in edu:
        return 'masters'
    elif "bachelor" in edu:
        return 'bachelors'
    elif "associate" in edu:
        return 'associates'
    elif "postsecondary" in edu or 'nondegree' in edu:
        return 'certificate'
    elif 'some college' in edu:
        return 'certificate'
    else:
        return 'certificate'  # HS diploma, no formal education


def ooh_cat_to_app_category(ooh_cat):
    """Map OOH category to app category."""
    mapping = {
        'management': 'management',
        'business-and-financial': 'business',
        'computer-and-information-technology': 'tech',
        'architecture-and-engineering': 'engineering',
        'life-physical-and-social-science': 'science',
        'community-and-social-service': 'community',
        'legal': 'legal',
        'education-training-and-library': 'education',
        'arts-and-design': 'creative',
        'media-and-communication': 'media',
        'healthcare': 'healthcare',
        'protective-service': 'protective',
        'food-preparation-and-serving': 'food_service',
        'building-and-grounds-cleaning': 'maintenance',
        'personal-care-and-service': 'personal_service',
        'sales': 'sales',
        'office-and-administrative-support': 'office',
        'farming-fishing-and-forestry': 'agriculture',
        'construction-and-extraction': 'trades',
        'installation-maintenance-and-repair': 'trades',
        'production': 'production',
        'transportation-and-material-moving': 'transportation',
        'military': 'military',
    }
    return mapping.get(ooh_cat, 'other')


def category_to_interests(cat):
    """Map app category to interest tags."""
    mapping = {
        'management': ['analyze'],
        'business': ['analyze'],
        'tech': ['build', 'analyze'],
        'engineering': ['build'],
        'science': ['analyze'],
        'community': ['help'],
        'legal': ['analyze'],
        'education': ['help'],
        'creative': ['create'],
        'media': ['create'],
        'healthcare': ['help'],
        'protective': ['help'],
        'food_service': ['create'],
        'maintenance': ['build'],
        'personal_service': ['help'],
        'sales': ['create'],
        'office': ['analyze'],
        'agriculture': ['build'],
        'trades': ['build'],
        'production': ['build'],
        'transportation': ['build'],
        'military': ['help', 'build'],
    }
    return mapping.get(cat, ['build'])


def category_to_icon(cat, title=''):
    """Map category + title to an appropriate emoji icon."""
    title_lower = title.lower()

    # Specific title-based icons
    icon_map = {
        'actuar': '\U0001F4C9',     # chart decreasing
        'economist': '\U0001F4C8',   # chart
        'statistician': '\U0001F4CA',
        'meteorolog': '\U0001F326',  # weather
        'atmospher': '\U0001F326',
        'geolog': '\U0001F30B',      # volcano
        'geosci': '\U0001F30D',      # globe
        'hydrol': '\U0001F4A7',      # droplet
        'biolog': '\U0001F9EC',      # DNA
        'biochem': '\U0001F9EA',     # test tube
        'microbiol': '\U0001F52C',   # microscope
        'chemist': '\u2697\uFE0F',   # alembic
        'physicist': '\u269B\uFE0F', # atom
        'astrono': '\U0001F52D',     # telescope
        'zoolog': '\U0001F43E',      # paw
        'veterinar': '\U0001F43E',
        'nurse': '\U0001FA7A',       # stethoscope
        'dentist': '\U0001F9B7',     # tooth
        'dental': '\U0001F9B7',
        'pharma': '\U0001F48A',      # pill
        'therap': '\U0001F9E0',      # brain
        'surgeon': '\u2695\uFE0F',
        'doctor': '\u2695\uFE0F',
        'physician': '\u2695\uFE0F',
        'chiropract': '\U0001F9D1\u200D\u2695\uFE0F',
        'optom': '\U0001F441\uFE0F', # eye
        'audiolog': '\U0001F442',    # ear
        'dietit': '\U0001F957',      # salad
        'nutritio': '\U0001F957',
        'emt': '\U0001F691',         # ambulance
        'paramed': '\U0001F691',
        'radiol': '\u2622\uFE0F',    # radiation
        'nuclear': '\u2622\uFE0F',
        'genetic': '\U0001F9EC',
        'pilot': '\u2708\uFE0F',     # airplane
        'flight': '\u2708\uFE0F',
        'truck': '\U0001F69A',       # truck
        'driver': '\U0001F698',      # car
        'taxi': '\U0001F695',
        'bus': '\U0001F68C',         # bus
        'railroad': '\U0001F682',    # train
        'water transport': '\U0001F6A2',  # ship
        'air traffic': '\U0001F4E1', # satellite
        'firefight': '\U0001F692',   # fire engine
        'police': '\U0001F6A8',
        'correctio': '\U0001F510',   # lock
        'security': '\U0001F6E1\uFE0F',  # shield
        'detective': '\U0001F575\uFE0F',  # detective
        'cook': '\U0001F373',        # cooking
        'chef': '\U0001F373',
        'baker': '\U0001F35E',       # bread
        'bartend': '\U0001F378',     # cocktail
        'waiter': '\U0001F37D\uFE0F',
        'waitress': '\U0001F37D\uFE0F',
        'food': '\U0001F37D\uFE0F',
        'teacher': '\U0001F4DA',     # books
        'professor': '\U0001F393',   # graduation cap
        'librarian': '\U0001F4DA',
        'tutor': '\U0001F4DD',       # memo
        'counsel': '\U0001F91D',     # handshake
        'social work': '\U0001F91D',
        'architect': '\U0001F3DB\uFE0F',  # classical building
        'landscape': '\U0001F3E1',   # house
        'engineer': '\u2699\uFE0F',  # gear
        'survey': '\U0001F4CF',      # ruler
        'draft': '\U0001F4D0',       # triangle ruler
        'cartograph': '\U0001F5FA\uFE0F',  # map
        'welder': '\U0001F525',      # fire
        'electri': '\u26A1',         # lightning
        'plumb': '\U0001F527',       # wrench
        'carpent': '\U0001F528',     # hammer
        'mason': '\U0001F9F1',       # brick
        'roofer': '\U0001F3E0',      # house
        'painter': '\U0001F3A8',
        'solar': '\u2600\uFE0F',     # sun
        'wind turb': '\U0001F32C\uFE0F',  # wind
        'elevator': '\U0001F3E2',    # office building
        'hvac': '\u2744\uFE0F',      # snowflake
        'mechanic': '\U0001F527',
        'automo': '\U0001F697',      # car
        'diesel': '\U0001F69B',      # articulated lorry
        'aircraft': '\u2708\uFE0F',
        'photo': '\U0001F4F7',       # camera
        'film': '\U0001F3AC',        # clapper
        'editor': '\u270D\uFE0F',    # writing hand
        'writer': '\u270D\uFE0F',
        'author': '\u270D\uFE0F',
        'translat': '\U0001F310',    # globe
        'interpret': '\U0001F310',
        'announc': '\U0001F399\uFE0F',  # microphone
        'broadcast': '\U0001F4FA',   # TV
        'fashion': '\U0001F457',     # dress
        'interior': '\U0001F6CB\uFE0F',  # couch
        'industrial design': '\U0001F4D0',
        'art dir': '\U0001F3A8',
        'jewel': '\U0001F48E',       # gem
        'barber': '\u2702\uFE0F',    # scissors
        'hairstyl': '\u2702\uFE0F',
        'cosmeto': '\u2702\uFE0F',
        'skincare': '\U0001F9F4',    # lotion
        'manicur': '\U0001F485',     # nail polish
        'massage': '\U0001F486',     # person getting massage
        'childcar': '\U0001F476',    # baby
        'animal': '\U0001F436',      # dog
        'funeral': '\u2694\uFE0F',
        'recreation': '\U0001F3BE',  # tennis
        'gaming': '\U0001F3B0',      # slot machine
        'real estate': '\U0001F3E0',
        'insurance': '\U0001F4C3',   # page
        'cashier': '\U0001F4B5',     # dollar
        'retail': '\U0001F6D2',      # shopping cart
        'travel': '\U0001F30D',      # globe
        'tour': '\U0001F30D',
        'sales': '\U0001F4B5',
        'advertis': '\U0001F4E3',    # megaphone
        'reception': '\U0001F4DE',   # telephone
        'secretary': '\U0001F4DD',
        'postal': '\U0001F4EE',      # mailbox
        'teller': '\U0001F3E6',      # bank
        'bookkeep': '\U0001F4D6',    # book
        'dispatch': '\U0001F4DE',
        'customer service': '\U0001F4DE',
        'collect': '\U0001F4B3',     # credit card
        'farm': '\U0001F33E',        # rice
        'agricultur': '\U0001F33E',
        'forest': '\U0001F332',      # tree
        'logging': '\U0001FAB5',     # wood
        'fisher': '\U0001F3A3',      # fishing
        'pest control': '\U0001F41C',  # ant
        'janitor': '\U0001F9F9',     # broom
        'grounds': '\U0001F33F',     # herb
        'clean': '\U0001F9F9',
        'assembl': '\U0001F3ED',     # factory
        'machinist': '\u2699\uFE0F',
        'butcher': '\U0001F356',     # meat
        'semicon': '\U0001F4BB',     # laptop
        'power plant': '\u26A1',
        'water treat': '\U0001F4A7',
        'boiler': '\U0001F525',
        'woodwork': '\U0001FAB5',
        'inspect': '\U0001F50D',     # magnifying glass
        'model': '\U0001F4F8',       # camera flash
        'concierge': '\U0001F3E8',   # hotel
    }

    for keyword, icon in icon_map.items():
        if keyword in title_lower:
            return icon

    # Category fallback
    cat_icons = {
        'management': '\U0001F4BC',     # briefcase
        'business': '\U0001F4BC',
        'tech': '\U0001F4BB',           # laptop
        'engineering': '\u2699\uFE0F',  # gear
        'science': '\U0001F52C',        # microscope
        'community': '\U0001F91D',      # handshake
        'legal': '\u2696\uFE0F',        # scales
        'education': '\U0001F4DA',      # books
        'creative': '\U0001F3A8',       # artist palette
        'media': '\U0001F4F0',          # newspaper
        'healthcare': '\U0001FA7A',     # stethoscope
        'protective': '\U0001F6E1\uFE0F',
        'food_service': '\U0001F37D\uFE0F',
        'maintenance': '\U0001F9F9',
        'personal_service': '\U0001F485',
        'sales': '\U0001F4B5',
        'office': '\U0001F4DD',
        'agriculture': '\U0001F33E',
        'trades': '\U0001F527',
        'production': '\U0001F3ED',
        'transportation': '\U0001F69A',
        'military': '\U0001F396\uFE0F',
    }
    return cat_icons.get(cat, '\U0001F4BC')


# CIP code mapping for common occupations (SOC → CIP)
# Based on NCES CIP-SOC Crosswalk 2020
CIP_SOC_MAP = {
    # Management
    '11-1011': '5202', '11-1021': '5202', '11-2022': '5218',
    '11-2032': '5214', '11-2033': '5214',
    '11-3012': '5202', '11-3013': '5210', '11-3021': '1101',
    '11-3051': '1519', '11-3061': '5214', '11-3071': '5209',
    '11-3111': '5202', '11-3131': '5216',
    '11-9013': '0104', '11-9021': '5220', '11-9031': '1901',
    '11-9032': '1305', '11-9033': '1304', '11-9041': '1401',
    '11-9051': '3105', '11-9071': '5210', '11-9111': '5107',
    '11-9141': '5210', '11-9151': '2109', '11-9161': '1103',
    '11-9171': '1203', '11-9199': '5202',
    # Business & Financial
    '13-1031': '5202', '13-1032': '5202', '13-1041': '5208',
    '13-1051': '5202', '13-1071': '5202', '13-1081': '5201',
    '13-1082': '5210', '13-1111': '5210', '13-1121': '5210',
    '13-1131': '5209', '13-1141': '5202', '13-1151': '5216',
    '13-1161': '5208', '13-2020': '5210', '13-2041': '5218',
    '13-2081': '5203', '13-2082': '5208',
    # Computer & IT
    '15-1221': '1101', '15-1241': '1103', '15-1244': '1103',
    '15-1232': '1101', '15-1243': '1103', '15-1245': '1103',
    '15-1253': '1107', '15-1254': '1103', '15-1255': '1103',
    '15-1256': '1103', '15-1299': '1101',
    # Engineering & Architecture
    '17-1012': '0401', '17-2011': '1402', '17-2021': '1407',
    '17-2031': '1405', '17-2041': '1411', '17-2061': '1403',
    '17-2081': '1418', '17-2111': '1435', '17-2112': '1419',
    '17-2121': '1420', '17-2131': '1421', '17-2151': '1422',
    '17-2161': '1423', '17-2171': '1424', '17-2199': '1401',
    '17-3011': '1519', '17-3021': '1402', '17-3022': '1409',
    '17-3023': '1410', '17-3024': '1410', '17-3025': '1403',
    '17-3026': '1435', '17-3027': '1419', '17-3031': '1502',
    # Science
    '19-1011': '0106', '19-1012': '0106', '19-1013': '0106',
    '19-1021': '2607', '19-1022': '2606', '19-1029': '2601',
    '19-1031': '0301', '19-1032': '0301', '19-1041': '2605',
    '19-1042': '1903', '19-2011': '2701', '19-2012': '4002',
    '19-2021': '4004', '19-2031': '4003', '19-2032': '4001',
    '19-2041': '0301', '19-2042': '4006', '19-2043': '4005',
    '19-3011': '4202', '19-3022': '4501', '19-3031': '4201',
    '19-3032': '4201', '19-3033': '4501', '19-3034': '4501',
    '19-3041': '4504', '19-3051': '1903', '19-3091': '4201',
    '19-3094': '4501', '19-4013': '4301', '19-4021': '2601',
    '19-4031': '4002', '19-4043': '4006', '19-4044': '4006',
    '19-4061': '2601', '19-4071': '4006', '19-4092': '4301',
    '19-4099': '2601',
    # Community & Social Service
    '21-1011': '5115', '21-1012': '1310', '21-1013': '5115',
    '21-1014': '5115', '21-1015': '5115', '21-1019': '5115',
    '21-1091': '5107', '21-1092': '5115', '21-1093': '5107',
    '21-1094': '5107',
    # Legal
    '23-1012': '2201', '23-1021': '2201', '23-1022': '2201',
    '23-1023': '2201', '23-2093': '2203',
    # Education
    '25-1194': '1315', '25-2023': '1315', '25-2032': '1315',
    '25-2011': '1312', '25-2012': '1312',
    '25-2022': '1313', '25-2059': '1310', '25-3011': '1310',
    '25-4022': '2501', '25-4031': '2501', '25-9045': '1310',
    '25-1011': '1301', '25-3031': '1310',
    # Arts & Design
    '27-1011': '5010', '27-1012': '5003', '27-1013': '5007',
    '27-1019': '5010', '27-1021': '1930', '27-1022': '5010',
    '27-1025': '5010', '27-1026': '5010', '27-1027': '5010',
    # Media & Communication
    '27-2011': '5005', '27-2012': '5005', '27-2022': '5010',
    '27-3011': '0907', '27-3041': '2301', '27-3042': '0910',
    '27-3043': '0910', '27-3091': '1613', '27-4011': '0907',
    '27-4012': '5010', '27-4013': '5010', '27-4014': '5010',
    '27-4021': '5010', '27-4032': '5010',
    # Healthcare
    '29-1011': '5103', '29-1031': '5106', '29-1041': '5111',
    '29-1051': '5120', '29-1071': '5109', '29-1081': '5111',
    '29-1122': '5123', '29-1123': '5123', '29-1124': '5106',
    '29-1125': '5104', '29-1126': '5117', '29-1127': '5120',
    '29-1128': '5117', '29-1129': '5123', '29-1131': '5118',
    '29-1151': '5106', '29-1161': '5110', '29-1171': '5123',
    '29-1181': '5106', '29-1211': '5106', '29-1213': '5106',
    '29-1214': '5106', '29-1215': '5106', '29-1216': '5106',
    '29-1217': '5106', '29-1218': '5106', '29-1221': '5117',
    '29-1222': '5117', '29-1223': '5117', '29-1224': '5117',
    '29-1225': '5117', '29-1226': '5117', '29-1227': '5117',
    '29-1228': '5117', '29-1229': '5117',
    '29-1243': '5106', '29-1291': '5138', '29-1292': '5106',
    '29-2011': '5106', '29-2012': '5106',
    '29-2031': '5120', '29-2032': '5120', '29-2033': '5120',
    '29-2034': '5120', '29-2035': '5120', '29-2036': '5120',
    '29-2042': '5109', '29-2043': '5117',
    '29-2052': '5120', '29-2053': '5106', '29-2055': '5120',
    '29-2056': '5120', '29-2057': '5106',
    '29-2061': '5109', '29-2072': '5108',
    '29-2081': '5109', '29-2091': '5120', '29-2092': '5120',
    '29-9091': '5107', '29-9092': '5107',
    '31-1120': '5113', '31-1131': '5131', '31-1133': '5116',
    '31-2011': '5126', '31-2012': '5120',
    '31-2021': '5123', '31-2022': '5123',
    '31-9091': '5106', '31-9092': '5106', '31-9093': '5109',
    '31-9094': '5106', '31-9095': '5120', '31-9096': '5106',
    '31-9097': '5106', '31-9099': '5106',
    # Protective Service
    '33-1011': '4301', '33-1012': '4301', '33-1021': '4302',
    '33-2021': '4302', '33-3012': '4301', '33-3021': '4301',
    '33-3052': '4301', '33-9011': '4301', '33-9021': '4301',
    '33-9031': '4301', '33-9032': '4301', '33-9091': '4301',
    '33-9099': '4301',
    # Food Preparation
    '35-2011': '1205', '35-2012': '1205', '35-2013': '1205',
    '35-2014': '1205', '35-2015': '1205', '35-2019': '1205',
    '35-2021': '1203', '35-3011': '1205', '35-3023': '1205',
    '35-3041': '1203', '35-9011': '1203', '35-9031': '1203',
    # Building & Grounds
    '37-1011': '4606', '37-1012': '0106', '37-2011': '4606',
    '37-2012': '0106', '37-2021': '0106', '37-3011': '0106',
    '37-3012': '0106', '37-3013': '0106',
    # Personal Care
    '39-1013': '5210', '39-2011': '0107', '39-2021': '0107',
    '39-4031': '1203', '39-5011': '1204', '39-5012': '1204',
    '39-5091': '5108', '39-5092': '5108', '39-5093': '5108',
    '39-5094': '5108',
    '39-6011': '5210', '39-6012': '5210', '39-7011': '3199',
    '39-7012': '3199', '39-9011': '3905',
    '39-9032': '3105', '39-9041': '1901',
    # Sales
    '41-1011': '5218', '41-1012': '5218', '41-2011': '5218',
    '41-2012': '5218', '41-2021': '5218', '41-2022': '5218',
    '41-2031': '5218', '41-3011': '5210', '41-3021': '5210',
    '41-3031': '5208', '41-4011': '5218', '41-4012': '5218',
    '41-9012': '5210', '41-9021': '5218', '41-9022': '5218',
    '41-9031': '1401',
    # Office & Admin
    '43-1011': '5202', '43-2011': '5218', '43-2021': '5218',
    '43-3011': '5203', '43-3021': '5202', '43-3031': '5203',
    '43-3051': '5202', '43-3061': '5203', '43-3071': '5202',
    '43-4011': '5218', '43-4021': '5218', '43-4031': '5218',
    '43-4041': '5218', '43-4051': '5218', '43-4061': '5218',
    '43-4071': '5218', '43-4081': '5218', '43-4111': '5218',
    '43-4121': '5218', '43-4131': '5218', '43-4141': '5218',
    '43-4151': '5218', '43-4161': '5218', '43-4171': '5218',
    '43-4181': '5218', '43-4199': '5218',
    '43-5011': '5202', '43-5021': '5202', '43-5031': '4301',
    '43-5041': '5202', '43-5051': '5202', '43-5052': '5202',
    '43-5053': '5202', '43-5061': '5202', '43-5071': '5202',
    '43-5081': '5202', '43-5111': '5202',
    '43-6011': '5204', '43-6012': '5204', '43-6013': '5204',
    '43-6014': '5204', '43-9011': '5202', '43-9021': '5202',
    '43-9041': '5202', '43-9061': '5202', '43-9071': '5202',
    '43-9111': '5202', '43-9199': '5202',
    # Farming
    '45-1011': '0104', '45-2011': '0106', '45-2041': '0106',
    '45-2091': '0106', '45-2092': '0106', '45-2093': '0106',
    '45-3031': '0309', '45-4011': '0305', '45-4022': '0305',
    '45-4023': '0305',
    # Construction
    '47-1011': '4601', '47-2011': '4601', '47-2021': '4602',
    '47-2031': '4602', '47-2041': '4602', '47-2042': '4602',
    '47-2043': '4602', '47-2044': '4602', '47-2051': '4602',
    '47-2061': '4602', '47-2071': '4602', '47-2072': '4602',
    '47-2073': '4602', '47-2081': '4602', '47-2082': '4602',
    '47-2121': '4602', '47-2131': '4602', '47-2132': '4602',
    '47-2141': '4602', '47-2142': '4602', '47-2151': '4602',
    '47-2152': '4605', '47-2161': '4602', '47-2171': '4602',
    '47-2181': '4602', '47-2211': '4602', '47-2221': '4602',
    '47-2231': '4602', '47-3011': '4601', '47-3012': '4601',
    '47-3013': '4601', '47-3014': '4601', '47-3015': '4601',
    '47-3016': '4601', '47-4011': '1502', '47-4021': '4602',
    '47-4031': '4602', '47-4041': '4301', '47-4051': '4602',
    '47-4071': '4602', '47-4099': '4601',
    '47-5011': '1505', '47-5012': '1505', '47-5013': '1505',
    '47-5023': '1505', '47-5032': '1505', '47-5041': '1505',
    '47-5044': '1505', '47-5049': '1505', '47-5051': '1505',
    '47-5071': '1505', '47-5081': '1505',
    # Installation, Maintenance, Repair
    '49-1011': '4701', '49-2011': '4701', '49-2021': '4701',
    '49-2022': '4701', '49-2091': '4706', '49-2092': '4706',
    '49-2093': '4701', '49-2094': '4701', '49-2095': '4701',
    '49-2096': '4701', '49-2097': '4701', '49-2098': '4701',
    '49-3011': '4708', '49-3021': '4706', '49-3022': '4706',
    '49-3023': '4706', '49-3031': '4706', '49-3041': '4706',
    '49-3042': '4706', '49-3043': '4706', '49-3051': '4706',
    '49-3052': '4706', '49-3053': '4706', '49-3091': '4706',
    '49-3092': '4706', '49-3093': '4706',
    '49-9011': '4706', '49-9012': '4706', '49-9021': '4702',
    '49-9031': '4702', '49-9041': '4701', '49-9043': '4701',
    '49-9044': '4701', '49-9045': '4701', '49-9051': '4701',
    '49-9052': '4701', '49-9061': '4701', '49-9062': '4701',
    '49-9063': '4701', '49-9064': '4701', '49-9071': '4601',
    '49-9081': '4606', '49-9091': '4701', '49-9092': '4701',
    '49-9094': '4706', '49-9095': '4701', '49-9096': '4701',
    '49-9097': '4701', '49-9098': '4701', '49-9099': '4701',
    # Production
    '51-1011': '5202', '51-2011': '4804', '51-2021': '4804',
    '51-2031': '4804', '51-2041': '4804', '51-2051': '4804',
    '51-2091': '4804', '51-2092': '4804', '51-2098': '4804',
    '51-3011': '1205', '51-3021': '1205', '51-3022': '1205',
    '51-3091': '1205', '51-3092': '1205', '51-3093': '1205',
    '51-4011': '4805', '51-4012': '4805', '51-4021': '4805',
    '51-4022': '4805', '51-4023': '4805', '51-4031': '4805',
    '51-4032': '4805', '51-4033': '4805', '51-4034': '4805',
    '51-4035': '4805', '51-4041': '4805', '51-4051': '4805',
    '51-4052': '4805', '51-4061': '4805', '51-4072': '4805',
    '51-4081': '4805', '51-4111': '4805', '51-4121': '4805',
    '51-4122': '4805', '51-4191': '4805', '51-4192': '4805',
    '51-4193': '4805', '51-4194': '4805',
    '51-5111': '1009', '51-5112': '1009', '51-5113': '1009',
    '51-6011': '4603', '51-6021': '4603', '51-6031': '4603',
    '51-6041': '4603', '51-6042': '4603', '51-6051': '4603',
    '51-6052': '4603', '51-6061': '4603', '51-6062': '4603',
    '51-6063': '4603', '51-6064': '4603', '51-6091': '4603',
    '51-6092': '4603', '51-6093': '4603', '51-6099': '4603',
    '51-7011': '4805', '51-7021': '4805', '51-7031': '4805',
    '51-7032': '4805', '51-7041': '4805', '51-7042': '4805',
    '51-8011': '4702', '51-8012': '4702', '51-8013': '4702',
    '51-8021': '4702', '51-8031': '4702', '51-8091': '4002',
    '51-8092': '4702', '51-8093': '4702', '51-8099': '4702',
    '51-9011': '4002', '51-9012': '4002', '51-9021': '4002',
    '51-9022': '4002', '51-9023': '4002', '51-9031': '4805',
    '51-9032': '4805', '51-9041': '1509', '51-9051': '4805',
    '51-9061': '4805', '51-9071': '5010', '51-9081': '5106',
    '51-9082': '5106', '51-9083': '5106', '51-9111': '4805',
    '51-9121': '4805', '51-9122': '4805', '51-9123': '4805',
    '51-9124': '4805', '51-9141': '1509', '51-9151': '5010',
    '51-9161': '4002', '51-9191': '4805', '51-9192': '4805',
    '51-9193': '4805', '51-9194': '4805', '51-9195': '4805',
    '51-9196': '4805', '51-9197': '4805', '51-9198': '4805',
    '51-9199': '4805',
    # Transportation
    '53-1041': '5209', '53-1042': '5209', '53-1044': '5209',
    '53-2011': '4902', '53-2012': '4902', '53-2021': '4902',
    '53-2031': '4902', '53-3011': '4901', '53-3031': '4901',
    '53-3032': '4901', '53-3033': '4901', '53-3051': '4901',
    '53-3052': '4901', '53-3053': '4901', '53-3054': '4901',
    '53-3058': '4901', '53-4011': '4901', '53-4013': '4901',
    '53-4021': '4901', '53-4022': '4901', '53-4031': '4901',
    '53-4041': '4901', '53-5011': '4901', '53-5021': '4901',
    '53-5022': '4901', '53-5031': '4901',
    '53-6011': '4901', '53-6021': '4901', '53-6031': '4901',
    '53-6051': '4901', '53-6061': '4901',
    '53-7011': '4901', '53-7021': '4901', '53-7031': '4901',
    '53-7041': '4901', '53-7051': '4901', '53-7061': '4901',
    '53-7062': '4901', '53-7063': '4901', '53-7064': '4901',
    '53-7065': '4901', '53-7071': '4901', '53-7072': '4901',
    '53-7073': '4901', '53-7081': '4901', '53-7121': '4901',
}


def main():
    print("=== Phase 1: Loading data ===")

    # Load projections data (from BLS)
    with open(SCRIPT_DIR / 'bls_all_occupations.json', 'r', encoding='utf-8') as f:
        projections = json.load(f)
    soc_to_proj = {p['soc']: p for p in projections}
    valid_socs = set(soc_to_proj.keys())

    # Load existing data
    with open(DATA_DIR / 'occupation-profiles.json', 'r', encoding='utf-8') as f:
        existing_profiles = json.load(f)
    existing_socs = set(existing_profiles['profiles'].keys())

    # Load scraped OOH data
    with open(SCRIPT_DIR / 'ooh_scraped_data.json', 'r', encoding='utf-8') as f:
        scraped = json.load(f)

    # Filter to resolved entries only, skip already-existing SOCs
    new_entries = []
    for entry in scraped:
        if not entry['soc_codes']:
            continue
        # Use first SOC that's not already in system and is in projections
        primary_soc = None
        for soc in entry['soc_codes']:
            if soc not in existing_socs and soc in valid_socs:
                primary_soc = soc
                break
        if not primary_soc:
            # All SOC codes are either already in system or not in projections
            # Try the first valid SOC anyway
            for soc in entry['soc_codes']:
                if soc in valid_socs:
                    primary_soc = soc
                    break
        if not primary_soc:
            continue
        if primary_soc in existing_socs:
            continue

        entry['primary_soc'] = primary_soc
        new_entries.append(entry)

    print(f"New entries to add: {len(new_entries)}")

    print("\n=== Phase 2: Re-fetching pages for better text extraction ===")
    session = requests.Session(impersonate="chrome")

    for i, entry in enumerate(new_entries):
        url = entry['url']
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                profile = extract_profile_from_html(resp.text)
                entry['profile_text'] = profile
                wtd_preview = profile['what_they_do'][:60] + '...' if profile['what_they_do'] else 'NO TEXT'
                print(f"  [{i+1}/{len(new_entries)}] {entry['slug']}: {wtd_preview}")
            else:
                print(f"  [{i+1}/{len(new_entries)}] {entry['slug']}: HTTP {resp.status_code}")
        except Exception as e:
            print(f"  [{i+1}/{len(new_entries)}] {entry['slug']}: ERROR - {e}")
        time.sleep(REQUEST_DELAY)

    print("\n=== Phase 3: Building data files ===")

    # Build occupation-profiles.json additions
    new_profiles = {}
    for entry in new_entries:
        soc = entry['primary_soc']
        proj = soc_to_proj.get(soc, {})
        ooh_cat = entry['category']
        slug = entry['slug']

        # Parse employment and growth from projections
        emp_str = proj.get('emp_2024_k', '0')
        try:
            emp_2024 = int(float(emp_str.replace(',', '')) * 1000)
        except (ValueError, TypeError):
            emp_2024 = 0

        pct_str = proj.get('pct_change', '0')
        try:
            growth_rate = round(float(pct_str.replace(',', '')), 1)
        except (ValueError, TypeError):
            growth_rate = 0

        change_str = proj.get('change_k', '0')
        try:
            projected_change = int(float(change_str.replace(',', '')) * 1000)
        except (ValueError, TypeError):
            projected_change = 0

        # Use quick_facts growth if projections unavailable
        qf = entry.get('quick_facts', {})
        if growth_rate == 0 and qf.get('growth_pct') is not None:
            growth_rate = qf['growth_pct']

        growth_label = get_growth_label(growth_rate)

        # Build OES URL (for state data)
        oes_code = soc.replace('-', '')
        state_url = f"https://www.bls.gov/oes/current/oes{oes_code}.htm"

        # Build O*NET URL
        onet_url = f"https://www.onetonline.org/link/summary/{soc}.00"

        # Build OOH URL
        ooh_url = f"https://www.bls.gov/ooh/{ooh_cat}/{slug}.htm"

        # Find similar SOCs (same category, different SOC)
        same_cat_socs = [e['primary_soc'] for e in new_entries
                         if e['category'] == ooh_cat and e['primary_soc'] != soc]
        similar = same_cat_socs[:3]

        new_profiles[soc] = {
            'ooh_url': ooh_url,
            'onet_url': onet_url,
            'state_url': state_url,
            'outlook': {
                'employment_2024': emp_2024,
                'growth_rate': growth_rate,
                'projected_change': projected_change,
                'growth_label': growth_label
            },
            'similar_soc': similar
        }

    # Build profile text entries
    new_text_en = {}
    for entry in new_entries:
        soc = entry['primary_soc']
        pt = entry.get('profile_text', {})
        if not isinstance(pt, dict):
            pt = {}

        new_text_en[soc] = {
            'what_they_do': pt.get('what_they_do', '') or f"{entry.get('slug', '').replace('-', ' ').title()} perform specialized duties in their field.",
            'work_environment': pt.get('work_environment', '') or "Work environments vary depending on the specific role and employer.",
            'how_to_become': pt.get('how_to_become', {
                'education': '',
                'experience': '',
                'training': ''
            })
        }

    # Build CAREER_MAPPINGS data
    new_mappings = []
    for entry in new_entries:
        soc = entry['primary_soc']
        proj = soc_to_proj.get(soc, {})
        ooh_cat = entry['category']
        title = proj.get('title', entry['slug'].replace('-', ' ').title())

        # Education from projections or quick facts
        edu = proj.get('education', '')
        if not edu:
            edu = entry.get('quick_facts', {}).get('education', '')

        app_cat = ooh_cat_to_app_category(ooh_cat)
        interests = category_to_interests(app_cat)
        icon = category_to_icon(app_cat, title)
        degree = edu_to_degree(edu)
        cip = CIP_SOC_MAP.get(soc, '5202')  # Default to general business

        new_mappings.append({
            'soc': soc,
            'cip': cip,
            'career': title,
            'typicalDegree': degree,
            'category': app_cat,
            'interests': interests,
            'icon': icon
        })

    # Save intermediate results
    output = {
        'new_profiles': new_profiles,
        'new_text_en': new_text_en,
        'new_mappings': new_mappings,
        'count': len(new_entries)
    }

    with open(SCRIPT_DIR / 'ooh_generated_data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nGenerated data for {len(new_entries)} new occupations")
    print(f"Saved to scripts/ooh_generated_data.json")

    # Show summary by category
    cat_counts = {}
    for m in new_mappings:
        cat = m['category']
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    print("\nBy category:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")


if __name__ == "__main__":
    main()
