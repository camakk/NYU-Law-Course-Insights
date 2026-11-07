import { useQuery } from '@tanstack/react-query';
import { buildProfessorNameAliases } from '@workspace/professor-identity';

export interface EvalRecord {
  id: number;
  course: string;
  courseCategories: CourseCategory[];
  courseLabels: CourseLabel[];
  is1LCourse: boolean;
  professor: string;
  semester: string;
  enrolled: number | null;
  responded: number | null;
  scores: Array<number | null>;
  inaccessible: boolean;
}

export interface RawData {
  questions: string[];
  records: Array<Omit<EvalRecord, 'courseCategories' | 'courseLabels' | 'is1LCourse'>>;
  sourceNotes: string[];
}

export interface Metric {
  avg: number | null; // response-weighted
  responses: number; // offering-level responded, summed over offerings contributing
  offerings: number; // offerings contributing
}

export interface Group {
  slug: string;
  name: string; // raw identity
  label: string; // display
  courseCategories: CourseCategory[] | null;
  courseLabels: CourseLabel[] | null;
  records: EvalRecord[];
  metrics: Metric[]; // 10
  semesters: string[];
  totalResponded: number; // offering-level responded across all usable offerings
}

export interface Dataset {
  questions: string[];
  sourceNotes: string[];
  records: EvalRecord[];
  professors: Group[];
  courses: Group[];
  profBySlug: Map<string, Group>;
  courseBySlug: Map<string, Group>;
  profSlugByName: Map<string, string>;
  courseSlugByName: Map<string, string>;
  semesters: string[]; // newest first
}

export const COURSE_CATEGORIES = ['Course', 'Seminar', 'Clinic', 'Colloquium', 'Externship'] as const;
export type CourseCategory = typeof COURSE_CATEGORIES[number];
export type CourseLabel = '1L' | 'LLM';

const FIRST_YEAR_COURSE_NAMES = new Set([
  'Procedure',
  'Torts',
  'Legislation and the Regulatory State',
  'Criminal Law',
  'Lawyering',
  'Contracts',
]);

export function classifyCourseLabels(course: string): CourseLabel[] {
  const title = course
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '');
  const labels: CourseLabel[] = [];
  if (/\bfor\s+1ls\b/.test(title)) labels.push('1L');
  if (/\bllms?\b/.test(title)) labels.push('LLM');
  return labels;
}

export function is1LCourse(course: string): boolean {
  const labels = classifyCourseLabels(course);
  if (labels.includes('1L')) return true;
  if (labels.includes('LLM')) return false;
  return FIRST_YEAR_COURSE_NAMES.has(course);
}

export function classifyCourse(course: string): CourseCategory[] {
  const title = course.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\blederman fellows workshop\b/.test(title)) return ['Seminar'];
  if (/\bclinic\s+seminar\b/.test(title)) return ['Clinic', 'Seminar'];
  if (/\bexternships?\b/.test(title)) return ['Externship'];
  if (/\bclinics?\b|\bclinical\b/.test(title)) return ['Clinic'];
  if (/\bcolloquium\b|\bcolloquia\b/.test(title)) return ['Colloquium'];
  if (/\bseminars?\b/.test(title)) return ['Seminar'];
  return ['Course'];
}

export const TEACHING = [0, 1, 2, 3, 4, 5];
export const COURSE_Q = [6, 7, 8, 9];
export const PROF_OVERALL = 5;
export const COURSE_OVERALL = 8;
export const LOW_SAMPLE = 15;

export function friendlyName(raw: string): string {
  const t = raw.trim();
  const parts = t.split(',');
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return t;
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'item'
  );
}

const SEASON: Record<string, number> = { winter: 0, january: 0, jan: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };
export function semesterKey(s: string): number {
  const y = s.match(/(\d{4})/);
  const year = y ? Number(y[1]) : 0;
  const lower = s.toLowerCase();
  let season = 1.5;
  for (const k of Object.keys(SEASON)) if (lower.includes(k)) { season = SEASON[k]; break; }
  return year * 10 + season;
}
export const bySemesterDesc = (a: string, b: string) => semesterKey(b) - semesterKey(a) || a.localeCompare(b);

export function usable(r: EvalRecord, q: number): boolean {
  const s = r.scores?.[q];
  return !r.inaccessible && s != null && Number.isFinite(s) && r.responded != null && r.responded > 0;
}

export function aggregate(records: EvalRecord[], q: number): Metric {
  let w = 0, sum = 0, n = 0;
  for (const r of records) {
    if (!usable(r, q)) continue;
    w += r.responded!;
    sum += (r.scores[q] as number) * r.responded!;
    n++;
  }
  return { avg: w > 0 ? sum / w : null, responses: w, offerings: n };
}

function buildGroups(records: EvalRecord[], key: 'professor' | 'course') {
  const map = new Map<string, EvalRecord[]>();
  for (const r of records) {
    const k = (r[key] ?? '').trim();
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const names = [...map.keys()].sort((a, b) => a.localeCompare(b));
  const used = new Map<string, number>();
  const groups: Group[] = [];
  for (const name of names) {
    const label = key === 'professor' ? friendlyName(name) : name;
    const base = slugify(label);
    const c = (used.get(base) ?? 0) + 1;
    used.set(base, c);
    const slug = c === 1 ? base : `${base}-${c}`;
    const recs = map.get(name)!.slice().sort((a, b) => bySemesterDesc(a.semester, b.semester) || a.id - b.id);
    const metrics = Array.from({ length: 10 }, (_, q) => aggregate(recs, q));
    const semesters = [...new Set(recs.map((r) => r.semester))].sort(bySemesterDesc);
    const totalResponded = recs.reduce((s, r) => s + (!r.inaccessible && r.responded ? r.responded : 0), 0);
    groups.push({
      slug,
      name,
      label,
      courseCategories: key === 'course' ? recs[0]?.courseCategories ?? classifyCourse(name) : null,
      courseLabels: key === 'course' ? recs[0]?.courseLabels ?? classifyCourseLabels(name) : null,
      records: recs,
      metrics,
      semesters,
      totalResponded,
    });
  }
  return groups;
}

export function buildDataset(raw: RawData): Dataset {
  const professorNames = buildProfessorNameAliases(
    (raw.records ?? []).map((record) => record.professor),
  );
  const records = (raw.records ?? [])
    .filter((r) => r && r.course && r.professor)
    .map((record) => ({
      ...record,
      professor: professorNames.canonicalByName.get(record.professor) ?? record.professor,
      courseCategories: classifyCourse(record.course),
      courseLabels: classifyCourseLabels(record.course),
      is1LCourse: is1LCourse(record.course),
    }));
  const professors = buildGroups(records, 'professor');
  const courses = buildGroups(records, 'course');
  const professorSlugByCanonicalName = new Map(professors.map((group) => [group.name, group.slug]));
  const profSlugByName = new Map<string, string>();
  for (const [name, canonical] of professorNames.canonicalByName) {
    const slug = professorSlugByCanonicalName.get(canonical);
    if (slug) profSlugByName.set(name, slug);
  }
  return {
    questions: raw.questions ?? [],
    sourceNotes: raw.sourceNotes ?? [],
    records,
    professors,
    courses,
    profBySlug: new Map(professors.map((g) => [g.slug, g])),
    courseBySlug: new Map(courses.map((g) => [g.slug, g])),
    profSlugByName,
    courseSlugByName: new Map(courses.map((g) => [g.name, g.slug])),
    semesters: [...new Set(records.map((r) => r.semester).filter(Boolean))].sort(bySemesterDesc),
  };
}

export function useDataset() {
  return useQuery({
    queryKey: ['evaluations'],
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(import.meta.env.BASE_URL + 'data/evaluations.json', { credentials: 'include' });
      if (!res.ok) throw new Error(`Could not load evaluations (HTTP ${res.status})`);
      const json = (await res.json()) as RawData;
      if (!json || !Array.isArray(json.records)) throw new Error('Evaluation file is malformed.');
      return buildDataset(json);
    },
  });
}

export const fmt = (v: number | null | undefined, d = 2) => (v == null ? 'N/A' : v.toFixed(d));
export const fmtInt = (n: number) => n.toLocaleString('en-US');

export function shortQ(q: string, i: number) {
  const t = (q || `Question ${i + 1}`).replace(/^\s*\d+[.)]\s*/, '');
  return t.length > 64 ? t.slice(0, 61) + '...' : t;
}

export function scoreTone(v: number | null): string {
  if (v == null) return 'tone-na';
  if (v >= 4.6) return 'tone-5';
  if (v >= 4.2) return 'tone-4';
  if (v >= 3.7) return 'tone-3';
  if (v >= 3.0) return 'tone-2';
  return 'tone-1';
}

export interface Ranked {
  group: Group;
  metric: Metric;
  rank: number | null;
}

/** Rank groups by a metric over (optionally filtered) records. Unrated go last with rank null. */
export function rankBy(groups: { group: Group; records: EvalRecord[] }[], q: number): Ranked[] {
  const rows = groups.map(({ group, records }) => ({ group, metric: aggregate(records, q), rank: null as number | null }));
  rows.sort((a, b) => {
    if (a.metric.avg == null && b.metric.avg == null) return a.group.label.localeCompare(b.group.label);
    if (a.metric.avg == null) return 1;
    if (b.metric.avg == null) return -1;
    return b.metric.avg - a.metric.avg || b.metric.responses - a.metric.responses;
  });
  let rank = 0;
  for (const r of rows) if (r.metric.avg != null) r.rank = ++rank;
  return rows;
}
