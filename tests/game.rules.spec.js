/* game-designer：data/game.json 與 js/game/rules.js 單元測試（純 Node，不開瀏覽器） */
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULES_URL, loadRules, parseRules, asRules, fill } from '../js/game/rules.js';
import { XP as LEGACY_XP } from '../js/ui/content.js';
import { readRulesRaw, variant } from './game.helpers.js';

const RAW = readRulesRaw();

test.describe('data/game.json：數值符合 CLAUDE.md §6 與 B1 契約', () => {
  test('通過驗證，且結果是凍結的新物件（不改動原始物件）', () => {
    const before = JSON.stringify(RAW);
    const R = parseRules(RAW);
    expect(R).not.toBeNull();
    expect(R).not.toBe(RAW);
    expect(Object.isFrozen(R)).toBe(true);
    expect(Object.isFrozen(R.move.tiers.main)).toBe(true);
    expect(Object.isFrozen(R.copy.lines)).toBe(true);
    expect(JSON.stringify(RAW)).toBe(before);
    expect(parseRules(R)).toBe(R); // 已驗證的物件原樣通過
    expect(asRules(R)).toBe(R);
  });

  test('遊戲日、XP、時段、等級、階段、探索閘門、AFT 門檻', () => {
    const R = parseRules(RAW);
    expect(R.day.rolloverHour).toBe(4);
    expect(R.pillars).toEqual({ move: { max: 60 }, sleep: { max: 60 }, explore: { max: 60 } });
    expect([R.move.tiers.minimal.xp, R.move.tiers.main.xp, R.move.tiers.plus.xp]).toEqual([30, 50, 60]);
    expect(R.sleep.wake).toEqual({ full: 30, near: 15, base: 10 });
    expect(R.sleep.lightsOut).toEqual({ full: 20, near: 10, base: 5 });
    expect(R.sleep.duration).toEqual({ targetMin: 420, full: 10, near: 5, base: 0 });
    expect(R.sleep.wake.full + R.sleep.lightsOut.full + R.sleep.duration.full).toBe(R.pillars.sleep.max);
    expect(R.sleep.defaults).toEqual({ bedtime: '23:00', wakeTime: '07:00', windowMin: 30 });
    expect(R.sleep.nearMin).toBe(30);
    expect(R.sleep.checkIn).toEqual({ fromHour: 4, untilHour: 12, wakeEditable: true });
    expect(R.level).toEqual({ base: 200, step: 50 });
    expect(R.streak.home).toBe('train');
    expect(R.unlock.P2).toEqual({ kind: 'wakeInWindowDays', windowDays: 14, minDays: 10 });
    expect(R.explore.open).toBe(false);
    expect(R.phases.P1.pillars).toEqual(['move', 'sleep']);
    expect(R.aft.items.map((i) => [i.key, i.target, i.better])).toEqual([
      ['hrp', 15, 'higher'], ['plank', 90, 'higher'], ['run2mi', 1197, 'lower']
    ]);
  });

  test('現有 6 種訓練紀錄 type 都有對應分級（雨天、恢復日、週三加練＝主課表；Boss＝60）', () => {
    const R = parseRules(RAW);
    for (const type of Object.keys(LEGACY_XP)) expect(Object.keys(R.move.tierByType)).toContain(type);
    expect(R.move.tierByType).toMatchObject({ minimal: 'minimal', full: 'main', cycle: 'main', rest: 'main', rain: 'main', boss: 'plus' });
    expect(R.move.unknownTypeTier).toBe('main');
  });

  test('_notes 記錄 15 條拍板決定（B1 d1–d8、V2a d9–d15）與各區塊理由', () => {
    expect(Object.keys(RAW._notes.decisions)).toEqual([
      'd1_gameDay', 'd2_moveTiers', 'd3_baseScore', 'd4_checkIn', 'd5_exploreGate', 'd6_derivedXp', 'd7_level', 'd8_homeStreak',
      'd9_perfectDay', 'd10_freeze', 'd11_deload', 'd12_returnQuest', 'd13_level', 'd14_sim', 'd15_noReverseDualWrite'
    ]);
    for (const v of Object.values(RAW._notes.decisions)) expect(v).toMatch(/理由/);
    for (const k of ['day', 'move', 'sleep', 'checkIn', 'level', 'streak', 'phases', 'unlock', 'explore', 'aft', 'copy',
      'perfectDay', 'freeze', 'deload', 'returnQuest', 'week']) {
      expect(typeof RAW._notes.sections[k]).toBe('string');
    }
  });

  test('文案：遊戲等級寫「Lv N」、連續天數寫「連續 N 天」；AFT 只稱自選目標', () => {
    const R = parseRules(RAW);
    expect(fill(R.copy.level, { lv: 4 })).toBe('Lv 4');
    expect(fill(R.copy.streak, { n: 12 })).toBe('連續 12 天');
    expect(R.copy.aft.subtitle).toContain('自選目標');
    expect(JSON.stringify(RAW)).not.toMatch(/AFT\s*(PASS|通過)/i);
  });

  test('台灣用語表：game.json 所有中文字串都沒有「不用」詞', () => {
    const glossary = JSON.parse(readFileSync(new URL('../tools/jev/zh-tw-glossary.json', import.meta.url), 'utf8'));
    const strings = [];
    const walk = (v) => {
      if (typeof v === 'string') strings.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(RAW);
    const hits = [];
    for (const s of strings.filter((x) => /\p{Script=Han}/u.test(x))) {
      for (const rule of glossary.rules) {
        if (rule.unless && new RegExp(rule.unless, 'iu').test(s)) continue;
        const hit = rule.avoid ? rule.avoid.some((w) => s.includes(w)) : new RegExp(rule.pattern, `gu${rule.flags || ''}`).test(s);
        if (hit) hits.push(`${rule.id}: ${s}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('不含外部網址（check-repo 前端掃描）', () => {
    expect(JSON.stringify(RAW)).not.toMatch(/https?:\/\//);
  });
});

test.describe('parseRules：壞規則回 null（UI 隱藏遊戲卡片）', () => {
  const bad = [
    ['不是物件', null], ['陣列', []], ['字串', 'x'], ['數字', 4],
    ['缺 version', variant(RAW, 'version', undefined)],
    ['rolloverHour 超出範圍', variant(RAW, 'day.rolloverHour', 24)],
    ['rolloverHour 是字串', variant(RAW, 'day.rolloverHour', '4')],
    ['缺 sleep', variant(RAW, 'sleep', undefined)],
    ['分級順序錯（保底 > 主課表）', variant(RAW, 'move.tiers.minimal.xp', 55)],
    ['分級超過支柱上限', variant(RAW, 'move.tiers.plus.xp', 61)],
    ['tierByType 指到不存在的分級', variant(RAW, 'move.tierByType.full', 'huge')],
    ['漸進分數 near > full', variant(RAW, 'sleep.wake.near', 31)],
    ['就寢目標格式錯', variant(RAW, 'sleep.defaults.bedtime', '23')],
    ['打卡時段早於換日時刻', variant(RAW, 'sleep.checkIn.fromHour', 3)],
    ['打卡結束不晚於開始', variant(RAW, 'sleep.checkIn.untilHour', 4)],
    ['等級 base 為 0', variant(RAW, 'level.base', 0)],
    ['streak.home 不認得', variant(RAW, 'streak.home', 'any')],
    ['P2 門檻天數大於期間', variant(RAW, 'unlock.P2.minDays', 15)],
    ['探索閘門不是布林', variant(RAW, 'explore.open', 'no')],
    ['階段缺 P3', variant(RAW, 'phases.P3', undefined)],
    ['AFT 目標非正數', variant(RAW, 'aft.items', [{ key: 'hrp', name: 'HRP', field: 'reps', unit: 'reps', better: 'higher', target: 0 }])],
    ['缺文案樣板', variant(RAW, 'copy.lines.wakeBase', undefined)],
    ['文案樣板空白', variant(RAW, 'copy.next.done', '  ')]
  ];
  for (const [name, raw] of bad) {
    test(name, () => {
      expect(parseRules(raw)).toBeNull();
      expect(asRules(raw)).toBeNull();
    });
  }
});

test.describe('fill：文案樣板', () => {
  test('代入、保留不認得的名稱、不讀原型鏈', () => {
    expect(fill('{have} / {need} 天', { have: 7, need: 10 })).toBe('7 / 10 天');
    expect(fill('第 {n} 天', {})).toBe('第 {n} 天');
    expect(fill('{constructor}', {})).toBe('{constructor}');
    expect(fill('{a}{a}', { a: 0 })).toBe('00');
  });
});

test.describe('loadRules：fetch data/game.json，失敗回 null', () => {
  let realFetch;
  test.beforeEach(() => { realFetch = globalThis.fetch; });
  test.afterEach(() => { globalThis.fetch = realFetch; });

  const respond = (body, ok = true) => async () => ({ ok, json: async () => (typeof body === 'function' ? body() : body) });

  test('RULES_URL 指向 repo 的 data/game.json（與頁面路徑無關）', () => {
    expect(new URL(RULES_URL).pathname.endsWith('/data/game.json')).toBe(true);
    expect(existsSync(fileURLToPath(RULES_URL))).toBe(true);
  });

  test('成功：回驗證過的凍結規則，請求的是 RULES_URL', async () => {
    const urls = [];
    globalThis.fetch = async (url) => { urls.push(String(url)); return { ok: true, json: async () => readRulesRaw() }; };
    const R = await loadRules();
    expect(R).not.toBeNull();
    expect(Object.isFrozen(R)).toBe(true);
    expect(R.level.base).toBe(200);
    expect(urls).toEqual([RULES_URL]);
    expect(asRules(R)).toBe(R);
  });

  test('HTTP 錯誤（404）→ null', async () => {
    globalThis.fetch = respond(readRulesRaw(), false);
    expect(await loadRules()).toBeNull();
  });

  test('網路錯誤（離線且沒有快取）→ null', async () => {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    expect(await loadRules()).toBeNull();
  });

  test('不是 JSON → null', async () => {
    globalThis.fetch = respond(() => { throw new SyntaxError('Unexpected token <'); });
    expect(await loadRules()).toBeNull();
  });

  test('JSON 形狀不對 → null', async () => {
    globalThis.fetch = respond({ version: 1 });
    expect(await loadRules()).toBeNull();
  });

  test('環境沒有 fetch → null', async () => {
    globalThis.fetch = undefined;
    expect(await loadRules()).toBeNull();
  });
});
