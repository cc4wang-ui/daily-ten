/* qa-checker：載入失敗保護 e2e（PLAN.md §2 #6；CLAUDE.md §5「失敗時原字串存 bak-v2，顯示可匯出錯誤卡，不可白屏」）。
   1. 壞 state（corrupt-state.txt）→ HOME 錯誤卡；bak-v2 = 原字串；存檔前主 key 未被覆寫；可下載原字串；App 可正常使用。
   2. v2-wrong-types → 修補訊息。
   3. 任一 module 載入／執行失敗（page.route 回 404 或丟例外）→ #boot-error、HOME 可見、可下載主 key 原字串。 */
import {
  test, expect, readFixture, openApp, seedState, storageSnapshot, storedState, rawMain, expectHome,
  clickAndDownload, runWorkoutToEnd, gotoTab, expectGlossaryClean, installClock, seedOnce, MAIN_KEY, BAK_V2
} from './helpers.js';

const MSG_RECOVERED = '讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。';
const MSG_REPAIRED = '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。';
const FATAL = 'App 啟動時發生問題。資料仍在這台裝置上，請先下載保存。';

test.describe('壞 state 不白屏', () => {
  test('corrupt-state.txt：錯誤卡、bak-v2＝原字串、主 key 存檔前不變、下載原字串、App 可正常使用', async ({ page }) => {
    const raw = readFixture('corrupt-state.txt');
    await openApp(page, { seed: seedState(raw) });
    const card = page.locator('#err-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveClass('banner danger');
    await expect(page.locator('#err-text')).toHaveText(MSG_RECOVERED);
    await expectHome(page, { level: 2, xp: 0, current: 0, best: 0 });
    expect(await storageSnapshot(page)).toEqual({ [MAIN_KEY]: raw, [BAK_V2]: raw });

    /* 下載原始資料 = 原字串 */
    const file = await clickAndDownload(page, '#err-download');
    expect(file.name).toBe('daily-ten-raw-2026-10-02.txt');
    expect(file.text).toBe(raw);
    await expect(page.locator('#err-note')).toHaveText('已下載 daily-ten-raw-2026-10-02.txt');
    expectGlossaryClean([MSG_RECOVERED, await page.locator('#err-download').textContent(),
      await page.locator('#err-dismiss').textContent(), await page.locator('#err-note').textContent()]);

    /* 重開 App（還沒存檔）：沿用同一個備份 key，不會一直複製 */
    await page.reload();
    await expect(page.locator('#bd-macros')).not.toBeEmpty();
    await expect(page.locator('#err-card')).toBeVisible();
    expect(await storageSnapshot(page)).toEqual({ [MAIN_KEY]: raw, [BAK_V2]: raw });

    /* App 可正常使用：跑保底版 → 這時才覆寫主 key；bak-v2 仍是原字串 */
    await page.click('#h-minimal');
    await runWorkoutToEnd(page);
    await expect(page.locator('#d-xp')).toHaveText('+3 XP　·　STREAK 1');
    await page.click('#d-ok');
    await expectHome(page, { level: 2, xp: 3, current: 1, best: 1 });
    const s = await storedState(page);
    expect(s.version).toBe(3);
    expect(s.sessions).toEqual([{ date: '2026-10-02', type: 'minimal', xp: 3 }]);
    expect(await page.evaluate((k) => localStorage.getItem(k), BAK_V2)).toBe(raw);

    /* 主 key 已被覆寫後再按「下載原始資料」：仍下載另存的原字串（不是目前的資料） */
    await expect(page.locator('#err-card')).toBeVisible();
    const again = await clickAndDownload(page, '#err-download');
    expect(again.text).toBe(raw);

    /* 「知道了」只隱藏卡片 */
    await page.click('#err-dismiss');
    await expect(page.locator('#err-card')).toBeHidden();
    /* 下次開 App：資料正常、不再出現錯誤卡 */
    await page.reload();
    await expect(page.locator('#bd-macros')).not.toBeEmpty();
    await expect(page.locator('#err-card')).toBeHidden();
    await expectHome(page, { level: 2, xp: 3, current: 1, best: 1 });
    /* 其他分頁也正常 */
    for (const id of ['s-hist', 's-body', 's-setup']) await gotoTab(page, id);
  });

  test('v2-wrong-types：修補訊息、bak-v2＝原字串、數值為修補後的結果', async ({ page }) => {
    const raw = readFixture('v2-wrong-types.json');
    await openApp(page, { seed: seedState(raw) });
    await expect(page.locator('#err-card')).toHaveClass('banner danger');
    await expect(page.locator('#err-text')).toHaveText(MSG_REPAIRED);
    await expectHome(page, { level: 3, xp: 120, current: 4, best: 6 });
    expect(await storageSnapshot(page)).toEqual({ [MAIN_KEY]: raw, [BAK_V2]: raw });
    const file = await clickAndDownload(page, '#err-download');
    expect(file.text).toBe(raw);
    expectGlossaryClean([MSG_REPAIRED]);
  });

  test('JSON 合法但不是物件（例如 null）→ recovered，原字串另存', async ({ page }) => {
    await openApp(page, { seed: seedState('null') });
    await expect(page.locator('#err-text')).toHaveText(MSG_RECOVERED);
    await expectHome(page, { level: 2, xp: 0, current: 0, best: 0 });
    expect(await storageSnapshot(page)).toEqual({ [MAIN_KEY]: 'null', [BAK_V2]: 'null' });
  });
});

test.describe('module 載入失敗不白屏（#boot-error）', () => {
  const CASES = [
    { label: 'js/ui/home.js 回 404', pattern: '**/js/ui/home.js', fulfill: { status: 404, contentType: 'text/plain', body: 'Not found' }, via: 'backup.js' },
    { label: 'js/ui/setup.js 執行時丟例外', pattern: '**/js/ui/setup.js', fulfill: { status: 200, contentType: 'text/javascript', body: "throw new Error('qa: injected module failure');" }, via: 'backup.js' },
    { label: 'js/ui/body.js 語法錯誤', pattern: '**/js/ui/body.js', fulfill: { status: 200, contentType: 'text/javascript', body: 'export function renderBody( {' }, via: 'backup.js' },
    { label: 'js/state/backup.js 回 404（下載改走 app.js 內建的備援）', pattern: '**/js/state/backup.js', fulfill: { status: 404, contentType: 'text/plain', body: 'Not found' }, via: 'fallback' }
  ];
  for (const c of CASES) {
    test(`${c.label} → 啟動失敗卡、HOME 可見、可下載主 key 原字串`, async ({ page, guard }) => {
      guard.allowConsoleErrors = true; // showFatal 會 console.error，module 404 也會記一筆
      const raw = readFixture('v2-real.json');
      await page.route(c.pattern, (route) => route.fulfill(c.fulfill));
      await openApp(page, { seed: seedState(raw), ready: false });
      const card = page.locator('#boot-error');
      await expect(card).toBeVisible();
      await expect(card).toHaveClass('banner danger');
      await expect(card).toContainText(FATAL);
      await expect(page.locator('#s-home')).toBeVisible();
      await expect(page.locator('#s-home')).toHaveClass(/active/);
      await expect(page.locator('#s-home .eyebrow')).toHaveText('DAILY TEN · AFT PROGRAM');
      await expect(page.locator('#tabs')).toBeVisible();
      const box = await page.locator('#s-home').boundingBox();
      expect(box.height).toBeGreaterThan(300);
      expect(await rawMain(page)).toBe(raw); // 不碰主 key

      const file = await clickAndDownload(page, '#boot-error-download');
      expect(file.name).toBe('daily-ten-raw-2026-10-02.txt');
      expect(file.text).toBe(raw);
      await expect(card.locator('.small')).toHaveText('已下載 daily-ten-raw-2026-10-02.txt');
      expect(await storageSnapshot(page)).toEqual({ [MAIN_KEY]: raw });
      expectGlossaryClean([FATAL, await page.locator('#boot-error-download').textContent()]);
    });
  }

  test('沒有任何資料時 module 載入失敗：啟動失敗卡仍出現，下載提示找不到資料（不丟例外）', async ({ page, guard }) => {
    guard.allowConsoleErrors = true;
    await page.route('**/js/ui/train.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
    await installClock(page);
    await page.goto('/index.html');
    await expect(page.locator('#boot-error')).toBeVisible();
    await page.click('#boot-error-download');
    await expect(page.locator('#boot-error .small')).toHaveText('找不到另存的原始資料');
    expect(await storageSnapshot(page)).toEqual({});
  });
});

/* seedOnce 與 installClock 也匯出給其他測試用；這裡確認它們在失敗情境下不會改到資料 */
test('啟動失敗後修好 module 再開 App：資料完整、數值正確', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  const raw = readFixture('v2-real.json');
  let broken = true;
  await page.route('**/js/ui/home.js', (route) => (broken ? route.fulfill({ status: 404, body: 'Not found' }) : route.continue()));
  await installClock(page);
  await seedOnce(page, seedState(raw));
  await page.goto('/index.html');
  await expect(page.locator('#boot-error')).toBeVisible();
  broken = false;
  await page.reload();
  await expect(page.locator('#bd-macros')).not.toBeEmpty();
  await expect(page.locator('#boot-error')).toHaveCount(0);
  await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  expect(await rawMain(page)).toBe(raw);
});
