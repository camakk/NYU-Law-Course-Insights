import { describe, expect, it } from 'vitest';
import { buildDataset, calculateProfessorStanding, classifyCourseLabels, friendlyName, is1LCourse } from './data';

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

describe('professor identity aliases', () => {
  it('adds periods after middle initials in display names without changing source names', () => {
    expect(friendlyName('Pildes, Richard H')).toBe('Richard H. Pildes');
    expect(friendlyName('Brooks, Richard R. W.')).toBe('Richard R. W. Brooks');
    expect(friendlyName('Walker, Alex Ferrara')).toBe('Alex Ferrara Walker');

    const sourceProfessor = 'Pildes, Richard H';
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [{
        id: 1,
        course: 'Constitutional Law',
        professor: sourceProfessor,
        semester: 'Fall 2025',
        enrolled: 10,
        responded: 5,
        scores: Array(10).fill(4),
        inaccessible: false,
      }],
    });

    expect(dataset.professors[0].label).toBe('Richard H. Pildes');
    expect(dataset.professors[0].name).toBe(sourceProfessor);
    expect(dataset.records[0].professor).toBe(sourceProfessor);
  });

  it('groups confirmed Adam Cox name variants under Adam B. Cox', () => {
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: ['Cox, Adam B.', 'Cox, Adam', 'Cox, Adam M.'].map((professor, index) => ({
        id: index + 1,
        course: 'Contracts',
        professor,
        semester: 'Fall 2025',
        enrolled: 10,
        responded: 5,
        scores: Array(10).fill(4),
        inaccessible: false,
      })),
    });

    const adamB = dataset.professors.find((group) => group.label === 'Adam B. Cox');
    expect(adamB?.records.map((record) => record.professor)).toEqual([
      'Cox, Adam B.',
      'Cox, Adam B.',
      'Cox, Adam B.',
    ]);
    expect(dataset.profSlugByName.get('Cox, Adam')).toBe(adamB?.slug);
    expect(dataset.profSlugByName.get('Cox, Adam M.')).toBe(adamB?.slug);
    expect(dataset.professors.some((group) => group.label === 'Adam M. Cox')).toBe(false);
  });

  it('keeps the confirmed typo alias resolvable when it is absent from source records', () => {
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [{
        id: 1,
        course: 'Contracts',
        professor: 'Cox, Adam B.',
        semester: 'Fall 2025',
        enrolled: 10,
        responded: 5,
        scores: Array(10).fill(4),
        inaccessible: false,
      }],
    });

    expect(dataset.profSlugByName.get('Cox, Adam M.')).toBe(dataset.professors[0].slug);
  });

  it('groups Christopher Hemphill records under Scott Hemphill with a profile note', () => {
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        {
          id: 1,
          course: 'Antitrust Law',
          professor: 'Hemphill, Scott',
          semester: 'Fall 2025',
          enrolled: 50,
          responded: 30,
          scores: Array(10).fill(4.5),
          inaccessible: false,
        },
        {
          id: 2,
          course: 'Survey of Intellectual Property (for 1Ls)',
          professor: 'Hemphill, Christopher',
          semester: 'Spring 2019',
          enrolled: 40,
          responded: 20,
          scores: Array(10).fill(4.2),
          inaccessible: false,
        },
      ],
    });
    const scott = dataset.professors.find((group) => group.label === 'Scott Hemphill');

    expect(dataset.professors).toHaveLength(1);
    expect(scott?.records.map((record) => record.professor)).toEqual([
      'Hemphill, Scott',
      'Hemphill, Scott',
    ]);
    expect(scott?.metrics[5].responses).toBe(50);
    expect(dataset.profSlugByName.get('Hemphill, Christopher')).toBe(scott?.slug);
    expect(dataset.courses.find((group) => group.name === 'Survey of Intellectual Property (for 1Ls)')?.records[0].professor)
      .toBe('Hemphill, Scott');
    expect(scott?.profileNotes).toEqual([{
      type: 'name-variation',
      text: 'Some course reviews refer to Scott Hemphill as Christopher Hemphill.',
    }]);
  });

  it('groups Christopher Sprigman records under Christopher Jon Sprigman without mutating source records', () => {
    const sourceRecords = [
      {
        id: 1,
        course: 'Intellectual Property',
        professor: 'Sprigman, Christopher',
        semester: 'Spring 2017',
        enrolled: 30,
        responded: 20,
        scores: Array(10).fill(4.2),
        inaccessible: false,
      },
      {
        id: 2,
        course: 'Copyright Law',
        professor: 'Sprigman, Christopher Jon',
        semester: 'Fall 2025',
        enrolled: 40,
        responded: 25,
        scores: Array(10).fill(4.6),
        inaccessible: false,
      },
    ];
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: sourceRecords,
    });
    const professor = dataset.professors.find((group) => group.label === 'Christopher Jon Sprigman');

    expect(dataset.professors).toHaveLength(1);
    expect(professor?.records.map((record) => record.professor)).toEqual([
      'Sprigman, Christopher Jon',
      'Sprigman, Christopher Jon',
    ]);
    expect(professor?.records.map((record) => record.id)).toEqual([2, 1]);
    expect(professor?.metrics[5].responses).toBe(45);
    expect(dataset.profSlugByName.get('Sprigman, Christopher')).toBe(professor?.slug);
    expect(sourceRecords.map((record) => record.professor)).toEqual([
      'Sprigman, Christopher',
      'Sprigman, Christopher Jon',
    ]);
  });
});

describe('professor standing', () => {
  const scores = Array.from({ length: 100 }, (_, index) => 100 - index);

  it('assigns percentile tiers and grades from overall-score rank bands', () => {
    expect(calculateProfessorStanding(scores, 100)).toEqual({
      rank: 1,
      totalRated: 100,
      topPercent: 1,
      grade: 'A+',
    });
    expect(calculateProfessorStanding(scores, 99).grade).toBe('A+');
    expect(calculateProfessorStanding(scores, 98).grade).toBe('A');
    expect(calculateProfessorStanding(scores, 97).grade).toBe('A');
    expect(calculateProfessorStanding(scores, 89).grade).toBe('A');
    expect(calculateProfessorStanding(scores, 88).grade).toBe('A-');
    expect(calculateProfessorStanding(scores, 69).grade).toBe('A-');
    expect(calculateProfessorStanding(scores, 68).grade).toBe('B+');
    expect(calculateProfessorStanding(scores, 39).grade).toBe('B+');
    expect(calculateProfessorStanding(scores, 38).grade).toBe('B');
    expect(calculateProfessorStanding(scores, 9).grade).toBe('B');
    expect(calculateProfessorStanding(scores, 8).grade).toBe('B-');
  });

  it('uses the strongest applicable top-percent group and keeps ties at one rank', () => {
    const largeScores = Array.from({ length: 1000 }, (_, index) => 1000 - index);
    expect(calculateProfessorStanding(largeScores, 996).topPercent).toBe(0.5);
    expect(calculateProfessorStanding([5, 4, 4, 3], 4)).toMatchObject({
      rank: 2,
      totalRated: 4,
      topPercent: 50,
    });
  });

  it('leaves professors without an overall rating unranked', () => {
    expect(calculateProfessorStanding([null, 4, Number.NaN], null)).toEqual({
      rank: null,
      totalRated: 1,
      topPercent: null,
      grade: null,
    });
  });
});

describe('professor activity status', () => {
  it('marks professors active only when an offering falls from Fall 2023 through Spring 2026', () => {
    const activeSemesters = [
      'Fall 2023',
      'Spring 2024',
      'Fall 2024',
      'Spring 2025',
      'Fall 2025',
      'Spring 2026',
    ];
    const inactiveSemesters = [
      'Fall 2021',
      'Spring 2022',
      'Fall 2022',
      'Spring 2023',
      'Spring 2021',
    ];
    const makeRecord = (id: number, professor: string, semester: string, inaccessible = false) => ({
      id,
      course: `Course ${id}`,
      professor,
      semester,
      enrolled: 20,
      responded: inaccessible ? 0 : 10,
      scores: inaccessible ? Array(10).fill(null) : Array(10).fill(4),
      inaccessible,
    });
    const dataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        ...activeSemesters.map((semester, index) =>
          makeRecord(index + 1, `Active ${index}, Professor`, semester, index === 0),
        ),
        ...inactiveSemesters.map((semester, index) =>
          makeRecord(activeSemesters.length + index + 1, `Inactive ${index}, Professor`, semester),
        ),
      ],
    });

    for (let index = 0; index < activeSemesters.length; index++) {
      expect(dataset.professors.find((group) => group.name === `Active ${index}, Professor`)?.professorStatus).toBe('Active');
    }
    for (let index = 0; index < inactiveSemesters.length; index++) {
      expect(dataset.professors.find((group) => group.name === `Inactive ${index}, Professor`)?.professorStatus).toBe('Inactive');
    }
  });
});
