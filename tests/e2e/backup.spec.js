/* qa-checker：備份下載與 7 天提醒卡 e2e（PLAN.md §2 #7、§5 #6；CLAUDE.md D4）。
   - SETUP「下載備份」：檔名 daily-ten-backup-YYYY-MM-DD.json（本地日期），內容＝下載後 localStorage 的 state，
     meta.lastBackupAt 為含時區 offset 的 ISO（Asia/Tokyo +09:00；America/Los_Angeles -07:00）。
   - HOME 提醒卡（注入時鐘）：從未備份＋有資料 → 顯示；6 天、剛好 7 天 → 不顯示；7 天＋1 分、8 天 → 顯示；空資料 → 不顯示；
     按提醒卡的「下載備份」後卡片消失。v3.json 的 lastBackupAt = 2026-09-30T21:15:00+09:00。
   headless Chromium 沒有 navigator.share，App 走 Blob 下載（iPhone 分享選單列入真機清單）。 */
import {
  test, expect, readFixture, openApp, seedState, storageSnapshot, storedState, rawMain, gotoTab,
  clickAndDownload, expectGlossaryClean, waitReady, MAIN_KEY, NOW_ISO
} from './helpers.js';

const NEVER = '還沒有下載過備份。資料只存在這台裝置，建議現在下載一份。';
const daysText = (n) => `已經 ${n} 天沒有下載備份，建議現在下載一份。`;
const texts = [];

async function downloadFromSetup(page) {
  await gotoTab(page, 's-setup');
  return { file: await clickAndDownload(page, '#bk-download') };
}

test.describe('下載備份（Asia/Tokyo）', () => {
  test('檔名、內容＝下載後的 state、lastBackupAt 含 +09:00；SETUP 狀態與 HOME 提醒卡跟著更新', async ({ page }) => {
    const raw = readFixture('v2-real.json');
    await openApp(page, { seed: seedState(raw) });
    await expect(page.locator('#bk-reminder')).toBeVisible();
    await expect(page.locator('#bk-reminder-text')).toHaveText(NEVER);
    texts.push(NEVER, await page.locator('#bk-reminder-btn').textContent());
    await gotoTab(page, 's-setup');
    await expect(page.locator('#bk-status')).toHaveText('尚未下載過備份');
    texts.push('尚未下載過備份', await page.locator('#bk-download').textContent(), await page.locator('#imp-file-btn').textContent());
    expect(await rawMain(page)).toBe(raw); // 下載前主 key 仍是原文

    const file = await clickAndDownload(page, '#bk-download');
    expect(file.name).toBe('daily-ten-backup-2026-10-02.json');
    const backup = JSON.parse(file.text);
    expect(file.text).toBe(JSON.stringify(backup, null, 2));
    expect(backup.meta.lastBackupAt).toBe(NOW_ISO);
    expect(backup.meta.lastBackupAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    expect(backup.version).toBe(3);
    expect(backup.xp).toBe(361);
    expect(backup.game.xp).toEqual({ move: 361, sleep: 0, explore: 0, total: 361 });
    /* 內容 = 下載後 localStorage 的 state（同時也是記憶體中的 state：再存一次結果相同） */
    const stored = await storedState(page);
    expect(stored).toEqual(backup);
    expect(Object.keys(await storageSnapshot(page))).toEqual([MAIN_KEY]);
    /* 除了 lastBackupAt 之外，和下載前遷移後的資料相同 */
    const { meta: _m, ...rest } = backup;
    const expected = JSON.parse(raw);
    expect(rest.sessions).toEqual(expected.sessions);
    expect(rest.prs).toEqual(expected.prs);
    expect(rest.body).toEqual(expected.body);
    expect(rest.streak).toEqual(expected.streak);
    expect(rest.settings).toMatchObject(expected.settings);

    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    texts.push(await page.locator('#bk-status').textContent());
    await gotoTab(page, 's-home');
    await expect(page.locator('#bk-reminder')).toBeHidden();
    /* 重新開 App：仍不提醒、狀態保留 */
    await page.reload();
    await expect(page.locator('#bd-macros')).not.toBeEmpty();
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await gotoTab(page, 's-setup');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    /* 用剛下載的備份檔匯入（選檔）：預覽每一列都「不變」、沒有警告；兩次確認後資料與備份檔完全相同 */
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
    await chooser.setFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) });
    await expect(page.locator('#imp-preview')).toBeVisible();
    await expect(page.locator('#imp-error')).toBeHidden();
    const changed = await page.locator('#imp-rows .prline[data-key]').evaluateAll((els) => els.map((el) => `${el.dataset.key}=${el.dataset.changed}`));
    expect(changed).toHaveLength(11);
    expect(changed.filter((c) => !c.endsWith('=false'))).toEqual([]);
    await expect(page.locator('#imp-warnings')).toBeHidden();
    await page.click('#imp-confirm');
    await page.click('#imp-confirm');
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    expect(await storedState(page)).toEqual(backup);
    expectGlossaryClean(texts);
  });

  test('新控制項沿用既有按鈕元件，觸控高度 ≥ 44px', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-wrong-types.json')) }); // 錯誤卡＋提醒卡
    const measure = (ids) => page.evaluate((ids) => ids.map((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, cls: el.className, h: r.height, w: r.width };
    }), ids);
    const home = await measure(['err-download', 'err-dismiss', 'bk-reminder-btn']);
    await gotoTab(page, 's-setup');
    await page.fill('#exp-area', readFixture('v3.json'));
    await page.click('#imp-btn');
    await expect(page.locator('#imp-preview')).toBeVisible(); // 離開 SETUP 會收起預覽，所以在這裡量
    const setup = await measure(['bk-download', 'imp-file-btn', 'imp-confirm', 'imp-cancel']);
    for (const b of [...home, ...setup]) {
      expect(['btn-sub', 'btn-main'], b.id).toContain(b.cls);
      expect(b.h, `${b.id} 高度`).toBeGreaterThanOrEqual(44);
      expect(b.w, `${b.id} 寬度`).toBeGreaterThanOrEqual(44);
    }
  });

  test('HOME 提醒卡的「下載備份」：下載內容正確、卡片立刻消失', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v1-minimal.json')) });
    await expect(page.locator('#bk-reminder')).toHaveClass('banner warn');
    const file = await clickAndDownload(page, '#bk-reminder-btn');
    expect(file.name).toBe('daily-ten-backup-2026-10-02.json');
    const backup = JSON.parse(file.text);
    expect(backup.meta.lastBackupAt).toBe(NOW_ISO);
    expect(backup.xp).toBe(35);
    expect(await storedState(page)).toEqual(backup);
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await expect(page.locator('#bk-reminder')).toHaveClass('banner');
    await gotoTab(page, 's-setup');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
  });
});

test.describe('7 天提醒卡的邊界（v3.json：上次備份 2026-09-30 21:15 +09:00）', () => {
  const CASES = [
    { now: '2026-10-02T15:30:00+09:00', show: false, label: '1 天多' },
    { now: '2026-10-06T21:15:00+09:00', show: false, label: '剛好 6 天' },
    { now: '2026-10-07T21:15:00+09:00', show: false, label: '剛好 7 天' },
    { now: '2026-10-07T21:16:00+09:00', show: true, days: 7, label: '7 天＋1 分' },
    { now: '2026-10-08T21:15:00+09:00', show: true, days: 8, label: '8 天' }
  ];
  for (const c of CASES) {
    test(`${c.label} → ${c.show ? '顯示' : '不顯示'}`, async ({ page }) => {
      await openApp(page, { now: c.now, seed: seedState(readFixture('v3.json')) });
      const card = page.locator('#bk-reminder');
      if (c.show) {
        await expect(card).toBeVisible();
        await expect(page.locator('#bk-reminder-text')).toHaveText(daysText(c.days));
        texts.push(daysText(c.days));
      } else {
        await expect(card).toBeHidden();
      }
    });
  }

  test('剛好 7 天不顯示；同一個 App 再過 1 分鐘、切回 HOME 會重新判斷 → 顯示', async ({ page }) => {
    await openApp(page, { now: '2026-10-07T21:15:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await page.clock.runFor(60_000);
    await gotoTab(page, 's-body');
    await gotoTab(page, 's-home');
    await expect(page.locator('#bk-reminder')).toBeVisible();
    await expect(page.locator('#bk-reminder-text')).toHaveText(daysText(7));
  });

  test('沒有任何紀錄（empty-arrays、第一次開 App、壞資料改用空白）→ 不顯示', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('empty-arrays.json')) });
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await page.evaluate(() => localStorage.clear()); // sessionStorage 旗標還在：reload 不會再寫入 fixture
    await page.reload();
    await expect(page.locator('#bd-macros')).not.toBeEmpty();
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await page.evaluate((raw) => localStorage.setItem('daily-ten-state', raw), readFixture('corrupt-state.txt'));
    await page.reload();
    await expect(page.locator('#bd-macros')).not.toBeEmpty();
    await expect(page.locator('#err-card')).toBeVisible();
    await expect(page.locator('#bk-reminder')).toBeHidden();
  });

  test('從未備份、有資料的 fixture（v1、v2 真實、v2 缺欄位、v2 型別錯）→ 立刻顯示', async ({ page }) => {
    const files = ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json'];
    await openApp(page, { seed: seedState(readFixture(files[0])) });
    for (const f of files) {
      if (f !== files[0]) {
        await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('daily-ten-state', raw); }, readFixture(f));
        await page.reload();
        await waitReady(page);
      }
      await expect(page.locator('#bk-reminder'), f).toBeVisible();
      await expect(page.locator('#bk-reminder-text'), f).toHaveText(NEVER);
    }
  });
});

test.describe('下載備份（America/Los_Angeles）', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('lastBackupAt 用當地 offset -07:00；檔名與 SETUP 狀態用當地日期', async ({ page }) => {
    /* 2026-10-02 15:30 +09:00 = 2026-10-01 23:30 -07:00（PDT） */
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    expect(await page.evaluate(() => new Date().getTimezoneOffset())).toBe(420);
    const { file } = await downloadFromSetup(page);
    expect(file.name).toBe('daily-ten-backup-2026-10-01.json');
    const backup = JSON.parse(file.text);
    expect(backup.meta.lastBackupAt).toBe('2026-10-01T23:30:00-07:00');
    expect(Date.parse(backup.meta.lastBackupAt)).toBe(Date.parse(NOW_ISO));
    expect(await storedState(page)).toEqual(backup);
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-01 23:30');
  });

  test('v3 的 +09:00 時間戳在 LA 也正確換算：7 天＋1 分才提醒', async ({ page }) => {
    await openApp(page, { now: '2026-10-07T21:15:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await page.clock.runFor(60_000);
    await gotoTab(page, 's-body');
    await gotoTab(page, 's-home');
    await expect(page.locator('#bk-reminder')).toBeVisible();
  });
});

test.describe('下載備份（Asia/Kathmandu，非整點時區）', () => {
  test.use({ timezoneId: 'Asia/Kathmandu' });
  test('lastBackupAt 為 +05:45', async ({ page }) => {
    /* 2026-10-02 15:30 +09:00 = 2026-10-02 12:15 +05:45 */
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    const { file } = await downloadFromSetup(page);
    expect(file.name).toBe('daily-ten-backup-2026-10-02.json');
    expect(JSON.parse(file.text).meta.lastBackupAt).toBe('2026-10-02T12:15:00+05:45');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 12:15');
  });
});

test.afterAll(() => expectGlossaryClean(texts));
