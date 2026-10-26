import { test, expect, readRepo, openApp } from './helpers.js';

const NAME = 'QA 往返測試';
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const DURATIONS = [140, 140, 140, 140, 140, 140, 140, 140, 140, 140, 150, 150, 150, 150];

function syntheticSheet() {
  const cells = Array.from({ length: 8 }, (_, i) => {
    const x = i % 4 * 200, y = Math.floor(i / 4) * 200;
    return `<rect x="${x}" y="${y}" width="200" height="200" fill="hsl(${i * 40} 80% 70%)"/>`;
  }).join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">${cells}</svg>`)}`;
}

test('8 張 4×2 來源圖往返 14 步精確 2 秒，拖曳、慢速、暫停、重播及清理正常', async ({ page }) => {
  test.setTimeout(60_000);
  const source = readRepo('js/ui/exercise-media.js');
  const marker = 'export const EXERCISE_STORYBOARDS = Object.freeze([';
  expect(source).toContain(marker);
  const fixture = `Object.freeze({names:Object.freeze([${JSON.stringify(NAME)}]),src:${JSON.stringify(syntheticSheet())},columns:4,frames:8,playbackOrder:Object.freeze(${JSON.stringify(ORDER)}),frameMs:Object.freeze(${JSON.stringify(DURATIONS)})}),`;
  await page.route('**/js/ui/exercise-media.js', route => route.fulfill({
    contentType: 'text/javascript', body: source.replace(marker, `${marker}${fixture}`)
  }));
  await openApp(page);
  await page.evaluate(async name => {
    const { mountExerciseVideo } = await import('/js/ui/exercise-media.js');
    const host = document.createElement('div');
    host.id = 'qa-ordered-storyboard';
    host.style.width = '200px';
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.zIndex = '10000';
    host.style.background = 'white';
    document.body.append(host);
    window.__qaStoryboardController = mountExerciseVideo(host, name);
  }, NAME);
  const host = page.locator('#qa-ordered-storyboard');
  const frame = host.getByRole('img', { name: `${NAME} 8 張姿勢／往返播放 14 步`, exact: true });
  const scrub = host.getByRole('slider', { name: '逐格查看動作' });
  await expect(frame).toBeVisible();
  await expect(host).toContainText('8 張姿勢／往返播放 14 步');
  await expect(host).not.toContainText('16 格');
  await expect(frame).toHaveCSS('background-size', '400% 200%');
  await expect(scrub).toHaveAttribute('max', '7');
  const bounds = await frame.boundingBox();
  expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
  expect(DURATIONS.reduce((sum, n) => sum + n, 0)).toBe(2000);

  for (let i = 0; i < ORDER.length; i++) {
    await expect(scrub).toHaveValue(String(ORDER[i]));
    await page.clock.runFor(DURATIONS[i]);
  }
  await expect(scrub).toHaveValue('0');

  await host.getByRole('button', { name: '暫停影格' }).click();
  await page.clock.runFor(500);
  await expect(scrub).toHaveValue('0');
  await host.getByRole('button', { name: '慢速 0.5×' }).click();
  await host.getByRole('button', { name: '播放影格' }).click();
  await page.clock.runFor(DURATIONS[0] * 2 - 1);
  await expect(scrub).toHaveValue('0');
  await page.clock.runFor(1);
  await expect(scrub).toHaveValue('1');

  await scrub.fill('7');
  await expect(host.getByRole('button', { name: '播放影格' })).toBeVisible();
  await expect(frame).toHaveCSS('background-position', '100% 100%');
  await host.getByRole('button', { name: '從頭重播' }).click();
  await expect(scrub).toHaveValue('0');
  await host.getByRole('button', { name: '播放影格' }).click();
  await page.clock.runFor(DURATIONS[0] * 2);
  await expect(scrub).toHaveValue('1');
  await page.evaluate(() => window.__qaStoryboardController.stop());
  await expect(host.locator('.exercise-storyboard')).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(host).toBeEmpty();
});
