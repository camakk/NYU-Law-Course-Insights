import { fireEvent, render, screen } from '@testing-library/react';
import { Route, Router, Switch } from 'wouter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, useDataset, type RawData } from '@/lib/data';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CoursesPage } from './directory';
import CoursePage from './course';

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  useDataset: vi.fn(),
}));

const dataset = buildDataset({
  questions: [],
  sourceNotes: [],
  records: [{
    id: 1,
    professor: 'Doe, Alice',
    course: 'Evidence',
    semester: 'Fall 2025',
    enrolled: 100,
    responded: 60,
    scores: Array(10).fill(4.5),
    inaccessible: false,
  } satisfies RawData['records'][number]],
});

describe('course detail navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/courses');
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.mocked(useDataset).mockReturnValue({
      data: dataset,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDataset>);
  });

  it('opens a course detail page at the top after clicking a course', () => {
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    try {
      render(
        <TooltipProvider>
          <Router>
            <Switch>
              <Route path="/courses" component={CoursesPage} />
              <Route path="/courses/:id" component={CoursePage} />
            </Switch>
          </Router>
        </TooltipProvider>,
      );

      fireEvent.click(screen.getByRole('link', { name: 'Evidence' }));

      expect(window.location.pathname).toBe('/courses/evidence');
      expect(screen.getByTestId('text-course-title').textContent).toBe('Evidence');
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    } finally {
      scrollTo.mockRestore();
      if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
    }
  });
});
