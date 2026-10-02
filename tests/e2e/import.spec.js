/* qa-checker：匯入 e2e（PLAN.md §2 #8、§5 #5；CLAUDE.md §10「匯入會覆蓋 → 先預覽差異並二次確認」）。
   兩條路：SETUP「選擇備份檔匯入」（file chooser）與「貼上 JSON → 匯入」。
   壞檔：#imp-error 顯示錯誤、所有 localStorage key 與值都不變、不白屏。
   好檔：差異預覽列正確 → 第一次按確認不套用 → 第二次才套用 → pre-import 另存覆蓋前資料；取消 → 不變。
   預期值取自 tests/fixtures/README.md 第 2 節。 */
import {
  test, expect, readFixture, fixturePath, openApp, seedState, storageSnapshot, storedState, rawMain,
  expectHome, gotoTab, expectGlossaryClean, identifierPaths, MAIN_KEY, PRE_IMPORT_KEY, NOW_ISO
} from './helpers.js';

const HEADER = '無法匯入，目前的資料沒有任何變更：';
const CONFIRM = '確認匯入（覆蓋目前資料）';
const ARMED = '再按一次，確認覆蓋';
const NOT_JSON = '檔案不是有效的 JSON 格式，可能已損壞或不是 Daily Ten 的備份檔';
const TOO_LARGE = '檔案太大（超過 5,000,000 字元），不是 Daily Ten 的備份檔';

/* README §2：四種壞檔（＋另外兩個載入時可修補、匯入時嚴格驗證會擋的檔） */
const BAD = [
  { file: 'import-bad-not-json.txt', lines: [NOT_JSON] },
  { file: 'import-bad-missing-fields.json', lines: ['缺少必要欄位：連續天數（streak）', '缺少必要欄位：訓練紀錄（sessions）'] },
  { file: 'import-bad-wrong-types.json', count: 4, paths: ['（xp）', '（sessions）', '（prs.hrp[0].date）', '（settings.voice）'], includes: ['XP（xp）應為數字'] },
  { file: 'import-bad-oversized.json', count: 6, paths: ['（level）', '（xp）', '（streak.current）', '（streak.best）', '（prs.hrp[0].reps）', '（body.weight[0].v）'], includes: ['XP（xp）數值超出合理範圍（應介於 0–10,000,000）'] }
];
const EXTRA_BAD = [
  { file: 'corrupt-state.txt', lines: [NOT_JSON] },
  { file: 'v2-missing-fields.json', count: 1, paths: ['（streak.best）'] },
  { file: 'v2-wrong-types.json', count: 10 } // 20 筆只顯示前 10 筆
];

/* README §2「好檔的差異摘要」（目前 = v3.json，匯入 v2-real.json） */
const ROWS_V3_TO_V2REAL = [
  ['version', '版本', 'v3', 'v2 → v3', true],
  ['level', '等級', 'L3', 'L3', false],
  ['xp', 'XP', '396', '361', true],
  ['streak', '連續天數', '12 天', '9 天', true],
  ['bestStreak', '最佳連續', '12 天', '11 天', true],
  ['lastSession', '最後訓練日', '2026-10-01', '2026-09-28', true],
  ['sessions', '訓練紀錄筆數', '35 筆', '32 筆', true],
  ['prs', 'PR 筆數', '11 筆', '11 筆', false],
  ['body', '身體指標筆數', '31 筆', '30 筆', true],
  ['sleepLog', '睡眠紀錄筆數', '0 筆', '0 筆', false],
  ['lastBackup', '最後備份', '2026-09-30 21:15', '從未備份', true]
];
const WARNINGS_V3_TO_V2REAL = [
  '⚠ 訓練紀錄會從 35 筆變成 32 筆',
  '⚠ 身體指標紀錄會從 31 筆變成 30 筆',
  '⚠ 匯入檔的最後訓練日（2026-09-28）比目前（2026-10-01）舊'
];

async function chooseFile(page, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
  await chooser.setFiles(file);
}
async function paste(page, text) {
  await page.fill('#exp-area', text);
  await page.click('#imp-btn');
}
const errorLines = (page) => page.locator('#imp-error > div').allTextContents();
const previewRows = (page) => page.locator('#imp-rows .prline[data-key]').evaluateAll((els) => els.map((el) => [
  el.dataset.key, el.children[0].textContent, el.children[1].textContent, el.children[2].textContent, el.dataset.changed === 'true'
]));
const collectedTexts = [];
async function collectTexts(page) {
  collectedTexts.push(...await page.locator('#imp-error > div, #imp-rows .prline > *, #imp-warnings > div, #io-msg, #imp-confirm, #imp-cancel, #imp-preview .small')
    .allTextContents());
}

async function expectBadImport(page, c, route) {
  const before = await storageSnapshot(page);
  if (route === 'file') await chooseFile(page, fixturePath(c.file));
  else await paste(page, readFixture(c.file));
  const err = page.locator('#imp-error');
  await expect(err).toHaveClass('banner danger');
  await expect(err).toBeVisible();
  const lines = await errorLines(page);
  expect(lines[0]).toBe(HEADER);
  const msgs = lines.slice(1).map((l) => l.replace(/^・/, ''));
  if (c.lines) expect(msgs).toEqual(c.lines);
  if (c.count) expect(msgs).toHaveLength(c.count);
  for (const p of c.paths || []) expect(msgs.some((m) => m.includes(p)), `${c.file} 應指出 ${p}`).toBe(true);
  for (const m of c.includes || []) expect(msgs).toContain(m);
  await expect(page.locator('#imp-preview')).toBeHidden();
  await collectTexts(page);
  /* 所有 localStorage key 與值都不變；畫面仍可用 */
  expect(await storageSnapshot(page)).toEqual(before);
  await expect(page.locator('#s-setup')).toBeVisible();
}

async function expectRowsAndWarnings(page, rows, warnings) {
  await expect(page.locator('#imp-preview')).toBeVisible();
  await expect(page.locator('#imp-rows .prline').first()).toHaveText('項目目前匯入後');
  expect(await previewRows(page)).toEqual(rows.map(([k, label, cur, inc, changed]) => [k, label, cur, inc, changed]));
  const w = page.locator('#imp-warnings');
  if (warnings.length) {
    await expect(w).toHaveClass('banner warn');
    expect(await page.locator('#imp-warnings > div').allTextContents()).toEqual(warnings);
  } else {
    await expect(w).toHaveClass('banner');
    await expect(w).toBeHidden();
  }
  await expect(page.locator('#imp-confirm')).toHaveText(CONFIRM);
  await collectTexts(page);
}

test.describe('匯入：壞檔一律擋下、原資料不變、不白屏', () => {
  for (const route of ['file', 'paste']) {
    test(`四種壞檔＋另外 3 個不合格檔（${route === 'file' ? '選擇備份檔' : '貼上 JSON'}）`, async ({ page }) => {
      await openApp(page, { seed: seedState(readFixture('v3.json')) });
      await gotoTab(page, 's-setup');
      for (const c of [...BAD, ...EXTRA_BAD]) await expectBadImport(page, c, route);
      /* 壞檔之後換好檔：錯誤卡收起、出現預覽（確認流程可恢復） */
      if (route === 'file') await chooseFile(page, fixturePath('v2-real.json'));
      else await paste(page, readFixture('v2-real.json'));
      await expect(page.locator('#imp-error')).toHaveClass('banner');
      await expect(page.locator('#imp-error')).toBeHidden();
      await expect(page.locator('#imp-preview')).toBeVisible();
      await page.click('#imp-cancel');
      /* 不白屏：HOME 數值仍是 v3 */
      await gotoTab(page, 's-home');
      await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
      expect(await rawMain(page)).toBe(readFixture('v3.json'));
      expectGlossaryClean(collectedTexts);
    });
  }

  test('超過 5,000,000 字元：貼上與選檔都顯示 too_large、資料不變', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-setup');
    const before = await storageSnapshot(page);
    /* 貼上：5,000,001 個字元的純文字 */
    await paste(page, 'x'.repeat(5_000_001));
    expect(await errorLines(page)).toEqual([HEADER, `・${TOO_LARGE}`]);
    await expect(page.locator('#imp-preview')).toBeHidden();
    expect(await storageSnapshot(page)).toEqual(before);
    await page.fill('#exp-area', '');
    /* 選檔：合法的 v2 JSON 後面補空白到超過上限（仍是有效 JSON，先擋大小） */
    const big = readFixture('v2-real.json') + ' '.repeat(5_000_000);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
    await chooser.setFiles({ name: 'daily-ten-backup-big.json', mimeType: 'application/json', buffer: Buffer.from(big) });
    await expect(page.locator('#imp-error')).toHaveClass('banner danger');
    expect(await errorLines(page)).toEqual([HEADER, `・${TOO_LARGE}`]);
    expect(await storageSnapshot(page)).toEqual(before);
    /* 剛好 5,000,000 字元不算太大（改由 JSON 解析判斷） */
    await paste(page, 'y'.repeat(5_000_000));
    expect(await errorLines(page)).toEqual([HEADER, `・${NOT_JSON}`]);
    expect(await storageSnapshot(page)).toEqual(before);
    await gotoTab(page, 's-home');
    await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
  });
});

test.describe('匯入：好檔 → 差異預覽 → 二次確認', () => {
  test('選檔匯入 v2-real：預覽列與警告正確；第一次確認不套用、第二次才套用；pre-import 另存覆蓋前資料', async ({ page }) => {
    const v3raw = readFixture('v3.json');
    await openApp(page, { seed: seedState(v3raw) });
    await gotoTab(page, 's-setup');
    const before = await storageSnapshot(page);
    await chooseFile(page, fixturePath('v2-real.json'));
    await expectRowsAndWarnings(page, ROWS_V3_TO_V2REAL, WARNINGS_V3_TO_V2REAL);
    expect(await storageSnapshot(page)).toEqual(before); // 預覽不寫入

    await page.click('#imp-confirm');
    await expect(page.locator('#imp-confirm')).toHaveText(ARMED);
    await expect(page.locator('#imp-preview')).toBeVisible();
    expect(await storageSnapshot(page)).toEqual(before); // 第一次按：不套用

    await page.click('#imp-confirm');
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    await expect(page.locator('#imp-preview')).toBeHidden();
    const after = await storageSnapshot(page);
    expect(Object.keys(after).sort()).toEqual([MAIN_KEY, PRE_IMPORT_KEY].sort());
    expect(JSON.parse(after[PRE_IMPORT_KEY])).toEqual(JSON.parse(v3raw)); // 覆蓋前的資料
    const s = JSON.parse(after[MAIN_KEY]);
    expect(s.version).toBe(3);
    expect(s.xp).toBe(361);
    expect(s.level).toBe(3);
    expect(s.streak).toEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    expect(s.sessions).toHaveLength(32);
    expect(s.game.xp).toEqual({ move: 361, sleep: 0, explore: 0, total: 361 });
    expect(s.game.streaks.train).toEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    expect(s.meta.lastBackupAt).toBeNull();
    expect(s.habits.explore.items[0].createdAt).toBe(NOW_ISO);
    /* 四個分頁已重繪 */
    await gotoTab(page, 's-home');
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    await gotoTab(page, 's-hist');
    await expect(page.locator('#pr-hrp .prline')).toHaveCount(2);
    await collectTexts(page);
    expectGlossaryClean(collectedTexts);
  });

  test('貼上匯入 v1-minimal 與 v3：版本列 v1 → v3、沒有警告時不顯示警告區', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    await gotoTab(page, 's-setup');
    /* 目前 = v2-real（載入後在記憶體中是 v3）；匯入 v3.json → README：warnings = [] */
    await paste(page, readFixture('v3.json'));
    await expect(page.locator('#imp-preview')).toBeVisible();
    const rows = await previewRows(page);
    expect(rows[0]).toEqual(['version', '版本', 'v3', 'v3', false]);
    expect(rows[2]).toEqual(['xp', 'XP', '361', '396', true]);
    await expect(page.locator('#imp-warnings')).toBeHidden();
    await page.click('#imp-confirm');
    await page.click('#imp-confirm');
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    await expect(page.locator('#exp-area')).toHaveValue('');
    const s = await storedState(page);
    expect(s.xp).toBe(396);
    expect(s.meta.lastBackupAt).toBe('2026-09-30T21:15:00+09:00');
    /* pre-import = 覆蓋前（v2-real 遷移後）的資料 */
    const pre = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), PRE_IMPORT_KEY));
    expect(pre.version).toBe(3);
    expect(pre.xp).toBe(361);

    /* 匯入 v1：版本列顯示 v1 → v3；警告：訓練紀錄、PR、身體指標都會變少 */
    await paste(page, readFixture('v1-minimal.json'));
    const rows1 = await previewRows(page);
    expect(rows1[0]).toEqual(['version', '版本', 'v3', 'v1 → v3', true]);
    expect(rows1[2]).toEqual(['xp', 'XP', '396', '35', true]);
    await expect(page.locator('#imp-warnings')).toBeVisible();
    await page.click('#imp-cancel');
    await expect(page.locator('#io-msg')).toHaveText('已取消匯入，資料沒有變更。');
  });

  test('取消：資料不變；確認按鈕 10 秒後恢復，恢復後要重新按兩次', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-setup');
    const before = await storageSnapshot(page);

    await chooseFile(page, fixturePath('v2-real.json'));
    await page.click('#imp-cancel');
    await expect(page.locator('#io-msg')).toHaveText('已取消匯入，資料沒有變更。');
    await expect(page.locator('#imp-preview')).toBeHidden();
    expect(await storageSnapshot(page)).toEqual(before);

    /* 第一次確認後等 9.9 秒：仍在待確認；滿 10 秒：恢復原文字 */
    await chooseFile(page, fixturePath('v2-real.json'));
    await page.click('#imp-confirm');
    await expect(page.locator('#imp-confirm')).toHaveText(ARMED);
    await page.clock.runFor(9_900);
    await expect(page.locator('#imp-confirm')).toHaveText(ARMED);
    await page.clock.runFor(100);
    await expect(page.locator('#imp-confirm')).toHaveText(CONFIRM);
    expect(await storageSnapshot(page)).toEqual(before);
    /* 恢復後再按一次只會重新進入待確認，不會套用 */
    await page.click('#imp-confirm');
    await expect(page.locator('#imp-confirm')).toHaveText(ARMED);
    expect(await storageSnapshot(page)).toEqual(before);

    /* 離開 SETUP 再回來：預覽收起，不能拿舊的比較結果覆蓋 */
    await gotoTab(page, 's-home');
    await gotoTab(page, 's-setup');
    await expect(page.locator('#imp-preview')).toBeHidden();
    await expect(page.locator('#imp-confirm')).toHaveText(CONFIRM);
    expect(await storageSnapshot(page)).toEqual(before);

    /* 最後真的匯入一次：兩次確認才寫入 */
    await chooseFile(page, fixturePath('v2-real.json'));
    await page.click('#imp-confirm');
    await page.click('#imp-confirm');
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    expect((await storedState(page)).xp).toBe(361);
  });
});

test.afterAll(() => {
  /* 報告用：錯誤訊息裡出現的資料欄位路徑（識別字，用語表檢查時已排除） */
  const paths = [...new Set(collectedTexts.flatMap(identifierPaths))];
  if (paths.length) console.log(`[qa] 匯入訊息中的欄位路徑（識別字）：${paths.join(' ')}`);
});
