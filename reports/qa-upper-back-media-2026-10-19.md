# 肩與上背 16 格影格 QA

日期：2026-10-19。分支：`codex/upper-back-motion-guides`。結論：**PASS（四張素材、精確對應、訓練求助及離線回歸範圍）**。完整 PR CI 由 Orchestrator 確認。

## 原圖目視

已用 `view_image` 獨立檢視四張完整 4×4 PNG。開肩帶子從胸前拉至兩側；側平舉以腳踩住帶子並抬臂到肩高；俯臥 Y 與 T 的手臂角度不同。四張的 16 格皆有畫面，未見空白格、明顯錯誤器材或把其他動作誤當成目標動作。Y／T 的抬臂幅度較細，這項檢查只確認素材完整與明顯錯配，不代表專業動作審核。

## 測試證據

Chrome 行動視窗、Node v24.15.0、`PORT=4199`、2 workers：

```sh
npx playwright test tests/e2e/upper-back-media.spec.js tests/e2e/anchor-free-media.spec.js tests/e2e/training-demo.spec.js tests/e2e/lower-core-media.spec.js tests/e2e/offline.spec.js --workers=2 --reporter=dot
```

**36 passed (17.5s)**，含本輪新增 **6 passed**：

- 四張本機圖在動作庫可解碼，影格 UI 維持來源比例，0–15 格逐格定位正確。
- 精確 catalog 對應：開肩一般、第 1/2 組和加練共用正確圖；側平舉、Y、T 各用自己的圖。普通 T 與慢速 T 共用 PNG，慢速 entry 明示 `sameMotionAs`，其影格時程分別約 3 秒與 4 秒；不把肩上推、肩外旋、半程雪天使、額外組號等近似名稱混貼。
- 週一有帶主課表的側平舉、Y、普通 T，以及週三有帶課表的開肩工作組／加練，開求助再返回均停在同一步，組別與已做次數不變；週三無帶慢速 T 保留每下 4 秒的節奏。
- SW 預快取四張圖，離線重開仍可解碼及在動作庫打開。新舊離線測試均依 SW cache 名稱格式檢查，避免下次升版產生無關失敗。

`npm run check:media-coverage`：**通過，73 個精確名稱中 45 個有連續影格、28 個無示範**。`npm run check:repo`：**通過，SW v25、73 項預快取**。`git diff --check` 通過。

首次合併回歸為 35/36：舊 `lower-core-media.spec.js` 將 SW v24 寫死，升 v25 後失敗。依授權將它改為版本格式檢查，保留離線與三張圖預快取驗證；後續 36/36 通過。既有 `anchor-free-media.spec.js` 把已獲素材的「彈力帶側平舉」從未知清單改成仍應為未知的「彈力帶側平舉 第1組」，維持精確名稱負向檢查。QA 未修改產品碼。
