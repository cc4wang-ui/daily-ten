/* qa-checker：完整訓練流程 e2e（PLAN.md §5 #4；CLAUDE.md §9 DoD 1「首頁、訓練流程」）。
   假時鐘暫停在指定時間，用 1 秒一步推進計時器，跑到完成畫面；檢查 session、XP、連續天數（畫面＋storage＋game 同步）。
   規則來源：js/ui/session.js 的 recordSession（同日重練只升級 type、補 XP 差額，不重複累積連續天數）、
   js/ui/content.js 的舊 XP 表 {full:10, cycle:15, boss:20, rest:5, rain:5, minimal:3}（legacy xp，D12 雙寫）。
   V1：
   - 完成畫面 #d-xp＝「+{增加量} XP　·　連續 {N} 天」：增加量＝記錄前後 engine summary.xp.total 的差（不會是負數），
     N＝engine summary.streak.days；增加量另外對照 data/game.json 的分級（保底 30／主課表 50／加一輪與 Boss 60）。
     沒有「STREAK」、沒有「數據不說謊」；Boss 的身分句＝「測驗完成，成績已記錄。」
   - 加一輪記成當天的一般 type＋plus:true（不是 type 'plus'），engine 當天動＝60；legacy xp 仍是數字。
   - 早上（04:00–12:00）還沒早安打卡時今日的「下一步」是打卡：早上的訓練從訓練分頁的「今日課表」開始（#tr-start）。
   V2a：
   - 連續天數含 Freeze（data/game.json d10：每滿 7 天得 1 張、最多 2 張，漏掉的日子整段補得起才自動用）。完成畫面的「連續 N 天」
     預期值由 engine 在 Node 對「fixture＋這次應記下的訓練」算（engineAfter），不寫死；另外斷言意圖：當天第一次練、昨天有接上 → 比
     練之前多 1；同一天再練 → 不變；中斷太久（空檔補不起）→ 從 1 開始。legacy streak（D12 雙寫）不受 Freeze 影響，數值照舊。
   - 中斷後的今日是 D19 回歸任務卡（banner quest），取代 V1 的「上次訓練是 N 天前」。 */
import {
  test, expect, readFixture, readRepo, openApp, seedState, storedState, rawMain, expectHome, gotoTab, appSummary,
  tick, tickUntil, runWorkoutToEnd, nodeEngine, NOW_ISO
} from './helpers.js';

const IDENTITY = ['你是每天訓練的人。', '紀律就是自由。', '出席，就是勝利的八成。', '弱是選項，你沒選它。', '今天的你，比昨天強一點。'];
const BOSS_IDENTITY = '測驗完成，成績已記錄。';
const RULES = JSON.parse(readRepo('data/game.json'));
const TIER_XP = (tier) => RULES.move.tiers[tier].xp;
const TYPE_XP = (type) => TIER_XP(RULES.move.tierByType[type] || RULES.move.unknownTypeTier);
const doneText = (gain, days) => `+${gain} XP　·　連續 ${days} 天`;

const phaseTotal = async (page) => Number((await page.locator('#t-phase').textContent()).split('/')[1]);
const engine = async (page) => (await appSummary(page)).sum;
/* V2a：engine（Node）對「fixture 原文＋這次應記下的訓練（同日取代）」在 now 的今日摘要——不經過 App 的資料 */
function engineAfter(raw, records, now) {
  const s = JSON.parse(raw);
  for (const r of records) {
    const i = s.sessions.findIndex((x) => x.date === r.date);
    if (i >= 0) s.sessions[i] = r; else s.sessions.push(r);
  }
  return nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules);', { state: s, now });
}

/* 完成畫面：文字＝規則推得的增加量＋engine 連續天數；增加量也等於記錄前後 engine 累計 XP 的差 */
async function expectDone(page, before, { gain, days, identity = 'normal' }) {
  await expect(page.locator('#done')).toHaveClass(/active/);
  const after = await engine(page);
  expect(gain, '規則推得的增加量＝engine 累計 XP 的差（不會是負數）').toBe(Math.max(0, after.xp.total - before.xp.total));
  expect(after.streak.days, '完成畫面的連續天數＝engine').toBe(days);
  await expect(page.locator('#d-xp')).toHaveText(doneText(gain, days));
  if (identity === 'boss') await expect(page.locator('#d-identity')).toHaveText(BOSS_IDENTITY);
  else expect(IDENTITY).toContain(await page.locator('#d-identity').textContent());
  const all = await page.locator('#done').innerText();
  expect(all).not.toMatch(/STREAK|數據不說謊/);
  return after;
}

/* 跑完一段一般訓練，回到 HOME 前檢查完成畫面 */
async function finishWorkout(page, before, { gain, days }) {
  await runWorkoutToEnd(page);
  const after = await expectDone(page, before, { gain, days });
  await page.click('#d-ok');
  await expect(page.locator('#done')).not.toHaveClass(/active/);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  return after;
}

function expectSynced(s, { xp, streak, lastSession, sessions }) {
  expect(s.version).toBe(3);
  expect(s.xp).toBe(xp);
  expect(s.streak).toEqual(streak);
  expect(s.game.xp).toEqual({ move: xp, sleep: 0, explore: 0, total: xp });
  expect(s.game.streaks.train).toEqual(streak);
  if (sessions !== undefined) expect(s.sessions).toHaveLength(sessions);
  if (lastSession) expect(s.sessions[s.sessions.length - 1]).toEqual(lastSession);
}

const dialogs = (page) => {
  const seen = [];
  page.on('dialog', (d) => { seen.push(d.message()); d.accept(); });
  return seen;
};

/* 訓練分頁的「今日課表」開始（早上、今日的下一步是早安打卡時用） */
async function startFromTrainTab(page, text) {
  await gotoTab(page, 's-train');
  if (text) await expect(page.locator('#tr-start')).toHaveText(text);
  await page.click('#tr-start');
  await expect(page.locator('#train')).toHaveClass(/active/);
}
const optTitle = (page, id) => page.locator(`#${id} .opt-title`);
const optMinutes = async (page, id) => Number((await page.locator(`#${id} .opt-meta`).textContent()).match(/^(\d+) 分鐘$/)[1]);

test.use({ trace: 'off' }); // 上千次 fastForward 逐一寫進 trace 會慢 4–5 倍；失敗時仍有錯誤訊息與截圖

test.describe('訓練流程（假時鐘）', () => {
  test.describe.configure({ timeout: 180_000 });
  test('週五：保底版完成 → 同日再跑今日課表升級為 full（補差額、連續天數不重複）→ 再跑保底版不降級（+0）', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
    /* 15:30：早安打卡時段已過 → 下一步＝今日課表 */
    const next = page.locator('#h-start');
    await expect(next).toHaveAttribute('data-kind', 'workout');
    await expect(next.locator('.nx-title')).toHaveText('開始今日課表');
    await expect(next.locator('.nx-meta')).toHaveText(/^強度 L3 · \d+ 分$/);
    await expect(page.locator('#h-minimal')).toHaveText(/^只有 \d+ 分鐘？做保底版$/);
    await expect(page.locator('#tr-plan-title')).toHaveText('十動作＋下肢後鏈');

    /* 保底版：開始、暫停、繼續 */
    let before = await engine(page);
    await page.click('#h-minimal');
    await expect(page.locator('#train')).toHaveClass(/active/);
    await expect(page.locator('#t-phase')).toHaveText(/^1 \/ \d+$/);
    await expect(page.locator('#t-name')).toHaveText('預備');
    await expect(page.locator('#t-count')).toHaveText('10');
    await tick(page, 3);
    await expect(page.locator('#t-count')).toHaveText('7');
    await page.click('#t-pause');
    await expect(page.locator('#t-pause')).toHaveText('繼續');
    await tick(page, 5);
    await expect(page.locator('#t-count')).toHaveText('7');
    await page.click('#t-pause');
    await expect(page.locator('#t-pause')).toHaveText('暫停');
    await tick(page, 2);
    await expect(page.locator('#t-count')).toHaveText('5');

    /* V2a Freeze：v3.json 在 09-19 有一天空檔，已有的 Freeze 補上 → engine 的連續天數比 legacy（12）長；預期值由 engine 算 */
    const days1 = engineAfter(readFixture('v3.json'), [{ date: '2026-10-02', type: 'minimal', xp: 3 }], NOW_ISO).streak.days;
    expect(days1, '當天第一次練、昨天（10-01）有練 → 比練之前多 1').toBe(before.streak.days + 1);
    expect(days1, 'Freeze 只會讓連續天數變長，不會比 legacy 短').toBeGreaterThanOrEqual(13);
    let after = await finishWorkout(page, before, { gain: TIER_XP('minimal'), days: days1 });
    expect(after.pillars.move).toMatchObject({ xp: TIER_XP('minimal'), tier: 'minimal', done: true });
    const streak13 = { current: 13, best: 13, lastDate: '2026-10-02' };
    let s = await storedState(page);
    expectSynced(s, { xp: 399, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'minimal', xp: 3 } });
    expect(s.game.streaks.life).toEqual(streak13);
    await expectHome(page, { level: 3, xp: 399, current: 13, best: 13 });
    await expect(next).toHaveAttribute('data-kind', 'done');
    await expect(next.locator('.nx-title')).toHaveText('今日課表完成了'); // 早安打卡沒打：只說課表完成，不誇大
    await expect(page.locator('#h-banner')).toBeHidden();

    /* 同日再跑今日課表：session 升級為 full，legacy XP 補差額 7、engine 動 30 → 50（+20），連續天數不變 */
    before = after;
    await page.click('#h-start');
    after = await finishWorkout(page, before, { gain: TIER_XP('main') - TIER_XP('minimal'), days: days1 }); // 同一天再練：不變
    expect(after.pillars.move).toMatchObject({ xp: TIER_XP('main'), tier: 'main' });
    s = await storedState(page);
    expectSynced(s, { xp: 406, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'full', xp: 10 } });
    await expectHome(page, { level: 3, xp: 406, current: 13, best: 13 });

    /* 再跑保底版：較低一級，不降級、不加 XP（完成畫面 +0，不是負數） */
    before = after;
    await page.click('#h-minimal');
    after = await finishWorkout(page, before, { gain: 0, days: days1 });
    expect(after.xp.total).toBe(before.xp.total);
    s = await storedState(page);
    expectSynced(s, { xp: 406, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'full', xp: 10 } });
  });

  test('週五：今日課表中途「結束」不記錄；加一輪比今日課表多步驟，完成記為 full＋plus:true（engine 動 60、legacy +10）', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const before = await rawMain(page);
    await page.click('#h-start');
    const totalStart = await phaseTotal(page);
    await tick(page, 15);
    await page.click('#t-abort');
    await expect(page.locator('#train')).not.toHaveClass(/active/);
    await expect(page.locator('#s-home')).toHaveClass(/active/);
    expect(await rawMain(page)).toBe(before); // 沒有任何寫入
    await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });

    await gotoTab(page, 's-train');
    await expect(page.locator('#h-plus')).toBeVisible();
    await expect(optTitle(page, 'h-plus')).toHaveText('加一輪 下肢後鏈');
    expect(await optMinutes(page, 'h-plus')).toBeGreaterThan(0);
    const eBefore = await engine(page);
    await page.click('#h-plus');
    const totalPlus = await phaseTotal(page);
    expect(totalPlus).toBeGreaterThan(totalStart);
    const days = engineAfter(readFixture('v3.json'), [{ date: '2026-10-02', type: 'full', xp: 10, plus: true }], NOW_ISO).streak.days;
    expect(days).toBe(eBefore.streak.days + 1);
    const after = await finishWorkout(page, eBefore, { gain: TIER_XP('plus'), days });
    expect(after.pillars.move).toMatchObject({ xp: 60, max: 60, tier: 'plus', type: 'full' });
    const s = await storedState(page);
    expectSynced(s, {
      xp: 406, streak: { current: 13, best: 13, lastDate: '2026-10-02' }, sessions: 36,
      lastSession: { date: '2026-10-02', type: 'full', xp: 10, plus: true }
    });
    expect(s.sessions.some((x) => x.type === 'plus'), '加一輪不記成 type plus').toBe(false);
    expect(typeof s.xp).toBe('number');
  });

  test('週二早上從訓練分頁跑今日課表 → 隔天週三加一輪記為 cycle＋plus:true（跨日連續天數 +1）', async ({ page }) => {
    await openApp(page, { now: '2026-09-29T07:00:00+09:00', seed: seedState(readFixture('v2-real.json')) });
    await expect(page.locator('#h-date')).toHaveText('週二 9/29');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin'); // 早上：下一步是早安打卡
    await expect(page.locator('#h-banner')).toBeHidden(); // 昨天（9/28）有練
    let before = await engine(page);
    const raw = readFixture('v2-real.json');
    const rec29 = { date: '2026-09-29', type: 'full', xp: 10 };
    const days29 = engineAfter(raw, [rec29], '2026-09-29T07:00:00+09:00').streak.days;
    expect(days29, '昨天（9/28）有練 → 比練之前多 1').toBe(before.streak.days + 1);
    await startFromTrainTab(page, '開始今日課表');
    await finishWorkout(page, before, { gain: TIER_XP('main'), days: days29 });
    expectSynced(await storedState(page), {
      xp: 371, streak: { current: 10, best: 11, lastDate: '2026-09-29' }, sessions: 33,
      lastSession: { date: '2026-09-29', type: 'full', xp: 10 }
    });
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-mission')).toContainText('伸展組 B：胸肩與上背　·　加強區塊：下肢後鏈');

    /* 隔天：切回 HOME 會依新的日期重畫 */
    await page.clock.pauseAt(new Date('2026-09-30T07:00:00+09:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('週三 9/30');
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-mission')).toContainText('（本週唯一加練日）');
    await expect(optTitle(page, 'h-plus')).toHaveText('加一輪 拉系列與上背');
    before = await engine(page);
    await page.click('#h-plus');
    const days30 = engineAfter(raw, [rec29, { date: '2026-09-30', type: 'cycle', xp: 15, plus: true }], '2026-09-30T07:00:00+09:00').streak.days;
    expect(days30, '跨日連續天數 +1').toBe(days29 + 1);
    const after = await finishWorkout(page, before, { gain: TIER_XP('plus'), days: days30 });
    expect(after.pillars.move).toMatchObject({ xp: 60, tier: 'plus', type: 'cycle' });
    expectSynced(await storedState(page), {
      xp: 386, streak: { current: 11, best: 11, lastDate: '2026-09-30' }, sessions: 34,
      lastSession: { date: '2026-09-30', type: 'cycle', xp: 15, plus: true }
    });
    await expectHome(page, { level: 3, xp: 386, current: 11, best: 11 });
  });

  test('雨天／出差替代：21 步、完成記為 rain（engine 算主課表 50、legacy +5）', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-train');
    const before = await engine(page);
    await page.click('#h-rain');
    await expect(page.locator('#t-phase')).toHaveText('1 / 21');
    const days = engineAfter(readFixture('v3.json'), [{ date: '2026-10-02', type: 'rain', xp: 5 }], NOW_ISO).streak.days;
    expect(days).toBe(before.streak.days + 1);
    await finishWorkout(page, before, { gain: TYPE_XP('rain'), days });
    expect(TYPE_XP('rain')).toBe(TIER_XP('main'));
    expectSynced(await storedState(page), {
      xp: 401, streak: { current: 13, best: 13, lastDate: '2026-10-02' }, sessions: 36,
      lastSession: { date: '2026-10-02', type: 'rain', xp: 5 }
    });
  });

  test('週六恢復日 rest → 週日 Boss Day（Plank）碼表 1:35 → 成績寫入 PR、boss（engine 60）、legacy 連續 15 天（畫面＝engine，含 Freeze）', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-03T07:30:00+09:00', seed: seedState(readFixture('v3-reverted-to-v2.json')) });
    await expect(page.locator('#h-date')).toHaveText('週六 10/3');
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-plus')).toBeHidden();
    await expect(page.locator('#h-mission')).toContainText('休息日：三組伸展全部走一遍，不做肌力。');
    let before = await engine(page);
    const raw = readFixture('v3-reverted-to-v2.json');
    const rest03 = { date: '2026-10-03', type: 'rest', xp: 5 };
    const days03 = engineAfter(raw, [rest03], '2026-10-03T07:30:00+09:00').streak.days;
    expect(days03).toBe(before.streak.days + 1);
    await startFromTrainTab(page, '開始恢復序列');
    await finishWorkout(page, before, { gain: TYPE_XP('rest'), days: days03 });
    expectSynced(await storedState(page), {
      xp: 411, streak: { current: 14, best: 14, lastDate: '2026-10-03' },
      lastSession: { date: '2026-10-03', type: 'rest', xp: 5 }
    });

    await page.clock.pauseAt(new Date('2026-10-04T07:30:00+09:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('週日 10/4');
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：Plank 極限。先完成十動作暖身，測驗自動接續。');
    await expect(page.locator('#tr-boss-item')).toHaveText('Plank 極限');
    await expect(page.locator('#h-plus')).toBeHidden();
    before = await engine(page);
    await startFromTrainTab(page, '開始 Boss Day');
    await tickUntil(page, () => document.getElementById('t-phase').textContent === 'BOSS · PLANK',
      { every: 1, maxSeconds: 2400, label: 'Plank 測驗開始' });
    await expect(page.locator('#t-name')).toHaveText('平板支撐測驗');
    await expect(page.locator('#t-count')).toHaveText('0:00');
    await tick(page, 95);
    await expect(page.locator('#t-count')).toHaveText('1:35');
    await page.click('#t-abort');
    await expect(page.locator('#s-boss')).toHaveClass(/active/);
    await expect(page.locator('#b-title')).toHaveText('Plank 成績確認');
    await expect(page.locator('#b-card')).toContainText('1:35');
    await page.click('#bi-save');
    const days04 = engineAfter(raw, [rest03, { date: '2026-10-04', type: 'boss', xp: 20 }], '2026-10-04T07:30:00+09:00').streak.days;
    expect(days04, '跨日連續天數 +1').toBe(days03 + 1);
    await expectDone(page, before, { gain: TYPE_XP('boss'), days: days04, identity: 'boss' });
    const s = await storedState(page);
    expectSynced(s, {
      xp: 431, streak: { current: 15, best: 15, lastDate: '2026-10-04' },
      lastSession: { date: '2026-10-04', type: 'boss', xp: 20 }
    });
    expect(s.prs.plank[s.prs.plank.length - 1]).toEqual({ date: '2026-10-04', sec: 95 });
    expect(seen).toEqual([]);
    await page.click('#d-ok');
    await expectHome(page, { level: 3, xp: 431, current: 15, best: 15 });
    /* 統計的訓練紀錄顯示新 PR */
    await gotoTab(page, 's-hist');
    await expect(page.locator('#pr-plank .prline').first()).toContainText('2026-10-04');
    await expect(page.locator('#pr-plank .prline').first()).toContainText('1:35');
  });

  test('週日 Boss Day（HRP）：暖身 → 2:00 倒數 → 空白輸入被擋 → 18 下寫入 PR', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-18T08:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    /* V2a D19：中斷後的今日是回歸任務卡（取代 V1 的「上次訓練是 17 天前」）：只講今天完成任一支柱就有回歸徽章，
       不提中斷幾天、不扣分（原則 8）；保底版連結照常在。文字＝engine 的 returnQuest.label（data/game.json copy） */
    const v3raw = readFixture('v3.json');
    const quest = engineAfter(v3raw, [], '2026-10-18T08:00:00+09:00').returnQuest;
    expect(quest.stage).toBe('return');
    const banner = page.locator('#h-banner');
    await expect(banner).toHaveClass('banner quest'); // 上次 10/1
    await expect(banner).toHaveAttribute('data-stage', 'return');
    await expect(banner).toHaveText(quest.label);
    expect(quest.label).toBe(RULES.copy.returnQuest.return);
    await expect(banner).not.toContainText(/天前|中斷|\d+\s*天/);
    await expect(page.locator('#h-minimal')).toBeVisible();
    await expect(page.locator('#h-minimal')).toHaveText(/^只有 \d+ 分鐘？做保底版$/);
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：HRP 伏地挺身 2 分鐘。先完成十動作暖身，測驗自動接續。');
    const before = await engine(page);
    await startFromTrainTab(page, '開始 Boss Day');
    await tickUntil(page, () => document.getElementById('t-phase').textContent === 'BOSS · HRP',
      { every: 1, maxSeconds: 2400, label: 'HRP 測驗開始' });
    await expect(page.locator('#t-name')).toHaveText('HRP 伏地挺身測驗');
    await expect(page.locator('#t-count')).toHaveText('2:00');
    await tick(page, 30);
    await expect(page.locator('#t-count')).toHaveText('1:30');
    await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'),
      { every: 1, maxSeconds: 200, label: 'HRP 輸入畫面' });
    await expect(page.locator('#b-title')).toHaveText('HRP 成績輸入');
    const raw = await rawMain(page);
    await page.click('#bi-save');
    await expect.poll(() => seen).toEqual(['請輸入次數']);
    expect(await rawMain(page)).toBe(raw);
    await page.fill('#bi-1', '18');
    await page.click('#bi-save');
    /* 16 天空檔，Freeze 最多 2 張補不起 → 不用（張數保留）、從 1 開始 */
    const after18 = engineAfter(v3raw, [{ date: '2026-10-18', type: 'boss', xp: 20 }], '2026-10-18T08:00:00+09:00');
    expect(after18.streak.days).toBe(1);
    await expectDone(page, before, { gain: TYPE_XP('boss'), days: after18.streak.days, identity: 'boss' });
    const s = await storedState(page);
    expectSynced(s, {
      xp: 416, streak: { current: 1, best: 12, lastDate: '2026-10-18' },
      lastSession: { date: '2026-10-18', type: 'boss', xp: 20 }
    });
    expect(s.prs.hrp[s.prs.hrp.length - 1]).toEqual({ date: '2026-10-18', reps: 18 });
    /* 回到今日：回歸當天（只有動）＝拿到回歸徽章，卡片改說接下來 3 天內完成 2 個支柱的加成 */
    expect(after18.returnQuest).toMatchObject({ stage: 'badge', badgeDate: '2026-10-18' });
    await page.click('#d-ok');
    await expect(banner).toHaveClass('banner quest');
    await expect(banner).toHaveAttribute('data-stage', 'badge');
    await expect(banner).toHaveText(after18.returnQuest.label);
    await expect(page.locator('#cele')).toBeHidden(); // P1 還沒早安打卡 → 不是 Perfect Day；Lv 沒變
  });

  test('週日 Boss Day（2 英里）：暖身 → 成績輸入 → 缺秒數被擋 → 18:30 寫入 PR', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-11T08:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-train');
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：2 英里跑。先完成十動作暖身，測驗自動接續。');
    const before = await engine(page);
    await startFromTrainTab(page, '開始 Boss Day');
    await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'),
      { every: 1, maxSeconds: 2400, label: '2 英里輸入畫面' });
    await expect(page.locator('#train')).not.toHaveClass(/active/);
    await expect(page.locator('#b-title')).toHaveText('2 英里跑 成績輸入');
    const raw = await rawMain(page);
    await page.fill('#bi-m', '18');
    await page.click('#bi-save');
    await expect.poll(() => seen).toEqual(['請輸入完整時間']);
    expect(await rawMain(page)).toBe(raw);
    await page.fill('#bi-s', '30');
    await page.click('#bi-save');
    const days11 = engineAfter(readFixture('v3.json'), [{ date: '2026-10-11', type: 'boss', xp: 20 }], '2026-10-11T08:00:00+09:00').streak.days;
    expect(days11, '9 天空檔補不起 → 從 1 開始').toBe(1);
    await expectDone(page, before, { gain: TYPE_XP('boss'), days: days11, identity: 'boss' });
    const s = await storedState(page);
    expectSynced(s, {
      xp: 416, streak: { current: 1, best: 12, lastDate: '2026-10-11' },
      lastSession: { date: '2026-10-11', type: 'boss', xp: 20 }
    });
    expect(s.prs.run2mi[s.prs.run2mi.length - 1]).toEqual({ date: '2026-10-11', sec: 1110 });
  });

  test('強度升級：近 7 天都有練＋近 21 天 HRP 21 下 → 今日出現升級按鈕 → 升到 L4，劑量（時長）跟著變', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { seed: seedState(readFixture('v3-reverted-to-v2.json')) });
    await expectHome(page, { level: 3, xp: 406, current: 13, best: 13 });
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'done');
    await expect(page.locator('#h-start .nx-title')).toHaveText('今日課表完成了');
    const lu = page.locator('#h-levelup');
    await expect(lu).toBeVisible();
    await expect(lu).toHaveText('強度升級條件達成 — 點此升到 L4');
    await gotoTab(page, 's-train');
    const plusL3 = await optMinutes(page, 'h-plus');
    await page.click('#h-plus');
    const firstRepsL3 = await page.evaluate(() => document.getElementById('t-sub').textContent);
    await page.click('#t-abort');
    await gotoTab(page, 's-home');
    await lu.click();
    await expect.poll(() => seen).toEqual(['升級至 L4。劑量已自動調整。']);
    await expect(page.locator('#h-level')).toHaveText('L4');
    const s = await storedState(page);
    expect(s.level).toBe(4);
    expect(s.version).toBe(3);
    expect(s.xp).toBe(406); // 升級不改 XP
    /* L4 門檻 HRP 15 下：21 下仍達標 → 按鈕仍在（可再升 L5，同 main） */
    await expect(lu).toBeVisible();
    await expect(lu).toHaveText('強度升級條件達成 — 點此升到 L5');
    /* 劑量隨等級變：加一輪的時長變長 */
    await gotoTab(page, 's-train');
    expect(await optMinutes(page, 'h-plus')).toBeGreaterThan(plusL3);
    expect(firstRepsL3).toBe('手機放地上 · 就位');
  });
});
