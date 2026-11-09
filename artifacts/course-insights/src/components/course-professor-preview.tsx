import { useMemo } from 'react';
import { Link } from 'wouter';
import type { Dataset, Group } from '@/lib/data';
import { RatingBar } from '@/components/kit';
import {
  getMostRecentProfessorCourseSemester,
  getTopCourseProfessors,
  MIN_PROFESSOR_COURSE_REVIEWS,
} from './course-professor-expansion';

export function CourseProfessorPreview({ course, dataset, onNavigate, expanded, onToggleExpanded }: {
  course: Group;
  dataset: Dataset;
  onNavigate: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const allProfessors = useMemo(
    () => getTopCourseProfessors(course, dataset),
    [course, dataset],
  );
  const professors = expanded ? allProfessors : allProfessors.slice(0, 3);

  return (
    <div className="w-full min-w-0" data-testid={`course-professor-preview-${course.slug}`}>
      {professors.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No professors with teaching ratings and {MIN_PROFESSOR_COURSE_REVIEWS}+ reviews for this course.
        </p>
      ) : (
        <div className="space-y-2.5">
          {professors.map(({ group, metric }, index) => {
            const mostRecentSemester = getMostRecentProfessorCourseSemester(course, group.name);
            const professorLabel = `${index + 1}. ${group.label} • ${mostRecentSemester}`;
            return (
              <div key={group.slug} className="flex items-center justify-between gap-2" data-testid={`preview-professor-${course.slug}-${group.slug}`}>
                <Link
                  href={`/professors/${group.slug}`}
                  onClick={onNavigate}
                  className="min-w-0 flex-1 truncate text-xs font-medium hover:text-primary hover:underline"
                  title={professorLabel}
                >
                  {index + 1}. {group.label}{' '}
                  <span
                    className="text-[10px] font-normal text-muted-foreground"
                    data-testid={`preview-semester-${course.slug}-${group.slug}`}
                  >
                    • {mostRecentSemester}
                  </span>
                </Link>
                <RatingBar
                  rating={metric.avg}
                  compact
                  condensed
                  label={`${group.label} overall teaching rating for ${course.label}`}
                  testId={`preview-rating-${course.slug}-${group.slug}`}
                />
              </div>
            );
          })}
        </div>
      )}
      {allProfessors.length > 3 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} all top professors for ${course.label}`}
          className="mt-0.5 inline-flex cursor-pointer items-center rounded-sm font-sans text-[10px] font-normal text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          data-testid={`button-toggle-course-top-professors-${course.slug}`}
        >
          {expanded ? 'Collapse' : '[...]'}
        </button>
      )}
    </div>
  );
}
