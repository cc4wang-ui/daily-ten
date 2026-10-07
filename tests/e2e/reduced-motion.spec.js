/* qa-checker：動態與 prefers-reduced-motion（CLAUDE.md §2 原則 9；qa-checker 清單 #7）。
   V1 起有三種動態：三環掃入（.ring-arc.sweep：rotate＋opacity 600 ms）、復原 toast 出現（.toast.in：translateY＋opacity 200 ms）、
   「已更新」提示淡入淡出（Element.animate、只有 opacity；auto-update.spec 另外驗 reduce 時完全不播）。
   1. 靜態：CSS 的 @keyframes 只動 transform／opacity；transition 只列 transform／opacity；JS 的 Element.animate 關鍵影格只有 opacity／transform。
   2. 執行（早安打卡 → toast；回今日 → 三環掃入）：no-preference → 每個動畫的關鍵影格只含 transform／opacity；
      reduce → 只含 opacity（淡入），沒有任何位移或旋轉。
   3. 訓練畫面（#train）蓋上來時，三環與 toast 的動畫一律暫停（animation-play-state: paused）；示範動畫（demos.js 以 rAF 繪製）不受影響。
   4. M1 的資料保護元素（錯誤卡、匯入控制項、預覽）與啟動失敗卡仍沒有任何動畫或 transition（D27 起今日沒有備份提醒卡）。
   V2a 新增 Perfect Day 慶祝／升級卡（#cele，js/ui/celebrate.js）：遮罩淡入（fade-in）、卡片上移＋淡入（cele-pop）、彩帶落下（cf-fall，
   DOM 小片、不用 Canvas）。規則照舊只准 transform／opacity，另外要求：
   5. 靜態：cele-pop、cf-fall 存在且只動 transform／opacity；reduce 時卡片與彩帶改播 fade-in；訓練畫面蓋上來時 .cele 暫停；
      tokens.css 的出現時間 ≤ 1.5 秒、彩帶「落下＋最晚起跑」≤ 1.5 秒（§7 彩帶 ≤1.5 秒）。
   6. 執行：no-preference → 每個動畫只含 transform／opacity、全部在 1.5 秒內結束（沒有無限動畫）；
      reduce → 只有 fade-in、只有 opacity，卡片沒有位移（transform 計算值 none），彩帶是 .cf.still（靜止淡入）。 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, readFixture, readRepo, ROOT, openApp, seedState, gotoTab } from './helpers.js';

const ALLOWED = new Set(['transform', 'opacity']);
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* @keyframes 區塊（含巢狀大括號）→ { name, props[] } */
function keyframeBlocks(css) {
  const out = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    const body = css.slice(re.lastIndex, i - 1);
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
    out.push({ name: m[1], props: [...new Set(props)] });
    re.lastIndex = i;
  }
  return out;
}
function jsFiles(dir = 'js', out = []) {
  for (const ent of readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
    const rel = join(dir, ent.name);
    if (ent.isDirectory()) jsFiles(rel, out);
    else if (ent.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('靜態：@keyframes 只動 transform／opacity、transition 只列 transform／opacity、每個 animation 都有對應的 @keyframes；有 reduced-motion 與訓練中暫停的規則', () => {
  const problems = [];
  const names = new Set();
  let reduceBlock = '';
  for (const f of ['css/tokens.css', 'css/app.css']) {
    const css = stripComments(readRepo(f));
    for (const k of keyframeBlocks(css)) {
      names.add(k.name);
      const bad = k.props.filter((p) => !ALLOWED.has(p));
      if (bad.length) problems.push(`${f} @keyframes ${k.name}：${bad.join('、')}`);
    }
    for (const m of css.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      for (const part of m[1].split(',')) {
        const prop = part.trim().split(/\s+/)[0];
        if (prop !== 'none' && !ALLOWED.has(prop)) problems.push(`${f} transition：${part.trim()}`);
      }
    }
    for (const m of css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/g)) reduceBlock += m[1];
  }
  const css = stripComments(readRepo('css/app.css'));
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+/).find((t) => names.has(t) || /^[a-z][\w-]*$/.test(t) && !/^(var|both|forwards|backwards|none|infinite|linear|ease|ease-in|ease-out|ease-in-out|alternate|normal|reverse|paused|running)$/.test(t));
      if (name && !names.has(name) && !/^var\(/.test(name)) problems.push(`app.css animation 參照了不存在的 @keyframes：${name}`);
    }
  }
  expect(problems).toEqual([]);
  expect([...names].sort()).toEqual(expect.arrayContaining(['fade-in', 'ring-sweep', 'toast-in', 'cele-pop', 'cf-fall']));
  expect(keyframeBlocks(css).find((k) => k.name === 'fade-in').props).toEqual(['opacity']);
  /* V2a 慶祝：卡片上移＋淡入、彩帶落下＋旋轉＋淡出——只有 transform／opacity（上面的迴圈已擋其他屬性，這裡再確認有位移才需要 reduce 規則） */
  for (const k of ['cele-pop', 'cf-fall']) expect(keyframeBlocks(css).find((b) => b.name === k).props.sort()).toEqual(['opacity', 'transform']);
  expect(reduceBlock).toMatch(/\.cele\.in \.cele-card\s*\{\s*animation-name\s*:\s*fade-in/);
  expect(reduceBlock).toMatch(/\.cf\s*\{\s*animation-name\s*:\s*fade-in/);
  expect(css).toMatch(/body:has\(#train\.active\)\s*\.cele[^{]*\{[^}]*animation-play-state\s*:\s*paused/);
  /* 時間 token：出現 ≤ 1.5 秒；彩帶落下（每片 75–100%）＋最晚起跑 ≤ 1.5 秒 */
  const tokens = stripComments(readRepo('css/tokens.css'));
  const ms = (name) => { const m = new RegExp(`${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)(ms|s)`).exec(tokens); return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN; };
  expect(ms('--cele-in-ms')).toBeLessThanOrEqual(1500);
  expect(ms('--confetti-ms') + ms('--confetti-delay')).toBeLessThanOrEqual(1500);
  /* reduce：三環與 toast 改播 fade-in */
  expect(reduceBlock).toMatch(/\.ring-arc\.sweep/);
  expect(reduceBlock).toMatch(/\.toast\.in/);
  expect(reduceBlock).toMatch(/animation-name\s*:\s*fade-in/);
  /* 訓練畫面蓋上來時暫停 */
  expect(css).toMatch(/body:has\(#train\.active\)\s*\.ring-arc\.sweep[^{]*\{[^}]*animation-play-state\s*:\s*paused/);
  expect(css).toMatch(/body:has\(#train\.active\)[^{]*\.toast\.in[^{]*\{[^}]*animation-play-state\s*:\s*paused/);
  /* JS：Element.animate 只用在「已更新」提示（opacity），沒有寫死的 transition／位移動畫 */
  const animateUsers = [];
  for (const f of jsFiles()) {
    const src = readRepo(f);
    if (/\.animate\(/.test(src)) animateUsers.push(f);
    if (/style\.transition|transition\s*:/.test(src)) problems.push(`${f}：inline transition`);
  }
  expect(problems).toEqual([]);
  expect(animateUsers).toEqual(['js/ui/update.js']);
  expect(readRepo('js/ui/update.js')).not.toMatch(/transform|translate|left\s*:|top\s*:/);
});

/* 目前文件上的動畫：對象、名稱、關鍵影格的屬性、播放狀態 */
const animationReport = (page) => page.evaluate(() => document.getAnimations().map((a) => {
  const t = a.effect && a.effect.target;
  const props = new Set();
  for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) props.add(p);
  for (const meta of ['offset', 'computedOffset', 'easing', 'composite']) props.delete(meta);
  return {
    target: t ? (t.id || t.getAttribute('class') || t.tagName) : null,
    name: a.animationName || a.id || '',
    props: [...props].sort(),
    playState: a.playState
  };
}));

for (const mode of ['no-preference', 'reduce']) {
  test(`prefers-reduced-motion: ${mode} → 早安打卡的 toast 與三環掃入${mode === 'reduce' ? '只淡入（只有 opacity）' : '只動 transform／opacity'}；訓練畫面蓋上來時全部暫停`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode });
    await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(mode === 'reduce');
    /* 早安打卡 → toast 出現；回今日 → 眠的環掃入 */
    await page.click('#h-start');
    await page.click('#ci-wake');
    await expect(page.locator('#toast')).toBeVisible();
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-rings-svg .ring-arc.sweep')).toHaveCount(1);
    const anims = await animationReport(page);
    const names = anims.map((a) => a.name).sort();
    if (mode === 'reduce') {
      expect(names).toEqual(['fade-in', 'fade-in']);
      for (const a of anims) expect(a.props, `${a.target}：reduce 只淡入`).toEqual(['opacity']);
    } else {
      expect(names).toEqual(['ring-sweep', 'toast-in']);
      for (const a of anims) expect(a.props.every((p) => ['opacity', 'transform'].includes(p)), `${a.target}：${a.props}`).toBe(true);
    }
    /* reduce：元素本身也沒有位移（transform 計算值為 none） */
    if (mode === 'reduce') {
      const tf = await page.evaluate(() => ['#toast', '#h-rings-svg .ring-arc.sweep'].map((s) => getComputedStyle(document.querySelector(s)).transform));
      expect(tf).toEqual(['none', 'none']);
    }

    /* 訓練畫面蓋上來：三環與 toast 的動畫暫停 */
    await expect(page.locator('#h-start')).toHaveAttribute('data-kind', 'workout');
    await page.click('#h-start');
    await expect(page.locator('#train')).toHaveClass(/active/);
    const paused = await page.evaluate(() => ['#toast', '#h-rings-svg .ring-arc.sweep'].map((s) => getComputedStyle(document.querySelector(s)).animationPlayState));
    expect(paused).toEqual(['paused', 'paused']);
    const during = await animationReport(page);
    expect(during.length).toBe(2);
    for (const a of during) expect(a.playState, `${a.target} 訓練中`).toBe('paused');
    await page.click('#t-abort');
    await expect(page.locator('#train')).not.toHaveClass(/active/);
    /* 結束訓練：toast 的動畫恢復（今日重畫時數值沒變，三環不再掃一次） */
    await expect(page.locator('#toast')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('toast')).animationPlayState)).toBe('running');
    await expect(page.locator('#h-rings-svg .ring-arc.sweep')).toHaveCount(0);
  });
}

/* ---------- V2a 慶祝／升級卡（#cele）：開 App 時就該出現的 Perfect Day（v3-v2a.json 把「看過」退回前一天） ---------- */
function celeDueRaw() {
  const s = JSON.parse(readFixture('v3-v2a.json'));
  s.game.seen.perfectDay = '2026-10-04'; // 10-05 的 Perfect Day（訓練＋早安打卡）還沒慶祝
  return JSON.stringify(s);
}
const celeAnimations = (page) => page.evaluate(() => document.getAnimations().map((a) => {
  const t = a.effect && a.effect.target;
  const props = new Set();
  for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) props.add(p);
  for (const meta of ['offset', 'computedOffset', 'easing', 'composite']) props.delete(meta);
  const ct = a.effect.getComputedTiming();
  return {
    inCele: !!(t && t.closest && t.closest('#cele')),
    target: t ? (t.id || t.getAttribute('class') || t.tagName) : null,
    name: a.animationName || a.id || '',
    props: [...props].sort(),
    end: ct.endTime,
    iterations: ct.iterations,
    playState: a.playState
  };
}));

for (const mode of ['no-preference', 'reduce']) {
  test(`prefers-reduced-motion: ${mode} → Perfect Day 慶祝卡${mode === 'reduce' ? '只淡入（只有 opacity），彩帶靜止' : '只動 transform／opacity、1.5 秒內全部結束'}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode });
    await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(celeDueRaw()) });
    const cele = page.locator('#cele');
    await expect(cele).toBeVisible();
    await expect(cele).toHaveAttribute('data-kind', 'perfect');
    const anims = (await celeAnimations(page)).filter((a) => a.inCele);
    const byName = anims.reduce((o, a) => ({ ...o, [a.name]: (o[a.name] || 0) + 1 }), {});
    await expect(page.locator('#cele-confetti .cf')).toHaveCount(26);
    for (const a of anims) {
      expect(a.iterations, `${a.target}：不是無限動畫`).toBe(1);
      expect(a.end, `${a.target}：${a.name} ${a.end} ms ≤ 1500 ms`).toBeLessThanOrEqual(1500);
    }
    if (mode === 'reduce') {
      expect(byName).toEqual({ 'fade-in': 28 }); // 遮罩、卡片、26 片彩帶
      for (const a of anims) expect(a.props, `${a.target}：reduce 只淡入`).toEqual(['opacity']);
      await expect(page.locator('#cele-confetti .cf.still')).toHaveCount(26);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('#cele .cele-card')).transform)).toBe('none');
    } else {
      expect(byName).toEqual({ 'fade-in': 1, 'cele-pop': 1, 'cf-fall': 26 });
      for (const a of anims) expect(a.props.every((p) => ['opacity', 'transform'].includes(p)), `${a.target}：${a.props}`).toBe(true);
      await expect(page.locator('#cele-confetti .cf.still')).toHaveCount(0);
    }
    /* 1.5 秒後慶祝的動畫都結束（只剩靜止畫面）；按「領取」彩帶清掉。CSS 動畫走文件時間軸（真實時間，不受假時鐘影響） */
    await page.waitForTimeout(1_700);
    const left = (await celeAnimations(page)).filter((a) => a.inCele && a.playState === 'running');
    expect(left, '1.6 秒後還在跑的慶祝動畫').toEqual([]);
    await page.click('#cele-ok');
    await expect(cele).toBeHidden();
    await expect(page.locator('#cele-confetti .cf')).toHaveCount(0);
  });
}

/* ---------- M1 的資料保護元素：沒有任何動畫或 transition ---------- */
const NEW_ELEMENTS = ['#err-card', '#err-text', '#err-download', '#err-dismiss', '#err-note',
  '#bk-download', '#bk-status', '#imp-file-btn', '#imp-error', '#imp-preview', '#imp-rows', '#imp-warnings',
  '#imp-confirm', '#imp-cancel'];

async function motionReport(page, selectors) {
  return page.evaluate((selectors) => {
    const out = { animations: 0, styles: [] };
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        out.animations += el.getAnimations().length;
        const cs = getComputedStyle(el);
        const durations = cs.transitionDuration.split(',').map((d) => parseFloat(d));
        if (durations.some((d) => d > 0) || cs.animationName !== 'none') {
          out.styles.push(`${sel}: transition ${cs.transitionProperty} ${cs.transitionDuration}; animation ${cs.animationName}`);
        }
      }
    }
    return out;
  }, selectors);
}

for (const mode of ['reduce', 'no-preference']) {
  test(`prefers-reduced-motion: ${mode} → 錯誤卡、匯入控制項與預覽出現時沒有任何動畫或 transition`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode });
    await openApp(page, { seed: seedState(readFixture('v2-wrong-types.json')) }); // 錯誤卡會出現（D27 起今日沒有提醒卡）
    await expect(page.locator('#err-card')).toBeVisible();
    expect(await motionReport(page, NEW_ELEMENTS)).toEqual({ animations: 0, styles: [] });

    await gotoTab(page, 's-setup');
    await page.fill('#exp-area', '{');
    await page.click('#imp-btn');
    await expect(page.locator('#imp-error')).toBeVisible();
    expect(await motionReport(page, NEW_ELEMENTS)).toEqual({ animations: 0, styles: [] });
    await page.fill('#exp-area', readFixture('v3.json'));
    await page.click('#imp-btn');
    await expect(page.locator('#imp-preview')).toBeVisible();
    await page.click('#imp-confirm');
    expect(await motionReport(page, [...NEW_ELEMENTS, '#imp-rows .prline', '#imp-warnings div'])).toEqual({ animations: 0, styles: [] });
  });
}

test('prefers-reduced-motion: reduce → 啟動失敗卡沒有動畫', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/js/ui/home.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await openApp(page, { seed: seedState(readFixture('v2-real.json')), ready: false });
  await expect(page.locator('#boot-error')).toBeVisible();
  expect(await motionReport(page, ['#boot-error', '#boot-error *'])).toEqual({ animations: 0, styles: [] });
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
