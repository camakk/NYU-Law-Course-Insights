import { act, fireEvent, render as renderPage, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
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
  });

  it('places online filtering after Clinics in the bottom row and stretches minimum reviews across the remaining space', () => {
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
    const sortSelect = screen.getByTestId('select-sort');
    const controlsPanel = document.getElementById('directory-filter-controls');

    expect(screen.queryByTestId('select-semester')).toBeNull();
    expect(screen.queryByTestId('button-set-default-filters')).toBeNull();
    expect(include1LToggle.getAttribute('aria-checked')).toBe('true');
    expect(include1LToggle.parentElement?.textContent).toBe('Show 1L Courses');
    expect(include1LToggle.parentElement?.parentElement).toBe(primaryRow);
    expect(includeOnlineInternationalToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeOnlineInternationalToggle.parentElement?.textContent).toBe('Include Online/International Courses');
    expect(includeOnlineInternationalToggle.parentElement?.parentElement).toBe(categoryToggleRow);
    expect(includeTaxToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeTaxToggle.parentElement?.textContent).toBe('Show Upper-Level Tax');
    expect(includeTaxToggle.parentElement?.parentElement).toBe(primaryRow);
    expect(include1LToggle.compareDocumentPosition(includeTaxToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeTaxToggle.compareDocumentPosition(sortSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeCoursesToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeCoursesToggle.parentElement?.textContent).toBe('Include Courses');
    expect(includeSeminarsToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeSeminarsToggle.parentElement?.textContent).toBe('Include Seminars');
    expect(includeClinicsToggle.getAttribute('aria-checked')).toBe('true');
    expect(includeClinicsToggle.parentElement?.textContent).toBe('Include Clinics');
    expect(toolbar.children[0]).toBe(primaryRow);
    expect(toolbar.children[1]).toBe(categoryToggleRow);
    expect(categoryToggleRow.parentElement).toBe(toolbar);
    expect(includeCoursesToggle.parentElement?.parentElement).toBe(categoryToggleRow);
    expect(includeSeminarsToggle.compareDocumentPosition(includeClinicsToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(includeClinicsToggle.parentElement?.nextElementSibling?.contains(includeOnlineInternationalToggle)).toBe(true);
    expect(includeOnlineInternationalToggle.compareDocumentPosition(minimumReviewsControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(categoryToggleRow.lastElementChild?.contains(minimumReviewsControl)).toBe(true);
    expect(minimumReviewsControl.parentElement).toBe(categoryToggleRow);
    expect(minimumReviewsControl.classList.contains('flex-1')).toBe(true);
    expect(minimumReviewsSlider.getAttribute('aria-valuenow')).toBe('50');
    expect(minimumReviewsSlider.getAttribute('aria-valuemax')).toBe('500');
    expect(minimumReviewsSlider.getAttribute('aria-valuemin')).toBe('0');
    expect(screen.getByTestId('filter-min-responses-tick-0').textContent).toBe('0');
    expect(screen.getByTestId('filter-min-responses-tick-100').textContent).toBe('100');
    expect(screen.queryByTestId('filter-min-responses-tick-50')).toBeNull();
    expect(screen.getByTestId('filter-min-responses-tick-500').textContent).toBe('500');
    expect(minimumReviewsControl.querySelectorAll('[data-testid^="filter-min-responses-tick-"]').length).toBe(6);
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
  });

  it('filters course results using the minimum reviews slider in the toolbar', () => {
    const reviewDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Doe, Alice', 4.5, 50, 'Evidence'),
        makeRecord(2, 'Roe, Bob', 4.5, 55, 'Torts'),
        makeRecord(3, 'Smith, Sam', 4.5, 60, 'Contracts'),
      ],
    });
    vi.mocked(useDataset).mockReturnValue({
      data: reviewDataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);

    render(<CoursesPage />);

    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-torts')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts')).toBeTruthy();
    const reviewsSlider = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    reviewsSlider.focus();
    fireEvent.keyDown(reviewsSlider, { key: 'ArrowRight' });

    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('60+');
    expect(screen.queryByTestId('row-courses-evidence')).toBeNull();
    expect(screen.queryByTestId('row-courses-torts')).toBeNull();
    expect(screen.getByTestId('row-courses-contracts')).toBeTruthy();

    fireEvent.keyDown(reviewsSlider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('50+');
    fireEvent.keyDown(reviewsSlider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('40+');
    expect(reviewsSlider.getAttribute('aria-valuenow')).toBe('40');
  });

  it('shows 1L courses by default and hides only those courses when the toggle is off', () => {
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

    expect(screen.getByTestId('row-courses-torts')).toBeTruthy();
    expect(screen.getByTestId('row-courses-constitutional-law-for-1ls')).toBeTruthy();
    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts-for-ll-m-students')).toBeTruthy();

    fireEvent.click(screen.getByTestId('toggle-include-1l-courses'));

    expect(screen.getByTestId('toggle-include-1l-courses').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('row-courses-torts')).toBeNull();
    expect(screen.queryByTestId('row-courses-constitutional-law-for-1ls')).toBeNull();
    expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
    expect(screen.getByTestId('row-courses-contracts-for-ll-m-students')).toBeTruthy();
  });

  it('shows online and international courses by default and hides both when disabled', () => {
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

  it('shows the same eligible, ranked professors and keeps expansion separate from course navigation', () => {
    render(<CoursesPage />);

    expect(screen.getByText('You have to take Professional Responsibility, but there are 13 professors teaching it. How do you choose whose class to take? We have all the data to help you decide.')).toBeTruthy();
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
    expect(ratingHeader.parentElement?.classList.contains('text-center')).toBe(true);
    expect(screen.queryByText('Teaching')).toBeNull();
    const row = screen.getByTestId('row-courses-evidence');
    expect(within(row).queryByTestId('rating-course-teaching-evidence')).toBeNull();
    const spring2026 = within(row).getByTestId('recent-semester-evidence-compact-0');
    expect(spring2026.textContent).toBe('🌸 Spring 2026 • Alice Doe');
    expect(spring2026.querySelector('strong')?.textContent).toBe('🌸 Spring 2026');
    expect(within(row).getByTestId('recent-semester-evidence-compact-1').textContent).toBe('🍂 Fall 2025 • Alice Doe, Sam Small');
    const courseLatest = within(row).getByTestId('course-latest-evidence');
    expect(courseLatest.textContent).toMatch(/^Latest (Spring|Fall|Summer) \d{4}$/);
    expect(courseLatest.textContent).not.toMatch(/🌸|🍂|☀️/);
    const recentProfessorLinks = within(row).getAllByRole('link', { name: 'Alice Doe' });
    expect(recentProfessorLinks.length).toBeGreaterThan(0);
    expect(recentProfessorLinks.every((link) => link.getAttribute('href') === '/professors/alice-doe')).toBe(true);
    const button = within(row).getByRole('button', { name: 'Expand top professors for Evidence' });
    const panel = screen.getByTestId('panel-top-professors-evidence');

    expect(panel.hidden).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);

    const entries = within(panel).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => within(entry).getByRole('link').textContent)).toEqual([
      'Alice Doe',
      'Bob Roe',
    ]);
    expect(within(panel).queryByText('Sam Small')).toBeNull();
    expect(within(entries[0]).getByText('50 reviews · 2 times taught · Most recently: 🌸 Spring 2026')).toBeTruthy();
    expect(within(entries[1]).getByText('25 reviews · 1 time taught · Most recently: 🌸 Spring 2024')).toBeTruthy();
    expect(window.location.pathname).toBe('/');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }));
    expect(panel.hidden).toBe(true);
    fireEvent.click(within(row).getByRole('link', { name: 'Evidence' }));
    expect(window.location.pathname).toBe('/courses/evidence');
  });

  it('expands every recent-professor semester and collapses back to the latest three', () => {
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
    expect(within(row).getByTestId('recent-semester-evidence-compact-0').textContent).toBe('🌸 Spring 2026 • Alice Doe');
    expect(within(row).getByTestId('recent-semester-evidence-compact-1').textContent).toBe('🍂 Fall 2025 • Alice Doe, Bob Roe');
    expect(within(row).getByTestId('recent-semester-evidence-compact-2').textContent).toBe('🌸 Spring 2025 • Bob Roe [...]');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-3')).toBeNull();
    expect(historyToggle().textContent).toBe('[...]');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(historyToggle().parentElement).toBe(within(row).getByTestId('recent-semester-evidence-compact-2'));

    fireEvent.click(historyToggle());

    expect(historyToggle().textContent).toBe('Collapse');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('true');
    expect(within(row).getByTestId('recent-semester-evidence-compact-3').textContent).toBe('🍂 Fall 2024 • Alice Doe');
    expect(within(row).getByTestId('recent-semester-evidence-compact-4').textContent).toBe('🌸 Spring 2024 • Bob Roe');
    expect(within(row).getByTestId('recent-semester-evidence-compact-5').textContent).toBe('☀️ Summer 2023 • Alice Doe Collapse');
    expect(historyToggle().parentElement).toBe(within(row).getByTestId('recent-semester-evidence-compact-5'));

    fireEvent.click(historyToggle());

    expect(historyToggle().textContent).toBe('[...]');
    expect(historyToggle().getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByTestId('recent-semester-evidence-compact-3')).toBeNull();
  });

  it('hides the history toggle when three or fewer entries cover the course history', () => {
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

    for (const courseName of courseNames.slice(0, 3)) {
      const slug = compactHistoryDataset.courseSlugByName.get(courseName)!;
      expect(screen.queryByTestId(`button-toggle-course-history-${slug}-compact`)).toBeNull();
      expect(screen.queryByTestId(`button-toggle-course-history-${slug}-wide`)).toBeNull();
    }

    const fourSemesterSlug = compactHistoryDataset.courseSlugByName.get(courseNames[3])!;
    expect(screen.getByTestId(`button-toggle-course-history-${fourSemesterSlug}-compact`).textContent).toBe('[...]');
  });

  it('sorts course rows from their column headers and keeps the Sort control in sync', () => {
    render(<CoursesPage />);
    const sortControl = screen.getByTestId('select-sort') as HTMLSelectElement;
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
      fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
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
      expect(screen.getByTestId('toggle-include-1l-courses').getAttribute('aria-checked')).toBe('false');
      expect(screen.getByTestId('toggle-include-online-international-courses').getAttribute('aria-checked')).toBe('false');
      expect(screen.getByTestId('toggle-include-upper-level-tax-courses').getAttribute('aria-checked')).toBe('false');
      expect((screen.getByTestId('select-sort') as HTMLSelectElement).value).toBe('rating-asc');
      expect(screen.getByTestId('toggle-include-seminars-colloquiums').getAttribute('aria-checked')).toBe('false');
      expect(screen.queryByTestId('button-toggle-course-filters')).toBeNull();
      expect(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('button-toggle-course-history-evidence-compact').getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('recent-semester-evidence-compact-3').textContent).toBe('🍂 Fall 2024 • Alice Doe Collapse');
      expect(screen.getByTestId('panel-top-professors-evidence').hasAttribute('hidden')).toBe(false);
      expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
      expect(screen.queryByTestId('row-courses-evidence-for-1ls')).toBeNull();
      expect(screen.queryByTestId('row-courses-evidence-online')).toBeNull();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
    } finally {
      scrollTo.mockRestore();
      if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    }
  });
});
