import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BusIndex, cleanName } from './busIndex';
import { findDirect, candidatesByName, candidatesNear, planTrip } from './tripFinder';
import { minutesUntil } from '../utils/time';
import type { BusData } from '../types';

// Small synthetic network:
// KMB 1  O: A → B → C → D        I: D → C → B → A
// CTB 1  O: X(旺角) → Y → Z(銅鑼灣)
// KMB 9  O (circular): A → B → A2 → B
const data: BusData = {
  version: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  routes: [
    ['KMB', '1', 'O', 1, '甲', '丁', 'A', 'D', '甲', '丁'],
    ['KMB', '1', 'I', 1, '丁', '甲', 'D', 'A', '丁', '甲'],
    ['KMB', '1', 'O', 2, '甲', '丙', 'A', 'C', '甲', '丙'],
    ['KMB', '101', 'O', 1, '甲', '丁', 'A', 'D', '甲', '丁'],
    ['KMB', '9', 'O', 1, '甲', '甲', 'A', 'A', '甲', '甲'],
    ['CTB', '1', 'O', 1, '旺角', '銅鑼灣', 'MK', 'CWB', '旺角', '铜锣湾'],
  ],
  stops: {
    'KMB-A': ['旺角警署 (MK123)', 'MONG KOK POLICE STATION', '旺角警署', 22.32, 114.17],
    'KMB-B': ['乙站', 'B STOP', '乙站', 22.3205, 114.1705],
    'KMB-C': ['丙站', 'C STOP', '丙站', 22.33, 114.18],
    'KMB-D': ['銅鑼灣道', 'CAUSEWAY BAY ROAD', '铜锣湾道', 22.28, 114.18],
    'KMB-A2': ['甲二站', 'A2', '甲二站', 22.34, 114.19],
    'CTB-X': ['旺角東站', 'MONG KOK EAST', '旺角东站', 22.3201, 114.1701],
    'CTB-Y': ['紅磡', 'HUNG HOM', '红磡', 22.30, 114.18],
    'CTB-Z': ['銅鑼灣', 'CAUSEWAY BAY', '铜锣湾', 22.28, 114.185],
  },
  routeStops: {
    'KMB-1-O-1': ['A', 'B', 'C', 'D'],
    'KMB-1-I-1': ['D', 'C', 'B', 'A'],
    'KMB-1-O-2': ['A', 'B', 'C'],
    'KMB-101-O-1': ['A', 'D'],
    'KMB-9-O-1': ['A', 'B', 'A2', 'B'],
    'CTB-1-O-1': ['X', 'Y', 'Z'],
  },
};
const idx = new BusIndex(data);

describe('search', () => {
  it('prefix-matches route numbers and lists both companies separately', () => {
    const r = idx.searchRoutes('1');
    expect(r.map((g) => `${g.co}${g.route}`)).toEqual(['CTB1', 'KMB1', 'KMB101']);
    expect(r.find((g) => g.co === 'KMB' && g.route === '1')!.main.map((x) => x.serviceType)).toEqual([1, 1]);
  });
  it('is case-insensitive', () => {
    expect(idx.searchRoutes('101')[0].route).toBe('101');
  });
  it('matches stop names in Traditional, Simplified and English', () => {
    expect(idx.stopsMatching('銅鑼灣').map((s) => s.key).sort()).toEqual(['CTB-Z', 'KMB-D']);
    expect(idx.stopsMatching('铜锣湾').length).toBe(2);
    expect(idx.stopsMatching('causeway').length).toBe(2);
  });
  it('strips KMB stop codes from names', () => {
    expect(cleanName('旺角警署 (MK123)')).toBe('旺角警署');
    expect(idx.stops.get('KMB-A')!.nameTc).toBe('旺角警署');
  });
});

describe('trip finder', () => {
  it('finds direct routes from both companies', () => {
    const { results } = planTrip(idx, '旺角', '銅鑼灣');
    const names = results.map((r) => `${r.route.co}${r.route.route}`).sort();
    expect(names).toEqual(['CTB1', 'KMB1', 'KMB101']);
  });
  it('does not return the opposite direction', () => {
    const res = findDirect(idx, candidatesByName(idx, '銅鑼灣道'), candidatesByName(idx, '旺角警署'));
    expect(res.every((r) => r.route.dir === 'I')).toBe(true);
    const wrong = findDirect(idx, candidatesByName(idx, '旺角警署'), candidatesByName(idx, '銅鑼灣道'));
    expect(wrong.every((r) => r.route.dir === 'O')).toBe(true);
  });
  it('keeps the fewest-stops pair and merges service variants', () => {
    const res = findDirect(idx, candidatesByName(idx, '旺角警署', 0), candidatesByName(idx, '丙站', 0));
    const k1 = res.find((r) => r.route.route === '1')!;
    expect(k1.stops).toBe(2);
    expect(k1.route.serviceType).toBe(1);
    expect(k1.others.map((o) => o.serviceType)).toEqual([2]);
  });
  it('handles circular routes where a stop appears twice', () => {
    const res = findDirect(idx, candidatesByName(idx, '甲二站', 0), candidatesByName(idx, '乙站', 0));
    const r9 = res.find((r) => r.route.route === '9')!;
    expect(r9.boardIdx).toBe(2);
    expect(r9.alightIdx).toBe(3);
  });
  it('returns nothing when origin equals destination', () => {
    expect(planTrip(idx, '乙站', '乙站').results).toEqual([]);
  });
  it('returns nothing when no route connects', () => {
    expect(planTrip(idx, '紅磡', '旺角').results).toEqual([]);
  });
  it('includes stops near a matching stop (street-named stops in the same area)', () => {
    expect(candidatesByName(idx, '旺角警署').map((c) => c.stop.key)).toEqual(expect.arrayContaining(['KMB-A', 'KMB-B', 'CTB-X']));
  });
  it('accepts Simplified input', () => {
    expect(planTrip(idx, '旺角', '铜锣湾').results.length).toBe(3);
  });
  it('uses GPS radius for the origin', () => {
    const near = candidatesNear(idx, 22.32, 114.17, 400);
    expect(near.map((c) => c.stop.key)).toContain('CTB-X');
    expect(near[0].walk).toBe(0);
  });
  it('is fast on the real data set', () => {
    let real: BusData;
    try {
      real = JSON.parse(readFileSync('public/bus-data.json', 'utf8'));
    } catch {
      return; // data not built yet
    }
    const big = new BusIndex(real);
    const t0 = performance.now();
    const { results } = planTrip(big, '旺角', '銅鑼灣');
    const ms = performance.now() - t0;
    expect(results.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(200);
  });
});

describe('time', () => {
  it('floors minutes and never goes negative', () => {
    const now = Date.parse('2026-01-01T10:00:00+08:00');
    const ts = new Date(now);
    expect(minutesUntil(new Date(now + 5.9 * 60000), ts, now, now)).toBe(5);
    expect(minutesUntil(new Date(now - 60000), ts, now, now)).toBe(0);
  });
  it('corrects a wrong phone clock using data_timestamp', () => {
    const server = Date.parse('2026-01-01T10:00:00+08:00');
    const phone = server - 10 * 60000; // phone 10 min slow
    expect(minutesUntil(new Date(server + 3 * 60000), new Date(server), phone, phone)).toBe(3);
  });
});

describe('circular routes', () => {
  it('splits a 循環線 at the stop named in its destination', () => {
    const loop: BusData = {
      version: 1,
      generatedAt: '2026-01-01T00:00:00Z',
      routes: [['KMB', '10', 'O', 1, '彩雲', '大角咀(循環線)', 'CHOI WAN', 'TAI KOK TSUI', '彩云', '大角咀']],
      stops: {
        'KMB-S0': ['彩雲邨', 'CHOI WAN', '彩云邨', 22.33, 114.21],
        'KMB-S1': ['九龍灣', 'KLN BAY', '九龙湾', 22.32, 114.2],
        'KMB-S2': ['大角咀道', 'TKT RD', '大角咀道', 22.32, 114.16],
        'KMB-S3': ['旺角', 'MK', '旺角', 22.315, 114.17],
        'KMB-S4': ['彩雲總站', 'CHOI WAN BT', '彩云总站', 22.331, 114.21],
      },
      routeStops: { 'KMB-10-O-1': ['S0', 'S1', 'S2', 'S3', 'S4'] },
    };
    const li = new BusIndex(loop);
    const split = li.loopSplit(li.getRoute('KMB', '10', 'O', 1)!);
    expect(split).toEqual({ turnIdx: 2, turnName: '大角咀' });
  });
  it('leaves two-direction routes alone', () => {
    expect(idx.loopSplit(idx.getRoute('KMB', '1', 'O', 1)!)).toBeNull();
  });
});
