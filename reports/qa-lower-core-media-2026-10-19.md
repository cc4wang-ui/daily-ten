# 下肢與核心 16 格影格 QA

日期：2026-10-19。分支：`codex/lower-core-motion-guides`（PR #21）。結論：**PASS（本輪三張素材、訓練求助與離線回歸範圍）**。完整 PR CI 由 Orchestrator 在提交後確認。

## 視覺檢查

已直接檢視三張原始 4×4 PNG，而非只依賴 decode。左右分腿蹲各 16 格都有畫面，整段各維持同一隻前腳，沒有看到換腳或第 16 格空白；左右素材互為不同前腳。平板支撐 16 格皆有畫面，從前臂、膝蓋支撐進入，保持前臂平板，最後退出，沒有明顯誤用側平板或手掌支撐。這是素材完整性與明顯錯配檢查，不是專業動作審核。

## 自動驗證

Chrome 行動視窗、Node v24.15.0、`PORT=4199`、2 workers：

```sh
npx playwright test tests/e2e/lower-core-media.spec.js tests/e2e/anchor-free-media.spec.js tests/e2e/training-demo.spec.js tests/e2e/offline.spec.js --workers=2 --reporter=dot
```

**30 passed (12.5s)**，其中本輪新增 5 項：

- 動作庫左右分腿蹲、平板各對應正確本機 PNG 與說明；三張圖成功 decode、來源與 UI 每格皆維持 1:1，逐格 scrub 0–15 皆可定位；每格畫素對比檢查避免空白格。
- 精確名稱匹配：左右各對應無組號及第 1/2 組，平板對應一般與 Boss 測驗名稱；第 3 組、徒手弓步、側平板、高平板及其他近似名稱均不誤套。
- 週二真實主課表進到左右分腿蹲第 1 組，各開求助、等 12 秒再返回：仍在原步驟，組別、已完成次數與原始 sequence 保留；求助期間不計次數。
- L2 保底版 30 秒平板在剩 27 秒時開求助，影格靜態保持說明與訓練計時器分離；求助與返回暫停期間倒數不動，未新增完成 session／XP，手動繼續後才到 24 秒。
- `sw.js` 為 v24 且預快取三張圖；離線重開後三張仍可 decode、在動作庫打開。

`git diff --check` 通過。QA 只新增 `tests/e2e/lower-core-media.spec.js` 與本報告，未改產品碼或既有測試預期。

首輪新測試曾錯誤要求來源圖片寬度可被 4 整除；1254×1254 的正方形圖仍可呈現四格。已將 QA 畫素取樣縮放到 4 的倍數，未要求修改產品素材；修正後新套件 5/5、合併回歸 30/30 通過。
