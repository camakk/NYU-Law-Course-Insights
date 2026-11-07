import { describe, expect, it } from 'vitest';
import { buildDataset, classifyCourseLabels, is1LCourse } from './data';

describe('course audience labels', () => {
  it('adds a 1L label to titles that say for 1Ls', () => {
    expect(classifyCourseLabels('Constitutional Law (for 1Ls)')).toEqual(['1L']);
    expect(is1LCourse('Constitutional Law (for 1Ls)')).toBe(true);
  });

  it('recognizes LL.M. and LLM title variants', () => {
    expect(classifyCourseLabels('Civil Litigation (for LL.M. Students Only)')).toEqual(['LLM']);
    expect(classifyCourseLabels('Conflict of Laws (for LL.M.s)')).toEqual(['LLM']);
    expect(classifyCourseLabels('Global Justice Clinic Seminar - for LLMs')).toEqual(['LLM']);
    expect(classifyCourseLabels('LL.M. Honors Seminar')).toEqual(['LLM']);
    expect(is1LCourse('Contracts (For LL.M. Students)')).toBe(false);
  });

  it('allows both labels and attaches them to records and course groups', () => {
    const course = 'International Law (for 1Ls) - for LL.M.s';
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [{
        id: 1,
        course,
        professor: 'Professor Example',
        semester: 'Spring 2025',
        enrolled: 10,
        responded: 5,
        scores: Array(10).fill(4),
        inaccessible: false,
      }],
    });

    expect(classifyCourseLabels(course)).toEqual(['1L', 'LLM']);
    expect(dataset.records[0].courseLabels).toEqual(['1L', 'LLM']);
    expect(dataset.records[0].is1LCourse).toBe(true);
    expect(dataset.courses[0].courseLabels).toEqual(['1L', 'LLM']);
  });

  it('attaches neither audience label when the title has no marker', () => {
    expect(classifyCourseLabels('Advanced Constitutional Law')).toEqual([]);
    expect(is1LCourse('Advanced Constitutional Law')).toBe(false);

    // Existing first-year course classification remains intact without an explicit title marker.
    expect(classifyCourseLabels('Torts')).toEqual([]);
    expect(is1LCourse('Torts')).toBe(true);
  });
});
