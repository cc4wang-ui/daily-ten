/* qa-checker：D23 自動更新——新版頁面的協定、回到前景檢查、版本顯示、減少動態。
   做法：helpers.js 的 deploy fixture 起一個可切換根目錄的伺服器（模擬 GitHub Pages）。先部署目前的樹（v_N，CACHE 讀 sw.js），
   開 App 等 SW 控制頁面；再把根目錄換成「目前的樹複製一份、CACHE 改成 v_N+1」的暫存目錄（模擬下一版），請瀏覽器檢查更新。
   - 新版 SW 啟用後送 DT_UPDATE_READY（附 port）；頁面立刻回 ACK，閒置才 location.reload()，忙碌時每 2 秒（假時鐘）再看一次。
   - SW 的 3 秒 ACK 逾時用真實時間（Playwright 的假時鐘只裝在頁面，不在 Service Worker），所以「不重新載入」的判斷一律
     先真實等 4 秒（超過逾時，確認 SW 沒有強制導向）、再推進假時鐘 6 秒（頁面的閒置檢查跑 3 次）。
   - 有沒有重新載入：在文件上做記號（markDocument），記號消失＝換了新文件。
   - 每一項都比對 localStorage 全部 key 與值：沒有因為更新而掉資料或多寫東西（刻意存檔的項目另外斷言新增的那一筆）。
   V1：動作庫在訓練分頁；早上的訓練從訓練分頁的「今日課表」開始（今日的下一步是早安打卡）。
   新增兩種「忙碌」：早安打卡後 10 秒內可復原的 toast 顯示中、早安打卡的「修改時間」列開著——都不重新載入。 */
import {
  test, expect, readFixture, fixturePath, openApp, seedState, waitReady, gotoTab, tick, tickUntil, runWorkoutToEnd,
  storageSnapshot, storedState, expectHome, swAssets, cacheNumber, makeDeployCopy, REPO_DIR, cacheNames, waitControlled,
  markDocument, sameDocument, recordSwMessages, swMessages, requestSwUpdate, realWait, expectGlossaryClean, MAIN_KEY,
  countNavigations, NOW_ISO
} from './helpers.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CUR = swAssets().cache;            // 目前版本，例 daily-ten-v7
const CUR_N = cacheNumber(CUR);
const NEXT_N = CUR_N + 1;                // 模擬下一版
const NEXT = `daily-ten-v${NEXT_N}`;
const NOTE_TEXT = `已更新到最新版（v${NEXT_N}）`;
const UPDATED_KEY = 'daily-ten-updated-to';
const SHOTS_DIR = process.env.QA_SHOTS_DIR || '';
/* QA_SHOTS_DIR 有設時存截圖（報告引用的證據） */
async function shot(page, name) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

let nextCopy = null;
test.beforeAll(() => { nextCopy = makeDeployCopy(NEXT); });
test.afterAll(() => { if (nextCopy) nextCopy.remove(); });

test.use({ serviceWorkers: 'allow', trace: 'off' });
test.describe.configure({ timeout: 120_000 });

/* 開目前版本（v_N）、等 SW 控制頁面、Cache Storage 只有 v_N */
async function openCurrent(page, deploy, { now = NOW_ISO, seed = 'v2-real.json' } = {}) {
  deploy.setRoot(REPO_DIR);
  await recordSwMessages(page);
  await openApp(page, { now, seed: seed ? seedState(readFixture(seed)) : null, url: deploy.url() });
  await waitControlled(page, CUR);
}

/* 部署下一版並請瀏覽器檢查更新；等到頁面收到 DT_UPDATE_READY（v_N+1，附 1 個 port）、舊快取已刪。只用在「頁面忙碌」的情境 */
async function deployNextWhileBusy(page, deploy) {
  deploy.setRoot(nextCopy.dir);
  const r = await requestSwUpdate(page);
  expect(r, 'registration.update()').toBe('ok');
  await expect.poll(() => swMessages(page), { timeout: 20_000, message: '頁面應收到新版通知' })
    .toEqual([{ type: 'DT_UPDATE_READY', version: NEXT, ports: 1 }]);
  await expect.poll(() => cacheNames(page), { timeout: 20_000 }).toEqual([NEXT]);
}

/* 忙碌中：超過 SW 的 3 秒 ACK 逾時（真實時間）＋頁面閒置檢查跑 3 次（假時鐘）都沒有重新載入 */
async function expectNoReload(page, token, label) {
  await realWait(4_000);
  await page.clock.runFor(6_000);
  expect(await sameDocument(page, token), `${label}：不應重新載入`).toBe(true);
}

/* 變成閒置後：下一次檢查（≤ 2 秒）重新載入，HOME 提示新版 */
async function expectReloadToNext(page, token, label) {
  await page.clock.runFor(2_000);
  await expect.poll(() => sameDocument(page, token), { timeout: 15_000, message: `${label}：閒置後應重新載入` }).toBe(false);
  await waitReady(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  await expect(page.locator('#upd-note')).toBeVisible();
  await expect(page.locator('#upd-note')).toHaveText(NOTE_TEXT);
  expect(await cacheNames(page)).toEqual([NEXT]);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), UPDATED_KEY), '提示旗標用完即刪').toBeNull();
}

test('首次安裝：不通知、不重新載入、不提示；SETUP 最下方顯示「App 版本 vN」，不在任何 .card 內', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  const token = await markDocument(page);
  await realWait(4_000);
  await page.clock.runFor(6_000);
  expect(await sameDocument(page, token)).toBe(true);
  expect(await swMessages(page), '第一次安裝（沒有舊快取）不送通知').toEqual([]);
  await expect(page.locator('#upd-note')).toBeHidden();
  await expect(page.locator('#upd-note')).toHaveText('');
  await expect(page.locator('#app-version'), 'HOME 看不到版本行').toBeHidden();

  await gotoTab(page, 's-setup');
  const v = page.locator('#app-version');
  await expect(v).toBeVisible();
  await expect(v).toHaveText(`App 版本 v${CUR_N}`);
  const info = await v.evaluate((el) => {
    const setup = document.getElementById('s-setup');
    const cards = [...setup.querySelectorAll('.card')];
    const last = cards[cards.length - 1];
    return {
      inCard: !!el.closest('.card'), parent: el.parentElement.id, isLastChild: setup.lastElementChild === el,
      belowLastCard: el.getBoundingClientRect().top >= last.getBoundingClientRect().bottom
    };
  });
  expect(info).toEqual({ inCard: false, parent: 's-setup', isLastChild: true, belowLastCard: true });
  await v.scrollIntoViewIfNeeded();
  await shot(page, 'd23-setup-app-version');
  expectGlossaryClean([await v.textContent(), NOTE_TEXT, '已更新到最新版']);
});

test('閒置：v_N → v_N+1 自動重新載入；HOME 提示新版、約 4 秒後消失；手動重新整理不再出現；localStorage 不變', async ({ page, deploy }, testInfo) => {
  await openCurrent(page, deploy, { seed: 'v3.json' });
  await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
  const before = await storageSnapshot(page);
  const navs = countNavigations(page);
  const token = await markDocument(page);
  deploy.setRoot(nextCopy.dir);
  const t0 = Date.now();
  await requestSwUpdate(page);
  await expect.poll(() => sameDocument(page, token), { timeout: 15_000, message: '閒置時應自動重新載入' }).toBe(false);
  await waitReady(page);
  const ms = Date.now() - t0;
  testInfo.annotations.push({ type: 'qa', description: `閒置：update() 到新文件就緒 ${ms} ms` });
  console.log(`[qa] 閒置：update() 到新文件就緒 ${ms} ms`);

  const note = page.locator('#upd-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText(NOTE_TEXT);
  expect(await note.evaluate((el) => el.className)).toBe('banner ok');
  await shot(page, 'd23-home-updated-note');
  /* 只重新載入一次：頁面回了 ACK，SW 的 3 秒逾時不會再導向（真實時間等 4 秒） */
  await realWait(4_000);
  expect(navs.length, '重新載入次數').toBe(1);
  expect(await cacheNames(page)).toEqual([NEXT]);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), UPDATED_KEY), '提示旗標用完即刪').toBeNull();
  expect(await storageSnapshot(page), '自動更新不改 localStorage').toEqual(before);
  await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });

  /* 約 4 秒後消失（假時鐘；淡出 200 ms 用真實時間） */
  await page.clock.runFor(3_900);
  await expect(note).toBeVisible();
  await expect(note).toHaveText(NOTE_TEXT);
  await page.clock.runFor(200);
  await expect(note).toBeHidden();
  await expect(note).toHaveText('');

  await gotoTab(page, 's-setup');
  await expect(page.locator('#app-version')).toHaveText(`App 版本 v${NEXT_N}`);
  await gotoTab(page, 's-home');

  /* 手動重新整理：不再提示 */
  await page.reload();
  await waitReady(page);
  await expect(note).toBeHidden();
  await page.clock.runFor(1_000);
  await expect(note).toBeHidden();
  await expect(note).toHaveText('');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('訓練中：保底版跑完都不重新載入；完成畫面也不；按「回報完成」回 HOME 後才重新載入，訓練紀錄有存', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  const before = await storageSnapshot(page);
  await page.click('#h-minimal');
  await expect(page.locator('#train')).toHaveClass(/active/);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '訓練中');
  await expect(page.locator('#train')).toHaveClass(/active/);

  await runWorkoutToEnd(page);
  await expect(page.locator('#done')).toHaveClass(/active/);
  expect(await sameDocument(page, token), '跑完保底版的過程中不應重新載入').toBe(true);
  await tick(page, 10);
  expect(await sameDocument(page, token), '完成畫面停留時不應重新載入').toBe(true);
  const afterSession = await storageSnapshot(page);
  const s = JSON.parse(afterSession[MAIN_KEY]);
  expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-02', type: 'minimal', xp: 3 });
  expect(s.xp).toBe(364);
  /* 除了主 key，其他 key 與訓練前相同 */
  expect({ ...afterSession, [MAIN_KEY]: null }).toEqual({ ...before, [MAIN_KEY]: null });

  await page.click('#d-ok');
  expect(await sameDocument(page, token)).toBe(true);
  await expectReloadToNext(page, token, '回報完成後');
  expect(await storageSnapshot(page), '重新載入前後 localStorage 相同（訓練紀錄有存）').toEqual(afterSession);
  await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
});

test('匯入預覽開著（選檔，貼上區是空的）：不重新載入；取消後才重新載入，資料沒被匯入', async ({ page, deploy }) => {
  await openCurrent(page, deploy, { seed: 'v3.json' });
  await gotoTab(page, 's-setup');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
  await chooser.setFiles(fixturePath('v2-real.json'));
  await expect(page.locator('#imp-preview')).toBeVisible();
  expect(await page.inputValue('#exp-area')).toBe('');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toMatch(/^(TEXTAREA|INPUT)$/);
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '匯入預覽開著');
  await expect(page.locator('#imp-preview')).toBeVisible();
  expect(await storageSnapshot(page)).toEqual(before);

  await page.click('#imp-cancel');
  await expect(page.locator('#imp-preview')).toBeHidden();
  await expectReloadToNext(page, token, '取消匯入後');
  expect(await storageSnapshot(page), '匯入沒有被套用、資料不變').toEqual(before);
  await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
});

test('BODY 輸入框已填值（焦點已離開）：不重新載入；清空後才重新載入，localStorage 不變', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-body');
  await page.fill('#bd-weight', '68.4');
  await page.locator('#bd-weight').blur();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, 'BODY 有填值');
  expect(await page.inputValue('#bd-weight')).toBe('68.4');

  await page.fill('#bd-weight', '');
  await page.locator('#bd-weight').blur();
  await expectReloadToNext(page, token, '清空 BODY 後');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('BODY 輸入框已填值：存檔後才重新載入，剛存的體重在', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-body');
  await page.fill('#bd-weight', '68.4');
  await page.fill('#bd-waist', '79.5');
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, 'BODY 填到一半（焦點在輸入框）');

  await page.click('#bd-save');
  await expect(page.locator('#bd-msg')).toHaveText('已記錄今日（2 項）');
  const saved = await storageSnapshot(page);
  await expectReloadToNext(page, token, 'BODY 存檔後');
  expect(await storageSnapshot(page)).toEqual(saved);
  const s = await storedState(page);
  const b = JSON.parse(before[MAIN_KEY]);
  const lastOf = (a) => a[a.length - 1];
  expect(lastOf(s.body.weight)).toEqual({ date: '2026-10-02', v: 68.4 });
  expect(lastOf(s.body.waist)).toEqual({ date: '2026-10-02', v: 79.5 });
  expect(s.body.weight.length).toBe(b.body.weight.length + 1);
  expect(s.sessions).toEqual(b.sessions);
  expect(s.xp).toBe(b.xp);
});

test('SETUP 文字框有焦點（還沒打字）：不重新載入；離開文字框後才重新載入', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-setup');
  await page.click('#exp-area');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('exp-area');
  expect(await page.inputValue('#exp-area')).toBe('');
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, 'textarea 有焦點');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('exp-area');

  await page.locator('#exp-area').blur();
  await expectReloadToNext(page, token, '離開文字框後');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('示範視窗開著：不重新載入；關掉後才重新載入', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-train');
  await page.locator('#vids button[data-demo]').first().click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '示範視窗開著');
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);

  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expectReloadToNext(page, token, '關掉示範視窗後');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('Boss 成績輸入畫面（2 英里，還沒填）：不重新載入；存成績、回報完成後才重新載入，PR 有存', async ({ page, deploy }) => {
  await openCurrent(page, deploy, { now: '2026-10-11T08:00:00+09:00', seed: 'v3.json' });
  await gotoTab(page, 's-train');
  await expect(page.locator('#tr-start')).toHaveText('開始 Boss Day');
  await page.click('#tr-start');
  await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'),
    { every: 5, maxSeconds: 2400, label: '2 英里輸入畫面' });
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => document.activeElement === document.body || !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))).toBe(true);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, 'Boss 成績輸入');
  await expect(page.locator('#s-boss')).toHaveClass(/active/);

  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '30');
  await page.click('#bi-save');
  await expect(page.locator('#done')).toHaveClass(/active/);
  await tick(page, 4);
  expect(await sameDocument(page, token), '完成畫面不應重新載入').toBe(true);
  const saved = await storageSnapshot(page);
  await page.click('#d-ok');
  await expectReloadToNext(page, token, 'Boss 回報完成後');
  expect(await storageSnapshot(page)).toEqual(saved);
  const s = await storedState(page);
  expect(s.prs.run2mi[s.prs.run2mi.length - 1]).toEqual({ date: '2026-10-11', sec: 1110 });
  expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-11', type: 'boss', xp: 20 });
});

test('早安打卡後 10 秒內（復原 toast 顯示中）：不重新載入；toast 收起後才重新載入，打卡紀錄有存', async ({ page, deploy }) => {
  await openCurrent(page, deploy, { now: '2026-10-05T07:00:00+09:00' });
  await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
  await page.click('#h-start');
  await page.click('#ci-wake');
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible();
  await expect(page.locator('#toast-action')).toBeVisible();
  const saved = await storageSnapshot(page);
  expect(JSON.parse(saved[MAIN_KEY]).habits.sleep.log).toHaveLength(1);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '復原 toast 顯示中'); // 假時鐘 +6 秒：仍在 10 秒的復原時段內
  await expect(toast).toBeVisible();
  await expect(page.locator('#toast-action')).toBeVisible();

  await page.clock.runFor(4_000); // 滿 10 秒：toast 收起、復原消失
  await expect(toast).toBeHidden();
  await expectReloadToNext(page, token, 'toast 收起後');
  expect(await storageSnapshot(page), '重新載入前後 localStorage 相同（打卡有存）').toEqual(saved);
  await expect(page.locator('#h-start')).not.toHaveAttribute('data-kind', 'checkin');
});

test('早安打卡的「修改時間」列開著：不重新載入；按「恢復預設」收起後才重新載入，沒有寫入', async ({ page, deploy }) => {
  await openCurrent(page, deploy, { now: '2026-10-05T07:00:00+09:00' });
  await page.click('#h-start');
  await expect(page.locator('#s-checkin')).toHaveClass(/active/);
  await page.click('#ci-edit');
  const row = page.locator('#ci-edit-row');
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)), '焦點不在輸入框（只靠編輯列判斷忙碌）').toBe(false);
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '修改時間列開著');
  await expect(row).toBeVisible();

  await page.click('#ci-edit-reset');
  await expect(row).toBeHidden();
  await expectReloadToNext(page, token, '收起修改時間列後');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('回到前景：visibilitychange → registration.update() 並套用新版；60 秒內最多一次（online 共用節流）；背景時不檢查', async ({ page, deploy }) => {
  await page.addInitScript(() => {
    window.__qaUpdateCalls = 0;
    const orig = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function (...args) { window.__qaUpdateCalls++; return orig.apply(this, args); };
  });
  await openCurrent(page, deploy);
  const calls = () => page.evaluate(() => window.__qaUpdateCalls);
  expect(await calls(), '開機時不主動呼叫 update()').toBe(0);
  const swFetches = deploy.count('/sw.js');
  const token = await markDocument(page);
  deploy.setRoot(nextCopy.dir);
  /* 派發 visibilitychange（visibilityState = visible），在同一個 evaluate 裡等到 update() 被呼叫（MessageChannel 讓出，不靠假時鐘） */
  const firstCall = await page.evaluate(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 200 && !window.__qaUpdateCalls; i++) {
      await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
    }
    return window.__qaUpdateCalls;
  });
  expect(firstCall, 'visibilitychange → update()').toBe(1);
  await expect.poll(() => sameDocument(page, token), { timeout: 20_000, message: '抓到新版 → 閒置 → 重新載入' }).toBe(false);
  await waitReady(page);
  expect(deploy.count('/sw.js'), 'update() 有向伺服器抓 sw.js').toBeGreaterThan(swFetches);
  await expect(page.locator('#upd-note')).toHaveText(NOTE_TEXT);
  expect(await cacheNames(page)).toEqual([NEXT]);

  /* 節流（新文件，計數從 0 開始；Date.now 由假時鐘控制） */
  const fire = (type) => page.evaluate((type) => { (type === 'online' ? window : document).dispatchEvent(new Event(type)); }, type);
  const settle = () => realWait(300);
  expect(await calls()).toBe(0);
  await fire('visibilitychange');
  await expect.poll(calls).toBe(1);
  await fire('visibilitychange');
  await settle();
  expect(await calls(), '馬上再切回來：不再檢查').toBe(1);
  await page.clock.runFor(59_999);
  await fire('visibilitychange');
  await fire('online');
  await settle();
  expect(await calls(), '59.999 秒：仍在節流').toBe(1);
  await page.clock.runFor(1);
  await fire('visibilitychange');
  await expect.poll(calls, { message: '滿 60 秒：再檢查一次' }).toBe(2);
  await fire('online');
  await settle();
  expect(await calls(), 'online 與 visibilitychange 共用節流').toBe(2);
  await page.clock.runFor(60_000);
  await fire('online');
  await expect.poll(calls, { message: '恢復連線（online）也會檢查' }).toBe(3);
  /* 切到背景（hidden）時的 visibilitychange 不檢查 */
  await page.clock.runFor(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle();
  expect(await calls(), 'hidden 不檢查').toBe(3);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(calls).toBe(4);
  /* 沒有更新時不會重新載入、不再提示 */
  const t2 = await markDocument(page);
  await realWait(1_000);
  expect(await sameDocument(page, t2)).toBe(true);
});

test('「已更新」提示浮在最上方：出現時 HOME 其他元素位置不變、點擊穿透（pointer-events: none）', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  const layout = () => page.evaluate(() => [...document.querySelectorAll('#s-home > *')]
    .filter((el) => el.id !== 'upd-note' && el.getClientRects().length > 0)
    .map((el) => `${el.id || el.className}@${Math.round(el.getBoundingClientRect().top)}`));
  const before = await layout();
  const token = await markDocument(page);
  deploy.setRoot(nextCopy.dir);
  await requestSwUpdate(page);
  await expect.poll(() => sameDocument(page, token), { timeout: 15_000 }).toBe(false);
  await waitReady(page);
  const note = page.locator('#upd-note');
  await expect(note).toHaveText(NOTE_TEXT);
  expect(await layout(), '提示出現時其他元素位置不變').toEqual(before);
  const hit = await note.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { pointerEvents: getComputedStyle(el).pointerEvents, hitIsNote: under === el || el.contains(under) };
  });
  expect(hit).toEqual({ pointerEvents: 'none', hitIsNote: false });
});

test('BODY 數字欄位打到一半（只打「.」：value 是空的、validity.badInput）：不重新載入；清掉後才重新載入', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-body');
  await page.locator('#bd-weight').pressSequentially('.');
  expect(await page.evaluate(() => { const el = document.getElementById('bd-weight'); return { value: el.value, badInput: el.validity.badInput }; }))
    .toEqual({ value: '', badInput: true });
  await page.locator('#bd-weight').blur();
  const before = await storageSnapshot(page);
  const token = await markDocument(page);
  await deployNextWhileBusy(page, deploy);
  await expectNoReload(page, token, '數字打到一半');
  await page.fill('#bd-weight', '');
  await page.locator('#bd-weight').blur();
  await expectReloadToNext(page, token, '清掉後');
  expect(await storageSnapshot(page)).toEqual(before);
});

test('SETUP 勾選框剛點過（焦點留在勾選框，值固定是 "on"）不算正在輸入：照樣重新載入，剛改的設定有存', async ({ page, deploy }) => {
  await openCurrent(page, deploy);
  await gotoTab(page, 's-setup');
  await page.click('#cfg-band');
  expect(await page.evaluate(() => ({ id: document.activeElement.id, value: document.activeElement.value }))).toEqual({ id: 'cfg-band', value: 'on' });
  const saved = await storageSnapshot(page);
  expect(JSON.parse(saved[MAIN_KEY]).settings.band).toBe(true); // v2-real 是 false，點一下變 true
  const token = await markDocument(page);
  deploy.setRoot(nextCopy.dir);
  await requestSwUpdate(page);
  await expect.poll(() => sameDocument(page, token), { timeout: 15_000 }).toBe(false);
  await waitReady(page);
  await expect(page.locator('#upd-note')).toHaveText(NOTE_TEXT);
  expect(await storageSnapshot(page)).toEqual(saved);
});

test('瀏覽器不支援 Service Worker 與 Cache Storage（例如部分 App 內建瀏覽器）：App 正常、版本行不顯示、不報錯', async ({ page }) => {
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    try { delete window.caches; } catch (e) { /* 不可刪就略過 */ }
    try { delete Window.prototype.caches; } catch (e) { /* 同上 */ }
  });
  await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
  expect(await page.evaluate(() => ({ sw: 'serviceWorker' in navigator, caches: typeof window.caches }))).toEqual({ sw: false, caches: 'undefined' });
  await gotoTab(page, 's-setup');
  await expect(page.locator('#app-version')).toBeHidden();
  await expect(page.locator('#app-version')).toHaveText('');
  await gotoTab(page, 's-home');
  await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  await expect(page.locator('#upd-note')).toBeHidden();
});

test('恢復連線（真的斷網再連上，瀏覽器自己發 online 事件）→ 呼叫 update() 一次，有新版就套用', async ({ page, context, deploy }) => {
  await page.addInitScript(() => {
    window.__qaUpdateCalls = 0;
    const orig = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function (...args) { window.__qaUpdateCalls++; return orig.apply(this, args); };
  });
  await openCurrent(page, deploy);
  expect(await page.evaluate(() => window.__qaUpdateCalls)).toBe(0);
  const token = await markDocument(page);
  await context.setOffline(true);
  deploy.setRoot(nextCopy.dir);
  await realWait(300);
  expect(await page.evaluate(() => window.__qaUpdateCalls), '斷網時不檢查').toBe(0);
  await context.setOffline(false);
  await expect.poll(() => sameDocument(page, token), { timeout: 20_000, message: '連上後抓到新版 → 閒置 → 重新載入' }).toBe(false);
  await waitReady(page);
  await expect(page.locator('#upd-note')).toHaveText(NOTE_TEXT);
  expect(await cacheNames(page)).toEqual([NEXT]);
});

test('多個 key 的 localStorage 在自動更新前後逐字相同（含修補過的備份 key 與匯入前 key）', async ({ page, deploy }) => {
  deploy.setRoot(REPO_DIR);
  await recordSwMessages(page);
  /* v2-wrong-types：開機會修補並另存 bak-v2；另外放一個匯入前 key 與一個 App 不認得的 key */
  await openApp(page, {
    seed: { [MAIN_KEY]: readFixture('v2-wrong-types.json'), 'daily-ten-state.pre-import': readFixture('v3.json'), 'qa-other-key': 'x' },
    url: deploy.url()
  });
  await waitControlled(page, CUR);
  await expect(page.locator('#err-card')).toBeVisible();
  const before = await storageSnapshot(page);
  expect(Object.keys(before).sort()).toEqual([MAIN_KEY, 'daily-ten-state.bak-v2', 'daily-ten-state.pre-import', 'qa-other-key'].sort());
  const token = await markDocument(page);
  deploy.setRoot(nextCopy.dir);
  await requestSwUpdate(page);
  await expect.poll(() => sameDocument(page, token), { timeout: 15_000 }).toBe(false);
  await waitReady(page);
  await expect(page.locator('#upd-note')).toHaveText(NOTE_TEXT);
  expect(await storageSnapshot(page)).toEqual(before);
});

test.describe('版本行：拿不到版本時不顯示、不報錯', () => {
  test.describe('SW 被封鎖', () => {
    test.use({ serviceWorkers: 'block' });
    test('SETUP 沒有版本行；切換分頁重畫也一樣；沒有 console error／頁面錯誤', async ({ page }) => {
      await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
      await gotoTab(page, 's-setup');
      await expect(page.locator('#app-version')).toBeHidden();
      await expect(page.locator('#app-version')).toHaveText('');
      await gotoTab(page, 's-home');
      await gotoTab(page, 's-setup');
      await expect(page.locator('#app-version')).toBeHidden();
      expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
    });
  });
  test('Cache Storage 讀取失敗（keys() reject）：版本行不顯示、App 正常', async ({ page, deploy }) => {
    await page.addInitScript(() => {
      CacheStorage.prototype.keys = function () { return Promise.reject(new DOMException('blocked by test', 'SecurityError')); };
    });
    deploy.setRoot(REPO_DIR);
    await openApp(page, { seed: seedState(readFixture('v2-real.json')), url: deploy.url() });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await gotoTab(page, 's-setup');
    await expect(page.locator('#app-version')).toBeHidden();
    await expect(page.locator('#app-version')).toHaveText('');
    await gotoTab(page, 's-home');
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  });
});

/* ---------- prefers-reduced-motion ---------- */
async function recordAnimations(page) {
  await page.addInitScript(() => {
    window.__qaAnims = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const a = orig.call(this, keyframes, options);
      try {
        const t = a.effect.getTiming();
        window.__qaAnims.push({ id: this.id, keyframes: a.effect.getKeyframes().map((k) => ({ ...k })), duration: t.duration, fill: t.fill });
      } catch (e) { window.__qaAnims.push({ id: this.id, error: String(e) }); }
      return a;
    };
  });
}

for (const mode of ['reduce', 'no-preference']) {
  test(`prefers-reduced-motion: ${mode} → 「已更新」提示${mode === 'reduce' ? '直接出現／消失，沒有任何動畫' : '只淡入淡出 opacity（200 ms），沒有位移'}`, async ({ page, deploy }) => {
    await page.emulateMedia({ reducedMotion: mode });
    await recordAnimations(page);
    await openCurrent(page, deploy);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(mode === 'reduce');
    const token = await markDocument(page);
    deploy.setRoot(nextCopy.dir);
    await requestSwUpdate(page);
    await expect.poll(() => sameDocument(page, token), { timeout: 15_000 }).toBe(false);
    await waitReady(page);
    const note = page.locator('#upd-note');
    await expect(note).toHaveText(NOTE_TEXT);
    await expect(note).toBeVisible();
    const style = await note.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, animation: cs.animationName, transform: cs.transform, position: cs.position };
    });
    expect(style).toEqual({ transition: '0s', animation: 'none', transform: 'none', position: 'fixed' });
    await page.clock.runFor(4_100);
    await expect(note).toBeHidden();
    await expect(note).toHaveText('');
    const anims = await page.evaluate(() => window.__qaAnims);
    expect(await page.evaluate(() => document.getAnimations().length), '沒有殘留動畫').toBe(0);
    if (mode === 'reduce') {
      expect(anims, 'reduce：不呼叫 Element.animate').toEqual([]);
    } else {
      expect(anims.map((a) => a.id)).toEqual(['upd-note', 'upd-note']);
      for (const a of anims) {
        const props = new Set(a.keyframes.flatMap((k) => Object.keys(k)));
        for (const meta of ['offset', 'computedOffset', 'easing', 'composite']) props.delete(meta);
        expect([...props], '只動 opacity').toEqual(['opacity']);
        expect(a.duration).toBe(200);
      }
      expect(anims[0].keyframes.map((k) => k.opacity)).toEqual(['0', '1']);
      expect(anims[1].keyframes.map((k) => k.opacity)).toEqual(['1', '0']);
    }
  });
}
