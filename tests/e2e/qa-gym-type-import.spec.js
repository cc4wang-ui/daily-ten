/* 獨立驗收（qa-checker）：匯入備份帶 gym.pick（合法、不合法）時的行為。報告：reports/qa-gym-type-1.md。
   已知問題（test.fail 標記，修好後這條會變成「意外通過」，請把 test.fail 拿掉）：
   匯入成功後畫面用的是匯入前的摘要（js/ui/settings.js 的 onImported 只呼叫 summary()，沒有 refresh()），
   要重開 App 或下一次寫入後才更新。main 上就有（HEAD~1 實測相同），不是這次切換鈕造成的。 */
import { test, expect, openApp, waitReady, gotoTab, storedState, liveV4, readFixture, readRepo, confirmImportTwice, hideToast } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';
const GYM = JSON.parse(readRepo('data/gym.json'));
const upperBtn = (page) => page.locator('#gym-body [data-gym-type=upper]');
const lowerBtn = (page) => page.locator('#gym-body [data-gym-type=lower]');
const body = (page) => page.locator('#gym-body');
function doneSession(label, date) {
  const exs = GYM.templates[GYM.sequence.indexOf(label) % 2 === 1 ? 'lower' : 'upper'];
  return { id: `qa-${date}-${label.replace(' ', '')}`, date, label, startedAt: `${date}T07:00:00+09:00`, finishedAt: `${date}T08:00:00+09:00`, exercises: exs.map((e) => ({ id: e.id, name: e.name, kind: e.kind, sets: [{ weight: 40, reps: 8, done: true }] })) };
}
function backupWith(gymPatch) {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  st.v4.gym = { ...st.v4.gym, ...gymPatch };
  return JSON.stringify(st);
}
async function importText(page, text) {
  await gotoTab(page, 's-settings');
  await page.fill('#exp-area', text);
  await page.click('#imp-btn');
  await expect(page.locator('#imp-preview')).toBeVisible();
  await confirmImportTwice(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
}

for (const [name, bad] of [['字串 Foo', 'Foo'], ['數字 123', 123], ['null', null], ['物件', { a: 1 }], ['陣列', ['Lower A']], ['小寫 lower a', 'lower a'], ['超長字串', 'L'.repeat(5000)]]) {
  test(`QA-I1 匯入備份帶不合法 pick（${name}）：不白屏、重開後當成沒選、還能切換與開課、完成後壞值被清掉`, async ({ page }) => {
    await openApp(page, { now: NOW });
    await importText(page, backupWith({ sessions: [doneSession('Upper A', '2026-11-02')], pick: bad }));
    await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
    await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A · 本週 1/4');
    await gotoTab(page, 's-gym');
    await expect(body(page)).toContainText('下一次：Lower A');
    await expect(lowerBtn(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'false');
    await upperBtn(page).click();
    await expect(body(page)).toContainText('下一次：Upper B');
    expect((await storedState(page)).v4.gym.pick).toBe('Upper B');
    await page.click('#gym-start');
    await expect(page.locator('#session h2')).toHaveText('Upper B');
    await expect(page.locator('#session .ex')).toHaveCount(7);
  });
}

test('QA-I2 匯入備份帶合法 pick（Lower B）：重開後照 pick 顯示，今日頁同步', async ({ page }) => {
  await openApp(page, { now: NOW });
  await importText(page, backupWith({ pick: 'Lower B' }));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower B');
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('下一次：Lower B');
  await expect(lowerBtn(page)).toHaveAttribute('aria-pressed', 'true');
});

test('QA-I3 不合法 pick 不去按切換、直接照自動順序練完：壞值在完成後被清掉', async ({ page }) => {
  await openApp(page, { now: NOW });
  await importText(page, backupWith({ pick: 'Foo' }));
  await page.reload();
  await waitReady(page);
  expect((await storedState(page)).v4.gym.pick, '讀取時才過濾：儲存裡原樣保留').toBe('Foo');
  await gotoTab(page, 's-gym');
  await page.click('#gym-start');
  await expect(page.locator('#session h2')).toHaveText('Upper A');
  const rows = page.locator('#session tr[data-si]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) { await rows.nth(i).locator('input[data-k=weight]').fill('40'); await rows.nth(i).locator('input[data-k=reps]').fill('8'); await rows.nth(i).locator('.ok').click(); }
  if (await page.locator('#rest-skip').count()) await page.click('#rest-skip');
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  const v4 = await liveV4(page);
  expect(v4.gym.pick).toBeUndefined();
  expect(v4.gym.sessions.map((s) => s.label)).toEqual(['Upper A']);
});

test('QA-I4 [已知問題] 匯入後不重開：今日頁與健身房頁應該馬上顯示匯入資料的下一課', async ({ page }) => {
  test.fail(true, '匯入後摘要沒有重算（js/ui/settings.js onImported），main 上就有；見 reports/qa-gym-type-1.md 問題 O-1');
  await openApp(page, { now: NOW });
  await importText(page, backupWith({ sessions: [doneSession('Upper A', '2026-11-02')] }));
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A · 本週 1/4', { timeout: 3000 });
});

test('QA-I5 [已知問題] 匯入後不重開就按腿日：A／B 應該依匯入的紀錄輪到 Lower B', async ({ page }) => {
  test.fail(true, '切換鈕用到匯入前的舊摘要算 A／B（pickType 讀 summary().sessions）；見 reports/qa-gym-type-1.md 問題 O-1');
  await openApp(page, { now: NOW });
  await importText(page, backupWith({ sessions: [doneSession('Lower A', '2026-11-02')] }));
  await gotoTab(page, 's-gym');
  await hideToast(page);
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('Lower B 課表', { timeout: 3000 });
});
