import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import { TooltipProvider } from '@/components/ui/tooltip';
import ProfessorPage from './professor';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

function makeRecord(
  id: number,
  course: string,
  semester: string,
  professor = 'Cox, Adam B.',
  responded = 20,
): RawData['records'][number] {
  return {
    id,
    course,
    professor,
    semester,
    enrolled: 100,
    responded,
    scores: Array(10).fill(4.5),
    inaccessible: false,
  };
}

const dataset = buildDataset({
  questions: [],
  sourceNotes: [],
  records: [
    makeRecord(1, 'Evidence', 'Fall 2022'),
    makeRecord(2, 'Evidence', 'Spring 2026'),
    makeRecord(3, 'Evidence', 'Spring 2026'),
    makeRecord(4, 'Contracts', 'Fall 2025'),
    makeRecord(5, 'Torts', 'Fall 2024'),
  ],
});

function renderProfessorPage(data = dataset, professorSlug = data.professors[0].slug) {
  vi.mocked(useDataset).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  window.history.replaceState(null, '', `/professors/${professorSlug}`);
  return render(
    <TooltipProvider>
      <Router>
        <Route path="/professors/:id" component={ProfessorPage} />
      </Router>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

describe('Professor detail summary', () => {
  it('starts the detail page at the top', () => {
    renderProfessorPage();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('uses the course detail score-chip format for other question scores', () => {
    renderProfessorPage();
    const scoreChip = screen.getByTestId('offering-other-score-1-0');

    expect(scoreChip.textContent).toBe('4.50');
    expect(scoreChip.classList.contains('num')).toBe(true);
    expect(scoreChip.classList.contains('tone-4')).toBe(true);
    expect(scoreChip.classList.contains('rounded')).toBe(true);
  });

  it('replaces the Course Effective card with a full-width three-card summary and course history', () => {
    const { container } = renderProfessorPage();
    const summary = screen.getByTestId('professor-summary-cards');
    expect(summary.className).toContain('md:grid-cols-3');
    expect(summary.children).toHaveLength(3);
    expect(screen.queryByText('Course effective')).toBeNull();
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 3');
    expect(summary.children[0].querySelector('[data-testid="list-professor-distinct-courses"]')).toBeTruthy();
    expect(screen.getByTestId('text-professor-seminars-colloquiums-label').textContent)
      .toBe('Seminars and Colloquiums Taught - 0');
    expect(summary.children[1].textContent).toContain('No seminars or colloquiums taught.');
    expect(screen.getByTestId('text-professor-clinics-externships-label').textContent)
      .toBe('Clinics and Externships Taught - 0');
    expect(summary.children[2].textContent).toContain('No clinics or externships taught.');

    const courses = within(screen.getByTestId('list-professor-distinct-courses'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(courses).toEqual([
      'Evidence (last taught Spring 2026)',
      'Contracts (last taught Fall 2025)',
      'Torts (last taught Fall 2024)',
    ]);
    expect(container.querySelector('[data-testid="text-professor-course-history-0"]')).toBeTruthy();
  });

  it('shows all-time rank, percentile tier, and grade instead of the old score header', () => {
    const rankedDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: Array.from({ length: 100 }, (_, index) => {
        const scores = Array(10).fill(4.5);
        scores[5] = 5 - index * 0.04;
        return {
          ...makeRecord(index + 1, `Course ${index + 1}`, 'Fall 2025', `Prof, Faculty ${index}`, 50),
          scores,
        };
      }),
    });
    const topProfessor = rankedDataset.professors.find((group) => group.name === 'Prof, Faculty 0')!;
    const { unmount } = renderProfessorPage(rankedDataset, topProfessor.slug);

    expect(screen.queryByTestId('text-overall-score')).toBeNull();
    const standingCards = screen.getByTestId('professor-standing-cards');
    const professorHeader = screen.getByTestId('professor-header');
    expect(standingCards.parentElement).toBe(professorHeader);
    expect(professorHeader.className).toContain('xl:grid-cols-');
    expect(standingCards.className).toContain('xl:justify-self-end');
    expect(screen.getByTestId('professor-standing-rank').className).toContain('rounded-[1.6rem]');
    expect(standingCards.textContent).toContain('Rank #1');
    expect(standingCards.textContent).toContain('out of 100 professors rated');
    expect(standingCards.textContent).not.toContain('with 50+ reviews');
    expect(standingCards.textContent).toContain('Effectiveness Score');
    expect(screen.getByTestId('professor-standing-score-value').textContent).toBe('5.00 / 5.00');
    expect(within(screen.getByTestId('professor-standing-score')).getByText('based on 50 reviews')).toBeTruthy();
    expect(screen.queryByText('Percentile Standing')).toBeNull();
    expect(standingCards.textContent).toContain('A+');
    expect(screen.getByTestId('professor-standing-grade-value').className).toContain('bg-emerald-100');
    expect(screen.getByTestId('professor-standing-grade-value').className).toContain('text-4xl');
    expect(screen.queryByText('Based on overall effectiveness percentile')).toBeNull();
    expect(screen.queryByText('Overall this professor was effective')).toBeNull();
    unmount();

    const gradeCases = [
      { index: 2, grade: 'A', colorClass: 'bg-emerald-100' },
      { index: 12, grade: 'A-', colorClass: 'from-lime-100' },
      { index: 32, grade: 'B+', colorClass: 'via-yellow-100' },
      { index: 62, grade: 'B', colorClass: 'bg-yellow-100' },
      { index: 92, grade: 'B-', colorClass: 'to-red-200' },
    ];
    for (const { index, grade, colorClass } of gradeCases) {
      const professor = rankedDataset.professors.find((group) => group.name === `Prof, Faculty ${index}`)!;
      const { unmount: close } = renderProfessorPage(rankedDataset, professor.slug);
      const gradeValue = screen.getByTestId('professor-standing-grade-value');
      expect(gradeValue.textContent).toBe(grade);
      expect(gradeValue.className).toContain(colorClass);
      expect(gradeValue.className).toContain('text-4xl');
      expect(screen.queryByText('Based on overall effectiveness percentile')).toBeNull();
      close();
    }
  });

  it('shows all-time response totals beneath the effectiveness score even when filtering semesters', () => {
    const missingTeachingScore = makeRecord(2, 'Contracts', 'Spring 2026', 'Cox, Adam B.', 30);
    missingTeachingScore.scores[5] = null;
    const reviewDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', 'Fall 2025', 'Cox, Adam B.', 20),
        missingTeachingScore,
        makeRecord(3, 'Evidence', 'Fall 2025', 'Doe, Jane', 1000),
      ],
    });
    const professor = reviewDataset.professors.find((group) => group.name === 'Cox, Adam B.')!;
    renderProfessorPage(reviewDataset, professor.slug);
    const scoreCard = screen.getByTestId('professor-standing-score');
    expect(within(scoreCard).getByText('based on 50 reviews')).toBeTruthy();
    fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Fall 2025' } });
    expect(within(scoreCard).getByText('based on 50 reviews')).toBeTruthy();
    expect(screen.getByTestId('professor-standing-score-value').textContent).toBe('4.50 / 5.00');
  });

  it('explains the 50-review threshold for professor rankings', async () => {
    renderProfessorPage();
    const infoButton = screen.getByTestId('button-professor-rank-info');

    fireEvent.pointerMove(infoButton, { pointerType: 'mouse', clientX: 0, clientY: 0 });

    expect(await screen.findByText(
      'Only professors with 50 or more reviews were rated.',
      {},
      { timeout: 3000 },
    )).toBeTruthy();
  });

  it('keeps rank N/A while grading a professor with fewer than 50 reviews', () => {
    const lowReviewDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', 'Fall 2025', 'Low, Alex', 49),
        makeRecord(2, 'Torts', 'Fall 2025', 'Qualified, Pat', 50),
      ],
    });
    const professor = lowReviewDataset.professors.find((group) => group.label === 'Alex Low')!;
    renderProfessorPage(lowReviewDataset, professor.slug);

    expect(screen.getByTestId('professor-standing-rank-value').textContent).toBe('N/A');
    expect(screen.getByTestId('professor-standing-rank').textContent)
      .toContain('Professors with fewer than 50 reviews are not included in overall rankings');
    expect(screen.getByTestId('professor-standing-score-value').textContent).toBe('4.50 / 5.00');
    expect(screen.getByTestId('professor-standing-grade-value').textContent).toBe('B-');
  });

  it('updates the distinct course list to the selected semester', () => {
    renderProfessorPage();
    fireEvent.change(screen.getByTestId('select-semester'), {
      target: { value: 'Fall 2024' },
    });

    const list = screen.getByTestId('list-professor-distinct-courses');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Torts (last taught Fall 2024)',
    ]);
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 1');
  });

  it('counts only distinct Course-labeled titles but includes every offering in the header', () => {
    const mixedDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', 'Spring 2026'),
        makeRecord(2, 'Evidence', 'Fall 2025'),
        makeRecord(3, 'Contracts', 'Fall 2024'),
        makeRecord(4, 'Research Seminar', 'Spring 2023'),
        makeRecord(5, 'Policy Colloquium', 'Fall 2022'),
        makeRecord(6, 'Housing Clinic', 'Spring 2021'),
        makeRecord(7, 'Judicial Externship', 'Fall 2020'),
        makeRecord(8, 'Housing Clinic Seminar', 'Spring 2019'),
        makeRecord(9, 'Research Seminar', 'Fall 2021'),
        makeRecord(10, 'Housing Clinic', 'Fall 2022'),
      ],
    });
    renderProfessorPage(mixedDataset);
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 2');
    const courseList = within(screen.getByTestId('list-professor-distinct-courses')).getAllByRole('listitem');
    expect(courseList.map((item) => item.textContent)).toEqual([
      'Evidence (last taught Spring 2026)',
      'Contracts (last taught Fall 2024)',
    ]);
    expect(screen.getByText('Seminars and Colloquiums Taught - 3')).toBeTruthy();
    const seminars = within(screen.getByTestId('list-professor-seminars-colloquiums'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(seminars).toEqual([
      'Research Seminar (last taught Spring 2023)',
      'Policy Colloquium (last taught Fall 2022)',
      'Housing Clinic Seminar (last taught Spring 2019)',
    ]);
    expect(screen.getByText('Clinics and Externships Taught - 3')).toBeTruthy();
    const clinics = within(screen.getByTestId('list-professor-clinics-externships'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(clinics).toEqual([
      'Housing Clinic (last taught Fall 2022)',
      'Judicial Externship (last taught Fall 2020)',
      'Housing Clinic Seminar (last taught Spring 2019)',
    ]);
    expect(screen.getByText('Taught 10 Offerings from Spring 2019 - Spring 2026')).toBeTruthy();
    expect(within(screen.getByTestId('list-professor-offerings')).getAllByRole('listitem')).toHaveLength(10);

    fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Spring 2023' } });
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 0');
    expect(screen.queryByTestId('list-professor-distinct-courses')).toBeNull();
    expect(screen.getByText('No courses taught in this semester.')).toBeTruthy();
    expect(screen.getByTestId('text-professor-seminars-colloquiums-label').textContent)
      .toBe('Seminars and Colloquiums Taught - 1');
    expect(within(screen.getByTestId('list-professor-seminars-colloquiums')).getAllByRole('listitem')
      .map((item) => item.textContent))
      .toEqual(['Research Seminar (last taught Spring 2023)']);
    expect(screen.getByTestId('text-professor-clinics-externships-label').textContent)
      .toBe('Clinics and Externships Taught - 0');
    expect(screen.getByText('No clinics or externships taught in this semester.')).toBeTruthy();
    expect(screen.getByTestId('list-professor-offerings').textContent).toContain('Research Seminar');
    expect(screen.getByText('Taught 10 Offerings from Spring 2019 - Spring 2026')).toBeTruthy();
  });

  it('shows a reusable name-variation note on Scott Hemphill’s profile', () => {
    const hemphillDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Antitrust Law', 'Fall 2025', 'Hemphill, Scott'),
        makeRecord(2, 'Survey of Intellectual Property (for 1Ls)', 'Spring 2019', 'Hemphill, Christopher'),
      ],
    });
    const scott = hemphillDataset.professors.find((group) => group.label === 'Scott Hemphill')!;
    renderProfessorPage(hemphillDataset, scott.slug);

    expect(screen.getByTestId('text-professor-name').textContent).toBe('Scott Hemphill');
    expect(screen.getByTestId('professor-note-scott-hemphill-name-variation-0').textContent)
      .toContain('Some course reviews refer to Scott Hemphill as Christopher Hemphill.');
    expect(screen.getByTestId('list-professor-offerings').textContent)
      .toContain('Survey of Intellectual Property (for 1Ls)');
  });

  it('uses consistent blue, brown, and purple blocks for matching course offerings', () => {
    const yoshinoDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Constitutional Law (for 1Ls)', 'Spring 2026', 'Yoshino, Kenji'),
        makeRecord(2, 'Free Expression and Social Media Seminar', 'Fall 2025', 'Yoshino, Kenji'),
        makeRecord(3, 'Leadership, Diversity, and Inclusion', 'Spring 2025', 'Yoshino, Kenji'),
        makeRecord(4, 'Constitutional Law (for 1Ls)', 'Fall 2024', 'Yoshino, Kenji'),
        makeRecord(5, 'Free Expression and Social Media Seminar', 'Spring 2024', 'Yoshino, Kenji'),
      ],
    });
    const professor = yoshinoDataset.professors.find((group) => group.label === 'Kenji Yoshino')!;
    renderProfessorPage(yoshinoDataset, professor.slug);

    const colorFor = (recordId: number) =>
      screen.getByTestId(`course-color-block-${recordId}`).style.backgroundColor;
    const blue = colorFor(1);
    const brown = colorFor(2);
    const purple = colorFor(3);

    expect(blue).toBe('rgb(37, 99, 235)');
    expect(brown).toBe('rgb(139, 90, 43)');
    expect(purple).toBe('rgb(124, 58, 237)');
    expect(colorFor(4)).toBe(blue);
    expect(colorFor(5)).toBe(brown);
    expect(new Set([blue, brown, purple]).size).toBe(3);

    const row = screen.getByTestId('row-offering-1');
    const marker = screen.getByTestId('course-color-block-1');
    expect(row.classList.contains('relative')).toBe(true);
    expect(marker.classList.contains('absolute')).toBe(true);
    expect(marker.classList.contains('left-0')).toBe(true);
    expect(marker.classList.contains('inset-y-0')).toBe(true);
  });
});
