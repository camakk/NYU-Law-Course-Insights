import { Fragment, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { aggregate, fmt, fmtInt, shortQ, useDataset, type Dataset, type Group } from '@/lib/data';
import { Empty, LowSample, NativeSelect, NotFoundEntity, PageError, PageLoading, RankBars, Score, Stat, useTitle } from '@/components/kit';
import { cn } from '@/lib/utils';

function Profile({ ds, g }: { ds: Dataset; g: Group }) {
  useTitle(g.label);
  const [, navigate] = useLocation();
  const [sem, setSem] = useState('all');
  const [metric, setMetric] = useState(5);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const recs = useMemo(() => (sem === 'all' ? g.records : g.records.filter((r) => r.semester === sem)), [g, sem]);
  const courses = useMemo(() => {
    const m = new Map<string, typeof recs>();
    for (const r of recs) { if (!m.has(r.course)) m.set(r.course, []); m.get(r.course)!.push(r); }
    return [...m.entries()].map(([course, rs]) => ({
      course,
      slug: ds.courseSlugByName.get(course)!,
      recs: rs,
      metrics: Array.from({ length: 10 }, (_, q) => aggregate(rs, q)),
    })).sort((a, b) => {
      const x = a.metrics[metric].avg, y = b.metrics[metric].avg;
      if (x == null && y == null) return a.course.localeCompare(b.course);
      if (x == null) return 1; if (y == null) return -1;
      return y - x;
    });
  }, [recs, ds, metric]);
  const overall = useMemo(() => Array.from({ length: 10 }, (_, q) => aggregate(recs, q)), [recs]);
  const chart = courses.filter((c) => c.metrics[metric].avg != null).map((c) => ({
    name: c.course, value: c.metrics[metric].avg!, responses: c.metrics[metric].responses, offerings: c.metrics[metric].offerings, href: `/courses/${c.slug}`,
  }));
  const qs = ds.questions;
  const totalResp = recs.reduce((s, r) => s + (!r.inaccessible && r.responded ? r.responded : 0), 0);

  return (
    <div className="rise">
      <Link href="/professors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4" data-testid="link-back"><ChevronLeft className="h-4 w-4" />All professors</Link>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Professor</div>
          <h1 className="font-display text-4xl md:text-6xl font-semibold mt-2" data-testid="text-professor-name">{g.label}</h1>
          {g.label !== g.name && <p className="text-xs text-muted-foreground mt-1">Listed in source as "{g.name}"</p>}
          <p className="text-sm text-muted-foreground mt-2">Taught {g.semesters[g.semesters.length - 1]} – {g.semesters[0]}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-muted-foreground max-w-[10rem]">Overall this professor was effective</div>
          <Score v={overall[5].avg} size="lg" testId="text-overall-score" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <Stat label="Offerings" value={recs.length} sub={sem === 'all' ? 'all semesters' : sem} />
        <Stat label="Distinct courses" value={courses.length} />
        <Stat label="Responses (offering totals)" value={fmtInt(totalResp)} sub={<LowSample responses={overall[5].responses} />} />
        <Stat label="Course effective" value={fmt(overall[8].avg)} sub="/ 5, response-weighted" />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <NativeSelect label="Semester" value={sem} onChange={setSem} testId="select-semester">
          <option value="all">All semesters ({g.semesters.length})</option>
          {g.semesters.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <NativeSelect label="Chart & sort metric" value={String(metric)} onChange={(v) => setMetric(Number(v))} testId="select-metric">
          {qs.map((q, i) => <option key={i} value={i}>{i < 6 ? 'Teaching' : 'Course'} · {shortQ(q, i)}</option>)}
        </NativeSelect>
      </div>

      <section className="grid lg:grid-cols-[1fr_20rem] gap-6 mb-10">
        <div className="bg-card border rounded-xl p-4">
          <h2 className="font-display text-xl mb-1">By course</h2>
          <p className="text-xs text-muted-foreground mb-3">{shortQ(qs[metric] ?? '', metric)} · bars start at 0, max 5 · click a bar to open the course</p>
          {chart.length ? <RankBars data={chart} metricLabel={qs[metric] ?? ''} onSelect={(d) => d.href && navigate(d.href)} /> : <Empty title="No rated offerings" hint="Every offering here lacks a usable score for this metric." />}
        </div>
        <div className="bg-card border rounded-xl p-4">
          <h2 className="font-display text-xl mb-3">All ten questions</h2>
          <ul className="space-y-2.5">
            {qs.map((q, i) => (
              <li key={i} className={cn('text-xs', i === 6 && 'pt-3 border-t')}>
                <div className="flex justify-between gap-2"><span className={cn(i === 5 || i === 8 ? 'font-semibold' : '')}>{shortQ(q, i)}</span><span className="num font-semibold">{fmt(overall[i].avg)}</span></div>
                <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden"><div className="h-full bg-primary rounded-full origin-left transition-transform duration-700" style={{ transform: `scaleX(${(overall[i].avg ?? 0) / 5})` }} /></div>
                <div className="num text-[10px] text-muted-foreground mt-0.5">{fmtInt(overall[i].responses)} resp. · {overall[i].offerings} off.</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <h2 className="font-display text-2xl mb-1">Every course, every question</h2>
      <p className="text-sm text-muted-foreground mb-3">Expand a course for term and section detail. N/A means no usable rating, never zero.</p>
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
              <th className="text-left font-medium p-3 w-[26%]">Course</th>
              {qs.map((q, i) => <th key={i} title={q} className={cn('p-2 font-medium text-center', i === 6 && 'border-l', i === metric && 'text-primary')}>Q{i + 1}</th>)}
              <th className="p-2 font-medium text-right">Resp.</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const isOpen = !!open[c.course];
              return (
                <Fragment key={c.course}>
                  <tr className="border-b hover:bg-secondary/40 cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [c.course]: !isOpen }))} data-testid={`row-course-${c.slug}`}>
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        <ChevronDown className={cn('h-4 w-4 mt-0.5 shrink-0 transition-transform', !isOpen && '-rotate-90')} />
                        <div>
                          <Link href={`/courses/${c.slug}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline underline-offset-4" data-testid={`link-course-${c.slug}`}>{c.course}</Link>
                          <div className="text-xs text-muted-foreground">{c.recs.length} offering{c.recs.length === 1 ? '' : 's'} <LowSample responses={c.metrics[5].responses} /></div>
                        </div>
                      </div>
                    </td>
                    {c.metrics.map((m, i) => <td key={i} className={cn('p-1.5 text-center', i === 6 && 'border-l')}><Score v={m.avg} size="sm" /></td>)}
                    <td className="p-2 text-right num text-xs">{fmtInt(c.metrics[5].responses)}</td>
                  </tr>
                  {isOpen && c.recs.map((r, si) => (
                    <tr key={r.id} className="border-b bg-muted/30 text-xs">
                      <td className="py-2 pl-10 pr-3">
                        <span className="font-medium">{r.semester}</span>
                        {c.recs.filter((x) => x.semester === r.semester).length > 1 && <span className="ml-1 text-muted-foreground">section {c.recs.filter((x) => x.semester === r.semester).indexOf(r) + 1}</span>}
                        <div className="num text-muted-foreground">{r.responded ?? 'N/A'} of {r.enrolled ?? 'N/A'} responded{r.inaccessible ? ' · inaccessible in source' : ''}</div>
                        <span className="sr-only">{si}</span>
                      </td>
                      {r.scores.slice(0, 10).map((s, i) => <td key={i} className={cn('p-1.5 text-center', i === 6 && 'border-l')}><span className="num">{r.inaccessible ? 'N/A' : fmt(s)}</span></td>)}
                      <td className="p-2 text-right num">{r.responded ?? 'N/A'}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
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
