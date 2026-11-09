import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

afterEach(() => vi.useRealTimers());

describe('tooltip hover timing', () => {
  it.each([
    [undefined, 100],
    [0, 0],
    [250, 250],
  ])('opens after %s ms configuration with a fast default', (delayDuration, expectedDelay) => {
    vi.useFakeTimers();
    render(
      <TooltipProvider delayDuration={delayDuration}>
        <Tooltip>
          <TooltipTrigger>Information</TooltipTrigger>
          <TooltipContent>Tooltip explanation</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Information' }), {
      pointerType: 'mouse', clientX: 0, clientY: 0,
    });
    if (expectedDelay > 0) {
      act(() => vi.advanceTimersByTime(expectedDelay - 1));
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => vi.advanceTimersByTime(1));
    } else {
      act(() => vi.advanceTimersByTime(0));
    }
    expect(screen.getByRole('tooltip').textContent).toBe('Tooltip explanation');
  });
});
