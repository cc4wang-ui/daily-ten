/* Bilateral holds, recovery group changes, and next-movement navigation.
   The regular trainer's generic pause/reload behavior is covered elsewhere. */
import { test, expect, openApp, readFixture, seedState, gotoTab, tick, waitReady } from './helpers.js';

const fixture = ({ level = 2, voice = true, band = true } = {}) => {
  const state = JSON.parse(readFixture('v3.json'));
  state.level = level;
  state.settings.voice = voice;
  state.settings.beep = false;
  state.settings.band = band;
  return JSON.stringify(state);
};
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
const switches = page => page.evaluate(() => window.__qaSpoken.filter(text => text.includes('換另一側')));
async function captureSpeech(page) {
  await page.addInitScript(() => {
    window.__qaSpoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, speak(utterance) { window.__qaSpoken.push(utterance.text); }
    } });
  });
}
async function seek(page, name) {
  for (let i = 0; i < 65; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.click('#t-skip');
  }
  throw new Error(`Cannot find workout step ${name}`);
}
async function seekFinalStep(page) {
  for (let i = 0; i < 65; i++) {
    const c = await checkpoint(page);
    if (c.idx === c.seq.length - 1) return;
    await page.click('#t-skip');
  }
  throw new Error('Cannot find final workout step');
}

for (const { date, name } of [
  { date: '2026-10-19', name: '鴿式' },
  { date: '2026-10-20', name: '嬰兒式側伸展' },
  { date: '2026-10-21', name: '躺姿脊椎扭轉' }
]) {
  test(`${name}：只在有效訓練時間中點換側，畫面與語音各提示一次`, async ({ page }) => {
    await captureSpeech(page);
    await openApp(page, { now: `${date}T15:30:00+09:00`, seed: seedState(fixture()) });
    await gotoTab(page, 's-train');
    await page.click('#tr-start');
    await seek(page, name);
    const c = await checkpoint(page);
    expect(c.seq[c.idx]).toMatchObject({ name, mode: 'time', secs: 30 });
    await expect(page.locator('#t-sub')).toContainText('第一側');
    await page.evaluate(() => { window.__qaSpoken.length = 0; });
    await tick(page, 14);
    await expect(page.locator('#t-count')).toHaveText('16');
    await expect(page.locator('#t-sub')).toContainText('第一側');
    expect(await switches(page)).toEqual([]);
    await tick(page, 1);
    await expect(page.locator('#t-count')).toHaveText('15');
    await expect(page.locator('#t-sub')).toContainText('第二側');
    expect(await switches(page)).toEqual(['換另一側']);
    await tick(page, 3);
    expect(await switches(page)).toEqual(['換另一側']);
  });
}

test('普通平板計時沒有換側提示；雙側求助、暫停與重載不偷跑或重播換側', async ({ page }) => {
  await captureSpeech(page);
  await openApp(page, { now: '2026-10-19T15:30:00+09:00', seed: seedState(fixture()) });
  await page.click('#h-minimal');
  await seek(page, '平板支撐');
  await page.evaluate(() => { window.__qaSpoken.length = 0; });
  await tick(page, 15);
  await expect(page.locator('#t-count')).toHaveText('15');
  await expect(page.locator('#t-sub')).not.toContainText(/第一側|第二側/);
  expect(await switches(page)).toEqual([]);
  await page.click('#t-abort');
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await seek(page, '鴿式');
  await tick(page, 8);
  await expect(page.locator('#t-count')).toHaveText('22');
  await expect(page.locator('#t-sub')).toContainText('第一側');
  await page.evaluate(() => { window.__qaSpoken.length = 0; });
  await page.click('#t-show-demo');
  await tick(page, 20);
  await expect(page.locator('#t-count')).toHaveText('22');
  expect(await switches(page)).toEqual([]);
  await page.click('#dm-close');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('鴿式');
  await expect(page.locator('#t-count')).toHaveText('22');
  await expect(page.locator('#t-sub')).toContainText('第一側');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect(await switches(page)).toEqual([]);
  await tick(page, 5);
  await expect(page.locator('#t-count')).toHaveText('22');
  await page.click('#t-pause');
  await tick(page, 7);
  await expect(page.locator('#t-count')).toHaveText('15');
  await expect(page.locator('#t-sub')).toContainText('第二側');
  expect(await switches(page)).toEqual(['換另一側']);
  await page.click('#t-pause');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('鴿式');
  await expect(page.locator('#t-count')).toHaveText('15');
  await expect(page.locator('#t-sub')).toContainText('第二側');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect(await switches(page)).toEqual([]);
  await page.click('#t-show-demo');
  await tick(page, 20);
  await page.click('#dm-close');
  await expect(page.locator('#t-count')).toHaveText('15');
  expect(await switches(page)).toEqual([]);
  await page.click('#t-pause');
  await tick(page, 1);
  await expect(page.locator('#t-count')).toHaveText('14');
  expect(await switches(page)).toEqual([]);
});

test('恢復日兩個換組恰為 15 秒，估時等於實際序列秒數', async ({ page }) => {
  await openApp(page, { now: '2026-10-24T15:30:00+09:00', seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  const planMeta = await page.locator('#tr-plan-meta').textContent();
  await page.click('#tr-start');
  const seq = (await checkpoint(page)).seq;
  const changes = seq.flatMap((step, i) => step.name === '換組' ? [i] : []);
  expect(changes).toHaveLength(2);
  for (const index of changes) {
    expect(seq[index].secs).toBe(15);
    expect(seq[index - 1].name).not.toBe('準備');
    expect(seq[index + 1].name).not.toBe('準備');
  }
  const durations = await page.evaluate(async () => {
    const p = await import('/js/ui/program.js');
    const raw = p.restSeq(2);
    return { estimated: p.estSec(raw), seq: p.addTransitions(raw) };
  });
  expect(seq).toEqual(durations.seq);
  expect(durations.estimated).toBe(seq.reduce((sum, step) => sum + (step.mode === 'time' ? step.secs : step.reps * step.tempo), 0));
  expect(planMeta).toContain(`約 ${Math.round(durations.estimated / 60)} 分`);
});

test('下一動作跨過準備與休息；末尾休息提示完成', async ({ page }) => {
  await openApp(page, { now: '2026-10-19T15:30:00+09:00', seed: seedState(fixture()) });
  await page.click('#h-minimal');
  await seek(page, '貓牛式');
  await expect(page.locator('#t-next')).toHaveText('下一個：90/90 髖旋轉 · 左（先準備 8 秒）');
  await page.click('#t-abort');
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await seek(page, '彈力帶肩上推 第2組');
  await expect(page.locator('#t-next')).toHaveText('下一個：彈力帶側平舉（先組間休息 60 秒）');
  await page.click('#t-abort');
  await page.clock.pauseAt(new Date('2026-10-23T15:30:00+09:00'));
  await gotoTab(page, 's-home');
  await expect(page.locator('#h-date')).toHaveText('週五 10/23');
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  const friday = (await checkpoint(page)).seq;
  expect(friday.at(-2).name).toBe('彈力帶划船 第2組');
  expect(friday.at(-1)).toMatchObject({ name: '組間休息', secs: 60 });
  await seek(page, friday.at(-2).name);
  await expect(page.locator('#t-next')).toHaveText('最後一個動作 · 接著組間休息 60 秒，然後完成');
  await seekFinalStep(page);
  await expect(page.locator('#t-name')).toHaveText('組間休息');
  await expect(page.locator('#t-next')).toHaveText('接下來：完成訓練');
});
