import { act, fireEvent, render as renderPage, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import { recentProfessorScoreColor } from '@/lib/rating-color';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CoursesPage } from './directory';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

function render(ui: ReactNode) {
  return renderPage(<TooltipProvider>{ui}</TooltipProvider>);
}

function makeRecord(
  id: number,
  professor: string,
  teachingRating: number,
  responded: number,
  course = 'Evidence',
  courseRating = 4.2,
): RawData['records'][number] {
  const scores = Array(10).fill(4.2);
  scores[5] = teachingRating;
  scores[8] = courseRating;
  return {
    id,
    professor,
    course,
    semester: 'Fall 2025',
    enrolled: 100,
    responded,
    scores,
    inaccessible: false,
  };
}

const dataset = buildDataset({
  questions: [],
  sourceNotes: [],
  records: [
    makeRecord(1, 'Doe, Alice', 4.9, 25),
    { ...makeRecord(2, 'Doe, Alice', 4.9, 25), semester: 'Spring 2026' },
    { ...makeRecord(3, 'Roe, Bob', 4.6, 25), semester: 'Spring 2024' },
    makeRecord(4, 'Small, Sam', 5, 19),
    makeRecord(5, 'Doe, Alice', 4.8, 100, 'Contracts', 4.8),
  ],
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.clearAllMocks();
  vi.mocked(useDataset).mockReturnValue({
    data: dataset,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
});

describe('Courses table expansion', () => {
  it.each([
    ['Evidence', 'Course', '#E1EBE2', '#3F6248'],
    ['Legal Theory Seminar', 'Seminar', '#DAE4EF', '#34516F'],
    ['Legal Theory Colloquium', 'Colloquium', '#DAE4EF', '#34516F'],
    ['Advocacy Clinic', 'Clinic', '#E9DFEF', '#6B4F7A'],
    ['Advocacy Externship', 'Externship', '#E9DFEF', '#6B4F7A'],
    ['Advocacy Clinic Seminar', 'Clinic', '#E9DFEF', '#6B4F7A'],
  ])('uses the muted category palette for %s', (title, category, background, foreground) => {
    const categoryDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [makeRecord(1, 'Doe, Alice', 4.6, 60, title)],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: categoryDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);
    const row = screen.getByTestId(`row-courses-${categoryDataset.courses[0].slug}`);
    const badge = within(row).getByText(category, { selector: 'span' });
    expect(badge.classList.contains(`bg-[${background}]`)).toBe(true);
    expect(badge.classList.contains(`text-[${foreground}]`)).toBe(true);
    expect(badge.classList.contains('rounded-full')).toBe(true);
    expect(badge.classList.contains('bg-secondary')).toBe(false);
  });

  it('previews the top three course-specific professors and expands them only within Top Professors', () => {
    const missingScore = makeRecord(8, 'Missing, Morgan', 5, 60);
    missingScore.scores[5] = null;
    const previewDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.9, 20),
        makeRecord(2, 'Doe, Alice', 3.9, 20),
        makeRecord(3, 'Roe, Bob', 4.8, 20),
        makeRecord(4, 'Smith, Carol', 4.7, 30),
        makeRecord(5, 'White, Dan', 4.5, 20),
        makeRecord(6, 'Small, Sam', 5, 19),
        makeRecord(7, 'Doe, Alice', 5, 500, 'Contracts'),
        missingScore,
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: previewDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);
    const preview = screen.getByTestId('course-professor-preview-evidence');
    const links = within(preview).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      '1. Bob Roe • Fall 2025',
      '2. Carol Smith • Fall 2025',
      '3. Dan White • Fall 2025',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/professors/bob-roe', '/professors/carol-smith', '/professors/dan-white',
    ]);
    for (const link of links) {
      expect(link.parentElement?.classList.contains('flex')).toBe(true);
      expect(link.parentElement?.classList.contains('items-center')).toBe(true);
      expect(link.parentElement?.classList.contains('justify-between')).toBe(true);
      expect(link.parentElement?.classList.contains('gap-2')).toBe(true);
      expect(link.classList.contains('truncate')).toBe(true);
      expect(link.classList.contains('flex-1')).toBe(true);
      expect(link.getAttribute('title')).toBe(link.textContent);
      expect(link.nextElementSibling?.classList.contains('w-[6.5rem]')).toBe(true);
      expect(link.nextElementSibling?.querySelector('[role="meter"]')).toBeTruthy();
    }
    const semesterLabel = screen.getByTestId('preview-semester-evidence-bob-roe');
    expect(semesterLabel.textContent).toBe('• Fall 2025');
    expect(semesterLabel.classList.contains('text-[10px]')).toBe(true);
    expect(semesterLabel.classList.contains('text-muted-foreground')).toBe(true);
    expect(within(preview).getAllByRole('meter').map((meter) => meter.getAttribute('aria-valuenow')))
      .toEqual(['4.8', '4.7', '4.5']);
    for (const score of ['4.80 / 5', '4.70 / 5', '4.50 / 5']) {
      expect(within(preview).getByText(score)).toBeTruthy();
    }
    expect(within(preview).queryByText('Sam Small')).toBeNull();
    expect(within(preview).queryByText('Morgan Missing')).toBeNull();
    expect(screen.queryByTestId('rating-course-evidence')).toBeNull();

    expect(screen.queryByRole('button', { name: 'Expand top professors for Evidence' })).toBeNull();
    expect(screen.queryByTestId('panel-top-professors-evidence')).toBeNull();
    fireEvent.click(screen.getByTestId('button-toggle-course-top-professors-evidence'));
    expect(within(preview).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '1. Bob Roe • Fall 2025', '2. Carol Smith • Fall 2025',
      '3. Dan White • Fall 2025', '4. Alice Doe • Fall 2025',
    ]);
    expect(within(preview).getAllByRole('meter').map((meter) => meter.getAttribute('aria-valuenow')))
      .toEqual(['4.8', '4.7', '4.5', '4.4']);

    fireEvent.click(links[0]);
    expect(window.location.pathname).toBe('/professors/bob-roe');
  });

  it('shows fewer than three professors when fewer qualify and explains an empty preview', () => {
    const noQualifiedDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.9, 20),
        makeRecord(2, 'Small, Sam', 5, 19),
        makeRecord(3, 'Small, Sam', 5, 19, 'Contracts'),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: noQualifiedDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('button-clear-filters'));
    const evidence = screen.getByTestId('course-professor-preview-evidence');
    expect(within(evidence).getAllByRole('link').map((link) => link.textContent)).toEqual(['1. Alice Doe • Fall 2025']);
    expect(within(evidence).getAllByRole('meter')).toHaveLength(1);
    const contracts = screen.getByTestId('course-professor-preview-contracts');
    expect(contracts.textContent).toBe('No professors with teaching ratings and 20+ reviews for this course.');
    expect(within(contracts).queryByRole('meter')).toBeNull();
  });

  it('shows every matching course without a Load More control', () => {
    const allCoursesDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: Array.from({ length: 125 }, (_, index) => {
        const course = `Course ${String(index + 1).padStart(3, '0')}`;
        return makeRecord(index + 1, 'Doe, Alice', 4.5, 60, course, 4.2);
      }),
    });
    vi.mocked(useDataset).mockReturnValue({
      data: allCoursesDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);

    expect(screen.getAllByTestId(/^row-courses-/)).toHaveLength(125);
    expect(screen.queryByTestId('button-load-more')).toBeNull();
  });

  it('wraps long course names instead of truncating them', () => {
    const title = 'Professional Responsibility and the Regulation of Lawyers';
    const longTitleDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [makeRecord(1, 'Doe, Alice', 4.7, 60, title, 4.5)],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: longTitleDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);

    const courseLink = screen.getByRole('link', { name: title });
    expect(courseLink.className).toContain('whitespace-normal');
    expect(courseLink.className).toContain('break-words');
    expect(courseLink.className).not.toContain('truncate');
    expect(courseLink.parentElement?.className).toContain('text-[17px]');
    expect(courseLink.parentElement?.className).toContain('font-semibold');
    expect(courseLink.parentElement?.nextElementSibling?.classList.contains('mt-1.5')).toBe(true);
  });

  it('places the online checkbox in the upper row and the tax checkbox after Clinics', () => {
    render(<CoursesPage />);
    const toolbar = screen.getByTestId('directory-toolbar-courses');
    const primaryRow = screen.getByTestId('directory-toolbar-primary-row-courses');
    const categoryToggleRow = screen.getByTestId('course-toggle-filter-row');
    const include1LToggle = screen.getByTestId('toggle-include-1l-courses');
    const includeCoursesToggle = screen.getByTestId('toggle-include-courses');
    const includeSeminarsToggle = screen.getByTestId('toggle-include-seminars-colloquiums');
    const includeClinicsToggle = screen.getByTestId('toggle-include-clinics-externships');
    const includeOnlineInternationalToggle = screen.getByTestId('toggle-include-online-international-courses');
    const includeTaxToggle = screen.getByTestId('toggle-include-upper-level-tax-courses');
    const minimumReviewsControl = screen.getByTestId('course-min-reviews-control');
    const minimumReviewsSlider = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    const filterActions = screen.getByTestId('course-filter-actions');
    const filterSummary = screen.getByTestId('filter-summary');
    const setDefaultFiltersButton = screen.getByTestId('button-set-default-filters');
    const clearFiltersButton = screen.getByTestId('button-clear-filters');
    const sortSelect = screen.getByTestId('select-sort');
    const controlsPanel = document.getElementById('directory-filter-controls');

    expect(screen.queryByTestId('select-semester')).toBeNull();
    expect(setDefaultFiltersButton.textContent).toBe('Set default filters');
    expect(clearFiltersButton.textContent).toBe('Clear all filters');
    expect(filterActions.parentElement).toBe(filterSummary.parentElement);
    expect(filterActions.parentElement?.className).toContain('justify-between');
    expect(filterActions.parentElement?.previousElementSibling?.tagName).toBe('H1');
    expect(toolbar.contains(filterActions)).toBe(false);
    expect(toolbar.className).toContain('pt-0');
    expect(setDefaultFiltersButton.parentElement).toBe(filterActions);
    expect(clearFiltersButton.parentElement).toBe(filterActions);
    expect(include1LToggle.getAttribute('aria-checked')).toBe('false');
    expect(include1LToggle.parentElement?.textContent).toBe('Include 1L Courses');
    expect(include1LToggle.parentElement?.parentElement).toBe(primaryRow);
    expect(includeOnlineInternationalToggle.getAttribute('aria-checked')).toBe('false');
    expect(includeOnlineInternationalToggle.parentElement?.textContent).toBe('Include Online/International Courses');
    expect(includeOnlineInternationalToggle.parentElement?.parentElement).toBe(primaryRow);
    expect(includeTaxToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeTaxToggle.parentElement?.textContent).toBe('Include Upper-Level Tax Courses');
    expect(includeTaxToggle.parentElement?.parentElement).toBe(categoryToggleRow);
    expect(include1LToggle.compareDocumentPosition(includeOnlineInternationalToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeOnlineInternationalToggle.compareDocumentPosition(sortSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeCoursesToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeCoursesToggle.getAttribute('role')).toBe('checkbox');
    expect(includeCoursesToggle.parentElement?.textContent).toBe('Include Courses');
    expect(includeSeminarsToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeSeminarsToggle.getAttribute('role')).toBe('checkbox');
    expect(includeSeminarsToggle.parentElement?.textContent).toBe('Include Seminars');
    expect(includeClinicsToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeClinicsToggle.getAttribute('role')).toBe('checkbox');
    expect(includeClinicsToggle.parentElement?.textContent).toBe('Include Clinics');
    expect(include1LToggle.getAttribute('role')).toBe('checkbox');
    expect(includeOnlineInternationalToggle.getAttribute('role')).toBe('checkbox');
    expect(includeTaxToggle.getAttribute('role')).toBe('checkbox');
    expect(toolbar.children[0]).toBe(primaryRow);
    expect(toolbar.children[1]).toBe(categoryToggleRow);
    expect(categoryToggleRow.parentElement).toBe(toolbar);
    expect(includeCoursesToggle.parentElement?.parentElement).toBe(categoryToggleRow);
    expect(includeSeminarsToggle.compareDocumentPosition(includeClinicsToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeClinicsToggle.parentElement?.nextElementSibling?.contains(includeTaxToggle)).toBe(true);
    expect(includeOnlineInternationalToggle.compareDocumentPosition(includeTaxToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeTaxToggle.compareDocumentPosition(minimumReviewsControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeOnlineInternationalToggle.compareDocumentPosition(minimumReviewsControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(categoryToggleRow.lastElementChild?.contains(minimumReviewsControl)).toBe(true);
    expect(minimumReviewsControl.parentElement).toBe(categoryToggleRow);
    expect(minimumReviewsControl.classList.contains('flex-1')).toBe(true);
    expect(minimumReviewsSlider.getAttribute('aria-valuenow')).toBe('50');
    expect(minimumReviewsSlider.getAttribute('aria-valuemax')).toBe('200');
    expect(minimumReviewsSlider.getAttribute('aria-valuemin')).toBe('0');
    expect(screen.getByTestId('filter-min-responses-tick-0').textContent).toBe('0');
    expect(screen.getByTestId('filter-min-responses-tick-100').textContent).toBe('100');
    expect(screen.queryByTestId('filter-min-responses-tick-50')).toBeNull();
    expect(screen.getByTestId('filter-min-responses-tick-200').textContent).toBe('200');
    expect(screen.queryByTestId('filter-min-responses-tick-300')).toBeNull();
    expect(minimumReviewsControl.querySelectorAll('[data-testid^="filter-min-responses-tick-"]').length).toBe(3);
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('50+');
    expect(minimumReviewsControl.classList.contains('h-11')).toBe(true);
    expect(within(minimumReviewsControl).queryByText('No minimum')).toBeNull();
    expect(within(minimumReviewsControl).queryByText('500+')).toBeNull();
    expect(sortSelect.parentElement?.parentElement).toBe(primaryRow);
    expect(screen.queryByTestId('button-toggle-course-filters')).toBeNull();
    expect(controlsPanel).toBeNull();
    expect(screen.queryByTestId('filter-min-offerings-slider')).toBeNull();
    expect(screen.queryByTestId('filter-course-rating-range-slider')).toBeNull();
    expect(screen.queryByText('Minimum class offerings')).toBeNull();
    expect(screen.queryByText('Average Course Rating')).toBeNull();
  });

  it('omits Most recently taught and resets a previously saved selection', () => {
    window.history.replaceState({
      courseInsightsCourseDirectory: {
        version: 1,
        sort: 'recent',
        includedCategories: ['Course', 'Seminar', 'Clinic', 'Colloquium', 'Externship'],
        scrollY: 0,
      },
    }, '', '/courses');

    render(<CoursesPage />);
    const sortSelect = screen.getByTestId('select-sort') as HTMLSelectElement;

    expect(Array.from(sortSelect.options).some((option) => option.value === 'recent')).toBe(false);
    expect(sortSelect.value).toBe('responses');
  });

  it('resets course filters to their defaults or clears their restrictions', () => {
    render(<CoursesPage />);
    const include1L = screen.getByTestId('toggle-include-1l-courses');
    const includeOnlineInternational = screen.getByTestId('toggle-include-online-international-courses');
    const includeTax = screen.getByTestId('toggle-include-upper-level-tax-courses');
    const includeCourses = screen.getByTestId('toggle-include-courses');
    const includeSeminars = screen.getByTestId('toggle-include-seminars-colloquiums');
    const minimumReviewsThumb = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    const search = screen.getByTestId('input-search-courses') as HTMLInputElement;
    const clearFiltersButton = screen.getByTestId('button-clear-filters');

    fireEvent.change(search, { target: { value: 'Evidence' } });
    fireEvent.click(include1L);
    fireEvent.click(includeOnlineInternational);
    fireEvent.click(includeTax);
    fireEvent.click(includeCourses);
    fireEvent.click(includeSeminars);
    fireEvent.keyDown(minimumReviewsThumb, { key: 'ArrowRight' });

    fireEvent.click(screen.getByTestId('button-set-default-filters'));

    expect(include1L.getAttribute('aria-checked')).toBe('false');
    expect(includeOnlineInternational.getAttribute('aria-checked')).toBe('false');
    expect(includeTax.getAttribute('aria-checked')).toBe('true');
    expect(includeCourses.getAttribute('aria-checked')).toBe('true');
    expect(includeSeminars.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('filter-min-responses-slider').querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('50+');
    expect(search.value).toBe('Evidence');

    fireEvent.click(clearFiltersButton);

    expect(include1L.getAttribute('aria-checked')).toBe('true');
    expect(includeOnlineInternational.getAttribute('aria-checked')).toBe('true');
    expect(includeTax.getAttribute('aria-checked')).toBe('true');
    expect(includeCourses.getAttribute('aria-checked')).toBe('true');
    expect(includeSeminars.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('No minimum');
    expect(screen.getByTestId('filter-min-responses-slider').querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(search.value).toBe('');
    expect(screen.getByTestId('button-clear-filters')).toBe(clearFiltersButton);

    const clearedSummary = screen.getByTestId('filter-summary').textContent;
    fireEvent.click(clearFiltersButton);
    expect(screen.getByTestId('filter-summary').textContent).toBe(clearedSummary);
    expect(includeOnlineInternational.getAttribute('aria-checked')).toBe('true');
  });

  it('explains the upper-level tax filter on hover without changing the toggle', async () => {
    render(<CoursesPage />);
    const toggle = screen.getByTestId('toggle-include-upper-level-tax-courses');
    fireEvent.pointerMove(screen.getByTestId('button-upper-level-tax-info'), {
      pointerType: 'mouse', clientX: 0, clientY: 0,
    });

    expect(await screen.findByText(
      'Excludes all tax classes except for Income Taxation',
      {},
      { timeout: 3000 },
    )).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('explains the course category checkboxes on hover without changing their values', async () => {
    render(<CoursesPage />);
    const categories = [
      {
        id: 'toggle-include-courses',
        description: 'Check this box to include Courses and Simulation Courses in the results',
      },
      {
        id: 'toggle-include-seminars-colloquiums',
        description: 'Check this box to include Seminars and Colloquiums in the results.',
      },
      {
        id: 'toggle-include-clinics-externships',
        description: 'Check this box to include Clinics and Externships in the results.',
      },
    ];

    for (const { id, description } of categories) {
      fireEvent.pointerMove(screen.getByTestId(`button-course-category-info-${id}`), {
        pointerType: 'mouse', clientX: 0, clientY: 0,
      });
      expect(await screen.findByText(description, {}, { timeout: 3000 })).toBeTruthy();
      expect(screen.getByTestId(id).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('expands all rated professors and recent semesters together from either column', () => {
    const historyDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        { ...makeRecord(1, 'Doe, Alice', 4.9, 25), semester: 'Spring 2026' },
        { ...makeRecord(2, 'Roe, Bob', 4.8, 25), semester: 'Fall 2025' },
        { ...makeRecord(3, 'Smith, Carol', 4.7, 25), semester: 'Spring 2025' },
        { ...makeRecord(4, 'White, Dan', 4.6, 25), semester: 'Fall 2024' },
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: historyDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);

    const row = screen.getByTestId('row-courses-evidence');
    const topToggle = within(row).getByTestId('button-toggle-course-top-professors-evidence');
    const recentToggle = within(row).getByTestId('button-toggle-course-history-evidence-compact');
    const topPreview = within(row).getByTestId('course-professor-preview-evidence');
    const topProfessorsCell = topPreview.parentElement!;
    const topEntries = () => within(topPreview).getAllByTestId(/^preview-professor-evidence-/);

    expect(topToggle.className).toContain('font-sans');
    expect(topToggle.className).toContain('text-[10px]');
    expect(topToggle.className).toContain('text-muted-foreground');
    expect(topToggle.className).toContain('mt-0.5');
    expect(topToggle.className).toContain('hover:text-foreground');
    expect(topToggle.className).toContain('hover:underline');
    expect(topEntries()).toHaveLength(3);
    expect(topToggle.textContent).toBe('[...]');
    expect(topToggle.getAttribute('aria-expanded')).toBe('false');
    expect(topProfessorsCell.className).not.toContain('self-start');
    expect(recentToggle.textContent).toBe('[...]');
    expect(recentToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-2')).toBeNull();

    fireEvent.click(topToggle);

    expect(topEntries()).toHaveLength(4);
    expect(topToggle.textContent).toBe('Collapse');
    expect(topToggle.getAttribute('aria-expanded')).toBe('true');
    expect(topProfessorsCell.className).toContain('self-start');
    expect(topProfessorsCell.className).toContain('mt-2');
    expect(recentToggle.textContent).toBe('Collapse');
    expect(recentToggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(row).getByTestId('recent-semester-evidence-compact-2')).toBeTruthy();
    expect(within(row).getByTestId('recent-semester-evidence-compact-3')).toBeTruthy();

    fireEvent.click(recentToggle);

    expect(topEntries()).toHaveLength(3);
    expect(topToggle.textContent).toBe('[...]');
    expect(topToggle.getAttribute('aria-expanded')).toBe('false');
    expect(topProfessorsCell.className).not.toContain('self-start');
    expect(recentToggle.textContent).toBe('[...]');
    expect(recentToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-2')).toBeNull();

    fireEvent.click(recentToggle);
    expect(topEntries()).toHaveLength(4);
    expect(topToggle.getAttribute('aria-expanded')).toBe('true');
    expect(recentToggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(topToggle);
    expect(topEntries()).toHaveLength(3);
    expect(topToggle.getAttribute('aria-expanded')).toBe('false');
    expect(recentToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-2')).toBeNull();
  });

  it('filters course category groups independently', () => {
    const categorizedDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.5, 60, 'Evidence'),
        makeRecord(2, 'Doe, Alice', 4.5, 60, 'Evidence Seminar'),
        makeRecord(3, 'Doe, Alice', 4.5, 60, 'Evidence Colloquium'),
        makeRecord(4, 'Doe, Alice', 4.5, 60, 'Evidence Clinic'),
        makeRecord(5, 'Doe, Alice', 4.5, 60, 'Evidence Externship'),
        makeRecord(6, 'Doe, Alice', 4.5, 60, 'Clinic Seminar Evidence'),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: categorizedDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);
    expect(screen.getByTestId('filter-summary').textContent).toContain('6 matching');

    fireEvent.click(screen.getByTestId('toggle-include-courses'));
    expect(screen.getByTestId('filter-summary').textContent).toContain('5 matching');
    expect(screen.queryByRole('link', { name: 'Evidence', exact: true })).toBeNull();
    expect(screen.getByRole('link', { name: 'Evidence Seminar' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-seminars-colloquiums'));
    expect(screen.getByTestId('filter-summary').textContent).toContain('3 matching');
    expect(screen.queryByRole('link', { name: 'Evidence Seminar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Evidence Colloquium' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Clinic Seminar Evidence' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-clinics-externships'));
    expect(screen.getByTestId('filter-summary').textContent).toContain('0 matching');
    expect(screen.queryByRole('link', { name: 'Evidence Externship' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Evidence Clinic' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Clinic Seminar Evidence' })).toBeNull();

    fireEvent.click(screen.getByTestId('toggle-include-seminars-colloquiums'));
    expect(screen.getByTestId('filter-summary').textContent).toContain('2 matching');
    expect(screen.getByRole('link', { name: 'Evidence Seminar' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Clinic Seminar Evidence' })).toBeNull();
  });

  it('filters course results using the minimum reviews slider in the toolbar', () => {
    const reviewDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.5, 50, 'Evidence'),
        makeRecord(2, 'Roe, Bob', 4.5, 55, 'Torts'),
        makeRecord(3, 'Smith, Sam', 4.5, 60, 'Contracts'),
        makeRecord(4, 'Doe, Alice', 4.5, 199, 'Below Threshold'),
        makeRecord(5, 'Roe, Bob', 4.5, 200, 'At Threshold'),
        makeRecord(6, 'Smith, Sam', 4.5, 600, 'Above Threshold'),
        makeRecord(7, 'Doe, Alice', 4.5, 5, 'Small Course'),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: reviewDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));

    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-torts')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts')).toBeTruthy();
    expect(screen.queryByTestId('row-courses-small-course')).toBeNull();
    const reviewsSlider = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    reviewsSlider.focus();
    expect(reviewsSlider.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.click(screen.getByTestId('button-clear-filters'));
    expect(reviewsSlider.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByTestId('row-courses-small-course')).toBeTruthy();
    for (let step = 0; step < 6; step++) {
      fireEvent.keyDown(reviewsSlider, { key: 'ArrowRight' });
    }

    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('60+');
    expect(screen.queryByTestId('row-courses-evidence')).toBeNull();
    expect(screen.queryByTestId('row-courses-torts')).toBeNull();
    expect(screen.getByTestId('row-courses-contracts')).toBeTruthy();
    expect(screen.queryByTestId('row-courses-small-course')).toBeNull();

    fireEvent.keyDown(reviewsSlider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('50+');
    fireEvent.keyDown(reviewsSlider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('40+');
    expect(reviewsSlider.getAttribute('aria-valuenow')).toBe('40');

    fireEvent.keyDown(reviewsSlider, { key: 'End' });
    fireEvent.keyDown(reviewsSlider, { key: 'ArrowRight' });
    expect(reviewsSlider.getAttribute('aria-valuenow')).toBe('200');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('200+');
    expect(screen.queryByTestId('row-courses-below-threshold')).toBeNull();
    expect(screen.getByTestId('row-courses-at-threshold')).toBeTruthy();
    expect(screen.getByTestId('row-courses-above-threshold')).toBeTruthy();
  });

  it('hides 1L courses by default and includes them when the toggle is on', () => {
    const audienceDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.9, 60, 'Torts'),
        makeRecord(2, 'Roe, Bob', 4.6, 60, 'Constitutional Law (for 1Ls)'),
        makeRecord(3, 'Smith, Sam', 4.5, 60, 'Evidence'),
        makeRecord(4, 'Lee, Lee', 4.4, 60, 'Contracts (for LL.M. Students)'),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: audienceDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);

    expect(screen.getByTestId('toggle-include-1l-courses').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('row-courses-torts')).toBeNull();
    expect(screen.queryByTestId('row-courses-constitutional-law-for-1ls')).toBeNull();
    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts-for-ll-m-students')).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));

    expect(screen.getByTestId('toggle-include-1l-courses').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('row-courses-torts')).toBeTruthy();
    expect(screen.getByTestId('row-courses-constitutional-law-for-1ls')).toBeTruthy();
    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts-for-ll-m-students')).toBeTruthy();
  });

  it('displays purple 1L badges in the Course column for all five core courses', () => {
    const courseNames = ['Torts', 'Procedure', 'Criminal Law', 'Contracts', 'Legislation and the Regulatory State'];
    const firstYearDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: courseNames.map((course, index) => makeRecord(index + 1, 'Doe, Alice', 4.5, 60, course)),
    });
    vi.mocked(useDataset).mockReturnValue({
      data: firstYearDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));
    for (const course of courseNames) {
      const group = firstYearDataset.courses.find((entry) => entry.name === course)!;
      expect(group.courseLabels).toContain('1L');
      expect(group.records.every((record) => record.courseLabels.includes('1L'))).toBe(true);
      const row = screen.getByTestId(`row-courses-${group.slug}`);
      const badge = within(row).getByTestId(`badge-course-1l-${group.slug}`);
      expect(badge.classList.contains('ml-1')).toBe(true);
      expect(badge.classList.contains('rounded-full')).toBe(true);
      expect(badge.classList.contains('bg-secondary')).toBe(true);
      expect(badge.parentElement?.querySelector('a')?.textContent).toBe(course);
      expect(badge.parentElement?.querySelector(`[data-testid="course-latest-${group.slug}"]`)).toBeNull();
      expect(within(row).getByTestId(`course-latest-${group.slug}`).parentElement?.querySelector(`[data-testid="badge-course-1l-${group.slug}"]`)).toBeNull();
    }

    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));
    expect(screen.getByTestId('filter-summary').textContent).toContain('0 matching');
  });

  it('hides online and international courses by default and shows both when enabled', () => {
    const courseNames = [
      'International Arbitration (Paris)',
      'Human Rights Seminar in Buenos Aires',
      'Tax Law [ONLINE]',
      'Evidence',
    ];
    const classifiedDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: courseNames.map((course, index) =>
        makeRecord(index + 1, 'Doe, Alice', 4.6, 60, course, 4.4),
      ),
    });
    vi.mocked(useDataset).mockReturnValue({
      data: classifiedDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);

    const rowFor = (course: string) => screen.getByTestId(`row-courses-${classifiedDataset.courseSlugByName.get(course)}`);
    expect(screen.getByTestId('toggle-include-online-international-courses').getAttribute('aria-checked')).toBe('false');
    for (const course of courseNames.slice(0, 3)) {
      expect(screen.queryByTestId(`row-courses-${classifiedDataset.courseSlugByName.get(course)}`)).toBeNull();
    }
    expect(rowFor(courseNames[3])).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-online-international-courses'));

    expect(screen.getByTestId('toggle-include-online-international-courses').getAttribute('aria-checked')).toBe('true');
    expect(rowFor(courseNames[0]).textContent).toContain('International');
    expect(rowFor(courseNames[1]).textContent).toContain('International');
    expect(rowFor(courseNames[2]).textContent).toContain('Online');
    expect(rowFor(courseNames[3])).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-online-international-courses'));

    expect(screen.getByTestId('toggle-include-online-international-courses').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId(`row-courses-${classifiedDataset.courseSlugByName.get(courseNames[0])}`)).toBeNull();
    expect(screen.queryByTestId(`row-courses-${classifiedDataset.courseSlugByName.get(courseNames[1])}`)).toBeNull();
    expect(screen.queryByTestId(`row-courses-${classifiedDataset.courseSlugByName.get(courseNames[2])}`)).toBeNull();
    expect(rowFor(courseNames[3])).toBeTruthy();
  });

  it('labels tax courses and preserves the specified income-tax courses when upper-level tax is hidden', () => {
    const exemptTaxCourses = [
      'Federal Income Taxation',
      'Federal Income Tax',
      'Income Taxation',
      'Income Tax',
      'Income Taxation (for 1Ls)',
    ];
    const upperLevelTaxCourses = [
      'Corporate Tax',
      'Tax Policy Workshop',
      'Taxation of Corporations',
    ];
    const courseNames = [...exemptTaxCourses, ...upperLevelTaxCourses, 'Taxonomy Workshop'];
    const taxDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: courseNames.map((course, index) =>
        makeRecord(index + 1, 'Doe, Alice', 4.6, 60, course, 4.4),
      ),
    });
    vi.mocked(useDataset).mockReturnValue({
      data: taxDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    for (const course of [...exemptTaxCourses, ...upperLevelTaxCourses]) {
      expect(taxDataset.courses.find((group) => group.name === course)?.courseLabels).toContain('Tax');
    }
    expect(taxDataset.courses.find((group) => group.name === 'Taxonomy Workshop')?.courseLabels).not.toContain('Tax');

    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));
    const rowFor = (course: string) => screen.getByTestId(`row-courses-${taxDataset.courseSlugByName.get(course)}`);
    for (const course of courseNames) expect(rowFor(course)).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-upper-level-tax-courses'));

    expect(screen.getByTestId('toggle-include-upper-level-tax-courses').getAttribute('aria-checked')).toBe('false');
    for (const course of exemptTaxCourses) expect(rowFor(course)).toBeTruthy();
    for (const course of upperLevelTaxCourses) {
      expect(screen.queryByTestId(`row-courses-${taxDataset.courseSlugByName.get(course)}`)).toBeNull();
    }
    expect(rowFor('Taxonomy Workshop')).toBeTruthy();
  });

  it('removes course-column expansion while keeping course links and eligible professor previews', () => {
    render(<CoursesPage />);

    expect(screen.queryByText(/You have to take Professional Responsibility/)).toBeNull();
    expect(screen.getByTestId('filter-summary').parentElement?.previousElementSibling?.tagName).toBe('H1');
    const table = screen.getByTestId('directory-table');
    const tableHeader = screen.getByTestId('directory-table-header');
    expect(table.classList.contains('overflow-clip')).toBe(true);
    expect(tableHeader.classList.contains('sticky')).toBe(true);
    expect(tableHeader.classList.contains('top-48')).toBe(true);
    expect(tableHeader.textContent).toContain('Recent Professors');
    expect(tableHeader.textContent).not.toContain('Recent professors and semesters');
    const recentProfessorsHeading = Array.from(tableHeader.querySelectorAll('span'))
      .find((span) => span.textContent === 'Recent Professors');
    expect(recentProfessorsHeading?.classList.contains('normal-case')).toBe(true);
    const ratingHeader = screen.getByTestId('button-sort-rating');
    expect(ratingHeader.textContent).toContain('Top Professors');
    expect(ratingHeader.textContent).not.toContain('Course Rating');
    expect(ratingHeader.parentElement?.classList.contains('text-center')).toBe(true);
    const offeringsHeader = screen.getByTestId('button-sort-offerings');
    expect(offeringsHeader.parentElement?.classList.contains('text-center')).toBe(true);
    const reviewsHeader = screen.getByTestId('button-sort-reviews');
    expect(offeringsHeader.compareDocumentPosition(reviewsHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reviewsHeader.compareDocumentPosition(ratingHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(offeringsHeader.parentElement?.nextElementSibling).toBe(reviewsHeader.parentElement);
    expect(reviewsHeader.parentElement?.nextElementSibling).toBe(ratingHeader.parentElement);
    expect(screen.queryByText('Teaching')).toBeNull();
    const row = screen.getByTestId('row-courses-evidence');
    expect(tableHeader.classList.contains('course-directory-grid')).toBe(true);
    expect(row.firstElementChild?.classList.contains('course-directory-grid')).toBe(true);
    const previewCell = within(row).getByTestId('course-professor-preview-evidence').parentElement!;
    expect(previewCell.previousElementSibling?.classList.contains('num')).toBe(true);
    expect(previewCell.previousElementSibling?.classList.contains('text-center')).toBe(true);
    expect(previewCell.previousElementSibling?.previousElementSibling?.textContent).toBe('4');
    expect(previewCell.previousElementSibling?.previousElementSibling?.classList.contains('text-center')).toBe(true);
    expect(within(row).queryByTestId('course-expand-line-evidence')).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Expand top professors for Evidence' })).toBeNull();
    const courseCell = within(row).getByRole('link', { name: 'Evidence' }).parentElement!.parentElement!;
    expect(within(courseCell).queryByRole('button', { name: /^Expand top professors/ })).toBeNull();
    expect(within(row).queryByTestId('rating-course-teaching-evidence')).toBeNull();
    const spring2026 = within(row).getByTestId('recent-semester-evidence-compact-0');
    expect(spring2026.textContent).toBe('🌸 Spring 2026 • Alice Doe (4.90)');
    expect(spring2026.classList.contains('mt-1.5')).toBe(false);
    for (const layout of ['compact', 'wide']) {
      expect(within(row).getByTestId(`recent-semester-evidence-${layout}-1`).classList.contains('mt-1.5')).toBe(true);
    }
    expect(spring2026.querySelector('strong')?.textContent).toBe('🌸 Spring 2026');
    expect(within(row).getByTestId('recent-semester-evidence-compact-1').textContent).toBe('🍂 Fall 2025 • Alice Doe (4.90), Sam Small (5.00)');
    const courseLatest = within(row).getByTestId('course-latest-evidence');
    expect(courseLatest.textContent).toMatch(/^Latest (Spring|Fall|Summer) \d{4}$/);
    expect(courseLatest.textContent).not.toMatch(/🌸|🍂|☀️/);
    const recentProfessorLinks = within(row).getAllByRole('link', { name: 'Alice Doe (4.90)' });
    expect(recentProfessorLinks.length).toBeGreaterThan(0);
    expect(recentProfessorLinks.every((link) => link.getAttribute('href') === '/professors/alice-doe')).toBe(true);
    expect(screen.queryByTestId('panel-top-professors-evidence')).toBeNull();
    const preview = within(row).getByTestId('course-professor-preview-evidence');
    const entries = within(preview).getAllByTestId(/^preview-professor-evidence-/);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => within(entry).getByRole('link').textContent)).toEqual([
      '1. Alice Doe • Spring 2026',
      '2. Bob Roe • Spring 2024',
    ]);
    expect(within(preview).queryByText('Sam Small')).toBeNull();
    expect(window.location.pathname).toBe('/');
    fireEvent.click(within(row).getByRole('link', { name: 'Evidence' }));
    expect(window.location.pathname).toBe('/courses/evidence');
  });

  it('links each professor name and teaching score from that specific course and semester', () => {
    const records = [
      { ...makeRecord(1, 'Adler, Barry E', 3.65, 79, 'Torts'), semester: 'Spring 2026' },
      { ...makeRecord(2, 'Sharkey, Catherine M.', 4.38, 74, 'Torts'), semester: 'Spring 2026' },
      { ...makeRecord(3, 'Geistfeld, Mark', 4.13, 72, 'Torts'), semester: 'Spring 2026' },
      { ...makeRecord(4, 'Adler, Barry E', 5, 1000, 'Torts'), semester: 'Fall 2025' },
      { ...makeRecord(5, 'Adler, Barry E', 1, 1000, 'Evidence'), semester: 'Spring 2026' },
    ];
    const termDataset = buildDataset({ questions: [], sourceNotes: [], records });
    vi.mocked(useDataset).mockReturnValue({
      data: termDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));

    for (const layout of ['compact', 'wide']) {
      const semester = screen.getByTestId(`recent-semester-torts-${layout}-0`);
      expect(semester.textContent).toBe('🌸 Spring 2026 • Barry E. Adler (3.65), Catherine M. Sharkey (4.38), Mark Geistfeld (4.13)');
      for (const [name, score, slug] of [
        ['Barry E. Adler', '3.65', 'barry-e-adler'],
        ['Catherine M. Sharkey', '4.38', 'catherine-m-sharkey'],
        ['Mark Geistfeld', '4.13', 'mark-geistfeld'],
      ]) {
        const link = within(semester).getByRole('link', { name: `${name} (${score})` });
        expect(link.getAttribute('href')).toBe(`/professors/${slug}`);
        expect(link.classList.contains('underline')).toBe(true);
        const coloredScore = within(link).getByText(score);
        expect(coloredScore.textContent).toBe(score);
        const expectedStyle = document.createElement('span');
        expectedStyle.style.color = recentProfessorScoreColor(Number(score));
        expect((coloredScore as HTMLElement).style.color).toBe(expectedStyle.style.color);
        expect(link.textContent).toContain(`(${score})`);
      }
      const previousSemester = screen.getByTestId(`recent-semester-torts-${layout}-1`);
      expect(within(previousSemester).getByRole('link', { name: 'Barry E. Adler (5.00)' })).toBeTruthy();
    }
  });

  it('uses very light purple below 4.00 and preserves the other score color thresholds', () => {
    expect(recentProfessorScoreColor(4.5)).toBe('hsl(276 70% 30%)');
    expect(recentProfessorScoreColor(4.49)).toBe('hsl(276 50% 52%)');
    expect(recentProfessorScoreColor(4)).toBe('hsl(276 50% 52%)');
    expect(recentProfessorScoreColor(4.01)).toBe('hsl(276 50% 52%)');
    expect(recentProfessorScoreColor(3.99)).toBe('hsl(276 55% 78%)');
  });

  it('weights sections within a semester and shows N/A for unavailable teaching scores', () => {
    const unavailable = makeRecord(3, 'Roe, Bob', 4, 20);
    unavailable.scores[5] = null;
    const termDataset = buildDataset({
      questions: [], sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 3, 10),
        makeRecord(2, 'Doe, Alice', 5, 30),
        unavailable,
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: termDataset, isLoading: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);
    const semester = screen.getByTestId('recent-semester-evidence-wide-0');
    expect(within(semester).getByRole('link', { name: 'Alice Doe (4.50)' })).toBeTruthy();
    expect(within(semester).getByRole('link', { name: 'Bob Roe (N/A)' })).toBeTruthy();
  });

  it('shows two recent-professor semesters and expands or collapses the full history', () => {
    const historyDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        { ...makeRecord(1, 'Doe, Alice', 4.8, 20), semester: 'Spring 2026' },
        { ...makeRecord(2, 'Roe, Bob', 4.6, 15), semester: 'Fall 2025' },
        { ...makeRecord(3, 'Doe, Alice', 4.7, 10), semester: 'Fall 2025' },
        { ...makeRecord(4, 'Roe, Bob', 4.5, 10), semester: 'Spring 2025' },
        { ...makeRecord(5, 'Doe, Alice', 4.4, 10), semester: 'Fall 2024' },
        { ...makeRecord(6, 'Roe, Bob', 4.3, 10), semester: 'Spring 2024' },
        { ...makeRecord(7, 'Doe, Alice', 4.2, 10), semester: 'Summer 2023' },
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: historyDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);

    const row = screen.getByTestId('row-courses-evidence');
    const historyToggle = () => within(row).getByTestId('button-toggle-course-history-evidence-compact');
    expect(within(row).getByTestId('recent-semester-evidence-compact-0').textContent).toBe('🌸 Spring 2026 • Alice Doe (4.80)');
    expect(within(row).getByTestId('recent-semester-evidence-compact-1').textContent).toBe('🍂 Fall 2025 • Alice Doe (4.70), Bob Roe (4.60)');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-2')).toBeNull();
    expect(historyToggle().textContent).toBe('[...]');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('false');
    const toggleLine = within(row).getByTestId('course-history-toggle-line-evidence-compact');
    expect(toggleLine.classList.contains('block')).toBe(true);
    expect(toggleLine.previousElementSibling).toBe(within(row).getByTestId('recent-semester-evidence-compact-1'));
    expect(historyToggle().parentElement).toBe(toggleLine);

    fireEvent.click(historyToggle());

    expect(historyToggle().textContent).toBe('Collapse');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('true');
    expect(within(row).getByTestId('recent-semester-evidence-compact-2').textContent).toBe('🌸 Spring 2025 • Bob Roe (4.50)');
    expect(within(row).getByTestId('recent-semester-evidence-compact-3').textContent).toBe('🍂 Fall 2024 • Alice Doe (4.40)');
    expect(within(row).getByTestId('recent-semester-evidence-compact-3').classList.contains('mt-1.5')).toBe(true);
    expect(within(row).getByTestId('recent-semester-evidence-compact-4').textContent).toBe('🌸 Spring 2024 • Bob Roe (4.30)');
    expect(within(row).getByTestId('recent-semester-evidence-compact-5').textContent).toBe('☀️ Summer 2023 • Alice Doe (4.20)');
    expect(historyToggle().parentElement).toBe(toggleLine);

    fireEvent.click(historyToggle());

    expect(historyToggle().textContent).toBe('[...]');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-2')).toBeNull();
  });

  it('keeps the history toggle hidden when three or fewer offerings exist', () => {
    const courseNames = [
      'Two Offering Course',
      'Three Offering Course',
      'Four Offerings, Three Semesters',
      'Four Semester Course',
    ];
    const records: RawData['records'] = [
      { ...makeRecord(1, 'Doe, Alice', 4.6, 30, courseNames[0]), semester: 'Spring 2026' },
      { ...makeRecord(2, 'Roe, Bob', 4.5, 30, courseNames[0]), semester: 'Fall 2025' },
      { ...makeRecord(3, 'Doe, Alice', 4.6, 30, courseNames[1]), semester: 'Spring 2026' },
      { ...makeRecord(4, 'Roe, Bob', 4.5, 30, courseNames[1]), semester: 'Fall 2025' },
      { ...makeRecord(5, 'Doe, Alice', 4.4, 30, courseNames[1]), semester: 'Spring 2025' },
      { ...makeRecord(6, 'Doe, Alice', 4.6, 30, courseNames[2]), semester: 'Spring 2026' },
      { ...makeRecord(7, 'Roe, Bob', 4.5, 30, courseNames[2]), semester: 'Fall 2025' },
      { ...makeRecord(8, 'Doe, Alice', 4.4, 30, courseNames[2]), semester: 'Fall 2025' },
      { ...makeRecord(9, 'Roe, Bob', 4.3, 30, courseNames[2]), semester: 'Spring 2025' },
      { ...makeRecord(10, 'Doe, Alice', 4.6, 30, courseNames[3]), semester: 'Spring 2026' },
      { ...makeRecord(11, 'Roe, Bob', 4.5, 30, courseNames[3]), semester: 'Fall 2025' },
      { ...makeRecord(12, 'Doe, Alice', 4.4, 30, courseNames[3]), semester: 'Spring 2025' },
      { ...makeRecord(13, 'Roe, Bob', 4.3, 30, courseNames[3]), semester: 'Fall 2024' },
    ];
    const compactHistoryDataset = buildDataset({ questions: [], sourceNotes: [], records });
    vi.mocked(useDataset).mockReturnValue({
      data: compactHistoryDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    render(<CoursesPage />);

    for (const courseName of courseNames.slice(0, 2)) {
      const slug = compactHistoryDataset.courseSlugByName.get(courseName)!;
      expect(screen.queryByTestId(`button-toggle-course-history-${slug}-compact`)).toBeNull();
      expect(screen.queryByTestId(`button-toggle-course-history-${slug}-wide`)).toBeNull();
    }

    const threeSemesterSlug = compactHistoryDataset.courseSlugByName.get(courseNames[2])!;
    expect(screen.getByTestId(`button-toggle-course-history-${threeSemesterSlug}-compact`).textContent).toBe('[...]');

    const fourSemesterSlug = compactHistoryDataset.courseSlugByName.get(courseNames[3])!;
    expect(screen.getByTestId(`button-toggle-course-history-${fourSemesterSlug}-compact`).textContent).toBe('[...]');
  });

  it('sorts course rows from their column headers and keeps the Sort control in sync', () => {
    render(<CoursesPage />);
    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));
    const sortControl = screen.getByTestId('select-sort') as HTMLSelectElement;
    expect(screen.getByTestId('button-sort-reviews').className).toContain('justify-center');
    const sortedCourseSlugs = () => screen.getAllByTestId(/^row-courses-/)
      .map((row) => row.getAttribute('data-testid')!.replace('row-courses-', ''));

    expect(screen.getByTestId('button-sort-offerings').getAttribute('aria-label')).toContain('Times Offered');

    fireEvent.click(screen.getByTestId('button-sort-course'));
    expect(sortControl.value).toBe('name');
    expect(sortedCourseSlugs()).toEqual(['contracts', 'evidence']);
    fireEvent.click(screen.getByTestId('button-sort-course'));
    expect(sortControl.value).toBe('name-desc');
    expect(sortedCourseSlugs()).toEqual(['evidence', 'contracts']);

    fireEvent.click(screen.getByTestId('button-sort-rating'));
    expect(sortControl.value).toBe('rating');
    expect(sortedCourseSlugs()).toEqual(['contracts', 'evidence']);
    fireEvent.click(screen.getByTestId('button-sort-rating'));
    expect(sortControl.value).toBe('rating-asc');
    expect(sortedCourseSlugs()).toEqual(['evidence', 'contracts']);

    fireEvent.click(screen.getByTestId('button-sort-offerings'));
    expect(sortControl.value).toBe('offerings');
    expect(sortedCourseSlugs()).toEqual(['evidence', 'contracts']);
    fireEvent.click(screen.getByTestId('button-sort-offerings'));
    expect(sortControl.value).toBe('offerings-asc');
    expect(sortedCourseSlugs()).toEqual(['contracts', 'evidence']);

    fireEvent.click(screen.getByTestId('button-sort-reviews'));
    expect(sortControl.value).toBe('responses');
    expect(sortedCourseSlugs()).toEqual(['contracts', 'evidence']);
    fireEvent.click(screen.getByTestId('button-sort-reviews'));
    expect(sortControl.value).toBe('responses-asc');
    expect(sortedCourseSlugs()).toEqual(['evidence', 'contracts']);
  });

  it('restores directory filters, sorting, and scroll position after browser Back', async () => {
    const returnDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        { ...makeRecord(1, 'Doe, Alice', 4.9, 30, 'Evidence', 4.8), semester: 'Spring 2026' },
        { ...makeRecord(2, 'Roe, Bob', 4.6, 25, 'Evidence', 4.2), semester: 'Spring 2026' },
        { ...makeRecord(6, 'Doe, Alice', 4.5, 20, 'Evidence', 4.5), semester: 'Fall 2025' },
        { ...makeRecord(7, 'Roe, Bob', 4.5, 20, 'Evidence', 4.5), semester: 'Spring 2025' },
        { ...makeRecord(8, 'Doe, Alice', 4.5, 20, 'Evidence', 4.5), semester: 'Fall 2024' },
        makeRecord(3, 'Roe, Bob', 5, 60, 'Contracts', 4.6),
        makeRecord(4, 'Doe, Alice', 4.5, 60, 'Evidence (for 1Ls)', 4.5),
        makeRecord(5, 'Doe, Alice', 4.5, 60, 'Evidence [ONLINE]', 4.5),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: returnDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
    window.history.pushState(null, '', '/courses');
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });

    try {
      const { unmount } = render(<CoursesPage />);
      fireEvent.change(screen.getByTestId('input-search-courses'), { target: { value: 'Evidence' } });
      fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));
      fireEvent.click(screen.getByTestId('toggle-include-online-international-courses'));
      fireEvent.click(screen.getByTestId('toggle-include-upper-level-tax-courses'));
      fireEvent.change(screen.getByTestId('select-sort'), { target: { value: 'rating-asc' } });
      fireEvent.click(screen.getByTestId('toggle-include-seminars-colloquiums'));
      fireEvent.click(screen.getByTestId('button-toggle-course-history-evidence-compact'));
      fireEvent.click(screen.getByRole('link', { name: 'Evidence' }));

      expect(window.location.pathname).toBe('/courses/evidence');
      unmount();

      const returned = new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
      });
      await act(async () => {
        window.history.back();
        await returned;
      });
      expect(window.location.pathname).toBe('/courses');

      render(<CoursesPage />);
      expect((screen.getByTestId('input-search-courses') as HTMLInputElement).value).toBe('Evidence');
      expect(screen.getByTestId('toggle-include-1l-courses').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('toggle-include-online-international-courses').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('toggle-include-upper-level-tax-courses').getAttribute('aria-checked')).toBe('false');
      expect((screen.getByTestId('select-sort') as HTMLSelectElement).value).toBe('rating-asc');
      expect(screen.getByTestId('toggle-include-seminars-colloquiums').getAttribute('aria-checked')).toBe('false');
      expect(screen.queryByTestId('button-toggle-course-filters')).toBeNull();
      expect(screen.getByTestId('button-toggle-course-history-evidence-compact').getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('recent-semester-evidence-compact-3').textContent).toBe('🍂 Fall 2024 • Alice Doe (4.50)');
      expect(screen.queryByTestId('panel-top-professors-evidence')).toBeNull();
      expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
      expect(screen.getByTestId('row-courses-evidence-for-1ls')).toBeTruthy();
      expect(screen.getByTestId('row-courses-evidence-online')).toBeTruthy();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
    } finally {
      scrollTo.mockRestore();
      if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    }
  });
});
