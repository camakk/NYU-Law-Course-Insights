import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronDown, Info, SlidersHorizontal } from 'lucide-react';
import { aggregate, bySemesterDesc, calculateProfessorStanding, COURSE_CATEGORIES, fmt, fmtInt, friendlyName, isCoreTaxCourse, useDataset, type CourseCategory, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { Empty, SmallSample, NativeSelect, PageError, PageLoading, RatingBar, Score, SearchBox, useTitle } from '@/components/kit';
import { EffectivenessGradePill } from '@/components/effectiveness-grade-pill';
import { recentProfessorScoreColor } from '@/lib/rating-color';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CourseProfessorPreview } from '@/components/course-professor-preview';

type Kind = 'professors' | 'courses';
type SortKey = 'rating' | 'rating-asc' | 'responses' | 'responses-asc' | 'courses' | 'courses-asc' | 'offerings' | 'offerings-asc' | 'name' | 'name-desc' | 'recent';
type DirectorySnapshot = {
  version: 1;
  q: string;
  sort: SortKey;
  include1LCourses?: boolean;
  includeOnlineInternationalCourses?: boolean;
  includeUpperLevelTaxCourses?: boolean;
  minOfferings: string;
  minResponses: string;
  minScore: string;
  maxScore: string;
  includedCategories: CourseCategory[];
  activeOnly?: boolean;
  filtersOpen: boolean;
  lastHeaderSort: string | null;
  expandedRecentSemesterSlugs?: string[];
  scrollY: number;
};

const COURSE_DIRECTORY_SNAPSHOT_KEY = 'courseInsightsCourseDirectory';
const PROFESSOR_DIRECTORY_SNAPSHOT_KEY = 'courseInsightsProfessorDirectory';
const REVIEW_TICKS = Array.from({ length: 4 }, (_, index) => index * 100);
const COURSE_CATEGORY_BADGE_COLORS: Record<CourseCategory, string> = {
  Course: 'bg-[#E1EBE2] text-[#3F6248]',
  Seminar: 'bg-[#DAE4EF] text-[#34516F]',
  Colloquium: 'bg-[#DAE4EF] text-[#34516F]',
  Clinic: 'bg-[#E9DFEF] text-[#6B4F7A]',
  Externship: 'bg-[#E9DFEF] text-[#6B4F7A]',
};
const COURSE_CATEGORY_TOGGLES: Array<{ id: string; label: string; categories: CourseCategory[]; description: string }> = [
  {
    id: 'toggle-include-courses',
    label: 'Include Courses',
    categories: ['Course'],
    description: 'Check this box to include Courses and Simulation Courses in the results',
  },
  {
    id: 'toggle-include-seminars-colloquiums',
    label: 'Include Seminars',
    categories: ['Seminar', 'Colloquium'],
    description: 'Check this box to include Seminars and Colloquiums in the results.',
  },
  {
    id: 'toggle-include-clinics-externships',
    label: 'Include Clinics',
    categories: ['Clinic', 'Externship'],
    description: 'Check this box to include Clinics and Externships in the results.',
  },
];

function readDirectorySnapshot(key: string): DirectorySnapshot | null {
  if (typeof window === 'undefined') return null;
  const historyState = window.history.state;
  if (!historyState || typeof historyState !== 'object') return null;
  const snapshot = (historyState as Record<string, unknown>)[key];
  if (!snapshot || typeof snapshot !== 'object' || (snapshot as DirectorySnapshot).version !== 1) return null;
  return snapshot as DirectorySnapshot;
}

type RecentEntry =
  | { kind: 'course'; label: string; semesters: string[] }
  | { kind: 'semester'; semester: string; professors: Array<{ label: string; slug?: string; score: number | null }> };

function formatSemesterForDisplay(semester: string) {
  return semester.replace(/\b(Spring|Fall|Summer)\b/g, (season) => {
    const emoji = season === 'Spring' ? '🌸' : season === 'Fall' ? '🍂' : '☀️';
    return `${emoji} ${season}`;
  });
}

function RecentEntryContent({
  item,
  compact,
  formatSemester,
}: {
  item: RecentEntry;
  compact: boolean;
  formatSemester?: (semester: string) => string;
}) {
  if (item.kind === 'course') {
    return (
      <>
        <span className={compact ? '' : 'font-medium text-foreground/80'}>{item.label}</span>
        <span className={compact ? '' : 'whitespace-nowrap'}> · {item.semesters.map((semester) => formatSemester?.(semester) ?? semester).join(', ')}</span>
      </>
    );
  }

  return (
    <>
      <strong className="font-semibold text-foreground">{formatSemester?.(item.semester) ?? item.semester}</strong>
      <span aria-hidden="true"> • </span>
      {item.professors.map((professor, index) => (
        <span key={professor.slug ?? professor.label}>
          {index > 0 ? ', ' : ''}
          {professor.slug
            ? (
              <Link href={`/professors/${professor.slug}`} className="font-medium text-foreground/80 underline underline-offset-2 hover:text-primary">
                {professor.label} ({professor.score == null
                  ? fmt(professor.score)
                  : <span style={{ color: recentProfessorScoreColor(professor.score) }}>{fmt(professor.score)}</span>})
              </Link>
            )
            : (
              <>
                {professor.label} ({professor.score == null
                  ? fmt(professor.score)
                  : <span style={{ color: recentProfessorScoreColor(professor.score) }}>{fmt(professor.score)}</span>})
              </>
            )}
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

function RangeFilter({ label, value, onChange, min, max, step = 1, id, formatValue, minLabel, maxLabel, snapPoints, snapRange = 1, tickMarks, inline = false }: {
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
  tickMarks?: number[];
  inline?: boolean;
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
  const slider = (
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
      className={inline ? 'w-auto min-w-0 flex-1 cursor-pointer py-1.5' : 'cursor-pointer py-1.5'}
    />
  );
  return (
    <div className={inline ? 'min-w-0' : 'flex min-w-0 flex-col gap-2'} data-testid={id}>
      {inline ? (
        <div className="flex h-11 min-w-0 items-center gap-2 text-xs">
          <span id={labelId} className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
          {tickMarks?.length ? (
            <div className="relative flex h-8 min-w-0 flex-1 items-center">
              {slider}
              {tickMarks.map((point) => (
                <span
                  key={`mark-${point}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 z-10 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-muted-foreground/70"
                  style={{ left: `${((point - min) / (max - min)) * 100}%` }}
                />
              ))}
              {tickMarks.map((point) => (
                <span
                  key={`label-${point}`}
                  aria-hidden="true"
                  data-testid={`${id}-tick-${point}`}
                  className={`pointer-events-none absolute bottom-0 text-[8px] leading-none text-muted-foreground ${point === min ? '' : point === max ? '-translate-x-full' : '-translate-x-1/2'}`}
                  style={{ left: `${((point - min) / (max - min)) * 100}%` }}
                >
                  {fmtInt(point)}
                </span>
              ))}
            </div>
          ) : slider}
          <output className="shrink-0 font-medium text-foreground" data-testid={`${id}-value`}>
            {formatValue(numericValue)}
          </output>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span id={labelId}>{label}</span>
            <output className="shrink-0 font-medium text-foreground" data-testid={`${id}-value`}>
              {formatValue(numericValue)}
            </output>
          </div>
          {slider}
          {tickMarks && tickMarks.length > 0 && (
            <div className="relative h-4 text-[9px] text-muted-foreground" aria-hidden="true">
              {tickMarks.map((point) => (
                <span
                  key={point}
                  data-testid={`${id}-tick-${point}`}
                  className={`absolute whitespace-nowrap ${point === min ? '' : point === max ? '-translate-x-full' : '-translate-x-1/2'}`}
                  style={{ left: `${((point - min) / (max - min)) * 100}%` }}
                >
                  <span className="absolute -top-2 left-1/2 h-2 w-px bg-muted-foreground/70" />
                  {fmtInt(point)}
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{minLabel ?? min}</span>
            <span>{maxLabel ?? max}</span>
          </div>
        </>
      )}
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
  const maxReviews = kind === 'courses' ? 200 : 300;
  const [returnSnapshot] = useState(() => readDirectorySnapshot(
    kind === 'courses' ? COURSE_DIRECTORY_SNAPSHOT_KEY : PROFESSOR_DIRECTORY_SNAPSHOT_KEY,
  ));
  const [q, setQ] = useState(() => returnSnapshot?.q ?? '');
  const [sort, setSort] = useState<SortKey>(() =>
    returnSnapshot?.sort === 'recent'
      ? 'responses'
      : returnSnapshot?.sort ?? 'responses',
  );
  const [include1LCourses, setInclude1LCourses] = useState(() => returnSnapshot?.include1LCourses ?? false);
  const [includeOnlineInternationalCourses, setIncludeOnlineInternationalCourses] = useState(
    () => returnSnapshot?.includeOnlineInternationalCourses ?? false,
  );
  const [includeUpperLevelTaxCourses, setIncludeUpperLevelTaxCourses] = useState(
    () => returnSnapshot?.includeUpperLevelTaxCourses ?? true,
  );
  const [minOfferings, setMinOfferings] = useState(() => returnSnapshot?.minOfferings ?? '1');
  const [minResponses, setMinResponses] = useState(() => {
    const savedValue = returnSnapshot?.minResponses;
    return savedValue ? String(Math.min(Number(savedValue), maxReviews)) : savedValue ?? '50';
  });
  const [minScore, setMinScore] = useState(() => returnSnapshot?.minScore ?? '');
  const [maxScore, setMaxScore] = useState(() => returnSnapshot?.maxScore ?? '');
  const [includedCategories, setIncludedCategories] = useState<CourseCategory[]>(() =>
    returnSnapshot ? [...returnSnapshot.includedCategories] : [...COURSE_CATEGORIES],
  );
  const [activeOnly, setActiveOnly] = useState(() => returnSnapshot?.activeOnly ?? true);
  const [filtersOpen, setFiltersOpen] = useState(() => returnSnapshot?.filtersOpen ?? false);
  const directoryStickyControlsRef = useRef<HTMLDivElement>(null);
  const [directoryStickyControlsHeight, setDirectoryStickyControlsHeight] = useState(0);
  const [expandedRecentSemesters, setExpandedRecentSemesters] = useState<Record<string, boolean>>(
    () => Object.fromEntries((returnSnapshot?.expandedRecentSemesterSlugs ?? []).map((slug) => [slug, true])),
  );
  const lastHeaderSort = useRef<string | null>(returnSnapshot?.lastHeaderSort ?? null);
  useLayoutEffect(() => {
    const controls = directoryStickyControlsRef.current;
    if (!controls) return;
    const measureControls = () => setDirectoryStickyControlsHeight(controls.offsetHeight);
    measureControls();
    const observer = new ResizeObserver(measureControls);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [kind]);
  useEffect(() => {
    if (!returnSnapshot) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, returnSnapshot.scrollY));
    return () => window.cancelAnimationFrame(frame);
  }, [kind, returnSnapshot]);
  const metricIdx = kind === 'professors' ? 5 : 8;
  const groupsForKind = kind === 'professors' ? ds.professors : ds.courses;
  const maxOfferings = kind === 'professors'
    ? 30
    : Math.max(10, ...groupsForKind.map((group) => group.records.length + 10));
  const hasFilters = q !== '' || (kind === 'courses' && (!include1LCourses || !includeOnlineInternationalCourses || !includeUpperLevelTaxCourses)) ||
    (kind === 'professors' && minOfferings !== '' && Number(minOfferings) > 1) ||
    (minResponses !== '' && Number(minResponses) > 0) ||
    (kind === 'professors' && minScore !== '' && Number(minScore) > 0) ||
    (kind === 'professors' && maxScore !== '' && Number(maxScore) < 5) ||
    (kind === 'courses' && includedCategories.length !== COURSE_CATEGORIES.length);
  const updateMinimum = (setValue: (value: string) => void) => (value: string) => {
    setValue(value);
  };
  const clearFilters = () => {
    if (!hasFilters) return;
    setQ('');
    setInclude1LCourses(true);
    setIncludeOnlineInternationalCourses(true);
    setIncludeUpperLevelTaxCourses(true);
    setMinOfferings('1');
    setMinResponses(kind === 'courses' ? '0' : '');
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
    if (kind === 'courses') {
      setInclude1LCourses(false);
      setIncludeOnlineInternationalCourses(false);
      setIncludeUpperLevelTaxCourses(true);
      setIncludedCategories([...COURSE_CATEGORIES]);
      return;
    }
    setActiveOnly(true);
  };
  const professorGradeBySlug = useMemo(() => {
    if (kind !== 'professors') return new Map<string, string>();
    const rankingEntries = ds.professors.map((professor) => ({
      score: professor.metrics[5]?.avg ?? null,
      reviews: professor.metrics[5]?.responses ?? 0,
    }));
    return new Map(ds.professors.map((professor, index) => {
      const standing = calculateProfessorStanding(rankingEntries, rankingEntries[index]);
      return [
        professor.slug,
        standing.grade ?? (standing.belowReviewThreshold ? 'N/A' : '—'),
      ] as const;
    }));
  }, [ds.professors, kind]);
  const setCourseCategoryGroup = (categories: CourseCategory[], included: boolean) => {
    setIncludedCategories((current) => {
      const remaining = current.filter((category) => !categories.includes(category));
      return included ? [...remaining, ...categories] : remaining;
    });
  };
  const isCourseCategoryGroupIncluded = (categories: CourseCategory[]) =>
    categories.every((category) => includedCategories.includes(category));
  const saveDirectorySnapshot = () => {
    const currentState = window.history.state;
    const historyState = currentState && typeof currentState === 'object'
      ? currentState as Record<string, unknown>
      : {};
    const snapshot: DirectorySnapshot = {
      version: 1,
      q,
      sort,
      include1LCourses,
      includeOnlineInternationalCourses,
      includeUpperLevelTaxCourses,
      minOfferings,
      minResponses,
      minScore,
      maxScore,
      includedCategories: [...includedCategories],
      activeOnly,
      filtersOpen,
      lastHeaderSort: lastHeaderSort.current,
      expandedRecentSemesterSlugs: Object.entries(expandedRecentSemesters)
        .filter(([, expanded]) => expanded)
        .map(([slug]) => slug),
      scrollY: window.scrollY,
    };
    const snapshotKey = kind === 'courses' ? COURSE_DIRECTORY_SNAPSHOT_KEY : PROFESSOR_DIRECTORY_SNAPSHOT_KEY;
    window.history.replaceState({
      ...historyState,
      [snapshotKey]: snapshot,
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
        (kind !== 'courses' || includeUpperLevelTaxCourses || !g.courseLabels?.includes('Tax') || isCoreTaxCourse(g.name)) &&
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
          const professorsBySemester = new Map<string, Map<string, EvalRecord[]>>();
          for (const record of recs) {
            const semester = record.semester || 'Semester unavailable';
            const professors = professorsBySemester.get(semester) ?? new Map<string, EvalRecord[]>();
            const offerings = professors.get(record.professor) ?? [];
            offerings.push(record);
            professors.set(record.professor, offerings);
            professorsBySemester.set(semester, professors);
          }
          recent = [...professorsBySemester.entries()]
            .map(([semester, professors]) => ({
              kind: 'semester' as const,
              semester,
              professors: [...professors.entries()].map(([name, offerings]) => ({
                label: friendlyName(name),
                slug: ds.profSlugByName.get(name),
                score: aggregate(offerings, 5).avg,
              })).sort((a, b) => a.label.localeCompare(b.label)),
            }))
            .sort((a, b) => bySemesterDesc(a.semester, b.semester));
        }
        return { g, m, teach, offerings: recs.length, partners, latest: recs[0]?.semester ?? '', recent };
      })
      .filter((r) =>
        (kind !== 'professors' || r.offerings >= Number(minOfferings)) &&
        r.m.responses >= Number(minResponses) &&
        (kind !== 'professors' || Number(minScore) === 0 || (r.m.avg !== null && r.m.avg >= Number(minScore))) &&
        (kind !== 'professors' || maxScore === '' || Number(maxScore) >= 5 || (r.m.avg !== null && r.m.avg <= Number(maxScore)))
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
  }, [ds, kind, q, sort, metricIdx, minOfferings, minResponses, minScore, maxScore, includedCategories, activeOnly, include1LCourses, includeOnlineInternationalCourses, includeUpperLevelTaxCourses]);

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
    centeredLabelWidth: 'full' | 'rating-bar' = 'full',
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
        className={`relative flex w-full min-w-0 cursor-pointer items-center rounded-sm py-0.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${alignment === 'left' ? 'justify-start' : alignment === 'center' ? centeredLabelWidth === 'rating-bar' ? 'justify-start' : 'justify-center' : 'justify-end text-right'}`}
      >
        {alignment === 'center' ? (
          <>
            <span
              className={`${centeredLabelWidth === 'rating-bar' ? '' : 'w-full'} truncate text-center`}
              style={centeredLabelWidth === 'rating-bar' ? { width: 'calc(100% - 4.5rem)' } : undefined}
            >
              {label}
            </span>
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
  const minimumReviewsFilter = (
    <RangeFilter
      label="Minimum reviews"
      value={minResponses}
      onChange={updateMinimum(setMinResponses)}
      min={0}
      max={maxReviews}
      step={10}
      id="filter-min-responses"
      formatValue={(value) => value === 0 ? 'No minimum' : `${fmtInt(value)}+`}
      minLabel="No minimum"
      maxLabel={`${fmtInt(maxReviews)}+`}
      snapPoints={isProf ? [50, 100, 150, 200, 250] : undefined}
      tickMarks={REVIEW_TICKS.filter((point) => point <= maxReviews)}
      inline={!isProf}
    />
  );
  const filterActionButtons = (
    <>
      <button
        type="button"
        onClick={setDefaultFilters}
        className="shrink-0 whitespace-nowrap text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
        data-testid="button-set-default-filters"
      >
        Set default filters
      </button>
      <button
        type="button"
        onClick={clearFilters}
        className="shrink-0 whitespace-nowrap text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
        data-testid="button-clear-filters"
      >
        Clear all filters
      </button>
    </>
  );
  const filterPanelContent = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-1">
        <RangeFilter
          label="Minimum times taught"
          value={minOfferings}
          onChange={updateMinimum(setMinOfferings)}
          min={1}
          max={maxOfferings}
          id="filter-min-offerings"
          formatValue={(value) => `${fmtInt(value)}+`}
          maxLabel="30+"
        />
        {minimumReviewsFilter}
        <RangeBandFilter
          label="Teaching score"
          minValue={minScore === '' ? 0 : Number(minScore)}
          maxValue={maxScore === '' ? 5 : Number(maxScore)}
          onChange={([minimum, maximum]) => {
            setMinScore(minimum === 0 ? '' : minimum.toFixed(1));
            setMaxScore(maximum === 5 ? '' : maximum.toFixed(1));
          }}
          id="filter-score-range"
        />
      </div>
      <div className="flex items-center justify-end gap-3 mt-3">
        {filterActionButtons}
      </div>
    </>
  );

  return (
    <div className="rise">
      <div className={isProf ? 'mb-2' : 'mb-0'}>
        <div className="text-[11px] uppercase tracking-[0.25em] text-primary font-semibold">Directory</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{isProf ? 'Professors' : 'Courses'}</h1>
      </div>

      <div
        ref={directoryStickyControlsRef}
        className="mb-6 sticky top-14 z-30 -mx-1 bg-background px-1 pt-2"
        data-testid={isProf ? 'professor-sticky-controls' : 'course-sticky-controls'}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
          <p className={`text-xs text-muted-foreground ${isProf ? 'mt-3' : ''}`} role="status" aria-live="polite" data-testid="filter-summary">
            {fmtInt(total)} total {isProf ? 'professors' : 'courses'} in the dataset · {fmtInt(total - rows.length)} filtered out · {fmtInt(rows.length)} matching
          </p>
          {!isProf && (
            <div className="flex items-center gap-3" data-testid="course-filter-actions">
              {filterActionButtons}
            </div>
          )}
        </div>

        <div
          className={`mb-0 ${isProf ? 'py-3 bg-background/90 -mx-1 px-1' : 'pt-0 pb-3'} z-30 backdrop-blur`}
          data-testid={`directory-toolbar-${kind}`}
        >
          <div className="flex flex-wrap items-end gap-3" data-testid={`directory-toolbar-primary-row-${kind}`}>
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
                  Exclude small samples
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Exclude small samples information"
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
                <Checkbox
                  id="toggle-include-1l-courses"
                  checked={include1LCourses}
                  onCheckedChange={(checked) => setInclude1LCourses(checked === true)}
                  data-testid="toggle-include-1l-courses"
                  className="h-5 w-5 cursor-pointer rounded-md transition-colors"
                />
                <label htmlFor="toggle-include-1l-courses" className="cursor-pointer select-none text-sm">
                  Include 1L Courses
                </label>
              </div>
            )}
            {!isProf && (
              <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
                <Checkbox
                  id="toggle-include-online-international-courses"
                  checked={includeOnlineInternationalCourses}
                  onCheckedChange={(checked) => setIncludeOnlineInternationalCourses(checked === true)}
                  data-testid="toggle-include-online-international-courses"
                  className="h-5 w-5 cursor-pointer rounded-md transition-colors"
                />
                <label htmlFor="toggle-include-online-international-courses" className="cursor-pointer select-none text-sm">
                  Include Online/International Courses
                </label>
              </div>
            )}
            {isProf && <button
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
            </button>}
            <NativeSelect label="Sort by" hideLabel value={sort} onChange={(v) => {
              lastHeaderSort.current = null;
              setSort(v as SortKey);
            }} testId="select-sort">
              <option value="rating">Sort by: Highest rated</option>
              <option value="rating-asc">Sort by: Lowest rated</option>
              <option value="responses">Sort by: Most reviews</option>
              <option value="responses-asc">Sort by: Fewest reviews</option>
              <option value="offerings">{isProf ? 'Sort by: Most times taught' : 'Sort by: Most offerings'}</option>
              <option value="offerings-asc">{isProf ? 'Sort by: Fewest times taught' : 'Sort by: Fewest offerings'}</option>
              <option value="name">Sort by: Name A–Z</option>
              <option value="name-desc">Sort by: Name Z–A</option>
            </NativeSelect>
          </div>
          {!isProf && (
            <div
              className="mt-3 flex flex-wrap items-center gap-3"
              role="group"
              aria-label="Course category and delivery filters"
              data-testid="course-toggle-filter-row"
            >
              {COURSE_CATEGORY_TOGGLES.map(({ id, label, categories, description }) => (
                <div key={id} className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
                  <Checkbox
                    id={id}
                    checked={isCourseCategoryGroupIncluded(categories)}
                    onCheckedChange={(checked) => setCourseCategoryGroup(categories, checked === true)}
                    data-testid={id}
                    className="h-5 w-5 cursor-pointer rounded-md transition-colors"
                  />
                  <label htmlFor={id} className="cursor-pointer select-none text-sm">{label}</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${label} information`}
                        data-testid={`button-course-category-info-${id}`}
                        className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Info aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="max-w-xs text-center">
                      {description}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
              <div className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3">
                <Checkbox
                  id="toggle-include-upper-level-tax-courses"
                  checked={includeUpperLevelTaxCourses}
                  onCheckedChange={(checked) => setIncludeUpperLevelTaxCourses(checked === true)}
                  data-testid="toggle-include-upper-level-tax-courses"
                  className="h-5 w-5 cursor-pointer rounded-md transition-colors"
                />
                <label htmlFor="toggle-include-upper-level-tax-courses" className="cursor-pointer select-none text-sm">
                  Include Upper-Level Tax Courses
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Upper-level tax courses information"
                      data-testid="button-upper-level-tax-info"
                      className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className="max-w-xs text-center">
                    Excludes all tax classes except for Income Taxation
                  </TooltipContent>
                </Tooltip>
              </div>
              <div
                className="h-11 min-w-[14rem] flex-1 rounded-lg border border-input bg-card px-3"
                data-testid="course-min-reviews-control"
              >
                {minimumReviewsFilter}
              </div>
            </div>
          )}
        </div>
        {isProf && <fieldset className="mb-0 overflow-hidden rounded-xl border bg-card p-0" hidden={!filtersOpen}>
          <legend className="sr-only">Filters</legend>
          <div id="directory-filter-controls" className="px-4 pb-4 pt-4 sm:px-5">
            {filterPanelContent}
          </div>
        </fieldset>}
      </div>

      {rows.length === 0 ? (
        <Empty title="Nothing matches." hint="Lower the minimums, clear filters, or try a shorter search." />
      ) : (
        <>
          <div className="bg-card border rounded-xl overflow-clip" data-testid="directory-table">
            <div className={`${isProf
              ? 'hidden xl:grid xl:grid-cols-[3rem_minmax(7rem,0.56fr)_minmax(21rem,1.64fr)_4rem_12rem_6rem_7rem_2rem]'
              : 'hidden md:grid course-directory-grid'
            } sticky z-20 gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-muted/95 backdrop-blur`}
              style={{ top: `calc(3.5rem + ${directoryStickyControlsHeight}px)` }}
              data-testid="directory-table-header">
              <span>#</span>
              {isProf
                ? sortHeader('Professor', 'professor', 'name', 'name-desc', 'left', 'ascending')
                : sortHeader('Course', 'course', 'name', 'name-desc', 'left', 'ascending')}
              <span className={isProf ? 'hidden xl:block normal-case tracking-normal' : 'hidden lg:block normal-case tracking-normal'}>{isProf ? 'Recent Courses' : 'Recent Professors'}</span>
              {isProf && <span className="hidden xl:block" />}
              {!isProf && <span className="text-center">
                {sortHeader('Times Offered', 'offerings', 'offerings', 'offerings-asc', 'center')}
              </span>}
              {!isProf && <span className="text-center">
                {sortHeader('Reviews', 'reviews', 'responses', 'responses-asc', 'center')}
              </span>}
              <span className="relative text-center">{isProf
                ? sortHeader('Teaching Grade', 'teaching', 'rating', 'rating-asc', 'center', 'descending', 'rating-bar')
                : sortHeader('Top Professors', 'rating', 'rating', 'rating-asc', 'center')}
                {isProf && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About teaching grades"
                        data-testid="button-teaching-grade-info"
                        className="absolute left-[calc(100%-4.5rem+0.25rem)] top-1/2 -translate-y-1/2 cursor-default rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Info className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-center normal-case tracking-normal">
                      Professors are graded on the exact same distribution curve that NYU Law uses for 1L grades
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
              {isProf && <span className="text-right">
                {sortHeader('Times Taught', 'times-taught', 'offerings', 'offerings-asc')}
              </span>}
              {isProf && <span className="text-right">
                {sortHeader('Reviews', 'reviews', 'responses', 'responses-asc')}
              </span>}
              <span />
            </div>
            {rows.map((r, i) => {
              const rowClass = `group grid grid-cols-[2rem_1fr_auto] ${isProf
                ? 'xl:grid-cols-[3rem_minmax(7rem,0.56fr)_minmax(21rem,1.64fr)_4rem_12rem_6rem_7rem_2rem]'
                : 'course-directory-grid'
              } gap-3 items-center px-4 py-3 hover:bg-secondary/60 transition-colors ${isProf ? 'border-b last:border-0' : ''}`;
              const recentSemestersExpanded = expandedRecentSemesters[r.g.slug] ?? false;
              const visibleRecentEntries = isProf || recentSemestersExpanded ? r.recent : r.recent.slice(0, 2);
              const canExpandRecentHistory = !isProf && r.offerings > 3 && r.recent.length > 2;
              const toggleCourseExpansion = () => setExpandedRecentSemesters((current) => ({
                ...current,
                [r.g.slug]: !(current[r.g.slug] ?? false),
              }));
              const renderRecentEntries = (compact: boolean) => (
                <>
                  {visibleRecentEntries.map((item, index) => (
                    <span
                      key={item.kind === 'course'
                        ? `${item.label}-${item.semesters.join('-')}`
                        : `${item.semester}-${item.professors.map((professor) => professor.slug ?? professor.label).join('-')}`}
                      className={`block break-words${item.kind === 'semester' && index > 0 ? ' mt-1.5' : ''}`}
                      data-testid={item.kind === 'semester' ? `recent-semester-${r.g.slug}-${compact ? 'compact' : 'wide'}-${index}` : undefined}
                    >
                      <RecentEntryContent item={item} compact={compact} formatSemester={isProf ? undefined : formatSemesterForDisplay} />
                    </span>
                  ))}
                  {canExpandRecentHistory && (
                    <span className="mt-1 block" data-testid={`course-history-toggle-line-${r.g.slug}-${compact ? 'compact' : 'wide'}`}>
                      <button
                        type="button"
                        aria-expanded={recentSemestersExpanded}
                        aria-label={`${recentSemestersExpanded ? 'Collapse' : 'Expand'} all semesters for ${r.g.label}`}
                        onClick={toggleCourseExpansion}
                        className="inline-flex cursor-pointer items-center rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        data-testid={`button-toggle-course-history-${r.g.slug}-${compact ? 'compact' : 'wide'}`}
                      >
                        {recentSemestersExpanded ? 'Collapse' : '[...]'}
                      </button>
                    </span>
                  )}
                </>
              );
              const renderCells = () => (
                <>
                  <span className="num text-xs text-muted-foreground">{sort.startsWith('rating') && r.m.avg == null ? '–' : i + 1}</span>
                  <span className="min-w-0">
                    <span className={`${isProf
                      ? 'inline-block max-w-full font-medium hover:underline'
                      : 'block text-[17px] font-semibold leading-snug'
                    } whitespace-normal break-words transition-colors group-hover:text-primary`}>
                      {isProf ? r.g.label : (
                        <Link href={`/courses/${r.g.slug}`} className="whitespace-normal break-words hover:underline" onClick={saveDirectorySnapshot}>
                          {r.g.label}
                        </Link>
                      )}
                      {!isProf && r.g.courseLabels?.includes('1L') && (
                        <span
                          className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground"
                          data-testid={`badge-course-1l-${r.g.slug}`}
                        >
                          1L
                        </span>
                      )}
                    </span>
                    <span className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${isProf ? '' : 'mt-1.5'}`}>
                      <span data-testid={!isProf ? `course-latest-${r.g.slug}` : undefined}>
                        {isProf ? 'Last Taught' : 'Latest'} {r.latest}
                      </span>
                      {isProf && r.g.professorStatus === 'Inactive' && (
                        <span
                          className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive"
                          data-testid={`badge-professor-inactive-${r.g.slug}`}
                        >
                          Inactive
                        </span>
                      )}
                      {!isProf && r.g.courseCategories?.map((category) => (
                        <span
                          key={category}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COURSE_CATEGORY_BADGE_COLORS[category]}`}
                        >
                          {category}
                        </span>
                      ))}
                      {!isProf && r.g.courseLabels?.filter((label) => label !== '1L').map((label) => (
                        <span key={`label-${label}`} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">{label}</span>
                      ))}
                      {isProf && <span className="xl:hidden num">· {r.offerings} times taught</span>}
                      <span className={isProf ? 'xl:hidden num' : 'md:hidden num'}>· {fmtInt(r.m.responses)} reviews</span>
                      <SmallSample responses={r.m.responses} />
                    </span>
                    <span className={`mt-1 block min-w-0 text-xs leading-5 text-muted-foreground ${isProf ? 'xl:hidden' : 'lg:hidden'}`}>
                       <span className={`block text-[10px] font-medium ${isProf ? 'uppercase tracking-wide' : 'normal-case tracking-normal'}`}>
                         {isProf ? 'Recent courses' : 'Recent Professors'}
                      </span>
                      {renderRecentEntries(true)}
                    </span>
                  </span>
                  <span className={`hidden min-w-0 text-xs leading-5 text-muted-foreground ${isProf ? 'xl:block' : 'lg:block'}`}>
                    {renderRecentEntries(false)}
                  </span>
                  {isProf && (
                    <span className="hidden xl:flex justify-center">
                      <EffectivenessGradePill
                        grade={professorGradeBySlug.get(r.g.slug) ?? '—'}
                        testId={`grade-professor-${r.g.slug}`}
                      />
                    </span>
                  )}
                  {!isProf && <span className="hidden md:block text-center num text-sm">{r.offerings}</span>}
                  {!isProf && <span className="hidden md:block text-center num text-sm">{fmtInt(r.m.responses)}</span>}
                  <div className={`${isProf ? 'xl:justify-self-end' : 'col-span-2 col-start-2 min-w-0 md:col-span-1 md:col-start-auto'}${!isProf && recentSemestersExpanded ? ' self-start mt-2' : ''}`}>
                    {isProf
                      ? <RatingBar rating={r.m.avg} label={`${r.g.label} overall teaching rating`} compact testId={`rating-professor-${r.g.slug}`} />
                      : <CourseProfessorPreview
                        course={r.g}
                        dataset={ds}
                        onNavigate={saveDirectorySnapshot}
                        expanded={recentSemestersExpanded}
                        onToggleExpanded={toggleCourseExpansion}
                      />}
                  </div>
                  {isProf && <span className="hidden xl:block text-right num text-sm">{r.offerings}</span>}
                  {isProf && <span className="hidden xl:block text-right num text-sm">{fmtInt(r.m.responses)}</span>}
                  <ArrowUpRight className={isProf ? 'hidden xl:block h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition' : 'hidden md:block h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition'} />
                </>
              );
              if (isProf) {
                return (
                  <Link
                    key={r.g.slug}
                    href={`/professors/${r.g.slug}`}
                    state={{ courseInsightsFromProfessorDirectory: true }}
                    data-testid={`row-professors-${r.g.slug}`}
                    className={rowClass}
                    onClick={saveDirectorySnapshot}
                  >
                    {renderCells()}
                  </Link>
                );
              }
              return (
                <div
                  key={r.g.slug}
                  data-testid={`row-courses-${r.g.slug}`}
                  className="border-b last:border-0"
                >
                  <div className={rowClass}>{renderCells()}</div>
                </div>
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
