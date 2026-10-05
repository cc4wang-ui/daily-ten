/* qa-checker：V1 可及性與用語（CLAUDE.md §7「觸控 ≥44px；文字對比 ≥ WCAG AA」、§11 用語表；qa-checker 清單 #9）。
   每個畫面（今日 打卡前／後、早安打卡 待打卡／修改時間／已打卡、訓練、統計 兩段、設定 含匯入錯誤與預覽、錯誤卡）：
   1. 文字對比：每個看得到的文字節點，前景色（含祖先 opacity）對合成後的背景色（往上疊到不透明為止）≥ 4.5:1；
      大字（≥ 24px，或 ≥ 18.66px 且粗體）≥ 3:1。
   2. 觸控目標：看得到的按鈕、連結、輸入框、分頁、開關 ≥ 44×44 px（包在 label 裡的輸入框量 label；段落中的行內連結不算）。
   3. 用語表：畫面上看得到的字串 0 違規（helpers.js 的 expectGlossaryClean，規則來自 tools/jev/zh-tw-glossary.json）。
   4. 分頁列不透明（底色 alpha = 1、沒有 backdrop-filter）；每個畫面捲到最底，最後一個區塊整個在分頁列上方。
   不合格的元素連同選擇器與數值印在 log（[qa] …）並記在測試 annotation，報告引用。 */
import { test, expect, readFixture, openApp, seedState, gotoTab, expectGlossaryClean } from './helpers.js';

const MORNING = '2026-10-05T07:00:00+09:00';

/* 在頁面內稽核目前的前景畫面（.screen.active）＋分頁列＋顯示中的 toast */
function auditInPage() {
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
  const roots = [document.querySelector('.screen.active'), document.getElementById('tabs'), document.getElementById('toast')]
    .filter((r) => r && !r.hidden && visible(r));
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
    /* 輸入框裡的值（不是文字節點） */
    for (const el of root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), textarea')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      const bg = bgOf(el);
      texts.push({ sel: sel(el), text: `（輸入框）${el.value.slice(0, 16)}`, ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100, need: 4.5, size: cs.fontSize, weight: cs.fontWeight });
    }
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
      /* 段落中的行內連結（WCAG 2.5.8 例外） */
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
      const b = target.getBoundingClientRect();
      targets.push({ sel: sel(target), text: (target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 20), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 });
    }
  }
  return {
    screen: (document.querySelector('.screen.active') || {}).id,
    texts, targets, strings
  };
}

const failuresOf = (a) => ({
  contrast: a.texts.filter((t) => !(t.ratio >= t.need)).map((t) => `${t.sel}「${t.text}」${t.ratio}:1（需 ${t.need}，${t.size}／${t.weight}）`),
  targets: a.targets.filter((t) => t.w < 44 || t.h < 44).map((t) => `${t.sel}「${t.text}」${t.w}×${t.h}`)
});

const results = [];
async function auditScreen(page, label, testInfo) {
  const a = await page.evaluate(auditInPage);
  const f = failuresOf(a);
  results.push({ label, screen: a.screen, nTexts: a.texts.length, nTargets: a.targets.length, ...f });
  const line = `${label}（${a.screen}）：文字 ${a.texts.length} 個、目標 ${a.targets.length} 個；對比不合格 ${f.contrast.length}、目標太小 ${f.targets.length}`
    + (f.contrast.length || f.targets.length ? `\n  ${[...f.contrast, ...f.targets].join('\n  ')}` : '');
  console.log(`[qa] ${line}`);
  testInfo.annotations.push({ type: 'qa', description: line });
  expectGlossaryClean(a.strings);
  return f;
}

test.describe('對比、觸控目標、用語：V1 每個畫面', () => {
  test('今日（打卡前、錯誤卡、提醒卡、中斷提示）→ 早安打卡（待打卡、修改時間）→ 打卡後（計分明細、toast）→ 今日（打卡後）', async ({ page }, testInfo) => {
    await openApp(page, { now: MORNING, seed: seedState(readFixture('v2-real.json')) }); // 從未備份（提醒卡）、9/28 後中斷（中斷提示）
    await expect(page.locator('#bk-reminder')).toBeVisible();
    await expect(page.locator('#h-banner')).toBeVisible();
    const all = [];
    all.push(await auditScreen(page, '今日（打卡前）', testInfo));
    await page.click('#h-start');
    all.push(await auditScreen(page, '早安打卡（待打卡）', testInfo));
    await page.click('#ci-edit');
    await expect(page.locator('#ci-edit-row')).toBeVisible();
    all.push(await auditScreen(page, '早安打卡（修改時間）', testInfo));
    await page.click('#ci-edit-reset');
    await page.click('#ci-wake');
    await expect(page.locator('#ci-done')).toBeVisible();
    await expect(page.locator('#toast')).toBeVisible();
    all.push(await auditScreen(page, '早安打卡（已打卡＋toast）', testInfo));
    await gotoTab(page, 's-home');
    all.push(await auditScreen(page, '今日（打卡後＋toast）', testInfo));
    expect(all.flatMap((f) => f.contrast), '文字對比不合格').toEqual([]);
    expect(all.flatMap((f) => f.targets), '觸控目標小於 44×44').toEqual([]);
  });

  test('今日（資料修補錯誤卡）', async ({ page }, testInfo) => {
    await openApp(page, { now: MORNING, seed: seedState(readFixture('v2-wrong-types.json')) });
    await expect(page.locator('#err-card')).toBeVisible();
    const f = await auditScreen(page, '今日（錯誤卡）', testInfo);
    expect(f.contrast).toEqual([]);
    expect(f.targets).toEqual([]);
  });

  test('訓練分頁、統計（訓練紀錄、身體指標）、設定（含匯入錯誤與預覽）', async ({ page }, testInfo) => {
    await openApp(page, { now: MORNING, seed: seedState(readFixture('v3-checkin.json')) });
    const all = [];
    await gotoTab(page, 's-train');
    all.push(await auditScreen(page, '訓練', testInfo));
    await gotoTab(page, 's-hist');
    all.push(await auditScreen(page, '統計 · 訓練紀錄', testInfo));
    await gotoTab(page, 's-body');
    all.push(await auditScreen(page, '統計 · 身體指標', testInfo));
    await gotoTab(page, 's-setup');
    all.push(await auditScreen(page, '設定', testInfo));
    await page.fill('#exp-area', '{');
    await page.click('#imp-btn');
    await expect(page.locator('#imp-error')).toBeVisible();
    all.push(await auditScreen(page, '設定（匯入錯誤）', testInfo));
    await page.fill('#exp-area', readFixture('v2-real.json'));
    await page.click('#imp-btn');
    await expect(page.locator('#imp-preview')).toBeVisible();
    all.push(await auditScreen(page, '設定（匯入預覽）', testInfo));
    expect(all.flatMap((f) => f.contrast), '文字對比不合格').toEqual([]);
    expect(all.flatMap((f) => f.targets), '觸控目標小於 44×44').toEqual([]);
  });
});

/* ---------- 分頁列：不透明；最後一個區塊捲得到分頁列上方 ---------- */
test('分頁列不透明（底色 alpha 1、沒有 backdrop-filter、內容不會透出來）；每個畫面捲到底，最後一個區塊整個在分頁列上方', async ({ page }) => {
  await openApp(page, { now: MORNING, seed: seedState(readFixture('v3-checkin.json')) });
  const style = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('tabs'));
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
    const parts = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat) : [];
    return { alpha: parts.length > 3 ? parts[3] : (parts.length ? 1 : 0), backdrop: cs.backdropFilter || 'none', opacity: cs.opacity, position: cs.position };
  });
  expect(style).toEqual({ alpha: 1, backdrop: 'none', opacity: '1', position: 'fixed' });
  for (const id of ['s-home', 's-train', 's-hist', 's-body', 's-setup', 's-checkin']) {
    await gotoTab(page, id);
    const r = await page.evaluate((id) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const tabs = document.getElementById('tabs').getBoundingClientRect();
      const root = document.getElementById(id);
      const scope = root.classList.contains('panel') ? root : root;
      const kids = [...scope.children].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== 'fixed');
      const last = kids[kids.length - 1];
      const b = last.getBoundingClientRect();
      /* 分頁列範圍內的點：最上層一定是分頁列自己（內容在它底下） */
      const probe = document.elementFromPoint(tabs.left + tabs.width / 2, tabs.top + 2);
      return { last: last.id || last.className, lastBottom: Math.round(b.bottom), tabsTop: Math.round(tabs.top), probeInTabs: !!probe && !!probe.closest('#tabs') };
    }, id);
    expect(r.probeInTabs, `${id}：分頁列在最上層`).toBe(true);
    expect(r.lastBottom, `${id}：最後一個區塊（${r.last}）的底 ${r.lastBottom} ≤ 分頁列頂 ${r.tabsTop}`).toBeLessThanOrEqual(r.tabsTop);
  }
});

test.afterAll(() => {
  if (!results.length) return;
  const rows = results.map((r) => `| ${r.label} | ${r.nTexts} | ${r.nTargets} | ${r.contrast.length} | ${r.targets.length} |`);
  console.log(['[qa] 可及性摘要', '| 畫面 | 文字 | 目標 | 對比不合格 | 目標太小 |', '|---|---|---|---|---|', ...rows].join('\n'));
});
