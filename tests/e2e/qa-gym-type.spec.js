/* 獨立驗收（qa-checker）：上半身／腿日切換的邊界情境。報告：reports/qa-gym-type-1.md。
   與 gym-type.spec.js（作者自己的 2 條）分開：這裡走作者沒走的路——舊資料、匯入不合法 pick、復原、部分完成、
   今天已完成、連按、切換後換動作、今日頁主按鈕、離線、reduced-motion、窄螢幕。 */
import { test, expect, openApp, waitReady, gotoTab, liveV4, storedState, rawMain, seedState, readFixture, readRepo, swCacheOf, expectTouchTargets, noHorizontalScroll, hideToast, installClock, dismissCelebrations } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';
const upperBtn = (page) => page.locator('#gym-body [data-gym-type=upper]');
const lowerBtn = (page) => page.locator('#gym-body [data-gym-type=lower]');
const body = (page) => page.locator('#gym-body');
const iso = (date, hm) => `${date}T${hm}:00+09:00`;
/* 一堂「完成」的課：每個動作至少一組勾選才算 complete，所以直接從 data/gym.json 取該課的動作 */
const GYM = JSON.parse(readRepo('data/gym.json'));
function tplExercises(label) { return GYM.templates[GYM.sequence.indexOf(label) % 2 === 1 ? 'lower' : 'upper']; }
function doneSession(label, date) {
  const exs = tplExercises(label);
  return { id: `qa-${date}-${label.replace(' ', '')}`, date, label, startedAt: iso(date, '07:00'), finishedAt: iso(date, '08:00'), exercises: exs.map((e) => ({ id: e.id, name: e.name, kind: e.kind || 'compound', sets: [{ weight: 40, reps: 8, done: true }] })) };
}
function stateWith(gymPatch) {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  st.v4.gym = { ...st.v4.gym, ...gymPatch };
  return st;
}
async function fillAll(page, { firstExercises = 0 } = {}) {
  const rows = firstExercises ? page.locator(`#session .ex:nth-of-type(-n+${firstExercises}) tr[data-si]`) : page.locator('#session tr[data-si]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    await r.locator('input[data-k=weight]').fill('40');
    await r.locator('input[data-k=reps]').fill('8');
    await r.locator('.ok').click();
  }
  if (await page.locator('#rest-skip').count()) await page.click('#rest-skip');
}

test('QA-1 舊資料（沒有 pick）：開啟、逛健身房頁、重開，gym 欄位逐字不變、不會多出 pick；第二次重開整份儲存不再變', async ({ page }) => {
  const st = stateWith({ sessions: [doneSession('Upper A', '2026-11-02'), doneSession('Lower A', '2026-11-03')] });
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(st)) });
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('下一次：Upper B');
  await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await waitReady(page);
  await gotoTab(page, 's-gym');
  const first = await rawMain(page);
  const stored = JSON.parse(first);
  expect('pick' in stored.v4.gym).toBe(false);
  expect(JSON.stringify(stored.v4.gym), 'gym 整個欄位逐字不變').toBe(JSON.stringify(st.v4.gym));
  await page.reload();
  await waitReady(page);
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('下一次：Upper B');
  expect(await rawMain(page), '只看不按：儲存內容不再被改寫').toBe(first);
});

test('QA-2 舊順序相容：Upper A、Lower A、Upper B 做完 → 下一次 Lower B；四課做完 → 回到 Upper A', async ({ page }) => {
  const three = [doneSession('Upper A', '2026-10-28'), doneSession('Lower A', '2026-10-29'), doneSession('Upper B', '2026-10-31')];
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(stateWith({ sessions: three }))) });
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('下一次：Lower B');
  await expect(page.locator('#gym-body .list').first().locator('.row')).toHaveCount(6);
  // 手動改上半身：上半身做過 2 次 → Upper A
  await upperBtn(page).click();
  await expect(body(page)).toContainText('下一次：Upper A');
  await expect(page.locator('#gym-body .list').first().locator('.row')).toHaveCount(7);
});

test('QA-4 復原完成的課：回到進行中的 Lower A（不是別的課），再完成一次仍是 1 筆、下一次回上半身', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.click('#gym-start');
  await fillAll(page);
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  await expect(page.locator('#toast-action')).toBeVisible();
  await page.click('#toast-action');
  await expect(page.locator('#s-gym')).toHaveClass(/active/);
  await expect(body(page)).toContainText('進行中：Lower A');
  let v4 = await liveV4(page);
  expect(v4.gym.sessions).toHaveLength(0);
  expect(v4.gym.draft.label).toBe('Lower A');
  await expect(page.locator('#gym-body [data-gym-type]')).toHaveCount(0);
  await page.click('#gym-resume');
  await expect(page.locator('#session .ex')).toHaveCount(6);
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  v4 = await liveV4(page);
  expect(v4.gym.sessions.map((s) => s.label)).toEqual(['Lower A']);
  await hideToast(page);
  await dismissCelebrations(page);
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('Upper A 課表');
});

test('QA-4b 復原後放棄這次：選過的腿日還在不在（記錄實際行為）', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.click('#gym-start');
  await fillAll(page);
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  await page.click('#toast-action');
  page.once('dialog', (d) => d.accept());
  await page.click('#gym-discard');
  await expect(page.locator('#gym-start')).toBeVisible();
  const txt = await page.locator('#gym-body .card-title').first().textContent();
  { const obs = `復原→放棄後：${txt}；pick=${JSON.stringify((await liveV4(page)).gym.pick)}`; test.info().annotations.push({ type: 'observed', description: obs }); console.log(`[observed] ${test.info().title.slice(0, 6)} ${obs}`); }
  // 無論如何都要能再切回腿日
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('下一次：Lower A');
});

test('QA-5 開課後放棄：選的腿日還在；可以再切回上半身', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.click('#gym-start');
  await page.click('#ss-exit');
  page.once('dialog', (d) => d.accept());
  await page.click('#gym-discard');
  await expect(body(page)).toContainText('下一次：Lower A');
  await hideToast(page);
  await upperBtn(page).click();
  await expect(body(page)).toContainText('下一次：Upper A');
});

test('QA-6 連按：同一顆按兩次、腿日→上半身→腿日快速連按，最後狀態與最後一下一致', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).dblclick();
  await expect(body(page)).toContainText('下一次：Lower A');
  expect((await storedState(page)).v4.gym.pick).toBe('Lower A');
  // 同一個 task 內對舊 DOM 連點兩下（真機上的雙擊）
  await page.evaluate(() => { const b = document.querySelector('#gym-body [data-gym-type=upper]'); b.click(); b.click(); });
  await expect(body(page)).toContainText('下一次：Upper A');
  await page.evaluate(() => { document.querySelector('#gym-body [data-gym-type=lower]').click(); document.querySelector('#gym-body [data-gym-type=upper]').click(); });
  await page.waitForTimeout(200);
  const title = await page.locator('#gym-body .card-title').first().textContent();
  const pick = (await storedState(page)).v4.gym.pick;
  const live = (await liveV4(page)).gym.pick;
  { const obs = `同 task 腿日+上半身：title=${title} stored=${pick} live=${live}`; test.info().annotations.push({ type: 'observed', description: obs }); console.log(`[observed] ${test.info().title.slice(0, 6)} ${obs}`); }
  expect(pick).toBe(live);
  expect(title).toContain(pick);
  await expect(page.locator('#gym-body .section-title').first()).toContainText(pick);
});

test('QA-7 切換後在課表預覽換動作：換的動作留著，開課用換過的動作；切回上半身不受影響', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  // 先打開上半身的換動作清單，再切腿日：清單要收起，不能把上半身的清單帶到腿日
  await page.locator('#gym-body [data-list-swap]').first().click();
  await expect(page.locator('#gym-body .swap-panel')).toHaveCount(1);
  await lowerBtn(page).click();
  await expect(page.locator('#gym-body .swap-panel')).toHaveCount(0);
  await expect(body(page)).toContainText('Lower A 課表');
  await hideToast(page);
  await page.locator('#gym-body [data-list-swap]').first().click();
  const alt = page.locator('#gym-body .swap-opt[data-alt]:not([disabled])').first();
  const altName = (await alt.locator('.swap-name').textContent()).trim();
  await alt.click();
  await expect(body(page)).toContainText('下一次：Lower A');
  await expect(lowerBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gym-body .row').first()).toContainText(altName);
  expect((await storedState(page)).v4.gym.pick).toBe('Lower A');
  await hideToast(page);
  await upperBtn(page).click();
  await expect(page.locator('#gym-body .list').first().locator('.row')).toHaveCount(7);
  await hideToast(page);
  await lowerBtn(page).click();
  await expect(page.locator('#gym-body .row').first()).toContainText(altName);
  await page.click('#gym-start');
  await expect(page.locator('#session h2')).toHaveText('Lower A');
  await expect(page.locator('#session .ex').first()).toContainText(altName);
});

test('QA-8 今天已完成一課：切換鈕還在、只換預覽課表；隔天「下一次」是選的那一課', async ({ page }) => {
  const st = stateWith({ sessions: [doneSession('Upper A', '2026-11-04')] });
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(st)) });
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('今天完成了：Upper A');
  await expect(body(page)).toContainText('Lower A 課表');
  await expect(page.locator('#gym-start')).toHaveCount(0);
  await upperBtn(page).click();
  await expect(body(page)).toContainText('Upper B 課表');
  await expect(body(page)).toContainText('今天完成了：Upper A');
  expect((await storedState(page)).v4.gym.pick).toBe('Upper B');
  expect((await storedState(page)).v4.gym.sessions).toHaveLength(1);
  // 隔天
  await page.clock.setFixedTime(new Date('2026-11-05T08:30:00+09:00'));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Upper B');
});

test('QA-9 部分完成選的腿日（6 個動作只做前 4 個）：記錄實際行為——pick 會不會被清掉、下一次排什麼', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.click('#gym-start');
  await fillAll(page, { firstExercises: 4 });
  await page.click('#ss-finish');
  await expect(page.locator('#sheet')).toContainText('部分完成');
  await page.click('#gs-ok');
  await hideToast(page);
  await dismissCelebrations(page);
  const v4 = await liveV4(page);
  await gotoTab(page, 's-gym');
  const title = await page.locator('#gym-body .card-title').first().textContent();
  { const obs = `部分完成 Lower A 後：pick=${JSON.stringify(v4.gym.pick)}；卡片=${title}`; test.info().annotations.push({ type: 'observed', description: obs }); console.log(`[observed] ${test.info().title.slice(0, 6)} ${obs}`); }
  // 最低要求：還能再切到腿日並開課
  await expect(lowerBtn(page)).toBeVisible();
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('下一次：Lower A');
});

test('QA-10 進行中的課：seed 一個 Upper A 草稿＋pick=Lower A → 不顯示切換、繼續開到 Upper A；完成後 pick 清掉', async ({ page }) => {
  const draft = { ...doneSession('Upper A', '2026-11-04'), id: 'qa-draft', finishedAt: null, type: 'upper' };
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(stateWith({ draft, pick: 'Lower A' }))) });
  await expect(page.locator('#s-gym')).toHaveClass(/active/); // 有進行中的課：開 App 直接到健身房頁
  await expect(body(page)).toContainText('進行中：Upper A');
  await expect(page.locator('#gym-body [data-gym-type]')).toHaveCount(0);
  await dismissCelebrations(page);
  await page.click('#gym-resume');
  await expect(page.locator('#session h2')).toHaveText('Upper A');
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  const v4 = await liveV4(page);
  expect(v4.gym.pick).toBeUndefined();
  expect(v4.gym.sessions.map((s) => s.label)).toEqual(['Upper A']);
});

test('QA-11 今日頁主按鈕：選腿日、伸展打卡後，今日頁「下一步」寫 健身房：Lower A，按「開始」直接開 Lower A', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-mark-full');
  await hideToast(page);
  await dismissCelebrations(page);
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await hideToast(page);
  await gotoTab(page, 's-home');
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A');
  await expect(page.locator('#hero-t')).toHaveText('健身房：Lower A');
  await page.click('#hero-go');
  await expect(page.locator('#session h2')).toHaveText('Lower A');
  await expect(page.locator('#session .ex')).toHaveCount(6);
});

test('QA-12 連練兩次腿日：Lower A → 手動再選腿日 = Lower B → 完成後自動回上半身 Upper A', async ({ page }) => {
  const st = stateWith({ sessions: [doneSession('Lower A', '2026-11-03')] });
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(st)) });
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('下一次：Upper A');
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('下一次：Lower B');
  await page.click('#gym-start');
  await expect(page.locator('#session h2')).toHaveText('Lower B');
  await fillAll(page);
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  await hideToast(page);
  await dismissCelebrations(page);
  await gotoTab(page, 's-gym');
  await expect(body(page)).toContainText('Upper A 課表');
  await expect(upperBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('Lower A 課表');
});

test('QA-13 遊戲日邊界：03:59 選腿日，04:01（換日後）重開仍是腿日', async ({ page }) => {
  await openApp(page, { now: '2026-11-05T03:59:00+09:00' });
  await gotoTab(page, 's-gym');
  await lowerBtn(page).click();
  await page.clock.setFixedTime(new Date('2026-11-05T04:01:00+09:00'));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A');
});

test('QA-14 觸控目標、窄螢幕 320px 不橫向捲動、aria 狀態、reduced-motion 下切換鈕沒有位移動畫', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await expectTouchTargets(page, '#gym-body .gym-type');
  const sizes = await page.locator('#gym-body [data-gym-type]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  await noHorizontalScroll(page);
  await expect(page.locator('#gym-body .gym-type')).toHaveAttribute('role', 'group');
  const motion = await page.locator('#gym-body [data-gym-type]').evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); return { anim: c.animationName, dur: c.animationDuration, trans: c.transitionProperty, tdur: c.transitionDuration, tf: c.transform }; }));
  { const obs = JSON.stringify({ sizes, motion }); test.info().annotations.push({ type: 'observed', description: obs }); console.log(`[observed] ${test.info().title.slice(0, 6)} ${obs}`); }
  for (const m of motion) { expect(m.anim).toBe('none'); expect(m.tf).toBe('none'); }
  await lowerBtn(page).click();
  await noHorizontalScroll(page);
  const toast = await page.locator('#toast').evaluate((e) => { const c = getComputedStyle(e); return { anim: c.animationName, dur: c.animationDuration, tdur: c.transitionDuration, tprop: c.transitionProperty }; });
  console.log(`[QA-14] sizes=${JSON.stringify(sizes)} motion=${JSON.stringify(motion)} toast=${JSON.stringify(toast)}`);
});

test('QA-15 離線：Service Worker 快取完成後斷網重開，切換、開課、完成都能用；快取名是 v41', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'zh-TW', timezoneId: 'Asia/Tokyo', serviceWorkers: 'allow' });
  const external = [];
  context.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1' && u.protocol.startsWith('http')) external.push(r.url()); });
  await context.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  const page = await context.newPage();
  await installClock(page, NOW);
  await page.goto(`${baseURL}/index.html`);
  await waitReady(page);
  const cacheName = swCacheOf(readRepo('sw.js'));
  expect(cacheName).toBe('daily-ten-v41');
  await page.waitForFunction(async (name) => {
    const keys = await caches.keys();
    if (!keys.includes(name)) return false;
    const c = await caches.open(name);
    return (await c.keys()).length > 30 && !!navigator.serviceWorker.controller;
  }, cacheName, { timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await waitReady(page);
  await page.click('#tabs button[data-s="s-gym"]');
  await lowerBtn(page).click();
  await expect(body(page)).toContainText('下一次：Lower A');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Lower A');
  await page.click('#tabs button[data-s="s-gym"]');
  await page.click('#gym-start');
  await expect(page.locator('#session h2')).toHaveText('Lower A');
  await fillAll(page);
  await page.click('#ss-finish');
  await expect(page.locator('#gs-t')).toHaveText('Lower A 完成');
  await context.setOffline(false);
  expect(external.filter((u) => !u.startsWith('https://i.ytimg.com/')), '除了 YouTube 縮圖沒有外部請求').toEqual([]);
  await context.close();
});

test('QA-16 切換的 toast 會不會蓋掉「復原」：完成一課後 10 秒內去切換（記錄實際行為）', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await page.click('#gym-start');
  await fillAll(page);
  await page.click('#ss-finish');
  await page.click('#gs-ok');
  await expect(page.locator('#toast-action')).toBeVisible();
  await page.click('#tabs button[data-s="s-gym"]');
  await upperBtn(page).click();
  const undoStill = await page.locator('#toast-action').isVisible();
  const text = await page.locator('#toast-text').textContent();
  { const obs = `切換後復原鈕還在=${undoStill} toast=${text}`; test.info().annotations.push({ type: 'observed', description: obs }); console.log(`[observed] ${test.info().title.slice(0, 6)} ${obs}`); }
});
