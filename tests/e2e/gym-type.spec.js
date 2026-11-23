/* 上半身／腿日切換（2026-11-23 重大 bug：原本沒有任何方法換下一次練哪裡，只能照固定順序）。
   驗：切換鈕看得到、按了課表真的換、重開 App 還在、今日頁同步、開課開到選的那一課、
   練完腿日後下一次自動回到上半身（不會再排一次腿日）、進行中的課不顯示切換鈕。 */
import { test, expect, openApp, waitReady, gotoTab, liveV4, storedState, expectTouchTargets, hideToast } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';
const upperBtn = (page) => page.locator('#gym-body [data-gym-type=upper]');
const lowerBtn = (page) => page.locator('#gym-body [data-gym-type=lower]');

test('健身房：切到腿日 → 課表換成腿日 6 個動作 → 重開還在 → 今日頁同步 → 切回上半身', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Upper A');
  await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(lowerBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await expectTouchTargets(page, '#gym-body .gym-type');

  await lowerBtn(page).click();
  await expect(page.locator('#toast')).toContainText('下一次改練腿日');
  await expect(page.locator('#gym-body')).toContainText('下一次：Lower A');
  await expect(page.locator('#gym-body')).toContainText('Lower A 課表');
  await expect(page.locator('#gym-body .row')).toHaveCount(6);
  await expect(lowerBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await storedState(page)).v4.gym.pick).toBe('Lower A');

  await page.reload();
  await waitReady(page);
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Lower A');

  await hideToast(page);
  await upperBtn(page).click();
  await expect(page.locator('#gym-body')).toContainText('下一次：Upper A');
  await expect(page.locator('#gym-body .row')).toHaveCount(7);
});

test('健身房：選腿日開課 → 開到 Lower A → 進行中不顯示切換 → 練完後下一次自動回到上半身', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.click('#gym-start');
  await expect(page.locator('#session h2')).toHaveText('Lower A');
  await expect(page.locator('#session .ex')).toHaveCount(6);
  const rows = page.locator('#session tr[data-si]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    await r.locator('input[data-k=weight]').fill('40');
    await r.locator('input[data-k=reps]').fill('8');
    await r.locator('.ok').click();
  }
  if (await page.locator('#rest-skip').count()) await page.click('#rest-skip');
  // 先離開：進行中的課還在，健身房頁不該出現切換鈕
  await page.click('#ss-exit');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('進行中：Lower A');
  await expect(page.locator('#gym-body [data-gym-type]')).toHaveCount(0);
  await page.click('#gym-resume');
  await page.click('#ss-finish');
  await expect(page.locator('#gs-t')).toHaveText('Lower A 完成');
  await page.click('#gs-ok');
  const v4 = await liveV4(page);
  expect(v4.gym.pick).toBeUndefined();
  expect(v4.gym.sessions.map((s) => s.label)).toEqual(['Lower A']);
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('今天完成了：Lower A');
  await expect(page.locator('#gym-body')).toContainText('Upper A 課表');
  await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'true');
  // 想連練腿日也可以：下一個腿日是 B
  await hideToast(page);
  await lowerBtn(page).click();
  await expect(page.locator('#gym-body')).toContainText('Lower B 課表');
});
