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
  it('shows the top three course-specific, response-weighted teaching ratings and collapses without navigation', () => {
    renderCourse([
      record(1, 'Alpha, Alice', 5, 1),
      record(2, 'Alpha, Alice', 3, 9),
      record(3, 'Alpha, Alice', 5, 100, 'Contracts'),
      record(4, 'Beta, Beth', 4.6, 20),
      record(5, 'Gamma, Grace', 4.8, 2),
      record(6, 'Delta, Diana', 4.5, 15),
      record(7, 'Unrated, Una', null, 20),
    ]);
    const panel = screen.getByTestId('panel-top-professors-evidence');
    expect(panel.hidden).toBe(true);
    const button = screen.getByRole('button', { name: 'Expand top professors for Evidence' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(window.location.pathname).toBe('/');
    const entries = within(panel).getAllByRole('listitem');
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => within(entry).getByRole('link').textContent)).toEqual([
      'Grace Gamma', 'Beth Beta', 'Diana Delta',
    ]);
    expect(within(entries[0]).getByRole('meter').getAttribute('aria-valuenow')).toBe('4.8');
    expect(within(entries[0]).getByText('2 reviews · 1 rated offering')).toBeTruthy();
    expect(within(entries[0]).getByText('low sample')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse top professors for Evidence' }));
    expect(panel.hidden).toBe(true);
    expect(window.location.pathname).toBe('/');
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

  it('shows fewer than three when fewer professors have ratings', () => {
    renderCourse([record(1, 'Beta, Beth', 4.6, 20), record(2, 'Unrated, Una', null, 20)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(within(screen.getByTestId('panel-top-professors-evidence')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('explains when there are no usable teaching ratings', () => {
    renderCourse([record(1, 'Unrated, Una', null, 20), record(2, 'Zero, Zoe', 5, 0)]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand top professors for Evidence' }));
    expect(screen.getByText('No teaching ratings are available for this course.')).toBeTruthy();
  });
});
