/* redo-v1：三個習慣的完整流程——伸展引導、健身房記錄、探索完成；復原；進行中的課重開 App 可繼續；慶祝卡。 */
import { test, expect, openApp, gotoTab, tick, liveV4, storedState, expectTouchTargets, hideToast } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';
const dismissCele = async (page) => { for (let i = 0; i < 4; i++) { if (!(await page.locator('#cele:not([hidden])').count())) return; await page.click('#cele-ok'); } };

test('伸展引導：主行動開始 → 倒數 → 換邊提示 → 自動下一項 → 完成記錄 +40 XP，10 秒內可復原', async ({ page }) => {
  await openApp(page, { now: NOW });
  await page.click('#hero-go');
  await expect(page.locator('#guide')).toBeVisible();
  await expect(page.locator('#guide h2')).toHaveText('貓牛式');
  await expect(page.locator('#guide .count')).toHaveText('1:30');
  await expect(page.locator('#guide .thumb')).toHaveAttribute('href', /youtube\.com\/shorts\//);
  await expectTouchTargets(page, '#guide');
  await tick(page, 90);
  await expect(page.locator('#guide h2')).toHaveText('穿針式');
  await expect(page.locator('#guide .step')).toContainText('第一邊');
  await tick(page, 61);
  await expect(page.locator('#guide .step')).toContainText('換邊');
  await page.click('#g-pause');
  await expect(page.locator('#g-pause')).toContainText('繼續');
  const before = await page.locator('#guide .count').textContent();
  await tick(page, 5);
  await expect(page.locator('#guide .count')).toHaveText(before);
  await page.click('#g-pause');
  for (let i = 0; i < 7; i++) await page.click('#g-skip');
  await expect(page.locator('#guide')).toBeHidden();
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  await expect(page.locator('#toast')).toContainText('伸展完成 +40 XP');
  await expect(page.locator('.habit.stretch')).toHaveClass(/done/);
  await expect(page.locator('#hero-t')).toHaveText('健身房：Upper A');
  let v4 = await liveV4(page);
  expect(v4.stretch.log).toHaveLength(1);
  expect(v4.stretch.log[0]).toMatchObject({ date: '2026-11-04', variant: 'full', seconds: 900 });
  expect(v4.stretch.log[0].at).toMatch(/^2026-11-04T08:3\d:\d\d\+09:00$/);
  await page.click('#toast-action');
  await expect(page.locator('.habit.stretch')).not.toHaveClass(/done/);
  v4 = await liveV4(page);
  expect(v4.stretch.log).toEqual([]);
  expect((await storedState(page)).v4.stretch.log).toEqual([]);
});

test('伸展：短版一鍵記錄 +20；之後補完整版改記 40，不重複計', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-start-short');
  await page.click('#g-done-now');
  await expect(page.locator('#toast')).toContainText('+20 XP');
  await hideToast(page);
  await dismissCele(page);
  await gotoTab(page, 's-stretch');
  await expect(page.locator('#stretch-body')).toContainText('5 分鐘短版');
  await expect(page.locator('#stretch-body')).toContainText('想補完整版也可以');
  await expect(page.locator('#st-start-full')).toHaveCount(0);
  await gotoTab(page, 's-home');
  await expect(page.locator('.tag.xp')).toContainText('20 XP');
});

test('健身房：開始課表 → 填組數勾完成 → 休息計時 → 完成總結 +100 → 週進度 1/4 → 下一次 Lower A；復原', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Upper A');
  await expect(page.locator('#gym-body .row')).toHaveCount(7);
  await expect(page.locator('#gym-body .video-link').first()).toHaveAttribute('href', /youtube\.com\/shorts\/[A-Za-z0-9_-]{11}$/);
  await page.click('#gym-start');
  await expect(page.locator('#session')).toBeVisible();
  await expect(page.locator('#session .ex')).toHaveCount(7);
  await expectTouchTargets(page, '#session');
  const rows = page.locator('#session tr[data-si]');
  expect(await rows.count()).toBe(14);
  for (let i = 0; i < 14; i++) {
    const r = rows.nth(i);
    await r.locator('input[data-k=weight]').fill('20');
    await r.locator('input[data-k=reps]').fill('8');
    await r.locator('.ok').click();
  }
  await expect(page.locator('#rest')).toBeVisible();
  await expect(page.locator('#rest-t')).toHaveText('1:15');
  await tick(page, 10);
  await expect(page.locator('#rest-t')).toHaveText('1:05');
  await page.click('#rest-skip');
  await expect(page.locator('#rest')).toHaveCount(0);
  await page.click('#ss-finish');
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#gs-t')).toHaveText('Upper A 完成');
  await expect(page.locator('#sheet .big')).toHaveText('+100 XP');
  await expect(page.locator('#sheet')).toContainText('2,240');
  await page.click('#gs-ok');
  await expect(page.locator('#toast')).toContainText('健身房完成 +100 XP');
  await expect(page.locator('.habit.gym')).toHaveClass(/done/);
  await expect(page.locator('.legend .row').first()).toContainText('1/4');
  let v4 = await liveV4(page);
  expect(v4.gym.sessions).toHaveLength(1);
  expect(v4.gym.draft).toBeNull();
  expect(v4.gym.sessions[0].exercises[0].sets).toEqual([{ weight: 20, reps: 8, done: true }, { weight: 20, reps: 8, done: true }]);
  await page.click('#toast-action');
  await expect(page.locator('#s-gym')).toHaveClass(/active/);
  v4 = await liveV4(page);
  expect(v4.gym.sessions).toHaveLength(0);
  expect(v4.gym.draft).not.toBeNull();
  await expect(page.locator('#gym-resume')).toBeVisible();
});

test('健身房：進行中的課重新整理後可繼續；放棄會清掉；沒勾任何一組不能完成', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await page.click('#gym-start');
  await page.locator('#session tr[data-si]').first().locator('input[data-k=weight]').fill('30');
  await page.locator('#session tr[data-si]').first().locator('input[data-k=weight]').dispatchEvent('change');
  await page.click('#ss-finish');
  await expect(page.locator('#toast')).toContainText('還沒有勾選任何一組');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#s-gym')).toHaveClass(/active/);
  await expect(page.locator('#gym-resume')).toBeVisible();
  await page.click('#gym-resume');
  await expect(page.locator('#session tr[data-si]').first().locator('input[data-k=weight]')).toHaveValue('30');
  await page.click('#ss-exit');
  page.once('dialog', (d) => d.accept());
  await page.click('#gym-discard');
  await expect(page.locator('#gym-start')).toBeVisible();
  expect((await liveV4(page)).gym.draft).toBeNull();
});

test('健身房第二次課：上次數字預填、漸進建議、PR 偵測', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  const doSession = async (w, reps) => {
    await page.click('#gym-start');
    const rows = page.locator('#session tr[data-si]');
    const n = await rows.count();
    for (let i = 0; i < n; i++) { const r = rows.nth(i); await r.locator('input[data-k=weight]').fill(String(w)); await r.locator('input[data-k=reps]').fill(String(reps)); await r.locator('.ok').click(); }
    await page.click('#rest-skip');
    await page.click('#ss-finish');
    await page.click('#gs-ok');
    await hideToast(page);
    await dismissCele(page);
  };
  await doSession(20, 10);
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('今天完成了：Upper A');
  // 下一天：Lower A（不同模板）；再下一天 Upper B 才看得到上次預填
  await page.clock.setFixedTime(new Date('2026-11-05T18:00:00+09:00').getTime());
  await gotoTab(page, 's-home');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Lower A');
  await doSession(60, 10);
  await page.clock.setFixedTime(new Date('2026-11-06T18:00:00+09:00').getTime());
  await gotoTab(page, 's-home');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Upper B');
  await page.click('#gym-start');
  await expect(page.locator('#session tr[data-si]').first().locator('input[data-k=weight]')).toHaveValue('20');
  await expect(page.locator('#session tr[data-si]').first().locator('td.prev')).toHaveText('20×10');
  await expect(page.locator('#session .sugg').first()).toContainText('加 2.5 kg');
  const rows = page.locator('#session tr[data-si]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) { const r = rows.nth(i); await r.locator('input[data-k=weight]').fill('22.5'); await r.locator('input[data-k=reps]').fill('8'); await r.locator('.ok').click(); }
  await page.click('#rest-skip');
  await page.click('#ss-finish');
  await expect(page.locator('#sheet')).toContainText('PR！');
  await expect(page.locator('#sheet .big')).toHaveText('+170 XP');
  await page.click('#gs-ok');
  await hideToast(page);
  await dismissCele(page);
  await gotoTab(page, 's-progress');
  await expect(page.locator('#progress-body')).toContainText('PR');
  await expect(page.locator('#progress-body')).toContainText('22.5 kg × 8');
});

test('探索：本週任務卡、換一個不重複、完成給興趣分 → +60、本週 1/1；復原把任務放回', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-explore');
  const first = await page.locator('#explore-body h2').textContent();
  await page.click('#ex-shuffle');
  const second = await page.locator('#explore-body h2').textContent();
  expect(second).not.toBe(first);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await gotoTab(page, 's-explore');
  await expect(page.locator('#explore-body h2')).toHaveText(second);
  await page.click('#ex-done');
  await expect(page.locator('#ex-save')).toBeDisabled();
  await page.click('.stars button[data-n="5"]');
  await page.fill('#ex-note', '下次還想做');
  await page.click('#ex-save');
  await expect(page.locator('#toast')).toContainText('探索完成 +60 XP');
  await expect(page.locator('.habit.explore')).toHaveClass(/done/);
  await expect(page.locator('.legend .row').nth(2)).toContainText('1/1');
  let v4 = await liveV4(page);
  expect(v4.explore.log).toHaveLength(1);
  expect(v4.explore.log[0]).toMatchObject({ date: '2026-11-04', title: second, interest: 5, note: '下次還想做' });
  await page.click('#toast-action');
  v4 = await liveV4(page);
  expect(v4.explore.log).toHaveLength(0);
  expect(v4.explore.current.taskId).toBeTruthy();
});

test('Perfect Day：同一天伸展＋健身房 → 慶祝卡出現一次、+30、按繼續後不再出現', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-mark-full');
  await hideToast(page);
  await dismissCele(page);
  await gotoTab(page, 's-gym');
  await page.click('#gym-start');
  const rows = page.locator('#session tr[data-si]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) { const r = rows.nth(i); await r.locator('input[data-k=weight]').fill('10'); await r.locator('input[data-k=reps]').fill('8'); await r.locator('.ok').click(); }
  await page.click('#rest-skip');
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  await hideToast(page);
  await expect(page.locator('#cele')).toBeVisible();
  await expect(page.locator('#cele-t')).toHaveText('Perfect Day');
  await expect(page.locator('#cele .xp')).toHaveText('+30 XP');
  await page.click('#cele-ok');
  await dismissCele(page);
  await expect(page.locator('#cele')).toBeHidden();
  await expect(page.locator('.habit.gym')).toHaveClass(/done/);
  await expect(page.locator('.habit.stretch')).toHaveClass(/done/);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#cele')).toBeHidden();
  const v4 = await liveV4(page);
  expect(v4.seen.perfectDay).toBe('2026-11-04');
  await expect(page.locator('.tag.xp')).toContainText('170 XP');
});
