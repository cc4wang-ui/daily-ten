/* qa-checker：prefers-reduced-motion（CLAUDE.md §2 原則 9；qa-checker 清單 #7）。
   M1 沒有新增動畫：在 reduce 模式下把 M1 新元素全部叫出來（錯誤卡、提醒卡、啟動失敗卡、備份／匯入控制項、預覽、警告），
   確認 document.getAnimations() 為空、computed style 沒有 transition／animation；CSS 檔也沒有任何 transition／animation／@keyframes。
   （示範動畫是 demos.js 以 rAF 繪製的既有功能，與 main 相同，不在 M1 範圍。） */
import {
  test, expect, readFixture, readRepo, openApp, seedState, gotoTab
} from './helpers.js';

const NEW_ELEMENTS = ['#err-card', '#err-text', '#err-download', '#err-dismiss', '#err-note',
  '#bk-reminder', '#bk-reminder-text', '#bk-reminder-btn', '#bk-reminder-msg',
  '#bk-download', '#bk-status', '#imp-file-btn', '#imp-error', '#imp-preview', '#imp-rows', '#imp-warnings',
  '#imp-confirm', '#imp-cancel'];

async function motionReport(page, selectors) {
  return page.evaluate((selectors) => {
    const out = { animations: document.getAnimations().length, styles: [] };
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        const durations = cs.transitionDuration.split(',').map((d) => parseFloat(d));
        if (durations.some((d) => d > 0) || cs.animationName !== 'none') {
          out.styles.push(`${sel}: transition ${cs.transitionProperty} ${cs.transitionDuration}; animation ${cs.animationName}`);
        }
      }
    }
    return out;
  }, selectors);
}

test('CSS 檔沒有 transition／animation／@keyframes（M1 沒有新增動態效果）', () => {
  for (const f of ['css/tokens.css', 'css/app.css']) {
    const css = readRepo(f).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css, f).not.toMatch(/transition|animation|@keyframes/i);
  }
  /* 啟動失敗卡與資料保護 UI 的 inline style 也沒有動態效果 */
  for (const f of ['js/app.js', 'js/ui/backup.js']) expect(readRepo(f), f).not.toMatch(/transition|animation|animate\(/i);
});

for (const mode of ['reduce', 'no-preference']) {
  test(`prefers-reduced-motion: ${mode} → M1 新元素出現時沒有任何動畫或 transition`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode });
    await openApp(page, { seed: seedState(readFixture('v2-wrong-types.json')) }); // 錯誤卡＋提醒卡都會出現
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(mode === 'reduce');
    await expect(page.locator('#err-card')).toBeVisible();
    await expect(page.locator('#bk-reminder')).toBeVisible();
    expect(await motionReport(page, NEW_ELEMENTS)).toEqual({ animations: 0, styles: [] });

    await gotoTab(page, 's-setup');
    await page.fill('#exp-area', '{');
    await page.click('#imp-btn');
    await expect(page.locator('#imp-error')).toBeVisible();
    expect(await motionReport(page, NEW_ELEMENTS)).toEqual({ animations: 0, styles: [] });
    await page.fill('#exp-area', readFixture('v3.json'));
    await page.click('#imp-btn');
    await expect(page.locator('#imp-preview')).toBeVisible();
    await page.click('#imp-confirm');
    expect(await motionReport(page, [...NEW_ELEMENTS, '#imp-rows .prline', '#imp-warnings div'])).toEqual({ animations: 0, styles: [] });
  });
}

test('prefers-reduced-motion: reduce → 啟動失敗卡沒有動畫', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/js/ui/home.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await openApp(page, { seed: seedState(readFixture('v2-real.json')), ready: false });
  await expect(page.locator('#boot-error')).toBeVisible();
  expect(await motionReport(page, ['#boot-error', '#boot-error *'])).toEqual({ animations: 0, styles: [] });
});
