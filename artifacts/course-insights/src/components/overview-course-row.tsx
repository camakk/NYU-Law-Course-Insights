import { Link } from 'wouter';
import { fmtInt, type Dataset, type Group } from '@/lib/data';
import { SmallSample, RatingBar, Score } from '@/components/kit';
import { CourseProfessorExpansion } from './course-professor-expansion';

export function OverviewCourseRow({ course, dataset, rank, testIdPrefix }: {
  course: Group;
  dataset: Dataset;
  rank: number;
  testIdPrefix: string;
}) {
  const courseLabels = course.courseLabels ?? [];
  const nonLlmLabels = courseLabels.filter((label) => label !== 'LLM');

  return (
    <CourseProfessorExpansion course={course} dataset={dataset}>
      {({ button, panel }) => (
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
                {button}
              </div>
            </div>
            <Score v={course.metrics[5].avg} size="sm" />
          </div>
          {panel}
        </li>
      )}
    </CourseProfessorExpansion>
  );
}
