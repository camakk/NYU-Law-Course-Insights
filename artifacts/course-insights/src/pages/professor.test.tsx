import { fireEvent, render, screen, within } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import ProfessorPage from './professor';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

function makeRecord(
  id: number,
  course: string,
  semester: string,
  professor = 'Cox, Adam B.',
): RawData['records'][number] {
  return {
    id,
    course,
    professor,
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

function renderProfessorPage(data = dataset, professorSlug = data.professors[0].slug) {
  vi.mocked(useDataset).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  window.history.replaceState(null, '', `/professors/${professorSlug}`);
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

  it('shows all-time rank, percentile tier, and grade instead of the old score header', () => {
    const rankedDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: Array.from({ length: 100 }, (_, index) => {
        const scores = Array(10).fill(4.5);
        scores[5] = 5 - index * 0.04;
        return {
          ...makeRecord(index + 1, `Course ${index + 1}`, 'Fall 2025', `Prof, Faculty ${index}`),
          scores,
        };
      }),
    });
    const topProfessor = rankedDataset.professors.find((group) => group.name === 'Prof, Faculty 0')!;
    renderProfessorPage(rankedDataset, topProfessor.slug);

    expect(screen.queryByTestId('text-overall-score')).toBeNull();
    const standingCards = screen.getByTestId('professor-standing-cards');
    expect(standingCards.textContent).toContain('Rank #1');
    expect(standingCards.textContent).toContain('out of 100 rated professors');
    expect(standingCards.textContent).toContain('Top 1%');
    expect(standingCards.textContent).toContain('A+');
    expect(screen.queryByText('Overall this professor was effective')).toBeNull();
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

  it('shows a reusable name-variation note on Scott Hemphill’s profile', () => {
    const hemphillDataset = buildDataset({
      questions: [],
      sourceNotes: [],
      records: [
        makeRecord(1, 'Antitrust Law', 'Fall 2025', 'Hemphill, Scott'),
        makeRecord(2, 'Survey of Intellectual Property (for 1Ls)', 'Spring 2019', 'Hemphill, Christopher'),
      ],
    });
    const scott = hemphillDataset.professors.find((group) => group.label === 'Scott Hemphill')!;
    renderProfessorPage(hemphillDataset, scott.slug);

    expect(screen.getByTestId('text-professor-name').textContent).toBe('Scott Hemphill');
    expect(screen.getByTestId('professor-note-scott-hemphill-name-variation-0').textContent)
      .toContain('Some course reviews refer to Scott Hemphill as Christopher Hemphill.');
    expect(screen.getByTestId('list-professor-offerings').textContent)
      .toContain('Survey of Intellectual Property (for 1Ls)');
  });
});
