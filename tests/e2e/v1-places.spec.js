/* qa-checker：V1 搬家後的舊功能都找得到（D26：分頁＝今日／訓練／統計＋右上齒輪＝設定）。
   1. 訓練分頁：今日課表開始、加一輪、保底版、雨天替代、週日 Boss、一週節奏（今天標示）、彈力帶說明、動作庫（示範＝內建動畫、真人＝YouTube 連結）。
   2. 統計：熱力圖（56 格＝每天的訓練種類）、PR（最近 5 筆、新到舊）、身體指標輸入。
   3. 設定：語音／提示音／彈力帶開關（存檔、彈力帶會改課表）、就寢／起床時間（存檔、早安打卡預填；空白或格式不對不存）、
      下載備份、匯入（選檔＋貼上）、App 版本行在最下方（不在卡片內）；設定擁有全部控制項（取代退役的「SETUP 結構」等價測試）。
   4. 分頁列只有三顆、≥44px、目前分頁有 aria-current；統計的兩段是 tab（aria-selected）。 */
import {
  test, expect, readFixture, openApp, seedState, storedState, storageSnapshot, gotoTab, clickAndDownload, tick, NOW_ISO
} from './helpers.js';

const YT = 'https://www.youtube.com/results?search_query=';
const abortTraining = async (page) => {
  await expect(page.locator('#train')).toHaveClass(/active/);
  await tick(page, 2);
  await page.click('#t-abort');
  await expect(page.locator('#train')).not.toHaveClass(/active/);
};

test.describe('訓練分頁', () => {
  test('週五：今日課表、加一輪、保底版、雨天替代都能開始（中途結束不記錄）；一週節奏標示今天；彈力帶說明', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    const before = await storageSnapshot(page);
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-title')).toHaveText('訓練');
    await expect(page.locator('#h-level')).toHaveText('L3');
    await expect(page.locator('#tr-day')).toHaveText('週五 · 今日課表');
    await expect(page.locator('#tr-plan-title')).toHaveText('十動作＋下肢後鏈');
    await expect(page.locator('#tr-start')).toHaveText('開始今日課表');
    await page.click('#tr-start');
    await abortTraining(page);
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-plus .opt-title')).toHaveText('加一輪 下肢後鏈');
    await page.click('#h-plus');
    await abortTraining(page);
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-minimal .opt-title')).toHaveText('保底版');
    await page.click('#tr-minimal');
    await abortTraining(page);
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-rain .opt-title')).toHaveText('雨天／出差替代');
    await page.click('#h-rain');
    await expect(page.locator('#t-phase')).toHaveText('1 / 21');
    await abortTraining(page);
    expect(await storageSnapshot(page), '中途結束都不記錄').toEqual(before);
    await gotoTab(page, 's-train');
    const rows = page.locator('#week-tbl .wk-row');
    await expect(rows).toHaveCount(7);
    await expect(rows.locator('.wk-dow')).toHaveText(['日', '一', '二', '三', '四', '五', '六']);
    await expect(page.locator('#week-tbl .wk-row[aria-current="date"] .wk-dow')).toHaveText('五');
    await expect(rows.nth(0)).toContainText('Boss Day');
    await expect(page.locator('#tr-band-title')).toHaveText('彈力帶怎麼加負荷');
    await expect(page.locator('#s-train ol.steps li')).toHaveCount(3);
  });

  test('週日：今日課表＝Boss Day（本週測驗項目）、沒有加一輪；Boss 從訓練分頁開始', async ({ page }) => {
    await openApp(page, { now: '2026-10-04T15:00:00+09:00', seed: seedState(readFixture('v2-real.json')) });
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-plan-title')).toHaveText('Boss Day · 十動作暖身＋測驗');
    await expect(page.locator('#tr-start')).toHaveText('開始 Boss Day');
    await expect(page.locator('#tr-boss-item')).toHaveText('Plank 極限');
    await expect(page.locator('#h-plus')).toBeHidden();
    await page.click('#tr-start');
    await expect(page.locator('#train')).toHaveClass(/active/);
    await expect(page.locator('#t-phase')).toHaveText(/^1 \/ \d+$/);
    await page.click('#t-abort');
  });

  test('動作庫：每個動作有「真人」YouTube 連結（新分頁、noopener）；有示範的動作開內建動畫，動畫會動、離線可看', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    await gotoTab(page, 's-train');
    const expectedLinks = await page.evaluate(async () => (await import('/js/ui/content.js')).VIDEOS.filter((v) => v[1]).length);
    const links = await page.locator('#vids a.vid-link').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    expect(links).toHaveLength(expectedLinks);
    expect(links.filter((l) => !l.href.startsWith(YT) || l.target !== '_blank' || !/noopener/.test(l.rel))).toEqual([]);
    const demos = page.locator('#vids button[data-demo]');
    expect(await demos.count()).toBeGreaterThan(30);
    await demos.first().click();
    await expect(page.locator('#demo-modal')).toHaveClass(/active/);
    await expect(page.locator('#dm-name')).not.toHaveText('—');
    expect(await page.locator('#dm-yt').getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    const pose = () => page.locator('#dm-svg').evaluate((svg) => [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('points')).join('|'));
    const p0 = await pose();
    await page.clock.runFor(500);
    expect(await pose()).not.toBe(p0);
    await page.click('#dm-close');
    await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  });
});

test.describe('統計', () => {
  test('熱力圖 56 格＝每天的訓練種類；PR 最近 5 筆、新到舊；身體指標輸入會存檔', async ({ page }) => {
    const raw = readFixture('v2-real.json');
    const st = JSON.parse(raw);
    await openApp(page, { seed: seedState(raw) });
    await gotoTab(page, 's-stats');
    await expect(page.locator('#st-tab-hist')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#s-hist')).toHaveClass(/active/);
    const cells = await page.locator('#hist-heat i').evaluateAll((is) => is.map((i) => [i.title.slice(0, 10), i.className]));
    expect(cells).toHaveLength(56);
    expect(cells[55][0]).toBe('2026-10-02');
    const byDate = Object.fromEntries(st.sessions.map((s) => [s.date, s.type]));
    expect(cells.map(([d, c]) => [d, c])).toEqual(cells.map(([d]) => [d, byDate[d] || '']));
    await expect(page.locator('#hist-heat')).toHaveAttribute('aria-label', `過去 8 週有 ${cells.filter(([, c]) => c).length} 天訓練`);
    const hrp = await page.locator('#pr-hrp .prline').evaluateAll((rs) => rs.map((r) => [...r.children].map((c) => c.textContent)));
    expect(hrp).toEqual(st.prs.hrp.slice(-5).reverse().map((p) => [p.date, `${p.reps} 下`]));
    await gotoTab(page, 's-body');
    await expect(page.locator('#st-tab-body')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#st-tab-hist')).toHaveAttribute('aria-selected', 'false');
    await page.fill('#bd-weight', '68.4');
    await page.click('#bd-save');
    await expect(page.locator('#bd-msg')).toHaveText('已記錄今日（1 項）');
    const s = await storedState(page);
    expect(s.body.weight[s.body.weight.length - 1]).toEqual({ date: '2026-10-02', v: 68.4 });
    await expect(page.locator('#bd-tiles .tile')).toHaveCount(4);
  });
});

test.describe('設定（今日右上齒輪）', () => {
  test('擁有全部控制項；卡片依序＝訓練、睡眠時間、資料備份；版本行是最後一個子元素、不在卡片內', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
    await expect(page.locator('#h-settings')).toHaveAttribute('aria-label', '設定');
    await page.click('#h-settings');
    await expect(page.locator('#s-setup')).toHaveClass(/active/);
    await expect(page.locator('#tabs button[data-s="s-home"]')).toHaveClass(/\bon\b/); // 設定在今日底下
    const ids = ['cfg-voice', 'cfg-beep', 'cfg-band', 'cfg-bedtime', 'cfg-waketime', 'cfg-sleep-note', 'cfg-sleep-msg', 'bk-download', 'bk-status',
      'exp-btn', 'exp-area', 'imp-btn', 'imp-file-btn', 'imp-file', 'imp-error', 'imp-preview', 'imp-rows', 'imp-warnings', 'imp-confirm', 'imp-cancel', 'io-msg', 'app-version'];
    const where = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id) || !document.getElementById(id).closest('#s-setup')), ids);
    expect(where, '不在設定裡的控制項').toEqual([]);
    const outline = await page.evaluate(() => {
      const setup = document.getElementById('s-setup');
      const v = document.getElementById('app-version');
      return {
        cards: [...setup.querySelectorAll(':scope > .card')].map((c) => c.querySelector('h3').textContent.trim()),
        versionLast: setup.lastElementChild === v, versionInCard: !!v.closest('.card')
      };
    });
    expect(outline).toEqual({ cards: ['訓練', '睡眠時間', '資料備份'], versionLast: true, versionInCard: false });
    /* 「‹ 今日」回今日 */
    await page.click('#s-setup [data-back]');
    await expect(page.locator('#s-home')).toHaveClass(/active/);
  });

  test('語音／提示音／彈力帶開關會存檔；彈力帶開關改變訓練分頁的器材與課表', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) }); // v3：settings.band = false
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-plan-meta')).toContainText('沒帶彈力帶：徒手替代');
    await gotoTab(page, 's-setup');
    for (const [id, key] of [['cfg-voice', 'voice'], ['cfg-beep', 'beep'], ['cfg-band', 'band']]) {
      const was = await page.isChecked(`#${id}`);
      await page.click(`#${id}`);
      expect(await page.isChecked(`#${id}`)).toBe(!was);
      expect((await storedState(page)).settings[key], key).toBe(!was);
    }
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-plan-meta')).toContainText('瑜珈墊、彈力帶、一面牆');
  });

  test('就寢／起床時間：改了會存、早安打卡預填新的就寢時間；空白或格式不對不存、欄位改回、提示訊息', async ({ page }) => {
    await openApp(page, { now: '2026-10-05T07:00:00+09:00' });
    await gotoTab(page, 's-setup');
    await expect(page.locator('#cfg-bedtime')).toHaveValue('23:00');
    await expect(page.locator('#cfg-waketime')).toHaveValue('07:00');
    await expect(page.locator('#cfg-sleep-note')).toContainText('不是醫療建議');
    /* 空白：不存 */
    await page.locator('#cfg-bedtime').fill('');
    await page.locator('#cfg-bedtime').dispatchEvent('change');
    await expect(page.locator('#cfg-bedtime')).toHaveValue('23:00');
    await expect(page.locator('#cfg-sleep-msg')).toHaveText('時間格式不對，沒有變更。');
    expect(await storageSnapshot(page), '空白不寫入').toEqual({});
    await page.locator('#cfg-waketime').fill('');
    await page.locator('#cfg-waketime').blur();
    await expect(page.locator('#cfg-waketime')).toHaveValue('07:00');
    expect(await storageSnapshot(page)).toEqual({});
    /* 有效：存檔 */
    await page.locator('#cfg-bedtime').fill('22:30');
    await page.locator('#cfg-bedtime').dispatchEvent('change');
    await expect(page.locator('#cfg-sleep-msg')).toHaveText('已儲存。');
    await page.locator('#cfg-waketime').fill('06:30');
    await page.locator('#cfg-waketime').dispatchEvent('change');
    const s = await storedState(page);
    expect(s.settings).toMatchObject({ bedtime: '22:30', wakeTime: '06:30' });
    await expect(page.locator('#cfg-sleep-note')).toContainText('就寢 22:30、起床 06:30');
    /* 早安打卡預填新的就寢時間 */
    await gotoTab(page, 's-checkin');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 22:30（就寢時間）');
    await page.click('#ci-wake');
    const e = (await storedState(page)).habits.sleep.log[0];
    expect(e).toMatchObject({ lightsOut: '2026-10-04T22:30:00+09:00', target: { bedtime: '22:30', wakeTime: '06:30', windowMin: 30 } });
    /* 之後改設定不影響已存的紀錄（target 跟著紀錄） */
    await gotoTab(page, 's-setup');
    await page.locator('#cfg-bedtime').fill('23:15');
    await page.locator('#cfg-bedtime').dispatchEvent('change');
    expect((await storedState(page)).habits.sleep.log[0].target.bedtime).toBe('22:30');
  });

  test('下載備份與匯入（選檔）都在設定裡可用', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-setup');
    const dl = await clickAndDownload(page, '#bk-download');
    expect(dl.name).toBe('daily-ten-backup-2026-10-02.json');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
    await chooser.setFiles({ name: dl.name, mimeType: 'application/json', buffer: Buffer.from(dl.text) });
    await expect(page.locator('#imp-preview')).toBeVisible();
    await page.click('#imp-cancel');
    await expect(page.locator('#io-msg')).toHaveText('已取消匯入，資料沒有變更。');
  });
});

test('分頁列：只有今日／訓練／統計三顆、≥44px、目前分頁 aria-current；設定與早安打卡亮「今日」', async ({ page }) => {
  await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(readFixture('v3.json')) });
  const tabs = page.locator('#tabs button');
  await expect(tabs).toHaveCount(3);
  await expect(tabs).toHaveText(['今日', '訓練', '統計']);
  for (const b of await tabs.all()) {
    const r = await b.boundingBox();
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  const current = () => page.locator('#tabs button[aria-current="page"]').getAttribute('data-s');
  for (const [id, tab] of [['s-train', 's-train'], ['s-stats', 's-stats'], ['s-body', 's-stats'], ['s-setup', 's-home'], ['s-checkin', 's-home'], ['s-home', 's-home']]) {
    await gotoTab(page, id);
    expect(await current(), id).toBe(tab);
    await expect(page.locator('#tabs button.on')).toHaveCount(1);
  }
  expect(NOW_ISO).toBeTruthy();
});
