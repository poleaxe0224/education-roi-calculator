import { t, getLocale } from '../i18n/i18n.js';
import { findBySoc, getBaselineSalary, getEducationDuration } from '../engine/mappings.js';
import { calcThreeLayerROI, DEFAULTS } from '../engine/roi.js';
import * as bls from '../api/bls.js';
import * as scorecard from '../api/scorecard.js';
import * as ipeds from '../api/ipeds.js';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format.js';

export function render({ soc } = {}) {
  const career = findBySoc(soc);

  if (!career) {
    return `
      <section class="placeholder-view">
        <h2>${t('detail.not_found')}</h2>
        <p>${t('detail.not_found_msg').replace('{soc}', soc || '?')}</p>
        <a href="#/search" role="button" class="outline">${t('common.back')}</a>
      </section>
    `;
  }

  const isZh = getLocale() === 'zh-TW';
  const name = isZh ? career.careerZh : career.career;
  const subName = isZh ? career.career : career.careerZh;
  const duration = getEducationDuration(career.typicalDegree);

  return `
    <section class="detail-view">
      <a href="#/search" class="back-link">&larr; ${t('common.back')}</a>
      <h2>${name}</h2>
      <p class="detail-sub">${subName}</p>

      <div class="detail-grid">
        <article class="detail-panel">
          <h3>${t('detail.wage_data')}</h3>
          <div id="wage-content" aria-live="polite">
            <p class="loading-text">${t('detail.loading')}</p>
          </div>
        </article>

        <article class="detail-panel">
          <h3>${t('detail.education_info')}</h3>
          <dl class="detail-dl">
            <dt>${t('detail.typical_degree')}</dt>
            <dd>${t('common.degree_' + career.typicalDegree)}</dd>
            <dt>${t('detail.education_duration')}</dt>
            <dd>${duration} ${t(duration === 1 ? 'detail.year' : 'detail.years')}</dd>
            <dt>${t('detail.soc_code')}</dt>
            <dd><code>${career.soc}</code></dd>
            <dt>${t('detail.cip_code')}</dt>
            <dd><code>${career.cip}</code></dd>
          </dl>
          <div id="tuition-content" aria-live="polite">
            <p class="loading-text">${t('common.loading')}</p>
          </div>
        </article>
      </div>

      <div id="ipeds-content" aria-live="polite"></div>
      <div id="roi-layers" class="hidden"></div>

      <details id="advanced-params" class="advanced-params">
        <summary>${t('ipeds.advanced_params')}</summary>
        <div class="slider-panel">
          <div class="slider-group">
            <label for="slider-k">
              ${t('ipeds.competition_sensitivity')}: <span id="k-value">${DEFAULTS.competitionK}</span>
            </label>
            <input type="range" id="slider-k" min="0.1" max="1.0" step="0.05" value="${DEFAULTS.competitionK}" />
            <small class="muted">${t('ipeds.competition_sensitivity_tip')}</small>
          </div>
          <div class="slider-group">
            <label for="slider-max-penalty">
              ${t('ipeds.max_penalty_cap')}: <span id="penalty-value">${(DEFAULTS.maxPenalty * 100).toFixed(0)}%</span>
            </label>
            <input type="range" id="slider-max-penalty" min="0.05" max="0.50" step="0.05" value="${DEFAULTS.maxPenalty}" />
            <small class="muted">${t('ipeds.max_penalty_tip')}</small>
          </div>
          <button type="button" id="reset-params" class="outline contrast">${t('ipeds.reset_defaults')}</button>
        </div>
      </details>

      <div id="roi-cta" class="roi-cta hidden"></div>
    </section>
  `;
}

/** Shared state for slider re-computation */
let _layerState = null;

function renderRoiLayers(layers) {
  const { basic, riskAdjusted, competitionAdjusted } = layers;

  const fallbacks = [];
  if (riskAdjusted.fallback) fallbacks.push(t('ipeds.fallback_no_grad'));
  if (competitionAdjusted.fallback) fallbacks.push(t('ipeds.fallback_no_competition'));

  return `
    <h3 style="margin-top:var(--space-lg)">ROI</h3>
    <div class="roi-layers-grid">
      <div class="roi-layer-card">
        <div class="roi-layer-label">${t('ipeds.basic_roi')}</div>
        <div class="roi-layer-value">${basic.roi.toFixed(1)}%</div>
        <div class="roi-layer-desc muted">${t('ipeds.basic_roi_desc')}</div>
      </div>
      <div class="roi-layer-card ${riskAdjusted.fallback ? 'roi-layer-fallback' : ''}">
        <div class="roi-layer-label">${t('ipeds.risk_adjusted_roi')}</div>
        <div class="roi-layer-value">${riskAdjusted.roi.toFixed(1)}%</div>
        <div class="roi-layer-desc muted">${t('ipeds.risk_adjusted_desc')}</div>
      </div>
      <div class="roi-layer-card roi-layer-primary ${competitionAdjusted.fallback ? 'roi-layer-fallback' : ''}">
        <div class="roi-layer-badge">${t('ipeds.recommended')}</div>
        <div class="roi-layer-label">${t('ipeds.competition_adjusted_roi')}</div>
        <div class="roi-layer-value" id="competition-roi-value">${competitionAdjusted.roi.toFixed(1)}%</div>
        <div class="roi-layer-desc muted">${t('ipeds.competition_adjusted_desc')}</div>
      </div>
    </div>
    ${fallbacks.length ? `<div class="roi-fallback-notes">${fallbacks.map((f) => `<p class="muted">${f}</p>`).join('')}</div>` : ''}
  `;
}

export async function afterRender({ soc } = {}) {
  const career = findBySoc(soc);
  if (!career) return;

  const duration = getEducationDuration(career.typicalDegree);
  const baseline = getBaselineSalary(career.typicalDegree);

  // Fetch all data sources in parallel
  const [wageResult, tuitionResult, ipedsResult] = await Promise.allSettled([
    bls.getWageData(career.soc),
    scorecard.getAverageTuition(career.cip),
    ipeds.getIpedsData(career.cip),
  ]);

  // Render wage data
  const wageEl = document.getElementById('wage-content');
  if (!wageEl) return; // user navigated away

  let medianSalary = 50_000;
  let totalEmployment = null;

  if (wageResult.status === 'fulfilled' && wageResult.value) {
    const w = wageResult.value;
    medianSalary = w.annualMedian || medianSalary;
    totalEmployment = w.employment ?? w.tot_emp ?? null;
    const wageRows = [
      [t('detail.annual_median'), formatCurrency(w.annualMedian), 'wage-highlight'],
      [t('detail.annual_mean'), formatCurrency(w.annualMean)],
      [t('detail.percentile_10'), formatCurrency(w.annual10)],
      [t('detail.percentile_25'), formatCurrency(w.annual25)],
      [t('detail.percentile_75'), formatCurrency(w.annual75)],
      [t('detail.percentile_90'), formatCurrency(w.annual90)],
    ].filter(([, val]) => val !== 'N/A');

    if (w.employment) wageRows.push([t('detail.employment'), formatNumber(w.employment)]);
    if (w.year) wageRows.push([t('detail.data_year'), String(Number(w.year))]);

    wageEl.innerHTML = `
      <dl class="detail-dl">
        ${wageRows.map(([dt, dd, cls]) => `<dt>${dt}</dt><dd${cls ? ` class="${cls}"` : ''}>${dd}</dd>`).join('')}
      </dl>
    `;
  } else {
    wageEl.innerHTML = `<p class="error-text">${t('detail.error_wages')}</p>`;
  }

  // Render tuition data
  const tuitionEl = document.getElementById('tuition-content');
  if (!tuitionEl) return;

  let avgTuition = 20_000;

  if (tuitionResult.status === 'fulfilled' && tuitionResult.value) {
    const tu = tuitionResult.value;
    avgTuition = tu.netPrice || tu.inState || 20_000;
    const parts = [];
    if (tu.netPrice != null) {
      parts.push(`<dt>${t('detail.avg_tuition')}</dt><dd>${formatCurrency(tu.netPrice)} ${t('detail.per_year')}</dd>`);
    }
    if (tu.inState != null) {
      parts.push(`<dt>${t('detail.tuition_in_state')}</dt><dd>${formatCurrency(tu.inState)} ${t('detail.per_year')}</dd>`);
    }
    if (tu.outOfState != null) {
      parts.push(`<dt>${t('detail.tuition_out_state')}</dt><dd>${formatCurrency(tu.outOfState)} ${t('detail.per_year')}</dd>`);
    }
    if (tu.sampleCount) {
      parts.push(`<dt></dt><dd class="muted">${t('detail.sample_schools').replace('{count}', tu.sampleCount)}</dd>`);
    }
    tuitionEl.innerHTML = parts.length
      ? `<dl class="detail-dl">${parts.join('')}</dl>`
      : `<p class="muted">${t('detail.tuition_unavailable')}</p>`;
  } else {
    tuitionEl.innerHTML = `<p class="muted">${t('detail.tuition_unavailable')}</p>`;
  }

  // Render IPEDS data
  const ipedsEl = document.getElementById('ipeds-content');
  if (!ipedsEl) return;

  let graduationRate = null;
  let completionsTotal = null;

  if (ipedsResult.status === 'fulfilled' && ipedsResult.value) {
    const ip = ipedsResult.value;
    graduationRate = ip.graduationRate;
    completionsTotal = ip.completionsTotal;

    const ipedsRows = [];
    if (ip.graduationRate != null) {
      ipedsRows.push([t('ipeds.graduation_rate'), `${(ip.graduationRate * 100).toFixed(1)}%`]);
    }
    if (ip.completionsTotal != null) {
      ipedsRows.push([t('ipeds.completions'), formatNumber(ip.completionsTotal)]);
    }
    if (totalEmployment != null) {
      ipedsRows.push([t('ipeds.market_employment'), formatNumber(totalEmployment)]);
    }
    if (ip.completionsTotal != null && totalEmployment != null && totalEmployment > 0) {
      const ratio = (ip.completionsTotal / totalEmployment * 100).toFixed(2);
      ipedsRows.push([t('ipeds.saturation_ratio'), `${ratio}%`]);
    }

    if (ipedsRows.length) {
      ipedsEl.innerHTML = `
        <article class="detail-panel ipeds-panel">
          <h3>IPEDS</h3>
          <dl class="detail-dl">
            ${ipedsRows.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}
          </dl>
        </article>
      `;
    }
  }

  // Compute and render three-layer ROI
  const roiLayersEl = document.getElementById('roi-layers');
  if (!roiLayersEl) return;

  _layerState = {
    annualTuition: avgTuition,
    educationYears: duration,
    postDegreeSalary: medianSalary,
    baselineSalary: baseline,
    graduationRate,
    completionsTotal,
    totalEmployment,
  };

  const result = calcThreeLayerROI(_layerState);
  roiLayersEl.innerHTML = renderRoiLayers(result.layers);
  roiLayersEl.classList.remove('hidden');

  // Wire up sliders
  const sliderK = document.getElementById('slider-k');
  const sliderPenalty = document.getElementById('slider-max-penalty');
  const kValueEl = document.getElementById('k-value');
  const penaltyValueEl = document.getElementById('penalty-value');
  const resetBtn = document.getElementById('reset-params');

  function recalcFromSliders() {
    if (!_layerState) return;
    const k = parseFloat(sliderK.value);
    const maxP = parseFloat(sliderPenalty.value);
    kValueEl.textContent = k.toFixed(2);
    penaltyValueEl.textContent = `${(maxP * 100).toFixed(0)}%`;

    const updated = calcThreeLayerROI({ ..._layerState, competitionK: k, maxPenalty: maxP });
    const compEl = document.getElementById('competition-roi-value');
    if (compEl) {
      compEl.textContent = `${updated.layers.competitionAdjusted.roi.toFixed(1)}%`;
    }
  }

  sliderK.addEventListener('input', recalcFromSliders);
  sliderPenalty.addEventListener('input', recalcFromSliders);

  resetBtn.addEventListener('click', () => {
    sliderK.value = DEFAULTS.competitionK;
    sliderPenalty.value = DEFAULTS.maxPenalty;
    recalcFromSliders();
  });

  // Show Calculate ROI button
  const ctaEl = document.getElementById('roi-cta');
  if (!ctaEl) return;

  const params = new URLSearchParams({
    soc: career.soc,
    tuition: avgTuition,
    salary: medianSalary,
    years: duration,
    baseline,
  });
  ctaEl.innerHTML = `
    <a href="#/calculator?${params}" role="button" class="cta-btn">
      ${t('detail.calculate_roi')}
    </a>
  `;
  ctaEl.classList.remove('hidden');
}
