import { fireEvent, render, screen, within } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import CoursePage from './course';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

vi.mock('@/components/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/kit')>()),
  RankBars: ({ data }: { data: { name: string }[] }) => (
    <div data-testid="comparison-chart">{data.map((entry) => entry.name).join(', ')}</div>
  ),
}));

function record(id: number, professor: string, responded: number | null, rating: number, semester = 'Spring 2026', course = 'Evidence'): RawData['records'][number] {
  return { id, professor, responded, course, semester, enrolled: 100, scores: Array(10).fill(rating), inaccessible: false };
}

const dataset = buildDataset({
  questions: Array.from({ length: 10 }, (_, i) => `Question ${i + 1}`),
  sourceNotes: [],
  records: [
    record(1, 'Doe, Alice', 10, 4.8),
    record(2, 'Doe, Alice', 10, 4.8, 'Fall 2025'),
    record(3, 'Roe, Bob', 19, 5),
    record(4, 'Smith, Casey', 20, 4.4),
    record(5, 'Roe, Bob', 80, 5, 'Spring 2026', 'Torts'),
    record(6, 'Zero, Dana', 0, 4),
    record(7, 'Missing, Evan', null, 4),
  ],
});

function renderCourse() {
  return render(<Router><Route path="/courses/:id" component={CoursePage} /></Router>);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/courses/evidence');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(useDataset).mockReturnValue({
    data: dataset, isLoading: false, error: null, refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
});

describe('course detail sample-size filter', () => {
  it('defaults on and includes exactly 20 reviews, summed across this course’s offerings only', () => {
    renderCourse();
    const toggle = screen.getByRole('switch', { name: 'Exclude small samples' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('select-semester').compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('link-professor-alice-doe').textContent).toMatch(/^1/);
    expect(screen.getByTestId('link-professor-casey-smith').textContent).toMatch(/^2/);
    expect(screen.queryByTestId('link-professor-bob-roe')).toBeNull();
    expect(screen.queryByTestId('link-professor-dana-zero')).toBeNull();
    expect(screen.queryByTestId('link-professor-evan-missing')).toBeNull();
    expect(screen.getByTestId('comparison-chart').textContent).toBe('Alice Doe, Casey Smith');
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('row')).toHaveLength(4);
    expect(table.queryByText('Bob Roe')).toBeNull();
  });

  it('restores small-sample professors in both comparisons and offering detail when switched off', () => {
    renderCourse();
    const toggle = screen.getByRole('switch', { name: 'Exclude small samples' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('link-professor-bob-roe').textContent).toMatch(/^1/);
    expect(screen.getByTestId('comparison-chart').textContent).toContain('Bob Roe');
    expect(within(screen.getByRole('table')).getByText('Bob Roe')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('link-professor-bob-roe')).toBeNull();
    expect(within(screen.getByRole('table')).queryByText('Bob Roe')).toBeNull();
  });

  it('applies the minimum within the selected semester and offers recovery when no professors qualify', () => {
    renderCourse();
    fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Spring 2026' } });
    expect(screen.queryByTestId('link-professor-alice-doe')).toBeNull();
    expect(screen.getByTestId('link-professor-casey-smith').textContent).toMatch(/^1/);
    expect(screen.getByTestId('comparison-chart').textContent).toBe('Casey Smith');
    fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Fall 2025' } });
    expect(screen.getByText('No professors match these filters')).toBeTruthy();
    expect(screen.getByText('No offerings match these filters.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Exclude small samples' }));
    expect(screen.getByTestId('link-professor-alice-doe')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });

  it('preserves the toggle and semester when the ranking metric changes', () => {
    renderCourse();
    fireEvent.click(screen.getByRole('switch', { name: 'Exclude small samples' }));
    fireEvent.change(screen.getByTestId('select-semester'), { target: { value: 'Spring 2026' } });
    fireEvent.change(screen.getByTestId('select-metric'), { target: { value: '0' } });
    expect(screen.getByRole('switch', { name: 'Exclude small samples' }).getAttribute('aria-checked')).toBe('false');
    expect((screen.getByTestId('select-semester') as HTMLSelectElement).value).toBe('Spring 2026');
    expect(screen.getByTestId('link-professor-bob-roe')).toBeTruthy();
  });
});
