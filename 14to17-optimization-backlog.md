# 14to17 Career Compass — 整合優化指令

> 本文件整合三份獨立 review 的所有 findings，去重後按優先級排序。
> 請依 Phase 順序執行，每個 Phase 完成後跑一次完整測試。

---

## Phase 1: Critical — 不修會流失用戶

### 1.1 Mobile Navigation 修復
**問題：** 375px 下 nav items 換行堆疊混亂，「職涯羅盤」與連結重疊。目標用戶（14-17 青少年）絕大多數用手機。
**修復：**
- 在 `@media (max-width: 768px)` 加入 hamburger menu toggle
- Nav links 預設隱藏，點擊漢堡按鈕後以 slide-down 或 overlay 方式展開
- 確保 Tools 的子選單在行動版也能正常展開/收合
- 測試：375px、414px、390px 三種寬度截圖確認

### 1.2 首頁 Hero Section
**問題：** 首頁目前只有 navbar + disclaimer footer，沒有任何內容說明工具用途。青少年 3 秒內看不到價值就會離開。
**修復：**
- 新增 hero section，包含：
  - 一句話 value proposition（中英雙語），例如「探索你的未來職業，用數據做決定」
  - 一個主要 CTA 按鈕導向 `#/search`（例如「開始探索 → Start Exploring」）
  - 可選：3-4 個熱門職業卡片作為 quick entry points（從現有 25 個職業中挑選）
- Hero 設計要符合青少年審美，避免過於企業風格

### 1.3 Disclaimer Banner 優化
**問題：** 「U.S. Market Data Only」目前以 modal 形式每次都彈出，體驗差且佔首屏空間。
**修復：**
- 改為頁面頂部 persistent banner（非 modal）
- 加入 dismiss 按鈕，點擊後用 `localStorage` 記住，後續訪問不再顯示
- 資料來源標示保留在 footer 即可

---

## Phase 2: High Priority — 可訪問性與 SEO 基礎 ✅ COMPLETE

### 2.1 `prefers-reduced-motion` 支援 ✅
已在 `main.css` 加入 `@media (prefers-reduced-motion: reduce)` 規則。

### 2.2 頁面標題動態更新 ✅
`app.js:updatePageMeta()` 在每次 route-changed 事件時更新 `document.title`，格式 `{pageName} — Career Compass`，含 meta description。

### 2.3 新增 `<link rel="canonical">` ✅
已在 `index.html` 加入 `<link rel="canonical" href="https://poleaxe0224.github.io/14to17/" />`。

### 2.4 Color-Only Growth Indicators 修復 ✅
`profile.js:growthIcon()` 在色塊旁加入非顏色圖示（▲▲/▲/●/▼/▼▼），符合 WCAG 1.4.1。

### 2.5 Chart.js Accessibility ✅
所有 4 個 canvas 元素均有 `role="img"` + `aria-label`（雙語），且在 canvas 後方注入 sr-only data table（calculator 2 張 + compare 1 張 + detail-chart 1 張）。

### 2.6 `<title>` 雙語化 ✅
`locale-changed` 事件觸發 `refresh()`，重新渲染後 `updatePageMeta()` 自動以當前語系更新 `document.title`。

---

## Phase 3: Medium Priority — 效能與體驗打磨 ✅ COMPLETE

### 3.1 空狀態 UX — Compare Page ✅
`compare-empty-hint` div 含 ⚖️ 圖示 + `compare.empty_hint` 引導文字，已實作。

### 3.2 空狀態 UX — My Report Page ✅
`report-empty` class 含 `report.empty` CTA 文字（「你還沒有探索任何職業。從首頁開始吧！」），已實作。

### 3.3 Filter Chips 行動版渲染問題 ✅
2026-04-11 Playwright 375px 截圖確認：所有 5 個 filter chips 文字完整顯示，`flex-wrap: wrap` + 明確 `color` 變數正確運作。

### 3.4 Resource Hints 加速首次載入 ✅
`index.html` 已含 `preconnect` + `dns-prefetch` for CDN (`cdn.jsdelivr.net`) 及 `api.data.gov`。BLS `dns-prefetch` 不需要（資料已為靜態 JSON）。`preload` main.js 不實用（Vite hash 每次不同）。

### 3.5 Pico CSS 瘦身 — SKIP ✅
總 CSS 121KB raw / **18KB gzipped**，已為最佳。classless 版僅省 12KB 但會破壞 `.container`/`.outline`/`details.dropdown`。PurgeCSS 增加建置複雜度但僅省 ~3-5KB gzip。不值得。

### 3.6 Service Worker 註冊 ✅
Build-time SW 已實作（Phase 15），43-file pre-cache + CDN caching + offline banner。

### 3.7 行動版全頁面檢查 ✅
2026-04-11 Playwright 375px 全頁截圖確認 5 頁面（Home, Search, Profile, Calculator, Compare, Report）均無 layout 問題。

---

## Phase 4: Low Priority — 錦上添花 ✅ COMPLETE

### 4.1 Dark Mode ✅
`theme.js` — toggle 按鈕 + `prefers-color-scheme` 自動偵測 + `localStorage` 持久化 + `theme-changed` 事件同步 Chart.js 主題。

### 4.2 Social Card 優化 ✅
`social-card.webp` 已產生，OG tags 完整（`og:title`, `og:description`, `og:image` with WebP + PNG fallback）。

### 4.3 i18n 深化 ✅
- 學位名稱雙語 tooltip：`degreeLabel()` — en 模式顯示 "Bachelor's" tooltip "學士"，zh-TW 反之
- 專有術語 glossary：ROI/NPV/IRR/BLS/IPEDS/SOC/CIP — CSS-only `data-tooltip`
- 數字格式：`Intl.NumberFormat('en-US')` → `$75,000`
- 語言偏好：`14to17-locale` in localStorage

### 4.4 My Report PDF 匯出 ✅
`export-pdf.js` — `window.print()` 原生處理 CJK + canvas→img 轉換確保圖表可列印。另有 Markdown/JSON 匯出。

---

## 暫緩項目（記錄但不在此階段執行）

| 項目 | 原因 |
|---|---|
| Hash → History mode routing | GitHub Pages 的 404 redirect hack 體驗不佳（重新整理會閃 404），除非遷移到 Netlify/Vercel 否則 ROI 不高 |
| Skeleton Loading | 資料已是靜態 JSON 打包，載入延遲極低，目前不需要 |
| 導入 Recharts / ECharts | 已在用 Chart.js，切換圖表庫成本高且無明顯收益 |
