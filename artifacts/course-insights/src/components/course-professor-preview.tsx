import { useMemo } from 'react';
import { Link } from 'wouter';
import type { Dataset, Group } from '@/lib/data';
import { RatingBar } from '@/components/kit';
import {
  getMostRecentProfessorCourseSemester,
  getTopCourseProfessors,
  MIN_PROFESSOR_COURSE_REVIEWS,
} from './course-professor-expansion';

export function CourseProfessorPreview({ course, dataset, onNavigate }: {
  course: Group;
  dataset: Dataset;
  onNavigate: () => void;
}) {
  const professors = useMemo(
    () => getTopCourseProfessors(course, dataset).slice(0, 3),
    [course, dataset],
  );

  return (
    <div className="w-full min-w-0 space-y-2.5" data-testid={`course-professor-preview-${course.slug}`}>
      {professors.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No professors with teaching ratings and {MIN_PROFESSOR_COURSE_REVIEWS}+ reviews for this course.
        </p>
      ) : professors.map(({ group, metric }, index) => {
        const mostRecentSemester = getMostRecentProfessorCourseSemester(course, group.name);
        const professorLabel = `${index + 1}. ${group.label} • ${mostRecentSemester}`;
        return (
        <div key={group.slug} className="flex items-center justify-start gap-1" data-testid={`preview-professor-${course.slug}-${group.slug}`}>
          <Link
            href={`/professors/${group.slug}`}
            onClick={onNavigate}
            className="min-w-0 max-w-[70%] truncate text-xs font-medium hover:text-primary hover:underline"
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
  );
}
