import { test, expect, openApp, readFixture, seedState, storedState, tick, waitReady } from './helpers.js';

test('回報一組會暫停並保存實際次數；重載後仍保留，疼痛則立即停止且不給 XP', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip'); // 預備
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await tick(page, 3);
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await expect(page.locator('#t-pause')).toBeHidden();
  await expect(page.locator('#t-skip')).toBeHidden();
  await expect(page.locator('#t-abort')).toBeVisible();
  await expect(page.locator('#t-actual')).toHaveValue('1');
  await tick(page, 6);
  await expect(page.locator('#t-count')).toContainText('1/');
  await page.locator('#t-actual').fill('1');
  await page.locator('#t-effort').selectOption('hard');
  await page.locator('#t-form').selectOption('no');
  await page.locator('#t-pain').selectOption('yes');
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#done')).toHaveClass(/active/);
  await expect(page.locator('#d-identity')).toHaveText('已因疼痛停止訓練');
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
  expect(after.game.trainingFeedback.at(-1)).toMatchObject({ name: '貓牛式', actual: 1, effort: 'hard', pain: true, form: false });
  expect(await page.evaluate(() => localStorage.getItem('daily-ten-active-workout'))).toBeNull();
  await page.reload();
  await waitReady(page);
  const restored = await storedState(page);
  expect(restored.game.trainingFeedback).toEqual(after.game.trainingFeedback);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
});

test('姿勢不穩也安全結束，不會把本次算成已完成', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip');
  await page.click('#t-feedback-open');
  await page.locator('#t-form').selectOption('no');
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#d-identity')).toHaveText('已因姿勢不穩停止訓練');
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
  expect(after.game.trainingFeedback.at(-1).form).toBe(false);
});

test('疼痛或姿勢不穩的近七日回報會擋住強度升級', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const result = await page.evaluate(async () => {
    const { getState } = await import('/js/state/store.js');
    const { levelUpEligible, weeklyStrengthEvidence } = await import('/js/ui/session.js');
    const { dateOffset } = await import('/js/ui/dates.js');
    const { todayKey } = await import('/js/ui/game.js');
    const s = getState();
    s.level = 3;
    const today=todayKey();
    s.sessions = Array.from({ length: 7 }, (_,i) => ({ date:dateOffset(today,-i), type:'full', xp:10 }));
    s.prs.hrp = [{ date:today, reps:12 }];
    const before=levelUpEligible();
    const names=['伏地挺身 第1組','伏地挺身 第2組','彈力帶划船 第1組','彈力帶划船 第2組',
      '分腿蹲 第1組 · 左','分腿蹲 第2組 · 左','臀橋 第1組','臀橋 第2組'];
    s.game.trainingFeedback=[today,dateOffset(today,-3)].flatMap((date,day)=>names.map((name,index)=>({
      id:`run-${day}-${index}`,date,name,target:10,actual:10,effort:'okay',pain:false,form:true
    })));
    const complete=levelUpEligible();
    const evidence=weeklyStrengthEvidence(s,today);
    s.game.trainingFeedback=s.game.trainingFeedback.filter(f=>!f.name.startsWith('彈力帶划船'));
    const missingPull=levelUpEligible();
    s.game.trainingFeedback.push(...[today,dateOffset(today,-3)].flatMap((date,day)=>[1,2].map(set=>({
      id:`bodyweight-${day}-${set}`,date,name:`超人式划船 第${set}組`,target:10,actual:10,
      effort:'okay',pain:false,form:true
    }))));
    const bodyweightPull=levelUpEligible();
    s.game.trainingFeedback.push({id:'unsafe',date:today,name:'深蹲 第1組',target:12,actual:12,effort:'okay',pain:false,form:false});
    const badForm = levelUpEligible();
    s.game.trainingFeedback.at(-1).form = true;
    s.game.trainingFeedback.at(-1).pain = true;
    const pain = levelUpEligible();
    return { before, complete, evidence, missingPull, bodyweightPull, badForm, pain };
  });
  expect(result.before).toBe(false);
  expect(result.complete).toBe(true);
  expect(Object.values(result.evidence).map(v=>v.days)).toEqual([2,2,2,2]);
  expect(result.missingPull).toBe(false);
  expect(result.bodyweightPull).toBe(false);
  expect(result.badForm).toBe(false);
  expect(result.pain).toBe(false);
});

test('無疼痛回報後進入下一步，刷新只恢復進度而不提前給 XP', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip');
  await page.click('#t-feedback-open');
  await page.locator('#t-actual').fill('4');
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#t-name')).not.toHaveText('貓牛式');
  const during = await storedState(page);
  expect(during.sessions).toEqual(before.sessions);
  expect(during.game.trainingFeedback.at(-1)).toMatchObject({ actual: 4, pain: false, form: true });
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#train')).toHaveClass(/active/);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await storedState(page)).game.trainingFeedback).toEqual(during.game.trainingFeedback);
  const count = during.game.trainingFeedback.length;
  await page.evaluate(async entry => {
    const { recordSetFeedback } = await import('/js/ui/session.js');
    await recordSetFeedback({ ...entry, actual: 5 });
  }, during.game.trainingFeedback.at(-1));
  const updated = await storedState(page);
  expect(updated.game.trainingFeedback).toHaveLength(count);
  expect(updated.game.trainingFeedback.at(-1).actual).toBe(5);
});
