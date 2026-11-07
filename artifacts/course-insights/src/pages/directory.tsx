import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { aggregate, bySemesterDesc, COURSE_CATEGORIES, fmtInt, friendlyName, useDataset, type CourseCategory, type Dataset, type Group } from '@/lib/data';
import { Empty, LoadMore, LowSample, NativeSelect, PageError, PageLoading, Score, SearchBox, useTitle } from '@/components/kit';
import { Slider } from '@/components/ui/slider';

type Kind = 'professors' | 'courses';
type SortKey = 'rating' | 'rating-asc' | 'responses' | 'offerings' | 'name' | 'recent';

export function norm(s: string) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matches(g: Group, terms: string[], kind: Kind, records = g.records) {
  if (!terms.length) return true;
  const hay = norm(g.label + ' ' + g.name);
  if (terms.every((t) => hay.includes(t))) return true;
  // also match across the other dimension (prof by course taught, course by teacher)
  const other = norm(records.map((r) => (kind === 'professors' ? r.course : r.professor)).join(' '));
  return terms.every((t) => hay.includes(t) || other.includes(t));
}

function RangeFilter({ label, value, onChange, min, max, step = 1, id, formatValue, minLabel, maxLabel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  id: string;
  formatValue: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
}) {
  const numericValue = value === '' ? min : Number(value);
  const labelId = `${id}-label`;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={id}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span id={labelId}>{label}</span>
        <output className="shrink-0 font-medium text-foreground" data-testid={`${id}-value`}>
          {formatValue(numericValue)}
        </output>
      </div>
      <Slider
        id={`${id}-slider`}
        aria-labelledby={labelId}
        data-testid={`${id}-slider`}
        value={[numericValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={([nextValue]) => onChange(String(nextValue))}
        className="cursor-pointer py-1.5"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? max}</span>
      </div>
    </div>
  );
}

function RangeBandFilter({ label, minValue, maxValue, onChange, id }: {
  label: string;
  minValue: number;
  maxValue: number;
  onChange: (values: number[]) => void;
  id: string;
}) {
  const labelId = `${id}-label`;
  const lowerLabel = minValue === 0 ? 'No minimum' : `≥ ${minValue.toFixed(1)}`;
  const upperLabel = maxValue === 5 ? 'No maximum' : `≤ ${maxValue.toFixed(1)}`;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={id}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span id={labelId}>{label}</span>
        <output className="shrink-0 font-medium text-foreground" data-testid={`${id}-value`}>
          {lowerLabel} · {upperLabel}
        </output>
      </div>
      <Slider
        id={`${id}-slider`}
        aria-labelledby={labelId}
        data-testid={`${id}-slider`}
        value={[minValue, maxValue]}
        min={0}
        max={5}
        step={0.1}
        onValueChange={onChange}
        className="cursor-pointer py-1.5"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0.0</span>
        <span>5.0</span>
      </div>
    </div>
  );
}

function DirectoryInner({ ds, kind }: { ds: Dataset; kind: Kind }) {
  const [q, setQ] = useState('');
  const [sem, setSem] = useState('all');
  const [sort, setSort] = useState<SortKey>('rating');
  const [limit, setLimit] = useState(100);
  const [minOfferings, setMinOfferings] = useState('1');
  const [minResponses, setMinResponses] = useState('50');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [includedCategories, setIncludedCategories] = useState<CourseCategory[]>([...COURSE_CATEGORIES]);
  const metricIdx = kind === 'professors' ? 5 : 8;
  const groupsForKind = kind === 'professors' ? ds.professors : ds.courses;
  const maxOfferings = Math.max(10, ...groupsForKind.map((group) => group.records.length + 10));
  const maxReviews = kind === 'courses' ? 500 : Math.max(100, ...groupsForKind.map((group) => group.metrics[metricIdx].responses + 100));
  const hasFilters = q !== '' || sem !== 'all' ||
    (minOfferings !== '' && Number(minOfferings) > 1) ||
    (minResponses !== '' && Number(minResponses) > 0) ||
    (minScore !== '' && Number(minScore) > 0) ||
    (kind === 'professors' && maxScore !== '' && Number(maxScore) < 5) ||
    includedCategories.length !== COURSE_CATEGORIES.length;
  const updateMinimum = (setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    setLimit(100);
  };
  const clearFilters = () => {
    setQ('');
    setSem('all');
    setMinOfferings('1');
    setMinResponses('');
    setMinScore('');
    setMaxScore('');
    setIncludedCategories([...COURSE_CATEGORIES]);
    setLimit(100);
  };
  const toggleCategory = (category: CourseCategory) => {
    setIncludedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
    setLimit(100);
  };

  const rows = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    const groups = kind === 'professors' ? ds.professors : ds.courses;
    const out = groups
      .map((g) => {
        const categoryRecords = kind === 'professors'
          ? g.records.filter((record) => includedCategories.includes(record.courseCategory))
          : g.courseCategory && includedCategories.includes(g.courseCategory) ? g.records : [];
        return { g, categoryRecords };
      })
      .filter(({ g, categoryRecords }) =>
        categoryRecords.length > 0 &&
        (sem === 'all' || categoryRecords.some((record) => record.semester === sem)) &&
        matches(g, terms, kind, categoryRecords)
      )
      .map(({ g, categoryRecords }) => {
        const recs = sem === 'all' ? categoryRecords : categoryRecords.filter((r) => r.semester === sem);
        const m = aggregate(recs, metricIdx);
        const teach = kind === 'courses' ? aggregate(recs, 5) : null;
        const partners = new Set(recs.map((r) => (kind === 'professors' ? r.course : r.professor))).size;
        const recentByPartner = new Map<string, { label: string; semester: string }>();
        for (const record of recs) {
          const partnerKey = kind === 'professors' ? record.course : record.professor;
          const label = kind === 'professors' ? record.course : friendlyName(record.professor);
          const existing = recentByPartner.get(partnerKey);
          if (!existing || bySemesterDesc(record.semester, existing.semester) < 0) {
            recentByPartner.set(partnerKey, { label, semester: record.semester || 'Semester unavailable' });
          }
        }
        const recent = [...recentByPartner.values()]
          .sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.label.localeCompare(b.label))
          .slice(0, 3);
        return { g, m, teach, offerings: recs.length, partners, latest: recs[0]?.semester ?? '', recent };
      })
      .filter((r) =>
        r.offerings >= Number(minOfferings) &&
        r.m.responses >= Number(minResponses) &&
        (Number(minScore) === 0 || (r.m.avg !== null && r.m.avg >= Number(minScore))) &&
        (kind !== 'professors' || maxScore === '' || Number(maxScore) >= 5 || (r.m.avg !== null && r.m.avg <= Number(maxScore)))
      );
    const byAvg = (a: number | null, b: number | null, dir: 1 | -1) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (b - a));
    out.sort((a, b) => {
      switch (sort) {
        case 'rating': return byAvg(a.m.avg, b.m.avg, 1) || b.m.responses - a.m.responses;
        case 'rating-asc': return byAvg(a.m.avg, b.m.avg, -1) || b.m.responses - a.m.responses;
        case 'responses': return b.m.responses - a.m.responses;
        case 'offerings': return b.offerings - a.offerings;
        case 'recent': return a.latest === b.latest ? a.g.label.localeCompare(b.g.label) : bySemesterDesc(a.latest, b.latest);
        default: return a.g.label.localeCompare(b.g.label);
      }
    });
    return out;
  }, [ds, kind, q, sem, sort, metricIdx, minOfferings, minResponses, minScore, maxScore, includedCategories]);

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
          <option value="responses">Most reviews</option>
          <option value="offerings">{isProf ? 'Most times taught' : 'Most offerings'}</option>
          <option value="recent">Most recently taught</option>
          <option value="name">Name A–Z</option>
        </NativeSelect>
      </div>

      <fieldset className="mb-6 rounded-xl border bg-card px-4 pb-4">
        <legend className="px-2 text-sm font-semibold">Filter</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-1">
          <RangeFilter
            label={isProf ? 'Minimum times taught' : 'Minimum class offerings'}
            value={minOfferings}
            onChange={updateMinimum(setMinOfferings)}
            min={1}
            max={maxOfferings}
            id="filter-min-offerings"
            formatValue={(value) => `${fmtInt(value)}+`}
          />
          <RangeFilter
            label="Minimum reviews"
            value={minResponses}
            onChange={updateMinimum(setMinResponses)}
            min={0}
            max={maxReviews}
            id="filter-min-responses"
            formatValue={(value) => value === 0 ? 'No minimum' : `${fmtInt(value)}+`}
            minLabel="No minimum"
            maxLabel={`${fmtInt(maxReviews)}+`}
          />
          {isProf ? (
            <RangeBandFilter
              label="Teaching score"
              minValue={minScore === '' ? 0 : Number(minScore)}
              maxValue={maxScore === '' ? 5 : Number(maxScore)}
              onChange={([minimum, maximum]) => {
                setMinScore(minimum === 0 ? '' : minimum.toFixed(1));
                setMaxScore(maximum === 5 ? '' : maximum.toFixed(1));
                setLimit(100);
              }}
              id="filter-score-range"
            />
          ) : (
            <RangeFilter
              label="Minimum course score"
              value={minScore}
              onChange={updateMinimum(setMinScore)}
              min={0}
              max={5}
              step={0.1}
              id="filter-min-score"
              formatValue={(value) => value === 0 ? 'No minimum' : `≥ ${value.toFixed(1)}`}
              minLabel="No minimum"
              maxLabel="5.0"
            />
          )}
        </div>
        <div className="mt-4 border-t pt-4">
          <p id="course-category-filter-label" className="text-xs font-semibold">Include course categories</p>
          <div role="group" aria-labelledby="course-category-filter-label" className="mt-2 flex flex-wrap gap-2">
            {COURSE_CATEGORIES.map((category) => (
              <label key={category} className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs transition hover:border-primary/60">
                <input
                  type="checkbox"
                  checked={includedCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  data-testid={`filter-category-${category.toLowerCase()}`}
                  className="accent-primary"
                />
                {category}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Uncheck a category to exclude those courses from the results. Categories are inferred from course titles; titles without a clear indicator are labeled Course.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="text-xs text-muted-foreground max-w-3xl">
            {isProf ? 'Courses taught counts distinct course titles; times taught counts individual sections, including repeats.' : 'Professors counts distinct instructors; offerings counts individual sections of each course.'}
            {' '}Minimums include the selected value and apply within the selected semester. Review totals count student responses from offerings contributing to the displayed score.
            {isProf && ' The Professors page defaults to a minimum of 50 reviews, so professors with fewer than 50 are hidden unless you change or clear the filter.'}
          </p>
          {hasFilters && <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary underline underline-offset-4 hover:no-underline" data-testid="button-clear-filters">Clear filters</button>}
        </div>
      </fieldset>

      {rows.length === 0 ? (
        <Empty title="Nothing matches." hint="Lower the minimums, clear filters, or try a shorter search." />
      ) : (
        <>
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[3rem_1fr_7rem_7rem_6rem_7rem_2rem] lg:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_7rem_7rem_6rem_7rem_2rem] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
              <span>#</span><span>{isProf ? 'Professor' : 'Course'}</span>
              <span className="hidden lg:block">{isProf ? 'Recent courses and semesters' : 'Recent professors and semesters'}</span>
              <span className="text-right">{isProf ? 'Teaching' : 'Course'}</span>
              <span className="text-right">{isProf ? 'Courses' : 'Teaching'}</span>
              <span className="text-right">{isProf ? 'Times Taught' : 'Offerings'}</span><span className="text-right">Reviews</span><span />
            </div>
            {rows.slice(0, limit).map((r, i) => (
              <Link
                key={r.g.slug}
                href={`/${kind}/${r.g.slug}`}
                data-testid={`row-${kind}-${r.g.slug}`}
                className="group grid grid-cols-[2rem_1fr_auto] md:grid-cols-[3rem_1fr_7rem_7rem_6rem_7rem_2rem] lg:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_7rem_7rem_6rem_7rem_2rem] gap-3 items-center px-4 py-3 border-b last:border-0 hover:bg-secondary/60 transition-colors"
              >
                <span className="num text-xs text-muted-foreground">{sort.startsWith('rating') && r.m.avg == null ? '–' : i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium truncate group-hover:text-primary transition-colors">{r.g.label}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Latest {r.latest}</span>
                    {!isProf && r.g.courseCategory && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">{r.g.courseCategory}</span>
                    )}
                    {isProf && <span className="md:hidden num">· {r.offerings} times taught</span>}
                    <span className="md:hidden num">· {fmtInt(r.m.responses)} reviews</span>
                    <LowSample responses={r.m.responses} />
                  </span>
                  <span className="mt-1 block min-w-0 text-xs leading-5 text-muted-foreground lg:hidden">
                    <span className="block text-[10px] font-medium uppercase tracking-wide">
                      {isProf ? 'Recent courses' : 'Recent professors'}
                    </span>
                    {r.recent.map((item) => (
                      <span key={`${item.label}-${item.semester}`} className="block truncate">
                        {item.label} <span className="whitespace-nowrap">· {item.semester}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="hidden min-w-0 text-xs leading-5 text-muted-foreground lg:block">
                  {r.recent.map((item) => (
                    <span key={`${item.label}-${item.semester}`} className="block truncate">
                      <span className="font-medium text-foreground/80">{item.label}</span>
                      <span className="whitespace-nowrap"> · {item.semester}</span>
                    </span>
                  ))}
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
