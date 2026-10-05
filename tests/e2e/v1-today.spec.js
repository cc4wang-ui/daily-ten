/* qa-checker：V1 今日、統計數字、AFT 卡、遊戲日、規則檔讀不到（D26；data/game.json；js/game/engine.js）。
   假時鐘（Asia/Tokyo）。預期值由 engine 在 Node 算（nodeEngine）或讀 data/game.json，不寫死猜測值。
   1. 全新資料 2026-10-05 07:00：日期、「P1 睡飽 · 第 1 天」、連續天數、身分宣言、三環＋中央 Lv；探＝虛線鎖定環＋「解鎖 0/10」；
      下一步＝早安打卡；開 App 不寫入 localStorage。
   2. 統計 #h-xp＝engine summary.xp.total、#h-best＝summary.streak.best；畫面上看不到第二種 XP（舊尺度 legacy xp）。
   3. AFT 卡用歷來最佳（engine aftGaps 的文字）。
   4. 遊戲日 04:00 換日：凌晨 2 點練完記在前一天；今日顯示前一天的日期與課表；PR 日期也用遊戲日。
   5. 規則檔讀不到（404、不是 JSON）：不白屏、沒有未捕捉錯誤；三環、階段、早安打卡入口隱藏；下一步退回 M1 的今日課表；訓練照常。 */
import {
  test, expect, readFixture, readRepo, openApp, seedState, storedState, storageSnapshot, gotoTab, appSummary, nodeEngine,
  runWorkoutToEnd, tick, tickUntil, confirmImportTwice, NOW_ISO
} from './helpers.js';

const MON_0700 = '2026-10-05T07:00:00+09:00';
const RULES = JSON.parse(readRepo('data/game.json'));
const summaryOf = (state, now) => nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules);', { state, now });

test.describe('今日：全新資料', () => {
  test('日期、P1 睡飽 · 第 1 天、連續天數、身分宣言、三環＋Lv 1；探＝虛線鎖定環＋解鎖 0/10；下一步＝早安打卡；不寫入', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await expect(page.locator('#h-date')).toHaveText('週一 10/5');
    await expect(page.locator('#h-phase')).toHaveText('P1 睡飽 · 第 1 天');
    await expect(page.locator('#h-streak-chip')).toBeVisible();
    await expect(page.locator('#h-streak')).toHaveText('0');
    await expect(page.locator('#h-streak-chip')).toContainText('天');
    await expect(page.locator('#h-identity')).toBeVisible();
    await expect(page.locator('#h-identity-text')).toHaveText('我是獨立、自律、持續成長的人');
    await expect(page.locator('#h-identity-text b')).toHaveText('獨立、自律、持續成長');
    /* 三環：動、眠是實線軌道；探是虛線鎖定環＋鎖頭 */
    const rings = page.locator('#h-rings');
    await expect(rings).toBeVisible();
    await expect(rings.locator('circle.ring-track.move')).toHaveCount(1);
    await expect(rings.locator('circle.ring-track.sleep')).toHaveCount(1);
    await expect(rings.locator('circle.ring-track.explore')).toHaveCount(0);
    const lock = rings.locator('circle.ring-lock');
    await expect(lock).toHaveCount(1);
    expect(await lock.evaluate((c) => getComputedStyle(c).strokeDasharray)).not.toBe('none');
    await expect(rings.locator('.lock-badge')).toHaveCount(1);
    await expect(rings.locator('.rings-center .lv')).toHaveText('Lv1');
    await expect(rings.locator('.rings-center .lv-xp')).toHaveText('0 / 200 XP');
    await expect(page.locator('#h-rings-svg')).toHaveAttribute('aria-label',
      '今日進度：動 0 / 60 XP、眠 0 / 60 XP、探 未解鎖，進度 0 / 10；等級 Lv 1，本級 0 / 200 XP');
    /* 圖例：三顆按鈕；探顯示 engine 的短文案「解鎖 0/10」 */
    const legend = page.locator('#h-legend .lg-item');
    await expect(legend).toHaveCount(3);
    await expect(legend.nth(0)).toContainText('動 訓練');
    await expect(legend.nth(0).locator('.lg-val')).toHaveText('0 / 60');
    await expect(legend.nth(1).locator('.lg-val')).toHaveText('0 / 60');
    await expect(legend.nth(2).locator('.lg-lock')).toHaveText('解鎖 0/10');
    const want = summaryOf({ settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }, phase: { current: 'P1', startedAt: MON_0700 } }, MON_0700);
    expect(want.pillars.explore.unlock.short).toBe('解鎖 0/10');
    expect(want.phase.label).toBe('P1 睡飽 · 第 1 天');
    /* 下一步 */
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await expect(page.locator('#h-start .nx-title')).toHaveText('早安打卡');
    await expect(page.locator('#h-minimal')).toHaveText(/^只有 \d+ 分鐘？做保底版$/);
    /* 早安打卡的探卡：鎖定＋解鎖進度（engine 的 unlock.title／label） */
    await gotoTab(page, 's-checkin');
    await expect(page.locator('#ci-explore .lockbox b')).toHaveText(want.pillars.explore.unlock.title);
    await expect(page.locator('#ci-explore .lockbox .small')).toHaveText(want.pillars.explore.unlock.label);
    await expect(page.locator('#ci-explore [role="progressbar"]')).toHaveAttribute('aria-valuenow', '0');
    expect(await storageSnapshot(page), '第一次開 App、看畫面都不寫入').toEqual({});
  });
});

/* ---------- 統計：累計 XP＝engine；畫面上只有一種 XP ---------- */
const XP_CASES = [
  { file: 'v2-real.json', now: NOW_ISO },
  { file: 'v3.json', now: NOW_ISO },
  { file: 'v3-checkin.json', now: '2026-10-04T07:30:00+09:00' }
];
/* 目前前景畫面（含分頁列）看得到的文字 */
const screenText = (page) => page.evaluate(() => [document.querySelector('.screen.active'), document.getElementById('tabs')]
  .map((el) => el.innerText).join('\n'));

test.describe('統計：#h-xp＝engine 累計 XP、#h-best＝engine 最佳連續；看不到舊尺度的 XP', () => {
  for (const c of XP_CASES) {
    test(c.file, async ({ page }) => {
      const raw = readFixture(c.file);
      const legacy = JSON.parse(raw).xp;
      await openApp(page, { now: c.now, seed: seedState(raw) });
      const { sum } = await appSummary(page);
      const want = summaryOf(JSON.parse(raw), c.now);
      expect(sum.xp.total).toBe(want.xp.total);
      expect(want.xp.total).not.toBe(legacy); // 兩種尺度確實不同，這個檢查才有意義
      await gotoTab(page, 's-stats');
      await expect(page.locator('#h-xp')).toHaveText(String(want.xp.total));
      await expect(page.locator('#h-best')).toHaveText(String(want.streak.best));
      await expect(page.locator('#st-count')).toHaveText(String(JSON.parse(raw).sessions.length));
      /* 每個畫面都看不到舊尺度的 legacy xp */
      const legacyRe = new RegExp(`(^|[^\\d])${legacy}([^\\d]|$)`);
      for (const id of ['s-home', 's-train', 's-stats', 's-hist', 's-body', 's-setup', 's-checkin']) {
        await gotoTab(page, id);
        const text = await screenText(page);
        expect(legacyRe.test(text), `${id} 出現舊尺度 XP ${legacy}`).toBe(false);
      }
      /* 中央等級＝總 XP 的等級 */
      await gotoTab(page, 's-home');
      await expect(page.locator('.rings-center .lv')).toHaveText(`Lv${want.level.lv}`);
      await expect(page.locator('.rings-center .lv-xp')).toHaveText(`${want.level.xpInto} / ${want.level.xpNeed} XP`);
    });
  }

  test('匯入預覽：不顯示舊尺度的 XP（有 XP 列時＝engine 對目前／匯入後資料算的累計 XP）', async ({ page }) => {
    const raw = readFixture('v3.json');
    const incoming = readFixture('v2-real.json');
    await openApp(page, { seed: seedState(raw) });
    const cur = summaryOf(JSON.parse(raw), NOW_ISO).xp.total;
    const inc = summaryOf(JSON.parse(incoming), NOW_ISO).xp.total;
    await gotoTab(page, 's-stats');
    await expect(page.locator('#h-xp')).toHaveText(String(cur));
    await gotoTab(page, 's-setup');
    await page.fill('#exp-area', incoming);
    await page.click('#imp-btn');
    await expect(page.locator('#imp-preview')).toBeVisible();
    const preview = await page.locator('#imp-preview').innerText();
    const row = page.locator('#imp-rows .prline[data-key="xp"]');
    const xpRow = (await row.count()) ? await row.evaluate((el) => [...el.children].map((c) => c.textContent)) : null;
    console.log(`[qa] 匯入預覽 XP 列：${JSON.stringify(xpRow)}；engine 累計 XP 目前 ${cur}、匯入後 ${inc}`);
    for (const legacy of [JSON.parse(raw).xp, JSON.parse(incoming).xp]) {
      expect(new RegExp(`(^|[^\\d])${legacy}([^\\d]|$)`).test(preview), `匯入預覽出現舊尺度 XP ${legacy}`).toBe(false);
    }
    if (xpRow) expect(xpRow.slice(1), '匯入預覽的 XP＝engine 累計 XP（目前、匯入後）').toEqual([String(cur), String(inc)]);
  });
});

/* ---------- AFT 卡：歷來最佳 ---------- */
test('AFT 卡用歷來最佳成績（engine aftGaps 的文字），不是最近一次；統計的門檻線同一組數字', async ({ page }) => {
  const s = JSON.parse(readFixture('v2-real.json'));
  s.prs.hrp = [{ date: '2026-09-06', reps: 18 }, { date: '2026-09-27', reps: 12 }];        // 最佳 18（達標）；最近一次 12
  s.prs.plank = [{ date: '2026-09-13', sec: 80 }, { date: '2026-09-20', sec: 62 }];        // 最佳 80（差 10 秒）
  s.prs.run2mi = [{ date: '2026-08-30', sec: 1260 }, { date: '2026-09-20', sec: 1320 }];   // 最佳 21:00（差 1:03）
  const want = nodeEngine('return eng.aftGaps(args.state, rules);', { state: s });
  expect(want.items.map((i) => i.gapText)).toEqual(['已達自選目標', '差 10 秒', '差 1:03']);
  await openApp(page, { seed: seedState(JSON.stringify(s)) });
  await expect(page.locator('#h-aft-title')).toHaveText(want.title);
  await expect(page.locator('#h-aft-note')).toHaveText(want.subtitle);
  await expect(page.locator('#h-aft')).toContainText('以歷來最佳成績計算。');
  await expect(page.locator('#h-aft')).not.toContainText('最近一次');
  const rows = await page.locator('#h-aft-rows .aft-row').evaluateAll((els) => els.map((r) => ({
    name: r.querySelector('.aft-name').textContent, val: r.querySelector('.aft-val').textContent, gap: r.querySelector('.aft-gap').textContent
  })));
  expect(rows).toEqual(want.items.map((i) => ({ name: i.name, val: `${i.bestText} / ${i.targetText}`, gap: i.gapText })));
  await gotoTab(page, 's-hist');
  await expect(page.locator('#pass-hrp')).toHaveText('自選目標 ≥ 15 下');
  await expect(page.locator('#pass-plank')).toHaveText('自選目標 ≥ 1:30');
  await expect(page.locator('#pass-run')).toHaveText('自選目標 ≤ 19:57');
  /* 沒有紀錄：engine 的「尚無紀錄」 */
  const empty = nodeEngine('return eng.aftGaps({}, rules);');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#h-aft-rows .aft-gap')).toHaveText(empty.items.map((i) => i.gapText));
});

/* ---------- 遊戲日（04:00 換日） ---------- */
test.describe('遊戲日：04:00 換日', () => {
  test.describe.configure({ timeout: 180_000 });
  test('週二 01:58 開始保底版、02:00 後練完 → 記在 2026-10-05（週一）；今日顯示週一的日期與課表；04:00 起換到週二', async ({ page }) => {
    await openApp(page, { now: '2026-10-06T01:58:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#h-date')).toHaveText('週一 10/5');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'workout'); // 打卡時段 04:00 起
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-day')).toHaveText(/^週一 · 今日課表/);
    await expect(page.locator('#week-tbl .wk-row[aria-current="date"] .wk-dow')).toHaveText('一');
    const monTitle = await page.locator('#tr-plan-title').textContent();
    await page.click('#tr-minimal');
    await runWorkoutToEnd(page);
    await expect(page.locator('#done')).toHaveClass(/active/);
    const finishedAt = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
    expect(finishedAt, '練完的時間在 02:00–04:00 之間').toBeGreaterThanOrEqual(120);
    expect(finishedAt).toBeLessThan(240);
    await page.click('#d-ok');
    const s = await storedState(page);
    expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-05', type: 'minimal', xp: 3 });
    expect(s.streak.lastDate).toBe('2026-10-05');
    await gotoTab(page, 's-hist');
    await expect(page.locator('#hist-heat i').last()).toHaveClass('minimal'); // 右下＝今天（遊戲日 10-05）
    /* 04:00：換到週二 */
    await page.clock.pauseAt(new Date('2026-10-06T04:00:00+09:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('週二 10/6');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-day')).toHaveText(/^週二 · 今日課表/);
    expect(await page.locator('#tr-plan-title').textContent()).not.toBe(monTitle);
    await gotoTab(page, 's-hist');
    await expect(page.locator('#hist-heat i').last()).not.toHaveClass('minimal');
    await expect(page.locator('#hist-heat i').nth(54)).toHaveClass('minimal');
  });

  test('週一 01:00（遊戲日＝週日）Boss Day（Plank）：PR 與訓練紀錄的日期＝2026-10-04', async ({ page }) => {
    await openApp(page, { now: '2026-10-05T01:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#h-date')).toHaveText('週日 10/4');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'boss');
    await page.click('#h-start');
    await tickUntil(page, () => document.getElementById('t-phase').textContent === 'BOSS · PLANK', { every: 1, maxSeconds: 2400, label: 'Plank 測驗開始' });
    await tick(page, 70);
    await page.click('#t-abort');
    await expect(page.locator('#s-boss')).toHaveClass(/active/);
    await page.click('#bi-save');
    await expect(page.locator('#done')).toHaveClass(/active/);
    await expect(page.locator('#d-xp')).toHaveText(`+${RULES.move.tiers.plus.xp} XP　·　連續 1 天`);
    const s = await storedState(page);
    expect(s.prs.plank[s.prs.plank.length - 1]).toEqual({ date: '2026-10-04', sec: 70 });
    expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-04', type: 'boss', xp: 20 });
  });
});

/* ---------- 規則檔讀不到 ---------- */
const RULE_FAILURES = [
  { label: '404', fulfill: { status: 404, contentType: 'text/plain', body: 'Not found' }, consoleError: true },
  { label: '不是 JSON', fulfill: { status: 200, contentType: 'application/json', body: '{"version": 1, "day": ' }, consoleError: false },
  { label: '形狀不對（缺 sleep）', fulfill: { status: 200, contentType: 'application/json', body: JSON.stringify({ ...RULES, sleep: undefined }) }, consoleError: false }
];
test.describe('規則檔（data/game.json）讀不到：不白屏，退回 M1', () => {
  for (const c of RULE_FAILURES) {
    test(`${c.label}：三環、階段、早安打卡入口隱藏；下一步＝今日課表；保底版照常記錄；統計用舊欄位`, async ({ page, guard }) => {
      guard.allowConsoleErrors = c.consoleError; // 404 會有一筆「Failed to load resource」；其他情況不准有 console.error
      let hits = 0;
      await page.route('**/data/game.json', (route) => { hits++; return route.fulfill(c.fulfill); });
      await openApp(page, { now: MON_0700, seed: seedState(readFixture('v3-checkin.json')) });
      expect(hits).toBeGreaterThan(0);
      await expect(page.locator('#boot-error')).toHaveCount(0);
      await expect(page.locator('#s-home')).toBeVisible();
      await expect(page.locator('#h-rings')).toBeHidden();
      await expect(page.locator('#h-phase')).toBeHidden();
      expect(await page.locator('[data-go="s-checkin"]').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length)).toBe(0);
      await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'workout');
      await expect(page.locator('#h-start .nx-title')).toHaveText('開始今日課表');
      await expect(page.locator('#h-date')).toHaveText('週一 10/5');
      await expect(page.locator('#h-streak')).toHaveText('14'); // 遊戲層未就緒：舊欄位 streak.current（M1 行為）
      await expect(page.locator('#h-aft-rows .aft-row')).toHaveCount(3);
      await gotoTab(page, 's-stats');
      await expect(page.locator('#h-xp')).toHaveText('411');
      await expect(page.locator('#h-best')).toHaveText('14');
      /* 訓練照常 */
      await gotoTab(page, 's-home');
      await page.click('#h-minimal');
      await runWorkoutToEnd(page);
      await expect(page.locator('#d-xp')).toHaveText('+3 XP　·　連續 1 天'); // 舊表 XP、舊欄位連續天數（10-04 沒練 → 重新算 1）
      await page.click('#d-ok');
      const s = await storedState(page);
      expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-05', type: 'minimal', xp: 3 });
      expect(s.habits.sleep.log, '打卡紀錄原樣保留').toEqual(JSON.parse(readFixture('v3-checkin.json')).habits.sleep.log);
      await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'done');
      for (const id of ['s-train', 's-hist', 's-body', 's-setup', 's-home']) await gotoTab(page, id);
      expect(guard.pageErrors).toEqual([]);
    });
  }
});

/* ---------- 匯入後補階段起點 ---------- */
test('匯入沒有階段起點的備份（v2-real）：匯入成功後 phase.startedAt＝匯入當下；今日顯示「第 1 天」；下次存檔寫入', async ({ page }) => {
  await openApp(page, { now: MON_0700, seed: seedState(readFixture('v3-checkin.json')) });
  await expect(page.locator('#h-phase')).toHaveText('P1 睡飽 · 第 4 天'); // 起點 10-02
  await gotoTab(page, 's-setup');
  await page.fill('#exp-area', readFixture('v2-real.json'));
  await page.click('#imp-btn');
  await confirmImportTwice(page);
  await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
  await gotoTab(page, 's-home');
  await expect(page.locator('#h-phase')).toHaveText('P1 睡飽 · 第 1 天');
  await gotoTab(page, 's-setup');
  await page.click('#cfg-voice');
  await page.click('#cfg-voice');
  expect((await storedState(page)).phase.startedAt).toBe('2026-10-05T07:00:01+09:00'); // 匯入當下＝07:00＋1.5 秒（秒以下捨去）
});

/* ---------- 階段：P1→P2 條件邊界（近 14 天起床在時段內 9 天＝差 1／10 天＝剛好達標） ----------
   探索本版未開放（rules.explore.open = false）：達標後階段仍是 P1，探環鎖定，文案改「條件達成，探索下一版開放」。 */
function withWakeDays(n, today = '2026-10-05') {
  const s = JSON.parse(readFixture('v3.json'));
  const base = new Date(`${today}T12:00:00+09:00`);
  const day = (k) => { const d = new Date(base.getTime() - k * 86400000); return d.toISOString().slice(0, 10); };
  const target = { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 };
  s.habits.sleep.log = [];
  for (let k = n; k >= 1; k--) {
    s.habits.sleep.log.push({ date: day(k), lightsOut: `${day(k + 1)}T23:00:00+09:00`, wake: `${day(k)}T07:00:00+09:00`, lightsOutEdited: false, target });
  }
  s.phase.startedAt = `${day(n)}T07:00:00+09:00`; // 起點＝第一筆打卡（沒有起點時 loadState 會以載入當下補上）
  return s;
}
for (const [n, ready] of [[9, false], [10, true]]) {
  test(`P1→P2 邊界：近 14 天起床在時段內 ${n} 天 → ${ready ? '剛好達標：條件達成、探索下一版開放（仍是 P1）' : '差 1：解鎖 9/10'}`, async ({ page }) => {
    const state = withWakeDays(n);
    const want = summaryOf(state, MON_0700);
    expect(want.pillars.explore.unlock).toMatchObject({ ready, have: n, need: 10 });
    expect(want.phase.current).toBe('P1');
    await openApp(page, { now: MON_0700, seed: seedState(JSON.stringify(state)) });
    await expect(page.locator('#h-phase')).toHaveText(want.phase.label);
    await expect(page.locator('#h-legend .lg-item').nth(2).locator('.lg-lock')).toHaveText(want.pillars.explore.unlock.short);
    expect(want.pillars.explore.unlock.short).toBe(ready ? '下一版開放' : '解鎖 9/10');
    await expect(page.locator('#h-rings circle.ring-lock')).toHaveCount(1); // 探環仍鎖定
    await gotoTab(page, 's-checkin');
    await expect(page.locator('#ci-explore .lockbox b')).toHaveText(want.pillars.explore.unlock.title);
    await expect(page.locator('#ci-explore .lockbox .small')).toHaveText(want.pillars.explore.unlock.label);
    if (ready) await expect(page.locator('#ci-explore')).toContainText('條件達成，探索下一版開放');
    await expect(page.locator('#ci-explore [role="progressbar"]')).toHaveAttribute('aria-valuenow', String(n));
  });
}
