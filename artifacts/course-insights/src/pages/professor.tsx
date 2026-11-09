import { useLayoutEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import { aggregate, bySemesterDesc, calculateProfessorStanding, fmt, fmtInt, MIN_REVIEWS_FOR_PROFESSOR_RANKING, usable, useDataset, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { Empty, SmallSample, NativeSelect, NotFoundEntity, PageError, PageLoading, RatingBar, Stat, useTitle } from '@/components/kit';

const PROFESSOR_EFFECTIVE_QUESTION = 5;
const COURSE_EFFECTIVE_QUESTION = 8;
const OTHER_QUESTION_INDEXES = Array.from({ length: 10 }, (_, index) => index)
  .filter((index) => index !== PROFESSOR_EFFECTIVE_QUESTION && index !== COURSE_EFFECTIVE_QUESTION);
const COURSE_COLOR_BLUE = '#2563EB';
const COURSE_COLOR_BROWN = '#8B5A2B';
const COURSE_COLOR_PURPLE = '#7C3AED';
const COURSE_COLOR_OVERRIDES: Record<string, string> = {
  'constitutional law (for 1ls)': COURSE_COLOR_BLUE,
  'free expression and social media seminar': COURSE_COLOR_BROWN,
  'leadership, diversity, and inclusion': COURSE_COLOR_PURPLE,
};
const COURSE_COLOR_PALETTE = [
  COURSE_COLOR_BLUE, '#1D4ED8', '#3B82F6', '#1E40AF', '#60A5FA', '#0EA5E9', '#0284C7', '#075985', '#1E3A8A', '#4338CA',
  COURSE_COLOR_PURPLE, '#8B5CF6', '#6D28D9', '#9333EA', '#A855F7', '#C084FC', '#5B21B6', '#A21CAF', '#C026D3', '#D946EF', '#86198F', '#701A75',
  '#0891B2', '#06B6D4', '#0E7490', '#155E75', '#22D3EE', '#164E63',
  COURSE_COLOR_BROWN, '#A0522D', '#6F4E37', '#795548', '#92400E', '#78350F',
  '#475569', '#64748B', '#334155', '#52525B',
];
const EXTRA_COURSE_COLOR_HUES = [210, 222, 234, 246, 258, 270, 282, 294, 306, 190, 198, 28, 32];
const EFFECTIVENESS_GRADE_PILL_STYLES: Record<string, string> = {
  'A+': 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  A: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  'A-': 'border-lime-300 bg-gradient-to-r from-lime-100 to-yellow-100 text-lime-800 dark:border-lime-700 dark:from-lime-900/60 dark:to-yellow-900/50 dark:text-lime-200',
  'B+': 'border-lime-300 bg-gradient-to-r from-lime-100 via-yellow-100 to-yellow-200 text-amber-800 dark:border-lime-700 dark:from-lime-900/50 dark:via-yellow-900/50 dark:to-yellow-900/60 dark:text-yellow-200',
  B: 'border-yellow-300 bg-yellow-100 text-amber-800 dark:border-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-200',
  'B-': 'border-orange-300 bg-gradient-to-r from-yellow-100 to-red-200 text-red-800 dark:border-orange-700 dark:from-yellow-900/50 dark:to-red-900/60 dark:text-orange-200',
};

function offeringScore(record: EvalRecord, questionIndex: number): number | null {
  return usable(record, questionIndex) ? record.scores[questionIndex] : null;
}

function extraCourseColor(index: number): string {
  const hue = EXTRA_COURSE_COLOR_HUES[index % EXTRA_COURSE_COLOR_HUES.length];
  const shade = Math.floor(index / EXTRA_COURSE_COLOR_HUES.length);
  const isBrown = hue === 28 || hue === 32;
  const saturation = 55 + (shade % 7) * 5;
  const lightness = isBrown
    ? 24 + (Math.floor(shade / 7) % 6) * 3
    : 32 + (Math.floor(shade / 7) % 11) * 4;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function buildCourseOfferingColors(courseNames: string[]): Map<string, string> {
  const courses = [...new Set(courseNames)].sort((a, b) => a.localeCompare(b));
  const colorByCourse = new Map<string, string>();
  const usedColors = new Set<string>();

  courses.forEach((course) => {
    const preferredColor = COURSE_COLOR_OVERRIDES[course.trim().toLowerCase()];
    if (preferredColor) {
      colorByCourse.set(course, preferredColor);
      usedColors.add(preferredColor);
    }
  });

  let paletteIndex = 0;
  for (const course of courses) {
    if (colorByCourse.has(course)) continue;
    while (paletteIndex < COURSE_COLOR_PALETTE.length && usedColors.has(COURSE_COLOR_PALETTE[paletteIndex])) {
      paletteIndex++;
    }
    const color = COURSE_COLOR_PALETTE[paletteIndex] ?? extraCourseColor(paletteIndex - COURSE_COLOR_PALETTE.length);
    paletteIndex++;
    colorByCourse.set(course, color);
    usedColors.add(color);
  }
  return colorByCourse;
}

function Profile({ ds, g }: { ds: Dataset; g: Group }) {
  useTitle(g.label);
  const [sem, setSem] = useState('all');
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [g.slug]);

  const recs = useMemo(() => (sem === 'all' ? g.records : g.records.filter((r) => r.semester === sem)), [g, sem]);
  const offerings = useMemo(() => {
    const sortedRecords = [...recs].sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.id - b.id);
    const totalByCourseSemester = new Map<string, number>();
    for (const record of sortedRecords) {
      const key = `${record.course}\u0000${record.semester}`;
      totalByCourseSemester.set(key, (totalByCourseSemester.get(key) ?? 0) + 1);
    }
    const seenByCourseSemester = new Map<string, number>();
    return sortedRecords.map((record) => {
      const key = `${record.course}\u0000${record.semester}`;
      const section = (seenByCourseSemester.get(key) ?? 0) + 1;
      seenByCourseSemester.set(key, section);
      return {
        record,
        section: totalByCourseSemester.get(key)! > 1 ? section : null,
      };
    });
  }, [recs]);
  const distinctCourses = useMemo(() => {
    const latestSemesterByCourse = new Map<string, string>();
    for (const record of recs) {
      const latestSemester = latestSemesterByCourse.get(record.course);
      if (!latestSemester || bySemesterDesc(record.semester, latestSemester) < 0) {
        latestSemesterByCourse.set(record.course, record.semester);
      }
    }
    return [...latestSemesterByCourse.entries()]
      .map(([course, semester]) => ({ course, semester: semester || 'Semester unavailable' }))
      .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course));
  }, [recs]);
  const overall = useMemo(() => Array.from({ length: 10 }, (_, q) => aggregate(recs, q)), [recs]);
  const standing = useMemo(
    () => calculateProfessorStanding(
      ds.professors.map((professor) => ({
        score: professor.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.avg ?? null,
        reviews: professor.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.responses ?? 0,
      })),
      {
        score: g.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.avg ?? null,
        reviews: g.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.responses ?? 0,
      },
    ),
    [ds.professors, g],
  );
  const qs = ds.questions;
  const totalResp = recs.reduce((s, r) => s + (!r.inaccessible && r.responded ? r.responded : 0), 0);
  const effectivenessScore = g.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.avg ?? null;
  const courseColors = useMemo(
    () => buildCourseOfferingColors(g.records.map((record) => record.course)),
    [g.records],
  );

  return (
    <div className="rise">
      <Link href="/professors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4" data-testid="link-back"><ChevronLeft className="h-4 w-4" />All professors</Link>
      <div className="grid min-w-0 gap-6 pb-6 border-b xl:grid-cols-[minmax(0,1fr)_minmax(32rem,1.2fr)] xl:items-start" data-testid="professor-header">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Professor</div>
          <h1 className="font-display text-4xl md:text-6xl font-semibold mt-2" data-testid="text-professor-name">{g.label}</h1>
          {g.label !== g.name && <p className="text-xs text-muted-foreground mt-1">Listed in source as "{g.name}"</p>}
          <p className="text-sm text-muted-foreground mt-2">Taught {g.semesters[g.semesters.length - 1]} – {g.semesters[0]}</p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 xl:w-full xl:justify-self-end" data-testid="professor-standing-cards">
          {[
            {
              id: 'rank',
              label: 'Overall Rank',
              value: standing.belowReviewThreshold
                ? 'N/A'
                : standing.rank == null
                  ? 'Not ranked'
                  : `Rank #${fmtInt(standing.rank)}`,
              sub: standing.belowReviewThreshold
                ? `Professors with fewer than ${MIN_REVIEWS_FOR_PROFESSOR_RANKING} reviews are not included in overall rankings`
                : standing.rank == null
                  ? 'No overall teaching score to rank'
                  : `out of ${fmtInt(standing.totalRated)} professors with ${MIN_REVIEWS_FOR_PROFESSOR_RANKING}+ reviews`,
            },
            {
              id: 'score',
              label: 'Effectiveness Score',
              value: effectivenessScore == null
                ? 'N/A'
                : `${effectivenessScore.toFixed(2)} / 5.00`,
              sub: '',
            },
            {
              id: 'grade',
              label: 'Effectiveness Grade',
              value: standing.belowReviewThreshold ? 'N/A' : standing.grade ?? '—',
                sub: '',
            },
          ].map((card) => (
              <article
                key={card.id}
                className="relative isolate flex min-h-[9rem] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.6rem] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.07] p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                data-testid={`professor-standing-${card.id}`}
              >
                <span aria-hidden="true" className="absolute -right-4 -top-5 h-16 w-16 rounded-full bg-primary/[0.07]" />
                <span aria-hidden="true" className="absolute -bottom-5 -left-4 h-10 w-10 rounded-full bg-accent/20" />
                <div className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {card.label}
                </div>
                <div
                  className={`relative z-10 mt-2 inline-flex max-w-full items-center justify-center rounded-full border num ${
                    card.id === 'grade'
                      ? `min-h-14 px-6 text-4xl font-bold leading-none shadow-sm ${EFFECTIVENESS_GRADE_PILL_STYLES[card.value] ?? 'border-primary/10 bg-primary/10 text-primary'}`
                      : 'min-h-10 bg-primary/10 px-4 text-lg font-semibold text-primary sm:text-xl'
                  }`}
                  data-testid={`professor-standing-${card.id}-value`}
                >
                  {card.value}
                </div>
                {card.sub && (
                  <p className="relative z-10 mt-2 max-w-full text-xs leading-relaxed text-muted-foreground">
                    {card.sub}
                  </p>
                )}
              </article>
            ))}
        </div>
      </div>
      {g.profileNotes?.map((note, index) => (
        <aside
          key={`${note.type}-${index}`}
          className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
          data-testid={`professor-note-${g.slug}-${note.type}-${index}`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Name variation</div>
          <p className="mt-1 text-sm text-muted-foreground">{note.text}</p>
        </aside>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-3 items-start gap-3 my-6" data-testid="professor-summary-cards">
        <Stat label="Offerings" value={recs.length} sub={sem === 'all' ? 'all semesters' : sem} />
        <Stat
          label="Distinct courses"
          value={distinctCourses.length}
          sub={distinctCourses.length > 0 ? (
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-2" data-testid="list-professor-distinct-courses">
              {distinctCourses.map(({ course, semester }, index) => (
                <li key={course} className="break-words leading-relaxed" data-testid={`text-professor-course-history-${index}`}>
                  <span className="font-medium text-foreground">{course}</span>
                  <span> (last taught {semester})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">No courses taught in this semester.</p>
          )}
        />
        <Stat label="Responses (offering totals)" value={fmtInt(totalResp)} sub={<SmallSample responses={overall[5].responses} />} />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <NativeSelect label="Semester" value={sem} onChange={setSem} testId="select-semester">
          <option value="all">All semesters ({g.semesters.length})</option>
          {g.semesters.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
      </div>

      <section className="mb-10" aria-labelledby="offering-chart-title">
        <h2 id="offering-chart-title" className="font-display text-2xl mb-1">Every offering, newest to oldest</h2>
        <p className="text-sm text-muted-foreground mb-3">Each row is one course offering. Overall teaching and course scores are emphasized; the other eight question scores appear inline.</p>
        {offerings.length === 0 ? (
          <Empty title="No course offerings" hint="There are no offerings for this semester." />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_10rem_10rem] xl:grid-cols-[minmax(14rem,1fr)_12rem_12rem_minmax(26rem,2fr)] gap-4 border-b bg-muted/40 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Course offering</span>
              <span>Professor teaching</span>
              <span>Course overall</span>
              <span className="hidden xl:block">Other question scores</span>
            </div>
            <ol className="divide-y" data-testid="list-professor-offerings">
              {offerings.map(({ record, section }) => {
                const professorScore = offeringScore(record, PROFESSOR_EFFECTIVE_QUESTION);
                const courseScore = offeringScore(record, COURSE_EFFECTIVE_QUESTION);
                return (
                  <li
                    key={record.id}
                    className="relative grid grid-cols-1 gap-x-4 gap-y-3 p-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem] xl:grid-cols-[minmax(14rem,1fr)_12rem_12rem_minmax(26rem,2fr)] xl:items-center"
                    data-testid={`row-offering-${record.id}`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ backgroundColor: courseColors.get(record.course) ?? COURSE_COLOR_BLUE }}
                      data-testid={`course-color-block-${record.id}`}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/courses/${ds.courseSlugByName.get(record.course)!}`}
                        className="block truncate font-medium hover:text-primary hover:underline underline-offset-4"
                        data-testid={`link-offering-course-${record.id}`}
                      >
                        {record.course}
                      </Link>
                      <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{record.semester}</span>
                        {section != null && <span>· Section {section}</span>}
                        <span>· {record.responded == null ? 'N/A responses' : `${fmtInt(record.responded)} responses`}</span>
                        {record.inaccessible && <span>· inaccessible in source</span>}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Professor teaching</p>
                      <RatingBar
                        rating={professorScore}
                        label={`${g.label} overall teaching score for ${record.course}, ${record.semester}`}
                        compact
                        testId={`offering-professor-score-${record.id}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Course overall</p>
                      <RatingBar
                        rating={courseScore}
                        label={`${record.course} overall course score, taught by ${g.label} in ${record.semester}`}
                        compact
                        testId={`offering-course-score-${record.id}`}
                      />
                    </div>
                    <div className="min-w-0 md:col-span-3 xl:col-span-1">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground xl:hidden">Other question scores</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {OTHER_QUESTION_INDEXES.map((index) => {
                          const question = qs[index] ?? `Question ${index + 1}`;
                          const score = offeringScore(record, index);
                          return (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-1 text-[10px] sm:text-xs"
                              title={question}
                              aria-label={`${question}: ${fmt(score)}`}
                            >
                              <span className="font-medium text-muted-foreground">Q{index + 1}</span>
                              <span className="num text-foreground">{fmt(score)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-primary">Question key</summary>
        <ol className="mt-2 grid md:grid-cols-2 gap-1 list-decimal pl-5">{qs.map((q, i) => <li key={i}>{q}</li>)}</ol>
      </details>
    </div>
  );
}

export default function ProfessorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useDataset();
  useTitle(isLoading ? 'Loading' : 'Professor');
  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError error={error} onRetry={() => refetch()} />;
  const g = data.profBySlug.get(decodeURIComponent(id ?? ''));
  if (!g) return <NotFoundEntity kind="professor" />;
  return <Profile key={g.slug} ds={data} g={g} />;
}
