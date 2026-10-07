/* qa-checker：V2a 新畫面的可及性與用語（CLAUDE.md §7「觸控 ≥44px；文字對比 ≥ WCAG AA」、§11 用語表；契約「共同限制」）。
   稽核的範圍（root）：Perfect Day 慶祝卡、升級卡（#cele）、今日（Freeze chip＋展開的說明、D6 降量卡 降量中／已恢復、
   D19 回歸卡 return／badge／boost）、完成畫面（#d-bonus），以及同時出現的 toast。
   1. 文字對比：每個看得到的文字節點，前景色（含祖先 opacity）對合成後的背景色 ≥ 4.5:1；大字（≥ 24px，或 ≥ 18.66px 且粗體）≥ 3:1。
   2. 觸控目標：看得到的按鈕、連結、輸入框 ≥ 44×44 px。
   3. 用語表：看得到的字串 0 違規（helpers.js 的 expectGlossaryClean）。
   4. 慶祝卡：role=dialog＋aria-modal、標題與說明有連結（aria-labelledby／describedby）、出現時焦點在「領取」／「繼續」。
   動畫（320 ms 淡入）結束後才量（CSS 動畫走真實時間），避免量到半透明的中間狀態。 */
import { test, expect, readFixture, openApp, seedState, gotoTab, nodeEngine, runWorkoutToEnd, expectGlossaryClean } from './helpers.js';

/* 頁面內稽核 roots（CSS 選擇器）——邏輯同 v1-a11y.spec.js 的 auditInPage，只是 root 可以指定 */
function auditRootsInPage(rootSelectors) {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    if (getComputedStyle(el).visibility === 'hidden') return false;
    for (let e = el; e; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) === 0) return false;
    return true;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const sel = (el) => {
    if (el.id) return `#${el.id}`;
    const parts = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.id) { parts.unshift(`#${e.id}`); break; }
      const cls = [...e.classList].slice(0, 2).map((c) => `.${c}`).join('');
      const idx = e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1;
      parts.unshift(`${e.tagName.toLowerCase()}${cls}:nth-child(${idx})`);
    }
    return parts.join(' > ');
  };
  const roots = rootSelectors.map((s) => document.querySelector(s)).filter((r) => r && !r.hidden && visible(r));
  const texts = [];
  const strings = [];
  const seen = new Set();
  for (const root of roots) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!visible(el) || el.closest('.sr-only') || el.closest('svg')) continue;
      strings.push(t);
      if (seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      fg.a *= opacityOf(el);
      const bg = bgOf(el);
      const r = ratio(over(fg, bg), bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      texts.push({ sel: sel(el), text: t.slice(0, 24), ratio: Math.round(r * 100) / 100, need: large ? 3 : 4.5, size: cs.fontSize, weight: cs.fontWeight });
    }
    for (const el of root.querySelectorAll('[aria-label]')) if (visible(el)) strings.push(el.getAttribute('aria-label'));
  }
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], summary, [tabindex]:not([tabindex="-1"])';
  const targets = [];
  const measured = new Set();
  for (const root of roots) {
    for (const el of root.querySelectorAll(INTERACTIVE)) {
      if (!visible(el) || el.disabled) continue;
      const target = (el.matches('input, select, textarea') && el.closest('label')) || el;
      if (measured.has(target)) continue;
      measured.add(target);
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
      const b = target.getBoundingClientRect();
      targets.push({ sel: sel(target), text: (target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 20), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 });
    }
  }
  return { roots: roots.map((r) => r.id || r.className), texts, targets, strings };
}

const results = [];
async function audit(page, label, rootSelectors, testInfo, { mustInclude = [] } = {}) {
  await page.waitForTimeout(450); // 出現動畫（--cele-in-ms 320 ms、toast 200 ms）結束
  const a = await page.evaluate(auditRootsInPage, rootSelectors);
  for (const sel of mustInclude) {
    expect(a.texts.some((t) => t.sel === sel || t.sel.startsWith(`${sel} `)) || a.targets.some((t) => t.sel === sel), `${label}：${sel} 有被量到`).toBe(true);
  }
  const contrast = a.texts.filter((t) => !(t.ratio >= t.need)).map((t) => `${t.sel}「${t.text}」${t.ratio}:1（需 ${t.need}，${t.size}／${t.weight}）`);
  const small = a.targets.filter((t) => t.w < 44 || t.h < 44).map((t) => `${t.sel}「${t.text}」${t.w}×${t.h}`);
  const minOf = (sel) => a.texts.filter((t) => t.sel === sel || t.sel.startsWith(`${sel} `)).reduce((m, t) => Math.min(m, t.ratio), Infinity);
  const line = `${label}（${a.roots.join('、')}）：文字 ${a.texts.length} 個、目標 ${a.targets.length} 個；對比不合格 ${contrast.length}、目標太小 ${small.length}`
    + (mustInclude.length ? `；最低對比 ${mustInclude.map((s) => `${s} ${minOf(s)}:1`).join('、')}` : '')
    + `；目標 ${a.targets.map((t) => `${t.sel} ${t.w}×${t.h}`).join('、') || '—'}`
    + (contrast.length || small.length ? `\n  ${[...contrast, ...small].join('\n  ')}` : '');
  console.log(`[qa] ${line}`);
  testInfo.annotations.push({ type: 'qa', description: line });
  results.push({ label, nTexts: a.texts.length, nTargets: a.targets.length, contrast: contrast.length, small: small.length });
  expectGlossaryClean(a.strings);
  return { contrast, small, strings: a.strings };
}

const fx = (name) => JSON.parse(readFixture(name));
function celeDue(seenPatch = {}) {
  const s = fx('v3-v2a.json');
  s.game.seen.perfectDay = '2026-10-04';
  Object.assign(s.game.seen, seenPatch);
  return JSON.stringify(s);
}

test.describe('V2a 可及性：對比、觸控目標、用語', () => {
  test('Perfect Day 慶祝卡 → 升級卡（#cele）：對比、目標、dialog 語意、焦點', async ({ page }, testInfo) => {
    await openApp(page, { now: '2026-10-05T20:00:00+09:00', seed: seedState(celeDue({ level: 6 })) });
    const cele = page.locator('#cele');
    await expect(cele).toHaveAttribute('data-kind', 'perfect');
    await expect(cele).toHaveAttribute('role', 'dialog');
    await expect(cele).toHaveAttribute('aria-modal', 'true');
    await expect(cele).toHaveAttribute('aria-labelledby', 'cele-title');
    await expect(cele).toHaveAttribute('aria-describedby', 'cele-vote');
    await expect(page.locator('#cele-ok')).toBeFocused();
    await expect(page.locator('#cele-confetti')).toHaveAttribute('aria-hidden', 'true');
    const all = [];
    await page.waitForTimeout(1_300); // 彩帶落完
    all.push(await audit(page, '慶祝卡（Perfect Day）', ['#cele'], testInfo, { mustInclude: ['#cele-title', '#cele-xp', '#cele-vote', '#cele-ok'] }));
    await page.click('#cele-ok');
    await expect(cele).toHaveAttribute('data-kind', 'level');
    await expect(page.locator('#cele-ok')).toBeFocused();
    await page.waitForTimeout(1_300);
    all.push(await audit(page, '升級卡', ['#cele'], testInfo, { mustInclude: ['#cele-title', '#cele-vote', '#cele-ok'] }));
    expect(all.flatMap((f) => f.contrast), '文字對比不合格').toEqual([]);
    expect(all.flatMap((f) => f.small), '觸控目標小於 44×44').toEqual([]);
  });

  test('今日：Freeze chip（剛用過）＋展開的說明；回歸卡（return）', async ({ page }, testInfo) => {
    /* 9/20–9/26 每天練（得 1 張）、9/27 沒練 → 9/28 自動用掉；9/27 也是中斷 → 9/28 還沒練前是回歸任務 */
    const s = fx('v3.json');
    s.sessions = ['20', '21', '22', '23', '24', '25', '26'].map((d) => ({ date: `2026-09-${d}`, type: 'full', xp: 10 }));
    await openApp(page, { now: '2026-09-28T20:00:00+09:00', seed: seedState(JSON.stringify(s)) });
    await expect(page.locator('#h-freeze')).toHaveClass(/used/);
    await page.click('#h-freeze');
    await expect(page.locator('#h-freeze-note')).toBeVisible();
    await expect(page.locator('#h-banner')).toHaveAttribute('data-stage', 'return');
    const f = await audit(page, '今日（Freeze＋說明＋回歸任務）', ['#s-home', '#tabs'], testInfo, { mustInclude: ['#h-freeze', '#h-freeze-n', '#h-freeze-note', '#h-banner'] });
    expect(f.contrast).toEqual([]);
    expect(f.small).toEqual([]);
  });

  test('今日：D6 降量卡（降量中 → 已恢復）＋回歸卡（badge）＋toast', async ({ page }, testInfo) => {
    await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(readFixture('v3.json')) });
    await gotoTab(page, 's-checkin');
    await page.click('#ci-edit');
    await page.fill('#ci-lights', '02:00');
    await page.click('#ci-wake');
    await gotoTab(page, 's-home');
    await expect(page.locator('#h-deload')).toHaveAttribute('data-state', 'active');
    await expect(page.locator('#h-banner')).toHaveAttribute('data-stage', 'badge');
    const all = [];
    all.push(await audit(page, '今日（降量中＋徽章＋打卡 toast）', ['#s-home', '#tabs', '#toast'], testInfo, { mustInclude: ['#h-deload-title', '#h-deload-sub', '#h-deload-restore', '#h-banner'] }));
    await page.click('#h-deload-restore');
    await expect(page.locator('#h-deload')).toHaveAttribute('data-state', 'restored');
    all.push(await audit(page, '今日（已恢復＋恢復 toast）', ['#s-home', '#tabs', '#toast'], testInfo, { mustInclude: ['#h-deload-title', '#h-deload-sub', '#toast-action'] }));
    expect(all.flatMap((f) => f.contrast), '文字對比不合格').toEqual([]);
    expect(all.flatMap((f) => f.small), '觸控目標小於 44×44').toEqual([]);
  });

  test('今日：回歸加成日（boost）卡', async ({ page }, testInfo) => {
    /* v3.json＋10-05 打卡（徽章）＋10-06 打卡與保底版（2 支柱 → ×1.5）；engine 在 Node 組 */
    const st = nodeEngine(`
      for (const at of ['2026-10-05T07:00:00+09:00', '2026-10-06T07:00:00+09:00']) {
        const b = sleep.buildCheckIn(args.s, new Date(at), rules, {});
        if (!b.ok) throw new Error(JSON.stringify(b));
        args.s.habits.sleep.log.push(b.entry);
      }
      args.s.sessions.push({ date: '2026-10-06', type: 'minimal', xp: 3 });
      return args.s;`, { s: fx('v3.json') });
    await openApp(page, { now: '2026-10-06T20:00:00+09:00', seed: seedState(JSON.stringify(st)) });
    await expect(page.locator('#cele')).toBeHidden(); // 第一次開啟：開啟前完成的 Perfect Day 不補播
    await expect(page.locator('#h-banner')).toHaveClass('banner quest boost');
    const f = await audit(page, '今日（回歸加成日）', ['#s-home', '#tabs'], testInfo, { mustInclude: ['#h-banner'] });
    expect(f.contrast).toEqual([]);
    expect(f.small).toEqual([]);
  });

  test('完成畫面：#d-bonus（含 Perfect Day）', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openApp(page, { now: '2026-10-06T06:50:00+09:00', seed: seedState(readFixture('v3-v2a.json')) });
    await page.click('#h-start');
    await page.click('#ci-wake');
    await gotoTab(page, 's-home');
    await page.click('#h-minimal');
    await runWorkoutToEnd(page);
    await expect(page.locator('#done')).toHaveClass(/active/);
    await expect(page.locator('#d-bonus')).toBeVisible();
    const f = await audit(page, '完成畫面（#d-bonus）', ['#done'], testInfo, { mustInclude: ['#d-bonus', '#d-ok'] });
    expect(f.contrast).toEqual([]);
    expect(f.small).toEqual([]);
  });
});

test.afterAll(() => {
  if (!results.length) return;
  const rows = results.map((r) => `| ${r.label} | ${r.nTexts} | ${r.nTargets} | ${r.contrast} | ${r.small} |`);
  console.log(['[qa] V2a 可及性摘要', '| 畫面 | 文字 | 目標 | 對比不合格 | 目標太小 |', '|---|---|---|---|---|', ...rows].join('\n'));
});
