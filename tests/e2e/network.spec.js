/* qa-checker：網路與前端碼掃描（PLAN.md §5 #8；CLAUDE.md §2 原則 1、7）。
   1. 走過所有畫面與流程，context 的每個請求都只到 127.0.0.1（data:／blob: 除外）；YouTube 只是 href，不發請求。
      （每個 e2e 測試另外都有自動守門 guard，見 helpers.js）
   2. 靜態掃描 App 檔：沒有 API key 樣式、沒有 AI 端點、外部網址只有 YouTube 搜尋（與 SVG 命名空間），
      網路 API 只有 sw.js 的 fetch（快取未命中時抓同源檔案）。 */
import { readdirSync } from 'node:fs';
import {
  test, expect, readFixture, readRepo, ROOT, openApp, seedState, gotoTab, tick, runWorkoutToEnd
} from './helpers.js';

const YT = 'https://www.youtube.com/results?search_query=';

test('走過四個分頁、示範視窗、訓練、Boss、匯出／匯入、備份：所有請求只到 127.0.0.1，YouTube 不發請求', async ({ page, guard }) => {
  await openApp(page, { now: '2026-10-11T08:00:00+09:00', seed: seedState(readFixture('v2-real.json')) });
  for (const id of ['s-hist', 's-body', 's-setup', 's-home']) await gotoTab(page, id);

  await gotoTab(page, 's-setup');
  const links = await page.locator('#vids a').evaluateAll((as) => as.map((a) => a.href));
  expect(links.length).toBeGreaterThan(40);
  expect(links.filter((h) => !h.startsWith(YT))).toEqual([]);
  /* 開幾個示範視窗：YouTube 連結只是 href */
  const demos = page.locator('#vids button[data-demo]');
  for (const i of [0, 5, 20]) {
    await demos.nth(i).click();
    await expect(page.locator('#demo-modal')).toHaveClass(/active/);
    expect(await page.locator('#dm-yt').getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    await page.clock.runFor(300);
    await page.click('#dm-close');
  }
  await page.click('#exp-btn');
  await expect(page.locator('#io-msg')).toHaveText('已匯出 — 全選複製保存。');
  await page.click('#imp-btn'); // 貼上區是剛匯出的 JSON → 預覽
  await expect(page.locator('#imp-preview')).toBeVisible();
  await page.click('#imp-cancel');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-download')]);
  expect(dl.suggestedFilename()).toBe('daily-ten-backup-2026-10-11.json');

  /* Boss Day（2 英里）跑完 */
  await gotoTab(page, 's-home');
  await page.click('#h-start');
  await tick(page, 30);
  await page.click('#t-pause');
  await page.click('#t-pause');
  await runWorkoutToEnd(page);
  await expect(page.locator('#s-boss')).toHaveClass(/active/);
  await page.fill('#bi-m', '19');
  await page.fill('#bi-s', '5');
  await page.click('#bi-save');
  await expect(page.locator('#done')).toHaveClass(/active/);
  await page.click('#d-ok');

  expect(guard.requests.length).toBeGreaterThan(20);
  expect(guard.external).toEqual([]);
  expect(guard.requests.filter((u) => /youtube|googleapis|gstatic|fonts\./i.test(u))).toEqual([]);
});

/* ---------- 靜態掃描 ---------- */
function appFiles() {
  const out = ['index.html', 'demos.js', 'sw.js', 'manifest.webmanifest'];
  for (const dir of ['css', 'js', 'js/ui', 'js/state']) {
    for (const ent of readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
      if (ent.isFile() && /\.(js|css)$/.test(ent.name)) out.push(`${dir}/${ent.name}`);
    }
  }
  return out;
}

test('前端碼掃描：無 API key、無 AI 端點、外部網址只有 YouTube 搜尋、網路 API 只在 sw.js', () => {
  const files = appFiles();
  expect(files).toEqual(expect.arrayContaining(['js/app.js', 'js/ui/backup.js', 'js/state/backup.js', 'css/tokens.css']));
  const problems = [];
  const SECRET = [
    /sk-[A-Za-z0-9_-]{16,}/, /AIza[0-9A-Za-z_-]{35}/, /Bearer\s+[A-Za-z0-9._-]{16,}/,
    /\b(?:api[_-]?key|secret|access[_-]?token)\b\s*[:=]\s*['"`][^'"`]{8,}/i, /TYPESAFE_API_KEY/,
    /api\.openai\.com|api\.anthropic\.com|typesafe\.ai|generativelanguage\.googleapis\.com/i
  ];
  for (const f of files) {
    const text = readRepo(f);
    for (const re of SECRET) if (re.test(text)) problems.push(`${f}：${re}`);
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
      if (m[0].startsWith(YT) || m[0].startsWith('http://www.w3.org/')) continue;
      problems.push(`${f}：外部網址 ${m[0]}`);
    }
    const net = text.match(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/g) || [];
    if (net.length && !(f === 'sw.js' && net.every((n) => n.startsWith('fetch')))) problems.push(`${f}：網路 API ${net.join(', ')}`);
    /* 動態 import 只能是相對路徑（同源 module） */
    for (const m of text.matchAll(/import\(\s*(['"`])([^'"`]+)\1/g)) if (!m[2].startsWith('./')) problems.push(`${f}：import(${m[2]})`);
    for (const m of text.matchAll(/^\s*import\s[^;]*?from\s*(['"])([^'"]+)\1/gm)) if (!m[2].startsWith('.')) problems.push(`${f}：import from ${m[2]}`);
  }
  expect(problems).toEqual([]);
});
