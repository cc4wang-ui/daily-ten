/* game-designer：js/game/day.js 單元測試——遊戲日 04:00 換日、跨時區、夏令時間（純 Node） */
import { test, expect } from '@playwright/test';
import {
  DEFAULT_ROLLOVER_HOUR, rolloverHour, toDate, gameDate, parseIso, gameDateOfIso, dateOfStamp,
  addDays, daysBetween, weekdayOf
} from '../js/game/day.js';
import { parseRules } from '../js/game/rules.js';
import { readRulesRaw, useTZ, variant } from './game.helpers.js';

useTZ(test);
const RAW = readRulesRaw();
const R = parseRules(RAW);

test.describe('gameDate：本地時間 04:00 換日', () => {
  test('03:59 算前一天、04:00 算當天', () => {
    expect(gameDate(new Date('2026-10-05T03:59:00+09:00'), R)).toBe('2026-10-04');
    expect(gameDate(new Date('2026-10-05T03:59:59.999+09:00'), R)).toBe('2026-10-04');
    expect(gameDate(new Date('2026-10-05T04:00:00+09:00'), R)).toBe('2026-10-05');
  });

  test('午夜到 04:00 之間都算前一天；23:59 仍是當天', () => {
    expect(gameDate(new Date('2026-10-05T00:00:00+09:00'), R)).toBe('2026-10-04');
    expect(gameDate(new Date('2026-10-05T02:30:00+09:00'), R)).toBe('2026-10-04');
    expect(gameDate(new Date('2026-10-04T23:59:00+09:00'), R)).toBe('2026-10-04');
  });

  test('跨月、跨年、閏日', () => {
    expect(gameDate(new Date('2026-11-01T03:00:00+09:00'), R)).toBe('2026-10-31');
    expect(gameDate(new Date('2027-01-01T03:00:00+09:00'), R)).toBe('2026-12-31');
    expect(gameDate(new Date('2028-03-01T01:00:00+09:00'), R)).toBe('2028-02-29');
  });

  test('跨時區：同一個瞬間，依裝置當地時間各自換日', () => {
    const instant = new Date('2026-10-04T19:30:00Z');
    process.env.TZ = 'Asia/Tokyo'; // 10/05 04:30
    expect(gameDate(instant, R)).toBe('2026-10-05');
    process.env.TZ = 'Asia/Kolkata'; // 10/05 01:00（+05:30）
    expect(gameDate(instant, R)).toBe('2026-10-04');
    process.env.TZ = 'America/Los_Angeles'; // 10/04 12:30（−07:00）
    expect(gameDate(instant, R)).toBe('2026-10-04');
    process.env.TZ = 'Pacific/Kiritimati'; // 10/05 09:30（+14:00）
    expect(gameDate(instant, R)).toBe('2026-10-05');
  });

  test('負 offset 時區的 03:59／04:00', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(gameDate(new Date('2026-10-04T03:59:00-07:00'), R)).toBe('2026-10-03');
    expect(gameDate(new Date('2026-10-04T04:00:00-07:00'), R)).toBe('2026-10-04');
  });

  test('夏令時間結束與開始的那天，換日時刻仍是當地 04:00', () => {
    process.env.TZ = 'America/New_York';
    // 2026-11-01 02:00 撥回 01:00（之後是 −05:00）
    expect(gameDate(new Date('2026-11-01T01:30:00-04:00'), R)).toBe('2026-10-31');
    expect(gameDate(new Date('2026-11-01T01:30:00-05:00'), R)).toBe('2026-10-31');
    expect(gameDate(new Date('2026-11-01T03:59:00-05:00'), R)).toBe('2026-10-31');
    expect(gameDate(new Date('2026-11-01T04:00:00-05:00'), R)).toBe('2026-11-01');
    // 2026-03-08 02:00 撥快到 03:00（之後是 −04:00）
    expect(gameDate(new Date('2026-03-08T03:59:00-04:00'), R)).toBe('2026-03-07');
    expect(gameDate(new Date('2026-03-08T04:00:00-04:00'), R)).toBe('2026-03-08');
  });

  test('換日時刻來自 rules；rules 缺少或無效時預設 4', () => {
    const at0430 = new Date('2026-10-05T04:30:00+09:00');
    const r5 = parseRules(variant(variant(RAW, 'day.rolloverHour', 5), 'sleep.checkIn.fromHour', 5));
    expect(r5).not.toBeNull();
    expect(gameDate(at0430, r5)).toBe('2026-10-04');
    expect(parseRules(variant(RAW, 'day.rolloverHour', 5))).toBeNull(); // 打卡開始早於換日時刻 → 規則無效
    expect(gameDate(at0430, { day: { rolloverHour: 5 } })).toBe('2026-10-04'); // 未驗證的物件也讀得到
    expect(DEFAULT_ROLLOVER_HOUR).toBe(4);
    for (const r of [null, undefined, {}, { day: null }, { day: { rolloverHour: 24 } }, { day: { rolloverHour: '5' } }, 42]) {
      expect(rolloverHour(r)).toBe(4);
      expect(gameDate(new Date('2026-10-05T03:59:00+09:00'), r)).toBe('2026-10-04');
      expect(gameDate(new Date('2026-10-05T04:00:00+09:00'), r)).toBe('2026-10-05');
    }
  });

  test('接受 Date、毫秒數、可解析的字串；無法辨識回 null（不改用現在時間）', () => {
    const ms = Date.parse('2026-10-05T03:59:00+09:00');
    expect(gameDate(ms, R)).toBe('2026-10-04');
    expect(gameDate('2026-10-05T04:00:00+09:00', R)).toBe('2026-10-05');
    for (const bad of [undefined, null, NaN, Infinity, '', '   ', 'garbage', new Date('x'), {}, [], true]) {
      expect(gameDate(bad, R)).toBeNull();
      if (bad !== undefined) expect(toDate(bad)).toBeNull();
    }
  });
});

test.describe('ISO 字串（已存的紀錄）：用字串本身的當地時間', () => {
  test('parseIso：日期與分鐘取字串裡的當地時間，ms 是絕對時間', () => {
    expect(parseIso('2026-10-04T06:58:20+09:00')).toEqual({ date: '2026-10-04', minutes: 418, ms: Date.parse('2026-10-04T06:58:20+09:00') });
    expect(parseIso('2026-10-04T06:58:20-07:00').minutes).toBe(418);
    expect(parseIso('2026-10-04T06:58:20+05:30').ms).toBe(Date.parse('2026-10-04T06:58:20+05:30'));
    expect(parseIso('2026-10-04T21:58:20Z').minutes).toBe(1318);
    expect(parseIso('2026-10-04T06:58:20.123+09:00').minutes).toBe(418);
    expect(parseIso('2026-10-04T06:58+09:00').minutes).toBe(418);
  });

  test('parseIso：裝置換到別的時區，結果不變', () => {
    const tokyo = parseIso('2026-10-04T23:10:00+09:00');
    process.env.TZ = 'America/Los_Angeles';
    expect(parseIso('2026-10-04T23:10:00+09:00')).toEqual(tokyo);
  });

  test('parseIso：格式或日期無效回 null', () => {
    for (const bad of ['2026-02-30T07:00:00+09:00', '2026-10-04T24:00:00+09:00', '2026-10-04T07:60:00+09:00',
      '2026-10-04 07:00', '2026-10-04', '07:00', '2026-10-04T07:00:00+25:00', '', null, 5, {}]) {
      expect(parseIso(bad)).toBeNull();
    }
  });

  test('gameDateOfIso：03:59 前一天、04:00 當天，與裝置時區無關', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(gameDateOfIso('2026-10-05T03:59:00+09:00', R)).toBe('2026-10-04');
    expect(gameDateOfIso('2026-10-05T04:00:00+09:00', R)).toBe('2026-10-05');
    expect(gameDateOfIso('2026-10-01T00:30:00+09:00', R)).toBe('2026-09-30');
    expect(gameDateOfIso('garbage', R)).toBeNull();
  });

  test('dateOfStamp：日期原樣、ISO 轉遊戲日、其他 null', () => {
    expect(dateOfStamp('2026-10-01', R)).toBe('2026-10-01');
    expect(dateOfStamp('2026-10-01T03:00:00+09:00', R)).toBe('2026-09-30');
    expect(dateOfStamp(null, R)).toBeNull();
    expect(dateOfStamp({}, R)).toBeNull();
  });
});

test.describe('日期運算', () => {
  test('addDays／daysBetween／weekdayOf', () => {
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-01', '2026-10-05')).toBe(4);
    expect(daysBetween('2026-10-05', '2026-10-01')).toBe(-4);
    expect(weekdayOf('2026-10-04')).toBe(0); // 週日
    expect(weekdayOf('2026-10-02')).toBe(5); // 週五（mockup「週五 10/2」）
    expect(weekdayOf('2026-10-03')).toBe(6);
    expect(addDays('bad', 1)).toBeNull();
    expect(Number.isNaN(daysBetween('bad', '2026-10-01'))).toBe(true);
    expect(weekdayOf('2026-02-30')).toBeNull();
  });
});
