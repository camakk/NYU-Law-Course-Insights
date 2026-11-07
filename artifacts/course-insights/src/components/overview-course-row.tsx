import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ChevronDown } from 'lucide-react';
import { fmtInt, PROF_OVERALL, rankBy, type Dataset, type EvalRecord, type Group } from '@/lib/data';
import { SmallSample, RatingBar, Score } from '@/components/kit';

const MIN_PROFESSOR_COURSE_REVIEWS = 20;

export function OverviewCourseRow({ course, dataset, rank, testIdPrefix }: {
  course: Group;
  dataset: Dataset;
  rank: number;
  testIdPrefix: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `top-course-professors-${course.slug}`;
  const topProfessors = useMemo(() => {
    if (!expanded) return [];
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
      .filter((row) => row.metric.avg !== null && row.metric.responses >= MIN_PROFESSOR_COURSE_REVIEWS)
      .slice(0, 3);
  }, [course, dataset, expanded]);
  const courseLabels = course.courseLabels ?? [];
  const nonLlmLabels = courseLabels.filter((label) => label !== 'LLM');

  return (
    <li className="border-t" data-testid={`overview-course-${course.slug}`}>
      <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-secondary/60 transition-colors">
        <span className="num w-5 shrink-0 text-right text-xs text-muted-foreground">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/courses/${course.slug}`}
              className="min-w-0 truncate font-medium hover:text-primary hover:underline underline-offset-4"
              title={course.label}
              data-testid={`link-course-${testIdPrefix}${course.slug}`}
            >
              {course.label}
            </Link>
            {courseLabels.includes('LLM') && (
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">LLM</span>
            )}
          </div>
          {nonLlmLabels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {nonLlmLabels.map((label) => (
                <span key={label} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">{label}</span>
              ))}
            </div>
          )}
          <p className="num text-xs text-muted-foreground" data-testid={`text-${testIdPrefix}course-reviews-${course.slug}`}>
            {fmtInt(course.totalResponded)} student reviews
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="num text-muted-foreground">
              {course.records.length} offerings · {new Set(course.records.map((record) => record.professor)).size} instructors
            </span>
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
          </div>
        </div>
        <Score v={course.metrics[5].avg} size="sm" />
      </div>
      <div
        id={panelId}
        hidden={!expanded}
        className="mx-5 mb-3 rounded-lg bg-secondary/40 px-3 py-2.5"
        data-testid={`panel-top-professors-${course.slug}`}
      >
        <h3 className="text-xs font-semibold">Top professors for this course</h3>
        {topProfessors.length > 0 ? (
          <ol className="mt-2 divide-y divide-border/70">
            {topProfessors.map(({ group, metric }, index) => (
              <li key={group.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" data-testid={`course-top-professor-${course.slug}-${group.slug}`}>
                <span className="num w-3 text-xs text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/professors/${group.slug}`} className="text-sm font-medium hover:text-primary hover:underline" data-testid={`link-course-top-professor-${course.slug}-${group.slug}`}>
                    {group.label}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="num">{fmtInt(metric.responses)} reviews · {metric.offerings} {metric.offerings === 1 ? 'time' : 'times'} taught</span>
                    <SmallSample responses={metric.responses} />
                  </div>
                </div>
                <div className="ml-auto">
                  <RatingBar rating={metric.avg} compact label={`${group.label} overall teaching rating for ${course.label}`} testId={`rating-course-professor-${course.slug}-${group.slug}`} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No professors have teaching ratings with at least {MIN_PROFESSOR_COURSE_REVIEWS} reviews for this course.</p>
        )}
      </div>
    </li>
  );
}
