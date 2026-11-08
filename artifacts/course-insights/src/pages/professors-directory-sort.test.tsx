import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
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
  return render(<ProfessorsPage />);
}

function renderDirectoryWithData(data: ReturnType<typeof buildDataset>) {
  vi.mocked(useDataset).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  return render(<ProfessorsPage />);
}

function professorOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid^="row-professors-"]'))
    .map((row) => row.querySelector('.font-medium.truncate')?.textContent);
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
  it('shows the requested professor-directory introduction', () => {
    renderDirectory();
    expect(screen.getByText("You're in law school to learn from the best professors. But who are the best professors? It used to be nearly impossible to find that data: until we went out and got it.")).toBeTruthy();
    expect(screen.getByTestId('directory-table-header').classList.contains('sticky')).toBe(true);
    expect(screen.getByTestId('directory-table-header').classList.contains('top-36')).toBe(true);
    const aliceRow = screen.getByTestId('row-professors-alice-doe');
    expect(aliceRow.textContent).toContain('Last Taught Fall 2025');
    expect(aliceRow.textContent).not.toContain('Latest Fall 2025');
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

  it('toggles each sortable column and syncs the Sort selector', () => {
    const { container } = renderDirectory();
    const sort = screen.getByTestId('select-sort');
    expect(selectedSort()).toBe('name');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);

    fireEvent.click(screen.getByTestId('button-sort-professor'));
    expect(selectedSort()).toBe('name');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);
    fireEvent.click(screen.getByTestId('button-sort-professor'));
    expect(selectedSort()).toBe('name-desc');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);

    fireEvent.click(screen.getByTestId('button-sort-teaching'));
    expect(selectedSort()).toBe('rating');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);
    fireEvent.click(screen.getByTestId('button-sort-teaching'));
    expect(selectedSort()).toBe('rating-asc');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);

    expect(screen.queryByTestId('button-sort-courses')).toBeNull();
    fireEvent.change(sort, { target: { value: 'courses' } });
    expect(selectedSort()).toBe('courses');
    expect(professorOrder(container)).toEqual(['Alice Doe', 'Bob Roe']);
    fireEvent.change(sort, { target: { value: 'courses-asc' } });
    expect(selectedSort()).toBe('courses-asc');
    expect(professorOrder(container)).toEqual(['Bob Roe', 'Alice Doe']);

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
