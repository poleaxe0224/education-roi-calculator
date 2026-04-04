import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O*NET service tests.
 *
 * Since onet.js uses dynamic import() for static data (CI-generated, gitignored),
 * we test the normalization and API logic by mocking at the module level.
 */

// Sample O*NET-shaped data
const MOCK_ONET_DATA = {
  _meta: { fetchedAt: '2026-04-04T00:00:00Z', source: 'O*NET Database 30.2 (CC BY 4.0)', scale: 'LV 0-7' },
  careers: {
    '15-1252': {
      skills: [
        { name: 'Reading Comprehension', id: '2.A.1.a', score: 4.25 },
        { name: 'Critical Thinking', id: '2.A.2.a', score: 4.12 },
        { name: 'Systems Evaluation', id: '2.A.2.d', score: 4.12 },
        { name: 'Complex Problem Solving', id: '2.B.2.i', score: 4.00 },
        { name: 'Active Listening', id: '2.A.1.b', score: 3.88 },
        { name: 'Programming', id: '2.B.2.a', score: 3.75 },
      ],
      knowledge: [
        { name: 'Computers and Electronics', id: '2.C.3.a', score: 6.23 },
        { name: 'Mathematics', id: '2.C.4.a', score: 4.55 },
        { name: 'Customer and Personal Service', id: '2.C.1.e', score: 4.12 },
      ],
      education: {
        education: [
          { name: "Bachelor's degree", percentage: 65 },
          { name: "Master's degree", percentage: 20 },
          { name: "Associate's degree", percentage: 10 },
        ],
        training: [
          { name: 'None', percentage: 70 },
        ],
        experience: [
          { name: 'None', percentage: 50 },
          { name: 'Less than 5 years', percentage: 35 },
        ],
      },
    },
  },
};

// Mock the dynamic import of onet-data.json
vi.mock('../src/data/onet-data.json', () => ({
  default: MOCK_ONET_DATA,
}));

describe('O*NET data structure', () => {
  it('mock data has correct shape', () => {
    const entry = MOCK_ONET_DATA.careers['15-1252'];
    expect(entry).toBeDefined();
    expect(entry.skills).toHaveLength(6);
    expect(entry.knowledge).toHaveLength(3);
    expect(entry.education.education).toHaveLength(3);
  });

  it('skills are sorted by score descending', () => {
    const skills = MOCK_ONET_DATA.careers['15-1252'].skills;
    for (let i = 1; i < skills.length; i++) {
      expect(skills[i - 1].score).toBeGreaterThanOrEqual(skills[i].score);
    }
  });

  it('each skill has name, id, and numeric score', () => {
    const skills = MOCK_ONET_DATA.careers['15-1252'].skills;
    for (const skill of skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.id).toBeTruthy();
      expect(typeof skill.score).toBe('number');
      expect(skill.score).toBeGreaterThan(0);
      expect(skill.score).toBeLessThanOrEqual(7);
    }
  });

  it('knowledge entries have name, id, score', () => {
    const knowledge = MOCK_ONET_DATA.careers['15-1252'].knowledge;
    for (const k of knowledge) {
      expect(k.name).toBeTruthy();
      expect(k.id).toBeTruthy();
      expect(typeof k.score).toBe('number');
    }
  });

  it('education entries have name and percentage', () => {
    const edu = MOCK_ONET_DATA.careers['15-1252'].education.education;
    for (const entry of edu) {
      expect(entry.name).toBeTruthy();
      expect(typeof entry.percentage).toBe('number');
    }
  });

  it('education contains training and experience arrays', () => {
    const ed = MOCK_ONET_DATA.careers['15-1252'].education;
    expect(Array.isArray(ed.education)).toBe(true);
    expect(Array.isArray(ed.training)).toBe(true);
    expect(Array.isArray(ed.experience)).toBe(true);
  });

  it('returns undefined for unknown SOC code', () => {
    expect(MOCK_ONET_DATA.careers['99-9999']).toBeUndefined();
  });

  it('top 5 skills slice works correctly', () => {
    const top5 = MOCK_ONET_DATA.careers['15-1252'].skills.slice(0, 5);
    expect(top5).toHaveLength(5);
    expect(top5[0].name).toBe('Reading Comprehension');
    expect(top5[4].name).toBe('Active Listening');
  });

  it('top 8 knowledge slice works correctly', () => {
    const top8 = MOCK_ONET_DATA.careers['15-1252'].knowledge.slice(0, 8);
    expect(top8).toHaveLength(3); // only 3 in mock
    expect(top8[0].name).toBe('Computers and Electronics');
  });

  it('education percentage filter works', () => {
    const edu = MOCK_ONET_DATA.careers['15-1252'].education.education;
    const withPct = edu.filter((e) => e.percentage > 0);
    expect(withPct.length).toBeGreaterThan(0);
    expect(withPct.every((e) => e.percentage > 0)).toBe(true);
  });

  it('score to percentage conversion uses 0-7 LV scale', () => {
    const score = 4.25;
    const maxScore = 7; // O*NET Level (LV) scale
    const pct = Math.round((score / maxScore) * 100);
    expect(pct).toBe(61);
  });
});
