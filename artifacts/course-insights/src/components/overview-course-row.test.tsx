import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDataset, type RawData } from '@/lib/data';
import { OverviewCourseRow } from './overview-course-row';

function record(id: number, professor: string, rating: number | null, responded: number, course = 'Evidence'): RawData['records'][number] {
  return {
    id, professor, course, semester: 'Fall 2025', enrolled: 100, responded,
    scores: Array(10).fill(rating), inaccessible: false,
  };
}

function renderCourse(records: RawData['records']) {
  const dataset = buildDataset({ records, questions: [], sourceNotes: [] });
  const course = dataset.courses.find((item) => item.name === 'Evidence')!;
  render(<ul><OverviewCourseRow course={course} dataset={dataset} rank={1} testIdPrefix="upperclassman-" /></ul>);
}

beforeEach(() => window.history.replaceState(null, '', '/'));

describe('Overview course expansion', () => {
  it.each(['Income Taxation', 'Income Taxation (for LL.M. Students)'])('shows the Tax tag inline with %s, separated from its title', (name) => {
    const dataset = buildDataset({
      records: [record(1, 'Beta, Beth', 4.6, 40, name)], questions: [], sourceNotes: [],
    });
    const course = dataset.courses[0];
    render(<ul><OverviewCourseRow course={course} dataset={dataset} rank={1} testIdPrefix="upperclassman-" /></ul>);
    const title = screen.getByRole('link', { name });
    const tag = screen.getByText('Tax', { exact: true });
    expect(tag.parentElement).toBe(title.parentElement);
    expect(title.parentElement?.classList.contains('gap-2')).toBe(true);
    expect(tag.classList.contains('rounded-full')).toBe(true);
    expect(tag.classList.contains('bg-secondary')).toBe(true);
    expect(screen.getAllByText('Tax', { exact: true })).toHaveLength(1);
    if (name.includes('LL.M.')) expect(screen.getByText('LLM').parentElement).toBe(title.parentElement);
  });

  it('insets the expanded background on both sides and keeps long professor names within the panel', () => {
    renderCourse([record(1, 'Worcester-Fitzgerald, Alexandria Catherine-Montgomery', 4.6, 40)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    const panel = screen.getByTestId('panel-top-professors-evidence');
    expect(panel.classList.contains('mx-4')).toBe(true);
    expect(panel.classList.contains('sm:mr-5')).toBe(true);
    expect(panel.classList.contains('mb-3')).toBe(true);
    expect(panel.classList.contains('min-w-0')).toBe(true);
    const row = within(panel).getByRole('listitem');
    expect(row.classList.contains('grid-cols-[1rem_minmax(0,1fr)]')).toBe(true);
    expect(row.classList.contains('sm:grid-cols-[1rem_minmax(0,1fr)_auto]')).toBe(true);
    expect(within(row).getByRole('link').classList.contains('break-words')).toBe(true);
    expect(within(row).getByRole('meter').closest('[data-testid^="rating-course-professor-"]')?.parentElement?.classList.contains('max-w-full')).toBe(true);
  });

  it('shows all eligible course-specific, response-weighted teaching ratings and collapses without navigation', () => {
    renderCourse([
      record(1, 'Alpha, Alice', 5, 4),
      record(2, 'Alpha, Alice', 3, 36),
      record(3, 'Alpha, Alice', 5, 100, 'Contracts'),
      record(4, 'Beta, Beth', 4.6, 20),
      record(5, 'Gamma, Grace', 4.8, 20),
      record(6, 'Delta, Diana', 4.5, 20),
      record(7, 'Unrated, Una', null, 20),
      record(8, 'Small, Sally', 5, 19),
    ]);
    const panel = screen.getByTestId('panel-top-professors-evidence');
    expect(panel.hidden).toBe(true);
    const button = screen.getByRole('button', { name: 'Expand top professors for Evidence' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(window.location.pathname).toBe('/');
    const entries = within(panel).getAllByRole('listitem');
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => within(entry).getByRole('link').textContent)).toEqual([
      'Grace Gamma', 'Beth Beta', 'Diana Delta', 'Alice Alpha',
    ]);
    expect(within(entries[0]).getByRole('meter').getAttribute('aria-valuenow')).toBe('4.8');
    expect(within(entries[0]).getByText('20 reviews · 1 time taught')).toBeTruthy();
    expect(within(panel).queryByText(/response-weighted across this course/)).toBeNull();
    expect(within(panel).queryByText('Small Sample')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }));
    expect(panel.hidden).toBe(true);
    expect(window.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(panel.hidden).toBe(false);
    expect(within(panel).getAllByRole('listitem')).toHaveLength(4);
  });

  it('only navigates to the course when the title is clicked', () => {
    renderCourse([record(1, 'Beta, Beth', 4.6, 20)]);
    const reviews = screen.getByTestId('text-upperclassman-course-reviews-evidence');
    expect(reviews.closest('a')).toBeNull();
    fireEvent.click(reviews);
    expect(window.location.pathname).toBe('/');
    const title = screen.getByRole('link', { name: 'Evidence' });
    expect(title.getAttribute('href')).toBe('/courses/evidence');
    fireEvent.click(title);
    expect(window.location.pathname).toBe('/courses/evidence');
  });

  it('shows only professors with usable ratings and enough reviews', () => {
    renderCourse([record(1, 'Beta, Beth', 4.6, 20), record(2, 'Unrated, Una', null, 20)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(within(screen.getByTestId('panel-top-professors-evidence')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('explains when there are no usable teaching ratings', () => {
    renderCourse([record(1, 'Unrated, Una', null, 20), record(2, 'Zero, Zoe', 5, 0)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(screen.getByText('No professors have teaching ratings with at least 20 reviews for this course.')).toBeTruthy();
  });

  it('counts reviews across the same course’s offerings, never other courses', () => {
    renderCourse([
      record(1, 'Beta, Beth', 4.6, 10),
      record(2, 'Beta, Beth', 4.4, 10),
      record(3, 'Small, Sally', 5, 19),
      record(4, 'Small, Sally', 5, 100, 'Contracts'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    const entries = within(screen.getByTestId('panel-top-professors-evidence')).getAllByRole('listitem');
    expect(entries).toHaveLength(1);
    expect(within(entries[0]).getByRole('link').textContent).toBe('Beth Beta');
    expect(within(entries[0]).getByText('20 reviews · 2 times taught')).toBeTruthy();
  });

  it('explains when all rated professors fall below the minimum', () => {
    renderCourse([record(1, 'Small, Sally', 5, 19)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(screen.getByText('No professors have teaching ratings with at least 20 reviews for this course.')).toBeTruthy();
  });
});
