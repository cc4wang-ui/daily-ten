import { test, expect, openApp, readFixture, seedState, gotoTab, rawMain } from './helpers.js';

const NOW = '2026-10-19T15:30:00+09:00';
const PUSH = '伏地挺身';
const KNEE = '伏地挺身 · 跪姿';
const BAND = '彈力帶肩上推';

function report(date, name, n, extra = {}) {
  return { id: `history-${date}-${n}`, date, name, target: 10, actual: 10,
    effort: 'okay', form: true, pain: false, ...extra };
}
function fixture(reports, sessions = []) {
  const state = JSON.parse(readFixture('v3.json'));
  state.settings.band = true;
  state.sessions = sessions;
  if (reports !== undefined) state.game.trainingFeedback = reports;
  else delete state.game.trainingFeedback;
  return JSON.stringify(state);
}
const rows = page => page.locator('#hist-feedback-list > li');

test('課表入口精確篩選變式，返回訓練後可再進入', async ({ page }, testInfo) => {
  const data = [
    report('2026-10-18', '伏地挺身 第1組', 1),
    report('2026-10-18', '伏地挺身 · 跪姿 第1組', 2),
    report('2026-10-18', '伏地挺身 第2組', 3)
  ];
  await openApp(page, { now: NOW, seed: seedState(fixture(data)) });
  await gotoTab(page, 's-train');
  await page.locator('.prescription-history[data-movement="伏地挺身"]').click();
  await expect(page.locator('#s-stats')).toHaveClass(/active/);
  await expect(page.locator('#s-hist')).toHaveClass(/active/);
  await expect(page.locator('#hist-feedback-movement')).toHaveValue(PUSH);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('伏地挺身 第2組');
  await expect(page.locator('#hist-feedback-title')).toBeFocused();
  await page.locator('#hist-feedback-back').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/);
  await page.locator('.prescription-history[data-movement="伏地挺身"]').click();
  await expect(rows(page)).toHaveCount(2);
  await page.locator('#hist-feedback-movement').selectOption(KNEE);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('跪姿');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '375px 不應水平溢出').toBe(true);
  await page.screenshot({ path: testInfo.outputPath('feedback-history-375.png'), fullPage: true });
});

test('舊資料沒有回報時顯示說明，課表入口仍可開空歷史', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(fixture(undefined)) });
  await gotoTab(page, 's-hist');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#hist-feedback-empty')).toContainText('過去未回報的組數不會補算');
  await expect(page.locator('#hist-feedback-count')).toHaveText('顯示 0／0 組回報');
  await gotoTab(page, 's-train');
  await page.locator('.prescription-history[data-movement="伏地挺身"]').click();
  await expect(page.locator('#hist-feedback-movement')).toHaveValue(PUSH);
  await expect(rows(page)).toHaveCount(0);
});

test('零次、未完成與阻力原樣呈現；負數與惡意 HTML 被安全排除或轉成文字', async ({ page }) => {
  const unsafe = '<img src=x onerror=window.x=1>藍帶';
  const data = [
    report('2026-10-18', `${BAND} 第1組`, 1, { actual: 0, effort: 'hard', form: false, pain: true, resistance: unsafe }),
    report('2026-10-17', `${BAND} 第2組`, 2, { actual: 9, resistance: '紅帶' }),
    report('2026-10-16', `${BAND} 第1組`, 3, { actual: -1 }),
    report('2026-10-15', `${PUSH} 第1組`, 4)
  ];
  const sessions = [
    { date: '2026-10-18', type: 'minimal', xp: 3 },
    { date: '2026-10-17', type: 'cycle', xp: 15 }
  ];
  await openApp(page, { now: NOW, seed: seedState(fixture(data, sessions)) });
  const before = await rawMain(page);
  await gotoTab(page, 's-hist');
  await page.locator('#hist-feedback-movement').selectOption(BAND);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('實際 0 下／目標 10 下');
  await expect(rows(page).first()).toContainText('感受：吃力 · 姿勢：不穩定 · 疼痛：有');
  await expect(rows(page).first()).toContainText('只有回報，未完成主課表');
  await expect(rows(page).first()).toContainText(unsafe);
  await expect(rows(page).first().locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.x)).toBeUndefined();
  await expect(rows(page).nth(1)).toContainText('當日已完成主課表');
  await expect(rows(page).nth(1)).toContainText('阻力標記：紅帶');
  expect(await rawMain(page), '查看歷史不應存檔或更改 XP').toBe(before);
});

test('近 28 天與全部範圍、10 筆起始和每次再看 20 筆', async ({ page }) => {
  const recent = [report('2026-09-22', `${PUSH} 第1組`, 1),
    ...Array.from({ length: 29 }, (_, i) => report('2026-10-19', `${PUSH} 第${i + 1}組`, i + 2, { actual: i }))];
  const old = Array.from({ length: 5 }, (_, i) => report('2026-09-21', `${PUSH} 第${i + 1}組`, i + 31));
  await openApp(page, { now: NOW, seed: seedState(fixture([...old, ...recent])) });
  await gotoTab(page, 's-hist');
  await expect(rows(page)).toHaveCount(10);
  await expect(page.locator('#hist-feedback-count')).toHaveText('顯示 10／30 組回報');
  await expect(rows(page).first()).toContainText('第29組');
  await page.locator('#hist-feedback-more').click();
  await expect(rows(page)).toHaveCount(30);
  await expect(rows(page).last()).toHaveAttribute('data-date', '2026-09-22');
  await expect(page.locator('#hist-feedback-more')).toBeHidden();
  await page.locator('#hist-feedback-range').selectOption('all');
  await expect(rows(page)).toHaveCount(10);
  await expect(page.locator('#hist-feedback-count')).toHaveText('顯示 10／35 組回報');
  await page.locator('#hist-feedback-more').click();
  await expect(rows(page)).toHaveCount(30);
  await page.locator('#hist-feedback-more').click();
  await expect(rows(page)).toHaveCount(35);
  await expect(rows(page).last()).toHaveAttribute('data-date', '2026-09-21');
  await expect(page.locator('#hist-feedback-more')).toBeHidden();
});

test('訓練進行中共用守門拒絕打開歷史，畫面與 checkpoint 保持原狀', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(fixture([])) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  await expect(page.locator('#train')).toHaveClass(/active/);
  const before = await page.evaluate(() => localStorage.getItem('daily-ten-active-workout'));
  const opened = await page.evaluate(async () => {
    const { openFeedbackHistory } = await import('/js/ui/feedback-history.js');
    return openFeedbackHistory('伏地挺身');
  });
  expect(opened).toBe(false);
  await expect(page.locator('#train')).toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('daily-ten-active-workout'))).toBe(before);
});
