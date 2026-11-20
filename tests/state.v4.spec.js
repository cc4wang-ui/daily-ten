/* data-guardian：v4.nutrition.entries（實際吃的，D30）單元測試（純 Node）。
   契約：runs/photo-kcal/contract.md〈State〉。fixture 說明：tests/fixtures/README.md 第 5 節。全部是假資料。 */
import { test, expect } from '@playwright/test';
import { STORAGE_KEY, loadState, getState, saveState } from '../js/state/store.js';
import { buildBackup, parseImport, applyImport } from '../js/state/backup.js';
import { defaultV4, ensureV4, parseV4, parseNutrition, toggleMeal, setWeight, addEntry, removeEntry, ENTRY_LIMITS } from '../js/state/v4.js';
import { readFixture, loadFixture, NOW, MemoryStorage, installGlobals, clearGlobals, useTokyoTime } from './state.helpers.js';

useTokyoTime(test);
test.afterEach(() => clearGlobals());

const D = '2026-11-20';
const T = new Date('2026-11-20T12:35:00+09:00');
const ENTRY_KEYS = ['id', 'at', 'slot', 'name', 'kcal', 'proteinG', 'fatG', 'carbG', 'source'];
const manual = (extra = {}) => ({ date: D, slot: null, name: '測試餐', kcal: 300, proteinG: 20, fatG: 10, carbG: 30, source: 'manual', now: T, ...extra });

async function loadCurrent(name) {
  const local = new MemoryStorage({ [STORAGE_KEY]: readFixture(name) });
  installGlobals({ local });
  const result = await loadState({ now: NOW });
  return { local, result };
}

test.describe('預設值與舊資料', () => {
  test('defaultV4 有 entries: {}；容器與 v4 版本不升', () => {
    expect(defaultV4().nutrition).toStrictEqual({ meals: {}, weights: [], entries: {} });
    expect(defaultV4().version).toBe(1);
    expect(ENTRY_LIMITS.perDay).toBe(20);
  });

  test('v4-no-nutrition.json（沒有 nutrition）：載入 ok、不寫入、ensureV4 只在記憶體補空值、其他 v4 欄位不變', async () => {
    const raw = readFixture('v4-no-nutrition.json');
    const { local, result } = await loadCurrent('v4-no-nutrition.json');
    expect(result).toStrictEqual({ status: 'ok', error: null });
    const before = JSON.parse(raw).v4;
    const { v4, created } = ensureV4(getState());
    expect(created).toBe(false); // app.js 只在 created 時存檔 → 舊資料打開不寫入
    expect(v4.nutrition).toStrictEqual({ meals: {}, weights: [], entries: {} });
    const { nutrition, ...rest } = v4;
    expect(nutrition).toBeDefined();
    expect(rest).toStrictEqual(before);
    expect(local.snapshot()).toStrictEqual({ [STORAGE_KEY]: raw });
    expect(parseV4(getState()).nutrition).toStrictEqual({ meals: {}, weights: [], entries: {} });
  });

  test('有 nutrition 但沒有 entries（2026-11-19 的格式）：補 entries: {}，meals／weights 不動；重跑不變（冪等）', () => {
    const state = loadFixture('v4-no-nutrition.json');
    state.v4.nutrition = { meals: { [D]: ['breakfast'] }, weights: [{ date: D, kg: 86.7, at: '2026-11-20T07:02:00+09:00' }] };
    const old = JSON.parse(JSON.stringify(state.v4.nutrition));
    expect(parseV4(state).nutrition).toStrictEqual({ ...old, entries: {} }); // parse 不需要先補
    ensureV4(state);
    expect(state.v4.nutrition).toStrictEqual({ ...old, entries: {} });
    const once = JSON.stringify(state);
    ensureV4(state);
    expect(JSON.stringify(state)).toBe(once);
  });
});

test.describe('parseNutrition：entries', () => {
  test('v4-entries.json：好資料原樣通過（形狀、順序都不變）', () => {
    const state = loadFixture('v4-entries.json');
    const n = parseV4(state).nutrition;
    expect(n.entries).toStrictEqual(state.v4.nutrition.entries);
    expect(n.meals).toStrictEqual(state.v4.nutrition.meals);
    expect(n.weights).toStrictEqual(state.v4.nutrition.weights);
    expect(Object.keys(n.entries)).toEqual(['2026-11-19', '2026-11-20']);
    expect(n.entries[D].map((e) => [e.slot, e.kcal, e.source])).toEqual([['lunch', 650, 'photo'], [null, 180, 'manual'], ['dinner', 820, 'manual']]);
    for (const e of Object.values(n.entries).flat()) expect(Object.keys(e)).toEqual(ENTRY_KEYS);
    expect(parseNutrition(n)).toStrictEqual(n); // 冪等
    expect(JSON.stringify(state)).toBe(JSON.stringify(loadFixture('v4-entries.json'))); // 不改動傳入資料
  });

  test('v4-entries-bad.json：壞項目過濾、數字四捨五入、超出範圍的營養素 → null、多餘欄位（圖片）不帶出', () => {
    const state = loadFixture('v4-entries-bad.json');
    const before = JSON.stringify(state);
    const n = parseV4(state).nutrition;
    expect(JSON.stringify(state)).toBe(before);
    // 丟掉：空陣列的日子、不是陣列的日子、不存在的日期 2026-02-30、格式不對的 20261120
    expect(Object.keys(n.entries)).toEqual([D, '2026-11-23', '2026-11-24']);
    const at = '2026-11-20T12:00:00+09:00';
    expect(n.entries[D]).toStrictEqual([
      { id: 'g1', at, slot: null, name: '四捨五入', kcal: 500, proteinG: 30, fatG: null, carbG: null, source: 'manual' },
      { id: 'g2', at: null, slot: null, name: '測試餐', kcal: 300, proteinG: null, fatG: 10, carbG: 30, source: 'manual' },
      { id: 'g3', at, slot: 'lunch', name: '很長的名稱'.repeat(8), kcal: 300, proteinG: 20, fatG: 10, carbG: 1000, source: 'photo' },
      { id: 'g4', at: null, slot: null, name: '只有必要欄位', kcal: 1, proteinG: null, fatG: null, carbG: null, source: 'manual' }
    ]);
    expect(JSON.stringify(n)).not.toContain('base64');
    for (const e of Object.values(n.entries).flat()) expect(Object.keys(e)).toEqual(ENTRY_KEYS);
    // 每天最多 20 筆：留前 20 筆
    expect(n.entries['2026-11-23'].map((e) => e.id)).toEqual(Array.from({ length: 20 }, (_, i) => `m${i}`));
    expect(n.entries['2026-11-24'][0].kcal).toBe(5000);
    // 打勾不因 entries 而被 parse 改動（要不要算由規則層決定）
    expect(n.meals).toStrictEqual({ [D]: ['breakfast', 'lunch'] });
    expect(parseNutrition(n)).toStrictEqual(n);
  });

  test('v4-entries-wrong-type.json：entries 是陣列 → 當成沒有，meals／weights 照常', () => {
    const n = parseV4(loadFixture('v4-entries-wrong-type.json')).nutrition;
    expect(n.entries).toStrictEqual({});
    expect(n.meals).toStrictEqual({ [D]: ['breakfast'] });
    expect(n.weights).toHaveLength(1);
  });

  test('任何型別的 nutrition／entries 都不丟例外', () => {
    const empty = { meals: {}, weights: [], entries: {} };
    for (const raw of [undefined, null, 0, 'x', [], true, { entries: null }, { entries: 'x' }, { entries: 7 }, { entries: [] },
      { entries: { [D]: null } }, { entries: { [D]: 'x' } }, { entries: { [D]: [[]] } }, { entries: { [D]: [{ id: 1, name: 'a', kcal: 1 }] } },
      { entries: { [D]: [{ id: 'a', name: null, kcal: 1 }] } }, { entries: { [D]: [{ id: 'a', name: 'a', kcal: NaN }] } },
      { entries: { [D]: [{ id: 'a', name: 'a', kcal: Infinity }] } }, { entries: { [D]: [{ id: 'x'.repeat(41), name: 'a', kcal: 1 }] } }]) {
      expect(parseNutrition(raw), JSON.stringify(raw)).toStrictEqual(empty);
    }
  });

  test('邊界值：kcal 1 與 5000、蛋白質與脂肪 0–500、碳水 0–1000；0.4 → 四捨五入後不合格', () => {
    const one = (extra) => parseNutrition({ entries: { [D]: [{ id: 'a', name: 'a', kcal: 100, ...extra }] } }).entries[D]?.[0] ?? null;
    expect(one({ kcal: 1 }).kcal).toBe(1);
    expect(one({ kcal: 5000 }).kcal).toBe(5000);
    expect(one({ kcal: 5000.4 }).kcal).toBe(5000);
    expect(one({ kcal: 5000.5 })).toBeNull();
    expect(one({ kcal: 0.4 })).toBeNull();
    expect(one({ kcal: 0.5 }).kcal).toBe(1);
    expect(one({ kcal: -5 })).toBeNull();
    expect(one({ proteinG: 0, fatG: 500, carbG: 1000 })).toMatchObject({ proteinG: 0, fatG: 500, carbG: 1000 });
    expect(one({ proteinG: 501, fatG: -1, carbG: 1001 })).toMatchObject({ proteinG: null, fatG: null, carbG: null });
    expect(one({ proteinG: 12.5, fatG: 7.4, carbG: '30' })).toMatchObject({ proteinG: 13, fatG: 7, carbG: null });
    expect(one({ name: 'あ'.repeat(40) }).name).toHaveLength(40);
    expect(one({ name: 'a'.repeat(41) }).name).toHaveLength(40);
    expect(one({ slot: '' }).slot).toBeNull();
    expect(one({ slot: 'snack' }).slot).toBe('snack');
  });
});

test.describe('addEntry', () => {
  test('回傳 id；寫入的形狀＝契約的 Entry；at 是含 offset 的 ISO；parse 後不變', () => {
    const v4 = defaultV4();
    const id = addEntry(v4, manual({ slot: 'lunch', name: '  牛肉麵 ', kcal: 649.6, proteinG: 31.5, fatG: 20.2, carbG: 80, source: 'photo' }));
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(v4.nutrition.entries).toStrictEqual({ [D]: [{ id, at: '2026-11-20T12:35:00+09:00', slot: 'lunch', name: '牛肉麵', kcal: 650, proteinG: 32, fatG: 20, carbG: 80, source: 'photo' }] });
    expect(Object.keys(v4.nutrition.entries[D][0])).toEqual(ENTRY_KEYS);
    expect(parseNutrition(v4.nutrition).entries).toStrictEqual(v4.nutrition.entries);
  });

  test('slot 有值 → 拿掉該餐的打勾（其他餐、別天不動）；slot 是 null → 打勾不動', () => {
    const v4 = defaultV4();
    toggleMeal(v4, D, 'breakfast');
    toggleMeal(v4, D, 'lunch');
    toggleMeal(v4, '2026-11-19', 'lunch');
    addEntry(v4, manual({ name: '其他：拿鐵', kcal: 180 }));
    expect(v4.nutrition.meals).toStrictEqual({ [D]: ['breakfast', 'lunch'], '2026-11-19': ['lunch'] });
    addEntry(v4, manual({ slot: 'lunch' }));
    expect(v4.nutrition.meals).toStrictEqual({ [D]: ['breakfast'], '2026-11-19': ['lunch'] });
    addEntry(v4, manual({ slot: 'breakfast' }));
    expect(v4.nutrition.meals).toStrictEqual({ '2026-11-19': ['lunch'] }); // 當天清空就拿掉日期
    addEntry(v4, manual({ slot: 'dinner' })); // 當天沒有打勾也不出錯
    expect(v4.nutrition.entries[D].map((e) => e.slot)).toEqual([null, 'lunch', 'breakfast', 'dinner']);
  });

  test('不合格 → 回 null，什麼都不寫（打勾也不動）', () => {
    const v4 = defaultV4();
    toggleMeal(v4, D, 'lunch');
    const before = JSON.stringify(v4);
    for (const bad of [{ name: '' }, { name: '   ' }, { name: null }, { name: 42 }, { kcal: 0 }, { kcal: 0.4 }, { kcal: 5001 }, { kcal: -1 }, { kcal: '500' },
      { kcal: NaN }, { kcal: null }, { kcal: undefined }, { date: '2026-02-30' }, { date: '20261120' }, { date: null }]) {
      expect(addEntry(v4, manual({ slot: 'lunch', ...bad })), JSON.stringify(bad)).toBeNull();
      expect(JSON.stringify(v4)).toBe(before);
    }
    expect(addEntry(v4)).toBeNull();
    expect(JSON.stringify(v4)).toBe(before);
  });

  test('預設值與修正：省略營養素 → null；超出範圍 → null；source 不認得 → manual；名稱截到 40 字；kcal 邊界 1／5000', () => {
    const v4 = defaultV4();
    addEntry(v4, { date: D, name: '只有名稱與熱量', kcal: 1, now: T });
    addEntry(v4, manual({ name: 'あ'.repeat(60), kcal: 5000, proteinG: 501, fatG: -1, carbG: 1001, source: 'camera', slot: 7 }));
    expect(v4.nutrition.entries[D][0]).toMatchObject({ slot: null, kcal: 1, proteinG: null, fatG: null, carbG: null, source: 'manual' });
    expect(v4.nutrition.entries[D][1]).toMatchObject({ slot: null, name: 'あ'.repeat(40), kcal: 5000, proteinG: null, fatG: null, carbG: null, source: 'manual' });
  });

  test('多餘的參數（例如圖片）不會進 state', () => {
    const v4 = defaultV4();
    addEntry(v4, manual({ source: 'photo', image: 'data:image/jpeg;base64,AAAA', items: [{ name: 'x' }], confidence: 'high' }));
    expect(Object.keys(v4.nutrition.entries[D][0])).toEqual(ENTRY_KEYS);
    expect(JSON.stringify(v4)).not.toContain('base64');
  });

  test('id：同一毫秒連加也不重複；刪掉再加也不重複', () => {
    const v4 = defaultV4();
    const ids = Array.from({ length: 5 }, () => addEntry(v4, manual()));
    expect(new Set(ids).size).toBe(5);
    expect(removeEntry(v4, D, ids[1])).toBe(true);
    const again = addEntry(v4, manual());
    expect(ids).not.toContain(again);
    expect(new Set(v4.nutrition.entries[D].map((e) => e.id)).size).toBe(5);
  });

  test('每天最多 20 筆：第 21 筆回 null、不寫入、不拿掉打勾；別天不受影響；刪一筆後可以再加', () => {
    const v4 = defaultV4();
    const ids = Array.from({ length: 20 }, (_, i) => addEntry(v4, manual({ kcal: 100 + i })));
    expect(ids.every((x) => typeof x === 'string')).toBe(true);
    expect(new Set(ids).size).toBe(20);
    toggleMeal(v4, D, 'lunch');
    const before = JSON.stringify(v4);
    expect(addEntry(v4, manual({ slot: 'lunch' }))).toBeNull();
    expect(JSON.stringify(v4)).toBe(before);
    expect(typeof addEntry(v4, manual({ date: '2026-11-21' }))).toBe('string');
    expect(removeEntry(v4, D, ids[0])).toBe(true);
    expect(typeof addEntry(v4, manual({ slot: 'lunch' }))).toBe('string');
    expect(v4.nutrition.entries[D]).toHaveLength(20);
    expect(parseNutrition(v4.nutrition).entries[D]).toHaveLength(20);
    expect(v4.nutrition.meals[D]).toBeUndefined();
  });

  test('舊資料（沒有 nutrition／entries）與型別錯的 entries：直接可加，不丟例外', () => {
    const old = loadFixture('v4-no-nutrition.json').v4;
    expect(typeof addEntry(old, manual())).toBe('string');
    expect(old.nutrition.entries[D]).toHaveLength(1);

    const wrong = loadFixture('v4-entries-wrong-type.json').v4;
    expect(typeof addEntry(wrong, manual({ slot: 'breakfast' }))).toBe('string');
    expect(parseNutrition(wrong.nutrition).entries[D]).toHaveLength(1);
    expect(wrong.nutrition.meals).toStrictEqual({});
    expect(wrong.nutrition.weights).toHaveLength(1);

    const bad = loadFixture('v4-entries-bad.json').v4;
    bad.nutrition.entries['2026-11-22'] = { not: 'array' };
    expect(typeof addEntry(bad, manual({ date: '2026-11-22' }))).toBe('string');
    expect(typeof addEntry(bad, manual({ slot: 'lunch' }))).toBe('string'); // 當天有壞項目也能加
    expect(parseNutrition(bad.nutrition).entries[D].map((e) => e.id).slice(0, 4)).toEqual(['g1', 'g2', 'g3', 'g4']);
    expect(bad.nutrition.meals[D]).toEqual(['breakfast']);
  });
});

test.describe('removeEntry', () => {
  test('刪到回 true、刪不到回 false；當天刪光就拿掉日期；不會把打勾加回去', () => {
    const v4 = loadFixture('v4-entries.json').v4;
    expect(removeEntry(v4, D, 'nope')).toBe(false);
    expect(removeEntry(v4, '2026-11-18', 'e-mi7cjq00-0')).toBe(false);
    expect(removeEntry(v4, 'bad-date', 'e-mi7cjq00-0')).toBe(false);
    expect(removeEntry(v4, D, null)).toBe(false);
    expect(v4.nutrition.entries[D]).toHaveLength(3);
    expect(removeEntry(v4, D, 'e-mi7h9a00-1')).toBe(true);
    expect(removeEntry(v4, D, 'e-mi7h9a00-1')).toBe(false);
    expect(v4.nutrition.entries[D].map((e) => e.name)).toEqual(['牛肉麵', '便當（排骨）']);
    expect(removeEntry(v4, '2026-11-19', 'e-mi5x2k00-0')).toBe(true);
    expect('2026-11-19' in v4.nutrition.entries).toBe(false);
    expect(v4.nutrition.meals).toStrictEqual({ '2026-11-19': ['breakfast', 'dinner'], [D]: ['breakfast'] });
  });

  test('舊資料與型別錯的 entries：回 false，不丟例外', () => {
    expect(removeEntry(loadFixture('v4-no-nutrition.json').v4, D, 'x')).toBe(false);
    expect(removeEntry(loadFixture('v4-entries-wrong-type.json').v4, D, 'a')).toBe(false);
    const bad = loadFixture('v4-entries-bad.json').v4;
    expect(removeEntry(bad, '2026-11-22', 'x')).toBe(false);
    expect(removeEntry(bad, D, 'g2')).toBe(true); // 重複 id 的兩筆一起刪
    expect(parseNutrition(bad.nutrition).entries[D].map((e) => e.id)).toEqual(['g1', 'g3', 'g4']);
  });
});

test.describe('toggleMeal／setWeight 行為不變', () => {
  test('有 entries 時打勾照舊切換，entries 不動', () => {
    const v4 = loadFixture('v4-entries.json').v4;
    const entries = JSON.stringify(v4.nutrition.entries);
    expect(toggleMeal(v4, D, 'lunch')).toBe(true);
    expect(v4.nutrition.meals[D]).toEqual(['breakfast', 'lunch']);
    expect(toggleMeal(v4, D, 'lunch')).toBe(false);
    expect(toggleMeal(v4, D, 'breakfast')).toBe(false);
    expect(D in v4.nutrition.meals).toBe(false);
    setWeight(v4, { date: D, kg: 87, now: T });
    expect(v4.nutrition.weights.map((w) => [w.date, w.kg])).toEqual([['2026-11-19', 86.5], [D, 87]]);
    expect(JSON.stringify(v4.nutrition.entries)).toBe(entries);
  });
});

test.describe('載入、備份、匯入（容器不認得 v4，原樣保留）', () => {
  test('v4-entries.json：載入 ok、不寫入、v4 原樣', async () => {
    const raw = readFixture('v4-entries.json');
    const { local, result } = await loadCurrent('v4-entries.json');
    expect(result).toStrictEqual({ status: 'ok', error: null });
    expect(getState().v4).toStrictEqual(JSON.parse(raw).v4);
    expect(ensureV4(getState()).created).toBe(false);
    expect(local.snapshot()).toStrictEqual({ [STORAGE_KEY]: raw });
  });

  test('備份 → 匯入 → 套用：entries 原樣往返（含存檔後重新載入）', async () => {
    const { local } = await loadCurrent('v4-entries.json');
    const v4 = ensureV4(getState()).v4;
    const id = addEntry(v4, manual({ slot: 'snack', name: '香蕉', kcal: 105, proteinG: 1, fatG: 0, carbG: 27 }));
    expect(await saveState()).toBe(true);
    const expected = JSON.parse(JSON.stringify(v4));
    const { text, stamped } = buildBackup(getState(), NOW);
    expect(stamped.v4).toStrictEqual(expected);

    // 換一台裝置（目前是沒有 nutrition 的舊資料）匯入
    await loadCurrent('v4-no-nutrition.json');
    const r = parseImport(text, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming.v4).toStrictEqual(expected);
    expect(getState().v4.nutrition).toBeUndefined(); // 預覽階段不覆蓋
    expect(await applyImport(r.incoming)).toBe(true);
    expect(getState().v4).toStrictEqual(expected);

    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    installGlobals({ local: new MemoryStorage({ [STORAGE_KEY]: stored }) });
    expect((await loadState({ now: NOW })).status).toBe('ok');
    const n = parseV4(getState()).nutrition;
    expect(n.entries).toStrictEqual(expected.nutrition.entries);
    expect(n.entries[D].at(-1)).toMatchObject({ id, slot: 'snack', name: '香蕉', kcal: 105 });
    expect(local.getItem(STORAGE_KEY)).not.toBe(stored); // 原裝置的資料沒被動到
  });

  for (const name of ['v4-entries-bad.json', 'v4-entries-wrong-type.json']) {
    test(`${name}：載入不出錯卡、匯入不丟例外（壞的 entries 原樣保留，讀取時才過濾）`, async () => {
      const raw = readFixture(name);
      const { local, result } = await loadCurrent(name);
      expect(result).toStrictEqual({ status: 'ok', error: null });
      expect(local.snapshot()).toStrictEqual({ [STORAGE_KEY]: raw });
      expect(() => parseV4(getState())).not.toThrow();

      await loadCurrent('v4-entries.json');
      const r = parseImport(raw, { now: NOW });
      expect(r.ok).toBe(true);
      expect(await applyImport(r.incoming)).toBe(true);
      const { v4, created } = ensureV4(getState());
      expect(created).toBe(false);
      const n = parseV4(getState()).nutrition;
      for (const e of Object.values(n.entries).flat()) expect(Object.keys(e)).toEqual(ENTRY_KEYS);
      expect(typeof addEntry(v4, manual({ date: '2026-11-25' }))).toBe('string');
      expect(await saveState()).toBe(true);
    });
  }
});
