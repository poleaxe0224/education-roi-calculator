"""
Apply generated OOH data to the actual project data files.
Merges new occupations into:
  - src/data/occupation-profiles.json
  - src/data/profile-text-en.json
  - src/data/profile-text-zh-TW.json
  - src/data/cip-soc-crosswalk.json
  - src/engine/mappings.js (CAREER_MAPPINGS array)
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "src" / "data"
ENGINE_DIR = SCRIPT_DIR.parent / "src" / "engine"


# Traditional Chinese occupation name translations
ZH_TW_NAMES = {
    # Management
    '11-3012': '行政服務經理', '11-9041': '建築與工程經理',
    '11-3111': '薪酬福利經理', '11-3021': '資訊系統經理',
    '11-9021': '營建經理', '11-9032': '中小學校長',
    '11-9199': '緊急管理主管', '11-9051': '餐飲服務經理',
    '11-9013': '農場主與牧場主', '11-9161': '自然科學經理',
    '11-3051': '工業生產經理', '11-9081': '旅館經理',
    '11-9033': '高等教育行政人員', '11-9031': '幼教中心主管',
    '11-9141': '物業管理經理', '11-2032': '公關經理',
    '11-2022': '銷售經理', '11-9151': '社會與社區服務經理',
    '11-1011': '最高主管', '11-3131': '培訓發展經理',
    '11-3071': '運輸倉儲經理',
    # Business & Financial
    '13-2020': '不動產估價師', '13-2041': '預算分析師',
    '13-1031': '理賠分析師', '13-1141': '薪酬福利分析師',
    '13-1041': '法遵人員', '13-1051': '成本估算師',
    '13-1071': '信用諮詢師', '13-2082': '金融審查員',
    '13-1131': '募款專員', '13-1071': '人力資源專員',
    '13-1111': '保險精算師', '13-1151': '勞資關係專員',
    '13-2072': '貸款專員', '13-1081': '物流師',
    '13-1111': '管理分析師', '13-1161': '市場研究分析師',
    '13-1121': '會議活動策劃師', '13-2051': '個人理財顧問',
    '13-1082': '專案管理師', '13-1023': '採購經理與採購員',
    '13-2081': '稅務審查員', '13-1151': '培訓發展專員',
    # Computer & IT
    '15-1221': '電腦科學研究員', '15-1241': '電腦網路架構師',
    '15-1251': '電腦程式設計師', '15-1232': '電腦支援專員',
    '15-1244': '網路系統管理員',
    # Architecture & Engineering
    '17-3021': '航太工程技術員', '17-2011': '航太工程師',
    '17-2021': '農業工程師', '17-3031': '製圖師與攝影測量師',
    '17-2041': '化學工程師', '17-3022': '土木工程技術員',
    '17-2061': '電腦硬體工程師', '17-3011': '製圖員',
    '17-3023': '電子工程技術員', '17-3024': '機電技術員',
    '17-3025': '環境工程技術員', '17-2081': '環境工程師',
    '17-2111': '工業安全工程師', '17-3026': '工業工程技術員',
    '17-2112': '工業工程師', '17-1012': '景觀建築師',
    '17-2121': '船舶工程師', '17-2131': '材料工程師',
    '17-3027': '機械工程技術員', '17-2151': '採礦工程師',
    '17-2161': '核能工程師', '17-2171': '石油工程師',
    '17-3031': '測量測繪技術員', '17-1022': '測量師',
    # Life, Physical & Social Science
    '19-4011': '農業食品科學技術員', '19-1011': '農業與食品科學家',
    '19-3091': '人類學家與考古學家', '19-2021': '氣象學家',
    '19-1021': '生物化學家', '19-4021': '生物技術員',
    '19-4031': '化學技術員', '19-2031': '化學家與材料科學家',
    '19-1031': '保育科學家', '19-3011': '經濟學家',
    '19-4042': '環保技術員', '19-1041': '流行病學家',
    '19-3092': '地理學家', '19-4043': '地質與石油技術員',
    '19-2042': '地球科學家', '19-3093': '歷史學家',
    '19-2043': '水文學家', '19-1042': '醫學科學家',
    '19-1022': '微生物學家', '19-4051': '核能技術員',
    '19-2012': '物理學家與天文學家', '19-3094': '政治學家',
    '19-3041': '社會學家', '19-3022': '調查研究員',
    '19-3051': '都市規劃師', '19-1023': '動物學家與野生生物學家',
    # Community & Social Service
    '21-1094': '社區衛生工作者', '21-1091': '衛生教育師',
    '21-1013': '婚姻家庭治療師', '21-1092': '觀護人與矯正治療師',
    '21-1015': '復健諮商師', '21-1012': '學校與職涯諮商師',
    '21-1093': '社會服務助理',
    # Legal
    '23-1022': '仲裁調解員', '23-2093': '法庭速記員',
    '23-1021': '法官',
    # Education
    '25-3011': '成人教育教師', '25-1194': '職業技術教師',
    '25-4022': '博物館策展人', '25-2059': '教學協調員',
    '25-4031': '圖書館員', '25-4021': '圖書館技術員',
    '25-2022': '國中教師', '25-1011': '大學教授',
    '25-2011': '幼教教師', '25-2012': '特殊教育教師',
    '25-9045': '教師助理', '25-3031': '家庭教師',
    # Arts & Design
    '27-1011': '藝術總監', '27-1012': '工藝與美術家',
    '27-1022': '時裝設計師', '27-1023': '花藝設計師',
    '27-1021': '工業設計師', '27-1025': '室內設計師',
    '27-1027': '佈景與展覽設計師',
    # Media & Communication
    '27-3011': '播報員', '27-4011': '廣播與音響工程師',
    '27-3041': '編輯', '27-4032': '影片編輯與攝影師',
    '27-3091': '口譯與筆譯人員', '27-4021': '攝影師',
    '27-3042': '技術文件撰寫師', '27-3043': '作家',
    # Healthcare
    '29-9091': '運動防護員', '29-1181': '聽力師',
    '29-2031': '心血管技術員', '29-1011': '脊骨神經醫師',
    '29-2011': '醫事檢驗師', '31-9091': '牙科助理',
    '29-2032': '超音波技術員', '29-1031': '營養師',
    '29-2042': '緊急救護技術員', '29-1128': '運動生理學家',
    '29-9092': '遺傳諮詢師', '29-2072': '健康資訊技術員',
    '31-1120': '居家照護員', '31-1131': '按摩治療師',
    '31-9093': '醫療助理', '29-2035': '醫療劑量師',
    '29-2072': '病歷技術員', '29-2081': '配鏡師',
    '29-1041': '驗光師', '29-1124': '義肢矯具師',
    '31-9097': '抽血技術員', '31-2021': '物理治療助理',
    '29-1081': '足科醫師', '31-2012': '精神科技術員',
    '29-1124': '放射治療師', '29-2034': '放射技術師',
    '29-1125': '休閒治療師', '29-1126': '呼吸治療師',
    '29-1127': '語言病理學家', '29-2055': '手術技術員',
    '29-1131': '獸醫', '31-9096': '獸醫助理',
    '29-2056': '獸醫技術員', '29-1291': '護理麻醉師與護理師',
    '31-1133': '護理助理', '29-9093': '職業安全衛生專員',
    '31-2022': '職能治療助理',
    # Protective Service
    '33-3012': '矯正官', '33-2021': '消防調查員',
    '33-9021': '私家偵探', '33-9032': '保全人員',
    # Food Preparation
    '35-3011': '調酒師', '35-2014': '廚師',
    '35-3023': '餐飲服務人員', '35-2021': '食品加工人員',
    '35-3041': '服務生',
    # Building & Grounds Cleaning
    '37-3011': '園藝工人', '37-2011': '清潔工',
    '37-2021': '除蟲人員',
    # Personal Care & Service
    '39-2011': '動物照護員', '39-5012': '美髮師',
    '39-9011': '托育人員', '39-6012': '禮賓員',
    '39-4031': '殯葬服務員', '39-1013': '博弈服務人員',
    '39-5092': '美甲師', '39-9032': '休閒活動工作者',
    '39-5094': '美容師', '39-7011': '旅遊導遊',
    # Sales
    '41-3011': '廣告業務員', '41-2012': '收銀員',
    '41-3021': '保險業務員', '41-9012': '模特兒',
    '41-4011': '不動產經紀人', '41-2031': '零售銷售員',
    '41-9031': '銷售工程師', '41-3031': '證券經紀人',
    '41-3031': '旅行社業務員', '41-4012': '批發與製造業務員',
    # Office & Administrative Support
    '43-3011': '帳務催收員', '43-3031': '簿記人員',
    '43-4051': '客服代表', '43-9031': '桌面排版員',
    '43-3051': '出納員', '43-9061': '辦公室事務員',
    '43-4071': '資訊服務員', '43-5071': '物料記錄員',
    '43-5031': '勤務中心調度員', '43-5051': '郵務人員',
    '43-4171': '接待員', '43-6014': '秘書與行政助理',
    '43-3071': '銀行櫃員',
    # Farming, Fishing & Forestry
    '45-2091': '農業工人', '45-3031': '漁民',
    '45-4011': '林業工人', '45-4022': '伐木工人',
    # Construction & Extraction
    '47-2011': '鍋爐工', '47-2021': '砌磚工',
    '47-4011': '建築檢查員', '47-2073': '工程機械操作員',
    '47-3011': '建築工人', '47-2081': '乾牆安裝工',
    '47-4021': '電梯安裝修理工', '47-2121': '玻璃工',
    '47-4041': '危險物質清除工', '47-2131': '隔熱工',
    '47-5012': '油氣工人', '47-2141': '油漆工',
    '47-2181': '屋頂工', '47-2211': '鈑金工',
    '47-2231': '太陽能安裝工', '47-2221': '結構鐵工',
    '47-2042': '磁磚工',
    # Installation, Maintenance & Repair
    '49-3011': '航空機械師', '49-3021': '汽車鈑金修理工',
    '49-3023': '汽車維修技師', '49-9063': '校準技術員',
    '49-3031': '柴油機械師', '49-2022': '電子設備安裝修理工',
    '49-9071': '一般維修工', '49-3042': '重型設備技師',
    '49-9041': '工業機械師', '49-9052': '線路安裝修理工',
    '49-9062': '醫療設備維修師', '49-3053': '小型引擎技師',
    '49-2021': '電信設備安裝修理工', '49-9081': '風力發電技師',
    # Production
    '51-2098': '組裝工', '51-3011': '烘焙師',
    '51-3021': '肉品切割工', '51-9081': '牙科光學實驗室技術員',
    '51-3093': '食品加工工人', '51-9071': '珠寶工匠',
    '51-4041': '機械師', '51-4034': '金屬與塑膠加工機操作員',
    '51-9124': '噴塗工', '51-8013': '發電廠操作員',
    '51-9061': '品管檢驗員', '51-9141': '半導體製程技術員',
    '51-8021': '鍋爐操作員', '51-8031': '水處理廠操作員',
    '51-4121': '焊接工', '51-7042': '木工',
    # Transportation & Material Moving
    '53-2021': '航空管制員', '53-3052': '公車司機',
    '53-3033': '貨運司機', '53-2031': '空服員',
    '53-7062': '搬運工', '53-3032': '大型貨車司機',
    '53-7051': '物料搬運機操作員', '53-4011': '鐵路工人',
    '53-3054': '計程車司機', '53-5021': '水上運輸工人',
}


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {path}")


def main():
    # Load generated data
    generated = load_json(SCRIPT_DIR / 'ooh_generated_data.json')
    new_profiles = generated['new_profiles']
    new_text_en = generated['new_text_en']
    new_mappings = generated['new_mappings']
    count = generated['count']

    print(f"Applying {count} new occupations to data files...\n")

    # 1. Update occupation-profiles.json
    print("1. Updating occupation-profiles.json...")
    profiles = load_json(DATA_DIR / 'occupation-profiles.json')
    for soc, data in new_profiles.items():
        profiles['profiles'][soc] = data
    profiles['_meta']['last_updated'] = '2026-04-11'
    profiles['_meta']['notes'] += f' Expanded to {len(profiles["profiles"])} occupations from BLS OOH.'
    save_json(DATA_DIR / 'occupation-profiles.json', profiles)
    print(f"  Total occupations: {len(profiles['profiles'])}")

    # 2. Update profile-text-en.json
    print("\n2. Updating profile-text-en.json...")
    text_en = load_json(DATA_DIR / 'profile-text-en.json')
    for soc, data in new_text_en.items():
        text_en[soc] = data
    save_json(DATA_DIR / 'profile-text-en.json', text_en)
    print(f"  Total entries: {len(text_en)}")

    # 3. Generate profile-text-zh-TW.json entries
    print("\n3. Updating profile-text-zh-TW.json...")
    text_zh = load_json(DATA_DIR / 'profile-text-zh-TW.json')
    for soc, data_en in new_text_en.items():
        zh_name = ZH_TW_NAMES.get(soc, '')
        wtd = data_en.get('what_they_do', '')
        we = data_en.get('work_environment', '')
        htb = data_en.get('how_to_become', {})

        text_zh[soc] = {
            'what_they_do': wtd,  # Keep English for now, can be translated later
            'work_environment': we,
            'how_to_become': {
                'education': htb.get('education', ''),
                'experience': htb.get('experience', ''),
                'training': htb.get('training', '')
            }
        }
    save_json(DATA_DIR / 'profile-text-zh-TW.json', text_zh)
    print(f"  Total entries: {len(text_zh)}")

    # 4. Update cip-soc-crosswalk.json
    print("\n4. Updating cip-soc-crosswalk.json...")
    crosswalk = load_json(DATA_DIR / 'cip-soc-crosswalk.json')
    existing_cw_socs = set()
    for entry in crosswalk['mappings']:
        for soc in entry.get('soc_codes', []):
            existing_cw_socs.add(soc)

    new_cw_entries = []
    for m in new_mappings:
        soc = m['soc']
        if soc not in existing_cw_socs:
            new_cw_entries.append({
                'cip_code': m['cip'],
                'cip_title': m['career'],
                'soc_codes': [soc],
                'primary_soc': soc
            })

    crosswalk['mappings'].extend(new_cw_entries)
    save_json(DATA_DIR / 'cip-soc-crosswalk.json', crosswalk)
    print(f"  Added {len(new_cw_entries)} new CIP-SOC mappings")
    print(f"  Total mappings: {len(crosswalk['mappings'])}")

    # 5. Generate mappings.js CAREER_MAPPINGS additions
    print("\n5. Generating mappings.js additions...")
    mappings_code = []
    for m in new_mappings:
        soc = m['soc']
        zh_name = ZH_TW_NAMES.get(soc, m['career'])
        interests_str = json.dumps(m['interests'])
        icon = m['icon']

        # Build default undergrad CIP for graduate degrees
        default_undergrad = ''
        if m['typicalDegree'] in ('masters', 'doctoral', 'firstProfessional'):
            default_undergrad = f", defaultUndergradCip: '2601'"

        line = (
            f"  {{ soc: '{soc}', cip: '{m['cip']}', "
            f"career: '{m['career']}', "
            f"careerZh: '{zh_name}', "
            f"typicalDegree: '{m['typicalDegree']}', "
            f"category: '{m['category']}', "
            f"interests: {interests_str}, "
            f"icon: '{icon}'"
            f"{default_undergrad} }},"
        )
        mappings_code.append(line)

    # Save as a JS snippet file that can be pasted into mappings.js
    snippet_path = SCRIPT_DIR / 'mappings_additions.js'
    with open(snippet_path, 'w', encoding='utf-8') as f:
        f.write("// === NEW CAREER_MAPPINGS entries (280 occupations) ===\n")
        f.write("// Paste these into CAREER_MAPPINGS array in src/engine/mappings.js\n\n")
        for line in mappings_code:
            f.write(line + '\n')
    print(f"  Saved JS snippet to: {snippet_path}")
    print(f"  Total new mappings: {len(mappings_code)}")

    # Summary
    print(f"\n{'='*60}")
    print(f"DONE: Applied {count} new occupations")
    print(f"  occupation-profiles.json: {len(profiles['profiles'])} total")
    print(f"  profile-text-en.json: {len(text_en)} total")
    print(f"  profile-text-zh-TW.json: {len(text_zh)} total")
    print(f"  cip-soc-crosswalk.json: {len(crosswalk['mappings'])} mappings")
    print(f"  mappings_additions.js: {len(mappings_code)} entries")
    print(f"\nNext steps:")
    print(f"  1. Paste mappings_additions.js content into src/engine/mappings.js")
    print(f"  2. Run: npm run refresh-data (fetch wages, tuition, onet, ipeds)")
    print(f"  3. Run: npm test")
    print(f"  4. Run: npm run build")


if __name__ == "__main__":
    main()
