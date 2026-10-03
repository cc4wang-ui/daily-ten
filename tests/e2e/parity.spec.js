/* qa-checker：拆 module 前後等價比對（PLAN.md §2 #3、#4、§5 #3；M1 完成條件「功能與 main 等價」）。
   只在 PARITY_BASE_DIR 有設時執行（playwright.config 會在 BASE_PORT 起基準伺服器，基準 = ec87e03）。
   每個情境用同一套步驟跑三次：基準（A）、新版（B）、新版再一次（B'）。先要求 B 與 B' 0 px（A/A：確認比對工具沒有雜訊），
   再要求 A 與 B 0 px（A/B）。另外比對各畫面的文字與捲動高度，失敗時診斷較清楚。
   - 時間：假時鐘暫停在指定時間；訓練畫面用 runFor（逐影格，示範動畫相位一致）或 1 秒一步的 fastForward。
   - Math.random 固定為 0（完成畫面的身分句是隨機的）。
   - 畫面逐屏截圖（不用 fullPage：固定的分頁列會飄）；SETUP 逐張 .card 元素截圖，「資料備份」卡除外（M1 刻意新增控制項）。
   - v2 資料加 meta.lastBackupAt = 當下（main 會忽略這個欄位；新版就不會出現提醒卡）。
   - Chromium 加 --disable-partial-raster（圓角邊緣 ±1 像素雜訊）。
   - 掛上示範動畫前先把假時鐘對齊 16 ms 影格（alignFrame）：重播時鐘紀錄時 ticks 會帶入幾毫秒的真實時間差，
     影格格點不同會讓 runFor 視窗內的影格數差 1，示範人偶姿勢就差幾百 px（A/A 也會出現，屬於比對工具的雜訊）。
   - SETUP 卡片截圖時讓「資料備份」卡 display:none（兩版都套用）：新版這張卡較高，後面卡片的頁面座標會差小數像素，
     文字點陣化位置不同（位置造成的雜訊，不是畫面差異）。資料備份卡裡兩版共有的舊控制項另外比文字。
   - 空資料情境練完後，新版依條件出現備份提醒卡（刻意差異）：斷言它出現，再遮掉它比對其餘畫面。
   QA_SHOTS_DIR 有設時，所有截圖另存到該目錄（報告引用的證據）。 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
const HIDE_TABS = '#tabs{visibility:hidden !important}';
const HIDE_BACKUP_CARD = '#s-setup .card:has(#exp-btn){display:none !important}';

/* 讓假時鐘的 ticks 落在 16 ms 格點上（rAF 影格格點），之後 runFor 的影格序列在每次執行都相同 */
async function alignFrame(page) {
  const t = Math.round(await page.evaluate(() => performance.now()));
  const r = (16 - (t % 16)) % 16;
  if (r) await page.clock.runFor(r);
}

test.skip(!process.env.PARITY_BASE_DIR, '未設定 PARITY_BASE_DIR（拆 module 前的基準目錄），略過等價比對');
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

/* ---------- 截圖工具 ---------- */
class Capture {
  constructor(page) { this.page = page; this.shots = new Map(); this.facts = new Map(); }
  async screen(name, { maskReminder = false } = {}) {
    const page = this.page;
    if (maskReminder && await page.locator('#bk-reminder').count()) {
      /* 只有新版有提醒卡：斷言依條件出現（有紀錄、從未備份），再暫時隱藏以比對其餘畫面 */
      await expect(page.locator('#bk-reminder')).toBeVisible();
      await page.evaluate(() => {
        const st = document.createElement('style');
        st.id = 'qa-mask-reminder';
        st.textContent = '#bk-reminder{display:none !important}';
        document.head.appendChild(st);
      });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: window.innerHeight }));
    this.facts.set(`${name}.scrollHeight`, h);
    const n = Math.max(1, Math.ceil(h / vh));
    for (let i = 0; i < n; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * vh);
      this.shots.set(`${name}@${i}`, await page.screenshot());
    }
    await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('qa-mask-reminder')?.remove(); });
  }
  async viewport(name) { this.shots.set(name, await this.page.screenshot()); }
  async text(name, selector) {
    this.facts.set(`${name}.text`, await this.page.locator(selector).evaluate((el) => el.innerText));
  }
  /* SETUP：逐張卡片元素截圖，「資料備份」卡除外；另外比第一屏（標題＋第一張卡上半） */
  async setupCards(name) {
    const page = this.page;
    await page.evaluate(() => window.scrollTo(0, 0));
    this.shots.set(`${name}@0`, await page.screenshot());
    const cards = page.locator('#s-setup .card');
    const n = await cards.count();
    const titles = [];
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const title = (await card.locator('h3').first().textContent()).trim();
      titles.push(title);
      if (title === '資料備份') {
        /* 兩版共有的舊控制項：文字與 placeholder 相同 */
        this.facts.set(`${name}-backup-old-controls`, await page.evaluate(() => [
          document.getElementById('exp-btn').textContent, document.getElementById('imp-btn').textContent,
          document.getElementById('exp-area').placeholder].join('｜')));
        continue;
      }
      this.shots.set(`${name}-card-${i}-${title}`, await card.screenshot({ style: `${HIDE_TABS}\n${HIDE_BACKUP_CARD}` }));
      this.facts.set(`${name}-card-${i}.text`, await card.evaluate((el) => el.innerText));
    }
    this.facts.set(`${name}.cards`, titles.join('｜'));
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

async function tab(page, id) {
  await page.click(`#tabs button[data-s="${id}"]`);
  await expect(page.locator(`#${id}`)).toHaveClass(/active/);
}

/* ---------- 情境（A、B 兩版跑同一套步驟；只用兩版都有的元素） ---------- */
async function standardScreens(cap, page, prefix) {
  await cap.screen(`${prefix}-home`);
  await cap.text(`${prefix}-home`, '#s-home');
  await tab(page, 's-hist');
  await cap.screen(`${prefix}-records`);
  await cap.text(`${prefix}-records`, '#s-hist');
  await tab(page, 's-body');
  await cap.screen(`${prefix}-body`);
  await cap.text(`${prefix}-body`, '#s-body');
  await tab(page, 's-setup');
  await cap.setupCards(`${prefix}-setup`);
  await tab(page, 's-home');
}

async function demoModal(cap, page, prefix) {
  await tab(page, 's-setup');
  await alignFrame(page);
  await page.locator('#vids button[data-demo]').first().click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await page.clock.runFor(1_000); // 動畫跑 1 秒（逐影格）
  await cap.viewport(`${prefix}-demo-modal`);
  await page.click('#dm-close');
  await alignFrame(page);
  await page.locator('#vids button[data-demo]').nth(12).click();
  await page.clock.runFor(700);
  await cap.viewport(`${prefix}-demo-modal-2`);
  await page.click('#dm-close');
  await tab(page, 's-home');
}

/* 開始一段訓練 → 跑 ms 毫秒（逐影格）→ 暫停截圖 → 結束 */
async function pausedTraining(cap, page, prefix, button, ms = 12_000) {
  await alignFrame(page);
  await page.click(button);
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

async function minimalToDone(cap, page, prefix) {
  await alignFrame(page);
  await page.click('#h-minimal');
  await tickUntil(page, () => !document.getElementById('train').classList.contains('active'), { every: 1, maxSeconds: 900 });
  await expect(page.locator('#done')).toHaveClass(/active/);
  await cap.viewport(`${prefix}-done`);
  cap.facts.set(`${prefix}-done.text`, await page.locator('#done').evaluate((el) => el.innerText));
  await page.click('#d-ok');
}

async function bossFlow(cap, page, prefix, item, { maskReminder = false } = {}) {
  await alignFrame(page);
  await page.click('#h-start');
  if (item === 'hrp' || item === 'plank') {
    const phase = item === 'hrp' ? 'BOSS · HRP' : 'BOSS · PLANK';
    await tickUntil(page, (p) => document.getElementById('t-phase').textContent === p, { arg: phase, every: 1, maxSeconds: 2400 });
    await tick(page, 20);
    await cap.viewport(`${prefix}-boss-test`);
    cap.facts.set(`${prefix}-boss-test.text`, await page.locator('#train').evaluate((el) => el.innerText));
    if (item === 'plank') await page.click('#t-abort');
  }
  await tickUntil(page, () => document.getElementById('s-boss').classList.contains('active'), { every: 1, maxSeconds: 2400 });
  await cap.screen(`${prefix}-boss-input`);
  await cap.text(`${prefix}-boss-input`, '#s-boss');
  if (item === 'hrp') await page.fill('#bi-1', '16');
  if (item === 'run2mi') { await page.fill('#bi-m', '19'); await page.fill('#bi-s', '42'); }
  await page.click('#bi-save');
  await expect(page.locator('#done')).toHaveClass(/active/);
  await cap.viewport(`${prefix}-boss-done`);
  cap.facts.set(`${prefix}-boss-done.text`, await page.locator('#done').evaluate((el) => el.innerText));
  await page.click('#d-ok');
  await cap.screen(`${prefix}-home-after`, { maskReminder });
  await tab(page, 's-hist');
  await cap.screen(`${prefix}-records-after`);
}

const SCENARIOS = [
  {
    name: '週五 空資料', now: NOW_ISO, seed: null,
    async run(cap, page) {
      await standardScreens(cap, page, 'fri-empty');
      await demoModal(cap, page, 'fri-empty');
      await pausedTraining(cap, page, 'fri-empty', '#h-start');
      await minimalToDone(cap, page, 'fri-empty');
      await cap.screen('fri-empty-home-after', { maskReminder: true });
      await tab(page, 's-hist');
      await cap.screen('fri-empty-records-after');
    }
  },
  {
    name: '週五 v2 資料', now: NOW_ISO, seed: () => v2WithBackup(NOW_ISO),
    async run(cap, page) {
      await standardScreens(cap, page, 'fri-v2');
      await demoModal(cap, page, 'fri-v2');
      await pausedTraining(cap, page, 'fri-v2', '#h-start');
      await pausedTraining(cap, page, 'fri-v2-plus', '#h-plus', 20_000);
      await pausedTraining(cap, page, 'fri-v2-rain', '#h-rain', 15_000);
      await minimalToDone(cap, page, 'fri-v2');
      await cap.screen('fri-v2-home-after');
      /* BODY 輸入、彈力帶開關（課表與時長重算） */
      await tab(page, 's-body');
      await page.fill('#bd-weight', '68.4');
      await page.fill('#bd-waist', '79.5');
      await page.click('#bd-save');
      await page.fill('#bd-pushup', '-3');
      await page.click('#bd-save3');
      await cap.screen('fri-v2-body-after');
      await tab(page, 's-setup');
      await page.click('#cfg-band');
      await cap.setupCards('fri-v2-setup-band');
      await tab(page, 's-home');
      await cap.screen('fri-v2-home-band');
    }
  },
  {
    name: '週三 v2 資料（加練日）', now: '2026-09-30T07:00:00+09:00', seed: () => v2WithBackup('2026-09-30T07:00:00+09:00'),
    async run(cap, page) {
      await cap.screen('wed-v2-home');
      await cap.text('wed-v2-home', '#s-home');
      await pausedTraining(cap, page, 'wed-v2-plus', '#h-plus', 30_000);
      await tab(page, 's-setup');
      await cap.setupCards('wed-v2-setup');
    }
  },
  {
    name: '週六 v2 資料（恢復日）', now: '2026-10-03T07:00:00+09:00', seed: () => v2WithBackup('2026-10-03T07:00:00+09:00'),
    async run(cap, page) {
      await cap.screen('sat-v2-home');
      await cap.text('sat-v2-home', '#s-home');
      await pausedTraining(cap, page, 'sat-v2', '#h-start', 25_000);
    }
  },
  {
    name: '週日 v2 資料（2 英里）', now: '2026-10-11T08:00:00+09:00', seed: () => v2WithBackup('2026-10-11T08:00:00+09:00'),
    async run(cap, page) {
      await standardScreens(cap, page, 'sun-run-v2');
      await pausedTraining(cap, page, 'sun-run-v2', '#h-start');
      await bossFlow(cap, page, 'sun-run-v2', 'run2mi');
    }
  },
  {
    name: '週日 空資料（HRP）', now: '2026-10-18T08:00:00+09:00', seed: null,
    async run(cap, page) {
      await cap.screen('sun-hrp-empty-home');
      await cap.text('sun-hrp-empty-home', '#s-home');
      await bossFlow(cap, page, 'sun-hrp-empty', 'hrp', { maskReminder: true });
    }
  },
  {
    name: '週五 v3 被改回 v2（今日已完成、可升級）', now: NOW_ISO, seed: () => readFixture('v3-reverted-to-v2.json'),
    async run(cap, page) {
      await cap.screen('fri-rev-home');
      await cap.text('fri-rev-home', '#s-home');
      await page.click('#h-levelup');
      await expect(page.locator('#h-level')).toHaveText('L4');
      await cap.screen('fri-rev-home-L4');
      await cap.text('fri-rev-home-L4', '#s-home');
      await tab(page, 's-setup');
      await cap.setupCards('fri-rev-setup-L4');
      await tab(page, 's-hist');
      await cap.screen('fri-rev-records');
      await tab(page, 's-body');
      await cap.screen('fri-rev-body');
    }
  },
  {
    name: '週日 v2 資料（Plank）', now: '2026-10-04T08:00:00+09:00', seed: () => v2WithBackup('2026-10-04T08:00:00+09:00'),
    async run(cap, page) {
      await cap.screen('sun-plank-v2-home');
      await cap.text('sun-plank-v2-home', '#s-home');
      await bossFlow(cap, page, 'sun-plank-v2', 'plank');
    }
  }
];

/* ---------- 跑一次、比對 ---------- */
async function runOnce(browser, which, scenario) {
  const ctx = await browser.newContext(contextOptions({ baseURL: ORIGIN[which[0]] }));
  const w = watchContext(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(() => { Math.random = () => 0; });
  const cap = new Capture(page);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  try {
    await openApp(page, { now: scenario.now, seed: scenario.seed ? seedState(scenario.seed()) : null });
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

test.describe('等價比對：基準 ec87e03 vs 新版（A/A 後 A/B）', () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ browser }, testInfo) => {
      const B1 = await runOnce(browser, 'B', scenario);
      const B2 = await runOnce(browser, "B'", scenario);
      const aa = await compare(B1, B2, 'AA', testInfo);
      const A = await runOnce(browser, 'A', scenario);
      const ab = await compare(A, B1, 'AB', testInfo);
      console.log(`[qa] 等價比對「${scenario.name}」：截圖 ${ab.shots} 張、文字／高度 ${ab.facts} 項；A/A 不同 ${aa.problems.length}、A/B 不同 ${ab.problems.length}`);
      expect(aa.problems, 'A/A（新版自比）應為 0 px：比對工具本身有雜訊').toEqual([]);
      expect(ab.problems, 'A/B（基準 vs 新版）應為 0 px').toEqual([]);
    });
  }
});

/* ---------- SETUP 結構（D23）：新版只多最下方一行版本 ----------
   #s-setup 的直接子元素逐一比對（標籤、id、class、卡片標題／文字）：新版 = 基準的全部子元素（順序相同）＋最後一個
   <p id="app-version">（不在任何 .card 內）。逐卡截圖比對在上面的情境裡（SW 被封鎖 → 版本行隱藏，不影響卡片）。 */
test('SETUP 結構：新版 = 基準的子元素（逐卡、順序相同）＋最下方一行版本（#app-version，不在 .card 內）', async ({ browser }) => {
  const outline = {};
  for (const which of ['A', 'B']) {
    const ctx = await browser.newContext(contextOptions({ baseURL: ORIGIN[which] }));
    const w = watchContext(ctx);
    try {
      const page = await ctx.newPage();
      await openApp(page, { seed: seedState(v2WithBackup(NOW_ISO)) });
      await tab(page, 's-setup');
      outline[which] = await page.evaluate(() => [...document.getElementById('s-setup').children].map((el) => ({
        tag: el.tagName, id: el.id, cls: el.className, hidden: el.hidden,
        label: el.classList.contains('card') ? (el.querySelector('h3') ? el.querySelector('h3').textContent.trim() : '') : el.textContent.trim().slice(0, 60)
      })));
    } finally {
      await ctx.close();
    }
    assertWatchClean(w, which);
  }
  console.log(`[qa] SETUP 子元素：基準 ${outline.A.length} 個、新版 ${outline.B.length} 個；卡片 ${outline.A.filter((e) => e.cls === 'card').length} 張`);
  expect(outline.B.slice(0, outline.A.length)).toEqual(outline.A);
  /* SW 被封鎖（等價比對的 context）→ 版本行隱藏、沒有文字 */
  expect(outline.B.slice(outline.A.length)).toEqual([{ tag: 'P', id: 'app-version', cls: 'small', hidden: true, label: '' }]);
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
      await openApp(page, { now: '2026-10-04T08:00:00+09:00' });
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
