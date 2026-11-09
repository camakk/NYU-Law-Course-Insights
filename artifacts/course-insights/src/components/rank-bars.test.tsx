import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RankBars } from './kit';

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    Bar: Container,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Cell: ({ fill }: { fill: string }) => <span data-testid="rating-bar-cell" data-fill={fill} />,
  };
});

describe('instructor comparison bar colors', () => {
  it.each([50, 5])('uses the shared blended score palette even with %s reviews', (responses) => {
    const values = [5, 4.8, 4.4, 4, 3.5, 3, 2.5];
    render(<RankBars
      data={values.map((value, index) => ({ name: `Professor ${index}`, value, responses, offerings: 1 }))}
      metricLabel="Teaching effectiveness"
    />);
    expect(screen.getAllByTestId('rating-bar-cell').map((cell) => cell.getAttribute('data-fill'))).toEqual([
      '#22c55e', '#22c55e', '#86bc33', '#eab308', '#ed7c26', '#ef4444', '#ef4444',
    ]);
  });
});
