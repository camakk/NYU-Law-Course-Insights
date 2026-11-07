import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { aggregate, fmtInt, useDataset, type Dataset, type Group } from '@/lib/data';
import { Empty, LoadMore, LowSample, NativeSelect, PageError, PageLoading, Score, SearchBox, useTitle } from '@/components/kit';

type Kind = 'professors' | 'courses';
type SortKey = 'rating' | 'rating-asc' | 'responses' | 'offerings' | 'name' | 'recent';

export function norm(s: string) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matches(g: Group, terms: string[], kind: Kind, ds: Dataset) {
  if (!terms.length) return true;
  const hay = norm(g.label + ' ' + g.name);
  if (terms.every((t) => hay.includes(t))) return true;
  // also match across the other dimension (prof by course taught, course by teacher)
  const other = norm(g.records.map((r) => (kind === 'professors' ? r.course : r.professor)).join(' '));
  void ds;
  return terms.every((t) => hay.includes(t) || other.includes(t));
}

function MinimumFilter({ label, value, onChange, max, step = 1, id }: {
  label: string; value: string; onChange: (value: string) => void;
  max?: number; step?: number; id: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      <input
        id={id}
        data-testid={id}
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        placeholder="No minimum"
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') { onChange(''); return; }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          const bounded = Math.max(0, Math.min(max ?? Infinity, n));
          onChange(String(step === 1 ? Math.floor(bounded) : bounded));
        }}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function DirectoryInner({ ds, kind }: { ds: Dataset; kind: Kind }) {
  const [q, setQ] = useState('');
  const [sem, setSem] = useState('all');
  const [sort, setSort] = useState<SortKey>('rating');
  const [limit, setLimit] = useState(100);
  const [minPartners, setMinPartners] = useState('');
  const [minOfferings, setMinOfferings] = useState('');
  const [minResponses, setMinResponses] = useState('');
  const [minScore, setMinScore] = useState('');
  const metricIdx = kind === 'professors' ? 5 : 8;
  const hasFilters = q !== '' || sem !== 'all' || [minPartners, minOfferings, minResponses, minScore].some((v) => v !== '');
  const updateMinimum = (setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    setLimit(100);
  };
  const clearFilters = () => {
    setQ('');
    setSem('all');
    setMinPartners('');
    setMinOfferings('');
    setMinResponses('');
    setMinScore('');
    setLimit(100);
  };

  const rows = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    const groups = kind === 'professors' ? ds.professors : ds.courses;
    const out = groups
      .filter((g) => (sem === 'all' ? true : g.semesters.includes(sem)))
      .filter((g) => matches(g, terms, kind, ds))
      .map((g) => {
        const recs = sem === 'all' ? g.records : g.records.filter((r) => r.semester === sem);
        const m = aggregate(recs, metricIdx);
        const teach = kind === 'courses' ? aggregate(recs, 5) : null;
        const partners = new Set(recs.map((r) => (kind === 'professors' ? r.course : r.professor))).size;
        return { g, m, teach, offerings: recs.length, partners, latest: recs[0]?.semester ?? '' };
      })
      .filter((r) =>
        r.partners >= Number(minPartners) &&
        r.offerings >= Number(minOfferings) &&
        r.m.responses >= Number(minResponses) &&
        (minScore === '' || (r.m.avg !== null && r.m.avg >= Number(minScore)))
      );
    const byAvg = (a: number | null, b: number | null, dir: 1 | -1) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (b - a));
    out.sort((a, b) => {
      switch (sort) {
        case 'rating': return byAvg(a.m.avg, b.m.avg, 1) || b.m.responses - a.m.responses;
        case 'rating-asc': return byAvg(a.m.avg, b.m.avg, -1) || b.m.responses - a.m.responses;
        case 'responses': return b.m.responses - a.m.responses;
        case 'offerings': return b.offerings - a.offerings;
        case 'recent': return a.g.semesters[0] === b.g.semesters[0] ? a.g.label.localeCompare(b.g.label) : ds.semesters.indexOf(a.g.semesters[0]) - ds.semesters.indexOf(b.g.semesters[0]);
        default: return a.g.label.localeCompare(b.g.label);
      }
    });
    return out;
  }, [ds, kind, q, sem, sort, metricIdx, minPartners, minOfferings, minResponses, minScore]);

  const isProf = kind === 'professors';
  const total = isProf ? ds.professors.length : ds.courses.length;

  return (
    <div className="rise">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Directory</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{isProf ? 'Professors' : 'Courses'}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          {fmtInt(total)} {isProf ? 'instructors, ranked by response-weighted "Overall this professor was effective."' : 'distinct course titles, scored by response-weighted "Overall course effective."'} Search also matches {isProf ? 'course titles they taught' : 'instructor names'}.
        </p>
        <p className="text-xs text-muted-foreground mt-3" role="status" aria-live="polite" data-testid="filter-summary">
          {fmtInt(total)} total {isProf ? 'professors' : 'courses'} in the dataset · {fmtInt(total - rows.length)} filtered out · {fmtInt(rows.length)} matching
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6 sticky top-14 z-30 bg-background/90 backdrop-blur py-3 -mx-1 px-1">
        <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(100); }} placeholder={isProf ? 'Search a name or a course they taught' : 'Search a course title or instructor'} testId={`input-search-${kind}`} />
        <NativeSelect label="Semester" value={sem} onChange={(v) => { setSem(v); setLimit(100); }} testId="select-semester">
          <option value="all">All semesters</option>
          {ds.semesters.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <NativeSelect label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} testId="select-sort">
          <option value="rating">Highest rated</option>
          <option value="rating-asc">Lowest rated</option>
          <option value="responses">Most responses</option>
          <option value="offerings">Most offerings</option>
          <option value="recent">Most recently taught</option>
          <option value="name">Name A–Z</option>
        </NativeSelect>
      </div>

      <fieldset className="mb-6 rounded-xl border bg-card px-4 pb-4">
        <legend className="px-2 text-sm font-semibold">Filter</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-1">
          <MinimumFilter
            label={isProf ? 'Minimum courses taught' : 'Minimum professors'}
            value={minPartners} onChange={updateMinimum(setMinPartners)} id={`filter-min-${isProf ? 'courses' : 'professors'}`}
          />
          <MinimumFilter label="Minimum class offerings" value={minOfferings} onChange={updateMinimum(setMinOfferings)} id="filter-min-offerings" />
          <MinimumFilter label="Minimum rating responses" value={minResponses} onChange={updateMinimum(setMinResponses)} id="filter-min-responses" />
          <MinimumFilter label={`Minimum ${isProf ? 'teaching' : 'course'} score (0–5)`} value={minScore} onChange={updateMinimum(setMinScore)} max={5} step={0.1} id="filter-min-score" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="text-xs text-muted-foreground max-w-3xl">
            {isProf ? 'Courses taught counts distinct course titles; offerings counts individual sections, including repeats.' : 'Professors counts distinct instructors; offerings counts individual sections of each course.'}
            {' '}Minimums include the selected value and apply within the selected semester. Rating responses count only offerings contributing to the displayed score.
          </p>
          {hasFilters && <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary underline underline-offset-4 hover:no-underline" data-testid="button-clear-filters">Clear filters</button>}
        </div>
      </fieldset>

      {rows.length === 0 ? (
        <Empty title="Nothing matches." hint="Lower the minimums, clear filters, or try a shorter search." />
      ) : (
        <>
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[3rem_1fr_7rem_7rem_6rem_7rem_2rem] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
              <span>#</span><span>{isProf ? 'Professor' : 'Course'}</span>
              <span className="text-right">{isProf ? 'Teaching' : 'Course'}</span>
              <span className="text-right">{isProf ? 'Courses' : 'Teaching'}</span>
              <span className="text-right">Offerings</span><span className="text-right">Responses</span><span />
            </div>
            {rows.slice(0, limit).map((r, i) => (
              <Link
                key={r.g.slug}
                href={`/${kind}/${r.g.slug}`}
                data-testid={`row-${kind}-${r.g.slug}`}
                className="group grid grid-cols-[2rem_1fr_auto] md:grid-cols-[3rem_1fr_7rem_7rem_6rem_7rem_2rem] gap-3 items-center px-4 py-3 border-b last:border-0 hover:bg-secondary/60 transition-colors"
              >
                <span className="num text-xs text-muted-foreground">{sort.startsWith('rating') && r.m.avg == null ? '–' : i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium truncate group-hover:text-primary transition-colors">{r.g.label}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Latest {r.latest}</span>
                    <span className="md:hidden num">· {fmtInt(r.m.responses)} resp.</span>
                    <LowSample responses={r.m.responses} />
                  </span>
                </span>
                <span className="md:text-right"><Score v={r.m.avg} /></span>
                <span className="hidden md:block text-right num text-sm">{isProf ? r.partners : r.teach ? <Score v={r.teach.avg} size="sm" /> : null}</span>
                <span className="hidden md:block text-right num text-sm">{r.offerings}</span>
                <span className="hidden md:block text-right num text-sm">{fmtInt(r.m.responses)}</span>
                <ArrowUpRight className="hidden md:block h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
              </Link>
            ))}
          </div>
          <LoadMore shown={limit} total={rows.length} onMore={() => setLimit((l) => l + 100)} />
        </>
      )}
    </div>
  );
}

export function DirectoryPage({ kind }: { kind: Kind }) {
  useTitle(kind === 'professors' ? 'Professors' : 'Courses');
  const { data, isLoading, error, refetch } = useDataset();
  if (isLoading) return <PageLoading />;
  if (error || !data) return <PageError error={error} onRetry={() => refetch()} />;
  return <DirectoryInner key={kind} ds={data} kind={kind} />;
}

export const ProfessorsPage = () => <DirectoryPage kind="professors" />;
export const CoursesPage = () => <DirectoryPage kind="courses" />;
