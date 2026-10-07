/* qa-checker：V2a 遊戲核心 e2e（契約 scratchpad/v2a-contract.md；規則 data/game.json _notes.decisions d9–d15；
   fixture tests/fixtures/README.md「V2a 遊戲核心 fixture」）。假時鐘、Asia/Tokyo；預期數字一律由 engine 在 Node 算
   （helpers.js 的 nodeEngine，對 App 存下來的資料或測試自己組的資料），不寫死猜測值；畫面字串照 ui-engineer 回報逐字比對。
   1. Perfect Day：打卡＋保底版 → 完成畫面「含 Perfect Day +30 XP」→ 回今日播一次（字串、數字＝engine）→「領取」才寫入 → 不重播；
      開啟時今天已完成（V2a 之前就完成）→ 不播、開 App 不寫入；V1 資料第一次開啟，之後完成的照常慶祝；身分宣言的句型。
   2. 時機：訓練／完成畫面開著不播；復原 toast 顯示中先等；toast 收起時不在今日 → 回今日才播；復原打卡 → 不播。
   3. 升級卡：在 Perfect Day 之後、每個新等級一次；「繼續」才寫 game.seen.level；第一次開啟不補發（bonus 讓等級變高也一樣）；
      一次跳好幾級只出最新一張。
   4. Freeze：7 天得 1 張 → 漏 1 天自動用、連續天數接上、張數變少；2 天空檔只有 1 張 → 不用、這一段結束；最多 2 張；
      回溯只增不減（對照 UPGRADE_BASE_DIR 的 V1 engine）。
   5. D6：熄燈 01:45／起床 06:41 → 降量卡；下一步、訓練分頁、實際跑的序列都是 L-1；恢復寫入、復原清掉；359／360 分、89／90 分邊界；
      L1 與練完後不顯示；state.level 不變；v3-v2a 已恢復。
   6. D19：中斷 → 回歸任務卡 → 打卡拿徽章 → 3 天內 2 支柱的那天 ×1.5（今日卡、完成畫面 #d-bonus、XP 增加量＝engine）→ 下一次不再加成。
   7. 開 App 不寫入（慶祝在開啟時就出現也一樣，按「領取」才寫、只改 game.seen.perfectDay）。
   8. 資料安全：v3-v2a 存檔 → 下載 → 匯入保留 seen／deload；被改回 v2 不重複、不重播、兩次結果相同；壞欄位修補＋匯入擋下；不白屏。
   9. 離線冷啟動（Service Worker）：V2a 新檔案由 SW 供應，慶祝照常。 */
import {
  test, expect, readFixture, readRepo, openApp, seedState, storedState, rawMain, storageSnapshot, gotoTab, nodeEngine,
  runWorkoutToEnd, tick, triggerSave, waitReady, celeState, liveSeen, confirmImportTwice, clickAndDownload,
  contextOptions, watchContext, assertWatchClean, swAssets, expectGlossaryClean, MAIN_KEY
} from './helpers.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RULES = JSON.parse(readRepo('data/game.json'));
const PD_XP = RULES.perfectDay.xp;
const MIN_XP = RULES.move.tiers.minimal.xp;
const MULT = RULES.returnQuest.multiplier;
const VOTE_PERFECT = '又為「獨立、自律、持續成長」投了一票。';
const VOTE_LEVEL = '每一次出席都算數，繼續為「獨立、自律、持續成長」投票。';
const BAK_V3 = 'daily-ten-state.bak-v3';
const MSG_REPAIRED = '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。';

const fx = (name) => JSON.parse(readFixture(name));
const summaryOf = (state, now) => nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules);', { state, now });
const pageNow = (page) => page.evaluate(() => new Date().toISOString());
/* engine（Node）對 App 目前存下來的資料、在頁面的假時間算的今日摘要 */
const storedSummary = async (page) => summaryOf(await storedState(page), await pageNow(page));
const cele = (page) => page.locator('#cele');

test.use({ trace: 'off' }); // 上千次 fastForward 寫進 trace 會慢好幾倍；失敗時仍有錯誤訊息與截圖
test.describe.configure({ timeout: 240_000 });

/* ---------- 操作 ---------- */
/* 早安打卡（今日圖例的「眠」）；可改熄燈／起床時間。結束時 toast（10 秒內可復原）顯示中 */
async function checkIn(page, { lightsOut = null, wake = null } = {}) {
  await gotoTab(page, 's-checkin');
  if (lightsOut || wake) {
    await page.click('#ci-edit');
    await expect(page.locator('#ci-edit-row')).toBeVisible();
    if (lightsOut) await page.fill('#ci-lights', lightsOut);
    if (wake) await page.fill('#ci-wake-time', wake);
  }
  await page.click('#ci-wake');
  await expect(page.locator('#ci-done')).toBeVisible();
  await expect(page.locator('#toast')).toBeVisible();
}
/* 保底版跑到完成畫面（from：今日的 #h-minimal 或訓練分頁的 #tr-minimal）；訓練中、完成畫面都不能有慶祝 */
async function runMinimal(page, from = '#h-minimal') {
  await gotoTab(page, from === '#h-minimal' ? 's-home' : 's-train');
  await page.click(from);
  await expect(page.locator('#train')).toHaveClass(/active/);
  await expect(cele(page), '訓練中不播慶祝').toBeHidden();
  await runWorkoutToEnd(page);
  await expect(page.locator('#done')).toHaveClass(/active/);
  await expect(cele(page), '完成畫面開著不播慶祝').toBeHidden();
}
/* 完成畫面：增加量＝engine 前後總 XP 的差、連續天數＝engine；#d-bonus 只在這次記錄帶來 Perfect Day／回歸加成時出現 */
async function expectDoneScreen(page, before, after, { bonus }) {
  const gain = Math.max(0, after.xp.total - before.xp.total);
  await expect(page.locator('#d-xp')).toHaveText(`+${gain} XP　·　連續 ${after.streak.days} 天`);
  if (bonus) {
    await expect(page.locator('#d-bonus')).toBeVisible();
    await expect(page.locator('#d-bonus')).toHaveText(bonus);
  } else {
    await expect(page.locator('#d-bonus')).toBeHidden();
  }
  return gain;
}
async function expectPerfectCard(page, sum) {
  await expect(cele(page)).toBeVisible();
  await expect(cele(page)).toHaveAttribute('data-kind', 'perfect');
  expect(await celeState(page)).toEqual({
    open: true, kind: 'perfect', eyebrow: '已解鎖的支柱全完成', title: 'Perfect Day', xp: `+${PD_XP} XP`, xpHidden: false,
    vote: VOTE_PERFECT,
    stats: [[String(sum.streak.days), '連續天數'], [String(sum.perfectDay.weekCount), '本週 Perfect'], [String(sum.xp.today), '今日 XP']],
    ok: '領取'
  });
  await expect(page.locator('#cele-ok')).toBeFocused();
}
async function expectLevelCard(page, sum) {
  await expect(cele(page)).toBeVisible();
  await expect(cele(page)).toHaveAttribute('data-kind', 'level');
  expect(await celeState(page)).toEqual({
    open: true, kind: 'level', eyebrow: '等級提升', title: `升到 Lv ${sum.level.lv}`, xp: '', xpHidden: true,
    vote: VOTE_LEVEL,
    stats: [[String(sum.xp.total), '累計 XP'], [String(sum.streak.days), '連續天數'], [String(sum.level.xpNeed - sum.level.xpInto), '下一級還差 XP']],
    ok: '繼續'
  });
  await expect(page.locator('#cele-ok')).toBeFocused();
}
/* 換分頁回今日（renderHome 會重新判斷慶祝） */
async function revisitHome(page) {
  await gotoTab(page, 's-train');
  await gotoTab(page, 's-home');
}
/* 全新 context 的頁面（同一個 context 不能換 fixture：seedOnce 只寫一次、假時鐘是整個 context 共用）；結束時一樣檢查網路與錯誤 */
async function inFreshContext(browser, testInfo, fn) {
  const ctx = await browser.newContext(contextOptions({ baseURL: testInfo.project.use.baseURL }));
  const w = watchContext(ctx);
  let out;
  try {
    out = await fn(await ctx.newPage());
  } finally {
    await ctx.close();
  }
  assertWatchClean(w, '另開的 context');
  return out;
}
/* v3-v2a.json，把「慶祝看過」退回 10-04：10-05 的 Perfect Day（訓練＋早安打卡）開 App 就該播 */
function celeDueState(patch = {}) {
  const s = fx('v3-v2a.json');
  s.game.seen.perfectDay = '2026-10-04';
  Object.assign(s.game.seen, patch.seen || {});
  if (patch.identity !== undefined) s.goals.identity = patch.identity;
  return s;
}

/* =====================================================================================
   1. Perfect Day
   ===================================================================================== */
test.describe('Perfect Day 慶祝', () => {
  test('打卡＋保底版 → 完成畫面「含 Perfect Day +30 XP」→ 回今日播一次（字串、數字＝engine）→「領取」才寫入 → 換頁、重新整理都不重播', async ({ page }) => {
    const raw = readFixture('v3-v2a.json');
    await openApp(page, { now: '2026-10-06T06:50:00+09:00', seed: seedState(raw) });
    await expect(cele(page)).toBeHidden();
    expect(await rawMain(page), '開 App 不寫入').toBe(raw);
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await checkIn(page);
    await gotoTab(page, 's-home');
    await expect(cele(page), '只有眠：還不是 Perfect Day').toBeHidden();
    const before = await storedSummary(page);
    expect(before.perfectDay).toMatchObject({ done: false, have: ['sleep'], need: ['move', 'sleep'] });
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.perfectDay).toMatchObject({ done: true, xp: PD_XP, date: '2026-10-06', have: ['move', 'sleep'] });
    expect(after.level.lv, '這一題不升級（升級卡另外測）').toBe(before.level.lv);
    const gain = await expectDoneScreen(page, before, after, { bonus: `含 Perfect Day +${PD_XP} XP` });
    expect(gain, '保底 30＋Perfect Day 30（沒有回歸加成）').toBe(MIN_XP + PD_XP);
    expect((await storedState(page)).game.seen, '還沒領取：seen 不變').toEqual({ level: 7, perfectDay: '2026-10-05' });
    await page.click('#d-ok');
    await expectPerfectCard(page, after);
    expect(after.perfectDay.weekCount, '10-05、10-06 都是 Perfect Day（週一起算）').toBe(2);
    expect((await storedState(page)).game.seen, '卡片顯示中：還沒寫入').toEqual({ level: 7, perfectDay: '2026-10-05' });
    await page.click('#cele-ok');
    await expect(cele(page)).toBeHidden();
    expect((await storedState(page)).game.seen, '「領取」→ seen.perfectDay＝今天').toEqual({ level: 7, perfectDay: '2026-10-06' });
    /* 一天最多一次 */
    await revisitHome(page);
    await page.clock.runFor(3_000);
    await expect(cele(page)).toBeHidden();
    await page.reload();
    await waitReady(page);
    await expect(cele(page)).toBeHidden();
    /* 同一天再練一次（升級成主課表）：Perfect Day 早就達成 → 完成畫面沒有 #d-bonus，也不再播 */
    const b2 = await storedSummary(page);
    await gotoTab(page, 's-train');
    await page.click('#tr-start');
    await expect(page.locator('#train')).toHaveClass(/active/);
    await runWorkoutToEnd(page);
    const a2 = await storedSummary(page);
    expect(a2.perfectDay.xp).toBe(PD_XP);
    await expectDoneScreen(page, b2, a2, { bonus: null });
    await page.click('#d-ok');
    await page.clock.runFor(1_000);
    await expect(cele(page)).toBeHidden();
  });

  test('開啟時今天已是 Perfect Day（舊版 App 先記好：v3-checkin-reverted-to-v2 @ 10-04 07:30）→ 不播、開 App 與換頁都不寫入；存檔後 seen.perfectDay＝今天', async ({ page }) => {
    const raw = readFixture('v3-checkin-reverted-to-v2.json');
    const now = '2026-10-04T07:30:00+09:00';
    const want = summaryOf(JSON.parse(raw), now);
    expect(want.perfectDay.done).toBe(true);
    await openApp(page, { now, seed: seedState(raw) });
    await expect(cele(page)).toBeHidden();
    for (const id of ['s-train', 's-stats', 's-home', 's-checkin', 's-home']) await gotoTab(page, id);
    await page.clock.runFor(15_000);
    await expect(cele(page)).toBeHidden();
    expect(await storageSnapshot(page), '開 App、看畫面都不寫入').toEqual({ [MAIN_KEY]: raw });
    expect(await liveSeen(page), '記憶體已初始化：開啟前完成的今天不補播').toEqual({ level: want.level.lv, perfectDay: '2026-10-04' });
    await triggerSave(page);
    expect((await storedState(page)).game.seen).toEqual({ level: want.level.lv, perfectDay: '2026-10-04' });
    await page.reload();
    await waitReady(page);
    await expect(cele(page)).toBeHidden();
  });

  test('V1 資料第一次開 V2a（v3-checkin @ 10-04 07:30：已打卡、還沒練）→ 不補播；練完後今天的 Perfect Day 照常播一次、沒有升級卡', async ({ page }) => {
    const raw = readFixture('v3-checkin.json');
    const now = '2026-10-04T07:30:00+09:00';
    await openApp(page, { now, seed: seedState(raw) });
    await expect(cele(page)).toBeHidden();
    const want = summaryOf(JSON.parse(raw), now);
    expect(await liveSeen(page)).toEqual({ level: want.level.lv, perfectDay: '2026-10-03' });
    expect(await rawMain(page)).toBe(raw);
    const before = await storedSummary(page);
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.level.lv).toBe(before.level.lv);
    await expectDoneScreen(page, before, after, { bonus: `含 Perfect Day +${PD_XP} XP` });
    await page.click('#d-ok');
    await expectPerfectCard(page, after);
    await page.click('#cele-ok');
    await expect(cele(page)).toBeHidden();
    await page.clock.runFor(1_000);
    await expect(cele(page), '只有一張（沒有升級卡）').toBeHidden();
    expect((await storedState(page)).game.seen).toEqual({ level: want.level.lv, perfectDay: '2026-10-04' });
  });

  for (const [identity, perfect, level] of [
    ['我想變得更健康。', '又為「我想變得更健康」投了一票。', '每一次出席都算數，繼續為「我想變得更健康」投票。'],
    ['', '又為自己投了一票。', '每一次出席都算數，繼續加油。']
  ]) {
    test(`身分宣言「${identity || '（空白）'}」→ 慶祝卡：${perfect}／升級卡：${level}`, async ({ page }) => {
      await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(JSON.stringify(celeDueState({ identity, seen: { level: 6 } }))) });
      await expect(cele(page)).toHaveAttribute('data-kind', 'perfect');
      await expect(page.locator('#cele-vote')).toHaveText(perfect);
      await page.click('#cele-ok');
      await expect(cele(page)).toHaveAttribute('data-kind', 'level');
      await expect(page.locator('#cele-vote')).toHaveText(level);
      expectGlossaryClean([perfect, level]);
    });
  }
});

/* =====================================================================================
   2. 時機
   ===================================================================================== */
test.describe('慶祝的時機', () => {
  const REVERTED = 'v3-v2a-reverted-to-v2.json'; // 舊版 App 在 10-06 記了保底版、沒有打卡 → 早上打卡就完成 Perfect Day
  const AT = '2026-10-06T06:50:00+09:00';

  test('打卡讓今天變成 Perfect Day：復原 toast 顯示中先等（10 秒），收起後才在今日出現', async ({ page }) => {
    await openApp(page, { now: AT, seed: seedState(readFixture(REVERTED)) });
    await expect(cele(page)).toBeHidden();
    await checkIn(page);
    const sum = await storedSummary(page);
    expect(sum.perfectDay.done).toBe(true);
    await gotoTab(page, 's-home');
    await expect(page.locator('#toast')).toBeVisible();
    await expect(cele(page), '復原時段內不蓋住 toast').toBeHidden();
    await page.clock.runFor(5_000);
    await expect(page.locator('#toast')).toBeVisible();
    await expect(cele(page)).toBeHidden();
    await page.clock.runFor(5_100);
    await expect(page.locator('#toast')).toBeHidden();
    await expectPerfectCard(page, sum);
    await page.click('#cele-ok');
    expect((await storedState(page)).game.seen.perfectDay).toBe('2026-10-06');
  });

  test('toast 收起時人在訓練分頁 → 不出現（不記成看過）；回今日才出現', async ({ page }) => {
    await openApp(page, { now: AT, seed: seedState(readFixture(REVERTED)) });
    await checkIn(page);
    await gotoTab(page, 's-home');
    await expect(cele(page)).toBeHidden();
    await gotoTab(page, 's-train');
    await page.clock.runFor(10_100);
    await expect(page.locator('#toast')).toBeHidden();
    await expect(cele(page), '不在今日：先不出現').toBeHidden();
    expect((await storedState(page)).game.seen.perfectDay).toBe('2026-10-05');
    await gotoTab(page, 's-home');
    await expectPerfectCard(page, await storedSummary(page));
  });

  test('按 toast 的「復原」取消打卡 → 不再是 Perfect Day：不播、seen 不變、打卡紀錄回到 4 筆', async ({ page }) => {
    await openApp(page, { now: AT, seed: seedState(readFixture(REVERTED)) });
    await checkIn(page);
    await gotoTab(page, 's-home');
    await page.click('#toast-action');
    await expect(page.locator('#toast-text')).toHaveText('已復原');
    await page.clock.runFor(3_000);
    await expect(page.locator('#toast')).toBeHidden();
    await page.clock.runFor(1_000);
    await expect(cele(page)).toBeHidden();
    const s = await storedState(page);
    expect(s.habits.sleep.log).toHaveLength(4);
    expect(s.game.seen).toEqual({ level: 7, perfectDay: '2026-10-05' });
    expect((await storedSummary(page)).perfectDay.done).toBe(false);
  });

  test('打卡後回今日（等 toast 收起）、馬上從今日開保底版：toast 在訓練中收起 → 訓練中、完成畫面都不播；回今日才播', async ({ page }) => {
    await openApp(page, { now: AT, seed: seedState(readFixture(REVERTED)) });
    await checkIn(page);
    await gotoTab(page, 's-home'); // 今日在前景、toast 顯示中：慶祝先等 toast 收起
    await expect(cele(page)).toBeHidden();
    await page.click('#h-minimal');
    await expect(page.locator('#train')).toHaveClass(/active/);
    await tick(page, 12); // 訓練中 toast 收起（10 秒）→ 收起後的通知在訓練中觸發
    await expect(page.locator('#toast')).toBeHidden();
    await expect(cele(page), '訓練中不播').toBeHidden();
    expect(await page.evaluate(() => document.getElementById('cele').hidden), '#cele 沒有在訓練畫面底下偷偷打開').toBe(true);
    await runWorkoutToEnd(page);
    await expect(page.locator('#done')).toHaveClass(/active/);
    expect(await page.evaluate(() => document.getElementById('cele').hidden), '完成畫面開著也沒有打開').toBe(true);
    await page.click('#d-ok');
    await expectPerfectCard(page, await storedSummary(page));
  });

  test('打卡後馬上去訓練（toast 在訓練中收起）→ 訓練、完成畫面都不播；這次訓練沒帶來 Perfect Day → 沒有 #d-bonus；回今日才播', async ({ page }) => {
    await openApp(page, { now: AT, seed: seedState(readFixture(REVERTED)) });
    await checkIn(page);
    const before = await storedSummary(page);
    expect(before.perfectDay.done, '打卡就完成了（保底版是舊版 App 記的）').toBe(true);
    await runMinimal(page, '#tr-minimal');
    const after = await storedSummary(page);
    await expectDoneScreen(page, before, after, { bonus: null });
    await page.click('#d-ok');
    await expectPerfectCard(page, after);
    await page.click('#cele-ok');
    await expect(cele(page)).toBeHidden();
  });
});

/* =====================================================================================
   3. 升級卡
   ===================================================================================== */
/* v3-v2a.json＋今天（10-06）06:50 的早安打卡；把最早的 k 筆主課表標成加一輪（每筆 +10），讓總 XP 停在下一級前
   「保底 30＋Perfect Day 30」以內（至少差 10）：晚上練完保底版就升級。全部由 engine 在 Node 算 */
function nearLevelState(now) {
  return nodeEngine(`
    const ci = sleep.buildCheckIn(args.base, new Date('2026-10-06T06:50:00+09:00'), rules, {});
    if (!ci.ok) throw new Error('早安打卡建立失敗：' + JSON.stringify(ci));
    args.base.habits.sleep.log.push(ci.entry);
    for (let k = 0; k <= 80; k++) {
      const s = JSON.parse(JSON.stringify(args.base));
      let n = 0;
      for (const x of s.sessions) { if (n >= k) break; if (x.type === 'full' && !x.plus) { x.plus = true; n++; } }
      if (n < k) return null;
      const sum = eng.todaySummary(s, new Date(args.now), rules);
      const left = sum.level.xpNeed - sum.level.xpInto;
      if (left >= 10 && left <= args.gain - 10) return { state: s, k, left, lv: sum.level.lv };
    }
    return null;`, { base: fx('v3-v2a.json'), now, gain: MIN_XP + PD_XP });
}

test.describe('升級卡', () => {
  test('差一點升級的晚上練完保底版 → 先 Perfect Day、再「升到 Lv N」；「繼續」才寫 seen.level；每個等級只一次', async ({ page }) => {
    const now = '2026-10-06T20:00:00+09:00';
    const pick = nearLevelState(now);
    expect(pick, '找得到差一點升級的資料').not.toBeNull();
    const raw = JSON.stringify(pick.state);
    await openApp(page, { now, seed: seedState(raw) });
    await expect(cele(page)).toBeHidden();
    const before = await storedSummary(page);
    expect(before.level.lv).toBe(pick.lv);
    expect(before.perfectDay.done).toBe(false);
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.level.lv, '練完升一級').toBe(before.level.lv + 1);
    await expectDoneScreen(page, before, after, { bonus: `含 Perfect Day +${PD_XP} XP` });
    await page.click('#d-ok');
    await expectPerfectCard(page, after);
    await page.click('#cele-ok');
    expect((await storedState(page)).game.seen).toEqual({ level: before.level.lv, perfectDay: '2026-10-06' });
    await expectLevelCard(page, after);
    expect((await storedState(page)).game.seen.level, '升級卡顯示中：還沒寫入').toBe(before.level.lv);
    await page.click('#cele-ok');
    await expect(cele(page)).toBeHidden();
    expect((await storedState(page)).game.seen).toEqual({ level: after.level.lv, perfectDay: '2026-10-06' });
    await revisitHome(page);
    await expect(cele(page)).toBeHidden();
    await page.reload();
    await waitReady(page);
    await expect(cele(page)).toBeHidden();
    await expect(page.locator('.rings-center .lv')).toHaveText(`Lv${after.level.lv}`);
  });

  test('第一次開 V2a：bonus（回溯的 Perfect Day）讓等級比 V1 規則高一級，也不補發升級卡；開 App 不寫入；存檔後 seen.level＝目前等級', async ({ page }) => {
    const now = '2026-10-04T07:30:00+09:00';
    /* v3-checkin.json（沒有 game.seen）前面補幾筆 7 月的主課表，讓「不含 bonus 的等級」（V1 的算法）比 V2a 等級低一級 */
    const pick = nodeEngine(`
      for (let n = 0; n <= 40; n++) {
        const s = JSON.parse(JSON.stringify(args.base));
        for (let i = 0; i < n; i++) s.sessions.unshift({ date: '2026-07-' + String(n - i).padStart(2, '0'), type: 'full', xp: 10 });
        const sum = eng.todaySummary(s, new Date(args.now), rules);
        const v1 = eng.levelFromXp(sum.xp.total - sum.xp.bonus, rules).lv;
        if (v1 < sum.level.lv) return { state: s, v1, lv: sum.level.lv, n };
      }
      return null;`, { base: fx('v3-checkin.json'), now });
    expect(pick, '找得到 bonus 讓等級變高的資料').not.toBeNull();
    expect(pick.state.game.seen).toBeUndefined();
    const raw = JSON.stringify(pick.state);
    await openApp(page, { now, seed: seedState(raw) });
    await expect(page.locator('.rings-center .lv')).toHaveText(`Lv${pick.lv}`);
    await page.clock.runFor(2_000);
    await expect(cele(page)).toBeHidden();
    expect(await rawMain(page)).toBe(raw);
    expect(await liveSeen(page)).toEqual({ level: pick.lv, perfectDay: '2026-10-03' });
    await triggerSave(page);
    expect((await storedState(page)).game.seen).toEqual({ level: pick.lv, perfectDay: '2026-10-03' });
    console.log(`[qa] 第一次開啟不補發：V1 算法 Lv${pick.v1} → V2a Lv${pick.lv}（補 ${pick.n} 筆 7 月主課表）`);
  });

  test('一次跳好幾級（seen.level 5、目前 Lv 7）→ 只出一張「升到 Lv 7」；Perfect Day 也該播時先播 Perfect Day', async ({ page }) => {
    const s = fx('v3-v2a.json');
    s.game.seen.level = 5;
    s.game.seen.perfectDay = '2026-10-04';
    await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(JSON.stringify(s)) });
    const sum = await storedSummary(page);
    expect(sum.level.lv).toBe(7);
    await expectPerfectCard(page, sum);
    await page.click('#cele-ok');
    await expectLevelCard(page, sum);
    await page.click('#cele-ok');
    await expect(cele(page)).toBeHidden();
    await page.clock.runFor(1_000);
    await expect(cele(page), '沒有 Lv 6 的卡').toBeHidden();
    expect((await storedState(page)).game.seen).toEqual({ level: 7, perfectDay: '2026-10-05' });
  });
});

/* =====================================================================================
   4. Freeze
   ===================================================================================== */
/* v3.json 當外殼：sessions 換成 from～to 每天一筆主課表（skip 除外）、睡眠紀錄清空 */
function sessionDays(from, to) {
  const s = fx('v3.json');
  s.sessions = [];
  for (let t = new Date(`${from}T12:00:00+09:00`).getTime(); ; t += 86_400_000) {
    const key = new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
    if (key > to) break;
    s.sessions.push({ date: key, type: 'full', xp: 10 });
  }
  s.habits.sleep.log = [];
  return s;
}

test.describe('Freeze', () => {
  test('連續 7 天得 1 張 → 漏 1 天：隔天自動用掉、連續天數接上（1 → 0 張，顯示剛用過）→ 當天練完連續 8 天', async ({ page }) => {
    const s = sessionDays('2026-09-20', '2026-09-26');
    const d27 = summaryOf(s, '2026-09-27T20:00:00+09:00');
    expect(d27.freeze).toMatchObject({ tokens: 1, earnedTotal: 1, usedDates: [], recent: [] });
    expect(d27.streak.days).toBe(7);
    await openApp(page, { now: '2026-09-27T20:00:00+09:00', seed: seedState(JSON.stringify(s)) });
    const chip = page.locator('#h-freeze');
    await expect(chip).toBeVisible();
    await expect(page.locator('#h-freeze-n')).toHaveText('1');
    await expect(chip).toHaveAttribute('aria-label', d27.freeze.label);
    expect(d27.freeze.label).toBe('Freeze 1 張');
    await expect(chip).not.toHaveClass(/used/);
    await expect(page.locator('#h-streak')).toHaveText('7');
    /* 隔天：9/27 沒練 → 自動用 1 張，連續天數接上（補上的日子不加天數） */
    await page.clock.pauseAt(new Date('2026-09-28T20:00:00+09:00'));
    await revisitHome(page);
    const d28 = summaryOf(s, '2026-09-28T20:00:00+09:00');
    expect(d28.freeze).toMatchObject({ tokens: 0, usedDates: ['2026-09-27'], recent: ['2026-09-27'], usedTotal: 1 });
    expect(d28.streak).toMatchObject({ days: 7, frozenDays: 1 });
    await expect(page.locator('#h-freeze-n')).toHaveText('0');
    await expect(chip).toHaveClass(/used/);
    await expect(chip).toHaveAttribute('aria-label', `Freeze 0 張，${d28.freeze.note}`);
    expect(d28.freeze.note).toBe('自動用了 1 張 Freeze，連續天數接上了');
    await expect(page.locator('#h-streak')).toHaveText('7');
    /* 點一下展開說明（張數規則來自 data/game.json）；再點收起 */
    const note = page.locator('#h-freeze-note');
    await expect(note).toBeHidden();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await expect(note).toBeVisible();
    await expect(note).toContainText(d28.freeze.note);
    await expect(note).toContainText(`每滿 ${RULES.freeze.earnEvery} 天得 1 張，最多 ${RULES.freeze.max} 張`);
    expectGlossaryClean([await note.textContent(), d28.freeze.label, d28.freeze.note]);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await expect(note).toBeHidden();
    /* 當天練完：連續 8 天 */
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.streak.days).toBe(8);
    await expect(page.locator('#d-xp')).toHaveText(new RegExp(`　·　連續 ${after.streak.days} 天$`));
    await page.click('#d-ok');
    await expect(page.locator('#h-streak')).toHaveText('8');
  });

  test('7 天後連漏 2 天、只有 1 張 → 不用（張數保留）、這一段結束；當天練完從 1 開始，最佳紀錄保留 7', async ({ page }) => {
    const s = sessionDays('2026-09-20', '2026-09-26');
    const now = '2026-09-29T20:00:00+09:00';
    const want = summaryOf(s, now);
    expect(want.freeze).toMatchObject({ tokens: 1, usedDates: [], recent: [] });
    expect(want.streak).toMatchObject({ days: 0, best: 7 });
    await openApp(page, { now, seed: seedState(JSON.stringify(s)) });
    await expect(page.locator('#h-freeze-n')).toHaveText('1');
    await expect(page.locator('#h-freeze')).not.toHaveClass(/used/);
    await expect(page.locator('#h-streak')).toHaveText('0');
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.streak.days).toBe(1);
    expect(after.freeze.tokens, '張數沒有白白用掉').toBe(1);
    await expect(page.locator('#d-xp')).toHaveText(/　·　連續 1 天$/);
    await page.click('#d-ok');
    await expect(page.locator('#h-freeze-n')).toHaveText('1');
    await gotoTab(page, 's-stats');
    await expect(page.locator('#h-best')).toHaveText('7');
  });

  test('最多 2 張：連續 28 天也只有 2 張（第 21、28 天不再加）', async ({ page }) => {
    const s = sessionDays('2026-09-03', '2026-09-30');
    const now = '2026-09-30T20:00:00+09:00';
    const want = summaryOf(s, now);
    expect(want.streak.days).toBe(28);
    expect(want.freeze).toMatchObject({ tokens: RULES.freeze.max, earnedTotal: RULES.freeze.max });
    await openApp(page, { now, seed: seedState(JSON.stringify(s)) });
    await expect(page.locator('#h-freeze-n')).toHaveText(String(RULES.freeze.max));
    await expect(page.locator('#h-freeze')).toHaveAttribute('aria-label', `Freeze ${RULES.freeze.max} 張`);
    await expect(page.locator('#h-streak')).toHaveText('28');
  });

  test('從沒得過 Freeze（0 張）→ 不顯示 chip', async ({ page }) => {
    const s = sessionDays('2026-09-28', '2026-10-01');
    await openApp(page, { now: '2026-10-01T20:00:00+09:00', seed: seedState(JSON.stringify(s)) });
    await expect(page.locator('#h-streak')).toHaveText('4');
    await expect(page.locator('#h-freeze')).toBeHidden();
  });

  test('回溯只增不減：同一份資料 V1 → V2a，連續天數、最佳、累計 XP、等級都不變小（畫面＝V2a engine）', async ({ browser }, testInfo) => {
    const v1Dir = process.env.UPGRADE_BASE_DIR || '';
    const hasV1 = !!v1Dir && existsSync(join(v1Dir, 'js/game/engine.js'));
    const CASES = [
      ['v3.json', '2026-10-02T15:30:00+09:00'], ['v2-real.json', '2026-09-29T07:00:00+09:00'],
      ['v3-checkin.json', '2026-10-05T07:00:00+09:00'], ['v3-v2a.json', '2026-10-05T20:00:00+09:00'],
      ['v3-v2a-reverted-to-v2.json', '2026-10-06T20:00:00+09:00']
    ];
    for (const [file, now] of CASES) {
      const st = fx(file);
      const v2a = summaryOf(st, now);
      let v1;
      if (hasV1) {
        /* V1（目前線上版）的 engine 與規則檔，同一個子行程時區 */
        const script = `
          const eng = await import(${JSON.stringify(new URL('js/game/engine.js', `file://${v1Dir}/`).href)});
          const fs = await import('node:fs');
          const rules = JSON.parse(fs.readFileSync(${JSON.stringify(join(v1Dir, 'data/game.json'))}, 'utf8'));
          const a = JSON.parse(process.argv[1]);
          const s = eng.todaySummary(a.state, new Date(a.now), rules);
          process.stdout.write(JSON.stringify({ days: s.streak.days, best: s.streak.best, xp: s.xp.total, lv: s.level.lv }));`;
        v1 = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify({ state: st, now })],
          { env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' }));
      } else {
        v1 = { days: 0, best: st.streak.best, xp: 0, lv: 1 }; // 沒有 V1 基準：只拿 legacy 最佳當下限
      }
      const line = `${file} @ ${now.slice(0, 16)}：連續 ${v1.days}→${v2a.streak.days}、最佳 ${v1.best}→${v2a.streak.best}、XP ${v1.xp}→${v2a.xp.total}、Lv ${v1.lv}→${v2a.level.lv}`;
      console.log(`[qa] Freeze／bonus 回溯 ${hasV1 ? '' : '（沒有 V1 基準）'}${line}`);
      testInfo.annotations.push({ type: 'qa', description: line });
      expect(v2a.streak.days, `${file} 連續天數`).toBeGreaterThanOrEqual(v1.days);
      expect(v2a.streak.best, `${file} 最佳`).toBeGreaterThanOrEqual(v1.best);
      expect(v2a.xp.total, `${file} 累計 XP`).toBeGreaterThanOrEqual(v1.xp);
      expect(v2a.level.lv, `${file} 等級`).toBeGreaterThanOrEqual(v1.lv);
      await inFreshContext(browser, testInfo, async (page) => {
        await openApp(page, { now, seed: seedState(readFixture(file)) });
        await expect(page.locator('#h-streak')).toHaveText(String(v2a.streak.days));
        await expect(page.locator('.rings-center .lv')).toHaveText(`Lv${v2a.level.lv}`);
        await expect(cele(page), `${file}：第一次開啟不補播`).toBeHidden();
        await gotoTab(page, 's-stats');
        await expect(page.locator('#h-xp')).toHaveText(String(v2a.xp.total));
        await expect(page.locator('#h-best')).toHaveText(String(v2a.streak.best));
      });
    }
  });
});

/* =====================================================================================
   5. D6 降量
   ===================================================================================== */
/* 頁面內：今天（遊戲日）各強度的課表資訊（js/ui/program.js 的純計算；只用來對照強度，不是遊戲規則） */
const planInfo = (page) => page.evaluate(async () => {
  const P = await import(new URL('js/ui/program.js', document.baseURI).href);
  const at = (lv) => {
    const plan = P.todayPlan(lv);
    return {
      min: plan.min,
      steps: plan.type === 'boss' ? null : P.addTransitions(P.planSeq(plan, lv)).length,
      minimalMin: P.estMin(P.minimalSeq(lv)),
      catcow: P.minimalSeq(lv)[0].sub
    };
  };
  return { 1: at(1), 2: at(2), 3: at(3) };
});
const deloadCard = (page) => page.evaluate(() => {
  const t = (id) => document.getElementById(id);
  const card = t('h-deload');
  return {
    visible: !card.hidden && card.getClientRects().length > 0,
    state: card.dataset.state || null,
    title: t('h-deload-title').textContent,
    sub: t('h-deload-sub').hidden ? null : t('h-deload-sub').textContent,
    button: t('h-deload-restore').hidden ? null : t('h-deload-restore').textContent
  };
});
/* 訓練畫面的總步數（#t-phase「1 / N」）；看完就結束（不記錄） */
async function runStepsThenAbort(page, selector) {
  await page.click(selector);
  await expect(page.locator('#train')).toHaveClass(/active/);
  const n = Number((await page.locator('#t-phase').textContent()).split('/')[1]);
  await page.click('#t-abort');
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  return n;
}

test.describe('D6 降量', () => {
  test('熄燈 01:45、06:41 起床 → 降量卡；下一步、訓練分頁、實際跑的序列都用 L2；恢復寫入、復原清掉；state.level 一直是 3', async ({ page }) => {
    const raw = readFixture('v3-checkin.json');
    const now = '2026-10-05T06:41:00+09:00';
    await openApp(page, { now, seed: seedState(raw) });
    await expect(page.locator('#h-deload')).toBeHidden(); // 還沒打卡：不降
    await checkIn(page, { lightsOut: '01:45' });
    await expect(page.locator('#toast-text')).toHaveText(/^已記錄起床 06:41 · \+\d+$/);
    const sum = await storedSummary(page);
    expect(sum.deload).toMatchObject({ active: true, reason: 'short', reasons: ['short', 'late'], fromLevel: 3, toLevel: 2, planLevel: 2, restored: false });
    expect(sum.deload.sleepMin).toBe(296);
    expect(sum.deload.label).toBe('昨晚睡 4 小時 56 分，今天先改成 L2，輕一點也算數。');
    await gotoTab(page, 's-home');
    expect(await deloadCard(page)).toEqual({
      visible: true, state: 'active', title: '昨晚睡 4 小時 56 分', sub: '今天先改成 L2，輕一點也算數。', button: sum.deload.restoreLabel
    });
    expect(sum.deload.restoreLabel).toBe('恢復 L3');
    const P = await planInfo(page);
    expect(P[2].steps, 'L2 與 L3 的序列長度不同（這一題才驗得出強度）').not.toBe(P[3].steps);
    expect(P[2].catcow).not.toBe(P[3].catcow);
    /* 今日：下一步與保底版用 L2 */
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'workout');
    await expect(page.locator('#h-start .nx-meta')).toHaveText(`強度 L2 · ${P[2].min} 分`);
    await expect(page.locator('#h-minimal')).toHaveText(`只有 ${P[2].minimalMin} 分鐘？做保底版`);
    expect(await runStepsThenAbort(page, '#h-start'), '今日「下一步」實際跑的序列＝L2').toBe(P[2].steps);
    /* 訓練分頁：強度仍顯示 L3（state.level），今天的課表用 L2 */
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-level')).toHaveText('L3');
    await expect(page.locator('#tr-plan-meta')).toHaveText(new RegExp(`^今天先改成 L2 · 約 ${P[2].min} 分 · `));
    await expect(page.locator('#tr-start')).toHaveAttribute('data-level', '2');
    await expect(page.locator('#week-tbl .wk-row[aria-current="date"] .wk-min')).toHaveText(`${P[2].min} 分`);
    expect(await runStepsThenAbort(page, '#tr-start'), '訓練分頁「開始今日課表」＝L2').toBe(P[2].steps);
    await page.click('#tr-minimal');
    await expect(page.locator('#train')).toHaveClass(/active/);
    await tick(page, 11);
    await expect(page.locator('#t-name')).toHaveText('貓牛式');
    await expect(page.locator('#t-sub'), '保底版也是 L2 的劑量').toHaveText(P[2].catcow);
    await page.click('#t-abort');
    expect((await storedState(page)).level, 'state.level 不改').toBe(3);

    /* 恢復 L3：寫入 game.deload.restoredOn＝今天；卡片改成「已恢復」、沒有按鈕；課表回到 L3；toast 可復原 */
    await gotoTab(page, 's-home');
    await page.click('#h-deload-restore');
    await expect(page.locator('#toast-text')).toHaveText('已恢復 L3');
    await expect(page.locator('#toast-action')).toHaveText('復原');
    expect(await deloadCard(page)).toEqual({ visible: true, state: 'restored', title: '已恢復 L3', sub: '照原本的強度練', button: null });
    expect((await storedState(page)).game.deload).toEqual({ restoredOn: '2026-10-05' });
    await expect(page.locator('#h-start .nx-meta')).toHaveText(`強度 L3 · ${P[3].min} 分`);
    await expect(page.locator('#h-minimal')).toHaveText(`只有 ${P[3].minimalMin} 分鐘？做保底版`);
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-start')).toHaveAttribute('data-level', '3');
    await expect(page.locator('#tr-plan-meta')).not.toContainText('今天先改成');
    expect(await runStepsThenAbort(page, '#tr-start')).toBe(P[3].steps);
    /* 復原（toast 還在 10 秒內）→ 清掉 restoredOn，回到降量 */
    await gotoTab(page, 's-home');
    await expect(page.locator('#toast')).toBeVisible();
    await page.click('#toast-action');
    await expect(page.locator('#toast-text')).toHaveText('已復原');
    expect((await storedState(page)).game.deload).toEqual({ restoredOn: null });
    expect(await deloadCard(page)).toMatchObject({ state: 'active', button: '恢復 L3' });
    await expect(page.locator('#h-start .nx-meta')).toHaveText(`強度 L2 · ${P[2].min} 分`);
    /* 再恢復一次、等 toast 收起 → 重新整理後仍是已恢復 */
    await page.click('#h-deload-restore');
    await page.clock.runFor(10_100);
    await expect(page.locator('#toast')).toBeHidden();
    await page.reload();
    await waitReady(page);
    expect(await deloadCard(page)).toMatchObject({ visible: true, state: 'restored', title: '已恢復 L3', button: null });
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-start')).toHaveAttribute('data-level', '3');
    expect((await storedState(page)).level).toBe(3);
    expectGlossaryClean([sum.deload.label, sum.deload.restoreLabel, '已恢復 L3', '照原本的強度練', '已復原']);
  });

  /* 邊界（engine 算的分鐘數）：時數 359 降、360 不降；熄燈晚於時段 89 不降、90 降。v3.json：就寢 23:00 ±30、起床 07:00 */
  const BOUNDARY = [
    { label: '睡 359 分（起床改 04:59）→ 降', opts: { wake: '04:59' }, sleepMin: 359, lateMin: null, active: true, reason: 'short' },
    { label: '睡 360 分（起床改 05:00）→ 不降', opts: { wake: '05:00' }, sleepMin: 360, lateMin: null, active: false, reason: null },
    { label: '熄燈晚 89 分（00:59）→ 不降', opts: { lightsOut: '00:59' }, sleepMin: 361, lateMin: 89, active: false, reason: null },
    { label: '熄燈晚 90 分（01:00）→ 降', opts: { lightsOut: '01:00' }, sleepMin: 360, lateMin: 90, active: true, reason: 'late' }
  ];
  for (const c of BOUNDARY) {
    test(`邊界：${c.label}`, async ({ page }) => {
      const raw = readFixture('v3.json');
      const now = '2026-10-05T07:00:00+09:00';
      const want = nodeEngine(`
        const b = sleep.buildCheckIn(args.state, new Date(args.now), rules, args.opts);
        if (!b.ok) throw new Error(JSON.stringify(b));
        args.state.habits.sleep.log.push(b.entry);
        return eng.todaySummary(args.state, new Date(args.now), rules).deload;`, { state: JSON.parse(raw), now, opts: c.opts });
      expect(want).toMatchObject({ sleepMin: c.sleepMin, lateMin: c.lateMin, active: c.active, reason: c.reason });
      await openApp(page, { now, seed: seedState(raw) });
      await checkIn(page, { lightsOut: c.opts.lightsOut || null, wake: c.opts.wake || null });
      const got = (await storedSummary(page)).deload;
      expect(got).toMatchObject({ sleepMin: c.sleepMin, lateMin: c.lateMin, active: c.active, reason: c.reason });
      await gotoTab(page, 's-home');
      const card = await deloadCard(page);
      if (c.active) {
        const [title, sub] = [want.label.slice(0, want.label.indexOf('，')), want.label.slice(want.label.indexOf('，') + 1)];
        expect(card).toEqual({ visible: true, state: 'active', title, sub, button: '恢復 L3' });
        await expect(page.locator('#h-start .nx-meta')).toHaveText(/^強度 L2 · /);
      } else {
        expect(card.visible).toBe(false);
        await expect(page.locator('#h-start .nx-meta')).toHaveText(/^強度 L3 · /);
      }
    });
  }

  test('L1 不再降：睡 4 小時也不顯示降量卡，課表維持 L1', async ({ page }) => {
    const s = fx('v3.json');
    s.level = 1;
    await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(JSON.stringify(s)) });
    await checkIn(page, { lightsOut: '03:00' });
    const got = (await storedSummary(page)).deload;
    expect(got).toMatchObject({ triggered: true, active: false, fromLevel: 1, toLevel: 1, planLevel: 1, label: null });
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-deload')).toBeHidden();
    await expect(page.locator('#h-start .nx-meta')).toHaveText(/^強度 L1 · /);
    expect((await storedState(page)).level).toBe(1);
  });

  test('練完後不顯示（降量只管今天的預設）；隔天沒打卡前也不降；state.level 不變', async ({ page }) => {
    const raw = readFixture('v3-checkin.json');
    await openApp(page, { now: '2026-10-05T06:41:00+09:00', seed: seedState(raw) });
    await checkIn(page, { lightsOut: '01:45' });
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-deload')).toBeVisible();
    await runMinimal(page);
    await page.click('#d-ok');
    await expect(cele(page), '打卡＋練完＝Perfect Day').toHaveAttribute('data-kind', 'perfect');
    await page.click('#cele-ok');
    await expect(page.locator('#h-deload')).toBeHidden();
    const s = await storedState(page);
    expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-05', type: 'minimal', xp: 3 });
    expect(s.level).toBe(3);
    expect((await storedSummary(page)).deload).toMatchObject({ triggered: true, active: false, label: null });
    await page.clock.pauseAt(new Date('2026-10-06T07:00:00+09:00'));
    await revisitHome(page);
    await expect(page.locator('#h-deload')).toBeHidden();
    await gotoTab(page, 's-train');
    await expect(page.locator('#tr-start')).toHaveAttribute('data-level', '3');
    await expect(page.locator('#tr-plan-meta')).not.toContainText('今天先改成');
  });

  test('v3-v2a @ 10-05 20:00：已恢復、也已練完 → 沒有降量卡、課表 L3；拿掉當天的訓練 → 「已恢復 L3」沒有按鈕；隔天 restoredOn 不再算數', async ({ page, browser }, testInfo) => {
    await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(readFixture('v3-v2a.json')) });
    await expect(page.locator('#h-deload')).toBeHidden();
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'done');
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-level')).toHaveText('L3');
    await expect(page.locator('#tr-start')).toHaveAttribute('data-level', '3');
    await expect(cele(page)).toBeHidden();

    const s = fx('v3-v2a.json');
    s.sessions = s.sessions.filter((x) => x.date !== '2026-10-05');
    const want = summaryOf(s, '2026-10-05T20:00:00+09:00').deload;
    expect(want).toMatchObject({ triggered: true, restored: true, active: false, label: '已恢復 L3，照原本的強度練' });
    await inFreshContext(browser, testInfo, async (p2) => {
      await openApp(p2, { now: '2026-10-05T20:00:00+09:00', seed: seedState(JSON.stringify(s)) });
      expect(await deloadCard(p2)).toEqual({ visible: true, state: 'restored', title: '已恢復 L3', sub: '照原本的強度練', button: null });
      await gotoTab(p2, 's-train');
      await expect(p2.locator('#tr-start')).toHaveAttribute('data-level', '3');
      /* 隔天早上：短睡打卡 → restoredOn 是昨天，不算恢復 → 降量 */
      await p2.clock.pauseAt(new Date('2026-10-06T06:50:00+09:00'));
      await checkIn(p2, { lightsOut: '02:00' });
      const d = (await storedSummary(p2)).deload;
      expect(d).toMatchObject({ active: true, restored: false, planLevel: 2 });
      await gotoTab(p2, 's-home');
      expect(await deloadCard(p2)).toMatchObject({ visible: true, state: 'active', button: '恢復 L3' });
    });
  });
});

/* =====================================================================================
   6. D19 回歸任務
   ===================================================================================== */
test.describe('D19 回歸任務', () => {
  test('中斷 → 回歸任務卡 → 打卡拿徽章 → 隔天 2 支柱：×1.5（今日卡、完成畫面、增加量＝engine）→ 再隔天 2 支柱不再加成', async ({ page }) => {
    const raw = readFixture('v3.json'); // 最後訓練 10-01、沒有打卡紀錄
    const banner = page.locator('#h-banner');
    await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(raw) });
    let q = summaryOf(JSON.parse(raw), '2026-10-05T07:00:00+09:00').returnQuest;
    expect(q.stage).toBe('return');
    await expect(banner).toHaveClass('banner quest');
    await expect(banner).toHaveAttribute('data-stage', 'return');
    await expect(banner).toHaveText(q.label);
    await expect(banner).not.toContainText(/天前|中斷/);

    /* 第 1 天（10-05）：只打卡 → 回歸徽章；加成說明（3 天內完成 2 個支柱那天 ×1.5） */
    await checkIn(page);
    await gotoTab(page, 's-home');
    q = (await storedSummary(page)).returnQuest;
    expect(q).toMatchObject({ stage: 'badge', badgeDate: '2026-10-05', boostUntil: '2026-10-07', daysLeft: 3, boostDate: null });
    await expect(banner).toHaveClass('banner quest');
    await expect(banner).toHaveAttribute('data-stage', 'badge');
    await expect(banner).toHaveText(q.label);
    await expect(banner.locator('b')).toHaveText(`×${MULT}`);

    /* 第 2 天（10-06）：還有 2 天 → 打卡（1 個支柱，還沒加成）→ 保底版（2 個支柱）→ 這一天 ×1.5 */
    await page.clock.pauseAt(new Date('2026-10-06T07:00:00+09:00'));
    await revisitHome(page);
    q = (await storedSummary(page)).returnQuest;
    expect(q).toMatchObject({ stage: 'badge', daysLeft: 2 });
    await expect(banner).toHaveText(q.label);
    await checkIn(page);
    const before = await storedSummary(page);
    expect(before.returnQuest.stage).toBe('badge');
    await runMinimal(page);
    const after = await storedSummary(page);
    expect(after.returnQuest).toMatchObject({ stage: 'boost', boostDate: '2026-10-06', multiplier: MULT, boosts: before.returnQuest.boosts + 1 });
    const base = after.pillars.move.xp + after.pillars.sleep.xp;
    expect(after.returnQuest.boostXp, '×1.5 只乘當天的基礎 XP（Perfect Day 不乘）').toBe(Math.round(base * (MULT - 1)));
    const gain = await expectDoneScreen(page, before, after, {
      bonus: `含 Perfect Day +${PD_XP} XP、回歸加成 ×${MULT} +${after.returnQuest.boostXp} XP`
    });
    expect(gain).toBe(MIN_XP + PD_XP + after.returnQuest.boostXp);
    await page.click('#d-ok');
    await expectPerfectCard(page, after);
    await page.click('#cele-ok');
    if (after.level.lv > before.level.lv) {
      await expectLevelCard(page, after);
      await page.click('#cele-ok');
    }
    await expect(cele(page)).toBeHidden();
    await expect(banner).toHaveClass('banner quest boost');
    await expect(banner).toHaveAttribute('data-stage', 'boost');
    await expect(banner).toHaveText(after.returnQuest.label);
    expect(after.returnQuest.label).toBe(`回歸加成：今天 XP ×${MULT}，多 ${after.returnQuest.boostXp} XP`);

    /* 第 3 天（10-07）：沒有中斷 → 沒有回歸卡；又完成 2 個支柱也不再加成（每次中斷只給一次） */
    await page.clock.pauseAt(new Date('2026-10-07T07:00:00+09:00'));
    await revisitHome(page);
    await expect(banner).toBeHidden();
    await checkIn(page);
    const b3 = await storedSummary(page);
    await runMinimal(page);
    const a3 = await storedSummary(page);
    expect(a3.returnQuest).toMatchObject({ stage: 'none', boosts: after.returnQuest.boosts, boostXp: 0 });
    expect(a3.xp.bonus - b3.xp.bonus, '只有 Perfect Day 的 +30').toBe(PD_XP);
    await expectDoneScreen(page, b3, a3, { bonus: `含 Perfect Day +${PD_XP} XP` });
    await page.click('#d-ok');
    await expectPerfectCard(page, a3);
    await page.click('#cele-ok');
    if (a3.level.lv > b3.level.lv) await page.click('#cele-ok');
    await expect(banner).toBeHidden();
    expectGlossaryClean([q.label, after.returnQuest.label, RULES.copy.returnQuest.return, RULES.copy.returnQuest.badge, RULES.copy.returnQuest.open,
      RULES.copy.returnQuest.last, await page.locator('#d-bonus').textContent()]);
  });
});

/* =====================================================================================
   7. 開 App 不寫入
   ===================================================================================== */
test.describe('開 App 不寫入', () => {
  for (const [label, rawOf, now] of [
    ['v3-v2a（已初始化）', () => readFixture('v3-v2a.json'), '2026-10-06T06:50:00+09:00'],
    ['v3-checkin（V1 資料，seen 只在記憶體補上）', () => readFixture('v3-checkin.json'), '2026-10-04T07:30:00+09:00'],
    ['開啟時就該播 Perfect Day（v3-v2a，seen 退回 10-04）', () => JSON.stringify(celeDueState()), '2026-10-05T20:00:00+09:00']
  ]) {
    test(label, async ({ page }) => {
      const raw = rawOf();
      await openApp(page, { now, seed: seedState(raw) });
      await page.clock.runFor(12_000);
      for (const id of ['s-home', 's-train', 's-stats', 's-home']) {
        if (await cele(page).isVisible()) break; // 慶祝卡蓋住分頁列：不換頁
        await gotoTab(page, id);
      }
      expect(await storageSnapshot(page), '開 App、看畫面都不寫入').toEqual({ [MAIN_KEY]: raw });
      if (await cele(page).isVisible()) {
        await page.click('#cele-ok');
        const want = JSON.parse(raw);
        want.game.seen.perfectDay = '2026-10-05';
        expect(await storedState(page), '「領取」只改 game.seen.perfectDay').toEqual(want);
      }
    });
  }
});

/* =====================================================================================
   8. 資料安全
   ===================================================================================== */
test.describe('資料安全', () => {
  test('v3-v2a：下載備份 → 匯入同一個檔，game.seen／game.deload 原樣；匯出 JSON 也有；匯入後不重播、沒有降量卡', async ({ page }) => {
    const raw = readFixture('v3-v2a.json');
    await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(raw) });
    await expect(cele(page)).toBeHidden();
    await expect(page.locator('#h-deload')).toBeHidden();
    await gotoTab(page, 's-setup');
    const dl = await clickAndDownload(page, '#bk-download');
    const file = JSON.parse(dl.text);
    expect(file.game.seen).toEqual({ level: 7, perfectDay: '2026-10-05' });
    expect(file.game.deload).toEqual({ restoredOn: '2026-10-05' });
    await page.click('#exp-btn');
    const exported = JSON.parse(await page.inputValue('#exp-area'));
    expect(exported.game.seen).toEqual(file.game.seen);
    expect(exported.game.deload).toEqual(file.game.deload);
    await page.fill('#exp-area', '');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
    await chooser.setFiles({ name: dl.name, mimeType: 'application/json', buffer: Buffer.from(dl.text) });
    await expect(page.locator('#imp-preview')).toBeVisible();
    await confirmImportTwice(page);
    await expect(page.locator('#io-msg')).toHaveText('匯入成功。');
    const s = await storedState(page);
    expect(s, '匯入後主 key＝備份檔（seen、deload 不重設、不補發）').toEqual(file);
    await gotoTab(page, 's-home');
    await page.clock.runFor(1_000);
    await expect(cele(page)).toBeHidden();
    await expect(page.locator('#h-deload')).toBeHidden();
  });

  test('v3-v2a-reverted-to-v2（D12）：不重複、seen／deload 原樣、不重播；存兩次逐字相同；全新 context 再跑一次結果相同', async ({ page, browser }, testInfo) => {
    const raw = readFixture('v3-v2a-reverted-to-v2.json');
    const now = '2026-10-06T20:00:00+09:00';
    const once = async (p) => {
      await openApp(p, { now, seed: seedState(raw) });
      await p.clock.runFor(2_000);
      await expect(p.locator('#cele')).toBeHidden();
      await expect(p.locator('#h-deload')).toBeHidden();
      expect(await rawMain(p)).toBe(raw);
      const want = summaryOf(JSON.parse(raw), now);
      await expect(p.locator('#h-streak')).toHaveText(String(want.streak.days));
      await triggerSave(p);
      const saved = await rawMain(p);
      const s = JSON.parse(saved);
      expect(s.version).toBe(3);
      expect(s.xp).toBe(424);
      expect(s.game.xp).toEqual({ move: 424, sleep: 0, explore: 0, total: 424 });
      expect(s.streak).toEqual({ current: 2, best: 14, lastDate: '2026-10-06' });
      const dates = s.habits.sleep.log.map((e) => e.date);
      expect(dates).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
      expect(new Set(s.sessions.map((x) => x.date)).size, '訓練紀錄日期不重複').toBe(s.sessions.length);
      expect(s.game.seen, '不重設、不補發').toEqual({ level: 7, perfectDay: '2026-10-05' });
      expect(s.game.deload).toEqual({ restoredOn: '2026-10-05' });
      await p.reload();
      await waitReady(p);
      await expect(p.locator('#cele')).toBeHidden();
      await triggerSave(p);
      expect(await rawMain(p), '再存一次逐字相同').toBe(saved);
      return saved;
    };
    const first = await once(page);
    const ctx = await browser.newContext(contextOptions({ baseURL: testInfo.project.use.baseURL }));
    const w = watchContext(ctx);
    try {
      expect(await once(await ctx.newPage())).toBe(first);
    } finally {
      await ctx.close();
    }
    assertWatchClean(w, '第二次執行');
  });

  test('真的用舊版 App（ec87e03，PARITY_BASE_DIR）來回一次：V2a 存檔 → 舊版記一次保底版（改回 version 2）→ V2a 載入：seen／deload 原樣、不重複、不重播', async ({ page, browser }, testInfo) => {
    test.skip(!process.env.PARITY_BASE_DIR, '沒有 PARITY_BASE_DIR（舊版 App 目錄），略過');
    const basePort = Number(process.env.BASE_PORT || Number(process.env.PORT || 4173) + 1);
    /* 1. V2a：載入 v3-v2a 並存檔（寫入開機時補上的欄位） */
    await openApp(page, { now: '2026-10-06T06:30:00+09:00', seed: seedState(readFixture('v3-v2a.json')) });
    await triggerSave(page);
    const s1 = await rawMain(page);
    /* 2. 舊版 App（另一個 origin）：同一份資料，記一次保底版 */
    const s2 = await inFreshContext(browser, testInfo, async (old) => {
      await openApp(old, { now: '2026-10-06T08:00:00+09:00', seed: seedState(s1), url: `http://127.0.0.1:${basePort}/index.html`, ready: 'm1' });
      await old.click('#h-minimal');
      await expect(old.locator('#train')).toHaveClass(/active/);
      await runWorkoutToEnd(old);
      await expect(old.locator('#done')).toHaveClass(/active/);
      await old.click('#d-ok');
      return rawMain(old);
    });
    const o = JSON.parse(s2);
    console.log(`[qa] 舊版 App 存回：version ${o.version}、game.seen ${JSON.stringify(o.game && o.game.seen)}、game.deload ${JSON.stringify(o.game && o.game.deload)}、最後一筆 ${JSON.stringify(o.sessions[o.sessions.length - 1])}`);
    expect(o.sessions[o.sessions.length - 1]).toEqual({ date: '2026-10-06', type: 'minimal', xp: 3 });
    /* 3. V2a 再載入 */
    await inFreshContext(browser, testInfo, async (p3) => {
      await openApp(p3, { now: '2026-10-06T20:00:00+09:00', seed: seedState(s2) });
      await p3.clock.runFor(2_000);
      await expect(p3.locator('#cele'), '10-05 的 Perfect Day 不重播；今天沒打卡不是 Perfect Day').toBeHidden();
      await expect(p3.locator('#err-card')).toBeHidden();
      await triggerSave(p3);
      const s3 = await storedState(p3);
      expect(s3.version).toBe(3);
      expect(s3.game.seen).toEqual({ level: 7, perfectDay: '2026-10-05' });
      expect(s3.game.deload).toEqual({ restoredOn: '2026-10-05' });
      expect(s3.habits.sleep.log.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
      expect(new Set(s3.sessions.map((x) => x.date)).size).toBe(s3.sessions.length);
      const want = summaryOf(s3, '2026-10-06T20:00:00+09:00');
      await expect(p3.locator('#h-streak')).toHaveText(String(want.streak.days));
    });
  });

  test('v3-v2a-bad-fields：載入修補（錯誤卡、原字串存 bak-v3、"7"→7、日期壞→開啟時補上、deload→{restoredOn:null}）、不重播；匯入擋下 3 筆、資料不變；不白屏', async ({ page }) => {
    const raw = readFixture('v3-v2a-bad-fields.json');
    const now = '2026-10-05T20:00:00+09:00';
    await openApp(page, { now, seed: seedState(raw) });
    await expect(page.locator('#s-home')).toBeVisible();
    await expect(page.locator('#err-card')).toBeVisible();
    await expect(page.locator('#err-text')).toHaveText(MSG_REPAIRED);
    expect(await page.evaluate((k) => localStorage.getItem(k), BAK_V3)).toBe(raw);
    expect(await rawMain(page), '主 key 在存檔前不覆寫').toBe(raw);
    await expect(cele(page), '10-05 的 Perfect Day 開啟前就完成 → 不補播').toBeHidden();
    expect(await liveSeen(page)).toEqual({ level: 7, perfectDay: '2026-10-05' });
    await triggerSave(page);
    const s = await storedState(page);
    expect(s.game.seen).toEqual({ level: 7, perfectDay: '2026-10-05' });
    expect(s.game.deload).toEqual({ restoredOn: null });
    const good = fx('v3-v2a.json');
    expect({ ...s, game: { ...s.game, deload: null } }, '其他資料與 v3-v2a.json 相同').toEqual({ ...good, game: { ...good.game, deload: null } });
    /* 匯入（嚴格驗證）擋下，所有 key 不變 */
    const before = await storageSnapshot(page);
    await page.fill('#exp-area', raw);
    await page.click('#imp-btn');
    await expect(page.locator('#imp-error')).toHaveClass('banner danger');
    const lines = (await page.locator('#imp-error > div').allTextContents()).slice(1).map((l) => l.replace(/^・/, ''));
    expect(lines).toEqual([
      '升級卡與慶祝紀錄（game.seen.level）應為整數',
      '升級卡與慶祝紀錄（game.seen.perfectDay）應為 YYYY-MM-DD 格式的日期',
      '降量恢復紀錄（game.deload）應為物件'
    ]);
    await expect(page.locator('#imp-preview')).toBeHidden();
    expect(await storageSnapshot(page)).toEqual(before);
    expectGlossaryClean(lines);
    for (const id of ['s-home', 's-train', 's-stats', 's-home']) await gotoTab(page, id);
  });
});

/* =====================================================================================
   9. 離線冷啟動
   ===================================================================================== */
const V2A_FILES = ['/js/ui/celebrate.js', '/js/state/game.js', '/js/game/timeline.js', '/js/habits/deload.js'];

test.describe('離線冷啟動（Service Worker）', () => {
  test.use({ serviceWorkers: 'allow' });

  test('V2a 新檔案在預快取、由 SW 供應；離線打卡 → Perfect Day 慶祝照常、「領取」寫入；沒有任何請求打到網路', async ({ page, context }) => {
    const { cache, assets } = swAssets();
    for (const f of V2A_FILES) expect(assets, `sw.js ASSETS 含 ${f}`).toContain(`.${f}`);
    await openApp(page, { now: '2026-10-06T06:50:00+09:00', seed: seedState(readFixture('v3-v2a-reverted-to-v2.json')) });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const expected = assets.map((a) => new URL(a, page.url()).pathname).sort();
    await expect.poll(async () => (await page.evaluate(async (name) => {
      if (!(await caches.has(name))) return [];
      return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    }, cache)).sort(), { timeout: 15_000 }).toEqual(expected);

    await context.setOffline(true);
    const networkHits = [];
    await context.route('**/*', (route) => { networkHits.push(route.request().url()); return route.abort('internetdisconnected'); });
    await page.close();
    const p2 = await context.newPage();
    const fromSw = [];
    const failed = [];
    p2.on('response', (r) => { if (r.fromServiceWorker()) fromSw.push(new URL(r.url()).pathname); });
    p2.on('requestfailed', (r) => failed.push(r.url()));
    await p2.goto('/index.html');
    await waitReady(p2);
    expect(await p2.evaluate(() => navigator.onLine)).toBe(false);
    expect(fromSw, 'V2a 新 module 由 SW 供應').toEqual(expect.arrayContaining([...V2A_FILES, '/data/game.json']));
    await expect(p2.locator('#h-rings')).toBeVisible();
    await expect(p2.locator('#cele')).toBeHidden();
    await checkIn(p2);
    await gotoTab(p2, 's-home');
    await p2.clock.runFor(10_100);
    await expect(p2.locator('#toast')).toBeHidden();
    await expectPerfectCard(p2, await storedSummary(p2));
    await p2.click('#cele-ok');
    await expect(p2.locator('#cele')).toBeHidden();
    expect((await storedState(p2)).game.seen).toEqual({ level: 7, perfectDay: '2026-10-06' });
    expect(networkHits, '離線期間不應有請求打到網路').toEqual([]);
    expect(failed, '離線期間不應有失敗的請求').toEqual([]);
  });
});
