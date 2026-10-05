/* qa-checker：拆 module 前後等價比對（PLAN.md §2 #3、#4、§5 #3；M1 完成條件「功能與 main 等價」）。
   只在 PARITY_BASE_DIR 有設時執行（playwright.config 會在 BASE_PORT 起基準伺服器，基準 = ec87e03）。
   V1（D26）起今日／統計／設定畫面刻意改變（亮色、三環、分頁重組），畫面層的逐像素比對退役；保留：
   1. 訓練畫面家族逐像素比對（訓練計時開始、暫停、Boss 測驗計時、動作示範視窗）：V1 不改訓練計時畫面（契約「本版不做」）。
      每個情境用同一套步驟跑三次：基準（A）、新版（B）、新版再一次（B'）。先要求 B 與 B' 0 px（A/A：確認比對工具沒有雜訊），
      再要求 A 與 B 0 px（A/B）；另外比對訓練畫面的文字。
      - 開始按鈕的位置不同：基準在 HOME（#h-start／#h-plus／#h-rain）；新版在訓練分頁（#tr-start／#h-plus／#h-rain）。
        新版早上的「下一步」是早安打卡，所以一律從訓練分頁開始。
      - 動作示範：基準從 SETUP 開、新版從訓練分頁開；遮罩是 92% 不透明，背後畫面（刻意改成亮色）會透出 8%，
        所以只比示範視窗本身（.box 元素截圖：人偶動畫、提示、按鈕），另外比動作名稱與提示文字。
   2. 統計與身體指標的計算結果（熱力圖每格的種類、PR 清單、BODY 判讀／指標卡／營養目標／圍度／肌力）文字與基準相同。
   3. 今日課表的時長：基準 HOME 的開始／加一輪／保底版分鐘數＝新版今日「下一步」／訓練分頁加一輪／保底版。
   4. 新版 DOM 保留基準 index.html 靜態 markup 的每一個 id（UI 改版不刪 id、不改名）。
   5. 課表資料與規則等價（所有序列、時長、示範對應、XP 表、影片清單、今日計畫、升級條件）。
   - 時間：假時鐘暫停在指定時間；訓練畫面用 runFor（逐影格，示範動畫相位一致）或 1 秒一步的 fastForward。
   - Math.random 固定為 0。Chromium 加 --disable-partial-raster（圓角邊緣 ±1 像素雜訊）。
   - 掛上示範動畫前先把假時鐘對齊 16 ms 影格（alignFrame），避免影格格點不同造成 A/A 雜訊。
   QA_SHOTS_DIR 有設時，所有截圖另存到該目錄（報告引用的證據）。 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import utilsBundle from 'playwright-core/lib/utilsBundle';
import {
  test, expect, readFixture, contextOptions, watchContext, assertWatchClean, openApp, seedState,
  tick, tickUntil, NOW_ISO
} from './helpers.js';

const { PNG } = utilsBundle;
const PORT = Number(process.env.PORT || 4173);
const BASE_PORT = Number(process.env.BASE_PORT || PORT + 1);
const ORIGIN = { A: `http://127.0.0.1:${BASE_PORT}`, B: `http://127.0.0.1:${PORT}` };
const SHOTS_DIR = process.env.QA_SHOTS_DIR || '';
const BASE_DIR = process.env.PARITY_BASE_DIR || '';

/* 讓假時鐘的 ticks 落在 16 ms 格點上（rAF 影格格點），之後 runFor 的影格序列在每次執行都相同 */
async function alignFrame(page) {
  const t = Math.round(await page.evaluate(() => performance.now()));
  const r = (16 - (t % 16)) % 16;
  if (r) await page.clock.runFor(r);
}

test.skip(!BASE_DIR, '未設定 PARITY_BASE_DIR（拆 module 前的基準目錄），略過等價比對');
test.use({
  launchOptions: {
    args: ['--disable-partial-raster'],
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
  },
  trace: 'off'
});
test.describe.configure({ timeout: 300_000 });

const v2WithBackup = (now) => {
  const s = JSON.parse(readFixture('v2-real.json'));
  s.meta = { lastBackupAt: now };
  return JSON.stringify(s);
};
/* 開 App：基準沒有 html[data-ready]，用 M1 的判斷 */
const openFor = (page, which, opts) => openApp(page, { ...opts, ready: which === 'A' ? 'm1' : true });

/* ---------- 截圖工具（只有訓練畫面家族） ---------- */
class Capture {
  constructor(page, which) { this.page = page; this.which = which; this.shots = new Map(); this.facts = new Map(); }
  async viewport(name) { this.shots.set(name, await this.page.screenshot()); }
  /* 元素內部的截圖：用 clip 裁切視窗截圖（locator.screenshot 會用 rAF 等元素穩定，假時鐘暫停時 rAF 不會跑）。
     四邊各內縮圓角半徑（≥ 12 px，小於內距 16 px）：圓角外與小數像素的邊緣會透出遮罩後面的畫面（刻意改成亮色），內容全部在內縮範圍內。 */
  async element(name, selector) {
    const r = await this.page.locator(selector).evaluate((el) => {
      const b = el.getBoundingClientRect();
      const inset = Math.max(12, Math.ceil(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0));
      return { x: Math.ceil(b.left) + inset, y: Math.ceil(b.top) + inset, width: Math.floor(b.width) - 2 * inset - 1, height: Math.floor(b.height) - 2 * inset - 1 };
    });
    this.facts.set(`${name}.rect`, JSON.stringify(r));
    this.shots.set(name, await this.page.screenshot({ clip: r }));
  }
}

/* 去某個畫面：基準是四顆分頁（HOME／RECORDS／BODY／SETUP）；新版設定在今日右上齒輪、動作庫在訓練分頁 */
const B_PANEL = { 's-hist': '#st-tab-hist', 's-body': '#st-tab-body' };
async function go(page, which, id) {
  if (which === 'A') await page.click(`#tabs button[data-s="${id}"]`);
  else if (id === 's-setup') { await page.click('#tabs button[data-s="s-home"]'); await page.click('#h-settings'); }
  else if (B_PANEL[id]) { await page.click('#tabs button[data-s="s-stats"]'); await page.click(B_PANEL[id]); }
  else await page.click(`#tabs button[data-s="${id}"]`);
  await expect(page.locator(`#${id}`)).toHaveClass(/active/);
}
/* 動作庫所在的畫面 */
const vidsScreen = (which) => (which === 'A' ? 's-setup' : 's-train');
/* 開始按鈕：今日課表／加一輪／雨天（基準在 HOME，新版在訓練分頁） */
async function pressStart(page, which, kind) {
  const sel = kind === 'start' ? (which === 'A' ? '#h-start' : '#tr-start') : kind === 'plus' ? '#h-plus' : '#h-rain';
  await go(page, which, which === 'A' ? 's-home' : 's-train');
  await alignFrame(page);
  await page.click(sel);
}

/* ---------- 情境（A、B 兩版跑同一套步驟） ---------- */
async function demoModal(cap, page, prefix) {
  await go(page, cap.which, vidsScreen(cap.which));
  await alignFrame(page);
  await page.locator('#vids button[data-demo]').first().click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await page.clock.runFor(1_000); // 動畫跑 1 秒（逐影格）
  await cap.element(`${prefix}-demo-modal`, '#demo-modal .box');
  cap.facts.set(`${prefix}-demo-modal.text`, await page.locator('#demo-modal .box').evaluate((el) => el.innerText));
  await page.click('#dm-close');
  await alignFrame(page);
  await page.locator('#vids button[data-demo]').nth(12).click();
  await page.clock.runFor(700);
  await cap.element(`${prefix}-demo-modal-2`, '#demo-modal .box');
  cap.facts.set(`${prefix}-demo-modal-2.text`, await page.locator('#demo-modal .box').evaluate((el) => el.innerText));
  await page.click('#dm-close');
}

/* 開始一段訓練 → 跑 ms 毫秒（逐影格）→ 暫停截圖 → 結束 */
async function pausedTraining(cap, page, prefix, kind, ms = 12_000) {
  await pressStart(page, cap.which, kind);
  await expect(page.locator('#train')).toHaveClass(/active/);
  await cap.viewport(`${prefix}-train-start`);
  await page.clock.runFor(ms);
  await page.click('#t-pause');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.clock.runFor(500);
  await cap.viewport(`${prefix}-train-paused`);
  cap.facts.set(`${prefix}-train-paused.text`, await page.locator('#train').evaluate((el) => el.innerText));
  await page.click('#t-abort');
  await expect(page.locator('#train')).not.toHaveClass(/active/);
}

/* Boss Day：暖身 → 測驗計時畫面（HRP 倒數／Plank 碼表）截圖；成績輸入與完成畫面在 V1 改版（不比） */
async function bossTest(cap, page, prefix, item) {
  await pressStart(page, cap.which, 'start');
  const phase = item === 'hrp' ? 'BOSS · HRP' : 'BOSS · PLANK';
  await tickUntil(page, (p) => document.getElementById('t-phase').textContent === p, { arg: phase, every: 1, maxSeconds: 2400 });
  await tick(page, 20);
  await cap.viewport(`${prefix}-boss-test`);
  cap.facts.set(`${prefix}-boss-test.text`, await page.locator('#train').evaluate((el) => el.innerText));
}

const SCENARIOS = [
  {
    name: '週五 空資料', now: NOW_ISO, seed: null,
    async run(cap, page) {
      await demoModal(cap, page, 'fri-empty');
      await pausedTraining(cap, page, 'fri-empty', 'start');
    }
  },
  {
    name: '週五 v2 資料', now: NOW_ISO, seed: () => v2WithBackup(NOW_ISO),
    async run(cap, page) {
      await demoModal(cap, page, 'fri-v2');
      await pausedTraining(cap, page, 'fri-v2', 'start');
      await pausedTraining(cap, page, 'fri-v2-plus', 'plus', 20_000);
      await pausedTraining(cap, page, 'fri-v2-rain', 'rain', 15_000);
    }
  },
  {
    name: '週三 v2 資料（加練日）', now: '2026-09-30T07:00:00+09:00', seed: () => v2WithBackup('2026-09-30T07:00:00+09:00'),
    async run(cap, page) {
      await pausedTraining(cap, page, 'wed-v2-plus', 'plus', 30_000);
    }
  },
  {
    name: '週六 v2 資料（恢復日）', now: '2026-10-03T07:00:00+09:00', seed: () => v2WithBackup('2026-10-03T07:00:00+09:00'),
    async run(cap, page) {
      await pausedTraining(cap, page, 'sat-v2', 'start', 25_000);
    }
  },
  {
    name: '週日 v2 資料（2 英里暖身）', now: '2026-10-11T08:00:00+09:00', seed: () => v2WithBackup('2026-10-11T08:00:00+09:00'),
    async run(cap, page) {
      await pausedTraining(cap, page, 'sun-run-v2', 'start');
    }
  },
  {
    name: '週日 空資料（HRP）', now: '2026-10-18T08:00:00+09:00', seed: null,
    async run(cap, page) {
      await bossTest(cap, page, 'sun-hrp-empty', 'hrp');
    }
  },
  {
    name: '週日 v2 資料（Plank）', now: '2026-10-04T08:00:00+09:00', seed: () => v2WithBackup('2026-10-04T08:00:00+09:00'),
    async run(cap, page) {
      await bossTest(cap, page, 'sun-plank-v2', 'plank');
    }
  }
];

/* ---------- 跑一次、比對 ---------- */
async function runOnce(browser, which, scenario) {
  const ctx = await browser.newContext(contextOptions({ baseURL: ORIGIN[which[0]] }));
  const w = watchContext(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Math.random = () => 0; });
  const cap = new Capture(page, which[0]);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  try {
    await openFor(page, which[0], { now: scenario.now, seed: scenario.seed ? seedState(scenario.seed()) : null });
    await scenario.run(cap, page);
  } finally {
    await ctx.close();
  }
  assertWatchClean(w, `${scenario.name}（${which}）`);
  cap.facts.set('dialogs', dialogs.join('｜'));
  if (SHOTS_DIR) {
    const dir = join(SHOTS_DIR, scenario.name.replace(/[\s（）]/g, '_'), which);
    mkdirSync(dir, { recursive: true });
    for (const [k, buf] of cap.shots) writeFileSync(join(dir, `${k.replace(/[\\/:*?"<>|\s]/g, '_')}.png`), buf);
  }
  return cap;
}

function pixelDiff(a, b) {
  if (a.equals(b)) return { pixels: 0 };
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) {
    return { pixels: Number.POSITIVE_INFINITY, note: `尺寸不同 ${A.width}×${A.height} vs ${B.width}×${B.height}` };
  }
  const out = new PNG({ width: A.width, height: A.height });
  let pixels = 0;
  let x0 = A.width, y0 = A.height, x1 = -1, y1 = -1;
  for (let i = 0; i < A.data.length; i += 4) {
    const same = A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2] && A.data[i + 3] === B.data[i + 3];
    const p = i / 4, x = p % A.width, y = Math.floor(p / A.width);
    if (same) {
      const g = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 * 0.3);
      out.data[i] = out.data[i + 1] = out.data[i + 2] = g;
    } else {
      pixels++;
      out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    out.data[i + 3] = 255;
  }
  return { pixels, note: pixels ? `bbox (${x0},${y0})–(${x1},${y1})` : '', diffPng: pixels ? PNG.sync.write(out) : null };
}

async function compare(left, right, label, testInfo) {
  const problems = [];
  const names = [...new Set([...left.shots.keys(), ...right.shots.keys()])];
  for (const name of names) {
    const a = left.shots.get(name);
    const b = right.shots.get(name);
    if (!a || !b) { problems.push(`${name}：只有一邊有截圖`); continue; }
    const d = pixelDiff(a, b);
    if (d.pixels !== 0) {
      problems.push(`${name}：${d.pixels} px 不同 ${d.note}`);
      const safe = `${label}-${name}`.replace(/[\\/:*?"<>|\s]/g, '_');
      await testInfo.attach(`${safe}-left.png`, { body: a, contentType: 'image/png' });
      await testInfo.attach(`${safe}-right.png`, { body: b, contentType: 'image/png' });
      if (d.diffPng) await testInfo.attach(`${safe}-diff.png`, { body: d.diffPng, contentType: 'image/png' });
    }
  }
  for (const key of new Set([...left.facts.keys(), ...right.facts.keys()])) {
    if (left.facts.get(key) !== right.facts.get(key)) {
      problems.push(`${key}：${JSON.stringify(left.facts.get(key))?.slice(0, 200)} ≠ ${JSON.stringify(right.facts.get(key))?.slice(0, 200)}`);
    }
  }
  return { problems, shots: names.length, facts: left.facts.size };
}

test.describe('等價比對（訓練畫面家族）：基準 ec87e03 vs 新版（A/A 後 A/B）', () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ browser }, testInfo) => {
      const B1 = await runOnce(browser, 'B', scenario);
      const B2 = await runOnce(browser, "B'", scenario);
      const aa = await compare(B1, B2, 'AA', testInfo);
      const A = await runOnce(browser, 'A', scenario);
      const ab = await compare(A, B1, 'AB', testInfo);
      console.log(`[qa] 等價比對「${scenario.name}」：截圖 ${ab.shots} 張、文字 ${ab.facts} 項；A/A 不同 ${aa.problems.length}、A/B 不同 ${ab.problems.length}`);
      expect(aa.problems, 'A/A（新版自比）應為 0 px：比對工具本身有雜訊').toEqual([]);
      expect(ab.problems, 'A/B（基準 vs 新版）應為 0 px').toEqual([]);
    });
  }
});

/* ---------- 統計／身體指標的計算結果、今日課表時長：與基準文字相同 ----------
   兩版各自開同一份資料、做同樣的 BODY 輸入，比較 DOM 的文字內容（textContent，與版面無關）。 */
const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
async function recordsAndBody(page, which) {
  await go(page, which, 's-hist');
  const out = await page.evaluate(() => {
    const rows = (id) => [...document.querySelectorAll(`#${id} .prline`)].map((r) => [...r.children].map((c) => c.textContent.trim()));
    return {
      heat: [...document.querySelectorAll('#hist-heat i')].map((i) => i.className),
      heatTitles: [...document.querySelectorAll('#hist-heat i')].map((i) => i.title.slice(0, 10)),
      prs: { hrp: rows('pr-hrp'), plank: rows('pr-plank'), run: rows('pr-run') },
      prEmpty: ['pr-hrp', 'pr-plank', 'pr-run'].map((id) => document.getElementById(id).textContent.trim()).filter((t) => t.includes('尚無紀錄'))
    };
  });
  await go(page, which, 's-body');
  await page.fill('#bd-weight', '68.4');
  await page.fill('#bd-waist', '79.5');
  await page.fill('#bd-rhr', '58');
  await page.fill('#bd-sleep', '7.2');
  await page.click('#bd-save');
  await page.fill('#bd-arm', '33.5');
  await page.click('#bd-save2');
  await page.fill('#bd-pushup', '31');
  await page.click('#bd-save3');
  out.body = await page.evaluate(() => {
    const t = (id) => document.getElementById(id).textContent;
    const rows = (id) => [...document.querySelectorAll(`#${id} .prline`)].map((r) => [...r.children].map((c) => c.textContent.trim()));
    return {
      msg: t('bd-msg'), verdict: t('bd-verdict'), tiles: [...document.querySelectorAll('#bd-tiles .tile')].map((x) => x.textContent),
      macros: t('bd-macros'), macroNote: t('bd-macro-note'), girth: rows('bd-girth'), strength: rows('bd-strength')
    };
  });
  out.body = JSON.parse(JSON.stringify(out.body, (k, v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v)));
  return out;
}
async function planMinutes(page, which) {
  return page.evaluate((which) => {
    const num = (sel, re) => {
      const el = document.querySelector(sel);
      const m = el && re.exec(el.textContent);
      const g = m ? m.slice(1).find((x) => x !== undefined) : undefined;
      return g === undefined ? null : Number(g);
    };
    if (which === 'A') {
      return {
        start: num('#h-start', /（(?:約 )?(\d+) min）|· (\d+) 分鐘/),
        plus: document.getElementById('h-plus').style.display === 'none' ? null : num('#h-plus', /· (\d+) 分鐘$/),
        minimal: num('#h-minimal', /約 (\d+) 分鐘/)
      };
    }
    return {
      start: num('#h-start .nx-meta', /(\d+) 分/),
      plus: document.getElementById('h-plus').hidden ? null : num('#h-plus .opt-meta', /^(\d+) 分鐘$/),
      minimal: num('#h-minimal', /只有 (\d+) 分鐘/)
    };
  }, which);
}

test('統計（熱力圖、PR）、身體指標（判讀、指標卡、營養目標、圍度、肌力）的計算結果與基準相同；今日課表時長相同', async ({ browser }) => {
  const result = {};
  for (const which of ['A', 'B']) {
    result[which] = {};
    for (const [label, now, seed] of [
      ['週五 v2', NOW_ISO, () => v2WithBackup(NOW_ISO)],
      ['週三 v2 下午', '2026-09-30T15:30:00+09:00', () => v2WithBackup('2026-09-30T15:30:00+09:00')],
      ['週六 v3 下午', '2026-10-03T15:30:00+09:00', () => readFixture('v3.json')],
      ['週日 v3 下午（Boss）', '2026-10-04T15:30:00+09:00', () => readFixture('v3.json')],
      ['週五 空資料', NOW_ISO, null]
    ]) {
      const ctx = await browser.newContext(contextOptions({ baseURL: ORIGIN[which] }));
      const w = watchContext(ctx);
      try {
        const page = await ctx.newPage();
        page.on('dialog', (d) => d.accept());
        await openFor(page, which, { now, seed: seed ? seedState(seed()) : null });
        const minutes = await planMinutes(page, which);
        result[which][label] = { minutes, ...(await recordsAndBody(page, which)) };
      } finally {
        await ctx.close();
      }
      assertWatchClean(w, `${label}（${which}）`);
    }
  }
  const a = result.A['週五 v2'];
  console.log(`[qa] 計算結果等價：熱力圖 ${a.heat.length} 格（有練 ${a.heat.filter(Boolean).length} 天）、PR ${a.prs.hrp.length + a.prs.plank.length + a.prs.run.length} 筆、BODY 指標卡 ${a.body.tiles.length} 張；時長 ${JSON.stringify(a.minutes)}`);
  expect(a.heat).toHaveLength(56);
  expect(a.body.tiles.length).toBeGreaterThan(0);
  expect(a.minutes.start).toBeGreaterThan(0);
  expect(result.B).toEqual(result.A);
});

/* ---------- 新版 DOM 保留基準的每一個 id（不刪、不改名） ----------
   基準 index.html 去掉 <script> 之後的靜態 markup 裡的 id；新版開機後 document.getElementById 都找得到。 */
test('新版保留基準 index.html 靜態 markup 的每一個 id', async ({ page }) => {
  const html = readFileSync(join(BASE_DIR, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const ids = [...new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  expect(ids.length).toBeGreaterThan(60);
  await openApp(page, { seed: seedState(v2WithBackup(NOW_ISO)) });
  const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), ids);
  console.log(`[qa] 基準靜態 id ${ids.length} 個；新版缺 ${missing.length} 個`);
  expect(missing).toEqual([]);
});

/* ---------- 課表資料與規則等價（DoD 3：沒有新增或改名動作；行為零變更） ----------
   兩版各自在頁面內呼叫課表函式（基準：classic script 的全域函式；新版：import 同一個 module 實例），
   L1–L5 × 有／無彈力帶 × 三組伸展 × 三種區塊 × 一週七天的全部序列、加上過場後的完整步驟、時長估算、
   每個步驟名稱對應的示範 key、XP 表、身分句、SETUP 影片清單、每天的今日計畫文字（含三個週日的 Boss 輪替）、
   升級條件在門檻上下的判定，全部要逐項相同。 */
async function programDump(page, which) {
  return page.evaluate(async (which) => {
    /* eslint-disable no-undef */
    let S, P, C, SS;
    if (which === 'A') {
      S = () => state;
      P = { fullSeq, blockSeq, restSeq, minimalSeq, rainSeq, addTransitions, estMin, planSeq, WEEK, BLOCKS, DOW };
      C = { XP, IDENTITY, VIDEOS };
      SS = { levelUpEligible };
    } else {
      S = (await import('/js/state/store.js')).getState;
      P = await import('/js/ui/program.js');
      C = await import('/js/ui/content.js');
      SS = await import('/js/ui/session.js');
    }
    const st = S();
    const out = { XP: C.XP, IDENTITY: C.IDENTITY, VIDEOS: C.VIDEOS, WEEK: P.WEEK, BLOCKS: P.BLOCKS, DOW: P.DOW, seqs: {}, demoKeys: {}, levelUp: {} };
    const names = new Set();
    const rec = (k, seq) => {
      const full = P.addTransitions(seq);
      out.seqs[k] = { full, min: P.estMin(seq) };
      for (const x of full) { names.add(x.name); if (x.prep) names.add(x.prep); }
    };
    for (const band of [true, false]) {
      st.settings.band = band;
      for (let lv = 1; lv <= 5; lv++) {
        st.level = lv;
        for (const m of ['A', 'B', 'C']) rec(`full-${band}-L${lv}-${m}`, P.fullSeq(lv, m));
        for (const k of ['shoulder', 'lower', 'pull', 'none']) rec(`block-${band}-L${lv}-${k}`, P.blockSeq(k, lv));
        rec(`rest-${band}-L${lv}`, P.restSeq(lv));
        rec(`minimal-${band}-L${lv}`, P.minimalSeq(lv));
        P.WEEK.forEach((p, d) => rec(`plan-${band}-L${lv}-d${d}`, P.planSeq(Object.assign({}, p), lv)));
      }
    }
    rec('rain', P.rainSeq());
    for (const n of names) out.demoKeys[n] = window.DT_DEMOS.keyFor(n);
    /* 升級條件：近 7 天都有 session＋近 21 天任一 PR 達該級門檻 */
    const pad = (n) => String(n).padStart(2, '0');
    const day = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const sessions7 = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: day(-i), type: 'full', xp: 10 }));
    const prCases = [['none', {}],
      ['hrp8', { hrp: [{ date: day(0), reps: 8 }] }], ['hrp7', { hrp: [{ date: day(0), reps: 7 }] }],
      ['hrp12', { hrp: [{ date: day(-21), reps: 12 }] }], ['hrp12old', { hrp: [{ date: day(-22), reps: 12 }] }],
      ['hrp15', { hrp: [{ date: day(0), reps: 15 }] }], ['hrp14', { hrp: [{ date: day(0), reps: 14 }] }],
      ['plank60', { plank: [{ date: day(0), sec: 60 }] }], ['plank59', { plank: [{ date: day(0), sec: 59 }] }],
      ['plank90', { plank: [{ date: day(0), sec: 90 }] }], ['plank150', { plank: [{ date: day(0), sec: 150 }] }],
      ['run1500', { run2mi: [{ date: day(0), sec: 1500 }] }], ['run1501', { run2mi: [{ date: day(0), sec: 1501 }] }],
      ['run1320', { run2mi: [{ date: day(0), sec: 1320 }] }], ['run1197', { run2mi: [{ date: day(0), sec: 1197 }] }],
      ['run1198', { run2mi: [{ date: day(0), sec: 1198 }] }]];
    const savedSessions = st.sessions, savedPrs = st.prs;
    for (let lv = 1; lv <= 5; lv++) {
      st.level = lv;
      for (const [label, prs] of prCases) {
        for (const [sl, sess] of [['7d', sessions7], ['gap', sessions7.filter((s, i) => i !== 3)]]) {
          st.sessions = sess;
          st.prs = { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [], ...prs };
          out.levelUp[`L${lv}-${label}-${sl}`] = SS.levelUpEligible();
        }
      }
    }
    st.sessions = savedSessions; st.prs = savedPrs;
    return out;
  }, which);
}

async function todayPlans(page, which, days) {
  const out = {};
  for (const iso of days) {
    await page.clock.pauseAt(new Date(iso));
    out[iso] = await page.evaluate(async (which) => {
      let S, P;
      if (which === 'A') { S = () => state; P = { todayPlan }; } // eslint-disable-line no-undef
      else { S = (await import('/js/state/store.js')).getState; P = await import('/js/ui/program.js'); }
      const st = S();
      const r = {};
      for (const band of [true, false]) {
        st.settings.band = band;
        for (let lv = 1; lv <= 5; lv++) { st.level = lv; r[`${band}-L${lv}`] = P.todayPlan(); }
      }
      return r;
    }, which);
  }
  return out;
}

test('課表資料與規則等價：所有序列、時長、示範對應、XP、影片清單、今日計畫、升級條件', async ({ browser }) => {
  const DAYS = ['2026-10-04T09:00:00+09:00', '2026-10-05T09:00:00+09:00', '2026-10-06T09:00:00+09:00', '2026-10-07T09:00:00+09:00',
    '2026-10-08T09:00:00+09:00', '2026-10-09T09:00:00+09:00', '2026-10-10T09:00:00+09:00', '2026-10-11T09:00:00+09:00',
    '2026-10-18T09:00:00+09:00'];
  const dumps = {};
  for (const which of ['A', 'B']) {
    const ctx = await browser.newContext(contextOptions({ baseURL: ORIGIN[which] }));
    const w = watchContext(ctx);
    try {
      const page = await ctx.newPage();
      await openFor(page, which, { now: '2026-10-04T08:00:00+09:00' });
      dumps[which] = { program: await programDump(page, which), plans: await todayPlans(page, which, DAYS) };
    } finally {
      await ctx.close();
    }
    assertWatchClean(w, which);
  }
  const { program: a } = dumps.A;
  const stepNames = Object.keys(a.demoKeys);
  console.log(`[qa] 課表資料等價：序列 ${Object.keys(a.seqs).length} 組、步驟名稱 ${stepNames.length} 種（無示範 ${stepNames.filter((n) => !a.demoKeys[n]).length} 種：休息／準備類）、` +
    `影片清單 ${a.VIDEOS.length} 列、升級判定 ${Object.keys(a.levelUp).length} 例、今日計畫 ${DAYS.length} 天 × 10`);
  expect(Object.keys(a.seqs).length).toBe(161); // 2 種器材 × 5 級 × (3 伸展組＋4 區塊＋恢復＋保底＋7 天) ＋ 雨天
  expect(Object.values(a.levelUp).some(Boolean)).toBe(true);
  expect(Object.values(a.levelUp).some((v) => !v)).toBe(true);
  expect(dumps.B.program).toEqual(dumps.A.program);
  expect(dumps.B.plans).toEqual(dumps.A.plans);
});
