/* 換動作（2026-11-08）：每個健身房動作與伸展項目都能換，至少 3 個備用選項；
   換完寫進 state，重整後還在；休息中換動作不影響倒數；伸展引導改 deadline 制（S1）。
   只透過畫面操作；時間用 page.clock（helpers 的 tick）。 */
import { test, expect, openApp, gotoTab, tick, liveV4, storedState, NOW_ISO } from './helpers.js';

const NOW = NOW_ISO;

async function openGym(page) {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
}
async function startSession(page) {
  await openGym(page);
  await page.click('#gym-start');
  await expect(page.locator('#session')).toBeVisible();
}
/* 勾第 ei 個動作的第一組（先填數字再勾） */
async function checkSet(page, ei, weight = '20', reps = '8') {
  const card = page.locator('#session .ex').nth(ei);
  const row = card.locator('tr[data-si]').first();
  await row.locator('input[data-k=weight]').fill(weight);
  await row.locator('input[data-k=reps]').fill(reps);
  await row.locator('.ok').click();
}

test('伸展清單換項目：三個備用選項、換完顯示已替換、重整後還在、能換回來', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  const row = page.locator('#stretch-body .row').first();
  await expect(row).toContainText('貓牛式');
  await row.locator('[data-st-swap]').click();
  const panel = page.locator('#stretch-body .swap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.swap-opt[data-alt]')).toHaveCount(3);
  await expect(panel).toContainText('坐姿貓牛式');
  await expect(panel).toContainText('站姿貓牛式');
  await expect(panel).toContainText('四足跪姿脊椎波浪');
  await panel.locator('.swap-opt[data-alt="seated-cat-cow"]').click();
  await expect(page.locator('#stretch-body .row').first()).toContainText('坐姿貓牛式');
  await expect(page.locator('#stretch-body .row').first()).toContainText('已替換');
  const v4 = await liveV4(page);
  expect(v4.stretch.swaps).toEqual({ 'cat-cow': 'seated-cat-cow' });
  // 重整：換完的項目還在
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await gotoTab(page, 's-stretch');
  await expect(page.locator('#stretch-body .row').first()).toContainText('坐姿貓牛式');
  // 換回原項目
  await page.locator('#stretch-body .row').first().locator('[data-st-swap]').click();
  await page.locator('#stretch-body .swap-opt[data-restore]').click();
  await expect(page.locator('#stretch-body .row').first()).toContainText('貓牛式');
  expect((await liveV4(page)).stretch.swaps).toEqual({});
});

test('伸展引導換動作：只換做什麼、不換做多久；S1 節流模擬跟上真實時間', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-start-full');
  await expect(page.locator('#guide')).toBeVisible();
  const count = page.locator('#guide .count');
  await expect(count).toHaveText('1:30');
  await tick(page, 5);
  await expect(count).toHaveText('1:25');
  // 引導中換動作：剩餘秒數不變
  await page.click('#g-swap');
  const panel = page.locator('#guide .swap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.swap-opt[data-alt]')).toHaveCount(3);
  await panel.locator('.swap-opt[data-alt="standing-cat-cow"]').click();
  await expect(page.locator('#guide h2')).toHaveText('站姿貓牛式');
  await expect(count).toHaveText('1:25');
  await tick(page, 5);
  await expect(count).toHaveText('1:20');
  // S1：假時鐘一次跳 60 秒、只觸發一次 tick——舊的 -1 累加會顯示 1:19，deadline 制顯示 0:20
  await page.clock.fastForward(60000);
  await expect(count).toHaveText('0:20');
  await expect(page.locator('#guide .timer')).toHaveText('剩 13:50');
});

test('健身房課表預覽換動作：換完下次開課就用備用動作', async ({ page }) => {
  await openGym(page);
  const row = page.locator('#gym-body .row').first();
  await expect(row).toContainText('上斜臥推');
  await row.locator('[data-list-swap]').click();
  const panel = page.locator('#gym-body .swap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.swap-opt[data-alt]')).toHaveCount(3);
  await panel.locator('.swap-opt[data-alt="incline-machine-press"]').click();
  await expect(page.locator('#gym-body .row').first()).toContainText('上斜器械推胸');
  await expect(page.locator('#gym-body .row').first()).toContainText('已替換');
  expect((await liveV4(page)).gym.swaps).toEqual({ 'incline-db-press': 'incline-machine-press' });
  await page.click('#gym-start');
  await expect(page.locator('#session')).toBeVisible();
  const first = page.locator('#session .ex').first();
  await expect(first.locator('.name')).toContainText('上斜器械推胸');
  await expect(first.locator('.name')).toContainText('已替換');
});

test('健身房進行中換動作：換完寫進 draft、重整後還在、能換回來', async ({ page }) => {
  await startSession(page);
  const card = page.locator('#session .ex').nth(1); // 平板臥推
  await expect(card.locator('.name')).toContainText('平板臥推');
  await card.locator('[data-swap]').click();
  const panel = page.locator('#session .swap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.swap-opt[data-alt]')).toHaveCount(3);
  await panel.locator('.swap-opt[data-alt="dumbbell-bench-press"]').click();
  await expect(card.locator('.name')).toContainText('啞鈴臥推');
  await expect(card.locator('.name')).toContainText('已替換');
  const v4 = await liveV4(page);
  expect(v4.gym.swaps).toEqual({ 'bench-press': 'dumbbell-bench-press' });
  expect(v4.gym.draft.exercises[1].id).toBe('dumbbell-bench-press');
  expect(v4.gym.draft.exercises[1].swappedFrom).toBe('bench-press');
  // 重整再回來：還是換完的動作
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.click('#gym-resume');
  await expect(page.locator('#session .ex').nth(1).locator('.name')).toContainText('啞鈴臥推');
  // 換回原動作
  await page.locator('#session .ex').nth(1).locator('[data-swap]').click();
  await page.locator('#session .swap-opt[data-restore]').click();
  await expect(page.locator('#session .ex').nth(1).locator('.name')).toContainText('平板臥推');
  expect((await liveV4(page)).gym.swaps).toEqual({});
});

test('休息中換動作：倒數不消失、時間正確、備用清單點得到（S2）', async ({ page }) => {
  await startSession(page);
  await checkSet(page, 0); // 複合動作 → 休息 2:30
  const t = page.locator('#rest-t');
  await expect(t).toHaveText('2:30');
  await tick(page, 5);
  await expect(t).toHaveText('2:25');
  // 換最後一個動作（三頭伸展）：清單在課表最下方，#rest 底部 bar 不能蓋住它
  const card = page.locator('#session .ex').nth(6);
  await card.locator('[data-swap]').click();
  const panel = page.locator('#session .swap-panel');
  await expect(panel).toBeVisible();
  await expect(t).toHaveText('2:25');
  await panel.locator('.swap-opt[data-alt="rope-pushdown"]').click();
  await expect(page.locator('#session .ex').nth(6).locator('.name')).toContainText('繩索下壓');
  await expect(page.locator('#rest')).toBeVisible();
  await expect(t).toHaveText('2:25');
  await tick(page, 5);
  await expect(t).toHaveText('2:20');
  expect((await liveV4(page)).gym.draft.rest.total).toBe(150);
});

test('已完成組數的動作要換：先問一次，答應才換、組數清掉', async ({ page }) => {
  await startSession(page);
  await checkSet(page, 0); // 上斜臥推第一組完成 → 也會開始休息
  await expect(page.locator('#rest')).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.locator('#session .ex').nth(0).locator('[data-swap]').click();
  await page.locator('#session .swap-opt[data-alt="incline-barbell-press"]').click();
  const card = page.locator('#session .ex').nth(0);
  await expect(card.locator('.name')).toContainText('上斜槓鈴臥推');
  const v4 = await liveV4(page);
  expect(v4.gym.draft.exercises[0].sets.filter((s) => s.done).length).toBe(0);
});

test('換過動作的課能完成：備用動作的組數照算、紀錄寫備用動作', async ({ page }) => {
  await startSession(page);
  await page.locator('#session .ex').nth(1).locator('[data-swap]').click();
  await page.locator('#session .swap-opt[data-alt="machine-chest-press"]').click();
  // 7 個動作各勾 1 組（達 partial 門檻），再按完成
  for (let ei = 0; ei < 7; ei++) await checkSet(page, ei);
  await page.click('#ss-finish');
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheet')).toContainText('完成');
  await page.click('#gs-ok');
  const st = await storedState(page);
  const session = st.v4.gym.sessions[0];
  expect(session.exercises[1].id).toBe('machine-chest-press');
  expect(session.exercises[1].name).toBe('器械推胸');
});

test('伸展引導暫停中略過：顯示立刻是新項目、最後一項紀錄秒數正確（B1 迴歸）', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-start-short');
  const count = page.locator('#guide .count');
  await tick(page, 5);
  await expect(count).toHaveText('0:55');
  // 暫停中略過：顯示應立刻是新項目的秒數（舊碼 B1：停在 0:55／剩 4:55）
  await page.click('#g-pause');
  await page.click('#g-skip');
  await expect(page.locator('#guide .step')).toContainText('第 2 / 5 項');
  await expect(count).toHaveText('1:00');
  await expect(page.locator('#guide .timer')).toHaveText('剩 4:00');
  await page.click('#g-pause');
  await expect(count).toHaveText('1:00');
  await tick(page, 5);
  await expect(count).toHaveText('0:55');
  // 略過到最後一項，再跑 5 秒、暫停中略過結束：紀錄應為完整 300 秒（舊碼 B1：245 秒）
  for (let i = 0; i < 3; i++) await page.click('#g-skip');
  await tick(page, 5);
  await expect(count).toHaveText('0:55');
  await page.click('#g-pause');
  await page.click('#g-skip');
  await expect(page.locator('#guide')).toBeHidden();
  const st = await storedState(page);
  expect(st.v4.stretch.log[0].seconds).toBe(300);
});

test('全部換回：一次清掉健身房＋伸展的全部對應、取消不動、重整後仍是換回來的（O1）', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-reset-swaps')).toHaveCount(0);
  await page.locator('#gym-body .row').first().locator('[data-list-swap]').click();
  await page.locator('#gym-body .swap-opt[data-alt="incline-machine-press"]').click();
  await expect(page.locator('#gym-reset-swaps')).toBeVisible();
  await gotoTab(page, 's-stretch');
  await page.locator('#stretch-body .row').first().locator('[data-st-swap]').click();
  await page.locator('#stretch-body .swap-opt[data-alt="seated-cat-cow"]').click();
  expect((await liveV4(page)).gym.swaps).toEqual({ 'incline-db-press': 'incline-machine-press' });
  expect((await liveV4(page)).stretch.swaps).toEqual({ 'cat-cow': 'seated-cat-cow' });
  await expect(page.locator('#st-reset-swaps')).toBeVisible();
  // toast（「已換成…」2.5 秒）浮在分頁列上方，會蓋住頁底的重置按鈕——等它收起再點（全站既有的暫時遮蓋，不是 O1 引入的）
  await tick(page, 3);
  await expect(page.locator('#toast')).toBeHidden();
  // 取消＝什麼都不變
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#st-reset-swaps').click();
  expect((await liveV4(page)).gym.swaps).toEqual({ 'incline-db-press': 'incline-machine-press' });
  expect((await liveV4(page)).stretch.swaps).toEqual({ 'cat-cow': 'seated-cat-cow' });
  // 答應＝全部清掉，標籤消失、按鈕消失
  page.once('dialog', (d) => d.accept());
  await page.locator('#st-reset-swaps').click();
  expect((await liveV4(page)).gym.swaps).toEqual({});
  expect((await liveV4(page)).stretch.swaps).toEqual({});
  await expect(page.locator('#stretch-body .row').first()).toContainText('貓牛式');
  await expect(page.locator('#stretch-body .row').first()).not.toContainText('已替換');
  await expect(page.locator('#st-reset-swaps')).toHaveCount(0);
  // 重整後仍是換回來的（健身房那邊也一樣）
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body .row').first()).toContainText('上斜臥推');
  await expect(page.locator('#gym-body .row').first()).not.toContainText('已替換');
  await expect(page.locator('#gym-reset-swaps')).toHaveCount(0);
  expect((await liveV4(page)).gym.swaps).toEqual({});
});
