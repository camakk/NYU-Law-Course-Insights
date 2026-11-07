import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { aggregate, bySemesterDesc, fmtInt, useDataset, type Dataset, type EvalRecord } from '@/lib/data';
import { PageError, PageLoading, Score, SearchBox, Stat, useTitle } from '@/components/kit';
import { norm } from './directory';

const MIN_RESP = 100;

interface RecentCourseOffering {
  course: string;
  semester: string;
  rating: number | null;
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
    }))
    .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.course.localeCompare(b.course))
    .slice(0, 5);
}

function OverviewInner({ ds }: { ds: Dataset }) {
  const [q, setQ] = useState('');
  const [expandedProfessor, setExpandedProfessor] = useState<string | null>(null);
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
    .sort((a, b) => b.value - a.value || a.group.label.localeCompare(b.group.label))
    .slice(0, 12), [ds]);
  const busiest = useMemo(() => ds.courses
    .filter((course) => course.courseCategories?.includes('Course'))
    .sort((a, b) => b.records.length - a.records.length)
    .slice(0, 10), [ds]);
  const usable = ds.records.filter((r) => !r.inaccessible && (r.responded ?? 0) > 0).length;

  return (
    <div>
      <section className="rise grid lg:grid-cols-[1.4fr_1fr] gap-10 items-end pb-10 rule-double pt-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">The NYU Law Unofficial Course Catalog · {ds.semesters[ds.semesters.length - 1]} to {ds.semesters[0]}.</div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[0.95] mt-4">Pick the teacher,<br /><span className="italic text-primary">not just the class.</span></h1>
          <p className="text-muted-foreground mt-5 max-w-xl">Ten years of student evaluations, organized so you can see who taught a course, how students rated them, and how much evidence stands behind each number.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Unique Course Offerings" value={fmtInt(ds.records.length)} sub={`${fmtInt(usable)} with responses`} />
          <Stat label="Professors" value={fmtInt(ds.professors.length)} />
          <Stat label="Course titles" value={fmtInt(ds.courses.length)} />
          <Stat label="Semesters" value={ds.semesters.length} />
        </div>
      </section>

      <section className="my-10 rise" style={{ animationDelay: '80ms' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search any professor or course title" testId="input-search-global" />
        {hits && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {([['Professors', hits.p, 'professors'], ['Courses', hits.c, 'courses']] as const).map(([label, list, kind]) => (
              <div key={kind} className="bg-card border rounded-xl">
                <div className="px-4 py-2.5 border-b text-[11px] uppercase tracking-wider text-muted-foreground flex justify-between"><span>{label}</span><span className="num">{list.length}</span></div>
                {list.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No matches.</p> : (
                  <ul className="max-h-80 overflow-y-auto">
                    {list.map((g) => (
                      <li key={g.slug}>
                        <Link href={`/${kind}/${g.slug}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-secondary/60 text-sm" data-testid={`link-result-${kind}-${g.slug}`}>
                          <span className="truncate">{g.label}</span>
                          <Score v={g.metrics[kind === 'professors' ? 5 : 8].avg} size="sm" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl">Most effective teachers</h2>
            <Link href="/professors" className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">Full ranking <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Response-weighted "Overall this professor was effective," all courses, at least {MIN_RESP} offering-level responses.</p>
          <ol className="divide-y" data-testid="list-most-effective-teachers">
            {top.map(({ group, value, recentCourses }, index) => {
              const isExpanded = expandedProfessor === group.slug;
              const latest = recentCourses[0];
              const coursesId = `recent-courses-${group.slug}`;
              return (
                <li key={group.slug} className="py-3 first:border-t-0" data-testid={`teacher-row-${group.slug}`}>
                  <div className="flex items-start gap-3">
                    <span className="num text-xs text-muted-foreground pt-1.5 w-5 shrink-0 text-right">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setExpandedProfessor(isExpanded ? null : group.slug)}
                          aria-expanded={isExpanded}
                          aria-controls={coursesId}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} five most recent courses for ${group.label}`}
                          data-testid={`button-expand-teacher-${group.slug}`}
                          className="inline-flex min-w-0 items-center gap-1.5 text-left font-medium hover:text-primary transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          <span className="truncate">{group.label}</span>
                        </button>
                        <Link href={`/professors/${group.slug}`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline" data-testid={`link-teacher-profile-${group.slug}`}>
                          Profile <ArrowRight className="h-3 w-3" />
                        </Link>
                        <Score v={value} size="sm" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-latest-course-${group.slug}`}>
                        {latest
                          ? <>Most recent: <span className="text-foreground">{latest.course}</span> · {latest.semester}</>
                          : 'No course history available.'}
                      </p>
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
                              <span className="block text-xs text-muted-foreground">{offering.semester}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              Overall rating <Score v={offering.rating} size="sm" />
                            </span>
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
        </div>
        <div className="bg-card border rounded-xl">
          <div className="p-5 pb-3 flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Most offered courses</h2>
            <Link href="/courses" className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all">All courses <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <ul>
            {busiest.map((c) => (
              <li key={c.slug}>
                <Link href={`/courses/${c.slug}`} className="flex items-center gap-3 px-5 py-2.5 border-t hover:bg-secondary/60 transition-colors" data-testid={`link-course-${c.slug}`}>
                  <span className="flex-1 min-w-0"><span className="block truncate font-medium">{c.label}</span>
                    <span className="num text-xs text-muted-foreground">{c.records.length} offerings · {new Set(c.records.map((r) => r.professor)).size} instructors</span></span>
                  <Score v={c.metrics[5].avg} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
