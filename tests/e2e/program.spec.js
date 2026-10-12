import { test, expect, openApp } from './helpers.js';

test('課表秒數完全由動作、節奏、休息、準備與換器材相加', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const P = await import('/js/ui/program.js');
    const store = await import('/js/state/store.js');
    const state = store.getState();
    const cases = [];
    for (const band of [false, true]) {
      state.settings.band = band;
      for (let lv = 1; lv <= 5; lv++) {
        for (const plan of P.WEEK) {
          const seq = P.planSeq(plan, lv);
          const timed = P.addTransitions(seq);
          const manual = timed.reduce((sum, step) => sum
            + (step.mode === 'time' ? step.secs : step.reps * step.tempo), 0);
          cases.push({ band, lv, seconds: P.estSec(seq), manual, timed });
        }
      }
    }
    return cases;
  });
  expect(result).toHaveLength(70);
  for (const item of result) {
    expect(item.seconds).toBe(item.manual);
    expect(item.timed.every((s) => s.mode === 'time'
      ? Number.isFinite(s.secs) && s.secs > 0
      : Number.isFinite(s.reps) && s.reps > 0 && Number.isFinite(s.tempo) && s.tempo > 0)).toBe(true);
  }
  expect(result.some((x) => x.band && x.timed.some((s) => s.name === '換器材'))).toBe(true);
});

test('週計畫有恢復日、推拉各兩次重點日，且所有版本不依賴門錨或牆', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const P = await import('/js/ui/program.js');
    const store = await import('/js/state/store.js');
    const state = store.getState();
    const text = [];
    const missingDemo = new Set();
    for (const band of [false, true]) {
      state.settings.band = band;
      for (let lv = 1; lv <= 5; lv++) {
        for (const mob of ['A', 'B', 'C']) text.push(JSON.stringify(P.fullSeq(lv, mob)));
        for (const block of ['shoulder', 'lower', 'pull']) text.push(JSON.stringify(P.blockSeq(block, lv)));
        for (const plan of P.WEEK) {
          for (const step of P.addTransitions(P.planSeq(plan, lv))) {
            if (!['預備', '準備', '換器材', '組間休息', '換組', '休息'].includes(step.name)
              && !window.DT_DEMOS.keyFor(step.name)) missingDemo.add(step.name);
          }
        }
      }
    }
    return {
      blocks: P.WEEK.map((d) => d.block),
      restDays: P.WEEK.filter((d) => d.type === 'rest').length,
      text: text.join('\n'),
      missingDemo: [...missingDemo]
    };
  });
  expect(result.restDays).toBe(1);
  expect(result.blocks.filter((x) => x === 'pull')).toHaveLength(2);
  expect(result.blocks.filter((x) => x === 'lower')).toHaveLength(1);
  expect(result.blocks.filter((x) => x === 'shoulder')).toHaveLength(2);
  expect(result.text).not.toMatch(/門把|門縫|高處固定|靠牆|Wall |wall handstand/i);
  // A missing demo is surfaced as skippable in training. Never map these
  // different movements to a misleading existing animation.
  expect(new Set(result.missingDemo)).toEqual(new Set([
    '俯臥半程雪天使', '派克撐體', '深蹲靜態停留', '臀橋走步', '彈力帶划船 · 俯身'
  ]));
});
