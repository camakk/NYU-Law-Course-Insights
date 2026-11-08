import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Flag, LoaderCircle, MessageSquareText, Search, Star } from 'lucide-react';
import {
  getListExamFeedbackQueryKey,
  useCreateExamFeedback,
  useListExamFeedback,
  useReportExamFeedback,
  type ExamFeedback,
  type ExamFeedbackSummary,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageError, PageLoading, useTitle } from '@/components/kit';
import { useDataset } from '@/lib/data';
import { getExamCompletionLabel } from '@/lib/exam-completion-label';

const INITIAL_COMMENT_LIMIT = 25;

const difficultyLabels: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very hard',
};

function normalizeSearch(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function FeedbackComposer({
  professor,
  course,
  summaryQueryKey,
}: {
  professor: string;
  course: string;
  summaryQueryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [examCompleted, setExamCompleted] = useState<boolean | null>(null);
  const [grade, setGrade] = useState('');
  const mutation = useCreateExamFeedback({
    mutation: {
      onSuccess: async () => {
        setDifficulty(null);
        setComment('');
        setExamCompleted(null);
        setGrade('');
        await queryClient.invalidateQueries({ queryKey: summaryQueryKey });
      },
    },
  });
  const cleanComment = comment.trim();
  const cleanGrade = grade.trim();
  const valid = examCompleted != null &&
    (difficulty != null || cleanComment.length >= 10) &&
    (!cleanGrade || cleanComment.length >= 10);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || examCompleted == null || mutation.isPending) return;
    mutation.mutate({
      data: {
        professor,
        course,
        difficulty,
        comment: cleanComment || null,
        examCompleted,
        grade: cleanGrade || null,
        website: '',
      },
    });
  }

  return (
    <form onSubmit={submit} className="bg-card border rounded-xl p-5 md:p-6 space-y-5" data-testid="form-exam-feedback">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">Your experience</div>
        <h2 className="font-display text-2xl mt-1">How difficult was the exam?</h2>
        <p className="text-sm text-muted-foreground mt-1">Tell us whether you finished the exam. Then choose a difficulty, leave a comment, or both.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium mb-2">
          Did you finish this exam? <span className="text-muted-foreground font-normal">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-3">
          {[
            { value: true, label: 'Yes, I finished' },
            { value: false, label: 'No, I did not finish' },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${examCompleted === option.value ? 'border-primary bg-primary/5' : 'bg-background hover:border-primary/60'}`}
            >
              <input
                type="radio"
                name="exam-completed"
                value={String(option.value)}
                required={option.value}
                checked={examCompleted === option.value}
                onChange={() => setExamCompleted(option.value)}
                data-testid={`radio-exam-completed-${option.value}`}
                className="accent-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium mb-2">Exam difficulty <span className="text-muted-foreground font-normal">(optional)</span></legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Exam difficulty" data-testid="rating-difficulty">
          {Object.entries(difficultyLabels).map(([key, label]) => {
            const score = Number(key);
            const selected = difficulty === score;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${score}: ${label}`}
                onClick={() => setDifficulty(selected ? null : score)}
                data-testid={`rating-${score}`}
                className={`flex min-w-14 flex-col items-center rounded-lg border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background hover:border-primary hover:bg-secondary/50'}`}
              >
                <span className="flex items-center gap-1 font-semibold"><Star className="h-3.5 w-3.5" />{score}</span>
                <span className="text-[10px] mt-0.5">{label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Comment <span className="text-muted-foreground font-normal">(optional with a rating)</span>
        </span>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value.slice(0, 1200))}
          maxLength={1200}
          placeholder="Share what the exam was like, how it matched the course, or anything future students should know."
          rows={5}
          data-testid="textarea-feedback-comment"
          aria-describedby="comment-guidance"
        />
        <span className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span id="comment-guidance">A comment by itself must be at least 10 characters. Don’t include names, email addresses, or private exam questions.</span>
          <span className="shrink-0 num">{comment.length}/1,200</span>
        </span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">
          Exam grade <span className="text-muted-foreground font-normal">(optional)</span>
        </span>
        <input
          type="text"
          value={grade}
          onChange={(event) => setGrade(event.target.value.slice(0, 30))}
          maxLength={30}
          placeholder="e.g., A−, B+, or Pass"
          aria-describedby="grade-guidance"
          data-testid="input-feedback-grade"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <span id="grade-guidance" className="block text-xs text-muted-foreground">
          Your self-reported grade is shared anonymously with your comment and is not verified. Add a comment of at least 10 characters to include it.
        </span>
      </label>

      <input className="hidden" type="text" name="website" value="" readOnly tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {mutation.isError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="feedback-submit-error">
          {mutation.error.message || 'Your feedback could not be saved. Please try again.'}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="feedback-submit-success">
          Your anonymous feedback was saved. Thank you for sharing your experience.
        </p>
      )}
      <Button type="submit" disabled={!valid || mutation.isPending} data-testid="button-submit-feedback">
        {mutation.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving…</> : 'Submit anonymously'}
      </Button>
    </form>
  );
}

function DifficultyDistribution({ counts, total }: { counts: number[]; total: number }) {
  return (
    <div className="space-y-2" aria-label="Exam difficulty ratings breakdown" data-testid="difficulty-distribution">
      {[5, 4, 3, 2, 1].map((score) => {
        const count = counts[score - 1] ?? 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={score} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{score} · {difficultyLabels[score]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </span>
            <span className="num text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function CommentCard({
  feedback,
  onReport,
  reported,
  reporting,
}: {
  feedback: ExamFeedback;
  onReport: (id: number) => void;
  reported: boolean;
  reporting: boolean;
}) {
  return (
    <article className="rounded-xl border bg-card p-4 md:p-5" data-testid={`feedback-comment-${feedback.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">Anonymous student</div>
          <time className="text-xs text-muted-foreground" dateTime={feedback.createdAt}>
            {new Date(feedback.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </time>
        </div>
        {feedback.difficulty != null && (
          <span className="num inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold" data-testid={`feedback-score-${feedback.id}`}>
            <Star className="h-3.5 w-3.5" /> {feedback.difficulty}/5 · {difficultyLabels[feedback.difficulty]}
          </span>
        )}
      </header>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-3 py-1.5 font-medium" data-testid={`feedback-exam-completed-${feedback.id}`}>
          {getExamCompletionLabel(feedback)}
        </span>
        {feedback.grade && (
          <span className="rounded-full bg-secondary px-3 py-1.5 font-medium" data-testid={`feedback-grade-${feedback.id}`}>
            Grade: {feedback.grade}
          </span>
        )}
      </div>
      {feedback.comment && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{feedback.comment}</p>}
      <footer className="mt-4 flex items-center justify-end border-t pt-3">
        <button
          type="button"
          onClick={() => onReport(feedback.id)}
          disabled={reported || reporting}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 transition hover:text-destructive disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
          aria-label={`Report anonymous comment ${feedback.id}`}
          data-testid={`button-report-${feedback.id}`}
        >
          <Flag className="h-3.5 w-3.5" />
          {reported ? 'Reported' : reporting ? 'Sending…' : 'Report comment'}
        </button>
      </footer>
    </article>
  );
}

export default function AfterExamPage() {
  useTitle('After the exam');
  const { data: dataset, isLoading, error, refetch } = useDataset();
  const [selectedProfessor, setSelectedProfessor] = useState('');
  const [professorSearch, setProfessorSearch] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [commentLimit, setCommentLimit] = useState(INITIAL_COMMENT_LIMIT);
  const [reportedIds, setReportedIds] = useState<Set<number>>(() => new Set());
  const [reportMessage, setReportMessage] = useState('');
  const queryClient = useQueryClient();
  const availableCourses = useMemo(() => {
    const group = dataset?.profBySlug.get(dataset.profSlugByName.get(selectedProfessor) ?? '');
    return [...new Set(group?.records.map((record) => record.course) ?? [])].sort((a, b) => a.localeCompare(b));
  }, [dataset, selectedProfessor]);
  const professorSuggestions = useMemo(() => {
    const query = normalizeSearch(professorSearch);
    if (!query) return [];
    return (dataset?.professors ?? [])
      .filter((professor) => normalizeSearch(`${professor.label} ${professor.name}`).includes(query))
      .sort((a, b) => {
        const aStarts = normalizeSearch(a.label).startsWith(query) ? 0 : 1;
        const bStarts = normalizeSearch(b.label).startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.label.localeCompare(b.label);
      })
      .slice(0, 8);
  }, [dataset, professorSearch]);

  const params = selectedProfessor && selectedCourse
    ? { professor: selectedProfessor, course: selectedCourse, limit: commentLimit }
    : undefined;
  const summaryQuery = useListExamFeedback(
    params ?? { professor: '', course: '', limit: commentLimit },
    { query: { enabled: Boolean(params), staleTime: 60_000 } },
  );
  const reportMutation = useReportExamFeedback();

  function chooseProfessor(professor: { name: string; label: string }) {
    setSelectedProfessor(professor.name);
    setProfessorSearch(professor.label);
    setSelectedCourse('');
    setCommentLimit(INITIAL_COMMENT_LIMIT);
    setActiveSuggestionIndex(0);
    setReportedIds(new Set());
    setReportMessage('');
  }

  function handleProfessorSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (professorSearch || selectedProfessor) {
        event.preventDefault();
        setProfessorSearch('');
        setSelectedProfessor('');
        setSelectedCourse('');
        setActiveSuggestionIndex(0);
        setCommentLimit(INITIAL_COMMENT_LIMIT);
        setReportedIds(new Set());
        setReportMessage('');
      }
      return;
    }
    if (!professorSuggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((index) => Math.min(index + 1, professorSuggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseProfessor(professorSuggestions[activeSuggestionIndex] ?? professorSuggestions[0]);
    }
  }

  if (isLoading) return <PageLoading />;
  if (error || !dataset) return <PageError error={error} onRetry={() => refetch()} />;

  const summary = summaryQuery.data as ExamFeedbackSummary | undefined;
  const hasMore = summary != null && summary.comments.length < summary.commentCount;

  function handleReport(id: number) {
    setReportMessage('');
    reportMutation.mutate({ id }, {
      onSuccess: (result) => {
        if (result.reported) {
          setReportedIds((current) => new Set(current).add(id));
          setReportMessage('Thanks. Comments with three separate reports are hidden automatically.');
          void queryClient.invalidateQueries({
            queryKey: getListExamFeedbackQueryKey({ professor: selectedProfessor, course: selectedCourse }),
          });
        } else {
          setReportMessage('You have already reported this comment.');
        }
      },
      onError: () => setReportMessage('This comment could not be reported. Please try again.'),
    });
  }

  return (
    <div className="rise max-w-6xl">
      <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">After the exam</div>
      <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">Share how the exam felt</h1>
      <p className="text-muted-foreground mt-3 max-w-3xl leading-relaxed">
        Leave an anonymous difficulty rating, a comment, or both for a professor and course. New posts include whether you finished the exam; comments can include an optional grade.
      </p>
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-accent/50 bg-accent/30 p-4 text-sm leading-relaxed">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
        <p>Posts are public immediately. Your exam completion status and any grade you include will appear with your anonymous post. Keep comments respectful and based on your own experience; don’t include personal details or private exam questions. Comments with three separate reports are hidden automatically.</p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        No account or display name is attached to a post. The app does not store raw IP addresses; it uses a one-way network fingerprint for short-term spam limits and to prevent repeat reports.
      </p>

      <section className="mt-8 rounded-xl border bg-card p-5 md:p-6">
        <h2 className="font-display text-2xl">Choose who and what to rate</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm font-medium">
            <label htmlFor="feedback-professor-search">Professor</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="feedback-professor-search"
                type="text"
                inputMode="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={!selectedProfessor && Boolean(professorSearch.trim())}
                aria-controls={!selectedProfessor && professorSearch.trim() ? 'feedback-professor-suggestions' : undefined}
                aria-activedescendant={!selectedProfessor && professorSuggestions.length ? `feedback-professor-option-${activeSuggestionIndex}` : undefined}
                aria-label="Search professors"
                value={selectedProfessor
                  ? dataset.professors.find((professor) => professor.name === selectedProfessor)?.label ?? selectedProfessor
                  : professorSearch}
                onChange={(event) => {
                  setProfessorSearch(event.target.value);
                  setSelectedProfessor('');
                  setSelectedCourse('');
                  setActiveSuggestionIndex(0);
                  setCommentLimit(INITIAL_COMMENT_LIMIT);
                  setReportedIds(new Set());
                  setReportMessage('');
                }}
                onKeyDown={handleProfessorSearchKeyDown}
                placeholder="Search professors by name"
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                data-testid="input-feedback-professor"
              />
              {!selectedProfessor && professorSearch.trim() && (
                <ul
                  id="feedback-professor-suggestions"
                  role="listbox"
                  aria-label="Matching professors"
                  className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg"
                >
                  {professorSuggestions.length ? (
                    professorSuggestions.map((professor, index) => (
                      <li key={professor.slug}>
                        <button
                          id={`feedback-professor-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeSuggestionIndex}
                          tabIndex={-1}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onClick={() => chooseProfessor(professor)}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm font-normal ${index === activeSuggestionIndex ? 'bg-secondary text-foreground' : 'hover:bg-secondary/70'}`}
                        >
                          {professor.label}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li role="option" aria-disabled="true" className="px-3 py-2 text-sm text-muted-foreground">
                      No matching professors found.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            <span>Course</span>
            <select
              value={selectedCourse}
              disabled={!selectedProfessor}
              onChange={(event) => {
                setSelectedCourse(event.target.value);
                setCommentLimit(INITIAL_COMMENT_LIMIT);
                setReportedIds(new Set());
                setReportMessage('');
              }}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="select-feedback-course"
            >
              <option value="">{selectedProfessor ? 'Choose a course taught by this professor' : 'Choose a professor first'}</option>
              {availableCourses.map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This project includes historical evaluations from 2016–2026. Select a pairing from those records; submitted difficulty ratings and comments aren’t assigned to a particular semester.
        </p>
      </section>

      {params && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <FeedbackComposer
              key={`${selectedProfessor}\u0000${selectedCourse}`}
              professor={selectedProfessor}
              course={selectedCourse}
              summaryQueryKey={getListExamFeedbackQueryKey({ professor: selectedProfessor, course: selectedCourse })}
            />
            <section className="rounded-xl border bg-card p-5 md:p-6" aria-live="polite" data-testid="feedback-summary">
              <h2 className="font-display text-2xl">Exam difficulty</h2>
              {summaryQuery.isLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">Loading ratings…</p>
              ) : summaryQuery.error ? (
                <div className="mt-3">
                  <p role="alert" className="text-sm text-destructive">{summaryQuery.error.message || 'Could not load feedback.'}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void summaryQuery.refetch()}>Try again</Button>
                </div>
              ) : summary ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-semibold" data-testid="text-average-difficulty">
                      {summary.averageDifficulty == null ? '—' : summary.averageDifficulty.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 5 · {summary.ratingCount} {summary.ratingCount === 1 ? 'rating' : 'ratings'}</span>
                  </div>
                  {summary.ratingCount ? (
                    <div className="mt-5">
                      <DifficultyDistribution counts={summary.difficultyCounts} total={summary.ratingCount} />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No difficulty ratings yet. You can be the first.</p>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">1 = very easy · 5 = very hard. Each submission contributes one rating.</p>
                </>
              ) : null}
            </section>
          </div>

          <section className="space-y-4" aria-labelledby="reader-comments-title">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-primary"><MessageSquareText className="h-4 w-4" /><span className="text-[11px] uppercase tracking-[0.2em] font-semibold">Independent comments</span></div>
                <h2 id="reader-comments-title" className="font-display text-3xl mt-1">What students shared</h2>
              </div>
              <span className="text-xs text-muted-foreground">{summaryQuery.data?.commentCount ?? 0} comments</span>
            </header>

            {summaryQuery.isLoading ? (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Loading comments…</p>
            ) : summaryQuery.error ? (
              <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Comments are temporarily unavailable. Please try again.</p>
            ) : summary?.comments.length ? (
              <>
                {summary.comments.map((feedback) => (
                  <CommentCard
                    key={feedback.id}
                    feedback={feedback}
                    onReport={handleReport}
                    reported={reportedIds.has(feedback.id)}
                    reporting={reportMutation.isPending && reportMutation.variables?.id === feedback.id}
                  />
                ))}
                {reportMessage && (
                  <p role="status" className="text-sm text-muted-foreground" data-testid="report-message">{reportMessage}</p>
                )}
                {hasMore && (
                  <Button
                    variant="outline"
                    onClick={() => setCommentLimit((limit) => Math.min(limit + INITIAL_COMMENT_LIMIT, 100))}
                    disabled={commentLimit >= 100}
                    data-testid="button-load-more-comments"
                  >
                    Load more comments
                  </Button>
                )}
                {commentLimit >= 100 && hasMore && <p className="text-xs text-muted-foreground">Showing the 100 most recent comments.</p>}
              </>
            ) : (
              <div className="rounded-xl border border-dashed bg-card/60 p-7 text-center">
                <MessageSquareText className="mx-auto h-7 w-7 text-muted-foreground/70" />
                <h3 className="font-display text-xl mt-3">No comments yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Share a useful, respectful note about your experience.</p>
              </div>
            )}
            {!summaryQuery.error && reportMessage && summary?.comments.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground" data-testid="report-message">{reportMessage}</p>
            )}
          </section>
        </div>
      )}

      {!params && (
        <div className="mt-8 rounded-xl border border-dashed bg-card/60 p-8 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-muted-foreground/70" />
          <h2 className="font-display text-2xl mt-3">Choose a professor and course</h2>
          <p className="text-sm text-muted-foreground mt-2">Ratings and comments are grouped by this pairing and shown together across terms.</p>
        </div>
      )}

      {reportMessage && params && summaryQuery.data?.comments.length !== 0 && (
        <p role="status" className="sr-only" data-testid="report-message-live">{reportMessage}</p>
      )}
    </div>
  );
}
