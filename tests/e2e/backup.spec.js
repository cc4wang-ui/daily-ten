/* qa-checker：備份下載 e2e（PLAN.md §2 #7、§5 #6；CLAUDE.md D4）。
   - SETUP「下載備份」：檔名 daily-ten-backup-YYYY-MM-DD.json（本地日期），內容＝下載後 localStorage 的 state，
     meta.lastBackupAt 為含時區 offset 的 ISO（Asia/Tokyo +09:00；America/Los_Angeles -07:00）。
   - D27（Cross 2026-10-06 放棄備份）：今日不再有 7 天備份提醒卡（#bk-reminder*）。從未備份、超過 7 天、全新、壞資料，
     今日都沒有提醒卡、也沒有任何「備份」字樣；設定的資料備份卡照舊。v3.json 的 lastBackupAt = 2026-09-30T21:15:00+09:00。
   headless Chromium 沒有 navigator.share，App 走 Blob 下載（iPhone 分享選單列入真機清單）。 */
import {
  test, expect, readFixture, openApp, seedState, storageSnapshot, storedState, rawMain, gotoTab,
  clickAndDownload, expectGlossaryClean, waitReady, confirmImportTwice, MAIN_KEY, NOW_ISO
} from './helpers.js';

const texts = [];
/* D27 拿掉的今日提醒卡：這些 id 在 DOM 裡一個都不能有 */
const REMINDER_IDS = ['bk-reminder', 'bk-reminder-text', 'bk-reminder-msg', 'bk-reminder-btn'];

async function downloadFromSetup(page) {
  await gotoTab(page, 's-setup');
  return { file: await clickAndDownload(page, '#bk-download') };
}

test.describe('下載備份（Asia/Tokyo）', () => {
  test('檔名、內容＝下載後的 state、lastBackupAt 含 +09:00；SETUP 狀態跟著更新、重開仍在', async ({ page }) => {
    const raw = readFixture('v2-real.json');
    await openApp(page, { seed: seedState(raw) });
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
    /* 重新開 App：狀態保留 */
    await page.reload();
    await waitReady(page);
    await gotoTab(page, 's-setup');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    /* 用剛下載的備份檔匯入（選檔）：預覽每一列都「不變」、沒有警告；兩次確認後資料與備份檔完全相同 */
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
    await chooser.setFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) });
    await expect(page.locator('#imp-preview')).toBeVisible();
    await expect(page.locator('#imp-error')).toBeHidden();
    const changed = await page.locator('#imp-rows .prline[data-key]').evaluateAll((els) => els.map((el) => `${el.dataset.key}=${el.dataset.changed}`));
    expect(changed).toHaveLength(8); // V1：預覽只列存檔裡的事實（8 列）
    expect(changed.filter((c) => !c.endsWith('=false'))).toEqual([]);
    await expect(page.locator('#imp-warnings')).toBeHidden();
    await confirmImportTwice(page); // 第二下在 1.5 秒後（連點保護：1 秒內的點擊忽略）
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    expect(await storedState(page)).toEqual(backup);
    expectGlossaryClean(texts);
  });

  test('新控制項沿用既有按鈕元件，觸控高度 ≥ 44px', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-wrong-types.json')) }); // 錯誤卡（D27 起今日沒有提醒卡）
    const measure = (ids) => page.evaluate((ids) => ids.map((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { id, cls: el.className, h: r.height, w: r.width };
    }), ids);
    const home = await measure(['err-download', 'err-dismiss']);
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
});

/* D27：今日沒有 7 天備份提醒卡。以前會顯示的情境（從未備份＋有資料、超過 7 天）與本來就不顯示的情境（全新、空資料、壞資料）一律沒有；
   同一個 App 時間往後推、切回今日重畫也沒有。今日的文字不含「備份」；設定的資料備份卡照舊（下載、選檔匯入按鈕都在）。 */
test('D27：從未備份、超過 7 天、全新、壞資料 → 今日都沒有備份提醒卡、沒有「備份」字樣；設定的資料備份卡照舊', async ({ page }) => {
  const checkHome = async (label) => {
    await expect(page.locator('#s-home'), label).toHaveClass(/active/);
    for (const id of REMINDER_IDS) await expect(page.locator(`#${id}`), `${label}：#${id}`).toHaveCount(0);
    expect(await page.locator('#s-home').innerText(), `${label}：今日的文字`).not.toMatch(/備份/);
  };
  const reopen = async (raw) => {
    await page.evaluate((raw) => { localStorage.clear(); if (raw !== null) localStorage.setItem('daily-ten-state', raw); }, raw);
    await page.reload();
    await waitReady(page);
  };
  /* 1. 從未備份、有資料（D27 以前會立刻提醒） */
  const neverBacked = ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json'];
  await openApp(page, { seed: seedState(readFixture(neverBacked[0])) });
  for (const f of neverBacked) {
    if (f !== neverBacked[0]) await reopen(readFixture(f));
    await checkHome(`從未備份（${f}）`);
  }
  /* 2. v3.json 上次備份 2026-09-30 21:15 → 時間推到剛好 7 天＋1 分、再推到 8 天：切回今日重畫，仍沒有 */
  await reopen(readFixture('v3.json'));
  await checkHome('v3（上次備份 1 天多前）');
  await page.clock.setSystemTime(new Date('2026-10-07T21:16:00+09:00'));
  await gotoTab(page, 's-body');
  await gotoTab(page, 's-home');
  await checkHome('v3（7 天＋1 分）');
  await page.clock.setSystemTime(new Date('2026-10-08T21:15:00+09:00'));
  await page.reload();
  await waitReady(page);
  await checkHome('v3（8 天，重開）');
  /* 3. 全新（沒有任何資料）、空資料、壞資料（錯誤卡照常出現） */
  await reopen(null);
  await checkHome('全新');
  await reopen(readFixture('empty-arrays.json'));
  await checkHome('empty-arrays');
  await reopen(readFixture('corrupt-state.txt'));
  await expect(page.locator('#err-card')).toBeVisible();
  await checkHome('壞資料（corrupt-state）');
  /* 設定的資料備份卡照舊 */
  await gotoTab(page, 's-setup');
  await expect(page.locator('#bk-download')).toBeVisible();
  await expect(page.locator('#imp-file-btn')).toBeVisible();
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
