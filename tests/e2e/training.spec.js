/* qa-checker：完整訓練流程 e2e（PLAN.md §5 #4；CLAUDE.md §9 DoD 1「首頁、訓練流程」）。
   假時鐘暫停在指定時間，用 1 秒一步推進計時器，跑到完成畫面；檢查 session、XP、連續天數（畫面＋storage＋game 同步）。
   規則來源：js/ui/session.js 的 recordSession（同日重練只升級 type、補 XP 差額，不重複累積連續天數）、
   js/ui/content.js 的 XP 表 {full:10, cycle:15, boss:20, rest:5, rain:5, minimal:3}。 */
import {
  test, expect, readFixture, openApp, seedState, storedState, rawMain, expectHome, gotoTab,
  tick, tickUntil, runWorkoutToEnd
} from './helpers.js';

const IDENTITY = ['你是每天訓練的人。', '紀律就是自由。', '出席，就是勝利的八成。', '弱是選項，你沒選它。', '今天的你，比昨天強一點。'];
const BOSS_IDENTITY = '測驗完成。數據不說謊。';

const phaseTotal = async (page) => Number((await page.locator('#t-phase').textContent()).split('/')[1]);

/* 跑完一段一般訓練，回到 HOME 前檢查完成畫面 */
async function finishWorkout(page, { xpShown, streakShown }) {
  await runWorkoutToEnd(page);
  await expect(page.locator('#done')).toHaveClass(/active/);
  await expect(page.locator('#d-xp')).toHaveText(`+${xpShown} XP　·　STREAK ${streakShown}`);
  expect(IDENTITY).toContain(await page.locator('#d-identity').textContent());
  await page.click('#d-ok');
  await expect(page.locator('#done')).not.toHaveClass(/active/);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
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

test.use({ trace: 'off' }); // 上千次 fastForward 逐一寫進 trace 會慢 4–5 倍；失敗時仍有錯誤訊息與截圖

test.describe('訓練流程（假時鐘）', () => {
  test.describe.configure({ timeout: 180_000 });
  test('週五：保底版完成 → 同日再跑今日課表升級為 full（補差額、連續天數不重複）→ 再跑保底版不降級', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await expectHome(page, { level: 3, xp: 396, current: 12, best: 12 });
    await expect(page.locator('#h-start')).toHaveText(/^開始 · 十動作＋下肢後鏈（\d+ min）$/);
    await expect(page.locator('#h-minimal')).toHaveText(/^保底版 · 約 \d+ 分鐘$/);

    /* 保底版：開始、暫停、繼續 */
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

    await finishWorkout(page, { xpShown: 3, streakShown: 13 });
    const streak13 = { current: 13, best: 13, lastDate: '2026-10-02' };
    let s = await storedState(page);
    expectSynced(s, { xp: 399, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'minimal', xp: 3 } });
    expect(s.game.streaks.life).toEqual(streak13);
    await expectHome(page, { level: 3, xp: 399, current: 13, best: 13 });
    await expect(page.locator('#h-start')).toHaveText('✓ 今日已完成 — 再跑一次也行');
    await expect(page.locator('#h-banner')).toBeHidden();

    /* 同日再跑今日課表：session 升級為 full，XP 補差額 7，連續天數不變 */
    await page.click('#h-start');
    await finishWorkout(page, { xpShown: 10, streakShown: 13 });
    s = await storedState(page);
    expectSynced(s, { xp: 406, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'full', xp: 10 } });
    await expectHome(page, { level: 3, xp: 406, current: 13, best: 13 });

    /* 再跑保底版：XP 較低，不降級、不加 XP（完成畫面照原本顯示 +3） */
    await page.click('#h-minimal');
    await finishWorkout(page, { xpShown: 3, streakShown: 13 });
    s = await storedState(page);
    expectSynced(s, { xp: 406, streak: streak13, sessions: 36, lastSession: { date: '2026-10-02', type: 'full', xp: 10 } });
  });

  test('週五：今日課表中途「結束」不記錄；加一輪比今日課表多步驟，完成記為 full +10', async ({ page }) => {
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

    await expect(page.locator('#h-plus')).toBeVisible();
    await expect(page.locator('#h-plus')).toHaveText(/^加一輪 下肢後鏈 · \d+ 分鐘$/);
    await page.click('#h-plus');
    const totalPlus = await phaseTotal(page);
    expect(totalPlus).toBeGreaterThan(totalStart);
    await finishWorkout(page, { xpShown: 10, streakShown: 13 });
    expectSynced(await storedState(page), {
      xp: 406, streak: { current: 13, best: 13, lastDate: '2026-10-02' }, sessions: 36,
      lastSession: { date: '2026-10-02', type: 'full', xp: 10 }
    });
  });

  test('週二今日課表 → 隔天週三加一輪記為 cycle +15（跨日連續天數 +1）', async ({ page }) => {
    await openApp(page, { now: '2026-09-29T07:00:00+09:00', seed: seedState(readFixture('v2-real.json')) });
    await expect(page.locator('#h-date')).toHaveText('9月29日 · 週二');
    await expect(page.locator('#h-mission')).toContainText('伸展組 B：胸肩與上背　·　加強區塊：下肢後鏈');
    await expect(page.locator('#h-banner')).toBeHidden(); // 昨天（9/28）有練
    await page.click('#h-start');
    await finishWorkout(page, { xpShown: 10, streakShown: 10 });
    expectSynced(await storedState(page), {
      xp: 371, streak: { current: 10, best: 11, lastDate: '2026-09-29' }, sessions: 33,
      lastSession: { date: '2026-09-29', type: 'full', xp: 10 }
    });

    /* 隔天：切回 HOME 會依新的日期重畫 */
    await page.clock.pauseAt(new Date('2026-09-30T07:00:00+09:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('9月30日 · 週三');
    await expect(page.locator('#h-mission')).toContainText('（本週唯一加練日）');
    await expect(page.locator('#h-plus')).toHaveText(/^加一輪 拉系列與上背 · \d+ 分鐘$/);
    await page.click('#h-plus');
    await finishWorkout(page, { xpShown: 15, streakShown: 11 });
    expectSynced(await storedState(page), {
      xp: 386, streak: { current: 11, best: 11, lastDate: '2026-09-30' }, sessions: 34,
      lastSession: { date: '2026-09-30', type: 'cycle', xp: 15 }
    });
    await expectHome(page, { level: 3, xp: 386, current: 11, best: 11 });
  });

  test('雨天／出差替代：21 步、完成記為 rain +5', async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    await page.click('#h-rain');
    await expect(page.locator('#t-phase')).toHaveText('1 / 21');
    await finishWorkout(page, { xpShown: 5, streakShown: 13 });
    expectSynced(await storedState(page), {
      xp: 401, streak: { current: 13, best: 13, lastDate: '2026-10-02' }, sessions: 36,
      lastSession: { date: '2026-10-02', type: 'rain', xp: 5 }
    });
  });

  test('週六恢復日 rest +5 → 週日 Boss Day（Plank）碼表 1:35 → 成績寫入 PR、boss +20、連續 15 天', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-03T07:30:00+09:00', seed: seedState(readFixture('v3-reverted-to-v2.json')) });
    await expect(page.locator('#h-date')).toHaveText('10月3日 · 週六');
    await expect(page.locator('#h-start')).toHaveText(/^恢復序列 · \d+ 分鐘全身流動$/);
    await expect(page.locator('#h-plus')).toBeHidden();
    await expect(page.locator('#h-mission')).toContainText('休息日：三組伸展全部走一遍，不做肌力。');
    await page.click('#h-start');
    await finishWorkout(page, { xpShown: 5, streakShown: 14 });
    expectSynced(await storedState(page), {
      xp: 411, streak: { current: 14, best: 14, lastDate: '2026-10-03' },
      lastSession: { date: '2026-10-03', type: 'rest', xp: 5 }
    });

    await page.clock.pauseAt(new Date('2026-10-04T07:30:00+09:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('10月4日 · 週日');
    await expect(page.locator('#h-start')).toHaveText(/^BOSS DAY · 十動作暖身（約 \d+ min）＋測驗另計$/);
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：Plank 極限。先完成十動作暖身，測驗自動接續。');
    await expect(page.locator('#h-plus')).toBeHidden();
    await page.click('#h-start');
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
    await expect(page.locator('#done')).toHaveClass(/active/);
    await expect(page.locator('#d-identity')).toHaveText(BOSS_IDENTITY);
    await expect(page.locator('#d-xp')).toHaveText('+20 XP　·　STREAK 15');
    const s = await storedState(page);
    expectSynced(s, {
      xp: 431, streak: { current: 15, best: 15, lastDate: '2026-10-04' },
      lastSession: { date: '2026-10-04', type: 'boss', xp: 20 }
    });
    expect(s.prs.plank[s.prs.plank.length - 1]).toEqual({ date: '2026-10-04', sec: 95 });
    expect(seen).toEqual([]);
    await page.click('#d-ok');
    await expectHome(page, { level: 3, xp: 431, current: 15, best: 15 });
    /* RECORDS 顯示新 PR */
    await gotoTab(page, 's-hist');
    await expect(page.locator('#pr-plank .prline').first()).toContainText('2026-10-04');
    await expect(page.locator('#pr-plank .prline').first()).toContainText('1:35');
  });

  test('週日 Boss Day（HRP）：暖身 → 2:00 倒數 → 空白輸入被擋 → 18 下寫入 PR', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-18T08:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：HRP 伏地挺身 2 分鐘。先完成十動作暖身，測驗自動接續。');
    await expect(page.locator('#h-banner')).toHaveClass('banner danger'); // 上次 10/1，已中斷 16 天
    await expect(page.locator('#h-banner')).toContainText('已中斷 16 天');
    await page.click('#h-start');
    await tickUntil(page, () => document.getElementById('t-phase').textContent === 'BOSS · HRP',
      { every: 1, maxSeconds: 2400, label: 'HRP 測驗開始' });
    await expect(page.locator('#t-name')).toHaveText('HRP 伏地挺身測驗');
    await expect(page.locator('#t-count')).toHaveText('2:00');
    await tick(page, 30);
    await expect(page.locator('#t-count')).toHaveText('1:30');
    await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'),
      { every: 1, maxSeconds: 200, label: 'HRP 輸入畫面' });
    await expect(page.locator('#b-title')).toHaveText('HRP 成績輸入');
    const before = await rawMain(page);
    await page.click('#bi-save');
    await expect.poll(() => seen).toEqual(['請輸入次數']);
    expect(await rawMain(page)).toBe(before);
    await page.fill('#bi-1', '18');
    await page.click('#bi-save');
    await expect(page.locator('#done')).toHaveClass(/active/);
    await expect(page.locator('#d-xp')).toHaveText('+20 XP　·　STREAK 1');
    const s = await storedState(page);
    expectSynced(s, {
      xp: 416, streak: { current: 1, best: 12, lastDate: '2026-10-18' },
      lastSession: { date: '2026-10-18', type: 'boss', xp: 20 }
    });
    expect(s.prs.hrp[s.prs.hrp.length - 1]).toEqual({ date: '2026-10-18', reps: 18 });
  });

  test('週日 Boss Day（2 英里）：暖身 → 成績輸入 → 缺秒數被擋 → 18:30 寫入 PR', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { now: '2026-10-11T08:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    await expect(page.locator('#h-mission')).toHaveText('今日測驗：2 英里跑。先完成十動作暖身，測驗自動接續。');
    await page.click('#h-start');
    await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'),
      { every: 1, maxSeconds: 2400, label: '2 英里輸入畫面' });
    await expect(page.locator('#train')).not.toHaveClass(/active/);
    await expect(page.locator('#b-title')).toHaveText('2 Mile Run 成績輸入');
    const before = await rawMain(page);
    await page.fill('#bi-m', '18');
    await page.click('#bi-save');
    await expect.poll(() => seen).toEqual(['請輸入完整時間']);
    expect(await rawMain(page)).toBe(before);
    await page.fill('#bi-s', '30');
    await page.click('#bi-save');
    await expect(page.locator('#done')).toHaveClass(/active/);
    await expect(page.locator('#d-identity')).toHaveText(BOSS_IDENTITY);
    await expect(page.locator('#d-xp')).toHaveText('+20 XP　·　STREAK 1');
    const s = await storedState(page);
    expectSynced(s, {
      xp: 416, streak: { current: 1, best: 12, lastDate: '2026-10-11' },
      lastSession: { date: '2026-10-11', type: 'boss', xp: 20 }
    });
    expect(s.prs.run2mi[s.prs.run2mi.length - 1]).toEqual({ date: '2026-10-11', sec: 1110 });
  });

  test('升級：近 7 天都有練＋近 21 天 HRP 21 下 → 首頁出現升級按鈕 → 升到 L4，劑量（時長）跟著變', async ({ page }) => {
    const seen = dialogs(page);
    await openApp(page, { seed: seedState(readFixture('v3-reverted-to-v2.json')) });
    await expectHome(page, { level: 3, xp: 406, current: 13, best: 13 });
    await expect(page.locator('#h-start')).toHaveText('✓ 今日已完成 — 再跑一次也行');
    const lu = page.locator('#h-levelup');
    await expect(lu).toBeVisible();
    await expect(lu).toHaveText('▲ 升級條件達成 — 點此升至下一級');
    const plusL3 = await page.locator('#h-plus').textContent();
    await page.click('#h-plus');
    const firstRepsL3 = await page.evaluate(() => document.getElementById('t-sub').textContent);
    await page.click('#t-abort');
    await lu.click();
    await expect.poll(() => seen).toEqual(['升級至 L4。劑量已自動調整。']);
    await expect(page.locator('#h-level')).toHaveText('L4');
    const s = await storedState(page);
    expect(s.level).toBe(4);
    expect(s.version).toBe(3);
    expect(s.xp).toBe(406); // 升級不改 XP
    /* L4 門檻 HRP 15 下：21 下仍達標 → 按鈕仍在（可再升 L5，同 main） */
    await expect(lu).toBeVisible();
    /* 劑量隨等級變：加一輪的時長變長 */
    const plusL4 = await page.locator('#h-plus').textContent();
    const minutes = (t) => Number(t.match(/· (\d+) 分鐘$/)[1]);
    expect(minutes(plusL4)).toBeGreaterThan(minutes(plusL3));
    expect(firstRepsL3).toBe('手機放地上 · 就位');
  });
});
