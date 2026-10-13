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

test('週計畫有推、下肢、拉各兩次刺激與恢復日，且預設不靠門錨或跳躍', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const P = await import('/js/ui/program.js');
    const store = await import('/js/state/store.js');
    const state = store.getState();
    const text = [];
    const friday = [];
    for (const band of [false, true]) {
      state.settings.band = band;
      for (let lv = 1; lv <= 5; lv++) {
        for (const mob of ['A', 'B', 'C']) text.push(JSON.stringify(P.fullSeq(lv, mob)));
        for (const block of ['shoulder', 'lower', 'pull', 'lowerPull']) text.push(JSON.stringify(P.blockSeq(block, lv)));
        for (const plan of P.WEEK) {
          text.push(JSON.stringify(P.planSeq(plan, lv)));
        }
        friday.push(P.planSeq(P.WEEK[5], lv).map(step => step.name));
      }
    }
    return {
      blocks: P.WEEK.map((d) => d.block),
      restDays: P.WEEK.filter((d) => d.type === 'rest').length,
      text: text.join('\n'),
      friday,
      rain: P.rainSeq()
    };
  });
  expect(result.restDays).toBe(1);
  expect(result.blocks.filter((x) => x === 'pull')).toHaveLength(1);
  expect(result.blocks.filter((x) => x === 'lower')).toHaveLength(1);
  expect(result.blocks.filter((x) => x === 'lowerPull')).toHaveLength(1);
  expect(result.blocks.filter((x) => x === 'shoulder')).toHaveLength(2);
  for (const seq of result.friday) {
    expect(seq.some(name => name.startsWith('分腿蹲'))).toBe(true);
    expect(seq.some(name => name.startsWith('臀橋'))).toBe(true);
    expect(seq.some(name => name.includes('划船'))).toBe(true);
  }
  expect(result.text).not.toMatch(/門把|門縫|高處固定|靠牆|Wall |wall handstand/i);
  expect(result.text).not.toMatch(/深蹲跳|假直立伏地挺身|臀橋走步|派克撐體/);
  expect(result.rain).toHaveLength(20);
  expect(result.rain.map(step => step.name).join(' ')).not.toMatch(/波比跳|開合跳|跳躍/);
  expect(result.rain.filter(step => step.name.startsWith('原地快走'))).toHaveLength(5);
  expect(result.rain.filter(step => step.name.startsWith('側步開合'))).toHaveLength(5);
});
