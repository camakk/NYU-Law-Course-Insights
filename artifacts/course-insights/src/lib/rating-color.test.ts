import { describe, expect, it } from 'vitest';
import { ratingBarColor } from './rating-color';

describe('ratingBarColor', () => {
  it('uses the specified red, yellow, and green anchor scores', () => {
    expect(ratingBarColor(2.5)).toBe('#ef4444');
    expect(ratingBarColor(3)).toBe('#ef4444');
    expect(ratingBarColor(4)).toBe('#eab308');
    expect(ratingBarColor(4.8)).toBe('#22c55e');
    expect(ratingBarColor(5)).toBe('#22c55e');
  });

  it('blends halfway between green and yellow at 4.4', () => {
    expect(ratingBarColor(4.4)).toBe('#86bc33');
  });
});
