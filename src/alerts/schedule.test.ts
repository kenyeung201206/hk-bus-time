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
