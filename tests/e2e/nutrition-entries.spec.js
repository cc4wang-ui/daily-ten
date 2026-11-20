/* qa-checker：營養「記實際吃的」＋照片估熱量（D30；契約 runs/photo-kcal/contract.md 的 STOP 1–6）。
   伺服器一律用 page.route 攔下 /api/meal 模擬，不連網；照片是測試裡用 canvas 產生的假 JPEG（雜訊色塊）。
   預期數字由契約的規則在這裡獨立算出（份量倍率逐品項四捨五入、打勾的建議餐按熱量比例分營養素），不呼叫 App 的計算函式。 */
import { test, expect, openApp, dismissCelebrations, liveV4, readFixture, readRepo, seedState, storedState, rawMain, storageSnapshot, clickAndDownload, confirmImportTwice, expectTouchTargets, noHorizontalScroll, expectGlossaryClean, contextOptions, watchContext, assertWatchClean, installClock, swAssets, swCacheOf } from './helpers.js';

const NOW = '2026-11-19T08:30:00+09:00';
const TODAY = '2026-11-19';
const NUT = JSON.parse(readRepo('data/nutrition.json'));
const COPY = NUT.copy;
const FORBIDDEN = [/診斷/, /失敗/, /懲罰/, /漏掉/, /扣/, /羞/, /偷懶/, /不應該/, /超標/, /罪惡/];
const ENTRY_KEYS = ['at', 'carbG', 'fatG', 'id', 'kcal', 'name', 'proteinG', 'slot', 'source'];

const EST = {
  isFood: true,
  items: [
    { name: '雞胸肉', grams: 150, kcal: 165, proteinG: 31, fatG: 4, carbG: 0 },
    { name: '白飯', grams: 200, kcal: 280, proteinG: 5, fatG: 1, carbG: 62 }
  ],
  kcal: 445, proteinG: 36, fatG: 5, carbG: 62, confidence: 'mid'
};
const okJson = (body) => ({ status: 200, contentType: 'application/json; charset=utf-8', body: typeof body === 'string' ? body : JSON.stringify(body) });

const openNutrition = async (page) => {
  await dismissCelebrations(page);
  await page.click('#tabs button[data-s="s-home"]');
  await page.click('#nut-open');
  await expect(page.locator('#s-nutrition')).toHaveClass(/active/);
};
const openSheet = async (page, slot) => {
  await page.click(slot ? `[data-log="${slot}"]` : '#nut-add-extra');
  await expect(page.locator('#nut-sheet')).toBeVisible();
};
/* 假照片：在頁面裡用 canvas 畫雜訊色塊，轉成 JPEG 位元組 */
const makeJpeg = async (page, w = 1600, h = 1200) => {
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = `rgb(${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)},${Math.floor(rnd() * 255)})`; g.fillRect(x, y, 16, 16); }
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, [w, h]);
  return Buffer.from(b64, 'base64');
};
const pickPhoto = async (page, buffer, name = 'meal.jpg', mimeType = 'image/jpeg') => page.setInputFiles('#nut-photo-input', { name, mimeType, buffer });
/* 模擬 /api/meal：記下每次請求；handler(route, n) 決定怎麼回 */
const mockMeal = async (page, handler) => {
  const calls = [];
  await page.route('**/api/meal', async (route) => {
    const req = route.request();
    calls.push({ method: req.method(), url: req.url(), body: req.postData(), contentType: req.headers()['content-type'] });
    await handler(route, calls.length);
  });
  return calls;
};
const nutritionOf = async (page) => (await liveV4(page)).nutrition;
const mealApiRequests = (guard) => guard.requests.filter((u) => /\/api\/meal/.test(u));
const saveManual = async (page, { name, kcal, protein, fat, carb }) => {
  if (name !== undefined) await page.fill('#nut-entry-name', name);
  if (kcal !== undefined) await page.fill('#nut-entry-kcal', String(kcal));
  if (protein !== undefined) await page.fill('#nut-entry-protein', String(protein));
  if (fat !== undefined) await page.fill('#nut-entry-fat', String(fat));
  if (carb !== undefined) await page.fill('#nut-entry-carb', String(carb));
  await page.click('#nut-entry-save');
};
/* 所有看得到的字（含 aria-label、placeholder、title） */
const allStrings = (page, sel) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const out = [root.innerText];
  for (const el of root.querySelectorAll('[aria-label],[placeholder],[title]')) for (const a of ['aria-label', 'placeholder', 'title']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
  return out;
}, sel);
const expectCopyClean = async (page, sel, label) => {
  const texts = await allStrings(page, sel);
  expectGlossaryClean(texts);
  for (const t of texts) for (const re of FORBIDDEN) expect(t, `${label} ${re}`).not.toMatch(re);
};
/* 照片有沒有留在任何地方：localStorage、sessionStorage、Cache Storage、IndexedDB、DOM */
const photoResidue = (page) => page.evaluate(async () => {
  const hits = [];
  const bad = /data:image|base64,|\/9j\/[A-Za-z0-9+/]{16}/;
  for (const [n, s] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i), v = s.getItem(k) || '';
      if (bad.test(k) || bad.test(v)) hits.push(`${n}:${k}`);
    }
  }
  const cacheNames = await caches.keys();
  let cached = 0;
  for (const cn of cacheNames) {
    const c = await caches.open(cn);
    for (const r of await c.keys()) {
      cached += 1;
      if (/api\/meal/.test(r.url) || r.method !== 'GET') hits.push(`cache:${cn}:${r.method} ${r.url}`);
      const res = await c.match(r);
      const t = await res.clone().text();
      if (/base64,\/9j\//.test(t)) hits.push(`cache-body:${cn}:${r.url}`);
    }
  }
  const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
  const dom = [...document.querySelectorAll('img,canvas,[style*="data:image"],[src^="blob:"]')].filter((el) => /^(data|blob):/.test(el.getAttribute('src') || '') || el.tagName === 'CANVAS' && el.closest('#sheet,#s-nutrition')).map((el) => el.outerHTML.slice(0, 80));
  return { hits, cacheNames, cached, dbs, dom, localBytes: [...Array(localStorage.length).keys()].reduce((a, i) => a + (localStorage.getItem(localStorage.key(i)) || '').length, 0) };
});

/* ================= STOP 1、2、3：拍照成功 ================= */
test('拍照估算成功：送出縮圖與補充、顯示品項與合計、份量換算、儲存後各處顯示實際攝取；原本的打勾拿掉、不重複計算', async ({ page }) => {
  await openApp(page, { now: NOW });
  const calls = await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 2400, 1800);
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await page.click('.meal[data-meal="lunch"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,500 / 3,400 kcal');

  await openSheet(page, 'lunch');
  await expect(page.locator('#nut-sheet-t')).toHaveText('記實際吃的 · 午餐');
  await expect(page.locator('#nut-mode-photo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#nut-mode-manual')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#nut-entry-form')).toBeHidden();
  await expect(page.locator('#nut-est')).toBeHidden();
  await expect(page.locator('#nut-photo-privacy')).toHaveText(COPY.photoPrivacy);
  await page.fill('#nut-photo-note', '大碗');
  await pickPhoto(page, jpeg);

  await expect(page.locator('#nut-est')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe('POST');
  expect(new URL(calls[0].url).pathname).toBe(NUT.photo.endpoint);
  expect(calls[0].contentType).toMatch(/^application\/json/);
  const sent = JSON.parse(calls[0].body);
  expect(Object.keys(sent).sort()).toEqual(['image', 'note']);
  expect(sent.note).toBe('大碗');
  expect(sent.image.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(sent.image.length).toBeLessThanOrEqual(1400000);
  expect(sent.image.slice('data:image/jpeg;base64,'.length)).toMatch(/^[A-Za-z0-9+/=]+$/);
  /* 縮圖：長邊 ≤ maxEdgePx、比例不變（原圖 2400×1800） */
  const dims = await page.evaluate((src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => no(new Error('decode')); i.src = src; }), sent.image);
  expect(dims).toEqual([1024, 768]);
  expect(Math.max(...dims)).toBeLessThanOrEqual(NUT.photo.maxEdgePx);

  /* 品項與合計；標「估算」 */
  await expect(page.locator('#nut-est .tag')).toHaveText('估算');
  const rows = () => page.locator('#nut-est-items li').evaluateAll((els) => els.map((e) => [...e.children].map((c) => c.textContent)));
  expect(await rows()).toEqual([['雞胸肉', '150 g', '165 kcal'], ['白飯', '200 g', '280 kcal']]);
  await expect(page.locator('#nut-est-total')).toContainText('估算合計 445 kcal');
  await expect(page.locator('#nut-est-total')).toContainText('蛋白質 36 g · 脂肪 5 g · 碳水 62 g');
  await expect(page.locator('#nut-est-accuracy')).toHaveText(COPY.photoAccuracy);
  await expect(page.locator('[data-portion="same"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('[data-portion]').evaluateAll((els) => els.map((e) => [e.dataset.portion, e.textContent]))).toEqual(NUT.photo.portions.map((p) => [p.id, p.label]));
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  await expect(page.locator('#nut-entry-name')).toHaveValue('雞胸肉、白飯');
  await expect(page.locator('#nut-entry-kcal')).toHaveValue('445');
  await expect(page.locator('#nut-entry-kcal-l')).toContainText('估算');

  /* 少一點 ×0.75：逐品項四捨五入 165→124、280→210；g 150→113、200→150 */
  await page.click('[data-portion="less"]');
  await expect(page.locator('[data-portion="less"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await rows()).toEqual([['雞胸肉', '113 g', '124 kcal'], ['白飯', '150 g', '210 kcal']]);
  await expect(page.locator('#nut-est-total')).toContainText('估算合計 334 kcal');
  await expect(page.locator('#nut-est-total')).toContainText('蛋白質 27 g · 脂肪 4 g · 碳水 47 g');
  await expect(page.locator('#nut-entry-kcal')).toHaveValue('334');
  await page.click('[data-portion="same"]');
  await expect(page.locator('#nut-est-total')).toContainText('估算合計 445 kcal');
  /* 多一點 ×1.25：165→206、280→350 */
  await page.click('[data-portion="more"]');
  expect(await rows()).toEqual([['雞胸肉', '188 g', '206 kcal'], ['白飯', '250 g', '350 kcal']]);
  await expect(page.locator('#nut-est-total')).toContainText('估算合計 556 kcal');
  await expect(page.locator('#nut-est-total')).toContainText('蛋白質 45 g · 脂肪 6 g · 碳水 78 g');
  await expect(page.locator('#nut-entry-kcal')).toHaveValue('556');
  /* 還沒按儲存：state 沒變 */
  expect((await nutritionOf(page)).entries).toEqual({});
  expect((await nutritionOf(page)).meals).toEqual({ [TODAY]: ['breakfast', 'lunch'] });

  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  expect(calls).toHaveLength(1);
  const entry = page.locator('[data-entries="lunch"] .entry[data-entry]');
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('.n')).toHaveText('雞胸肉、白飯');
  await expect(entry.locator('.tag')).toHaveText('估算');
  await expect(entry.locator('.num')).toHaveText('556 kcal');
  /* 700（早餐打勾）＋556（午餐實際）；午餐的 800 不算 */
  await expect(page.locator('#nut-sum')).toHaveText('1,256 / 3,400 kcal');
  await expect(page.locator('#nut-left-kcal')).toHaveText('還差 2,144');
  await expect(page.locator('#nut-count')).toHaveText('2/5');
  await expect(page.locator('.meal[data-meal="lunch"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.meal[data-meal="lunch"] .name .num')).toHaveText('556 kcal');
  /* 早餐打勾的營養素＝目標×700/3400 → 36／19／97；加午餐 45／6／78 */
  expect(await page.locator('#nut-macros li').evaluateAll((els) => els.map((e) => [e.dataset.macro, e.querySelector('b').textContent]))).toEqual([['protein', '81 / 175 g'], ['fat', '25 / 90 g'], ['carb', '175 / 470 g']]);
  await expect(page.locator('#nut-left')).toHaveText('還差 2,144 kcal · 蛋白質還差 94 g');
  await expect(page.locator('#nut-plan-macros')).toHaveText(COPY.planMacros);
  await expect(page.locator('#nut-macros-partial')).toHaveCount(0);

  const n = await nutritionOf(page);
  expect(n.meals).toEqual({ [TODAY]: ['breakfast'] });
  expect(Object.keys(n.entries)).toEqual([TODAY]);
  expect(n.entries[TODAY]).toHaveLength(1);
  const e = n.entries[TODAY][0];
  expect(Object.keys(e).sort()).toEqual(ENTRY_KEYS);
  expect({ ...e, id: null }).toEqual({ id: null, at: '2026-11-19T08:30:00+09:00', slot: 'lunch', name: '雞胸肉、白飯', kcal: 556, proteinG: 45, fatG: 6, carbG: 78, source: 'photo' });
  expect(typeof e.id).toBe('string');
  expect((await storedState(page)).v4.nutrition).toEqual(n);

  await page.click('#nutrition-back');
  await expect(page.locator('#nut-home-sum')).toHaveText('1,256 / 3,400 kcal · 2/5 餐');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#nut-home-sum')).toHaveText('1,256 / 3,400 kcal · 2/5 餐');
  await openNutrition(page);
  await expect(page.locator('[data-entries="lunch"] .entry')).toHaveCount(1);
  await expect(page.locator('#nut-sum')).toHaveText('1,256 / 3,400 kcal');
});

test('拍照估算：沒填補充時 body 只有 image；補充超過 80 字只送 80 字；估算的 kcal 可以改', async ({ page }) => {
  await openApp(page, { now: NOW });
  const calls = await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  await openSheet(page, 'dinner');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  expect(Object.keys(JSON.parse(calls[0].body))).toEqual(['image']);
  /* 小圖不放大 */
  const dims = await page.evaluate((src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.src = src; }), JSON.parse(calls[0].body).image);
  expect(dims).toEqual([640, 480]);
  /* 重拍：補充 maxlength 80 */
  await page.evaluate(() => { const el = document.getElementById('nut-photo-note'); el.removeAttribute('maxlength'); el.value = '字'.repeat(120); });
  await expect(page.locator('#nut-photo-btn')).toContainText('重拍一張');
  await pickPhoto(page, jpeg);
  await expect.poll(() => calls.length).toBe(2);
  await expect(page.locator('#nut-est')).toBeVisible();
  expect([...JSON.parse(calls[1].body).note]).toHaveLength(80);
  /* 改估算值再存 */
  await page.fill('#nut-entry-name', '自己改的名稱');
  await page.fill('#nut-entry-kcal', '500');
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  const e = (await nutritionOf(page)).entries[TODAY][0];
  expect([e.name, e.kcal, e.source, e.slot]).toEqual(['自己改的名稱', 500, 'photo', 'dinner']);
  await expect(page.locator('[data-entries="dinner"] .entry .tag')).toHaveText('估算');
  await expect(page.locator('#nut-sum')).toHaveText('500 / 3,400 kcal');
});

test('照片不保存：儲存後 localStorage、sessionStorage、Cache Storage、IndexedDB、DOM、state 都沒有照片', async ({ page }) => {
  await openApp(page, { now: NOW });
  await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 2000, 1500);
  await openNutrition(page);
  const before = await photoResidue(page);
  await openSheet(page, 'lunch');
  await page.fill('#nut-photo-note', '大碗');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  /* 估算結果顯示中：也沒有照片（不顯示預覽、不留 input 的檔案） */
  const mid = await photoResidue(page);
  expect(mid.hits).toEqual([]);
  expect(mid.dom).toEqual([]);
  expect(await page.locator('#nut-photo-input').evaluate((el) => [el.value, el.files.length])).toEqual(['', 0]);
  expect(await page.locator('#sheet img, #sheet canvas, #sheet picture, #sheet video').count()).toBe(0);
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  const after = await photoResidue(page);
  expect(after.hits).toEqual([]);
  expect(after.dom).toEqual([]);
  expect(after.dbs).toEqual([]);
  expect(after.cacheNames).toEqual(before.cacheNames);
  /* 整份 localStorage 增加的量只有一筆文字紀錄的大小（照片約數十萬字元） */
  expect(after.localBytes - before.localBytes).toBeLessThan(2000);
  const snap = await storageSnapshot(page);
  for (const [k, v] of Object.entries(snap)) { expect(v, k).not.toMatch(/data:image|base64|\/9j\//); expect(v, k).not.toContain('大碗'); }
  const st = await storedState(page);
  const e = st.v4.nutrition.entries[TODAY][0];
  expect(Object.keys(e).sort()).toEqual(ENTRY_KEYS);
  expect(JSON.stringify(st)).not.toMatch(/image|photoData|blob:/);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

/* ================= STOP 4：失敗時退回手動 ================= */
const FAILS = [
  { name: '429 額度用完', copy: 'cap', net: true, reply: (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"cap"}' }) },
  { name: '502 伺服器錯誤', copy: 'failed', net: true, reply: (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"failed"}' }) },
  { name: '500 回 HTML', copy: 'failed', net: true, reply: (route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<html><body>Internal Server Error</body></html>' }) },
  { name: '400 image', copy: 'failed', net: true, reply: (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"image"}' }) },
  { name: '403 origin', copy: 'failed', net: true, reply: (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"origin"}' }) },
  { name: '連線中斷（abort）', copy: 'offline', net: true, reply: (route) => route.abort('connectionreset') },
  { name: '200 但不是 JSON', copy: 'failed', net: false, reply: (route) => route.fulfill(okJson('<<<not json')) },
  { name: '200 空內容', copy: 'failed', net: false, reply: (route) => route.fulfill(okJson('')) },
  { name: '200 回陣列', copy: 'failed', net: false, reply: (route) => route.fulfill(okJson('[1,2,3]')) },
  { name: '200 回 null', copy: 'failed', net: false, reply: (route) => route.fulfill(okJson('null')) },
  { name: 'isFood:false', copy: 'notFood', net: false, reply: (route) => route.fulfill(okJson({ isFood: false, items: [], kcal: 0, proteinG: 0, fatG: 0, carbG: 0, confidence: 'low' })) },
  { name: 'isFood:true 但沒有品項', copy: 'notFood', net: false, reply: (route) => route.fulfill(okJson({ isFood: true, items: [], kcal: 0, confidence: 'low' })) },
  { name: '200 只有 error 欄', copy: 'notFood', net: false, reply: (route) => route.fulfill(okJson({ error: 'parse' })) }
];
for (const c of FAILS) {
  test(`拍照失敗退回手動：${c.name} → 顯示 copy.${c.copy}、不丟例外、手動輸入可存`, async ({ page, guard }) => {
    if (c.net) guard.allowConsoleErrors = true; // 4xx／5xx／中斷時瀏覽器自己印 Failed to load resource
    await openApp(page, { now: NOW });
    const calls = await mockMeal(page, c.reply);
    const jpeg = await makeJpeg(page, 800, 600);
    await openNutrition(page);
    await page.click('.meal[data-meal="snack"]');
    const rawBefore = await rawMain(page);
    await openSheet(page, 'snack');
    await pickPhoto(page, jpeg);
    await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY[c.copy]);
    expect(COPY[c.copy]).toBeTruthy();
    expect(calls).toHaveLength(1);
    await expect(page.locator('#nut-sheet')).toBeVisible();
    await expect(page.locator('#nut-mode-manual')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#nut-entry-form')).toBeVisible();
    await expect(page.locator('#nut-entry-macros')).toBeVisible();
    await expect(page.locator('#nut-est')).toBeHidden();
    await expect(page.locator('#nut-entry-name')).toBeFocused();
    await expect(page.locator('#nut-entry-name')).toHaveValue('');
    await expect(page.locator('#nut-entry-kcal')).toHaveValue('');
    expect(await rawMain(page)).toBe(rawBefore);
    await expectCopyClean(page, '#nut-sheet', c.name);
    /* 可以回去再拍一次（不卡在估算中） */
    await page.click('#nut-mode-photo');
    await expect(page.locator('#nut-photo-btn')).toBeEnabled();
    await expect(page.locator('#nut-photo-btn')).toContainText('拍照');
    await page.click('#nut-mode-manual');
    await saveManual(page, { name: '飯糰', kcal: 420, protein: 9, fat: 3, carb: 88 });
    await expect(page.locator('#sheet')).toBeHidden();
    const n = await nutritionOf(page);
    expect(n.entries[TODAY]).toHaveLength(1);
    expect({ ...n.entries[TODAY][0], id: null }).toEqual({ id: null, at: '2026-11-19T08:30:00+09:00', slot: 'snack', name: '飯糰', kcal: 420, proteinG: 9, fatG: 3, carbG: 88, source: 'manual' });
    expect(n.meals).toEqual({});
    await expect(page.locator('[data-entries="snack"] .entry .tag')).toHaveCount(0);
    await expect(page.locator('#nut-sum')).toHaveText('420 / 3,400 kcal');
    await expect(page.locator('#s-nutrition')).toHaveClass(/active/);
    await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
  });
}

test('離線（navigator.onLine=false）：不送出任何請求，顯示 copy.offline 並給手動輸入；打勾、體重照常', async ({ page, context, guard }) => {
  await openApp(page, { now: NOW });
  const calls = await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 800, 600);
  await openNutrition(page);
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await openSheet(page, 'breakfast');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY.offline);
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  await expect(page.locator('#nut-mode-manual')).toHaveAttribute('aria-pressed', 'true');
  expect(calls).toHaveLength(0);
  expect(mealApiRequests(guard)).toEqual([]);
  await saveManual(page, { name: '蛋餅加豆漿', kcal: 520 });
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-sum')).toHaveText('520 / 3,400 kcal');
  await page.click('.meal[data-meal="dinner"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,420 / 3,400 kcal');
  await page.fill('#nut-weight', '86.7');
  await page.click('#nut-weight-save');
  await expect(page.locator('#nut-weight-msg')).toHaveText('已記錄 86.7 kg。');
  expect(mealApiRequests(guard)).toEqual([]);
  await context.setOffline(false);
});

test('逾時：伺服器一直沒回，到 photo.timeoutMs 才顯示 copy.offline 並給手動輸入；估算中按鈕停用', async ({ page }) => {
  await openApp(page, { now: NOW });
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = await mockMeal(page, async (route) => { await gate; await route.abort().catch(() => {}); });
  const jpeg = await makeJpeg(page, 800, 600);
  await openNutrition(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('#nut-sheet-msg')).toHaveText('估算中…');
  await expect(page.locator('#nut-photo-btn')).toBeDisabled();
  await expect(page.locator('#nut-sheet')).toHaveAttribute('aria-busy', 'true');
  await page.click('#nut-mode-manual');
  await expect(page.locator('#nut-mode-photo')).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(NUT.photo.timeoutMs - 1000);
  await expect(page.locator('#nut-sheet-msg')).toHaveText('估算中…');
  await page.clock.runFor(1500);
  await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY.offline);
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  await expect(page.locator('#nut-sheet')).toHaveAttribute('aria-busy', 'false');
  await saveManual(page, { name: '牛丼', kcal: 760 });
  await expect(page.locator('#nut-sum')).toHaveText('760 / 3,400 kcal');
  release();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('估算中關掉面板：不顯示訊息、不寫入；晚到的回應不會動到畫面或資料', async ({ page }) => {
  await openApp(page, { now: NOW });
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = await mockMeal(page, async (route) => { await gate; await route.fulfill(okJson(EST)).catch(() => {}); });
  const jpeg = await makeJpeg(page, 800, 600);
  await openNutrition(page);
  const rawBefore = await rawMain(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect.poll(() => calls.length).toBe(1);
  await page.click('#nut-sheet-close');
  await expect(page.locator('#sheet')).toBeHidden();
  release();
  await page.clock.runFor(2000);
  await expect(page.locator('#sheet')).toBeHidden();
  expect(await page.locator('#sheet').innerHTML()).toBe('');
  expect(await rawMain(page)).toBe(rawBefore);
  expect((await nutritionOf(page)).entries).toEqual({});
  /* 再開一次是乾淨的 */
  await openSheet(page, 'dinner');
  await expect(page.locator('#nut-sheet-msg')).toHaveText('');
  await expect(page.locator('#nut-est')).toBeHidden();
  await expect(page.locator('#nut-photo-btn')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('選到的檔案不是圖片（讀不出來）：不送請求、顯示 copy.failed、給手動輸入', async ({ page }) => {
  await openApp(page, { now: NOW });
  const calls = await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  await openNutrition(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, Buffer.from('this is not an image at all'), 'note.jpg', 'image/jpeg');
  await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY.failed);
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  expect(calls).toHaveLength(0);
});

/* ================= 安全：伺服器回傳的品名不會變成元素 ================= */
test('XSS：伺服器回傳的品名、手動輸入的名稱含 HTML 都只當文字顯示（估算面板、紀錄列、aria-label、重開後）', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = 0; });
  await openApp(page, { now: NOW });
  const evil1 = '<img src=x onerror=window.__xss=1>';
  const evil2 = '"><svg onload=window.__xss=2>';
  await mockMeal(page, (route) => route.fulfill(okJson({
    isFood: true, confidence: 'high', kcal: 300, proteinG: 1, fatG: 1, carbG: 1,
    items: [
      { name: evil1, grams: 100, kcal: 200, proteinG: 1, fatG: 1, carbG: 1 },
      { name: evil2, grams: 50, kcal: 100, proteinG: 0, fatG: 0, carbG: 0 }
    ]
  })));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  const svgBefore = await page.locator('#s-nutrition svg').count();
  await openSheet(page, 'lunch');
  const sheetSvgBefore = await page.locator('#sheet svg').count();
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  expect(await page.locator('#nut-est-items li .n').allTextContents()).toEqual([evil1, evil2]);
  expect(await page.locator('#nut-est-items li .n *').count()).toBe(0);
  expect(await page.locator('#sheet img').count()).toBe(0);
  expect(await page.locator('#sheet svg').count()).toBe(sheetSvgBefore);
  const prefilled = await page.locator('#nut-entry-name').inputValue();
  expect(prefilled).toBe([...`${evil1}、${evil2}`].slice(0, 40).join(''));
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  const entry = page.locator('[data-entries="lunch"] .entry');
  await expect(entry.locator('.n')).toHaveText(prefilled);
  expect(await entry.locator('.n *').count()).toBe(0);
  expect(await entry.locator('[data-remove-entry]').getAttribute('aria-label')).toBe(`移除 ${prefilled}`);
  /* 手動輸入也一樣 */
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  const evil3 = '\'"><script>window.__xss=3</script>';
  await saveManual(page, { name: evil3, kcal: 10 });
  await expect(page.locator('#nut-extras .entry .n')).toHaveText(evil3);
  expect(await page.locator('#nut-extras .entry .n *').count()).toBe(0);
  expect(await page.locator('#s-nutrition img, #s-nutrition script').count()).toBe(0);
  expect(await page.locator('#s-nutrition svg').count()).toBe(svgBefore + 2 /* 兩筆紀錄各一個移除圖示 */ + 0);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await openNutrition(page);
  await expect(page.locator('[data-entries="lunch"] .entry .n')).toHaveText(prefilled);
  expect(await page.locator('#s-nutrition img, #s-nutrition script, #s-home img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBe(0);
});

test('伺服器回傳怪資料（型別錯、負數、超大值、30 個品項）：不丟例外，數字是非負整數，超出範圍時儲存被擋下並說明', async ({ page }) => {
  await openApp(page, { now: NOW });
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `品項${i}`, grams: 100, kcal: 1000, proteinG: 10, fatG: 10, carbG: 10 }));
  let body = { isFood: true, items: [{ name: 123, grams: 'x', kcal: '300', proteinG: -5, fatG: null, carbG: 1e308 }, null, 'str', { name: '  ', kcal: -1 }, { name: '飯', grams: 1.5, kcal: 2.5, proteinG: NaN }], kcal: 'abc', confidence: 9 };
  await mockMeal(page, (route) => route.fulfill(okJson(body)));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  const text = await page.locator('#nut-est').innerText();
  expect(text).not.toMatch(/NaN|undefined|Infinity|null|-\d/);
  await page.click('[data-portion="more"]');
  expect(await page.locator('#nut-est').innerText()).not.toMatch(/NaN|undefined|Infinity|null|-\d/);
  await page.click('[data-portion="same"]');
  /* 30 個品項、合計 30,000 kcal：存不進去（上限 5,000），中性說明，state 不變 */
  body = { isFood: true, items: many, confidence: 'low' };
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est-total')).toContainText('kcal');
  await expect(page.locator('#nut-entry-kcal')).toHaveValue('30000');
  await page.click('#nut-entry-save');
  await expect(page.locator('#nut-entry-msg')).toHaveText('熱量請輸入 1–5,000 之間的數字。');
  expect((await nutritionOf(page)).entries).toEqual({});
  await page.fill('#nut-entry-kcal', '900');
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  const e = (await nutritionOf(page)).entries[TODAY][0];
  for (const k of ['kcal', 'proteinG', 'fatG', 'carbG']) expect(e[k] === null || (Number.isInteger(e[k]) && e[k] >= 0), `${k}=${e[k]}`).toBe(true);
  expect(e.kcal).toBe(900);
});

/* ================= STOP 1：手動輸入、其他、移除、上限 ================= */
test('手動輸入驗證：名稱空白、kcal 空／0／5001／非數字、營養素超出範圍都不寫入並說明；合格的存成「其他」；可移除', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await expect(page.locator('#nut-extras')).toHaveCount(0);
  const rawBefore = await rawMain(page);
  await openSheet(page, null);
  await expect(page.locator('#nut-sheet-t')).toHaveText('加一筆其他');
  await page.click('#nut-mode-manual');
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  await expect(page.locator('#nut-photo-pane')).toBeHidden();
  const msg = page.locator('#nut-entry-msg');
  const KCAL_MSG = '熱量請輸入 1–5,000 之間的數字。';
  await page.click('#nut-entry-save');
  await expect(msg).toHaveText('請填名稱。');
  await saveManual(page, { name: '   ', kcal: 300 });
  await expect(msg).toHaveText('請填名稱。');
  await saveManual(page, { name: '拿鐵', kcal: '' });
  await expect(msg).toHaveText(KCAL_MSG);
  for (const bad of ['0', '5001', '-5', '0.4', '99999999999999999999']) {
    await saveManual(page, { kcal: bad });
    await expect(msg, bad).toHaveText(KCAL_MSG);
  }
  await page.fill('#nut-entry-kcal', '');
  await page.locator('#nut-entry-kcal').pressSequentially('abc-e');
  await page.click('#nut-entry-save');
  await expect(msg, '非數字').toHaveText(KCAL_MSG);
  await page.fill('#nut-entry-kcal', '180');
  for (const [id, label, bad, max] of [['protein', '蛋白質', '501', '500'], ['fat', '脂肪', '-1', '500'], ['carb', '碳水', '1001', '1,000']]) {
    await page.fill(`#nut-entry-${id}`, bad);
    await page.click('#nut-entry-save');
    await expect(msg, id).toHaveText(`${label}請輸入 0–${max} 之間的數字，或留空。`);
    await page.fill(`#nut-entry-${id}`, '');
  }
  await expectCopyClean(page, '#nut-sheet', '驗證訊息');
  expect(await rawMain(page)).toBe(rawBefore);
  expect((await nutritionOf(page)).entries).toEqual({});
  await expect(page.locator('#nut-sheet')).toBeVisible();

  /* 合格：名稱去頭尾空白、營養素留空＝null */
  await saveManual(page, { name: '  拿鐵  ', kcal: 180 });
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-extras .entry')).toHaveCount(1);
  await expect(page.locator('#nut-extras .entry .n')).toHaveText('拿鐵');
  await expect(page.locator('#nut-extras .entry .tag')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('180 / 3,400 kcal');
  await expect(page.locator('#nut-count')).toHaveText('0/5');
  await expect(page.locator('#nut-left')).toHaveText('還差 3,220 kcal · 蛋白質還差 175 g');
  await expect(page.locator('#nut-macros-partial')).toHaveText(COPY.macrosPartial);
  let n = await nutritionOf(page);
  expect({ ...n.entries[TODAY][0], id: null }).toEqual({ id: null, at: '2026-11-19T08:30:00+09:00', slot: null, name: '拿鐵', kcal: 180, proteinG: null, fatG: null, carbG: null, source: 'manual' });
  /* 邊界值 1 與 5000、營養素 0／500／1000 都收 */
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '一口', kcal: 1, protein: 0, fat: 500, carb: 1000 });
  await expect(page.locator('#sheet')).toBeHidden();
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '吃到飽', kcal: 5000, protein: 500 });
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-extras .entry')).toHaveCount(3);
  await expect(page.locator('#nut-sum')).toHaveText('5,181 / 3,400 kcal');
  await expect(page.locator('#nut-left')).toHaveText('熱量已達標 · 蛋白質已達標');
  await expect(page.locator('#nut-left-kcal')).toHaveText('已達標');
  await page.click('#nutrition-back');
  await expect(page.locator('#nut-home-sum')).toHaveText('5,181 / 3,400 kcal · 0/5 餐');
  await expect(page.locator('#cele')).toBeHidden();
  await openNutrition(page);
  n = await nutritionOf(page);
  expect(n.entries[TODAY].map((e) => [e.name, e.kcal, e.proteinG, e.fatG, e.carbG, e.slot])).toEqual([['拿鐵', 180, null, null, null, null], ['一口', 1, 0, 500, 1000, null], ['吃到飽', 5000, 500, null, null, null]]);
  expect(new Set(n.entries[TODAY].map((e) => e.id)).size).toBe(3);
  await expectCopyClean(page, '#s-nutrition', '超過目標');

  /* 移除 */
  await page.locator('#nut-extras .entry', { hasText: '吃到飽' }).locator('[data-remove-entry]').click();
  await expect(page.locator('#nut-extras .entry')).toHaveCount(2);
  await expect(page.locator('#nut-sum')).toHaveText('181 / 3,400 kcal');
  await page.locator('#nut-extras [data-remove-entry]').first().click();
  await page.locator('#nut-extras [data-remove-entry]').first().click();
  await expect(page.locator('#nut-extras')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  await expect(page.locator('#nut-left')).toHaveCount(0);
  n = await nutritionOf(page);
  expect(n.entries).toEqual({});
  expect((await storedState(page)).v4.nutrition.entries).toEqual({});
});

test('有實際紀錄的餐：打勾鈕點了不做事；舊打勾＋新紀錄不重複計算；移除紀錄後可以再打勾', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await page.click('.meal[data-meal="lunch"]');
  await page.click('.meal[data-meal="dinner"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,700 / 3,400 kcal');
  await openSheet(page, 'lunch');
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '牛肉麵', kcal: 650, protein: 32, fat: 20, carb: 80 });
  await expect(page.locator('#sheet')).toBeHidden();
  /* 650（午餐實際）＋900（晚餐打勾），不是 800＋650＋900 */
  await expect(page.locator('#nut-sum')).toHaveText('1,550 / 3,400 kcal');
  await expect(page.locator('#nut-count')).toHaveText('2/5');
  expect((await nutritionOf(page)).meals).toEqual({ [TODAY]: ['dinner'] });
  const lunch = page.locator('.meal[data-meal="lunch"]');
  await expect(lunch).toHaveAttribute('aria-disabled', 'true');
  await expect(lunch).toHaveClass(/logged/);
  await expect(lunch.locator('.meta')).toHaveText('已記 1 筆，用實際紀錄計算');
  const raw = await rawMain(page);
  /* aria-disabled：Playwright 的一般 click 會等它變成可用，所以用 force 的真實點擊＋直接送 click 事件兩種都試 */
  await lunch.click({ force: true });
  await lunch.dispatchEvent('click');
  await lunch.locator('.circle').click({ force: true });
  await expect(page.locator('#nut-sum')).toHaveText('1,550 / 3,400 kcal');
  expect(await rawMain(page)).toBe(raw);
  expect((await nutritionOf(page)).meals).toEqual({ [TODAY]: ['dinner'] });
  /* 同一餐再加一筆：兩筆相加 */
  await openSheet(page, 'lunch');
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '小菜', kcal: 120 });
  await expect(page.locator('[data-entries="lunch"] .entry')).toHaveCount(2);
  await expect(page.locator('.meal[data-meal="lunch"] .name .num')).toHaveText('770 kcal');
  await expect(page.locator('#nut-sum')).toHaveText('1,670 / 3,400 kcal');
  await expect(page.locator('#nut-count')).toHaveText('2/5');
  /* 移除兩筆：午餐回到沒記（打勾不會自己回來），可以再打勾 */
  await page.locator('[data-entries="lunch"] [data-remove-entry]').first().click();
  await page.locator('[data-entries="lunch"] [data-remove-entry]').first().click();
  await expect(page.locator('[data-entries="lunch"]')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('900 / 3,400 kcal');
  await expect(page.locator('.meal[data-meal="lunch"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.meal[data-meal="lunch"]')).not.toHaveAttribute('aria-disabled', 'true');
  await page.click('.meal[data-meal="lunch"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,700 / 3,400 kcal');
});

test('資料裡同一餐同時有打勾和實際紀錄（舊版寫入或匯入）：只算實際紀錄', async ({ page }) => {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  st.v4.nutrition = { meals: { [TODAY]: ['lunch', 'breakfast'] }, weights: [], entries: { [TODAY]: [{ id: 'x1', at: '2026-11-19T08:00:00+09:00', slot: 'lunch', name: '便當', kcal: 300, proteinG: 10, fatG: 10, carbG: 10, source: 'manual' }, { id: 'x2', at: null, slot: 'brunch-unknown', name: '不認得的餐', kcal: 50, proteinG: null, fatG: null, carbG: null, source: 'manual' }] } };
  const raw = JSON.stringify(st);
  await openApp(page, { now: NOW, seed: seedState(raw) });
  await expect(page.locator('#nut-home-sum')).toHaveText('1,050 / 3,400 kcal · 2/5 餐');
  expect(await rawMain(page), '開啟不寫入').toBe(raw);
  await dismissCelebrations(page); // 關掉慶祝卡會記「已看過」（與營養無關的既有寫入），所以之後用這個時間點當基準
  const base = await rawMain(page);
  await openNutrition(page);
  await expect(page.locator('#nut-sum')).toHaveText('1,050 / 3,400 kcal');
  await expect(page.locator('#nut-extras .entry .n')).toHaveText('不認得的餐');
  expect(await rawMain(page), '看營養畫面不寫入').toBe(base);
  expect((await storedState(page)).v4.nutrition).toEqual(st.v4.nutrition);
});

test('每天 20 筆上限：第 21 筆不寫入，中性說明；移除一筆後可以再記', async ({ page }) => {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  st.v4.nutrition = { meals: {}, weights: [], entries: { [TODAY]: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, at: '2026-11-19T07:00:00+09:00', slot: null, name: `小點${i}`, kcal: 10, proteinG: 1, fatG: 1, carbG: 1, source: 'manual' })) } };
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(st)) });
  await openNutrition(page);
  await expect(page.locator('#nut-extras .entry')).toHaveCount(20);
  await expect(page.locator('#nut-sum')).toHaveText('200 / 3,400 kcal');
  const raw = await rawMain(page);
  await openSheet(page, 'lunch');
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '第 21 筆', kcal: 100 });
  await expect(page.locator('#nut-entry-msg')).toHaveText('今天已經記了 20 筆，先移除一筆再記。');
  await expect(page.locator('#nut-sheet')).toBeVisible();
  await expectCopyClean(page, '#nut-sheet', '上限訊息');
  expect(await rawMain(page)).toBe(raw);
  expect((await nutritionOf(page)).entries[TODAY]).toHaveLength(20);
  await page.click('#nut-sheet-close');
  await expect(page.locator('#sheet')).toBeHidden();
  await page.locator('#nut-extras [data-remove-entry]').first().click();
  await expect(page.locator('#nut-extras .entry')).toHaveCount(19);
  await openSheet(page, 'lunch');
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '第 20 筆', kcal: 100 });
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-sum')).toHaveText('290 / 3,400 kcal');
  const list = (await nutritionOf(page)).entries[TODAY];
  expect(list).toHaveLength(20);
  expect(new Set(list.map((e) => e.id)).size).toBe(20);
});

/* ================= STOP 5：舊資料、備份、XP ================= */
test('fixture v4-entries.json：開啟不寫入，畫面照實際紀錄顯示（估算標記、其他、營養素、還差多少）', async ({ page }) => {
  const raw = readFixture('v4-entries.json');
  await openApp(page, { now: '2026-11-20T20:00:00+09:00', seed: seedState(raw) });
  await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
  /* 早餐打勾 700＋午餐 650＋晚餐 820＋其他 180 */
  await expect(page.locator('#nut-home-sum')).toHaveText('2,350 / 3,400 kcal · 3/5 餐');
  expect(await rawMain(page), '開啟不寫入').toBe(raw);
  await dismissCelebrations(page); // 關掉慶祝卡會記「已看過」（與營養無關的既有寫入）
  const base = await rawMain(page);
  await openNutrition(page);
  await expect(page.locator('#nut-sum')).toHaveText('2,350 / 3,400 kcal');
  await expect(page.locator('[data-entries="lunch"] .entry .n')).toHaveText('牛肉麵');
  await expect(page.locator('[data-entries="lunch"] .entry .tag')).toHaveText('估算');
  await expect(page.locator('[data-entries="dinner"] .entry .n')).toHaveText('便當（排骨）');
  await expect(page.locator('[data-entries="dinner"] .entry .tag')).toHaveCount(0);
  await expect(page.locator('#nut-extras .entry .n')).toHaveText('拿鐵');
  /* 早餐打勾 36／19／97＋牛肉麵 32／20／80＋便當 35／30／95；拿鐵沒填 */
  expect(await page.locator('#nut-macros li b').allTextContents()).toEqual(['103 / 175 g', '69 / 90 g', '272 / 470 g']);
  await expect(page.locator('#nut-left')).toHaveText('還差 1,050 kcal · 蛋白質還差 72 g');
  await expect(page.locator('#nut-macros-partial')).toHaveText(COPY.macrosPartial);
  expect(await rawMain(page), '看營養畫面不寫入').toBe(base);
  expect((await storedState(page)).v4.nutrition).toEqual(JSON.parse(raw).v4.nutrition);
  expect((await liveV4(page)).nutrition).toEqual(JSON.parse(raw).v4.nutrition);
  await expectTouchTargets(page, '#s-nutrition');
  await noHorizontalScroll(page);
});

test('舊 fixture（沒有 entries）與壞的 entries fixture：開啟不出錯卡、不寫入；壞資料被過濾、照片欄不帶出', async ({ browser, baseURL }) => {
  const cases = [
    { name: 'v4-no-nutrition.json', home: '0 / 3,400 kcal · 0/5 餐', entries: 0, extras: 0 },
    { name: 'v3.json', home: '0 / 3,400 kcal · 0/5 餐', entries: 0, extras: 0 },
    { name: 'v3-v2a.json', home: '0 / 3,400 kcal · 0/5 餐', entries: 0, extras: 0 },
    { name: 'v3-phase1.json', home: '0 / 3,400 kcal · 0/5 餐', entries: 0, extras: 0 },
    /* 壞資料：11-20 剩 g1(500)、g2(300)、g3(午餐 300)、g4(1)；打勾早餐 700＋午餐（被實際紀錄取代） */
    { name: 'v4-entries-bad.json', home: '1,801 / 3,400 kcal · 2/5 餐', entries: 4, extras: 3 },
    { name: 'v4-entries-wrong-type.json', home: '700 / 3,400 kcal · 1/5 餐', entries: 0, extras: 0 }
  ];
  for (const c of cases) {
    const context = await browser.newContext(contextOptions());
    const w = watchContext(context);
    const page = await context.newPage();
    const raw = readFixture(c.name);
    const isV4 = !!JSON.parse(raw).v4;
    await openApp(page, { now: '2026-11-20T20:00:00+09:00', seed: seedState(raw), url: `${baseURL}/index.html` });
    if (isV4) expect(await rawMain(page), `${c.name} 開啟不寫入`).toBe(raw);
    await dismissCelebrations(page); // 關掉慶祝卡會記「已看過」（與營養無關的既有寫入），之後用這個時間點當基準
    const base = await rawMain(page);
    await expect(page.locator('#err-card'), c.name).not.toHaveClass(/danger/);
    await expect(page.locator('#boot-error'), c.name).toHaveCount(0);
    await expect(page.locator('#nut-home-sum'), c.name).toHaveText(c.home);
    await page.click('#nut-open');
    await expect(page.locator('#s-nutrition'), c.name).toHaveClass(/active/);
    await expect(page.locator('.entry[data-entry]'), c.name).toHaveCount(c.entries);
    await expect(page.locator('#nut-extras .entry'), c.name).toHaveCount(c.extras);
    expect(await rawMain(page), `${c.name} 看營養畫面不寫入`).toBe(base);
    expect(await page.locator('#s-nutrition').innerHTML(), c.name).not.toMatch(/data:image|base64/);
    await expect(page.locator('#nut-add-extra'), c.name).toBeVisible();
    await expect(page.locator('[data-log]'), c.name).toHaveCount(5);
    if (c.name === 'v4-entries-wrong-type.json') {
      /* entries 型別錯：加一筆之後存成物件，打勾與體重還在 */
      await page.click('#nut-add-extra');
      await page.click('#nut-mode-manual');
      await page.fill('#nut-entry-name', '香蕉');
      await page.fill('#nut-entry-kcal', '90');
      await page.click('#nut-entry-save');
      await expect(page.locator('#nut-sum')).toHaveText('790 / 3,400 kcal');
      const n = (await storedState(page)).v4.nutrition;
      expect(Array.isArray(n.entries)).toBe(false);
      expect(n.entries['2026-11-20'].map((e) => e.name)).toEqual(['香蕉']);
      expect(n.meals).toEqual({ '2026-11-20': ['breakfast'] });
      expect(n.weights).toHaveLength(1);
    }
    assertWatchClean(w, c.name);
    await context.close();
  }
});

test('備份往返：下載的備份含 entries；刪除全部資料後匯入，實際紀錄原樣回來、畫面數字相同', async ({ page }) => {
  await openApp(page, { now: NOW });
  await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '拿鐵', kcal: 180 });
  await expect(page.locator('#sheet')).toBeHidden();
  await page.fill('#nut-weight', '86.7');
  await page.click('#nut-weight-save');
  await expect(page.locator('#nut-sum')).toHaveText('1,325 / 3,400 kcal');
  const expected = await nutritionOf(page);
  expect(expected.entries[TODAY].map((e) => [e.slot, e.name, e.kcal, e.source])).toEqual([['lunch', '雞胸肉、白飯', 445, 'photo'], [null, '拿鐵', 180, 'manual']]);
  await page.click('#nutrition-back');
  await page.click('#h-settings');
  const dl = await clickAndDownload(page, '#bk-download');
  const obj = JSON.parse(dl.text);
  expect((obj.state || obj).v4.nutrition).toEqual(expected);
  expect(dl.text).not.toMatch(/data:image|base64/);
  await page.click('#cfg-wipe');
  await page.clock.runFor(1500);
  await page.click('#cfg-wipe');
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect((await nutritionOf(page))).toEqual({ meals: {}, weights: [], entries: {} });
  await expect(page.locator('#nut-home-sum')).toHaveText('0 / 3,400 kcal · 0/5 餐');
  await page.click('#h-settings');
  await page.fill('#exp-area', dl.text);
  await page.click('#imp-btn');
  await expect(page.locator('#imp-preview')).toBeVisible();
  await confirmImportTwice(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect(await nutritionOf(page)).toEqual(expected);
  expect((await storedState(page)).v4.nutrition).toEqual(expected);
  await expect(page.locator('#nut-home-sum')).toHaveText('1,325 / 3,400 kcal · 2/5 餐');
  await page.click('#nut-open');
  await expect(page.locator('[data-entries="lunch"] .entry .tag')).toHaveText('估算');
  await expect(page.locator('#nut-extras .entry .n')).toHaveText('拿鐵');
  /* 第二次往返結果相同 */
  await page.click('#nutrition-back');
  await page.click('#h-settings');
  const dl2 = await clickAndDownload(page, '#bk-download');
  expect((JSON.parse(dl2.text).state || JSON.parse(dl2.text)).v4.nutrition).toEqual(expected);
});

test('匯入 fixture v4-entries.json（貼上備份文字）：實際紀錄原樣進來', async ({ page }) => {
  const raw = readFixture('v4-entries.json');
  await openApp(page, { now: '2026-11-20T20:00:00+09:00' });
  await page.click('#h-settings');
  await page.fill('#exp-area', raw);
  await page.click('#imp-btn');
  await expect(page.locator('#imp-preview')).toBeVisible();
  await confirmImportTwice(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect(await nutritionOf(page)).toEqual(JSON.parse(raw).v4.nutrition);
  await expect(page.locator('#nut-home-sum')).toHaveText('2,350 / 3,400 kcal · 3/5 餐');
});

test('XP、等級、連續天數、成就不受實際紀錄影響：加照片估算、手動、其他前後，今日與進度畫面、summary、v4 其他欄位完全相同', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v4-no-nutrition.json')) });
  await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 640, 480);
  await dismissCelebrations(page);
  const snap = async () => {
    await page.click('#tabs button[data-s="s-home"]');
    const home = await page.evaluate(() => { const c = document.getElementById('s-home').cloneNode(true); const n = c.querySelector('#nut-open'); if (n) n.remove(); return c.innerText; });
    await page.click('#tabs button[data-s="s-progress"]');
    const progress = await page.locator('#s-progress').innerText();
    await page.click('#tabs button[data-s="s-home"]');
    const summary = await page.evaluate(async () => JSON.stringify((await import(new URL('js/ui/model.js', document.baseURI).href)).summary()));
    const v4 = await liveV4(page);
    delete v4.nutrition;
    return { home, progress, summary, v4, streak: await page.locator('#h-streak').innerText(), xp: await page.locator('.xp-line .num').first().innerText() };
  };
  const before = await snap();
  expect(before.summary.length).toBeGreaterThan(50);
  await openNutrition(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  for (const slot of ['breakfast', 'snack', 'dinner', 'bedtime', null]) {
    await openSheet(page, slot);
    await page.click('#nut-mode-manual');
    await saveManual(page, { name: `實際${slot || '其他'}`, kcal: 800, protein: 40 });
    await expect(page.locator('#sheet')).toBeHidden();
  }
  await expect(page.locator('#nut-count')).toHaveText('5/5');
  await expect(page.locator('#nut-sum')).toHaveText('4,445 / 3,400 kcal');
  await expect(page.locator('#cele')).toBeHidden();
  await page.click('#nutrition-back');
  await expect(page.locator('#cele')).toBeHidden();
  const after = await snap();
  expect(after).toEqual(before);
  /* 移除一筆也不影響 */
  await openNutrition(page);
  await page.locator('[data-remove-entry]').first().click();
  await page.click('#nutrition-back');
  expect(await snap()).toEqual(before);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#cele')).toBeHidden();
  expect(await snap()).toEqual(before);
});

/* ================= 04:00 換日 ================= */
test('畫面開著跨過 04:00：開面板、移除的第一次點擊只重畫成新的一天，不寫入；前一天的紀錄與打勾不動', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T23:00:00+09:00' });
  await openNutrition(page);
  await page.click('.meal[data-meal="lunch"]');
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '宵夜', kcal: 300 });
  await expect(page.locator('#nut-sum')).toHaveText('1,100 / 3,400 kcal');
  const day1 = await nutritionOf(page);
  const raw = await rawMain(page);
  /* 03:59 還是同一天：移除鈕還在、面板打得開 */
  await page.clock.pauseAt(new Date('2026-11-20T03:59:00+09:00'));
  await openSheet(page, 'dinner');
  await page.click('#nut-sheet-close');
  await page.clock.pauseAt(new Date('2026-11-20T04:01:00+09:00'));
  await page.locator('#nut-extras [data-remove-entry]').click();
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  await expect(page.locator('.entry')).toHaveCount(0);
  expect(await rawMain(page)).toBe(raw);
  expect(await nutritionOf(page)).toEqual(day1);
});

test('畫面開著跨過 04:00：按相機與「加一筆其他」的第一次點擊只重畫，不開面板', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T23:00:00+09:00' });
  await openNutrition(page);
  await page.click('.meal[data-meal="lunch"]');
  const raw = await rawMain(page);
  await page.clock.pauseAt(new Date('2026-11-20T07:00:00+09:00'));
  await page.click('[data-log="lunch"]');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('.meal.done')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  expect(await rawMain(page)).toBe(raw);
  await page.click('[data-log="lunch"]');
  await expect(page.locator('#nut-sheet')).toBeVisible();
  await page.click('#nut-sheet-close');
});

test('面板開著跨過 04:00 才儲存（手動與拍照）：存到儲存當下的遊戲日，前一天的打勾與紀錄不動', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T23:00:00+09:00' });
  await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  await page.click('.meal[data-meal="lunch"]');
  await openSheet(page, 'dinner');
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '前一天晚餐', kcal: 700 });
  await expect(page.locator('#nut-sum')).toHaveText('1,500 / 3,400 kcal');
  /* 面板在 23:00 打開，估算結果也出來了；放到隔天 07:00 才按儲存 */
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-20T07:00:00+09:00'));
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  let n = await nutritionOf(page);
  expect(n.meals).toEqual({ '2026-11-19': ['lunch'] });
  expect(Object.keys(n.entries).sort()).toEqual(['2026-11-19', '2026-11-20']);
  expect(n.entries['2026-11-19'].map((e) => [e.slot, e.name, e.kcal])).toEqual([['dinner', '前一天晚餐', 700]]);
  expect(n.entries['2026-11-20'].map((e) => [e.slot, e.name, e.kcal, e.source, e.at])).toEqual([['lunch', '雞胸肉、白飯', 445, 'photo', '2026-11-20T07:00:00+09:00']]);
  /* 畫面是新的一天：只有剛存的那筆 */
  await expect(page.locator('#nut-sum')).toHaveText('445 / 3,400 kcal');
  await expect(page.locator('.entry')).toHaveCount(1);
  await expect(page.locator('.meal.done')).toHaveCount(0);
  /* 03:59 存的算前一天 */
  await page.clock.pauseAt(new Date('2026-11-21T03:59:00+09:00'));
  await openSheet(page, null);
  await page.click('#nut-mode-manual');
  await saveManual(page, { name: '半夜', kcal: 100 });
  n = await nutritionOf(page);
  expect(n.entries['2026-11-20'].map((e) => e.name)).toEqual(['雞胸肉、白飯', '半夜']);
  expect(n.entries['2026-11-21']).toBeUndefined();
  await page.click('#nutrition-back');
  await expect(page.locator('#nut-home-sum')).toHaveText('545 / 3,400 kcal · 1/5 餐');
});

/* ================= STOP 6、版面 ================= */
test('文案與版面：營養畫面與面板（拍照、估算結果、手動、各種訊息）通過用語表與禁用字；觸控目標 ≥44px；375px 不橫向捲動；估算都標「估算」', async ({ page, guard }) => {
  guard.allowConsoleErrors = true; // 429 的 Failed to load resource
  await openApp(page, { now: NOW });
  let mode = 'ok';
  await mockMeal(page, (route) => (mode === 'ok' ? route.fulfill(okJson({ ...EST, items: [...EST.items, { name: '很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長的品名', grams: 1234, kcal: 2345, proteinG: 123, fatG: 123, carbG: 123 }] })) : route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"cap"}' })));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  const panelFits = async (label) => {
    await noHorizontalScroll(page);
    const [sw, cw, right] = await page.locator('#nut-sheet').evaluate((el) => [el.scrollWidth, el.clientWidth, Math.max(...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().right))]);
    expect(sw, `${label} 面板不可橫向捲動`).toBeLessThanOrEqual(cw);
    expect(right, `${label} 面板內容不超出畫面`).toBeLessThanOrEqual(375.5);
  };
  /* 拍照頁 */
  await openSheet(page, 'lunch');
  await expectCopyClean(page, '#nut-sheet', '拍照頁');
  await expectTouchTargets(page, '#sheet');
  await panelFits('拍照頁');
  /* 估算結果 */
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  await expectCopyClean(page, '#nut-sheet', '估算結果');
  await expectTouchTargets(page, '#sheet');
  await panelFits('估算結果');
  await expect(page.locator('#nut-est .tag.nutri')).toHaveText('估算');
  await expect(page.locator('#nut-est-total')).toContainText('估算合計');
  await expect(page.locator('#nut-entry-kcal-l')).toContainText('估算');
  /* 面板可以捲到最下面按到儲存 */
  await page.locator('#nut-entry-save').scrollIntoViewIfNeeded();
  await expect(page.locator('#nut-entry-save')).toBeInViewport();
  /* 額度用完 → 手動頁 */
  mode = 'cap';
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY.cap);
  await expectCopyClean(page, '#nut-sheet', '手動頁');
  await expectTouchTargets(page, '#sheet');
  await panelFits('手動頁');
  await saveManual(page, { name: '很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長很長', kcal: 4999, protein: 500, fat: 500, carb: 1000 });
  await expect(page.locator('#sheet')).toBeHidden();
  mode = 'ok';
  await openSheet(page, null);
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  await page.click('.meal[data-meal="breakfast"]');
  /* 有紀錄的營養畫面 */
  await expectCopyClean(page, '#s-nutrition', '營養畫面');
  await expectTouchTargets(page, '#s-nutrition');
  await noHorizontalScroll(page);
  const right = await page.locator('#s-nutrition').evaluate((el) => Math.max(...[...el.querySelectorAll('.entry, .entry *, .meal-row *')].map((c) => c.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375.5);
  await expect(page.locator('.nut-summary .card-head .tag')).toHaveText('估算');
  await expect(page.locator('#nut-extras .entry .tag')).toHaveText('估算');
  await expect(page.locator('#nut-disclaimer')).toContainText('不是醫療建議');
  await expect(page.locator('#nut-disclaimer')).toContainText('估算');
  await expect(page.locator('#nut-plan-macros')).toContainText('估算');
  await expect(page.locator('.nut-ring')).toHaveAttribute('aria-label', /估算/);
  await page.click('#nutrition-back');
  await expectCopyClean(page, '#s-home', '今日');
  await expectTouchTargets(page, '#s-home');
  await noHorizontalScroll(page);
  /* data/nutrition.json 的新文案本身 */
  expectGlossaryClean(Object.values(COPY));
  for (const [k, v] of Object.entries(COPY)) for (const re of FORBIDDEN) expect(v, `copy.${k} ${re}`).not.toMatch(re);
  for (const k of ['photoPrivacy', 'photoAccuracy', 'offline', 'cap', 'notFood', 'failed', 'macrosPartial', 'planMacros']) expect(COPY[k], k).toBeTruthy();
});

test('面板的鍵盤與焦點：開啟時焦點在面板內、Esc 與點背景可關、關閉後焦點回到原按鈕；面板內 Tab 不會跑到背景', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await openSheet(page, 'snack');
  await expect(page.locator('#nut-sheet')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#nut-sheet')).toHaveAttribute('aria-modal', 'true');
  expect(await page.evaluate(() => document.getElementById('nut-sheet').contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('nut-sheet').contains(document.activeElement)), `Tab ${i}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('[data-log="snack"]')).toBeFocused();
  await openSheet(page, null);
  await page.locator('#sheet').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-add-extra')).toBeFocused();
});

/* ================= 原則 9：動畫 ================= */
test('動畫：營養畫面與面板只動 transform／opacity；prefers-reduced-motion 時沒有任何動畫與轉場', async ({ page }) => {
  await openApp(page, { now: NOW });
  await mockMeal(page, (route) => route.fulfill(okJson(EST)));
  const jpeg = await makeJpeg(page, 640, 480);
  await openNutrition(page);
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  const motion = () => page.evaluate(() => {
    const out = { transitions: [], animations: [] };
    for (const el of document.querySelectorAll('#s-nutrition *, #sheet, #sheet *')) {
      const cs = getComputedStyle(el);
      const durs = cs.transitionDuration.split(',').map((s) => parseFloat(s));
      const props = cs.transitionProperty.split(',').map((s) => s.trim());
      props.forEach((p, i) => { if ((durs[i % durs.length] || 0) > 0) out.transitions.push(p); });
      if (cs.animationName !== 'none') out.animations.push(cs.animationName);
    }
    const keyProps = new Set();
    for (const a of document.getAnimations()) for (const kf of a.effect.getKeyframes()) for (const k of Object.keys(kf)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(k)) keyProps.add(k);
    return { transitions: [...new Set(out.transitions)], animations: [...new Set(out.animations)], keyProps: [...keyProps] };
  });
  const normal = await motion();
  for (const p of normal.transitions) expect(['transform', 'opacity'], `transition ${p}`).toContain(p);
  for (const p of normal.keyProps) expect(['transform', 'opacity'], `keyframe ${p}`).toContain(p);
  await page.click('#nut-sheet-close');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSheet(page, 'lunch');
  await pickPhoto(page, jpeg);
  await expect(page.locator('#nut-est')).toBeVisible();
  const reduced = await motion();
  expect(reduced.transitions).toEqual([]);
  expect(reduced.animations).toEqual([]);
  expect(reduced.keyProps).toEqual([]);
  const tf = await page.locator('#nut-sheet').evaluate((el) => getComputedStyle(el).transform);
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(tf);
});

/* ================= 原則 2：離線（Service Worker） ================= */
test('預快取清單含 js/ui/meal-photo.js；Service Worker 不快取 /api/meal', async () => {
  const { assets } = swAssets();
  expect(assets).toContain('./js/ui/meal-photo.js');
  expect(assets).toContain('./js/ui/nutrition.js');
  expect(assets).toContain('./data/nutrition.json');
  const sw = readRepo('sw.js');
  expect(sw).toMatch(/if \(req\.method !== 'GET'\) return;/);
  expect(sw).not.toMatch(/api\/meal/);
});

test('離線（SW 安裝後斷網重開）：打勾、手動記實際吃的、其他、移除、體重都能用；拍照顯示 copy.offline、不送請求；連線時估算的回應不進快取', async ({ browser, baseURL }) => {
  const context = await browser.newContext(contextOptions({ serviceWorkers: 'allow' }));
  const w = watchContext(context);
  w.allowHosts.add('i.ytimg.com');
  await context.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  let mealHits = 0;
  await context.route('**/api/meal', (route) => { mealHits += 1; return route.fulfill(okJson(EST)); });
  const page = await context.newPage();
  await installClock(page, NOW);
  await page.goto(`${baseURL}/index.html`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const cacheName = swCacheOf(readRepo('sw.js'));
  await page.waitForFunction(async (name) => {
    const keys = await caches.keys();
    if (!keys.includes(name)) return false;
    const c = await caches.open(name);
    return (await c.keys()).length > 30 && !!navigator.serviceWorker.controller;
  }, cacheName, { timeout: 20_000 });
  const jpeg = await makeJpeg(page, 1200, 900);
  /* 連線、SW 控制中：拍照估算一次並儲存 → Cache Storage 沒有 /api/meal、沒有照片 */
  await page.click('#nut-open');
  await page.click('[data-log="lunch"]');
  await page.setInputFiles('#nut-photo-input', { name: 'meal.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('#nut-est')).toBeVisible();
  expect(mealHits).toBe(1);
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  const online = await photoResidue(page);
  expect(online.cacheNames).toEqual([cacheName]);
  expect(online.cached).toBeGreaterThan(30);
  expect(online.hits).toEqual([]);
  expect(online.dbs).toEqual([]);
  expect(await page.evaluate(async (name) => (await (await caches.open(name)).keys()).some((r) => r.url.endsWith('/js/ui/meal-photo.js')), cacheName)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20_000 });
  await dismissCelebrations(page);
  await expect(page.locator('#nut-home-sum')).toHaveText('445 / 3,400 kcal · 1/5 餐');
  await page.click('#nut-open');
  await expect(page.locator('[data-entries="lunch"] .entry .tag')).toHaveText('估算');
  await page.click('.meal[data-meal="breakfast"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,145 / 3,400 kcal');
  /* 離線拍照：不送請求，退回手動 */
  await page.click('[data-log="dinner"]');
  await expect(page.locator('#nut-sheet')).toBeVisible();
  await page.setInputFiles('#nut-photo-input', { name: 'meal.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('#nut-sheet-msg')).toHaveText(COPY.offline);
  await expect(page.locator('#nut-entry-form')).toBeVisible();
  expect(mealHits).toBe(1);
  expect(w.requests.filter((u) => /\/api\/meal/.test(u))).toHaveLength(1);
  await page.fill('#nut-entry-name', '便當');
  await page.fill('#nut-entry-kcal', '820');
  await page.click('#nut-entry-save');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#nut-sum')).toHaveText('1,965 / 3,400 kcal');
  /* 其他＋移除＋體重 */
  await page.click('#nut-add-extra');
  await page.click('#nut-mode-manual');
  await page.fill('#nut-entry-name', '拿鐵');
  await page.fill('#nut-entry-kcal', '180');
  await page.click('#nut-entry-save');
  await expect(page.locator('#nut-sum')).toHaveText('2,145 / 3,400 kcal');
  await page.locator('#nut-extras [data-remove-entry]').click();
  await expect(page.locator('#nut-sum')).toHaveText('1,965 / 3,400 kcal');
  await page.fill('#nut-weight', '86.7');
  await page.click('#nut-weight-save');
  await expect(page.locator('#nut-weight-msg')).toHaveText('已記錄 86.7 kg。');
  /* 離線再重開一次：紀錄還在 */
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20_000 });
  await dismissCelebrations(page);
  await expect(page.locator('#nut-home-sum')).toHaveText('1,965 / 3,400 kcal · 3/5 餐');
  await page.click('#tabs button[data-s="s-gym"]');
  await expect(page.locator('#gym-body')).not.toBeEmpty();
  const offline = await photoResidue(page);
  expect(offline.hits).toEqual([]);
  await context.setOffline(false);
  w.allowConsoleErrors = true; // 離線時縮圖 <img> 載入失敗會印 console error，屬預期
  assertWatchClean(w);
  await context.close();
});
