import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SmallSample } from './kit';

describe('Small Sample badge', () => {
  it.each([1, 5, 9, 10, 15, 19])('labels a rating supported by %i reviews', (responses) => {
    render(<SmallSample responses={responses} />);
    expect(screen.getByText('Small Sample')).toBeTruthy();
    expect(screen.getByTitle('Fewer than 20 student reviews')).toBeTruthy();
  });

  it.each([20, 21, 100])('does not label a rating supported by %i reviews', (responses) => {
    render(<SmallSample responses={responses} />);
    expect(screen.queryByText('Small Sample')).toBeNull();
  });

  it('preserves the no-rating state when there are no reviews', () => {
    render(<SmallSample responses={0} />);
    expect(screen.queryByText('Small Sample')).toBeNull();
  });
});
