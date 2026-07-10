// @vitest-environment jsdom
/**
 * tests/usePlaythrough.test.tsx — Sprint-1 Task 2. Playback is presentation
 * only: the hook consumes a beat COUNT, never beat content. Fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePlaythrough } from '../src/app/usePlaythrough';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePlaythrough', () => {
  it('reveals one beat per 900ms at 1x, then the scoreline after the last beat', () => {
    const { result } = renderHook(() => usePlaythrough(3));
    expect(result.current.visibleBeatCount).toBe(0);
    expect(result.current.showScoreline).toBe(false);

    act(() => vi.advanceTimersByTime(900));
    expect(result.current.visibleBeatCount).toBe(1);

    act(() => vi.advanceTimersByTime(900));
    expect(result.current.visibleBeatCount).toBe(2);

    act(() => vi.advanceTimersByTime(900));
    expect(result.current.visibleBeatCount).toBe(3);
    expect(result.current.showScoreline).toBe(false);

    act(() => vi.advanceTimersByTime(900));
    expect(result.current.visibleBeatCount).toBe(3);
    expect(result.current.showScoreline).toBe(true);
  });

  it('at 4x, reveals a beat every 225ms', () => {
    const { result } = renderHook(() => usePlaythrough(2));
    act(() => result.current.setSpeed(4));
    act(() => vi.advanceTimersByTime(225));
    expect(result.current.visibleBeatCount).toBe(1);
    act(() => vi.advanceTimersByTime(225));
    expect(result.current.visibleBeatCount).toBe(2);
  });

  it('skipToResult jumps straight to the scoreline and no further timers fire', () => {
    const { result } = renderHook(() => usePlaythrough(5));
    act(() => result.current.skipToResult());
    expect(result.current.showScoreline).toBe(true);
    expect(result.current.visibleBeatCount).toBe(5);

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.showScoreline).toBe(true);
    expect(result.current.visibleBeatCount).toBe(5);
  });

  it('handles totalBeats = 0 by going straight to the scoreline after one tick', () => {
    const { result } = renderHook(() => usePlaythrough(0));
    act(() => vi.advanceTimersByTime(900));
    expect(result.current.showScoreline).toBe(true);
  });
});
