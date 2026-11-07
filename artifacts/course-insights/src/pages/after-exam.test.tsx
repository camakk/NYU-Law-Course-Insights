import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AfterExamPage from '@/pages/after-exam';
import { useDataset } from '@/lib/data';
import {
  useCreateExamFeedback,
  useListExamFeedback,
  useReportExamFeedback,
} from '@workspace/api-client-react';

vi.mock('@/lib/data', () => ({
  useDataset: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  getListExamFeedbackQueryKey: vi.fn(() => ['exam-feedback']),
  useCreateExamFeedback: vi.fn(),
  useListExamFeedback: vi.fn(),
  useReportExamFeedback: vi.fn(),
}));

const dataset = {
  professors: [{ slug: 'jane-doe', name: 'Doe, Jane', label: 'Jane Doe' }],
  profSlugByName: new Map([['Doe, Jane', 'jane-doe']]),
  profBySlug: new Map([
    ['jane-doe', { records: [{ course: 'Torts' }] }],
  ]),
} as unknown as ReturnType<typeof useDataset>['data'];

const createMutation = vi.fn();

function mutationState({
  isError = false,
  isSuccess = false,
  error = null,
}: {
  isError?: boolean;
  isSuccess?: boolean;
  error?: Error | null;
} = {}) {
  vi.mocked(useCreateExamFeedback).mockReturnValue({
    mutate: createMutation,
    isPending: false,
    isError,
    isSuccess,
    error,
  } as unknown as ReturnType<typeof useCreateExamFeedback>);
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <AfterExamPage />
    </QueryClientProvider>
  );
  return { ...render(tree), client };
}

function chooseProfessorAndCourse() {
  fireEvent.change(screen.getByTestId('input-feedback-professor'), {
    target: { value: 'Jane' },
  });
  fireEvent.click(screen.getByRole('option', { name: 'Jane Doe' }));
  fireEvent.change(screen.getByTestId('select-feedback-course'), {
    target: { value: 'Torts' },
  });
}

function chooseCompletion(value: 'true' | 'false' = 'true') {
  fireEvent.click(screen.getByTestId(`radio-exam-completed-${value}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDataset).mockReturnValue({
    data: dataset,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useDataset>);
  vi.mocked(useListExamFeedback).mockReturnValue({
    data: {
      averageDifficulty: null,
      ratingCount: 0,
      difficultyCounts: [0, 0, 0, 0, 0],
      comments: [],
      commentCount: 0,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useListExamFeedback>);
  vi.mocked(useReportExamFeedback).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof useReportExamFeedback>);
  mutationState();
});

describe('after-exam feedback form', () => {
  it('keeps both exam-completion choices selectable', () => {
    renderPage();
    chooseProfessorAndCourse();

    const finished = screen.getByTestId('radio-exam-completed-true');
    const unfinished = screen.getByTestId('radio-exam-completed-false');
    expect(finished).toBeTruthy();
    expect(unfinished).toBeTruthy();

    fireEvent.click(finished);
    expect((finished as HTMLInputElement).checked).toBe(true);
    fireEvent.click(unfinished);
    expect((finished as HTMLInputElement).checked).toBe(false);
    expect((unfinished as HTMLInputElement).checked).toBe(true);
  });

  it('requires completion and a rating or valid comment before submitting', () => {
    renderPage();
    chooseProfessorAndCourse();

    const submit = screen.getByTestId('button-submit-feedback') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.submit(screen.getByTestId('form-exam-feedback'));
    expect(createMutation).not.toHaveBeenCalled();

    chooseCompletion();
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('rating-4'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(createMutation).toHaveBeenCalledWith({
      data: expect.objectContaining({
        professor: 'Doe, Jane',
        course: 'Torts',
        difficulty: 4,
        examCompleted: true,
        comment: null,
      }),
    });
  });

  it('accepts a comment by itself only when it reaches ten characters', () => {
    renderPage();
    chooseProfessorAndCourse();
    chooseCompletion('false');

    const comment = screen.getByTestId('textarea-feedback-comment');
    const submit = screen.getByTestId('button-submit-feedback') as HTMLButtonElement;
    fireEvent.change(comment, { target: { value: 'Too short' } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(comment, { target: { value: 'Useful note' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(createMutation).toHaveBeenCalledWith({
      data: expect.objectContaining({
        difficulty: null,
        comment: 'Useful note',
        examCompleted: false,
      }),
    });
  });

  it('shows a success message after a successful submission', async () => {
    const page = renderPage();
    chooseProfessorAndCourse();
    chooseCompletion();
    fireEvent.click(screen.getByTestId('rating-3'));
    fireEvent.click(screen.getByTestId('button-submit-feedback'));
    expect(createMutation).toHaveBeenCalledTimes(1);

    mutationState({ isSuccess: true });
    page.rerender(
      <QueryClientProvider client={page.client}>
        <AfterExamPage />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId('feedback-submit-success')).textContent).toContain(
      'Your anonymous feedback was saved. Thank you for sharing your experience.',
    );
  });

  it('shows the submission error returned by the API', async () => {
    const page = renderPage();
    chooseProfessorAndCourse();
    chooseCompletion();
    fireEvent.click(screen.getByTestId('rating-3'));
    fireEvent.click(screen.getByTestId('button-submit-feedback'));
    expect(createMutation).toHaveBeenCalledTimes(1);

    mutationState({ isError: true, error: new Error('Network unavailable') });
    page.rerender(
      <QueryClientProvider client={page.client}>
        <AfterExamPage />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId('feedback-submit-error')).textContent).toContain(
      'Network unavailable',
    );
  });
});
