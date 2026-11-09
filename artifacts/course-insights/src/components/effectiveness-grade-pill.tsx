import type { ProfessorLetterGrade } from '@/lib/data';

export const EFFECTIVENESS_GRADE_PILL_STYLES: Record<ProfessorLetterGrade, string> = {
  'A+': 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  A: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  'A-': 'border-lime-300 bg-gradient-to-r from-lime-100 to-yellow-100 text-lime-800 dark:border-lime-700 dark:from-lime-900/60 dark:to-yellow-900/50 dark:text-lime-200',
  'B+': 'border-lime-300 bg-gradient-to-r from-lime-100 via-yellow-100 to-yellow-200 text-amber-800 dark:border-lime-700 dark:from-lime-900/50 dark:via-yellow-900/50 dark:to-yellow-900/60 dark:text-yellow-200',
  B: 'border-yellow-300 bg-yellow-100 text-amber-800 dark:border-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-200',
  'B-': 'border-orange-300 bg-gradient-to-r from-yellow-100 to-red-200 text-red-800 dark:border-orange-700 dark:from-yellow-900/50 dark:to-red-900/60 dark:text-orange-200',
};

export function EffectivenessGradePill({
  grade,
  size = 'small',
  testId,
  className = '',
}: {
  grade: string;
  size?: 'small' | 'large';
  testId?: string;
  className?: string;
}) {
  const sizeClass = size === 'large'
    ? 'min-h-14 px-6 text-4xl font-bold leading-none shadow-sm'
    : 'min-h-7 min-w-10 px-2 text-sm font-bold leading-none shadow-sm';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border num ${sizeClass} ${
        EFFECTIVENESS_GRADE_PILL_STYLES[grade as ProfessorLetterGrade] ?? 'border-primary/10 bg-primary/10 text-primary'
      } ${className}`}
      data-testid={testId}
    >
      {grade}
    </span>
  );
}
