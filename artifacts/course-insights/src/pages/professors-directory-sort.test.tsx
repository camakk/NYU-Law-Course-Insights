import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProfessorsPage } from './directory';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

function makeRecord(id: number, professor: string, course: string, rating: number, responded: number, semester = 'Fall 2025'): RawData['records'][number] {
  return {
    id,
    professor,
    course,
    semester,
    enrolled: 100,
    responded,
    scores: Array(10).fill(rating),
    inaccessible: false,
  };
}

const dataset = buildDataset({
  questions: [],
  sourceNotes: [],
  records: [
    makeRecord(1, 'Doe, Alice', 'Evidence', 4.2, 20),
    makeRecord(2, 'Doe, Alice', 'Evidence', 4.2, 20),
    makeRecord(3, 'Doe, Alice', 'Contracts', 4.2, 20),
    makeRecord(4, 'Doe, Alice', 'Torts', 4.2, 20),
    makeRecord(5, 'Roe, Bob', 'Evidence', 5, 10),
    makeRecord(6, 'Roe, Bob', 'Evidence', 5, 10),
    makeRecord(7, 'Roe, Bob', 'Evidence', 5, 10),
    makeRecord(8, 'Roe, Bob', 'Evidence', 5, 10),
    makeRecord(9, 'Roe, Bob', 'Contracts', 5, 10),
  ],
});

function renderDirectory() {
  vi.mocked(useDataset).mockReturnValue({
    data: dataset,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  return render(<TooltipProvider><ProfessorsPage /></TooltipProvider>);
}

function renderDirectoryWithData(data: ReturnType<typeof buildDataset>) {
  vi.mocked(useDataset).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  return render(<TooltipProvider><ProfessorsPage /></TooltipProvider>);
}

function professorOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid^="row-professors-"]'))
    .map((row) => row.querySelector('.font-medium')?.textContent);
}

function selectedSort() {
  return (screen.getByTestId('select-sort') as HTMLSelectElement).value;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.clearAllMocks();
});

describe('Professor table sorting', () => {
  it('shows every matching professor without a Load More control', () => {
    const allProfessorsDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: Array.from({ length: 125 }, (_, index) =>
        makeRecord(index + 1, `Professor${index + 1}, Person${index + 1}`, 'Evidence', 4.5, 60),
      ),
    });

    renderDirectoryWithData(allProfessorsDataset);

    expect(screen.getAllByTestId(/^row-professors-/)).toHaveLength(125);
    expect(screen.queryByTestId('button-load-more')).toBeNull();
  });

  it('shows the requested professor-directory introduction', () => {
    renderDirectory();
    expect(screen.getByText("You're in law school to learn from the best professors. But who are the best professors? It used to be nearly impossible to find that data: until we went out and got it.")).toBeTruthy();
    const header = screen.getByTestId('directory-table-header');
    const row = screen.getByTestId('row-professors-alice-doe');
    expect(header.classList.contains('sticky')).toBe(true);
    expect(header.classList.contains('top-36')).toBe(true);
    expect(header.textContent).toContain('Recent Courses');
    expect(header.textContent).not.toContain('Recent courses and semesters');
    expect(screen.getByText('Recent Courses').classList.contains('normal-case')).toBe(true);
    const professorColumnLayout = 'xl:grid-cols-[3rem_minmax(7rem,0.56fr)_minmax(21rem,1.64fr)_12rem_6rem_7rem_2rem]';
    expect(header.classList.contains(professorColumnLayout)).toBe(true);
    expect(row.classList.contains(professorColumnLayout)).toBe(true);
    const professorName = row.querySelector('.font-medium');
    expect(professorName?.classList.contains('whitespace-normal')).toBe(true);
    expect(professorName?.classList.contains('break-words')).toBe(true);
    expect(professorName?.classList.contains('hover:underline')).toBe(true);
    expect(professorName?.classList.contains('truncate')).toBe(false);
    expect(screen.queryByTestId('select-semester')).toBeNull();
    expect(row.textContent).toContain('Last Taught Fall 2025');
    expect(row.textContent).not.toContain('Latest Fall 2025');
  });

  it('wraps long professor names instead of truncating them', () => {
    const longNameDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Worcester-Fitzgerald, Alexandria Catherine-Montgomery', 'Evidence', 4.6, 60),
      ],
    });
    renderDirectoryWithData(longNameDataset);

    const professor = longNameDataset.professors[0];
    const row = screen.getByTestId(`row-professors-${professor.slug}`);
    const name = row.querySelector('.font-medium');

    expect(name?.textContent).toBe(professor.label);
    expect(name?.classList.contains('whitespace-normal')).toBe(true);
    expect(name?.classList.contains('break-words')).toBe(true);
    expect(name?.classList.contains('truncate')).toBe(false);
  });

  it('places Filters just left of Sort in the search toolbar and expands below it', () => {
    renderDirectory();
    const toolbar = screen.getByTestId('directory-toolbar-professors');
    const filtersButton = screen.getByTestId('button-toggle-professor-filters');
    const sortSelect = screen.getByTestId('select-sort');
    const controlsPanel = document.getElementById('directory-filter-controls');

    expect(filtersButton.parentElement).toBe(toolbar);
    expect(filtersButton.compareDocumentPosition(sortSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.lastElementChild?.contains(sortSelect)).toBe(true);
    expect(controlsPanel?.parentElement?.hasAttribute('hidden')).toBe(true);

    fireEvent.click(filtersButton);

    expect(filtersButton.getAttribute('aria-expanded')).toBe('true');
    expect(controlsPanel?.parentElement?.hasAttribute('hidden')).toBe(false);
  });

  it('changes the Minimum reviews slider in ten-review increments', () => {
    renderDirectory();
    fireEvent.click(screen.getByTestId('button-toggle-professor-filters'));

    const slider = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    expect(slider.getAttribute('aria-valuenow')).toBe('50');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider.getAttribute('aria-valuenow')).toBe('60');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('60+');
  });

  it('restores all default professor filters without clearing the search or sort', () => {
    const activityDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Old, Pat', 'Evidence', 4.4, 60, 'Spring 2021'),
        makeRecord(2, 'Recent, Alex', 'Torts Seminar', 4.1, 60, 'Spring 2026'),
      ],
    });
    renderDirectoryWithData(activityDataset);
    fireEvent.click(screen.getByTestId('button-toggle-professor-filters'));
    expect(screen.queryByText('Include course categories')).toBeNull();
    expect(screen.queryByTestId('filter-category-course')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle-active-professors'));

    const offeringsThumb = screen.getByTestId('filter-min-offerings-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    const reviewsThumb = screen.getByTestId('filter-min-responses-slider')
      .querySelector('[role="slider"]') as HTMLElement;
    fireEvent.keyDown(offeringsThumb, { key: 'ArrowRight' });
    fireEvent.keyDown(reviewsThumb, { key: 'ArrowRight' });

    expect(screen.getByTestId('filter-min-offerings-value').textContent).toBe('2+');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('60+');
    expect(screen.getByTestId('filter-score-range-value').textContent).toBe('No minimum · No maximum');

    const setDefaultButton = screen.getByTestId('button-set-default-filters');
    const clearButton = screen.getByTestId('button-clear-filters');
    expect(setDefaultButton.compareDocumentPosition(clearButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(setDefaultButton.parentElement).toBe(clearButton.parentElement);
    expect(setDefaultButton.parentElement?.className).toContain('justify-end');
    expect(setDefaultButton.parentElement?.className).not.toContain('flex-wrap');
    fireEvent.click(setDefaultButton);

    expect(screen.getByTestId('filter-min-offerings-value').textContent).toBe('1+');
    expect(screen.getByTestId('filter-min-responses-value').textContent).toBe('50+');
    expect(screen.getByTestId('filter-score-range-value').textContent).toBe('No minimum · No maximum');
    expect(screen.getByTestId('toggle-active-professors').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('row-professors-alex-recent')).toBeTruthy();
    expect(screen.queryByTestId('row-professors-pat-old')).toBeNull();
    expect(selectedSort()).toBe('rating');
    expect((screen.getByTestId('input-search-professors') as HTMLInputElement).value).toBe('');
  });

  it('shows up to three recent distinct semesters for a professor-course pair', () => {
    const historyDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Harawa, Daniel', 'Evidence', 4.5, 20, 'Spring 2026'),
        makeRecord(2, 'Harawa, Daniel', 'Evidence', 4.5, 20, 'Spring 2025'),
        makeRecord(3, 'Harawa, Daniel', 'Evidence', 4.5, 20, 'Fall 2024'),
        makeRecord(4, 'Harawa, Daniel', 'Evidence', 4.5, 20, 'Spring 2024'),
        makeRecord(5, 'Harawa, Daniel', 'Evidence', 4.5, 20, 'Spring 2025'),
      ],
    });

    const { container } = renderDirectoryWithData(historyDataset);
    const row = container.querySelector('[data-testid="row-professors-daniel-harawa"]');
    expect(row?.textContent).toContain('Evidence · Spring 2026, Spring 2025, Fall 2024');
    expect(row?.textContent).not.toContain('Spring 2024');
  });

  it('hides inactive professors by default and includes them when Active only is off', () => {
    const activityDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Old, Pat', 'Evidence', 4.4, 60, 'Spring 2021'),
        makeRecord(2, 'Recent, Alex', 'Torts', 4.1, 60, 'Spring 2026'),
      ],
    });

    renderDirectoryWithData(activityDataset);
    const activeOnlyToggle = screen.getByTestId('toggle-active-professors');
    expect(screen.getByText('Active professors only')).toBeTruthy();
    expect(activeOnlyToggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('row-professors-pat-old')).toBeNull();

    fireEvent.click(activeOnlyToggle);
    const row = screen.getByTestId('row-professors-pat-old');
    const badge = screen.getByTestId('badge-professor-inactive-pat-old');

    expect(row.textContent).toContain('Last Taught Spring 2021');
    expect(badge.textContent).toBe('Inactive');
    expect(badge.previousElementSibling?.textContent).toBe('Last Taught Spring 2021');
    expect(screen.queryByTestId('badge-professor-inactive-alex-recent')).toBeNull();
    expect(screen.getByTestId('row-professors-alex-recent')).toBeTruthy();
  });

  it('explains the active-professor time window from the info tooltip', async () => {
    renderDirectory();
    const infoButton = screen.getByTestId('button-professor-activity-info');

    fireEvent.pointerMove(infoButton, { pointerType: 'mouse', clientX: 0, clientY: 0 });

    expect(await screen.findByText(
      'A professor is considered active if they have taught a course in the last three years.',
      {},
      { timeout: 3000 },
    )).toBeTruthy();
  });

  it('toggles each sortable column and syncs the Sort selector', () => {
    const { container } = renderDirectory();
    expect(selectedSort()).toBe('rating');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
    expect(screen.queryByRole('option', { name: 'Most courses taught' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Fewest courses taught' })).toBeNull();

    fireEvent.click(screen.getByTestId('button-sort-professor'));
    expect(selectedSort()).toBe('name');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);
    fireEvent.click(screen.getByTestId('button-sort-professor'));
    expect(selectedSort()).toBe('name-desc');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);

    expect(screen.getByText('Teaching').className).toContain('text-center');
    expect(screen.getByTestId('button-sort-teaching').className).toContain('justify-center');
    expect(screen.getByTestId('button-sort-teaching').querySelector('svg')?.classList.contains('absolute')).toBe(true);
    fireEvent.click(screen.getByTestId('button-sort-teaching'));
    expect(selectedSort()).toBe('rating');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
    fireEvent.click(screen.getByTestId('button-sort-teaching'));
    expect(selectedSort()).toBe('rating-asc');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);

    expect(screen.queryByTestId('button-sort-courses')).toBeNull();
    fireEvent.click(screen.getByTestId('button-sort-times-taught'));
    expect(selectedSort()).toBe('offerings');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
    fireEvent.click(screen.getByTestId('button-sort-times-taught'));
    expect(selectedSort()).toBe('offerings-asc');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);

    fireEvent.click(screen.getByTestId('button-sort-reviews'));
    expect(selectedSort()).toBe('responses');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);
    fireEvent.click(screen.getByTestId('button-sort-reviews'));
    expect(selectedSort()).toBe('responses-asc');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
  });

  it('starts the header’s descending order after the Sort selector changes', () => {
    const { container } = renderDirectory();
    const sort = screen.getByTestId('select-sort');
    fireEvent.change(sort, { target: { value: 'offerings-asc' } });
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);

    fireEvent.click(screen.getByTestId('button-sort-times-taught'));
    expect(selectedSort()).toBe('offerings');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
  });
});
