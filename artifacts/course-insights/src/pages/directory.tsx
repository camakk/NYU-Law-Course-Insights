import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronDown, Info, SlidersHorizontal } from 'lucide-react';
import { aggregate, bySemesterDesc, COURSE_CATEGORIES, fmtInt, friendlyName, useDataset, type CourseCategory, type Dataset, type Group } from '@/lib/data';
import { Empty, SmallSample, NativeSelect, PageError, PageLoading, RatingBar, Score, SearchBox, useTitle } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CourseProfessorExpansion } from '@/components/course-professor-expansion';

type Kind = 'professors' | 'courses';
type SortKey = 'rating' | 'rating-asc' | 'responses' | 'responses-asc' | 'courses' | 'courses-asc' | 'offerings' | 'offerings-asc' | 'name' | 'name-desc' | 'recent';
type CourseDirectorySnapshot = {
  version: 1;
  q: string;
  sort: SortKey;
  include1LCourses?: boolean;
  includeOnlineInternationalCourses?: boolean;
  minOfferings: string;
  minResponses: string;
  minScore: string;
  maxScore: string;
  includedCategories: CourseCategory[];
  filtersOpen: boolean;
  lastHeaderSort: string | null;
  expandedCourseSlugs?: string[];
  scrollY: number;
};

const COURSE_DIRECTORY_SNAPSHOT_KEY = 'courseInsightsCourseDirectory';

function readCourseDirectorySnapshot(): CourseDirectorySnapshot | null {
  if (typeof window === 'undefined') return null;
  const historyState = window.history.state;
  if (!historyState || typeof historyState !== 'object') return null;
  const snapshot = (historyState as Record<string, unknown>)[COURSE_DIRECTORY_SNAPSHOT_KEY];
  if (!snapshot || typeof snapshot !== 'object' || (snapshot as CourseDirectorySnapshot).version !== 1) return null;
  return snapshot as CourseDirectorySnapshot;
}

type RecentEntry =
  | { kind: 'course'; label: string; semesters: string[] }
  | { kind: 'semester'; semester: string; professors: Array<{ label: string; slug?: string }> };

function RecentEntryContent({ item, compact }: { item: RecentEntry; compact: boolean }) {
  if (item.kind === 'course') {
    return (
      <>
        <span className={compact ? '' : 'font-medium text-foreground/80'}>{item.label}</span>
        <span className={compact ? '' : 'whitespace-nowrap'}> · {item.semesters.join(', ')}</span>
      </>
    );
  }

  return (
    <>
      <strong className="font-semibold text-foreground">{item.semester}</strong>
      <span aria-hidden="true"> • </span>
      {item.professors.map((professor, index) => (
        <span key={professor.slug ?? professor.label}>
          {index > 0 ? ', ' : ''}
          {professor.slug
            ? <Link href={`/professors/${professor.slug}`} className="font-medium text-foreground/80 hover:text-primary hover:underline">{professor.label}</Link>
            : professor.label}
        </span>
      ))}
    </>
  );
}

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

function RangeFilter({ label, value, onChange, min, max, step = 1, id, formatValue, minLabel, maxLabel, snapPoints, snapRange = 1 }: {
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
  snapPoints?: number[];
  snapRange?: number;
}) {
  const numericValue = value === '' ? min : Number(value);
  const labelId = `${id}-label`;
  const pointerActive = useRef(false);
  const snapValue = (nextValue: number) => {
    if (!pointerActive.current || !snapPoints?.length) return nextValue;
    const nearest = snapPoints.reduce((closest, point) =>
      Math.abs(point - nextValue) < Math.abs(closest - nextValue) ? point : closest,
    );
    return Math.abs(nearest - nextValue) <= snapRange ? nearest : nextValue;
  };
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
        onPointerDown={() => { pointerActive.current = true; }}
        onPointerUp={() => { pointerActive.current = false; }}
        onPointerCancel={() => { pointerActive.current = false; }}
        onValueChange={([nextValue]) => onChange(String(snapValue(nextValue)))}
        className="cursor-pointer py-1.5"
      />
      {snapPoints && snapPoints.length > 0 && (
        <div className="relative h-4 text-[9px] text-muted-foreground" aria-hidden="true">
          {snapPoints.map((point) => (
            <span
              key={point}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${((point - min) / (max - min)) * 100}%` }}
            >
              {fmtInt(point)}
            </span>
          ))}
        </div>
      )}
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
  const [returnSnapshot] = useState(() => kind === 'courses' ? readCourseDirectorySnapshot() : null);
  const [q, setQ] = useState(() => returnSnapshot?.q ?? '');
  const [sort, setSort] = useState<SortKey>(() => returnSnapshot?.sort ?? (kind === 'courses' ? 'responses' : 'rating'));
  const [include1LCourses, setInclude1LCourses] = useState(() => returnSnapshot?.include1LCourses ?? true);
  const [includeOnlineInternationalCourses, setIncludeOnlineInternationalCourses] = useState(
    () => returnSnapshot?.includeOnlineInternationalCourses ?? true,
  );
  const [minOfferings, setMinOfferings] = useState(() => returnSnapshot?.minOfferings ?? '1');
  const [minResponses, setMinResponses] = useState(() => returnSnapshot?.minResponses ?? '50');
  const [minScore, setMinScore] = useState(() => returnSnapshot?.minScore ?? '');
  const [maxScore, setMaxScore] = useState(() => returnSnapshot?.maxScore ?? '');
  const [includedCategories, setIncludedCategories] = useState<CourseCategory[]>(() =>
    returnSnapshot ? [...returnSnapshot.includedCategories] : [...COURSE_CATEGORIES],
  );
  const [activeOnly, setActiveOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(() => returnSnapshot?.filtersOpen ?? false);
  const lastHeaderSort = useRef<string | null>(returnSnapshot?.lastHeaderSort ?? null);
  useEffect(() => {
    if (kind !== 'courses' || !returnSnapshot) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, returnSnapshot.scrollY));
    return () => window.cancelAnimationFrame(frame);
  }, [kind, returnSnapshot]);
  const metricIdx = kind === 'professors' ? 5 : 8;
  const groupsForKind = kind === 'professors' ? ds.professors : ds.courses;
  const maxOfferings = kind === 'professors'
    ? 30
    : Math.max(10, ...groupsForKind.map((group) => group.records.length + 10));
  const maxReviews = kind === 'professors' ? 300 : 500;
  const hasFilters = q !== '' || (kind === 'courses' && (!include1LCourses || !includeOnlineInternationalCourses)) ||
    (minOfferings !== '' && Number(minOfferings) > 1) ||
    (minResponses !== '' && Number(minResponses) > 0) ||
    (minScore !== '' && Number(minScore) > 0) ||
    (maxScore !== '' && Number(maxScore) < 5) ||
    (kind === 'courses' && includedCategories.length !== COURSE_CATEGORIES.length);
  const updateMinimum = (setValue: (value: string) => void) => (value: string) => {
    setValue(value);
  };
  const clearFilters = () => {
    setQ('');
    setInclude1LCourses(true);
    setIncludeOnlineInternationalCourses(true);
    setMinOfferings('1');
    setMinResponses('');
    setMinScore('');
    setMaxScore('');
    setIncludedCategories([...COURSE_CATEGORIES]);
    setActiveOnly(true);
  };
  const setDefaultFilters = () => {
    setMinOfferings('1');
    setMinResponses('50');
    setMinScore('');
    setMaxScore('');
    setActiveOnly(true);
  };
  const toggleCategory = (category: CourseCategory) => {
    setIncludedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  };
  const saveCourseDirectorySnapshot = () => {
    const currentState = window.history.state;
    const historyState = currentState && typeof currentState === 'object'
      ? currentState as Record<string, unknown>
      : {};
    const snapshot: CourseDirectorySnapshot = {
      version: 1,
      q,
      sort,
      include1LCourses,
      includeOnlineInternationalCourses,
      minOfferings,
      minResponses,
      minScore,
      maxScore,
      includedCategories: [...includedCategories],
      filtersOpen,
      lastHeaderSort: lastHeaderSort.current,
      expandedCourseSlugs: Array.from(document.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="button-expand-course-"][aria-expanded="true"]',
      ))
        .map((button) => button.dataset.testid?.replace('button-expand-course-', ''))
        .filter((slug): slug is string => Boolean(slug)),
      scrollY: window.scrollY,
    };
    window.history.replaceState({
      ...historyState,
      [COURSE_DIRECTORY_SNAPSHOT_KEY]: snapshot,
    }, '', window.location.href);
  };

  const rows = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    const groups = kind === 'professors' ? ds.professors : ds.courses;
    const out = groups
      .map((g) => {
        const categoryRecords = kind === 'professors'
          ? g.records
          : g.courseCategories?.some((category) => includedCategories.includes(category)) ? g.records : [];
        return { g, categoryRecords };
      })
      .filter(({ g, categoryRecords }) =>
        categoryRecords.length > 0 &&
        (kind !== 'professors' || !activeOnly || g.professorStatus !== 'Inactive') &&
        (kind !== 'courses' || include1LCourses || !categoryRecords.some((record) => record.is1LCourse)) &&
        (kind !== 'courses' || includeOnlineInternationalCourses || !categoryRecords.some((record) =>
          record.courseLabels.includes('Online') || record.courseLabels.includes('International'),
        )) &&
        matches(g, terms, kind, categoryRecords)
      )
      .map(({ g, categoryRecords }) => {
        const recs = categoryRecords;
        const m = aggregate(recs, metricIdx);
        const teach = kind === 'courses' ? aggregate(recs, 5) : null;
        const partners = new Set(recs.map((r) => (kind === 'professors' ? r.course : r.professor))).size;
        let recent: RecentEntry[];
        if (kind === 'professors') {
          const semestersByCourse = new Map<string, Set<string>>();
          for (const record of recs) {
            const semesters = semestersByCourse.get(record.course) ?? new Set<string>();
            semesters.add(record.semester || 'Semester unavailable');
            semestersByCourse.set(record.course, semesters);
          }
          recent = [...semestersByCourse.entries()]
            .map(([label, semesters]) => ({
              kind: 'course' as const,
              label,
              semesters: [...semesters].sort(bySemesterDesc).slice(0, 3),
            }))
            .sort((a, b) => bySemesterDesc(a.semesters[0] ?? '', b.semesters[0] ?? '') || a.label.localeCompare(b.label))
            .slice(0, 3);
        } else {
          const professorsBySemester = new Map<string, Map<string, { label: string; slug?: string }>>();
          for (const record of recs) {
            const semester = record.semester || 'Semester unavailable';
            const professors = professorsBySemester.get(semester) ?? new Map<string, { label: string; slug?: string }>();
            professors.set(record.professor, {
              label: friendlyName(record.professor),
              slug: ds.profSlugByName.get(record.professor),
            });
            professorsBySemester.set(semester, professors);
          }
          recent = [...professorsBySemester.entries()]
            .map(([semester, professors]) => ({
              kind: 'semester' as const,
              semester,
              professors: [...professors.values()].sort((a, b) => a.label.localeCompare(b.label)),
            }))
            .sort((a, b) => bySemesterDesc(a.semester, b.semester))
            .slice(0, 3);
        }
        return { g, m, teach, offerings: recs.length, partners, latest: recs[0]?.semester ?? '', recent };
      })
      .filter((r) =>
        r.offerings >= Number(minOfferings) &&
        r.m.responses >= Number(minResponses) &&
        (Number(minScore) === 0 || (r.m.avg !== null && r.m.avg >= Number(minScore))) &&
        (maxScore === '' || Number(maxScore) >= 5 || (r.m.avg !== null && r.m.avg <= Number(maxScore)))
      );
    const byAvg = (a: number | null, b: number | null, dir: 1 | -1) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (b - a));
    out.sort((a, b) => {
      switch (sort) {
        case 'rating': return byAvg(a.m.avg, b.m.avg, 1) || b.m.responses - a.m.responses;
        case 'rating-asc': return byAvg(a.m.avg, b.m.avg, -1) || b.m.responses - a.m.responses;
        case 'responses': return b.m.responses - a.m.responses;
        case 'responses-asc': return a.m.responses - b.m.responses;
        case 'courses': return b.partners - a.partners;
        case 'courses-asc': return a.partners - b.partners;
        case 'offerings': return b.offerings - a.offerings;
        case 'offerings-asc': return a.offerings - b.offerings;
        case 'recent': return a.latest === b.latest ? a.g.label.localeCompare(b.g.label) : bySemesterDesc(a.latest, b.latest);
        case 'name-desc': return b.g.label.localeCompare(a.g.label);
        default: return a.g.label.localeCompare(b.g.label);
      }
    });
    return out;
  }, [ds, kind, q, sort, metricIdx, minOfferings, minResponses, minScore, maxScore, includedCategories, activeOnly, include1LCourses, includeOnlineInternationalCourses]);

  const isProf = kind === 'professors';
  const total = isProf ? ds.professors.length : ds.courses.length;
  const sortByHeader = (header: string, first: SortKey, second: SortKey) => {
    const next = lastHeaderSort.current === header
      ? (sort === first ? second : first)
      : first;
    lastHeaderSort.current = header;
    setSort(next);
  };
  const sortHeader = (
    label: string,
    header: string,
    first: SortKey,
    second: SortKey,
    alignment: 'left' | 'center' | 'right' = 'right',
    firstDirection: 'ascending' | 'descending' = 'descending',
  ) => {
    const active = sort === first || sort === second;
    const direction = sort === first
      ? firstDirection
      : firstDirection === 'ascending' ? 'descending' : 'ascending';
    const Icon = active
      ? direction === 'ascending' ? ArrowUp : ArrowDown
      : ArrowUpDown;
    return (
      <button
        type="button"
        onClick={() => sortByHeader(header, first, second)}
        aria-label={`${label}, ${active ? `sorted ${direction}` : 'not sorted'}`}
        aria-pressed={active}
        data-testid={`button-sort-${header}`}
        className={`relative flex w-full min-w-0 cursor-pointer items-center rounded-sm py-0.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${alignment === 'left' ? 'justify-start' : alignment === 'center' ? 'justify-center' : 'justify-end text-right'}`}
      >
        {alignment === 'center' ? (
          <>
            <span className="w-full truncate text-center">{label}</span>
            <Icon className={`absolute right-0 h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'opacity-50'}`} aria-hidden="true" />
          </>
        ) : (
          <>
            <span className="truncate">{label}</span>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'opacity-50'}`} aria-hidden="true" />
          </>
        )}
      </button>
    );
  };
  const filterPanelContent = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-1">
        <RangeFilter
          label={isProf ? 'Minimum times taught' : 'Minimum class offerings'}
          value={minOfferings}
          onChange={updateMinimum(setMinOfferings)}
          min={1}
          max={maxOfferings}
          id="filter-min-offerings"
          formatValue={(value) => `${fmtInt(value)}+`}
          maxLabel={isProf ? '30+' : undefined}
        />
        <RangeFilter
          label="Minimum reviews"
          value={minResponses}
          onChange={updateMinimum(setMinResponses)}
          min={0}
          max={maxReviews}
          step={isProf ? 10 : 1}
          id="filter-min-responses"
          formatValue={(value) => value === 0 ? 'No minimum' : `${fmtInt(value)}+`}
          minLabel="No minimum"
          maxLabel={`${fmtInt(maxReviews)}+`}
          snapPoints={isProf ? [50, 100, 150, 200, 250] : undefined}
        />
        <RangeBandFilter
          label={isProf ? 'Teaching score' : 'Average Course Rating'}
          minValue={minScore === '' ? 0 : Number(minScore)}
          maxValue={maxScore === '' ? 5 : Number(maxScore)}
          onChange={([minimum, maximum]) => {
            setMinScore(minimum === 0 ? '' : minimum.toFixed(1));
            setMaxScore(maximum === 5 ? '' : maximum.toFixed(1));
          }}
          id={isProf ? 'filter-score-range' : 'filter-course-rating-range'}
        />
      </div>
      {!isProf && (
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
      )}
      {!isProf && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="text-xs text-muted-foreground max-w-3xl">
            Professors counts distinct instructors; offerings counts individual sections of each course. Minimums include the selected value and apply within the selected semester. Review totals count student responses from offerings contributing to the displayed score.
          </p>
          {hasFilters && <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary underline underline-offset-4 hover:no-underline" data-testid="button-clear-filters">Clear filters</button>}
        </div>
      )}
      {isProf && (
        <div className="flex items-center justify-end gap-3 mt-3">
          <button
            type="button"
            onClick={setDefaultFilters}
            className="shrink-0 whitespace-nowrap text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
            data-testid="button-set-default-filters"
          >
            Set default filters
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="shrink-0 whitespace-nowrap text-sm font-medium text-primary underline underline-offset-4 hover:no-underline" data-testid="button-clear-filters">Clear filters</button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="rise">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Directory</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{isProf ? 'Professors' : 'Courses'}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          {isProf
            ? <>You're in law school to learn from the best professors. But who are the best professors? It used to be nearly impossible to find that data: until we went out and got it.</>
            : <>You have to take Professional Responsibility, but there are 13 professors teaching it. How do you choose whose class to take? We have all the data to help you decide.</>}
        </p>
        <p className="text-xs text-muted-foreground mt-3" role="status" aria-live="polite" data-testid="filter-summary">
          {fmtInt(total)} total {isProf ? 'professors' : 'courses'} in the dataset · {fmtInt(total - rows.length)} filtered out · {fmtInt(rows.length)} matching
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6 sticky top-14 z-30 bg-background/90 backdrop-blur py-3 -mx-1 px-1" data-testid={`directory-toolbar-${kind}`}>
        <SearchBox value={q} onChange={setQ} placeholder={isProf ? 'Search a name or a course they taught' : 'Search a course title or instructor'} testId={`input-search-${kind}`} />
        {isProf && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
            <Switch
              id="toggle-active-professors"
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
              data-testid="toggle-active-professors"
            />
            <label htmlFor="toggle-active-professors" className="cursor-pointer select-none text-sm">
              Active professors only
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Professor activity information"
                  data-testid="button-professor-activity-info"
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info aria-hidden="true" className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="max-w-xs text-center">
                A professor is considered active if they have taught a course in the last three years.
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {isProf && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
            <Switch
              id="toggle-minimum-sample-size"
              checked={Number(minResponses) >= 50}
              onCheckedChange={(checked) => setMinResponses(checked ? '50' : '')}
              data-testid="toggle-minimum-sample-size"
            />
            <label htmlFor="toggle-minimum-sample-size" className="cursor-pointer select-none text-sm">
              Minimum sample size
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Minimum sample size information"
                  data-testid="button-minimum-sample-size-info"
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info aria-hidden="true" className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="max-w-xs text-center">
                Toggle this on to only include professors with 50 or more student reviews
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {!isProf && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
            <Switch
              id="toggle-include-1l-courses"
              checked={include1LCourses}
              onCheckedChange={setInclude1LCourses}
              data-testid="toggle-include-1l-courses"
            />
            <label htmlFor="toggle-include-1l-courses" className="cursor-pointer select-none text-sm">
              Include 1L Courses
            </label>
          </div>
        )}
        {!isProf && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
            <Switch
              id="toggle-include-online-international-courses"
              checked={includeOnlineInternationalCourses}
              onCheckedChange={setIncludeOnlineInternationalCourses}
              data-testid="toggle-include-online-international-courses"
            />
            <label htmlFor="toggle-include-online-international-courses" className="cursor-pointer select-none text-sm">
              Include Online/International Courses
            </label>
          </div>
        )}
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="directory-filter-controls"
          onClick={() => setFiltersOpen((open) => !open)}
          className={`group flex h-11 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filtersOpen ? 'bg-secondary/30' : ''}`}
          data-testid={isProf ? 'button-toggle-professor-filters' : 'button-toggle-course-filters'}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
            Filters
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform group-hover:text-primary ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <NativeSelect label="Sort" value={sort} onChange={(v) => {
          lastHeaderSort.current = null;
          setSort(v as SortKey);
        }} testId="select-sort">
          <option value="rating">Highest rated</option>
          <option value="rating-asc">Lowest rated</option>
          <option value="responses">Most reviews</option>
          <option value="responses-asc">Fewest reviews</option>
          <option value="offerings">{isProf ? 'Most times taught' : 'Most offerings'}</option>
          <option value="offerings-asc">{isProf ? 'Fewest times taught' : 'Fewest offerings'}</option>
          <option value="recent">Most recently taught</option>
          <option value="name">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </NativeSelect>
      </div>

      <fieldset className="mb-6 overflow-hidden rounded-xl border bg-card p-0" hidden={!filtersOpen}>
        <legend className="sr-only">Filters</legend>
        <div id="directory-filter-controls" className="px-4 pb-4 pt-4 sm:px-5">
          {filterPanelContent}
        </div>
      </fieldset>

      {rows.length === 0 ? (
        <Empty title="Nothing matches." hint="Lower the minimums, clear filters, or try a shorter search." />
      ) : (
        <>
          <div className="bg-card border rounded-xl overflow-clip" data-testid="directory-table">
            <div className={`${isProf
              ? 'hidden xl:grid xl:grid-cols-[3rem_minmax(7rem,0.56fr)_minmax(21rem,1.64fr)_12rem_6rem_7rem_2rem]'
              : 'hidden md:grid md:grid-cols-[3rem_1fr_7rem_8rem_7rem_2rem] lg:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_7rem_8rem_7rem_2rem] xl:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_12rem_8rem_7rem_2rem]'
            } sticky top-36 z-20 gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/95 backdrop-blur`} data-testid="directory-table-header">
              <span>#</span>
              {isProf
                ? sortHeader('Professor', 'professor', 'name', 'name-desc', 'left', 'ascending')
                : sortHeader('Course', 'course', 'name', 'name-desc', 'left', 'ascending')}
              <span className={isProf ? 'hidden xl:block normal-case tracking-normal' : 'hidden lg:block'}>{isProf ? 'Recent Courses' : 'Recent Professors'}</span>
              <span className="text-center">{isProf
                ? sortHeader('Teaching', 'teaching', 'rating', 'rating-asc', 'center')
                : sortHeader('Course Rating', 'rating', 'rating', 'rating-asc', 'center')}</span>
              <span className="text-right">{isProf
                ? sortHeader('Times Taught', 'times-taught', 'offerings', 'offerings-asc')
                : sortHeader('Times Offered', 'offerings', 'offerings', 'offerings-asc')}</span>
              <span className="text-right">{isProf
                ? sortHeader('Reviews', 'reviews', 'responses', 'responses-asc')
                : sortHeader('Reviews', 'reviews', 'responses', 'responses-asc')}</span><span />
            </div>
            {rows.map((r, i) => {
              const rowClass = `group grid grid-cols-[2rem_1fr_auto] ${isProf
                ? 'xl:grid-cols-[3rem_minmax(7rem,0.56fr)_minmax(21rem,1.64fr)_12rem_6rem_7rem_2rem]'
                : 'md:grid-cols-[3rem_1fr_7rem_8rem_7rem_2rem] lg:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_7rem_8rem_7rem_2rem] xl:grid-cols-[3rem_1fr_minmax(14rem,1.2fr)_12rem_8rem_7rem_2rem]'
              } gap-3 items-center px-4 py-3 hover:bg-secondary/60 transition-colors ${isProf ? 'border-b last:border-0' : ''}`;
              const renderRecentEntries = (compact: boolean) => r.recent.map((item, index) => (
                <span
                  key={item.kind === 'course'
                    ? `${item.label}-${item.semesters.join('-')}`
                    : `${item.semester}-${item.professors.map((professor) => professor.slug ?? professor.label).join('-')}`}
                  className="block break-words"
                  data-testid={item.kind === 'semester' ? `recent-semester-${r.g.slug}-${compact ? 'compact' : 'wide'}-${index}` : undefined}
                >
                  <RecentEntryContent item={item} compact={compact} />
                </span>
              ));
              const renderCells = (expandButton: ReactNode = null) => (
                <>
                  <span className="num text-xs text-muted-foreground">{sort.startsWith('rating') && r.m.avg == null ? '–' : i + 1}</span>
                  <span className="min-w-0">
                    <span className={`${isProf ? 'inline-block max-w-full hover:underline' : 'block'} whitespace-normal break-words font-medium group-hover:text-primary transition-colors`}>
                      {isProf ? r.g.label : (
                        <Link href={`/courses/${r.g.slug}`} className="block whitespace-normal break-words hover:underline" onClick={saveCourseDirectorySnapshot}>
                          {r.g.label}
                        </Link>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{isProf ? 'Last Taught' : 'Latest'} {r.latest}</span>
                      {isProf && r.g.professorStatus === 'Inactive' && (
                        <span
                          className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive"
                          data-testid={`badge-professor-inactive-${r.g.slug}`}
                        >
                          Inactive
                        </span>
                      )}
                      {!isProf && r.g.courseCategories?.map((category) => (
                        <span key={category} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">{category}</span>
                      ))}
                      {!isProf && r.g.courseLabels?.map((label) => (
                        <span key={`label-${label}`} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">{label}</span>
                      ))}
                      {isProf && <span className="xl:hidden num">· {r.offerings} times taught</span>}
                      <span className={isProf ? 'xl:hidden num' : 'md:hidden num'}>· {fmtInt(r.m.responses)} reviews</span>
                      {!isProf && expandButton}
                      <SmallSample responses={r.m.responses} />
                    </span>
                    <span className={`mt-1 block min-w-0 text-xs leading-5 text-muted-foreground ${isProf ? 'xl:hidden' : 'lg:hidden'}`}>
                      <span className="block text-[10px] font-medium uppercase tracking-wide">
                        {isProf ? 'Recent courses' : 'Recent professors'}
                      </span>
                      {renderRecentEntries(true)}
                    </span>
                  </span>
                  <span className={`hidden min-w-0 text-xs leading-5 text-muted-foreground ${isProf ? 'xl:block' : 'lg:block'}`}>
                    {renderRecentEntries(false)}
                  </span>
                  <span className={isProf ? 'xl:justify-self-end' : 'md:justify-self-end'}>
                    {isProf
                      ? <RatingBar rating={r.m.avg} label={`${r.g.label} overall teaching rating`} compact testId={`rating-professor-${r.g.slug}`} />
                      : <RatingBar rating={r.m.avg} label={`${r.g.label} overall course rating`} compact testId={`rating-course-${r.g.slug}`} />}
                  </span>
                  <span className={isProf ? 'hidden xl:block text-right num text-sm' : 'hidden md:block text-right num text-sm'}>{r.offerings}</span>
                  <span className={isProf ? 'hidden xl:block text-right num text-sm' : 'hidden md:block text-right num text-sm'}>{fmtInt(r.m.responses)}</span>
                  <ArrowUpRight className={isProf ? 'hidden xl:block h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition' : 'hidden md:block h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition'} />
                </>
              );
              if (isProf) {
                return (
                  <Link
                    key={r.g.slug}
                    href={`/professors/${r.g.slug}`}
                    data-testid={`row-professors-${r.g.slug}`}
                    className={rowClass}
                  >
                    {renderCells()}
                  </Link>
                );
              }
              return (
                <CourseProfessorExpansion
                  key={r.g.slug}
                  course={r.g}
                  dataset={ds}
                  includeMostRecent
                  initialExpanded={returnSnapshot?.expandedCourseSlugs?.includes(r.g.slug) ?? false}
                >
                  {({ button, panel }) => (
                    <div data-testid={`row-courses-${r.g.slug}`} className="border-b last:border-0">
                      <div className={rowClass}>{renderCells(button)}</div>
                      {panel}
                    </div>
                  )}
                </CourseProfessorExpansion>
              );
            })}
          </div>
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
