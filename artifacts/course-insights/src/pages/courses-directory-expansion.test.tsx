import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import { CoursesPage } from './directory';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

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

  it('places Filters between Semester and Sort in the search toolbar', () => {
    render(<CoursesPage />);
    const toolbar = screen.getByTestId('directory-toolbar-courses');
    const semesterSelect = screen.getByTestId('select-semester');
    const filtersButton = screen.getByTestId('button-toggle-course-filters');
    const sortSelect = screen.getByTestId('select-sort');
    const controlsPanel = document.getElementById('directory-filter-controls');

    expect(filtersButton.parentElement).toBe(toolbar);
    expect(semesterSelect.compareDocumentPosition(filtersButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filtersButton.compareDocumentPosition(sortSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.lastElementChild?.contains(sortSelect)).toBe(true);
    expect(controlsPanel?.parentElement?.hasAttribute('hidden')).toBe(true);

    fireEvent.click(filtersButton);

    expect(filtersButton.getAttribute('aria-expanded')).toBe('true');
    expect(controlsPanel?.parentElement?.hasAttribute('hidden')).toBe(false);
  });

  it('shows the same eligible, ranked professors and keeps expansion separate from course navigation', () => {
    render(<CoursesPage />);

    expect(screen.getByText('You have to take Professional Responsibility, but there are 13 professors teaching it. How do you choose whose class to take? We have all the data to help you decide.')).toBeTruthy();
    const table = screen.getByTestId('directory-table');
    const tableHeader = screen.getByTestId('directory-table-header');
    expect(table.classList.contains('overflow-clip')).toBe(true);
    expect(tableHeader.classList.contains('sticky')).toBe(true);
    expect(tableHeader.classList.contains('top-36')).toBe(true);
    expect(tableHeader.textContent).toContain('Recent Professors');
    expect(tableHeader.textContent).not.toContain('Recent professors and semesters');
    const ratingHeader = screen.getByTestId('button-sort-rating');
    expect(ratingHeader.parentElement?.classList.contains('text-center')).toBe(true);
    expect(screen.queryByText('Teaching')).toBeNull();
    const row = screen.getByTestId('row-courses-evidence');
    expect(within(row).queryByTestId('rating-course-teaching-evidence')).toBeNull();
    const spring2026 = within(row).getByTestId('recent-semester-evidence-compact-0');
    expect(spring2026.textContent).toBe('Spring 2026 • Alice Doe');
    expect(spring2026.querySelector('strong')?.textContent).toBe('Spring 2026');
    expect(within(row).getByTestId('recent-semester-evidence-compact-1').textContent).toBe('Fall 2025 • Alice Doe, Sam Small');
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
    expect(within(entries[0]).getByText('50 reviews · 2 times taught · Most recently: Spring 2026')).toBeTruthy();
    expect(within(entries[1]).getByText('25 reviews · 1 time taught · Most recently: Spring 2024')).toBeTruthy();
    expect(window.location.pathname).toBe('/');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }));
    expect(panel.hidden).toBe(true);
    fireEvent.click(within(row).getByRole('link', { name: 'Evidence' }));
    expect(window.location.pathname).toBe('/courses/evidence');
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
        makeRecord(3, 'Roe, Bob', 5, 60, 'Contracts', 4.6),
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
      fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Spring 2026' } });
      fireEvent.change(screen.getByTestId('select-sort'), { target: { value: 'rating-asc' } });
      fireEvent.click(screen.getByTestId('button-toggle-course-filters'));
      fireEvent.click(screen.getByTestId('filter-category-seminar'));
      fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
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
      expect((screen.getByTestId('select-semester') as HTMLSelectElement).value).toBe('Spring 2026');
      expect((screen.getByTestId('select-sort') as HTMLSelectElement).value).toBe('rating-asc');
      expect((screen.getByTestId('filter-category-seminar') as HTMLInputElement).checked).toBe(false);
      expect(screen.getByTestId('button-toggle-course-filters').getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }).getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('panel-top-professors-evidence').hasAttribute('hidden')).toBe(false);
      expect(screen.getByTestId('row-courses-evidence')).toBeTruthy();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640));
    } finally {
      scrollTo.mockRestore();
      if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    }
  });
});
