import { fireEvent, render, screen, within } from '@testing-library/react';
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
): RawData['records'][number] {
  const scores = Array(10).fill(4.2);
  scores[5] = teachingRating;
  return {
    id,
    professor,
    course: 'Evidence',
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
  it('shows the same eligible, ranked professors and keeps expansion separate from course navigation', () => {
    render(<CoursesPage />);

    const ratingHeader = screen.getByText('Course Rating');
    expect(ratingHeader.classList.contains('text-center')).toBe(true);
    expect(screen.queryByText('Teaching')).toBeNull();
    const row = screen.getByTestId('row-courses-evidence');
    expect(within(row).queryByTestId('rating-course-teaching-evidence')).toBeNull();
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
});
