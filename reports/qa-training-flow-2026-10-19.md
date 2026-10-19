# 訓練換側與流程提示 QA

日期：2026-10-19。分支：`codex/training-side-cues`。結論：**PASS（本輪三項流程修正與相關既有訓練回歸範圍）**。完整 PR CI 由主代理確認。

Chrome 行動視窗、Node v24.15.0、`PORT=4198`、2 workers：

```sh
npx playwright test tests/e2e/training-flow-cues.spec.js tests/e2e/program.spec.js tests/e2e/training-demo.spec.js tests/e2e/training.spec.js tests/e2e/boss-recovery.spec.js --workers=2 --reporter=dot
```

**42 passed (21.2s)**，其中本輪新增的 **6 tests passed**：

- 週一鴿式、週二嬰兒式側伸展、週三躺姿脊椎扭轉在 L2 的 30 秒計時，剩 16 秒仍提示第一側，剩 15 秒切換第二側並且只播一次「換另一側」。普通平板計時不顯示或播報換側提示。
- 換側前打開動作說明、等待、關閉、重載，都保持原秒數與第一側且停在暫停；繼續跨過中點後再暫停、重載及開說明，第二側仍保留，換側語音不會重播。
- 週六恢復序列只有兩個 15 秒「換組」，前後沒有額外「準備」；課表估時與完整執行序列的秒數相符。
- 「下一個」跨過 8 秒準備與 60 秒組間休息顯示真正下一動作和間隔；週五最後一個動作明確說明尾端 60 秒休息，進入該休息後提示完成訓練。

`node --check tests/e2e/training-flow-cues.spec.js` 及 `git diff --check` 通過。QA 只新增測試與本報告，未修改產品程式；本次未重跑完整 CI。
