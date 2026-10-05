/* qa-checker：遷移 e2e（PLAN.md §5 #1、#2）。預期值逐字取自 tests/fixtures/README.md 第 1 節。
   流程：fixture 原文寫入 localStorage → 開 App → HOME 數值、錯誤卡、提醒卡 → 主 key 在存檔前未被覆寫
   → 觸發一次存檔（設定切換兩次）→ storage 為 v3 且 game 正確 → reload 再存一次 → 與第一次逐字相同；
   另開一個全新 context 再跑一次，結果也逐字相同。
   V1：loadState() 在 phase.startedAt 缺少時以載入當下（假時鐘 NOW）補上，第一次存檔時寫入；
   B1 早安打卡 fixture（v3-checkin、v3-checkin-reverted-to-v2）另一組：打卡紀錄不重複、三環的眠＝engine 算的分數。 */
import {
  test, expect, readFixture, openApp, seedState, contextOptions, watchContext, assertWatchClean,
  expectHome, triggerSave, rawMain, storedState, storageSnapshot, gotoTab, waitReady, appSummary, nodeEngine, withStartedAt,
  MAIN_KEY, BAK_V2, NOW_ISO
} from './helpers.js';

const MSG_REPAIRED = '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。';
const MSG_RECOVERED = '讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。';

/* README §1 表格；reminder = README §3 在 2026-10-02 15:30 的提醒結果；lastBackupAt = 載入後的 meta.lastBackupAt */
const CASES = [
  { file: 'v1-minimal.json', status: 'migrated', level: 2, xp: 35, streak: [1, 2, '2026-08-05'], life: [1, 2, '2026-08-05'], reminder: true, lastBackupAt: null },
  { file: 'v2-real.json', status: 'migrated', level: 3, xp: 361, streak: [9, 11, '2026-09-28'], life: [9, 11, '2026-09-28'], reminder: true, lastBackupAt: null },
  { file: 'v2-missing-fields.json', status: 'migrated', level: 2, xp: 60, streak: [3, 3, '2026-09-20'], life: [3, 3, '2026-09-20'], reminder: true, lastBackupAt: null },
  { file: 'v2-wrong-types.json', status: 'repaired', level: 3, xp: 120, streak: [4, 6, '2026-09-20'], life: [4, 4, '2026-09-20'], reminder: true, lastBackupAt: null },
  { file: 'empty-arrays.json', status: 'migrated', level: 2, xp: 0, streak: [0, 0, null], life: [0, 0, null], reminder: false, lastBackupAt: null },
  { file: 'v3.json', status: 'ok', level: 3, xp: 396, streak: [12, 12, '2026-10-01'], life: [12, 12, '2026-10-01'], reminder: false, lastBackupAt: '2026-09-30T21:15:00+09:00' },
  { file: 'v3-reverted-to-v2.json', status: 'migrated', level: 3, xp: 406, streak: [13, 13, '2026-10-02'], life: [13, 13, '2026-10-02'], reminder: false, lastBackupAt: '2026-09-30T21:15:00+09:00' },
  { file: 'corrupt-state.txt', status: 'recovered', level: 2, xp: 0, streak: [0, 0, null], life: [0, 0, null], reminder: false, lastBackupAt: null }
];

const streakObj = ([current, best, lastDate]) => ({ current, best, lastDate });

/* 一次完整的「載入 → 檢查 → 存檔 → reload → 再存」，回傳第一次存檔後的主 key 原文 */
async function migrateOnce(page, c) {
  const raw = readFixture(c.file);
  await openApp(page, { seed: seedState(raw) });
  const [current, best] = c.streak;

  /* HOME 正常顯示、數值正確 */
  await expectHome(page, { level: c.level, xp: c.xp, current, best });
  await expect(page.locator('#h-date')).toHaveText('週五 10/2');
  await expect(page.locator('#h-start')).not.toHaveText('—');

  /* 錯誤卡只在 repaired／recovered 出現；備份 key 存了原字串 */
  const err = page.locator('#err-card');
  if (c.status === 'repaired' || c.status === 'recovered') {
    await expect(err).toBeVisible();
    await expect(err).toHaveClass('banner danger');
    await expect(page.locator('#err-text')).toHaveText(c.status === 'repaired' ? MSG_REPAIRED : MSG_RECOVERED);
    await expect(page.locator('#err-download')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), BAK_V2)).toBe(raw);
  } else {
    await expect(err).toBeHidden();
    expect(Object.keys(await storageSnapshot(page))).toEqual([MAIN_KEY]);
  }
  /* 提醒卡（README §3） */
  if (c.reminder) await expect(page.locator('#bk-reminder')).toBeVisible();
  else await expect(page.locator('#bk-reminder')).toBeHidden();

  /* 主 key 在存檔前沒有被覆寫（任何 status） */
  expect(await rawMain(page)).toBe(raw);

  /* 觸發一次存檔 → v3 */
  await triggerSave(page);
  const saved1 = await rawMain(page);
  const s = JSON.parse(saved1);
  expect(s.version).toBe(3);
  expect(s.level).toBe(c.level);
  expect(s.xp).toBe(c.xp);
  expect(s.streak).toEqual(streakObj(c.streak));
  expect(s.game.xp).toEqual({ move: c.xp, sleep: 0, explore: 0, total: c.xp });
  expect(s.game.streaks.train).toEqual(streakObj(c.streak));
  expect(s.game.streaks.life).toEqual(streakObj(c.life));
  expect(s.game.freezeTokens).toBe(0);
  expect(s.game.achievements).toEqual({});
  expect(s.game.perfectDays).toEqual([]);
  /* v3 新欄位（PLAN.md §4） */
  expect(s.habits.sleep.log).toEqual([]);
  expect(s.habits.explore.items).toHaveLength(1);
  expect(s.habits.explore.items[0]).toMatchObject({ id: 'dj', name: 'DJ', minimalAction: '練 1 個 transition', status: 'trying' });
  expect(s.habits.explore.log).toEqual([]);
  expect(s.goals).toEqual({ identity: '我是獨立、自律、持續成長的人。', weekly: [], season: [] });
  /* V1：載入時補上階段起點（假時鐘的載入當下），第一次存檔寫入 */
  expect(s.phase).toEqual({ current: 'P1', startedAt: NOW_ISO, history: [] });
  expect(s.settings).toMatchObject({ bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 });
  expect(s.meta).toEqual({ lastBackupAt: c.lastBackupAt });
  /* DJ createdAt：v1／v2（含 recovered 的空白資料）= 載入當下（假時鐘，含 +09:00）；已遷移過的 v3 保留原值 */
  const hadGame = c.file.startsWith('v3');
  expect(s.habits.explore.items[0].createdAt).toBe(hadGame ? '2026-09-28T07:30:00+09:00' : NOW_ISO);
  if (c.file === 'v3.json') {
    /* v3：遷移是 no-op，存檔後內容與 fixture 相同（只多了載入時補上的 phase.startedAt） */
    expect(s).toEqual(withStartedAt(raw, NOW_ISO));
  }
  if (c.status === 'migrated' || c.status === 'ok') {
    /* 舊資料不能壞：sessions、每一種 PR、每一種身體指標（含 body.sleep，D13 不併入 habits.sleep.log）、profile 原樣保留 */
    const orig = JSON.parse(raw);
    expect(s.sessions).toEqual(orig.sessions);
    for (const [k, v] of Object.entries(orig.prs || {})) expect(s.prs[k], `prs.${k}`).toEqual(v);
    for (const [k, v] of Object.entries(orig.body || {})) expect(s.body[k], `body.${k}`).toEqual(v);
    if (orig.profile) expect(s.profile).toEqual(orig.profile);
    for (const [k, v] of Object.entries(orig.settings || {})) expect(s.settings[k], `settings.${k}`).toBe(v);
    /* v1→v2 補齊的桶 */
    expect(Object.keys(s.prs).sort()).toEqual(['hrp', 'pike', 'plank', 'pushup', 'run2mi', 'sideplank']);
    expect(Object.keys(s.body).sort()).toEqual(['arm', 'rhr', 'shoulder', 'sleep', 'thigh', 'waist', 'weight']);
  }

  /* 存檔後主 key 已是 v3；reload（不再寫入 fixture）→ 數值相同、不再出現錯誤卡 */
  await page.reload();
  await waitReady(page);
  await expectHome(page, { level: c.level, xp: c.xp, current, best });
  await expect(page.locator('#err-card')).toBeHidden();

  /* 再存一次 → 逐字相同（冪等） */
  await triggerSave(page);
  expect(await rawMain(page)).toBe(saved1);

  /* RECORDS／BODY 能畫出遷移後的資料 */
  await gotoTab(page, 's-hist');
  await expect(page.locator('#hist-heat i')).toHaveCount(56);
  const prsShown = Math.min(5, s.prs.hrp.length);
  if (prsShown) await expect(page.locator('#pr-hrp .prline')).toHaveCount(prsShown);
  else await expect(page.locator('#pr-hrp')).toContainText('尚無紀錄');
  await gotoTab(page, 's-body');
  await expect(page.locator('#bd-verdict')).not.toBeEmpty();
  await gotoTab(page, 's-home');
  return saved1;
}

test.describe('遷移：fixture 載入後畫面正常、XP 與連續天數正確、冪等', () => {
  for (const c of CASES) {
    test(`${c.file} → ${c.status}：L${c.level}、XP ${c.xp}、連續 ${c.streak[0]}／最佳 ${c.streak[1]}`, async ({ page, browser, guard }, testInfo) => {
      const first = await migrateOnce(page, c);

      /* 跑兩次結果相同：全新 context 從同一份 fixture 再跑一次 */
      const ctx = await browser.newContext(contextOptions({ baseURL: testInfo.project.use.baseURL }));
      const w = watchContext(ctx);
      try {
        const page2 = await ctx.newPage();
        const second = await migrateOnce(page2, c);
        expect(second).toBe(first);
      } finally {
        await ctx.close();
      }
      assertWatchClean(w, '第二次執行');
    });
  }

  test('v3-reverted-to-v2：XP 不重複計算（不是 396＋406＝802，也不是 396）', async ({ page }) => {
    const raw = readFixture('v3-reverted-to-v2.json');
    const before = JSON.parse(raw);
    expect(before.version).toBe(2);
    expect(before.game.xp.move).toBe(396); // 舊版 App 沒動 game
    await openApp(page, { seed: seedState(raw) });
    await expectHome(page, { level: 3, xp: 406, current: 13, best: 13 });
    await triggerSave(page);
    const s = await storedState(page);
    expect(s.version).toBe(3);
    expect(s.game.xp.move).toBe(406);
    expect(s.game.xp.total).toBe(406);
    expect(s.sessions.filter((x) => x.date === '2026-10-02')).toEqual([{ date: '2026-10-02', type: 'full', xp: 10 }]);
    /* 再 reload、存檔兩次都不變 */
    for (let i = 0; i < 2; i++) {
      await page.reload();
      await waitReady(page);
      await triggerSave(page);
      const again = await storedState(page);
      expect(again.game.xp).toEqual({ move: 406, sleep: 0, explore: 0, total: 406 });
      expect(again.xp).toBe(406);
    }
  });

  test('不認得的欄位原樣保留（PLAN.md §4「其他：既有、不變」）', async ({ page }) => {
    const orig = JSON.parse(readFixture('v2-real.json'));
    orig.customField = { note: '使用者自己加的', n: [1, 2, 3] };
    orig.settings.customToggle = 'keep';
    await openApp(page, { seed: seedState(JSON.stringify(orig)) });
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    await triggerSave(page);
    const s = await storedState(page);
    expect(s.customField).toEqual(orig.customField);
    expect(s.settings.customToggle).toBe('keep');
    expect(s.version).toBe(3);
  });

  test('沒有任何資料（第一次開 App）：HOME 正常、不出現錯誤卡與提醒卡、開 App 不寫入 storage', async ({ page }) => {
    await openApp(page);
    await expectHome(page, { level: 2, xp: 0, current: 0, best: 0 });
    await expect(page.locator('#err-card')).toBeHidden();
    await expect(page.locator('#bk-reminder')).toBeHidden();
    expect(await storageSnapshot(page)).toEqual({});
    await triggerSave(page);
    const s = await storedState(page);
    expect(s.version).toBe(3);
    expect(s.game.xp.total).toBe(0);
    expect(s.habits.explore.items[0].createdAt).toBe(NOW_ISO);
  });
});

/* ---------- B1 早安打卡 fixture（README「B1 早安打卡 fixture（V1）」） ----------
   載入兩次（各自全新 context）結果逐字相同；打卡紀錄 3 筆、日期不重複；今日三環的眠與圖例＝engine 對同一份紀錄算出的分數；
   被舊版改回 version 2（D12）：xp 414、game.xp.move 414（不是 411＋414），3 筆打卡與 plus 都保留。 */
const B1_CASES = [
  { file: 'v3-checkin.json', status: 'ok', xp: 411, streak: { current: 14, best: 14, lastDate: '2026-10-03' } },
  { file: 'v3-checkin-reverted-to-v2.json', status: 'migrated', xp: 414, streak: { current: 15, best: 15, lastDate: '2026-10-04' } }
];
const B1_NOW = '2026-10-04T07:30:00+09:00'; // README：今天已打卡

async function b1Once(page, c) {
  const raw = readFixture(c.file);
  await openApp(page, { now: B1_NOW, seed: seedState(raw) });
  await expect(page.locator('#err-card')).toBeHidden();
  expect(await rawMain(page), '存檔前主 key 不變').toBe(raw);
  /* 今日：打卡過了 → 下一步不是早安打卡；三環的眠＝engine 算的今天分數 */
  const { sum } = await appSummary(page);
  const want = nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules).pillars.sleep;', { state: JSON.parse(raw), now: B1_NOW });
  expect(sum.pillars.sleep.checkedIn).toBe(true);
  expect(want.checkedIn).toBe(true);
  await expect(page.locator('#h-start')).not.toHaveAttribute('data-kind', 'checkin');
  await expect(page.locator('#h-legend [data-go="s-checkin"] .lg-val').first()).toHaveText(`${want.xp} / ${want.max}`);
  await expect(page.locator('#h-rings-svg')).toHaveAttribute('aria-label', new RegExp(`眠 ${want.xp} / ${want.max} XP`));
  await triggerSave(page);
  const saved = await rawMain(page);
  const s = JSON.parse(saved);
  expect(s.version).toBe(3);
  expect(s.xp).toBe(c.xp);
  expect(s.streak).toEqual(c.streak);
  expect(s.game.xp).toEqual({ move: c.xp, sleep: 0, explore: 0, total: c.xp });
  const dates = s.habits.sleep.log.map((e) => e.date);
  expect(dates).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);
  expect(new Set(dates).size, '打卡紀錄的日期不重複').toBe(dates.length);
  expect(s.habits.sleep.log).toEqual(JSON.parse(raw).habits.sleep.log);
  expect(s.sessions.find((x) => x.date === '2026-10-02')).toEqual({ date: '2026-10-02', type: 'full', xp: 10, plus: true });
  expect(s.phase.startedAt, '已有的階段起點不覆寫').toBe('2026-10-02T06:50:10+09:00');
  /* 再開一次、再存一次：逐字相同（冪等） */
  await page.reload();
  await waitReady(page);
  await triggerSave(page);
  expect(await rawMain(page)).toBe(saved);
  return saved;
}

test.describe('遷移：B1 早安打卡 fixture', () => {
  for (const c of B1_CASES) {
    test(`${c.file} → ${c.status}：打卡 3 筆不重複、三環的眠＝engine、跑兩次結果相同`, async ({ page, browser }, testInfo) => {
      const first = await b1Once(page, c);
      const ctx = await browser.newContext(contextOptions({ baseURL: testInfo.project.use.baseURL }));
      const w = watchContext(ctx);
      try {
        const second = await b1Once(await ctx.newPage(), c);
        expect(second).toBe(first);
      } finally {
        await ctx.close();
      }
      assertWatchClean(w, '第二次執行');
    });
  }
});
