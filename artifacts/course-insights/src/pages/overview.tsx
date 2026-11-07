import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { aggregate, bySemesterDesc, fmtInt, useDataset, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { PageError, PageLoading, RatingBar, Score, SearchBox, Stat, useTitle } from '@/components/kit';
import { OverviewCourseRow } from '@/components/overview-course-row';
import { norm } from './directory';

const MIN_RESP = 100;
const RECENT_TEACHING_SEMESTERS = new Set([
  'Fall 2023',
  'Spring 2024',
  'Fall 2024',
  'Spring 2025',
  'Fall 2025',
  'Spring 2026',
  'Fall 2026',
]);

interface RecentCourseOffering {
  course: string;
  semester: string;
  rating: number | null;
  reviews: number;
}

function recentCourseOfferings(records: EvalRecord[]): RecentCourseOffering[] {
  const byOffering = new Map<string, EvalRecord[]>();
  for (const record of records) {
    const key = `${record.course}\u0000${record.semester}`;
    const offeringRecords = byOffering.get(key) ?? [];
    offeringRecords.push(record);
    byOffering.set(key, offeringRecords);
  }

  return [...byOffering.values()]
    .map((offeringRecords) => ({
      course: offeringRecords[0].course,
      semester: offeringRecords[0].semester || 'Semester unavailable',
      rating: aggregate(offeringRecords, 5).avg,
      reviews: offeringRecords.reduce(
        (total, record) =>
          total + (!record.inaccessible && record.responded != null ? record.responded : 0),
        0,
      ),
    }))
    .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course))
    .slice(0, 5);
}

function ReviewedCoursesPanel({
  title,
  courses,
  dataset,
  testIdPrefix,
  hasMore,
  onShowMore,
}: {
  title: string;
  courses: Group[];
  dataset: Dataset;
  testIdPrefix: string;
  hasMore: boolean;
  onShowMore: () => void;
}) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden self-start">
      <div className="p-5 pb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl">{title}</h2>
      </div>
      <ul>
        {courses.map((course, index) => (
          <OverviewCourseRow key={course.slug} course={course} dataset={dataset} rank={index + 1} testIdPrefix={testIdPrefix} />
        ))}
      </ul>
      {hasMore && (
        <div className="border-t">
          <ShowMoreButton onClick={onShowMore} testId={`button-show-more-${testIdPrefix}courses`} />
        </div>
      )}
    </div>
  );
}

function ShowMoreButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full cursor-pointer px-5 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-secondary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      data-testid={testId}
    >
      Show More
    </button>
  );
}

function OverviewInner({ ds }: { ds: Dataset }) {
  const [q, setQ] = useState('');
  const [expandedProfessor, setExpandedProfessor] = useState<string | null>(null);
  const [teacherVisibleCount, setTeacherVisibleCount] = useState(10);
  const [upperclassmanVisibleCount, setUpperclassmanVisibleCount] = useState(10);
  const hits = useMemo(() => {
    const t = norm(q).split(' ').filter(Boolean);
    if (!t.length) return null;
    const f = (s: string) => { const h = norm(s); return t.every((x) => h.includes(x)); };
    const p = ds.professors.filter((g) => f(g.label + ' ' + g.name));
    const c = ds.courses.filter((g) => f(g.label));
    return { p, c };
  }, [q, ds]);
  const top = useMemo(() => ds.professors
    .filter((g) => g.metrics[5].avg != null && g.metrics[5].responses >= MIN_RESP)
    .map((g) => ({
      group: g,
      value: g.metrics[5].avg!,
      recentCourses: recentCourseOfferings(g.records),
    }))
    .sort((a, b) => b.value - a.value || a.group.label.localeCompare(b.group.label)), [ds]);
  const recentProfessorCount = useMemo(() => ds.professors
    .filter((professor) => professor.records.some((record) => RECENT_TEACHING_SEMESTERS.has(record.semester)))
    .length, [ds]);
  const recentSeminarOfferings = useMemo(() => ds.records.filter((record) =>
    (record.courseCategories.includes('Seminar') || record.courseCategories.includes('Colloquium'))
    && RECENT_TEACHING_SEMESTERS.has(record.semester),
  ).length, [ds]);
  const recentClinicOfferings = useMemo(() => ds.records.filter((record) =>
    (record.courseCategories.includes('Clinic') || record.courseCategories.includes('Externship'))
    && RECENT_TEACHING_SEMESTERS.has(record.semester),
  ).length, [ds]);
  const mostReviewedUpperclassman = useMemo(() => ds.courses
    .filter((course) => course.courseCategories?.includes('Course') && !course.records.some((record) => record.is1LCourse))
    .sort((a, b) => b.totalResponded - a.totalResponded || b.records.length - a.records.length || a.label.localeCompare(b.label)), [ds]);
  const visibleTeachers = top.slice(0, teacherVisibleCount);
  const visibleUpperclassmanCourses = mostReviewedUpperclassman.slice(0, upperclassmanVisibleCount);
  const categoryOfferings = useMemo(() => ({
    seminars: ds.records.filter((record) =>
      record.courseCategories.includes('Seminar') || record.courseCategories.includes('Colloquium'),
    ).length,
    clinics: ds.records.filter((record) =>
      record.courseCategories.includes('Clinic') || record.courseCategories.includes('Externship'),
    ).length,
  }), [ds]);
  const usable = ds.records.filter((r) => !r.inaccessible && (r.responded ?? 0) > 0).length;

  return (
    <div>
      <section className="rise grid lg:grid-cols-[1.4fr_1fr] gap-10 items-end pb-10 rule-double pt-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">The NYU Law Unofficial Course Catalog · {ds.semesters[ds.semesters.length - 1]} to {ds.semesters[0]}</div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[0.95] mt-4">Pick the teacher,<br /><span className="italic text-primary">not just the class.</span></h1>
          <p className="text-muted-foreground mt-5 max-w-xl">Ten years of student evaluations, organized so you can see who taught a course, how students rated them, and the data behind each number.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Unique Course Offerings" value={fmtInt(ds.records.length)} sub={`${fmtInt(usable)} with student reviews`} />
          <Stat
            label="NYU Law Professors Reviewed"
            value={fmtInt(ds.professors.length)}
            sub={`${fmtInt(recentProfessorCount)} taught in the last three years`}
          />
          <Stat
            label="Seminars Reviewed"
            value={fmtInt(categoryOfferings.seminars)}
            sub={`${fmtInt(recentSeminarOfferings)} in the last three years`}
          />
          <Stat
            label="Clinics Reviewed"
            value={fmtInt(categoryOfferings.clinics)}
            sub={`${fmtInt(recentClinicOfferings)} in the last three years`}
          />
        </div>
      </section>

      <section className="mt-0 mb-10 rise" style={{ animationDelay: '80ms' }}>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Type a professor name or course title"
          testId="input-search-global"
          featured
        />
        {hits && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {([['Professors', hits.p, 'professors'], ['Courses', hits.c, 'courses']] as const).map(([label, list, kind]) => (
              <div key={kind} className="bg-card border rounded-xl">
                <div className="px-4 py-2.5 border-b text-[11px] uppercase tracking-wider text-muted-foreground flex justify-between"><span>{label}</span><span className="num">{list.length}</span></div>
                {list.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No matches.</p> : (
                  <ul className="max-h-80 overflow-y-auto">
                    {list.map((g) => {
                      const mostRecentOffering = kind === 'professors'
                        ? recentCourseOfferings(g.records)[0]
                        : undefined;
                      return (
                        <li key={g.slug}>
                          <Link href={`/${kind}/${g.slug}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-secondary/60 text-sm" data-testid={`link-result-${kind}-${g.slug}`}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={kind === 'professors' ? 'max-w-[45%] shrink-0 truncate' : 'truncate'}>{g.label}</span>
                              {mostRecentOffering && (
                                <span
                                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                                  data-testid={`text-search-professor-recent-${g.slug}`}
                                  title={`${mostRecentOffering.course} · ${mostRecentOffering.semester}`}
                                >
                                  {mostRecentOffering.course} · {mostRecentOffering.semester}
                                </span>
                              )}
                              {kind === 'courses' && g.courseLabels?.map((label) => (
                                <span key={label} className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold">{label}</span>
                              ))}
                            </span>
                            <Score v={g.metrics[kind === 'professors' ? 5 : 8].avg} size="sm" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <div className="bg-card border rounded-xl overflow-hidden p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl">Most effective teachers</h2>
            <Link href="/professors" className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">Full ranking <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Response-weighted "Overall this professor was effective," all courses, at least {MIN_RESP} offering-level responses.</p>
          <ol className="divide-y" data-testid="list-most-effective-teachers">
            {visibleTeachers.map(({ group, value, recentCourses }, index) => {
              const isExpanded = expandedProfessor === group.slug;
              const latest = recentCourses[0];
              const coursesId = `recent-courses-${group.slug}`;
              return (
                <li key={group.slug} className="py-3 first:border-t-0" data-testid={`teacher-row-${group.slug}`}>
                  <div className="flex items-start gap-3">
                    <span className="num text-xs text-muted-foreground pt-1.5 w-5 shrink-0 text-right">{index + 1}</span>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-y-2 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-start sm:gap-x-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="min-w-0 truncate text-sm font-semibold">{group.label}</span>
                          <Link href={`/professors/${group.slug}`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline" data-testid={`link-teacher-profile-${group.slug}`}>
                            Profile <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-latest-course-${group.slug}`}>
                          {latest
                            ? <>Most recent: <span className="text-foreground">{latest.course}</span> · {latest.semester}</>
                            : 'No course history available.'}
                          {' '}
                          <button
                            type="button"
                            onClick={() => setExpandedProfessor(isExpanded ? null : group.slug)}
                            aria-expanded={isExpanded}
                            aria-controls={coursesId}
                            data-testid={`button-expand-teacher-${group.slug}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary hover:underline"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        </p>
                      </div>
                      <div className="justify-self-end text-right">
                        <RatingBar rating={value} label={`${group.label} overall teaching rating`} testId={`rating-teacher-${group.slug}`} />
                        <p className="mt-0.5 w-60 text-right text-xs text-muted-foreground" data-testid={`text-professor-reviews-${group.slug}`}>
                          <span className="num text-foreground">{fmtInt(group.totalResponded)}</span> student reviews all-time
                        </p>
                      </div>
                    </div>
                  </div>
                  <div id={coursesId} hidden={!isExpanded} className="ml-8 mt-3 rounded-lg bg-secondary/40 px-3 py-2.5">
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Five most recent course offerings
                    </h3>
                    {recentCourses.length ? (
                      <ul className="divide-y divide-border/70" data-testid={`list-recent-courses-${group.slug}`}>
                        {recentCourses.map((offering) => (
                          <li key={`${offering.course}-${offering.semester}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-1">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm">{offering.course}</span>
                              <span className="block text-xs text-muted-foreground">{offering.semester} — {fmtInt(offering.reviews)} reviews</span>
                            </span>
                            <div className="ml-auto">
                              <RatingBar
                                rating={offering.rating}
                                label={`${offering.course}, ${offering.semester} overall teaching rating`}
                                testId={`rating-offering-${group.slug}-${offering.semester}`}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No recent course offerings available.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {teacherVisibleCount < top.length && (
            <div className="mt-3 -mx-5 -mb-5 border-t">
              <ShowMoreButton
                onClick={() => setTeacherVisibleCount((count) => count + 10)}
                testId="button-show-more-teachers"
              />
            </div>
          )}
        </div>
        <ReviewedCoursesPanel
          title="Most reviewed upperclassman courses"
          courses={visibleUpperclassmanCourses}
          dataset={ds}
          testIdPrefix="upperclassman-"
          hasMore={upperclassmanVisibleCount < mostReviewedUpperclassman.length}
          onShowMore={() => setUpperclassmanVisibleCount((count) => count + 10)}
        />
      </section>
    </div>
  );
}

export default function OverviewPage() {
  useTitle('');
  const { data, isLoading, error, refetch } = useDataset();
  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError error={error} onRetry={() => refetch()} />;
  return <OverviewInner ds={data} />;
}
