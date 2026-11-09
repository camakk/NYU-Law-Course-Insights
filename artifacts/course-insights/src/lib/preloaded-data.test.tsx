import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import bundledEvaluations from 'virtual:course-evaluations';
import { useDataset } from './data';

afterEach(() => vi.unstubAllGlobals());

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('preloaded evaluation data', () => {
  it('provides the complete dataset immediately without a network request', () => {
    const fetch = vi.fn(() => { throw new Error('Network access is not allowed'); });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useDataset, { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.records.length).toBe(bundledEvaluations.records.length);
    expect(result.current.data?.records.length).toBeGreaterThan(7000);
    expect(result.current.data?.sourceNotes).toEqual(bundledEvaluations.sourceNotes);
    expect(result.current.data?.questions).toEqual(bundledEvaluations.questions);
    expect(result.current.data?.courses.length).toBeGreaterThan(1000);
    expect(result.current.data?.professors.length).toBeGreaterThan(1000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reuses the same dataset across mounts and manual refreshes while offline', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('Offline')));
    vi.stubGlobal('fetch', fetch);
    const first = renderHook(useDataset, { wrapper });
    const original = first.result.current.data;
    first.unmount();
    const second = renderHook(useDataset, { wrapper });
    expect(second.result.current.data).toBe(original);
    await act(async () => { await second.result.current.refetch(); });
    expect(second.result.current.data).toBe(original);
    expect(second.result.current.isError).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
