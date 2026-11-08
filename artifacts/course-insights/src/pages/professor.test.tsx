import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import ProfessorPage from './professor';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

function makeRecord(id: number, course: string, semester: string): RawData['records'][number] {
  return {
    id,
    course,
    professor: 'Cox, Adam B.',
    semester,
    enrolled: 100,
    responded: 20,
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
const professor = dataset.professors[0];

function renderProfessorPage() {
  vi.mocked(useDataset).mockReturnValue({
    data: dataset,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  window.history.replaceState(null, '', `/professors/${professor.slug}`);
  return render(
    <Router>
      <Route path="/professors/:id" component={ProfessorPage} />
    </Router>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Professor detail summary', () => {
  it('replaces the Course Effective card with a full-width three-card summary and course history', () => {
    const { container } = renderProfessorPage();
    const summary = screen.getByTestId('professor-summary-cards');
    expect(summary.className).toContain('md:grid-cols-3');
    expect(summary.children).toHaveLength(3);
    expect(screen.queryByText('Course effective')).toBeNull();
    expect(screen.getByText('Distinct courses')).toBeTruthy();

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

  it('updates the distinct course list to the selected semester', () => {
    renderProfessorPage();
    fireEvent.change(screen.getByTestId('select-semester'), {
      target: { value: 'Fall 2024' },
    });

    const list = screen.getByTestId('list-professor-distinct-courses');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Torts (last taught Fall 2024)',
    ]);
    expect(screen.getByText('Distinct courses')).toBeTruthy();
  });
});
