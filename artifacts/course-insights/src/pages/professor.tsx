import { useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'wouter';
import { ChevronLeft, Info } from 'lucide-react';
import { bySemesterDesc, calculateProfessorStanding, fmtInt, MIN_REVIEWS_FOR_PROFESSOR_RANKING, usable, useDataset, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { Empty, NotFoundEntity, PageError, PageLoading, RatingBar, Score, useTitle } from '@/components/kit';
import { EffectivenessGradePill } from '@/components/effectiveness-grade-pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';

const PROFESSOR_EFFECTIVE_QUESTION = 5;
const COURSE_EFFECTIVE_QUESTION = 8;
const TEACHING_QUESTION_LABELS = ['Prepared\nfor Class', 'Clear Communication', 'Independent Thought', 'Respectful\nIn Class', 'Accessible\nOutside Class'];
const COURSE_QUESTION_LABELS: Record<number, string> = {
  6: 'Attendance\nImportant',
  7: 'Workload\nProper',
  9: 'Materials\nOrganized',
};
const OTHER_QUESTION_INDEXES = Array.from({ length: 10 }, (_, index) => index)
  .filter((index) => index !== PROFESSOR_EFFECTIVE_QUESTION && index !== COURSE_EFFECTIVE_QUESTION);
const COURSE_COLOR_BLUE = '#52779D';
const COURSE_COLOR_BROWN = '#8B7055';
const COURSE_COLOR_PURPLE = '#8A6D9E';
const COURSE_COLOR_OVERRIDES: Record<string, string> = {
  'constitutional law (for 1ls)': COURSE_COLOR_BLUE,
  'free expression and social media seminar': COURSE_COLOR_BROWN,
  'leadership, diversity, and inclusion': COURSE_COLOR_PURPLE,
};
const COURSE_COLOR_PALETTE = [
  COURSE_COLOR_BLUE, '#B39A55', COURSE_COLOR_PURPLE, '#718E78', '#B87570',
  '#579294', COURSE_COLOR_BROWN, '#B37F9A', '#6C7C91', '#A68A65',
  '#7275A3', '#8C995F', '#A36C83', '#729DAA', '#AC8464',
  '#667E68', '#9F8CAB', '#B4988A', '#768DAD', '#9A796A',
];
const EXTRA_COURSE_COLOR_HUES = [210, 35, 280, 145, 5, 185, 325, 70, 250, 115, 20, 300];
function offeringScore(record: EvalRecord, questionIndex: number): number | null {
  return usable(record, questionIndex) ? record.scores[questionIndex] : null;
}

function shortSemester(semester: string): string {
  const match = /^(Spring|Fall|Summer|Winter)\s+(\d{4})$/i.exec(semester.trim());
  if (!match) return semester;
  const seasons: Record<string, string> = { spring: 'S', fall: 'F', summer: 'Su', winter: 'W' };
  return `${seasons[match[1].toLowerCase()]} '${match[2].slice(-2)}`;
}

function needsThickSemesterDivider(previous: string, current: string): boolean {
  const prior = /^(Fall|Spring)\s+(\d{4})$/i.exec(previous.trim());
  const next = /^(Fall|Spring)\s+(\d{4})$/i.exec(current.trim());
  if (!prior || !next) return false;
  const priorSeason = prior[1].toLowerCase();
  const nextSeason = next[1].toLowerCase();
  return (priorSeason === 'fall' && nextSeason === 'spring')
    || (priorSeason === nextSeason && prior[2] !== next[2])
    || (priorSeason === 'spring' && nextSeason === 'fall' && Number(prior[2]) - Number(next[2]) > 1);
}

function extraCourseColor(index: number): string {
  const hue = EXTRA_COURSE_COLOR_HUES[index % EXTRA_COURSE_COLOR_HUES.length];
  const shade = Math.floor(index / EXTRA_COURSE_COLOR_HUES.length);
  const saturation = 28 + (shade % 3) * 6;
  const lightness = 42 + (Math.floor(shade / 3) % 5) * 6;
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
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [g.slug]);

  const recs = g.records;
  const [hiddenCourses, setHiddenCourses] = useState<Set<string>>(() => new Set());
  const historyCourses = useMemo(
    () => [...new Set(recs.map((record) => record.course))].sort((a, b) => a.localeCompare(b)),
    [recs],
  );
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
  const visibleOfferings = offerings.filter(({ record }) => !hiddenCourses.has(record.course));
  const distinctCourses = useMemo(() => {
    const latestSemesterByCourse = new Map<string, string>();
    for (const record of recs) {
      if (!record.courseCategories.includes('Course')) continue;
      const latestSemester = latestSemesterByCourse.get(record.course);
      if (!latestSemester || bySemesterDesc(record.semester, latestSemester) < 0) {
        latestSemesterByCourse.set(record.course, record.semester);
      }
    }
    return [...latestSemesterByCourse.entries()]
      .map(([course, semester]) => ({ course, semester: semester || 'Semester unavailable' }))
      .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course));
  }, [recs]);
  const distinctSeminarsAndColloquiums = useMemo(() => {
    const latestSemesterByCourse = new Map<string, string>();
    for (const record of recs) {
      if (
        !record.courseCategories.includes('Seminar') &&
        !record.courseCategories.includes('Colloquium')
      ) continue;
      const latestSemester = latestSemesterByCourse.get(record.course);
      if (!latestSemester || bySemesterDesc(record.semester, latestSemester) < 0) {
        latestSemesterByCourse.set(record.course, record.semester);
      }
    }
    return [...latestSemesterByCourse.entries()]
      .map(([course, semester]) => ({ course, semester: semester || 'Semester unavailable' }))
      .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course));
  }, [recs]);
  const distinctClinicsAndExternships = useMemo(() => {
    const latestSemesterByCourse = new Map<string, string>();
    for (const record of recs) {
      if (
        !record.courseCategories.includes('Clinic') &&
        !record.courseCategories.includes('Externship')
      ) continue;
      const latestSemester = latestSemesterByCourse.get(record.course);
      if (!latestSemester || bySemesterDesc(record.semester, latestSemester) < 0) {
        latestSemesterByCourse.set(record.course, record.semester);
      }
    }
    return [...latestSemesterByCourse.entries()]
      .map(([course, semester]) => ({ course, semester: semester || 'Semester unavailable' }))
      .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course));
  }, [recs]);
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
  const effectivenessScore = g.metrics[PROFESSOR_EFFECTIVE_QUESTION]?.avg ?? null;
  const courseColors = useMemo(
    () => buildCourseOfferingColors(g.records.map((record) => record.course)),
    [g.records],
  );

  return (
    <div className="rise">
      <Link
        href="/professors"
        onClick={(event) => {
          if (window.history.state?.courseInsightsFromProfessorDirectory === true) {
            event.preventDefault();
            window.history.back();
          }
        }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4"
        data-testid="link-back"
      ><ChevronLeft className="h-4 w-4" />All professors</Link>
      <div className="grid min-w-0 gap-6 pb-6 border-b xl:grid-cols-[minmax(0,1fr)_minmax(32rem,1.2fr)] xl:items-start" data-testid="professor-header">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Professor</div>
          <h1 className="font-display text-4xl md:text-6xl font-semibold mt-2" data-testid="text-professor-name">{g.label}</h1>
          {g.label !== g.name && <p className="text-xs text-muted-foreground mt-1">Listed in source as "{g.name}"</p>}
          <p className="text-sm text-muted-foreground mt-2">Taught {fmtInt(g.records.length)} Offerings from {g.semesters[g.semesters.length - 1]} - {g.semesters[0]}</p>
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
                  : `out of ${fmtInt(standing.totalRated)} professors rated`,
            },
            {
              id: 'score',
              label: 'Effectiveness Score',
              value: effectivenessScore == null
                ? 'N/A'
                : `${effectivenessScore.toFixed(2)} / 5.00`,
              sub: `based on ${fmtInt(g.totalResponded)} reviews`,
            },
            {
              id: 'grade',
              label: 'Effectiveness Grade',
              value: standing.grade ?? (standing.belowReviewThreshold ? 'N/A' : '—'),
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
                {card.id === 'grade' ? (
                  <EffectivenessGradePill
                    grade={card.value}
                    size="large"
                    className="relative z-10 mt-2"
                    testId={`professor-standing-${card.id}-value`}
                  />
                ) : (
                  <div
                    className="relative z-10 mt-2 inline-flex min-h-10 max-w-full items-center justify-center rounded-full border bg-primary/10 px-4 text-lg font-semibold text-primary num sm:text-xl"
                    data-testid={`professor-standing-${card.id}-value`}
                  >
                    {card.value}
                  </div>
                )}
                {card.sub && (
                  <p className="relative z-10 mt-2 flex max-w-full flex-wrap items-center justify-center gap-x-1 text-xs leading-relaxed text-muted-foreground">
                    <span>{card.sub}</span>
                    {card.id === 'rank' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Overall rank information"
                            data-testid="button-professor-rank-info"
                            className="inline-flex shrink-0 cursor-help rounded-full transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Info aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" className="max-w-xs text-center">
                          Only professors with 50 or more reviews were rated.
                        </TooltipContent>
                      </Tooltip>
                    )}
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

      <div className="grid grid-cols-1 md:grid-cols-3 items-start gap-3 my-6 text-xs" data-testid="professor-summary-cards">
        <div className="bg-card border rounded-xl p-4">
          <div
            className="text-[10px] normal-case tracking-normal text-muted-foreground"
            data-testid="text-professor-distinct-courses-label"
          >
            Courses Taught - {fmtInt(distinctCourses.length)}
          </div>
          {distinctCourses.length > 0 ? (
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-2" data-testid="list-professor-distinct-courses">
              {distinctCourses.map(({ course, semester }, index) => (
                <li key={course} className="break-words leading-relaxed" data-testid={`text-professor-course-history-${index}`}>
                  <span className="font-medium text-foreground">{course}</span>
                  <span> (last taught {semester})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No courses taught.</p>
          )}
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-4">
          <div
            className="text-[10px] normal-case tracking-normal text-muted-foreground"
            data-testid="text-professor-seminars-colloquiums-label"
          >
            Seminars and Colloquiums Taught - {fmtInt(distinctSeminarsAndColloquiums.length)}
          </div>
          {distinctSeminarsAndColloquiums.length > 0 ? (
            <ul
              className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-2"
              data-testid="list-professor-seminars-colloquiums"
            >
              {distinctSeminarsAndColloquiums.map(({ course, semester }, index) => (
                <li
                  key={course}
                  className="break-words leading-relaxed"
                  data-testid={`text-professor-seminar-history-${index}`}
                >
                  <span className="font-medium text-foreground">{course}</span>
                  <span> (last taught {semester})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No seminars or colloquiums taught.
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-4">
          <div
            className="text-[10px] normal-case tracking-normal text-muted-foreground"
            data-testid="text-professor-clinics-externships-label"
          >
            Clinics and Externships Taught - {fmtInt(distinctClinicsAndExternships.length)}
          </div>
          {distinctClinicsAndExternships.length > 0 ? (
            <ul
              className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-2"
              data-testid="list-professor-clinics-externships"
            >
              {distinctClinicsAndExternships.map(({ course, semester }, index) => (
                <li
                  key={course}
                  className="break-words leading-relaxed"
                  data-testid={`text-professor-clinic-externship-history-${index}`}
                >
                  <span className="font-medium text-foreground">{course}</span>
                  <span> (last taught {semester})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No clinics or externships taught.
            </p>
          )}
        </div>
      </div>

      <section className="mb-10" aria-labelledby="offering-chart-title">
        <h2 id="offering-chart-title" className="font-display text-2xl mb-1">{`Professor ${g.label}'s Teaching History`}</h2>
        <p className="text-sm text-muted-foreground mb-3">Each row is one course offering. Overall teaching and course scores are emphasized; each of the other eight question scores has its own column.</p>
        <fieldset className="mb-4" data-testid="professor-history-course-filters">
          <legend className="sr-only">Filter teaching history by course</legend>
          <div className="flex flex-wrap gap-2">
            {historyCourses.map((course) => {
              const id = `history-course-${g.slug}-${ds.courseSlugByName.get(course)}`;
              const color = courseColors.get(course) ?? COURSE_COLOR_BLUE;
              const checked = !hiddenCourses.has(course);
              return (
                <label
                  key={course}
                  htmlFor={id}
                  style={{ '--course-color': color, borderColor: color } as CSSProperties}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--course-color)_20%,transparent)] ${checked ? 'bg-[color-mix(in_srgb,var(--course-color)_12%,transparent)]' : 'bg-[color-mix(in_srgb,var(--course-color)_4%,transparent)]'}`}
                >
                  <Checkbox
                    id={id}
                    aria-label={course}
                    checked={checked}
                    style={{ borderColor: color, backgroundColor: checked ? color : 'transparent' }}
                    onCheckedChange={(checked) => setHiddenCourses((current) => {
                      const next = new Set(current);
                      if (checked === true) next.delete(course);
                      else next.add(course);
                      return next;
                    })}
                    className="shrink-0 cursor-pointer focus-visible:ring-[var(--course-color)]"
                  />
                  <span>{course}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {visibleOfferings.length === 0 ? (
          <Empty
            title={offerings.length === 0 ? 'No course offerings' : 'No courses selected'}
            hint={offerings.length === 0 ? 'There are no offerings for this professor.' : 'Check a course above to show its teaching history.'}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden md:grid md:grid-cols-[5rem_minmax(0,1fr)_8rem] xl:grid-cols-[5rem_minmax(14rem,1fr)_8rem_repeat(5,minmax(3.25rem,1fr))_8rem_repeat(3,minmax(3.25rem,1fr))] gap-4 border-b bg-muted/40 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="text-center normal-case" data-testid="header-offering-semester">Semester</span>
              <span>Course offering</span>
              <span className="w-[6.5rem] justify-self-end text-center normal-case" data-testid="header-teaching-overall">Teaching Overall</span>
              <div
                className="col-span-3 grid grid-cols-9 gap-2 xl:contents"
                data-testid="header-professor-score-columns"
              >
                {OTHER_QUESTION_INDEXES.slice(0, 5).map((index) => (
                  <span
                    key={index}
                    className="min-w-0 self-center whitespace-pre-line text-center text-[9px] leading-tight tracking-normal normal-case"
                    title={qs[index] ?? `Question ${index + 1}`}
                    data-testid={`header-professor-question-${index}`}
                  >
                    {TEACHING_QUESTION_LABELS[index]}
                  </span>
                ))}
                <span className="min-w-0 w-[6.5rem] justify-self-end text-center normal-case" data-testid="header-course-overall">
                  Course Overall
                </span>
                {OTHER_QUESTION_INDEXES.slice(5).map((index) => (
                  <span
                    key={index}
                    className="min-w-0 self-center whitespace-pre-line text-center text-[9px] leading-tight tracking-normal normal-case"
                    title={qs[index] ?? `Question ${index + 1}`}
                    data-testid={`header-professor-question-${index}`}
                  >
                    {COURSE_QUESTION_LABELS[index]}
                  </span>
                ))}
              </div>
            </div>
            <ol data-testid="list-professor-offerings">
              {visibleOfferings.map(({ record, section }, index) => {
                const professorScore = offeringScore(record, PROFESSOR_EFFECTIVE_QUESTION);
                const courseScore = offeringScore(record, COURSE_EFFECTIVE_QUESTION);
                const dividerClass = index === 0
                  ? ''
                  : needsThickSemesterDivider(visibleOfferings[index - 1].record.semester, record.semester)
                    ? 'border-t-[3px]'
                    : 'border-t';
                return (
                  <li
                    key={record.id}
                    className={`relative grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[5rem_minmax(0,1fr)_8rem] xl:grid-cols-[5rem_minmax(14rem,1fr)_8rem_repeat(5,minmax(3.25rem,1fr))_8rem_repeat(3,minmax(3.25rem,1fr))] md:items-center ${dividerClass}`}
                    data-testid={`row-offering-${record.id}`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ backgroundColor: courseColors.get(record.course) ?? COURSE_COLOR_BLUE }}
                      data-testid={`course-color-block-${record.id}`}
                    />
                    <div
                      className="whitespace-nowrap font-sans text-base font-medium tabular-nums text-muted-foreground md:text-center"
                      title={record.semester}
                      aria-label={record.semester}
                      data-testid={`offering-semester-${record.id}`}
                    >
                      {shortSemester(record.semester)}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/courses/${ds.courseSlugByName.get(record.course)!}`}
                        className="whitespace-normal break-words font-medium hover:text-primary hover:underline underline-offset-4"
                        data-testid={`link-offering-course-${record.id}`}
                      >
                        {record.course}
                      </Link>{' '}
                      <span
                        className="whitespace-nowrap text-[11px] font-normal text-muted-foreground/80"
                        data-testid={`offering-response-count-${record.id}`}
                      >
                        • {record.responded == null ? 'N/A responses' : `${fmtInt(record.responded)} responses`}
                      </span>
                      {(section != null || record.inaccessible) && (
                        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {section != null && <span>Section {section}</span>}
                          {record.inaccessible && <span>{section != null ? '· ' : ''}inaccessible in source</span>}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 md:justify-self-end">
                      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground md:hidden">Teaching Overall</p>
                      <RatingBar
                        rating={professorScore}
                        label={`${g.label} overall teaching score for ${record.course}, ${record.semester}`}
                        compact
                        condensed
                        testId={`offering-professor-score-${record.id}`}
                      />
                    </div>
                    <div
                      className="grid grid-cols-4 gap-2 md:col-span-3 md:grid-cols-9 xl:contents"
                      data-testid={`offering-score-columns-${record.id}`}
                    >
                      {OTHER_QUESTION_INDEXES.slice(0, 5).map((index) => {
                        const question = qs[index] ?? `Question ${index + 1}`;
                        const score = offeringScore(record, index);
                        return (
                          <div
                            key={index}
                            className="flex min-w-0 flex-col items-center gap-1"
                            title={question}
                            data-testid={`offering-other-question-${record.id}-${index}`}
                          >
                            <span className="whitespace-pre-line text-center text-[9px] font-medium leading-tight text-muted-foreground md:hidden">
                              {TEACHING_QUESTION_LABELS[index]}
                            </span>
                            <Score
                              v={score}
                              size="sm"
                              testId={`offering-other-score-${record.id}-${index}`}
                            />
                          </div>
                        );
                      })}
                      <div
                        className="flex min-w-0 flex-col items-center gap-1 md:items-end"
                        data-testid={`offering-course-overall-column-${record.id}`}
                      >
                        <span className="text-[9px] font-medium text-muted-foreground md:hidden">
                          Course Overall
                        </span>
                        <RatingBar
                          rating={courseScore}
                          label={`${record.course} overall course score, taught by ${g.label} in ${record.semester}`}
                          compact
                          condensed
                          testId={`offering-course-score-${record.id}`}
                        />
                      </div>
                      {OTHER_QUESTION_INDEXES.slice(5).map((index) => {
                        const question = qs[index] ?? `Question ${index + 1}`;
                        const score = offeringScore(record, index);
                        return (
                          <div
                            key={index}
                            className="flex min-w-0 flex-col items-center gap-1"
                            title={question}
                            data-testid={`offering-other-question-${record.id}-${index}`}
                          >
                            <span className="whitespace-pre-line text-center text-[9px] font-medium leading-tight text-muted-foreground md:hidden">
                              {COURSE_QUESTION_LABELS[index]}
                            </span>
                            <Score
                              v={score}
                              size="sm"
                              testId={`offering-other-score-${record.id}-${index}`}
                            />
                          </div>
                        );
                      })}
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
