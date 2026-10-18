# 訓練進階啟動相依修正 QA

日期：2026-10-19。分支：`codex/per-movement-rep-targets`（PR #20）。結論：**PASS（本輪修正與指定回歸範圍）**。完整 CI 尚待 Orchestrator 在提交後確認。

## 回歸風險與檢查

`js/game/training-progression.js` 原本靜態匯入 `js/game/day.js`。當選用的遊戲模組 `day.js` 回 404，這條相依鏈會讓訓練進階模組一併載入失敗，破壞既有「遊戲層失敗時訓練仍可用」的啟動備援。修正將所需的純日期驗證與 UTC 日序計算留在 progression 模組內。

- **Chrome e2e：20 passed (7.1s)**。執行 `PORT=4198 npx playwright test tests/e2e/load-failure.spec.js tests/e2e/training-progression.spec.js --workers=2 --reporter=dot`，Node 使用 v24.15.0，`PW_CHROMIUM_PATH` 指向本機 Google Chrome。原有 `day.js` 回 404 案例通過：無啟動失敗卡、遊戲卡隱藏、下一步回到今日課表，保底版記錄與訓練頁可用。原有進階整合案例亦通過，包含個別動作目標、D6 降量、重載及 checkpoint。
- **Node progression：27 passed**。執行 `npm run test:progression`。本輪保留既有未提交日期測試，加入 year `0000` 的有效閏日、year `0099` 的正常二月、`0099`／`0100` 非閏日、無效 `0000-02-30`，並確認呼叫後 state 和 rules 未變。原測試同時覆蓋 malformed ISO date、2024 閏日、28 天邊界、規則和進階行為。
- 未修改既有 e2e 預期或產品碼。QA 僅延續 `tests/training-progression.test.mjs` 並撰寫本報告。

## 結論範圍

指定的啟動失敗情境及訓練進階回歸均通過。這份 PASS 不代表完整 PR CI 或正式站部署已完成；Orchestrator 提交後仍須確認 CI。
