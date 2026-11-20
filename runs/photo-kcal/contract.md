# 契約：營養支援「記實際吃的」＋照片估熱量（D30）

Cross 2026-11-20：「Daily ten營養部份要支援照片算熱量。我不一定照建議吃。」選 A：為照片估熱量開原則例外（只此一項可連線、照片不保存、離線時退回手動）。

## 成功指標（STOP）
1. 每一餐可用三種方式記：照建議吃了（1 次點擊，照舊）、拍照估算、手動輸入。另可加一筆不屬於 5 餐的「其他」。
2. 熱量環、今日入口卡顯示「實際攝取」＝打勾的建議餐＋所有實際紀錄；並顯示還差多少 kcal、蛋白質還差幾 g。
3. 拍照：App 內縮圖（長邊 ≤1024、JPEG）→ POST `/api/meal` → 顯示品項與合計 → 少一點／剛好／多一點 → 儲存。照片不存任何地方（state、localStorage、快取都沒有）。
4. 離線、逾時、伺服器錯誤、不是食物：不白屏、不丟例外，顯示中性訊息並直接給手動輸入。其他功能離線照舊。
5. 舊資料（沒有 entries）打開不壞、不寫入；備份／匯入原樣往返；XP、連續天數、成就不受影響。
6. 文案：估算值都標「估算」；不出現醫療診斷、羞辱或懲罰語氣；通過用語表。
7. 真實環境：正式站 `/api/meal` 用真照片回 200 與合理數字（2026-11-20 已實測：雞肉沙拉碗 405 kcal、約 10 秒）。

## 介面（三層共用；不得各自改名）

### State（data-guardian，`js/state/v4.js`）
`v4.nutrition.entries = { 'YYYY-MM-DD'（遊戲日）: [Entry] }`，每天最多 20 筆。
`Entry = { id: string, at: isoLocal, slot: 餐 id 或 null, name: string(1–40), kcal: 整數 1–5000, proteinG: 整數 0–500 或 null, fatG: 整數 0–500 或 null, carbG: 整數 0–1000 或 null, source: 'photo' | 'manual' }`
- `parseNutrition(raw)` 回 `{ meals, weights, entries }`；壞資料過濾、不丟例外。
- `addEntry(v4, { date, slot, name, kcal, proteinG, fatG, carbG, source, now })` → 回傳 id。slot 有值時，同時把該餐在 `meals[date]` 的打勾拿掉（避免重複計算）。
- `removeEntry(v4, date, id)` → 回傳是否刪到。
- `toggleMeal` 行為不變。`fillMissing` 補 `entries: {}`（只改記憶體）。容器版本不升。

### 規則（game-designer，`data/nutrition.json`、`js/game/nutrition.js`）
- `data/nutrition.json` 新增 `photo: { endpoint: "/api/meal", maxEdgePx: 1024, jpegQuality: 0.8, timeoutMs: 60000, portions: [{ id:"less", label:"少一點", factor:0.75 }, { id:"same", label:"剛好", factor:1 }, { id:"more", label:"多一點", factor:1.25 }] }` 與相關 copy。`version` 升 2。
- `mealDay(nutrition, date, cfg)` 回傳（舊欄位保留）：
  `{ date, targetKcal, kcal, count, meals: [{ ...餐設定, done, entries: [Entry], kcalActual, logged }], extras: [Entry], macros: { proteinG, fatG, carbG }, macrosPartial, left: { kcal, proteinG } }`
  - 一餐有 entries → 用 entries 合計，忽略打勾；沒有 entries 且打勾 → 用建議 kcal。`logged` ＝ 有 entries 或打勾。`count` ＝ logged 的餐數。
  - 打勾的建議餐，三大營養素＝每日目標 ×（該餐 kcal ÷ 5 餐 kcal 合計），四捨五入（估算）。entries 的 null 當 0，並把 `macrosPartial` 設 true。
  - `left` 不小於 0。
- `scaleEstimate(est, factor)`：把伺服器回傳 `{ items, kcal, proteinG, fatG, carbG }` 依份量倍率換算成整數（純函式）。

### 伺服器（已上線）
`POST /api/meal`，body `{ image: "data:image/jpeg;base64,…"（≤1.4M 字元）, note?: string(≤80) }`
200 → `{ isFood: boolean, items: [{ name, grams, kcal, proteinG, fatG, carbG }], kcal, proteinG, fatG, carbG, confidence: "low"|"mid"|"high" }`
其他 → `{ error }`：400 image、403 origin、405 method、429 cap（今天額度用完）、502 failed／parse。

## 預算與失敗
- 審查最多 2 輪；第 3 次仍 FAIL → 停下問 Cross。
- 伺服器免費額度（Cloudflare Workers AI，每天約 200 張）用完 → 429 → App 顯示「今天的估算次數用完了」並給手動輸入。不產生費用。
