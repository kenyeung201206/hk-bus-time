import { describe, expect, it } from 'vitest';
import { nextAnnouncement, reminderMarks } from './schedule';
import { zhNumber } from './voice';

describe('reminder marks', () => {
  it('counts down by the step and always ends at 1', () => {
    expect(reminderMarks(10, 3)).toEqual([10, 7, 4, 1]);
    expect(reminderMarks(15, 5)).toEqual([15, 10, 5, 1]);
    expect(reminderMarks(6, 2)).toEqual([6, 4, 2, 1]);
    expect(reminderMarks(3, 1)).toEqual([3, 2, 1]);
    expect(reminderMarks(1, 3)).toEqual([1]);
  });
  it('has no upper limit', () => {
    expect(reminderMarks(45, 5)[0]).toBe(45);
  });
});

describe('announcements', () => {
  it('speaks at each mark once', () => {
    let pending = [10, 7, 4, 1];
    const said: number[] = [];
    for (const m of [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) {
      const r = nextAnnouncement(pending, m);
      if (r.speak !== null) said.push(r.speak);
      pending = r.pending;
    }
    expect(said).toEqual([10, 7, 4, 1]);
    expect(pending).toEqual([]);
  });
  it('says the real minutes once when it is armed late or skips marks', () => {
    const r = nextAnnouncement([10, 7, 4, 1], 6);
    expect(r).toEqual({ speak: 6, pending: [4, 1] });
  });
  it('says 1 minute when the bus is already arriving', () => {
    expect(nextAnnouncement([1], 0)).toEqual({ speak: 1, pending: [] });
  });
});

describe('Cantonese numbers', () => {
  it('reads minutes naturally', () => {
    expect([1, 2, 10, 12, 20, 25, 37, 60].map(zhNumber)).toEqual(['一', '兩', '十', '十二', '二十', '廿五', '三十七', '六十']);
  });
});

import { busPhase, secondsUntil } from '../utils/time';

describe('bus phase', () => {
  it('tells arriving from arrived from departed', () => {
    expect(busPhase(150)).toBe('minutes');
    expect(busPhase(59)).toBe('arriving');
    expect(busPhase(1)).toBe('arriving');
    expect(busPhase(0)).toBe('arrived');
    expect(busPhase(-60)).toBe('arrived');
    expect(busPhase(-120)).toBe('gone');
  });
  it('counts seconds against the live clock, not the refresh time', () => {
    const fetched = Date.parse('2026-01-01T10:00:00+08:00');
    const eta = new Date(fetched + 90_000);
    const ts = new Date(fetched);
    expect(secondsUntil(eta, ts, fetched, fetched)).toBe(90);
    expect(secondsUntil(eta, ts, fetched, fetched + 31_000)).toBe(59); // flips to 就嚟到站 at once
    expect(secondsUntil(eta, ts, fetched, fetched + 90_000)).toBe(0); // 已經到站
  });
});
