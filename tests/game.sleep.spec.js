/* game-designer：js/habits/sleep.js 單元測試——早安打卡（D17）、D18 漸進計分、睡滿 7 小時、打卡時段（純 Node） */
import { test, expect } from '@playwright/test';
import { parseRules } from '../js/game/rules.js';
import {
  parseHM, fmtHM, sleepTargets, scoreSleepEntry, sleepDays, checkInWindow, buildCheckIn
} from '../js/habits/sleep.js';
import { readRulesRaw, useTZ, variant, makeState, night } from './game.helpers.js';

useTZ(test);
const RAW = readRulesRaw();
const R = parseRules(RAW);
const at = (iso) => new Date(iso);
const score = (entry, state = makeState()) => scoreSleepEntry(entry, state, R);

test.describe('buildCheckIn：1 次點擊＝起床＋昨晚熄燈（D17）', () => {
  test('mockup 情境：06:58 起床、熄燈預填 23:00 → 30＋20＋10＝60', () => {
    const r = buildCheckIn(makeState(), at('2026-10-05T06:58:20+09:00'), R);
    expect(r.ok).toBe(true);
    expect(r.entry).toStrictEqual({
      date: '2026-10-05',
      lightsOut: '2026-10-04T23:00:00+09:00',
      wake: '2026-10-05T06:58:20+09:00',
      lightsOutEdited: false,
      target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }
    });
    expect(r.score.total).toBe(60);
    expect(r.score.max).toBe(60);
    expect(r.score.lines).toEqual([
      { key: 'wake', label: '起床 · 在時段內', value: '06:58', xp: 30 },
      { key: 'lightsOut', label: '熄燈 · 在時段內', value: '23:00', xp: 20 },
      { key: 'duration', label: '睡眠時數 ≥7 小時', value: '7h58m', xp: 10 }
    ]);
    expect(r.score.duration.minutes).toBe(478);
  });

  test('改熄燈時間：00:40 → 當天凌晨、lightsOutEdited；05:00 → 起床前；輸入就寢目標本身不算修改', () => {
    const tap = at('2026-10-05T06:58:00+09:00');
    const a = buildCheckIn(makeState(), tap, R, { lightsOut: '00:40' });
    expect(a.entry.lightsOut).toBe('2026-10-05T00:40:00+09:00');
    expect(a.entry.lightsOutEdited).toBe(true);
    expect(a.score.lightsOut).toMatchObject({ status: 'base', xp: 5, offMin: 70, side: 'late' });
    expect(a.score.duration).toMatchObject({ minutes: 378, text: '6h18m', status: 'base', xp: 0 });
    expect(a.score.total).toBe(35);
    expect(buildCheckIn(makeState(), tap, R, { lightsOut: '0:40' }).entry).toEqual(a.entry);
    const b = buildCheckIn(makeState(), tap, R, { lightsOut: '05:00' });
    expect(b.entry.lightsOut).toBe('2026-10-05T05:00:00+09:00');
    expect(b.score.duration.minutes).toBe(118);
    const c = buildCheckIn(makeState(), tap, R, { lightsOut: '23:00' });
    expect(c.entry.lightsOutEdited).toBe(false);
  });

  test('熄燈預填 settings.bedtime；設定無效時用 rules 預設；windowMin 夾在 0–180', () => {
    const tap = at('2026-10-05T06:58:00+09:00');
    const late = buildCheckIn(makeState({ settings: { bedtime: '23:30', wakeTime: '6:45', windowMin: 45 } }), tap, R);
    expect(late.entry.lightsOut).toBe('2026-10-04T23:30:00+09:00');
    expect(late.entry.target).toEqual({ bedtime: '23:30', wakeTime: '06:45', windowMin: 45 });
    const junk = makeState({ settings: { bedtime: 99, wakeTime: '7:5', windowMin: -1 } });
    expect(buildCheckIn(junk, tap, R).entry.target).toEqual({ bedtime: '23:00', wakeTime: '07:00', windowMin: 30 });
    expect(sleepTargets(makeState({ settings: { windowMin: 999 } }), R).windowMin).toBe(180);
    expect(sleepTargets(makeState({ settings: { windowMin: '30' } }), R).windowMin).toBe(30);
    expect(sleepTargets(makeState({ settings: { windowMin: 1.5 } }), R).windowMin).toBe(30);
    expect(sleepTargets(null, R)).toEqual({ bedtime: '23:00', wakeTime: '07:00', windowMin: 30 });
    expect(sleepTargets(makeState(), null)).toBeNull();
  });

  test('改起床時間：只能往前；與按下的分鐘相同不算修改', () => {
    const tap = at('2026-10-05T09:30:00+09:00');
    const a = buildCheckIn(makeState(), tap, R, { wake: '07:05' });
    expect(a.ok).toBe(true);
    expect(a.entry.wake).toBe('2026-10-05T07:05:00+09:00');
    expect(a.entry.wakeEdited).toBe(true);
    expect(a.entry.date).toBe('2026-10-05');
    expect(a.score.wake).toMatchObject({ status: 'full', xp: 30 });
    expect(a.score.duration.minutes).toBe(485);
    const same = buildCheckIn(makeState(), tap, R, { wake: '09:30' });
    expect(same.entry.wake).toBe('2026-10-05T09:30:00+09:00');
    expect('wakeEdited' in same.entry).toBe(false);
    expect(buildCheckIn(makeState(), tap, R, { wake: '09:31' })).toMatchObject({ ok: false, code: 'wakeFuture', reason: '起床時間不能晚於現在', entry: null, score: null });
    expect(buildCheckIn(makeState(), tap, R, { wake: 'xx' })).toMatchObject({ ok: false, code: 'badTime' });
    const locked = parseRules(variant(RAW, 'sleep.checkIn.wakeEditable', false));
    expect(buildCheckIn(makeState(), tap, locked, { wake: '07:05' })).toMatchObject({ ok: false, code: 'wakeLocked' });
  });

  test('起床改到 04:00 前（例如趕早班機）：紀錄仍屬按下那一天', () => {
    const r = buildCheckIn(makeState(), at('2026-10-05T05:00:00+09:00'), R, { wake: '03:30' });
    expect(r.entry.date).toBe('2026-10-05');
    expect(r.entry.wake).toBe('2026-10-05T03:30:00+09:00');
    expect(r.entry.lightsOut).toBe('2026-10-04T23:00:00+09:00');
    expect(r.score.duration.minutes).toBe(270);
  });

  test('輸入錯誤：格式不對、熄燈到起床超過 18 小時', () => {
    const tap = at('2026-10-05T06:58:00+09:00');
    for (const bad of ['25:00', '7', 'abc', '', 123, '07:60']) {
      expect(buildCheckIn(makeState(), tap, R, { lightsOut: bad })).toMatchObject({ ok: false, code: 'badTime', reason: '時間格式應為 HH:MM' });
    }
    for (const lo of ['07:30', '06:58']) {
      expect(buildCheckIn(makeState(), tap, R, { lightsOut: lo })).toMatchObject({
        ok: false, code: 'badDuration', reason: '熄燈到起床超過 18 小時，請確認熄燈時間', entry: null, score: null
      });
    }
  });

  test('打卡時段 04:00–12:00：03:59 未開放、04:00 與 11:59 可以、12:00 已過', () => {
    expect(buildCheckIn(makeState(), at('2026-10-05T03:59:00+09:00'), R)).toMatchObject({ ok: false, code: 'early', reason: '早安打卡 04:00 開放' });
    expect(buildCheckIn(makeState(), at('2026-10-05T04:00:00+09:00'), R).ok).toBe(true);
    expect(buildCheckIn(makeState(), at('2026-10-05T11:59:00+09:00'), R).ok).toBe(true);
    expect(buildCheckIn(makeState(), at('2026-10-05T12:00:00+09:00'), R)).toMatchObject({ ok: false, code: 'late', reason: '早安打卡開放到 12:00，明天早上見' });
  });

  test('rules 無效或時間無法辨識：回 ok:false，不丟例外', () => {
    expect(buildCheckIn(makeState(), at('2026-10-05T06:58:00+09:00'), null)).toEqual({ ok: false, code: 'noRules', reason: '遊戲規則還沒載入', entry: null, score: null });
    expect(buildCheckIn(makeState(), 'garbage', R)).toMatchObject({ ok: false, code: 'badNow', reason: '現在時間無法辨識' });
    expect(buildCheckIn(null, at('2026-10-05T06:58:00+09:00'), R, null).ok).toBe(true);
    expect(buildCheckIn(42, at('2026-10-05T06:58:00+09:00'), R, 'x').ok).toBe(true);
  });

  test('ISO 含當地 offset：洛杉磯、加爾各答', () => {
    process.env.TZ = 'America/Los_Angeles';
    const la = buildCheckIn(makeState(), at('2026-10-05T06:58:00-07:00'), R);
    expect(la.entry).toMatchObject({ date: '2026-10-05', wake: '2026-10-05T06:58:00-07:00', lightsOut: '2026-10-04T23:00:00-07:00' });
    expect(la.score.total).toBe(60);
    process.env.TZ = 'Asia/Kolkata';
    const kol = buildCheckIn(makeState(), at('2026-10-05T06:58:00+05:30'), R);
    expect(kol.entry).toMatchObject({ wake: '2026-10-05T06:58:00+05:30', lightsOut: '2026-10-04T23:00:00+05:30' });
  });

  test('夏令時間：時數用絕對時間相減（撥回那晚 9 小時、撥快那晚 7 小時）', () => {
    process.env.TZ = 'America/New_York';
    const fallBack = buildCheckIn(makeState(), at('2026-11-01T07:00:00-05:00'), R);
    expect(fallBack.entry.lightsOut).toBe('2026-10-31T23:00:00-04:00');
    expect(fallBack.entry.wake).toBe('2026-11-01T07:00:00-05:00');
    expect(fallBack.score.duration.minutes).toBe(540);
    const springForward = buildCheckIn(makeState(), at('2026-03-08T07:00:00-04:00'), R);
    expect(springForward.entry.lightsOut).toBe('2026-03-07T23:00:00-05:00');
    expect(springForward.score.duration).toMatchObject({ minutes: 420, status: 'full', xp: 10 });
  });
});

test.describe('D18 漸進計分：時段內滿分、超出 ≤30 分一半、更晚基本分', () => {
  const wakeAt = (hm) => score(night('2026-10-05', '23:00', hm)).wake;
  const loAt = (hm) => score(night('2026-10-05', hm, '07:00')).lightsOut;

  test('起床（目標 07:00 ±30）：晚的一側', () => {
    expect(wakeAt('07:00')).toMatchObject({ status: 'full', inWindow: true, offMin: 0, side: null, xp: 30, max: 30, time: '07:00' });
    expect(wakeAt('07:30')).toMatchObject({ status: 'full', xp: 30 });
    expect(wakeAt('07:31')).toMatchObject({ status: 'near', inWindow: false, offMin: 1, side: 'late', xp: 15 });
    expect(wakeAt('08:00')).toMatchObject({ status: 'near', offMin: 30, xp: 15 });
    expect(wakeAt('08:01')).toMatchObject({ status: 'base', offMin: 31, side: 'late', xp: 10 });
    expect(wakeAt('11:30')).toMatchObject({ status: 'base', xp: 10 });
  });

  test('起床：早的一側也對稱', () => {
    expect(wakeAt('06:30')).toMatchObject({ status: 'full', xp: 30 });
    expect(wakeAt('06:29')).toMatchObject({ status: 'near', offMin: 1, side: 'early', xp: 15 });
    expect(wakeAt('06:00')).toMatchObject({ status: 'near', offMin: 30, xp: 15 });
    expect(wakeAt('05:59')).toMatchObject({ status: 'base', side: 'early', xp: 10 });
  });

  test('秒數不計：07:30:59 仍在時段內', () => {
    const e = night('2026-10-05', '23:00', '07:30');
    e.wake = '2026-10-05T07:30:59+09:00';
    expect(score(e).wake).toMatchObject({ status: 'full', time: '07:30' });
  });

  test('熄燈（目標 23:00 ±30）：跨午夜也算對', () => {
    expect(loAt('23:30')).toMatchObject({ status: 'full', xp: 20, max: 20 });
    expect(loAt('23:31')).toMatchObject({ status: 'near', offMin: 1, side: 'late', xp: 10 });
    expect(loAt('00:00')).toMatchObject({ status: 'near', offMin: 30, side: 'late', xp: 10 });
    expect(loAt('00:01')).toMatchObject({ status: 'base', offMin: 31, xp: 5 });
    expect(loAt('22:00')).toMatchObject({ status: 'near', offMin: 30, side: 'early', xp: 10 });
    expect(loAt('21:59')).toMatchObject({ status: 'base', side: 'early', xp: 5 });
  });

  test('時段本身跨午夜：就寢 23:45 → 00:10 在時段內；就寢 00:15 → 23:50 在時段內', () => {
    const s1 = makeState({ settings: { bedtime: '23:45' } });
    expect(score(night('2026-10-05', '00:10', '07:00'), s1).lightsOut).toMatchObject({ status: 'full', xp: 20 });
    expect(score(night('2026-10-05', '00:16', '07:00'), s1).lightsOut).toMatchObject({ status: 'near', offMin: 1, side: 'late' });
    const s2 = makeState({ settings: { bedtime: '00:15' } });
    expect(score(night('2026-10-05', '23:50', '07:00'), s2).lightsOut).toMatchObject({ status: 'full' });
  });

  test('明細文字（mockup 用語）', () => {
    const lines = (lo, wake) => score(night('2026-10-05', lo, wake)).lines.map((l) => l.label);
    expect(lines('23:31', '07:31')).toEqual(['起床 · 晚於時段 1 分鐘', '熄燈 · 晚於時段 1 分鐘', '睡眠時數 ≥7 小時']);
    expect(lines('22:00', '06:29')).toEqual(['起床 · 早於時段 1 分鐘', '熄燈 · 早於時段 30 分鐘', '睡眠時數 ≥7 小時']);
    expect(lines('02:00', '09:30')).toEqual(['起床 · 基本分', '熄燈 · 基本分', '睡眠時數 ≥7 小時']);
  });

  test('最不順的一晚也不歸零：起床、熄燈都遠離時段、只睡 6 小時 → 15', () => {
    const s = score(night('2026-10-05', '03:00', '09:00'));
    expect([s.wake.xp, s.lightsOut.xp, s.duration.xp]).toEqual([10, 5, 0]);
    expect(s.total).toBe(15);
  });
});

test.describe('睡滿 7 小時：滿 10、差 30 分內 5、再少 0', () => {
  const dur = (lo) => score(night('2026-10-05', lo, '07:00')).duration;

  test('邊界 420／419／390／389 分鐘', () => {
    expect(dur('00:00')).toMatchObject({ minutes: 420, text: '7h00m', status: 'full', offMin: 0, xp: 10, max: 10 });
    expect(dur('00:01')).toMatchObject({ minutes: 419, text: '6h59m', status: 'near', offMin: 1, xp: 5 });
    expect(dur('00:30')).toMatchObject({ minutes: 390, status: 'near', offMin: 30, xp: 5 });
    expect(dur('00:31')).toMatchObject({ minutes: 389, status: 'base', xp: 0 });
    expect(dur('21:00')).toMatchObject({ minutes: 600, status: 'full', xp: 10 });
  });

  test('明細文字', () => {
    const label = (lo) => score(night('2026-10-05', lo, '07:00')).lines.find((l) => l.key === 'duration');
    expect(label('00:00')).toEqual({ key: 'duration', label: '睡眠時數 ≥7 小時', value: '7h00m', xp: 10 });
    expect(label('00:01')).toEqual({ key: 'duration', label: '睡眠時數 差 1 分鐘滿 7 小時', value: '6h59m', xp: 5 });
    expect(label('01:00')).toEqual({ key: 'duration', label: '睡眠時數', value: '6h00m', xp: 0 });
  });

  test('跨時區的一晚：東京熄燈、台北起床 → 實際 8 小時', () => {
    const e = { date: '2026-10-05', lightsOut: '2026-10-04T23:00:00+09:00', wake: '2026-10-05T06:00:00+08:00', lightsOutEdited: false };
    expect(score(e).duration).toMatchObject({ minutes: 480, status: 'full' });
  });
});

test.describe('紀錄存下的目標與當地時間', () => {
  test('有 entry.target 就用它；改設定不會重算過去的分數', () => {
    const e = { ...night('2026-10-05', '23:00', '06:10'), target: { bedtime: '23:00', wakeTime: '06:00', windowMin: 30 } };
    expect(score(e, makeState({ settings: { wakeTime: '07:00' } })).wake.status).toBe('full');
    expect(score(e, makeState({ settings: { wakeTime: '09:00' } })).wake.status).toBe('full');
  });

  test('沒有 target（或欄位無效）時用目前設定', () => {
    const plain = night('2026-10-05', '23:00', '06:10');
    expect(score(plain, makeState({ settings: { wakeTime: '07:00' } })).wake).toMatchObject({ status: 'near', offMin: 20, side: 'early' });
    expect(score(plain, makeState({ settings: { wakeTime: '06:00' } })).wake.status).toBe('full');
    const partial = { ...plain, target: { wakeTime: '06:00', windowMin: 'x' } };
    expect(score(partial, makeState({ settings: { windowMin: 5 } })).wake).toMatchObject({ status: 'near', offMin: 5 });
    const zero = { ...night('2026-10-05', '23:00', '07:01'), target: { wakeTime: '07:00', windowMin: 0 } };
    expect(score(zero).wake).toMatchObject({ status: 'near', offMin: 1 });
  });

  test('裝置換時區後重算，分數不變（用紀錄裡的當地時間）', () => {
    const e = night('2026-10-05', '23:10', '06:58');
    const tokyo = score(e);
    process.env.TZ = 'America/Los_Angeles';
    expect(score(e)).toEqual(tokyo);
    expect(tokyo.total).toBe(60);
  });
});

test.describe('sleepDays／scoreSleepEntry：壞資料不丟例外', () => {
  test('同一遊戲日多筆取分數最高的；同分取第一筆', () => {
    const low = night('2026-10-05', '23:00', '09:00');
    const high = night('2026-10-05', '23:00', '06:58');
    const days = sleepDays(makeState({ sleep: [low, high] }), R);
    expect(days.get('2026-10-05').entry).toBe(high);
    const a = night('2026-10-06', '23:00', '06:58');
    const b = { ...night('2026-10-06', '23:00', '06:58'), lightsOutEdited: true };
    expect(sleepDays(makeState({ sleep: [a, b] }), R).get('2026-10-06').entry).toBe(a);
  });

  test('缺熄燈：只算起床；時間全壞：0 分、沒有明細', () => {
    const noLo = { date: '2026-10-05', lightsOut: null, wake: '2026-10-05T06:58:00+09:00', lightsOutEdited: false };
    const s = score(noLo);
    expect(s.lightsOut.status).toBe('none');
    expect(s.duration.status).toBe('none');
    expect(s.total).toBe(30);
    expect(s.lines.map((l) => l.key)).toEqual(['wake']);
    const junk = score({ date: '2026-10-05', wake: 'garbage', lightsOut: 5 });
    expect(junk.total).toBe(0);
    expect(junk.lines).toEqual([]);
    const backwards = score({ date: '2026-10-05', lightsOut: '2026-10-05T08:00:00+09:00', wake: '2026-10-05T07:00:00+09:00' });
    expect(backwards.duration.status).toBe('none');
  });

  test('非物件、日期無效的紀錄略過；state／rules 壞掉回空結果', () => {
    const log = [null, 1, 'x', [], { date: 'bad' }, { date: '2026-02-30' }, night('2026-10-05', '23:00', '06:58')];
    expect([...sleepDays(makeState({ sleep: log }), R).keys()]).toEqual(['2026-10-05']);
    for (const st of [null, undefined, 42, 'x', [], {}, { habits: null }, { habits: { sleep: 'x' } }, { habits: { sleep: { log: {} } } }]) {
      expect(sleepDays(st, R).size).toBe(0);
    }
    expect(sleepDays(makeState({ sleep: log }), null).size).toBe(0);
    expect(scoreSleepEntry(null, makeState(), R)).toBeNull();
    expect(scoreSleepEntry(night('2026-10-05', '23:00', '06:58'), makeState(), { not: 'rules' })).toBeNull();
  });
});

test.describe('checkInWindow', () => {
  const W = (state, iso) => checkInWindow(state, at(iso), R);

  test('時段內、還沒打卡 → open', () => {
    expect(W(makeState(), '2026-10-05T06:58:00+09:00')).toEqual({
      open: true, code: 'open', reason: '早安打卡開放到 12:00', date: '2026-10-05', from: '04:00', until: '12:00'
    });
  });

  test('今天已打卡 → done；昨天的紀錄不算今天', () => {
    expect(W(makeState({ sleep: [night('2026-10-05', '23:00', '06:58')] }), '2026-10-05T07:10:00+09:00'))
      .toMatchObject({ open: false, code: 'done', reason: '今天已經打卡了' });
    expect(W(makeState({ sleep: [night('2026-10-04', '23:00', '06:58')] }), '2026-10-05T07:10:00+09:00').code).toBe('open');
  });

  test('04:00 前 → early（遊戲日還是前一天）；凌晨若前一天已打卡 → done', () => {
    expect(W(makeState(), '2026-10-05T03:59:00+09:00')).toMatchObject({ open: false, code: 'early', reason: '早安打卡 04:00 開放', date: '2026-10-04' });
    expect(W(makeState({ sleep: [night('2026-10-04', '23:00', '06:58')] }), '2026-10-05T02:00:00+09:00').code).toBe('done');
  });

  test('12:00 起 → late', () => {
    expect(W(makeState(), '2026-10-05T12:00:00+09:00')).toMatchObject({ open: false, code: 'late', reason: '早安打卡開放到 12:00，明天早上見' });
    expect(W(makeState(), '2026-10-05T23:00:00+09:00').code).toBe('late');
  });

  test('rules 無效、時間無法辨識、state 壞掉', () => {
    expect(checkInWindow(makeState(), at('2026-10-05T06:58:00+09:00'), null)).toMatchObject({ open: false, code: 'noRules', reason: '遊戲規則還沒載入' });
    expect(checkInWindow(makeState(), NaN, R)).toMatchObject({ open: false, code: 'badNow' });
    expect(checkInWindow(null, at('2026-10-05T06:58:00+09:00'), R).code).toBe('open');
    expect(checkInWindow({ habits: { sleep: { log: [null, 5] } } }, at('2026-10-05T06:58:00+09:00'), R).code).toBe('open');
  });

  test('洛杉磯當地 06:58 → open', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(checkInWindow(makeState(), at('2026-10-05T06:58:00-07:00'), R)).toMatchObject({ open: true, date: '2026-10-05' });
  });
});

test.describe('parseHM／fmtHM', () => {
  test('格式', () => {
    expect(parseHM('07:05')).toBe(425);
    expect(parseHM('7:05')).toBe(425);
    expect(parseHM(' 23:59 ')).toBe(1439);
    for (const bad of ['24:00', '7', '07:5', '07:60', 'ab:cd', null, 425]) expect(parseHM(bad)).toBeNull();
    expect(fmtHM(425)).toBe('07:05');
    expect(fmtHM(0)).toBe('00:00');
    expect(fmtHM(1440 + 61)).toBe('01:01');
  });
});
