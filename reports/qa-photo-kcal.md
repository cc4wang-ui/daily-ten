# QA：記實際吃的＋照片估熱量（D30）— 第 1 輪

- Verdict：**PASS**
- 分支 `claude/jolly-darwin-gt2nhc`，HEAD `416324b`（驗收期間多了一個純文件 commit `416324b`；程式碼與 `468d46e` 相同）
- 判準：`runs/photo-kcal/contract.md` STOP 1–7、`CLAUDE.md` §9（1、2、4、5）、§2 原則＋D30 例外
- 日期：2026-11-20。驗收員沒有改任何產品碼。

## 指令總計

| 指令 | 結果 |
|---|---|
| `npm run lint` | exit 0，0 個問題 |
| `npm run test:unit` | 45 tests／45 pass／0 fail |
| `npm run check:glossary` | 掃描 40 檔、UI 字串 1478 筆：新增違規 0、既有違規 0 |
| `npm run check:repo` | 通過（App 檔 45 個、預快取 46 項、CACHE `daily-ten-v40`，main 為 v39） |
| `npm test -- --trace off`（Playwright 全部，跑一次） | **442 passed**，0 failed，0 skipped（1.2 分） |

其中 `tests/e2e/nutrition.spec.js` 13 個、新增的 `tests/e2e/nutrition-entries.spec.js` 38 個。

## STOP 逐條

| # | 項目 | 結果 | 證據（`tests/e2e/nutrition-entries.spec.js` 的測試名稱，除非另註） |
|---|---|---|---|
| 1 | 每餐三種記法＋「其他」 | PASS | 「逐餐打勾 1 次點擊…」（nutrition.spec.js，照舊）；「拍照估算成功…」；「手動輸入驗證…存成『其他』；可移除」；「有實際紀錄的餐：打勾鈕點了不做事…」；「每天 20 筆上限…」 |
| 2 | 熱量環、今日卡顯示實際攝取；還差多少 kcal、蛋白質還差幾 g | PASS | 「拍照估算成功…」：早餐打勾 700＋午餐實際 556 → `#nut-sum`「1,256 / 3,400 kcal」、今日卡「1,256 / 3,400 kcal · 2/5 餐」、`#nut-left`「還差 2,144 kcal · 蛋白質還差 94 g」、營養素 81／25／175（預期值在測試裡照契約獨立算）；原本午餐的打勾被拿掉、800 不重複計算。「資料裡同一餐同時有打勾和實際紀錄…只算實際紀錄」。達標後顯示「熱量已達標 · 蛋白質已達標」 |
| 3 | 縮圖 → POST `/api/meal` → 品項與合計 → 份量 → 儲存；照片不存任何地方 | PASS | 「拍照估算成功…」：body 的 key 只有 `image`、`note`；`image` 以 `data:image/jpeg;base64,` 開頭、長度 ≤ 1,400,000；2400×1800 的原圖送出時是 1024×768；少一點 334／剛好 445／多一點 556 kcal（逐品項四捨五入）。「…沒填補充時 body 只有 image；補充超過 80 字只送 80 字」（640×480 不放大）。「照片不保存…」：儲存後 localStorage、sessionStorage、Cache Storage、IndexedDB、DOM 都沒有 `data:image`／base64；entry 的欄位只有 `id, at, slot, name, kcal, proteinG, fatG, carbG, source`；localStorage 增加量 < 2,000 字元；補充文字也沒存。SW 開啟時 Cache Storage 沒有 `/api/meal`（「離線（SW 安裝後斷網重開）…」）；`sw.js` 對非 GET 直接 return |
| 4 | 離線、逾時、伺服器錯誤、不是食物：不白屏、不丟例外、中性訊息、直接給手動輸入；其他功能離線照舊 | PASS | 13 個「拍照失敗退回手動：…」（429→`copy.cap`；502、500 HTML、400、403、200 非 JSON／空／陣列／null→`copy.failed`；連線中斷→`copy.offline`；`isFood:false`、沒有品項、只有 error 欄→`copy.notFood`），每個都驗：無 page error、手動表單出現且焦點在名稱、之後手動儲存成功。「離線（navigator.onLine=false）：不送出任何請求…」；「逾時：…到 photo.timeoutMs 才顯示 copy.offline…」（59 秒仍在估算中、60.5 秒退回手動）；「估算中關掉面板…晚到的回應不會動到畫面或資料」；「選到的檔案不是圖片…」；「離線（SW 安裝後斷網重開）：打勾、手動記實際吃的、其他、移除、體重都能用…」 |
| 5 | 舊資料不壞、不寫入；備份往返；XP、連續天數、成就不變 | PASS | 「舊 fixture（沒有 entries）與壞的 entries fixture…」（v3、v3-v2a、v3-phase1、v4-no-nutrition、v4-entries-bad、v4-entries-wrong-type：無錯誤卡；v4 的開啟後 localStorage 原文與 fixture 相同；看營養畫面也不寫入；壞資料過濾後 1,801 kcal、圖片欄不進 DOM）；「fixture v4-entries.json：開啟不寫入…」；「備份往返：下載的備份含 entries…」（往返兩次相同）；「匯入 fixture v4-entries.json…」；「XP、等級、連續天數、成就不受實際紀錄影響…」（加 6 筆、移除 1 筆、重開：今日畫面文字（扣掉營養卡）、進度畫面文字、`summary()`、`v4` 其他欄位前後完全相同，沒有慶祝卡）；unit「營養是工具卡…」 |
| 6 | 估算都標「估算」；無診斷、羞辱、懲罰語氣；通過用語表 | PASS | 「文案與版面…」：營養畫面、今日、面板的拍照頁／估算結果／手動頁（含 aria-label、placeholder、title）與 `data/nutrition.json` 的 `copy.*` 全部過 `expectGlossaryClean` 與禁用字（診斷、失敗、懲罰、漏掉、扣、羞、偷懶、不應該、超標、罪惡）；13 個失敗情境、驗證訊息、20 筆上限訊息、超過目標的畫面也各驗一次。估算標記：估算結果卡、合計、kcal 欄位標籤、照片來的紀錄列、每日目標卡、熱量環 aria-label。`npm run check:glossary` 新增違規 0 |
| 7 | 正式站 `/api/meal` 真照片回 200 與合理數字 | PASS | 見下節（只打了 1 次 200） |

### STOP 7 實測（2026-11-20，正式站）

| 請求 | 結果 |
|---|---|
| POST＋origin＋雞肉沙拉碗照片（`req.json`，157 KB） | `HTTP=200 t=13.2s`，`cache-control: no-store`；8 項：烤雞胸肉 150 g 165 kcal、玉米 86、紅色番茄 9、紅色洋蔥 16、青椒 8、黃豆芽 20、鹽煮蛋 70、沙拉醬 45；合計 **419 kcal**、蛋白質 41 g、脂肪 15 g、碳水 32 g、`confidence: low`。合計等於各品項相加，數字合理 |
| POST 不帶 origin | `{"error":"origin"}` `HTTP=403` |
| GET | `{"error":"method"}` `HTTP=405` |
| POST `image` 是 `data:image/png…` | `{"error":"image"}` `HTTP=400` |
| POST body 不是 JSON／base64 段含 `<script>` | 都是 `{"error":"image"}` `HTTP=400` |

## DoD（CLAUDE.md §9）

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | `npm test` 全綠 | PASS | 442 passed |
| 2 | `sw.js` CACHE +1、新檔在預快取 | PASS | v39 → v40；`./js/ui/meal-photo.js` 在 ASSETS；`check:repo` 通過；「預快取清單含 js/ui/meal-photo.js…」；SW 安裝後 Cache Storage 實際有這個檔 |
| 3 | 動作同步 | 不適用 | 沒有動到動作 |
| 4 | `PROJECT_STATE.md` 更新；README 網址 | PASS | `PROJECT_STATE.md` 第 3 行有 D30 紀錄與踩坑；README 未變（不適用） |
| 5 | UI 字串通過用語表 | PASS | `check:glossary` 新增違規 0；e2e 畫面字串 0 違規 |

## 其他檢查

| 項目 | 結果 | 證據 |
|---|---|---|
| 04:00 換日 | PASS | 「畫面開著跨過 04:00：開面板、移除的第一次點擊只重畫…」（03:59 仍是當天；04:01 點移除只重畫、localStorage 原文不變）；「…按相機與『加一筆其他』的第一次點擊只重畫，不開面板」；「面板開著跨過 04:00 才儲存（手動與拍照）…」（23:00 開面板、隔天 07:00 儲存 → 存在 11-20，11-19 的打勾與紀錄不動；03:59 存的算前一天） |
| 手動輸入驗證 | PASS | 名稱空白／全空白、kcal 空、0、5001、−5、0.4、超大值、非數字，營養素 501／−1／1001：都不寫入並顯示範圍；邊界 1、5000、0／500／1000 收 |
| 觸控目標 ≥44px、375px 不橫向捲動 | PASS | 「文案與版面…」：`#sheet` 三種狀態、有紀錄的營養畫面、今日；面板內容右緣 ≤ 375；儲存鈕捲得到 |
| 面板鍵盤與焦點 | PASS | 「面板的鍵盤與焦點…」：`role=dialog`、Tab 不離開面板、Esc／點背景關閉、焦點回原按鈕 |
| 動畫只動 transform／opacity；reduced-motion | PASS | 「動畫：…」：營養畫面與面板上有作用的 transition 與 keyframe 屬性只有 transform、opacity；`prefers-reduced-motion: reduce` 時 transition、animation 都是 0 個 |
| XSS：伺服器品名、手動名稱 | PASS | 「XSS：…」：品名 `<img src=x onerror=…>`、`"><svg onload=…>`、手動 `'"><script>…` 在估算面板、紀錄列、aria-label、重開後都只是文字，沒有新元素，`window.__xss` 沒被改 |
| 伺服器回怪資料 | PASS | 「伺服器回傳怪資料…」：型別錯、負數、1e308、30 個品項：畫面沒有 NaN／undefined／負數；合計 30,000 kcal 存不進去並顯示範圍；存進去的都是非負整數或 null |
| 前端沒有金鑰、沒有外部 AI 網址 | PASS | `check:repo` 通過；`js/` 內 `fetch(` 只有 `js/ui/model.js`（讀 `./data/*.json`）與 `js/ui/meal-photo.js`（`photo.endpoint`，同網域）；每個 e2e 的 guard 都驗「外部網路請求＝0」 |
| 數字來自 `data/nutrition.json` | PASS | endpoint、maxEdgePx、jpegQuality、timeoutMs、portions、copy 都在 JSON（測試從 JSON 讀預期值）。例外見非阻擋 3 |
| Worker `tools/deploy/worker/meal.js` | PASS（閱讀＋實測） | 只收 POST、Origin 白名單、JPEG data URL 前綴＋base64 字元＋長度上限；不寫任何儲存；`console.error` 只印模型名稱與錯誤訊息前 200 字，不印 image／note；輸出經 `clean()`：最多 8 項、品名去 `<>` 截 40 字、數字夾在上限內、合計由伺服器重算、`confidence` 白名單；回應 `application/json`＋`no-store`；note 去換行與 `<>`、截 80 字 |

## 阻擋項

無。

## 非阻擋（不影響 Verdict）

1. `tools/deploy/api/meal.js`（沒上線的備援，走 Vercel AI Gateway 的付費模型，讀 `AI_GATEWAY_API_KEY` 環境變數名稱）與 D30「沒有金鑰、不產生費用」不一致。`docs/DEPLOY.md` 已寫「綁卡前不要部署」，`.vercelignore` 也排除 `tools`，目前不會上線；要部署它之前需要 Cross 另外同意。
2. Worker 先 `request.text()` 讀完整個 body 才檢查長度；沒有每個來源的限流（Origin 可假造，文件已載明最壞情況是當天免費額度被用完）。不涉及資料或費用。「免費額度用完就停、不會收費」取決於 Cloudflare 帳號方案，這次無法從外部驗證。
3. 幾個數字寫在程式裡而不是 `data/nutrition.json`：`js/ui/meal-photo.js` 的 `MAX_IMAGE_CHARS`、`NOTE_MAX`、降品質參數；`js/state/v4.js` 的 `ENTRY_LIMITS`（契約把這些定義成介面上限，不是遊戲數值）。
4. 重拍時沿用上一張選的份量（例如先選「多一點」再重拍，新的估算一開始就是 ×1.25；按鈕狀態有正確顯示）。
5. 當天已滿 20 筆時仍可先拍照估算（用掉一次額度），按儲存才看到「今天已經記了 20 筆」。
6. 伺服器若回超過 12 個品項，畫面只列前 12 個，但合計包含全部（Worker 目前最多回 8 項，實際不會發生）。
7. 估算結果出來後面板捲到結果區，標題與關閉鈕會捲出畫面（Esc、點背景、往上捲都可關）。
8. 匯入預覽的差異摘要沒有營養的列（fixtures README 已載明）。

## Cross iPhone 真機清單

- [ ] 主畫面 App 裡點相機鈕：可以選「拍照」也可以選「照片圖庫」；拍一張真的餐點，約 10–15 秒內出現品項與合計。
- [ ] 直式拍的照片估出來的品項合理（照片方向正確）；HEIC 照片也能估。
- [ ] 飛航模式下點拍照：顯示「現在連不上，先手動記。」並可手動儲存；打勾、體重照常。
- [ ] 估算結果出現時鍵盤沒有自己彈出來蓋住結果；面板可以捲到「儲存」。
- [ ] 存完後到 iPhone「設定 › Safari › 進階 › 網站資料」看 daily-ten-app 的用量沒有因為拍照明顯變大。

## 驗收員改動的檔案

- `tests/e2e/nutrition.spec.js`（改）：3 個測試裡 5 個整個物件的 `toEqual` 補上 `entries: {}`，其餘不動。
- `tests/e2e/nutrition-entries.spec.js`（新增，38 個測試）。
- `reports/qa-photo-kcal.md`（本檔）。
