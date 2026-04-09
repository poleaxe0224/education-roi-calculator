/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyChartTheme } from '../src/utils/load-chart.js';

describe('chart theme integration', () => {
  let mockChart;

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    mockChart = { defaults: { color: '', borderColor: '' } };
  });

  describe('applyChartTheme', () => {
    it('sets light defaults when no data-theme', () => {
      applyChartTheme(mockChart);
      expect(mockChart.defaults.color).toBe('#666');
      expect(mockChart.defaults.borderColor).toBe('rgba(0,0,0,0.1)');
    });

    it('sets light defaults when data-theme="light"', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      applyChartTheme(mockChart);
      expect(mockChart.defaults.color).toBe('#666');
    });

    it('sets dark defaults when data-theme="dark"', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      applyChartTheme(mockChart);
      expect(mockChart.defaults.color).toBe('#d1d5db');
      expect(mockChart.defaults.borderColor).toBe('#374151');
    });

    it('can switch between themes', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      applyChartTheme(mockChart);
      expect(mockChart.defaults.color).toBe('#d1d5db');

      document.documentElement.setAttribute('data-theme', 'light');
      applyChartTheme(mockChart);
      expect(mockChart.defaults.color).toBe('#666');
    });
  });

  describe('theme-changed listener via loadChart', () => {
    it('updates Chart.defaults and active instances on theme-changed', async () => {
      const updatedCharts = [];
      const fakeInstance = { update: vi.fn(() => updatedCharts.push('updated')) };

      // Simulate Chart.js on window with instances
      window.Chart = {
        defaults: { color: '#666', borderColor: 'rgba(0,0,0,0.1)' },
        instances: { 0: fakeInstance },
      };

      // Load chart (should resolve immediately since window.Chart exists)
      const { loadChart } = await import('../src/utils/load-chart.js');
      await loadChart();

      // Simulate theme toggle to dark
      document.documentElement.setAttribute('data-theme', 'dark');
      document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: 'dark' } }));

      // Should have updated defaults and called update on instances
      expect(window.Chart.defaults.color).toBe('#d1d5db');
      expect(window.Chart.defaults.borderColor).toBe('#374151');
      expect(fakeInstance.update).toHaveBeenCalled();

      delete window.Chart;
    });
  });
});
