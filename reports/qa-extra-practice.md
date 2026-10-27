# 加練入口 QA — PASS

2026-10-27。Chrome/Playwright，本機靜態伺服器，Node 24.15.0，2 workers。目標分支 `codex/extra-practice-entry`。

## 驗證結果

| 範圍 | 結果 | 證據 |
|---|---:|---|
| 新增的加練端對端測試 | 8/8 PASS | `tests/e2e/extra-practice.spec.js` |
| 原有 Boss 中斷恢復測試 | 11/11 PASS | `tests/e2e/boss-recovery.spec.js` |

直接從訓練頁進入 HRP、Plank、2 英里跑均不經過當日課表或暖身。HRP 維持 120 秒倒數；Plank 正向計時；跑步由使用者輸入外部計時的分秒。計時說明暫停、重載後暫停恢復、成績草稿、取消清除、儲存失敗後重載再試、儲存連按、離線重開均已通過實際畫面操作。

明確儲存只新增一筆對應 PR；測試比對前後的 `sessions`、legacy XP、遊戲 XP、連續天數、Freeze、Perfect Day 與週日 Boss 項目。當日課表未完成時仍顯示未完成；已完成時仍維持已完成。一般訓練或既有 Boss 草稿進行中，直接呼叫入口也不會覆蓋檢查點。一般次數訓練中止後開始加練，舊的組數與回報控制沒有殘留。

測試指令：

```sh
PORT=4291 PW_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_HTML_OUTPUT_DIR=/private/tmp/daily-ten-qa-html npx playwright test tests/e2e/extra-practice.spec.js tests/e2e/boss-recovery.spec.js --workers=2 --reporter=list --output=/private/tmp/daily-ten-qa-results
```

第一次執行新增測試時，人工組裝的「今天已完成」fixture 只新增 session，未同步既有連續天數欄位；修正 fixture 後 19 項全數通過。這是測試資料不一致，非產品缺陷。最後新增週日 Boss 項目斷言後再跑 8 項新增測試，全數通過。
