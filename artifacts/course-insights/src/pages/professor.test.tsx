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
  it('matches course filter chips and checkboxes to row colors in both checked states', () => {
    renderProfessorPage(dataset);
    for (const [course, recordId] of [['Evidence', 2], ['Contracts', 4], ['Torts', 5]] as const) {
      const checkbox = screen.getByRole('checkbox', { name: course });
      const chip = checkbox.closest('label')!;
      const markerColor = screen.getByTestId(`course-color-block-${recordId}`).style.backgroundColor;
      expect(checkbox.style.backgroundColor).toBe(markerColor);
      expect(checkbox.style.borderColor).toBe(markerColor);
      expect(chip.style.borderColor).toBe(markerColor);
      const courseColor = chip.style.getPropertyValue('--course-color');
      expect(courseColor).toBeTruthy();
      expect(chip.className).toContain('var(--course-color)_12%');
      expect(chip.className).toContain('hover:bg-[color-mix');

      fireEvent.click(checkbox);
      expect(checkbox.getAttribute('data-state')).toBe('unchecked');
      expect(checkbox.style.backgroundColor).toBe('transparent');
      expect(checkbox.style.borderColor).toBe(markerColor);
      expect(chip.style.getPropertyValue('--course-color')).toBe(courseColor);
      expect(chip.className).toContain('var(--course-color)_4%');

      fireEvent.click(checkbox);
      expect(checkbox.getAttribute('data-state')).toBe('checked');
      expect(checkbox.style.backgroundColor).toBe(markerColor);
      expect(screen.getByTestId(`course-color-block-${recordId}`).style.backgroundColor).toBe(markerColor);
    }
  });

  it.each([
    ['Fall 2025', 'Spring 2025', true],
    ['Fall 2025', 'Spring 2024', true],
    ['Fall 2025', 'Fall 2024', true],
    ['Spring 2026', 'Spring 2025', true],
    ['Fall 2025', 'Fall 2025', false],
    ['Spring 2026', 'Spring 2026', false],
    ['Spring 2026', 'Fall 2025', false],
    ['Spring 2026', 'Fall 2024', true],
    ['Spring 2026', 'Fall 2023', true],
    ['Fall 2025', 'Summer 2025', false],
  ])('uses the correct divider between %s and %s', (previous, current, thick) => {
    renderProfessorPage(buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', previous),
        makeRecord(2, 'Contracts', current),
      ],
    }));
    const first = screen.getByTestId('row-offering-1');
    const second = screen.getByTestId('row-offering-2');
    expect(first.classList.contains('border-t')).toBe(false);
    expect(first.classList.contains('border-t-[3px]')).toBe(false);
    expect(second.classList.contains('border-t-[3px]')).toBe(thick);
    expect(second.classList.contains('border-t')).toBe(!thick);
  });

  it('recalculates dividers from adjacent visible offerings when course filters change', () => {
    renderProfessorPage(buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Alpha', 'Fall 2026'),
        makeRecord(2, 'Beta', 'Spring 2026'),
        makeRecord(3, 'Gamma', 'Fall 2025'),
        makeRecord(4, 'Delta', 'Spring 2025'),
      ],
    }));
    const gamma = screen.getByTestId('row-offering-3');
    const delta = screen.getByTestId('row-offering-4');
    expect(gamma.classList.contains('border-t')).toBe(true);
    expect(delta.classList.contains('border-t-[3px]')).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(gamma.classList.contains('border-t-[3px]')).toBe(true);
    expect(gamma.classList.contains('border-t')).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(gamma.classList.contains('border-t')).toBe(true);
    expect(gamma.classList.contains('border-t-[3px]')).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Gamma' }));
    expect(delta.classList.contains('border-t-[3px]')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(delta.classList.contains('border-t-[3px]')).toBe(false);
    expect(delta.classList.contains('border-t')).toBe(false);
  });

  it('recalculates Spring-to-Fall year gaps after filtering and restoring courses', () => {
    renderProfessorPage(buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', 'Spring 2026'),
        makeRecord(2, 'Contracts', 'Spring 2025'),
        makeRecord(3, 'Torts', 'Fall 2024'),
      ],
    }));
    const torts = screen.getByTestId('row-offering-3');
    expect(torts.classList.contains('border-t')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Contracts' }));
    expect(torts.classList.contains('border-t-[3px]')).toBe(true);
    expect(torts.classList.contains('border-t')).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Contracts' }));
    expect(torts.classList.contains('border-t')).toBe(true);
    expect(torts.classList.contains('border-t-[3px]')).toBe(false);
  });

  it.each([
    [7, '• 7 responses'],
    [0, '• 0 responses'],
    [null, '• N/A responses'],
  ])('shows the offering response count %s inline after its course name', (responded, label) => {
    const responseDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        { ...makeRecord(1, 'Evidence', 'Spring 2026'), responded },
        makeRecord(2, 'Evidence', 'Fall 2025', 'Cox, Adam B.', 90),
      ],
    });
    renderProfessorPage(responseDataset);
    const link = screen.getByTestId('link-offering-course-1');
    const count = screen.getByTestId('offering-response-count-1');
    expect(count.textContent).toBe(label);
    expect(link.nextElementSibling).toBe(count);
    expect(link.className).not.toContain('block');
    expect(count.className).toContain('text-[11px]');
    expect(count.className).toContain('text-muted-foreground/80');
    expect(screen.getByTestId('offering-response-count-2').textContent).toBe('• 90 responses');
  });

  it.each([
    ['Spring 2026', "S '26"],
    ['Fall 2025', "F '25"],
    ['Summer 2024', "Su '24"],
    ['Winter 2023', "W '23"],
    ['Unspecified term', 'Unspecified term'],
  ])('shows %s in a dedicated semester column as %s', (semester, shortLabel) => {
    const semesterDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [makeRecord(1, 'Evidence', semester)],
    });
    renderProfessorPage(semesterDataset);
    const cell = screen.getByTestId('offering-semester-1');
    expect(cell.textContent).toBe(shortLabel);
    expect(cell.getAttribute('title')).toBe(semester);
    expect(cell.getAttribute('aria-label')).toBe(semester);
    expect(cell.className).toContain('text-base');
    expect(cell.className).toContain('font-medium');
    expect(cell.className).toContain('text-muted-foreground');
    expect(cell.className).toContain('font-sans');
    expect(cell.className).not.toContain('font-display');
    expect(cell.previousElementSibling?.getAttribute('data-testid')).toBe('course-color-block-1');
    expect(cell.nextElementSibling?.querySelector('[data-testid="link-offering-course-1"]')).toBeTruthy();
    expect(screen.getByTestId('header-offering-semester').textContent).toBe('Semester');
    expect(screen.getByTestId('header-offering-semester').nextElementSibling?.textContent).toBe('Course offering');
  });

  it('falls back to the Professors page when a profile is opened directly', () => {
    renderProfessorPage();
    expect(window.history.state).toBeNull();
    fireEvent.click(screen.getByTestId('link-back'));
    expect(window.location.pathname).toBe('/professors');
  });

  it('filters every offering of a course and restores it without changing all-time summaries', () => {
    renderProfessorPage();
    const controls = within(screen.getByTestId('professor-history-course-filters'));
    expect(controls.getAllByRole('checkbox')).toHaveLength(3);
    for (const checkbox of controls.getAllByRole('checkbox')) {
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
    }
    expect(within(screen.getByTestId('list-professor-offerings')).getAllByRole('listitem')).toHaveLength(5);

    fireEvent.click(controls.getByRole('checkbox', { name: 'Evidence' }));
    expect(screen.queryByTestId('row-offering-1')).toBeNull();
    expect(screen.queryByTestId('row-offering-2')).toBeNull();
    expect(screen.queryByTestId('row-offering-3')).toBeNull();
    expect(within(screen.getByTestId('list-professor-offerings')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 3');

    fireEvent.click(controls.getByRole('checkbox', { name: 'Contracts' }));
    fireEvent.click(controls.getByRole('checkbox', { name: 'Torts' }));
    expect(screen.getByText('No courses selected')).toBeTruthy();
    expect(screen.queryByTestId('list-professor-offerings')).toBeNull();
    expect(controls.getAllByRole('checkbox')).toHaveLength(3);

    fireEvent.click(controls.getByRole('checkbox', { name: 'Evidence' }));
    const restored = within(screen.getByTestId('list-professor-offerings')).getAllByRole('listitem');
    expect(restored.map((row) => row.getAttribute('data-testid'))).toEqual([
      'row-offering-2', 'row-offering-3', 'row-offering-1',
    ]);
    expect(restored[0].textContent).toContain('Section 1');
    expect(restored[1].textContent).toContain('Section 2');
  });

  it('tailors the course checkboxes to the professor including seminars and clinics', () => {
    const tailored = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Evidence', 'Spring 2026'),
        makeRecord(2, 'Research Seminar', 'Fall 2025'),
        makeRecord(3, 'Housing Clinic Seminar', 'Fall 2024'),
        makeRecord(4, 'Torts', 'Spring 2026', 'Doe, Jane'),
      ],
    });
    const professor = tailored.professors.find((group) => group.name === 'Cox, Adam B.')!;
    renderProfessorPage(tailored, professor.slug);
    const controls = within(screen.getByTestId('professor-history-course-filters'));
    expect(controls.getAllByRole('checkbox').map((checkbox) => checkbox.getAttribute('aria-label'))).toEqual([
      'Evidence', 'Housing Clinic Seminar', 'Research Seminar',
    ]);
    expect(controls.queryByRole('checkbox', { name: 'Torts' })).toBeNull();
    fireEvent.click(controls.getByRole('checkbox', { name: 'Housing Clinic Seminar' }));
    expect(screen.queryByTestId('row-offering-3')).toBeNull();
    expect(screen.getByTestId('row-offering-2')).toBeTruthy();
  });

  it('starts the detail page at the top', () => {
    renderProfessorPage();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(screen.getByRole('heading', {
      name: `Professor ${dataset.professors[0].label}'s Teaching History`,
    })).toBeTruthy();
  });

  it('uses the course detail score-chip format for other question scores', () => {
    renderProfessorPage();
    const scoreChip = screen.getByTestId('offering-other-score-1-0');
    const scoreCells = screen.getByTestId('offering-score-columns-1');
    const headerCells = screen.getByTestId('header-professor-score-columns');

    expect(scoreChip.textContent).toBe('4.50');
    expect(scoreChip.classList.contains('num')).toBe(true);
    expect(scoreChip.classList.contains('tone-4')).toBe(true);
    expect(scoreChip.classList.contains('rounded')).toBe(true);
    expect(scoreCells.className).toContain('md:grid-cols-9');
    expect(scoreCells.className).toContain('xl:contents');
    expect(Array.from(scoreCells.children).map((cell) => cell.getAttribute('data-testid'))).toEqual([
      'offering-other-question-1-0',
      'offering-other-question-1-1',
      'offering-other-question-1-2',
      'offering-other-question-1-3',
      'offering-other-question-1-4',
      'offering-course-overall-column-1',
      'offering-other-question-1-6',
      'offering-other-question-1-7',
      'offering-other-question-1-9',
    ]);
    expect(screen.getAllByTestId(/^header-professor-question-/)).toHaveLength(8);
    expect(screen.getByTestId('header-professor-question-0').textContent).toBe('Prepared\nfor Class');
    expect(screen.getByTestId('header-professor-question-0').className).toContain('whitespace-pre-line');
    expect(screen.queryByTestId('header-professor-question-5')).toBeNull();
    expect(Array.from(headerCells.children).map((cell) => cell.textContent?.trim())).toEqual([
      'Prepared\nfor Class', 'Clear Communication', 'Independent Thought', 'Respectful\nIn Class', 'Accessible\nOutside Class', 'Course Overall', 'Attendance\nImportant', 'Workload\nProper', 'Materials\nOrganized',
    ]);
    for (const index of [6, 7, 9]) {
      expect(screen.getByTestId(`header-professor-question-${index}`).className)
        .toBe(screen.getByTestId('header-professor-question-0').className);
    }
    expect(screen.getByTestId('offering-professor-score-1').className).toContain('w-[6.5rem]');
    expect(screen.getByTestId('offering-course-score-1').className).toContain('w-[6.5rem]');
    for (const id of ['header-teaching-overall', 'header-course-overall']) {
      const header = screen.getByTestId(id);
      expect(header.className).toContain('w-[6.5rem]');
      expect(header.className).toContain('justify-self-end');
      expect(header.className).toContain('text-center');
    }
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

  it('shows all-time response totals beneath the effectiveness score without a semester filter', () => {
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
    expect(screen.queryByTestId('select-semester')).toBeNull();
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

  it('keeps the all-time course list visible without a semester selector', () => {
    renderProfessorPage();
    expect(screen.queryByTestId('select-semester')).toBeNull();

    const list = screen.getByTestId('list-professor-distinct-courses');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Evidence (last taught Spring 2026)',
      'Contracts (last taught Fall 2025)',
      'Torts (last taught Fall 2024)',
    ]);
    expect(screen.getByTestId('text-professor-distinct-courses-label').textContent).toBe('Courses Taught - 3');
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
    expect(screen.getByText('Seminars and Colloquiums Taught - 2')).toBeTruthy();
    const seminars = within(screen.getByTestId('list-professor-seminars-colloquiums'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(seminars).toEqual([
      'Research Seminar (last taught Spring 2023)',
      'Policy Colloquium (last taught Fall 2022)',
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
    expect(screen.queryByTestId('select-semester')).toBeNull();
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

    expect(blue).toBe('rgb(82, 119, 157)');
    expect(brown).toBe('rgb(139, 112, 85)');
    expect(purple).toBe('rgb(138, 109, 158)');
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

  it('uses distinct muted hues for successive courses and keeps colors stable when filtering', () => {
    const paletteDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((course, i) =>
        makeRecord(i + 1, course, 'Spring 2026')),
    });
    renderProfessorPage(paletteDataset);
    const color = (id: number) => screen.getByTestId(`course-color-block-${id}`).style.backgroundColor;
    expect([color(1), color(2), color(4), color(5), color(3)]).toEqual([
      'rgb(82, 119, 157)', 'rgb(179, 154, 85)', 'rgb(138, 109, 158)',
      'rgb(113, 142, 120)', 'rgb(184, 117, 112)',
    ]);
    const gammaColor = color(3);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(color(3)).toBe(gammaColor);
  });
});
