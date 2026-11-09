import { useLayoutEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ChevronLeft } from 'lucide-react';
import { aggregate, fmt, fmtInt, rankBy, shortQ, SMALL_SAMPLE, useDataset, type Dataset, type Group } from '@/lib/data';
import { Empty, SmallSample, NativeSelect, NotFoundEntity, PageError, PageLoading, RankBars, Score, Stat, useTitle } from '@/components/kit';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

function CourseView({ ds, g }: { ds: Dataset; g: Group }) {
  useTitle(g.label);
  const [, navigate] = useLocation();
  const [sem, setSem] = useState('all');
  const [metric, setMetric] = useState(5);
  const [excludeSmallSamples, setExcludeSmallSamples] = useState(true);
  const qs = ds.questions;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [g.slug]);

  const recs = useMemo(() => {
    const selected = sem === 'all' ? g.records : g.records.filter((r) => r.semester === sem);
    if (!excludeSmallSamples) return selected;
    const reviewsByProfessor = new Map<string, number>();
    for (const record of selected) {
      reviewsByProfessor.set(record.professor, (reviewsByProfessor.get(record.professor) ?? 0) + (record.responded ?? 0));
    }
    return selected.filter((record) => (reviewsByProfessor.get(record.professor) ?? 0) >= SMALL_SAMPLE);
  }, [g, sem, excludeSmallSamples]);
  const ranked = useMemo(() => {
    const m = new Map<string, typeof recs>();
    for (const r of recs) { if (!m.has(r.professor)) m.set(r.professor, []); m.get(r.professor)!.push(r); }
    return rankBy([...m.entries()].map(([name, rs]) => ({ group: ds.profBySlug.get(ds.profSlugByName.get(name)!)!, records: rs })), metric)
      .map((x) => ({ ...x, recs: m.get(x.group.name)!, course: aggregate(m.get(x.group.name)!, 8) }));
  }, [recs, ds, metric]);
  const chart = ranked.filter((r) => r.metric.avg != null).map((r) => ({
    name: r.group.label, value: r.metric.avg!, responses: r.metric.responses, offerings: r.metric.offerings, href: `/professors/${r.group.slug}`,
  }));
  const overall = aggregate(recs, metric);

  return (
    <div className="rise">
      <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4" data-testid="link-back"><ChevronLeft className="h-4 w-4" />All courses</Link>
      <div className="pb-6 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Course</div>
            {g.courseLabels?.map((label) => (
              <span key={label} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">{label}</span>
            ))}
          </div>
        <h1 className="font-display text-4xl md:text-6xl font-semibold mt-2 max-w-4xl" data-testid="text-course-title">{g.label}</h1>
        <p className="text-sm text-muted-foreground mt-2">Offered {g.semesters[g.semesters.length - 1]} – {g.semesters[0]} · {g.semesters.length} semesters</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <Stat label="Instructors" value={ranked.length} />
        <Stat label="Offerings" value={recs.length} sub={sem === 'all' ? 'all semesters' : sem} />
        <Stat label="Selected metric, all" value={fmt(overall.avg)} sub={`${fmtInt(overall.responses)} responses`} />
        <Stat label="Course effective" value={fmt(aggregate(recs, 8).avg)} sub="/ 5, response-weighted" />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <NativeSelect label="Rank by" value={String(metric)} onChange={(v) => setMetric(Number(v))} testId="select-metric">
          {qs.map((q, i) => <option key={i} value={i}>{i < 6 ? 'Teaching' : 'Course'} · {shortQ(q, i)}</option>)}
        </NativeSelect>
        <NativeSelect label="Semester" value={sem} onChange={setSem} testId="select-semester">
          <option value="all">All semesters</option>
          {g.semesters.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-card px-3">
          <Switch
            id="course-exclude-small-samples"
            checked={excludeSmallSamples}
            onCheckedChange={setExcludeSmallSamples}
            data-testid="toggle-course-small-samples"
          />
          <label htmlFor="course-exclude-small-samples" className="cursor-pointer select-none text-sm">
            Exclude small samples
          </label>
        </div>
      </div>

      <section className="grid lg:grid-cols-[1.1fr_1fr] gap-6 mb-10">
        <div className="bg-card border rounded-xl p-4">
          <h2 className="font-display text-xl">Instructor comparison</h2>
          <p className="text-xs text-muted-foreground mb-3">{qs[metric]} · amber bars indicate Small Sample (fewer than {SMALL_SAMPLE} reviews) · click to open profile</p>
          {chart.length ? <RankBars data={chart} metricLabel={qs[metric] ?? ''} onSelect={(d) => d.href && navigate(d.href)} /> : <Empty title="No rated offerings" hint="Try All semesters, another metric, or turn off Exclude small samples." />}
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b"><h2 className="font-display text-xl">Ranking</h2></div>
          <ol>
            {ranked.map((r) => (
              <li key={r.group.slug}>
                <Link href={`/professors/${r.group.slug}`} className="group flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-secondary/60 transition-colors" data-testid={`link-professor-${r.group.slug}`}>
                  <span className={cn('num w-7 text-center font-semibold', r.rank === 1 ? 'text-primary text-lg' : 'text-muted-foreground')}>{r.rank ?? '–'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate group-hover:text-primary">{r.group.label}</span>
                    <span className="num text-xs text-muted-foreground flex flex-wrap gap-2 items-center">{fmtInt(r.metric.responses)} resp. · {r.recs.length} off. · course {fmt(r.course.avg)} <SmallSample responses={r.metric.responses} /></span>
                  </span>
                  <Score v={r.metric.avg} />
                </Link>
              </li>
            ))}
          </ol>
          {ranked.length === 0 && <Empty title="No professors match these filters" hint="Try All semesters or turn off Exclude small samples." />}
        </div>
      </section>

      <h2 className="font-display text-2xl mb-3">Offering detail</h2>
      {recs.length === 0 ? <Empty title="No offerings match these filters." /> : (
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b">
                <th className="text-left font-medium p-3">Semester</th>
                <th className="text-left font-medium p-3">Professor</th>
                <th className="text-right font-medium p-3">Resp. / Enr.</th>
                {qs.map((q, i) => <th key={i} title={q} className={cn('p-2 font-medium text-center', i === 6 && 'border-l', i === metric && 'text-primary')}>Q{i + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => {
                const slug = ds.profSlugByName.get(r.professor)!;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="p-3 whitespace-nowrap">{r.semester}</td>
                    <td className="p-3"><Link href={`/professors/${slug}`} className="hover:text-primary hover:underline underline-offset-4">{ds.profBySlug.get(slug)?.label}</Link></td>
                    <td className="p-3 text-right num text-xs">{r.responded ?? 'N/A'} / {r.enrolled ?? 'N/A'}{r.inaccessible && <div className="text-muted-foreground">inaccessible</div>}</td>
                    {r.scores.slice(0, 10).map((s, i) => <td key={i} className={cn('p-1.5 text-center', i === 6 && 'border-l')}>{r.inaccessible ? <Score v={null} size="sm" /> : <Score v={s} size="sm" />}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-primary">Question key</summary>
        <ol className="mt-2 grid md:grid-cols-2 gap-1 list-decimal pl-5">{qs.map((q, i) => <li key={i}>{q}</li>)}</ol>
      </details>
    </div>
  );
}

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useDataset();
  useTitle(isLoading ? 'Loading' : 'Course');
  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError error={error} onRetry={() => refetch()} />;
  const g = data.courseBySlug.get(decodeURIComponent(id ?? ''));
  if (!g) return <NotFoundEntity kind="course" />;
  return <CourseView key={g.slug} ds={data} g={g} />;
}
