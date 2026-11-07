import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Flag, LoaderCircle, MessageSquareText, Star } from 'lucide-react';
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

const INITIAL_COMMENT_LIMIT = 25;

const difficultyLabels: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very hard',
};

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
  const mutation = useCreateExamFeedback({
    mutation: {
      onSuccess: async () => {
        setDifficulty(null);
        setComment('');
        await queryClient.invalidateQueries({ queryKey: summaryQueryKey });
      },
    },
  });
  const cleanComment = comment.trim();
  const valid = difficulty != null || cleanComment.length >= 10;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || mutation.isPending) return;
    mutation.mutate({
      data: {
        professor,
        course,
        difficulty,
        comment: cleanComment || null,
        website: '',
      },
    });
  }

  return (
    <form onSubmit={submit} className="bg-card border rounded-xl p-5 md:p-6 space-y-5" data-testid="form-exam-feedback">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">Your experience</div>
        <h2 className="font-display text-2xl mt-1">How difficult was the exam?</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose a difficulty from 1 to 5. You can also submit a comment on its own.</p>
      </div>

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
  const [selectedCourse, setSelectedCourse] = useState('');
  const [commentLimit, setCommentLimit] = useState(INITIAL_COMMENT_LIMIT);
  const [reportedIds, setReportedIds] = useState<Set<number>>(() => new Set());
  const [reportMessage, setReportMessage] = useState('');
  const queryClient = useQueryClient();
  const availableCourses = useMemo(() => {
    const group = dataset?.profBySlug.get(dataset.profSlugByName.get(selectedProfessor) ?? '');
    return [...new Set(group?.records.map((record) => record.course) ?? [])].sort((a, b) => a.localeCompare(b));
  }, [dataset, selectedProfessor]);

  const params = selectedProfessor && selectedCourse
    ? { professor: selectedProfessor, course: selectedCourse, limit: commentLimit }
    : undefined;
  const summaryQuery = useListExamFeedback(
    params ?? { professor: '', course: '', limit: commentLimit },
    { query: { enabled: Boolean(params), staleTime: 60_000 } },
  );
  const reportMutation = useReportExamFeedback();

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
    <div className="rise max-w-5xl">
      <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">After the exam</div>
      <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">Share how the exam felt</h1>
      <p className="text-muted-foreground mt-3 max-w-3xl leading-relaxed">
        Leave an anonymous difficulty rating, a comment, or both for a professor and course. Feedback is grouped across semesters for that specific professor–course pairing.
      </p>
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-accent/50 bg-accent/30 p-4 text-sm leading-relaxed">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
        <p>Posts are public immediately. Keep comments respectful and based on your own experience; don’t include personal details or private exam questions. Comments with three separate reports are hidden automatically.</p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        No account or display name is attached to a post. The app does not store raw IP addresses; it uses a one-way network fingerprint for short-term spam limits and to prevent repeat reports.
      </p>

      <section className="mt-8 rounded-xl border bg-card p-5 md:p-6">
        <h2 className="font-display text-2xl">Choose who and what to rate</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Professor</span>
            <select
              value={selectedProfessor}
              onChange={(event) => {
                setSelectedProfessor(event.target.value);
                setSelectedCourse('');
                setCommentLimit(INITIAL_COMMENT_LIMIT);
                setReportMessage('');
              }}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
              data-testid="select-feedback-professor"
            >
              <option value="">Choose a professor</option>
              {dataset.professors.map((professor) => (
                <option key={professor.slug} value={professor.name}>{professor.label}</option>
              ))}
            </select>
          </label>
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
