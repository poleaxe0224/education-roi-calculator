/**
 * Shared career economics fetcher — DRY extraction from detail.js + compare.js.
 *
 * Fetches wages, tuition, and IPEDS data in parallel for a SOC code,
 * then computes three-layer ROI. Used by profile (Level 3), detail, and compare views.
 */

import {
  getBaselineSalary,
  getEducationDuration,
  getGradPhaseDuration,
  isGraduateDegree,
} from '../engine/mappings.js';
import { calcThreeLayerROI } from '../engine/roi.js';
import * as bls from './bls.js';
import * as scorecard from './scorecard.js';
import * as ipeds from './ipeds.js';

/**
 * Fetch all economic data for a career and compute ROI.
 *
 * For graduate degrees (masters, doctoral, firstProfessional), the ROI
 * calculation includes 4 years of undergraduate study + N years of
 * graduate study, with split tuition rates. Baseline salary is always
 * high school level (teen perspective).
 *
 * @param {{ soc: string, cip: string, typicalDegree: string }} career — from CAREER_MAPPINGS
 * @param {import('../engine/mappings.js').BaselineMode} [baselineMode='teen']
 * @returns {Promise<object>}
 */
export async function fetchCareerEconomics(career, baselineMode = 'teen') {
  const degree = career.typicalDegree;
  const duration = getEducationDuration(degree);
  const baseline = getBaselineSalary(degree, baselineMode);
  const isGrad = isGraduateDegree(degree);

  const [wageResult, tuitionResult, ipedsResult] = await Promise.allSettled([
    bls.getWageData(career.soc),
    scorecard.getAverageTuition(career.cip),
    ipeds.getIpedsData(career.cip),
  ]);

  const wageData = wageResult.status === 'fulfilled' ? wageResult.value : null;
  const tuitionData = tuitionResult.status === 'fulfilled' ? tuitionResult.value : null;
  const ipedsData = ipedsResult.status === 'fulfilled' ? ipedsResult.value : null;

  const medianSalary = wageData?.annualMedian || baseline * 1.5;
  const salaryFallback = !wageData?.annualMedian;
  const totalEmployment = wageData?.employment ?? wageData?.tot_emp ?? null;
  const graduationRate = ipedsData?.graduationRate ?? null;
  const completionsTotal = ipedsData?.completionsTotal ?? null;

  // Tuition: graduate degrees use split undergrad + grad rates
  const gradTuition = tuitionData?.netPrice || tuitionData?.inState || 20_000;
  let roiInputs;

  if (isGrad) {
    const undergradYears = 4;
    const gradPhaseYears = getGradPhaseDuration(degree);
    // Undergrad tuition: use bachelor's fallback (CIP-specific data is for the grad program)
    const undergradFallback = scorecard.getTuitionFallback('bachelors');
    const undergradTuition = undergradFallback.netPrice;

    roiInputs = {
      undergradTuition,
      gradTuition,
      undergradYears,
      educationYears: duration,
      postDegreeSalary: medianSalary,
      baselineSalary: baseline,
      graduationRate,
      completionsTotal,
      totalEmployment,
    };
  } else {
    roiInputs = {
      annualTuition: gradTuition,
      educationYears: duration,
      postDegreeSalary: medianSalary,
      baselineSalary: baseline,
      graduationRate,
      completionsTotal,
      totalEmployment,
    };
  }

  const roi = calcThreeLayerROI(roiInputs);

  return {
    wageData,
    tuitionData,
    ipedsData,
    medianSalary,
    avgTuition: gradTuition,
    undergradTuition: isGrad ? roiInputs.undergradTuition : null,
    gradTuition: isGrad ? gradTuition : null,
    totalEmployment,
    graduationRate,
    completionsTotal,
    duration,
    undergradYears: isGrad ? 4 : null,
    gradPhaseYears: isGrad ? getGradPhaseDuration(degree) : null,
    isGraduateDegree: isGrad,
    baseline,
    salaryFallback,
    roi,
  };
}
