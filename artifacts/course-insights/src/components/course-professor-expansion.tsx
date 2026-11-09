import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'wouter';
import { bySemesterDesc, fmtInt, PROF_OVERALL, rankBy, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { RatingBar, SmallSample } from '@/components/kit';

export const MIN_PROFESSOR_COURSE_REVIEWS = 20;

export function getMostRecentProfessorCourseSemester(course: Group, professorName: string) {
  return course.records
    .filter((record) => record.professor === professorName)
    .map((record) => record.semester)
    .filter(Boolean)
    .sort(bySemesterDesc)[0] || 'Semester unavailable';
}

export function getTopCourseProfessors(course: Group, dataset: Dataset) {
  const byProfessor = new Map<string, EvalRecord[]>();
  for (const record of course.records) {
    const records = byProfessor.get(record.professor) ?? [];
    records.push(record);
    byProfessor.set(record.professor, records);
  }
  return rankBy([...byProfessor.entries()].map(([name, records]) => ({
    group: dataset.profBySlug.get(dataset.profSlugByName.get(name)!)!,
    records,
  })), PROF_OVERALL)
    .filter((row) => row.metric.avg !== null && row.metric.responses >= MIN_PROFESSOR_COURSE_REVIEWS);
}

type TopCourseProfessor = ReturnType<typeof getTopCourseProfessors>[number];

function CourseTopProfessorsList({ course, professors, includeMostRecent = false, formatSemester }: {
  course: Group;
  professors: TopCourseProfessor[];
  includeMostRecent?: boolean;
  formatSemester?: (semester: string) => string;
}) {
  return (
    <>
      <h3 className="text-xs font-semibold">Professors for this course</h3>
      {professors.length > 0 ? (
        <ol className="mt-2 divide-y divide-border/70">
          {professors.map(({ group, metric }, index) => {
            const mostRecentSemester = getMostRecentProfessorCourseSemester(course, group.name);
            return (
            <li key={group.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" data-testid={`course-top-professor-${course.slug}-${group.slug}`}>
              <span className="num w-3 text-xs text-muted-foreground">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/professors/${group.slug}`} className="text-sm font-medium hover:text-primary hover:underline" data-testid={`link-course-top-professor-${course.slug}-${group.slug}`}>
                  {group.label}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="num">
                    {fmtInt(metric.responses)} reviews · {metric.offerings} {metric.offerings === 1 ? 'time' : 'times'} taught
                    {includeMostRecent && <> · Most recently: {formatSemester?.(mostRecentSemester) ?? mostRecentSemester}</>}
                  </span>
                  <SmallSample responses={metric.responses} />
                </div>
              </div>
              <div className="ml-auto">
                <RatingBar rating={metric.avg} compact label={`${group.label} overall teaching rating for ${course.label}`} testId={`rating-course-professor-${course.slug}-${group.slug}`} />
              </div>
            </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No professors have teaching ratings with at least {MIN_PROFESSOR_COURSE_REVIEWS} reviews for this course.</p>
      )}
    </>
  );
}

export function CourseProfessorExpansion({ course, dataset, children, includeMostRecent = false, formatSemester, initialExpanded = false }: {
  course: Group;
  dataset: Dataset;
  children: (parts: { button: ReactNode; panel: ReactNode }) => ReactNode;
  includeMostRecent?: boolean;
  formatSemester?: (semester: string) => string;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const professors = useMemo(
    () => expanded ? getTopCourseProfessors(course, dataset) : [],
    [course, dataset, expanded],
  );
  const panelId = `top-course-professors-${course.slug}`;
  const button = (
    <button
      type="button"
      onClick={() => setExpanded((open) => !open)}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} top professors for ${course.label}`}
      className="inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      data-testid={`button-expand-course-${course.slug}`}
    >
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
      {expanded ? 'Collapse' : 'Expand'}
    </button>
  );
  const panel = (
    <div
      id={panelId}
      hidden={!expanded}
      className="ml-8 mt-3 rounded-lg bg-secondary/40 px-3 py-2.5"
      data-testid={`panel-top-professors-${course.slug}`}
    >
      <CourseTopProfessorsList
        course={course}
        professors={professors}
        includeMostRecent={includeMostRecent}
        formatSemester={formatSemester}
      />
    </div>
  );

  return <>{children({ button, panel })}</>;
}
