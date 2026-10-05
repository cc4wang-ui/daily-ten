/* qa-checker：V1 早安打卡（D17、D18；data/game.json 的 sleep、copy.checkIn；js/habits/sleep.js 的 buildCheckIn／checkInWindow）。
   假時鐘（Asia/Tokyo）。預期值一律由 engine 在 Node 算（helpers.js 的 nodeEngine，子行程 TZ=Asia/Tokyo），不寫死猜測值；
   另外對照 brief 給的字面值（第一筆打卡的完整形狀）。
   1. 全新資料 07:00：1 次點擊寫入剛好 1 筆 {date, lightsOut, wake, lightsOutEdited:false, target}；計分明細 +30／+20／+10；
      toast「已記錄起床 07:00 · +60」；三環與圖例 60／60；下一步變成今日課表。
   2. 10 秒內按復原 → 紀錄刪除；滿 10 秒 toast 收起、沒有復原。
   3. 同一個遊戲日不能打第二次（連點、畫面已打卡後再觸發、重開）：永遠只有 1 筆。
   4. 修改熄燈（00:40）→ lightsOutEdited:true、D18 漸進分數＝engine。修改起床（往前）→ wakeEdited:true；晚於按下的時間 → engine 的原因、不寫入。
   5. 時段 04:00–12:00：03:30、03:59、12:00、12:30 顯示 #ci-closed（engine 的原因）且不寫入；04:00、11:59 開放；畫面停到跨過 12:00 再按 → 不寫入。
   6. 計分表：5 種起床／熄燈組合，畫面的每一行與總分＝buildCheckIn。
   7. 下一步：早上沒打卡＝打卡；打卡後＝今日課表；週日＝Boss Day；都完成＝完成。
   8. Fixture：v3-checkin 在 10-04 07:30 已打卡（明細＝engine 對存檔紀錄的分數）、10-05 06:50 還沒打卡（預填就寢 23:30）。 */
import {
  test, expect, readFixture, openApp, seedState, storedState, storageSnapshot, gotoTab, appSummary, nodeEngine, runWorkoutToEnd
} from './helpers.js';

const MON_0700 = '2026-10-05T07:00:00+09:00';
const FIRST_ENTRY = {
  date: '2026-10-05', lightsOut: '2026-10-04T23:00:00+09:00', wake: '2026-10-05T07:00:00+09:00', lightsOutEdited: false,
  target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }
};
/* 全新資料的設定（schema 預設值，與 App 的 defaultState 相同） */
const FRESH_SETTINGS = { settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 } };
const build = (now, opts = {}, state = FRESH_SETTINGS) =>
  nodeEngine('return sleep.buildCheckIn(args.state, new Date(args.now), rules, args.opts);', { state, now, opts });
const windowAt = (now, state = FRESH_SETTINGS) =>
  nodeEngine('return sleep.checkInWindow(args.state, new Date(args.now), rules);', { state, now });
const hhmm = (iso) => /T(\d{2}:\d{2})/.exec(iso)[1];

const sleepLog = async (page) => { const s = await storedState(page); return s ? s.habits.sleep.log : []; };
/* 計分明細的畫面文字：每一行 [標籤, 值, +XP] */
const shownLines = (page) => page.locator('#ci-lines li').evaluateAll((lis) => lis.map((li) => [
  li.querySelector('.sc-label').textContent, li.querySelector('.sc-val').textContent, li.querySelector('.sc-xp').textContent]));
const expectedLines = (score) => score.lines.map((l) => [l.label, String(l.value), `+${l.xp}`]);

async function openCheckIn(page) {
  await page.click('#h-start');
  await expect(page.locator('#s-checkin')).toHaveClass(/active/);
}

test.describe('早安打卡：1 次點擊、計分明細、復原', () => {
  test('全新資料 07:00：寫入剛好 1 筆、明細 +30／+20／+10、toast、三環與圖例 60／60、下一步變成今日課表', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    expect(await storageSnapshot(page), '第一次開 App 不寫入').toEqual({});
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await openCheckIn(page);
    await expect(page.locator('#ci-todo')).toBeVisible();
    await expect(page.locator('#ci-now')).toHaveText('07:00');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 23:00（就寢時間）');
    await expect(page.locator('#ci-edit')).toHaveText('昨晚不是 23:00 熄燈？修改時間');
    await expect(page.locator('#ci-edit-row')).toBeHidden();
    await expect(page.locator('#ci-xp')).toHaveText('0');
    await expect(page.locator('#ci-max')).toHaveText('60');

    const want = build(MON_0700);
    expect(want.ok).toBe(true);
    expect(want.entry, 'engine 的紀錄＝brief 的字面值').toEqual(FIRST_ENTRY);
    await page.click('#ci-wake');
    await expect(page.locator('#ci-done')).toBeVisible();
    await expect(page.locator('#ci-todo')).toBeHidden();
    const log = await sleepLog(page);
    expect(log).toEqual([FIRST_ENTRY]);
    expect(await shownLines(page)).toEqual(expectedLines(want.score));
    expect((await shownLines(page)).map((l) => l[2])).toEqual(['+30', '+20', '+10']);
    await expect(page.locator('#ci-xp')).toHaveText(String(want.score.total));
    await expect(page.locator('#ci-note')).toHaveText('晚於時段 30 分鐘內仍有一半分數，不會歸零。');
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast-text')).toHaveText('已記錄起床 07:00 · +60');
    await expect(page.locator('#toast-action')).toHaveText('復原');
    /* 存檔一併寫入載入時補上的階段起點 */
    expect((await storedState(page)).phase.startedAt).toBe(MON_0700);

    await gotoTab(page, 's-home');
    await expect(page.locator('#h-legend [data-go="s-checkin"] .lg-val').first()).toHaveText('60 / 60');
    await expect(page.locator('#h-rings-svg')).toHaveAttribute('aria-label', /眠 60 \/ 60 XP/);
    await expect(page.locator('#h-rings-svg circle.arc.sleep')).toHaveCount(1);
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'workout');
    const { sum } = await appSummary(page);
    expect(sum.pillars.sleep).toMatchObject({ checkedIn: true, xp: 60, max: 60 });
    expect(sum.nextAction.kind).toBe('workout');
  });

  test('10 秒內按復原 → 紀錄刪除、回到待打卡；滿 10 秒 toast 收起、沒有復原，紀錄保留', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await openCheckIn(page);
    await page.click('#ci-wake');
    expect(await sleepLog(page)).toHaveLength(1);
    await page.clock.runFor(9_000);
    await expect(page.locator('#toast-action')).toBeVisible();
    await page.click('#toast-action');
    await expect.poll(() => sleepLog(page)).toEqual([]);
    await expect(page.locator('#toast-text')).toHaveText('已復原');
    await expect(page.locator('#toast-action')).toBeHidden();
    await expect(page.locator('#ci-todo')).toBeVisible();
    await expect(page.locator('#ci-xp')).toHaveText('0');
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await expect(page.locator('#h-legend [data-go="s-checkin"] .lg-val').first()).toHaveText('0 / 60');

    /* 再打一次：這次等滿 10 秒 */
    await page.clock.runFor(3_000); // 「已復原」提示收起
    await openCheckIn(page);
    await page.click('#ci-wake');
    await expect(page.locator('#toast-action')).toBeVisible();
    await page.clock.runFor(9_999);
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast-action')).toBeVisible();
    await page.clock.runFor(1);
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#toast-action')).toBeHidden();
    const log = await sleepLog(page);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ date: '2026-10-05', wake: '2026-10-05T07:00:12+09:00' }); // 第二次按下＝07:00:12（假時鐘推進的時間）
  });

  test('同一個遊戲日不能打第二次：連點、畫面已打卡後再觸發、重開後都只有 1 筆', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await openCheckIn(page);
    /* 同一個工作中連按兩下（寫入中擋連點） */
    await page.evaluate(() => { const b = document.getElementById('ci-wake'); b.click(); b.click(); });
    await expect(page.locator('#ci-done')).toBeVisible();
    expect(await sleepLog(page)).toEqual([FIRST_ENTRY]);
    /* 已打卡後再觸發（按鈕已收起；程式觸發 click 模擬殘留的畫面）：被擋下、紀錄不變 */
    await page.clock.runFor(60_000);
    await page.evaluate(() => document.getElementById('ci-wake').click());
    await expect.poll(() => sleepLog(page)).toEqual([FIRST_ENTRY]);
    const w = windowAt('2026-10-05T07:01:00+09:00', { habits: { sleep: { log: [FIRST_ENTRY] } }, ...FRESH_SETTINGS });
    expect(w).toMatchObject({ open: false, code: 'done', reason: '今天已經打卡了' });
    /* 重開：今日不再是打卡、打卡畫面顯示已打卡 */
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(page.locator('#h-start')).not.toHaveAttribute('data-kind', 'checkin');
    await gotoTab(page, 's-checkin');
    await expect(page.locator('#ci-done')).toBeVisible();
    await expect(page.locator('#ci-todo')).toBeHidden();
    expect(await sleepLog(page)).toEqual([FIRST_ENTRY]);
  });
});

test.describe('修改時間（熄燈、起床）', () => {
  test('昨晚 00:40 熄燈 → lightsOutEdited:true、熄燈與睡眠時數照 D18 漸進＝engine', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await openCheckIn(page);
    await page.click('#ci-edit');
    const row = page.locator('#ci-edit-row');
    await expect(row).toBeVisible();
    await expect(page.locator('#ci-edit')).toBeHidden();
    await expect(row.getByLabel('昨晚熄燈')).toHaveValue('23:00');
    await expect(row.getByLabel('今天起床')).toHaveValue('07:00');
    await expect(row).toContainText('起床時間只能往前改，預設是按下的時間。');
    await expect(page.locator('#ci-edit-reset')).toHaveText('恢復預設');
    await row.getByLabel('昨晚熄燈').fill('00:40');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 00:40（你改的時間）');
    const want = build(MON_0700, { lightsOut: '00:40' });
    expect(want.entry).toMatchObject({ lightsOut: '2026-10-05T00:40:00+09:00', lightsOutEdited: true });
    expect(want.score.lightsOut.status).toBe('base');
    await page.click('#ci-wake');
    await expect(page.locator('#ci-done')).toBeVisible();
    expect(await sleepLog(page)).toEqual([want.entry]);
    expect(await shownLines(page)).toEqual(expectedLines(want.score));
    await expect(page.locator('#ci-xp')).toHaveText(String(want.score.total));
    await expect(page.locator('#toast-text')).toHaveText(`已記錄起床 07:00 · +${want.score.total}`);
    await expect(row).toBeHidden();
  });

  test('「恢復預設」收起修改列、改回就寢時間與按下的時間', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await openCheckIn(page);
    await page.click('#ci-edit');
    await page.locator('#ci-lights').fill('00:10');
    await page.locator('#ci-wake-time').fill('06:40');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 00:10（你改的時間），起床改成 06:40');
    await expect(page.locator('#ci-now')).toHaveText('06:40');
    await page.click('#ci-edit-reset');
    await expect(page.locator('#ci-edit-row')).toBeHidden();
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 23:00（就寢時間）');
    await expect(page.locator('#ci-now')).toHaveText('07:00');
    await page.click('#ci-wake');
    expect(await sleepLog(page)).toEqual([FIRST_ENTRY]);
  });

  test('起床往前改（06:30）→ wakeEdited:true、分數＝engine；晚於按下的時間（07:30）→ engine 的原因、改回、不寫入', async ({ page }) => {
    await openApp(page, { now: MON_0700 });
    await openCheckIn(page);
    await page.click('#ci-edit');
    const wake = page.locator('#ci-edit-row').getByLabel('今天起床');
    /* 晚於現在：拒絕 */
    const late = build(MON_0700, { wake: '07:30' });
    expect(late).toMatchObject({ ok: false, code: 'wakeFuture', reason: '起床時間不能晚於現在' });
    await wake.fill('07:30');
    await expect(page.locator('#ci-msg')).toHaveText(late.reason);
    await expect(wake).toHaveValue('07:00');
    await expect(page.locator('#ci-now')).toHaveText('07:00');
    expect(await storageSnapshot(page), '被拒絕的時間不寫入').toEqual({});
    /* 往前改：接受 */
    await wake.fill('06:30');
    await expect(page.locator('#ci-msg')).toHaveText('');
    await expect(page.locator('#ci-now')).toHaveText('06:30');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 23:00（就寢時間），起床改成 06:30');
    const want = build(MON_0700, { wake: '06:30' });
    expect(want.entry).toMatchObject({ wake: '2026-10-05T06:30:00+09:00', wakeEdited: true, lightsOutEdited: false });
    await page.click('#ci-wake');
    await expect(page.locator('#ci-done')).toBeVisible();
    expect(await sleepLog(page)).toEqual([want.entry]);
    expect(await shownLines(page)).toEqual(expectedLines(want.score));
    await expect(page.locator('#toast-text')).toHaveText(`已記錄起床 06:30 · +${want.score.total}`);
  });
});

test.describe('打卡時段 04:00–12:00', () => {
  test('03:30、03:59 還沒開放；04:00、04:01、11:59 開放；12:00、12:30 已結束（原因＝engine）；關閉時什麼都不寫', async ({ page }) => {
    await openApp(page, { now: '2026-10-05T03:30:00+09:00' });
    const steps = [
      ['2026-10-05T03:30:00+09:00', false], ['2026-10-05T03:59:00+09:00', false], ['2026-10-05T04:00:00+09:00', true],
      ['2026-10-05T04:01:00+09:00', true], ['2026-10-05T11:59:00+09:00', true], ['2026-10-05T12:00:00+09:00', false],
      ['2026-10-05T12:30:00+09:00', false]
    ];
    for (const [iso, open] of steps) {
      await page.clock.pauseAt(new Date(iso));
      const w = windowAt(iso);
      expect(w.open, `${iso}：engine`).toBe(open);
      await gotoTab(page, 's-home');
      /* 下一步＝engine（03:30／03:59 的遊戲日是週日 → Boss Day） */
      const kind = nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules).nextAction.kind;', { state: FRESH_SETTINGS, now: iso });
      expect(kind === 'checkin', `${iso}：engine 的下一步`).toBe(open);
      await expect(page.locator('#h-start'), iso).toHaveAttribute('data-kind', kind);
      await gotoTab(page, 's-checkin'); // 圖例的「眠」
      if (open) {
        await expect(page.locator('#ci-todo'), iso).toBeVisible();
        await expect(page.locator('#ci-closed'), iso).toBeHidden();
      } else {
        await expect(page.locator('#ci-closed'), iso).toBeVisible();
        await expect(page.locator('#ci-closed-text'), iso).toHaveText(w.reason);
        await expect(page.locator('#ci-todo'), iso).toBeHidden();
        /* 收起的按鈕被程式觸發也不寫入 */
        await page.evaluate(() => document.getElementById('ci-wake').click());
        expect(await storageSnapshot(page), `${iso}：不寫入`).toEqual({});
      }
    }
    expect(windowAt('2026-10-05T03:30:00+09:00')).toMatchObject({ code: 'early', reason: '早安打卡 04:00 開放', date: '2026-10-04' });
    expect(windowAt('2026-10-05T12:30:00+09:00')).toMatchObject({ code: 'late', reason: '早安打卡開放到 12:00，明天早上見', date: '2026-10-05' });
  });

  test('打卡畫面停到跨過 12:00 才按：顯示 engine 的原因、不寫入', async ({ page }) => {
    await openApp(page, { now: '2026-10-05T11:59:30+09:00' });
    await openCheckIn(page);
    await expect(page.locator('#ci-todo')).toBeVisible();
    await page.clock.runFor(60_000); // 12:00:30（畫面沒有重畫）
    const late = build('2026-10-05T12:00:30+09:00');
    expect(late).toMatchObject({ ok: false, code: 'late' });
    await page.click('#ci-wake');
    await expect(page.locator('#ci-msg')).toHaveText(late.reason);
    expect(await storageSnapshot(page)).toEqual({});
  });
});

/* ---------- 計分表：畫面＝buildCheckIn ---------- */
const CASES = [
  { label: '時段內（07:00、23:00）', now: '2026-10-05T07:00:00+09:00', lightsOut: null },
  { label: '起床晚 15 分、熄燈 23:20（半分）', now: '2026-10-05T07:45:00+09:00', lightsOut: '23:20' },
  { label: '起床 09:10、熄燈 03:00、睡 6 小時 10 分（全部基本分）', now: '2026-10-05T09:10:00+09:00', lightsOut: '03:00' },
  { label: '起床早 20 分、熄燈早 30 分（半分）', now: '2026-10-05T06:10:00+09:00', lightsOut: '22:00' },
  { label: '睡眠差 20 分滿 7 小時（時數半分）', now: '2026-10-05T07:00:00+09:00', lightsOut: '00:20' }
];
test.describe('計分表：畫面的每一行與總分＝engine（buildCheckIn）', () => {
  for (const c of CASES) {
    test(c.label, async ({ page }) => {
      const want = build(c.now, c.lightsOut ? { lightsOut: c.lightsOut } : {});
      expect(want.ok).toBe(true);
      await openApp(page, { now: c.now });
      await openCheckIn(page);
      if (c.lightsOut) {
        await page.click('#ci-edit');
        await page.locator('#ci-lights').fill(c.lightsOut);
      }
      await page.click('#ci-wake');
      await expect(page.locator('#ci-done')).toBeVisible();
      expect(await sleepLog(page)).toEqual([want.entry]);
      expect(await shownLines(page)).toEqual(expectedLines(want.score));
      await expect(page.locator('#ci-xp')).toHaveText(String(want.score.total));
      await expect(page.locator('#toast-text')).toHaveText(`已記錄起床 ${hhmm(want.entry.wake)} · +${want.score.total}`);
      await gotoTab(page, 's-home');
      await expect(page.locator('#h-legend [data-go="s-checkin"] .lg-val').first()).toHaveText(`${want.score.total} / 60`);
      console.log(`[qa] 計分表 ${c.label}：${want.score.lines.map((l) => `${l.label} ${l.value} +${l.xp}`).join('；')}；合計 ${want.score.total}`);
    });
  }
  test('計分表涵蓋三種狀態（時段內 full、超出 30 分內 near、更遠 base）', () => {
    const statuses = new Set();
    for (const c of CASES) {
      const s = build(c.now, c.lightsOut ? { lightsOut: c.lightsOut } : {}).score;
      for (const k of ['wake', 'lightsOut', 'duration']) statuses.add(`${k}:${s[k].status}`);
    }
    for (const k of ['wake', 'lightsOut', 'duration']) for (const st of ['full', 'near', 'base']) expect([...statuses], `${k}:${st}`).toContain(`${k}:${st}`);
  });
});

test.describe('今日的「下一步」', () => {
  test('早上沒打卡＝早安打卡 → 打卡後＝今日課表 → 練完＝今天都完成了', async ({ page }) => {
    await openApp(page, { now: MON_0700, seed: seedState(readFixture('v3.json')) });
    const next = page.locator('#h-start');
    await expect(next).toHaveAttribute('data-kind', 'checkin');
    await expect(next.locator('.nx-title')).toHaveText('早安打卡');
    await openCheckIn(page);
    await page.click('#ci-wake');
    await gotoTab(page, 's-home');
    await expect(next).toHaveAttribute('data-kind', 'workout');
    await expect(next.locator('.nx-title')).toHaveText('開始今日課表');
    await page.click('#h-minimal');
    await runWorkoutToEnd(page);
    await page.click('#d-ok');
    await expect(next).toHaveAttribute('data-kind', 'done');
    await expect(next.locator('.nx-title')).toHaveText('今天都完成了');
    const { sum } = await appSummary(page);
    expect(sum.nextAction).toEqual({ kind: 'done', label: '今天都完成了' });
  });

  test('週日：打卡後＝Boss Day；下午（打卡時段已過、沒打卡）也是 Boss Day', async ({ page }) => {
    await openApp(page, { now: '2026-10-04T07:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    const next = page.locator('#h-start');
    await expect(next).toHaveAttribute('data-kind', 'checkin');
    await openCheckIn(page);
    await page.click('#ci-wake');
    await gotoTab(page, 's-home');
    await expect(next).toHaveAttribute('data-kind', 'boss');
    await expect(next.locator('.nx-title')).toHaveText('開始 Boss Day');
    await page.clock.pauseAt(new Date('2026-10-04T15:00:00+09:00'));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(next).toHaveAttribute('data-kind', 'boss');
  });

  test('週日下午、全新資料（沒打卡、時段已過）＝Boss Day', async ({ page }) => {
    await openApp(page, { now: '2026-10-04T15:00:00+09:00' });
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'boss');
    const { sum } = await appSummary(page);
    expect(sum.nextAction.kind).toBe('boss');
  });
});

test.describe('B1 fixture：已打卡／還沒打卡', () => {
  test('v3-checkin 在 2026-10-04 07:30：今天已打卡 → 下一步不是打卡；打卡畫面的明細＝engine 對存檔紀錄的分數', async ({ page }) => {
    const raw = readFixture('v3-checkin.json');
    const now = '2026-10-04T07:30:00+09:00';
    await openApp(page, { now, seed: seedState(raw) });
    const want = nodeEngine('return eng.todaySummary(args.state, new Date(args.now), rules);', { state: JSON.parse(raw), now });
    expect(want.pillars.sleep.checkedIn).toBe(true);
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', want.nextAction.kind);
    expect(want.nextAction.kind).toBe('boss'); // 週日、今天還沒練
    await expect(page.locator('#h-phase')).toHaveText(want.phase.label);
    await expect(page.locator('#h-streak')).toHaveText(String(want.streak.days));
    await gotoTab(page, 's-checkin');
    await expect(page.locator('#ci-done')).toBeVisible();
    expect(await shownLines(page)).toEqual(expectedLines(want.pillars.sleep.score));
    await expect(page.locator('#ci-xp')).toHaveText(String(want.pillars.sleep.xp));
    expect(await storedState(page), '看打卡結果不寫入').toEqual(JSON.parse(raw));
  });

  test('v3-checkin 在 2026-10-05 06:50：今天還沒打卡 → 下一步＝早安打卡，預填就寢 23:30；打卡寫入第 4 筆', async ({ page }) => {
    const raw = readFixture('v3-checkin.json');
    const now = '2026-10-05T06:50:00+09:00';
    await openApp(page, { now, seed: seedState(raw) });
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await openCheckIn(page);
    await expect(page.locator('#ci-now')).toHaveText('06:50');
    await expect(page.locator('#ci-lights-sub')).toHaveText('同時記錄昨晚熄燈 23:30（就寢時間）');
    const state = JSON.parse(raw);
    const want = build(now, {}, state);
    expect(want.entry.target).toEqual({ bedtime: '23:30', wakeTime: '07:00', windowMin: 30 });
    await page.click('#ci-wake');
    const log = await sleepLog(page);
    expect(log).toEqual([...state.habits.sleep.log, want.entry]);
  });
});

/* ---------- 跨時區：紀錄用當地 offset，遊戲日用當地時間 ---------- */
test.describe('跨時區（America/Los_Angeles）', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('當地 03:59 還沒開放（遊戲日＝前一天）；當地 07:00 打卡 → 紀錄的時間帶 -07:00、date＝當地遊戲日', async ({ page }) => {
    await openApp(page, { now: '2026-10-05T03:59:00-07:00' });
    expect(await page.evaluate(() => new Date().getTimezoneOffset())).toBe(420);
    await expect(page.locator('#h-date')).toHaveText('週日 10/4');
    await expect(page.locator('#h-start')).not.toHaveAttribute('data-kind', 'checkin');
    await page.clock.pauseAt(new Date('2026-10-05T07:00:00-07:00'));
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-date')).toHaveText('週一 10/5');
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
    await openCheckIn(page);
    await page.click('#ci-wake');
    expect(await sleepLog(page)).toEqual([{
      date: '2026-10-05', lightsOut: '2026-10-04T23:00:00-07:00', wake: '2026-10-05T07:00:00-07:00', lightsOutEdited: false,
      target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }
    }]);
    expect((await shownLines(page)).map((l) => l[2])).toEqual(['+30', '+20', '+10']);
  });
});
